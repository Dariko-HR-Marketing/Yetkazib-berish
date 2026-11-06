"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card, EmptyState } from "@dostavka/ui";
import { LangSwitch } from "@/components/shell";
import { useI18n } from "@/lib/i18n";

export function YaqinList({ items, home }: { items: { name: string; slug: string }[]; home: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[960px] flex-col px-4 md:px-6" style={{ paddingTop: "var(--safe-top)" }}>
      <header className="flex items-center justify-between gap-3 py-3">{home}<LangSwitch /></header>
      <main className="flex-1 pb-10 pt-2">
        <h1 className="text-title font-extrabold">{t("market.title")}</h1>
        <p className="mb-4 text-body text-muted">{t("market.subtitle")}</p>
        {items.length === 0 ? <EmptyState title={t("market.empty")} /> : (
          <ul className="grid gap-3 sm:grid-cols-2">{items.map((s) => (
            <li key={s.slug}><Card className="flex items-center justify-between gap-3 p-4" data-testid="market-shop"><span className="break-words text-body-lg font-bold">{s.name}</span><Link href={`/d/${s.slug}`} className="inline-flex min-h-touch items-center font-bold">{t("market.open")} →</Link></Card></li>))}</ul>)}
      </main>
    </div>
  );
}
