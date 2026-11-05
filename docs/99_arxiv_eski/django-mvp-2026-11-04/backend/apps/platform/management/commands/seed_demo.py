"""Demo ma'lumot (faqat development/staging): 2 hamkor + xodimlar + katalog + slotlar."""
from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import Role, User, UserRole
from apps.catalog.models import BranchStock, Category, Modifier, Product, Variant
from apps.tenants.models import DeliveryZone, Branch, Tenant, TimeSlot

PASSWORD = "demo12345"
HOURS = {d: [["08:00", "23:00"]] for d in ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]}
# Qarshi (65.38, 40.10) atrofida shartli koordinatalar; pilot hududi G1 da belgilanadi.
LAT, LNG = 40.1030, 65.3790


class Command(BaseCommand):
    def handle(self, *a, **o):
        if settings.APP_ENV == "production":
            raise CommandError("Production'da demo ma'lumot yuklanmaydi")
        with transaction.atomic():
            self.seed()
        self.stdout.write(self.style.SUCCESS(
            f"Demo tayyor. Xodimlar paroli: {PASSWORD}\n"
            "  admin +998900000001 (MFA kerak) | do'kon egasi +998900000011 | yig'uvchi +998900000012 | dispetcher +998900000013\n"
            "  kuryer +998900000014 | yordam +998900000015 | moliya +998900000016 (MFA) | kafe egasi +998900000021\n"
            "Vitrina: /?t=demo-dokon  yoki  /?t=demo-kafe   |  Panel: /panel/"))

    def user(self, phone, name, role, tenant=None, branch=None, staff=False):
        u, _ = User.objects.get_or_create(phone=phone, defaults={"full_name": name})
        u.set_password(PASSWORD)
        u.is_staff = staff
        u.is_superuser = staff
        u.save()
        UserRole.objects.get_or_create(user=u, role=role, tenant=tenant, branch=branch)
        return u

    def seed(self):
        shop, _ = Tenant.objects.get_or_create(slug="demo-dokon", defaults={"name": "Demo Do'kon", "profile": "supermarket", "package": "pro",
                                                                            "brand": {"color": "#15803d"}})
        cafe, _ = Tenant.objects.get_or_create(slug="demo-kafe", defaults={"name": "Demo Kafe", "profile": "restaurant", "package": "pro",
                                                                           "brand": {"color": "#b45309"}})
        b1, _ = Branch.objects.get_or_create(tenant=shop, name="Markaziy filial", defaults={
            "address": "Demo ko'chasi, 1", "lat": LAT, "lng": LNG, "working_hours": HOURS, "phone": "+998712000001", "manual_confirm": False})
        b2, _ = Branch.objects.get_or_create(tenant=cafe, name="Kafe filiali", defaults={
            "address": "Demo ko'chasi, 15", "lat": LAT + 0.003, "lng": LNG + 0.005, "working_hours": HOURS, "phone": "+998712000002"})
        for t, b, fee, free, mn in ((shop, b1, 1_000_000, 15_000_000, 5_000_000), (cafe, b2, 1_000_000, None, 4_000_000)):
            DeliveryZone.objects.get_or_create(tenant=t, branch=b, name="Asosiy hudud", defaults={
                "center_lat": b.lat, "center_lng": b.lng, "radius_m": 3000, "delivery_fee": fee, "free_from": free, "min_order": mn})
        # Xodimlar
        User.objects.filter(phone="+998900000001").exists() or User.objects.create_superuser("+998900000001", PASSWORD, full_name="Admin")
        self.user("+998900000011", "Do'kon egasi", Role.TENANT_OWNER, tenant=shop)
        self.user("+998900000012", "Yig'uvchi", Role.PICKER, tenant=shop, branch=b1)
        self.user("+998900000013", "Dispetcher", Role.DISPATCHER, tenant=shop)
        self.user("+998900000014", "Kuryer Aziz", Role.COURIER, tenant=shop)
        self.user("+998900000015", "Yordam", Role.SUPPORT, tenant=shop)
        self.user("+998900000016", "Moliyachi", Role.FINANCE, tenant=shop)
        self.user("+998900000021", "Kafe egasi", Role.TENANT_OWNER, tenant=cafe)
        # Katalog
        fruit, _ = Category.objects.get_or_create(tenant=shop, name={"uz": "Meva", "ru": "Фрукты"}, defaults={"sort_order": 1})
        bakery, _ = Category.objects.get_or_create(tenant=shop, name={"uz": "Non", "ru": "Хлеб"}, defaults={"sort_order": 2})
        meals, _ = Category.objects.get_or_create(tenant=cafe, name={"uz": "Taomlar", "ru": "Блюда"}, defaults={"sort_order": 1})
        rows = [(shop, b1, fruit, "APPLE-KG", {"uz": "Olma", "ru": "Яблоки"}, "kg", True, 1_800_000, 1_200_000, 50, "4780000000011"),
                (shop, b1, fruit, "PEAR-KG", {"uz": "Nok", "ru": "Груши"}, "kg", True, 2_200_000, 1_500_000, 30, "4780000000028"),
                (shop, b1, bakery, "BREAD-1", {"uz": "Non", "ru": "Хлеб"}, "pcs", False, 400_000, 250_000, 1, "4780000000035"),
                (shop, b1, bakery, "BREAD-2", {"uz": "Patir", "ru": "Лепёшка"}, "pcs", False, 600_000, 380_000, 40, "4780000000042"),
                (shop, b1, None, "MILK-1", {"uz": "Sut 1 l", "ru": "Молоко 1 л"}, "pcs", False, 1_400_000, 1_000_000, 60, "4780000000059"),
                (cafe, b2, meals, "PLOV-1", {"uz": "Osh", "ru": "Плов"}, "pcs", False, 3_500_000, 1_800_000, 40, ""),
                (cafe, b2, meals, "SOMSA-1", {"uz": "Somsa", "ru": "Самса"}, "pcs", False, 1_200_000, 600_000, 80, "")]
        for t, b, cat, sku, name, unit, weighted, price, cost, qty, bc in rows:
            v = Variant.objects.filter(tenant=t, sku=sku).first()
            if not v:
                p = Product.objects.create(tenant=t, category=cat, name=name, unit=unit, is_weighted=weighted)
                v = Variant.objects.create(tenant=t, product=p, sku=sku, barcode=bc, weight_g=300 if not weighted else None)
                if sku == "PLOV-1":
                    Modifier.objects.create(tenant=t, product=p, name={"uz": "Qo'shimcha go'sht", "ru": "Доп. мясо"}, price=1_500_000)
            BranchStock.objects.update_or_create(branch=b, variant=v, defaults={
                "tenant": t, "price": price, "cost": cost, "available_qty": Decimal(qty), "reserved_qty": 0})
        # Slotlar (bugun va ertaga, 1 soatlik)
        tz = ZoneInfo(settings.TIME_ZONE)
        base = datetime.now(tz).replace(minute=0, second=0, microsecond=0)
        for b in (b1, b2):
            for h in range(1, 30):
                s = base + timedelta(hours=h)
                if 9 <= s.hour < 22:
                    TimeSlot.objects.get_or_create(branch=b, starts_at=s, defaults={"tenant": b.tenant, "ends_at": s + timedelta(hours=1), "capacity": 8})
