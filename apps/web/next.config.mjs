const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://telegram.org" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  eslint: { ignoreDuringBuilds: true }, // lint alohida CI qadamida (eslint.config.mjs)
  transpilePackages: ["@dostavka/ui", "@dostavka/i18n", "@dostavka/contracts"],
  // /v1/* so'rovlari src/app/v1/[...path]/route.ts (BFF proksi) orqali o'tadi: API_URL ish vaqtida o'qiladi, tokenlar httpOnly cookie'da.
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};
