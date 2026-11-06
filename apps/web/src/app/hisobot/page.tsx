"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState, ErrorState, Skeleton } from "@dostavka/ui";
import { ApiError, NetworkError, api } from "@/lib/api";
import { formatQty } from "@/lib/catalog";
import { useI18n } from "@/lib/i18n";
import { useRequireSession } from "@/lib/use-session";
import { PageSkeleton, Shell } from "@/components/shell";

interface Report {
  days: number; orders: number; revenue_tiyin: number; avg_order_tiyin: number; cancel_rate_pct: number; discount_tiyin: number; points_spent: number;
  daily: { day: string; orders: number; revenue_tiyin: number }[];
  top_products: { product_id: string; name_uz: string; name_ru: string | null; unit: string; quantity_milli: number; revenue_tiyin: number }[];
}
const READ = new Set(["owner", "manager", "dispatcher", "accountant", "marketer"]);
const PERIODS = [7, 30, 90];

export default function ReportPage() {
  const { t, locale, money } = useI18n();
  const router = useRouter();
  const { me, ready, session } = useRequireSession();
  const membership = me?.memberships.find((m) => m.tenant_id === session?.tenantId);
  const role = membership?.role ?? "";
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setData(await api<Report>(`/v1/reports/sales?days=${days}`, { tenant: true })); setError(null); }
    catch (e) { setError(e instanceof ApiError ? e.text(locale) : e instanceof NetworkError ? t("ui.error_network") : t("ui.error_generic")); }
  }, [days, locale, t]);
  useEffect(() => {
    if (!ready) return;
    if (!membership) { router.replace("/dokon-yaratish"); return; }
    if (!READ.has(role)) { router.replace("/paket"); return; }
    setData(null); void load();
  }, [ready, membership, role, load, router]);

  if (!ready || !membership || !READ.has(role)) return <PageSkeleton />;
  const max = Math.max(1, ...(data?.daily ?? []).map((d) => d.revenue_tiyin));
  const stats = data ? [[t("report.orders"), String(data.orders)], [t("report.revenue"), money(data.revenue_tiyin)], [t("report.avg"), money(data.avg_order_tiyin)], [t("report.cancel_rate"), `${data.cancel_rate_pct}%`]] : [];

  return (
    <Shell role={role} title={t("report.title")} subtitle={t("report.subtitle")} tenantName={membership.tenant_name}
      actions={<div role="group" aria-label={t("report.period")} className="flex gap-2">{PERIODS.map((p) => (
        <button key={p} type="button" aria-pressed={days === p} onClick={() => setDays(p)} className={`inline-flex min-h-touch items-center rounded-full border px-4 text-body font-bold ${days === p ? "border-ink bg-ink text-bg" : "border-line-strong bg-surface text-ink-2"}`}>{t("report.days", { days: p })}</button>))}</div>}>
      {error && !data ? <ErrorState message={error} onRetry={load} retryLabel={t("ui.retry")} />
        : !data ? <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-24" /><Skeleton className="h-48" /></div>
        : (
          <div className="flex flex-col gap-5">
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="report-stats">
              {stats.map(([l, v]) => <Card key={l} className="p-3"><dt className="text-body-sm text-muted">{l}</dt><dd className="text-title font-extrabold">{v}</dd></Card>)}
            </dl>
            {data.orders === 0 ? <EmptyState title={t("report.empty")} /> : (
              <div className="grid gap-5 lg:grid-cols-2">
                <Card className="flex flex-col gap-2">
                  <h2 className="text-title-sm font-extrabold">{t("report.daily")}</h2>
                  <ul className="flex flex-col gap-2">
                    {data.daily.map((d) => (
                      <li key={d.day} className="flex flex-col gap-1">
                        <div className="flex justify-between text-body"><span>{d.day} · {t("report.col_orders")}: {d.orders}</span><b>{money(d.revenue_tiyin)}</b></div>
                        <div className="h-2 rounded-full bg-line-soft" aria-hidden="true"><div className="h-2 rounded-full bg-brand" style={{ width: `${Math.max(2, Math.round((d.revenue_tiyin * 100) / max))}%` }} /></div>
                      </li>
                    ))}
                  </ul>
                </Card>
                <Card className="flex flex-col gap-2">
                  <h2 className="text-title-sm font-extrabold">{t("report.top")}</h2>
                  <ol className="flex flex-col gap-2">
                    {data.top_products.map((p) => (
                      <li key={p.product_id} className="flex justify-between gap-3 text-body"><span className="break-words">{locale === "ru" && p.name_ru ? p.name_ru : p.name_uz} · {formatQty(p.quantity_milli)} {t(`unit.${p.unit}`)}</span><b>{money(p.revenue_tiyin)}</b></li>
                    ))}
                  </ol>
                  {data.discount_tiyin > 0 && <p className="border-t border-line-soft pt-2 text-body-sm text-muted">{t("report.points")}: {money(data.discount_tiyin)} ({data.points_spent})</p>}
                </Card>
              </div>
            )}
          </div>
        )}
    </Shell>
  );
}
