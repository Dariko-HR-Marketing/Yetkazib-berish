"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { landingFor } from "@/lib/landing";
import { getSession, setSession } from "@/lib/session";
import type { Me } from "@/lib/use-session";
import { PageSkeleton } from "@/components/shell";

/** «Panelga o'tish»: sessiya bo'lsa roliga mos sahifaga, bo'lmasa kirishga. */
export default function PanelRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (!getSession()) { router.replace("/kirish"); return; }
    api<Me>("/v1/me").then((me) => {
      const active = me.memberships.find((m) => m.status === "active");
      if (active) setSession({ ...getSession()!, tenantId: getSession()?.tenantId && me.memberships.some((m) => m.tenant_id === getSession()!.tenantId) ? getSession()!.tenantId : active.tenant_id });
      router.replace(landingFor(me, active));
    }).catch(() => router.replace("/kirish"));
  }, [router]);
  return <PageSkeleton />;
}
