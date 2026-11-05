"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@dostavka/ui";
import { ApiError, NetworkError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { setTenant } from "@/lib/session";
import { MainAction } from "@/lib/telegram";
import { useRequireSession } from "@/lib/use-session";
import { CenterCard, PageSkeleton } from "@/components/shell";
import { ConsentBox, type ConsentDoc } from "@/components/consent-box";

export default function CreateShopPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { ready } = useRequireSession();
  const [name, setName] = useState("");
  const [tin, setTin] = useState("");
  const [errors, setErrors] = useState<{ tin?: string; name?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [docs, setDocs] = useState<ConsentDoc[]>([]);
  const [accepted, setAccepted] = useState(false);

  const loadDocs = useCallback(async () => {
    try { const r = await api<{ items: { key: string; version: string }[] }>("/v1/legal/documents?audience=shop", { auth: false }); setDocs(r.items.map((d) => ({ document: d.key, version: d.version }))); setAccepted(false); }
    catch (e) { setErrors({ form: e instanceof ApiError ? e.text(locale) : t("ui.error_network") }); }
  }, [locale, t]);
  useEffect(() => { if (ready) void loadDocs(); }, [ready, loadDocs]);

  if (!ready) return <PageSkeleton />;

  const submit = async () => {
    setBusy(true); setErrors({});
    try {
      const r = await api<{ id: string }>("/v1/tenants", { method: "POST", body: { name: name.trim(), tin, consents: docs.map((d) => ({ document: d.document, version: d.version })) } });
      setTenant(r.id);
      router.replace("/xavfsizlik"); // egasi uchun ikkinchi omil majburiy (I-5)
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === "consent.required") { await loadDocs(); setErrors({ form: e.text(locale) }); }
        else if (e.code === "validation.tin_invalid") setErrors({ tin: e.text(locale) });
        else if (e.code === "validation.failed") setErrors({ name: e.text(locale) });
        else setErrors({ form: e.text(locale) });
      } else setErrors({ form: e instanceof NetworkError ? t("ui.error_network") : t("ui.error_generic") });
    } finally { setBusy(false); }
  };

  return (
    <CenterCard title={t("shop.create_title")} subtitle={t("shop.create_subtitle")}>
      <Input id="name" label={t("shop.name")} value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={120} autoComplete="organization" autoFocus />
      <Input id="tin" label={t("shop.tin")} inputMode="numeric" value={tin} onChange={(e) => setTin(e.target.value.replace(/\D/g, "").slice(0, 9))} error={errors.tin} />
      {docs.length > 0 && <ConsentBox docs={docs} accepted={accepted} onChange={setAccepted} intro={t("shop.accept_docs")} />}
      {errors.form && <p role="alert" className="text-body font-semibold text-danger">{errors.form}</p>}
      <MainAction text={t("shop.create")} onClick={submit} disabled={name.trim().length < 2 || tin.length === 0 || docs.length === 0 || !accepted} loading={busy}>{t("shop.create")}</MainAction>
    </CenterCard>
  );
}
