import { useCallback, useState } from "react";
import { loadCoverMedia, getSignedUrl } from "@/lib/roadbooks/loaders";
import { conditionalUpdateRoadbook } from "@/lib/sync-helpers";

export function useCoverManager({ supabase, roadbookId, roadbook, setRoadbook, onError, onSuccess }) {
  const [coverMode, setCoverMode] = useState(null);
  const [coverUrl, setCoverUrl] = useState("");
  const [coverMediaId, setCoverMediaId] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [coverSaving, setCoverSaving] = useState(false);

  const setCoverFromMedia = useCallback(async (mediaId) => {
    setCoverSaving(true);
    const result = await conditionalUpdateRoadbook(supabase, roadbookId, { cover_media_id: mediaId, cover_image_url: null }, roadbook?.updated_at);
    if (!result.ok) {
      onError?.(result.error === "conflict" ? "Conflit de version." : result.error);
      setCoverSaving(false);
      return;
    }
    setCoverMediaId(mediaId);
    setCoverUrl("");
    setCoverMode("media");
    setCoverPreview(null);
    setRoadbook?.(prev => ({ ...prev, cover_media_id: mediaId, cover_image_url: null, updated_at: result.data.updated_at }));
    try {
      const m = await loadCoverMedia(supabase, mediaId);
      if (m) {
        const signedUrl = await getSignedUrl(supabase, m.bucket, m.path, 86400);
        if (signedUrl) setCoverPreview(signedUrl);
      }
    } catch {}
    onSuccess?.("Image de couverture mise à jour.");
    setCoverSaving(false);
  }, [supabase, roadbookId, roadbook, setRoadbook, onError, onSuccess]);

  const setCoverFromUrl = useCallback(async (url) => {
    setCoverSaving(true);
    const cleanUrl = url || null;
    const result = await conditionalUpdateRoadbook(supabase, roadbookId, { cover_image_url: cleanUrl, cover_media_id: null }, roadbook?.updated_at);
    if (!result.ok) {
      onError?.(result.error === "conflict" ? "Conflit de version." : result.error);
      setCoverSaving(false);
      return;
    }
    setCoverUrl(url);
    setCoverMediaId(null);
    setCoverMode(cleanUrl ? "url" : null);
    setCoverPreview(cleanUrl);
    setRoadbook?.(prev => ({ ...prev, cover_image_url: cleanUrl, cover_media_id: null, updated_at: result.data.updated_at }));
    onSuccess?.(cleanUrl ? "Image de couverture mise à jour." : "Image de couverture retirée.");
    setCoverSaving(false);
  }, [supabase, roadbookId, roadbook, setRoadbook, onError, onSuccess]);

  const removeCover = useCallback(async () => {
    setCoverSaving(true);
    const result = await conditionalUpdateRoadbook(supabase, roadbookId, { cover_image_url: null, cover_media_id: null }, roadbook?.updated_at);
    if (!result.ok) {
      onError?.(result.error === "conflict" ? "Conflit de version." : result.error);
      setCoverSaving(false);
      return;
    }
    setCoverUrl("");
    setCoverMediaId(null);
    setCoverMode(null);
    setCoverPreview(null);
    setRoadbook?.(prev => ({ ...prev, cover_image_url: null, cover_media_id: null, updated_at: result.data.updated_at }));
    onSuccess?.("Image de couverture retirée.");
    setCoverSaving(false);
  }, [supabase, roadbookId, roadbook, setRoadbook, onError, onSuccess]);

  return {
    coverUrl, setCoverUrl,
    coverMediaId, setCoverMediaId,
    coverPreview, setCoverPreview,
    coverMode, setCoverMode,
    coverSaving,
    setCoverFromMedia,
    setCoverFromUrl,
    removeCover,
  };
}
