"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, Toast } from "@dostavka/ui";
import { ApiError, NetworkError, api } from "@/lib/api";
import { formatQty } from "@/lib/catalog";
import { useI18n } from "@/lib/i18n";
import { useRequireSession } from "@/lib/use-session";
import { PageSkeleton, Shell } from "@/components/shell";

interface Item { id: string; name_uz: string; name_ru: string | null; unit: string; quantity_milli: number }
interface Ord { id: string; number: number; status: "placed" | "accepted" | "picking" | "ready" | "delivering" | "completed" | "cancelled" | "failed"; fulfillment: string; total_tiyin: number; delivery_address: string | null; customer_phone: string | null; note: string | null; created_at: string; items: Item[] }
interface Page { items: Ord[]; next_cursor: string | null; counts: Record<string, number> }
type Tab = "all" | Ord["status"];
const TONE: Record<string, "info" | "ok" | "danger" | "warning"> = { placed: "info", accepted: "warning", picking: "warning", ready: "info", delivering: "warning", completed: "ok", cancelled: "danger", failed: "danger" };
const WRITE = new Set(["owner", "manager", "dispatcher"]);
const READ = new Set(["owner", "manager", "picker", "cashier", "dispatcher", "accountant", "marketer"]);

export default function OrdersPage() {
  const { t, locale, money } = useI18n();
  const router = useRouter();
  const { me, ready, session } = useRequireSession();
  const membership = me?.memberships.find((m) => m.tenant_id === session?.tenantId);
  const role = membership?.role ?? "";
  const [tab, setTab] = useState<Tab>("placed");
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "danger" } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const errText = useCallback((e: unknown) => (e instanceof ApiError ? e.text(locale) : e instanceof NetworkError ? t("ui.error_network") : t("ui.error_generic")), [locale, t]);
  const load = useCallback(async () => {
    try { setData(await api<Page>(`/v1/orders?limit=50${tab === "all" ? "" : `&status=${tab}`}`, { tenant: true })); setError(null); }
    catch (e) { if (e instanceof ApiError && e.code === "auth.mfa_required") { router.replace("/xavfsizlik"); return; } setError(errText(e)); }
  }, [tab, errText, router]);

  useEffect(() => {
    if (!ready) return;
    if (!membership) { router.replace("/dokon-yaratish"); return; }
    if (!READ.has(role)) { router.replace("/paket"); return; }
    void load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000);
    return () => clearInterval(timer);
  }, [ready, membership, role, load, router]);

  if (!ready || !membership || !READ.has(role)) return <PageSkeleton />;

  const setStatus = async (o: Ord, status: "accepted" | "completed" | "cancelled", why?: string) => {
    setBusyId(o.id);
    try { await api(`/v1/orders/${o.id}/status`, { method: "POST", tenant: true, body: { status, ...(why ? { reason: why } : {}) } }); setCancelId(null); setReason(""); await load(); }
    catch (e) { setToast({ msg: errText(e), tone: "danger" }); await load(); } finally { setBusyId(null); }
  };
  const nameOf = (i: Item) => (locale === "ru" && i.name_ru ? i.name_ru : i.name_uz);
  const tabs: Tab[] = ["placed", "accepted", "picking", "ready", "delivering", "completed", "cancelled", "failed", "all"];

  return (
    <Shell role={role} title={t("orders.title")} subtitle={t("orders.subtitle")} tenantName={membership.tenant_name}
      actions={membership.tenant_slug && <Link href={`/d/${membership.tenant_slug}`} className="inline-flex min-h-touch items-center font-bold">{t("orders.vitrina_link")} →</Link>}>
      <div role="group" aria-label={t("orders.title")} className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        {tabs.map((k) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => { setTab(k); setData(null); }}
            className={`inline-flex min-h-touch shrink-0 items-center gap-1 rounded-full border px-4 text-body font-bold ${tab === k ? "border-ink bg-ink text-bg" : "border-line-strong bg-surface text-ink-2"}`}>
            {t(`orders.tab_${k}`)}{k !== "all" && data?.counts[k] !== undefined && <span className="opacity-80">· {data.counts[k]}</span>}
          </button>
        ))}
      </div>
      {error && !data ? <ErrorState message={error} onRetry={load} retryLabel={t("ui.retry")} />
        : !data ? <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
        : data.items.length === 0 ? <EmptyState title={t("orders.empty")} />
        : (
          <ul className="flex flex-col gap-3">
            {data.items.map((o) => (
              <li key={o.id}>
                <Card className="flex flex-col gap-3 p-3 md:p-4" data-testid="order-row">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-body-lg font-extrabold">{t("order.title", { number: o.number })}</p>
                    <Badge tone={TONE[o.status] ?? "neutral"}>{t(`order.status_${o.status}`)}</Badge>
                    <p className="text-body-sm text-muted">{new Date(o.created_at).toLocaleString(locale === "ru" ? "ru-RU" : "uz-UZ", { timeZone: "Asia/Tashkent", dateStyle: "short", timeStyle: "short" })}</p>
                  </div>
                  <ul className="text-body">{o.items.map((i) => <li key={i.id} className="break-words">{nameOf(i)} × {formatQty(i.quantity_milli)} {t(`unit.${i.unit}`)}</li>)}</ul>
                  <p className="text-body-sm text-muted">{t("orders.customer")}: {o.customer_phone ?? "—"} · {o.fulfillment === "delivery" ? t("orders.delivery_to", { address: o.delivery_address ?? "" }) : t("orders.pickup")}{o.note ? ` · ${o.note}` : ""}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-title-sm font-extrabold">{money(o.total_tiyin)}</p>
                    {WRITE.has(role) && (o.status === "placed" || o.status === "accepted" || (o.status === "ready" && o.fulfillment === "pickup")) && (
                      <div className="flex flex-wrap gap-2">
                        {o.status === "placed" && <Button loading={busyId === o.id} onClick={() => setStatus(o, "accepted")}>{t("orders.accept")}</Button>}
                        {(o.status === "accepted" || o.status === "ready") && <Button loading={busyId === o.id} onClick={() => setStatus(o, "completed")}>{o.status === "ready" ? t("orders.handover") : t("orders.complete")}</Button>}
                        <Button variant="ghost" onClick={() => setCancelId(cancelId === o.id ? null : o.id)}>{t("orders.cancel")}</Button>
                      </div>
                    )}
                  </div>
                  {cancelId === o.id && (
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="flex min-w-0 flex-1 basis-56 flex-col gap-1 text-body font-semibold">{t("orders.reason_prompt")}
                        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className="min-h-touch rounded-md border border-line-strong bg-surface px-3 text-body-lg font-normal" />
                      </label>
                      <Button loading={busyId === o.id} onClick={() => setStatus(o, "cancelled", reason.trim() || undefined)}>{t("orders.cancel")}</Button>
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
