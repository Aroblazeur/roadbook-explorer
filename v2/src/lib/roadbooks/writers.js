import { buildStartPointRecord, hasStartPoint } from "./start-point.js";

export async function insertStage(supabase, record) {
  const { error } = await supabase.from("stages").insert(record);
  if (error) throw new Error(error.message);
}

export async function updateStage(supabase, stageId, updates) {
  const { error } = await supabase.from("stages").update(updates).eq("id", stageId);
  if (error) throw new Error(error.message);
}

export async function updateStages(supabase, stages, buildUpdates) {
  await Promise.all(stages.map((stage, index) => updateStage(supabase, stage.id, buildUpdates(stage, index, stages))));
}

export async function deleteStage(supabase, stageId) {
  const { error } = await supabase.from("stages").delete().eq("id", stageId);
  if (error) throw new Error(error.message);
}

export async function insertPoi(supabase, record) {
  const { error } = await supabase.from("stage_pois").insert(record);
  if (error) throw new Error(error.message);
}

export async function updatePoi(supabase, poiId, updates) {
  const { error } = await supabase.from("stage_pois").update(updates).eq("id", poiId);
  if (error) throw new Error(error.message);
}

export async function updatePois(supabase, operations) {
  await Promise.all(operations.map(operation => updatePoi(supabase, operation.id, operation.updates)));
}

export async function saveStartPoint(supabase, roadbookId, record, present) {
  if (!present) {
    const { error } = await supabase.from("roadbook_start_points").delete().eq("roadbook_id", roadbookId);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase.from("roadbook_start_points").upsert(record, { onConflict: "roadbook_id" });
  if (error) throw new Error(error.message);
}

export async function deletePoi(supabase, poiId) {
  const { error } = await supabase.from("stage_pois").delete().eq("id", poiId);
  if (error) throw new Error(error.message);
}

export async function insertVariant(supabase, record) {
  const { error } = await supabase.from("stage_variants").insert(record);
  if (error) throw new Error(error.message);
}

export async function updateVariant(supabase, variantId, updates) {
  const { error } = await supabase.from("stage_variants").update(updates).eq("id", variantId);
  if (error) throw new Error(error.message);
}

export async function updateVariants(supabase, variantsByStage, buildUpdates) {
  const variants = Object.values(variantsByStage ?? {}).flat();
  await Promise.all(variants.map(variant => updateVariant(supabase, variant.id, buildUpdates(variant))));
}

export async function updateVariantNotes(supabase, variantId, notes) {
  return updateVariant(supabase, variantId, { notes });
}

export async function updateVariantAccommodation(supabase, variantId, payload) {
  return updateVariant(supabase, variantId, payload);
}

export async function deleteVariant(supabase, variantId) {
  const { error } = await supabase.from("stage_variants").delete().eq("id", variantId);
  if (error) throw new Error(error.message);
}

export async function updateStageNotes(supabase, stageId, notes) {
  const { error } = await supabase.from("stages").update({ notes }).eq("id", stageId);
  if (error) throw new Error(error.message);
}

export async function updateStageAccommodation(supabase, stageId, payload) {
  const { error } = await supabase.from("stages").update(payload).eq("id", stageId);
  if (error) throw new Error(error.message);
}

export async function clearStageAccommodation(supabase, stageId) {
  const { error } = await supabase
    .from("stages")
    .update({ accommodation_name: null, accommodation_url: null, accommodation_photo: null })
    .eq("id", stageId);
  if (error) throw new Error(error.message);
}

async function verifyMediaCompensation(supabase, mediaId) {
  const { data, error } = await supabase
    .from("media")
    .select("id")
    .eq("id", mediaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data == null;
}

export async function compensateMediaRecord(supabase, mediaId) {
  const { error } = await supabase.from("media").delete().eq("id", mediaId);
  if (error) throw new Error(error.message);
  if (!(await verifyMediaCompensation(supabase, mediaId))) {
    throw new Error(`La ligne media ${mediaId} existe encore après compensation.`);
  }
}

export async function createMediaWithUpload(supabase, record, uploadObject) {
  const mediaRow = await insertMediaRecord(supabase, record);
  try {
    await uploadObject();
    return mediaRow;
  } catch (uploadError) {
    try {
      await compensateMediaRecord(supabase, mediaRow.id);
    } catch (compensationError) {
      const error = new Error(
        `Échec du téléversement et de la compensation pour la ligne media ${mediaRow.id}: ${compensationError.message}`,
      );
      error.mediaId = mediaRow.id;
      error.uploadError = uploadError?.message ?? String(uploadError);
      error.compensationError = compensationError.message;
      throw error;
    }
    throw uploadError;
  }
}

export async function uploadImage(supabase, userId, roadbookId, file, blob, record = null, { returnMedia = false } = {}) {
  const uuid = crypto.randomUUID();
  const path = `${userId}/${roadbookId}/${uuid}-${file.name}`;
  const uploadObject = async () => {
    const { error: storageError } = await supabase.storage
      .from("roadbook-images")
      .upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (storageError) throw new Error(storageError.message);
  };

  if (record) {
    const media = await createMediaWithUpload(supabase, {
      ...record,
      bucket: "roadbook-images",
      path,
    }, uploadObject);
    return returnMedia ? { path, media } : path;
  } else {
    await uploadObject();
  }
  return returnMedia ? { path, media: null } : path;
}

export async function insertMediaRecord(supabase, record) {
  const { data, error } = await supabase
    .from("media")
    .insert(record)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteMedia(supabase, mediaRow) {
  const { error: storageError } = await supabase.storage
    .from("roadbook-images")
    .remove([mediaRow.path]);
  if (storageError) throw new Error(storageError.message);
  const { error: dbError } = await supabase.from("media").delete().eq("id", mediaRow.id);
  if (dbError) throw new Error(dbError.message);
}

export async function deleteMediaRecordOnly(supabase, mediaId) {
  const { error } = await supabase.from("media").delete().eq("id", mediaId);
  if (error) throw new Error(error.message);
}

export async function uploadGpx(
  supabase,
  bucket,
  path,
  file,
  { record = null, upsert = false } = {},
) {
  const uploadObject = async () => {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { contentType: "application/gpx+xml", upsert });
    if (error) throw new Error(error.message);
  };

  if (record) {
    return createMediaWithUpload(supabase, { ...record, bucket, path }, uploadObject);
  }
  await uploadObject();
  return null;
}

export async function removeStorageFile(supabase, bucket, path) {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw new Error(error.message);
}

export async function insertGpxRecord(supabase, record) {
  return insertMediaRecord(supabase, record);
}

export async function updateGpxRecord(supabase, mediaId, updates) {
  const { error } = await supabase.from("media").update(updates).eq("id", mediaId);
  if (error) throw new Error(error.message);
}

export async function deleteGpx(supabase, mediaRow, bucket) {
  const { error: storageError } = await supabase.storage
    .from(bucket)
    .remove([mediaRow.path]);
  if (storageError) throw new Error(storageError.message);
  const { error: dbError } = await supabase.from("media").delete().eq("id", mediaRow.id);
  if (dbError) throw new Error(dbError.message);
}

export async function insertRoadbook(supabase, record) {
  const { data, error } = await supabase.from("roadbooks").insert(record).select("id").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteRoadbook(supabase, roadbookId) {
  const { data: media, error: mediaError } = await supabase
    .from("media")
    .select("bucket, path")
    .eq("roadbook_id", Number(roadbookId));
  if (mediaError) throw new Error(mediaError.message);

  const pathsByBucket = (media ?? []).reduce((groups, row) => {
    if (!groups[row.bucket]) groups[row.bucket] = [];
    groups[row.bucket].push(row.path);
    return groups;
  }, {});
  for (const [bucket, paths] of Object.entries(pathsByBucket)) {
    if (!paths.length) continue;
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) throw new Error(error.message);
  }

  const { error } = await supabase.from("roadbooks").delete().eq("id", Number(roadbookId));
  if (error) throw new Error(error.message);
}

export async function duplicateRoadbook(supabase, roadbook, stages, poisByStage, variantsByStage, slug, userId, poisByVariant = {}, startPoint = null) {
  const newRb = await insertRoadbook(supabase, {
    slug, owner_id: userId,
    title: `${roadbook.title} (copie)`,
    description: roadbook.description,
    is_public: false,
    distance_km: roadbook.distance_km,
    elevation_gain_m: roadbook.elevation_gain_m,
    elevation_loss_m: roadbook.elevation_loss_m,
    map_embed_url: roadbook.map_embed_url,
    metadata: roadbook.metadata ?? {},
  });

  const newStageIds = [];
  if (hasStartPoint(startPoint)) {
    const { error: startPointError } = await supabase.from("roadbook_start_points").insert(buildStartPointRecord(startPoint, newRb.id));
    if (startPointError) throw new Error(startPointError.message);
  }
  for (const stage of stages) {
    const { data: newStage, error: sError } = await supabase.from("stages").insert({
      roadbook_id: newRb.id, stage_number: stage.stage_number, sort_order: stage.sort_order, title: stage.title,
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
    if (sError) throw new Error(sError.message);
    newStageIds.push({ oldId: stage.id, newId: newStage.id });
  }

  for (const { oldId, newId } of newStageIds) {
    const stagePois = poisByStage[oldId] ?? [];
    for (const poi of stagePois) {
      const { error: pError } = await supabase.from("stage_pois").insert({
        stage_id: newId, name: poi.name, lat: poi.lat, lng: poi.lng,
        poi_type: poi.poi_type, description: poi.description, photo_url: null,
        link_url: poi.link_url, region: poi.region,
        sort_order: poi.sort_order, metadata: poi.metadata,
      });
      if (pError) throw new Error(pError.message);
    }
    const stageVariants = variantsByStage[oldId] ?? [];
    for (const v of stageVariants) {
      const { data: newVariant, error: vError } = await supabase.from("stage_variants").insert({
        stage_id: newId, label: v.label, distance_km: v.distance_km,
        gpx_url: null, description: v.description, sort_order: v.sort_order,
        departure: v.departure ?? v.metadata?.departure ?? null,
        arrival: v.arrival ?? v.metadata?.arrival ?? null,
        elevation_gain_m: v.elevation_gain_m ?? v.metadata?.elevation_gain_m ?? null,
        elevation_loss_m: v.elevation_loss_m ?? v.metadata?.elevation_loss_m ?? null,
        map_embed_url: v.map_embed_url ?? v.metadata?.map_embed_url ?? null,
        stage_photo_url: null,
        day: v.day,
        stage_label: v.stage_label,
        duration: v.duration,
        accommodation_name: v.accommodation_name,
        accommodation_url: v.accommodation_url,
        accommodation_photo: null,
        accommodation_type: v.accommodation_type,
        alternatives: v.alternatives ?? [],
        notes: v.notes ?? v.metadata?.notes ?? [],
        metadata: v.metadata,
      }).select("id").single();
      if (vError) throw new Error(vError.message);
      for (const poi of (poisByVariant[v.id] ?? [])) {
        const { error: pError } = await supabase.from("stage_pois").insert({
          stage_id: newId, variant_id: newVariant.id, name: poi.name,
          lat: poi.lat, lng: poi.lng, poi_type: poi.poi_type,
          description: poi.description, photo_url: null, link_url: poi.link_url,
          region: poi.region, sort_order: poi.sort_order, metadata: poi.metadata,
        });
        if (pError) throw new Error(pError.message);
      }
    }
  }

  return newRb.id;
}
