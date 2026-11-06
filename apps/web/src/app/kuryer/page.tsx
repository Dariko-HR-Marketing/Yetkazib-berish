"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, Toast } from "@dostavka/ui";
import { ApiError, NetworkError, api } from "@/lib/api";
import { formatQty } from "@/lib/catalog";
import { useI18n } from "@/lib/i18n";
import { useRequireSession } from "@/lib/use-session";
import { PageSkeleton, Shell } from "@/components/shell";

interface Item { id: string; name_uz: string; name_ru: string | null; unit: string; quantity_milli: number; pick_status: string; picked_milli: number | null }
interface Delivery { delivery_id: string; delivery_status: "assigned" | "picked_up" | "delivered" | "failed"; order: { id: string; number: number; total_tiyin: number; delivery_address: string | null; customer_phone: string | null; note: string | null; items: Item[] } }
const TONE = { assigned: "info", picked_up: "warning", delivered: "ok", failed: "danger" } as const;
const GPS_MS = 15000;

export default function CourierPage() {
  const { t, locale, money } = useI18n();
  const router = useRouter();
  const { me, ready, session } = useRequireSession();
  const membership = me?.memberships.find((m) => m.tenant_id === session?.tenantId);
  const role = membership?.role ?? "";
  const [list, setList] = useState<Delivery[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "danger" } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failId, setFailId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [gps, setGps] = useState<"on" | "off" | "idle">("idle");
  const last = useRef<{ lat: number; lng: number; acc: number } | null>(null);

  const errText = useCallback((e: unknown) => (e instanceof ApiError ? e.text(locale) : e instanceof NetworkError ? t("ui.error_network") : t("ui.error_generic")), [locale, t]);
  const load = useCallback(async () => { try { setList((await api<{ items: Delivery[] }>("/v1/courier/deliveries", { tenant: true })).items); setError(null); } catch (e) { setError(errText(e)); } }, [errText]);

  useEffect(() => {
    if (!ready) return;
    if (!membership) { router.replace("/dokon-yaratish"); return; }
    if (role !== "courier") { router.replace("/paket"); return; }
    void load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 10000);
    return () => clearInterval(timer);
  }, [ready, membership, role, load, router]);

  // GPS: faol topshiriq bo'lsa joylashuvni kuzatamiz va har 15 soniyada yuboramiz (spetsifikatsiya: gps_interval_s = 15)
  const active = (list ?? []).some((d) => d.delivery_status === "assigned" || d.delivery_status === "picked_up");
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.geolocation) { setGps("idle"); return; }
    const w = navigator.geolocation.watchPosition(
      (p) => { last.current = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }; setGps("on"); },
      () => setGps("off"), { enableHighAccuracy: true, maximumAge: 10000 });
    const send = setInterval(() => { const l = last.current; if (l) void api("/v1/courier/location", { method: "POST", tenant: true, body: { lat: l.lat, lng: l.lng, accuracy_m: l.acc } }).catch(() => undefined); }, GPS_MS);
    return () => { navigator.geolocation.clearWatch(w); clearInterval(send); };
  }, [active]);

  if (!ready || !membership || role !== "courier") return <PageSkeleton />;

  const act = async (key: string, path: string, body?: unknown) => {
    setBusy(key);
    try { await api(path, { method: "POST", tenant: true, ...(body ? { body } : {}) }); setFailId(null); setReason(""); await load(); }
    catch (e) { setToast({ msg: errText(e), tone: "danger" }); await load(); } finally { setBusy(null); }
  };
  const nameOf = (i: Item) => (locale === "ru" && i.name_ru ? i.name_ru : i.name_uz);

  return (
    <Shell role={role} title={t("courier.title")} subtitle={t("courier.subtitle")} tenantName={membership.tenant_name}
      actions={active && gps !== "idle" ? <Badge tone={gps === "on" ? "ok" : "warning"}>{gps === "on" ? t("courier.gps_on") : t("courier.gps_off")}</Badge> : undefined}>
      {error && !list ? <ErrorState message={error} onRetry={load} retryLabel={t("ui.retry")} />
        : !list ? <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-36" /><Skeleton className="h-36" /></div>
        : list.length === 0 ? <EmptyState title={t("courier.empty")} />
        : (
          <ul className="flex flex-col gap-4">
            {list.map((d) => (
              <li key={d.delivery_id}>
                <Card className="flex flex-col gap-3 p-3 md:p-4" data-testid="courier-delivery">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-body-lg font-extrabold">{t("order.title", { number: d.order.number })}</p>
                    <Badge tone={TONE[d.delivery_status]}>{t(`courier.status_${d.delivery_status}`)}</Badge>
                  </div>
                  <p className="break-words text-body-lg">{d.order.delivery_address}</p>
                  {d.order.note && <p className="text-body-sm text-muted">{d.order.note}</p>}
                  {d.order.customer_phone && <a href={`tel:${d.order.customer_phone}`} className="inline-flex min-h-touch items-center text-body-lg font-bold">{t("courier.call", { phone: d.order.customer_phone })}</a>}
                  <ul className="text-body">{d.order.items.filter((i) => i.pick_status !== "missing").map((i) => <li key={i.id} className="break-words">{nameOf(i)} × {formatQty(i.picked_milli ?? i.quantity_milli)} {t(`unit.${i.unit}`)}</li>)}</ul>
                  <p className="text-title-sm font-extrabold">{t("courier.cash")}: {money(d.order.total_tiyin)}</p>
                  {d.delivery_status === "assigned" && <Button loading={busy === d.delivery_id} onClick={() => act(d.delivery_id, `/v1/courier/deliveries/${d.delivery_id}/pickup`)}>{t("courier.pickup")}</Button>}
                  {d.delivery_status === "picked_up" && (
                    <div className="flex flex-col gap-2">
                      <Button loading={busy === d.delivery_id} onClick={() => act(d.delivery_id, `/v1/courier/deliveries/${d.delivery_id}/deliver`)}>{t("courier.deliver")}</Button>
                      <Button variant="ghost" onClick={() => setFailId(failId === d.delivery_id ? null : d.delivery_id)}>{t("courier.fail")}</Button>
                      {failId === d.delivery_id && (
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="flex min-w-0 flex-1 basis-56 flex-col gap-1 text-body font-semibold">{t("courier.fail_reason")}
                            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className="min-h-touch rounded-md border border-line-strong bg-surface px-3 text-body-lg font-normal" />
                          </label>
                          <Button disabled={reason.trim().length < 2} loading={busy === d.delivery_id} onClick={() => act(d.delivery_id, `/v1/courier/deliveries/${d.delivery_id}/fail`, { reason: reason.trim() })}>{t("courier.fail_send")}</Button>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      {toast && <Toast message={toast.msg} tone={toast.tone} onClose={() => setToast(null)} />}
    </Shell>
  );
}
