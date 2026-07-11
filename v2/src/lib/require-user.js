import { redirect } from "next/navigation";
import { createServerSupabase } from "./supabase-server";
import { sanitizeNextPath } from "./sanitize-next";

export async function requireUser(redirectTo = "/login") {
  const supabase = await createServerSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    const dest = sanitizeNextPath(redirectTo);
    redirect(dest);
  }

  return user;
}
