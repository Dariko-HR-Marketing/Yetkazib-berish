"""Yetkazish: jo'natma, dispetcherlik, kuryer amallari, PIN bilan topshirish (FR-DSP, FR-CR, FR-POD)."""
import hashlib
import hmac
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.accounts.models import Role, User, UserRole
from apps.orders.models import Order, OrderStatus as S
from apps.platform.errors import ApiError
from apps.platform.services import audit, emit

from .models import Shipment, ShipmentStatus as SS

VEHICLE_RANK = {"foot": 0, "bike": 1, "car": 2, "van": 3}
ACTIVE = (SS.ASSIGNED, SS.PICKED_UP, SS.ON_THE_WAY)


def mask_phone(p):
    return p[:6] + "****" + p[-2:] if p and len(p) > 8 else "****"


def pin_for(shipment):
    d = hmac.new(settings.SECRET_KEY.encode(), f"pin:{shipment.id}:{shipment.pin_nonce}".encode(), hashlib.sha256).digest()
    return f"{int.from_bytes(d[:4], 'big') % 10000:04d}"


def required_vehicle(order):
    kg, fragile = 0.0, False
    for it in order.items.exclude(status="removed").select_related("variant__product"):
        kg += (it.variant.weight_g or 0) / 1000 * float(it.actual_qty or it.requested_qty)
        kg += float(it.actual_qty or it.requested_qty) if it.is_weighted else 0
        fragile |= it.variant.product.is_fragile
    if kg > 60:
        return "van"
    if kg > 12 or fragile and kg > 6:
        return "car"
    return "bike"


def create_shipment(order):
    sh = Shipment(tenant=order.tenant, branch=order.branch, order=order, vehicle_type=required_vehicle(order),
                  pin_nonce=secrets.token_hex(6))
    sh.pin_code_hash = hashlib.sha256(pin_for(sh).encode()).hexdigest()
    sh.save()
    emit("shipment.created", "shipment", sh.id, {"order_id": str(order.id), "number": order.number}, tenant_id=order.tenant_id)
    return sh


def _get(shipment_id, lock=True):
    qs = Shipment.objects.select_related("order__customer", "order__branch", "courier")
    return (qs.select_for_update(of=("self",)) if lock else qs).get(pk=shipment_id)


@transaction.atomic
def assign(shipment_id, courier, actor, vehicle_type=None):
    sh = _get(shipment_id)
    if sh.status not in (SS.CREATED, SS.ASSIGNED):
        raise ApiError(409, "invalid_transition")
    if not UserRole.objects.filter(user=courier, role=Role.COURIER, tenant=sh.tenant).filter(
            branch__isnull=True).exists() and not UserRole.objects.filter(user=courier, role=Role.COURIER, branch=sh.branch).exists():
        raise ApiError(422, "validation_error", "Kuryer bu hamkorga biriktirilmagan", field="courier_id")
    vt = vehicle_type or sh.vehicle_type
    if VEHICLE_RANK.get(vt, 0) < VEHICLE_RANK[sh.vehicle_type]:
        raise ApiError(409, "vehicle_too_small", f"Kamida '{sh.vehicle_type}' transport kerak")
    sh.courier, sh.status, sh.attention = courier, SS.ASSIGNED, ""
    sh.save()
    audit("shipment", sh.id, "assign", tenant_id=sh.tenant_id, actor=actor, new={"courier": str(courier.id), "vehicle": vt})
    emit("shipment.assigned", "shipment", sh.id, {"order_id": str(sh.order_id), "courier_phone": courier.phone,
                                                  "number": sh.order.number}, tenant_id=sh.tenant_id)
    return sh


def courier_action(shipment_id, courier, action, data):
    """PIN xatosida hisoblagich tranzaksiyadan tashqarida saqlanadi (rollback uni yo'qotmasligi uchun)."""
    try:
        with transaction.atomic():
            return _courier_action(shipment_id, courier, action, data)
    except ApiError as e:
        if e.code == "pin_invalid":
            Shipment.objects.filter(pk=shipment_id).update(pin_attempts=F("pin_attempts") + 1)
            left = max(settings.PIN_MAX_ATTEMPTS - Shipment.objects.get(pk=shipment_id).pin_attempts, 0)
            audit("shipment", shipment_id, "pin_failed", actor=courier)
            e.extra["attempts_left"] = left
        raise


def _courier_action(shipment_id, courier, action, data):
    sh = _get(shipment_id)
    if sh.courier_id != courier.id:
        raise ApiError(404, "not_found")                  # AC-05: boshqa kuryer topshirig'i ko'rinmaydi
    order = Order.objects.select_for_update().get(pk=sh.order_id)
    now = timezone.now()

    if action == "reject":
        if sh.status != SS.ASSIGNED:
            raise ApiError(409, "invalid_transition")
        sh.rejected_by = [*sh.rejected_by, str(courier.id)]
        sh.courier, sh.status, sh.attention = None, SS.CREATED, "rejected"
        emit("shipment.rejected", "shipment", sh.id, {"order_id": str(order.id), "number": order.number,
                                                      "courier_id": str(courier.id), "branch_id": str(sh.branch_id)}, tenant_id=sh.tenant_id)
    elif action == "pickup":
        if sh.status != SS.ASSIGNED or order.status not in (S.READY, S.IN_DELIVERY):
            raise ApiError(409, "invalid_transition")
        sh.status, sh.eta = SS.PICKED_UP, now + timedelta(minutes=30)
        if order.status == S.READY:
            from apps.orders.services import transition, _event
            order = transition(order, S.IN_DELIVERY, courier, "picked_up", _lock=False)
            order.tracking_expires_at = now + timedelta(hours=settings.TRACKING_TOKEN_TTL_HOURS)
            order.save(update_fields=["tracking_expires_at"])
            _event(order, "order.in_delivery", pin=pin_for(sh))
    elif action == "on_the_way":
        if sh.status != SS.PICKED_UP:
            raise ApiError(409, "invalid_transition")
        sh.status = SS.ON_THE_WAY
    elif action == "contact":
        if sh.status not in (SS.PICKED_UP, SS.ON_THE_WAY):
            raise ApiError(409, "invalid_transition")
        sh.contact_attempts += 1
        sh.first_contact_at = sh.first_contact_at or now
    elif action == "deliver":
        _deliver(sh, order, courier, data, now)
    elif action == "fail":
        reason = (data.get("reason") or "").strip()
        if sh.status not in (SS.PICKED_UP, SS.ON_THE_WAY):
            raise ApiError(409, "invalid_transition")
        if not reason:
            raise ApiError(400, "reason_required")
        if reason == "no_recipient":
            waited = sh.first_contact_at and now - sh.first_contact_at >= timedelta(minutes=settings.NO_RECIPIENT_WAIT_MIN)
            if sh.contact_attempts < 2 or not waited:
                raise ApiError(409, "contact_attempts_required", attempts=sh.contact_attempts)
        sh.status, sh.failure_reason, sh.attention = SS.FAILED, reason, "failed"
        emit("shipment.failed", "shipment", sh.id, {"order_id": str(order.id), "number": order.number, "reason": reason,
                                                    "branch_id": str(sh.branch_id)}, tenant_id=sh.tenant_id)
    else:
        raise ApiError(400, "validation_error", "action noto'g'ri", field="action")
    sh.save()
    audit("shipment", sh.id, f"courier:{action}", tenant_id=sh.tenant_id, actor=courier, new={"status": sh.status})
    return sh


def _deliver(sh, order, courier, data, now):
    from apps.orders.services import transition
    from apps.payments.services import record_delivery_payment
    if sh.status not in (SS.PICKED_UP, SS.ON_THE_WAY) or order.status != S.IN_DELIVERY:
        raise ApiError(409, "invalid_transition")
    pod = data.get("pod_type", "pin")
    if pod == "pin":
        if sh.pin_attempts >= settings.PIN_MAX_ATTEMPTS:
            raise ApiError(423, "pin_locked")
        if not hmac.compare_digest(pin_for(sh), str(data.get("pin", ""))):
            raise ApiError(400, "pin_invalid")
    elif pod == "photo":
        if not (sh.tenant.settings or {}).get("allow_photo_pod") or not data.get("pod_url"):
            raise ApiError(422, "validation_error", "Surat bilan topshirish ruxsat etilmagan yoki pod_url yo'q")
        sh.pod_url = str(data["pod_url"])[:300]
    else:
        raise ApiError(400, "validation_error", "pod_type: pin | photo", field="pod_type")
    sh.pod_type, sh.status, sh.attention = pod, SS.DELIVERED, ""
    record_delivery_payment(order)
    transition(order, S.COMPLETED, courier, "delivered", _lock=False)


@transaction.atomic
def resolve_failed(shipment_id, actor, action):
    """Muvaffaqiyatsiz topshirish: qayta yetkazish yoki qaytarish (5.3, mas'ul xodim)."""
    from apps.orders.services import transition
    sh = _get(shipment_id)
    if sh.status != SS.FAILED:
        raise ApiError(409, "invalid_transition")
    order = Order.objects.select_for_update().get(pk=sh.order_id)
    if action == "redeliver":
        sh.attention = ""
        sh.save()
        new = Shipment(tenant=sh.tenant, branch=sh.branch, order=order, vehicle_type=sh.vehicle_type, pin_nonce=secrets.token_hex(6))
        new.pin_code_hash = hashlib.sha256(pin_for(new).encode()).hexdigest()
        new.save()
        audit("shipment", sh.id, "redeliver", tenant_id=sh.tenant_id, actor=actor, new={"new_shipment": str(new.id)})
        return new
    if action == "return":
        sh.status, sh.attention = SS.RETURNED, ""
        sh.save()
        transition(order, S.CANCELLED, actor, f"return:{sh.failure_reason}", _lock=False)
        audit("shipment", sh.id, "return", tenant_id=sh.tenant_id, actor=actor)
        return sh
    raise ApiError(400, "validation_error", "action: redeliver | return", field="action")


@transaction.atomic
def reset_pin_lock(shipment_id, actor):
    sh = _get(shipment_id)
    sh.pin_attempts = 0
    sh.save(update_fields=["pin_attempts"])
    audit("shipment", sh.id, "pin_unlock", tenant_id=sh.tenant_id, actor=actor)
    return sh


def shipment_dict(sh, for_courier=False):
    o = sh.order
    phone_visible = sh.status in ACTIVE or sh.status == SS.CREATED
    d = {"id": str(sh.id), "order_id": str(o.id), "order_number": o.number, "status": sh.status,
         "vehicle_type": sh.vehicle_type, "courier_id": str(sh.courier_id) if sh.courier_id else None,
         "attention": sh.attention, "failure_reason": sh.failure_reason, "contact_attempts": sh.contact_attempts,
         "eta": sh.eta, "address": o.address, "branch": {"id": str(o.branch_id), "name": o.branch.name, "address": o.branch.address,
                                                         "lat": o.branch.lat, "lng": o.branch.lng, "phone": o.branch.phone},
         "customer_name": o.customer_name, "customer_phone": o.customer_phone if phone_visible and sh.status != SS.CREATED else mask_phone(o.customer_phone),
         "amount_to_collect": (o.payable_total if o.payment_method != "online" else o.balance_due),
         "payment_method": o.payment_method, "created_at": sh.created_at,
         "navigation_url": f"https://yandex.com/maps/?rtext=~{o.address.get('lat')},{o.address.get('lng')}&rtt=auto"}
    if for_courier and sh.status not in ACTIVE:
        d["customer_phone"] = mask_phone(o.customer_phone)
    return d
