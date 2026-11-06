"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card, ErrorState, Meter, Skeleton, Switch, Toast } from "@dostavka/ui";
import { ApiError, NetworkError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useRequireSession } from "@/lib/use-session";
import { DeliverySettingsCard } from "@/components/delivery-settings";
import { PaymentSettingsCard } from "@/components/payment-settings";
import { WorkHoursCard } from "@/components/work-hours";
import { PageSkeleton, Shell } from "@/components/shell";

interface Feature { key: string; enabled: boolean; platform_enabled: boolean; in_plan: boolean; shop_enabled: boolean; min_plan: string; requires: string[]; blocked_by?: string[]; toggled_by: string }
interface Plan { code: string; version: number; name: string; price_tiyin: number | null; limits: { orders_month: number | null; branches: number | null; staff: number | null; integrations: number | null }; migrate_at?: string | null }

/** prototip: Owner-Plan — bo'limlar bo'yicha guruhlangan funksiyalar. */
const GROUPS: { id: string; match: (k: string) => boolean }[] = [
  { id: "channels", match: (k) => /^(storefront|catalog|channel)\./.test(k) },
  { id: "delivery", match: (k) => k.startsWith("delivery.") },
  { id: "payment", match: (k) => /^(payment|stock|integration)\./.test(k) },
  { id: "loyalty", match: (k) => k.startsWith("loyalty.") },
  { id: "ai", match: (k) => /^(ai|analytics|branches)\./.test(k) },
];
const GROUP_LABEL: Record<string, { uz: string; ru: string }> = {
  channels: { uz: "Sotuv kanallari", ru: "Каналы продаж" }, delivery: { uz: "Yetkazish", ru: "Доставка" },
  payment: { uz: "To'lov va qoldiq", ru: "Оплата и остатки" }, loyalty: { uz: "Sodiqlik", ru: "Лояльность" }, ai: { uz: "AI va tahlil", ru: "AI и аналитика" },
};

export default function PlanPage() {
  const { t, locale, money } = useI18n();
  const router = useRouter();
  const { me, ready, session } = useRequireSession();
  const [data, setData] = useState<{ plan: Plan; items: Feature[] } | null>(null);
  const [usage, setUsage] = useState<{ staff: number; branches: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "danger" } | null>(null);

  const membership = me?.memberships.find((m) => m.tenant_id === session?.tenantId);
  const isOwner = membership?.role === "owner";
  const errText = useCallback((e: unknown) => (e instanceof ApiError ? e.text(locale) : e instanceof NetworkError ? t("ui.error_network") : t("ui.error_generic")), [locale, t]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const f = await api<{ plan: Plan; items: Feature[] }>("/v1/features", { tenant: true });
      setData(f);
      const [br, mem] = await Promise.all([
        api<{ items: unknown[] }>("/v1/branches", { tenant: true }),
        api<{ limit: { used: number } }>("/v1/members", { tenant: true }).catch(() => null),
      ]);
      setUsage({ branches: br.items.length, staff: mem?.limit.used ?? 0 });
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth.mfa_required") { router.replace("/xavfsizlik"); return; }
      setError(errText(e));
    }
  }, [errText, router]);

  useEffect(() => { if (ready && membership) void load(); else if (ready) router.replace("/dokon-yaratish"); }, [ready, membership, load, router]);

  const grouped = useMemo(() => GROUPS.map((g) => ({ ...g, items: (data?.items ?? []).filter((i) => g.match(i.key)) })).filter((g) => g.items.length), [data]);

  if (!ready || !membership) return <PageSkeleton />;

  const toggle = async (f: Feature, enabled: boolean) => {
    setBusyKey(f.key);
    try {
      await api(`/v1/features/${f.key}`, { method: "PATCH", tenant: true, body: { enabled } });
      await load();
    } catch (e) { setToast({ msg: errText(e), tone: "danger" }); } finally { setBusyKey(null); }
  };

  const planName = (code: string) => (code === "v2" ? "v2" : t(`plan.${code}`));
  const on = data?.items.filter((i) => i.enabled).length ?? 0;

  return (
    <Shell role={membership.role} title={t("plan.title")} tenantName={membership.tenant_name} subtitle={data ? t("plan.subtitle", { plan: data.plan.name }) : undefined}
      actions={data && <Badge tone="ok">{data.plan.price_tiyin === null ? t("plan.price_contract") : data.plan.price_tiyin === 0 ? t("plan.free") : t("plan.price_month", { price: money(data.plan.price_tiyin) })}</Badge>}>
      {error ? <ErrorState message={error} onRetry={load} retryLabel={t("ui.retry")} />
        : !data ? <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>
        : (
          <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
            <div className="flex flex-col gap-4">
              {data.plan.migrate_at && <div role="status" className="rounded-lg bg-warning-soft p-3 text-body font-semibold text-warning">⚠ {new Date(data.plan.migrate_at).toLocaleDateString(locale === "ru" ? "ru-RU" : "uz-UZ")}</div>}
              <Card className="p-0">
                <div className="flex items-center justify-between border-b border-line-soft px-4 py-3"><h2 className="text-title-sm font-extrabold">{t("plan.title")}</h2><span className="text-body-sm text-muted">{on} / {data.items.length}</span></div>
                {grouped.map((g) => (
                  <section key={g.id} aria-labelledby={`g-${g.id}`}>
                    <h3 id={`g-${g.id}`} className="bg-bg px-4 py-2 text-caption font-bold uppercase tracking-wider text-muted">{GROUP_LABEL[g.id]![locale]}</h3>
                    <ul>
                      {g.items.map((f) => {
                        const locked = !f.in_plan, platformOff = !f.platform_enabled, blocked = (f.blocked_by ?? []).length > 0 && !f.enabled;
                        const disabled = !isOwner || locked || platformOff || f.toggled_by === "platform";
                        return (
                          <li key={f.key} data-feature={f.key} data-enabled={f.enabled} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line-soft px-4 py-2">
                            <div className={`min-w-0 flex-1 basis-48 break-words `}>
                              <p className={`text-body font-bold ${locked || platformOff ? "text-muted" : ""}`}>{t(`feature.${f.key}`)}</p>
                              <p className="text-body-sm text-muted">{f.key}{blocked && ` · ${t("plan.requires", { dependency: t(`feature.${f.blocked_by![0]!}`) })}`}</p>
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                              {locked && <Badge tone="warning">{t("plan.locked", { plan: planName(f.min_plan) })}</Badge>}
                              {!locked && platformOff && <Badge tone="danger">{t("plan.platform_off")}</Badge>}
                              <Switch checked={f.shop_enabled && !locked && !platformOff} disabled={disabled} busy={busyKey === f.key} label={t(`feature.${f.key}`)} onChange={(v) => void toggle(f, v)} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </Card>
            </div>
            <aside className="flex h-fit flex-col gap-4">
              {isOwner && <WorkHoursCard onToast={(msg, tone) => setToast({ msg, tone })} />}
              {isOwner && <DeliverySettingsCard onToast={(msg, tone) => setToast({ msg, tone })} />}
              {isOwner && membership.tenant_slug && <PaymentSettingsCard slug={membership.tenant_slug} onToast={(msg, tone) => setToast({ msg, tone })} />}
              <Card className="flex flex-col gap-3">
                <h2 className="text-title-sm font-extrabold">{t("plan.limits")}</h2>
                <Meter label={t("plan.limit.staff")} used={usage?.staff ?? 0} max={data.plan.limits.staff} unlimitedLabel={t("plan.unlimited")} />
                <Meter label={t("plan.limit.branches")} used={usage?.branches ?? 0} max={data.plan.limits.branches} unlimitedLabel={t("plan.unlimited")} />
                <Meter label={t("plan.limit.orders_month")} used={0} max={data.plan.limits.orders_month} unlimitedLabel={t("plan.unlimited")} />
              </Card>
            </aside>
          </div>
        )}
      {toast && <Toast message={toast.msg} tone={toast.tone} onClose={() => setToast(null)} />}
    </Shell>
  );
}
