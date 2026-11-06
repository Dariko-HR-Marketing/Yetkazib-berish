"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "@dostavka/ui";
import { ApiError, NetworkError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useRequireSession } from "@/lib/use-session";
import { PageSkeleton, Shell } from "@/components/shell";

interface Entry { id: number; created_at: string; action: string; entity: string; entity_id: string; actor: { id: string; phone_masked: string | null } | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null }
interface Page { items: Entry[]; next_cursor: string | null }
const READ = new Set(["owner", "manager", "accountant"]);
const FILTERS = ["order.", "product.", "stock.", "member.", "payment.", "cash.", "loyalty.", "tenant."];

export default function AuditPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { me, ready, session } = useRequireSession();
  const membership = me?.memberships.find((m) => m.tenant_id === session?.tenantId);
  const role = membership?.role ?? "";
  const [items, setItems] = useState<Entry[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (after: string | null) => {
    setBusy(true);
    try {
      const qs = new URLSearchParams({ limit: "30" });
      if (after) qs.set("cursor", after);
      if (filter) qs.set("action", filter);
      const r = await api<Page>(`/v1/audit?${qs}`, { tenant: true });
      setItems((prev) => (after && prev ? [...prev, ...r.items] : r.items));
      setCursor(r.next_cursor); setError(null);
    } catch (e) { setError(e instanceof ApiError ? e.text(locale) : e instanceof NetworkError ? t("ui.error_network") : t("ui.error_generic")); }
    finally { setBusy(false); }
  }, [filter, locale, t]);

  useEffect(() => {
    if (!ready) return;
    if (!membership) { router.replace("/dokon-yaratish"); return; }
    if (!READ.has(role)) { router.replace("/paket"); return; }
    setItems(null); void load(null);
  }, [ready, membership, role, load, router]);

  if (!ready || !membership || !READ.has(role)) return <PageSkeleton />;
  const fmt = (d: string) => new Date(d).toLocaleString(locale === "ru" ? "ru-RU" : "uz-UZ", { timeZone: "Asia/Tashkent", dateStyle: "short", timeStyle: "medium" });

  return (
    <Shell role={role} title={t("audit.title")} subtitle={t("audit.subtitle")} tenantName={membership.tenant_name}
      actions={<label className="flex items-center gap-2 text-body-sm text-muted">{t("audit.filter")}
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="min-h-touch rounded-lg border border-line-strong bg-surface px-3 text-body text-ink">
          <option value="">{t("audit.filter_all")}</option>
          {FILTERS.map((f) => <option key={f} value={f}>{f}*</option>)}
        </select></label>}>
      {error && !items ? <ErrorState message={error} onRetry={() => load(null)} retryLabel={t("ui.retry")} />
        : !items ? <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
        : items.length === 0 ? <EmptyState title={t("audit.empty")} />
        : (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2" data-testid="audit-list">
              {items.map((a) => (
                <li key={a.id}>
                  <Card className="flex flex-col gap-1 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <b className="break-all font-mono text-body">{a.action}</b>
                      <span className="text-body-sm text-muted">{fmt(a.created_at)}</span>
                    </div>
                    <p className="break-all text-body-sm text-muted">{a.entity} · {a.entity_id} · {a.actor ? a.actor.phone_masked ?? a.actor.id : t("audit.system")}</p>
                    {(a.before || a.after) && (
                      <details className="text-body-sm">
                        <summary className="inline-flex min-h-touch cursor-pointer items-center font-semibold">{t("audit.details")}</summary>
                        {a.before && <p className="break-all"><b>{t("audit.before")}:</b> <code>{JSON.stringify(a.before)}</code></p>}
                        {a.after && <p className="break-all"><b>{t("audit.after")}:</b> <code>{JSON.stringify(a.after)}</code></p>}
                      </details>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
            {error && <p role="alert" className="font-semibold text-danger">{error}</p>}
            {cursor && <Button variant="secondary" loading={busy} onClick={() => load(cursor)}>{t("audit.more")}</Button>}
          </div>
        )}
    </Shell>
  );
}
