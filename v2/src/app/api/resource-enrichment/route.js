import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { enrichResource } from "@/lib/resource-enrichment-server";

export const runtime = "nodejs";

function cleanItem(value, index) {
  const source = value && typeof value === "object" ? value : {};
  return {
    id: String(source.id ?? index).slice(0, 120),
    kind: source.kind === "accommodation" ? "accommodation" : "poi",
    name: String(source.name ?? "").trim().slice(0, 300),
    region: String(source.region ?? "").trim().slice(0, 300),
    url: String(source.url ?? "").trim().slice(0, 2_000),
  };
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function POST(request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 }); }
  if (!Array.isArray(body?.items)) return NextResponse.json({ error: "Liste de ressources invalide." }, { status: 400 });
  const items = body.items.slice(0, 40).map(cleanItem).filter(item => item.name || item.url);
  const results = await mapWithConcurrency(items, 8, enrichResource);
  return NextResponse.json({ results });
}
