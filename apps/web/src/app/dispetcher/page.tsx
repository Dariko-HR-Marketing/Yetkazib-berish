"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, Toast } from "@dostavka/ui";
import { ApiError, NetworkError, api } from "@/lib/api";
import { formatQty } from "@/lib/catalog";
import { useI18n } from "@/lib/i18n";
import { useRequireSession } from "@/lib/use-session";
import { PageSkeleton, Shell } from "@/components/shell";

interface Item { id: string; name_uz: string; name_ru: string | null; unit: string; quantity_milli: number }
interface Ord { id: string; number: number; status: string; fulfillment: string; total_tiyin: number; delivery_address: string | null; customer_phone: string | null; items: Item[]; delivery?: { courier_user_id: string; status: string } | null }
interface Courier { user_id: string; phone: string | null; active_deliveries: number; location: { lat: number; lng: number; at: string; fresh: boolean } | null }
const WRITE = new Set(["owner", "manager", "dispatcher"]);

export default function DispatchPage() {
  const { t, locale, money } = useI18n();
  const router = useRouter();
  const { me, ready, session } = useRequireSession();
  const membership = me?.memberships.find((m) => m.tenant_id === session?.tenantId);
  const role = membership?.role ?? "";
  const [orders, setOrders] = useState<Ord[] | null>(null);
  const [couriers, setCouriers] = useState<Courier[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "danger" } | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const errText = useCallback((e: unknown) => (e instanceof ApiError ? e.text(locale) : e instanceof NetworkError ? t("ui.error_network") : t("ui.error_generic")), [locale, t]);
  const load = useCallback(async () => {
    try {
      const [o, c] = await Promise.all([api<{ items: Ord[] }>("/v1/orders?status=ready&limit=50", { tenant: true }), api<{ items: Courier[] }>("/v1/dispatch/couriers", { tenant: true })]);
      setOrders(o.items.filter((x) => x.fulfillment === "delivery")); setCouriers(c.items); setError(null);
    } catch (e) { setError(errText(e)); }
  }, [errText]);
  useEffect(() => {
    if (!ready) return;
    if (!membership) { router.replace("/dokon-yaratish"); return; }
    if (!WRITE.has(role)) { router.replace("/paket"); return; }
    void load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 10000);
    return () => clearInterval(timer);
  }, [ready, membership, role, load, router]);

  if (!ready || !membership || !WRITE.has(role)) return <PageSkeleton />;

  const assign = async (o: Ord) => {
    const courier = choice[o.id];
    if (!courier) return;
    setBusy(o.id);
    try { await api(`/v1/orders/${o.id}/assign`, { method: "POST", tenant: true, body: { courier_user_id: courier } }); setToast({ msg: t("dispatch.assigned"), tone: "ok" }); await load(); }
    catch (e) { setToast({ msg: errText(e), tone: "danger" }); } finally { setBusy(null); }
  };
  const nameOf = (i: Item) => (locale === "ru" && i.name_ru ? i.name_ru : i.name_uz);

  return (
    <Shell role={role} title={t("dispatch.title")} subtitle={t("dispatch.subtitle")} tenantName={membership.tenant_name}>
      {error && !orders ? <ErrorState message={error} onRetry={load} retryLabel={t("ui.retry")} />
        : !orders || !couriers ? <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
        : (
          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            <section aria-labelledby="ready-h" className="flex flex-col gap-3">
              <h2 id="ready-h" className="text-title-sm font-extrabold">{t("dispatch.ready")}</h2>
              {orders.length === 0 ? <EmptyState title={t("dispatch.no_ready")} /> : (
                <ul className="flex flex-col gap-3">
                  {orders.map((o) => (
                    <li key={o.id}>
                      <Card className="flex flex-col gap-3 p-3" data-testid="dispatch-order">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-body-lg font-extrabold">{t("order.title", { number: o.number })}</p>
                          <p className="text-body font-bold">{money(o.total_tiyin)}</p>
                        </div>
                        <p className="text-body">{t("orders.delivery_to", { address: o.delivery_address ?? "" })}</p>
                        <p className="text-body-sm text-muted">{o.items.map((i) => `${nameOf(i)} × ${formatQty(i.quantity_milli)}`).join(", ")}</p>
                        {o.delivery && <p><Badge tone="ok">{t("dispatch.courier_label", { phone: couriers.find((c) => c.user_id === o.delivery!.courier_user_id)?.phone ?? "—" })}</Badge></p>}
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="sr-only" htmlFor={`c-${o.id}`}>{t("dispatch.choose")}</label>
                          <select id={`c-${o.id}`} value={choice[o.id] ?? ""} onChange={(e) => setChoice({ ...choice, [o.id]: e.target.value })} className="min-h-touch min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-3 text-body-lg">
                            <option value="">{t("dispatch.choose")}</option>
                            {couriers.map((c) => <option key={c.user_id} value={c.user_id}>{c.phone ?? c.user_id.slice(0, 6)} · {t("dispatch.active", { count: c.active_deliveries })}</option>)}
                          </select>
                          <Button disabled={!choice[o.id]} loading={busy === o.id} onClick={() => assign(o)}>{t("dispatch.assign")}</Button>
                        </div>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <aside aria-labelledby="couriers-h" className="flex h-fit flex-col gap-3">
              <h2 id="couriers-h" className="text-title-sm font-extrabold">{t("dispatch.couriers")}</h2>
              {couriers.length === 0 ? <EmptyState title={t("dispatch.no_couriers")} /> : (
                <ul className="flex flex-col gap-2">
                  {couriers.map((c) => (
                    <li key={c.user_id}>
                      <Card className="flex flex-col gap-1 p-3" data-testid="courier-card">
                        <p className="font-bold">{c.phone ?? c.user_id.slice(0, 8)}</p>
                        <p className="text-body-sm text-muted">{t("dispatch.active", { count: c.active_deliveries })}</p>
                        {c.location
                          ? <p className="text-body-sm"><Badge tone={c.location.fresh ? "ok" : "warning"}>{c.location.fresh ? t("dispatch.loc_fresh") : t("dispatch.loc_old")}</Badge>{" "}
                              <a href={`https://www.openstreetmap.org/?mlat=${c.location.lat}&mlon=${c.location.lng}#map=16/${c.location.lat}/${c.location.lng}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-touch items-center font-bold">{t("dispatch.map")}</a></p>
                          : <p className="text-body-sm text-muted">{t("dispatch.loc_none")}</p>}
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>
        )}
      {toast && <Toast message={toast.msg} tone={toast.tone} onClose={() => setToast(null)} />}
    </Shell>
  );
}
