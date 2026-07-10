#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const ROADBOOKS_DIR = path.resolve(PROJECT_ROOT, "roadbooks");
const IMAGE_BUCKET = "roadbook-images";
const GPX_BUCKET = "roadbook-gpx";

const args = parseArgs({
  options: {
    slug: { type: "string", short: "s" },
    all: { type: "boolean", short: "a" },
    "dry-run": { type: "boolean", short: "d" },
    upsert: { type: "boolean", short: "u" },
  },
});

const slug = args.values.slug;
const importAll = args.values.all ?? false;
const dryRun = args.values["dry-run"] ?? false;
const upsert = args.values.upsert ?? false;

if (!slug && !importAll) {
  console.error("Usage: node scripts/import-v1-media.js --slug <slug> [--dry-run] [--upsert]");
  console.error("       node scripts/import-v1-media.js --all [--dry-run] [--upsert]");
  process.exit(1);
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

// ── Load .env.local ──────────────────────────────────────────
function loadEnvLocal() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
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
if (!serviceRoleKey) {
  console.error("Error: SUPABASE_SERVICE_ROLE_KEY not set in .env.local");
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────
function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf-8")); }
  catch (e) { return null; }
}

function resolveFile(roadbookDir, refPath) {
  if (!refPath || typeof refPath !== "string") return null;
  const normalized = refPath.replace(/\\/g, "/");
  const candidates = [];
  // If path starts with "roadbooks/", resolve relative to project root
  if (normalized.startsWith("roadbooks/")) {
    candidates.push(path.join(PROJECT_ROOT, normalized));
    // Also try without the roadbooks/<slug>/ prefix relative to roadbookDir
    const withoutSlug = normalized.replace(/^roadbooks\/[^/]+\//, "");
    if (withoutSlug !== normalized) {
      candidates.push(path.join(roadbookDir, withoutSlug));
    }
  }
  candidates.push(path.join(roadbookDir, normalized));
  if (!normalized.includes("/")) {
    candidates.push(path.join(roadbookDir, "gpx", normalized));
    candidates.push(path.join(roadbookDir, "data", normalized));
    candidates.push(path.join(roadbookDir, "assets", normalized));
  }
  const hasExt = path.extname(normalized);
  if (!hasExt) {
    const exts = [".gpx", ".jpg", ".jpeg", ".png", ".webp", ".svg"];
    const baseCandidates = [...candidates];
    for (const base of baseCandidates) {
      for (const ext of exts) {
        candidates.push(base + ext);
      }
    }
  }
  for (const c of candidates) {
    const resolved = path.resolve(c);
    if (fs.existsSync(resolved)) return resolved;
  }
  return null;
}

function isLocalFile(refPath) {
  if (!refPath || typeof refPath !== "string") return false;
  // Absolute URLs are not local files
  if (refPath.startsWith("http://") || refPath.startsWith("https://") || refPath.startsWith("//")) return false;
  // Data URIs are not local files
  if (refPath.startsWith("data:")) return false;
  return true;
}

function getMimeType(ext) {
  const map = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png", ".gif": "image/gif",
    ".webp": "image/webp", ".svg": "image/svg+xml",
    ".gpx": "application/gpx+xml",
  };
  return map[ext.toLowerCase()] || "application/octet-stream";
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getFileExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  // Handle double extensions like .gpx (already correct)
  return ext || ".bin";
}

function isImageFile(ext) {
  return [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"].includes(ext);
}

function isGpxFile(ext) {
  return ext === ".gpx";
}

// ── Create buckets if needed ──────────────────────────────────
async function ensureBuckets(supabase) {
  const required = [IMAGE_BUCKET, GPX_BUCKET];
  const { data: buckets } = await supabase.storage.listBuckets();
  const existing = new Set((buckets || []).map(b => b.name));
  for (const name of required) {
    if (!existing.has(name)) {
      const isPublic = name === "roadbook-gpx" ? false : false;
      const { error } = await supabase.storage.createBucket(name, { public: isPublic });
      if (error) console.warn(`Warning creating bucket "${name}": ${error.message}`);
      else console.log(`Created bucket: ${name}`);
    }
  }
}

// ── Determine slugs to process ────────────────────────────
const slugsToProcess = importAll ? detectRoadbooks() : [slug];

if (importAll) {
  console.log(`\nDetected roadbooks: ${slugsToProcess.join(", ")}\n`);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

if (!dryRun) await ensureBuckets(supabase);

// ── Overall report ────────────────────────────────────────────
const overallReport = {
  slug,
  roadbooksDetected: slugsToProcess.length,
  mediaFound: 0,
  mediaUploaded: 0,
  mediaSkipped: 0,
  gpxUploaded: 0,
  imagesUploaded: 0,
  errors: [],
  remainingUrls: [],
};

for (const currentSlug of slugsToProcess) {
  await importMedia(currentSlug);
}

// ── Final overall report ──────────────────────────────────────
console.log("\n\n========== OVERALL MEDIA IMPORT REPORT ==========\n");
console.log(`Roadbooks detected:   ${overallReport.roadbooksDetected}`);
console.log(`Media found:          ${overallReport.mediaFound}`);
console.log(`Media uploaded:       ${overallReport.mediaUploaded}`);
console.log(`   - GPX files:       ${overallReport.gpxUploaded}`);
console.log(`   - Images:          ${overallReport.imagesUploaded}`);
console.log(`Media skipped (exist): ${overallReport.mediaSkipped}`);
console.log(`Errors:               ${overallReport.errors.length}`);
console.log(`Remaining URLs:       ${overallReport.remainingUrls.length}`);
if (overallReport.errors.length) {
  console.log("\nErrors:");
  for (const e of overallReport.errors) console.log(`  - ${e}`);
}
if (overallReport.remainingUrls.length) {
  console.log("\nRemaining external URLs (not migrated):");
  for (const u of overallReport.remainingUrls) console.log(`  - ${u}`);
}
console.log("\n=== Done ===\n");
process.exit(overallReport.errors.length ? 1 : 0);

async function importMedia(slug) {
  const report = {
    slug,
    found: 0, uploaded: 0, skipped: 0,
    gpxCount: 0, imageCount: 0,
    errors: [], media: [], buckets: [IMAGE_BUCKET, GPX_BUCKET],
    remainingUrls: [],
  };

  const roadbookDir = path.join(ROADBOOKS_DIR, slug);
  const jsonPath = path.join(roadbookDir, "roadbook.json");

  if (!fs.existsSync(jsonPath)) {
    const msg = `roadbook.json not found at ${jsonPath}`;
    console.error(msg);
    overallReport.errors.push(`${slug}: ${msg}`);
    return;
  }

  const v1 = readJson(jsonPath);
  if (!v1) {
    const msg = `Failed to parse roadbook.json for ${slug}`;
    console.error(msg);
    overallReport.errors.push(`${slug}: ${msg}`);
    return;
  }

  // ── Dry-run display ──────────────────────────────────────────
  if (dryRun) {
    console.log(`\n=== DRY RUN: ${slug} ===\n`);
    const refs = [];

    const coverRef = v1.metadata?.coverImage;
    if (coverRef) refs.push({ role: "cover", ref: coverRef, source: "metadata.coverImage" });
    const officialGpx = v1.summary?.official?.gpx;
    if (officialGpx) refs.push({ role: "gpx-official", ref: officialGpx, source: "summary.official.gpx" });
    const stagesTotalGpx = v1.summary?.stagesTotal?.gpx;
    if (stagesTotalGpx) refs.push({ role: "gpx-total", ref: stagesTotalGpx, source: "summary.stagesTotal.gpx" });

  // Stages
  for (const s of (v1.stages || [])) {
    const stageNum = s.stage || "?";
    if (s.stagePhoto) refs.push({ role: "stage-photo", ref: s.stagePhoto, source: `stage ${stageNum}.stagePhoto` });
    if (s.gpx) refs.push({ role: "gpx-stage", ref: s.gpx, source: `stage ${stageNum}.gpx` });
    if (s.accommodation?.photo) refs.push({ role: "accommodation-photo", ref: s.accommodation.photo, source: `stage ${stageNum}.accommodation.photo` });
    if (s.alternativeAccommodation?.photo) refs.push({ role: "alternative-photo", ref: s.alternativeAccommodation.photo, source: `stage ${stageNum}.alternativeAccommodation.photo` });
    if (Array.isArray(s.accommodation?.alternatives)) {
      s.accommodation.alternatives.forEach((alt, ai) => {
        if (alt.photo) refs.push({ role: "alternative-accommodation-photo", ref: alt.photo, source: `stage ${stageNum}.accommodation.alternatives[${ai}].photo` });
      });
    }
    // POIs from all possible arrays
    for (const list of [s.pois, s.pointsOfInterest, s.interest]) {
      if (Array.isArray(list)) {
        list.forEach((p, pi) => {
          const img = p.image || p.photo_url;
          if (img) refs.push({ role: "poi-photo", ref: img, source: `stage ${stageNum}.pois[${pi}].${p.image ? "image" : "photo_url"}` });
        });
      }
    }
    // Substep/variant photos and GPX
    for (const sub of (s.substeps || [])) {
      if (sub.stagePhoto) refs.push({ role: "variant-photo", ref: sub.stagePhoto, source: `stage ${stageNum}.substep.${sub.name}.stagePhoto` });
      if (sub.gpx) refs.push({ role: "gpx-variant", ref: sub.gpx, source: `stage ${stageNum}.substep.${sub.name}.gpx` });
      if (sub.accommodation?.photo) refs.push({ role: "variant-accommodation-photo", ref: sub.accommodation.photo, source: `stage ${stageNum}.substep.${sub.name}.accommodation.photo` });
      for (const list of [sub.pois, sub.pointsOfInterest, sub.interest]) {
        if (Array.isArray(list)) {
          list.forEach((p, pi) => {
            const img = p.image || p.photo_url;
            if (img) refs.push({ role: "variant-poi-photo", ref: img, source: `stage ${stageNum}.substep.${sub.name}.pois[${pi}].image` });
          });
        }
      }
    }
  }

  // Top-level variants
  for (const v of (v1.variants || [])) {
    if (v.stagePhoto) refs.push({ role: "variant-photo", ref: v.stagePhoto, source: `variant.${v.name}.stagePhoto` });
    if (v.gpx) refs.push({ role: "gpx-variant", ref: v.gpx, source: `variant.${v.name}.gpx` });
  }

  // Classify references
  const local = [], remote = [];
  for (const r of refs) {
    if (isLocalFile(r.ref)) {
      const resolved = resolveFile(roadbookDir, r.ref);
      if (resolved) {
        const stat = fs.statSync(resolved);
        r.resolvedPath = resolved;
        r.size = stat.size;
        r.ext = getFileExtension(resolved);
        local.push(r);
      } else {
        r.missing = true;
        local.push(r);
      }
    } else {
      remote.push(r);
    }
  }

  console.log("Media references found in roadbook.json:");
  console.log(`  Local files referenced: ${local.length}`);
  console.log(`  Remote URLs: ${remote.length}`);
  console.log("");

  if (local.length > 0) {
    console.log("Local file details:");
    for (const r of local) {
      const status = r.missing ? "MISSING" : `${(r.size / 1024).toFixed(1)} KB`;
      console.log(`  [${r.role}] ${r.ref} -> ${status} (${r.source})`);
    }
    console.log("");
  }

  if (remote.length > 0) {
    console.log("Remote URLs (will NOT be uploaded):");
    for (const r of remote) {
      console.log(`  [${r.role}] ${r.ref.substring(0, 100)} (${r.source})`);
    }
    console.log("");
  }

  // Also scan the directory for orphan media files not referenced
  const allFiles = [];
  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "data" && entry.name !== "gpx" && entry.name !== "assets") scanDir(full);
        else scanDir(full);
      } else if (entry.name !== ".gitkeep" && entry.name !== "roadbook.json") {
        allFiles.push(full);
      }
    }
  }
  scanDir(roadbookDir);

  const referencedPaths = new Set(local.filter(r => r.resolvedPath).map(r => path.resolve(r.resolvedPath)));
  const orphanFiles = allFiles.filter(f => !referencedPaths.has(path.resolve(f)));

  if (orphanFiles.length > 0) {
    console.log("Orphan files (on disk but not referenced in roadbook.json):");
    for (const f of orphanFiles) {
      const rel = path.relative(roadbookDir, f);
      const stat = fs.statSync(f);
      console.log(`  ${rel} (${(stat.size / 1024).toFixed(1)} KB)`);
    }
    console.log("");
  }

  console.log("=== Dry-run complete. No data written. ===\n");
  return;
}

// ── Import mode ──────────────────────────────────────────────
console.log(`\n=== IMPORT MEDIA: ${slug} ===\n`);

report.buckets = [IMAGE_BUCKET, GPX_BUCKET];

// ── Step 0: Look up the roadbook ─────────────────────────────
console.log("Looking up roadbook in database...");
const { data: roadbook, error: rbError } = await supabase
  .from("roadbooks")
  .select("id, slug, owner_id, cover_image_url, cover_media_id, metadata")
  .eq("slug", slug)
  .maybeSingle();

if (rbError) {
  console.error("Error looking up roadbook:", rbError.message);
  overallReport.errors.push(`${slug}: ${rbError.message}`);
  return;
}
if (!roadbook) {
  const msg = `Roadbook "${slug}" not found in database. Run import-v1-roadbook.js first.`;
  console.error(msg);
  overallReport.errors.push(msg);
  return;
}
console.log(`Roadbook found: id=${roadbook.id}, owner=${roadbook.owner_id}\n`);

const roadbookId = roadbook.id;
const ownerId = roadbook.owner_id;

// ── Step 1: Collect all media references ─────────────────────
const mediaOps = []; // { role, ref, filePath, bucket, storagePath, mimeType, stageId, poiId, variantId }

// Helper to create storage path
function storagePath(role, fileName) {
  const base = `roadbooks/${slug}`;
  const rolePaths = {
    "cover": `${base}/cover`,
    "gallery": `${base}/gallery`,
    "stage-photo": `${base}/stages`,
    "poi-photo": `${base}/poi`,
    "variant-photo": `${base}/stages`,
    "accommodation-photo": `${base}/accommodation`,
    "alternative-accommodation-photo": `${base}/accommodation`,
    "alternative-photo": `${base}/accommodation`,
    "variant-accommodation-photo": `${base}/accommodation`,
    "variant-poi-photo": `${base}/poi`,
    "gpx-official": `${base}/gpx`,
    "gpx-total": `${base}/gpx`,
    "gpx-stage": `${base}/gpx`,
    "gpx-variant": `${base}/gpx`,
  };
  const dir = rolePaths[role] || `${base}/other`;
  return `${dir}/${fileName}`;
}

function bucketFor(role) {
  return role.startsWith("gpx-") ? GPX_BUCKET : IMAGE_BUCKET;
}

// Process cover image
const coverRef = v1.metadata?.coverImage;
if (coverRef && isLocalFile(coverRef)) {
  const resolved = resolveFile(roadbookDir, coverRef);
  if (resolved) {
    const ext = getFileExtension(resolved);
    mediaOps.push({
      role: "cover",
      ref: coverRef,
      filePath: resolved,
      bucket: IMAGE_BUCKET,
      storagePath: storagePath("cover", `cover${ext}`),
      mimeType: getMimeType(ext),
      targetField: "cover_image_url",
      targetTable: null, // will be updated on roadbook
    });
  }
}

// Process summary GPX
for (const [role, gpxRef, source] of [
  ["gpx-official", v1.summary?.official?.gpx, "official"],
  ["gpx-total", v1.summary?.stagesTotal?.gpx, "stagesTotal"],
]) {
  if (gpxRef && isLocalFile(gpxRef)) {
    const resolved = resolveFile(roadbookDir, gpxRef);
    if (resolved) {
      const fileName = path.basename(resolved);
      mediaOps.push({
        role,
        ref: gpxRef,
        filePath: resolved,
        bucket: GPX_BUCKET,
        storagePath: storagePath(role, fileName),
        mimeType: "application/gpx+xml",
        targetField: "gpx_url",
        targetTable: "roadbooks",
        targetSource: source,
      });
    }
  }
}

// Process stages
const stages = v1.stages || [];
const stageLookup = {}; // V1 stage number -> V2 stage id

// First, load all V2 stages for this roadbook
const { data: v2Stages } = await supabase
  .from("stages")
  .select("id, stage_number, gpx_url, stage_photo_url, accommodation_photo")
  .eq("roadbook_id", roadbookId);

if (v2Stages) {
  for (const s of v2Stages) {
    stageLookup[s.stage_number] = s;
  }
}
console.log(`Found ${Object.keys(stageLookup).length} stages in database.\n`);

for (const s of stages) {
  const stageNum = s.stage;
  const v2Stage = stageLookup[stageNum];
  const stageId = v2Stage?.id || null;

  // Stage photo
  if (s.stagePhoto && isLocalFile(s.stagePhoto)) {
    const resolved = resolveFile(roadbookDir, s.stagePhoto);
    if (resolved) {
      const ext = getFileExtension(resolved);
      mediaOps.push({
        role: "stage-photo",
        ref: s.stagePhoto,
        filePath: resolved,
        bucket: IMAGE_BUCKET,
        storagePath: storagePath("stage-photo", `stage-${String(stageNum).padStart(2, "0")}${ext}`),
        mimeType: getMimeType(ext),
        stageId,
        targetField: "stage_photo_url",
        targetTable: "stages",
        targetStageNumber: stageNum,
      });
    }
  }

  // Stage GPX
  if (s.gpx && isLocalFile(s.gpx)) {
    const resolved = resolveFile(roadbookDir, s.gpx);
    if (resolved) {
      const fileName = path.basename(resolved);
      mediaOps.push({
        role: "gpx-stage",
        ref: s.gpx,
        filePath: resolved,
        bucket: GPX_BUCKET,
        storagePath: storagePath("gpx-stage", fileName),
        mimeType: "application/gpx+xml",
        stageId,
        targetField: "gpx_url",
        targetTable: "stages",
        targetStageNumber: stageNum,
      });
    }
  }

  // Accommodation photo
  if (s.accommodation?.photo && isLocalFile(s.accommodation.photo)) {
    const resolved = resolveFile(roadbookDir, s.accommodation.photo);
    if (resolved) {
      const ext = getFileExtension(resolved);
      mediaOps.push({
        role: "accommodation-photo",
        ref: s.accommodation.photo,
        filePath: resolved,
        bucket: IMAGE_BUCKET,
        storagePath: storagePath("accommodation-photo", `stage-${String(stageNum).padStart(2, "0")}-accommodation${ext}`),
        mimeType: getMimeType(ext),
        stageId,
        targetField: "accommodation_photo",
        targetTable: "stages",
        targetStageNumber: stageNum,
      });
    }
  }

  // Alternative accommodation photo
  if (s.alternativeAccommodation?.photo && isLocalFile(s.alternativeAccommodation.photo)) {
    const resolved = resolveFile(roadbookDir, s.alternativeAccommodation.photo);
    if (resolved) {
      const ext = getFileExtension(resolved);
      mediaOps.push({
        role: "alternative-photo",
        ref: s.alternativeAccommodation.photo,
        filePath: resolved,
        bucket: IMAGE_BUCKET,
        storagePath: storagePath("alternative-photo", `stage-${String(stageNum).padStart(2, "0")}-alternative${ext}`),
        mimeType: getMimeType(ext),
        stageId,
        targetField: null,
        targetTable: null,
        targetStageNumber: stageNum,
      });
    }
  }

  // Accommodation alternatives photos
  if (Array.isArray(s.accommodation?.alternatives)) {
    s.accommodation.alternatives.forEach((alt, ai) => {
      if (alt.photo && isLocalFile(alt.photo)) {
        const resolved = resolveFile(roadbookDir, alt.photo);
        if (resolved) {
          const ext = getFileExtension(resolved);
          mediaOps.push({
            role: "alternative-accommodation-photo",
            ref: alt.photo,
            filePath: resolved,
            bucket: IMAGE_BUCKET,
            storagePath: storagePath("alternative-accommodation-photo", `stage-${String(stageNum).padStart(2, "0")}-alt-${ai + 1}${ext}`),
            mimeType: getMimeType(ext),
            stageId,
            targetField: null,
            targetTable: null,
            targetStageNumber: stageNum,
          });
        }
      }
    });
  }

  // POI photos
  for (const list of [s.pois, s.pointsOfInterest, s.interest]) {
    if (Array.isArray(list)) {
      for (const p of list) {
        const img = p.image || p.photo_url;
        if (img && isLocalFile(img)) {
          const resolved = resolveFile(roadbookDir, img);
          if (resolved) {
            const ext = getFileExtension(resolved);
            const safeName = (p.name || "poi").replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50);
            mediaOps.push({
              role: "poi-photo",
              ref: img,
              filePath: resolved,
              bucket: IMAGE_BUCKET,
              storagePath: storagePath("poi-photo", `${safeName}${ext}`),
              mimeType: getMimeType(ext),
              stageId,
              targetField: "photo_url",
              targetTable: "stage_pois",
              targetPoiName: p.name,
            });
          }
        }
      }
    }
  }

  // Substep/variant photos and GPX
  for (const sub of (s.substeps || [])) {
    if (sub.stagePhoto && isLocalFile(sub.stagePhoto)) {
      const resolved = resolveFile(roadbookDir, sub.stagePhoto);
      if (resolved) {
        const ext = getFileExtension(resolved);
        mediaOps.push({
          role: "variant-photo",
          ref: sub.stagePhoto,
          filePath: resolved,
          bucket: IMAGE_BUCKET,
          storagePath: storagePath("variant-photo", `stage-${String(stageNum).padStart(2, "0")}-${(sub.name || "variant").replace(/[^a-zA-Z0-9_-]/g, "_")}${ext}`),
          mimeType: getMimeType(ext),
          stageId,
          targetField: null,
          targetTable: "stage_variants",
          targetVariantName: sub.name || sub.title,
        });
      }
    }
    if (sub.gpx && isLocalFile(sub.gpx)) {
      const resolved = resolveFile(roadbookDir, sub.gpx);
      if (resolved) {
        const fileName = path.basename(resolved);
        mediaOps.push({
          role: "gpx-variant",
          ref: sub.gpx,
          filePath: resolved,
          bucket: GPX_BUCKET,
          storagePath: storagePath("gpx-variant", fileName),
          mimeType: "application/gpx+xml",
          stageId,
          targetField: "gpx_url",
          targetTable: "stage_variants",
          targetVariantName: sub.name || sub.title,
        });
      }
    }
  }
}

// Top-level variants
for (const v of (v1.variants || [])) {
  if (v.stagePhoto && isLocalFile(v.stagePhoto)) {
    const resolved = resolveFile(roadbookDir, v.stagePhoto);
    if (resolved) {
      const ext = getFileExtension(resolved);
      mediaOps.push({
        role: "variant-photo",
        ref: v.stagePhoto,
        filePath: resolved,
        bucket: IMAGE_BUCKET,
        storagePath: storagePath("variant-photo", `${(v.name || "variant").replace(/[^a-zA-Z0-9_-]/g, "_")}${ext}`),
        mimeType: getMimeType(ext),
        stageId: null,
        targetField: null,
        targetTable: null,
      });
    }
  }
  if (v.gpx && isLocalFile(v.gpx)) {
    const resolved = resolveFile(roadbookDir, v.gpx);
    if (resolved) {
      const fileName = path.basename(resolved);
      mediaOps.push({
        role: "gpx-variant",
        ref: v.gpx,
        filePath: resolved,
        bucket: GPX_BUCKET,
        storagePath: storagePath("gpx-variant", fileName),
        mimeType: "application/gpx+xml",
        stageId: null,
        targetField: null,
        targetTable: null,
      });
    }
  }
}

// ── Step 2: Report what we found ─────────────────────────────
console.log(`Media operations planned: ${mediaOps.length}`);
const byRole = {};
for (const op of mediaOps) {
  byRole[op.role] = (byRole[op.role] || 0) + 1;
}
for (const [role, count] of Object.entries(byRole)) {
  console.log(`  ${role}: ${count}`);
}
console.log("");

if (mediaOps.length === 0) {
  console.log("No local media files to import. All media references are external URLs or missing files.");
  overallReport.mediaSkipped += 0;
  return;
}

// ── Step 3: Upload to Storage & create media records ────────
let uploadedCount = 0;
let skippedCount = 0;
const uploadedMedia = []; // { op, mediaId, publicUrl }

for (const op of mediaOps) {
  report.found++;
  const storageKey = op.storagePath.replace(/\\/g, "/");

  // Check if this file already exists in storage
  const { data: existingMedia } = await supabase
    .from("media")
    .select("id, path, public_url")
    .eq("bucket", op.bucket)
    .eq("path", storageKey)
    .maybeSingle();

  if (existingMedia && !upsert) {
    console.log(`  SKIP ${op.role}: ${path.basename(op.filePath)} (already exists)`);
    skippedCount++;
    report.skipped++;
    uploadedMedia.push({ op, mediaId: existingMedia.id, publicUrl: existingMedia.public_url });
    continue;
  }

  console.log(`  UPLOAD ${op.role}: ${path.basename(op.filePath)} -> ${storageKey}`);

  // Read file
  const fileBuffer = fs.readFileSync(op.filePath);

  let uploadResult;
  if (existingMedia && upsert) {
    // Replace existing file
    const { error: removeError } = await supabase.storage
      .from(op.bucket)
      .remove([storageKey]);
    if (removeError) {
      console.error(`    Error removing existing file: ${removeError.message}`);
    }
    // Remove existing media record
    const { error: deleteError } = await supabase
      .from("media")
      .delete()
      .eq("id", existingMedia.id);
    if (deleteError) {
      console.error(`    Error deleting media record: ${deleteError.message}`);
    }
  }

  // Upload
  const { data: uploaded, error: uploadError } = await supabase.storage
    .from(op.bucket)
    .upload(storageKey, fileBuffer, {
      contentType: op.mimeType,
      upsert: true,
    });

  if (uploadError) {
    console.error(`    Upload error: ${uploadError.message}`);
    report.errors.push(`Upload ${op.role} ${path.basename(op.filePath)}: ${uploadError.message}`);
    continue;
  }

  // Get public URL (signed for non-public buckets)
  const { data: urlData } = await supabase.storage
    .from(op.bucket)
    .createSignedUrl(storageKey, 94608000); // 3 years

  const publicUrl = urlData?.signedUrl || null;

  // Create media record
  let mediaType = "image";
  if (op.role.startsWith("gpx-")) mediaType = "gpx";

  const mediaPayload = {
    bucket: op.bucket,
    path: storageKey,
    public_url: publicUrl,
    roadbook_id: roadbookId,
    stage_id: op.stageId || null,
    type: mediaType,
    file_name: path.basename(op.filePath),
    mime_type: op.mimeType,
    uploaded_by: ownerId,
    metadata: {
      role: op.role,
      original_ref: op.ref,
      source: "v1-import",
      imported_at: new Date().toISOString(),
      ...(op.targetStageNumber ? { stage_number: op.targetStageNumber } : {}),
      ...(op.targetPoiName ? { poi_name: op.targetPoiName } : {}),
    },
  };

  const { data: mediaRecord, error: mediaError } = await supabase
    .from("media")
    .insert(mediaPayload)
    .select("id")
    .single();

  if (mediaError) {
    // If unique constraint violation, fetch existing
    if (mediaError.code === "23505") {
      const { data: existing } = await supabase
        .from("media")
        .select("id, public_url")
        .eq("bucket", op.bucket)
        .eq("path", storageKey)
        .maybeSingle();
      if (existing) {
        uploadedMedia.push({ op, mediaId: existing.id, publicUrl: publicUrl });
        uploadedCount++;
        report.uploaded++;
        if (op.role.startsWith("gpx-")) report.gpxCount++; else report.imageCount++;
        console.log(`    Media record exists (id=${existing.id})`);
        continue;
      }
    }
    console.error(`    Media record error: ${mediaError.message}`);
    report.errors.push(`Media record ${op.role}: ${mediaError.message}`);
    continue;
  }

  uploadedMedia.push({ op, mediaId: mediaRecord.id, publicUrl });
  uploadedCount++;
  report.uploaded++;
  if (op.role.startsWith("gpx-")) report.gpxCount++; else report.imageCount++;
  console.log(`    OK (media id=${mediaRecord.id})`);
}

// ── Step 4: Update references ────────────────────────────────
console.log("\nUpdating references...");

for (const { op, mediaId, publicUrl } of uploadedMedia) {
  try {
    if (op.role === "cover") {
      // Update roadbook cover
      const { error: upErr } = await supabase
        .from("roadbooks")
        .update({ cover_media_id: mediaId, cover_image_url: publicUrl })
        .eq("id", roadbookId);
      if (upErr) report.errors.push(`Update cover: ${upErr.message}`);
      else console.log(`  Updated cover (media_id=${mediaId})`);
    }
    else if (op.role === "gpx-official" && op.targetTable === "roadbooks") {
      // Store in metadata
      const meta = { ...(roadbook.metadata || {}) };
      if (!meta.official) meta.official = {};
      meta.official.gpx = publicUrl;
      const { error: upErr } = await supabase
        .from("roadbooks")
        .update({ metadata: meta })
        .eq("id", roadbookId);
      if (upErr) report.errors.push(`Update official GPX: ${upErr.message}`);
      else console.log(`  Updated official GPX`);
    }
    else if (op.role === "gpx-total" && op.targetTable === "roadbooks") {
      const meta = { ...(roadbook.metadata || {}) };
      if (!meta.stagesTotal) meta.stagesTotal = {};
      meta.stagesTotal.gpx = publicUrl;
      const { error: upErr } = await supabase
        .from("roadbooks")
        .update({ gpx_url: publicUrl, metadata: meta })
        .eq("id", roadbookId);
      if (upErr) report.errors.push(`Update stagesTotal GPX: ${upErr.message}`);
      else console.log(`  Updated stagesTotal GPX`);
    }
    else if (op.targetTable === "stages" && op.stageId) {
      if (op.targetField === "stage_photo_url") {
        const { error: upErr } = await supabase
          .from("stages")
          .update({ stage_photo_url: publicUrl })
          .eq("id", op.stageId);
        if (upErr) report.errors.push(`Update stage ${op.targetStageNumber} photo: ${upErr.message}`);
        else console.log(`  Updated stage ${op.targetStageNumber} photo`);
      } else if (op.targetField === "gpx_url") {
        const { error: upErr } = await supabase
          .from("stages")
          .update({ gpx_url: publicUrl })
          .eq("id", op.stageId);
        if (upErr) report.errors.push(`Update stage ${op.targetStageNumber} GPX: ${upErr.message}`);
        else console.log(`  Updated stage ${op.targetStageNumber} GPX`);
      } else if (op.targetField === "accommodation_photo") {
        const { error: upErr } = await supabase
          .from("stages")
          .update({ accommodation_photo: publicUrl })
          .eq("id", op.stageId);
        if (upErr) report.errors.push(`Update stage ${op.targetStageNumber} accommodation photo: ${upErr.message}`);
        else console.log(`  Updated stage ${op.targetStageNumber} accommodation photo`);
      }
    }
    else if (op.targetTable === "stage_pois" && op.stageId && op.targetPoiName) {
      // Find the POI by stage_id and name
      const { data: pois } = await supabase
        .from("stage_pois")
        .select("id")
        .eq("stage_id", op.stageId)
        .eq("name", op.targetPoiName);
      if (pois && pois.length > 0) {
        for (const poi of pois) {
          const { error: upErr } = await supabase
            .from("stage_pois")
            .update({ photo_url: publicUrl })
            .eq("id", poi.id);
          if (upErr) report.errors.push(`Update POI "${op.targetPoiName}" photo: ${upErr.message}`);
          else console.log(`  Updated POI "${op.targetPoiName}" photo`);
        }
      }
    }
    else if (op.targetTable === "stage_variants" && op.stageId && op.targetVariantName) {
      // Find variant by stage_id and label
      const { data: variants } = await supabase
        .from("stage_variants")
        .select("id, metadata")
        .eq("stage_id", op.stageId)
        .eq("label", op.targetVariantName);
      if (variants && variants.length > 0) {
        for (const v of variants) {
          if (op.targetField === "gpx_url") {
            const { error: upErr } = await supabase
              .from("stage_variants")
              .update({ gpx_url: publicUrl })
              .eq("id", v.id);
            if (upErr) report.errors.push(`Update variant "${op.targetVariantName}" GPX: ${upErr.message}`);
            else console.log(`  Updated variant "${op.targetVariantName}" GPX`);
          } else {
            // Store photo in variant metadata
            const meta = { ...(v.metadata || {}), stagePhoto: publicUrl };
            const { error: upErr } = await supabase
              .from("stage_variants")
              .update({ metadata: meta })
              .eq("id", v.id);
            if (upErr) report.errors.push(`Update variant "${op.targetVariantName}" photo: ${upErr.message}`);
            else console.log(`  Updated variant "${op.targetVariantName}" photo`);
          }
        }
      }
    }
  } catch (err) {
    report.errors.push(`Update ref for ${op.role}: ${err.message}`);
  }
}

// ── Per-roadbook report ─────────────────────────────────────
console.log(`\n--- ${slug} MEDIA REPORT ---`);
console.log(`Media found:       ${report.found}`);
console.log(`Uploaded:          ${report.uploaded}`);
console.log(`Skipped (exist):   ${report.skipped}`);
console.log(`Errors:            ${report.errors.length}`);

// Accumulate into overall report
overallReport.mediaFound += report.found;
overallReport.mediaUploaded += report.uploaded;
overallReport.mediaSkipped += report.skipped;
overallReport.gpxUploaded += report.gpxCount;
overallReport.imagesUploaded += report.imageCount;
overallReport.errors.push(...report.errors.map(e => `${slug}: ${e}`));

// Collect remaining URLs
for (const s of (v1.stages || [])) {
  if (s.stagePhoto && !isLocalFile(s.stagePhoto)) overallReport.remainingUrls.push(`${slug}: stage ${s.stage} photo: ${s.stagePhoto}`);
  if (s.accommodation?.photo && !isLocalFile(s.accommodation.photo)) overallReport.remainingUrls.push(`${slug}: stage ${s.stage} accommodation: ${s.accommodation.photo}`);
  for (const list of [s.pois, s.pointsOfInterest, s.interest]) {
    if (Array.isArray(list)) list.forEach(p => {
      const img = p.image || p.photo_url;
      if (img && !isLocalFile(img)) overallReport.remainingUrls.push(`${slug}: stage ${s.stage} POI "${p.name}": ${img.substring(0, 100)}`);
    });
  }
}
}
