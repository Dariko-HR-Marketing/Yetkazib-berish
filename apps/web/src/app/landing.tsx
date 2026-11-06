"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, Card } from "@dostavka/ui";
import { LangSwitch } from "@/components/shell";
import { useI18n } from "@/lib/i18n";
import { getSession } from "@/lib/session";

export interface PublicPlan { code: string; name: string; price_tiyin: number | null; limits: { orders_month: number | null; branches: number | null; staff: number | null; integrations: number | null }; features: string[] }

export function Landing({ plans }: { plans: PublicPlan[] }) {
  const { t, money } = useI18n();
  const [signed, setSigned] = useState(false);
  useEffect(() => { setSigned(Boolean(getSession())); }, []);
  const price = (p: PublicPlan) => (p.price_tiyin === null ? t("land.contract") : p.price_tiyin === 0 ? t("plan.free") : `${money(p.price_tiyin)} ${t("land.per_month")}`);
  const lim = (v: number | null) => (v === null ? t("plan.unlimited") : String(v));
  const steps = [["s1", "1"], ["s2", "2"], ["s3", "3"]] as const;
  const why = ["b1", "b2", "b3", "b4"] as const;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1100px] flex-col px-4 md:px-6" style={{ paddingTop: "var(--safe-top)" }}>
      <header className="flex flex-wrap items-center justify-between gap-3 py-3">
        <span className="text-title-sm font-extrabold text-brand-dark">{t("ui.app_name")}</span>
        <div className="flex items-center gap-2"><LangSwitch /></div>
      </header>
      <main className="min-w-0 flex-1 break-words">
        <section className="flex flex-col gap-4 py-8 md:py-14" aria-labelledby="hero">
          <h1 id="hero" className="max-w-3xl text-title font-extrabold md:text-[40px] md:leading-tight">{t("land.title")}</h1>
          <p className="max-w-2xl text-body-lg text-muted">{t("land.sub")}</p>
          <div className="flex flex-wrap gap-3">
            {signed ? <Link href="/panel" className="no-underline hover:no-underline"><Button>{t("land.panel")}</Button></Link>
              : <Link href="/kirish" className="no-underline hover:no-underline"><Button>{t("land.cta")}</Button></Link>}
            <Link href="/yaqin" className="no-underline hover:no-underline"><Button variant="ghost">{t("land.cta2")}</Button></Link>
          </div>
        </section>

        <section aria-labelledby="steps" className="py-6">
          <h2 id="steps" className="mb-3 text-title-sm font-extrabold md:text-title">{t("land.steps")}</h2>
          <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {steps.map(([k, n]) => (
              <li key={k}><Card className="flex h-full flex-col gap-1 p-4"><span className="text-title font-extrabold text-brand-dark" aria-hidden="true">{n}</span><h3 className="text-body-lg font-bold">{t(`land.${k}_t`)}</h3><p className="text-body text-muted">{t(`land.${k}_d`)}</p></Card></li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="why" className="py-6">
          <h2 id="why" className="mb-3 text-title-sm font-extrabold md:text-title">{t("land.why")}</h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {why.map((k) => <li key={k}><Card className="flex h-full flex-col gap-1 p-4"><h3 className="text-body-lg font-bold">{t(`land.${k}_t`)}</h3><p className="text-body text-muted">{t(`land.${k}_d`)}</p></Card></li>)}
          </ul>
        </section>

        {plans.length > 0 && (
          <section aria-labelledby="plans" className="py-6">
            <h2 id="plans" className="mb-3 text-title-sm font-extrabold md:text-title">{t("land.plans")}</h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="plans">
              {plans.map((p, i) => {
                const added = p.features.filter((f) => !(plans[i - 1]?.features ?? []).includes(f)).slice(0, 5);
                return (
                  <li key={p.code}>
                    <Card className="flex h-full flex-col gap-3 p-4" data-testid="plan-card">
                      <div className="flex items-center justify-between gap-2"><h3 className="text-title-sm font-extrabold">{t(`plan.${p.code}`)}</h3>{p.price_tiyin === 0 && <Badge tone="ok">{t("plan.free")}</Badge>}</div>
                      <p className="text-body-lg font-bold">{price(p)}</p>
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-body-sm">
                        <dt className="text-muted">{t("plan.limit.staff")}</dt><dd className="font-semibold">{lim(p.limits.staff)}</dd>
                        <dt className="text-muted">{t("plan.limit.branches")}</dt><dd className="font-semibold">{lim(p.limits.branches)}</dd>
                        <dt className="text-muted">{t("plan.limit.orders_month")}</dt><dd className="font-semibold">{lim(p.limits.orders_month)}</dd>
                      </dl>
                      {added.length > 0 && <div><p className="mb-1 text-body-sm text-muted">{i === 0 ? "" : t("land.included")}</p><ul className="flex flex-col gap-1 text-body-sm">{added.map((f) => <li key={f}>✓ {t(`feature.${f}`)}</li>)}</ul></div>}
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
      <footer className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line py-4 text-body-sm">
        <span className="text-muted">{t("land.docs")}:</span>
        <Link href="/hujjat/customer_offer" className="inline-flex min-h-touch items-center">{t("land.offer")}</Link>
        <Link href="/hujjat/privacy_policy" className="inline-flex min-h-touch items-center">{t("land.privacy")}</Link>
      </footer>
    </div>
  );
}
