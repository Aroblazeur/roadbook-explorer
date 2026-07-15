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
import { useRoadbookAccess } from "@/hooks/studio/useRoadbookAccess";
import { useStudioDraft } from "@/hooks/useStudioDraft";
import DraftStatus from "@/components/DraftStatus";
import GeneralInfoForm from "@/components/studio/GeneralInfoForm";
import RouteForm from "@/components/studio/RouteForm";
import CoverSection from "@/components/studio/CoverSection";
import StageForm from "@/components/studio/StageForm";
import StageCard from "@/components/studio/StageCard";
import StudioHeader from "@/components/studio/StudioHeader";
import StudioInfoCard from "@/components/studio/StudioInfoCard";
import StudioCatalog from "@/components/studio/StudioCatalog";
import StudioShell from "@/components/studio/StudioShell";
import ContributorsSection from "@/components/studio/ContributorsSection";
import StartPointSection from "@/components/studio/StartPointSection";
import useStartPoint from "@/hooks/studio/useStartPoint";
import { duplicateRoadbook } from "@/lib/roadbooks/writers";

export default function RoadbookDetailPage() {
  const { user, loading: authLoading, supabase } = useAuth();
  const router = useRouter();
  const { id } = useParams();
  const { roadbook, setRoadbook, stages, setStages, poisByStage, setPoisByStage, poisByVariant, setPoisByVariant, variantsByStage, setVariantsByStage, loading, fetchError, setFetchError, loadAll, reloadStages, reloadPoisVariants, refreshRoadbookVersion } = useRoadbookData({ supabase, roadbookId: id, user, enabled: !authLoading && !!user && !!id });

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

  const { stageForm, stageFormDispatch, stageError, stageSuccess, setStageError, setStageSuccess, deleting, clearStageForm, handleStageSubmit, handleDeleteStage, poiForm, setPoiForm, clearPoiForm, handlePoiSubmit, handleDeletePoi, variantForm, setVariantForm, clearVariantForm, handleVariantSubmit, handleDeleteVariant, noteForm, setNoteForm, clearNoteForm, handleNoteSubmit, handleDeleteNote, handleMoveStage } = useStageCrud({ supabase, roadbookId: id, stages, setStages, variantsByStage, reloadPoisVariants });

  const { draggingStageId, dragOverStageId, handleDragStart, handleDragOver, handleDragEnd, handleDrop } = useStageDragDrop({ stages, handleMoveStage });

  const { images, setImages, uploadLoading, reloadMedia, uploadMedia } = useMediaManager({ supabase, roadbookId: id, userId: user?.id, onError: setError, onSuccess: setSuccess, onMutation: refreshRoadbookVersion });

  const { gpxOfficial, setGpxOfficial, gpxCustom, setGpxCustom, gpxByStage, setGpxByStage, gpxByVariant, setGpxByVariant, gpxUploading, gpxError, setGpxError, reloadGpx, uploadGpx: uploadGpxFile, replaceGpx, deleteGpx, downloadGpx, analyzeStageGpx } = useGpxManager({ supabase, roadbookId: id, userId: user?.id, activity, reloadStages, onMutation: refreshRoadbookVersion });

  const { coverUrl, setCoverUrl, coverMediaId, setCoverMediaId, coverPreview, setCoverPreview, coverMode, setCoverMode } = useCoverManager({ supabase, roadbookId: id, roadbook, setRoadbook, onError: setError, onSuccess: setSuccess });
  const { startPoint, setStartPoint, startPointLoading, prepareStartPointForSave, persistStartPoint } = useStartPoint({ supabase, roadbookId: id, user });

  const { loadEnrichmentIndices, prepareAutomaticCompletion } = useEnrichment({ roadbook, activity, stages, variantsByStage, poisByStage, poisByVariant, gpxHelpers: { gpxByStage, gpxByVariant, analyzeStageGpx } });

  const { expandedStages, setExpandedStages, showStageForm, setShowStageForm, duplicating, setDuplicating, isStageExpanded, toggleStage } = useStudioEditing();

  const { officialRoute, setOfficialRoute, traceRoute, setTraceRoute, restoreDraft } = useLoadData({ user, id, supabase, loadAll, setTitle, setDescription, setIsPublic, setActivity, setDestination, setProject, setCoverUrl, setCoverMediaId, setCoverPreview, setCoverMode, setFetchError, loadEnrichmentIndices, reloadMedia, reloadGpx, setRoadbook, setStages, setPoisByStage, setVariantsByStage, setImages, setGpxOfficial, setGpxCustom, setGpxByStage, setGpxByVariant, setStartPoint });

  const { draftStatus, draftError, restoredInfo, restoredDraft, finishDraftRestore, saveImmediate, markSynced, markRemoteConflict, dismissConflict, clearDraft, resetRestoredInfo, tabId } = useStudioDraft({ user, roadbookId: id, roadbook, stages, poisByStage, variantsByStage, images, gpxOfficial, gpxCustom, gpxByStage, gpxByVariant, title, description, isPublic, activity, destination, project, ...officialRoute, ...traceRoute, coverMode, coverUrl, coverMediaId, startPoint, loaded: !loading && !startPointLoading && !!roadbook });

  useEffect(() => {
    if (!restoredDraft) return;
    restoreDraft(restoredDraft);
    finishDraftRestore();
  }, [restoredDraft, finishDraftRestore]);

  const { saveWithLock, saving } = useSaveWithLock({ supabase, id, tabId, roadbook, stages, poisByStage, variantsByStage, setRoadbook, onError: setError, onSuccess: setSuccess, markRemoteConflict, markSynced, saveImmediate });

  useEffect(() => { if (!authLoading && !user) router.replace("/login"); }, [user, authLoading]);
  const editorAccess = useRoadbookAccess({ user, roadbook, supabase, roadbookId: id });

  const { handleSaveAll, handleToggleVisibility, handleDeleteRoadbook, deletingRoadbook } = useSaveActions({ supabase, id, roadbook, setRoadbook, title, description, activity, destination, project, isPublic, setIsPublic, officialRoute, traceRoute, setTraceRoute, coverMode, coverUrl, coverMediaId, stages, setStages, poisByStage, setPoisByStage, poisByVariant, setPoisByVariant, variantsByStage, setVariantsByStage, prepareAutomaticCompletion, prepareStartPointForSave, persistStartPoint, setStartPoint, setError, setSuccess, markRemoteConflict, saveWithLock, clearDraft, onDeleted: () => router.replace("/dashboard/roadbooks") });

  const stageCrud = { stageForm, stageFormDispatch, stageError, stageSuccess, deleting, clearStageForm, handleStageSubmit, handleDeleteStage, poiForm, setPoiForm, clearPoiForm, handlePoiSubmit, handleDeletePoi, variantForm, setVariantForm, clearVariantForm, handleVariantSubmit, handleDeleteVariant, noteForm, setNoteForm, clearNoteForm, handleNoteSubmit, handleDeleteNote };
  const gpx = { gpxByStage, gpxByVariant, gpxUploading, handleGpxDelete: (row) => { if (!window.confirm("Supprimer ce GPX ?")) return; deleteGpx(row); }, handleGpxDownload: (row) => downloadGpx(row), handleGpxReplace: (file, row, scope, role, stageId, variantId) => replaceGpx(file, row, { scope, role, stageId, variantId }), handleGpxUpload: (file, scope, role, stageId, variantId) => uploadGpxFile(file, { scope, role, stageId, variantId }) };

  if (authLoading || loading || startPointLoading || (roadbook && editorAccess == null)) return <StudioShell><StudioCatalog selectedId={id} /><section className="card studio-panel"><p>Chargement du roadbook...</p></section></StudioShell>;
  if (!user) return null;
  if (fetchError && !roadbook) return <StudioShell><StudioCatalog selectedId={id} /><section className="card studio-panel"><h2>Erreur</h2><p className="page-error">{fetchError}</p><Link href="/dashboard/roadbooks">Retour à la liste</Link></section></StudioShell>;
  if (editorAccess === false) return null;

  const canManage = roadbook.owner_id === user.id || user.app_metadata?.role === "admin";

  return (
    <StudioShell>
      <StudioCatalog selectedId={id} />
      <section className="card studio-panel studio-editor-panel" aria-labelledby="studio-detail-title">
      <DraftStatus status={draftStatus} error={draftError} restoredInfo={restoredInfo} onResetInfo={resetRestoredInfo} onDismissConflict={dismissConflict} onClearDraft={clearDraft} />
      <StudioHeader roadbook={roadbook} isPublic={isPublic} activity={activity} destination={destination} project={project} duplicating={duplicating} saving={saving} deletingRoadbook={deletingRoadbook} canManage={canManage} onSaveAll={handleSaveAll} onDeleteRoadbook={handleDeleteRoadbook} onAddStage={() => { clearStageForm(); setShowStageForm(true); }} onToggleVisibility={handleToggleVisibility} handleDuplicate={async () => { if (!window.confirm("Dupliquer ce roadbook ? Les fichiers (images, GPX) ne seront pas copiés.")) return; setDuplicating(true); setError(null); try { const newId = await duplicateRoadbook(supabase, roadbook, stages, poisByStage, variantsByStage, `${roadbook.slug}-copie-${Date.now()}`, user.id, poisByVariant, startPoint); setSuccess("Roadbook dupliqué ! Redirection..."); setTimeout(() => router.push(`/dashboard/roadbooks/${newId}`), 1000); } catch (err) { setError(err.message); } finally { setDuplicating(false); } }} />
      {error && <p className="page-error">{error}</p>}
      {success && <p className="page-success">{success}</p>}
          <details className="studio-general-info" open>
            <summary className="studio-general-info__header"><span className="studio-general-info__title" role="heading" aria-level="3">Informations générales</span></summary>
            <div className="studio-general-info__body">
              <GeneralInfoForm embedded title={title} setTitle={setTitle} description={description} setDescription={setDescription} activity={activity} setActivity={setActivity} destination={destination} setDestination={setDestination} project={project} setProject={setProject} />
              <CoverSection embedded coverUrl={coverUrl} setCoverUrl={setCoverUrl} coverPreview={coverPreview} images={images} coverMode={coverMode} coverMediaId={coverMediaId} onSelectCoverUrl={(url) => { setCoverMode(url ? "url" : null); setCoverMediaId(null); setCoverPreview(url || null); }} onRemoveCover={() => { setCoverUrl(""); setCoverMediaId(null); setCoverMode(null); setCoverPreview(null); }} onSelectCoverMedia={(media) => { setCoverUrl(""); setCoverMediaId(media.id); setCoverMode("media"); setCoverPreview(media.signedUrl ?? null); }} handleUploadCover={async (event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; const media = await uploadMedia(file); if (media?.id) { setCoverUrl(""); setCoverMediaId(media.id); setCoverMode("media"); setCoverPreview(media.signedUrl ?? null); } }} uploadLoading={uploadLoading} />
              <ContributorsSection supabase={supabase} roadbookId={id} creatorEmail={roadbook.creator_email} canManage={canManage} />
              <RouteForm embedded mode="official" values={{ dist: officialRoute.officialDist, gain: officialRoute.officialGain, loss: officialRoute.officialLoss, gpx: officialRoute.officialGpx, map: officialRoute.officialMap }} setValues={fn => setOfficialRoute(previous => { const next = fn({ dist: previous.officialDist, gain: previous.officialGain, loss: previous.officialLoss, gpx: previous.officialGpx, map: previous.officialMap }); return { officialDist: next.dist, officialGain: next.gain, officialLoss: next.loss, officialGpx: next.gpx, officialMap: next.map }; })} mediaRow={gpxOfficial} gpxUploading={gpxUploading} handleGpxDownload={gpx.handleGpxDownload} handleGpxReplace={gpx.handleGpxReplace} handleGpxDelete={gpx.handleGpxDelete} handleGpxUpload={gpx.handleGpxUpload} />
              <RouteForm embedded mode="trace" values={{ dist: traceRoute.traceDist, gain: traceRoute.traceGain, loss: traceRoute.traceLoss, gpx: traceRoute.traceGpx, map: traceRoute.traceMap }} setValues={fn => setTraceRoute(previous => { const next = fn({ dist: previous.traceDist, gain: previous.traceGain, loss: previous.traceLoss, gpx: previous.traceGpx, map: previous.traceMap }); return { traceDist: next.dist, traceGain: next.gain, traceLoss: next.loss, traceGpx: next.gpx, traceMap: next.map }; })} mediaRow={gpxCustom} gpxUploading={gpxUploading} handleGpxDownload={gpx.handleGpxDownload} handleGpxReplace={gpx.handleGpxReplace} handleGpxDelete={gpx.handleGpxDelete} handleGpxUpload={gpx.handleGpxUpload} />
            </div>
          </details>
          <StartPointSection value={startPoint} onChange={setStartPoint} images={images} uploadLoading={uploadLoading} onUploadAccommodationPhoto={(file) => uploadMedia(file, { metadata: { purpose: "accommodation", accommodation_scope: "start-point" } })} onUploadPoiPhoto={(file) => uploadMedia(file, { metadata: { purpose: "poi", poi_scope: "start-point" } })} />
          {gpxError && <p className="page-error">{gpxError}</p>}
          <StudioInfoCard roadbook={roadbook} />
          <div className="studio-card">
            <div className="studio-card__header">
              <h2>Étapes et variantes ({stages.length + Object.values(variantsByStage).reduce((total, items) => total + items.length, 0)})</h2>
            </div>
            <div className="studio-card__body">
              {stageSuccess && <p className="page-success">{stageSuccess}</p>}
              {stageError && <p className="page-error">{stageError}</p>}
              <StageForm showStageForm={showStageForm} setShowStageForm={setShowStageForm} stageForm={stageForm} stageFormDispatch={stageFormDispatch} clearStageForm={clearStageForm} handleStageSubmit={handleStageSubmit} />
              {stages.length === 0 && <p className="studio-detail--empty">Aucune étape.</p>}
              <div className="studio-stage-list">
                {stages.map((stage, index) => {
                const stagePois = poisByStage[stage.id] ?? [];
                const stageVariants = variantsByStage[stage.id] ?? [];
                return <StageCard key={stage.id} stage={stage} index={index} expanded={isStageExpanded(stage.id)} onToggleExpand={() => toggleStage(stage.id)} stageCrud={stageCrud} gpx={gpx} stagePois={stagePois} stageVariants={stageVariants} poisByVariant={poisByVariant} dragHandlers={{ handleDragStart, handleDragOver, handleDragEnd, handleDrop }} draggingStageId={draggingStageId} dragOverStageId={dragOverStageId} stagePhotoMedia={images.find(image => image.stage_id === stage.id && image.metadata?.variant_id == null && !["accommodation", "poi"].includes(image.metadata?.purpose)) ?? null} images={images} onStageChange={(stageId, updates) => setStages(previous => previous.map(item => item.id === stageId ? { ...item, ...updates } : item))} onVariantChange={(variantId, updates) => setVariantsByStage(previous => Object.fromEntries(Object.entries(previous).map(([parentId, variants]) => [parentId, variants.map(variant => variant.id === variantId ? { ...variant, ...updates } : variant)])))} onUploadStagePhoto={async (event, stageId) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) await uploadMedia(file, { stageId, metadata: { purpose: "stage-photo" } }); }} onUploadVariantPhoto={async (event, stageId, variantId) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) await uploadMedia(file, { stageId, variantId, metadata: { purpose: "stage-photo" } }); }} onUploadAccommodationPhoto={(file, target) => uploadMedia(file, { stageId: target.stageId, variantId: target.variantId, metadata: { purpose: "accommodation" } })} onUploadPoiPhoto={(file, target) => uploadMedia(file, { stageId: target.stageId, variantId: target.variantId, metadata: { purpose: "poi" } })} uploadLoading={uploadLoading} />;
              })}
              </div>
            </div>
          </div>
      </section>
    </StudioShell>
  );
}
