"""To'lov provayderi adapterlari. Pilotda bitta provayder tanlanadi (G1): payme | click.
Haqiqiy Payme/Click protokollari provayder bilan shartnoma va sinov hisobidan keyin ulanadi;
interfeys (create_checkout / refund / check_status / verify_signature) tayyor, mock to'liq ishlaydi."""
import hashlib
import hmac

from django.conf import settings

from apps.platform.errors import ApiError


class BaseProvider:
    name = "base"

    def create_checkout(self, payment):
        raise NotImplementedError

    def refund(self, payment, amount):
        raise NotImplementedError

    def check_status(self, payment):
        """'paid' | 'authorized' | 'failed' | None (noaniq)."""
        return None

    def verify_signature(self, raw_body, signature):
        expected = hmac.new(settings.PAYMENT_WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature or "")


class MockProvider(BaseProvider):
    name = "mock"

    def create_checkout(self, payment):
        txn = f"mock-{payment.id.hex[:16]}"
        return txn, f"{settings.STOREFRONT_BASE_URL}/pay/mock/{payment.id}"

    def refund(self, payment, amount):
        return True


class NotConfigured(BaseProvider):
    def __init__(self, name):
        self.name = name

    def _fail(self, *a, **kw):
        raise ApiError(501, "provider_not_configured", f"{self.name} provayderi hali ulanmagan (G1 qarori va kalitlar kerak)")

    create_checkout = refund = _fail


_override = {}


def get_provider(name=None):
    name = name or settings.PAYMENT_PROVIDER
    if name in _override:
        return _override[name]
    if name == "mock":
        return MockProvider()
    return NotConfigured(name)
