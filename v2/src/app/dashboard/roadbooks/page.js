"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function RoadbooksPage() {
  const { user, loading, supabase } = useAuth();
  const router = useRouter();
  const [roadbooks, setRoadbooks] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("roadbooks")
      .select("id, slug, title, description, is_public, created_at")
      .order("created_at", { ascending: false })
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setRoadbooks(data ?? []);
        setFetching(false);
      });
  }, [user]);

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    let slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || `roadbook-${Date.now()}`;

    const { data: existing } = await supabase
      .from("roadbooks")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (existing) {
      slug = `${slug}-${Date.now()}`;
    }

    const { error: insertError } = await supabase.from("roadbooks").insert({
      slug,
      owner_id: user.id,
      title,
      description,
      is_public: isPublic,
    });

    if (insertError) {
      setError(insertError.message);
    } else {
      setTitle("");
      setDescription("");
      setIsPublic(false);
      const { data } = await supabase
        .from("roadbooks")
        .select("id, slug, title, description, is_public, created_at")
        .order("created_at", { ascending: false });
      setRoadbooks(data ?? []);
      setCreating(false);
    }
  }

  if (loading) return <main className="page-dashboard"><p>Chargement…</p></main>;
  if (!user) return null;

  if (fetching) {
    return <main className="page-dashboard"><h1>Mes roadbooks</h1><p>Chargement de la liste…</p></main>;
  }

  if (error && !roadbooks.length) {
    return <main className="page-dashboard"><h1>Mes roadbooks</h1><p className="page-error">{error}</p><p><Link href="/dashboard/roadbooks">Réessayer</Link></p></main>;
  }

  return (
    <main className="page-dashboard studio-layout">
      <div className="studio-panel">
        <div className="studio-panel__header">
          <h1>Mes roadbooks</h1>
          <div className="studio-actions">
            <Link href="/explore" className="terrain-button--secondary studio-action-button--compact" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Explorer</Link>
            <Link href="/dashboard" className="terrain-button--secondary studio-action-button--compact" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Dashboard</Link>
          </div>
        </div>

        <div className="studio-create-form">
          <h3>Créer un roadbook</h3>
          <form onSubmit={handleCreate}>
            <div className="studio-form-grid">
              <label>Titre<input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
              <label>Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} /></label>
              <label className="studio-form-grid__full" style={{ flexDirection: "row", alignItems: "center", gap: "0.3rem", fontWeight: 400, cursor: "pointer" }}>
                <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} style={{ width: "auto" }} />
                Public
              </label>
            </div>
            {error && <p className="page-error">{error}</p>}
            <div className="studio-create-form__actions">
              <button type="submit" disabled={creating}>{creating ? "Création…" : "Créer"}</button>
            </div>
          </form>
        </div>
      </div>

      <div className="studio-panel">
        <h2 className="studio-eyebrow">Liste ({roadbooks.length})</h2>
        {roadbooks.length === 0 && <p className="studio-detail--empty">Aucun roadbook pour le moment.</p>}
        <div className="studio-roadbook-list">
          {roadbooks.map((rb) => (
            <div key={rb.id} style={{ position: "relative" }}>
              <Link href={`/dashboard/roadbooks/${rb.id}`} className="studio-roadbook-card" style={{ textDecoration: "none", display: "block" }}>
                <p className="studio-roadbook-card__title">{rb.title}</p>
                <p className="studio-roadbook-card__meta">
                  {rb.is_public ? "public" : "privé"}
                  {rb.description && <> — {rb.description}</>}
                  {" — "}
                  <Link href={`/roadbooks/${rb.slug}`} onClick={e => e.stopPropagation()}>Voir</Link>
                </p>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
