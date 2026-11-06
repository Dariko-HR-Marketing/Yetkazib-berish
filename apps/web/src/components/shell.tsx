"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@dostavka/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { setSession } from "@/lib/session";

export function LangSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div role="group" aria-label={t("ui.language")} className="inline-flex rounded-md border border-line-strong bg-surface p-0.5">
      {(["uz", "ru"] as const).map((l) => (
        <button key={l} type="button" lang={l} aria-pressed={locale === l} onClick={() => setLocale(l)}
          className={`min-h-touch min-w-touch rounded-sm px-2 text-body font-bold ${locale === l ? "bg-ink text-bg" : "text-ink-2"}`}>{l.toUpperCase()}</button>
      ))}
    </div>
  );
}

/** Ichki sahifalar uchun qobiq: navigatsiya, til, chiqish. 360 px dan boshlab: nav gorizontal aylanadi. */
/** Rolga ko'ra bo'limlar (roles_permissions.json: katalog va qoldiq). Server baribir tekshiradi; bu faqat qulaylik uchun. */
const CATALOG_ROLES = new Set(["owner", "manager", "accountant", "marketer", "picker", "cashier"]);
const ORDER_ROLES = new Set(["owner", "manager", "picker", "cashier", "dispatcher", "accountant", "marketer"]);
const IMPORT_ROLES = new Set(["owner", "manager"]);

export function Shell({ title, subtitle, tenantName, children, actions, role }: { title: string; subtitle?: string; tenantName?: string; children: ReactNode; actions?: ReactNode; role?: string }) {
  const { t } = useI18n();
  const path = usePathname();
  const router = useRouter();
  const nav = [
    ...(role && ORDER_ROLES.has(role) ? [{ href: "/buyurtmalar", label: t("nav.orders") }] : []),
    ...(role && CATALOG_ROLES.has(role) ? [{ href: "/katalog", label: t("nav.catalog") }] : []),
    ...(role && IMPORT_ROLES.has(role) ? [{ href: "/import", label: t("nav.import") }] : []),
    ...(role === "owner" || role === "manager" ? [{ href: "/jamoa", label: t("nav.team") }] : []),
    { href: "/paket", label: t("nav.plan") },
  ];
  const logout = async () => {
    try { await api("/v1/auth/logout", { method: "POST", noRetry: true }); } catch { /* sessiya baribir tozalanadi */ }
    setSession(null);
    router.replace("/kirish");
  };
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1100px] flex-col px-4 md:px-6" style={{ paddingTop: "var(--safe-top)" }}>
      <header className="flex flex-wrap items-center justify-between gap-3 py-3">
        <span className="text-title-sm font-extrabold text-brand-dark">{t("ui.app_name")}</span>
        <div className="flex items-center gap-2">
          <LangSwitch />
          <Button variant="ghost" onClick={logout}>{t("nav.logout")}</Button>
        </div>
      </header>
      <nav aria-label="Asosiy" className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0">
        {nav.map((n) => {
          const active = path === n.href;
          return (
            <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-touch items-center border-b-2 px-3 text-body font-bold no-underline hover:no-underline ${active ? "border-brand text-ink" : "border-transparent text-muted"}`}>{n.label}</Link>
          );
        })}
      </nav>
      <main className="flex-1 py-5">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            {tenantName && <p className="text-body-sm text-muted">{tenantName}</p>}
            <h1 className="text-title font-extrabold md:text-h2">{title}</h1>
            {subtitle && <p className="mt-1 text-body text-muted">{subtitle}</p>}
          </div>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}

export function CenterCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[460px] flex-col justify-center gap-5 px-4 py-8" style={{ paddingTop: "calc(32px + var(--safe-top))" }}>
      <div className="flex items-center justify-between"><span className="text-title-sm font-extrabold text-brand-dark">Dostavka</span><LangSwitch /></div>
      <div className="rounded-xl border border-line bg-surface p-5 shadow-sm md:p-6">
        <h1 className="text-title font-extrabold">{title}</h1>
        {subtitle && <p className="mt-1 text-body text-muted">{subtitle}</p>}
        <div className="mt-5 flex flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return <div aria-busy="true" className="mx-auto flex min-h-screen max-w-[1100px] flex-col gap-3 p-6"><div className="h-8 w-48 animate-pulse rounded-md bg-line-soft" /><div className="h-40 animate-pulse rounded-lg bg-line-soft" /></div>;
}
