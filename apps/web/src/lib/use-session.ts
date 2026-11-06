"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { getSession, subscribe, type Session } from "./session";

export function useSessionValue(): Session | null {
  return useSyncExternalStore(subscribe, getSession, () => null);
}

export interface Me {
  id: string; phone_masked: string | null; locale: "uz" | "ru"; totp_enabled: boolean; is_platform_admin: boolean;
  memberships: { member_id: string; tenant_id: string; tenant_name: string; tenant_slug: string; role: string; status: string }[];
}

/** Kirmagan foydalanuvchini /kirish ga yo'naltiradi; /me ni yuklaydi. */
export function useRequireSession(): { me: Me | null; ready: boolean; session: Session | null } {
  const router = useRouter();
  const session = useSessionValue();
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!getSession()) { router.replace("/kirish"); return; }
    let alive = true;
    api<Me>("/v1/me").then((m) => { if (alive) { setMe(m); setReady(true); } }).catch(() => { if (alive) router.replace("/kirish"); });
    return () => { alive = false; };
  }, [router, session?.signedIn]);
  return { me, ready, session };
}
