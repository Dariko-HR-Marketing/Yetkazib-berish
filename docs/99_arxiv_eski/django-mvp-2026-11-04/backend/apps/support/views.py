"""Yordam xizmati, qaytarish, moliya solishtiruvi va hisobotlar."""
import csv
import io
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db.models import Sum
from django.http import Http404, HttpResponse
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.access import in_scope_or_404
from apps.accounts.auth import Scope, require_staff
from apps.accounts.models import Role
from apps.orders.models import Order, OrderItem
from apps.orders.views import customer_order
from apps.payments import services as pay_services
from apps.payments.models import Payment, Refund
from apps.platform.errors import ApiError
from apps.platform.services import audit, run_idempotent

from .models import Ticket

CS = (Role.SUPPORT, Role.TENANT_OWNER, Role.BRANCH_MANAGER)


def ticket_dict(t):
    return {"id": str(t.id), "order_id": str(t.order_id), "order_number": t.order.number, "order_item_id": str(t.order_item_id) if t.order_item_id else None,
            "item_name": t.order_item.name_snapshot if t.order_item_id else None, "type": t.type, "message": t.message,
            "attachments": t.attachments, "status": t.status, "assignee_id": str(t.assignee_id) if t.assignee_id else None,
            "created_at": t.created_at, "first_response_at": t.first_response_at, "resolved_at": t.resolved_at}


class Tickets(APIView):
    def post(self, request):
        """Xaridor: holat sahifasidan mahsulot qatori bo'yicha murojaat (FR-SUP)."""
        o = customer_order(request, request.data.get("order_id"))
        item = None
        if request.data.get("order_item_id"):
            item = OrderItem.objects.filter(pk=request.data["order_item_id"], order=o).first()
            if not item:
                raise ApiError(404, "not_found", "Mahsulot qatori topilmadi")
        typ = request.data.get("type", "other")
        if typ not in ("damaged", "missing", "late", "other"):
            raise ApiError(400, "validation_error", "type noto'g'ri", field="type")
        t = Ticket.objects.create(tenant=o.tenant, order=o, order_item=item, type=typ, message=str(request.data.get("message", ""))[:2000],
                                  attachments=[str(a)[:300] for a in (request.data.get("attachments") or [])][:5])
        audit("ticket", t.id, "create", tenant_id=o.tenant_id, actor=request.user, new={"type": typ})
        return Response(ticket_dict(t), status=201)

    def get(self, request):
        sc = require_staff(request, *CS)
        qs = Ticket.objects.select_related("order", "order_item").order_by("-created_at")
        if not sc.is_admin:
            qs = qs.filter(order__branch_id__in=sc.branch_ids_for(*CS))
        if request.query_params.get("status"):
            qs = qs.filter(status__in=request.query_params["status"].split(","))
        return Response([ticket_dict(t) for t in qs[:200]])


class TicketDetail(APIView):
    def patch(self, request, ticket_id):
        t = Ticket.objects.select_related("order__branch", "order_item").filter(pk=ticket_id).first()
        if not t:
            raise Http404
        require_staff(request, *CS)
        in_scope_or_404(request, t.order, *CS)
        st = request.data.get("status")
        if st not in (None, "open", "in_progress", "resolved"):
            raise ApiError(400, "validation_error", "status noto'g'ri", field="status")
        now = timezone.now()
        if st:
            t.status = st
            if st == "resolved":
                t.resolved_at = now
        t.first_response_at = t.first_response_at or now
        t.assignee = t.assignee or request.user
        t.save()
        audit("ticket", t.id, "update", tenant_id=t.tenant_id, actor=request.user, new={"status": t.status}, request=request)
        return Response(ticket_dict(t))


class OrderRefund(APIView):
    """POST /support/orders/{id}/refunds {amount, reason} (Idempotency-Key). Limitdan oshsa — moliya tasdig'i."""

    def post(self, request, order_id):
        o = Order.objects.select_related("branch", "tenant").filter(pk=order_id).first()
        if not o:
            raise Http404
        sc = require_staff(request, Role.SUPPORT, Role.FINANCE)
        in_scope_or_404(request, o, Role.SUPPORT, Role.FINANCE)
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            raise ApiError(400, "reason_required")
        try:
            amount = int(request.data["amount"])
        except (KeyError, ValueError, TypeError):
            raise ApiError(400, "validation_error", "amount (tiyin) majburiy", field="amount")

        def run():
            r = pay_services.request_refund(o, amount, reason, __import__("uuid").UUID(request.headers["Idempotency-Key"]),
                                            request.user, can_approve=sc.has(Role.FINANCE, Role.PLATFORM_ADMIN))
            return {"id": str(r.id), "amount": r.amount, "state": r.state}, 201
        return run_idempotent(request, "create_refund", run)


class FinanceRefunds(APIView):
    def get(self, request):
        sc = require_staff(request, Role.FINANCE)
        qs = Refund.objects.select_related("payment__order").order_by("-created_at")
        if not sc.is_admin:
            qs = qs.filter(tenant_id__in=sc.tenant_ids(Role.FINANCE))
        if request.query_params.get("state"):
            qs = qs.filter(state=request.query_params["state"])
        return Response([{"id": str(r.id), "order_number": r.payment.order.number, "amount": r.amount, "reason": r.reason, "state": r.state,
                          "created_at": r.created_at} for r in qs[:200]])


class FinanceRefundApprove(APIView):
    def post(self, request, refund_id):
        sc = require_staff(request, Role.FINANCE)
        r = Refund.objects.filter(pk=refund_id).first()
        if not r or not sc.can_tenant(r.tenant_id, Role.FINANCE):
            raise Http404
        r = pay_services.approve_refund(r.id, request.user)
        return Response({"id": str(r.id), "state": r.state})


def _day_range(request):
    tz = ZoneInfo(settings.TIME_ZONE)
    try:
        d = datetime.strptime(request.query_params.get("date") or timezone.localdate().isoformat(), "%Y-%m-%d")
    except ValueError:
        raise ApiError(400, "validation_error", "date: YYYY-MM-DD", field="date")
    a = d.replace(tzinfo=tz)
    return a, a + timedelta(days=1)


class Reconciliation(APIView):
    """Kun yakuni: buyurtmalar <-> to'lovlar <-> qaytarishlar nomuvofiqliklari (FR-FIN)."""

    def get(self, request):
        sc = require_staff(request, Role.FINANCE)
        a, b = _day_range(request)
        orders = Order.objects.filter(created_at__gte=a, created_at__lt=b).prefetch_related("payments__refunds")
        if not sc.is_admin:
            orders = orders.filter(tenant_id__in=sc.tenant_ids(Role.FINANCE))
        rows, mism = [], []
        for o in orders:
            pays = list(o.payments.all())
            paid = sum(p.amount for p in pays if p.status in ("paid", "partially_refunded", "refunded", "refunding"))
            refunded = sum(p.refunded_amount for p in pays)
            net = paid - refunded
            expected = o.final_total if o.final_total is not None else o.total
            issues = []
            if o.status == "completed" and net != expected:
                issues.append("completed_amount_mismatch")
            if o.status == "cancelled" and net != 0:
                issues.append("cancelled_not_fully_refunded")
            if any(p.needs_attention for p in pays):
                issues.append("payment_needs_attention")
            if o.status == "completed" and not pays:
                issues.append("no_payment")
            row = {"number": o.number, "status": o.status, "expected": expected if o.status != "cancelled" else 0, "paid": paid,
                   "refunded": refunded, "net": net, "issues": issues}
            rows.append(row)
            if issues:
                mism.append(row)
        if request.query_params.get("format") == "csv":
            out = io.StringIO()
            w = csv.writer(out)
            w.writerow(["number", "status", "expected", "paid", "refunded", "net", "issues"])
            for r in rows:
                w.writerow([r["number"], r["status"], r["expected"], r["paid"], r["refunded"], r["net"], ";".join(r["issues"])])
            resp = HttpResponse(out.getvalue(), content_type="text/csv; charset=utf-8")
            resp["Content-Disposition"] = f'attachment; filename="reconciliation-{a.date()}.csv"'
            return resp
        return Response({"date": str(a.date()), "orders": len(rows), "mismatches": mism, "rows": rows,
                         "totals": {"paid": sum(r["paid"] for r in rows), "refunded": sum(r["refunded"] for r in rows)}})


class AttentionQueue(APIView):
    """Operator navbati: noaniq to'lovlar (AC-06), tasdiq muddati o'tgan buyurtmalar."""

    def get(self, request):
        sc = require_staff(request, Role.FINANCE, Role.SUPPORT, Role.TENANT_OWNER, Role.BRANCH_MANAGER)
        pays = Payment.objects.filter(needs_attention=True).select_related("order")
        if not sc.is_admin:
            pays = pays.filter(order__branch_id__in=sc.branch_ids_for())
        return Response({"payments": [{"id": str(p.id), "order_number": p.order.number, "amount": p.amount, "status": p.status} for p in pays[:100]]})


class Reports(APIView):
    """Sotuv, o'rtacha chek, bekor sabablari, kanal, buyurtma hissasi (FR-PT06, 11-bo'lim)."""

    def get(self, request):
        sc = require_staff(request, Role.TENANT_OWNER, Role.BRANCH_MANAGER, Role.FINANCE)
        tz = ZoneInfo(settings.TIME_ZONE)
        try:
            fr = datetime.strptime(request.query_params.get("from") or (timezone.localdate() - timedelta(days=6)).isoformat(), "%Y-%m-%d").replace(tzinfo=tz)
            to = datetime.strptime(request.query_params.get("to") or timezone.localdate().isoformat(), "%Y-%m-%d").replace(tzinfo=tz) + timedelta(days=1)
        except ValueError:
            raise ApiError(400, "validation_error", "from/to: YYYY-MM-DD")
        qs = Order.objects.filter(created_at__gte=fr, created_at__lt=to).select_related("tenant", "branch").prefetch_related("items")
        if not sc.is_admin:
            qs = qs.filter(branch_id__in=sc.branch_ids_for(Role.TENANT_OWNER, Role.BRANCH_MANAGER, Role.FINANCE))
        if request.query_params.get("branch_id"):
            qs = qs.filter(branch_id=request.query_params["branch_id"])
        orders = list(qs)
        done = [o for o in orders if o.status == "completed"]
        sales = sum(o.final_total if o.final_total is not None else o.total for o in done)
        contribs = []
        for o in done:
            eco = {**__import__("apps.tenants.models", fromlist=["DEFAULT_ECONOMICS"]).DEFAULT_ECONOMICS, **(o.tenant.settings or {}).get("economics", {})}
            revenue = o.final_total if o.final_total is not None else o.total
            margin = sum((i.unit_price - i.cost_snapshot) * float(i.actual_qty if i.actual_qty is not None else i.requested_qty)
                         for i in o.items.all() if i.status != "removed")
            commission = revenue * eco["payment_commission_pct"] / 100 if o.payment_method == "online" else 0
            c = margin + o.delivery_fee - eco["pick_cost"] - eco["pack_cost"] - eco["courier_cost"] - commission - eco["other_var_cost"]
            contribs.append(int(c))
        cancel = Counter(o.cancel_reason or "—" for o in orders if o.status == "cancelled")
        by_channel = Counter(o.channel for o in orders)
        by_day = defaultdict(lambda: {"orders": 0, "sales": 0})
        for o in done:
            k = o.created_at.astimezone(tz).date().isoformat()
            by_day[k]["orders"] += 1
            by_day[k]["sales"] += o.final_total if o.final_total is not None else o.total
        return Response({
            "from": fr.date(), "to": (to - timedelta(days=1)).date(), "orders_total": len(orders), "orders_completed": len(done),
            "sales": sales, "avg_check": int(sales / len(done)) if done else 0,
            "cancel_rate": round(sum(cancel.values()) / len(orders), 4) if orders else 0,
            "cancel_reasons": dict(cancel), "by_channel": dict(by_channel),
            "by_day": [{"date": k, **v} for k, v in sorted(by_day.items())],
            "contribution": {"avg_per_order": int(sum(contribs) / len(contribs)) if contribs else 0,
                             "negative_orders": sum(1 for c in contribs if c < 0), "total": sum(contribs)}})
