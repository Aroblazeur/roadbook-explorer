import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function POST(request) {
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
  if (!user) {
    return NextResponse.json({ error: "non autorise" }, { status: 401 });
  }

  const { roadbookId } = await request.json();
  if (!roadbookId) {
    return NextResponse.json({ error: "roadbookId requis" }, { status: 400 });
  }

  const { data: rb } = await supabase
    .from("roadbooks")
    .select("id, slug, owner_id")
    .eq("id", roadbookId)
    .maybeSingle();

  if (!rb) {
    return NextResponse.json({ error: "roadbook introuvable" }, { status: 404 });
  }
  if (rb.owner_id !== user.id) {
    return NextResponse.json({ error: "non autorise" }, { status: 403 });
  }

  revalidatePath(`/roadbooks/${rb.slug}`);
  revalidatePath("/explore");
  revalidatePath("/dashboard/roadbooks");

  return NextResponse.json({ revalidated: true, slug: rb.slug });
}
