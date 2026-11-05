import uuid
from datetime import datetime, timedelta
from decimal import Decimal

from django.http import Http404
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.access import in_scope_or_404
from apps.accounts.auth import Scope, require_staff
from apps.accounts.models import Role
from apps.catalog.models import BranchStock
from apps.payments import services as pay_services
from apps.platform.errors import ApiError
from apps.platform.services import audit, run_idempotent
from apps.tenants import geo
from apps.tenants.models import Branch, Tenant, TimeSlot

from . import services
from .models import Order, OrderItem, OrderStatus as S
from .pricing import build_quote
from .serializers import item_dict, order_dict, tracking_dict


def get_tenant(slug):
    t = Tenant.objects.filter(slug=slug, is_active=True).first()
    if not t:
        raise Http404
    return t


def need_user(request):
    if not request.user:
        raise AuthenticationFailed("auth")
    return request.user


def customer_order(request, order_id, lock=False):
    """Xaridor: o'z buyurtmasi (token) yoki mehmon uchun X-Tracking-Token."""
    qs = Order.objects.select_related("branch", "tenant", "customer")
    qs = qs.select_for_update() if lock else qs
    o = qs.filter(pk=order_id).first()
    if o is None:
        raise Http404
    tok = request.headers.get("X-Tracking-Token")
    if request.user and o.customer_id == request.user.id:
        return o
    if tok and tok == o.tracking_token and o.tracking_expires_at > timezone.now():
        return o
    raise Http404


# ------------------------------------------------------------ vitrina
class ZoneResolve(APIView):
    def get(self, request, slug):
        tenant = get_tenant(slug)
        try:
            lat, lng = float(request.query_params["lat"]), float(request.query_params["lng"])
        except (KeyError, ValueError):
            raise ApiError(400, "validation_error", "lat va lng majburiy")
        found = geo.resolve(tenant, lat, lng)
        if not found:
            raise ApiError(404, "out_of_zone")
        b, z = found[0]
        return Response({"branch": {"id": str(b.id), "name": b.name, "address": b.address, "open": geo.is_open(b)},
                         "zone": {"id": str(z.id), "name": z.name, "delivery_fee": z.delivery_fee, "free_from": z.free_from,
                                  "min_order": z.min_order},
                         "alternatives": [{"id": str(x.id), "name": x.name} for x, _ in found[1:]]})


class TenantInfo(APIView):
    def get(self, request, slug):
        t = get_tenant(slug)
        return Response({"slug": t.slug, "name": t.name, "profile": t.profile, "brand": t.brand,
                         "branches": [{"id": str(b.id), "name": b.name, "address": b.address, "lat": b.lat, "lng": b.lng,
                                       "open": geo.is_open(b)} for b in t.branches.filter(is_active=True)]})


class Catalog(APIView):
    PAGE = 50

    def get(self, request, slug, branch_id):
        tenant = get_tenant(slug)
        branch = Branch.objects.filter(pk=branch_id, tenant=tenant, is_active=True).first()
        if not branch:
            raise Http404
        qs = (BranchStock.objects.filter(branch=branch, variant__product__is_active=True)
              .select_related("variant__product__category").prefetch_related("variant__product__modifiers")
              .order_by("variant__product__category__sort_order", "variant__sku"))
        if request.query_params.get("category"):
            qs = qs.filter(variant__product__category_id=request.query_params["category"])
        q = request.query_params.get("q")
        if q:
            from django.db.models import Q
            qs = qs.filter(Q(variant__product__name__uz__icontains=q) | Q(variant__product__name__ru__icontains=q)
                           | Q(variant__sku__icontains=q) | Q(variant__barcode=q))
        page = max(int(request.query_params.get("page", 1)), 1)
        total = qs.count()
        items = []
        for s in qs[(page - 1) * self.PAGE: page * self.PAGE]:
            p, free = s.variant.product, s.available_qty - s.reserved_qty
            items.append({"variant_id": str(s.variant_id), "product_id": str(p.id), "sku": s.variant.sku, "name": p.name,
                          "description": p.description, "unit": p.unit, "is_weighted": p.is_weighted,
                          "attributes": s.variant.attributes, "images": p.images, "price": s.price,
                          "in_stock": (not s.is_stopped) and free > 0, "available": str(max(free, Decimal(0))),
                          "category_id": str(p.category_id) if p.category_id else None,
                          "modifiers": [{"id": str(m.id), "name": m.name, "price": m.price, "max_qty": m.max_qty} for m in p.modifiers.all()]})
        from apps.catalog.models import Category
        cats = [{"id": str(c.id), "name": c.name, "parent_id": str(c.parent_id) if c.parent_id else None}
                for c in Category.objects.filter(tenant=tenant).order_by("sort_order")]
        return Response({"items": items, "categories": cats, "page": page, "total": total, "page_size": self.PAGE})


class Slots(APIView):
    def get(self, request, slug, branch_id):
        tenant = get_tenant(slug)
        now = timezone.now()
        qs = TimeSlot.objects.filter(tenant=tenant, branch_id=branch_id, starts_at__gt=now,
                                     starts_at__lt=now + timedelta(days=3)).order_by("starts_at")
        return Response([{"id": str(s.id), "starts_at": s.starts_at, "ends_at": s.ends_at,
                          "left": s.capacity - s.booked, "full": s.booked >= s.capacity} for s in qs])


class CartQuote(APIView):
    def post(self, request, slug):
        tenant = get_tenant(slug)
        a = request.data.get("address") or {}
        try:
            lat, lng = float(a["lat"]), float(a["lng"])
        except (KeyError, TypeError, ValueError):
            raise ApiError(400, "validation_error", "address.lat/lng majburiy")
        found = geo.resolve(tenant, lat, lng)
        if request.data.get("branch_id"):
            found = [(b, z) for b, z in found if str(b.id) == str(request.data["branch_id"])]
        if not found:
            raise ApiError(422, "out_of_zone")
        branch, zone = found[0]
        q = build_quote(tenant, branch, zone, request.data.get("items") or [])
        eta = services.kitchen_eta(branch, tenant, timezone.now()) if tenant.profile == "restaurant" else None
        q["lines"] = [{k: v for k, v in l.items() if k not in ("stock", "cost")} for l in q["lines"]]
        return Response({**q, "branch_id": str(branch.id), "branch_open": geo.is_open(branch), "estimated_ready_at": eta})


# ------------------------------------------------------------ buyurtma (xaridor)
class OrderCreate(APIView):
    def post(self, request):
        slug = request.data.get("tenant_slug")
        if not slug:
            raise ApiError(400, "validation_error", "tenant_slug majburiy", field="tenant_slug")
        tenant = get_tenant(slug)

        def run():
            o = services.create_order(tenant, request.data, request.user)
            return order_dict(o, "customer"), 201
        return run_idempotent(request, "create_order", run)


class OrderDetail(APIView):
    def get(self, request, order_id):
        return Response(order_dict(customer_order(request, order_id)))


class OrderCancel(APIView):
    def post(self, request, order_id):
        o = customer_order(request, order_id)
        from django.db import transaction
        with transaction.atomic():
            o = services.cancel_by_customer(o, str(request.data.get("reason", "customer"))[:200])
        return Response(order_dict(o))


class OrderApproveChanges(APIView):
    def post(self, request, order_id):
        o = customer_order(request, order_id)
        d = request.data
        o = services.customer_respond(o.id, request.user or o.customer, d.get("approve"), d.get("items"))
        return Response(order_dict(Order.objects.select_related("branch").get(pk=o.pk)))


class OrderPayment(APIView):
    def post(self, request, order_id):
        o = customer_order(request, order_id)

        def run():
            p = pay_services.create_payment(o, uuid.UUID(request.headers["Idempotency-Key"]), request.data.get("provider"))
            return {"id": str(p.id), "status": p.status, "amount": p.amount, "provider": p.provider,
                    "checkout_url": p.checkout_url, "order_id": str(o.id)}, 201
        return run_idempotent(request, "create_payment", run)


class MyOrders(APIView):
    def get(self, request):
        u = need_user(request)
        qs = Order.objects.filter(customer=u).select_related("branch").order_by("-created_at")[:50]
        return Response([order_dict(o, with_items=False) for o in qs])


class Reorder(APIView):
    """Takroriy savat (FR-HIST): narx va qoldiq qayta tekshiriladi, buyurtma yaratilmaydi."""

    def post(self, request, order_id):
        o = customer_order(request, order_id)
        a = o.address
        found = [(b, z) for b, z in geo.resolve(o.tenant, a["lat"], a["lng"]) if b.id == o.branch_id]
        if not found:
            raise ApiError(422, "out_of_zone")
        items = [{"variant_id": str(i.variant_id), "qty": str(i.requested_qty),
                  "modifier_ids": [m["id"] for m in i.modifiers]} for i in o.items.exclude(status="removed")]
        q = build_quote(o.tenant, found[0][0], found[0][1], items)
        q["lines"] = [{k: v for k, v in l.items() if k not in ("stock", "cost")} for l in q["lines"]]
        return Response({**q, "address": a, "branch_id": str(o.branch_id), "items": items})


class Tracking(APIView):
    def get(self, request, token):
        o = Order.objects.select_related("branch").filter(tracking_token=token).first()
        if o is None:
            raise Http404
        if o.tracking_expires_at < timezone.now():
            raise ApiError(410, "tracking_expired")
        return Response(tracking_dict(o))


class TrackingAction(APIView):
    """Mehmon (tokenli havola) bekor qilish / tasdiqlash uchun."""

    def post(self, request, token, action):
        o = Order.objects.filter(tracking_token=token).first()
        if o is None:
            raise Http404
        if o.tracking_expires_at < timezone.now():
            raise ApiError(410, "tracking_expired")
        if action == "cancel":
            from django.db import transaction
            with transaction.atomic():
                o = services.cancel_by_customer(o, str(request.data.get("reason", "customer"))[:200])
        elif action == "approve-changes":
            o = services.customer_respond(o.id, None, request.data.get("approve"), request.data.get("items"))
        else:
            raise Http404
        return Response(tracking_dict(Order.objects.select_related("branch").get(pk=o.pk)))


# ------------------------------------------------------------ hamkor: buyurtmalar
PARTNER_ROLES = (Role.TENANT_OWNER, Role.BRANCH_MANAGER)
PICK_ROLES = (Role.PICKER, Role.BRANCH_MANAGER, Role.TENANT_OWNER)


def _branch_or_404(request, branch_id, *roles):
    b = Branch.objects.select_related("tenant").filter(pk=branch_id).first()
    if not b:
        raise Http404
    sc = require_staff(request, *roles)
    if not sc.can_branch(b, *roles):
        audit("branch", b.id, "access_denied", tenant_id=b.tenant_id, actor=request.user, request=request)
        raise Http404
    return b


class PartnerOrders(APIView):
    def get(self, request, branch_id):
        b = _branch_or_404(request, branch_id, *PARTNER_ROLES, Role.PICKER, Role.SUPPORT, Role.DISPATCHER)
        qs = Order.objects.filter(branch=b).select_related("branch").prefetch_related("items").order_by("-created_at")
        st = request.query_params.get("status")
        if st:
            qs = qs.filter(status__in=st.split(","))
        if request.query_params.get("since"):
            qs = qs.filter(updated_at__gt=request.query_params["since"])
        sc = Scope(request.user)
        aud = "staff"
        res = [order_dict(o, aud, with_items=True) for o in qs[:100]]
        if sc.has(Role.DISPATCHER) and not sc.has(*PARTNER_ROLES, Role.SUPPORT, Role.PLATFORM_ADMIN):
            for r in res:
                r.pop("customer_phone", None)   # dispetcher: to'lov/shaxsiy ma'lumotsiz
        return Response({"orders": res, "server_time": timezone.now()})


class PartnerOrderDetail(APIView):
    def get(self, request, order_id):
        o = Order.objects.select_related("branch", "tenant").filter(pk=order_id).first()
        if not o:
            raise Http404
        require_staff(request, *PARTNER_ROLES, Role.PICKER, Role.SUPPORT, Role.FINANCE)
        in_scope_or_404(request, o, *PARTNER_ROLES, Role.PICKER, Role.SUPPORT, Role.FINANCE)
        d = order_dict(o, "staff")
        d["history"] = [{"from": h.from_status, "to": h.to_status, "reason": h.reason, "at": h.created_at,
                         "actor": str(h.actor_id) if h.actor_id else None} for h in o.history.order_by("id")]
        d["payments"] = [{"id": str(p.id), "provider": p.provider, "status": p.status, "amount": p.amount,
                          "refunded": p.refunded_amount, "needs_attention": p.needs_attention} for p in o.payments.all()]
        return Response(d)


class PartnerTransition(APIView):
    def post(self, request, order_id):
        o = Order.objects.select_related("branch", "tenant").filter(pk=order_id).first()
        if not o:
            raise Http404
        require_staff(request, *PARTNER_ROLES, Role.PICKER)
        in_scope_or_404(request, o, *PARTNER_ROLES, Role.PICKER)
        to = request.data.get("to")
        try:
            to = S(to)
        except ValueError:
            raise ApiError(400, "validation_error", "to noto'g'ri", field="to")
        sc = Scope(request.user)
        if to not in services.PARTNER_TARGETS:
            raise ApiError(409, "invalid_transition", message="Bu holatga faqat yetkazish moduli o'tkazadi")
        if sc.has(Role.PICKER) and not sc.has(*PARTNER_ROLES, Role.PLATFORM_ADMIN) and to not in (S.PREPARING, S.READY):
            raise ApiError(403, "forbidden")
        o = services.transition(o, to, request.user, str(request.data.get("reason", ""))[:300], request.data.get("expected_version"))
        return Response(order_dict(Order.objects.select_related("branch").get(pk=o.pk), "staff"))


# ------------------------------------------------------------ yig'ish / oshxona
class PickingQueue(APIView):
    def get(self, request, branch_id):
        b = _branch_or_404(request, branch_id, *PICK_ROLES)
        qs = (Order.objects.filter(branch=b, status__in=[S.ACCEPTED, S.PREPARING, S.READY])
              .select_related("branch").prefetch_related("items").order_by("created_at"))
        out = []
        for o in qs:
            d = order_dict(o, "staff")
            d.pop("customer_phone", None)               # yig'uvchiga shaxsiy aloqa kerak emas
            d.pop("customer_name", None)
            out.append(d)
        return Response({"orders": out, "server_time": timezone.now()})


class PickItem(APIView):
    def patch(self, request, order_id, item_id):
        o = Order.objects.select_related("branch", "tenant").filter(pk=order_id).first()
        if not o:
            raise Http404
        require_staff(request, *PICK_ROLES)
        in_scope_or_404(request, o, *PICK_ROLES)
        d = request.data
        o = services.pick_item(o.id, item_id, request.user, d.get("action", "pick"), d.get("actual_qty"),
                               d.get("substitute_variant_id"), d.get("serial"))
        return Response(order_dict(Order.objects.select_related("branch").get(pk=o.pk), "staff"))


class PickByBarcode(APIView):
    """Shtrix-kod (kamera) bo'yicha qatorni topish."""

    def get(self, request, order_id):
        o = Order.objects.select_related("branch", "tenant").filter(pk=order_id).first()
        if not o:
            raise Http404
        require_staff(request, *PICK_ROLES)
        in_scope_or_404(request, o, *PICK_ROLES)
        code = request.query_params.get("code", "")
        it = o.items.filter(variant__barcode=code).first()
        if not it:
            raise ApiError(404, "not_found", "Bu shtrix-kod buyurtmada yo'q")
        return Response(item_dict(it))


class PrepTime(APIView):
    """Oshxona: tayyorlik vaqtini qo'lda belgilash (FR-P03)."""

    def post(self, request, order_id):
        o = Order.objects.select_related("branch", "tenant").filter(pk=order_id).first()
        if not o:
            raise Http404
        require_staff(request, *PICK_ROLES)
        in_scope_or_404(request, o, *PICK_ROLES)
        mins = int(request.data.get("minutes", 0))
        if not 1 <= mins <= 240:
            raise ApiError(400, "validation_error", "minutes 1..240", field="minutes")
        o.estimated_ready_at = timezone.now() + timedelta(minutes=mins)
        o.save(update_fields=["estimated_ready_at"])
        audit("order", o.id, "prep_time", tenant_id=o.tenant_id, actor=request.user, new={"minutes": mins})
        return Response(order_dict(o, "staff", with_items=False))
