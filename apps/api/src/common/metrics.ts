/** Yengil Prometheus ko'rsatkichlari (kutubxonasiz): so'rovlar soni va davomiylik gistogrammasi (marshrut shabloni bo'yicha; shaxsiy ma'lumot yo'q). */
const BUCKETS_MS = [25, 50, 100, 200, 300, 500, 600, 1000, 2500, 5000];
interface Series { count: number; sum: number; buckets: number[] }
const series = new Map<string, Series>(); // kalit: method|route|statusClass
const startedAt = Date.now();

export function recordRequest(method: string, route: string, status: number, ms: number) {
  const key = `${method}|${route}|${Math.floor(status / 100)}xx`;
  let s = series.get(key);
  if (!s) { s = { count: 0, sum: 0, buckets: BUCKETS_MS.map(() => 0) }; if (series.size < 2000) series.set(key, s); }
  s.count++; s.sum += ms;
  BUCKETS_MS.forEach((b, i) => { if (ms <= b) s.buckets[i]!++; });
}

const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
export function renderMetrics(): string {
  const out: string[] = ["# HELP http_request_duration_ms So'rov davomiyligi (ms)", "# TYPE http_request_duration_ms histogram"];
  for (const [key, s] of series) {
    const [method, route, cls] = key.split("|") as [string, string, string];
    const l = `method="${method}",route="${esc(route)}",status="${cls}"`;
    BUCKETS_MS.forEach((b, i) => out.push(`http_request_duration_ms_bucket{${l},le="${b}"} ${s.buckets[i]}`));
    out.push(`http_request_duration_ms_bucket{${l},le="+Inf"} ${s.count}`, `http_request_duration_ms_sum{${l}} ${s.sum}`, `http_request_duration_ms_count{${l}} ${s.count}`);
  }
  const mem = process.memoryUsage();
  out.push("# TYPE process_uptime_seconds gauge", `process_uptime_seconds ${Math.round((Date.now() - startedAt) / 1000)}`,
    "# TYPE process_resident_memory_bytes gauge", `process_resident_memory_bytes ${mem.rss}`, "# TYPE nodejs_heap_used_bytes gauge", `nodejs_heap_used_bytes ${mem.heapUsed}`);
  return out.join("\n") + "\n";
}

export function metricsMiddleware(req: { method: string; route?: { path?: string } }, res: { statusCode: number; on(e: "finish", f: () => void): void }, next: () => void) {
  const t0 = process.hrtime.bigint();
  res.on("finish", () => recordRequest(req.method, req.route?.path ?? "unmatched", res.statusCode, Number(process.hrtime.bigint() - t0) / 1e6));
  next();
}
