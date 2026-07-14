"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  buildNewDraftPayload,
  generateLocalDraftId,
  loadNewDraft,
  migrateNewDraftKey,
  removeNewDraft,
  saveNewDraft,
} from "@/lib/studio-drafts";

export default function StudioCatalog({ selectedId = null }) {
  const { user, loading, supabase } = useAuth();
  const router = useRouter();
  const [roadbooks, setRoadbooks] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [status, setStatus] = useState("Chargement du catalogue…");
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [pendingDraft, setPendingDraft] = useState(null);
  const localDraftIdRef = useRef(null);
  const tabIdRef = useRef(null);

  if (!localDraftIdRef.current) localDraftIdRef.current = generateLocalDraftId();
  if (!tabIdRef.current) tabIdRef.current = crypto.randomUUID?.() ?? `tab-${Date.now()}`;

  async function loadRoadbooks() {
    if (!user) return;
    setFetching(true);
    setError(null);
    setStatus("Chargement du catalogue…");
    const { data, error: fetchError } = await supabase
      .from("roadbooks")
      .select("id, slug, title, description, is_public, created_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    if (fetchError) {
      setError(fetchError.message);
      setStatus("Catalogue indisponible.");
    } else {
      setRoadbooks(data ?? []);
      setStatus(`${data?.length ?? 0} roadbook(s) disponible(s).`);
    }
    setFetching(false);
  }

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    loadRoadbooks();
    const restored = loadNewDraft(user.id, localDraftIdRef.current);
    if (restored) {
      const payload = restored.payload;
      setPendingDraft(restored);
      setTitle(payload.title ?? "");
      setDescription(payload.description ?? "");
      setIsPublic(Boolean(payload.isPublic));
      setShowCreate(true);
    }
  }, [user]);

  function saveFormDraft() {
    if (!user?.id || !localDraftIdRef.current) return;
    saveNewDraft(user.id, localDraftIdRef.current, buildNewDraftPayload({
      userId: user.id,
      localDraftId: localDraftIdRef.current,
      tabId: tabIdRef.current,
      title,
      description,
      isPublic,
    }));
  }

  useEffect(() => {
    const handlePageHide = () => {
      if (title) saveFormDraft();
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [user?.id, title, description, isPublic]);

  async function handleCreate(event) {
    event.preventDefault();
    setError(null);
    setCreating(true);
    let slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || `roadbook-${Date.now()}`;
    const { data: existing } = await supabase.from("roadbooks").select("id").eq("slug", slug).maybeSingle();
    if (existing) slug = `${slug}-${Date.now()}`;
    const { data: newRoadbook, error: insertError } = await supabase.from("roadbooks").insert({
      slug,
      owner_id: user.id,
      title,
      description,
      is_public: isPublic,
    }).select("id").single();
    if (insertError) {
      setError(insertError.message);
      setCreating(false);
      return;
    }
    migrateNewDraftKey(user.id, localDraftIdRef.current, newRoadbook.id);
    localDraftIdRef.current = generateLocalDraftId();
    setPendingDraft(null);
    setTitle("");
    setDescription("");
    setIsPublic(false);
    setShowCreate(false);
    await loadRoadbooks();
    router.push(`/dashboard/roadbooks/${newRoadbook.id}`);
  }

  function discardNewDraft() {
    if (!user?.id) return;
    removeNewDraft(user.id, localDraftIdRef.current);
    localDraftIdRef.current = generateLocalDraftId();
    setPendingDraft(null);
    setTitle("");
    setDescription("");
    setIsPublic(false);
    setShowCreate(false);
  }

  return (
    <section className="card studio-panel studio-catalog" aria-labelledby="studio-library-title">
      <div className="studio-panel__header">
        <div>
          <p className="studio-eyebrow">Catalogue</p>
          <h2 id="studio-library-title">Roadbooks disponibles</h2>
        </div>
        <div className="studio-actions">
          <button type="button" className="terrain-button terrain-button--secondary" onClick={() => setShowCreate(value => !value)}>
            {showCreate ? "Annuler" : "Créer un roadbook"}
          </button>
          <button type="button" className="terrain-button" onClick={loadRoadbooks} disabled={fetching}>Rafraîchir</button>
        </div>
      </div>
      <p className="studio-status" role="status" aria-live="polite">{error || status}</p>
      {showCreate && (
        <form className="studio-create-form" onSubmit={handleCreate}>
          <h3>Créer un roadbook</h3>
          {pendingDraft && <p className="studio-draft-notice">Un brouillon a été restauré.</p>}
          <div className="studio-form-grid studio-form-grid--compact">
            <label className="studio-form-grid__full">Titre<input type="text" value={title} onChange={event => setTitle(event.target.value)} required /></label>
            <label className="studio-form-grid__full">Description<textarea value={description} onChange={event => setDescription(event.target.value)} /></label>
            <label className="studio-checkbox studio-form-grid__full"><input type="checkbox" checked={isPublic} onChange={event => setIsPublic(event.target.checked)} /> Public</label>
          </div>
          <div className="studio-actions studio-create-form__actions">
            <button type="submit" disabled={creating}>{creating ? "Création…" : "Créer"}</button>
            {pendingDraft && <button type="button" className="terrain-button--secondary" onClick={discardNewDraft}>Ignorer le brouillon</button>}
          </div>
        </form>
      )}
      <div className="studio-roadbook-list">
        {roadbooks.map(roadbook => (
          <Link
            key={roadbook.id}
            href={`/dashboard/roadbooks/${roadbook.id}`}
            className="studio-roadbook-card"
            data-active={String(roadbook.id) === String(selectedId) ? "true" : undefined}
            aria-current={String(roadbook.id) === String(selectedId) ? "page" : undefined}
          >
            <p className="studio-roadbook-card__title">{roadbook.title}</p>
            <p className="studio-roadbook-card__meta">{roadbook.slug} · {roadbook.is_public ? "public" : "privé"}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
