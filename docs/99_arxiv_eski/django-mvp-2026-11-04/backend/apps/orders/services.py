"""Buyurtma yadrosi (OMS): yaratish, holat mashinasi, yig'ish, almashtirish, rozilik, bekor qilish."""
import logging
import math
import secrets
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.catalog.models import BranchStock
from apps.platform.errors import ApiError
from apps.platform.services import audit, emit
from apps.tenants import geo
from apps.tenants.models import Profile, TimeSlot

from . import stock
from .models import Order, OrderItem, OrderStatus as S, OrderStatusHistory, OrderVersion
from .pricing import build_quote

log = logging.getLogger(__name__)

ALLOWED = {
    S.CREATED: {S.PENDING_CONFIRMATION, S.ACCEPTED, S.CANCELLED},
    S.PENDING_CONFIRMATION: {S.ACCEPTED, S.CANCELLED},
    S.ACCEPTED: {S.PREPARING, S.CANCELLED},
    S.PREPARING: {S.READY, S.CANCELLED},
    S.READY: {S.IN_DELIVERY, S.CANCELLED},
    S.IN_DELIVERY: {S.COMPLETED, S.CANCELLED},
    S.COMPLETED: set(),
    S.CANCELLED: set(),
}
CUSTOMER_CANCELLABLE = {S.CREATED, S.PENDING_CONFIRMATION, S.ACCEPTED}   # preparing'gacha (5.2)
PARTNER_TARGETS = {S.ACCEPTED, S.PREPARING, S.READY, S.CANCELLED}        # in_delivery/completed — yetkazish moduli
OPEN_STATES = (S.CREATED, S.PENDING_CONFIRMATION, S.ACCEPTED, S.PREPARING, S.READY, S.IN_DELIVERY)


# ------------------------------------------------------------------ yordamchi
def _new_number():
    for _ in range(10):
        n = f"{timezone.localdate():%y%m%d}-{secrets.token_hex(2).upper()}"
        if not Order.objects.filter(number=n).exists():
            return n
    raise RuntimeError("buyurtma raqami yaratilmadi")


def order_url(order):
    return f"{settings.STOREFRONT_BASE_URL}/?track={order.tracking_token}"


def _event(order, etype, **extra):
    payload = {"order_id": str(order.id), "number": order.number, "phone": order.customer_phone,
               "url": order_url(order), "lang": (order.customer.locale if order.customer_id else "uz"),
               "tenant": str(order.tenant_id), "branch_id": str(order.branch_id), **extra}
    emit(etype, "order", order.id, payload, tenant_id=order.tenant_id)


def _history(order, from_s, to_s, actor, reason=""):
    OrderStatusHistory.objects.create(order=order, from_status=from_s, to_status=to_s,
                                      actor_id=getattr(actor, "id", None), reason=reason or "")


def _snapshot(order):
    return {"status": order.status, "total": order.total, "final_total": order.final_total,
            "items": [{"id": str(i.id), "name": i.name_snapshot, "status": i.status, "qty": str(i.requested_qty),
                       "actual": None if i.actual_qty is None else str(i.actual_qty), "line": i.line_total()}
                      for i in order.items.all()]}


def _version(order, reason, approved=None):
    order.version += 1
    OrderVersion.objects.create(order=order, version=order.version, snapshot=_snapshot(order),
                                reason=reason, customer_approved=approved)


def held(item):
    """Rezerv qaysi variantda va qancha ushlab turilgani."""
    if item.status == "removed":
        return None, Decimal(0)
    vid = item.substituted_by_id if item.status == "substituted" else item.variant_id
    return vid, item.requested_qty


def kitchen_eta(order_branch, tenant, now):
    """Restoran: oshxona bandligiga qarab tayyorlik vaqti (FR-P03)."""
    cfg = tenant.settings or {}
    prep, par = int(cfg.get("prep_minutes", 15)), max(int(cfg.get("kitchen_parallel", 5)), 1)
    active = Order.objects.filter(branch=order_branch, status__in=(S.ACCEPTED, S.PREPARING)).count()
    return now + timedelta(minutes=prep * (1 + active // par))


# ------------------------------------------------------------------ yaratish
@transaction.atomic
def create_order(tenant, data, user=None):
    now = timezone.now()
    addr = data.get("address") or {}
    try:
        lat, lng = float(addr["lat"]), float(addr["lng"])
    except (KeyError, TypeError, ValueError):
        raise ApiError(400, "validation_error", "address.lat/lng majburiy", field="address")
    phone = data.get("customer_phone") or (user.phone if user else None)
    if not phone:
        raise ApiError(400, "validation_error", "customer_phone majburiy", field="customer_phone")
    from apps.accounts.services import normalize_phone
    phone = normalize_phone(phone)

    branches = geo.resolve(tenant, lat, lng)
    if data.get("branch_id"):
        branches = [(b, z) for b, z in branches if str(b.id) == str(data["branch_id"])]
    if not branches:
        raise ApiError(422, "out_of_zone")
    branch, zone = branches[0]

    pm = data.get("payment_method", "cash_on_delivery")
    if pm not in ("online", "cash_on_delivery", "card_on_delivery"):
        raise ApiError(400, "validation_error", "payment_method noto'g'ri", field="payment_method")
    rule = data.get("substitution_rule", "suggest_similar")
    if rule not in ("suggest_similar", "remove", "call_me"):
        raise ApiError(400, "validation_error", "substitution_rule noto'g'ri", field="substitution_rule")

    slot = None
    if data.get("slot_id"):
        slot = TimeSlot.objects.filter(id=data["slot_id"], branch=branch, starts_at__gt=now).first()
        if slot is None:
            raise ApiError(422, "validation_error", "Slot topilmadi yoki o'tib ketgan", field="slot_id")
    elif not geo.is_open(branch):
        raise ApiError(422, "branch_closed")

    q = build_quote(tenant, branch, zone, data.get("items") or [])
    for p in q["problems"]:
        if p["code"] == "out_of_stock":
            raise ApiError(409, "out_of_stock", **{k: v for k, v in p.items() if k != "code"})
        if p["code"] == "min_order":
            raise ApiError(422, "min_order", min_order=p["min_order"], shortfall=p["shortfall"])
        raise ApiError(422, "validation_error", "Mahsulot mavjud emas", variant_id=p.get("variant_id"))
    for ln in q["lines"]:
        if ln["requires_serial"] and False:  # seriya raqami yig'ishda kiritiladi
            pass

    # --- atomar rezerv (qat'iy tartibda — deadlock bo'lmasligi uchun) ---
    for ln in sorted(q["lines"], key=lambda l: l["variant_id"]):
        if not stock.reserve(branch.id, ln["variant_id"], ln["qty"]):
            raise ApiError(409, "out_of_stock", variant_id=ln["variant_id"])
    if slot and not stock.book_slot(slot.id):
        raise ApiError(409, "slot_full")

    # --- tasdiq turi ---
    manual, manual_reason = branch.manual_confirm, ("manual_branch" if branch.manual_confirm else "")
    stale = BranchStock.objects.filter(
        branch=branch, variant_id__in=[l["variant_id"] for l in q["lines"]], source="pos",
        synced_at__lt=now - timedelta(seconds=settings.POS_STALE_SEC)).exists()
    if stale:
        manual, manual_reason = True, "stale_pos"          # POS eskirgan — avtomatik tasdiq to'xtatiladi

    order = Order.objects.create(
        number=_new_number(), tenant=tenant, branch=branch, customer=user, customer_phone=phone,
        customer_name=str(data.get("customer_name", ""))[:120] or (user.full_name if user else ""),
        address={k: addr.get(k, "") for k in ("text", "landmark", "entrance", "floor", "apartment")} | {"lat": lat, "lng": lng},
        slot=slot, channel=data.get("channel", "web") if data.get("channel") in ("web", "telegram", "qr", "instagram") else "web",
        utm=data.get("utm"), payment_method=pm, substitution_rule=rule,
        consent_increase_pct=Decimal(str(data.get("consent_increase_pct", settings.CONSENT_INCREASE_PCT_DEFAULT))),
        subtotal=q["subtotal"], delivery_fee=q["delivery_fee"], discount=0, total=q["total"],
        tracking_token=secrets.token_urlsafe(24),
        tracking_expires_at=now + timedelta(hours=settings.TRACKING_TOKEN_TTL_HOURS),
        comment=str(data.get("comment", ""))[:300], manual_reason=manual_reason,
    )
    OrderItem.objects.bulk_create([OrderItem(
        tenant=tenant, order=order, variant_id=l["variant_id"], name_snapshot=l["name"], unit_price=l["unit_price"],
        cost_snapshot=l["cost"], requested_qty=Decimal(l["qty"]), modifiers=l["modifiers"],
        modifiers_price=l["modifiers_price"], is_weighted=l["is_weighted"],
        substitution_rule=(data.get("item_rules") or {}).get(l["variant_id"])) for l in q["lines"]])
    if tenant.profile == Profile.RESTAURANT:
        order.estimated_ready_at = kitchen_eta(branch, tenant, now)
    _history(order, None, S.CREATED, user, "created")
    audit("order", order.id, "create", tenant_id=tenant.id, actor=user, new={"total": order.total, "branch": str(branch.id)})

    if pm == "online":                                   # to'lov kutiladi; rezerv muddatli
        order.reserve_expires_at = now + timedelta(minutes=settings.RESERVE_TTL_MINUTES)
        order.save()
    else:
        _after_payment_gate(order, manual, user)
    _event(order, "order.created", total=order.total, manual=manual, branch=branch.name)
    return order


def _after_payment_gate(order, manual=None, actor=None):
    """To'lov (yoki topshirishda to'lov tanlovi) tayyor — tasdiqqa yo'naltirish."""
    if manual is None:
        manual = bool(order.manual_reason)
    if manual:
        order.confirm_deadline = timezone.now() + timedelta(seconds=order.branch.confirm_sla_sec)
        order.save()
        transition(order, S.PENDING_CONFIRMATION, actor, order.manual_reason or "manual", _lock=False)
    else:
        transition(order, S.ACCEPTED, actor, "auto", _lock=False)


@transaction.atomic
def on_payment_confirmed(order_id):
    order = Order.objects.select_for_update().get(id=order_id)
    if order.status == S.CREATED:
        order.reserve_expires_at = None
        order.save()
        _after_payment_gate(order)
    return order


# ------------------------------------------------------------------ holat mashinasi
@transaction.atomic
def transition(order, to, actor=None, reason="", expected_version=None, _lock=True):
    if _lock:
        order = Order.objects.select_for_update().get(pk=order.pk)
    if expected_version is not None and order.version != expected_version:
        raise ApiError(409, "version_conflict", current_version=order.version)
    to = S(to)
    if to not in ALLOWED[S(order.status)]:
        raise ApiError(409, "invalid_transition", frm=order.status, to=to.value)
    frm = order.status
    if to == S.CANCELLED and not (reason or "").strip():
        raise ApiError(400, "reason_required")

    if to == S.READY:
        _finalize_for_ready(order)
    order.status = to.value
    order.version += 1
    if to == S.ACCEPTED:
        order.confirm_deadline = None
        order.reserve_expires_at = None
    if to == S.PREPARING and order.tenant.profile == Profile.RESTAURANT:
        order.estimated_ready_at = order.estimated_ready_at or kitchen_eta(order.branch, order.tenant, timezone.now())
    if to == S.CANCELLED:
        order.cancel_reason = reason
        _release_everything(order)
    order.save()
    _history(order, frm, to.value, actor, reason)
    audit("order", order.id, f"status:{to.value}", tenant_id=order.tenant_id, actor=actor,
          old={"status": frm}, new={"status": to.value, "reason": reason})

    if to == S.ACCEPTED:
        _event(order, "order.accepted")
    elif to == S.CANCELLED:
        _event(order, "order.cancelled", reason=reason)
        from apps.payments import services as pay
        pay.refund_on_cancel(order)
    elif to == S.READY:
        from apps.delivery import services as dlv
        dlv.create_shipment(order)
        from apps.payments import services as pay
        pay.settle_difference(order)
    elif to == S.COMPLETED:
        _event(order, "order.completed")
    return order


def cancel_by_customer(order, reason="customer"):
    order = Order.objects.select_for_update().get(pk=order.pk)
    if S(order.status) not in CUSTOMER_CANCELLABLE:
        raise ApiError(409, "cancel_not_allowed")
    return transition(order, S.CANCELLED, order.customer, reason or "customer", _lock=False)


def _release_everything(order):
    for it in order.items.all():
        vid, qty = held(it)
        if not vid:
            continue
        if order.stock_committed:
            stock.restock(order.branch_id, vid, it.actual_qty if it.actual_qty is not None else qty)
        else:
            stock.release(order.branch_id, vid, qty)
    if order.slot_id:
        stock.free_slot(order.slot_id)


def _finalize_for_ready(order):
    if order.approval_state == "pending" or order.items.filter(status="substitution_proposed").exists():
        raise ApiError(409, "approval_pending")
    for it in order.items.all():
        if it.status == "pending":
            if it.is_weighted:
                raise ApiError(409, "items_unresolved", item_id=str(it.id))
            it.status = "picked"
            it.save(update_fields=["status"])
        if it.status == "weight_pending":
            raise ApiError(409, "items_unresolved", item_id=str(it.id))
    recalc(order, allow_approval=False)
    if not order.items.exclude(status="removed").exists():
        raise ApiError(409, "items_unresolved", message="Barcha mahsulotlar chiqarib tashlangan — buyurtmani bekor qiling")
    for it in order.items.exclude(status="removed"):
        vid, qty = held(it)
        stock.commit(order.branch_id, vid, qty, it.actual_qty if it.actual_qty is not None else it.requested_qty)
    order.stock_committed = True
    _version(order, "final", approved=True)


# ------------------------------------------------------------------ yig'ish, almashtirish, rozilik
def current_total(order):
    return sum(i.line_total() for i in order.items.all()) + order.delivery_fee - order.discount


def recalc(order, allow_approval=True):
    """Yakuniy summa; rozilik chegarasidan oshsa — xaridor tasdig'i (AC-10)."""
    order.final_total = current_total(order)
    limit = int(Decimal(order.total) * (Decimal(100) + order.consent_increase_pct) / 100)
    base = order.approved_total if order.approved_total is not None else limit
    over = order.final_total > max(limit, base if order.approval_state == "approved" else 0)
    if allow_approval and over and order.approval_state != "pending":
        order.approval_state = "pending"
        order.approval_deadline = timezone.now() + timedelta(seconds=settings.SUBSTITUTION_REPLY_TIMEOUT_SEC)
        order.save()
        _event(order, "order.substitution_needed", final_total=order.final_total)
    elif not over and order.approval_state == "pending":
        order.approval_state = "none"
        order.approval_deadline = None
    order.save()


@transaction.atomic
def pick_item(order_id, item_id, actor, action, actual_qty=None, substitute_variant_id=None, serial=None):
    order = Order.objects.select_for_update().get(pk=order_id)
    if order.status not in (S.ACCEPTED, S.PREPARING):
        raise ApiError(409, "invalid_transition", message="Buyurtma yig'ish holatida emas")
    try:
        it = order.items.select_for_update().get(pk=item_id)
    except OrderItem.DoesNotExist:
        raise ApiError(404, "not_found")
    if order.status == S.ACCEPTED:
        transition(order, S.PREPARING, actor, "picking_started", _lock=False)
        order.refresh_from_db()

    if action == "pick":
        if it.is_weighted:
            if actual_qty in (None, ""):
                raise ApiError(400, "validation_error", "Tarozili mahsulot uchun actual_qty majburiy", field="actual_qty")
            it.actual_qty = Decimal(str(actual_qty)).quantize(Decimal("0.001"))
            if it.actual_qty <= 0:
                raise ApiError(400, "validation_error", "actual_qty > 0", field="actual_qty")
        if it.variant.product.requires_serial:
            if not serial:
                raise ApiError(400, "validation_error", "Seriya raqami majburiy", field="serial")
            it.serial_number = str(serial)[:64]
        it.status = "picked" if it.status != "substituted" else "substituted"
        it.save()
    elif action == "remove":
        _remove_item(order, it)
    elif action == "unavailable":
        _propose_or_remove(order, it, substitute_variant_id)
    else:
        raise ApiError(400, "validation_error", "action: pick | unavailable | remove", field="action")
    recalc(order)
    audit("order_item", it.id, f"pick:{action}", tenant_id=order.tenant_id, actor=actor,
          new={"actual_qty": str(it.actual_qty) if it.actual_qty is not None else None, "status": it.status})
    return order


def _remove_item(order, it):
    vid, qty = held(it)
    if vid:
        stock.release(order.branch_id, vid, qty)
    it.status, it.substituted_by, it.proposed_price, it.proposal_deadline = "removed", None, None, None
    it.save()


def _propose_or_remove(order, it, substitute_variant_id):
    rule = it.substitution_rule or order.substitution_rule
    if rule == "remove" or (not substitute_variant_id and rule != "call_me"):
        return _remove_item(order, it)
    if substitute_variant_id:
        st = BranchStock.objects.filter(branch=order.branch, variant_id=substitute_variant_id, is_stopped=False,
                                        variant__tenant=order.tenant).first()
        if st is None or st.available_qty - st.reserved_qty < it.requested_qty:
            raise ApiError(409, "out_of_stock", variant_id=str(substitute_variant_id))
        it.substituted_by_id, it.proposed_price = st.variant_id, st.price
    it.status = "substitution_proposed"
    it.proposal_deadline = timezone.now() + timedelta(seconds=settings.SUBSTITUTION_REPLY_TIMEOUT_SEC)
    it.save()
    _event(order, "order.substitution_needed", item_id=str(it.id))
    if rule == "call_me":
        _event(order, "order.call_customer", item_id=str(it.id))


def _accept_substitution(order, it):
    if it.substituted_by_id and stock.reserve(order.branch_id, it.substituted_by_id, it.requested_qty):
        stock.release(order.branch_id, it.variant_id, it.requested_qty)
        it.status = "substituted"
        it.proposal_deadline = None
        it.save()
        return True
    _remove_item(order, it)
    return False


@transaction.atomic
def customer_respond(order_id, actor, approve_changes=None, items=None):
    """Xaridor javobi: summa o'zgarishini tasdiqlash/rad etish va muqobillarga qaror."""
    order = Order.objects.select_for_update().get(pk=order_id)
    if order.status not in (S.ACCEPTED, S.PREPARING):
        raise ApiError(409, "invalid_transition")
    for d in items or []:
        it = order.items.filter(pk=d.get("item_id"), status="substitution_proposed").first()
        if not it:
            continue
        if d.get("accept"):
            _accept_substitution(order, it)
        else:
            _remove_item(order, it)
    if approve_changes is not None and order.approval_state == "pending":
        if approve_changes:
            order.approval_state, order.approved_total = "approved", current_total(order)
            order.final_total = order.approved_total
            order.save()
            _version(order, "customer_approved", approved=True)
            order.save()
        else:
            _decline_overweight(order)
    recalc(order)
    audit("order", order.id, "customer_respond", tenant_id=order.tenant_id, actor=actor,
          new={"approve": approve_changes, "items": items})
    return order


def _decline_overweight(order):
    """Rad etilsa — chegaradan oshgan tarozili qatorlar chiqarib tashlanadi."""
    factor = (Decimal(100) + order.consent_increase_pct) / 100
    for it in order.items.filter(is_weighted=True, actual_qty__isnull=False):
        if it.actual_qty > it.requested_qty * factor:
            _remove_item(order, it)
    order.approval_state, order.approval_deadline = "declined", None
    order.save()
    _version(order, "customer_declined", approved=False)
    order.save()


def apply_timeouts():
    """Worker: javob vaqti tugagan muqobil/rozilik so'rovlari — oldindan tanlangan qoida (AC-09)."""
    now, n = timezone.now(), 0
    for oid in (OrderItem.objects.filter(status="substitution_proposed", proposal_deadline__lt=now)
                .values_list("order_id", flat=True).distinct()):
        with transaction.atomic():
            order = Order.objects.select_for_update().get(pk=oid)
            for it in order.items.filter(status="substitution_proposed", proposal_deadline__lt=now):
                rule = it.substitution_rule or order.substitution_rule
                if rule == "suggest_similar" and it.substituted_by_id:
                    _accept_substitution(order, it)
                else:
                    _remove_item(order, it)
                audit("order_item", it.id, f"timeout:{rule}", tenant_id=order.tenant_id, new={"status": it.status})
                n += 1
            recalc(order)
    for order in Order.objects.filter(approval_state="pending", approval_deadline__lt=now):
        with transaction.atomic():
            order = Order.objects.select_for_update().get(pk=order.pk)
            if order.approval_state == "pending":
                _decline_overweight(order)
                recalc(order)
                audit("order", order.id, "approval_timeout", tenant_id=order.tenant_id)
                n += 1
    return n


def expire_reservations():
    """To'lanmagan onlayn buyurtmalar rezervi muddati tugaydi."""
    n = 0
    for o in Order.objects.filter(status=S.CREATED, reserve_expires_at__lt=timezone.now()):
        try:
            transition(o, S.CANCELLED, None, "payment_timeout")
            n += 1
        except ApiError:
            pass
    return n


def sla_alerts():
    """Qo'lda tasdiq SLA si o'tgan buyurtmalar uchun ogohlantirish (bir marta)."""
    n = 0
    for o in Order.objects.filter(status=S.PENDING_CONFIRMATION, confirm_deadline__lt=timezone.now(), sla_alerted=False):
        with transaction.atomic():
            o = Order.objects.select_for_update().get(pk=o.pk)
            if not o.sla_alerted:
                o.sla_alerted = True
                o.save(update_fields=["sla_alerted"])
                _event(o, "order.confirm_overdue")
                n += 1
    return n
