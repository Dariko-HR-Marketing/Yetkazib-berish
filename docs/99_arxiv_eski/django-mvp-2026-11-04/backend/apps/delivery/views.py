from django.http import Http404
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.access import in_scope_or_404
from apps.accounts.auth import Scope, require_staff
from apps.accounts.models import Role, User
from apps.platform.errors import ApiError
from apps.platform.services import audit

from . import services
from .models import Shipment, ShipmentStatus as SS

DISP = (Role.DISPATCHER, Role.BRANCH_MANAGER, Role.TENANT_OWNER, Role.SUPPORT)


def _qs():
    return Shipment.objects.select_related("order__customer", "order__branch", "courier", "branch")


class DispatchShipments(APIView):
    """Dispetcher: hududdagi jo'natmalar. Buyurtma/to'lov tafsilotisiz."""

    def get(self, request):
        sc = require_staff(request, *DISP)
        qs = _qs().order_by("-created_at")
        if not sc.is_admin:
            qs = qs.filter(branch_id__in=sc.branch_ids_for(*DISP))
        st = request.query_params.get("status")
        if st:
            qs = qs.filter(status__in=st.split(","))
        else:
            qs = qs.exclude(status__in=[SS.DELIVERED, SS.RETURNED])
        out = []
        for sh in qs[:200]:
            d = services.shipment_dict(sh)
            d["customer_phone"] = services.mask_phone(sh.order.customer_phone) if not sc.has(Role.SUPPORT, Role.BRANCH_MANAGER, Role.TENANT_OWNER) else sh.order.customer_phone
            d["courier"] = {"id": str(sh.courier_id), "name": sh.courier.full_name, "phone": sh.courier.phone} if sh.courier_id else None
            out.append(d)
        return Response(out)


class Couriers(APIView):
    def get(self, request):
        sc = require_staff(request, *DISP)
        from apps.accounts.models import UserRole
        qs = UserRole.objects.filter(role=Role.COURIER).select_related("user")
        if not sc.is_admin:
            qs = qs.filter(tenant_id__in=sc.tenant_ids(*DISP) | {b.tenant_id for b in __import__("apps.tenants.models", fromlist=["Branch"]).Branch.objects.filter(id__in=sc.branch_ids_for(*DISP))})
        busy = dict.fromkeys(Shipment.objects.filter(status__in=services.ACTIVE).values_list("courier_id", flat=True), True)
        return Response([{"id": str(r.user_id), "name": r.user.full_name, "phone": r.user.phone, "busy": r.user_id in busy}
                         for r in qs.distinct()])


class Assign(APIView):
    def post(self, request, shipment_id):
        sh = _qs().filter(pk=shipment_id).first()
        if not sh:
            raise Http404
        require_staff(request, *DISP)
        in_scope_or_404(request, sh, *DISP)
        courier = User.objects.filter(pk=request.data.get("courier_id"), is_active=True).first()
        if not courier:
            raise ApiError(404, "not_found", "Kuryer topilmadi")
        sh = services.assign(sh.id, courier, request.user, request.data.get("vehicle_type"))
        return Response(services.shipment_dict(_qs().get(pk=sh.pk)))


class Resolve(APIView):
    def post(self, request, shipment_id):
        sh = _qs().filter(pk=shipment_id).first()
        if not sh:
            raise Http404
        require_staff(request, Role.DISPATCHER, Role.SUPPORT, Role.BRANCH_MANAGER, Role.TENANT_OWNER)
        in_scope_or_404(request, sh, Role.DISPATCHER, Role.SUPPORT, Role.BRANCH_MANAGER, Role.TENANT_OWNER)
        if request.data.get("action") == "unlock_pin":
            services.reset_pin_lock(sh.id, request.user)
            return Response({"ok": True})
        res = services.resolve_failed(sh.id, request.user, request.data.get("action"))
        return Response(services.shipment_dict(_qs().get(pk=res.pk)))


class CourierShipments(APIView):
    """Kuryer faqat o'z topshiriqlarini ko'radi (AC-05)."""

    def get(self, request):
        require_staff(request, Role.COURIER)
        qs = _qs().filter(courier=request.user).order_by("-created_at")
        if request.query_params.get("history"):
            qs = qs.filter(status__in=[SS.DELIVERED, SS.FAILED, SS.RETURNED])[:30]
        else:
            qs = qs.filter(status__in=services.ACTIVE)
        return Response([services.shipment_dict(s, for_courier=True) for s in qs])


class CourierShipment(APIView):
    def get(self, request, shipment_id):
        require_staff(request, Role.COURIER)
        sh = _qs().filter(pk=shipment_id, courier=request.user).first()
        if not sh:
            sh_any = Shipment.objects.filter(pk=shipment_id).first()
            if sh_any:
                audit("shipment", sh_any.id, "access_denied", tenant_id=sh_any.tenant_id, actor=request.user, request=request)
            raise Http404
        return Response(services.shipment_dict(sh, for_courier=True))


class ShipmentAction(APIView):
    """POST /delivery/shipments/{id}/status  {action: reject|pickup|on_the_way|contact|deliver|fail, pin, reason, pod_type, pod_url}"""

    def post(self, request, shipment_id):
        require_staff(request, Role.COURIER)
        sh = services.courier_action(shipment_id, request.user, request.data.get("action"), request.data)
        return Response(services.shipment_dict(_qs().get(pk=sh.pk), for_courier=True))
