"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Card, ErrorState, Skeleton, Switch } from "@dostavka/ui";
import { ApiError, NetworkError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { setSession } from "@/lib/session";
import { useRequireSession } from "@/lib/use-session";
import { LangSwitch, PageSkeleton } from "@/components/shell";

interface Consent { document: string; version: string; action: "accepted" | "revoked"; at: string }

/** Xaridor profili: marketing roziligi xizmat roziligidan alohida (CLAUDE.md §3); til; chiqish. Tahlil ko'rsatilmaydi. */
export default function ProfilePage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { me, ready } = useRequireSession();
  const [consents, setConsents] = useState<Consent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fail = useCallback((e: unknown) => setError(e instanceof ApiError ? e.text(locale) : e instanceof NetworkError ? t("ui.error_network") : t("ui.error_generic")), [locale, t]);
  const load = useCallback(async () => {
    try { setConsents((await api<{ items: Consent[] }>("/v1/me/consents")).items); setError(null); } catch (e) { fail(e); }
  }, [fail]);
  useEffect(() => { if (ready) void load(); }, [ready, load]);

  if (!ready || !me) return <PageSkeleton />;
  const marketing = consents?.find((c) => c.document === "marketing")?.action === "accepted";
  const fmt = (d: string) => new Date(d).toLocaleString(locale === "ru" ? "ru-RU" : "uz-UZ", { timeZone: "Asia/Tashkent", dateStyle: "short", timeStyle: "short" });
  const toggle = async (granted: boolean) => {
    setBusy(true);
    try { await api("/v1/me/consents/marketing", { method: "PUT", body: { granted } }); await load(); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const logout = async () => {
    try { await api("/v1/auth/logout", { method: "POST", noRetry: true }); } catch { /* sessiya baribir tozalanadi */ }
    setSession(null); router.replace("/kirish");
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col gap-4 px-4 py-6" style={{ paddingTop: "calc(16px + var(--safe-top))" }}>
      <div className="flex items-center justify-between"><Link href="/" className="inline-flex min-h-touch items-center text-title-sm font-extrabold text-brand-dark no-underline">{t("ui.app_name")}</Link><LangSwitch /></div>
      <h1 className="text-title font-extrabold">{t("prof.title")}</h1>
      <Card className="flex flex-col gap-1 p-4">
        <p className="text-body-sm text-muted">{t("prof.phone")}</p>
        <p className="font-mono text-body-lg font-bold" data-testid="prof-phone">{me.phone_masked ?? "—"}</p>
      </Card>
      <Card className="flex flex-col gap-3 p-4">
        <h2 className="text-title-sm font-extrabold">{t("prof.marketing")}</h2>
        <p className="text-body text-muted">{t("prof.marketing_hint")}</p>
        {error && !consents ? <ErrorState message={error} onRetry={load} retryLabel={t("ui.retry")} />
          : !consents ? <Skeleton className="h-11" />
          : <Switch checked={Boolean(marketing)} onChange={toggle} busy={busy} disabled={busy} label={t("prof.marketing_toggle")} />}
        {error && consents && <p role="alert" className="font-semibold text-danger">{error}</p>}
      </Card>
      <Card className="flex flex-col gap-2 p-4">
        <h2 className="text-title-sm font-extrabold">{t("prof.consents")}</h2>
        {!consents ? <Skeleton className="h-12" /> : consents.length === 0 ? <p className="text-body text-muted">{t("prof.consents_empty")}</p> : (
          <ul className="flex flex-col gap-2" data-testid="prof-consents">
            {consents.map((c) => (
              <li key={c.document} className="flex flex-wrap items-center justify-between gap-2 text-body">
                <span>{c.document === "customer_offer" ? t("land.offer") : c.document === "privacy_policy" ? t("land.privacy") : t("prof.marketing")} · v{c.version}</span>
                <span className="flex items-center gap-2"><Badge tone={c.action === "accepted" ? "ok" : "neutral"}>{t(`prof.${c.action}`)}</Badge><span className="text-body-sm text-muted">{fmt(c.at)}</span></span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-4 pt-1 text-body-sm">
          <Link href="/hujjat/customer_offer" className="inline-flex min-h-touch items-center">{t("land.offer")}</Link>
          <Link href="/hujjat/privacy_policy" className="inline-flex min-h-touch items-center">{t("land.privacy")}</Link>
        </div>
      </Card>
      <Button variant="secondary" onClick={logout}>{t("nav.logout")}</Button>
    </div>
  );
}
