"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { LangSwitch } from "@/components/shell";

/** Xaridor sahifalari uchun yengil qobiq (menyu yo'q): do'kon nomi, til, buyurtmalarim. */
export function ShopShell({ slug, name, children, back }: { slug: string; name: string; children: ReactNode; back?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[960px] flex-col px-4 md:px-6" style={{ paddingTop: "var(--safe-top)" }}>
      <header className="flex flex-wrap items-center justify-between gap-3 py-3">
        <Link href={`/d/${slug}`} className="inline-flex min-h-touch items-center text-title-sm font-extrabold text-brand-dark no-underline hover:no-underline">{back ? "← " : ""}{name}</Link>
        <div className="flex items-center gap-2">
          <Link href={`/d/${slug}/buyurtma`} className="inline-flex min-h-touch items-center text-body font-bold">{t("shop.my_orders")}</Link>
          <LangSwitch />
        </div>
      </header>
      <main className="flex-1 pb-24 pt-2">{children}</main>
    </div>
  );
}

export const unitLabel = (t: (k: string) => string, unit: string) => t(`unit.${unit}`);
