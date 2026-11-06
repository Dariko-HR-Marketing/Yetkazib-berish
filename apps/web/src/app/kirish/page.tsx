"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@dostavka/ui";
import { ApiError, NetworkError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useOpenLogin } from "@/lib/auth-config";
import { getSession, setSession, signIn } from "@/lib/session";
import { MainAction, tgInitData } from "@/lib/telegram";
import type { Me } from "@/lib/use-session";
import { CenterCard } from "@/components/shell";
import { ConsentBox, type ConsentDoc } from "@/components/consent-box";

type Step = "phone" | "code" | "mfa";
/** BFF tokenlarni cookie'ga o'tkazadi; brauzerga faqat amr (ikkinchi omil belgisi) qaytadi. */
interface Authed { amr: string[] }
type SignIn = (Authed & { is_new_user: boolean }) | { mfa_required: true; mfa_token: string };

const normalize = (v: string) => { const d = v.replace(/\D/g, ""); const n = d.startsWith("998") ? d : "998" + d; return "+" + n.slice(0, 12); };
const pretty = (v: string) => { const d = normalize(v).slice(1); return `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10, 12)}`.trim(); };

export default function LoginPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("+998 ");
  const [code, setCode] = useState("");
  const [mfaToken, setMfaToken] = useState("");
  // Server qaytargan, hali qabul qilinmagan (yoki yangi versiyali) hujjatlar; versiyalar qattiq kodlanmagan.
  const [docs, setDocs] = useState<ConsentDoc[]>([]);
  const needConsent = docs.length > 0;
  const [accepted, setAccepted] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  // Xato obyekti saqlanadi, matn har renderda joriy tilda hosil qilinadi (til keyin o'zgarsa ham to'g'ri chiqadi).
  const [err, setErr] = useState<unknown>(null);
  const setError = useCallback((v: null) => setErr(v), []);
  const error = err === null ? null : err instanceof ApiError ? err.text(locale) : err instanceof NetworkError ? t("ui.error_network") : t("ui.error_generic");
  const [cooldown, setCooldown] = useState(0);
  const tgTried = useRef(false);
  const openLogin = useOpenLogin();

  const fail = setErr;

  useEffect(() => { if (cooldown <= 0) return; const id = setTimeout(() => setCooldown((c) => c - 1), 1000); return () => clearTimeout(id); }, [cooldown]);

  const finish = useCallback(async (tok: Authed) => {
    signIn(tok.amr ?? []);
    const me = await api<Me>("/v1/me");
    const pending = sessionStorage.getItem("dostavka.invite");
    const active = me.memberships.find((m) => m.status === "active");
    if (active) setSession({ ...getSession()!, tenantId: active.tenant_id });
    if (pending) { router.replace(`/taklif/${pending}`); return; }
    // Rolga mos birinchi sahifa: katalog/qoldiq paneli bor rollar — /katalog; dispetcher va kuryer uchun hozircha faqat /paket (ularning ish ekranlari keyingi sprintlarda)
    router.replace(!active ? "/dokon-yaratish" : ["dispatcher", "courier"].includes(active.role) ? "/paket" : "/katalog");
  }, [router]);

  const handleSignIn = useCallback(async (r: SignIn) => {
    if ("mfa_required" in r) { setMfaToken(r.mfa_token); setStep("mfa"); setCode(""); return; }
    await finish(r);
  }, [finish]);

  const telegram = useCallback(async (withConsent: boolean) => {
    setBusy(true); setError(null);
    try {
      const r = await api<SignIn>("/v1/auth/telegram", { method: "POST", auth: false, body: { init_data: tgInitData(), ...(withConsent ? { consents: docs.map((d) => ({ document: d.document, version: d.version })), marketing_consent: marketing } : {}) } });
      await handleSignIn(r);
    } catch (e) {
      if (e instanceof ApiError && e.code === "consent.required") { setDocs((e.details.documents as ConsentDoc[]) ?? []); setStep("code"); } else fail(e);
    } finally { setBusy(false); }
  }, [docs, fail, handleSignIn, marketing]);

  useEffect(() => {
    if (tgTried.current || !tgInitData()) return;
    tgTried.current = true;
    void telegram(false);
  }, [telegram]);

  const sendCode = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      await api("/v1/auth/otp/request", { method: "POST", auth: false, body: { phone: normalize(phone) } });
      setStep("code"); setCode(""); setCooldown(60);
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth.otp_rate_limited") { setStep("code"); setCooldown(Number(e.details.retry_after ?? 60)); }
      fail(e);
    } finally { setBusy(false); }
  }, [phone, fail]);

  const verify = useCallback(async () => {
    if (tgInitData() && needConsent && !code) { await telegram(true); return; }
    setBusy(true); setError(null);
    try {
      const body = { phone: normalize(phone), code, ...(needConsent ? { consents: docs.map((d) => ({ document: d.document, version: d.version })), marketing_consent: marketing } : {}) };
      const r = await api<SignIn>("/v1/auth/otp/verify", { method: "POST", auth: false, body });
      await handleSignIn(r);
    } catch (e) {
      if (e instanceof ApiError && e.code === "consent.required") { setDocs((e.details.documents as ConsentDoc[]) ?? []); setErr(null); setAccepted(false); } else fail(e);
    } finally { setBusy(false); }
  }, [code, docs, fail, handleSignIn, marketing, needConsent, phone, telegram]);

  // VAQTINCHA sinov rejimi: faqat telefon raqami (SMS kod, ikkinchi omil va rozilik so'ralmaydi).
  const openSignIn = useCallback(async () => {
    setBusy(true); setError(null);
    try { await finish(await api<Authed>("/v1/auth/open", { method: "POST", auth: false, body: { phone: normalize(phone) } })); }
    catch (e) { fail(e); } finally { setBusy(false); }
  }, [fail, finish, phone]);

  const verifyMfa = useCallback(async () => {
    setBusy(true); setError(null);
    try { await finish(await api<Authed>("/v1/auth/totp/verify", { method: "POST", auth: false, body: { mfa_token: mfaToken, code } })); }
    catch (e) { fail(e); } finally { setBusy(false); }
  }, [code, fail, finish, mfaToken]);

  const validPhone = normalize(phone).length === 13;
  const codeOk = /^\d{6}$/.test(code);

  if (step === "mfa") {
    return (
      <CenterCard title={t("login.mfa_title")} subtitle={t("login.mfa_hint")}>
        <Input id="mfa" label={t("login.code")} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} error={error} autoFocus />
        <MainAction text={t("login.verify")} onClick={verifyMfa} disabled={!codeOk} loading={busy}>{t("login.verify")}</MainAction>
      </CenterCard>
    );
  }

  if (step === "code") {
    const canSubmit = needConsent ? codeOk && accepted : codeOk;
    return (
      <CenterCard title={t("login.title")} subtitle={t("login.code_hint", { phone: pretty(phone) })}>
        {!(tgInitData() && !code && needConsent) && (
          <Input id="code" label={t("login.code")} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} error={error} autoFocus />
        )}
        {needConsent && (
          <ConsentBox docs={docs} accepted={accepted} onChange={setAccepted} intro={t("consent.accept_docs")}>
            <label className="flex min-h-touch items-start gap-3 text-body">
              <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--c-brand)]" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
              <span>{t("login.marketing")}</span>
            </label>
          </ConsentBox>
        )}
        {needConsent && error && <p role="alert" className="text-body-sm font-semibold text-danger">{error}</p>}
        <MainAction text={t("login.verify")} onClick={verify} disabled={!canSubmit && !(tgInitData() && needConsent && accepted)} loading={busy}>{t("login.verify")}</MainAction>
        <Button variant="ghost" onClick={sendCode} disabled={cooldown > 0 || busy}>{cooldown > 0 ? t("login.resend_in", { seconds: cooldown }) : t("login.resend")}</Button>
        <Button variant="ghost" onClick={() => { setStep("phone"); setError(null); setDocs([]); }}>{t("ui.back")}</Button>
      </CenterCard>
    );
  }

  if (openLogin) {
    return (
      <CenterCard title={t("login.title")} subtitle={t("login.subtitle")}>
        <Input id="phone" label={t("login.phone")} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value.length < 5 ? "+998 " : pretty(e.target.value))} error={error} hint="+998 90 123 45 67" autoFocus />
        <MainAction text={t("login.enter")} onClick={openSignIn} disabled={!validPhone} loading={busy}>{t("login.enter")}</MainAction>
      </CenterCard>
    );
  }

  return (
    <CenterCard title={t("login.title")} subtitle={t("login.subtitle")}>
      <Input id="phone" label={t("login.phone")} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value.length < 5 ? "+998 " : pretty(e.target.value))} error={error} hint="+998 90 123 45 67" autoFocus />
      <MainAction text={t("login.send_code")} onClick={sendCode} disabled={!validPhone} loading={busy}>{t("login.send_code")}</MainAction>
    </CenterCard>
  );
}
