#!/usr/bin/env python3
"""AC-11: 50 parallel sessiya, katalog va buyurtma ssenariysi. Faqat stdlib.
Ishlatish:  python scripts/loadtest.py --base http://localhost:8000 --tenant demo-dokon --sessions 50 --seconds 20
Maqsad (NFR-01): katalog p95 <= 800 ms, buyurtma yaratish p95 <= 1500 ms. Staging'da, real hajmdagi ma'lumot bilan o'tkazing."""
import argparse, http.client, json, statistics, threading, time, uuid
from urllib.parse import urlparse

ap = argparse.ArgumentParser()
ap.add_argument("--base", default="http://localhost:8000")
ap.add_argument("--tenant", default="demo-dokon")
ap.add_argument("--sessions", type=int, default=50)
ap.add_argument("--seconds", type=int, default=20)
ap.add_argument("--lat", type=float, default=40.1049)
ap.add_argument("--lng", type=float, default=65.3812)
a = ap.parse_args()
u = urlparse(a.base)
cat_ms, ord_ms, errs = [], [], []
lock = threading.Lock()


def req(conn, method, path, body=None, headers=None):
    h = {"Content-Type": "application/json", **(headers or {})}
    t = time.perf_counter()
    conn.request(method, path, json.dumps(body) if body is not None else None, h)
    r = conn.getresponse()
    data = r.read()
    return r.status, json.loads(data or "null"), (time.perf_counter() - t) * 1000


def session():
    conn = http.client.HTTPConnection(u.hostname, u.port, timeout=30)
    st, z, _ = req(conn, "GET", f"/api/v1/storefront/{a.tenant}/zones/resolve?lat={a.lat}&lng={a.lng}")
    bid = z["branch"]["id"]
    end = time.time() + a.seconds
    while time.time() < end:
        st, cat, ms = req(conn, "GET", f"/api/v1/storefront/{a.tenant}/branches/{bid}/catalog")
        with lock:
            cat_ms.append(ms) if st == 200 else errs.append(("catalog", st))
        item = next((i for i in cat["items"] if i["in_stock"] and not i["is_weighted"] and float(i["available"]) >= 10), None)
        if not item:
            continue
        body = {"tenant_slug": a.tenant, "branch_id": bid, "customer_phone": "+998901234567", "payment_method": "cash_on_delivery",
                "address": {"text": "load", "lat": a.lat, "lng": a.lng}, "slot_id": None,
                "items": [{"variant_id": item["variant_id"], "qty": 10}]}
        st, o, ms = req(conn, "POST", "/api/v1/orders", body, {"Idempotency-Key": str(uuid.uuid4())})
        with lock:
            ord_ms.append(ms) if st == 201 else errs.append(("order", st, (o or {}).get("error", {}).get("code")))


ts = [threading.Thread(target=session) for _ in range(a.sessions)]
[t.start() for t in ts]
[t.join() for t in ts]


def p95(v):
    return statistics.quantiles(v, n=100)[94] if len(v) >= 2 else (v[0] if v else float("nan"))


print(f"katalog: n={len(cat_ms)} p50={statistics.median(cat_ms):.0f} ms p95={p95(cat_ms):.0f} ms (maqsad <= 800)")
print(f"buyurtma: n={len(ord_ms)} p50={statistics.median(ord_ms) if ord_ms else 0:.0f} ms p95={p95(ord_ms):.0f} ms (maqsad <= 1500)")
print(f"xatolar: {len(errs)} {sorted(set(map(str, errs)))[:5]}")
