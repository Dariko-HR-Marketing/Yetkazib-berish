"""Yordam xizmati, qaytarishlar, moliya solishtiruvi va hamkor hisobotlari (FR-SUP, FR-CS, FR-FIN, FR-PT06)."""
from __future__ import annotations

from datetime import date, datetime, timedelta

from ..core import ApiError, Principal, line_total, not_found
from ..db import Conn, dumps, iso, loads, new_id
from . import catalog
from .common import audit
from .payments import provider

TICKET_TYPES = {"damaged", "missing", "late", "wrong_item", "other"}


def create_ticket(c: Conn, order: dict, data: dict) -> dict:
    if data["type"] not in TICKET_TYPES:
        raise ApiError(422, "bad_type", "Murojaat turi noto'g'ri", {"allowed": sorted(TICKET_TYPES)})
    item_id = data.get("order_item_id")
    if item_id and not c.scalar("SELECT 1 FROM order_items WHERE id = :i AND order_id = :o",
                                {"i": item_id, "o": order["id"]}):
        raise not_found("Buyurtma qatori")
    t = {"id": new_id(), "tenant_id": order["tenant_id"], "order_id": order["id"], "order_item_id": item_id,
         "type": data["type"], "message": data.get("message"), "attachments": dumps(data.get("attachments") or []),
         "status": "open", "assignee_id": None, "first_response_at": None, "resolved_at": None, "created_at": iso()}
    c.insert("tickets", t)
    return {"id": t["id"], "status": "open"}


def list_tickets(c: Conn, tenant_ids: set[str] | None, status: str | None) -> list[dict]:
    rows = c.all("SELECT t.*, o.number AS order_number, o.customer_phone FROM tickets t "
                 "JOIN orders o ON o.id = t.order_id ORDER BY t.created_at DESC LIMIT 200")
    rows = [r for r in rows if (tenant_ids is None or r["tenant_id"] in tenant_ids)
            and (not status or r["status"] == status)]
    for r in rows:
        r["attachments"] = loads(r["attachments"])
    return rows


def update_ticket(c: Conn, ticket_id: str, status: str, actor: Principal, tenant_ids: set[str] | None) -> dict:
    t = c.one("SELECT * FROM tickets WHERE id = :id", {"id": ticket_id})
    if not t or (tenant_ids is not None and t["tenant_id"] not in tenant_ids):
        raise not_found("Murojaat")
    if status not in ("in_progress", "resolved"):
        raise ApiError(422, "bad_status", "status: in_progress | resolved")
    c.execute("UPDATE tickets SET status = :s, assignee_id = :a, "
              "first_response_at = COALESCE(first_response_at, :ts), "
              "resolved_at = CASE WHEN :s = 'resolved' THEN :ts ELSE resolved_at END WHERE id = :id",
              {"s": status, "a": actor.user_id, "ts": iso(), "id": ticket_id})
    return c.one("SELECT * FROM tickets WHERE id = :id", {"id": ticket_id})


def request_refund(c: Conn, order: dict, amount: int, reason: str, actor: Principal) -> dict:
    payment = c.one("SELECT * FROM payments WHERE order_id = :o AND status = 'paid'", {"o": order["id"]})
    if not payment:
        raise ApiError(409, "no_payment", "Bu buyurtma bo'yicha to'lov yo'q")
    already = c.scalar("SELECT COALESCE(SUM(amount), 0) FROM refunds WHERE order_id = :o AND status != 'rejected'",
                       {"o": order["id"]})
    if amount <= 0 or amount + already > payment["amount"]:
        raise ApiError(422, "bad_amount", "Qaytarish summasi to'lovdan oshib ketadi",
                       {"paid": payment["amount"], "already_refunded": already})
    r = {"id": new_id(), "tenant_id": order["tenant_id"], "order_id": order["id"], "payment_id": payment["id"],
         "amount": amount, "reason": reason, "status": "requested", "requested_by": actor.user_id,
         "approved_by": None, "created_at": iso()}
    c.insert("refunds", r)
    audit(c, tenant_id=order["tenant_id"], actor_id=actor.user_id, entity="refund", entity_id=r["id"],
          action="request", new={"amount": amount, "reason": reason})
    return r


def decide_refund(c: Conn, refund_id: str, approve: bool, actor: Principal, tenant_ids: set[str] | None) -> dict:
    r = c.one("SELECT * FROM refunds WHERE id = :id", {"id": refund_id})
    if not r or (tenant_ids is not None and r["tenant_id"] not in tenant_ids):
        raise not_found("Qaytarish")
    if r["status"] != "requested":
        raise ApiError(409, "already_decided", "Qaytarish bo'yicha qaror qabul qilingan")
    payment = c.one("SELECT * FROM payments WHERE id = :p", {"p": r["payment_id"]})
    status = "rejected"
    if approve:
        if payment["provider"] not in ("cash", "pos_terminal"):
            provider().refund(payment, r["amount"])
        status = "refunded"
    c.execute("UPDATE refunds SET status = :s, approved_by = :a WHERE id = :id",
              {"s": status, "a": actor.user_id, "id": refund_id})
    if approve:
        total = c.scalar("SELECT COALESCE(SUM(amount), 0) FROM refunds WHERE order_id = :o AND status = 'refunded'",
                         {"o": r["order_id"]})
        c.execute("UPDATE orders SET payment_status = :s WHERE id = :o",
                  {"s": "refunded" if total >= payment["amount"] else "partially_refunded", "o": r["order_id"]})
    audit(c, tenant_id=r["tenant_id"], actor_id=actor.user_id, entity="refund", entity_id=refund_id,
          action="approve" if approve else "reject")
    return c.one("SELECT * FROM refunds WHERE id = :id", {"id": refund_id})


def _day_bounds(day: str) -> tuple[str, str]:
    d = date.fromisoformat(day)
    start = datetime(d.year, d.month, d.day, tzinfo=catalog.LOCAL_TZ)
    return iso(start), iso(start + timedelta(days=1))


def reconciliation(c: Conn, tenant_id: str, day: str) -> dict:
    """Kun yakuni: buyurtmalar ↔ to'lovlar ↔ qaytarishlar (FR-FIN, 10.1-band)."""
    start, end = _day_bounds(day)
    orders = c.all("SELECT id, number, status, payment_method, payment_status, total, final_total FROM orders "
                   "WHERE tenant_id = :t AND created_at >= :s AND created_at < :e", {"t": tenant_id, "s": start, "e": end})
    issues = []
    paid_sum = refund_sum = cash_sum = 0
    for o in orders:
        pays = c.all("SELECT * FROM payments WHERE order_id = :o AND status = 'paid'", {"o": o["id"]})
        refs = c.all("SELECT * FROM refunds WHERE order_id = :o", {"o": o["id"]})
        paid = sum(p["amount"] for p in pays)
        refunded = sum(r["amount"] for r in refs if r["status"] == "refunded")
        paid_sum += paid
        refund_sum += refunded
        cash_sum += sum(p["amount"] for p in pays if p["provider"] == "cash")
        if len([p for p in pays if p["provider"] not in ("cash", "pos_terminal")]) > 1:
            issues.append({"order": o["number"], "issue": "double_charge"})
        if o["status"] == "completed" and paid == 0:
            issues.append({"order": o["number"], "issue": "completed_without_payment"})
        if o["status"] == "cancelled" and paid > refunded and not any(r["status"] == "requested" for r in refs):
            issues.append({"order": o["number"], "issue": "cancelled_paid_not_refunded"})
        if any(r["status"] == "requested" for r in refs):
            issues.append({"order": o["number"], "issue": "refund_pending_approval"})
    return {"day": day, "orders": len(orders), "paid": paid_sum, "refunded": refund_sum, "cash_collected": cash_sum,
            "net": paid_sum - refund_sum, "issues": issues}


def sales_report(c: Conn, tenant_id: str, day_from: str, day_to: str) -> dict:
    """Hamkor hisoboti: sotuv, o'rtacha chek, bekor sabablari, kanallar (FR-PT06)."""
    start, _ = _day_bounds(day_from)
    _, end = _day_bounds(day_to)
    rows = c.all("SELECT status, channel, cancel_reason, total, final_total, delivery_fee FROM orders "
                 "WHERE tenant_id = :t AND created_at >= :s AND created_at < :e", {"t": tenant_id, "s": start, "e": end})
    done = [r for r in rows if r["status"] == "completed"]
    revenue = sum((r["final_total"] or r["total"]) for r in done)
    channels: dict[str, int] = {}
    reasons: dict[str, int] = {}
    for r in rows:
        channels[r["channel"]] = channels.get(r["channel"], 0) + 1
        if r["status"] == "cancelled":
            reasons[r["cancel_reason"] or "unknown"] = reasons.get(r["cancel_reason"] or "unknown", 0) + 1
    return {"orders_total": len(rows), "orders_completed": len(done), "revenue": revenue,
            "average_check": revenue // len(done) if done else 0, "channels": channels, "cancel_reasons": reasons,
            "cancel_rate_pct": round(100 * sum(reasons.values()) / len(rows), 1) if rows else 0.0}


def rate(c: Conn, order: dict, stars: int) -> None:
    if order["status"] != "completed":
        raise ApiError(409, "not_completed", "Baholash topshirilgandan keyin mumkin")
    if not 1 <= stars <= 5:
        raise ApiError(422, "bad_rating", "Baho 1 dan 5 gacha")
    c.execute("UPDATE orders SET rating = :r WHERE id = :id", {"r": stars, "id": order["id"]})


__all__ = ["line_total"]
