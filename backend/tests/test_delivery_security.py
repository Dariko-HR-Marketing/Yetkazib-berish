"""AC-04, AC-05, AC-07 va yetkazish, to'lov, moliya, auth oqimlari."""
import uuid
from datetime import timedelta

import pyotp
import pytest
from django.utils import timezone

from apps.accounts.models import OTPCode, User
from apps.delivery.models import Shipment
from apps.delivery.services import pin_for
from apps.orders.models import Order
from apps.payments.models import Payment, Refund
from apps.platform.models import AuditLog, Notification
from apps.platform.services import process_outbox

from .conftest import add_product, api, make_tenant, make_user, move_to_ready, post_order, sign


def items(v, qty=1):
    return [{"variant_id": str(v.id), "qty": qty}]


def ready_order(w, **kw):
    o = post_order(api(), "shop-a", items(w.milk), **kw).json()
    a, b = move_to_ready(w, o["id"])
    assert b.status_code == 200, b.content
    sh = Shipment.objects.get(order_id=o["id"])
    return o, sh


def courier_do(w, user, sh, action, **data):
    return api(user).post(f"/api/v1/delivery/shipments/{sh.id}/status", {"action": action, **data}, format="json")


def assign(w, sh, courier=None):
    return api(w.disp).post(f"/api/v1/delivery/shipments/{sh.id}/assign", {"courier_id": str((courier or w.courier).id)}, format="json")


def test_full_delivery_flow_with_pin_cash(world):
    o, sh = ready_order(world)
    assert assign(world, sh).status_code == 200
    assert courier_do(world, world.courier, sh, "pickup").status_code == 200
    process_outbox()
    msg = Notification.objects.filter(template="order.in_delivery").first()
    pin = pin_for(sh)
    assert pin in msg.text and "?track=" in msg.text
    t = api().get(f"/api/v1/tracking/{o['tracking_token']}").json()
    assert t["status"] == "in_delivery" and t["courier"]["name"] == "Aziz" and t["delivery_pin"] == pin
    assert courier_do(world, world.courier, sh, "deliver", pin="0000" if pin != "0000" else "1111").status_code == 400
    r = courier_do(world, world.courier, sh, "deliver", pin=pin)
    assert r.status_code == 200 and r.json()["status"] == "delivered"
    od = Order.objects.get(id=o["id"])
    assert od.status == "completed"
    p = Payment.objects.get(order=od, provider="cash")
    assert p.status == "paid" and p.amount == od.total
    process_outbox()
    assert Notification.objects.filter(template="order.completed").exists()
    # buyurtma tugagach stok qoldig'i kamaygan
    from apps.catalog.models import BranchStock
    st = BranchStock.objects.get(variant=world.milk)
    assert st.available_qty == 99 and st.reserved_qty == 0


def test_AC05_courier_isolation_and_phone_masking(world):
    o, sh = ready_order(world)
    assign(world, sh)
    assert api(world.courier2).get(f"/api/v1/courier/shipments/{sh.id}").status_code == 404
    assert courier_do(world, world.courier2, sh, "pickup").status_code == 404
    assert api(world.courier2).get("/api/v1/courier/shipments").json() == []
    r = api(world.courier).get(f"/api/v1/courier/shipments/{sh.id}").json()
    assert r["customer_phone"] == "+998901112233"            # topshirilgunga qadar ko'rinadi
    courier_do(world, world.courier, sh, "pickup")
    courier_do(world, world.courier, sh, "deliver", pin=pin_for(sh))
    r = api(world.courier).get(f"/api/v1/courier/shipments/{sh.id}").json()
    assert "+998901112233" not in str(r) and "****" in r["customer_phone"]


def test_AC07_courier_reject_alerts_dispatcher_and_reassign(world):
    o, sh = ready_order(world)
    assign(world, sh)
    assert courier_do(world, world.courier, sh, "reject").status_code == 200
    sh.refresh_from_db()
    assert sh.status == "created" and sh.attention == "rejected" and sh.courier_id is None
    process_outbox()
    assert Notification.objects.filter(template="shipment.rejected").exists()
    lst = api(world.disp).get("/api/v1/delivery/shipments").json()
    assert lst[0]["attention"] == "rejected" and "customer_phone" in lst[0] and "****" in lst[0]["customer_phone"]
    assert assign(world, sh, world.courier2).status_code == 200


def test_pin_lockout_and_unlock(world):
    o, sh = ready_order(world)
    assign(world, sh)
    courier_do(world, world.courier, sh, "pickup")
    bad = "0000" if pin_for(sh) != "0000" else "1111"
    for _ in range(5):
        assert courier_do(world, world.courier, sh, "deliver", pin=bad).status_code == 400
    r = courier_do(world, world.courier, sh, "deliver", pin=pin_for(sh))
    assert r.status_code == 423 and r.json()["error"]["code"] == "pin_locked"
    api(world.disp).post(f"/api/v1/delivery/shipments/{sh.id}/resolve", {"action": "unlock_pin"}, format="json")
    assert courier_do(world, world.courier, sh, "deliver", pin=pin_for(sh)).status_code == 200


def test_failed_delivery_requires_reason_and_contacts_then_return_refunds(world, settings):
    settings.NO_RECIPIENT_WAIT_MIN = 0
    o, sh = ready_order(world)
    assign(world, sh)
    courier_do(world, world.courier, sh, "pickup")
    assert courier_do(world, world.courier, sh, "fail").status_code == 400
    r = courier_do(world, world.courier, sh, "fail", reason="no_recipient")
    assert r.status_code == 409 and r.json()["error"]["code"] == "contact_attempts_required"
    courier_do(world, world.courier, sh, "contact")
    courier_do(world, world.courier, sh, "contact")
    r = courier_do(world, world.courier, sh, "fail", reason="no_recipient")
    assert r.status_code == 200 and r.json()["status"] == "failed"
    r = api(world.disp).post(f"/api/v1/delivery/shipments/{sh.id}/resolve", {"action": "return"}, format="json")
    assert r.status_code == 200
    od = Order.objects.get(id=o["id"])
    assert od.status == "cancelled" and od.cancel_reason.startswith("return:")
    from apps.catalog.models import BranchStock
    assert BranchStock.objects.get(variant=world.milk).available_qty == 100       # tovar omborga qaytdi


def test_redeliver_creates_new_shipment(world, settings):
    settings.NO_RECIPIENT_WAIT_MIN = 0
    o, sh = ready_order(world)
    assign(world, sh)
    courier_do(world, world.courier, sh, "pickup")
    courier_do(world, world.courier, sh, "fail", reason="address_wrong")
    r = api(world.disp).post(f"/api/v1/delivery/shipments/{sh.id}/resolve", {"action": "redeliver"}, format="json")
    assert r.status_code == 200 and r.json()["status"] == "created"
    new = Shipment.objects.get(id=r.json()["id"])
    assign(world, new, world.courier2)
    assert courier_do(world, world.courier2, new, "pickup").status_code == 200
    assert courier_do(world, world.courier2, new, "deliver", pin=pin_for(new)).status_code == 200


def test_vehicle_capacity_check(world):
    from .conftest import add_product
    big = add_product(world.t, world.b, "FRIDGE", 500_000_000, 5, weight_g=60_000)
    o = post_order(api(), "shop-a", items(big)).json()
    move_to_ready(world, o["id"])
    sh = Shipment.objects.get(order_id=o["id"])
    assert sh.vehicle_type == "car"
    r = api(world.disp).post(f"/api/v1/delivery/shipments/{sh.id}/assign", {"courier_id": str(world.courier.id), "vehicle_type": "bike"}, format="json")
    assert r.status_code == 409 and r.json()["error"]["code"] == "vehicle_too_small"
    assert api(world.disp).post(f"/api/v1/delivery/shipments/{sh.id}/assign", {"courier_id": str(world.courier.id), "vehicle_type": "car"}, format="json").status_code == 200


def test_tracking_token_expiry_returns_410(world):
    o = post_order(api(), "shop-a", items(world.milk)).json()
    assert api().get(f"/api/v1/tracking/{o['tracking_token']}").status_code == 200
    Order.objects.filter(id=o["id"]).update(tracking_expires_at=timezone.now() - timedelta(seconds=1))
    assert api().get(f"/api/v1/tracking/{o['tracking_token']}").status_code == 410
    assert api().get("/api/v1/tracking/nonexistent-token").status_code == 404


# ------------------------------------------------------------ AC-04 tenant izolyatsiyasi
def test_AC04_tenant_isolation_returns_404_and_audit(world):
    o = post_order(api(), "shop-a", items(world.milk)).json()
    owner_b = api(world.owner_b)
    assert owner_b.get(f"/api/v1/partner/orders/{o['id']}").status_code == 404
    assert owner_b.post(f"/api/v1/partner/orders/{o['id']}/transition", {"to": "cancelled", "reason": "x"}, format="json").status_code == 404
    assert owner_b.get(f"/api/v1/partner/branches/{world.b.id}/orders").status_code == 404
    assert owner_b.put(f"/api/v1/partner/branches/{world.b.id}/stock", [{"sku": "MILK", "price": 1}], format="json").status_code == 404
    assert api(world.picker).patch(f"/api/v1/picking/orders/{o['id']}/items/{o['items'][0]['id']}", {"action": "pick"}, format="json").status_code == 200
    assert AuditLog.objects.filter(action="access_denied", actor_id=world.owner_b.id).count() >= 3
    assert Order.objects.get(id=o["id"]).status != "cancelled"
    # xaridor boshqa xaridorning buyurtmasini ko'rmaydi
    other = make_user("+998909998877", "customer")
    assert api(other).get(f"/api/v1/orders/{o['id']}").status_code == 404


def test_role_restrictions(world):
    o = post_order(api(), "shop-a", items(world.milk)).json()
    assert api(world.picker).post(f"/api/v1/partner/orders/{o['id']}/transition", {"to": "cancelled", "reason": "x"}, format="json").status_code == 403
    assert api(world.courier).get(f"/api/v1/partner/branches/{world.b.id}/orders").status_code == 403
    assert api().get(f"/api/v1/partner/branches/{world.b.id}/orders").status_code == 401
    d = api(world.disp).get(f"/api/v1/partner/branches/{world.b.id}/orders").json()["orders"][0]
    assert "customer_phone" not in d              # dispetcher shaxsiy ma'lumotsiz
    q = api(world.picker).get(f"/api/v1/picking/branches/{world.b.id}/queue").json()["orders"][0]
    assert "customer_phone" not in q


# ------------------------------------------------------------ to'lov
def test_AC03_duplicate_webhook_single_effect_and_amount_mismatch(world):
    o = post_order(api(), "shop-a", items(world.milk), payment_method="online").json()
    tok = o["tracking_token"]
    key = uuid.uuid4()
    r1 = api().post(f"/api/v1/orders/{o['id']}/payments", {}, format="json", HTTP_IDEMPOTENCY_KEY=str(key), HTTP_X_TRACKING_TOKEN=tok)
    r2 = api().post(f"/api/v1/orders/{o['id']}/payments", {}, format="json", HTTP_IDEMPOTENCY_KEY=str(key), HTTP_X_TRACKING_TOKEN=tok)
    assert r1.json()["id"] == r2.json()["id"] and Payment.objects.count() == 1
    pay = Payment.objects.get()
    raw, sig = sign({"event_id": "evt-1", "type": "payment.paid", "payment_id": str(pay.id), "amount": pay.amount})
    assert api().post("/api/v1/webhooks/payments/mock", raw, content_type="application/json", HTTP_X_SIGNATURE=sig).json() == {"status": "ok"}
    assert api().post("/api/v1/webhooks/payments/mock", raw, content_type="application/json", HTTP_X_SIGNATURE=sig).json() == {"status": "duplicate"}
    pay.refresh_from_db()
    assert pay.status == "paid" and Order.objects.get().status == "accepted"
    assert api().post("/api/v1/webhooks/payments/mock", raw, content_type="application/json", HTTP_X_SIGNATURE="bad").status_code == 401


def test_webhook_amount_mismatch_flags_attention(world):
    o = post_order(api(), "shop-a", items(world.milk), payment_method="online").json()
    api().post(f"/api/v1/orders/{o['id']}/payments", {}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), HTTP_X_TRACKING_TOKEN=o["tracking_token"])
    pay = Payment.objects.get()
    raw, sig = sign({"event_id": "evt-x", "type": "payment.paid", "payment_id": str(pay.id), "amount": pay.amount - 1})
    api().post("/api/v1/webhooks/payments/mock", raw, content_type="application/json", HTTP_X_SIGNATURE=sig)
    pay.refresh_from_db()
    assert pay.needs_attention and pay.status == "pending" and Order.objects.get().status == "created"


def test_AC06_missing_webhook_status_check_then_operator_queue(world, settings):
    from apps.payments import providers, services
    o = post_order(api(), "shop-a", items(world.milk), payment_method="online").json()
    api().post(f"/api/v1/orders/{o['id']}/payments", {}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), HTTP_X_TRACKING_TOKEN=o["tracking_token"])
    pay = Payment.objects.get()
    Payment.objects.filter(id=pay.id).update(created_at=timezone.now() - timedelta(minutes=10))
    providers._override["mock"] = type("P", (providers.MockProvider,), {"check_status": lambda self, p: "paid"})()
    try:
        assert services.reconcile_pending() == 1
    finally:
        providers._override.clear()
    assert Order.objects.get().status == "accepted"
    # noaniq holat -> operator navbati
    o2 = post_order(api(), "shop-a", items(world.milk), payment_method="online").json()
    api().post(f"/api/v1/orders/{o2['id']}/payments", {}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), HTTP_X_TRACKING_TOKEN=o2["tracking_token"])
    Payment.objects.filter(order_id=o2["id"]).update(created_at=timezone.now() - timedelta(minutes=10))
    services.reconcile_pending()
    assert Payment.objects.get(order_id=o2["id"]).needs_attention
    q = api(world.support).get("/api/v1/ops/attention").json()
    assert len(q["payments"]) == 1


def test_late_payment_after_cancel_is_refunded(world):
    o = post_order(api(), "shop-a", items(world.milk), payment_method="online").json()
    api().post(f"/api/v1/orders/{o['id']}/payments", {}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), HTTP_X_TRACKING_TOKEN=o["tracking_token"])
    api().post(f"/api/v1/orders/{o['id']}/cancel", {}, format="json", HTTP_X_TRACKING_TOKEN=o["tracking_token"])
    pay = Payment.objects.get()
    raw, sig = sign({"event_id": "late", "type": "payment.paid", "payment_id": str(pay.id), "amount": pay.amount})
    api().post("/api/v1/webhooks/payments/mock", raw, content_type="application/json", HTTP_X_SIGNATURE=sig)
    assert Refund.objects.filter(payment=pay).count() == 1


def test_online_overweight_final_total_creates_balance_due_and_refund_on_decrease(world):
    # pasayish: to'langandan kam bo'lsa farq qaytariladi
    o = post_order(api(), "shop-a", [{"variant_id": str(world.apple.id), "qty": 2}], payment_method="online").json()
    api().post(f"/api/v1/orders/{o['id']}/payments", {}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), HTTP_X_TRACKING_TOKEN=o["tracking_token"])
    pay = Payment.objects.get()
    raw, sig = sign({"event_id": "p1", "type": "payment.paid", "payment_id": str(pay.id), "amount": pay.amount})
    api().post("/api/v1/webhooks/payments/mock", raw, content_type="application/json", HTTP_X_SIGNATURE=sig)
    item = o["items"][0]["id"]
    api(world.picker).patch(f"/api/v1/picking/orders/{o['id']}/items/{item}", {"action": "pick", "actual_qty": "1.9"}, format="json")
    a, b = move_to_ready(world, o["id"])
    assert b.status_code == 200, b.content
    r = Refund.objects.get(payment=pay)
    assert r.amount == int(2 * 1_800_000 - 1.9 * 1_800_000)
    # o'sish (rozilik chegarasi ichida): topshirishda to'lanadi
    o2 = post_order(api(), "shop-a", [{"variant_id": str(world.apple.id), "qty": 2}], payment_method="online").json()
    api().post(f"/api/v1/orders/{o2['id']}/payments", {}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), HTTP_X_TRACKING_TOKEN=o2["tracking_token"])
    p2 = Payment.objects.get(order_id=o2["id"])
    raw, sig = sign({"event_id": "p2", "type": "payment.paid", "payment_id": str(p2.id), "amount": p2.amount})
    api().post("/api/v1/webhooks/payments/mock", raw, content_type="application/json", HTTP_X_SIGNATURE=sig)
    api(world.picker).patch(f"/api/v1/picking/orders/{o2['id']}/items/{o2['items'][0]['id']}", {"action": "pick", "actual_qty": "2.1"}, format="json")
    move_to_ready(world, o2["id"])
    assert Order.objects.get(id=o2["id"]).balance_due == int(2.1 * 1_800_000 - 2 * 1_800_000)


def test_refund_limit_requires_finance_approval(world, settings):
    settings.SUPPORT_REFUND_LIMIT = 1_000_000
    o = post_order(api(), "shop-a", items(world.milk, 5), payment_method="online").json()
    api().post(f"/api/v1/orders/{o['id']}/payments", {}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), HTTP_X_TRACKING_TOKEN=o["tracking_token"])
    pay = Payment.objects.get()
    raw, sig = sign({"event_id": "r1", "type": "payment.paid", "payment_id": str(pay.id), "amount": pay.amount})
    api().post("/api/v1/webhooks/payments/mock", raw, content_type="application/json", HTTP_X_SIGNATURE=sig)
    s = api(world.support)
    k = str(uuid.uuid4())
    small = s.post(f"/api/v1/support/orders/{o['id']}/refunds", {"amount": 500_000, "reason": "shikast"}, format="json", HTTP_IDEMPOTENCY_KEY=k)
    assert small.status_code == 201 and small.json()["state"] == "approved"
    assert s.post(f"/api/v1/support/orders/{o['id']}/refunds", {"amount": 500_000, "reason": "shikast"}, format="json", HTTP_IDEMPOTENCY_KEY=k).json()["id"] == small.json()["id"]
    big = s.post(f"/api/v1/support/orders/{o['id']}/refunds", {"amount": 3_000_000, "reason": "yo'q"}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
    assert big.json()["state"] == "requested"
    assert s.post(f"/api/v1/finance/refunds/{big.json()['id']}/approve", {}, format="json").status_code == 403
    assert api(world.finance).post(f"/api/v1/finance/refunds/{big.json()['id']}/approve", {}, format="json").status_code == 200
    assert api(world.finance).post(f"/api/v1/finance/refunds/{big.json()['id']}/approve", {}, format="json").status_code == 409
    too = s.post(f"/api/v1/support/orders/{o['id']}/refunds", {"amount": 99_999_999, "reason": "x"}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
    assert too.status_code == 422
    process_outbox()
    pay.refresh_from_db()
    assert pay.refunded_amount == 3_500_000 and pay.status == "partially_refunded"


def test_reconciliation_flags_mismatches_and_csv(world):
    o, sh = ready_order(world)
    assign(world, sh)
    courier_do(world, world.courier, sh, "pickup")
    courier_do(world, world.courier, sh, "deliver", pin=pin_for(sh))
    r = api(world.finance).get("/api/v1/finance/reconciliation").json()
    assert r["orders"] == 1 and r["mismatches"] == []
    Payment.objects.filter(order_id=o["id"]).update(amount=1)
    r = api(world.finance).get("/api/v1/finance/reconciliation").json()
    assert r["mismatches"][0]["issues"] == ["completed_amount_mismatch"]
    csv = api(world.finance).get("/api/v1/finance/reconciliation?format=csv")
    assert csv["Content-Type"].startswith("text/csv") and b"completed_amount_mismatch" in csv.content


def test_reports_contribution(world):
    o, sh = ready_order(world)
    assign(world, sh)
    courier_do(world, world.courier, sh, "pickup")
    courier_do(world, world.courier, sh, "deliver", pin=pin_for(sh))
    r = api(world.owner).get("/api/v1/partner/reports").json()
    assert r["orders_completed"] == 1 and r["sales"] == 2_400_000 and r["avg_check"] == 2_400_000
    assert r["by_channel"] == {"web": 1} and "avg_per_order" in r["contribution"]
    assert api(world.owner_b).get("/api/v1/partner/reports").json()["orders_total"] == 0


# ------------------------------------------------------------ auth
def test_otp_login_ttl_and_lockout(world, settings):
    c = api()
    assert c.post("/api/v1/auth/otp/request", {"phone": "90 777 66 55"}, format="json").status_code == 204
    msg = Notification.objects.filter(template="otp").latest("created_at").text
    code = msg.split(": ")[1]
    for _ in range(5):
        assert c.post("/api/v1/auth/otp/verify", {"phone": "+998907776655", "code": "000000"}, format="json").status_code == 400
    r = c.post("/api/v1/auth/otp/verify", {"phone": "+998907776655", "code": code}, format="json")
    assert r.status_code == 429 and r.json()["error"]["code"] == "otp_blocked"      # 5 xatodan keyin to'g'ri kod ham bloklanadi
    c.post("/api/v1/auth/otp/request", {"phone": "+998907776655"}, format="json")
    code = Notification.objects.filter(template="otp").latest("created_at").text.split(": ")[1]
    r = c.post("/api/v1/auth/otp/verify", {"phone": "+998907776655", "code": code}, format="json")
    assert r.status_code == 200
    tok = r.json()["access_token"]
    me = APIClientBearer(tok).get("/api/v1/me")
    assert me.status_code == 200 and me.json()["phone"] == "+998907776655"
    OTPCode.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
    assert c.post("/api/v1/auth/otp/verify", {"phone": "+998907776655", "code": code}, format="json").status_code == 400


def test_otp_rate_limit(world):
    c = api()
    for _ in range(5):
        assert c.post("/api/v1/auth/otp/request", {"phone": "+998905550000"}, format="json").status_code == 204
    assert c.post("/api/v1/auth/otp/request", {"phone": "+998905550000"}, format="json").status_code == 429


def APIClientBearer(token):
    from rest_framework.test import APIClient
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return c


def test_invalid_and_revoked_token(world):
    assert APIClientBearer("garbage").get("/api/v1/me").status_code == 401
    from apps.accounts.auth import issue_token
    tok = issue_token(world.owner, 12)
    assert APIClientBearer(tok).get("/api/v1/me").status_code == 200
    world.owner.token_epoch += 1
    world.owner.save()
    assert APIClientBearer(tok).get("/api/v1/me").status_code == 401


def test_admin_requires_mfa_and_flow(world):
    admin = User.objects.create_superuser("+998900000001", "adminpw-1")
    c = api()
    r = c.post("/api/v1/auth/staff/login", {"phone": "+998900000001", "password": "adminpw-1"}, format="json")
    assert r.status_code == 403 and r.json()["error"]["code"] == "mfa_enrollment_required"
    r = c.post("/api/v1/auth/mfa/setup", {"phone": "+998900000001", "password": "adminpw-1"}, format="json")
    secret = r.json()["secret"]
    assert c.post("/api/v1/auth/mfa/confirm", {"phone": "+998900000001", "password": "adminpw-1", "code": "000000"}, format="json").status_code == 400
    assert c.post("/api/v1/auth/mfa/confirm", {"phone": "+998900000001", "password": "adminpw-1", "code": pyotp.TOTP(secret).now()}, format="json").status_code == 204
    r = c.post("/api/v1/auth/staff/login", {"phone": "+998900000001", "password": "adminpw-1"}, format="json")
    assert r.status_code == 401 and r.json()["error"]["code"] == "mfa_required"
    r = c.post("/api/v1/auth/staff/login", {"phone": "+998900000001", "password": "adminpw-1", "mfa_code": pyotp.TOTP(secret).now()}, format="json")
    assert r.status_code == 200 and any(x["role"] == "platform_admin" for x in r.json()["user"]["roles"])
    assert c.post("/api/v1/auth/staff/login", {"phone": "+998900000001", "password": "wrong"}, format="json").status_code == 401


def test_finance_also_requires_mfa(world):
    r = api().post("/api/v1/auth/staff/login", {"phone": "+998900000017", "password": "pw-12345"}, format="json")
    assert r.status_code == 403
    r = api().post("/api/v1/auth/staff/login", {"phone": "+998900000012", "password": "pw-12345"}, format="json")
    assert r.status_code == 200          # yig'uvchi uchun MFA majburiy emas


def test_platform_admin_onboards_tenant_without_code(world):
    admin = make_user("+998900000002", "platform_admin")
    r = api(admin).post("/api/v1/platform/tenants", {"name": "Yangi Kafe", "slug": "yangi-kafe", "profile": "small_shop",
                        "owner_phone": "+998901234000", "owner_password": "owner-pass-1",
                        "branch": {"name": "Bosh", "address": "x", "lat": 40.1, "lng": 65.37}}, format="json")
    assert r.status_code == 201
    from apps.tenants.models import Branch
    assert Branch.objects.get(id=r.json()["branch_id"]).manual_confirm is True     # kichik do'kon shabloni
    assert api(world.owner).post("/api/v1/platform/tenants", {}, format="json").status_code == 403
