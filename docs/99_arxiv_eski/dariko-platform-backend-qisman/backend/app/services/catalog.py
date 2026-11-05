"""Katalog, filial narxi/qoldig'i, xizmat hududi va vaqt oraliqlari (FR-CAT, FR-ZONE, FR-SLOT, FR-PT02..04)."""
from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from ..core import ApiError, distance_km, not_found, point_in_polygon
from ..db import Conn, dumps, iso, loads, new_id, now
from .common import audit

LOCAL_TZ = ZoneInfo("Asia/Tashkent")
WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def tenant_by_slug(c: Conn, slug: str) -> dict:
    t = c.one("SELECT * FROM tenants WHERE slug = :s AND is_active", {"s": slug})
    if not t:
        raise not_found("Hamkor")
    t["brand"] = loads(t["brand"])
    return t


def branch_of(c: Conn, tenant_id: str, branch_id: str) -> dict:
    b = c.one("SELECT * FROM branches WHERE id = :b AND tenant_id = :t AND is_active",
              {"b": branch_id, "t": tenant_id})
    if not b:
        raise not_found("Filial")
    b["working_hours"] = loads(b["working_hours"])
    return b


# ---------------------------------------------------------------- hudud
def resolve_zone(c: Conn, tenant_id: str, lat: float, lon: float) -> tuple[dict, dict]:
    """Manzilni qamrab olgan, ustuvorligi yuqori, eng yaqin filialni tanlash."""
    zones = c.all("SELECT z.*, b.lat AS b_lat, b.lon AS b_lon FROM delivery_zones z "
                  "JOIN branches b ON b.id = z.branch_id WHERE z.tenant_id = :t AND b.is_active",
                  {"t": tenant_id})
    hits = [z for z in zones if point_in_polygon(lat, lon, loads(z["polygon"]))]
    if not hits:
        raise ApiError(404, "out_of_zone", "Afsuski, bu manzil xizmat hududidan tashqarida")
    hits.sort(key=lambda z: (-z["priority"], distance_km(lat, lon, z["b_lat"], z["b_lon"])))
    zone = hits[0]
    return zone, branch_of(c, tenant_id, zone["branch_id"])


def delivery_fee(zone: dict, subtotal: int) -> int:
    if zone["free_from"] is not None and subtotal >= zone["free_from"]:
        return 0
    return zone["delivery_fee"]


def is_open(branch: dict, at: datetime) -> bool:
    local = at.astimezone(LOCAL_TZ)
    for start, end in branch["working_hours"].get(WEEKDAYS[local.weekday()], []):
        if start <= local.strftime("%H:%M") < end:
            return True
    return False


def ensure_slots(c: Conn, branch: dict, days: int = 2, capacity: int = 6) -> None:
    """Ish vaqti ichida soatlik slotlarni oldindan yaratish (sig'im hamkor sozlamasida o'zgaradi)."""
    today = now().astimezone(LOCAL_TZ).date()
    for d in range(days):
        day = today + timedelta(days=d)
        for start, end in branch["working_hours"].get(WEEKDAYS[day.weekday()], []):
            h = int(start[:2])
            while f"{h:02d}:00" < end and h < 24:
                starts = datetime(day.year, day.month, day.day, h, tzinfo=LOCAL_TZ)
                exists = c.scalar("SELECT 1 FROM time_slots WHERE branch_id = :b AND starts_at = :s",
                                  {"b": branch["id"], "s": iso(starts)})
                if not exists:
                    c.insert("time_slots", {"id": new_id(), "tenant_id": branch["tenant_id"],
                                            "branch_id": branch["id"], "starts_at": iso(starts),
                                            "ends_at": iso(starts + timedelta(hours=1)),
                                            "capacity": capacity, "booked": 0})
                h += 1


def available_slots(c: Conn, branch: dict) -> list[dict]:
    ensure_slots(c, branch)
    earliest = now() + timedelta(minutes=branch["prep_minutes"])
    rows = c.all("SELECT id, starts_at, ends_at, capacity, booked FROM time_slots "
                 "WHERE branch_id = :b AND starts_at >= :e ORDER BY starts_at LIMIT 24",
                 {"b": branch["id"], "e": iso(earliest)})
    return [{"id": r["id"], "starts_at": r["starts_at"], "ends_at": r["ends_at"],
             "available": r["booked"] < r["capacity"]} for r in rows]


def asap_eta_minutes(branch: dict, lat: float, lon: float) -> int:
    return branch["prep_minutes"] + 10 + round(distance_km(lat, lon, branch["lat"], branch["lon"]) * 4)


# ---------------------------------------------------------------- katalog
def storefront_catalog(c: Conn, tenant_id: str, branch_id: str, *, q: str | None, category_id: str | None,
                       locale: str = "uz") -> dict:
    sql = ("SELECT v.id AS variant_id, p.id AS product_id, p.name, p.description, p.unit, p.is_weighted, "
           "p.image_url, p.category_id, v.attributes, s.price, s.available_qty, s.reserved_qty, s.is_stopped "
           "FROM branch_stock s JOIN product_variants v ON v.id = s.variant_id "
           "JOIN products p ON p.id = v.product_id "
           "WHERE s.branch_id = :b AND s.tenant_id = :t AND p.is_active")
    params: dict = {"b": branch_id, "t": tenant_id}
    if category_id:
        sql += " AND p.category_id = :c"
        params["c"] = category_id
    rows = c.all(sql, params)
    items = []
    for r in rows:
        name = loads(r["name"])
        title = name.get(locale) or name.get("uz") or ""
        if q and q.lower() not in " ".join(name.values()).lower():
            continue
        free = r["available_qty"] - r["reserved_qty"]
        items.append({
            "variant_id": r["variant_id"], "product_id": r["product_id"], "name": title,
            "description": (loads(r["description"]) or {}).get(locale), "unit": r["unit"],
            "is_weighted": bool(r["is_weighted"]), "image_url": r["image_url"], "category_id": r["category_id"],
            "attributes": loads(r["attributes"]), "price": r["price"],
            "available": (not r["is_stopped"]) and free > 0,
        })
    items.sort(key=lambda i: (not i["available"], i["name"]))
    cats = c.all("SELECT id, name, sort_order FROM categories WHERE tenant_id = :t ORDER BY sort_order",
                 {"t": tenant_id})
    return {"categories": [{"id": x["id"], "name": loads(x["name"]).get(locale)} for x in cats], "items": items}


def partner_stock(c: Conn, tenant_id: str, branch_id: str) -> list[dict]:
    rows = c.all("SELECT v.id AS variant_id, v.sku, p.name, p.unit, s.price, s.available_qty, s.reserved_qty, "
                 "s.is_stopped, s.source, s.synced_at FROM branch_stock s "
                 "JOIN product_variants v ON v.id = s.variant_id JOIN products p ON p.id = v.product_id "
                 "WHERE s.branch_id = :b AND s.tenant_id = :t ORDER BY v.sku", {"b": branch_id, "t": tenant_id})
    for r in rows:
        r["name"] = loads(r["name"]).get("uz")
        r["is_stopped"] = bool(r["is_stopped"])
    return rows


def update_stock(c: Conn, tenant_id: str, branch_id: str, changes: list[dict], actor_id: str,
                 request_id: str | None) -> int:
    count = 0
    for ch in changes:
        row = c.one("SELECT price, available_qty, reserved_qty, is_stopped FROM branch_stock "
                    "WHERE branch_id = :b AND variant_id = :v AND tenant_id = :t",
                    {"b": branch_id, "v": ch["variant_id"], "t": tenant_id})
        if not row:
            raise not_found("Mahsulot")
        new = {
            "price": ch.get("price", row["price"]),
            "available_qty": ch.get("available_qty", row["available_qty"]),
            "is_stopped": ch.get("is_stopped", bool(row["is_stopped"])),
        }
        if new["available_qty"] < row["reserved_qty"]:
            raise ApiError(409, "below_reserved",
                           "Qoldiq band qilingan miqdordan kam bo'lishi mumkin emas",
                           {"variant_id": ch["variant_id"], "reserved_qty": row["reserved_qty"]})
        c.execute("UPDATE branch_stock SET price = :price, available_qty = :available_qty, "
                  "is_stopped = :is_stopped, source = 'manual', synced_at = :ts "
                  "WHERE branch_id = :b AND variant_id = :v",
                  {**new, "ts": iso(), "b": branch_id, "v": ch["variant_id"]})
        audit(c, tenant_id=tenant_id, actor_id=actor_id, entity="branch_stock",
              entity_id=f"{branch_id}:{ch['variant_id']}", action="update",
              old={k: row[k] for k in ("price", "available_qty", "is_stopped")}, new=new, request_id=request_id)
        count += 1
    return count


CSV_COLUMNS = ["sku", "name_uz", "name_ru", "category", "unit", "price_som", "qty"]


def import_csv(c: Conn, tenant_id: str, branch_id: str, text: str, actor_id: str) -> dict:
    """CSV: sku,name_uz,name_ru,category,unit,price_som,qty — mavjud SKU yangilanadi, yangisi qo'shiladi."""
    reader = csv.DictReader(io.StringIO(text))
    missing = [col for col in CSV_COLUMNS if col not in (reader.fieldnames or [])]
    if missing:
        raise ApiError(422, "csv_columns", "CSV ustunlari yetishmaydi", {"missing": missing})
    created = updated = 0
    errors: list[dict] = []
    categories = {loads(x["name"]).get("uz"): x["id"]
                  for x in c.all("SELECT id, name FROM categories WHERE tenant_id = :t", {"t": tenant_id})}
    for line_no, row in enumerate(reader, start=2):
        try:
            unit = row["unit"].strip() or "pcs"
            if unit not in ("pcs", "kg", "l"):
                raise ValueError("unit pcs|kg|l bo'lishi kerak")
            price = round(float(row["price_som"].replace(" ", "").replace(",", ".")) * 100)
            qty = round(float(row["qty"].replace(",", ".") or 0) * 1000)
            cat_name = row["category"].strip() or "Boshqa"
            cat_id = categories.get(cat_name)
            if not cat_id:
                cat_id = categories[cat_name] = new_id()
                c.insert("categories", {"id": cat_id, "tenant_id": tenant_id,
                                        "name": dumps({"uz": cat_name, "ru": cat_name}), "sort_order": 100})
            variant = c.one("SELECT id, product_id FROM product_variants WHERE tenant_id = :t AND sku = :s",
                            {"t": tenant_id, "s": row["sku"].strip()})
            name = dumps({"uz": row["name_uz"].strip(), "ru": row["name_ru"].strip() or row["name_uz"].strip()})
            if variant:
                c.execute("UPDATE products SET name = :n, category_id = :c, unit = :u, is_weighted = :w "
                          "WHERE id = :p", {"n": name, "c": cat_id, "u": unit, "w": unit != "pcs",
                                            "p": variant["product_id"]})
                vid = variant["id"]
                updated += 1
            else:
                pid, vid = new_id(), new_id()
                c.insert("products", {"id": pid, "tenant_id": tenant_id, "category_id": cat_id, "name": name,
                                      "description": None, "unit": unit, "is_weighted": unit != "pcs",
                                      "is_fragile": False, "image_url": None, "is_active": True})
                c.insert("product_variants", {"id": vid, "tenant_id": tenant_id, "product_id": pid,
                                              "sku": row["sku"].strip(), "barcode": None,
                                              "attributes": "{}", "weight_g": None})
                created += 1
            stock = c.one("SELECT reserved_qty FROM branch_stock WHERE branch_id = :b AND variant_id = :v",
                          {"b": branch_id, "v": vid})
            if stock:
                c.execute("UPDATE branch_stock SET price = :p, available_qty = :q, source = 'csv', synced_at = :ts "
                          "WHERE branch_id = :b AND variant_id = :v",
                          {"p": price, "q": max(qty, stock["reserved_qty"]), "ts": iso(), "b": branch_id, "v": vid})
            else:
                c.insert("branch_stock", {"tenant_id": tenant_id, "branch_id": branch_id, "variant_id": vid,
                                          "price": price, "available_qty": qty, "reserved_qty": 0,
                                          "is_stopped": False, "source": "csv", "synced_at": iso()})
        except (ValueError, KeyError) as exc:
            errors.append({"line": line_no, "error": str(exc)})
    audit(c, tenant_id=tenant_id, actor_id=actor_id, entity="catalog_import", entity_id=branch_id,
          action="import", new={"created": created, "updated": updated, "errors": len(errors)})
    return {"created": created, "updated": updated, "errors": errors}
