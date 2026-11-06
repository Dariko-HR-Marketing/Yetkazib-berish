"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState, ErrorState, Skeleton } from "@dostavka/ui";
import { ApiError, NetworkError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useRequireSession } from "@/lib/use-session";
import { PageSkeleton, Shell } from "@/components/shell";

interface Customer { customer_id: string; phone_masked: string | null; orders: number; completed: number; cancelled: number; spent_tiyin: number; last_order_at: string; points_balance: number; repeat: boolean }
interface Data { total_customers: number; items: Customer[] }
const READ = new Set(["owner", "manager", "marketer"]);

/** Mijoz 360 — faqat ichki tahlil (CLAUDE.md §3): telefon maskalangan, xaridorga ko'rsatilmaydi. */
export default function CustomersPage() {
  const { t, locale, money } = useI18n();
  const router = useRouter();
  const { me, ready, session } = useRequireSession();
  const membership = me?.memberships.find((m) => m.tenant_id === session?.tenantId);
  const role = membership?.role ?? "";
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setData(await api<Data>("/v1/customers?limit=100", { tenant: true })); setError(null); }
    catch (e) { setError(e instanceof ApiError ? e.text(locale) : e instanceof NetworkError ? t("ui.error_network") : t("ui.error_generic")); }
  }, [locale, t]);
  useEffect(() => {
    if (!ready) return;
    if (!membership) { router.replace("/dokon-yaratish"); return; }
    if (!READ.has(role)) { router.replace("/paket"); return; }
    void load();
  }, [ready, membership, role, load, router]);

  if (!ready || !membership || !READ.has(role)) return <PageSkeleton />;
  const fmt = (d: string) => new Date(d).toLocaleString(locale === "ru" ? "ru-RU" : "uz-UZ", { timeZone: "Asia/Tashkent", dateStyle: "short", timeStyle: "short" });

  return (
    <Shell role={role} title={t("cust.title")} subtitle={t("cust.subtitle")} tenantName={membership.tenant_name}>
      {error && !data ? <ErrorState message={error} onRetry={load} retryLabel={t("ui.retry")} />
        : !data ? <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-16" /><Skeleton className="h-24" /></div>
        : data.items.length === 0 ? <EmptyState title={t("cust.empty")} />
        : (
          <div className="flex flex-col gap-4">
            <Card className="p-3"><p className="text-body-sm text-muted">{t("cust.total")}</p><p className="text-title font-extrabold" data-testid="cust-total">{data.total_customers}</p></Card>
            <ul className="grid gap-3 md:grid-cols-2" data-testid="cust-list">
              {data.items.map((c) => (
                <li key={c.customer_id}>
                  <Card className="flex flex-col gap-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <b className="font-mono text-body">{c.phone_masked ?? "—"}</b>
                      {c.repeat && <span className="rounded-full bg-brand-soft px-3 py-1 text-body-sm font-bold text-brand-dark">{t("cust.repeat")}</span>}
                    </div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-body-sm">
                      <dt className="text-muted">{t("cust.orders")}</dt><dd className="font-bold">{c.orders}</dd>
                      <dt className="text-muted">{t("cust.completed")}</dt><dd className="font-bold">{c.completed}</dd>
                      <dt className="text-muted">{t("cust.cancelled")}</dt><dd className="font-bold">{c.cancelled}</dd>
                      <dt className="text-muted">{t("cust.spent")}</dt><dd className="font-bold">{money(c.spent_tiyin)}</dd>
                      <dt className="text-muted">{t("cust.points")}</dt><dd className="font-bold">{c.points_balance}</dd>
                      <dt className="text-muted">{t("cust.last")}</dt><dd className="font-bold">{fmt(c.last_order_at)}</dd>
                    </dl>
                  </Card>
                </li>
              ))}
            </ul>
          </div>
        )}
    </Shell>
  );
}
