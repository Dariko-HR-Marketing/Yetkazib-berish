"use client";
import { useState } from "react";

export const isHttpsUrl = (v: string) => { try { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password && u.hostname.includes("."); } catch { return false; } };

/** Mahsulot rasmi: tashqi https havola. Joy oldindan band (CLS yo'q), kech yuklanadi, yuklanmasa yashiriladi, referrer yuborilmaydi. */
export function ProductImage({ src, size, className = "" }: { src: string; size: number; className?: string }) {
  const [bad, setBad] = useState(false);
  if (bad) return null;
  return <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBad(true)} className={`shrink-0 rounded-md bg-line-soft object-cover ${className}`} style={{ width: size, height: size }} />;
}
