#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";
import {
  buildPoiImportKey,
  buildVariantImportKey,
  loadExistingChildren,
  persistImportedChild,
  sourcePois,
  validateV1Source,
  variantLabel,
  variantScope,
  withImportKey,
} from "./lib/import-v1-idempotency.mjs";

const ROADBOOKS_DIR = path.resolve("..", "roadbooks");

const args = parseArgs({
  options: {
    slug: { type: "string", short: "s" },
    all: { type: "boolean", short: "a" },
    "dry-run": { type: "boolean", short: "d" },
    "owner-email": { type: "string", short: "e" },
    upsert: { type: "boolean", short: "u" },
  },
});

const slug = args.values.slug;
const importAll = args.values.all ?? false;
const dryRun = args.values["dry-run"] ?? false;
const ownerEmail = args.values["owner-email"];
const upsert = args.values.upsert ?? false;

if (!slug && !importAll) {
  console.error("Usage: node scripts/import-v1-roadbook.js --slug <slug> [--dry-run] [--owner-email <email>] [--upsert]");
  console.error("       node scripts/import-v1-roadbook.js --all [--dry-run] [--owner-email <email>] [--upsert]");
  process.exit(1);
}

if (!dryRun && !ownerEmail) {
  console.error("Error: --owner-email is required for real import (not dry-run)");
  process.exit(1);
}

// ── Load .env.local ──────────────────────────────────────────
function loadEnvLocal() {
  const envPath = path.resolve(".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("Error: .env.local not found at", envPath);
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    process.env[key] = val;
  }
}
loadEnvLocal();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error("Error: NEXT_PUBLIC_SUPABASE_URL not set in .env.local");
  process.exit(1);
}
if (!dryRun && !serviceRoleKey) {
  console.error("Error: SUPABASE_SERVICE_ROLE_KEY not set in .env.local");
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────
function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf-8")); }
  catch (e) { return null; }
}

function noteItemsToNotesArray(noteItems, notes, warning) {
  const result = [];
  if (Array.isArray(noteItems)) {
    for (const item of noteItems) {
      if (typeof item === "string") { if (item.trim()) result.push({ text: item.trim() }); }
      else if (item && item.text) result.push({ text: item.text, photo: item.photo || null, createdAt: item.createdAt || null, source: item.source || null });
    }
  }
  if (notes && typeof notes === "string" && notes.trim()) result.push({ text: notes.trim() });
  if (Array.isArray(warning) && warning.length > 0) {
    for (const w of warning) {
      if (typeof w === "string" && w.trim()) result.push({ text: w.trim(), type: "warning" });
      else if (w && w.text) result.push({ text: w.text, type: "warning" });
    }
  }
  return result;
}

function hasOwn(object, field) {
  return Object.prototype.hasOwnProperty.call(object ?? {}, field);
}

function normalizedSourceValue(value) {
  return value === undefined || value === null || value === "" ? null : value;
}

function buildPoiImportRecord({ poi, enriched, stageId, stageNumber, variant = null, variantId = null }) {
  const fields = ["name", "sort_order"];
  if (variantId != null) fields.push("variant_id");
  const metadataFields = variant ? ["fromVariant"] : [];
  const coordinates = enriched?.coordinates;
  const hasLatitude = hasOwn(coordinates, "lat");
  const hasLongitude = hasOwn(coordinates, "lng");
  const hasDescription = hasOwn(poi, "description") || hasOwn(enriched, "description");
  const description = hasOwn(poi, "description") ? poi.description : enriched?.description;

  if (hasLatitude) fields.push("lat");
  if (hasLongitude) fields.push("lng");
  if (hasDescription) fields.push("description");
  if (hasOwn(poi, "url")) fields.push("link_url");
  if (hasOwn(poi, "region")) fields.push("region");
  if (hasOwn(enriched, "source")) metadataFields.push("source");
  if (hasOwn(enriched, "status")) metadataFields.push("status");

  const metadata = {};
  if (hasOwn(enriched, "source")) metadata.source = normalizedSourceValue(enriched.source);
  if (hasOwn(enriched, "status")) metadata.status = normalizedSourceValue(enriched.status);
  if (variant) metadata.fromVariant = variant;
  const scope = variant ? variantScope(variant) : "stage";

  return {
    payload: {
      stage_id: stageId,
      variant_id: variantId,
      name: poi.name,
      lat: normalizedSourceValue(coordinates?.lat),
      lng: normalizedSourceValue(coordinates?.lng),
      poi_type: null,
      description: normalizedSourceValue(description),
      photo_url: normalizedSourceValue(poi.image ?? enriched?.image),
      link_url: normalizedSourceValue(poi.url),
      region: normalizedSourceValue(poi.region),
      sort_order: 0,
      metadata: withImportKey(metadata, buildPoiImportKey(stageNumber, poi.name, scope), poi.id),
    },
    presence: { fields, metadataFields },
  };
}

function buildVariantImportRecord({ variant, stageId, stageNumber, sortOrder }) {
  const label = variantLabel(variant);
  const fields = ["label", "sort_order"];
  const metadataFields = [];
  const metadata = {};
  const addField = (sourceField, targetField = sourceField) => {
    if (hasOwn(variant, sourceField)) fields.push(targetField);
  };
  const addMetadata = (sourceField, targetField = sourceField) => {
    if (!hasOwn(variant, sourceField)) return;
    metadataFields.push(targetField);
    metadata[targetField] = normalizedSourceValue(variant[sourceField]);
  };

  addField("distance", "distance_km");
  addField("description");
  addField("departure");
  addField("arrival");
  addField("elevationLoss", "elevation_loss_m");
  addField("mapEmbedUrl", "map_embed_url");
  addField("stagePhoto", "stage_photo_url");
  addField("day");
  addField("stageLabel", "stage_label");
  addField("duration");
  if (hasOwn(variant, "accommodation") || hasOwn(variant, "legacyAccommodation")) {
    fields.push("accommodation_name", "accommodation_url", "accommodation_photo", "alternatives");
  }
  addField("accommodationType", "accommodation_type");
  if (hasOwn(variant, "elevationGain") || hasOwn(variant, "elevation")) fields.push("elevation_gain_m");
  const notesPresent = ["noteItems", "notes", "warning"].some(field => hasOwn(variant, field));
  if (notesPresent) fields.push("notes");

  for (const field of ["type", "itemType", "hierarchyLevel", "enabled", "legacyAccommodation"]) addMetadata(field);
  if (hasOwn(variant, "accommodation")) {
    metadataFields.push("accommodation");
    const accommodation = variant.accommodation;
    metadata.accommodation = accommodation == null ? null : {
      name: accommodation.name ?? "",
      url: accommodation.url ?? accommodation.website ?? "",
      photo: accommodation.photo ?? "",
      alternatives: accommodation.alternatives ?? [],
    };
  }
  if (hasOwn(variant, "alternativeAccommodation")) {
    const alternative = variant.alternativeAccommodation;
    metadataFields.push("alternativeAccommodationName", "alternativeAccommodationPhoto");
    metadata.alternativeAccommodationName = normalizedSourceValue(alternative?.name);
    metadata.alternativeAccommodationPhoto = normalizedSourceValue(alternative?.photo);
  }

  const elevationGain = hasOwn(variant, "elevationGain") ? variant.elevationGain : variant.elevation;
  const variantNotes = noteItemsToNotesArray(variant.noteItems, variant.notes, variant.warning);
  const mirroredMetadata = {
    departure: normalizedSourceValue(variant.departure),
    arrival: normalizedSourceValue(variant.arrival),
    elevation_gain_m: normalizedSourceValue(elevationGain),
    elevation_loss_m: normalizedSourceValue(variant.elevationLoss),
    map_embed_url: normalizedSourceValue(variant.mapEmbedUrl),
    notes: variantNotes,
  };
  const mirroredPresence = {
    departure: hasOwn(variant, "departure"),
    arrival: hasOwn(variant, "arrival"),
    elevation_gain_m: hasOwn(variant, "elevationGain") || hasOwn(variant, "elevation"),
    elevation_loss_m: hasOwn(variant, "elevationLoss"),
    map_embed_url: hasOwn(variant, "mapEmbedUrl"),
    notes: notesPresent,
  };
  for (const [field, present] of Object.entries(mirroredPresence)) {
    if (present) {
      metadataFields.push(field);
      metadata[field] = mirroredMetadata[field];
    }
  }

  return {
    label,
    payload: {
      stage_id: stageId,
      label,
      distance_km: normalizedSourceValue(variant.distance),
      gpx_url: normalizedSourceValue(variant.gpx),
      description: normalizedSourceValue(variant.description),
      sort_order: sortOrder,
      departure: normalizedSourceValue(variant.departure),
      arrival: normalizedSourceValue(variant.arrival),
      elevation_gain_m: normalizedSourceValue(elevationGain),
      elevation_loss_m: normalizedSourceValue(variant.elevationLoss),
      map_embed_url: normalizedSourceValue(variant.mapEmbedUrl),
      stage_photo_url: normalizedSourceValue(variant.stagePhoto),
      day: normalizedSourceValue(variant.day),
      stage_label: normalizedSourceValue(variant.stageLabel),
      duration: normalizedSourceValue(variant.duration),
      accommodation_name: normalizedSourceValue(variant.accommodation?.name ?? variant.legacyAccommodation),
      accommodation_url: normalizedSourceValue(variant.accommodation?.url ?? variant.accommodation?.website),
      accommodation_photo: normalizedSourceValue(variant.accommodation?.photo),
      accommodation_type: normalizedSourceValue(variant.accommodationType),
      alternatives: variant.accommodation?.alternatives ?? [],
      notes: variantNotes,
      metadata: withImportKey(metadata, buildVariantImportKey(stageNumber, variant), variant.id),
    },
    presence: { fields, metadataFields },
  };
}

function collectUnmappedFields(obj, knownKeys) {
  const unmapped = [];
  for (const key of Object.keys(obj)) {
    if (!knownKeys.includes(key)) unmapped.push(key);
  }
  return unmapped;
}

function detectRoadbooks() {
  if (!fs.existsSync(ROADBOOKS_DIR)) return [];
  const entries = fs.readdirSync(ROADBOOKS_DIR, { withFileTypes: true });
  const slugs = [];
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== "_template") {
      if (fs.existsSync(path.join(ROADBOOKS_DIR, entry.name, "roadbook.json"))) slugs.push(entry.name);
    }
  }
  return slugs.sort();
}

// ── Determine slugs to process ────────────────────────────
const slugsToProcess = importAll ? detectRoadbooks() : [slug];

if (importAll) {
  console.log(`\nDetected roadbooks: ${slugsToProcess.join(", ")}\n`);
}

const overallReport = {
  roadbooksDetected: slugsToProcess.length,
  roadbooksImported: 0,
  roadbooksUpdated: 0,
  duplicatesSkipped: 0,
  totalStagesCreated: 0,
  totalPoisCreated: 0,
  totalVariantsCreated: 0,
  errors: [],
};

// ── Process each roadbook ─────────────────────────────────
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Pre-fetch owner once
let ownerId = null;
if (!dryRun) {
  console.log(`Looking up owner by email: ${ownerEmail}...`);
  const { data: { users }, error: userListError } = await supabase.auth.admin.listUsers();
  if (userListError) {
    console.error("Error listing users:", userListError.message);
    process.exit(1);
  }
  const owner = users.find(u => u.email === ownerEmail);
  if (!owner) {
    console.error(`Error: no user found with email "${ownerEmail}". Available: ${users.map(u => u.email).join(", ")}`);
    process.exit(1);
  }
  ownerId = owner.id;
  console.log(`Owner found: ${ownerId}\n`);
}

for (const currentSlug of slugsToProcess) {
  await importRoadbook(currentSlug);
}

console.log("\n\n========== OVERALL REPORT ==========\n");
console.log(`Roadbooks detected:  ${overallReport.roadbooksDetected}`);
console.log(`Roadbooks imported:  ${overallReport.roadbooksImported}`);
console.log(`Roadbooks updated:   ${overallReport.roadbooksUpdated}`);
console.log(`Duplicates skipped:  ${overallReport.duplicatesSkipped}`);
console.log(`Stages created:      ${overallReport.totalStagesCreated}`);
console.log(`POIs created:        ${overallReport.totalPoisCreated}`);
console.log(`Variants created:    ${overallReport.totalVariantsCreated}`);
console.log(`Errors:              ${overallReport.errors.length}`);
if (overallReport.errors.length) {
  console.log(`\nErrors:`);
  for (const e of overallReport.errors) console.log(`  - ${e}`);
}
console.log("\n=== Done ===\n");
process.exit(overallReport.errors.length ? 1 : 0);

// ── Import a single roadbook ──────────────────────────────────
async function importRoadbook(slug) {
  const roadbookDir = path.join(ROADBOOKS_DIR, slug);
  const jsonPath = path.join(roadbookDir, "roadbook.json");
  const poiEnrichPath = path.join(roadbookDir, "data", "poi-enrichment.json");
  const accEnrichPath = path.join(roadbookDir, "data", "accommodation-enrichment.json");

  if (!fs.existsSync(jsonPath)) {
    const msg = `roadbook.json not found at ${jsonPath}`;
    console.error(msg);
    overallReport.errors.push(msg);
    return;
  }

  const v1 = readJson(jsonPath);
  const poiEnrichment = readJson(poiEnrichPath);
  const accEnrichment = readJson(accEnrichPath);

  if (!v1) {
    const msg = `Failed to parse roadbook.json for ${slug}`;
    console.error(msg);
    overallReport.errors.push(msg);
    return;
  }

  const report = {
    created: { roadbooks: 0, stages: 0, pois: 0, variants: 0 },
    updated: { roadbooks: 0, stages: 0, pois: 0, variants: 0 },
    ignored: { duplicates: 0 },
    unmappedFields: new Set(),
    errors: [],
  };

  const sourceConflicts = validateV1Source(v1.stages || []);
  if (sourceConflicts.length) {
    for (const conflict of sourceConflicts) {
      const message = `Source V1 conflict: ${conflict}`;
      console.error(message);
      overallReport.errors.push(`${slug}: ${message}`);
    }
    return;
  }

  // ── Dry-run display ──────────────────────────────────────────
  if (dryRun) {
    console.log(`\n=== DRY RUN: ${slug} ===\n`);
    const stages = v1.stages || [];
    let totalPois = 0;
    let totalSubsteps = 0;
    let totalNotes = 0;
    let totalGpx = 0;
    let totalStagePhotos = 0;

    for (const s of stages) {
      if (s.gpx) totalGpx++;
      if (s.stagePhoto) totalStagePhotos++;
      const notes = noteItemsToNotesArray(s.noteItems, s.notes, s.warning);
      totalNotes += notes.length;
      totalPois += sourcePois(s).filter(p => p?.name).length;
      if (Array.isArray(s.substeps)) {
        totalSubsteps += s.substeps.length;
        for (const sub of s.substeps) {
          if (sub.gpx) totalGpx++;
          totalPois += sourcePois(sub).filter(p => p?.name).length;
          const subNotes = noteItemsToNotesArray(sub.noteItems, sub.notes, sub.warning);
          totalNotes += subNotes.length;
        }
      }
    }

    const topLevelVariants = v1.variants || [];
    console.log(`Stages:           ${stages.length}`);
    console.log(`Sub-steps / vars: ${totalSubsteps} (nested) + ${topLevelVariants.length} (top-level)`);
    console.log(`POIs (total):     ${totalPois}`);
    console.log(`Notes:            ${totalNotes}`);
    console.log(`GPX files:        ${totalGpx}`);
    console.log(`Stage photos:     ${totalStagePhotos}`);
    console.log(`Accommodations:   ${(v1.accommodation || []).length} (top-level index)`);
    console.log(`POI enrichment:   ${poiEnrichment?.items?.length || 0} items`);
    console.log(`Acc enrichment:   ${accEnrichment?.items?.length || 0} items`);

    const roadbookKnownKeys = ["id", "title", "description", "metadata", "summary", "stages", "variants", "accommodation", "pois", "notes", "contributions", "days"];
    const rbUnmapped = collectUnmappedFields(v1, roadbookKnownKeys);
    if (rbUnmapped.length) {
      console.log("\nUnmapped roadbook fields:", rbUnmapped.join(", "));
      rbUnmapped.forEach(f => report.unmappedFields.add(`roadbook.${f}`));
    }

    const stageKnownKeys = ["id", "itemType", "isSubstep", "hierarchyLevel", "parentStage", "parentStageReference", "stage", "day", "stageLabel", "name", "type", "departure", "arrival", "distance", "elevationGain", "elevationLoss", "notes", "gpx", "mapEmbedUrl", "stagePhoto", "accommodation", "alternativeAccommodation", "accommodationType", "substeps", "title", "elevation", "duration", "description", "noteItems", "pois", "pointsOfInterest", "interest", "restaurants", "shops", "water", "warning", "legacyAccommodation", "enabled", "parentTitle", "link", "distanceExtra", "elevationGainExtra", "elevationLossExtra", "stageReference"];
    const stageUnmapped = new Set();
    for (const s of stages) {
      collectUnmappedFields(s, stageKnownKeys).forEach(k => stageUnmapped.add(k));
      for (const sub of (s.substeps || [])) collectUnmappedFields(sub, stageKnownKeys).forEach(k => stageUnmapped.add(k));
    }
    if (stageUnmapped.size) {
      console.log("Unmapped stage fields:", [...stageUnmapped].join(", "));
      [...stageUnmapped].forEach(k => report.unmappedFields.add(`stage.${k}`));
    }
    console.log("\n=== Dry-run complete. No data written. ===\n");
    return;
  }

  // ── Import mode ──────────────────────────────────────────────
  console.log(`\n=== IMPORT: ${slug} ===\n`);

  // 2. Upsert roadbook
  const summary = v1.summary || {};
  const stagesTotal = summary.stagesTotal || {};
  const metadata = { ...v1.metadata };
  delete metadata.coverImage;

  const roadbookPayload = {
    slug: v1.id || slug,
    owner_id: ownerId,
    title: v1.title || slug,
    description: v1.description || null,
    is_public: true,
    cover_image_url: v1.metadata?.coverImage || null,
    distance_km: stagesTotal.distance || null,
    elevation_gain_m: stagesTotal.elevationGain || null,
    elevation_loss_m: stagesTotal.elevationLoss || null,
    map_embed_url: stagesTotal.mapEmbedUrl || null,
    gpx_url: stagesTotal.gpx || null,
    metadata,
  };

  let roadbookId;
  const { data: existingRb } = await supabase
    .from("roadbooks")
    .select("id")
    .eq("slug", roadbookPayload.slug)
    .maybeSingle();

  if (existingRb) {
    if (!upsert) {
      console.log(`Roadbook "${roadbookPayload.slug}" already exists (id=${existingRb.id}). Use --upsert to update.`);
      report.ignored.duplicates++;
      roadbookId = existingRb.id;
    } else {
      const { error: updateErr } = await supabase
        .from("roadbooks")
        .update(roadbookPayload)
        .eq("id", existingRb.id);
      if (updateErr) { report.errors.push(`Update roadbook: ${updateErr.message}`); console.error(updateErr); }
      else { report.updated.roadbooks++; console.log(`Roadbook updated (id=${existingRb.id})`); }
      roadbookId = existingRb.id;
    }
  } else {
    const { data: newRb, error: insertErr } = await supabase
      .from("roadbooks")
      .insert(roadbookPayload)
      .select("id")
      .single();
    if (insertErr) { report.errors.push(`Insert roadbook: ${insertErr.message}`); console.error(insertErr); return; }
    report.created.roadbooks++;
    roadbookId = newRb.id;
    console.log(`Roadbook created (id=${roadbookId})`);
  }

  // 3. Build POI enrichment lookup
  const poiEnrichLookup = {};
  if (poiEnrichment?.items) {
    for (const item of poiEnrichment.items) {
      const normalized = item.name?.toLowerCase().trim();
      if (normalized) poiEnrichLookup[normalized] = item;
    }
  }

  // 4. Process stages
  const stages = v1.stages || [];
  let stageSortOrder = 0;

  for (const s of stages) {
    stageSortOrder++;
    const stageNumber = s.stage;

    const notesArray = noteItemsToNotesArray(s.noteItems, s.notes, s.warning);
    const accommodationAlternatives = [];
    if (s.accommodation?.alternatives) {
      for (const alt of s.accommodation.alternatives) {
        if (alt && (alt.url || alt.name)) {
          accommodationAlternatives.push({ url: alt.url || "", name: alt.name || "", photo: alt.photo || "" });
        }
      }
    }

    const stageMetadata = {};
    if (s.legacyAccommodation) stageMetadata.legacyAccommodation = s.legacyAccommodation;
    if (s.description) stageMetadata.description = s.description;
    if (Array.isArray(s.restaurants) && s.restaurants.length) stageMetadata.restaurants = s.restaurants;
    if (Array.isArray(s.shops) && s.shops.length) stageMetadata.shops = s.shops;
    if (Array.isArray(s.water) && s.water.length) stageMetadata.water = s.water;
    if (Array.isArray(s.warning) && s.warning.length && !notesArray.some(n => n.type === "warning")) stageMetadata.warnings = s.warning;
    if (s.type) stageMetadata.type = s.type;
    if (s.itemType) stageMetadata.itemType = s.itemType;
    if (s.hierarchyLevel != null) stageMetadata.hierarchyLevel = s.hierarchyLevel;
    if (s.enabled != null) stageMetadata.enabled = s.enabled;
    if (s.alternativeAccommodation?.name) stageMetadata.alternativeAccommodationName = s.alternativeAccommodation.name;
    if (s.alternativeAccommodation?.photo) stageMetadata.alternativeAccommodationPhoto = s.alternativeAccommodation.photo;

    const stagePayload = {
      roadbook_id: roadbookId,
      stage_number: stageNumber,
      title: s.title || s.name || null,
      departure: s.departure || null,
      arrival: s.arrival || null,
      distance_km: s.distance || null,
      elevation_gain_m: s.elevationGain || s.elevation || null,
      elevation_loss_m: s.elevationLoss || null,
      gpx_url: s.gpx || null,
      map_embed_url: s.mapEmbedUrl || null,
      stage_photo_url: s.stagePhoto || null,
      day: s.day || null,
      stage_label: s.stageLabel || null,
      duration: s.duration || null,
      accommodation_name: s.accommodation?.name || s.legacyAccommodation || null,
      accommodation_url: s.accommodation?.url || s.accommodation?.website || null,
      accommodation_photo: s.accommodation?.photo || null,
      accommodation_type: s.accommodationType || null,
      notes: notesArray,
      alternatives: accommodationAlternatives,
      is_substep: false,
      parent_stage_number: null,
      metadata: stageMetadata,
    };

    let stageId;
    const { data: existingStage } = await supabase
      .from("stages")
      .select("id")
      .eq("roadbook_id", roadbookId)
      .eq("stage_number", stageNumber)
      .maybeSingle();

    if (existingStage) {
      if (!upsert) {
        report.ignored.duplicates++;
        stageId = existingStage.id;
        console.log(`  Stage ${stageNumber} "${s.name}": already exists, skipped`);
      } else {
        const { error: updateErr } = await supabase
          .from("stages")
          .update(stagePayload)
          .eq("id", existingStage.id);
        if (updateErr) report.errors.push(`Update stage ${stageNumber}: ${updateErr.message}`);
        else report.updated.stages++;
        stageId = existingStage.id;
        console.log(`  Stage ${stageNumber} "${s.name}": updated`);
      }
    } else {
      const { data: newStage, error: insertErr } = await supabase
        .from("stages")
        .insert(stagePayload)
        .select("id")
        .single();
      if (insertErr) { report.errors.push(`Insert stage ${stageNumber}: ${insertErr.message}`); console.error(insertErr); continue; }
      report.created.stages++;
      stageId = newStage.id;
      console.log(`  Stage ${stageNumber} "${s.name}": created (id=${stageId})`);
    }

    const existingChildren = await loadExistingChildren(supabase, stageId);
    if (existingChildren.poisError || existingChildren.variantsError) {
      if (existingChildren.poisError) report.errors.push(`Load POIs for stage ${stageNumber}: ${existingChildren.poisError.message}`);
      if (existingChildren.variantsError) report.errors.push(`Load variants for stage ${stageNumber}: ${existingChildren.variantsError.message}`);
      continue;
    }
    const existingPois = existingChildren.pois;
    const existingVariants = existingChildren.variants;

    // 4a. Import POIs from this stage
    for (const p of sourcePois(s)) {
      if (!p?.name) continue;
      const enriched = poiEnrichLookup[p.name?.toLowerCase().trim()];
      const { payload: poiPayload, presence: poiPresence } = buildPoiImportRecord({
        poi: p, enriched, stageId, stageNumber,
      });
      const poiResult = await persistImportedChild({
        supabase, table: "stage_pois", payload: poiPayload, presence: poiPresence,
        existingRows: existingPois, upsert,
      });
      if (poiResult.action === "error") report.errors.push(`Insert POI "${p.name}": ${poiResult.error.message}`);
      else if (poiResult.action === "conflict") report.errors.push(`POI conflict "${p.name}" on stage ${stageNumber}: ${poiResult.reason}`);
      else if (poiResult.action === "skipped") report.ignored.duplicates++;
      else if (poiResult.action === "updated") report.updated.pois++;
      else report.created.pois++;
    }

    // 4b. Import variants (substeps)
    if (Array.isArray(s.substeps)) {
      let variantSortOrder = 0;
      for (const sub of s.substeps) {
        variantSortOrder++;
        const {
          label,
          payload: variantPayload,
          presence: variantPresence,
        } = buildVariantImportRecord({ variant: sub, stageId, stageNumber, sortOrder: variantSortOrder });

        const variantResult = await persistImportedChild({
          supabase, table: "stage_variants", payload: variantPayload, presence: variantPresence,
          existingRows: existingVariants, upsert,
        });
        if (variantResult.action === "error") report.errors.push(`Insert variant "${sub.name}": ${variantResult.error.message}`);
        else if (variantResult.action === "conflict") report.errors.push(`Variant conflict "${label}" on stage ${stageNumber}: ${variantResult.reason}`);
        else if (variantResult.action === "skipped") report.ignored.duplicates++;
        else if (variantResult.action === "updated") report.updated.variants++;
        else report.created.variants++;

        const variantId = variantResult.row?.id ?? null;
        if (!variantId) continue;

        // Import variant's own POIs
        for (const p of sourcePois(sub)) {
          if (p?.name) {
            const enriched = poiEnrichLookup[p.name?.toLowerCase().trim()];
            const { payload: poiPayload, presence: poiPresence } = buildPoiImportRecord({
              poi: p, enriched, stageId, stageNumber, variant: label, variantId,
            });
            const poiResult = await persistImportedChild({
              supabase, table: "stage_pois", payload: poiPayload, presence: poiPresence,
              existingRows: existingPois, upsert,
            });
            if (poiResult.action === "error") report.errors.push(`Insert variant POI "${p.name}": ${poiResult.error.message}`);
            else if (poiResult.action === "conflict") report.errors.push(`POI conflict "${p.name}" in variant "${label}": ${poiResult.reason}`);
            else if (poiResult.action === "skipped") report.ignored.duplicates++;
            else if (poiResult.action === "updated") report.updated.pois++;
            else report.created.pois++;
          }
        }
      }
    }
  }

  // ── Report for this roadbook ─────────────────────────────────
  console.log(`\n--- ${slug} REPORT ---`);
  console.log(`Created:  ${report.created.roadbooks} roadbook, ${report.created.stages} stages, ${report.created.pois} POIs, ${report.created.variants} variants`);
  console.log(`Updated:  ${report.updated.roadbooks} roadbook, ${report.updated.stages} stages, ${report.updated.pois} POIs, ${report.updated.variants} variants`);
  console.log(`Ignored:  ${report.ignored.duplicates} duplicates`);
  if (report.errors.length) console.log(`Errors:   ${report.errors.length}`);

  // Accumulate
  overallReport.roadbooksImported += report.created.roadbooks;
  overallReport.roadbooksUpdated += report.updated.roadbooks;
  overallReport.duplicatesSkipped += report.ignored.duplicates;
  overallReport.totalStagesCreated += report.created.stages;
  overallReport.totalPoisCreated += report.created.pois;
  overallReport.totalVariantsCreated += report.created.variants;
  overallReport.errors.push(...report.errors.map(e => `${slug}: ${e}`));
}
