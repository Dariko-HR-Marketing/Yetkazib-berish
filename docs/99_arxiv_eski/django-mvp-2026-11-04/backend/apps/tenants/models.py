import uuid

from django.db import models


class Profile(models.TextChoices):
    SMALL_SHOP = "small_shop"
    SUPERMARKET = "supermarket"
    RESTAURANT = "restaurant"
    NON_FOOD = "non_food"


# Profil shablonlari (FR-ADM, NFR-15): yangi hamkor kod o'zgartirmasdan sozlanadi.
PROFILE_TEMPLATES = {
    Profile.SMALL_SHOP: {"manual_confirm": True, "confirm_sla_sec": 300},
    Profile.SUPERMARKET: {"manual_confirm": False, "confirm_sla_sec": 300},
    Profile.RESTAURANT: {"manual_confirm": False, "confirm_sla_sec": 180},
    Profile.NON_FOOD: {"manual_confirm": False, "confirm_sla_sec": 600},
}

# Buyurtma hissasi kalkulyatori (data/unit_iqtisodiyot.csv), tiyinda
DEFAULT_ECONOMICS = {
    "pick_cost": 500_000, "pack_cost": 200_000, "courier_cost": 1_800_000,
    "payment_commission_pct": 2.0, "other_var_cost": 400_000,
}


def default_settings():
    return {"economics": dict(DEFAULT_ECONOMICS), "allow_photo_pod": False,
            "prep_minutes": 15, "kitchen_parallel": 5}


class Tenant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120)
    slug = models.SlugField(unique=True)
    profile = models.CharField(max_length=20, choices=Profile.choices)
    package = models.CharField(max_length=20, default="start")   # start | pro | delivery
    brand = models.JSONField(default=dict, blank=True)           # {"logo","color"}
    settings = models.JSONField(default=default_settings, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Branch(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="branches")
    name = models.CharField(max_length=120)
    address = models.CharField(max_length=300)
    lat = models.FloatField()
    lng = models.FloatField()
    phone = models.CharField(max_length=20, blank=True, default="")
    working_hours = models.JSONField(default=dict, blank=True)  # {"mon":[["09:00","22:00"]],...}; bo'sh = doim ochiq
    manual_confirm = models.BooleanField(default=False)
    confirm_sla_sec = models.IntegerField(default=300)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["tenant"])]

    def __str__(self):
        return f"{self.tenant.name} / {self.name}"


class DeliveryZone(models.Model):
    """Xizmat hududi: doira (center+radius_m) yoki poligon ([[lng,lat],...]).
    PostGIS o'rniga ilova darajasida tekshiriladi (kichik pilot uchun yetarli, ADR-004)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="zones")
    name = models.CharField(max_length=80)
    center_lat = models.FloatField(null=True, blank=True)
    center_lng = models.FloatField(null=True, blank=True)
    radius_m = models.IntegerField(null=True, blank=True)
    polygon = models.JSONField(null=True, blank=True)
    delivery_fee = models.BigIntegerField()
    free_from = models.BigIntegerField(null=True, blank=True)
    min_order = models.BigIntegerField(default=0)
    priority = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)


class TimeSlot(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="slots")
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    capacity = models.IntegerField()
    booked = models.IntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["branch", "starts_at"], name="uniq_slot_start"),
            models.CheckConstraint(condition=models.Q(booked__gte=0, booked__lte=models.F("capacity")),
                                   name="slot_booked_within_capacity"),
        ]
