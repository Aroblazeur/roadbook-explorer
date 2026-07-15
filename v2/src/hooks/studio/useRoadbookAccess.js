import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function useRoadbookAccess({ user, roadbook, supabase, roadbookId }) {
  const router = useRouter();
  const [editorAccess, setEditorAccess] = useState(null);

  useEffect(() => {
    if (!user || !roadbook) return;
    if (roadbook.owner_id === user.id || user.app_metadata?.role === "admin") {
      setEditorAccess(true);
      return;
    }
    let cancelled = false;
    supabase
      .from("roadbook_contributors")
      .select("user_id")
      .eq("roadbook_id", Number(roadbookId))
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const allowed = Boolean(data);
        setEditorAccess(allowed);
        if (!allowed) router.replace(`/roadbooks/${roadbook.slug}`);
      });
    return () => { cancelled = true; };
  }, [user, roadbook, supabase, roadbookId, router]);

  return editorAccess;
}
