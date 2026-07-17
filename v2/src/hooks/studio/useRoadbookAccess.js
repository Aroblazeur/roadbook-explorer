import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function useRoadbookAccess({ user, roadbook, supabase, roadbookId }) {
  const router = useRouter();
  const [editorAccess, setEditorAccess] = useState(null);
  const userId = user?.id;
  const isAdmin = user?.app_metadata?.role === "admin";
  const ownerId = roadbook?.owner_id;
  const roadbookSlug = roadbook?.slug;

  useEffect(() => {
    if (!userId || !ownerId) return;
    if (ownerId === userId || isAdmin) {
      setEditorAccess(true);
      return;
    }
    let cancelled = false;
    supabase
      .from("roadbook_contributors")
      .select("user_id")
      .eq("roadbook_id", Number(roadbookId))
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const allowed = Boolean(data);
        setEditorAccess(allowed);
        if (!allowed) router.replace(`/roadbooks/${roadbookSlug}`);
      });
    return () => { cancelled = true; };
  }, [userId, isAdmin, ownerId, roadbookSlug, supabase, roadbookId, router]);

  return editorAccess;
}
