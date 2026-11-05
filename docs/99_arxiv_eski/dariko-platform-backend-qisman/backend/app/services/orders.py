"""Buyurtma yadrosi: savat hisobi, atomar rezerv, holat mashinasi, yig'ish, almashtirish va rozilik.

TZ havolalari: 5.1–5.3 (jarayon va istisnolar), FR-CART, FR-SUB, FR-P01..P03, AC-02, AC-08, AC-09, AC-10.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import timedelta

from ..config import settings
from ..core import ApiError, Principal, line_total, not_found
from ..db import Conn, dumps, iso, loads, new_id, now
from . import catalog
from .common import audit, emit, for_update

# Holat mashinasi (TZ 5.2). Kalit — joriy holat, qiymat — {amal: yangi holat}.
TRANSITIONS: dict[str, dict[str, str]] = {
    "pending_confirmation": {"accept": "accepted", "reject": "cancelled", "cancel": "cancelled"},
    "accepted": {"start_preparing": "preparing", "cancel": "cancelled"},
    "preparing": {"mark_ready": "ready", "cancel": "cancelled"},
    "ready": {"pick_up": "in_delivery", "cancel": "cancelled"},
    "in_delivery": {"deliver": "completed", "return": "cancelled"},
}
CUSTOMER_CANCELLABLE = {"pending_confirmation", "accepted"}
STAFF_ORDER_ROLES = ("tenant_owner", "branch_manager", "picker", "support")


# ---------------------------------------------------------------- savat
def quote(c: Conn, tenant_id: str, data: dict) -> dict:
    zone, branch = catalog.resolve_zone(c, tenant_id, data["address"]["lat"], data["address"]["lon"])
    if data.get("branch_id") and data["branch_id"] != branch["id"]:
        raise ApiError(422, "branch_zone_mismatch", "Manzil tanlangan filial hududiga tushmaydi")
    if not data["items"]:
        raise ApiError(422, "empty_cart", "Savat bo'sh")
    lines, subtotal, warnings = [], 0, []
    for it in data["items"]:
        row = c.one("SELECT s.price, s.available_qty, s.reserved_qty, s.is_stopped, p.name, p.unit, p.is_weighted "
                    "FROM branch_stock s JOIN product_variants v ON v.id = s.variant_id "
                    "JOIN products p ON p.id = v.product_id "
                    "WHERE s.branch_id = :b AND s.variant_id = :v AND s.tenant_id = :t AND p.is_active",
                    {"b": branch["id"], "v": it["variant_id"], "t": tenant_id})
        if not row:
            raise ApiError(422, "unknown_item", "Mahsulot bu filialda yo'q", {"variant_id": it["variant_id"]})
        qty = int(it["qty_milli"])
        if qty <= 0 or (not row["is_weighted"] and qty % 1000):
            raise ApiError(422, "bad_quantity", "Miqdor noto'g'ri", {"variant_id": it["variant_id"]})
        if row["is_stopped"] or row["available_qty"] - row["reserved_qty"] < qty:
            warnings.append({"code": "out_of_stock", "variant_id": it["variant_id"]})
        total = line_total(row["price"], qty)
        subtotal += total
        lines.append({"variant_id": it["variant_id"], "name": loads(row["name"]), "unit": row["unit"],
                      "is_weighted": bool(row["is_weighted"]), "unit_price": row["price"], "qty_milli": qty,
                      "line_total": total, "substitution_rule": it.get("substitution_rule")})
    fee = catalog.delivery_fee(zone, subtotal)
    if subtotal < zone["min_order"]:
        warnings.append({"code": "below_min_order", "min_order": zone["min_order"]})
    return {"branch": branch, "zone": zone, "lines": lines, "subtotal": subtotal, "delivery_fee": fee,
            "discount": 0, "total": subtotal + fee, "warnings": warnings}


def public_quote(q: dict) -> dict:
    return {"branch_id": q["branch"]["id"], "subtotal": q["subtotal"], "delivery_fee": q["delivery_fee"],
            "discount": q["discount"], "total": q["total"], "min_order": q["zone"]["min_order"],
            "lines": [{k: v for k, v in ln.items() if k != "name"} | {"name": ln["name"].get("uz")}
                      for ln in q["lines"]],
            "warnings": q["warnings"]}


# ---------------------------------------------------------------- yaratish
def _order_number(c: Conn) -> str:
    for _ in range(5):
        number = f"A-{secrets.randbelow(900000) + 100000}"
        if not c.scalar("SELECT 1 FROM orders WHERE number = :n", {"n": number}):
            return number
    raise ApiError(500, "number_generation", "Buyurtma raqamini yaratib bo'lmadi")


def delivery_pin(order_id: str) -> str:
    """Topshirish PIN-kodi bazada saqlanmaydi: maxfiy kalit va buyurtma ID dan hisoblanadi."""
    digest = hmac.new(settings.jwt_secret.encode(), f"pin:{order_id}".encode(), hashlib.sha256).hexdigest()
    return f"{int(digest[:8], 16) % 10000:04d}"


def create_order(c: Conn, tenant: dict, data: dict, customer: Principal | None) -> dict:
    q = quote(c, tenant["id"], data)
    branch = q["branch"]
    if any(w["code"] == "below_min_order" for w in q["warnings"]):
        raise ApiError(422, "below_min_order", "Savat minimal summadan kam",
                       {"min_order": q["zone"]["min_order"]})
    if not data.get("slot_id") and not catalog.is_open(branch, now()):
        raise ApiError(422, "branch_closed", "Filial hozir yopiq — yetkazish vaqtini tanlang")

    # 1) Vaqt oralig'i sig'imi — shartli UPDATE, raqobatda faqat sig'im doirasida o'tadi.
    if data.get("slot_id"):
        ok = c.execute("UPDATE time_slots SET booked = booked + 1 WHERE id = :s AND branch_id = :b "
                       "AND booked < capacity", {"s": data["slot_id"], "b": branch["id"]})
        if not ok:
            raise ApiError(409, "slot_full", "Tanlangan vaqt oralig'i to'lgan")

    # 2) Qoldiqni atomar band qilish (AC-02). Bitta qator ham o'tmasa — butun tranzaksiya bekor.
    for ln in q["lines"]:
        ok = c.execute("UPDATE branch_stock SET reserved_qty = reserved_qty + :q "
                       "WHERE branch_id = :b AND variant_id = :v AND NOT is_stopped "
                       "AND available_qty - reserved_qty >= :q",
                       {"q": ln["qty_milli"], "b": branch["id"], "v": ln["variant_id"]})
        if not ok:
            raise ApiError(409, "out_of_stock", "Mahsulot yetarli emas", {"variant_id": ln["variant_id"]})

    order_id, ts = new_id(), iso()
    online = data["payment_method"] == "online"
    order = {
        "id": order_id, "number": _order_number(c), "tenant_id": tenant["id"], "branch_id": branch["id"],
        "customer_id": customer.user_id if customer else None, "customer_phone": data["phone"],
        "address": dumps(data["address"]), "slot_id": data.get("slot_id"),
        "status": "pending_confirmation", "payment_status": "pending", "version": 1,
        "channel": data.get("channel") or "web", "utm": dumps(data.get("utm") or {}),
        "payment_method": data["payment_method"],
        "substitution_rule": data.get("substitution_rule") or "suggest_similar",
        "consent_increase_pct": int(data.get("consent_increase_pct") or settings.consent_increase_pct_default),
        "subtotal": q["subtotal"], "delivery_fee": q["delivery_fee"], "discount": q["discount"],
        "total": q["total"], "final_total": None, "approval_requested_at": None,
        "reserve_expires_at": iso(now() + timedelta(minutes=settings.reserve_ttl_minutes)) if online else None,
        "comment": data.get("comment"), "cancel_reason": None,
        "tracking_token": secrets.token_urlsafe(24),
        "tracking_expires_at": iso(now() + timedelta(hours=settings.tracking_token_hours)),
        "rating": None, "created_at": ts, "updated_at": ts,
    }
    c.insert("orders", order)
    for line_no, ln in enumerate(q["lines"], start=1):
        c.insert("order_items", {
            "id": new_id(), "tenant_id": tenant["id"], "order_id": order_id, "line_no": line_no,
            "variant_id": ln["variant_id"],
            "name": dumps(ln["name"]), "unit": ln["unit"], "is_weighted": ln["is_weighted"],
            "unit_price": ln["unit_price"], "requested_qty": ln["qty_milli"], "actual_qty": None,
            "substitution_rule": ln["substitution_rule"], "substituted_by": None, "status": "pending",
        })
    _history(c, order_id, None, "pending_confirmation", customer.user_id if customer else None, "created")
    emit(c, tenant_id=tenant["id"], aggregate_type="order", aggregate_id=order_id, event_type="order.created",
         payload={"number": order["number"], "phone": order["customer_phone"],
                  "tracking_token": order["tracking_token"], "total": order["total"]})
    if not online and not branch["manual_confirm"]:
        _apply(c, order, "accept", actor_id=None, reason="auto")  # avtomatik tasdiq (supermarket, restoran)
    return load_order(c, order_id)


# ---------------------------------------------------------------- o'qish
def load_order(c: Conn, order_id: str, tenant_ids: set[str] | None = None) -> dict:
    o = c.one("SELECT * FROM orders WHERE id = :id", {"id": order_id})
    if not o or (tenant_ids is not None and o["tenant_id"] not in tenant_ids):
        raise not_found("Buyurtma")
    o["address"] = loads(o["address"])
    o["utm"] = loads(o["utm"])
    o["items"] = []
    for it in c.all("SELECT * FROM order_items WHERE order_id = :id ORDER BY line_no", {"id": order_id}):
        it["name"] = loads(it["name"]).get("uz")
        it["is_weighted"] = bool(it["is_weighted"])
        if it["substituted_by"]:
            sub = c.one("SELECT p.name FROM product_variants v JOIN products p ON p.id = v.product_id "
                        "WHERE v.id = :v", {"v": it["substituted_by"]})
            it["substitute_name"] = loads(sub["name"]).get("uz") if sub else None
        o["items"].append(it)
    o["requires_customer_approval"] = o["approval_requested_at"] is not None
    return o


def public_order(o: dict) -> dict:
    hidden = {"tracking_token", "tracking_expires_at", "utm"}
    return {k: v for k, v in o.items() if k not in hidden}


def get_by_token(c: Conn, token: str) -> dict:
    o = c.one("SELECT id, tracking_expires_at FROM orders WHERE tracking_token = :t", {"t": token})
    if not o:
        raise not_found("Buyurtma")
    if o["tracking_expires_at"] < iso():
        raise ApiError(410, "token_expired", "Kuzatuv havolasi muddati tugagan")
    return load_order(c, o["id"])


# ---------------------------------------------------------------- holat o'tishlari
def _history(c: Conn, order_id: str, frm: str | None, to: str, actor: str | None, reason: str | None) -> None:
    c.insert("order_status_history", {"order_id": order_id, "from_status": frm, "to_status": to,
                                      "actor_id": actor, "reason": reason, "created_at": iso()})


def _apply(c: Conn, order: dict, action: str, *, actor_id: str | None, reason: str | None = None,
           expected_version: int | None = None) -> str:
    allowed = TRANSITIONS.get(order["status"], {})
    if action not in allowed:
        raise ApiError(409, "invalid_transition", f"'{order['status']}' holatida '{action}' amali ruxsat etilmagan",
                       {"status": order["status"], "allowed": sorted(allowed)})
    if expected_version is not None and expected_version != order["version"]:
        raise ApiError(409, "version_conflict", "Buyurtma boshqa foydalanuvchi tomonidan o'zgartirilgan",
                       {"version": order["version"]})
    new_status = allowed[action]
    ok = c.execute("UPDATE orders SET status = :s, version = version + 1, updated_at = :ts, "
                   "cancel_reason = CASE WHEN :s = 'cancelled' THEN :r ELSE cancel_reason END "
                   "WHERE id = :id AND version = :v",
                   {"s": new_status, "ts": iso(), "r": reason, "id": order["id"], "v": order["version"]})
    if not ok:
        raise ApiError(409, "version_conflict", "Buyurtma parallel o'zgartirildi, qayta urinib ko'ring")
    _history(c, order["id"], order["status"], new_status, actor_id, reason)
    order["version"] += 1
    previous, order["status"] = order["status"], new_status
    if new_status == "cancelled":
        _on_cancel(c, order, previous, actor_id, reason)
    elif new_status == "completed":
        _on_complete(c, order)
    elif new_status == "ready":
        from . import delivery

        delivery.create_shipment(c, order)
    emit(c, tenant_id=order["tenant_id"], aggregate_type="order", aggregate_id=order["id"],
         event_type=f"order.{new_status}",
         payload={"number": order["number"], "phone": order["customer_phone"],
                  "tracking_token": order["tracking_token"], "reason": reason})
    return new_status


def transition(c: Conn, order_id: str, action: str, *, actor: Principal | None, reason: str | None = None,
               expected_version: int | None = None) -> dict:
    order = c.one(f"SELECT * FROM orders WHERE id = :id{for_update(c)}", {"id": order_id})
    if not order:
        raise not_found("Buyurtma")
    if action == "mark_ready" and order["approval_requested_at"]:
        raise ApiError(409, "awaiting_customer", "Xaridor tasdig'i kutilmoqda")
    if action == "mark_ready":
        pending = c.scalar("SELECT COUNT(*) FROM order_items WHERE order_id = :id AND status = 'pending'",
                           {"id": order_id})
        if pending:
            raise ApiError(409, "picking_incomplete", "Barcha mahsulotlar yig'ilmagan", {"pending": pending})
    _apply(c, order, action, actor_id=actor.user_id if actor else None, reason=reason,
           expected_version=expected_version)
    return load_order(c, order_id)


def _release_reservations(c: Conn, order_id: str, branch_id: str) -> None:
    for it in c.all("SELECT variant_id, requested_qty FROM order_items WHERE order_id = :id", {"id": order_id}):
        c.execute("UPDATE branch_stock SET reserved_qty = CASE WHEN reserved_qty >= :q THEN reserved_qty - :q "
                  "ELSE 0 END WHERE branch_id = :b AND variant_id = :v",
                  {"q": it["requested_qty"], "b": branch_id, "v": it["variant_id"]})


def _on_cancel(c: Conn, order: dict, previous: str, actor_id: str | None, reason: str | None) -> None:
    """Bekor qilish: rezerv va slot bo'shaydi, to'lov bo'lsa qaytarish yoziladi (AC-08)."""
    _release_reservations(c, order["id"], order["branch_id"])
    if order["slot_id"]:
        c.execute("UPDATE time_slots SET booked = booked - 1 WHERE id = :s AND booked > 0", {"s": order["slot_id"]})
    payment = c.one("SELECT * FROM payments WHERE order_id = :o AND status = 'paid'", {"o": order["id"]})
    if payment:
        c.insert("refunds", {"id": new_id(), "tenant_id": order["tenant_id"], "order_id": order["id"],
                             "payment_id": payment["id"], "amount": payment["amount"],
                             "reason": reason or "order_cancelled", "status": "requested",
                             "requested_by": actor_id, "approved_by": None, "created_at": iso()})
        c.execute("UPDATE orders SET payment_status = 'refunding' WHERE id = :id", {"id": order["id"]})
    else:
        c.execute("UPDATE payments SET status = 'failed' WHERE order_id = :o AND status = 'pending'",
                  {"o": order["id"]})
        c.execute("UPDATE orders SET payment_status = 'failed' WHERE id = :id AND payment_status = 'pending'",
                  {"id": order["id"]})


def _on_complete(c: Conn, order: dict) -> None:
    """Topshirildi: rezerv yechiladi va haqiqiy sotilgan miqdor qoldiqdan ayriladi."""
    for it in c.all("SELECT * FROM order_items WHERE order_id = :id", {"id": order["id"]}):
        c.execute("UPDATE branch_stock SET reserved_qty = CASE WHEN reserved_qty >= :q THEN reserved_qty - :q "
                  "ELSE 0 END WHERE branch_id = :b AND variant_id = :v",
                  {"q": it["requested_qty"], "b": order["branch_id"], "v": it["variant_id"]})
        if it["status"] == "removed":
            continue
        sold_variant = it["substituted_by"] or it["variant_id"]
        sold = it["actual_qty"] if it["actual_qty"] is not None else it["requested_qty"]
        c.execute("UPDATE branch_stock SET available_qty = CASE WHEN available_qty - :q >= reserved_qty "
                  "THEN available_qty - :q ELSE reserved_qty END WHERE branch_id = :b AND variant_id = :v",
                  {"q": sold, "b": order["branch_id"], "v": sold_variant})
    if order["payment_method"] != "online":
        c.execute("UPDATE orders SET payment_status = 'paid' WHERE id = :id", {"id": order["id"]})
        c.insert("payments", {"id": new_id(), "tenant_id": order["tenant_id"], "order_id": order["id"],
                              "provider": "cash" if order["payment_method"] == "cash_on_delivery" else "pos_terminal",
                              "external_txn_id": None, "amount": _final_or_total(c, order["id"]),
                              "status": "paid", "created_at": iso(), "paid_at": iso()})


def _final_or_total(c: Conn, order_id: str) -> int:
    row = c.one("SELECT final_total, total FROM orders WHERE id = :id", {"id": order_id})
    return row["final_total"] if row["final_total"] is not None else row["total"]


def customer_cancel(c: Conn, token: str, reason: str | None) -> dict:
    o = get_by_token(c, token)
    if o["status"] not in CUSTOMER_CANCELLABLE:
        raise ApiError(409, "invalid_transition", "Buyurtma tayyorlanmoqda — bekor qilish uchun operatorga murojaat qiling")
    row = c.one(f"SELECT * FROM orders WHERE id = :id{for_update(c)}", {"id": o["id"]})
    _apply(c, row, "cancel", actor_id=None, reason=reason or "customer_cancelled")
    return load_order(c, o["id"])


# ---------------------------------------------------------------- yig'ish va rozilik
def _recalculate(c: Conn, order: dict) -> int:
    total = 0
    for it in c.all("SELECT * FROM order_items WHERE order_id = :id", {"id": order["id"]}):
        if it["status"] == "removed":
            continue
        qty = it["actual_qty"] if it["actual_qty"] is not None else it["requested_qty"]
        total += line_total(it["unit_price"], qty)
    fee = order["delivery_fee"]
    return total + fee - order["discount"]


def pick_item(c: Conn, order_id: str, item_id: str, data: dict, actor: Principal) -> dict:
    """Yig'uvchi natijasi: picked (haqiqiy vazn bilan), substituted yoki removed (FR-PK)."""
    order = c.one(f"SELECT * FROM orders WHERE id = :id{for_update(c)}", {"id": order_id})
    if not order:
        raise not_found("Buyurtma")
    if order["status"] != "preparing":
        raise ApiError(409, "invalid_state", "Yig'ish faqat 'preparing' holatida mumkin")
    item = c.one("SELECT * FROM order_items WHERE id = :i AND order_id = :o", {"i": item_id, "o": order_id})
    if not item:
        raise not_found("Buyurtma qatori")
    result = data["result"]
    needs_approval = False
    if result == "picked":
        qty = int(data.get("actual_qty_milli") or item["requested_qty"])
        if not item["is_weighted"] and qty != item["requested_qty"]:
            raise ApiError(422, "bad_quantity", "Donali mahsulotda miqdor o'zgarmaydi — 'removed' yoki muqobil tanlang")
        c.execute("UPDATE order_items SET status = 'picked', actual_qty = :q WHERE id = :i", {"q": qty, "i": item_id})
    elif result == "substituted":
        sub = c.one("SELECT s.price, p.is_weighted FROM branch_stock s JOIN product_variants v ON v.id = s.variant_id "
                    "JOIN products p ON p.id = v.product_id WHERE s.branch_id = :b AND s.variant_id = :v",
                    {"b": order["branch_id"], "v": data.get("substitute_variant_id")})
        if not sub:
            raise ApiError(422, "unknown_substitute", "Muqobil mahsulot filialda topilmadi")
        qty = int(data.get("actual_qty_milli") or item["requested_qty"])
        c.execute("UPDATE order_items SET status = 'substituted', substituted_by = :s, unit_price = :p, "
                  "actual_qty = :q WHERE id = :i",
                  {"s": data["substitute_variant_id"], "p": sub["price"], "q": qty, "i": item_id})
        needs_approval = True  # muqobil har doim xaridorga yuboriladi (TZ 5.3)
    elif result == "removed":
        c.execute("UPDATE order_items SET status = 'removed', actual_qty = 0 WHERE id = :i", {"i": item_id})
    else:
        raise ApiError(422, "bad_result", "result: picked | substituted | removed")

    final_total = _recalculate(c, order)
    limit = order["total"] * (100 + order["consent_increase_pct"]) // 100
    if final_total > limit:
        needs_approval = True  # rozilik chegarasidan oshdi (AC-10)
    c.execute("UPDATE orders SET final_total = :f, version = version + 1, updated_at = :ts, "
              "approval_requested_at = CASE WHEN :need THEN :ts ELSE approval_requested_at END WHERE id = :id",
              {"f": final_total, "ts": iso(), "need": needs_approval, "id": order_id})
    audit(c, tenant_id=order["tenant_id"], actor_id=actor.user_id, entity="order_item", entity_id=item_id,
          action=f"pick:{result}", new={"actual_qty": data.get("actual_qty_milli"), "final_total": final_total})
    if needs_approval:
        emit(c, tenant_id=order["tenant_id"], aggregate_type="order", aggregate_id=order_id,
             event_type="order.approval_required",
             payload={"number": order["number"], "phone": order["customer_phone"],
                      "tracking_token": order["tracking_token"], "final_total": final_total})
    return load_order(c, order_id)


def _resolve_approval(c: Conn, order: dict, approved: bool, reason: str) -> None:
    if not approved:
        # Rad etildi: muqobillar olib tashlanadi, chegaradan oshgan tarozili qatorlar qayta tortiladi.
        c.execute("UPDATE order_items SET status = 'removed', actual_qty = 0 "
                  "WHERE order_id = :o AND status = 'substituted'", {"o": order["id"]})
        for it in c.all("SELECT * FROM order_items WHERE order_id = :o AND is_weighted AND status = 'picked'",
                        {"o": order["id"]}):
            if it["actual_qty"] and it["actual_qty"] > it["requested_qty"]:
                c.execute("UPDATE order_items SET status = 'pending', actual_qty = NULL WHERE id = :i",
                          {"i": it["id"]})
    final_total = _recalculate(c, order)
    c.execute("UPDATE orders SET approval_requested_at = NULL, final_total = :f, version = version + 1, "
              "updated_at = :ts WHERE id = :id", {"f": final_total, "ts": iso(), "id": order["id"]})
    _history(c, order["id"], order["status"], order["status"], None, reason)


def approve_changes(c: Conn, token: str, version: int, approved: bool) -> dict:
    o = get_by_token(c, token)
    if not o["approval_requested_at"]:
        raise ApiError(409, "nothing_to_approve", "Tasdiqlash uchun o'zgarish yo'q")
    if version != o["version"]:
        raise ApiError(409, "version_conflict", "Buyurtma yangilangan — sahifani yangilang", {"version": o["version"]})
    _resolve_approval(c, o, approved, "customer_approved" if approved else "customer_rejected")
    return load_order(c, o["id"])


# ---------------------------------------------------------------- fon vazifalari
def apply_approval_timeouts(c: Conn) -> int:
    """Xaridor javob bermasa, oldindan tanlangan qoida qo'llanadi (AC-09)."""
    cutoff = iso(now() - timedelta(seconds=settings.substitution_reply_seconds))
    rows = c.all("SELECT * FROM orders WHERE approval_requested_at IS NOT NULL AND approval_requested_at <= :c",
                 {"c": cutoff})
    for o in rows:
        accept_subs = o["substitution_rule"] == "suggest_similar"
        if accept_subs:
            # Muqobillar qabul qilinadi, ammo rozilik chegarasidan oshgan vazn baribir qayta tortiladi.
            for it in c.all("SELECT * FROM order_items WHERE order_id = :o AND is_weighted AND status = 'picked'",
                            {"o": o["id"]}):
                if it["actual_qty"] and it["actual_qty"] > it["requested_qty"]:
                    limit = o["total"] * (100 + o["consent_increase_pct"]) // 100
                    if _recalculate(c, o) > limit:
                        c.execute("UPDATE order_items SET status = 'pending', actual_qty = NULL WHERE id = :i",
                                  {"i": it["id"]})
            _resolve_approval(c, o, True, "timeout_rule_applied")
        else:
            _resolve_approval(c, o, False, "timeout_rule_applied")
    return len(rows)


def expire_unpaid(c: Conn) -> int:
    """To'lanmagan onlayn buyurtmalar rezerv muddati o'tgach bekor qilinadi (TZ 7.6-3)."""
    rows = c.all("SELECT * FROM orders WHERE payment_method = 'online' AND payment_status = 'pending' "
                 "AND status = 'pending_confirmation' AND reserve_expires_at <= :n", {"n": iso()})
    for o in rows:
        _apply(c, o, "cancel", actor_id=None, reason="payment_timeout")
    return len(rows)


def staff_orders(c: Conn, tenant_id: str, branch_id: str, status: str | None) -> list[dict]:
    sql = ("SELECT id, number, status, payment_status, payment_method, total, final_total, customer_phone, "
           "approval_requested_at, slot_id, created_at, version FROM orders WHERE tenant_id = :t AND branch_id = :b")
    params = {"t": tenant_id, "b": branch_id}
    if status:
        sql += " AND status = :s"
        params["s"] = status
    sql += " ORDER BY created_at DESC LIMIT 200"
    return c.all(sql, params)
