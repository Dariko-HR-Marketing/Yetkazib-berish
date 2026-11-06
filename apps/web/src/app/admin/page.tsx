"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Skeleton, Switch, Toast } from "@dostavka/ui";
import { ApiError, NetworkError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useRequireSession } from "@/lib/use-session";
import { PageSkeleton, Shell } from "@/components/shell";

interface Tenant { id: string; name: string; slug: string; status: string; plan_code: string; members: number }
interface Flag { key: string; description?: string; platform_enabled: boolean; min_plan: string }
interface Legal { id: string; key: string; version: string | number; locale: string; status: string }
type Tab = "tenants" | "flags" | "legal";
const PLANS = ["start", "biznes", "pro", "tarmoq"];

export default function AdminPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { me, ready } = useRequireSession();
  const [tab, setTab] = useState<Tab>("tenants");
  const [q, setQ] = useState("");
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [flags, setFlags] = useState<Flag[] | null>(null);
  const [legal, setLegal] = useState<Legal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "danger" } | null>(null);
  const errText = useCallback((e: unknown) => (e instanceof ApiError ? e.text(locale) : e instanceof NetworkError ? t("ui.error_network") : t("ui.error_generic")), [locale, t]);

  const load = useCallback(async () => {
    try {
      setError(null);
      if (tab === "tenants") setTenants((await api<{ items: Tenant[] }>(`/v1/admin/tenants${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`)).items);
      if (tab === "flags") setFlags((await api<{ items: Flag[] }>("/v1/admin/flags")).items);
      if (tab === "legal") setLegal((await api<{ items: Legal[] }>("/v1/admin/legal")).items);
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth.mfa_required") { router.replace("/xavfsizlik"); return; }
      setError(errText(e));
    }
  }, [tab, q, errText, router]);
  useEffect(() => { if (ready && me?.is_platform_admin) { const id = setTimeout(() => void load(), q ? 300 : 0); return () => clearTimeout(id); } }, [ready, me, load, q]);

  if (!ready) return <PageSkeleton />;
  if (!me?.is_platform_admin) return <Shell title={t("admin.title")}><p role="alert" className="text-body font-semibold">{t("admin.not_admin")}</p></Shell>;

  const setPlan = async (id: string, plan_code: string) => {
    try { await api(`/v1/admin/tenants/${id}/plan`, { method: "POST", body: { plan_code } }); setToast({ msg: t("admin.plan_changed"), tone: "ok" }); await load(); } catch (e) { setToast({ msg: errText(e), tone: "danger" }); }
  };
  const setFlag = async (key: string, v: boolean) => {
    try { await api(`/v1/admin/flags/${key}`, { method: "PATCH", body: { platform_enabled: v } }); setToast({ msg: t("admin.flag_saved"), tone: "ok" }); await load(); } catch (e) { setToast({ msg: errText(e), tone: "danger" }); }
  };
  const publish = async (id: string) => {
    try { await api(`/v1/admin/legal/${id}/publish`, { method: "POST", body: {} }); setToast({ msg: t("admin.published"), tone: "ok" }); await load(); } catch (e) { setToast({ msg: errText(e), tone: "danger" }); }
  };
  const tabs: Tab[] = ["tenants", "flags", "legal"];

  return (
    <Shell role="platform_admin" title={t("admin.title")} subtitle={t("admin.subtitle")}>
      <div role="group" aria-label={t("admin.title")} className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {tabs.map((k) => <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={`inline-flex min-h-touch shrink-0 items-center rounded-full border px-4 text-body font-bold ${tab === k ? "border-ink bg-ink text-bg" : "border-line-strong bg-surface text-ink-2"}`}>{t(`admin.tab_${k}`)}</button>)}
      </div>
      {error ? <ErrorState message={error} onRetry={load} retryLabel={t("ui.retry")} /> : (
        <>
          {tab === "tenants" && (
            <div className="flex flex-col gap-3">
              <Input id="adm-q" label={t("admin.search")} type="search" value={q} onChange={(e) => setQ(e.target.value)} />
              {tenants === null ? <Skeleton className="h-24" /> : tenants.length === 0 ? <EmptyState title={t("shop.empty")} /> : (
                <ul className="flex flex-col gap-3">{tenants.map((x) => (
                  <li key={x.id}><Card className="flex flex-wrap items-center justify-between gap-3 p-3" data-testid="admin-tenant">
                    <div className="min-w-0 flex-1 basis-48"><p className="break-words font-bold">{x.name}</p><p className="text-body-sm text-muted">/d/{x.slug} · {t("admin.members", { count: x.members })}</p></div>
                    <Badge tone={x.status === "active" ? "ok" : "warning"}>{x.status}</Badge>
                    <select aria-label={`${t("admin.plan")}: ${x.name}`} value={x.plan_code} onChange={(e) => void setPlan(x.id, e.target.value)} className="min-h-touch rounded-md border border-line-strong bg-surface px-3 text-body-lg">
                      {PLANS.map((p) => <option key={p} value={p}>{t(`plan.${p}`)}</option>)}
                    </select>
                  </Card></li>))}</ul>)}
            </div>
          )}
          {tab === "flags" && (flags === null ? <Skeleton className="h-48" /> : (
            <Card className="p-0"><ul>{flags.map((f) => (
              <li key={f.key} className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-4 py-2 first:border-t-0">
                <div className="min-w-0 flex-1 basis-48"><p className="font-bold">{t(`feature.${f.key}`)}</p><p className="text-body-sm text-muted">{f.key} · {f.min_plan}</p></div>
                <Switch checked={f.platform_enabled} label={`${t("admin.flag_on")}: ${f.key}`} onChange={(v) => void setFlag(f.key, v)} />
              </li>))}</ul></Card>))}
          {tab === "legal" && (legal === null ? <Skeleton className="h-32" /> : (
            <div className="flex flex-col gap-3"><p className="text-body text-muted">{t("admin.legal_info")}</p>
              <Card className="p-0"><table className="w-full text-left text-body"><thead className="bg-bg text-caption uppercase tracking-wide text-muted"><tr><th className="px-3 py-2">{t("admin.col_doc")}</th><th className="px-3 py-2">{t("admin.col_ver")}</th><th className="px-3 py-2">{t("admin.col_status")}</th><th className="px-3 py-2"><span className="sr-only">{t("admin.publish")}</span></th></tr></thead>
                <tbody>{legal.map((d) => <tr key={d.id} className="border-t border-line-soft"><td className="px-3 py-2">{d.key} · {d.locale}</td><td className="px-3 py-2">{d.version}</td><td className="px-3 py-2"><Badge tone={d.status === "effective" ? "ok" : "neutral"}>{d.status}</Badge></td><td className="px-3 py-1">{d.status === "draft" && <Button variant="ghost" onClick={() => void publish(d.id)}>{t("admin.publish")}</Button>}</td></tr>)}</tbody></table></Card></div>))}
        </>
      )}
      {toast && <Toast message={toast.msg} tone={toast.tone} onClose={() => setToast(null)} />}
    </Shell>
  );
}
