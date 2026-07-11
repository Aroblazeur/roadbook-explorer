"use client";

import { useAuth } from "@/lib/auth-context";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchAndComputeGpxMetrics, estimateGpxHours, formatDuration } from "@/lib/gpx-metrics";
import { createPoiIndex, createAccommodationIndex, findPoi, findAccommodation, loadEnrichmentData } from "@/lib/enrichment";

export default function RoadbookDetailPage() {
  const { user, loading: authLoading, supabase } = useAuth();
  const router = useRouter();
  const { id } = useParams();
  const [roadbook, setRoadbook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [activity, setActivity] = useState("");
  const [destination, setDestination] = useState("");
  const [project, setProject] = useState("");

  const [stages, setStages] = useState([]);
  const [stageDayNumber, setStageDayNumber] = useState("");
  const [stageTitle, setStageTitle] = useState("");
  const [stageStart, setStageStart] = useState("");
  const [stageEnd, setStageEnd] = useState("");
  const [stageDist, setStageDist] = useState("");
  const [stageGain, setStageGain] = useState("");
  const [stageLoss, setStageLoss] = useState("");
  const [stageDifficulty, setStageDifficulty] = useState("");
  const [stageAccommodation, setStageAccommodation] = useState("");
  const [stageDescription, setStageDescription] = useState("");
  const [stageNotes, setStageNotes] = useState("");
  const [stageWarning, setStageWarning] = useState("");
  const [stageMapEmbed, setStageMapEmbed] = useState("");
  const [stagePhotoUrl, setStagePhotoUrl] = useState("");
  const [stageDay, setStageDay] = useState("");
  const [stageLabel, setStageLabel] = useState("");
  const [stageDuration, setStageDuration] = useState("");
  const [stageError, setStageError] = useState(null);
  const [stageSuccess, setStageSuccess] = useState(null);
  const [editingStage, setEditingStage] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const [poisByStage, setPoisByStage] = useState({});
  const [variantsByStage, setVariantsByStage] = useState({});
  const [poiForm, setPoiForm] = useState({ stage_id: null, type: "", name: "", description: "", lat: "", lng: "", url: "", editing: null });
  const [variantForm, setVariantForm] = useState({ stage_id: null, title: "", type: "", departure: "", arrival: "", description: "", distance_km: "", elevation_gain_m: "", elevation_loss_m: "", map_embed_url: "", notes: "", editing: null });
  const [noteForm, setNoteForm] = useState({ stage_id: null, text: "", editing: null });
  const [accommodationForm, setAccommodationForm] = useState({ stage_id: null, name: "", url: "", photo: "", editing: null });
  const [expandedStages, setExpandedStages] = useState({});

  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [deletingImage, setDeletingImage] = useState(null);

  const [gpxError, setGpxError] = useState(null);
  const [uploadingGpx, setUploadingGpx] = useState(null);
  const [gpxOfficial, setGpxOfficial] = useState(null);
  const [gpxCustom, setGpxCustom] = useState(null);
  const [gpxByStage, setGpxByStage] = useState({});
  const [computingGpx, setComputingGpx] = useState(null);

  const [coverMode, setCoverMode] = useState(null); // "url" | "media"
  const [coverUrl, setCoverUrl] = useState("");
  const [coverMediaId, setCoverMediaId] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [duplicating, setDuplicating] = useState(false);
  const [poiIndex, setPoiIndex] = useState(null);
  const [accommodationIndex, setAccommodationIndex] = useState(null);
  const [enrichmentError, setEnrichmentError] = useState(null);
  const [enrichingPoi, setEnrichingPoi] = useState(null);
  const [enrichingAccommodation, setEnrichingAccommodation] = useState(null);
  const [automationBusy, setAutomationBusy] = useState(null);
  const [automationResult, setAutomationResult] = useState(null);
  const [showStageForm, setShowStageForm] = useState(false);

  // Official route
  const [officialDist, setOfficialDist] = useState("");
  const [officialGain, setOfficialGain] = useState("");
  const [officialLoss, setOfficialLoss] = useState("");
  const [officialGpx, setOfficialGpx] = useState("");
  const [officialMap, setOfficialMap] = useState("");
  // Current trace
  const [traceDist, setTraceDist] = useState("");
  const [traceGain, setTraceGain] = useState("");
  const [traceLoss, setTraceLoss] = useState("");
  const [traceGpx, setTraceGpx] = useState("");
  const [traceMap, setTraceMap] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading]);

  function loadData() {
    if (!user || !id) return;
    supabase.from("roadbooks").select("*").eq("id", id).single()
      .then(({ data, error: err }) => {
        if (err) { setFetchError(err.message); }
        else if (!data) { setFetchError("Roadbook introuvable."); }
        else {
          setRoadbook(data);
          setTitle(data.title);
          setDescription(data.description ?? "");
          setIsPublic(data.is_public);
          setActivity(data.metadata?.activity ?? "");
          setDestination(data.metadata?.destination ?? "");
          setProject(data.metadata?.project ?? "");
          const meta = data.metadata ?? {};
          const official = meta.official ?? {};
          setOfficialDist(official.distance != null ? String(official.distance) : "");
          setOfficialGain(official.elevationGain != null ? String(official.elevationGain) : "");
          setOfficialLoss(official.elevationLoss != null ? String(official.elevationLoss) : "");
          setOfficialGpx(official.gpx ?? "");
          setOfficialMap(official.mapEmbedUrl ?? "");
          const stagesTotal = meta.stagesTotal ?? {};
          setTraceDist(stagesTotal.distance != null ? String(stagesTotal.distance) : (data.distance_total_km != null ? String(data.distance_total_km) : ""));
          setTraceGain(stagesTotal.elevationGain != null ? String(stagesTotal.elevationGain) : (data.elevation_gain_total_m != null ? String(data.elevation_gain_total_m) : ""));
          setTraceLoss(stagesTotal.elevationLoss != null ? String(stagesTotal.elevationLoss) : (data.elevation_loss_total_m != null ? String(data.elevation_loss_total_m) : ""));
          setTraceGpx(stagesTotal.gpx ?? "");
          setTraceMap(stagesTotal.mapEmbedUrl ?? "");
          setCoverUrl(data.cover_image_url ?? "");
          setCoverMediaId(data.cover_media_id ?? null);
          if (data.cover_image_url) { setCoverMode("url"); setCoverPreview(data.cover_image_url); }
          else if (data.cover_media_id) {
            setCoverMode("media"); setCoverPreview(null);
            supabase.from("media").select("bucket, path").eq("id", data.cover_media_id).maybeSingle()
              .then(({ data: m }) => {
                if (m) supabase.storage.from(m.bucket).createSignedUrl(m.path, 86400).then(({ data: s }) => setCoverPreview(s?.signedUrl ?? null));
              });
          } else {           setCoverMode(null); setCoverPreview(null); }
        }
        setLoading(false);
        if (data?.slug) {
          loadEnrichmentData(data.slug, "poi").then(json => { if (json?.items) setPoiIndex(createPoiIndex(json.items)); }).catch(() => {});
          loadEnrichmentData(data.slug, "accommodation").then(json => { if (json?.items) setAccommodationIndex(createAccommodationIndex(json.items)); }).catch(() => {});
        }
      });

    loadImages();
    loadGpx();

    supabase.from("stages").select("*").eq("roadbook_id", Number(id))
      .order("stage_number", { ascending: true })
      .then(({ data, error: err }) => {
        if (err) { console.error(err); return; }
        if (!data) return;
        setStages(data);
        const stageIds = data.map(s => s.id);
        if (stageIds.length) {
          supabase.from("stage_pois").select("*").in("stage_id", stageIds).order("sort_order", { ascending: true })
            .then(({ data: pois }) => {
              if (pois) {
                const map = {};
                pois.forEach(p => { if (!map[p.stage_id]) map[p.stage_id] = []; map[p.stage_id].push(p); });
                setPoisByStage(map);
              }
            });
          supabase.from("stage_variants").select("*").in("stage_id", stageIds).order("sort_order", { ascending: true })
            .then(({ data: variants }) => {
              if (variants) {
                const map = {};
                variants.forEach(v => { if (!map[v.stage_id]) map[v.stage_id] = []; map[v.stage_id].push(v); });
                setVariantsByStage(map);
              }
            });
        }
      });
  }

  useEffect(() => { loadData(); }, [user, id]);

  async function handleSave(e) {
    e.preventDefault();
    setError(null); setSuccess(null); setSaving(true);
    const meta = { ...(roadbook?.metadata ?? {}) };
    if (activity) meta.activity = activity; else delete meta.activity;
    if (destination) meta.destination = destination; else delete meta.destination;
    if (project) meta.project = project; else delete meta.project;
    const { error: updateError } = await supabase
      .from("roadbooks").update({ title, description, metadata: meta }).eq("id", id);
    if (updateError) setError(updateError.message);
    else { setSuccess("Roadbook mis à jour."); setRoadbook(prev => ({ ...prev, title, description, metadata: meta })); }
    setSaving(false);
  }

  async function handleSaveRoute(e) {
    e.preventDefault();
    setError(null); setSuccess(null); setSaving(true);
    const meta = { ...(roadbook?.metadata ?? {}) };
    meta.official = {
      distance: officialDist ? Number(officialDist) : null,
      elevationGain: officialGain ? Number(officialGain) : null,
      elevationLoss: officialLoss ? Number(officialLoss) : null,
      gpx: officialGpx || null,
      mapEmbedUrl: officialMap || null,
    };
    meta.stagesTotal = {
      distance: traceDist ? Number(traceDist) : null,
      elevationGain: traceGain ? Number(traceGain) : null,
      elevationLoss: traceLoss ? Number(traceLoss) : null,
      gpx: traceGpx || null,
      mapEmbedUrl: traceMap || null,
    };
    const updateFields = {
      metadata: meta,
      distance_total_km: traceDist ? Number(traceDist) : null,
      elevation_gain_total_m: traceGain ? Number(traceGain) : null,
      elevation_loss_total_m: traceLoss ? Number(traceLoss) : null,
    };
    const { error: updateError } = await supabase.from("roadbooks").update(updateFields).eq("id", id);
    if (updateError) setError(updateError.message);
    else { setSuccess("Itinéraire et tracé mis à jour."); setRoadbook(prev => ({ ...prev, metadata: meta, ...updateFields })); }
    setSaving(false);
  }

  async function handleToggleVisibility() {
    const { error: updateError } = await supabase
      .from("roadbooks").update({ is_public: !isPublic }).eq("id", id);
    if (updateError) setError(updateError.message);
    else { setIsPublic(!isPublic); setSuccess(isPublic ? "Roadbook passé en privé." : "Roadbook passé en public."); }
  }

  function clearStageForm() {
    setStageDayNumber(""); setStageTitle(""); setStageStart(""); setStageEnd("");
    setStageDist(""); setStageGain(""); setStageLoss(""); setStageDifficulty("");
    setStageAccommodation(""); setStageDescription(""); setStageNotes(""); setStageWarning("");
    setStageMapEmbed(""); setStagePhotoUrl(""); setStageDay(""); setStageLabel(""); setStageDuration("");
    setEditingStage(null);
  }

  function fillStageForm(stage) {
    const meta = stage.metadata ?? {};
    setStageDayNumber(String(stage.stage_number));
    setStageTitle(stage.title ?? ""); setStageStart(stage.departure ?? "");
    setStageEnd(stage.arrival ?? "");
    setStageDist(stage.distance_km != null ? String(stage.distance_km) : "");
    setStageGain(stage.elevation_gain_m != null ? String(stage.elevation_gain_m) : "");
    setStageLoss(stage.elevation_loss_m != null ? String(stage.elevation_loss_m) : "");
    setStageDifficulty(meta.difficulty ?? ""); setStageAccommodation(stage.accommodation_name ?? "");
    setStageDescription(meta.description ?? "");
    setStageNotes(stage.notes?.length ? stage.notes.map(n => n.text ?? n).join("\n") : "");
    setStageWarning(meta.warning ?? "");
    setStageMapEmbed(stage.map_embed_url ?? "");
    setStagePhotoUrl(stage.stage_photo_url ?? "");
    setStageDay(stage.day ?? "");
    setStageLabel(stage.stage_label ?? "");
    setStageDuration(stage.duration ?? "");
    setEditingStage(stage);
  }

  async function handleStageSubmit(e) {
    e.preventDefault();
    setStageError(null); setStageSuccess(null);
    const dayNumber = Number(stageDayNumber);
    if (!dayNumber) { setStageError("Le numéro d'étape est obligatoire."); return; }
    const notes = stageNotes.split("\n").map(l => l.trim()).filter(Boolean).map(text => ({ text }));
    const metadata = {};
    if (stageDifficulty) metadata.difficulty = stageDifficulty;
    if (stageDescription) metadata.description = stageDescription;
    if (stageWarning) metadata.warning = stageWarning;
    const record = {
      roadbook_id: Number(id), stage_number: dayNumber, title: stageTitle || null,
      departure: stageStart || null, arrival: stageEnd || null,
      distance_km: stageDist ? Number(stageDist) : null,
      elevation_gain_m: stageGain ? Number(stageGain) : null,
      elevation_loss_m: stageLoss ? Number(stageLoss) : null,
      accommodation_name: stageAccommodation || null,
      map_embed_url: stageMapEmbed || null,
      stage_photo_url: stagePhotoUrl || null,
      day: stageDay || null,
      stage_label: stageLabel || null,
      duration: stageDuration || null,
      notes: notes.length ? notes : [], metadata,
    };

    if (editingStage) {
      const { error: updateError } = await supabase.from("stages").update(record).eq("id", editingStage.id);
      if (updateError) { setStageError(updateError.message); return; }
      setStageSuccess("Étape mise à jour.");
    } else {
      const { error: insertError } = await supabase.from("stages").insert(record);
      if (insertError) { setStageError(insertError.message); return; }
      setStageSuccess("Étape créée.");
    }
    clearStageForm();
    const { data } = await supabase.from("stages").select("*").eq("roadbook_id", Number(id)).order("stage_number", { ascending: true });
    if (data) setStages(data);
  }

  async function handleDeleteStage(stageId) {
    if (!window.confirm("Supprimer cette étape ?")) return;
    setDeleting(stageId);
    const { error: deleteError } = await supabase.from("stages").delete().eq("id", stageId);
    if (deleteError) { setStageError(deleteError.message); }
    else { setStages(prev => prev.filter(s => s.id !== stageId)); setStageSuccess("Étape supprimée."); }
    setDeleting(null);
  }

  function clearPoiForm() { setPoiForm({ stage_id: null, type: "", name: "", description: "", lat: "", lng: "", url: "", editing: null }); }
  function clearVariantForm() { setVariantForm({ stage_id: null, title: "", type: "", departure: "", arrival: "", description: "", distance_km: "", elevation_gain_m: "", elevation_loss_m: "", map_embed_url: "", notes: "", editing: null }); }
  function clearNoteForm() { setNoteForm({ stage_id: null, text: "", editing: null }); }
  function clearAccommodationForm() { setAccommodationForm({ stage_id: null, name: "", url: "", photo: "", editing: null }); }

  function reloadPoisVariants(stageIds) {
    if (!stageIds?.length) return;
    supabase.from("stage_pois").select("*").in("stage_id", stageIds).order("sort_order", { ascending: true })
      .then(({ data: pois }) => {
        if (pois) { const m = {}; pois.forEach(p => { if (!m[p.stage_id]) m[p.stage_id] = []; m[p.stage_id].push(p); }); setPoisByStage(m); }
      });
    supabase.from("stage_variants").select("*").in("stage_id", stageIds).order("sort_order", { ascending: true })
      .then(({ data: variants }) => {
        if (variants) { const m = {}; variants.forEach(v => { if (!m[v.stage_id]) m[v.stage_id] = []; m[v.stage_id].push(v); }); setVariantsByStage(m); }
      });
  }

  async function handlePoiSubmit(e) {
    e.preventDefault();
    setStageError(null); setStageSuccess(null);
    const record = { stage_id: poiForm.stage_id, name: poiForm.name, poi_type: poiForm.type || null, description: poiForm.description || null, lat: poiForm.lat ? Number(poiForm.lat) : null, lng: poiForm.lng ? Number(poiForm.lng) : null, link_url: poiForm.url || null };
    if (poiForm.editing) {
      const { error: updateError } = await supabase.from("stage_pois").update(record).eq("id", poiForm.editing);
      if (updateError) { setStageError(updateError.message); return; }
      setStageSuccess("POI mis à jour.");
    } else {
      const { error: insertError } = await supabase.from("stage_pois").insert(record);
      if (insertError) { setStageError(insertError.message); return; }
      setStageSuccess("POI créé.");
    }
    clearPoiForm();
    reloadPoisVariants(stages.map(s => s.id));
  }

  async function handleDeletePoi(poiId) {
    if (!window.confirm("Supprimer ce POI ?")) return;
    const { error: deleteError } = await supabase.from("stage_pois").delete().eq("id", poiId);
    if (deleteError) { setStageError(deleteError.message); return; }
    setStageSuccess("POI supprimé.");
    reloadPoisVariants(stages.map(s => s.id));
  }

  async function handleVariantSubmit(e) {
    e.preventDefault();
    setStageError(null); setStageSuccess(null);
    const meta = {};
    if (variantForm.type) meta.type = variantForm.type;
    const notesArr = variantForm.notes ? variantForm.notes.split("\n").map(l => l.trim()).filter(Boolean).map(text => ({ text })) : [];
    const record = { stage_id: variantForm.stage_id, label: variantForm.title, description: variantForm.description || null, distance_km: variantForm.distance_km ? Number(variantForm.distance_km) : null, departure: variantForm.departure || null, arrival: variantForm.arrival || null, elevation_gain_m: variantForm.elevation_gain_m ? Number(variantForm.elevation_gain_m) : null, elevation_loss_m: variantForm.elevation_loss_m ? Number(variantForm.elevation_loss_m) : null, map_embed_url: variantForm.map_embed_url || null, notes: notesArr.length ? notesArr : [], metadata: Object.keys(meta).length ? meta : {} };
    if (variantForm.editing) {
      const { error: updateError } = await supabase.from("stage_variants").update(record).eq("id", variantForm.editing);
      if (updateError) { setStageError(updateError.message); return; }
      setStageSuccess("Variante mise à jour.");
    } else {
      const { error: insertError } = await supabase.from("stage_variants").insert(record);
      if (insertError) { setStageError(insertError.message); return; }
      setStageSuccess("Variante créée.");
    }
    clearVariantForm();
    reloadPoisVariants(stages.map(s => s.id));
  }

  async function handleDeleteVariant(variantId) {
    if (!window.confirm("Supprimer cette variante ?")) return;
    const { error: deleteError } = await supabase.from("stage_variants").delete().eq("id", variantId);
    if (deleteError) { setStageError(deleteError.message); return; }
    setStageSuccess("Variante supprimée.");
    reloadPoisVariants(stages.map(s => s.id));
  }

  function resizeImage(file, maxWidth = 1600) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxWidth) { height = Math.round(height * maxWidth / width); width = maxWidth; }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error("Échec de la compression")); return; }
          resolve({ blob, width, height, size: blob.size });
        }, "image/jpeg", 0.85);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  async function handleSignedUrl(path) {
    const { data } = await supabase.storage.from("roadbook-images").createSignedUrl(path, 3600);
    return data?.signedUrl;
  }

  async function loadImages() {
    if (!user || !id) return;
    const { data: mediaRows } = await supabase
      .from("media").select("*").eq("roadbook_id", Number(id)).eq("type", "image").order("created_at", { ascending: false });
    if (!mediaRows) return;
    const rowsWithUrls = await Promise.all(mediaRows.map(async row => {
      const signedUrl = await handleSignedUrl(row.path);
      return { ...row, signedUrl };
    }));
    setImages(rowsWithUrls);
  }

  async function handleUploadImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null); setUploading(true);
    try {
      const { blob, width, height, size } = await resizeImage(file);
      const uuid = crypto.randomUUID();
      const path = `${user.id}/${id}/${uuid}-${file.name}`;
      const { error: storageError } = await supabase.storage.from("roadbook-images").upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (storageError) { setUploadError(storageError.message); return; }
      const { error: dbError } = await supabase.from("media").insert({
        roadbook_id: Number(id), stage_id: null, type: "image",
        bucket: "roadbook-images", path, file_name: file.name,
        mime_type: "image/jpeg",
        uploaded_by: user.id,
        metadata: { original_name: file.name, original_size: file.size, resized_width: width, resized_height: height, final_size: size, format: "jpeg" },
      });
      if (dbError) { setUploadError(dbError.message); return; }
      await loadImages();
    } catch (err) { setUploadError(err.message); }
    finally { setUploading(false); e.target.value = ""; }
  }

  async function handleDeleteImage(mediaRow) {
    if (!window.confirm("Supprimer cette image ?")) return;
    setDeletingImage(mediaRow.id);
    try {
      const { error: storageError } = await supabase.storage.from("roadbook-images").remove([mediaRow.path]);
      if (storageError) { setUploadError(storageError.message); return; }
      const { error: dbError } = await supabase.from("media").delete().eq("id", mediaRow.id);
      if (dbError) { setUploadError(dbError.message); return; }
      setImages(prev => prev.filter(i => i.id !== mediaRow.id));
    } catch (err) { setUploadError(err.message); }
    finally { setDeletingImage(null); }
  }

  const GPX_BUCKET = "roadbook-gpx";

  function buildGpxPath(scope, role, stageId) {
    if (scope === "stage" && stageId) return `${user.id}/${id}/stages/${stageId}/${crypto.randomUUID()}`;
    return `${user.id}/${id}/roadbook/${role}/${crypto.randomUUID()}`;
  }

  function validateGpx(file) {
    const name = file.name.toLowerCase();
    const accept = name.endsWith(".gpx") || ["application/gpx+xml","application/xml","text/xml"].includes(file.type);
    if (!accept) return "Seuls les fichiers .gpx sont acceptés.";
    if (file.size > 10 * 1024 * 1024) return "Le fichier dépasse 10 Mo.";
    return null;
  }

  async function loadGpx() {
    if (!user || !id) return;
    const { data: rows } = await supabase
      .from("media").select("*").eq("roadbook_id", Number(id)).eq("type", "gpx");
    if (!rows) return;
    const official = rows.find(r => r.metadata?.gpx_role === "official");
    const custom = rows.find(r => r.metadata?.gpx_role === "custom");
    setGpxOfficial(official ?? null);
    setGpxCustom(custom ?? null);
    const byStage = {};
    rows.filter(r => r.metadata?.scope === "stage" && r.stage_id).forEach(r => { byStage[r.stage_id] = r; });
    setGpxByStage(byStage);
  }

  async function handleGpxDownload(mediaRow) {
    const { data } = await supabase.storage.from(GPX_BUCKET).createSignedUrl(mediaRow.path, 3600);
    if (!data?.signedUrl) return;
    const a = document.createElement("a"); a.href = data.signedUrl; a.download = mediaRow.file_name; a.click();
  }

  async function handleGpxReplace(mediaRow, scope, role, stageId) {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".gpx";
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      const valErr = validateGpx(file); if (valErr) { setGpxError(valErr); return; }
      setGpxError(null); setUploadingGpx(role ?? stageId);
      try {
        await supabase.storage.from(GPX_BUCKET).remove([mediaRow.path]);
        const path = buildGpxPath(scope, role, stageId) + `-${file.name}`;
        const { error: storageError } = await supabase.storage.from(GPX_BUCKET).upload(path, file, { contentType: "application/gpx+xml", upsert: false });
        if (storageError) { setGpxError(storageError.message); return; }
        const meta = { ...mediaRow.metadata, original_name: file.name, original_size: file.size };
        const { error: dbError } = await supabase.from("media").update({ path, file_name: file.name, metadata: meta }).eq("id", mediaRow.id);
        if (dbError) { setGpxError(dbError.message); return; }
        await loadGpx();
      } catch (err) { setGpxError(err.message); }
      finally { setUploadingGpx(null); }
    };
    input.click();
  }

  async function handleGpxUpload(scope, role, stageId) {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".gpx";
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      const valErr = validateGpx(file); if (valErr) { setGpxError(valErr); return; }
      setGpxError(null); setUploadingGpx(role ?? stageId);
      try {
        const path = buildGpxPath(scope, role, stageId) + `-${file.name}`;
        const { error: storageError } = await supabase.storage.from(GPX_BUCKET).upload(path, file, { contentType: "application/gpx+xml", upsert: false });
        if (storageError) { setGpxError(storageError.message); return; }
        const meta = { scope, original_name: file.name, original_size: file.size };
        if (role) meta.gpx_role = role;
        const { error: dbError } = await supabase.from("media").insert({
          roadbook_id: Number(id), stage_id: scope === "stage" ? stageId : null, type: "gpx",
          bucket: GPX_BUCKET, path, file_name: file.name, mime_type: "application/gpx+xml",
          uploaded_by: user.id, metadata: meta,
        });
        if (dbError) { setGpxError(dbError.message); return; }
        await loadGpx();
      } catch (err) { setGpxError(err.message); }
      finally { setUploadingGpx(null); }
    };
    input.click();
  }

  async function handleComputeFromGpx(mediaRow, stage) {
    if (!mediaRow || !stage) return;
    setComputingGpx(stage.id);
    setGpxError(null);
    setStageError(null);
    try {
      const { data } = await supabase.storage.from(GPX_BUCKET).createSignedUrl(mediaRow.path, 3600);
      if (!data?.signedUrl) throw new Error("Impossible d'obtenir l'URL signée du GPX");

      const metrics = await fetchAndComputeGpxMetrics(data.signedUrl);
      const hours = estimateGpxHours(metrics.distanceKm, metrics.elevationGainM);
      const durationStr = formatDuration(hours);

      const existingDist = stage.distance_km != null;
      const existingGain = stage.elevation_gain_m != null;
      const existingLoss = stage.elevation_loss_m != null;
      const existingDuration = stage.duration != null;

      const anyExisting = existingDist || existingGain || existingLoss || existingDuration;
      if (anyExisting) {
        const msgParts = [];
        if (existingDist) msgParts.push(`distance (${stage.distance_km} km)`);
        if (existingGain) msgParts.push(`D+ (${stage.elevation_gain_m} m)`);
        if (existingLoss) msgParts.push(`D− (${stage.elevation_loss_m} m)`);
        if (existingDuration) msgParts.push(`durée (${stage.duration})`);

        const ok = window.confirm(
          `Cette étape a déjà des valeurs de ${msgParts.join(", ")}.\n\n`
          + `Nouvelles valeurs calculées :\n`
          + `• Distance : ${metrics.distanceKm.toFixed(1)} km\n`
          + `• D+ : ${metrics.elevationGainM != null ? Math.round(metrics.elevationGainM) + " m" : "N/A"}\n`
          + `• D− : ${metrics.elevationLossM != null ? Math.round(metrics.elevationLossM) + " m" : "N/A"}\n`
          + `• Durée : ${durationStr || "N/A"}\n\n`
          + `Écraser les valeurs existantes ?`
        );
        if (!ok) { setComputingGpx(null); return; }
      }

      const update = {};
      if (metrics.distanceKm > 0) update.distance_km = Math.round(metrics.distanceKm * 100) / 100;
      if (metrics.elevationGainM != null) update.elevation_gain_m = Math.round(metrics.elevationGainM);
      if (metrics.elevationLossM != null) update.elevation_loss_m = Math.round(metrics.elevationLossM);
      if (durationStr) update.duration = durationStr;

      const { error: updateError } = await supabase.from("stages").update(update).eq("id", stage.id);
      if (updateError) { setStageError(updateError.message); setComputingGpx(null); return; }

      setStageSuccess(`Étape mise à jour depuis le GPX : ${metrics.distanceKm.toFixed(1)} km`
        + (metrics.elevationGainM != null ? `, D+ ${Math.round(metrics.elevationGainM)} m` : "")
        + (metrics.elevationLossM != null ? `, D− ${Math.round(metrics.elevationLossM)} m` : "")
        + (durationStr ? `, ${durationStr}` : "")
      );

      const { data: refreshed } = await supabase.from("stages").select("*").eq("roadbook_id", Number(id)).order("stage_number", { ascending: true });
      if (refreshed) setStages(refreshed);
    } catch (err) {
      setGpxError(err.message ?? String(err));
    } finally {
      setComputingGpx(null);
    }
  }

  async function handleEnrichPoi(poi, stageId) {
    if (!poi || !poiIndex) { setEnrichmentError("Aucune donnée d'enrichissement disponible pour ce roadbook."); return; }
    const found = findPoi(poi.name, poiIndex);
    if (!found) { setEnrichmentError(`Aucun enrichissement trouvé pour "${poi.name}".`); return; }
    setEnrichingPoi(poi.id);
    setEnrichmentError(null);
    setStageError(null);
    try {
      const existingDesc = poi.description != null && poi.description !== "";
      const existingLat = poi.lat != null;
      const existingLng = poi.lng != null;
      const existingLink = poi.link_url != null && poi.link_url !== "";
      const anyExisting = existingDesc || existingLat || existingLng || existingLink;
      if (anyExisting) {
        const parts = [];
        if (existingDesc) parts.push("description");
        if (existingLat) parts.push("coordonnées");
        if (existingLink) parts.push("lien");
        const ok = window.confirm(
          `Ce POI a déjà des valeurs (${parts.join(", ")}).\n\n`
          + `Nouvelles valeurs proposées :\n`
          + `• Description : ${found.description || "N/A"}\n`
          + `• Coordonnées : ${found.coordinates ? `${found.coordinates.lat}, ${found.coordinates.lng}` : "N/A"}\n`
          + `• Image : ${found.image || "N/A"}\n`
          + `• Lien : ${found.url || "N/A"}\n\n`
          + `Écraser les valeurs existantes ?`
        );
        if (!ok) { setEnrichingPoi(null); return; }
      }
      const update = {};
      if (found.description) update.description = found.description;
      if (found.coordinates) { update.lat = found.coordinates.lat; update.lng = found.coordinates.lng; }
      if (found.image) update.photo_url = found.image;
      if (found.url) update.link_url = found.url;
      if (!Object.keys(update).length) { setEnrichmentError("Aucune donnée à mettre à jour."); return; }
      const { error: updateError } = await supabase.from("stage_pois").update(update).eq("id", poi.id);
      if (updateError) { setStageError(updateError.message); return; }
      setStageSuccess(`POI "${poi.name}" enrichi.`);
      const stageIds = stages.map(s => s.id);
      if (stageIds.length) {
        supabase.from("stage_pois").select("*").in("stage_id", stageIds).order("sort_order", { ascending: true })
          .then(({ data: pois }) => {
            if (pois) { const m = {}; pois.forEach(p => { if (!m[p.stage_id]) m[p.stage_id] = []; m[p.stage_id].push(p); }); setPoisByStage(m); }
          });
      }
    } catch (err) { setEnrichmentError(err.message ?? String(err)); }
    finally { setEnrichingPoi(null); }
  }

  async function handleEnrichAccommodation(stage) {
    if (!accommodationIndex) { setEnrichmentError("Aucune donnée d'enrichissement disponible pour ce roadbook."); return; }
    const url = stage.accommodation_url;
    const name = stage.accommodation_name;
    let found = url ? findAccommodation(url, accommodationIndex) : null;
    if (!found && name) {
      found = findAccommodationByName(name, accommodationIndex);
    }
    if (!found) { setEnrichmentError(`Aucun enrichissement trouvé pour l'hébergement${url ? ` (${url})` : ""}${name ? ` "${name}"` : ""}.`); return; }
    setEnrichingAccommodation(stage.id);
    setEnrichmentError(null);
    setStageError(null);
    try {
      const existingName = stage.accommodation_name != null && stage.accommodation_name !== "";
      const existingPhoto = stage.accommodation_photo != null && stage.accommodation_photo !== "";
      const anyExisting = existingName || existingPhoto;
      if (anyExisting) {
        const parts = [];
        if (existingName) parts.push("nom");
        if (existingPhoto) parts.push("photo");
        const ok = window.confirm(
          `Cet hébergement a déjà des valeurs (${parts.join(", ")}).\n\n`
          + `Nouvelles valeurs proposées :\n`
          + `• Nom : ${found.name || "N/A"}\n`
          + `• Image : ${found.image || "N/A"}\n\n`
          + `Écraser les valeurs existantes ?`
        );
        if (!ok) { setEnrichingAccommodation(null); return; }
      }
      const update = {};
      if (found.name) update.accommodation_name = found.name;
      if (found.image) update.accommodation_photo = found.image;
      if (!Object.keys(update).length) { setEnrichmentError("Aucune donnée à mettre à jour."); return; }
      const { error: updateError } = await supabase.from("stages").update(update).eq("id", stage.id);
      if (updateError) { setStageError(updateError.message); return; }
      setStageSuccess(`Hébergement enrichi : ${found.name || "nom mis à jour"}.`);
      const { data: refreshed } = await supabase.from("stages").select("*").eq("roadbook_id", Number(id)).order("stage_number", { ascending: true });
      if (refreshed) setStages(refreshed);
    } catch (err) { setEnrichmentError(err.message ?? String(err)); }
    finally { setEnrichingAccommodation(null); }
  }

  async function handleClearAccommodation(stageId) {
    if (!window.confirm("Vider les informations d'hébergement de cette étape ?")) return;
    try {
      const { error: updateError } = await supabase.from("stages").update({ accommodation_name: null, accommodation_url: null, accommodation_photo: null }).eq("id", stageId);
      if (updateError) { setStageError(updateError.message); return; }
      setStageSuccess("Hébergement supprimé.");
      const { data: refreshed } = await supabase.from("stages").select("*").eq("roadbook_id", Number(id)).order("stage_number", { ascending: true });
      if (refreshed) setStages(refreshed);
    } catch (err) { setEnrichmentError(err.message ?? String(err)); }
  }

  async function handleAccommodationSubmit(e) {
    e.preventDefault();
    const { stage_id, name, url, photo, editing } = accommodationForm;
    if (!stage_id || !name.trim()) { setStageError("Le nom de l'hébergement est requis."); return; }
    try {
      const payload = { accommodation_name: name.trim(), accommodation_url: url.trim() || null, accommodation_photo: photo.trim() || null };
      const { error: updateError } = await supabase.from("stages").update(payload).eq("id", stage_id);
      if (updateError) { setStageError(updateError.message); return; }
      setStageSuccess(editing ? "Hébergement modifié." : "Hébergement ajouté.");
      clearAccommodationForm();
      const { data: refreshed } = await supabase.from("stages").select("*").eq("roadbook_id", Number(id)).order("stage_number", { ascending: true });
      if (refreshed) setStages(refreshed);
    } catch (err) { setEnrichmentError(err.message ?? String(err)); }
  }

  async function handleNoteSubmit(e) {
    e.preventDefault();
    const { stage_id, text, editing } = noteForm;
    if (!stage_id) return;
    const stage = stages.find(s => s.id === stage_id);
    if (!stage) return;
    const notes = Array.isArray(stage.notes) ? [...stage.notes] : [];
    if (editing != null && notes[editing]) {
      notes[editing] = { ...notes[editing], text: text.trim() };
    } else {
      notes.push({ text: text.trim() });
    }
    try {
      const { error: updateError } = await supabase.from("stages").update({ notes }).eq("id", stage_id);
      if (updateError) { setStageError(updateError.message); return; }
      setStageSuccess(editing != null ? "Note modifiée." : "Note ajoutée.");
      clearNoteForm();
      const { data: refreshed } = await supabase.from("stages").select("*").eq("roadbook_id", Number(id)).order("stage_number", { ascending: true });
      if (refreshed) setStages(refreshed);
    } catch (err) { setEnrichmentError(err.message ?? String(err)); }
  }

  async function handleDeleteNote(stageId, noteIndex) {
    if (!window.confirm("Supprimer cette note ?")) return;
    const stage = stages.find(s => s.id === stageId);
    if (!stage) return;
    const notes = Array.isArray(stage.notes) ? [...stage.notes] : [];
    notes.splice(noteIndex, 1);
    try {
      const { error: updateError } = await supabase.from("stages").update({ notes }).eq("id", stageId);
      if (updateError) { setStageError(updateError.message); return; }
      setStageSuccess("Note supprimée.");
      const { data: refreshed } = await supabase.from("stages").select("*").eq("roadbook_id", Number(id)).order("stage_number", { ascending: true });
      if (refreshed) setStages(refreshed);
    } catch (err) { setEnrichmentError(err.message ?? String(err)); }
  }

  // --- Automations ---

  async function handleRecalculateTotals() {
    if (!stages.length) { setAutomationResult("Aucune étape à analyser."); return; }
    setAutomationBusy("totals");
    setAutomationResult(null);
    try {
      let totalDist = 0, totalGain = 0, totalLoss = 0;
      let hasDist = false, hasGain = false, hasLoss = false;
      stages.forEach(s => {
        if (s.distance_km != null) { totalDist += Number(s.distance_km); hasDist = true; }
        if (s.elevation_gain_m != null) { totalGain += Number(s.elevation_gain_m); hasGain = true; }
        if (s.elevation_loss_m != null) { totalLoss += Number(s.elevation_loss_m); hasLoss = true; }
      });
      const summaryParts = [`${stages.length} étape(s)`];
      if (hasDist) summaryParts.push(`distance totale : ${totalDist.toFixed(1)} km`);
      else summaryParts.push("distance : aucune donnée");
      if (hasGain) summaryParts.push(`D+ total : ${Math.round(totalGain)} m`);
      if (hasLoss) summaryParts.push(`D− total : ${Math.round(totalLoss)} m`);

      if (!hasDist && !hasGain && !hasLoss) {
        setAutomationResult("Aucune métrique disponible dans les étapes pour calculer les totaux.");
        setAutomationBusy(null); return;
      }

      const ok = window.confirm(
        `Totaux calculés sur ${stages.length} étape(s) :\n\n`
        + (hasDist ? `• Distance : ${totalDist.toFixed(1)} km\n` : "")
        + (hasGain ? `• D+ : ${Math.round(totalGain)} m\n` : "")
        + (hasLoss ? `• D− : ${Math.round(totalLoss)} m\n` : "")
        + `\nAppliquer ces totaux au roadbook ?`
      );
      if (!ok) { setAutomationBusy(null); return; }

      const updateFields = {};
      if (hasDist) updateFields.distance_total_km = Math.round(totalDist * 100) / 100;
      if (hasGain) updateFields.elevation_gain_total_m = Math.round(totalGain);
      if (hasLoss) updateFields.elevation_loss_total_m = Math.round(totalLoss);

      const { error } = await supabase.from("roadbooks").update(updateFields).eq("id", id);
      if (error) { setAutomationResult(`Erreur : ${error.message}`); return; }
      setAutomationResult(`Totaux appliqués : ${summaryParts.join(", ")}.`);
      setRoadbook(prev => ({ ...prev, ...updateFields }));
    } catch (err) { setAutomationResult(`Erreur : ${err.message}`); }
    finally { setAutomationBusy(null); }
  }

  async function handleAnalyzeStageGpx() {
    setAutomationBusy("gpx");
    setAutomationResult(null);
    const report = { analyzed: 0, updated: 0, errors: [] };
    try {
      const stats = stages.map(s => ({ stage: s, gpx: gpxByStage[s.id] ?? null }));
      const withGpx = stats.filter(s => s.gpx);
      if (!withGpx.length) {
        setAutomationResult("Aucune étape avec GPX. Importez un GPX d'étape d'abord.");
        setAutomationBusy(null); return;
      }

      const previewLines = ["Étapes avec GPX détectées :"];
      for (const { stage } of withGpx) {
        const has = [];
        if (stage.distance_km != null) has.push(`dist=${stage.distance_km}km`);
        if (stage.elevation_gain_m != null) has.push(`D+=${stage.elevation_gain_m}m`);
        if (stage.elevation_loss_m != null) has.push(`D−=${stage.elevation_loss_m}m`);
        if (stage.duration) has.push(`durée=${stage.duration}`);
        previewLines.push(`  • Jour ${stage.stage_number}${stage.title ? ` — ${stage.title}` : ""}${has.length ? ` [actuel : ${has.join(", ")}]` : ""}`);
      }
      previewLines.push(`\n${withGpx.length} étape(s) seront recalculées depuis leur GPX.`);
      previewLines.push("Les valeurs existantes seront écrasées après confirmation individuelle.");
      if (!window.confirm(previewLines.join("\n") + "\n\nContinuer ?")) { setAutomationBusy(null); return; }

      for (const { stage, gpx } of withGpx) {
        report.analyzed++;
        try {
          const { data } = await supabase.storage.from(GPX_BUCKET).createSignedUrl(gpx.path, 3600);
          if (!data?.signedUrl) { report.errors.push(`Jour ${stage.stage_number} : URL signée indisponible`); continue; }
          const metrics = await fetchAndComputeGpxMetrics(data.signedUrl);
          const hours = estimateGpxHours(metrics.distanceKm, metrics.elevationGainM);
          const durationStr = formatDuration(hours);

          const existing = [];
          if (stage.distance_km != null) existing.push(`distance (${stage.distance_km} km)`);
          if (stage.elevation_gain_m != null) existing.push(`D+ (${stage.elevation_gain_m} m)`);
          if (stage.elevation_loss_m != null) existing.push(`D− (${stage.elevation_loss_m} m)`);
          if (stage.duration) existing.push(`durée (${stage.duration})`);

          const msg = existing.length
            ? `Jour ${stage.stage_number} — valeurs existantes : ${existing.join(", ")}.\n\nNouvelles valeurs calculées :\n• Distance : ${metrics.distanceKm.toFixed(1)} km\n• D+ : ${metrics.elevationGainM != null ? Math.round(metrics.elevationGainM) + " m" : "N/A"}\n• D− : ${metrics.elevationLossM != null ? Math.round(metrics.elevationLossM) + " m" : "N/A"}\n• Durée : ${durationStr || "N/A"}\n\nÉcraser ?`
            : `Jour ${stage.stage_number} — aucune valeur existante.\n\nValeurs calculées :\n• Distance : ${metrics.distanceKm.toFixed(1)} km\n• D+ : ${metrics.elevationGainM != null ? Math.round(metrics.elevationGainM) + " m" : "N/A"}\n• D− : ${metrics.elevationLossM != null ? Math.round(metrics.elevationLossM) + " m" : "N/A"}\n• Durée : ${durationStr || "N/A"}\n\nAppliquer ?`;

          if (!window.confirm(msg)) continue;

          const update = {};
          if (metrics.distanceKm > 0) update.distance_km = Math.round(metrics.distanceKm * 100) / 100;
          if (metrics.elevationGainM != null) update.elevation_gain_m = Math.round(metrics.elevationGainM);
          if (metrics.elevationLossM != null) update.elevation_loss_m = Math.round(metrics.elevationLossM);
          if (durationStr) update.duration = durationStr;

          const { error: updateError } = await supabase.from("stages").update(update).eq("id", stage.id);
          if (updateError) { report.errors.push(`Jour ${stage.stage_number} : ${updateError.message}`); continue; }
          report.updated++;
        } catch (err) { report.errors.push(`Jour ${stage.stage_number} : ${err.message}`); }
      }

      let msg = `Analyse terminée : ${report.analyzed} analysée(s), ${report.updated} mise(s) à jour.`;
      if (report.errors.length) msg += `\nErreurs :\n${report.errors.map(e => `  • ${e}`).join("\n")}`;
      setAutomationResult(msg);
      const { data: refreshed } = await supabase.from("stages").select("*").eq("roadbook_id", Number(id)).order("stage_number", { ascending: true });
      if (refreshed) setStages(refreshed);
    } catch (err) { setAutomationResult(`Erreur : ${err.message}`); }
    finally { setAutomationBusy(null); }
  }

  async function handleAutoEnrich() {
    setAutomationBusy("enrich");
    setAutomationResult(null);
    const report = { poisFound: 0, poisUpdated: 0, accomsFound: 0, accomsUpdated: 0, errors: [] };
    try {
      if (!poiIndex && !accommodationIndex) {
        setAutomationResult("Aucune donnée d'enrichissement disponible pour ce roadbook.");
        setAutomationBusy(null); return;
      }

      const allPois = Object.values(poisByStage).flat();
      const enrichablePois = poiIndex ? allPois.filter(p => findPoi(p.name, poiIndex)) : [];
      const enrichableAccoms = accommodationIndex
        ? stages.filter(s => {
            if (!s.accommodation_name && !s.accommodation_url) return false;
            const byUrl = s.accommodation_url ? findAccommodation(s.accommodation_url, accommodationIndex) : null;
            if (byUrl) return true;
            return s.accommodation_name ? !!findAccommodationByName(s.accommodation_name, accommodationIndex) : false;
          })
        : [];

      if (!enrichablePois.length && !enrichableAccoms.length) {
        setAutomationResult("Aucun POI ou hébergement enrichissable trouvé.");
        setAutomationBusy(null); return;
      }

      const lines = [];
      if (enrichablePois.length) lines.push(`POI enrichissables : ${enrichablePois.length}`);
      if (enrichableAccoms.length) lines.push(`Hébergements enrichissables : ${enrichableAccoms.length}`);
      lines.push("\nLes champs déjà renseignés seront proposés avec confirmation individuelle.");
      if (!window.confirm(lines.join("\n") + "\n\nContinuer ?")) { setAutomationBusy(null); return; }

      for (const poi of enrichablePois) {
        try {
          report.poisFound++;
          const found = findPoi(poi.name, poiIndex);
          if (!found) continue;
          const existing = [];
          if (poi.description) existing.push("description");
          if (poi.lat != null) existing.push("coordonnées");
          if (poi.link_url) existing.push("lien");
          const promptLines = [`POI "${poi.name}"`];
          if (existing.length) promptLines.push(`Valeurs existantes : ${existing.join(", ")}`);
          promptLines.push(`\nNouvelles valeurs proposées :\n• Description : ${found.description || "N/A"}\n• Coordonnées : ${found.coordinates ? `${found.coordinates.lat}, ${found.coordinates.lng}` : "N/A"}\n• Image : ${found.image || "N/A"}\n• Lien : ${found.url || "N/A"}`);
          promptLines.push(`\n${existing.length ? "Écraser ?" : "Appliquer ?"}`);
          if (!window.confirm(promptLines.join("\n"))) continue;
          const update = {};
          if (found.description) update.description = found.description;
          if (found.coordinates) { update.lat = found.coordinates.lat; update.lng = found.coordinates.lng; }
          if (found.image) update.photo_url = found.image;
          if (found.url) update.link_url = found.url;
          if (!Object.keys(update).length) continue;
          const { error: upErr } = await supabase.from("stage_pois").update(update).eq("id", poi.id);
          if (upErr) { report.errors.push(`POI "${poi.name}" : ${upErr.message}`); continue; }
          report.poisUpdated++;
        } catch (err) { report.errors.push(`POI "${poi.name}" : ${err.message}`); }
      }

      for (const stage of enrichableAccoms) {
        try {
          report.accomsFound++;
          const url = stage.accommodation_url;
          const name = stage.accommodation_name;
          let found = url ? findAccommodation(url, accommodationIndex) : null;
          if (!found && name) found = findAccommodationByName(name, accommodationIndex);
          if (!found) continue;
          const existing = [];
          if (stage.accommodation_name) existing.push("nom");
          if (stage.accommodation_photo) existing.push("photo");
          const promptLines = [`Hébergement "${name || url}"`];
          if (existing.length) promptLines.push(`Valeurs existantes : ${existing.join(", ")}`);
          promptLines.push(`\nNouvelles valeurs proposées :\n• Nom : ${found.name || "N/A"}\n• Image : ${found.image || "N/A"}`);
          promptLines.push(`\n${existing.length ? "Écraser ?" : "Appliquer ?"}`);
          if (!window.confirm(promptLines.join("\n"))) continue;
          const update = {};
          if (found.name) update.accommodation_name = found.name;
          if (found.image) update.accommodation_photo = found.image;
          if (!Object.keys(update).length) continue;
          const { error: upAccErr } = await supabase.from("stages").update(update).eq("id", stage.id);
          if (upAccErr) { report.errors.push(`Hébergement "${name}" : ${upAccErr.message}`); continue; }
          report.accomsUpdated++;
        } catch (err) { report.errors.push(`Hébergement "${name}" : ${err.message}`); }
      }

      let msg = `Enrichissement terminé : ${report.poisUpdated}/${report.poisFound} POI, ${report.accomsUpdated}/${report.accomsFound} hébergements mis à jour.`;
      if (report.errors.length) msg += `\nErreurs :\n${report.errors.map(e => `  • ${e}`).join("\n")}`;
      setAutomationResult(msg);
      const stageIds = stages.map(s => s.id);
      if (stageIds.length) {
        supabase.from("stage_pois").select("*").in("stage_id", stageIds).order("sort_order", { ascending: true })
          .then(({ data: pois }) => {
            if (pois) { const m = {}; pois.forEach(p => { if (!m[p.stage_id]) m[p.stage_id] = []; m[p.stage_id].push(p); }); setPoisByStage(m); }
          });
        const { data: refreshed } = await supabase.from("stages").select("*").eq("roadbook_id", Number(id)).order("stage_number", { ascending: true });
        if (refreshed) setStages(refreshed);
      }
    } catch (err) { setAutomationResult(`Erreur : ${err.message}`); }
    finally { setAutomationBusy(null); }
  }

  async function handleGpxDelete(mediaRow) {
    if (!window.confirm("Supprimer ce GPX ?")) return;
    setUploadingGpx("delete");
    try {
      await supabase.storage.from(GPX_BUCKET).remove([mediaRow.path]);
      await supabase.from("media").delete().eq("id", mediaRow.id);
      await loadGpx();
    } catch (err) { setGpxError(err.message); }
    finally { setUploadingGpx(null); }
  }

  function renderGpxBlock(label, mediaRow, scope, role, stageId) {
    const isUploading = uploadingGpx === (role ?? stageId);
    const loadingLabel = uploadingGpx === "delete" ? "Suppression..." : isUploading ? "Upload..." : null;
    return (
      <div style={{ marginTop: "0.3rem" }}>
        <strong>{label} :</strong>
        {mediaRow ? (
          <span>
            {mediaRow.file_name}
            <button type="button" onClick={() => handleGpxDownload(mediaRow)} disabled={!!uploadingGpx}>Télécharger</button>
            <button type="button" onClick={() => handleGpxReplace(mediaRow, scope, role, stageId)} disabled={!!uploadingGpx}>Remplacer</button>
            <button type="button" onClick={() => handleGpxDelete(mediaRow)} disabled={!!uploadingGpx}>Supprimer</button>
          </span>
        ) : (
          <button type="button" onClick={() => scope === "stage" ? handleGpxUpload("stage", null, stageId) : handleGpxUpload("roadbook", role, null)} disabled={!!uploadingGpx}>
            {loadingLabel ?? `Upload ${label}`}
          </button>
        )}
      </div>
    );
  }

  // --- Cover image ---
  async function handleSetCoverFromMedia(mediaId) {
    const { error } = await supabase.from("roadbooks").update({ cover_media_id: mediaId, cover_image_url: null }).eq("id", id);
    if (error) { setUploadError(error.message); return; }
    setCoverMediaId(mediaId); setCoverUrl(""); setCoverMode("media"); setCoverPreview(null);
    supabase.from("media").select("bucket, path").eq("id", mediaId).maybeSingle()
      .then(({ data: m }) => {
        if (m) supabase.storage.from(m.bucket).createSignedUrl(m.path, 86400).then(({ data: s }) => setCoverPreview(s?.signedUrl ?? null));
      });
    setSuccess("Image de couverture mise à jour.");
  }

  async function handleSetCoverFromUrl(url) {
    const cleanUrl = url || null;
    const { error } = await supabase.from("roadbooks").update({ cover_image_url: cleanUrl, cover_media_id: null }).eq("id", id);
    if (error) { setUploadError(error.message); return; }
    setCoverUrl(url); setCoverMediaId(null); setCoverMode(cleanUrl ? "url" : null); setCoverPreview(cleanUrl);
    setSuccess(cleanUrl ? "Image de couverture mise à jour." : "Image de couverture retirée.");
  }

  async function handleRemoveCover() {
    const { error } = await supabase.from("roadbooks").update({ cover_image_url: null, cover_media_id: null }).eq("id", id);
    if (error) { setUploadError(error.message); return; }
    setCoverUrl(""); setCoverMediaId(null); setCoverMode(null); setCoverPreview(null);
    setSuccess("Image de couverture retirée.");
  }

  // --- Reorder stages ---
  async function handleMoveStage(stage, direction) {
    const sorted = [...stages].sort((a, b) => a.stage_number - b.stage_number);
    const idx = sorted.findIndex(s => s.id === stage.id);
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[target];
    const { error } = await supabase.rpc("swap_stage_numbers", { id_a: a.id, id_b: b.id });
    if (error) {
      // fallback: manual swap
      const tmp = a.stage_number;
      await supabase.from("stages").update({ stage_number: b.stage_number }).eq("id", a.id);
      await supabase.from("stages").update({ stage_number: tmp }).eq("id", b.id);
    }
    const { data } = await supabase.from("stages").select("*").eq("roadbook_id", Number(id)).order("stage_number", { ascending: true });
    if (data) setStages(data);
  }

  // --- Duplicate ---
  async function handleDuplicate() {
    if (!window.confirm("Dupliquer ce roadbook ? Les fichiers (images, GPX) ne seront pas copiés.")) return;
    setDuplicating(true);
    setError(null);
    try {
      const slug = `${roadbook.slug}-copie-${Date.now()}`;
      const { data: newRb, error: rbError } = await supabase.from("roadbooks").insert({
        slug, owner_id: user.id, title: `${roadbook.title} (copie)`, description: roadbook.description, is_public: false,
      }).select("id").single();
      if (rbError) { setError(rbError.message); return; }

      for (const stage of stages) {
        const { data: newStage, error: sError } = await supabase.from("stages").insert({
          roadbook_id: newRb.id, stage_number: stage.stage_number, title: stage.title,
          departure: stage.departure, arrival: stage.arrival, distance_km: stage.distance_km,
          elevation_gain_m: stage.elevation_gain_m, elevation_loss_m: stage.elevation_loss_m,
          gpx_url: null, map_embed_url: stage.map_embed_url,
          stage_photo_url: null, day: stage.day, stage_label: stage.stage_label,
          duration: stage.duration,
          accommodation_name: stage.accommodation_name, accommodation_url: stage.accommodation_url,
          accommodation_photo: null, accommodation_type: stage.accommodation_type,
          notes: stage.notes, alternatives: stage.alternatives,
          is_substep: stage.is_substep, parent_stage_number: stage.parent_stage_number,
          metadata: stage.metadata,
        }).select("id").single();
        if (sError) { setError(sError.message); return; }

        const stagePois = poisByStage[stage.id] ?? [];
        for (const poi of stagePois) {
          const { error: pError } = await supabase.from("stage_pois").insert({
            stage_id: newStage.id, name: poi.name, lat: poi.lat, lng: poi.lng,
            poi_type: poi.poi_type, description: poi.description, photo_url: null,
            link_url: poi.link_url, region: poi.region,
            sort_order: poi.sort_order, metadata: poi.metadata,
          });
          if (pError) { setError(pError.message); return; }
        }

        const stageVariants = variantsByStage[stage.id] ?? [];
        for (const v of stageVariants) {
          const { error: vError } = await supabase.from("stage_variants").insert({
            stage_id: newStage.id, label: v.label, distance_km: v.distance_km,
            gpx_url: null, description: v.description, sort_order: v.sort_order, metadata: v.metadata,
          });
          if (vError) { setError(vError.message); return; }
        }
      }

      setSuccess("Roadbook dupliqué ! Redirection...");
      setTimeout(() => router.push(`/dashboard/roadbooks/${newRb.id}`), 1000);
    } catch (err) { setError(err.message); }
    finally { setDuplicating(false); }
  }

  if (authLoading || loading) return <main className="page-dashboard"><p>Chargement du roadbook...</p></main>;
  if (!user) return null;
  if (fetchError && !roadbook) return <main className="page-dashboard"><h1>Erreur</h1><p className="page-error">{fetchError}</p><Link href="/dashboard/roadbooks">Retour à la liste</Link></main>;

  return (
    <main className="page-dashboard">
      {/* Hero header */}
      <div className="studio-hero">
        <div className="studio-hero__info">
          <h1 className="studio-hero__title">{roadbook?.title ?? "Roadbook"}</h1>
          <div className="studio-hero__meta">
            <span className={`studio-badge ${isPublic ? "studio-badge--public" : "studio-badge--private"}`}>
              {isPublic ? "Public" : "Privé"}
            </span>
            {activity && <span className="studio-hero__tag">{activity}</span>}
            {destination && <span className="studio-hero__tag">{destination}</span>}
            {project && <span className="studio-hero__tag">{project}</span>}
          </div>
        </div>
        <div className="studio-hero__actions">
          <Link href="/dashboard/roadbooks" className="terrain-button--secondary studio-action-button--compact">Retour</Link>
          <Link href={`/roadbooks/${roadbook?.slug}`} className="terrain-button--secondary studio-action-button--compact">Voir</Link>
          <button type="button" onClick={handleDuplicate} disabled={duplicating} className="terrain-button--secondary studio-action-button--compact">
            {duplicating ? "..." : "Dupliquer"}
          </button>
        </div>
      </div>

      {error && <p className="page-error">{error}</p>}
      {success && <p className="page-success">{success}</p>}

      <div className="studio-layout">
        {/* LEFT COLUMN — roadbook cards */}
        <div className="studio-panel">

          {/* CARD 1 — Informations générales */}
          <div className="studio-card studio-card--accent">
            <div className="studio-card__header">
              <h3>Informations générales</h3>
            </div>
            <div className="studio-card__body">
              <form onSubmit={handleSave} className="studio-form-grid studio-form-grid--compact">
                <label className="studio-form-grid__full">Titre<input type="text" value={title} onChange={e => setTitle(e.target.value)} required /></label>
                <label className="studio-form-grid__full">Description<textarea value={description} onChange={e => setDescription(e.target.value)} /></label>
                <label>Activité<input type="text" value={activity} onChange={e => setActivity(e.target.value)} placeholder="ex: vélo, randonnée" /></label>
                <label>Destination<input type="text" value={destination} onChange={e => setDestination(e.target.value)} placeholder="ex: Espagne, Alpes" /></label>
                <label>Projet<select value={project} onChange={e => setProject(e.target.value)}>
                  <option value="">—</option>
                  <option value="En projet">En projet</option>
                  <option value="Voyage réalisé">Voyage réalisé</option>
                  <option value="À faire">À faire</option>
                </select></label>
                <button type="submit" disabled={saving} className="terrain-button--secondary studio-action-button--compact" style={{ gridColumn: "1 / -1", width: "auto", justifySelf: "start" }}>
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </button>
              </form>
            </div>
          </div>

          {/* CARD 2 — Image de couverture + Visibilité */}
          <div className="studio-card">
            <div className="studio-card__header">
              <h3>Image de couverture</h3>
            </div>
            <div className="studio-card__body">
              <div className="cover-selector">
                {coverPreview
                  ? <img src={coverPreview} alt="Couverture" className="cover-preview" />
                  : <div className="cover-placeholder">Aucune image de couverture</div>}
                <label>URL externe :
                  <input type="url" value={coverUrl} onChange={e => setCoverUrl(e.target.value)} placeholder="https://..." />
                </label>
                <div className="studio-actions">
                  <button type="button" onClick={() => handleSetCoverFromUrl(coverUrl)} className="studio-action-button--compact">Définir</button>
                  <button type="button" className="terrain-button--danger studio-action-button--compact" onClick={handleRemoveCover}>Retirer</button>
                </div>
                {images.length > 0 && (
                  <div className="page-section">
                    <p className="text-muted">Ou depuis les images uploadées :</p>
                    <div className="studio-media-thumbs">
                      {images.map(img => (
                        <div key={img.id} className="studio-media-thumb" data-active={(coverMode === "media" && coverMediaId === img.id) || undefined} onClick={() => handleSetCoverFromMedia(img.id)}>
                          {img.signedUrl && <img src={img.signedUrl} alt={img.file_name ?? ""} />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="studio-stage-extra">
                <div className="studio-stage-extra__header">
                  <h5>Visibilité</h5>
                  <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={handleToggleVisibility}>
                    Passer en {isPublic ? "privé" : "public"}
                  </button>
                </div>
                <p className="text-muted">Actuellement : {isPublic ? "public" : "privé"}</p>
              </div>
            </div>
          </div>

          {/* CARD 3 — Itinéraire officiel */}
          <div className="studio-card">
            <div className="studio-card__header">
              <h3>Itinéraire officiel</h3>
            </div>
            <div className="studio-card__body">
              <form onSubmit={handleSaveRoute} className="studio-form-grid studio-form-grid--compact">
                <label>Distance (km)<input type="number" step="0.1" value={officialDist} onChange={e => setOfficialDist(e.target.value)} /></label>
                <label>D+ (m)<input type="number" value={officialGain} onChange={e => setOfficialGain(e.target.value)} /></label>
                <label>D− (m)<input type="number" value={officialLoss} onChange={e => setOfficialLoss(e.target.value)} /></label>
                <label className="studio-form-grid__full">GPX<input type="text" value={officialGpx} onChange={e => setOfficialGpx(e.target.value)} placeholder="URL du fichier GPX" /></label>
                <label className="studio-form-grid__full">Carte intégrée<input type="url" value={officialMap} onChange={e => setOfficialMap(e.target.value)} placeholder="https://www.google.com/maps/embed?..." /></label>
                <button type="submit" disabled={saving} className="terrain-button--secondary studio-action-button--compact" style={{ gridColumn: "1 / -1", width: "auto", justifySelf: "start" }}>
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </button>
              </form>
            </div>
          </div>

          {/* CARD 4 — Tracé actuel */}
          <div className="studio-card">
            <div className="studio-card__header">
              <h3>Tracé actuel</h3>
            </div>
            <div className="studio-card__body">
              <form onSubmit={handleSaveRoute} className="studio-form-grid studio-form-grid--compact">
                <label>Distance (km)<input type="number" step="0.1" value={traceDist} onChange={e => setTraceDist(e.target.value)} /></label>
                <label>D+ (m)<input type="number" value={traceGain} onChange={e => setTraceGain(e.target.value)} /></label>
                <label>D− (m)<input type="number" value={traceLoss} onChange={e => setTraceLoss(e.target.value)} /></label>
                <label className="studio-form-grid__full">GPX<input type="text" value={traceGpx} onChange={e => setTraceGpx(e.target.value)} placeholder="URL du fichier GPX" /></label>
                <label className="studio-form-grid__full">Carte intégrée<input type="url" value={traceMap} onChange={e => setTraceMap(e.target.value)} placeholder="https://www.google.com/maps/embed?..." /></label>
                <button type="submit" disabled={saving} className="terrain-button--secondary studio-action-button--compact" style={{ gridColumn: "1 / -1", width: "auto", justifySelf: "start" }}>
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </button>
              </form>
            </div>
          </div>

          {/* CARD 5 — Médias */}
          <div className="studio-card">
            <div className="studio-card__header">
              <h3>Médias</h3>
              <span className="studio-badge">{images.length}</span>
            </div>
            <div className="studio-card__body">
              {uploadError && <p className="page-error">{uploadError}</p>}
              <div className="studio-media-upload">
                <label className="terrain-button--secondary studio-action-button--compact" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center" }}>
                  {uploading ? "Upload..." : "Choisir une image"}
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleUploadImage} disabled={uploading} />
                </label>
              </div>
              {images.length === 0 && <p className="text-muted">Aucune image.</p>}
              <div className="studio-media-grid">
                {images.map(img => (
                  <div key={img.id} className="studio-media-item">
                    {img.signedUrl && <img src={img.signedUrl} alt={img.file_name ?? "image"} className="studio-media-item__image" />}
                    <div className="studio-media-item__info">
                      <span className="text-muted studio-media-item__name">{img.file_name}</span>
                      <button type="button" className="terrain-button--danger studio-action-button--compact" onClick={() => handleDeleteImage(img)} disabled={deletingImage === img.id}>
                        {deletingImage === img.id ? "..." : "Supprimer"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CARD 6 — GPX */}
          <div className="studio-card">
            <div className="studio-card__header">
              <h3>GPX</h3>
            </div>
            <div className="studio-card__body">
              {gpxError && <p className="page-error">{gpxError}</p>}
              {renderGpxBlock("GPX officiel", gpxOfficial, "roadbook", "official", null)}
              {renderGpxBlock("GPX personnalisé", gpxCustom, "roadbook", "custom", null)}
            </div>
          </div>

          {/* CARD 7 — Automatisations */}
          <div className="studio-card">
            <div className="studio-card__header">
              <h3>Automatisations</h3>
            </div>
            <div className="studio-card__body">
              {automationResult && <div className="studio-automation-result">{automationResult}</div>}
              <div className="studio-automation-actions">
                <button type="button" onClick={handleRecalculateTotals} disabled={!!automationBusy} className="terrain-button--secondary studio-action-button--compact">
                  {automationBusy === "totals" ? "Calcul..." : "Recalculer les totaux"}
                </button>
                <button type="button" onClick={handleAnalyzeStageGpx} disabled={!!automationBusy} className="terrain-button--secondary studio-action-button--compact">
                  {automationBusy === "gpx" ? "Analyse..." : "Analyser GPX"}
                </button>
                <button type="button" onClick={handleAutoEnrich} disabled={!!automationBusy} className="terrain-button--secondary studio-action-button--compact">
                  {automationBusy === "enrich" ? "..." : "Enrichir POI/hébergements"}
                </button>
              </div>
            </div>
          </div>

          {/* CARD 8 — Informations (discrète) */}
          <div className="studio-card studio-card--muted">
            <dl className="studio-info-grid">
              <dt>Slug</dt><dd><code>{roadbook?.slug}</code></dd>
              <dt>ID</dt><dd><code>{roadbook?.id}</code></dd>
              <dt>Créé le</dt><dd>{roadbook?.created_at ? new Date(roadbook.created_at).toLocaleDateString() : ""}</dd>
            </dl>
          </div>

        </div>

        {/* RIGHT COLUMN — Étapes */}
        <div className="studio-panel">
          <div className="studio-card">
            <div className="studio-card__header">
              <h2>Étapes ({stages.length})</h2>
            </div>
            <div className="studio-card__body">
              {enrichmentError && <p className="page-error">{enrichmentError}</p>}
              {stageSuccess && <p className="page-success">{stageSuccess}</p>}
              {stageError && <p className="page-error">{stageError}</p>}
              {poiIndex === null && accommodationIndex === null && stages.length > 0 && (
                <p className="text-muted" style={{ fontStyle: "italic" }}>Aucune donnée d'enrichissement.</p>
              )}

              {/* Bandeau + Nouvelle étape (si aucun formulaire ouvert) */}
              {!showStageForm && !editingStage ? (
                <button type="button" onClick={() => setShowStageForm(true)} className="studio-stage-create-bandeau">
                  + Nouvelle étape
                </button>
              ) : (
                <div className="studio-create-form">
                  <h3>{editingStage ? "Modifier l'étape" : "Nouvelle étape"}</h3>
                  <form onSubmit={handleStageSubmit}>
                    <div className="studio-form-grid studio-form-grid--compact">
                      <label>N° étape<input type="number" value={stageDayNumber} onChange={e => setStageDayNumber(e.target.value)} required /></label>
                      <label>Titre<input type="text" value={stageTitle} onChange={e => setStageTitle(e.target.value)} /></label>
                      <label>Départ<input type="text" value={stageStart} onChange={e => setStageStart(e.target.value)} /></label>
                      <label>Arrivée<input type="text" value={stageEnd} onChange={e => setStageEnd(e.target.value)} /></label>
                      <label>Distance (km)<input type="number" step="0.01" value={stageDist} onChange={e => setStageDist(e.target.value)} /></label>
                      <label>D+ (m)<input type="number" value={stageGain} onChange={e => setStageGain(e.target.value)} /></label>
                      <label>D- (m)<input type="number" value={stageLoss} onChange={e => setStageLoss(e.target.value)} /></label>
                      <label>Difficulté<input type="text" value={stageDifficulty} onChange={e => setStageDifficulty(e.target.value)} placeholder="ex: modéré" /></label>
                      <label>Hébergement<input type="text" value={stageAccommodation} onChange={e => setStageAccommodation(e.target.value)} /></label>
                      <label>Description<textarea value={stageDescription} onChange={e => setStageDescription(e.target.value)} /></label>
                      <label>Notes (une par ligne)<textarea value={stageNotes} onChange={e => setStageNotes(e.target.value)} placeholder="Note 1&#10;Note 2" /></label>
                      <label>Avertissement<input type="text" value={stageWarning} onChange={e => setStageWarning(e.target.value)} /></label>
                      <label>Jour<textarea value={stageDay} onChange={e => setStageDay(e.target.value)} placeholder="ex: Jour 1" /></label>
                      <label>Libellé étape<input type="text" value={stageLabel} onChange={e => setStageLabel(e.target.value)} placeholder="ex: De X à Y" /></label>
                      <label>Durée<input type="text" value={stageDuration} onChange={e => setStageDuration(e.target.value)} placeholder="ex: 4h30" /></label>
                      <label>Photo URL<input type="url" value={stagePhotoUrl} onChange={e => setStagePhotoUrl(e.target.value)} placeholder="https://..." /></label>
                      <label className="studio-form-grid__full">Carte intégrée (iframe)<input type="url" value={stageMapEmbed} onChange={e => setStageMapEmbed(e.target.value)} placeholder="https://www.google.com/maps/embed?..." /></label>
                    </div>
                    <div className="studio-create-form__actions">
                      <button type="submit">{editingStage ? "Mettre à jour" : "Créer l'étape"}</button>
                      <button type="button" className="terrain-button--secondary" onClick={() => { clearStageForm(); setShowStageForm(false); }}>Annuler</button>
                    </div>
                  </form>
                </div>
              )}

              {/* Liste des étapes */}
              {stages.length === 0 && <p className="studio-detail--empty">Aucune étape.</p>}
              <div className="studio-stage-list">
                {stages.map((stage, index) => {
                const meta = stage.metadata ?? {};
                const stagePois = poisByStage[stage.id] ?? [];
                const stageVariants = variantsByStage[stage.id] ?? [];
                const isFirst = index === 0;
                const isLast = index === stages.length - 1;
                const expanded = expandedStages[stage.id] ?? false;
                return (
                  <>
                  <div className="studio-stage-card" data-expanded={expanded ? "true" : "false"}>
                    <div className="studio-stage-card__header">
                      <div className="studio-stage-card__header-info" onClick={() => setExpandedStages(prev => ({ ...prev, [stage.id]: !prev[stage.id] }))}>
                        <p className="studio-stage-card__eyebrow">Étape</p>
                        <h3 className="studio-stage-card__title">{stage.title || `Étape ${stage.stage_number}`}</h3>
                        <p className="studio-stage-card__summary">
                          {[meta.description, stage.distance_km != null ? `${stage.distance_km} km` : null].filter(Boolean).join(" · ") || `Étape ${stage.stage_number}`}
                        </p>
                      </div>
                      <div className="studio-stage-card__actions">
                        <button type="button" className="terrain-button terrain-button--secondary studio-action-button--compact" onClick={() => { clearVariantForm(); setVariantForm({ ...variantForm, stage_id: stage.id }); }}>+ Variante</button>
                        <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={() => fillStageForm(stage)} title="Modifier">✎</button>
                        <button type="button" className="terrain-button--danger studio-action-button--compact" onClick={() => handleDeleteStage(stage.id)} disabled={deleting === stage.id}>Supprimer</button>
                        {!isFirst && <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={() => handleMoveStage(stage, "up")} disabled={deleting === stage.id} title="Monter">↑</button>}
                        {!isLast && <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={() => handleMoveStage(stage, "down")} disabled={deleting === stage.id} title="Descendre">↓</button>}
                      </div>
                    </div>
                    {expanded && <div className="studio-stage-card__body">

                    {/* ZONE 1 — Informations d'étape */}
                    <div className="studio-zone studio-zone--info">
                      <h4 className="studio-zone__title">Informations d'étape</h4>
                      <div className="studio-form-grid studio-form-grid--compact">
                        <label>Numéro d'étape<span className="studio-input--readonly">{stage.stage_number}</span></label>
                        <label>Jour<span className="studio-input--readonly">{stage.day || "—"}</span></label>
                        <label>Titre<span className="studio-input--readonly">{stage.title || "—"}</span></label>
                        <label>Départ<span className="studio-input--readonly">{stage.departure || "—"}</span></label>
                        <label>Arrivée<span className="studio-input--readonly">{stage.arrival || "—"}</span></label>
                        <label>Distance (km)<span className="studio-input--readonly">{stage.distance_km != null ? stage.distance_km : "—"}</span></label>
                        <label>D+ (m)<span className="studio-input--readonly">{stage.elevation_gain_m != null ? stage.elevation_gain_m : "—"}</span></label>
                        <label>D− (m)<span className="studio-input--readonly">{stage.elevation_loss_m != null ? stage.elevation_loss_m : "—"}</span></label>
                        <label>Photo de l'étape<span className="studio-input--readonly">{stage.stage_photo_url ? "✓" : "—"}</span></label>
                        <label>Type d'hébergement<span className="studio-input--readonly">{stage.accommodation_type || stage.accommodation_name || "—"}</span></label>
                        <label className="studio-form-grid__full">Description<span className="studio-input--readonly">{meta.description || "—"}</span></label>
                        <label>Libellé<span className="studio-input--readonly">{stage.stage_label || "—"}</span></label>
                        <label>Durée<span className="studio-input--readonly">{stage.duration || "—"}</span></label>
                        <label>Difficulté<span className="studio-input--readonly">{meta.difficulty || "—"}</span></label>
                        <label className="studio-form-grid__full">Avertissement<span className="studio-input--readonly">{meta.warning || "—"}</span></label>
                      </div>
                    </div>

                    {/* ZONE 2 — Tracé · Carte · Points d'intérêt */}
                    <div className="studio-zone studio-zone--trace">
                      <h4 className="studio-zone__title">Tracé · Carte · Points d'intérêt</h4>

                      <div className="studio-stage-extra">
                        <div className="studio-stage-extra__header">
                          <h5>GPX et carte</h5>
                        </div>
                        <div className="studio-form-grid studio-form-grid--compact">
                          <label className="studio-form-grid__full">Carte intégrée<span className="studio-input--readonly">{stage.map_embed_url || "—"}</span></label>
                        </div>
                      </div>

                      <div className="studio-stage-extra">
                        <h5>GPX d'étape</h5>
                        {renderGpxBlock("GPX", gpxByStage[stage.id] ?? null, "stage", null, stage.id)}
                        {gpxByStage[stage.id] && (
                          <div className="studio-gpx-actions">
                            <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={() => handleComputeFromGpx(gpxByStage[stage.id], stage)} disabled={computingGpx === stage.id}>
                              {computingGpx === stage.id ? "Calcul..." : "Lire"}
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="studio-stage-extra">
                        <div className="studio-stage-extra__header">
                          <h5>Points d'intérêt ({stagePois.length})</h5>
                          <button type="button" className="terrain-button terrain-button--secondary" onClick={() => setPoiForm({ ...poiForm, stage_id: stage.id })}>Ajouter un POI</button>
                        </div>
                        <div className="studio-sublist__list">
                          {stagePois.length === 0 && <p className="studio-detail--empty">Aucun POI.</p>}
                          {stagePois.map(poi => (
                            <article key={poi.id} className="studio-subitem-card">
                              <div className="studio-subitem-card__header">
                                <strong>{poi.poi_type && <span>[{poi.poi_type}] </span>}{poi.name}</strong>
                                <button type="button" className="terrain-button terrain-button--danger" onClick={() => handleDeletePoi(poi.id)}>Supprimer</button>
                              </div>
                              <div className="studio-form-grid studio-form-grid--compact">
                                {poi.description && <label className="studio-form-grid__full">Description<span>{poi.description}</span></label>}
                                {poi.link_url && <label>Lien<span>{poi.link_url}</span></label>}
                                {poi.image_url && <label className="studio-form-grid__full">Image<img src={poi.image_url} alt="" style={{ maxWidth: "100%", maxHeight: "160px", borderRadius: "4px", marginTop: "0.3rem" }} /></label>}
                                {poi.lat != null && poi.lng != null && <label className="studio-form-grid__full">Coordonnées<span>({poi.lat}, {poi.lng})</span></label>}
                              </div>
                              <div className="studio-actions" style={{ marginTop: "0.5rem" }}>
                                <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={() => {
                                  setPoiForm({ stage_id: stage.id, type: poi.poi_type ?? "", name: poi.name, description: poi.description ?? "", lat: poi.lat != null ? String(poi.lat) : "", lng: poi.lng != null ? String(poi.lng) : "", url: poi.link_url ?? "", editing: poi.id });
                                }}>✎</button>
                                {poiIndex && (
                                  <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={() => handleEnrichPoi(poi, stage.id)} disabled={enrichingPoi === poi.id}>
                                    {enrichingPoi === poi.id ? "..." : "Enrichir"}
                                  </button>
                                )}
                              </div>
                            </article>
                          ))}
                        </div>
                        {poiForm.stage_id === stage.id && (
                          <form onSubmit={handlePoiSubmit} className="studio-create-form" style={{ marginTop: "0.5rem" }}>
                            <h4>{poiForm.editing ? "Modifier le POI" : "Ajouter un POI"}</h4>
                            <div className="studio-form-grid studio-form-grid--compact">
                              <label>Nom<input type="text" value={poiForm.name} onChange={e => setPoiForm({ ...poiForm, name: e.target.value })} required /></label>
                              <label>Type<input type="text" value={poiForm.type} onChange={e => setPoiForm({ ...poiForm, type: e.target.value })} placeholder="ex: eau, vue" /></label>
                              <label className="studio-form-grid__full">Description<textarea value={poiForm.description} onChange={e => setPoiForm({ ...poiForm, description: e.target.value })} /></label>
                              <label>Latitude<input type="number" step="any" value={poiForm.lat} onChange={e => setPoiForm({ ...poiForm, lat: e.target.value })} /></label>
                              <label>Longitude<input type="number" step="any" value={poiForm.lng} onChange={e => setPoiForm({ ...poiForm, lng: e.target.value })} /></label>
                              <label className="studio-form-grid__full">URL<input type="url" value={poiForm.url} onChange={e => setPoiForm({ ...poiForm, url: e.target.value })} /></label>
                            </div>
                            <div className="studio-create-form__actions">
                              <button type="submit" className="terrain-button">Enregistrer</button>
                              <button type="button" className="terrain-button terrain-button--secondary" onClick={clearPoiForm}>Annuler</button>
                            </div>
                          </form>
                        )}
                      </div>
                    </div>

                    {/* ZONE 3 — Hébergement principal */}
                    <div className="studio-zone studio-zone--accommodation">
                      <h4 className="studio-zone__title">Hébergement principal</h4>
                      {stage.accommodation_name ? (
                        <div className="studio-form-grid studio-form-grid--compact">
                          <label>Nom<span className="studio-input--readonly">{stage.accommodation_name}</span></label>
                          <label>Lien<span className="studio-input--readonly">{stage.accommodation_url || "—"}</span></label>
                          <label className="studio-form-grid__full">
                            Photo
                            {stage.accommodation_photo
                              ? <img src={stage.accommodation_photo} alt="" style={{ maxWidth: "100%", maxHeight: "160px", borderRadius: "4px", marginTop: "0.3rem" }} />
                              : <span className="studio-input--readonly">—</span>}
                          </label>
                          <div className="studio-actions">
                            <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={() => {
                              clearAccommodationForm();
                              setAccommodationForm({ stage_id: stage.id, name: stage.accommodation_name, url: stage.accommodation_url ?? "", photo: stage.accommodation_photo ?? "", editing: true });
                            }}>✎</button>
                            <button type="button" className="terrain-button--danger studio-action-button--compact" onClick={() => handleClearAccommodation(stage.id)}>Vider</button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="studio-detail--empty">Aucun hébergement.</p>
                          <button type="button" className="terrain-button terrain-button--secondary" style={{ marginTop: "0.4rem" }} onClick={() => setAccommodationForm({ ...accommodationForm, stage_id: stage.id })}>Ajouter un hébergement</button>
                        </div>
                      )}
                      {accommodationForm.stage_id === stage.id && (
                        <form onSubmit={handleAccommodationSubmit} className="studio-create-form" style={{ marginTop: "0.5rem" }}>
                          <h4>{accommodationForm.editing ? "Modifier l'hébergement" : "Ajouter un hébergement"}</h4>
                          <div className="studio-form-grid studio-form-grid--compact">
                            <label>Nom<input type="text" value={accommodationForm.name} onChange={e => setAccommodationForm({ ...accommodationForm, name: e.target.value })} required /></label>
                            <label>URL<input type="url" value={accommodationForm.url} onChange={e => setAccommodationForm({ ...accommodationForm, url: e.target.value })} /></label>
                            <label className="studio-form-grid__full">Photo<input type="url" value={accommodationForm.photo} onChange={e => setAccommodationForm({ ...accommodationForm, photo: e.target.value })} placeholder="URL de l'image" /></label>
                          </div>
                          <div className="studio-create-form__actions">
                            <button type="submit" className="terrain-button">Enregistrer</button>
                            <button type="button" className="terrain-button terrain-button--secondary" onClick={clearAccommodationForm}>Annuler</button>
                          </div>
                        </form>
                      )}
                    </div>

                    {/* ZONE 4 — Hébergements alternatifs */}
                    <div className="studio-zone studio-zone--alternatives">
                      <h4 className="studio-zone__title">Hébergements alternatifs</h4>
                      <p className="studio-detail--empty">Aucun hébergement alternatif.</p>
                    </div>

                    {/* ZONE 5 — Notes */}
                    <div className="studio-zone studio-zone--notes">
                      <h4 className="studio-zone__title">Notes</h4>
                      <div className="studio-stage-extra">
                        <div className="studio-stage-extra__header">
                          <h5>Notes ({(Array.isArray(stage.notes) ? stage.notes.length : 0)})</h5>
                          <button type="button" className="terrain-button terrain-button--secondary" onClick={() => setNoteForm({ ...noteForm, stage_id: stage.id })}>Ajouter une note</button>
                        </div>
                        <div className="studio-sublist__list">
                          {Array.isArray(stage.notes) && stage.notes.length > 0 ? stage.notes.map((note, ni) => (
                            <article key={ni} className="studio-subitem-card">
                              <div className="studio-subitem-card__header">
                                <strong>Note {ni + 1}</strong>
                                <div style={{ display: "flex", gap: "0.3rem" }}>
                                  <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={() => setNoteForm({ stage_id: stage.id, text: note.text ?? "", editing: ni })}>✎</button>
                                  <button type="button" className="terrain-button terrain-button--danger" onClick={() => handleDeleteNote(stage.id, ni)}>Supprimer</button>
                                </div>
                              </div>
                              <div className="studio-form-grid studio-form-grid--compact" style={{ marginTop: "0.3rem" }}>
                                {(note.text ?? note) && <label className="studio-form-grid__full" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{(note.text ?? note)}</label>}
                                {note.photo && <label className="studio-form-grid__full" style={{ margin: 0 }}><img src={note.photo} alt="" style={{ maxWidth: "100%", maxHeight: "200px", borderRadius: "4px" }} /></label>}
                              </div>
                            </article>
                          )) : <p className="studio-detail--empty">Aucune note.</p>}
                        </div>
                        {noteForm.stage_id === stage.id && (
                          <form onSubmit={handleNoteSubmit} className="studio-create-form" style={{ marginTop: "0.5rem" }}>
                            <h4>{noteForm.editing != null ? "Modifier la note" : "Ajouter une note"}</h4>
                            <div className="studio-form-grid studio-form-grid--compact">
                              <label className="studio-form-grid__full">Texte<textarea value={noteForm.text} onChange={e => setNoteForm({ ...noteForm, text: e.target.value })} required /></label>
                            </div>
                            <div className="studio-create-form__actions">
                              <button type="submit" className="terrain-button">Enregistrer</button>
                              <button type="button" className="terrain-button terrain-button--secondary" onClick={clearNoteForm}>Annuler</button>
                            </div>
                          </form>
                        )}
                      </div>
                    </div>


                  </div>}</div>

                  {/* Variantes — cartes séparées V1 */}
                  {stageVariants.map(v => {
                  const vmeta = v.metadata ?? {};
                  return (
                    <article key={v.id} className="studio-variant-card" data-expanded="true">
                      <div className="studio-variant-card__header">
                        <div className="studio-variant-card__header-info">
                          <p className="studio-stage-card__eyebrow">Variante</p>
                          <h3 className="studio-variant-card__title">{v.label}</h3>
                          <p className="studio-stage-card__summary">
                            {[v.description, v.distance_km != null ? `${v.distance_km} km` : null].filter(Boolean).join(" · ") || `Variante`}
                          </p>
                        </div>
                        <div className="studio-stage-card__actions">
                          <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={() => {
                            setVariantForm({ stage_id: stage.id, title: v.label, type: vmeta.type ?? "", departure: v.departure ?? vmeta.departure ?? "", arrival: v.arrival ?? vmeta.arrival ?? "", description: v.description ?? "", distance_km: v.distance_km != null ? String(v.distance_km) : "", elevation_gain_m: (v.elevation_gain_m ?? vmeta.elevation_gain_m) != null ? String(v.elevation_gain_m ?? vmeta.elevation_gain_m) : "", elevation_loss_m: (v.elevation_loss_m ?? vmeta.elevation_loss_m) != null ? String(v.elevation_loss_m ?? vmeta.elevation_loss_m) : "", map_embed_url: v.map_embed_url ?? "", notes: Array.isArray(v.notes) && v.notes.length ? v.notes.map(n => n.text ?? n).join("\n") : "", editing: v.id });
                          }}>✎</button>
                          <button type="button" className="terrain-button--danger studio-action-button--compact" onClick={() => handleDeleteVariant(v.id)}>✕</button>
                        </div>
                      </div>
                    </article>
                  );
                  })}
                  {variantForm.stage_id === stage.id && (
                    <form onSubmit={handleVariantSubmit} className="studio-create-form" style={{ marginLeft: "1.5rem", marginBottom: "0.75rem" }}>
                      <h4>Variante</h4>
                      <div className="studio-form-grid studio-form-grid--compact">
                        <label>Titre<input type="text" value={variantForm.title} onChange={e => setVariantForm({ ...variantForm, title: e.target.value })} required /></label>
                        <label>Type<input type="text" value={variantForm.type} onChange={e => setVariantForm({ ...variantForm, type: e.target.value })} placeholder="ex: Variante, Option, Raccourci" /></label>
                        <label>Départ<input type="text" value={variantForm.departure} onChange={e => setVariantForm({ ...variantForm, departure: e.target.value })} /></label>
                        <label>Arrivée<input type="text" value={variantForm.arrival} onChange={e => setVariantForm({ ...variantForm, arrival: e.target.value })} /></label>
                        <label className="studio-form-grid__full">Description<textarea value={variantForm.description} onChange={e => setVariantForm({ ...variantForm, description: e.target.value })} /></label>
                        <label>Distance (km)<input type="number" step="0.01" value={variantForm.distance_km} onChange={e => setVariantForm({ ...variantForm, distance_km: e.target.value })} /></label>
                        <label>D+ (m)<input type="number" value={variantForm.elevation_gain_m} onChange={e => setVariantForm({ ...variantForm, elevation_gain_m: e.target.value })} /></label>
                        <label>D− (m)<input type="number" value={variantForm.elevation_loss_m} onChange={e => setVariantForm({ ...variantForm, elevation_loss_m: e.target.value })} /></label>
                        <label className="studio-form-grid__full">Carte intégrée<input type="url" value={variantForm.map_embed_url} onChange={e => setVariantForm({ ...variantForm, map_embed_url: e.target.value })} placeholder="https://mapy.com/..." /></label>
                        <label className="studio-form-grid__full">Notes (une par ligne)<textarea value={variantForm.notes} onChange={e => setVariantForm({ ...variantForm, notes: e.target.value })} placeholder="Note 1&#10;Note 2" /></label>
                      </div>
                      <div className="studio-create-form__actions">
                        <button type="submit" className="terrain-button">{variantForm.editing ? "Mettre à jour" : "Ajouter"}</button>
                        <button type="button" className="terrain-button terrain-button--secondary" onClick={clearVariantForm}>Annuler</button>
                      </div>
                    </form>
                  )}
                  </>
                );
              })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
