// k6 yuklama sinovi (S8): vitrina o'qish (p95 ≤ 300 ms) va buyurtma berish (p95 ≤ 600 ms).
// Ishga tushirish:  k6 run -e BASE_URL=https://yetkazish.tajriba24.uz -e SLUG=demo -e BRANCH_ID=<uuid> infra/k6/load.js
// Talab: serverda OPEN_LOGIN=on (xaridorlar telefon bilan kiradi) yoki TOKENS_FILE orqali tayyor tokenlar. Maqsad: 300 buyurtma/soat × 10 zaxira.
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";
import { uuidv4 } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

const BASE = __ENV.BASE_URL || "http://127.0.0.1:3000";
const SLUG = __ENV.SLUG || "demo";
const BRANCH = __ENV.BRANCH_ID;
const orders = new Counter("orders_placed");

export const options = {
  scenarios: {
    browse: { executor: "ramping-vus", exec: "browse", startVUs: 5, stages: [{ duration: "1m", target: 100 }, { duration: "3m", target: 100 }, { duration: "30s", target: 0 }] },
    order: { executor: "constant-arrival-rate", exec: "order", rate: 50, timeUnit: "1m", duration: "4m", preAllocatedVUs: 30 }, // 3000/soat = 10 × pilot
  },
  thresholds: {
    "http_req_duration{kind:read}": ["p(95)<300"],
    "http_req_duration{kind:write}": ["p(95)<600"],
    http_req_failed: ["rate<0.01"],
  },
};

export function browse() {
  const shop = http.get(`${BASE}/v1/shops/${SLUG}`, { tags: { kind: "read" } });
  check(shop, { "shop 200": (r) => r.status === 200 });
  const q = BRANCH ? `?branch_id=${BRANCH}&limit=30` : "?limit=30";
  const p = http.get(`${BASE}/v1/shops/${SLUG}/products${q}`, { tags: { kind: "read" } });
  check(p, { "products 200": (r) => r.status === 200 });
  sleep(1 + Math.random() * 2);
}

export function order() {
  const phone = `+99890${String(1000000 + Math.floor(Math.random() * 8999999))}`;
  const login = http.post(`${BASE}/v1/auth/open`, JSON.stringify({ phone }), { headers: { "Content-Type": "application/json" }, tags: { kind: "write" } });
  if (!check(login, { "login 200": (r) => r.status === 200 })) return;
  const token = login.json("access_token");
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const list = http.get(`${BASE}/v1/shops/${SLUG}/products?limit=5${BRANCH ? `&branch_id=${BRANCH}` : ""}`, { tags: { kind: "read" } }).json("items");
  const item = (list || []).find((x) => x.availability.state !== "out");
  if (!item) return;
  const res = http.post(`${BASE}/v1/shops/${SLUG}/orders`, JSON.stringify({
    branch_id: BRANCH || http.get(`${BASE}/v1/shops/${SLUG}`).json("branches.0.id"), fulfillment: "pickup",
    items: [{ product_id: item.id, quantity_milli: 1000 }],
  }), { headers: { ...auth, "Idempotency-Key": uuidv4() }, tags: { kind: "write" } });
  if (check(res, { "order 201 yoki 409 (qoldiq tugadi)": (r) => r.status === 201 || r.status === 409 })) orders.add(res.status === 201 ? 1 : 0);
}
