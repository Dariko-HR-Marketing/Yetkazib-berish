"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { formatMoney, isLocale, t as translate, type Locale } from "@dostavka/i18n";
import { bindLocale } from "./api";

interface Ctx { locale: Locale; setLocale: (l: Locale) => void; t: (k: string, v?: Record<string, string | number>) => string; money: (tiyin: number) => string }
const I18n = createContext<Ctx | null>(null);
const KEY = "dostavka.locale";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLoc] = useState<Locale>("uz");
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* */ }
    const tgLang = (window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } } }).Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
    const initial = isLocale(saved) ? saved : tgLang === "ru" ? "ru" : "uz";
    setLoc(initial);
  }, []);
  useEffect(() => { document.documentElement.lang = locale; bindLocale(() => locale); }, [locale]);
  const setLocale = useCallback((l: Locale) => { setLoc(l); try { localStorage.setItem(KEY, l); } catch { /* */ } }, []);
  const value = useMemo<Ctx>(() => ({ locale, setLocale, t: (k, v) => translate(locale, k, v), money: (n) => formatMoney(locale, n) }), [locale, setLocale]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export function useI18n(): Ctx {
  const c = useContext(I18n);
  if (!c) throw new Error("I18nProvider yo'q");
  return c;
}
