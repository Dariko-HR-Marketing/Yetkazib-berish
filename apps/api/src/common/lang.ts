import type { AppRequest } from "./request-context";

/** Accept-Language -> "uz" | "ru" (standart uz). Xato xabarlari esa har doim ikki tilda qaytadi. */
export function lang(req: AppRequest): "uz" | "ru" {
  const h = String(req.headers["accept-language"] ?? "").toLowerCase();
  return h.startsWith("ru") ? "ru" : "uz";
}
