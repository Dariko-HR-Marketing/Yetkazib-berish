"""Savat narxi serverda hisoblanadi (FR-CART). Mijoz yuborgan narxga ishonilmaydi."""
from decimal import Decimal, InvalidOperation

from apps.catalog.models import BranchStock, Modifier
from apps.platform.errors import ApiError


def to_qty(v, weighted):
    try:
        q = Decimal(str(v))
    except InvalidOperation:
        raise ApiError(400, "validation_error", "qty noto'g'ri", field="qty")
    if q <= 0:
        raise ApiError(400, "validation_error", "qty > 0 bo'lishi kerak", field="qty")
    if not weighted and q != q.to_integral_value():
        raise ApiError(400, "validation_error", "Dona mahsulot butun son bo'lishi kerak", field="qty")
    return q.quantize(Decimal("0.001"))


def build_quote(tenant, branch, zone, items_in):
    """Qaytaradi: dict (lines, subtotal, delivery_fee, total, problems). Muammolar xatolik emas, ro'yxat."""
    if not items_in:
        raise ApiError(400, "validation_error", "Savat bo'sh", field="items")
    variant_ids = [i.get("variant_id") for i in items_in]
    stocks = {str(s.variant_id): s for s in BranchStock.objects
              .filter(branch=branch, variant_id__in=variant_ids).select_related("variant__product")}
    lines, problems, subtotal = [], [], 0
    for raw in items_in:
        vid = str(raw.get("variant_id"))
        st = stocks.get(vid)
        if st is None or st.variant.tenant_id != tenant.id or not st.variant.product.is_active:
            problems.append({"variant_id": vid, "code": "not_available"})
            continue
        prod = st.variant.product
        qty = to_qty(raw.get("qty", 1), prod.is_weighted)
        mods, mod_price = [], 0
        for m in Modifier.objects.filter(product=prod, id__in=raw.get("modifier_ids") or []):
            mods.append({"id": str(m.id), "name": m.name, "price": m.price})
            mod_price += m.price
        free = st.available_qty - st.reserved_qty
        if st.is_stopped or free < qty:
            problems.append({"variant_id": vid, "code": "out_of_stock", "available": str(max(free, Decimal(0)))})
        line = int(round((st.price + mod_price) * qty))
        subtotal += line
        lines.append({"variant_id": vid, "name": prod.name, "attributes": st.variant.attributes, "qty": str(qty),
                      "unit": prod.unit, "is_weighted": prod.is_weighted, "unit_price": st.price,
                      "modifiers": mods, "modifiers_price": mod_price, "cost": st.cost,
                      "requires_serial": prod.requires_serial, "line_total": line, "stock": st})
    fee = zone.delivery_fee
    if zone.free_from is not None and subtotal >= zone.free_from:
        fee = 0
    if subtotal < zone.min_order:
        problems.append({"code": "min_order", "min_order": zone.min_order, "shortfall": zone.min_order - subtotal})
    return {"lines": lines, "subtotal": subtotal, "delivery_fee": fee, "discount": 0,
            "total": subtotal + fee, "problems": problems, "min_order": zone.min_order, "free_from": zone.free_from}
