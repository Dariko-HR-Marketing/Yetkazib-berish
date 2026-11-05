"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@dostavka/ui";
import { ApiError, NetworkError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { setTenant } from "@/lib/session";
import { MainAction } from "@/lib/telegram";
import { useRequireSession } from "@/lib/use-session";
import { CenterCard, PageSkeleton } from "@/components/shell";

export default function CreateShopPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { ready } = useRequireSession();
  const [name, setName] = useState("");
  const [tin, setTin] = useState("");
  const [errors, setErrors] = useState<{ tin?: string; name?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  if (!ready) return <PageSkeleton />;

  const submit = async () => {
    setBusy(true); setErrors({});
    try {
      const r = await api<{ id: string }>("/v1/tenants", { method: "POST", body: { name: name.trim(), tin } });
      setTenant(r.id);
      router.replace("/xavfsizlik"); // egasi uchun ikkinchi omil majburiy (I-5)
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === "validation.tin_invalid") setErrors({ tin: e.text(locale) });
        else if (e.code === "validation.failed") setErrors({ name: e.text(locale) });
        else setErrors({ form: e.text(locale) });
      } else setErrors({ form: e instanceof NetworkError ? t("ui.error_network") : t("ui.error_generic") });
    } finally { setBusy(false); }
  };

  return (
    <CenterCard title={t("shop.create_title")} subtitle={t("shop.create_subtitle")}>
      <Input id="name" label={t("shop.name")} value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={120} autoComplete="organization" autoFocus />
      <Input id="tin" label={t("shop.tin")} inputMode="numeric" value={tin} onChange={(e) => setTin(e.target.value.replace(/\D/g, "").slice(0, 9))} error={errors.tin} />
      {errors.form && <p role="alert" className="text-body font-semibold text-danger">{errors.form}</p>}
      <MainAction text={t("shop.create")} onClick={submit} disabled={name.trim().length < 2 || tin.length === 0} loading={busy}>{t("shop.create")}</MainAction>
    </CenterCard>
  );
}
