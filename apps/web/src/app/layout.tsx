import type { Metadata, Viewport } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import "@fontsource-variable/manrope";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = { title: "Dostavka", description: "Do'konlar uchun yetkazib berish platformasi", robots: { index: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0b7a4b" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="uz">
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
