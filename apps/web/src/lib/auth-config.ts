"use client";
import { useEffect, useState } from "react";

let cached: boolean | null = null;

/** Sinov rejimi (OPEN_LOGIN) yoqilganmi: null — hali ma'lum emas. Xato bo'lsa xavfsiz tomon (o'chiq). */
export function useOpenLogin(): boolean | null {
  const [v, setV] = useState<boolean | null>(cached);
  useEffect(() => {
    if (cached !== null) return;
    let alive = true;
    fetch("/v1/auth/config").then((r) => r.json()).then((j: { open_login?: boolean }) => { cached = j.open_login === true; if (alive) setV(cached); })
      .catch(() => { if (alive) setV(false); });
    return () => { alive = false; };
  }, []);
  return v;
}
