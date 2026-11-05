"use client";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@dostavka/ui";

interface TgWebApp {
  initData: string; ready(): void; expand(): void; colorScheme?: "light" | "dark";
  themeParams: Record<string, string | undefined>;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  MainButton: { setText(t: string): void; show(): void; hide(): void; enable(): void; disable(): void; showProgress(): void; hideProgress(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  onEvent(e: string, cb: () => void): void; offEvent(e: string, cb: () => void): void;
  safeAreaInset?: { top: number; bottom: number }; contentSafeAreaInset?: { top: number; bottom: number };
}
export const tgApp = (): TgWebApp | null => (typeof window === "undefined" ? null : ((window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp ?? null));
export const tgInitData = (): string => tgApp()?.initData ?? "";

const MAP: Record<string, string> = { bg_color: "--c-bg", secondary_bg_color: "--c-surface", text_color: "--c-ink", hint_color: "--c-muted", button_color: "--c-brand", button_text_color: "--c-on-brand" };

/** Telegram ichida: mavzu ranglari, xavfsiz hudud, Orqaga tugmasi. Brauzerda hech narsa qilmaydi. */
export function TelegramBridge() {
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    const tg = tgApp();
    if (!tg?.initData) return;
    tg.ready(); tg.expand();
    const apply = () => {
      const root = document.documentElement;
      for (const [k, v] of Object.entries(MAP)) { const val = tg.themeParams[k]; if (val) root.style.setProperty(v, val); }
      if (tg.colorScheme) root.dataset.theme = tg.colorScheme;
      const inset = tg.contentSafeAreaInset ?? tg.safeAreaInset;
      if (inset) { root.style.setProperty("--safe-top", `${inset.top}px`); root.style.setProperty("--safe-bottom", `${inset.bottom}px`); }
    };
    apply();
    tg.onEvent("themeChanged", apply);
    return () => tg.offEvent("themeChanged", apply);
  }, []);
  useEffect(() => {
    const tg = tgApp();
    if (!tg?.initData) return;
    const root = ["/", "/kirish", "/jamoa"].includes(path);
    const back = () => router.back();
    if (root) tg.BackButton.hide(); else { tg.BackButton.show(); tg.BackButton.onClick(back); }
    return () => tg.BackButton.offClick(back);
  }, [path, router]);
  return null;
}

/** Asosiy amal: Telegram ichida MainButton, brauzerda oddiy tugma (takrorlanmaydi). */
export function MainAction({ children, onClick, disabled, loading, text }: { children: ReactNode; onClick: () => void; disabled?: boolean; loading?: boolean; text: string }) {
  const [inTg, setInTg] = useState(false);
  useEffect(() => setInTg(Boolean(tgInitData())), []);
  useEffect(() => {
    const tg = tgApp();
    if (!inTg || !tg) return;
    tg.MainButton.setText(text); tg.MainButton.show();
    if (disabled) tg.MainButton.disable(); else tg.MainButton.enable();
    if (loading) tg.MainButton.showProgress(); else tg.MainButton.hideProgress();
    tg.MainButton.onClick(onClick);
    return () => { tg.MainButton.offClick(onClick); tg.MainButton.hide(); };
  }, [inTg, text, disabled, loading, onClick]);
  if (inTg) return <button type="button" onClick={onClick} disabled={disabled || loading} className="sr-only">{text}</button>;
  return <Button full onClick={onClick} disabled={disabled} loading={loading}>{children}</Button>;
}
