/** «Kam qoldi» chegarasi: 5 dona/kg/l (prototip Panel-Stock). Mingdan bir birlikda. */
export const LOW_STOCK_MILLI = 5000;
export type StockState = "out" | "low" | "in";

export interface StockRow { quantity_milli: number | string; reserved_milli: number | string; out_marked: boolean }

/** Mavjud = max(0, qoldiq - band); stop-list bo'lsa 0. */
export function availableMilli(s: StockRow | null | undefined): number {
  if (!s || s.out_marked) return 0;
  return Math.max(0, Number(s.quantity_milli) - Number(s.reserved_milli));
}
export function stockState(s: StockRow | null | undefined): StockState {
  const a = availableMilli(s);
  return a <= 0 ? "out" : a <= LOW_STOCK_MILLI ? "low" : "in";
}

export const encodeCursor = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
export function decodeCursor<T>(c: string | undefined): T | null {
  if (!c) return null;
  try { return JSON.parse(Buffer.from(c, "base64url").toString("utf8")) as T; } catch { return null; }
}
