"""Hamkor sozlamalari (FR-PT01/04/07) va platforma administratori (FR-ADM)."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import transaction
from django.http import Http404
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.auth import Scope, require_staff
from apps.accounts.models import Role, User, UserRole
from apps.accounts.services import normalize_phone
from apps.platform.errors import ApiError
from apps.platform.services import audit

from .models import PROFILE_TEMPLATES, Branch, DeliveryZone, Profile, Tenant, TimeSlot, default_settings

OWNER = (Role.TENANT_OWNER,)
MGR = (Role.TENANT_OWNER, Role.BRANCH_MANAGER)


def branch_dict(b):
    return {"id": str(b.id), "tenant_id": str(b.tenant_id), "name": b.name, "address": b.address, "lat": b.lat, "lng": b.lng,
            "phone": b.phone, "working_hours": b.working_hours, "manual_confirm": b.manual_confirm,
            "confirm_sla_sec": b.confirm_sla_sec, "is_active": b.is_active}


def zone_dict(z):
    return {"id": str(z.id), "branch_id": str(z.branch_id), "name": z.name, "center_lat": z.center_lat, "center_lng": z.center_lng,
            "radius_m": z.radius_m, "polygon": z.polygon, "delivery_fee": z.delivery_fee, "free_from": z.free_from,
            "min_order": z.min_order, "priority": z.priority, "is_active": z.is_active}


def _branch(request, branch_id, *roles):
    b = Branch.objects.select_related("tenant").filter(pk=branch_id).first()
    sc = require_staff(request, *roles)
    if not b or not sc.can_branch(b, *roles):
        if b:
            audit("branch", b.id, "access_denied", tenant_id=b.tenant_id, actor=request.user, request=request)
        raise Http404
    return b


# ----------------------------------------------------------- Platforma administratori
class PlatformTenants(APIView):
    """Yangi hamkor + birinchi filial + egasi: kod o'zgartirmasdan, profil shabloni bilan (NFR-15)."""

    def get(self, request):
        require_staff(request, Role.PLATFORM_ADMIN)
        return Response([{"id": str(t.id), "slug": t.slug, "name": t.name, "profile": t.profile, "package": t.package,
                          "is_active": t.is_active} for t in Tenant.objects.order_by("name")])

    @transaction.atomic
    def post(self, request):
        require_staff(request, Role.PLATFORM_ADMIN)
        d = request.data
        for f in ("name", "slug", "profile", "owner_phone", "owner_password"):
            if not d.get(f):
                raise ApiError(400, "validation_error", f"'{f}' majburiy", field=f)
        if d["profile"] not in Profile.values:
            raise ApiError(400, "validation_error", "profile noto'g'ri", field="profile")
        if Tenant.objects.filter(slug=d["slug"]).exists():
            raise ApiError(409, "validation_error", "slug band", field="slug")
        t = Tenant.objects.create(name=d["name"], slug=d["slug"], profile=d["profile"], package=d.get("package", "start"),
                                  brand=d.get("brand") or {}, settings=default_settings())
        tpl = PROFILE_TEMPLATES[Profile(d["profile"])]
        br = d.get("branch") or {}
        b = Branch.objects.create(tenant=t, name=br.get("name", "Asosiy filial"), address=br.get("address", ""),
                                  lat=float(br.get("lat", 0)), lng=float(br.get("lng", 0)), **tpl)
        owner, _ = User.objects.get_or_create(phone=normalize_phone(d["owner_phone"]))
        owner.set_password(d["owner_password"])
        owner.full_name = d.get("owner_name", owner.full_name)
        owner.save()
        UserRole.objects.get_or_create(user=owner, role=Role.TENANT_OWNER, tenant=t, branch=None)
        audit("tenant", t.id, "create", tenant_id=t.id, actor=request.user, new={"slug": t.slug, "profile": t.profile}, request=request)
        return Response({"id": str(t.id), "slug": t.slug, "branch_id": str(b.id)}, status=201)


# ----------------------------------------------------------- Hamkor
class PartnerTenant(APIView):
    def get(self, request):
        sc = require_staff(request, *MGR, Role.PICKER, Role.DISPATCHER, Role.SUPPORT, Role.FINANCE, Role.COURIER)
        ids = sc.tenant_ids() | {b.tenant_id for b in Branch.objects.filter(id__in=sc.branch_ids_for())}
        qs = Tenant.objects.all() if sc.is_admin else Tenant.objects.filter(id__in=ids)
        return Response([{"id": str(t.id), "slug": t.slug, "name": t.name, "profile": t.profile, "brand": t.brand,
                          "settings": t.settings,
                          "branches": [branch_dict(b) for b in t.branches.all() if sc.can_branch(b)]} for t in qs])

    def patch(self, request):
        sc = require_staff(request, *OWNER)
        t = Tenant.objects.filter(id__in=sc.tenant_ids(*OWNER)).first() if not sc.is_admin else Tenant.objects.filter(pk=request.data.get("tenant_id")).first()
        if not t:
            raise Http404
        old = {"brand": t.brand, "settings": t.settings}
        if "brand" in request.data:
            t.brand = request.data["brand"]
        if "settings" in request.data:
            t.settings = {**t.settings, **request.data["settings"]}
        t.save()
        audit("tenant", t.id, "update", tenant_id=t.id, actor=request.user, old=old, new={"brand": t.brand, "settings": t.settings}, request=request)
        return Response({"ok": True})


class PartnerBranch(APIView):
    def patch(self, request, branch_id):
        b = _branch(request, branch_id, *MGR)
        old = branch_dict(b)
        for f in ("name", "address", "phone", "working_hours", "manual_confirm", "confirm_sla_sec", "is_active", "lat", "lng"):
            if f in request.data:
                setattr(b, f, request.data[f])
        b.save()
        audit("branch", b.id, "update", tenant_id=b.tenant_id, actor=request.user, old=old, new=branch_dict(b), request=request)
        return Response(branch_dict(b))

    def post(self, request, branch_id):          # branch_id = tenant id: yangi filial (faqat egasi)
        sc = require_staff(request, *OWNER)
        t = Tenant.objects.filter(pk=branch_id).first()
        if not t or not sc.can_tenant(t.id, *OWNER):
            raise Http404
        d = request.data
        tpl = PROFILE_TEMPLATES[Profile(t.profile)]
        b = Branch.objects.create(tenant=t, name=d["name"], address=d.get("address", ""), lat=float(d["lat"]), lng=float(d["lng"]),
                                  phone=d.get("phone", ""), **tpl)
        audit("branch", b.id, "create", tenant_id=t.id, actor=request.user, request=request)
        return Response(branch_dict(b), status=201)


class PartnerZones(APIView):
    def get(self, request, branch_id):
        b = _branch(request, branch_id, *MGR)
        return Response([zone_dict(z) for z in b.zones.all()])

    def post(self, request, branch_id):
        b = _branch(request, branch_id, *MGR)
        z = DeliveryZone(tenant=b.tenant, branch=b)
        return Response(self._save(request, z), status=201)

    def _save(self, request, z):
        d = request.data
        for f in ("name", "center_lat", "center_lng", "radius_m", "polygon", "delivery_fee", "free_from", "min_order", "priority", "is_active"):
            if f in d:
                setattr(z, f, d[f])
        if not z.polygon and not (z.radius_m and z.center_lat is not None):
            raise ApiError(400, "validation_error", "polygon yoki center_lat/center_lng/radius_m kerak")
        if z.polygon and (len(z.polygon) < 3 or any(len(p) != 2 for p in z.polygon)):
            raise ApiError(400, "validation_error", "polygon: kamida 3 ta [lng, lat] nuqta", field="polygon")
        if z.delivery_fee is None or int(z.delivery_fee) < 0:
            raise ApiError(400, "validation_error", "delivery_fee majburiy", field="delivery_fee")
        if not z.name:
            z.name = "Hudud"
        z.save()
        audit("zone", z.id, "save", tenant_id=z.tenant_id, actor=request.user, new=zone_dict(z), request=request)
        return zone_dict(z)


class PartnerZoneDetail(APIView):
    def _zone(self, request, zone_id):
        z = DeliveryZone.objects.select_related("branch", "tenant").filter(pk=zone_id).first()
        sc = require_staff(request, *MGR)
        if not z or not sc.can_branch(z.branch, *MGR):
            raise Http404
        return z

    def patch(self, request, zone_id):
        return Response(PartnerZones._save(self, request, self._zone(request, zone_id)))

    def delete(self, request, zone_id):
        z = self._zone(request, zone_id)
        audit("zone", z.id, "delete", tenant_id=z.tenant_id, actor=request.user, old=zone_dict(z), request=request)
        z.delete()
        return Response(status=204)


class SlotGenerate(APIView):
    """Berilgan kun uchun slotlar yaratadi: {date, start:"09:00", end:"21:00", step_min:60, capacity:10}."""

    @transaction.atomic
    def post(self, request, branch_id):
        b = _branch(request, branch_id, *MGR)
        d = request.data
        tz = ZoneInfo(settings.TIME_ZONE)
        try:
            day = datetime.strptime(d["date"], "%Y-%m-%d")
            h1, m1 = map(int, d.get("start", "09:00").split(":"))
            h2, m2 = map(int, d.get("end", "21:00").split(":"))
            step, cap = int(d.get("step_min", 60)), int(d.get("capacity", 10))
        except (KeyError, ValueError):
            raise ApiError(400, "validation_error", "date (YYYY-MM-DD), start, end, step_min, capacity")
        cur = day.replace(hour=h1, minute=m1, tzinfo=tz)
        end = day.replace(hour=h2, minute=m2, tzinfo=tz)
        n = 0
        while cur + timedelta(minutes=step) <= end:
            _, created = TimeSlot.objects.get_or_create(branch=b, starts_at=cur, defaults={
                "tenant": b.tenant, "ends_at": cur + timedelta(minutes=step), "capacity": cap})
            n += created
            cur += timedelta(minutes=step)
        return Response({"created": n}, status=201)


class PartnerStaff(APIView):
    """Xodimlar va rollar (FR-PT07). Faqat egasi."""

    def get(self, request):
        sc = require_staff(request, *OWNER)
        ids = sc.tenant_ids(*OWNER)
        qs = UserRole.objects.select_related("user", "branch").exclude(role=Role.CUSTOMER)
        qs = qs if sc.is_admin else qs.filter(tenant_id__in=ids)
        return Response([{"user_id": str(r.user_id), "phone": r.user.phone, "full_name": r.user.full_name, "role": r.role,
                          "branch_id": str(r.branch_id) if r.branch_id else None, "tenant_id": str(r.tenant_id) if r.tenant_id else None}
                         for r in qs])

    @transaction.atomic
    def post(self, request):
        sc = require_staff(request, *OWNER)
        d = request.data
        role = d.get("role")
        allowed = {Role.BRANCH_MANAGER, Role.PICKER, Role.DISPATCHER, Role.COURIER, Role.SUPPORT, Role.FINANCE}
        if role not in allowed and not (sc.is_admin and role in Role.values):
            raise ApiError(400, "validation_error", "role noto'g'ri", field="role")
        t = Tenant.objects.filter(pk=d.get("tenant_id")).first() if sc.is_admin else Tenant.objects.filter(id__in=sc.tenant_ids(*OWNER)).first()
        if not t or not sc.can_tenant(t.id, *OWNER):
            raise Http404
        branch = None
        if d.get("branch_id"):
            branch = Branch.objects.filter(pk=d["branch_id"], tenant=t).first()
            if not branch:
                raise ApiError(404, "not_found", "Filial topilmadi")
        phone = normalize_phone(d.get("phone", ""))
        u, created = User.objects.get_or_create(phone=phone)
        if d.get("password"):
            u.set_password(d["password"])
        u.full_name = d.get("full_name", u.full_name)
        u.save()
        UserRole.objects.get_or_create(user=u, role=role, tenant=t, branch=branch)
        audit("user_role", u.id, "grant", tenant_id=t.id, actor=request.user, new={"role": role, "branch": str(branch.id) if branch else None}, request=request)
        return Response({"user_id": str(u.id)}, status=201)

    def delete(self, request):
        sc = require_staff(request, *OWNER)
        r = UserRole.objects.filter(user_id=request.data.get("user_id"), role=request.data.get("role")).exclude(role=Role.CUSTOMER).first()
        if not r or not r.tenant_id or not sc.can_tenant(r.tenant_id, *OWNER):
            raise Http404
        audit("user_role", r.user_id, "revoke", tenant_id=r.tenant_id, actor=request.user, old={"role": r.role}, request=request)
        r.delete()
        return Response(status=204)


class PartnerBranchCreate(PartnerBranch):
    http_method_names = ["post", "options"]
