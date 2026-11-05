"""Yetkazish: jo'natma, dispetcherlik, kuryer holatlari, topshirish dalili (FR-DSP, FR-CR, FR-POD, AC-05, AC-07)."""
from __future__ import annotations

from datetime import timedelta

from ..core import ApiError, Principal, forbidden, not_found
from ..db import Conn, iso, loads, new_id, now
from .common import audit, emit, for_update

COURIER_FLOW = {"assigned": "picked_up", "picked_up": "on_the_way", "on_the_way": "delivered"}
FAILURE_REASONS = {"no_answer", "wrong_address", "refused", "damaged", "other"}


def create_shipment(c: Conn, order: dict) -> None:
    if c.scalar("SELECT 1 FROM shipments WHERE order_id = :o", {"o": order["id"]}):
        return
    ts = iso()
    c.insert("shipments", {"id": new_id(), "tenant_id": order["tenant_id"], "order_id": order["id"],
                           "courier_id": None, "provider": "own", "vehicle_type": None, "status": "created",
                           "pod_type": None, "pod_url": None, "failure_reason": None, "contact_attempts": 0,
                           "eta": None, "created_at": ts, "updated_at": ts})


def mask_phone(phone: str) -> str:
    return phone[:6] + "***" + phone[-4:] if len(phone) > 10 else "***"


def _view(c: Conn, s: dict, for_courier: bool) -> dict:
    o = c.one("SELECT number, address, customer_phone, branch_id, final_total, total, payment_method, "
              "payment_status, comment FROM orders WHERE id = :o", {"o": s["order_id"]})
    branch = c.one("SELECT name, address, lat, lon FROM branches WHERE id = :b", {"b": o["branch_id"]})
    courier = c.one("SELECT full_name, phone FROM users WHERE id = :u", {"u": s["courier_id"]}) if s["courier_id"] else None
    hide = for_courier and s["status"] in ("delivered", "returned")
    to_collect = 0 if o["payment_status"] == "paid" else (o["final_total"] or o["total"])
    return {**s, "order_number": o["number"], "address": loads(o["address"]), "comment": o["comment"],
            "customer_phone": mask_phone(o["customer_phone"]) if hide else o["customer_phone"],
            "branch": branch, "courier": courier, "payment_method": o["payment_method"],
            "amount_to_collect": to_collect}


def list_shipments(c: Conn, p: Principal, status: str | None) -> list[dict]:
    if p.has("dispatcher", "tenant_owner", "platform_admin", "support"):
        tenants = None if p.is_admin else p.tenant_ids()
        rows = c.all("SELECT * FROM shipments ORDER BY created_at DESC LIMIT 200")
        rows = [r for r in rows if tenants is None or r["tenant_id"] in tenants]
        courier_view = False
    elif p.has("courier"):
        rows = c.all("SELECT * FROM shipments WHERE courier_id = :u ORDER BY created_at DESC LIMIT 100",
                     {"u": p.user_id})
        courier_view = True
    else:
        raise forbidden()
    if status:
        rows = [r for r in rows if r["status"] == status]
    return [_view(c, r, courier_view) for r in rows]


def couriers(c: Conn, tenant_id: str) -> list[dict]:
    rows = c.all("SELECT DISTINCT u.id, u.full_name, u.phone FROM users u JOIN user_roles r ON r.user_id = u.id "
                 "WHERE r.role = 'courier' AND r.tenant_id = :t", {"t": tenant_id})
    for r in rows:
        r["active_jobs"] = c.scalar("SELECT COUNT(*) FROM shipments WHERE courier_id = :u "
                                    "AND status IN ('assigned','picked_up','on_the_way')", {"u": r["id"]})
    return rows


def _shipment(c: Conn, shipment_id: str) -> dict:
    s = c.one(f"SELECT * FROM shipments WHERE id = :id{for_update(c)}", {"id": shipment_id})
    if not s:
        raise not_found("Jo'natma")
    return s


def assign(c: Conn, shipment_id: str, courier_id: str, vehicle_type: str | None, actor: Principal) -> dict:
    s = _shipment(c, shipment_id)
    if not actor.can_access_branch(s["tenant_id"], None, ("dispatcher", "tenant_owner")):
        raise not_found("Jo'natma")
    if s["status"] not in ("created", "assigned", "failed"):
        raise ApiError(409, "invalid_transition", "Jo'natma allaqachon yo'lda yoki yopilgan")
    is_courier = c.scalar("SELECT 1 FROM user_roles WHERE user_id = :u AND role = 'courier' AND tenant_id = :t",
                          {"u": courier_id, "t": s["tenant_id"]})
    if not is_courier:
        raise ApiError(422, "not_a_courier", "Tanlangan foydalanuvchi bu hamkor kuryeri emas")
    c.execute("UPDATE shipments SET courier_id = :c, vehicle_type = :v, status = 'assigned', failure_reason = NULL, "
              "eta = :eta, updated_at = :ts WHERE id = :id",
              {"c": courier_id, "v": vehicle_type, "eta": iso(now() + timedelta(minutes=40)), "ts": iso(),
               "id": shipment_id})
    audit(c, tenant_id=s["tenant_id"], actor_id=actor.user_id, entity="shipment", entity_id=shipment_id,
          action="assign", old={"courier_id": s["courier_id"]}, new={"courier_id": courier_id})
    return _view(c, _shipment(c, shipment_id), False)


def courier_update(c: Conn, shipment_id: str, data: dict, actor: Principal) -> dict:
    from . import orders

    s = _shipment(c, shipment_id)
    if s["courier_id"] != actor.user_id:
        raise not_found("Jo'natma")  # kuryer faqat o'z topshirig'ini ko'radi (AC-05)
    target = data["status"]
    if target == "failed":
        reason = data.get("failure_reason")
        if reason not in FAILURE_REASONS:
            raise ApiError(422, "failure_reason_required", "Muvaffaqiyatsizlik sababi majburiy",
                           {"allowed": sorted(FAILURE_REASONS)})
        if s["status"] not in ("picked_up", "on_the_way"):
            raise ApiError(409, "invalid_transition", "Faqat yo'ldagi jo'natma muvaffaqiyatsiz deb belgilanadi")
        c.execute("UPDATE shipments SET status = 'failed', failure_reason = :r, contact_attempts = contact_attempts + 1, "
                  "updated_at = :ts WHERE id = :id", {"r": reason, "ts": iso(), "id": shipment_id})
        emit(c, tenant_id=s["tenant_id"], aggregate_type="shipment", aggregate_id=shipment_id,
             event_type="shipment.failed", payload={"reason": reason, "order_id": s["order_id"]})
        return _view(c, _shipment(c, shipment_id), True)

    if COURIER_FLOW.get(s["status"]) != target:
        raise ApiError(409, "invalid_transition", f"'{s['status']}' dan '{target}' ga o'tib bo'lmaydi")
    pod_type = None
    if target == "delivered":
        pin, photo = data.get("pin"), data.get("pod_photo_url")
        if pin:
            if pin != orders.delivery_pin(s["order_id"]):
                raise ApiError(422, "wrong_pin", "PIN-kod noto'g'ri")
            pod_type = "pin"
        elif photo:
            pod_type = "photo"  # eshik oldida qoldirish — faqat xaridor ruxsat bergan bo'lsa (FR-POD)
        else:
            raise ApiError(422, "pod_required", "PIN-kod yoki surat majburiy")
    c.execute("UPDATE shipments SET status = :s, pod_type = COALESCE(:pt, pod_type), "
              "pod_url = COALESCE(:pu, pod_url), updated_at = :ts WHERE id = :id",
              {"s": target, "pt": pod_type, "pu": data.get("pod_photo_url"), "ts": iso(), "id": shipment_id})
    if target == "picked_up":
        orders.transition(c, s["order_id"], "pick_up", actor=actor)
    elif target == "delivered":
        orders.transition(c, s["order_id"], "deliver", actor=actor)
    return _view(c, _shipment(c, shipment_id), True)


def resolve_failed(c: Conn, shipment_id: str, action: str, actor: Principal) -> dict:
    """Qabul qiluvchi topilmadi: mas'ul xodim qayta yetkazish yoki qaytarishni tanlaydi (TZ 5.3)."""
    from . import orders

    s = _shipment(c, shipment_id)
    if not actor.can_access_branch(s["tenant_id"], None, ("dispatcher", "support", "tenant_owner")):
        raise not_found("Jo'natma")
    if s["status"] != "failed":
        raise ApiError(409, "invalid_transition", "Jo'natma muvaffaqiyatsiz holatda emas")
    if action == "retry":
        c.execute("UPDATE shipments SET status = 'on_the_way', updated_at = :ts WHERE id = :id",
                  {"ts": iso(), "id": shipment_id})
    elif action == "return":
        c.execute("UPDATE shipments SET status = 'returned', updated_at = :ts WHERE id = :id",
                  {"ts": iso(), "id": shipment_id})
        orders.transition(c, s["order_id"], "return", actor=actor, reason=f"delivery_failed:{s['failure_reason']}")
    else:
        raise ApiError(422, "bad_action", "action: retry | return")
    return _view(c, _shipment(c, shipment_id), False)


def tracking_info(c: Conn, order: dict) -> dict:
    s = c.one("SELECT * FROM shipments WHERE order_id = :o", {"o": order["id"]})
    info: dict = {"shipment_status": s["status"] if s else None, "eta": s["eta"] if s else None, "courier": None}
    if s and s["courier_id"]:
        u = c.one("SELECT full_name, phone FROM users WHERE id = :u", {"u": s["courier_id"]})
        info["courier"] = {"name": u["full_name"], "phone": u["phone"]} if s["status"] != "delivered" else None
    return info
