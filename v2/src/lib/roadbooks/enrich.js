import { buildEnrichPoiUpdate, buildEnrichAccommodationUpdate } from "./mutations.js";

export async function applyPoiEnrichment(supabase, poiId, found) {
  const update = buildEnrichPoiUpdate(found);
  if (!Object.keys(update).length) return { updated: false, reason: "no_fields" };
  const { error } = await supabase.from("stage_pois").update(update).eq("id", poiId);
  if (error) throw new Error(error.message);
  return { updated: true };
}

export async function applyAccommodationEnrichment(supabase, stageId, found) {
  const update = buildEnrichAccommodationUpdate(found);
  if (!Object.keys(update).length) return { updated: false, reason: "no_fields" };
  const { error } = await supabase.from("stages").update(update).eq("id", stageId);
  if (error) throw new Error(error.message);
  return { updated: true };
}

export async function applyBatchPoiEnrichment(supabase, operations) {
  const results = { poisUpdated: 0, poisFailed: 0, errors: [] };
  for (const { poiId, found } of operations) {
    try {
      const result = await applyPoiEnrichment(supabase, poiId, found);
      if (result.updated) results.poisUpdated++;
      else results.poisFailed++;
    } catch (err) {
      results.errors.push(err.message);
      results.poisFailed++;
    }
  }
  return results;
}

export async function applyBatchAccommodationEnrichment(supabase, operations) {
  const results = { accomsUpdated: 0, accomsFailed: 0, errors: [] };
  for (const { stageId, found } of operations) {
    try {
      const result = await applyAccommodationEnrichment(supabase, stageId, found);
      if (result.updated) results.accomsUpdated++;
      else results.accomsFailed++;
    } catch (err) {
      results.errors.push(err.message);
      results.accomsFailed++;
    }
  }
  return results;
}
