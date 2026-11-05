"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@dostavka/ui";
import { ApiError, NetworkError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { decodeAmr, getSession, updateTokens } from "@/lib/session";
import { MainAction } from "@/lib/telegram";
import { useRequireSession } from "@/lib/use-session";
import { CenterCard, PageSkeleton } from "@/components/shell";

/** I-5: egasi, buxgalter va admin uchun TOTP sozlash (majburiy). */
export default function SecurityPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { ready } = useRequireSession();
  const [secret, setSecret] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = useCallback((e: unknown) => setError(e instanceof ApiError ? e.text(locale) : e instanceof NetworkError ? t("ui.error_network") : t("ui.error_generic")), [locale, t]);

  useEffect(() => {
    if (!ready) return;
    if (decodeAmr(getSession()!.access).includes("totp")) { router.replace("/jamoa"); return; }
    api<{ secret: string; otpauth_uri: string }>("/v1/auth/totp/enroll", { method: "POST" }).then(setSecret).catch(fail);
  }, [ready, router, fail]);

  if (!ready) return <PageSkeleton />;

  const confirm = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api<{ access_token: string; refresh_token: string }>("/v1/auth/totp/confirm", { method: "POST", body: { code } });
      updateTokens(r.access_token, r.refresh_token);
      router.replace("/jamoa");
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  return (
    <CenterCard title={t("mfa.setup_title")} subtitle={t("mfa.setup_hint")}>
      {secret ? (
        <>
          <div className="rounded-lg bg-bg p-3">
            <p className="text-body-sm text-muted">{t("mfa.secret")}</p>
            <p className="mt-1 break-all font-mono text-body-lg font-bold tracking-wider" data-testid="totp-secret">{secret.secret}</p>
            <a href={secret.otpauth_uri} className="mt-2 inline-flex min-h-touch items-center text-body font-bold">Authenticator →</a>
          </div>
          <Input id="totp" label={t("login.code")} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} error={error} />
          <MainAction text={t("login.verify")} onClick={confirm} disabled={!/^\d{6}$/.test(code)} loading={busy}>{t("login.verify")}</MainAction>
        </>
      ) : error ? <p role="alert" className="font-semibold text-danger">{error}</p> : <div aria-busy="true" className="h-24 animate-pulse rounded-lg bg-line-soft" />}
    </CenterCard>
  );
}
