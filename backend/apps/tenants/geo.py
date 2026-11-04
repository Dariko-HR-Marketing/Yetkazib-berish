"""Hudud tekshiruvi: doira va poligon (PostGIS o'rniga, ilova darajasida)."""
import math
from datetime import datetime
from zoneinfo import ZoneInfo

from django.conf import settings

from .models import Branch, DeliveryZone

R = 6371000.0


def haversine_m(lat1, lng1, lat2, lng2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def point_in_polygon(lat, lng, ring):
    """ring: [[lng, lat], ...] (GeoJSON tartibi). Ray casting."""
    inside = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        if (y1 > lat) != (y2 > lat):
            xi = x1 + (lat - y1) * (x2 - x1) / (y2 - y1)
            if lng < xi:
                inside = not inside
    return inside


def zone_contains(zone, lat, lng):
    if zone.polygon:
        return point_in_polygon(lat, lng, zone.polygon)
    if zone.radius_m and zone.center_lat is not None:
        return haversine_m(zone.center_lat, zone.center_lng, lat, lng) <= zone.radius_m
    return False


def zone_for(branch, lat, lng):
    zones = DeliveryZone.objects.filter(branch=branch, is_active=True).order_by("-priority", "delivery_fee")
    for z in zones:
        if zone_contains(z, lat, lng):
            return z
    return None


def resolve(tenant, lat, lng):
    """Manzilga mos filiallar (yaqinroq birinchi)."""
    out = []
    for b in Branch.objects.filter(tenant=tenant, is_active=True):
        z = zone_for(b, lat, lng)
        if z:
            out.append((haversine_m(b.lat, b.lng, lat, lng), b, z))
    out.sort(key=lambda t: t[0])
    return [(b, z) for _, b, z in out]


DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def is_open(branch, now=None):
    hours = branch.working_hours or {}
    if not hours:
        return True
    now = (now or datetime.now(ZoneInfo(settings.TIME_ZONE))).astimezone(ZoneInfo(settings.TIME_ZONE))
    for a, b in hours.get(DAYS[now.weekday()], []):
        if a <= now.strftime("%H:%M") <= b:
            return True
    return False
