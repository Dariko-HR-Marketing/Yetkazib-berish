import json
import uuid
from pathlib import Path

from django.conf import settings
from django.db import connection
from django.http import Http404
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.platform.errors import ApiError
from apps.platform.models import OutboxEvent


class Health(APIView):
    authentication_classes = []

    def get(self, request):
        with connection.cursor() as c:
            c.execute("select 1")
        backlog = OutboxEvent.objects.filter(sent_at__isnull=True, dead_lettered_at__isnull=True).count()
        dead = OutboxEvent.objects.filter(dead_lettered_at__isnull=False).count()
        return Response({"status": "ok", "env": settings.APP_ENV, "outbox_backlog": backlog, "outbox_dead": dead})


class Upload(APIView):
    """Rasm yuklash (murojaat, topshirish dalili). MVPda mahalliy disk; production'da S3/MinIO adapteri."""
    MAX = 5 * 1024 * 1024
    EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}

    def post(self, request):
        if not request.user and not request.headers.get("X-Tracking-Token"):
            raise AuthenticationFailed("auth")
        f = request.FILES.get("file")
        if not f or f.content_type not in self.EXT:
            raise ApiError(400, "validation_error", "Faqat jpeg/png/webp rasm", field="file")
        if f.size > self.MAX:
            raise ApiError(413, "validation_error", "Fayl 5 MB dan katta", field="file")
        name = f"{uuid.uuid4().hex}.{self.EXT[f.content_type]}"
        dest = Path(settings.MEDIA_ROOT)
        dest.mkdir(parents=True, exist_ok=True)
        (dest / name).write_bytes(f.read())
        return Response({"url": f"{settings.MEDIA_URL}{name}"}, status=201)


class TelegramWebhook(APIView):
    """Bot: /start <tenant_slug>[_<branch_id>] -> vitrinaga deep link (US-028). Xabar yuborish provayder ulangach."""
    authentication_classes = []

    def post(self, request):
        if settings.TELEGRAM_WEBHOOK_SECRET and request.headers.get("X-Telegram-Bot-Api-Secret-Token") != settings.TELEGRAM_WEBHOOK_SECRET:
            raise ApiError(401, "bad_signature")
        msg = (request.data.get("message") or {})
        text = (msg.get("text") or "").strip()
        if not text.startswith("/start"):
            return Response({"ok": True})
        arg = text.partition(" ")[2].strip()
        slug, _, branch = arg.partition("_")
        from apps.tenants.models import Tenant
        t = Tenant.objects.filter(slug=slug, is_active=True).first()
        if not t:
            return Response({"ok": True, "reply": "Hamkor topilmadi"})
        url = f"{settings.STOREFRONT_BASE_URL}/?t={t.slug}&channel=telegram" + (f"&branch={branch}" if branch else "")
        reply = {"method": "sendMessage", "chat_id": (msg.get("chat") or {}).get("id"),
                 "text": f"{t.name} vitrinasi: {url}",
                 "reply_markup": {"inline_keyboard": [[{"text": "Buyurtma berish", "web_app": {"url": url}}]]}}
        return Response(reply)     # webhook javobi sifatida to'g'ridan-to'g'ri Telegramga qaytadi
