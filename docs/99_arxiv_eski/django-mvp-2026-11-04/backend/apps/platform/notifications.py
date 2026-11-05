"""Xabarnoma (6.6-band): outbox hodisalari -> shablon -> provayder."""
import json
import logging
import urllib.request

from django.conf import settings

from .models import Notification
from .services import handler

log = logging.getLogger(__name__)

TEMPLATES = {
    "order.created": {"uz": "Buyurtma №{number} qabul qilindi. Kuzatish: {url}", "ru": "Заказ №{number} принят. Отслеживание: {url}"},
    "order.accepted": {"uz": "Buyurtma №{number} tasdiqlandi. Kuzatish: {url}", "ru": "Заказ №{number} подтверждён. Отслеживание: {url}"},
    "order.substitution_needed": {"uz": "Buyurtma №{number}: mahsulot almashtirish yoki summa o'zgarishi tasdig'i kerak: {url}",
                                  "ru": "Заказ №{number}: нужно подтвердить замену или изменение суммы: {url}"},
    "order.in_delivery": {"uz": "Buyurtma №{number} yo'lga chiqdi. PIN: {pin}. Kuzatish: {url}",
                          "ru": "Заказ №{number} в пути. PIN: {pin}. Отслеживание: {url}"},
    "order.completed": {"uz": "Buyurtma №{number} topshirildi. Chek va baholash: {url}", "ru": "Заказ №{number} доставлен. Чек и оценка: {url}"},
    "order.cancelled": {"uz": "Buyurtma №{number} bekor qilindi. Sabab: {reason}", "ru": "Заказ №{number} отменён. Причина: {reason}"},
    "refund.refunded": {"uz": "Buyurtma №{number} bo'yicha {amount} so'm qaytarildi", "ru": "По заказу №{number} возвращено {amount} сум"},
}
# Hamkor/kuryer hodisalari panelda ko'rinadi (so'rov orqali); bu yerda faqat jurnalga yoziladi.


class ConsoleSender:
    def send(self, phone, text):
        log.info("XABAR -> %s: %s", phone, text)


class SmsGatewaySender:
    def send(self, phone, text):
        req = urllib.request.Request(
            settings.SMS_PROVIDER_URL,
            data=json.dumps({"login": settings.SMS_PROVIDER_LOGIN, "password": settings.SMS_PROVIDER_PASSWORD,
                             "phone": phone, "text": text}).encode(),
            headers={"Content-Type": "application/json"}, method="POST")
        urllib.request.urlopen(req, timeout=10).read()


def get_sender():
    return SmsGatewaySender() if settings.MESSAGE_PROVIDER == "sms" and settings.SMS_PROVIDER_URL else ConsoleSender()


def notify_phone(phone, text, template="raw", order_id=None, audience="customer"):
    Notification.objects.create(audience=audience, phone=phone, channel=settings.MESSAGE_PROVIDER,
                                template=template, text=text, order_id=order_id)
    get_sender().send(phone, text)


@handler("order.accepted", "order.substitution_needed", "order.in_delivery",
         "order.completed", "order.cancelled", "refund.refunded")
def customer_notification(ev):
    p = ev.payload
    tpl = TEMPLATES[ev.event_type]
    lang = p.get("lang", "uz")
    text = tpl.get(lang, tpl["uz"]).format(
        number=p.get("number", ""), url=p.get("url", ""), reason=p.get("reason", ""),
        pin=p.get("pin", ""), amount=int(p.get("amount", 0)) // 100)
    notify_phone(p["phone"], text, template=ev.event_type, order_id=ev.aggregate_id)


@handler("order.created", "order.confirm_overdue", "shipment.rejected", "shipment.failed", "payment.attention", "order.call_customer")
def partner_alert(ev):
    Notification.objects.create(audience="partner", channel="panel", template=ev.event_type,
                                text=json.dumps(ev.payload, ensure_ascii=False), order_id=ev.payload.get("order_id"))
    log.warning("OGOHLANTIRISH %s %s", ev.event_type, ev.payload)


@handler("shipment.assigned")
def courier_assignment(ev):
    p = ev.payload
    notify_phone(p["courier_phone"], f"Yangi topshiriq: buyurtma №{p['number']}", template=ev.event_type,
                 order_id=ev.aggregate_id, audience="courier")


@handler("shipment.created", "shipment.*")
def noop_event(ev):
    """Panel so'rov orqali ko'radi; alohida xabar kerak emas."""
