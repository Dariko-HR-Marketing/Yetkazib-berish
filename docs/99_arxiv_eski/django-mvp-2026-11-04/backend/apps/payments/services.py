import json
import logging
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone

from apps.orders.models import Order, OrderStatus as S
from apps.platform.errors import ApiError
from apps.platform.models import InboundWebhook
from apps.platform.services import audit, emit, handler

from .models import Payment, PaymentStatus as P, Refund
from .providers import get_provider

log = logging.getLogger(__name__)
LIVE = (P.PENDING, P.AUTHORIZED, P.PAID, P.PARTIALLY_REFUNDED)
RANK = {P.PENDING: 0, P.AUTHORIZED: 1, P.PAID: 2}


def create_payment(order, key, provider_name=None):
    order = Order.objects.select_for_update().get(pk=order.pk)
    if order.payment_method != "online" or order.status != S.CREATED:
        raise ApiError(409, "invalid_transition", message="Bu buyurtma uchun onlayn to'lov kerak emas")
    existing = order.payments.filter(status__in=[P.PENDING, P.AUTHORIZED, P.PAID]).first()
    if existing:
        return existing
    prov = get_provider(provider_name)
    pay = Payment(tenant=order.tenant, order=order, provider=prov.name, amount=order.total, idempotency_key=key)
    pay.external_txn_id, pay.checkout_url = prov.create_checkout(pay)
    pay.save()
    audit("payment", pay.id, "create", tenant_id=order.tenant_id, new={"amount": pay.amount, "provider": pay.provider})
    return pay


def _apply(pay, new_status):
    """Faqat oldinga qarab (pending -> authorized -> paid). Qaytish yo'q: takroriy webhook zarar qilmaydi."""
    if new_status == P.FAILED:
        if pay.status == P.PENDING:
            pay.status = P.FAILED
    elif RANK.get(pay.status, 99) < RANK[new_status]:
        pay.status = new_status
    pay.save()
    order = pay.order
    if pay.status in (P.AUTHORIZED, P.PAID):
        if order.status == S.CREATED:
            from apps.orders.services import on_payment_confirmed
            on_payment_confirmed(order.id)
        elif order.status == S.CANCELLED:     # kech kelgan to'lov — qaytarish
            pay.needs_attention = True
            pay.save()
            _queue_refund(pay, _remaining(pay), "late_payment_after_cancel")
            emit("payment.attention", "payment", pay.id, {"order_id": str(order.id), "why": "late_payment"}, tenant_id=pay.tenant_id)


@transaction.atomic
def handle_webhook(provider_name, raw_body, signature):
    prov = get_provider(provider_name)
    if not prov.verify_signature(raw_body, signature):
        raise ApiError(401, "bad_signature")
    try:
        data = json.loads(raw_body)
        event_id, etype = str(data["event_id"]), data["type"]
    except (ValueError, KeyError):
        raise ApiError(400, "validation_error", "event_id va type majburiy")
    if etype not in ("payment.authorized", "payment.paid", "payment.failed"):
        raise ApiError(400, "validation_error", "type noma'lum")
    try:
        with transaction.atomic():
            hook = InboundWebhook.objects.create(provider=provider_name, external_event_id=event_id, payload=data)
    except IntegrityError:
        return {"status": "duplicate"}               # AC-03: takroriy webhook bir marta qayta ishlanadi
    qs = Payment.objects.select_for_update().select_related("order")
    pay = (qs.filter(id=data["payment_id"]) if data.get("payment_id") else qs.filter(provider=provider_name, external_txn_id=data.get("external_txn_id"))).first()
    if pay is None:
        raise ApiError(404, "not_found")
    if "amount" in data and int(data["amount"]) != pay.amount:
        pay.needs_attention = True
        pay.save()
        emit("payment.attention", "payment", pay.id, {"order_id": str(pay.order_id), "why": "amount_mismatch"}, tenant_id=pay.tenant_id)
        audit("payment", pay.id, "amount_mismatch", tenant_id=pay.tenant_id, new=data)
    else:
        _apply(pay, {"payment.authorized": P.AUTHORIZED, "payment.paid": P.PAID, "payment.failed": P.FAILED}[etype])
    hook.processed_at = timezone.now()
    hook.save(update_fields=["processed_at"])
    return {"status": "ok"}


def reconcile_pending():
    """Webhook kelmasa (AC-06): provayderdan holat so'raladi; noaniq bo'lsa operator navbatiga."""
    cutoff = timezone.now() - timedelta(minutes=settings.PAYMENT_PENDING_CHECK_MIN)
    n = 0
    for pay in Payment.objects.filter(status=P.PENDING, provider__in=["mock", "payme", "click"], created_at__lt=cutoff, needs_attention=False):
        with transaction.atomic():
            pay = Payment.objects.select_for_update().select_related("order").get(pk=pay.pk)
            if pay.status != P.PENDING:
                continue
            try:
                res = get_provider(pay.provider).check_status(pay)
            except Exception:  # noqa: BLE001
                res = None
            if res in ("paid", "authorized", "failed"):
                _apply(pay, {"paid": P.PAID, "authorized": P.AUTHORIZED, "failed": P.FAILED}[res])
            else:
                pay.needs_attention = True
                pay.save()
                emit("payment.attention", "payment", pay.id, {"order_id": str(pay.order_id), "why": "unknown_status"}, tenant_id=pay.tenant_id)
            n += 1
    return n


# ---------------------------------------------------------------- qaytarish
def _remaining(pay):
    """Hali qaytarilmagan va navbatdagi (requested/approved) qaytarishlarga band bo'lmagan summa."""
    queued = pay.refunds.filter(state__in=["requested", "approved"]).aggregate(s=Sum("amount"))["s"] or 0
    return pay.amount - pay.refunded_amount - queued


def _queue_refund(pay, amount, reason, requested_by=None, approved_by=None, key=None, state="approved"):
    if amount <= 0:
        return None
    r = Refund.objects.create(tenant=pay.tenant, payment=pay, amount=amount, reason=reason, state=state,
                              requested_by=requested_by, approved_by=approved_by, idempotency_key=key or uuid.uuid4())
    if state == "approved":
        pay.status = P.REFUNDING
        pay.save(update_fields=["status", "updated_at"])
        emit("refund.requested", "payment", pay.id, {"refund_id": str(r.id)}, tenant_id=pay.tenant_id)
    audit("refund", r.id, f"create:{state}", tenant_id=pay.tenant_id, actor=requested_by, new={"amount": amount, "reason": reason})
    return r


def refund_on_cancel(order):
    for pay in order.payments.select_for_update().filter(status__in=[P.AUTHORIZED, P.PAID, P.PARTIALLY_REFUNDED, P.REFUNDING]):
        _queue_refund(pay, _remaining(pay), "order_cancelled")


def settle_difference(order):
    """Yig'ishdan keyin yakuniy summa to'langandan farq qilsa (5.3: vazn/narx o'zgardi)."""
    if order.payment_method != "online":
        return
    pays = list(order.payments.select_for_update().filter(status__in=[P.AUTHORIZED, P.PAID]))
    paid = sum(_remaining(p) for p in pays)
    diff = paid - (order.final_total if order.final_total is not None else order.total)
    if diff > 0 and pays:
        _queue_refund(pays[0], min(diff, _remaining(pays[0])), "final_total_decrease")
    elif diff < 0:
        order.balance_due = -diff             # provayder qo'shimcha undirishni qo'llamasa — topshirishda to'lanadi
        order.save(update_fields=["balance_due"])


@transaction.atomic
def request_refund(order, amount, reason, key, user, can_approve):
    pay = (order.payments.select_for_update().filter(status__in=[P.PAID, P.PARTIALLY_REFUNDED, P.REFUNDING]).order_by("-created_at").first())
    if pay is None:
        raise ApiError(409, "invalid_transition", message="To'langan to'lov topilmadi")
    if not (0 < amount <= _remaining(pay)):
        raise ApiError(422, "refund_too_large")
    needs_finance = amount > settings.SUPPORT_REFUND_LIMIT and not can_approve
    return _queue_refund(pay, amount, reason, requested_by=user, approved_by=None if needs_finance else user, key=key,
                         state="requested" if needs_finance else "approved")


@transaction.atomic
def approve_refund(refund_id, user):
    r = Refund.objects.select_for_update().select_related("payment").get(pk=refund_id)
    if r.state != "requested":
        raise ApiError(409, "invalid_transition", message="Qaytarish allaqachon ko'rib chiqilgan")
    r.state, r.approved_by = "approved", user
    r.save()
    r.payment.status = P.REFUNDING
    r.payment.save(update_fields=["status", "updated_at"])
    emit("refund.requested", "payment", r.payment_id, {"refund_id": str(r.id)}, tenant_id=r.tenant_id)
    audit("refund", r.id, "approve", tenant_id=r.tenant_id, actor=user)
    return r


@handler("refund.requested")
def process_refund(ev):
    r = Refund.objects.select_for_update().select_related("payment__order").get(pk=ev.payload["refund_id"])
    if r.state != "approved":
        return
    pay = Payment.objects.select_for_update().get(pk=r.payment_id)
    get_provider(pay.provider).refund(pay, r.amount)           # xato bo'lsa outbox qayta urinadi
    r.state = "refunded"
    r.save()
    pay.refunded_amount += r.amount
    pay.status = P.REFUNDED if pay.refunded_amount >= pay.amount else P.PARTIALLY_REFUNDED
    pay.save()
    o = r.payment.order
    emit("refund.refunded", "payment", pay.id, {"order_id": str(o.id), "number": o.number, "phone": o.customer_phone,
                                                "amount": r.amount, "lang": "uz"}, tenant_id=pay.tenant_id)


# ---------------------------------------------------------------- topshirishda to'lov
def record_delivery_payment(order):
    """Naqd/karta (topshirishda) yoki onlayn to'lovdagi farq — kuryer yig'gan summa."""
    amount = order.payable_total if order.payment_method != "online" else order.balance_due
    if amount > 0:
        provider = "cash" if order.payment_method != "card_on_delivery" else "card_terminal"
        Payment.objects.create(tenant=order.tenant, order=order, provider=provider, amount=amount, status=P.PAID,
                               idempotency_key=uuid.uuid4())
