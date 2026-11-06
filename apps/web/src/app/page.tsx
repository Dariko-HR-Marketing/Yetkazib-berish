import { Landing, type PublicPlan } from "./landing";

export const dynamic = "force-dynamic";

async function plans(): Promise<PublicPlan[]> {
  const api = process.env.API_URL ?? "http://127.0.0.1:4000";
  try { const r = await fetch(`${api}/v1/plans`, { cache: "no-store" }); return r.ok ? ((await r.json()) as { items: PublicPlan[] }).items : []; } catch { return []; }
}

/** Bosh sahifa (landing): server render; narxlar API'dan (konfiguratsiya). */
export default async function Home() {
  return <Landing plans={await plans()} />;
}
