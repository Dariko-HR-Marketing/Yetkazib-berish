"""Katalog, CSV, hudud, murojaat, outbox dead-letter, audit o'zgarmasligi."""
import uuid
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.catalog.models import BranchStock
from apps.platform.models import AuditLog, OutboxEvent
from apps.platform.services import emit, handler, process_outbox
from apps.support.models import Ticket
from apps.tenants import geo
from apps.tenants.models import DeliveryZone

from .conftest import ADDR, api, make_user, post_order


def test_csv_import_with_errors_report_and_export_roundtrip(world):
    csv = ("sku,name_uz,name_ru,category,unit,is_weighted,barcode,price,cost,qty,stopped\n"
           "NEW-1,Guruch,Рис,Don,kg,1,111,12000,9000,40,0\n"
           "NEW-2,Yog',Масло,Yog,pcs,0,222,25000.50,20000,10,0\n"
           ",Bo'sh sku,,,,,,1000,,1,0\n"
           "NEW-3,Manfiy,,,pcs,0,,-5,,1,0\n"
           "MILK,Sut yangi nom,,,pcs,0,,15000,,80,0\n")
    c = api(world.owner)
    r = c.post(f"/api/v1/partner/catalog/import?branch_id={world.b.id}", csv, content_type="text/csv")
    assert r.status_code == 207, r.content
    d = r.json()
    assert d["imported"] == 3 and [e["row"] for e in d["errors"]] == [4, 5]
    st = BranchStock.objects.get(variant__sku="NEW-2")
    assert st.price == 2_500_050 and st.source == "csv"
    assert BranchStock.objects.get(variant__sku="MILK").available_qty == 80
    out = c.get(f"/api/v1/partner/catalog/export?branch_id={world.b.id}")
    assert out.status_code == 200 and b"NEW-1" in out.content
    assert api(world.owner_b).post(f"/api/v1/partner/catalog/import?branch_id={world.b.id}", csv, content_type="text/csv").status_code == 404


def test_csv_import_1000_rows_fast(world):
    import time
    rows = ["sku,name_uz,price,qty"] + [f"BULK-{i},Mahsulot {i},{1000 + i},5" for i in range(1000)]
    t0 = time.time()
    r = api(world.owner).post(f"/api/v1/partner/catalog/import?branch_id={world.b.id}", "\n".join(rows), content_type="text/csv")
    assert r.status_code == 200 and r.json()["imported"] == 1000
    assert time.time() - t0 < 60


def test_stock_update_audited_and_cannot_go_below_reserved(world):
    post_order(api(), "shop-a", [{"variant_id": str(world.milk.id), "qty": 5}])
    c = api(world.owner)
    r = c.put(f"/api/v1/partner/branches/{world.b.id}/stock", [{"sku": "MILK", "available_qty": 3}], format="json")
    assert r.status_code == 409
    r = c.put(f"/api/v1/partner/branches/{world.b.id}/stock", [{"sku": "MILK", "price": 1_500_000, "is_stopped": True}], format="json")
    assert r.status_code == 200
    a = AuditLog.objects.filter(entity="branch_stock").latest("id")
    assert a.old_value["price"] == 1_400_000 and a.new_value["price"] == 1_500_000
    # stop-list vitrinada darhol ko'rinadi, buyurtma esa rad etiladi
    cat = api().get(f"/api/v1/storefront/shop-a/branches/{world.b.id}/catalog").json()
    assert next(i for i in cat["items"] if i["sku"] == "MILK")["in_stock"] is False
    assert post_order(api(), "shop-a", [{"variant_id": str(world.milk.id), "qty": 1}]).status_code == 409


def test_catalog_search_and_pagination(world):
    r = api().get(f"/api/v1/storefront/shop-a/branches/{world.b.id}/catalog?q=olma").json()
    assert [i["sku"] for i in r["items"]] == ["APPLE"]
    assert api().get(f"/api/v1/storefront/shop-a/branches/{world.b.id}/catalog").json()["total"] == 3
    assert api().get(f"/api/v1/storefront/shop-b/branches/{world.b.id}/catalog").status_code == 404   # boshqa hamkor filiali


def test_product_crud_uz_ru_names_required_and_unique_sku(world):
    c = api(world.owner)
    r = c.post("/api/v1/partner/products", {"name": {"ru": "x"}, "variants": [{"sku": "Z1"}]}, format="json")
    assert r.status_code == 400
    body = {"name": {"uz": "Choy", "ru": "Чай"}, "variants": [{"sku": "TEA-1", "barcode": "999", "stock": [
        {"branch_id": str(world.b.id), "price": 900_000, "available_qty": 12}]}]}
    r = c.post("/api/v1/partner/products", body, format="json")
    assert r.status_code == 201 and BranchStock.objects.filter(variant__sku="TEA-1").exists()
    assert c.post("/api/v1/partner/products", body, format="json").status_code == 409
    pid = r.json()["id"]
    assert c.patch(f"/api/v1/partner/products/{pid}", {"is_active": False}, format="json").status_code == 200
    assert api(world.owner_b).patch(f"/api/v1/partner/products/{pid}", {"is_active": False}, format="json").status_code == 404
    assert "TEA-1" not in str(api().get(f"/api/v1/storefront/shop-a/branches/{world.b.id}/catalog").json())


def test_polygon_zone_and_alternatives(world):
    poly = [[65.30, 40.05], [65.36, 40.05], [65.36, 40.09], [65.30, 40.09]]
    z = DeliveryZone.objects.create(tenant=world.t2, branch=world.b2, name="P", polygon=poly, delivery_fee=500_000)
    assert geo.point_in_polygon(40.07, 65.33, poly) and not geo.point_in_polygon(40.10, 65.33, poly)
    r = api().get("/api/v1/storefront/shop-b/zones/resolve?lat=40.07&lng=65.33")
    assert r.status_code == 200 and r.json()["zone"]["delivery_fee"] == 500_000
    assert api().get("/api/v1/storefront/shop-b/zones/resolve?lat=41&lng=66").json()["error"]["code"] == "out_of_zone"
    owner = world.owner_b
    r = api(owner).post(f"/api/v1/partner/branches/{world.b2.id}/zones", {"name": "Bad", "delivery_fee": 1}, format="json")
    assert r.status_code == 400


def test_slots_generation_and_listing(world):
    day = (timezone.localdate() + timedelta(days=1)).isoformat()
    r = api(world.owner).post(f"/api/v1/partner/branches/{world.b.id}/slots/generate",
                              {"date": day, "start": "10:00", "end": "13:00", "step_min": 60, "capacity": 2}, format="json")
    assert r.status_code == 201 and r.json()["created"] == 3
    s = api().get(f"/api/v1/storefront/shop-a/branches/{world.b.id}/slots").json()
    assert len(s) == 3 and s[0]["left"] == 2


def test_ticket_linked_to_order_item_and_staff_flow(world):
    o = post_order(api(), "shop-a", [{"variant_id": str(world.milk.id), "qty": 1}]).json()
    item = o["items"][0]["id"]
    r = api().post("/api/v1/support/tickets", {"order_id": o["id"], "order_item_id": item, "type": "damaged", "message": "Qadoq yirtilgan",
                                                 "attachments": ["/media/x.jpg"]}, format="json", HTTP_X_TRACKING_TOKEN=o["tracking_token"])
    assert r.status_code == 201 and r.json()["order_item_id"] == item
    assert api().post("/api/v1/support/tickets", {"order_id": o["id"]}, format="json").status_code == 404
    lst = api(world.support).get("/api/v1/support/tickets").json()
    assert len(lst) == 1 and lst[0]["item_name"]["uz"] == "Sut"
    r = api(world.support).patch(f"/api/v1/support/tickets/{lst[0]['id']}", {"status": "resolved"}, format="json")
    t = Ticket.objects.get()
    assert t.status == "resolved" and t.first_response_at and t.resolved_at
    assert api(world.owner_b).patch(f"/api/v1/support/tickets/{t.id}", {"status": "open"}, format="json").status_code == 404


def test_outbox_retry_backoff_and_dead_letter(world, settings):
    from apps.platform import services as svc
    calls = []

    @handler("test.boom")
    def boom(ev):
        calls.append(ev.id)
        raise RuntimeError("provider down")
    settings.OUTBOX_MAX_ATTEMPTS = 3
    ev = emit("test.boom", "order", uuid.uuid4(), {})
    for i in range(3):
        assert process_outbox() == 1
        ev.refresh_from_db()
        OutboxEvent.objects.filter(id=ev.id).update(next_attempt_at=timezone.now() - timedelta(seconds=1))
    ev.refresh_from_db()
    assert ev.attempts == 3 and ev.dead_lettered_at and ev.sent_at is None and "provider down" in ev.last_error
    assert process_outbox() == 0 and len(calls) == 3
    assert AuditLog.objects.filter(action="dead_letter", entity_id=str(ev.id)).exists()
    svc._handlers.pop("test.boom")


def test_outbox_exponential_delay(world, settings):
    from apps.platform import services as svc

    @handler("test.slow")
    def slow(ev):
        raise RuntimeError("x")
    ev = emit("test.slow", "order", uuid.uuid4(), {})
    process_outbox()
    ev.refresh_from_db()
    d1 = ev.next_attempt_at - timezone.now()
    OutboxEvent.objects.filter(id=ev.id).update(next_attempt_at=timezone.now() - timedelta(seconds=1))
    process_outbox()
    ev.refresh_from_db()
    assert ev.next_attempt_at - timezone.now() > d1
    svc._handlers.pop("test.slow")


def test_audit_log_is_append_only(world):
    post_order(api(), "shop-a", [{"variant_id": str(world.milk.id), "qty": 1}])
    a = AuditLog.objects.first()
    a.action = "tampered"
    with pytest.raises(PermissionError):
        a.save()
    with pytest.raises(PermissionError):
        a.delete()


def test_request_id_header_and_error_shape(world):
    r = api().get("/api/v1/me", HTTP_X_REQUEST_ID="abc123")
    assert r["X-Request-Id"] == "abc123" and r.status_code == 401
    assert r.json()["error"]["request_id"] == "abc123"
    r = api().post("/api/v1/orders", {"tenant_slug": "shop-a"}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), HTTP_ACCEPT_LANGUAGE="ru")
    assert r.status_code == 400
    r = api().get("/api/v1/storefront/shop-a/zones/resolve?lat=0&lng=0", HTTP_ACCEPT_LANGUAGE="ru")
    assert "зоны" in r.json()["error"]["message"]


def test_health_and_telegram_deeplink(world):
    assert api().get("/api/v1/health").json()["status"] == "ok"
    r = api().post("/api/v1/webhooks/telegram", {"message": {"text": f"/start shop-a_{world.b.id}", "chat": {"id": 5}}}, format="json")
    assert r.status_code == 200 and f"t=shop-a" in r.json()["text"] and f"branch={world.b.id}" in r.json()["text"]


def test_reorder_rechecks_price_and_stock(world):
    o = post_order(api(), "shop-a", [{"variant_id": str(world.milk.id), "qty": 2}]).json()
    BranchStock.objects.filter(variant=world.milk).update(price=2_000_000)
    r = api().post(f"/api/v1/orders/{o['id']}/reorder", {}, format="json", HTTP_X_TRACKING_TOKEN=o["tracking_token"]).json()
    assert r["subtotal"] == 4_000_000 and r["problems"] == []
    BranchStock.objects.filter(variant=world.milk).update(available_qty=1, reserved_qty=0)
    r = api().post(f"/api/v1/orders/{o['id']}/reorder", {}, format="json", HTTP_X_TRACKING_TOKEN=o["tracking_token"]).json()
    assert r["problems"][0]["code"] == "out_of_stock"
