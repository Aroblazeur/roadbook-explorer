"use strict";

const ETAPES_URL =
    "https://docs.google.com/spreadsheets/d/1jhlhFPZF-oeAaiJ0pLKKagNMMa-SBxJ9HgnB4SMnyPU/gviz/tq?tqx=out:csv&sheet=etapes%20principales";

const VARIANTES_URL =
    "https://docs.google.com/spreadsheets/d/1jhlhFPZF-oeAaiJ0pLKKagNMMa-SBxJ9HgnB4SMnyPU/gviz/tq?tqx=out:csv&gid=15169789";

// Only list fallback files that are part of the current project tree.
const FALLBACK_PATHS = ["roadbook.json"];

const NO_STAGE_NUMBER_KEY = "__sans_numero__";

const ERROR_MESSAGES = {
    NETWORK: "erreur réseau",
    INVALID_CSV: "CSV invalide",
    INVALID_SCHEMA: "schéma invalide"
};

const REQUIRED_ETAPES_HEADERS = [
    "numero etape",
    "type",
    "jour",
    "depart",
    "arrivee",
    "distance (km)"
];

const REQUIRED_VARIANTES_HEADERS = [
    "nom variante"
];

function normalizeHeader(value) {
    return String(value || "")
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .toLowerCase();
}

function normalizeValue(value) {
    const trimmed = String(value ?? "").trim();
    return trimmed === "" ? null : trimmed;
}

function toNumber(value) {
    const normalized = normalizeValue(value);
    if (normalized === null) return null;
    const candidate = normalized.replace(/\s/g, "").replace(",", ".");
    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value) {
    const normalized = normalizeHeader(value);
    if (!normalized) return false;
    return ["1", "true", "vrai", "oui", "active", "activee", "activé", "activée", "x"].includes(normalized);
}

function splitMulti(value) {
    const normalized = normalizeValue(value);
    if (!normalized) return [];
    return normalized
        .split("---")
        .map(part => part.trim())
        .filter(Boolean);
}

function parseCsv(csvText) {
    const input = String(csvText ?? "").replace(/^\uFEFF/, "");
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < input.length; i += 1) {
        const char = input[i];
        const next = input[i + 1];

        if (char === '"') {
            if (inQuotes && next === '"') {
                cell += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (!inQuotes && char === ",") {
            row.push(cell);
            cell = "";
            continue;
        }

        if (!inQuotes && (char === "\n" || char === "\r")) {
            if (char === "\r" && next === "\n") i += 1;
            row.push(cell);
            if (row.some(value => String(value).trim() !== "")) {
                rows.push(row);
            }
            row = [];
            cell = "";
            continue;
        }

        cell += char;
    }

    if (inQuotes) {
        throw new Error(ERROR_MESSAGES.INVALID_CSV);
    }

    if (cell.length > 0 || row.length > 0) {
        row.push(cell);
        if (row.some(value => String(value).trim() !== "")) {
            rows.push(row);
        }
    }

    if (!rows.length) {
        throw new Error(ERROR_MESSAGES.INVALID_CSV);
    }

    const [headers, ...dataRows] = rows;
    const normalizedHeaders = headers.map(header => normalizeHeader(header));

    return dataRows.map(values => {
        const record = {};
        normalizedHeaders.forEach((header, index) => {
            record[header] = normalizeValue(values[index]);
        });
        return record;
    });
}

function ensureSchema(rows, requiredHeaders) {
    const sample = rows[0] || {};
    const missing = requiredHeaders.filter(header => !(header in sample));
    if (missing.length > 0) {
        throw new Error(ERROR_MESSAGES.INVALID_SCHEMA);
    }
}

function firstValue(record, candidates) {
    for (const key of candidates) {
        const value = record[normalizeHeader(key)];
        if (value !== undefined) return value;
    }
    return null;
}

function firstValueByPrefix(record, prefix) {
    const normalizedPrefix = normalizeHeader(prefix);
    const key = Object.keys(record).find(item => item.startsWith(normalizedPrefix));
    return key ? record[key] : null;
}

function sanitizeMapEmbedUrl(value) {
    const normalized = normalizeValue(value);
    if (!normalized) return null;

    let candidate = normalized;
    if (/^<iframe[\s>]/i.test(normalized)) {
        const srcMatch = normalized.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
        candidate = srcMatch ? (srcMatch[1] || srcMatch[2] || srcMatch[3] || "") : "";
    }

    try {
        const url = new URL(candidate);
        return url.origin === "https://mapy.com" && url.href.startsWith("https://mapy.com/")
            ? url.href
            : null;
    } catch (error) {
        return null;
    }
}

function buildAccommodation(record) {
    const alternativesValue =
        firstValue(record, ["hebergement alternatif", "hebergement alternative"]) ??
        firstValueByPrefix(record, "hebergement alte");

    return {
        name: firstValue(record, ["hebergement", "hébergement"]),
        url: firstValue(record, [
            "site web de l'hébergement",
            "site web de l hebergement",
            "site web de l'hebergement",
            "site web de l hébergement"
        ]),
        alternatives: splitMulti(alternativesValue),
        houseRentals: splitMulti(firstValue(record, ["possibilite de location maison", "possibilité de location maison"]))
    };
}

function mapEtape(record) {
    const stageNumber = toNumber(firstValue(record, ["numero etape"]));
    const dayLabel = firstValue(record, ["jour"]);
    const departure = firstValue(record, ["depart", "départ"]);
    const arrival = firstValue(record, ["arrivee", "arrivée"]);
    const notes = firstValue(record, ["notes"]);
    const pois = splitMulti(firstValue(record, ["point d'intérêt", "point d'interet"]));
    const gpx = firstValue(record, ["gpx"]);
    const mapEmbedUrl = sanitizeMapEmbedUrl(firstValue(record, ["lien d'integration de map"]));
    const distance = toNumber(firstValue(record, ["distance (km)"]));
    const elevationGain = toNumber(firstValue(record, ["d+ (m)"]));
    const elevationLoss = toNumber(firstValue(record, ["d− (m)", "d- (m)"]));
    const accommodation = buildAccommodation(record);
    const routeLabel = [departure, arrival].filter(Boolean).join(" → ");

    return {
        stage: stageNumber,
        day: dayLabel,
        departure,
        arrival,
        distance,
        elevationGain,
        elevationLoss,
        notes,
        gpx,
        mapEmbedUrl,
        accommodation,
        variants: [],
        title: `Étape ${stageNumber !== null ? stageNumber : "?"}${routeLabel ? ` - ${routeLabel}` : ""}`,
        elevation: elevationGain ?? 0,
        duration: "",
        description: "",
        noteItems: splitMulti(notes),
        pois,
        legacyAccommodation: accommodation.name || ""
    };
}

function mapEtapeVarianteFromEtape(record) {
    const stageNumber = toNumber(firstValue(record, ["numero etape"]));
    const departure = firstValue(record, ["depart", "départ"]);
    const arrival = firstValue(record, ["arrivee", "arrivée"]);
    const distance = toNumber(firstValue(record, ["distance (km)"]));
    const elevationGain = toNumber(firstValue(record, ["d+ (m)"]));
    const elevationLoss = toNumber(firstValue(record, ["d− (m)", "d- (m)"]));
    const gpx = firstValue(record, ["gpx"]);
    const pois = splitMulti(firstValue(record, ["point d'intérêt", "point d'interet"]));
    const notes = firstValue(record, ["notes"]);
    const mapEmbedUrl = sanitizeMapEmbedUrl(firstValue(record, ["lien d'integration de map"]));
    const routeLabel = [departure, arrival].filter(Boolean).join(" → ");

    return {
        stageReference: stageNumber,
        day: toNumber(firstValue(record, ["jour"])),
        name: routeLabel || `Variante étape ${stageNumber ?? "?"}`,
        type: "variante",
        departure,
        arrival,
        distance,
        elevationGain,
        elevationLoss,
        distanceExtra: null,
        elevationGainExtra: null,
        elevationLossExtra: null,
        pointsOfInterest: pois,
        description: notes,
        link: null,
        gpx,
        mapEmbedUrl,
        enabled: true
    };
}

function mapVariante(record) {
    const stageReference = toNumber(
        firstValue(record, [
            "etape principale associe",
            "etape principale associé",
            "etape principale associee"
        ])
    );

    return {
        stageReference,
        day: toNumber(firstValue(record, ["jour"])),
        name: firstValue(record, ["nom variante"]),
        type: firstValue(record, ["type"]),
        distanceExtra: toNumber(firstValue(record, ["distance supplementaire (km)", "distance supplémentaire (km)"])),
        elevationGainExtra: toNumber(firstValue(record, ["d+ supplementaire (m)", "d+ supplémentaire (m)"])),
        elevationLossExtra: toNumber(firstValue(record, ["d− supplementaire (m)", "d− supplémentaire (m)", "d- supplementaire (m)", "d- supplémentaire (m)"])),
        pointsOfInterest: splitMulti(firstValue(record, ["point d'intérêt", "point d'interet"])),
        description: firstValue(record, ["description / photos"]),
        link: firstValue(record, ["lien"]),
        gpx: firstValue(record, ["gpx"]),
        enabled: true
    };
}

function attachVariants(stages, variants) {
    const byNumber = new Map();
    stages.forEach(stage => {
        if (stage.stage !== null) byNumber.set(stage.stage, stage);
    });

    let attached = 0;
    let unmatched = 0;

    variants.forEach(variant => {
        const refNumber = toNumber(variant.stageReference);

        if (refNumber === null) {
            unmatched++;
            console.warn(`[Roadbook] Variante ignorée : "${variant.name}" — aucune référence d'étape.`);
            return;
        }

        const stage = byNumber.get(refNumber);

        if (!stage) {
            unmatched++;
            console.warn(`[Roadbook] Variante ignorée : "${variant.name}" — étape ${refNumber} introuvable.`);
            return;
        }

        stage.variants.push(variant);
        stage.pois.push(...variant.pointsOfInterest);
        attached++;
    });

    console.log(
        `Étapes : ${stages.length}\n` +
        `Variantes : ${variants.length}\n` +
        `Variantes rattachées : ${attached}\n` +
        `Variantes ignorées : ${unmatched}`
    );
}

function buildRoadbook(etapesRows, variantesRows) {
    // Group ALL rows by "Numero etape" — no row is discarded based on Type
    const groups = new Map();
    etapesRows.forEach(row => {
        const num = firstValue(row, ["numero etape"]);
        const key = num !== null ? String(num) : NO_STAGE_NUMBER_KEY;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    });

    const principaleRows = [];
    const etapeVarianteRows = [];

    groups.forEach(rows => {
        // Choose the row whose Type (normalised) contains "principale", else the first row
        const mainIndex = Math.max(0, rows.findIndex(row =>
            normalizeHeader(firstValue(row, ["type"]) || "").includes("principale")
        ));

        principaleRows.push(rows[mainIndex]);
        rows.forEach((row, i) => {
            if (i !== mainIndex) etapeVarianteRows.push(row);
        });
    });

    console.log(`[Roadbook] Groupes (étapes uniques) : ${groups.size}`);
    console.log(`[Roadbook] Lignes principales choisies : ${principaleRows.length}`);
    console.log(`[Roadbook] Lignes alternatives (étapes) : ${etapeVarianteRows.length}`);
    console.log(`[Roadbook] Lignes variantes (feuille variantes) : ${variantesRows.length}`);

    const stages = principaleRows.map(mapEtape);
    const etapeVariantes = etapeVarianteRows.map(mapEtapeVarianteFromEtape);
    const sheetVariantes = variantesRows.map(mapVariante);

    attachVariants(stages, [...etapeVariantes, ...sheetVariantes]);

    return {
        title: "Perinexus à vélo",
        description: "Roadbook d'itinérance à vélo.",
        stages,
        days: stages.map(stage => ({ ...stage }))
    };
}

async function fetchCsv(url) {
    let response;
    try {
        response = await fetch(url);
    } catch (error) {
        throw new Error(ERROR_MESSAGES.NETWORK);
    }

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return response.text();
}

async function loadGoogleSheetRoadbook() {
    const [etapesCsv, variantesCsv] = await Promise.all([
        fetchCsv(ETAPES_URL),
        fetchCsv(VARIANTES_URL)
    ]);

    const etapesRows = parseCsv(etapesCsv);
    const variantesRows = parseCsv(variantesCsv);

    ensureSchema(etapesRows, REQUIRED_ETAPES_HEADERS);
    ensureSchema(variantesRows, REQUIRED_VARIANTES_HEADERS);

    return buildRoadbook(etapesRows, variantesRows);
}

async function loadFallbackRoadbook() {
    async function loadNodeFallback(path) {
        const isNodeRuntime =
            typeof process !== "undefined" &&
            Boolean(process.versions && process.versions.node);

        if (!isNodeRuntime || typeof require !== "function") {
            return null;
        }

        let fs;
        let nodePath;
        try {
            fs = require("node:fs/promises");
            nodePath = require("node:path");
        } catch (error) {
            throw new Error("Fallback Node.js indisponible");
        }

        const absolutePath = nodePath.resolve(__dirname || process.cwd(), path);
        const content = await fs.readFile(absolutePath, "utf8");
        return JSON.parse(content);
    }

    const validPaths = FALLBACK_PATHS.filter(path =>
        typeof path === "string" && path.trim() !== "" && !path.startsWith("data/")
    );

    if (!validPaths.length) {
        const error = new Error("aucun chemin JSON local valide configuré");
        console.warn(`[Roadbook] Fallback JSON ignoré : ${error.message}.`);
        throw error;
    }

    let lastError = null;

    for (const path of validPaths) {
        try {
            const response = await fetch(path);
            if (!response.ok) {
                lastError = new Error(`HTTP ${response.status}`);
                console.warn(`[Roadbook] Fallback JSON échoué (${path}) : ${lastError.message}.`);
                continue;
            }
            const content = await response.text();
            try {
                return JSON.parse(content);
            } catch (error) {
                lastError = new Error(`JSON invalide dans ${path}`);
                console.warn(`[Roadbook] Fallback JSON échoué (${path}) : ${lastError.message}.`);
                continue;
            }
        } catch (error) {
            lastError = error;
            const reason = error && error.message ? error.message : "erreur inconnue";
            console.warn(`[Roadbook] Fallback JSON échoué (${path}) : ${reason}.`);
        }

        try {
            const localFallback = await loadNodeFallback(path);
            if (localFallback) return localFallback;
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error(ERROR_MESSAGES.NETWORK);
}

function logFallbackError(error) {
    if (typeof console !== "undefined" && typeof console.warn === "function") {
        const message = error && error.message ? error.message : "erreur inconnue";
        console.warn(`Chargement Google Sheets échoué, utilisation du fallback JSON: ${message}`);
    }
}

async function loadRoadbook() {
    try {
        return await loadGoogleSheetRoadbook();
    } catch (error) {
        logFallbackError(error);
        try {
            return await loadFallbackRoadbook();
        } catch (fallbackError) {
            const sheetsReason = error && error.message ? error.message : "erreur inconnue";
            const fallbackReason = fallbackError && fallbackError.message ? fallbackError.message : "erreur inconnue";
            console.error(`[Roadbook] Aucune source disponible. Google Sheets : ${sheetsReason}. Fallback JSON : ${fallbackReason}.`);
            throw new Error("Roadbook indisponible : Google Sheets et le fichier JSON local n'ont pas pu être chargés.");
        }
    }
}

if (typeof window !== "undefined") {
    window.loadRoadbook = loadRoadbook;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        ETAPES_URL,
        VARIANTES_URL,
        parseCsv,
        sanitizeMapEmbedUrl,
        loadGoogleSheetRoadbook,
        loadFallbackRoadbook,
        loadRoadbook
    };
}
