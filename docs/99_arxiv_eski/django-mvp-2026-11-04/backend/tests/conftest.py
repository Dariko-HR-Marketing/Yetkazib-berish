import hashlib
import hmac
import json
import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User, UserRole
from apps.catalog.models import BranchStock, Category, Product, Variant
from apps.tenants.models import Branch, DeliveryZone, Tenant, TimeSlot

LAT, LNG = 40.1030, 65.3790
ADDR = {"text": "Test ko'chasi 5", "lat": LAT + 0.002, "lng": LNG + 0.002, "landmark": "Do'kon yonida"}


def make_user(phone, role, tenant=None, branch=None, name=""):
    u = User.objects.create_user(phone, "pw-12345", full_name=name or role)
    UserRole.objects.create(user=u, role=role, tenant=tenant, branch=branch)
    return u


def make_tenant(slug, profile="supermarket", manual=False):
    t = Tenant.objects.create(name=slug, slug=slug, profile=profile)
    b = Branch.objects.create(tenant=t, name="Filial", address="a", lat=LAT, lng=LNG, manual_confirm=manual, phone="+998712000000")
    DeliveryZone.objects.create(tenant=t, branch=b, name="Z", center_lat=LAT, center_lng=LNG, radius_m=3000,
                                delivery_fee=1_000_000, free_from=15_000_000, min_order=0)
    return t, b


def add_product(t, b, sku, price, qty, weighted=False, name="X", cost=0, **kw):
    p = Product.objects.create(tenant=t, name={"uz": name, "ru": name}, unit="kg" if weighted else "pcs", is_weighted=weighted,
                               requires_serial=kw.pop("requires_serial", False))
    v = Variant.objects.create(tenant=t, product=p, sku=sku, barcode=kw.pop("barcode", ""), **kw)
    BranchStock.objects.create(tenant=t, branch=b, variant=v, price=price, cost=cost, available_qty=Decimal(qty), synced_at=timezone.now())
    return v


@pytest.fixture
def world(db):
    t, b = make_tenant("shop-a")
    t2, b2 = make_tenant("shop-b")
    w = type("W", (), {})()
    w.t, w.b, w.t2, w.b2 = t, b, t2, b2
    w.bread = add_product(t, b, "BREAD-1", 400_000, 1, name="Non")
    w.milk = add_product(t, b, "MILK", 1_400_000, 100, name="Sut")
    w.apple = add_product(t, b, "APPLE", 1_800_000, 50, weighted=True, name="Olma")
    w.b_item = add_product(t2, b2, "B-ITEM", 1_000_000, 10, name="B")
    w.owner = make_user("+998900000011", Role.TENANT_OWNER, t)
    w.picker = make_user("+998900000012", Role.PICKER, t, b)
    w.disp = make_user("+998900000013", Role.DISPATCHER, t)
    w.courier = make_user("+998900000014", Role.COURIER, t, name="Aziz Karimov")
    w.courier2 = make_user("+998900000015", Role.COURIER, t, name="Bobur")
    w.support = make_user("+998900000016", Role.SUPPORT, t)
    w.finance = make_user("+998900000017", Role.FINANCE, t)
    w.owner_b = make_user("+998900000021", Role.TENANT_OWNER, t2)
    w.customer = make_user("+998901112233", Role.CUSTOMER)
    return w


def api(user=None):
    c = APIClient()
    if user:
        c.force_authenticate(user=user)
    return c


def post_order(client, tenant_slug, items, key=None, **extra):
    body = {"tenant_slug": tenant_slug, "customer_phone": "+998901112233", "address": ADDR,
            "payment_method": "cash_on_delivery", "items": items, **extra}
    return client.post("/api/v1/orders", body, format="json", HTTP_IDEMPOTENCY_KEY=str(key or uuid.uuid4()))


def sign(payload: dict):
    raw = json.dumps(payload).encode()
    from django.conf import settings
    return raw, hmac.new(settings.PAYMENT_WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()


def move_to_ready(w, order_id):
    p = api(w.picker)
    return p.post(f"/api/v1/partner/orders/{order_id}/transition", {"to": "preparing"}, format="json"), \
        p.post(f"/api/v1/partner/orders/{order_id}/transition", {"to": "ready"}, format="json")


@pytest.fixture(autouse=True)
def _fast_hash(settings):
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
    settings.STORAGES = {**settings.STORAGES, "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"}}
