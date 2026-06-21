"use strict";

const ETAPES_URL =
    "https://docs.google.com/spreadsheets/d/1jhlhFPZF-oeAaiJ0pLKKagNMMa-SBxJ9HgnB4SMnyPU/gviz/tq?tqx=out:csv&sheet=etapes%20principales";

const VARIANTES_URL =
    "https://docs.google.com/spreadsheets/d/1jhlhFPZF-oeAaiJ0pLKKagNMMa-SBxJ9HgnB4SMnyPU/gviz/tq?tqx=out:csv&gid=15169789";

// Only list fallback files that are part of the current project tree.
const FALLBACK_PATHS = ["roadbook.json"];

const ERROR_MESSAGES = {
    NETWORK: "erreur réseau",
    INVALID_CSV: "CSV invalide",
    INVALID_SCHEMA: "schéma invalide"
};

const REQUIRED_ETAPES_HEADERS = [
    "etape",
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
    const rawEtape = getEtapeValue(record);
    const stageNumber = getStageNumberFromRecord(record);
    const dayLabel = firstValue(record, ["jour"]);
    const departure = firstValue(record, ["depart", "départ"]);
    const arrival = firstValue(record, ["arrivee", "arrivée"]);
    console.log("[Roadbook] Etape row", { rawEtape, stageNumber, departure, arrival });
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

function mapVariante(record) {
    const stageReference =
        firstValue(record, [
            "etape principale associe",
            "etape principale associé",
            "etape principale associee"
        ]) ?? firstValueByPrefix(record, "etape principale associ");

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

function extractStageNumber(value) {
    if (!value) return null;
    const match = String(value).match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
}

function getEtapeValue(record) {
    const candidates = ["etape", "étape", "Etape", "Étape"];
    for (const key of candidates) {
        const value = record[normalizeHeader(key)];
        if (value !== undefined) return value;
    }
    // Fallback: scan normalized keys already present in record
    const matchingKey = Object.keys(record).find(k => normalizeHeader(k) === "etape");
    return matchingKey !== undefined ? record[matchingKey] : null;
}

function getStageNumberFromRecord(record) {
    const rawEtape = getEtapeValue(record);
    if (!rawEtape) return null;
    const match = String(rawEtape).match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
}

function isMarkedAsPrincipale(record) {
    const raw = firstValue(record, ["etape", "étape"]);
    const normalized = normalizeHeader(raw || "");
    return /\(\s*principale\s*\)/.test(normalized);
}

function selectMainAndAlternativeEtapes(rows) {
    const groupedByStage = new Map();
    const standaloneRows = [];

    rows.forEach((row, index) => {
        const stageNumber = getStageNumberFromRecord(row);
        if (stageNumber === null) {
            standaloneRows.push({ row, index });
            return;
        }
        if (!groupedByStage.has(stageNumber)) {
            groupedByStage.set(stageNumber, []);
        }
        groupedByStage.get(stageNumber).push({ row, index });
    });

    // Log groupes construits
    groupedByStage.forEach((groupRows, stageNumber) => {
        const labels = groupRows.map(item => firstValue(item.row, ["etape", "étape"]) || `Étape ${stageNumber}`);
        console.log(`[Roadbook] Groupe étape ${stageNumber} (${labels.length} ligne(s)) :`, labels);
    });

    const mainRowsWithIndex = [];
    const alternativeRows = [];
    const retainedMainRows = [];
    const movedAlternativeRows = [];

    groupedByStage.forEach((groupRows, stageNumber) => {
        const principaleIndex = groupRows.findIndex(item => isMarkedAsPrincipale(item.row));
        const selectedIndex = principaleIndex >= 0 ? principaleIndex : 0;
        const selected = groupRows[selectedIndex];
        mainRowsWithIndex.push(selected);
        const selectedLabel = firstValue(selected.row, ["etape", "étape"]) || `Étape ${stageNumber}`;
        retainedMainRows.push(selectedLabel);
        console.log(`[Roadbook] Étape ${stageNumber} → principale retenue : "${selectedLabel}"`);

        groupRows.forEach((item, index) => {
            if (index === selectedIndex) return;
            alternativeRows.push(item.row);
            const altLabel = firstValue(item.row, ["etape", "étape"]) || `Étape ${stageNumber}`;
            movedAlternativeRows.push(altLabel);
            console.log(`[Roadbook] Étape ${stageNumber} → déplacée en alternative : "${altLabel}"`);
        });
    });

    standaloneRows.forEach(item => {
        mainRowsWithIndex.push(item);
        retainedMainRows.push(firstValue(item.row, ["etape", "étape"]) || "Étape ?");
    });

    mainRowsWithIndex.sort((a, b) => a.index - b.index);

    return {
        mainRows: mainRowsWithIndex.map(item => item.row),
        alternativeRows,
        retainedMainRows,
        movedAlternativeRows
    };
}

function attachVariants(stages, variants) {
    const byNumber = new Map();
    stages.forEach(stage => {
        if (stage.stage !== null) byNumber.set(stage.stage, stage);
    });

    let lastStageNumber = null;
    let attached = 0;
    let unmatched = 0;

    variants.forEach(variant => {
        const refNumber = extractStageNumber(variant.stageReference);
        if (refNumber !== null) {
            lastStageNumber = refNumber;
        }

        const effectiveStageNumber = refNumber !== null ? refNumber : lastStageNumber;

        if (effectiveStageNumber === null) {
            unmatched++;
            console.warn(`[Roadbook] Variante ignorée : "${variant.name}" — aucune référence d'étape.`);
            return;
        }

        const stage = byNumber.get(effectiveStageNumber);

        if (!stage) {
            unmatched++;
            console.warn(`[Roadbook] Variante ignorée : "${variant.name}" — étape ${effectiveStageNumber} introuvable.`);
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

function mapEtapeAsVariante(record) {
    const etapeLabel = getEtapeValue(record);
    const stageNumber = getStageNumberFromRecord(record);
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

    const descriptionParts = [];
    if (Number.isFinite(distance)) descriptionParts.push(`Distance : ${distance} km`);
    if (Number.isFinite(elevationGain)) descriptionParts.push(`D+ : ${elevationGain} m`);
    if (Number.isFinite(elevationLoss)) descriptionParts.push(`D− : ${elevationLoss} m`);
    if (notes) descriptionParts.push(notes);

    return {
        stageReference: stageNumber !== null ? String(stageNumber) : "",
        day: toNumber(firstValue(record, ["jour"])),
        name: etapeLabel || `Alternative${routeLabel ? ` — ${routeLabel}` : ""}`,
        type: "Alternative (étapes principales)",
        departure,
        arrival,
        distance,
        elevationGain,
        elevationLoss,
        distanceExtra: null,
        elevationGainExtra: null,
        elevationLossExtra: null,
        pointsOfInterest: pois,
        description: descriptionParts.length ? descriptionParts.join(" · ") : null,
        link: null,
        gpx,
        mapEmbedUrl,
        enabled: true
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

    console.log("[Roadbook] URL variantes utilisée :", VARIANTES_URL);
    console.log("[Roadbook] Nombre de lignes variantes lues :", variantesRows.length);
    if (variantesRows.length > 0) {
        console.log("[Roadbook] Première ligne variante parsée :", variantesRows[0]);
    }

    ensureSchema(etapesRows, REQUIRED_ETAPES_HEADERS);
    ensureSchema(variantesRows, REQUIRED_VARIANTES_HEADERS);

    const {
        mainRows,
        alternativeRows,
        retainedMainRows,
        movedAlternativeRows
    } = selectMainAndAlternativeEtapes(etapesRows);

    console.log("[Roadbook] Lignes principales retenues :", retainedMainRows);
    console.log("[Roadbook] Lignes déplacées en alternatives :", movedAlternativeRows);

    const stages = mainRows.map(mapEtape);
    const sheetAlternatives = alternativeRows.map(mapEtapeAsVariante);
    const variants = variantesRows.map(mapVariante);

    if (sheetAlternatives.length > 0) {
        attachVariants(stages, sheetAlternatives);
    }
    attachVariants(stages, variants);

    return {
        title: "Perinexus à vélo",
        description: "Roadbook d'itinérance à vélo.",
        stages,
        days: stages.map(stage => ({ ...stage }))
    };
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
