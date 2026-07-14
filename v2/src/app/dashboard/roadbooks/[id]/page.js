"use client";

import { useAuth } from "@/lib/auth-context";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useNotifications } from "@/hooks/studio/useNotifications";
import useStudioEditing from "@/hooks/studio/useStudioEditing";
import useStageDragDrop from "@/hooks/studio/useStageDragDrop";
import useLoadData from "@/hooks/studio/useLoadData";
import useSaveActions from "@/hooks/studio/useSaveActions";
import { useRoadbookData } from "@/hooks/studio/useRoadbookData";
import { useMediaManager } from "@/hooks/studio/useMediaManager";
import { useGpxManager } from "@/hooks/studio/useGpxManager";
import { useCoverManager } from "@/hooks/studio/useCoverManager";
import { useEnrichment } from "@/hooks/studio/useEnrichment";
import { useSaveWithLock } from "@/hooks/studio/useSaveWithLock";
import { useStageCrud } from "@/hooks/studio/useStageCrud";
import { useStudioDraft } from "@/hooks/useStudioDraft";
import DraftStatus from "@/components/DraftStatus";
import GeneralInfoForm from "@/components/studio/GeneralInfoForm";
import RouteForm from "@/components/studio/RouteForm";
import CoverSection from "@/components/studio/CoverSection";
import MediaSection from "@/components/studio/MediaSection";
import AutomationPanel from "@/components/studio/AutomationPanel";
import StageForm from "@/components/studio/StageForm";
import StageCard from "@/components/studio/StageCard";
import StudioHeader from "@/components/studio/StudioHeader";
import StudioInfoCard from "@/components/studio/StudioInfoCard";
import StudioCatalog from "@/components/studio/StudioCatalog";
import StudioShell from "@/components/studio/StudioShell";
import { downloadDraftExport } from "@/lib/studio-drafts";
import { duplicateRoadbook } from "@/lib/roadbooks/writers";

export default function RoadbookDetailPage() {
  const { user, loading: authLoading, supabase } = useAuth();
  const router = useRouter();
  const { id } = useParams();
  const { roadbook, setRoadbook, stages, setStages, poisByStage, setPoisByStage, variantsByStage, setVariantsByStage, loading, fetchError, setFetchError, loadAll, reloadStages, reloadPoisVariants } = useRoadbookData({ supabase, roadbookId: id, user, enabled: !authLoading && !!user && !!id });

  const [isPublic, setIsPublic] = useState(false);
  const [formData, setFormData] = useState({ title: "", description: "" });
  const title = formData.title;
  const description = formData.description;
  const setTitle = (v) => setFormData(p => (typeof v === "function" ? { ...p, title: v(p.title) } : { ...p, title: v }));
  const setDescription = (v) => setFormData(p => (typeof v === "function" ? { ...p, description: v(p.description) } : { ...p, description: v }));
  const { error, setError, success, setSuccess } = useNotifications();

  const [formMeta, setFormMeta] = useState({ activity: "", destination: "", project: "" });
  const activity = formMeta.activity, setActivity = (v) => setFormMeta(p => ({ ...p, activity: v }));
  const destination = formMeta.destination, setDestination = (v) => setFormMeta(p => ({ ...p, destination: v }));
  const project = formMeta.project, setProject = (v) => setFormMeta(p => ({ ...p, project: v }));

  const { stageForm, stageFormDispatch, stageError, stageSuccess, setStageError, setStageSuccess, editingStage, deleting, clearStageForm, fillStageForm, handleStageSubmit, handleDeleteStage, poiForm, setPoiForm, clearPoiForm, handlePoiSubmit, handleDeletePoi, variantForm, setVariantForm, clearVariantForm, handleVariantSubmit, handleDeleteVariant, noteForm, setNoteForm, clearNoteForm, handleNoteSubmit, handleDeleteNote, accommodationForm, setAccommodationForm, clearAccommodationForm, handleAccommodationSubmit, handleClearAccommodation, handleMoveStage } = useStageCrud({ supabase, roadbookId: id, stages, setStages, reloadPoisVariants, reloadStages });

  const { draggingStageId, dragOverStageId, handleDragStart, handleDragOver, handleDragEnd, handleDrop } = useStageDragDrop({ stages, handleMoveStage });

  const { images, setImages, uploadLoading, deleteLoading, uploadError, reloadMedia, uploadMedia, removeMedia } = useMediaManager({ supabase, roadbookId: id, userId: user?.id });

  const { gpxOfficial, setGpxOfficial, gpxCustom, setGpxCustom, gpxByStage, setGpxByStage, gpxByVariant, setGpxByVariant, gpxUploading, metricsLoading, gpxError, setGpxError, reloadGpx, uploadGpx: uploadGpxFile, replaceGpx, deleteGpx, downloadGpx, computeStageMetrics, applyStageMetrics, analyzeStageGpx } = useGpxManager({ supabase, roadbookId: id, userId: user?.id, reloadStages });

  const { coverUrl, setCoverUrl, coverMediaId, setCoverMediaId, coverPreview, setCoverPreview, coverMode, setCoverMode, setCoverFromMedia, setCoverFromUrl, removeCover } = useCoverManager({ supabase, roadbookId: id, roadbook, setRoadbook, onError: setError, onSuccess: setSuccess });

  const { poiIndex, accommodationIndex, enrichmentError, enrichingPoi, automationBusy, automationResult, loadEnrichmentIndices, enrichPoi, handleRecalculateTotals, handleAnalyzeStageGpx, handleAutoEnrich } = useEnrichment({ supabase, roadbook, setRoadbook, stages, setStages, poisByStage, setPoisByStage, onSuccess: setStageSuccess, onError: setError, reloadPoisVariants, reloadStages, gpxHelpers: { gpxByStage, analyzeStageGpx, applyStageMetrics } });

  const { expandedStages, setExpandedStages, showStageForm, setShowStageForm, duplicating, setDuplicating, isStageExpanded, toggleStage } = useStudioEditing();

  const { officialRoute, setOfficialRoute, traceRoute, setTraceRoute, restoreDraft } = useLoadData({ user, id, supabase, loadAll, setTitle, setDescription, setIsPublic, setActivity, setDestination, setProject, setCoverUrl, setCoverMediaId, setCoverPreview, setCoverMode, setFetchError, loadEnrichmentIndices, reloadMedia, reloadGpx, setRoadbook, setStages, setPoisByStage, setVariantsByStage, setImages, setGpxOfficial, setGpxCustom, setGpxByStage, setGpxByVariant });

  const { draftStatus, draftError, restoredInfo, restoredDraft, saveImmediate, markSynced, markRemoteConflict, dismissConflict, clearDraft, resetRestoredInfo, tabId } = useStudioDraft({ user, roadbookId: id, roadbook, stages, poisByStage, variantsByStage, images, gpxOfficial, gpxCustom, gpxByStage, gpxByVariant, title, description, isPublic, activity, destination, project, ...officialRoute, ...traceRoute, coverMode, coverUrl, coverMediaId, loaded: !loading && !!roadbook });

  useEffect(() => { restoreDraft(restoredDraft); }, [restoredDraft]);

  const { saveWithLock, saving } = useSaveWithLock({ supabase, id, tabId, roadbook, stages, poisByStage, variantsByStage, setRoadbook, onError: setError, onSuccess: setSuccess, markRemoteConflict, markSynced, saveImmediate });

  useEffect(() => { if (!authLoading && !user) router.replace("/login"); }, [user, authLoading]);

  const { handleSave, handleSaveRoute, handleToggleVisibility } = useSaveActions({ supabase, id, roadbook, setRoadbook, title, description, activity, destination, project, isPublic, setIsPublic, officialRoute, traceRoute, setError, setSuccess, markRemoteConflict, saveWithLock });

  const stageCrud = { stageForm, stageFormDispatch, stageError, stageSuccess, editingStage, deleting, clearStageForm, fillStageForm, handleStageSubmit, handleDeleteStage, setShowStageForm, poiForm, setPoiForm, clearPoiForm, handlePoiSubmit, handleDeletePoi, variantForm, setVariantForm, clearVariantForm, handleVariantSubmit, handleDeleteVariant, noteForm, setNoteForm, clearNoteForm, handleNoteSubmit, handleDeleteNote, accommodationForm, setAccommodationForm, clearAccommodationForm, handleAccommodationSubmit, handleClearAccommodation };
  const gpx = { gpxByStage, gpxByVariant, gpxUploading, metricsLoading, handleGpxDelete: (row) => { if (!window.confirm("Supprimer ce GPX ?")) return; deleteGpx(row); }, handleComputeFromGpx: async (mediaRow, stage) => { if (!mediaRow || !stage) return; setStageError(null); const result = await computeStageMetrics(mediaRow, stage); if (!result) return; const { metrics, durationStr, anyExisting } = result; if (anyExisting) { const mp = []; if (stage.distance_km != null) mp.push(`distance (${stage.distance_km} km)`); if (stage.elevation_gain_m != null) mp.push(`D+ (${stage.elevation_gain_m} m)`); if (stage.elevation_loss_m != null) mp.push(`D− (${stage.elevation_loss_m} m)`); if (stage.duration) mp.push(`durée (${stage.duration})`); if (!window.confirm(`Cette étape a déjà des valeurs de ${mp.join(", ")}.\n\nNouvelles valeurs calculées :\n• Distance : ${metrics.distanceKm.toFixed(1)} km\n• D+ : ${metrics.elevationGainM != null ? Math.round(metrics.elevationGainM) + " m" : "N/A"}\n• D− : ${metrics.elevationLossM != null ? Math.round(metrics.elevationLossM) + " m" : "N/A"}\n• Durée : ${durationStr || "N/A"}\n\nÉcraser les valeurs existantes ?`)) return; } const ok = await applyStageMetrics(metrics, durationStr, stage); if (ok) setStageSuccess(`Étape mise à jour depuis le GPX : ${metrics.distanceKm.toFixed(1)} km${metrics.elevationGainM != null ? `, D+ ${Math.round(metrics.elevationGainM)} m` : ""}${metrics.elevationLossM != null ? `, D− ${Math.round(metrics.elevationLossM)} m` : ""}${durationStr ? `, ${durationStr}` : ""}`); }, handleGpxDownload: (row) => downloadGpx(row), handleGpxReplace: (row, scope, role, stageId, variantId) => { const input = document.createElement("input"); input.type = "file"; input.accept = ".gpx"; input.onchange = async () => { const file = input.files?.[0]; if (!file) return; await replaceGpx(file, row, { scope, role, stageId, variantId }); }; input.click(); }, handleGpxUpload: (scope, role, stageId, variantId) => { const input = document.createElement("input"); input.type = "file"; input.accept = ".gpx"; input.onchange = async () => { const file = input.files?.[0]; if (!file) return; await uploadGpxFile(file, { scope, role, stageId, variantId }); }; input.click(); } };
  const enrich = { poiIndex, handleEnrichPoi: enrichPoi, enrichingPoi };

  if (authLoading || loading) return <StudioShell><StudioCatalog selectedId={id} /><section className="card studio-panel"><p>Chargement du roadbook...</p></section></StudioShell>;
  if (!user) return null;
  if (fetchError && !roadbook) return <StudioShell><StudioCatalog selectedId={id} /><section className="card studio-panel"><h2>Erreur</h2><p className="page-error">{fetchError}</p><Link href="/dashboard/roadbooks">Retour à la liste</Link></section></StudioShell>;

  return (
    <StudioShell>
      <StudioCatalog selectedId={id} />
      <section className="card studio-panel studio-editor-panel" aria-labelledby="studio-detail-title">
      <DraftStatus status={draftStatus} error={draftError} restoredInfo={restoredInfo} onResetInfo={resetRestoredInfo} onDismissConflict={dismissConflict} onClearDraft={clearDraft} />
      <StudioHeader roadbook={roadbook} isPublic={isPublic} activity={activity} destination={destination} project={project} duplicating={duplicating} onAddStage={() => { clearStageForm(); setShowStageForm(true); }} onToggleVisibility={handleToggleVisibility} handleDuplicate={async () => { if (!window.confirm("Dupliquer ce roadbook ? Les fichiers (images, GPX) ne seront pas copiés.")) return; setDuplicating(true); setError(null); try { const newId = await duplicateRoadbook(supabase, roadbook, stages, poisByStage, variantsByStage, `${roadbook.slug}-copie-${Date.now()}`, user.id); setSuccess("Roadbook dupliqué ! Redirection..."); setTimeout(() => router.push(`/dashboard/roadbooks/${newId}`), 1000); } catch (err) { setError(err.message); } finally { setDuplicating(false); } }} downloadDraftExport={downloadDraftExport} user={user} id={id} />
      {error && <p className="page-error">{error}</p>}
      {success && <p className="page-success">{success}</p>}
          <details className="studio-general-info" open>
            <summary className="studio-general-info__header"><span className="studio-general-info__title" role="heading" aria-level="3">Informations générales</span></summary>
            <div className="studio-general-info__body">
              <GeneralInfoForm embedded title={title} setTitle={setTitle} description={description} setDescription={setDescription} activity={activity} setActivity={setActivity} destination={destination} setDestination={setDestination} project={project} setProject={setProject} handleSave={handleSave} saving={saving} />
              <CoverSection embedded coverUrl={coverUrl} setCoverUrl={setCoverUrl} coverPreview={coverPreview} images={images} coverMode={coverMode} coverMediaId={coverMediaId} handleSetCoverFromUrl={setCoverFromUrl} handleRemoveCover={() => removeCover()} handleSetCoverFromMedia={(mediaId) => setCoverFromMedia(mediaId)} handleUploadCover={async (event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; const media = await uploadMedia(file); if (media?.id) await setCoverFromMedia(media.id); }} uploadLoading={uploadLoading} handleToggleVisibility={handleToggleVisibility} isPublic={isPublic} />
              <RouteForm embedded mode="official" values={{ dist: officialRoute.officialDist, gain: officialRoute.officialGain, loss: officialRoute.officialLoss, gpx: officialRoute.officialGpx, map: officialRoute.officialMap }} setValues={fn => setOfficialRoute(previous => { const next = fn({ dist: previous.officialDist, gain: previous.officialGain, loss: previous.officialLoss, gpx: previous.officialGpx, map: previous.officialMap }); return { officialDist: next.dist, officialGain: next.gain, officialLoss: next.loss, officialGpx: next.gpx, officialMap: next.map }; })} handleSave={handleSaveRoute} saving={saving} mediaRow={gpxOfficial} gpxUploading={gpxUploading} handleGpxDownload={gpx.handleGpxDownload} handleGpxReplace={gpx.handleGpxReplace} handleGpxDelete={gpx.handleGpxDelete} handleGpxUpload={gpx.handleGpxUpload} />
              <RouteForm embedded mode="trace" values={{ dist: traceRoute.traceDist, gain: traceRoute.traceGain, loss: traceRoute.traceLoss, gpx: traceRoute.traceGpx, map: traceRoute.traceMap }} setValues={fn => setTraceRoute(previous => { const next = fn({ dist: previous.traceDist, gain: previous.traceGain, loss: previous.traceLoss, gpx: previous.traceGpx, map: previous.traceMap }); return { traceDist: next.dist, traceGain: next.gain, traceLoss: next.loss, traceGpx: next.gpx, traceMap: next.map }; })} handleSave={handleSaveRoute} saving={saving} mediaRow={gpxCustom} gpxUploading={gpxUploading} handleGpxDownload={gpx.handleGpxDownload} handleGpxReplace={gpx.handleGpxReplace} handleGpxDelete={gpx.handleGpxDelete} handleGpxUpload={gpx.handleGpxUpload} />
            </div>
          </details>
          <MediaSection images={images} uploadLoading={uploadLoading} uploadError={uploadError} handleUploadImage={(e) => { const f = e.target.files?.[0]; if (!f) return; uploadMedia(f); e.target.value = ""; }} handleDeleteImage={(row) => { if (!window.confirm("Supprimer cette image ?")) return; removeMedia(row); }} deleteLoading={deleteLoading} />
          {gpxError && <p className="page-error">{gpxError}</p>}
          <AutomationPanel automationResult={automationResult} automationBusy={automationBusy} handleRecalculateTotals={handleRecalculateTotals} handleAnalyzeStageGpx={handleAnalyzeStageGpx} handleAutoEnrich={handleAutoEnrich} />
          <StudioInfoCard roadbook={roadbook} />
          <div className="studio-card">
            <div className="studio-card__header">
              <h2>Étapes ({stages.length})</h2>
            </div>
            <div className="studio-card__body">
              {enrichmentError && <p className="page-error">{enrichmentError}</p>}
              {stageSuccess && <p className="page-success">{stageSuccess}</p>}
              {stageError && <p className="page-error">{stageError}</p>}
              {poiIndex === null && accommodationIndex === null && stages.length > 0 && <p className="text-muted" style={{ fontStyle: "italic" }}>Aucune donnée d'enrichissement.</p>}
              <StageForm showStageForm={showStageForm} setShowStageForm={setShowStageForm} stageForm={stageForm} stageFormDispatch={stageFormDispatch} editingStage={editingStage} clearStageForm={clearStageForm} handleStageSubmit={handleStageSubmit} stagePhotoMedia={editingStage ? images.find(image => image.stage_id === editingStage.id) ?? null : null} uploadLoading={uploadLoading} handleUploadStagePhoto={async (event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file || !editingStage) return; await uploadMedia(file, { stageId: editingStage.id }); }} />
              {stages.length === 0 && <p className="studio-detail--empty">Aucune étape.</p>}
              <div className="studio-stage-list">
                {stages.map((stage, index) => {
                const stagePois = poisByStage[stage.id] ?? [];
                const stageVariants = variantsByStage[stage.id] ?? [];
                return <StageCard key={stage.id} stage={stage} index={index} expanded={isStageExpanded(stage.id)} onToggleExpand={() => toggleStage(stage.id)} stageCrud={stageCrud} gpx={gpx} enrich={enrich} stagePois={stagePois} stageVariants={stageVariants} dragHandlers={{ handleDragStart, handleDragOver, handleDragEnd, handleDrop }} draggingStageId={draggingStageId} dragOverStageId={dragOverStageId} stagePhotoMedia={images.find(image => image.stage_id === stage.id) ?? null} />;
              })}
              </div>
            </div>
          </div>
      </section>
    </StudioShell>
  );
}
