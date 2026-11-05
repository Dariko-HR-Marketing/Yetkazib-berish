"""To'lov adapterlari va webhooklar (INT-PAY, ADR-003).

`PaymentProvider` — yagona interfeys. MVPda `MockProvider` (ishlab chiqish va demo uchun) to'liq ishlaydi.
Payme / CLICK adapterlari G1 da provayder tanlangach, sinov kalitlari bilan shu interfeys bo'yicha yoziladi.
"""
from __future__ import annotations

import json
from typing import Protocol

from ..config import settings
from ..core import ApiError, not_found
from ..db import Conn, dumps, iso, new_id
from .common import emit, sign_payload


class PaymentProvider(Protocol):
    name: str

    def create_payment(self, payment: dict, order: dict) -> str:  # to'lov sahifasi URL manzili
        ...

    def refund(self, payment: dict, amount: int) -> bool:
        ...


class MockProvider:
    """Sinov provayderi: /pay/mock/<payment_id> sahifasi to'lovni imzolangan webhook bilan tasdiqlaydi."""

    name = "mock"

    def create_payment(self, payment: dict, order: dict) -> str:
        return f"/pay/mock/{payment['id']}"

    def refund(self, payment: dict, amount: int) -> bool:
        return True


class PaymeProvider:
    """Payme Merchant API adapteri — skelet. Sinov kalitlari olingach to'ldiriladi (INT-PAY qabul shartlari 8.2)."""

    name = "payme"

    def create_payment(self, payment: dict, order: dict) -> str:  # pragma: no cover
        raise ApiError(501, "provider_not_configured", "Payme adapteri hali sozlanmagan")

    def refund(self, payment: dict, amount: int) -> bool:  # pragma: no cover
        raise ApiError(501, "provider_not_configured", "Payme adapteri hali sozlanmagan")


PROVIDERS: dict[str, PaymentProvider] = {"mock": MockProvider(), "payme": PaymeProvider()}


def provider() -> PaymentProvider:
    return PROVIDERS[settings.payment_provider]


def start_payment(c: Conn, order: dict) -> dict:
    if order["payment_method"] != "online":
        raise ApiError(409, "not_online", "Bu buyurtma topshirishda to'lanadi")
    if order["payment_status"] == "paid":
        raise ApiError(409, "already_paid", "Buyurtma allaqachon to'langan")
    if order["status"] == "cancelled":
        raise ApiError(409, "order_cancelled", "Buyurtma bekor qilingan")
    existing = c.one("SELECT * FROM payments WHERE order_id = :o AND status = 'pending'", {"o": order["id"]})
    payment = existing or c.insert("payments", {
        "id": new_id(), "tenant_id": order["tenant_id"], "order_id": order["id"], "provider": provider().name,
        "external_txn_id": None, "amount": order["total"], "status": "pending", "created_at": iso(), "paid_at": None,
    })
    return {"payment_id": payment["id"], "redirect_url": provider().create_payment(payment, order)}


def handle_webhook(c: Conn, provider_name: str, raw: bytes, signature: str | None) -> dict:
    """Imzo tekshiriladi, hodisa (provider, event_id) bo'yicha faqat bir marta qayta ishlanadi."""
    if not signature or signature != sign_payload(raw):
        raise ApiError(401, "bad_signature", "Webhook imzosi noto'g'ri")
    event = json.loads(raw)
    duplicate = c.scalar("SELECT 1 FROM inbound_webhooks WHERE provider = :p AND external_event_id = :e",
                         {"p": provider_name, "e": event["event_id"]})
    if duplicate:
        return {"status": "duplicate_ignored"}
    c.insert("inbound_webhooks", {"provider": provider_name, "external_event_id": event["event_id"],
                                  "payload": dumps(event), "received_at": iso()})
    payment = c.one("SELECT * FROM payments WHERE id = :id", {"id": event["payment_id"]})
    if not payment:
        raise not_found("To'lov")
    if event["status"] == "paid" and payment["status"] != "paid":
        if int(event["amount"]) != payment["amount"]:
            raise ApiError(422, "amount_mismatch", "Summa mos emas")
        c.execute("UPDATE payments SET status = 'paid', external_txn_id = :x, paid_at = :ts WHERE id = :id",
                  {"x": event.get("txn_id"), "ts": iso(), "id": payment["id"]})
        order = c.one("SELECT * FROM orders WHERE id = :o", {"o": payment["order_id"]})
        if order["status"] == "cancelled":
            # Bekor qilingan buyurtmaga kechikkan to'lov — darhol qaytarishga yuboriladi.
            c.insert("refunds", {"id": new_id(), "tenant_id": order["tenant_id"], "order_id": order["id"],
                                 "payment_id": payment["id"], "amount": payment["amount"],
                                 "reason": "late_payment_for_cancelled_order", "status": "requested",
                                 "requested_by": None, "approved_by": None, "created_at": iso()})
            c.execute("UPDATE orders SET payment_status = 'refunding' WHERE id = :id", {"id": order["id"]})
            return {"status": "refund_requested"}
        c.execute("UPDATE orders SET payment_status = 'paid', reserve_expires_at = NULL, updated_at = :ts "
                  "WHERE id = :id", {"ts": iso(), "id": order["id"]})
        emit(c, tenant_id=order["tenant_id"], aggregate_type="payment", aggregate_id=payment["id"],
             event_type="payment.paid", payload={"number": order["number"], "phone": order["customer_phone"]})
        manual = c.scalar("SELECT manual_confirm FROM branches WHERE id = :b", {"b": order["branch_id"]})
        if not manual and order["status"] == "pending_confirmation":
            from . import orders

            orders.transition(c, order["id"], "accept", actor=None, reason="auto_after_payment")
    elif event["status"] == "failed":
        c.execute("UPDATE payments SET status = 'failed' WHERE id = :id AND status = 'pending'", {"id": payment["id"]})
    return {"status": "processed"}


def mock_event(payment_id: str, amount: int, status: str = "paid") -> bytes:
    return json.dumps({"event_id": new_id(), "payment_id": payment_id, "amount": amount, "status": status,
                       "txn_id": f"MOCK-{payment_id[:8]}"}).encode()
