import Link from "next/link";
import { YaqinList } from "./list";

export const dynamic = "force-dynamic";

async function load(): Promise<{ name: string; slug: string }[]> {
  const api = process.env.API_URL ?? "http://127.0.0.1:4000";
  try { const r = await fetch(`${api}/v1/marketplace/shops`, { cache: "no-store" }); return r.ok ? ((await r.json()) as { items: { name: string; slug: string }[] }).items : []; } catch { return []; }
}

/** Umumiy katalog («Yaqin do'konlar»): server render. */
export default async function NearbyPage() {
  const items = await load();
  return <YaqinList items={items} home={<Link href="/kirish" className="inline-flex min-h-touch items-center font-bold">Dostavka</Link>} />;
}
