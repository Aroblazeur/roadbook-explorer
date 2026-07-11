import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export async function GET(request, { params }) {
  const { slug, type } = await params;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!["poi", "accommodation"].includes(type)) {
    return NextResponse.json({ error: "Type invalide" }, { status: 400 });
  }

  if (!/^[a-z0-9-]+$/i.test(slug)) {
    return NextResponse.json({ error: "Slug invalide" }, { status: 400 });
  }

  const filePath = path.join(
    process.cwd(),
    "..",
    "roadbooks",
    slug,
    "data",
    `${type}-enrichment.json`
  );

  try {
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ items: [] }, { status: 200 });
    }
    const content = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(content);

    if (!user) {
      const publicOnly = { items: (data.items ?? []).filter(i => i.is_public !== false) };
      return NextResponse.json(publicOnly);
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ items: [] }, { status: 200 });
  }
}
