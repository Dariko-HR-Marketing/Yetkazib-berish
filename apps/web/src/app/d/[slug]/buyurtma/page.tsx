"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Card, EmptyState, ErrorState, Skeleton } from "@dostavka/ui";
import { ShopShell } from "@/components/shop-shell";
import { ApiError, NetworkError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getSession } from "@/lib/session";

interface Ord { id: string; number: number; status: string; total_tiyin: number; created_at: string }
const TONE: Record<string, "info" | "ok" | "danger" | "warning"> = { placed: "info", accepted: "warning", completed: "ok", cancelled: "danger" };

export default function MyOrdersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { t, locale, money } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<Ord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!getSession()?.signedIn) { router.replace(`/kirish?next=${encodeURIComponent(`/d/${slug}/buyurtma`)}`); return; }
    api<{ items: Ord[] }>(`/v1/shops/${slug}/orders?limit=30`).then((r) => setItems(r.items)).catch((e) => setError(e instanceof ApiError ? e.text(locale) : e instanceof NetworkError ? t("ui.error_network") : t("ui.error_generic")));
  }, [slug, router, locale, t]);
  return (
    <ShopShell slug={slug} name={slug} back>
      <h1 className="mb-4 text-title font-extrabold">{t("order.history")}</h1>
      {error ? <ErrorState message={error} retryLabel={t("ui.retry")} onRetry={() => location.reload()} />
        : items === null ? <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
        : items.length === 0 ? <EmptyState title={t("order.none")} />
        : <ul className="flex flex-col gap-3">{items.map((o) => (
            <li key={o.id}><Link href={`/d/${slug}/buyurtma/${o.id}`} className="no-underline hover:no-underline">
              <Card className="flex items-center justify-between gap-3 p-3"><span className="font-bold">{t("order.title", { number: o.number })}</span><Badge tone={TONE[o.status] ?? "neutral"}>{t(`order.status_${o.status}`)}</Badge><span className="font-semibold">{money(o.total_tiyin)}</span></Card>
            </Link></li>))}</ul>}
    </ShopShell>
  );
}
