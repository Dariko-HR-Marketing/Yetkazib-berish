"use client";
import { useSyncExternalStore } from "react";

/** Savat brauzer xotirasida (do'kon bo'yicha alohida). Narx/nom faqat ko'rsatish uchun; buyurtmada narxni server qayta hisoblaydi. */
export interface CartLine { id: string; name_uz: string; name_ru: string | null; unit: "piece" | "kg" | "l"; price_tiyin: number; quantity_milli: number }
export interface Cart { branch_id: string | null; lines: CartLine[] }

const empty: Cart = { branch_id: null, lines: [] };
const key = (slug: string) => `dostavka.cart.${slug}`;
const listeners = new Set<() => void>();
const mem = new Map<string, Cart>();

function read(slug: string): Cart {
  const hit = mem.get(slug);
  if (hit) return hit;
  let c = empty;
  try {
    const raw = localStorage.getItem(key(slug));
    if (raw) { const j = JSON.parse(raw) as Cart; if (Array.isArray(j.lines)) c = { branch_id: j.branch_id ?? null, lines: j.lines.filter((l) => l && l.quantity_milli > 0) }; }
  } catch { /* xotirada qoladi */ }
  mem.set(slug, c);
  return c;
}
function write(slug: string, c: Cart) {
  mem.set(slug, c);
  try { localStorage.setItem(key(slug), JSON.stringify(c)); } catch { /* */ }
  listeners.forEach((l) => l());
}

/** Qadam: dona — 1, kg/litr — 0,5. */
export const stepOf = (unit: CartLine["unit"]) => (unit === "piece" ? 1000 : 500);

export function useCart(slug: string): Cart {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => read(slug), () => empty);
}
export function setBranch(slug: string, branchId: string) {
  const c = read(slug);
  if (c.branch_id !== branchId) write(slug, { branch_id: branchId, lines: [] }); // filial almashsa mavjudlik boshqa: savat tozalanadi
}
export function changeQty(slug: string, line: Omit<CartLine, "quantity_milli">, delta: number) {
  const c = read(slug);
  const cur = c.lines.find((l) => l.id === line.id);
  const next = (cur?.quantity_milli ?? 0) + delta;
  const lines = next <= 0 ? c.lines.filter((l) => l.id !== line.id) : cur ? c.lines.map((l) => (l.id === line.id ? { ...l, quantity_milli: next } : l)) : [...c.lines, { ...line, quantity_milli: next }];
  write(slug, { ...c, lines });
}
export function clearCart(slug: string) { const c = read(slug); write(slug, { branch_id: c.branch_id, lines: [] }); }

/** milli-birlik × tiyin / 1000 (server bilan bir xil yaxlitlash). */
export const lineTotal = (q: number, price: number): number => Number((BigInt(q) * BigInt(price) + 500n) / 1000n);
export const cartTotal = (c: Cart): number => c.lines.reduce((a, l) => a + lineTotal(l.quantity_milli, l.price_tiyin), 0);
