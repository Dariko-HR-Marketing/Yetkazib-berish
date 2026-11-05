"use client";
import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n";
import { TelegramBridge } from "@/lib/telegram";

export function Providers({ children }: { children: ReactNode }) {
  return <I18nProvider><TelegramBridge />{children}</I18nProvider>;
}
