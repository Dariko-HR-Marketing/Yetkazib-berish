"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, Toast } from "@dostavka/ui";
import { ApiError, NetworkError, api } from "@/lib/api";
import { formatQty, parseQty } from "@/lib/catalog";
import { useI18n } from "@/lib/i18n";
import { useRequireSession } from "@/lib/use-session";
import { PageSkeleton, Shell } from "@/components/shell";

interface Item { id: string; name_uz: string; name_ru: string | null; unit: string; quantity_milli: number; pick_status: "pending" | "picked" | "missing"; picked_milli: number | null }
interface Ord { id: string; number: number; status: "accepted" | "picking"; fulfillment: string; delivery_address: string | null; note: string | null; items: Item[] }
const WRITE = new Set(["owner", "manager", "picker"]);
const READ = new Set(["owner", "manager", "picker", "dispatcher"]);
const TONE = { pending: "neutral", picked: "ok", missing: "danger" } as const;

export default function PickingPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { me, ready, session } = useRequireSession();
  const membership = me?.memberships.find((m) => m.tenant_id === session?.tenantId);
  const role = membership?.role ?? "";
  const [orders, setOrders] = useState<Ord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "danger" } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});

  const errText = useCallback((e: unknown) => (e instanceof ApiError ? e.text(locale) : e instanceof NetworkError ? t("ui.error_network") : t("ui.error_generic")), [locale, t]);
  const load = useCallback(async () => { try { setOrders((await api<{ items: Ord[] }>("/v1/picking", { tenant: true })).items); setError(null); } catch (e) { setError(errText(e)); } }, [errText]);
  useEffect(() => {
    if (!ready) return;
    if (!membership) { router.replace("/dokon-yaratish"); return; }
    if (!READ.has(role)) { router.replace("/paket"); return; }
    void load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000);
    return () => clearInterval(timer);
  }, [ready, membership, role, load, router]);

  if (!ready || !membership || !READ.has(role)) return <PageSkeleton />;
  const canWrite = WRITE.has(role);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try { await fn(); await load(); } catch (e) { setToast({ msg: errText(e), tone: "danger" }); await load(); } finally { setBusy(null); }
  };
  const nameOf = (i: Item) => (locale === "ru" && i.name_ru ? i.name_ru : i.name_uz);
  const pick = (o: Ord, i: Item, body: { status: string; picked_milli?: number }) => act(i.id, () => api(`/v1/orders/${o.id}/items/${i.id}/pick`, { method: "PUT", tenant: true, body }));

  return (
    <Shell role={role} title={t("picking.title")} subtitle={t("picking.subtitle")} tenantName={membership.tenant_name}>
      {error && !orders ? <ErrorState message={error} onRetry={load} retryLabel={t("ui.retry")} />
        : !orders ? <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
        : orders.length === 0 ? <EmptyState title={t("picking.empty")} />
        : (
          <ul className="flex flex-col gap-4">
            {orders.map((o) => {
              const pending = o.items.filter((i) => i.pick_status === "pending").length;
              return (
                <li key={o.id}>
                  <Card className="flex flex-col gap-3 p-3 md:p-4" data-testid="pick-order">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-body-lg font-extrabold">{t("order.title", { number: o.number })}</p>
                      <Badge tone={o.status === "picking" ? "warning" : "info"}>{t(`order.status_${o.status}`)}</Badge>
                      <p className="text-body-sm text-muted">{o.fulfillment === "delivery" ? t("orders.delivery_to", { address: o.delivery_address ?? "" }) : t("orders.pickup")}{o.note ? ` · ${o.note}` : ""}</p>
                    </div>
                    {o.status === "accepted" ? (
                      canWrite && <Button loading={busy === o.id} onClick={() => act(o.id, () => api(`/v1/orders/${o.id}/pick/start`, { method: "POST", tenant: true }))}>{t("picking.start")}</Button>
                    ) : (
                      <>
                        <ul className="flex flex-col divide-y divide-line-soft">
                          {o.items.map((i) => (
                            <li key={i.id} className="flex flex-col gap-2 py-3" data-testid="pick-item">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="break-words text-body-lg font-bold">{nameOf(i)}</p>
                                <Badge tone={TONE[i.pick_status]}>{t(`picking.status_${i.pick_status}`)}</Badge>
                              </div>
                              <p className="text-body-sm text-muted">{t("picking.need", { qty: formatQty(i.quantity_milli), unit: t(`unit.${i.unit}`) })}{i.picked_milli !== null && i.pick_status === "picked" ? ` · ${t("picking.picked")}: ${formatQty(i.picked_milli)}` : ""}</p>
                              {canWrite && (
                                <div className="flex flex-wrap items-center gap-2">
                                  <Button loading={busy === i.id} onClick={() => pick(o, i, { status: "picked" })}>{t("picking.picked")}</Button>
                                  <input aria-label={`${t("picking.qty")}: ${nameOf(i)}`} inputMode="decimal" placeholder={formatQty(i.quantity_milli)} value={qty[i.id] ?? ""} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} className="min-h-touch w-24 rounded-md border border-line-strong bg-surface px-2 text-body" />
                                  {qty[i.id] && <Button variant="ghost" onClick={() => { const v = parseQty(qty[i.id]!); if (v === null || v <= 0) { setToast({ msg: t("product.qty_invalid"), tone: "danger" }); return; } void pick(o, i, { status: "picked", picked_milli: v }).then(() => setQty((m) => ({ ...m, [i.id]: "" }))); }}>{t("picking.save_qty")}</Button>}
                                  <Button variant="ghost" onClick={() => pick(o, i, { status: "missing" })}>{t("picking.missing")}</Button>
                                  {i.pick_status !== "pending" && <Button variant="ghost" onClick={() => pick(o, i, { status: "pending" })}>{t("picking.reset")}</Button>}
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                        {canWrite && (
                          <div className="flex flex-wrap items-center gap-3">
                            <Button disabled={pending > 0} loading={busy === `f${o.id}`} onClick={() => act(`f${o.id}`, () => api(`/v1/orders/${o.id}/pick/finish`, { method: "POST", tenant: true }))}>{t("picking.finish")}</Button>
                            {pending > 0 && <p className="text-body-sm text-muted">{t("picking.pending_left", { count: pending })}</p>}
                          </div>
                        )}
                      </>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      {toast && <Toast message={toast.msg} tone={toast.tone} onClose={() => setToast(null)} />}
    </Shell>
  );
}
