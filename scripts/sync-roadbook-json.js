"use strict";

/**
 * Synchronise les Google Sheets existants vers les fichiers JSON canoniques.
 *
 * Source fonctionnelle pendant la transition : Google Sheets.
 * Cible canonique générée : roadbooks/<id>/roadbook.json.
 *
 * Usage :
 *   node scripts/sync-roadbook-json.js
 *   node scripts/sync-roadbook-json.js --roadbook=perinexus
 *   node scripts/sync-roadbook-json.js --all
 */

const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const ROADBOOKS_DIR = path.join(ROOT_DIR, "roadbooks");
const CATALOG_PATH = path.join(ROADBOOKS_DIR, "catalog.json");

const {
    loadGoogleSheetRoadbook,
    loadRoadbookLibraryMetadata
} = require(path.join(ROOT_DIR, "data-loader.js"));

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const ids = args.roadbook
        ? [sanitizeRoadbookId(args.roadbook)]
        : await readCatalogIds();

    const selectedIds = ids.filter(Boolean);
    if (!selectedIds.length) {
        throw new Error("Aucun roadbook à synchroniser.");
    }

    console.log(`[JSON Sync] Roadbooks ciblés : ${selectedIds.join(", ")}`);

    for (const id of selectedIds) {
        await syncRoadbook(id);
    }
}

async function syncRoadbook(id) {
    const config = loadRoadbookConfig(id);
    const outputPath = path.join(ROADBOOKS_DIR, id, "roadbook.json");

    if (!config.googleSheetId) {
        console.warn(`[JSON Sync] ${id} ignoré : googleSheetId absent.`);
        return;
    }

    console.log(`[JSON Sync] Import Google Sheets → JSON : ${id}`);
    const roadbook = await loadGoogleSheetRoadbook(config);
    const [metadata] = await loadRoadbookLibraryMetadata([config]);
    const payload = buildCanonicalPayload(roadbook, metadata, config);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

    console.log(`[JSON Sync] Écrit : ${path.relative(ROOT_DIR, outputPath)}`);
}

function buildCanonicalPayload(roadbook, metadata = {}, config = {}) {
    return {
        id: roadbook.id || config.id,
        title: metadata.title || roadbook.title || config.title || config.id,
        description: metadata.description || roadbook.description || config.description || "",
        metadata: {
            activity: metadata.activity || config.activity || config.options?.activity || "",
            destination: metadata.destination || config.destination || config.options?.destination || "",
            project: metadata.project || config.project || config.options?.project || "",
            projectStatus: metadata.projectStatus || "",
            coverImage: metadata.coverImage || config.coverImage || config.options?.coverImage || "",
            generatedAt: new Date().toISOString(),
            source: "google-sheets",
            googleSheetId: config.googleSheetId || ""
        },
        summary: roadbook.summary || {},
        stages: Array.isArray(roadbook.stages) ? roadbook.stages : [],
        variants: collectVariants(roadbook.stages),
        accommodation: collectAccommodations(roadbook.days || roadbook.stages),
        pois: collectPois(roadbook.days || roadbook.stages),
        notes: collectNotes(roadbook.days || roadbook.stages),
        days: Array.isArray(roadbook.days) ? roadbook.days : []
    };
}

function collectVariants(stages = []) {
    return stages.flatMap(stage =>
        Array.isArray(stage?.substeps)
            ? stage.substeps.map(substep => ({
                ...substep,
                parentStage: substep.parentStage ?? stage.stage,
                parentStageReference: substep.parentStageReference ?? stage.stage
            }))
            : []
    );
}

function collectAccommodations(entries = []) {
    const seen = new Set();
    return safeArray(entries).flatMap(entry => {
        const accommodation = entry?.accommodation;
        if (!accommodation || typeof accommodation !== "object") return [];
        const items = [
            {
                stage: entry.stage,
                role: "primary",
                name: accommodation.name || "",
                website: accommodation.website || accommodation.url || "",
                photo: accommodation.photo || ""
            },
            ...safeArray(accommodation.alternatives).map(alternative => ({
                stage: entry.stage,
                role: "alternative",
                name: alternative.name || "",
                website: alternative.url || alternative.website || "",
                photo: alternative.photo || ""
            }))
        ];

        return items.filter(item => {
            const key = `${entry.id || entry.stage}:${item.role}:${item.website || item.name}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return item.name || item.website || item.photo;
        });
    });
}

function collectPois(entries = []) {
    const seen = new Set();
    return safeArray(entries).flatMap(entry =>
        safeArray(entry?.pois || entry?.pointsOfInterest || entry?.interest)
            .filter(poi => poi?.name)
            .map(poi => ({ stage: entry.stage, ...poi }))
            .filter(poi => {
                const key = `${entry.id || entry.stage}:${poi.name}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
    );
}

function collectNotes(entries = []) {
    return safeArray(entries).flatMap(entry =>
        safeArray(entry?.noteItems)
            .filter(note => note?.text)
            .map(note => ({
                stage: entry.stage,
                text: note.text,
                photo: note.photo || ""
            }))
    );
}

async function readCatalogIds() {
    const content = await fs.readFile(CATALOG_PATH, "utf8");
    const catalog = JSON.parse(content);
    return safeArray(catalog.roadbooks).map(sanitizeRoadbookId).filter(Boolean);
}

function loadRoadbookConfig(id) {
    global.ROADBOOK_CONFIGS = {};
    const configPath = path.join(ROADBOOKS_DIR, id, "config.js");
    delete require.cache[require.resolve(configPath)];
    require(configPath);

    const config = global.ROADBOOK_CONFIGS?.[id];
    if (!config) throw new Error(`Configuration introuvable pour ${id}.`);
    return config;
}

function parseArgs(argv) {
    return argv.reduce((accumulator, arg) => {
        const match = arg.match(/^--([a-z][a-z0-9-]*)(?:=(.*))?$/i);
        if (match) accumulator[match[1]] = match[2] ?? true;
        return accumulator;
    }, {});
}

function sanitizeRoadbookId(value) {
    const id = String(value || "").trim().toLowerCase();
    return /^[a-z0-9-]+$/.test(id) ? id : "";
}

function safeArray(value) {
    return Array.isArray(value) ? value : [];
}

main().catch(error => {
    console.error("[JSON Sync] Échec :", error.message);
    process.exit(1);
});
