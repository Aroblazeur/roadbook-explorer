import { useCallback, useState } from "react";
import { loadMediaWithUrls, getSignedUrl } from "@/lib/roadbooks/loaders";
import { uploadImage, insertMediaRecord, deleteMedia } from "@/lib/roadbooks/writers";
import { resizeImage } from "@/lib/roadbooks/validators";

export function useMediaManager({ supabase, roadbookId, userId, onError, onSuccess }) {
  const [images, setImages] = useState([]);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  const reloadMedia = useCallback(async () => {
    if (!userId || !roadbookId) return;
    try {
      const rows = await loadMediaWithUrls(supabase, roadbookId);
      setImages(rows);
    } catch {}
  }, [supabase, roadbookId, userId]);

  const handleSignedUrl = useCallback(async (path) => {
    return getSignedUrl(supabase, "roadbook-images", path, 3600);
  }, [supabase]);

  const uploadMedia = useCallback(async (file) => {
    if (!file) return;
    setUploadError(null);
    setUploadLoading(true);
    try {
      const { blob, width, height, size } = await resizeImage(file);
      const path = await uploadImage(supabase, userId, roadbookId, file, blob);
      const record = {
        roadbook_id: Number(roadbookId), stage_id: null, type: "image",
        bucket: "roadbook-images", path, file_name: file.name,
        mime_type: "image/jpeg",
        uploaded_by: userId,
        metadata: { original_name: file.name, original_size: file.size, resized_width: width, resized_height: height, final_size: size, format: "jpeg" },
      };
      await insertMediaRecord(supabase, record);
      onSuccess?.("");
      await reloadMedia();
    } catch (err) {
      setUploadError(err.message);
      onError?.(err.message);
    } finally {
      setUploadLoading(false);
    }
  }, [supabase, roadbookId, userId, onError, onSuccess, reloadMedia]);

  const removeMedia = useCallback(async (mediaRow) => {
    setDeleteLoading(mediaRow.id);
    try {
      await deleteMedia(supabase, mediaRow);
      setImages(prev => prev.filter(i => i.id !== mediaRow.id));
      onSuccess?.("");
    } catch (err) {
      setUploadError(err.message);
      onError?.(err.message);
    } finally {
      setDeleteLoading(null);
    }
  }, [supabase, onError, onSuccess]);

  return {
    images, setImages,
    uploadLoading,
    deleteLoading,
    uploadError, setUploadError,
    reloadMedia,
    uploadMedia,
    removeMedia,
    handleSignedUrl,
  };
}
