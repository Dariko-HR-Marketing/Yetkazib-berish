import { notFound } from "next/navigation";
import { Storefront, type ShopData, type ProductPage, type CategoryItem } from "./storefront";

export const dynamic = "force-dynamic";

async function load<T>(path: string): Promise<T | null> {
  const api = process.env.API_URL ?? "http://127.0.0.1:4000";
  try {
    const r = await fetch(`${api}${path}`, { cache: "no-store" });
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}

/** Server render: birinchi ekran (do'kon, kategoriyalar, mahsulotlar) HTML bilan keladi — LCP uchun. */
export default async function ShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await load<ShopData>(`/v1/shops/${encodeURIComponent(slug)}`);
  if (!shop) notFound();
  const [cats, products] = await Promise.all([
    load<{ items: CategoryItem[] }>(`/v1/shops/${encodeURIComponent(slug)}/categories`),
    load<ProductPage>(`/v1/shops/${encodeURIComponent(slug)}/products?limit=30${shop.branches[0] ? `&branch_id=${shop.branches[0].id}` : ""}`),
  ]);
  return <Storefront slug={slug} shop={shop} categories={cats?.items ?? []} initial={products ?? { branch_id: null, items: [], next_cursor: null }} />;
}
