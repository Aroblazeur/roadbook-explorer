import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function GET() {
  const healthy = {
    status: "ok",
    app: "roadbook-explorer",
    timestamp: new Date().toISOString(),
  };

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    healthy.status = "degraded";
    healthy.database = "misconfigured";
    return NextResponse.json(healthy, { status: 503 });
  }

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { cookies: { getAll: () => [], setAll: () => {} } }
    );
    const { error } = await supabase.from("roadbooks").select("id").limit(1).maybeSingle();
    healthy.database = error ? "error" : "ok";
    if (error) healthy.status = "degraded";
  } catch {
    healthy.database = "unreachable";
    healthy.status = "degraded";
  }

  const code = healthy.status === "ok" ? 200 : 503;
  return NextResponse.json(healthy, { status: code });
}
