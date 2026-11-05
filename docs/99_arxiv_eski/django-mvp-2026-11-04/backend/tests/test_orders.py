"""AC-02, AC-03, AC-08, AC-10 va buyurtma holat mashinasi."""
import threading
import uuid
from decimal import Decimal

import pytest
from django.db import connection

from apps.catalog.models import BranchStock
from apps.orders.models import Order
from apps.payments.models import Payment, Refund
from apps.platform.services import process_outbox
from apps.tenants.models import TimeSlot
from django.utils import timezone
from datetime import timedelta

from .conftest import ADDR, api, post_order, sign, move_to_ready


def items(v, qty=1):
    return [{"variant_id": str(v.id), "qty": qty}]


def test_create_order_server_side_price_and_fee(world):
    r = post_order(api(), "shop-a", [{"variant_id": str(world.milk.id), "qty": 2, "price": 1}])
    assert r.status_code == 201, r.content
    d = r.json()
    assert d["subtotal"] == 2_800_000 and d["delivery_fee"] == 1_000_000 and d["total"] == 3_800_000
    assert d["status"] == "accepted"            # manual_confirm=False -> avtomatik


def test_free_delivery_threshold_and_out_of_zone(world):
    r = post_order(api(), "shop-a", items(world.milk, 11))   # 154 000 so'm >= 150 000
    assert r.json()["delivery_fee"] == 0
    far = {**ADDR, "lat": 41.5, "lng": 66.5}
    r = api().post("/api/v1/orders", {"tenant_slug": "shop-a", "customer_phone": "+998901112233", "address": far,
                                      "items": items(world.milk)}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
    assert r.status_code == 422 and r.json()["error"]["code"] == "out_of_zone"


def test_idempotency_key_required(world):
    r = api().post("/api/v1/orders", {"tenant_slug": "shop-a", "address": ADDR, "items": items(world.milk),
                                      "customer_phone": "+998901112233"}, format="json")
    assert r.status_code == 400 and r.json()["error"]["code"] == "idempotency_key_required"


def test_AC03_same_key_twice_gives_one_order(world):
    key = uuid.uuid4()
    r1 = post_order(api(), "shop-a", items(world.milk), key=key)
    r2 = post_order(api(), "shop-a", items(world.milk), key=key)
    assert r1.status_code == r2.status_code == 201
    assert r1.json()["id"] == r2.json()["id"] and r2["Idempotent-Replayed"] == "true"
    assert Order.objects.count() == 1
    assert BranchStock.objects.get(variant=world.milk).reserved_qty == 1       # ikki marta rezerv qilinmagan


def test_idempotency_key_reuse_with_different_body(world):
    key = uuid.uuid4()
    post_order(api(), "shop-a", items(world.milk), key=key)
    r = post_order(api(), "shop-a", items(world.milk, 2), key=key)
    assert r.status_code == 422 and r.json()["error"]["code"] == "idempotency_key_reuse"


@pytest.mark.django_db(transaction=True)
def test_AC02_parallel_last_item_only_one_wins(world):
    res = []
    barrier = threading.Barrier(2)

    def go():
        try:
            barrier.wait()
            res.append(post_order(api(), "shop-a", items(world.bread)).status_code)
        finally:
            connection.close()
    ts = [threading.Thread(target=go) for _ in range(2)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert sorted(res) == [201, 409], res
    assert Order.objects.count() == 1
    st = BranchStock.objects.get(variant=world.bread)
    assert st.reserved_qty == 1 and st.available_qty == 1


@pytest.mark.django_db(transaction=True)
def test_AC03_parallel_same_key(world):
    key, res = uuid.uuid4(), []
    barrier = threading.Barrier(2)

    def go():
        try:
            barrier.wait()
            res.append(post_order(api(), "shop-a", items(world.milk), key=key))
        finally:
            connection.close()
    ts = [threading.Thread(target=go) for _ in range(2)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert {r.status_code for r in res} == {201}
    assert len({r.json()["id"] for r in res}) == 1 and Order.objects.count() == 1


def test_slot_capacity(world):
    s = TimeSlot.objects.create(tenant=world.t, branch=world.b, starts_at=timezone.now() + timedelta(hours=2),
                                ends_at=timezone.now() + timedelta(hours=3), capacity=1)
    assert post_order(api(), "shop-a", items(world.milk), slot_id=str(s.id)).status_code == 201
    r = post_order(api(), "shop-a", items(world.milk), slot_id=str(s.id))
    assert r.status_code == 409 and r.json()["error"]["code"] == "slot_full"
    s.refresh_from_db()
    assert s.booked == 1
    assert BranchStock.objects.get(variant=world.milk).reserved_qty == 1       # muvaffaqiyatsizda rezerv qaytdi (rollback)


def test_state_machine_rejects_invalid_transition(world):
    o = post_order(api(), "shop-a", items(world.milk)).json()
    c = api(world.picker)
    r = c.post(f"/api/v1/partner/orders/{o['id']}/transition", {"to": "completed"}, format="json")
    assert r.status_code == 409
    r = c.post(f"/api/v1/partner/orders/{o['id']}/transition", {"to": "ready"}, format="json")
    assert r.status_code == 409 and r.json()["error"]["code"] == "invalid_transition"
    assert Order.objects.get(id=o["id"]).history.count() == 2    # created + accepted


def test_manual_confirmation_flow_no_customer_msg_until_confirmed(world):
    from apps.platform.models import Notification
    from .conftest import make_tenant, add_product, make_user
    from apps.accounts.models import Role
    t, b = make_tenant("small", "small_shop", manual=True)
    v = add_product(t, b, "S1", 500_000, 10)
    mgr = make_user("+998900000099", Role.BRANCH_MANAGER, t, b)
    o = post_order(api(), "small", items(v)).json()
    assert o["status"] == "pending_confirmation"
    process_outbox()
    assert not Notification.objects.filter(template="order.accepted").exists()
    r = api(mgr).post(f"/api/v1/partner/orders/{o['id']}/transition", {"to": "accepted"}, format="json")
    assert r.status_code == 200
    process_outbox()
    assert Notification.objects.filter(template="order.accepted", order_id=o["id"]).exists()


def test_AC08_cancel_paid_order_releases_reserve_and_creates_refund(world):
    o = post_order(api(), "shop-a", items(world.milk, 2), payment_method="online").json()
    assert o["status"] == "created"
    r = api().post(f"/api/v1/orders/{o['id']}/payments", {}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
                   HTTP_X_TRACKING_TOKEN=o["tracking_token"])
    assert r.status_code == 201, r.content
    pay = Payment.objects.get(order_id=o["id"])
    raw, sig = sign({"event_id": "e1", "type": "payment.paid", "payment_id": str(pay.id), "amount": pay.amount})
    assert api().post("/api/v1/webhooks/payments/mock", raw, content_type="application/json", HTTP_X_SIGNATURE=sig).status_code == 200
    assert Order.objects.get(id=o["id"]).status == "accepted"
    r = api().post(f"/api/v1/orders/{o['id']}/cancel", {"reason": "fikrim o'zgardi"}, format="json", HTTP_X_TRACKING_TOKEN=o["tracking_token"])
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert BranchStock.objects.get(variant=world.milk).reserved_qty == 0
    refund = Refund.objects.get(payment=pay)
    assert refund.amount == pay.amount and refund.state == "approved"
    process_outbox()
    refund.refresh_from_db(); pay.refresh_from_db()
    assert refund.state == "refunded" and pay.status == "refunded"
    from apps.platform.models import Notification
    assert Notification.objects.filter(template="order.cancelled").exists() and Notification.objects.filter(template="refund.refunded").exists()


def test_customer_cannot_cancel_after_preparing(world):
    o = post_order(api(), "shop-a", items(world.milk)).json()
    api(world.picker).post(f"/api/v1/partner/orders/{o['id']}/transition", {"to": "preparing"}, format="json")
    r = api().post(f"/api/v1/orders/{o['id']}/cancel", {}, format="json", HTTP_X_TRACKING_TOKEN=o["tracking_token"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "cancel_not_allowed"


def test_online_reserve_expires(world):
    o = post_order(api(), "shop-a", items(world.milk), payment_method="online").json()
    Order.objects.filter(id=o["id"]).update(reserve_expires_at=timezone.now() - timedelta(minutes=1))
    from apps.orders.services import expire_reservations
    assert expire_reservations() == 1
    assert Order.objects.get(id=o["id"]).status == "cancelled"
    assert BranchStock.objects.get(variant=world.milk).reserved_qty == 0


def test_AC10_weighted_item_within_and_over_consent(world):
    o = post_order(api(), "shop-a", [{"variant_id": str(world.apple.id), "qty": 1}]).json()
    item = o["items"][0]["id"]
    p = api(world.picker)
    r = p.patch(f"/api/v1/picking/orders/{o['id']}/items/{item}", {"action": "pick", "actual_qty": "1.08"}, format="json")
    assert r.status_code == 200 and r.json()["approval_state"] == "none"
    assert r.json()["final_total"] == 1_944_000 + 1_000_000
    r = p.patch(f"/api/v1/picking/orders/{o['id']}/items/{item}", {"action": "pick", "actual_qty": "1.25"}, format="json")
    assert r.json()["approval_state"] == "pending"
    r = p.post(f"/api/v1/partner/orders/{o['id']}/transition", {"to": "ready"}, format="json")
    assert r.status_code == 409 and r.json()["error"]["code"] == "approval_pending"
    r = api().post(f"/api/v1/orders/{o['id']}/approve-changes", {"approve": True}, format="json", HTTP_X_TRACKING_TOKEN=o["tracking_token"])
    assert r.status_code == 200 and r.json()["approval_state"] == "approved"
    r = p.post(f"/api/v1/partner/orders/{o['id']}/transition", {"to": "ready"}, format="json")
    assert r.status_code == 200
    st = BranchStock.objects.get(variant=world.apple)
    assert st.available_qty == Decimal("48.750") and st.reserved_qty == 0


def test_weighted_decline_removes_overweight_line(world):
    o = post_order(api(), "shop-a", [{"variant_id": str(world.apple.id), "qty": 1}, {"variant_id": str(world.milk.id), "qty": 1}]).json()
    ai = next(i for i in o["items"] if i["is_weighted"])["id"]
    api(world.picker).patch(f"/api/v1/picking/orders/{o['id']}/items/{ai}", {"action": "pick", "actual_qty": "1.5"}, format="json")
    r = api().post(f"/api/v1/orders/{o['id']}/approve-changes", {"approve": False}, format="json", HTTP_X_TRACKING_TOKEN=o["tracking_token"])
    d = r.json()
    assert d["approval_state"] == "declined"
    assert next(i for i in d["items"] if i["id"] == ai)["status"] == "removed"
    assert BranchStock.objects.get(variant=world.apple).reserved_qty == 0


def test_AC09_substitution_timeout_applies_preselected_rule(world):
    from apps.orders.services import apply_timeouts
    alt = world.milk
    o = post_order(api(), "shop-a", items(world.bread), substitution_rule="suggest_similar").json()
    item = o["items"][0]["id"]
    r = api(world.picker).patch(f"/api/v1/picking/orders/{o['id']}/items/{item}",
                                {"action": "unavailable", "substitute_variant_id": str(alt.id)}, format="json")
    assert r.json()["items"][0]["status"] == "substitution_proposed"
    from apps.orders.models import OrderItem
    OrderItem.objects.filter(id=item).update(proposal_deadline=timezone.now() - timedelta(seconds=1))
    assert apply_timeouts() >= 1
    it = OrderItem.objects.get(id=item)
    assert it.status == "substituted" and it.substituted_by_id == alt.id
    assert BranchStock.objects.get(variant=world.bread).reserved_qty == 0
    assert BranchStock.objects.get(variant=alt).reserved_qty == 1


def test_substitution_remove_rule_and_customer_decline(world):
    from apps.orders.services import apply_timeouts
    from apps.orders.models import OrderItem
    o = post_order(api(), "shop-a", items(world.bread), substitution_rule="remove").json()
    item = o["items"][0]["id"]
    r = api(world.picker).patch(f"/api/v1/picking/orders/{o['id']}/items/{item}", {"action": "unavailable"}, format="json")
    assert r.json()["items"][0]["status"] == "removed"
    o2 = post_order(api(), "shop-a", items(world.milk), substitution_rule="call_me").json()
    it2 = o2["items"][0]["id"]
    api(world.picker).patch(f"/api/v1/picking/orders/{o2['id']}/items/{it2}",
                            {"action": "unavailable", "substitute_variant_id": str(world.apple.id)}, format="json")
    r = api().post(f"/api/v1/orders/{o2['id']}/approve-changes", {"items": [{"item_id": it2, "accept": False}]}, format="json",
                   HTTP_X_TRACKING_TOKEN=o2["tracking_token"])
    assert OrderItem.objects.get(id=it2).status == "removed"


def test_pick_requires_serial_for_serial_goods(world):
    from .conftest import add_product
    v = add_product(world.t, world.b, "PHONE", 50_000_000, 3, requires_serial=True)
    o = post_order(api(), "shop-a", items(v)).json()
    item = o["items"][0]["id"]
    r = api(world.picker).patch(f"/api/v1/picking/orders/{o['id']}/items/{item}", {"action": "pick"}, format="json")
    assert r.status_code == 400
    r = api(world.picker).patch(f"/api/v1/picking/orders/{o['id']}/items/{item}", {"action": "pick", "serial": "SN-1"}, format="json")
    assert r.status_code == 200 and r.json()["items"][0]["serial_number"] == "SN-1"


def test_sla_alert_for_manual_confirmation(world):
    from apps.orders.services import sla_alerts
    from .conftest import make_tenant, add_product
    t, b = make_tenant("small2", "small_shop", manual=True)
    v = add_product(t, b, "S2", 500_000, 5)
    o = post_order(api(), "small2", items(v)).json()
    Order.objects.filter(id=o["id"]).update(confirm_deadline=timezone.now() - timedelta(seconds=1))
    assert sla_alerts() == 1 and sla_alerts() == 0       # bir marta


def test_stale_pos_forces_manual_confirmation(world):
    BranchStock.objects.filter(variant=world.milk).update(source="pos", synced_at=timezone.now() - timedelta(hours=2))
    o = post_order(api(), "shop-a", items(world.milk)).json()
    assert o["status"] == "pending_confirmation" and o["manual_reason"] == "stale_pos"


def test_restaurant_eta_grows_with_kitchen_load(world):
    from .conftest import make_tenant, add_product
    t, b = make_tenant("kafe", "restaurant")
    v = add_product(t, b, "PL", 3_500_000, 100)
    etas = []
    for _ in range(7):
        etas.append(post_order(api(), "kafe", items(v)).json()["estimated_ready_at"])
    assert etas[0] < etas[-1]


def test_min_order_and_closed_branch(world):
    from apps.tenants.models import DeliveryZone
    DeliveryZone.objects.filter(branch=world.b).update(min_order=10_000_000)
    r = post_order(api(), "shop-a", items(world.milk))
    assert r.status_code == 422 and r.json()["error"]["code"] == "min_order"
    DeliveryZone.objects.filter(branch=world.b).update(min_order=0)
    world.b.working_hours = {d: [["00:00", "00:01"]] for d in ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]}
    world.b.save()
    r = post_order(api(), "shop-a", items(world.milk))
    assert r.status_code == 422 and r.json()["error"]["code"] == "branch_closed"
