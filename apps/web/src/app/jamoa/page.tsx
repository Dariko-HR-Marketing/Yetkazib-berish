"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Skeleton, Toast } from "@dostavka/ui";
import { ApiError, NetworkError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { MainAction } from "@/lib/telegram";
import { useRequireSession } from "@/lib/use-session";
import { PageSkeleton, Shell } from "@/components/shell";

interface Member { id: string; user_id: string; role: string; status: "active" | "suspended"; phone_masked: string | null }
interface Invite { id: string; role: string; phone_masked: string; expires_at: string }
interface MemberList { items: Member[]; next_cursor: string | null; limit: { used: number; max: number | null } }
const INVITE_ROLES = ["manager", "picker", "cashier", "dispatcher", "accountant", "marketer", "courier"] as const;
const ALL_ROLES = ["owner", ...INVITE_ROLES] as const;

export default function TeamPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { me, ready, session } = useRequireSession();
  const [data, setData] = useState<MemberList | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "danger" } | null>(null);
  const [phone, setPhone] = useState("+998");
  const [role, setRole] = useState<(typeof INVITE_ROLES)[number]>("picker");
  const [busy, setBusy] = useState(false);
  const [limitHit, setLimitHit] = useState(false);

  const membership = me?.memberships.find((m) => m.tenant_id === session?.tenantId);
  const isOwner = membership?.role === "owner";

  const errText = useCallback((e: unknown) => (e instanceof ApiError ? e.text(locale) : e instanceof NetworkError ? t("ui.error_network") : t("ui.error_generic")), [locale, t]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const members = await api<MemberList>("/v1/members", { tenant: true });
      setData(members);
      setInvites(isOwner ? (await api<{ items: Invite[] }>("/v1/invites", { tenant: true })).items : []);
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth.mfa_required") { router.replace("/xavfsizlik"); return; }
      setError(errText(e));
    } finally { setLoading(false); }
  }, [errText, isOwner, router]);

  useEffect(() => { if (ready && membership) void load(); else if (ready && !membership) router.replace("/dokon-yaratish"); }, [ready, membership, load, router]);

  if (!ready || !membership) return <PageSkeleton />;

  const sendInvite = async () => {
    setBusy(true); setLimitHit(false);
    try {
      await api("/v1/invites", { method: "POST", tenant: true, body: { phone: phone.replace(/[\s()-]/g, ""), role } });
      setToast({ msg: t("team.invite_sent"), tone: "ok" }); setPhone("+998");
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "plan.limit_reached") setLimitHit(true);
      setToast({ msg: errText(e), tone: "danger" });
    } finally { setBusy(false); }
  };

  const patch = async (m: Member, body: { role?: string; status?: string }) => {
    try {
      await api(`/v1/members/${m.id}`, { method: "PATCH", tenant: true, body });
      setToast({ msg: t("team.role_changed"), tone: "ok" });
      await load();
    } catch (e) { setToast({ msg: errText(e), tone: "danger" }); }
  };

  return (
    <Shell title={t("team.title")} subtitle={t("team.subtitle")} tenantName={membership.tenant_name}
      actions={data && <Badge tone={data.limit.max !== null && data.limit.used >= data.limit.max ? "warning" : "neutral"}>{data.limit.max === null ? t("team.limit_unlimited", { used: data.limit.used }) : t("team.limit", { used: data.limit.used, limit: data.limit.max })}</Badge>}>
      {loading && !data ? <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
        : error ? <ErrorState message={error} onRetry={load} retryLabel={t("ui.retry")} />
        : data && (
          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            <Card className="overflow-x-auto p-0">
              {data.items.length === 0 ? <EmptyState title={t("team.empty")} /> : (
                <table className="w-full text-left text-body">
                  <thead className="bg-bg text-caption uppercase tracking-wide text-muted">
                    <tr><th className="px-3 py-3 md:px-4">{t("team.invite_phone")}</th><th className="px-3 py-3 md:px-4">{t("team.invite_role")}</th><th className="px-3 py-3 md:px-4"><span className="sr-only">{t("ui.save")}</span></th></tr>
                  </thead>
                  <tbody>
                    {data.items.map((m) => (
                      <tr key={m.id} className="border-t border-line-soft">
                        <td className="px-3 py-3 md:px-4">
                          <p className="font-semibold">{m.phone_masked ?? "Telegram"}</p>
                          {m.status === "suspended" && <Badge tone="danger">⏸</Badge>}
                        </td>
                        <td className="px-3 py-2 md:px-4">
                          {isOwner ? (
                            <select aria-label={t("team.invite_role")} value={m.role} onChange={(e) => void patch(m, { role: e.target.value })} className="min-h-touch w-full rounded-md border border-line-strong bg-surface px-2 text-body">
                              {ALL_ROLES.map((r) => <option key={r} value={r} disabled={r === "owner" && m.role !== "owner"}>{t(`role.${r}`)}</option>)}
                            </select>
                          ) : t(`role.${m.role}`)}
                        </td>
                        <td className="px-1 py-2 text-right md:px-4">
                          {isOwner && <Button variant="ghost" aria-label={m.status === "active" ? "Suspend" : "Activate"} onClick={() => void patch(m, { status: m.status === "active" ? "suspended" : "active" })}>{m.status === "active" ? "⏸" : "▶"}</Button>}
                        </td>
                      </tr>
                    ))}
                    {invites.map((i) => (
                      <tr key={i.id} className="border-t border-line-soft text-muted">
                        <td className="px-3 py-3 md:px-4">{i.phone_masked}</td><td className="px-3 py-3 md:px-4">{t(`role.${i.role}`)}</td><td className="px-3 py-3 text-right md:px-4"><Badge tone="info">{t("team.pending")}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            {isOwner && (
              <Card className="flex h-fit flex-col gap-4">
                <h2 className="text-title-sm font-extrabold">{t("team.invite")}</h2>
                <Input id="inv-phone" label={t("team.invite_phone")} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} hint="+998 90 123 45 67" />
                <div className="flex flex-col gap-1">
                  <label htmlFor="inv-role" className="text-body font-semibold">{t("team.invite_role")}</label>
                  <select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="min-h-touch rounded-md border border-line-strong bg-surface px-3 text-body-lg">
                    {INVITE_ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
                  </select>
                </div>
                {limitHit && <Link href="/paket" className="inline-flex min-h-touch items-center font-bold">{t("team.upgrade")} →</Link>}
                <MainAction text={t("team.invite_send")} onClick={sendInvite} disabled={phone.replace(/\D/g, "").length !== 12} loading={busy}>{t("team.invite_send")}</MainAction>
              </Card>
            )}
          </div>
        )}
      {toast && <Toast message={toast.msg} tone={toast.tone} onClose={() => setToast(null)} />}
    </Shell>
  );
}
