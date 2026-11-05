"""Hamkor katalogi: CRUD, narx/qoldiq/stop-list, CSV import/eksport (FR-PT02/03)."""
import csv
import io
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.http import Http404, HttpResponse
from django.utils import timezone
from rest_framework.parsers import BaseParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.auth import require_staff
from apps.accounts.models import Role
from apps.platform.errors import ApiError
from apps.platform.services import audit
from apps.tenants.models import Branch, Tenant

from .models import BranchStock, Category, Modifier, Product, Variant

MGR = (Role.TENANT_OWNER, Role.BRANCH_MANAGER)


def _tenant_for(request, tenant_id=None):
    sc = require_staff(request, *MGR)
    ids = sc.tenant_ids(*MGR) | {b.tenant_id for b in Branch.objects.filter(id__in=sc.branch_ids_for(*MGR))}
    if sc.is_admin:
        t = Tenant.objects.filter(pk=tenant_id).first() if tenant_id else None
    else:
        t = Tenant.objects.filter(pk=tenant_id, id__in=ids).first() if tenant_id else Tenant.objects.filter(id__in=ids).first()
    if not t:
        raise Http404
    return sc, t


def _name(v, field="name"):
    if not isinstance(v, dict) or not v.get("uz"):
        raise ApiError(400, "validation_error", f"{field}: {{'uz': '...', 'ru': '...'}} ko'rinishida (uz majburiy)", field=field)
    return {k: str(x)[:200] for k, x in v.items() if k in ("uz", "ru")}


def product_dict(p):
    return {"id": str(p.id), "name": p.name, "description": p.description, "unit": p.unit, "is_weighted": p.is_weighted,
            "is_fragile": p.is_fragile, "requires_serial": p.requires_serial, "images": p.images, "is_active": p.is_active,
            "category_id": str(p.category_id) if p.category_id else None,
            "variants": [{"id": str(v.id), "sku": v.sku, "barcode": v.barcode, "attributes": v.attributes, "weight_g": v.weight_g,
                          "volume_cm3": v.volume_cm3} for v in p.variants.all()],
            "modifiers": [{"id": str(m.id), "name": m.name, "price": m.price, "max_qty": m.max_qty} for m in p.modifiers.all()]}


class Categories(APIView):
    def get(self, request):
        _, t = _tenant_for(request, request.query_params.get("tenant_id"))
        return Response([{"id": str(c.id), "name": c.name, "parent_id": str(c.parent_id) if c.parent_id else None, "sort_order": c.sort_order}
                         for c in Category.objects.filter(tenant=t).order_by("sort_order")])

    def post(self, request):
        _, t = _tenant_for(request, request.data.get("tenant_id"))
        c = Category.objects.create(tenant=t, name=_name(request.data.get("name")), sort_order=int(request.data.get("sort_order", 0)),
                                    parent_id=request.data.get("parent_id") or None)
        audit("category", c.id, "create", tenant_id=t.id, actor=request.user, new=c.name, request=request)
        return Response({"id": str(c.id)}, status=201)


class Products(APIView):
    def get(self, request):
        _, t = _tenant_for(request, request.query_params.get("tenant_id"))
        qs = Product.objects.filter(tenant=t).prefetch_related("variants", "modifiers").order_by("-id")[:500]
        return Response([product_dict(p) for p in qs])

    @transaction.atomic
    def post(self, request):
        sc, t = _tenant_for(request, request.data.get("tenant_id"))
        d = request.data
        p = Product.objects.create(
            tenant=t, name=_name(d.get("name")), description=d.get("description"), unit=d.get("unit", "pcs"),
            is_weighted=bool(d.get("is_weighted", False)), is_fragile=bool(d.get("is_fragile", False)),
            requires_serial=bool(d.get("requires_serial", False)), images=d.get("images", []),
            category_id=d.get("category_id") or None)
        for m in d.get("modifiers", []):
            Modifier.objects.create(tenant=t, product=p, name=_name(m.get("name")), price=int(m.get("price", 0)), max_qty=int(m.get("max_qty", 1)))
        variants = d.get("variants") or [{"sku": d.get("sku")}]
        for v in variants:
            if not v.get("sku"):
                raise ApiError(400, "validation_error", "variants[].sku majburiy")
            if Variant.objects.filter(tenant=t, sku=v["sku"]).exists():
                raise ApiError(409, "validation_error", f"SKU band: {v['sku']}", field="sku")
            var = Variant.objects.create(tenant=t, product=p, sku=v["sku"], barcode=v.get("barcode", ""), attributes=v.get("attributes", {}),
                                         weight_g=v.get("weight_g"), volume_cm3=v.get("volume_cm3"))
            for s in v.get("stock", []):
                b = Branch.objects.filter(pk=s.get("branch_id"), tenant=t).first()
                if not b or not sc.can_branch(b, *MGR):
                    raise Http404
                BranchStock.objects.create(tenant=t, branch=b, variant=var, price=int(s["price"]), cost=int(s.get("cost", 0)),
                                           available_qty=Decimal(str(s.get("available_qty", 0))), synced_at=timezone.now())
        audit("product", p.id, "create", tenant_id=t.id, actor=request.user, new=product_dict(p), request=request)
        return Response(product_dict(p), status=201)


class ProductDetail(APIView):
    def _p(self, request, pid):
        p = Product.objects.filter(pk=pid).prefetch_related("variants", "modifiers").first()
        if not p:
            raise Http404
        sc = require_staff(request, *MGR)
        if not sc.can_tenant(p.tenant_id, *MGR) and not any(sc.can_branch(b, *MGR) for b in Branch.objects.filter(tenant_id=p.tenant_id)):
            audit("product", p.id, "access_denied", tenant_id=p.tenant_id, actor=request.user, request=request)
            raise Http404
        return p

    def patch(self, request, product_id):
        p = self._p(request, product_id)
        old = product_dict(p)
        d = request.data
        if "name" in d:
            p.name = _name(d["name"])
        for f in ("description", "unit", "is_weighted", "is_fragile", "requires_serial", "images", "is_active"):
            if f in d:
                setattr(p, f, d[f])
        if "category_id" in d:
            p.category_id = d["category_id"] or None
        p.save()
        audit("product", p.id, "update", tenant_id=p.tenant_id, actor=request.user, old=old, new=product_dict(p), request=request)
        return Response(product_dict(p))


class StockUpdate(APIView):
    """PUT /partner/branches/{id}/stock — [{variant_id|sku, price, available_qty, is_stopped, online_quota, cost}]"""

    @transaction.atomic
    def put(self, request, branch_id):
        b = Branch.objects.filter(pk=branch_id).first()
        sc = require_staff(request, *MGR)
        if not b or not sc.can_branch(b, *MGR):
            if b:
                audit("branch", b.id, "access_denied", tenant_id=b.tenant_id, actor=request.user, request=request)
            raise Http404
        rows = request.data if isinstance(request.data, list) else request.data.get("items", [])
        updated = 0
        for r in rows:
            v = (Variant.objects.filter(tenant=b.tenant, pk=r["variant_id"]).first() if r.get("variant_id")
                 else Variant.objects.filter(tenant=b.tenant, sku=r.get("sku")).first())
            if not v:
                raise ApiError(404, "not_found", f"Variant topilmadi: {r.get('variant_id') or r.get('sku')}")
            st, created = BranchStock.objects.select_for_update().get_or_create(
                branch=b, variant=v, defaults={"tenant": b.tenant, "price": int(r.get("price", 0))})
            old = {"price": st.price, "available_qty": str(st.available_qty), "is_stopped": st.is_stopped}
            if "price" in r:
                st.price = int(r["price"])
            if "cost" in r:
                st.cost = int(r["cost"])
            if "available_qty" in r:
                q = Decimal(str(r["available_qty"]))
                if q < st.reserved_qty:
                    raise ApiError(409, "validation_error", "Qoldiq band qilingan miqdordan kam bo'lishi mumkin emas", field="available_qty")
                st.available_qty = q
            if "is_stopped" in r:
                st.is_stopped = bool(r["is_stopped"])
            if "online_quota" in r:
                st.online_quota = None if r["online_quota"] is None else Decimal(str(r["online_quota"]))
            st.source, st.synced_at = r.get("source", "manual") if r.get("source") in ("manual", "csv", "pos") else "manual", timezone.now()
            st.save()
            audit("branch_stock", f"{b.id}:{v.id}", "update", tenant_id=b.tenant_id, actor=request.user, old=old,
                  new={"price": st.price, "available_qty": str(st.available_qty), "is_stopped": st.is_stopped}, request=request)
            updated += 1
        return Response({"updated": updated})

    def get(self, request, branch_id):
        b = Branch.objects.filter(pk=branch_id).first()
        sc = require_staff(request, *MGR, Role.PICKER)
        if not b or not sc.can_branch(b, *MGR, Role.PICKER):
            raise Http404
        return Response([{"variant_id": str(s.variant_id), "sku": s.variant.sku, "name": s.variant.product.name, "price": s.price, "cost": s.cost,
                          "barcode": s.variant.barcode, "available_qty": str(s.available_qty), "reserved_qty": str(s.reserved_qty), "is_stopped": s.is_stopped,
                          "online_quota": None if s.online_quota is None else str(s.online_quota), "source": s.source}
                         for s in BranchStock.objects.filter(branch=b).select_related("variant__product").order_by("variant__sku")])


CSV_COLS = ["sku", "name_uz", "name_ru", "category", "unit", "is_weighted", "barcode", "price", "cost", "qty", "stopped"]


class CsvParser(BaseParser):
    media_type = "text/csv"

    def parse(self, stream, media_type=None, parser_context=None):
        return stream.read().decode("utf-8-sig")


class CatalogImport(APIView):
    parser_classes = [CsvParser, MultiPartParser, JSONParser]
    """CSV import (1000 qator ~1 daqiqadan kam): sku,name_uz,name_ru,category,unit,is_weighted,barcode,price,cost,qty,stopped.
    Narx so'mda (tiyinga aylantiriladi). Xatolar qator raqami bilan hisobotda qaytariladi; to'g'ri qatorlar saqlanadi."""

    def post(self, request):
        data = request.data if isinstance(request.data, dict) or hasattr(request.data, "get") else {}
        branch_id = request.query_params.get("branch_id") or data.get("branch_id")
        b = Branch.objects.select_related("tenant").filter(pk=branch_id).first()
        sc = require_staff(request, *MGR)
        if not b or not sc.can_branch(b, *MGR):
            raise Http404
        f = request.FILES.get("file")
        raw = f.read().decode("utf-8-sig") if f else (request.data if isinstance(request.data, str) else "")
        reader = csv.DictReader(io.StringIO(raw))
        missing = {"sku", "name_uz", "price"} - set(reader.fieldnames or [])
        if missing:
            raise ApiError(400, "validation_error", f"CSV ustunlari yetishmaydi: {', '.join(sorted(missing))}")
        t, ok, errors = b.tenant, 0, []
        cats = {c.name.get("uz"): c for c in Category.objects.filter(tenant=t)}
        for n, row in enumerate(reader, start=2):
            try:
                with transaction.atomic():
                    sku = (row.get("sku") or "").strip()
                    if not sku or not (row.get("name_uz") or "").strip():
                        raise ValueError("sku va name_uz majburiy")
                    price = int(Decimal(row["price"].replace(" ", "")) * 100)
                    qty = Decimal((row.get("qty") or "0").replace(" ", "") or 0)
                    if price < 0 or qty < 0:
                        raise ValueError("manfiy qiymat")
                    cat = None
                    if (row.get("category") or "").strip():
                        cat = cats.get(row["category"].strip()) or Category.objects.create(tenant=t, name={"uz": row["category"].strip()})
                        cats[row["category"].strip()] = cat
                    var = Variant.objects.filter(tenant=t, sku=sku).select_related("product").first()
                    weighted = str(row.get("is_weighted", "")).strip().lower() in ("1", "true", "ha", "yes")
                    name = {"uz": row["name_uz"].strip(), **({"ru": row["name_ru"].strip()} if (row.get("name_ru") or "").strip() else {})}
                    if var is None:
                        p = Product.objects.create(tenant=t, name=name, category=cat, unit=(row.get("unit") or "pcs").strip(), is_weighted=weighted)
                        var = Variant.objects.create(tenant=t, product=p, sku=sku, barcode=(row.get("barcode") or "").strip())
                    else:
                        var.product.name, var.product.category = name, cat or var.product.category
                        var.product.save()
                    st, _ = BranchStock.objects.select_for_update().get_or_create(branch=b, variant=var, defaults={"tenant": t, "price": price})
                    if qty < st.reserved_qty:
                        raise ValueError("qoldiq band qilinganidan kam")
                    st.price, st.available_qty, st.source, st.synced_at = price, qty, "csv", timezone.now()
                    if row.get("cost"):
                        st.cost = int(Decimal(row["cost"]) * 100)
                    st.is_stopped = str(row.get("stopped", "")).strip().lower() in ("1", "true", "ha", "yes")
                    st.save()
                    ok += 1
            except (ValueError, InvalidOperation, KeyError) as e:
                errors.append({"row": n, "sku": row.get("sku"), "error": str(e)})
        audit("catalog", b.id, "csv_import", tenant_id=t.id, actor=request.user, new={"ok": ok, "errors": len(errors)}, request=request)
        return Response({"imported": ok, "errors": errors}, status=200 if not errors else 207)


class CatalogExport(APIView):
    def get(self, request):
        b = Branch.objects.select_related("tenant").filter(pk=request.query_params.get("branch_id")).first()
        sc = require_staff(request, *MGR)
        if not b or not sc.can_branch(b, *MGR):
            raise Http404
        out = io.StringIO()
        w = csv.writer(out)
        w.writerow(CSV_COLS)
        for s in BranchStock.objects.filter(branch=b).select_related("variant__product__category").order_by("variant__sku"):
            p = s.variant.product
            w.writerow([s.variant.sku, p.name.get("uz", ""), p.name.get("ru", ""), p.category.name.get("uz", "") if p.category else "", p.unit,
                        int(p.is_weighted), s.variant.barcode, s.price / 100, s.cost / 100, s.available_qty, int(s.is_stopped)])
        r = HttpResponse(out.getvalue(), content_type="text/csv; charset=utf-8")
        r["Content-Disposition"] = 'attachment; filename="catalog.csv"'
        return r
