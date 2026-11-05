"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getSession, setTenant } from "@/lib/session";
import type { Me } from "@/lib/use-session";
import { PageSkeleton } from "@/components/shell";

/** Kirish nuqtasi: sessiya yo'q -> /kirish; do'kon yo'q -> /dokon-yaratish; aks holda /jamoa. */
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    if (!getSession()) { router.replace("/kirish"); return; }
    api<Me>("/v1/me").then((me) => {
      const m = me.memberships.find((x) => x.status === "active");
      if (!m) { router.replace("/dokon-yaratish"); return; }
      const cur = getSession()?.tenantId;
      setTenant(me.memberships.some((x) => x.tenant_id === cur && x.status === "active") ? cur! : m.tenant_id);
      router.replace("/jamoa");
    }).catch(() => router.replace("/kirish"));
  }, [router]);
  return <PageSkeleton />;
}
