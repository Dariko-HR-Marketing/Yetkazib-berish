"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Skeleton, Toast } from "@dostavka/ui";
import { ApiError, NetworkError, api } from "@/lib/api";
import { formatSom, parseSom } from "@/lib/catalog";
import { useI18n } from "@/lib/i18n";
import { useRequireSession } from "@/lib/use-session";
import { PageSkeleton, Shell } from "@/components/shell";

interface Courier { user_id: string; phone: string | null; on_hand_tiyin: number; over_limit: boolean; last_handover_at: string | null }
const READ = new Set(["owner", "manager", "cashier", "accountant"]);
const WRITE = new Set(["owner", "cashier", "accountant"]);

export default function CashPage() {
  const { t, locale, money } = useI18n();
  const router = useRouter();
  const { me, ready, session } = useRequireSession();
  const membership = me?.memberships.find((m) => m.tenant_id === session?.tenantId);
  const role = membership?.role ?? "";
  const [data, setData] = useState<{ limit_tiyin: number; items: Courier[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "danger" } | null>(null);
  const [amount, setAmount] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const errText = useCallback((e: unknown) => (e instanceof ApiError ? e.text(locale) : e instanceof NetworkError ? t("ui.error_network") : t("ui.error_generic")), [locale, t]);
  const load = useCallback(async () => { try { setData(await api("/v1/cash/couriers", { tenant: true })); setError(null); } catch (e) { setError(errText(e)); } }, [errText]);
  useEffect(() => {
    if (!ready) return;
    if (!membership) { router.replace("/dokon-yaratish"); return; }
    if (!READ.has(role)) { router.replace("/paket"); return; }
    void load();
  }, [ready, membership, role, load, router]);

  if (!ready || !membership || !READ.has(role)) return <PageSkeleton />;

  const handover = async (c: Courier, all: boolean) => {
    const v = all ? c.on_hand_tiyin : parseSom(amount[c.user_id] ?? "");
    if (!v || v <= 0) { setToast({ msg: t("product.price_invalid"), tone: "danger" }); return; }
    setBusy(c.user_id);
    try { await api("/v1/cash/handover", { method: "POST", tenant: true, body: { courier_user_id: c.user_id, amount_tiyin: v } }); setAmount({ ...amount, [c.user_id]: "" }); setToast({ msg: t("cash.done"), tone: "ok" }); await load(); }
    catch (e) { setToast({ msg: errText(e), tone: "danger" }); } finally { setBusy(null); }
  };

  return (
    <Shell role={role} title={t("cash.title")} subtitle={data ? t("cash.subtitle", { limit: money(data.limit_tiyin) }) : undefined} tenantName={membership.tenant_name}>
      {error && !data ? <ErrorState message={error} onRetry={load} retryLabel={t("ui.retry")} />
        : !data ? <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        : data.items.length === 0 ? <EmptyState title={t("cash.empty")} />
        : (
          <ul className="flex flex-col gap-3">
            {data.items.map((c) => (
              <li key={c.user_id}>
                <Card className="flex flex-col gap-3 p-3 md:p-4" data-testid="cash-courier">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-body-lg font-extrabold">{c.phone ?? c.user_id.slice(0, 8)}</p>
                    <p className="text-title-sm font-extrabold" data-testid="cash-on-hand">{t("cash.on_hand", { amount: money(c.on_hand_tiyin) })}</p>
                    {c.over_limit && <Badge tone="danger">{t("cash.over")}</Badge>}
                  </div>
                  <p className="text-body-sm text-muted">{c.last_handover_at ? t("cash.last", { date: new Date(c.last_handover_at).toLocaleString(locale === "ru" ? "ru-RU" : "uz-UZ", { timeZone: "Asia/Tashkent", dateStyle: "short", timeStyle: "short" }) }) : t("cash.never")}</p>
                  {WRITE.has(role) && c.on_hand_tiyin > 0 && (
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-0 flex-1 basis-40"><Input id={`a-${c.user_id}`} label={t("cash.amount")} inputMode="decimal" value={amount[c.user_id] ?? ""} placeholder={formatSom(c.on_hand_tiyin)} onChange={(e) => setAmount({ ...amount, [c.user_id]: e.target.value })} /></div>
                      <Button loading={busy === c.user_id} onClick={() => handover(c, false)} disabled={!(amount[c.user_id] ?? "").trim()}>{t("cash.handover")}</Button>
                      <Button variant="ghost" loading={busy === c.user_id} onClick={() => handover(c, true)}>{t("cash.all")}</Button>
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
