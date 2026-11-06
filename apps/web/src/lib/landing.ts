import type { Me } from "./use-session";

/** Rolga mos birinchi sahifa (kirishdan keyin va /panel uchun). */
export function landingFor(me: Pick<Me, "is_platform_admin" | "memberships">, active?: { role: string }): string {
  if (!active) return me.is_platform_admin ? "/admin" : "/dokon-yaratish";
  switch (active.role) {
    case "courier": return "/kuryer";
    case "dispatcher": return "/dispetcher";
    case "picker": return "/yigish";
    case "cashier": return "/buyurtmalar";
    default: return "/katalog";
  }
}
