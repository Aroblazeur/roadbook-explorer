"use strict";

// Each roadbook owns its canonical JSON file at roadbooks/<id>/roadbook.json.
const NETWORK_FIRST_FETCH_OPTIONS = { cache: "no-store" };
const LIBRARY_CONFIGURATION_SHEET = Object.freeze({ name: "Configuration" });

function currentRoadbookConfig() {
    if (typeof window !== "undefined" && window.currentRoadbookConfig) {
        return window.currentRoadbookConfig;
    }

    if (typeof globalThis !== "undefined" && globalThis.currentRoadbookConfig) {
        return globalThis.currentRoadbookConfig;
    }

    return {
        id: "perinexus",
        shortId: "perinexus",
        title: "RoadBook Explorer",
        description: "Roadbook d'itinérance à vélo.",
        sheets: {},
        forms: {},
        fallbackJsonPaths: []
    };
}

function sanitizeRoadbookId(value) {
    const id = String(value || "").trim().toLowerCase();
    return /^[a-z0-9-]+$/.test(id) ? id : "";
}

function canonicalRoadbookJsonPath(config = currentRoadbookConfig()) {
    const id = sanitizeRoadbookId(config?.id || config?.shortId);
    return id ? `roadbooks/${id}/roadbook.json` : "";
}

function roadbookJsonPaths(config = currentRoadbookConfig()) {
    const candidates = [
        config?.jsonPath,
        canonicalRoadbookJsonPath(config),
        ...(Array.isArray(config?.fallbackJsonPaths) ? config.fallbackJsonPaths : [])
    ];

    return [...new Set(candidates
        .map(path => String(path || "").trim())
        .filter(path =>
            path &&
            !path.startsWith("/") &&
            !path.startsWith("data/") &&
            !path.includes("\\") &&
            !path.split("/").includes("..")
        )
    )];
}

async function waitForRoadbookConfig() {
    if (typeof window !== "undefined" && window.currentRoadbookConfig) {
        return window.currentRoadbookConfig;
    }
    if (typeof window !== "undefined" && window.roadbookConfigReady) {
        return window.roadbookConfigReady;
    }
    return currentRoadbookConfig();
}

function googleSheetCsvUrl(sheetConfig, config = currentRoadbookConfig()) {
    if (!sheetConfig) return "";
    if (typeof sheetConfig === "string") {
        return buildGoogleSheetCsvUrl(config.googleSheetId, { name: sheetConfig });
    }
    if (sheetConfig.url) return sheetConfig.url;
    return buildGoogleSheetCsvUrl(sheetConfig.googleSheetId || config.googleSheetId, sheetConfig);
}

function buildGoogleSheetCsvUrl(sheetId, sheetConfig = {}) {
    if (!sheetId) return "";
    const url = new URL(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq`);
    url.searchParams.set("tqx", "out:csv");
    if (sheetConfig.gid) {
        url.searchParams.set("gid", String(sheetConfig.gid));
    } else if (sheetConfig.name) {
        url.searchParams.set("sheet", sheetConfig.name);
    }
    return url.href;
}

const ERROR_MESSAGES = {
    NETWORK: "erreur réseau",
    INVALID_CSV: "CSV invalide",
    INVALID_SCHEMA: "schéma invalide"
};

const REQUIRED_ETAPES_HEADERS = [
    "numero etape",
    "jour",
    "depart",
    "arrivee",
    "distance (km)"
];

const REQUIRED_VARIANTES_HEADERS = [
    "nom variante"
];

const REQUIRED_TRAVELER_NOTES_HEADERS = [
    "etape",
    "note",
    "photo"
];

const ADDED_ACCOMMODATION_STAGE_HEADERS = ["etape", "numero etape", "étape"];
const ADDED_ACCOMMODATION_URL_HEADERS = [
    "url hebergement",
    "url hébergement",
    "url de l'hebergement",
    "url de l'hébergement",
    "url",
    "lien hebergement",
    "lien hébergement",
    "lien"
];
const ADDED_ACCOMMODATION_NAME_HEADERS = [
    "nom"
];
const ADDED_ACCOMMODATION_PHOTO_HEADERS = [
    "photo",
    "photo hebergement",
    "photo hébergement"
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

function splitMulti(value, { preserveEmpty = false } = {}) {
    const normalized = normalizeValue(value);
    if (!normalized) return [];
    const parts = normalized
        .split("---")
        .map(part => part.trim());
    return preserveEmpty ? parts : parts.filter(Boolean);
}

function sanitizeImageUrl(value) {
    const candidate = String(value ?? "").trim();
    if (!candidate) return "";

    if (/^https?:\/\//i.test(candidate)) {
        try {
            const url = new URL(candidate);
            return ["http:", "https:"].includes(url.protocol) ? url.href : "";
        } catch (error) {
            return "";
        }
    }

    const path = candidate.split(/[?#]/)[0];
    const unsafe =
        !path ||
        candidate.startsWith("//") ||
        candidate.includes("\\") ||
        /^[a-z][a-z0-9+.-]*:/i.test(candidate) ||
        path.startsWith("/") ||
        path.split("/").includes("..");

    return unsafe ? "" : candidate;
}

function sanitizeRoadbookAssetName(value) {
    const candidate = String(value ?? "").trim();
    if (!candidate) return "";
    if (candidate.startsWith("//") || candidate.includes("\\") || /^[a-z][a-z0-9+.-]*:/i.test(candidate)) return "";
    if (candidate.startsWith("/") || candidate.includes("?") || candidate.includes("#")) return "";

    const parts = candidate.split("/");
    if (parts.some(part => !part || part === "." || part === "..")) return "";
    return parts.map(part => encodeURIComponent(part)).join("/");
}

function roadbookDataAssetBase(config = currentRoadbookConfig()) {
    const id = String(config?.id || config?.shortId || "").trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(id)) return "";
    return `roadbooks/${id}/data`;
}

function resolveRoadbookDataImage(value, config = currentRoadbookConfig()) {
    const candidate = String(value ?? "").trim();
    if (!candidate) return "";

    if (/^https?:\/\//i.test(candidate)) {
        return sanitizeImageUrl(candidate);
    }

    const filename = sanitizeRoadbookAssetName(candidate);
    const base = roadbookDataAssetBase(config);
    return filename && base ? `${base}/${filename}` : "";
}

function normalizeAccommodationType(value) {
    const normalized = normalizeHeader(value);
    if (!normalized) return "";
    const hasCamping = normalized.includes("camping");
    const hasHouse = normalized.includes("maison") || normalized.includes("gite") || normalized.includes("gîte") || normalized.includes("location");
    if (hasCamping && hasHouse) return "les deux";
    if (hasCamping) return "camping";
    if (hasHouse) return "maison";
    if (normalized.includes("deux")) return "les deux";
    return normalized;
}

function normalizeProjectStatus(value) {
    const normalized = normalizeHeader(value);
    if (!normalized) return "todo";
    if (["deja fait", "deja faits", "deja-fait", "fait", "termine", "done"].includes(normalized)) return "done";
    if (["a faire", "a-faire", "todo", "planned"].includes(normalized)) return "todo";
    return "todo";
}

function sanitizeNotePhotoUrl(value) {
    const candidate = String(value ?? "").trim();
    if (!candidate) return "";

    if (/^https:\/\//i.test(candidate)) {
        try {
            return new URL(candidate).protocol === "https:" ? candidate : "";
        } catch (error) {
            return "";
        }
    }

    const path = candidate.split(/[?#]/)[0];
    const unsafe =
        !path ||
        candidate.startsWith("//") ||
        candidate.includes("\\") ||
        /^[a-z][a-z0-9+.-]*:/i.test(candidate) ||
        path.startsWith("/") ||
        path.split("/").includes("..");

    return unsafe ? "" : candidate;
}

function sanitizeLinkUrl(value) {
    const candidate = String(value ?? "").trim();
    if (!candidate) return "";

    try {
        const url = new URL(candidate);
        return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch (error) {
        return "";
    }
}

function travelerNoteStage(value) {
    const direct = toNumber(value);
    if (direct !== null) return direct;
    const match = String(value ?? "").match(/\d+(?:[.,]\d+)?/);
    return match ? toNumber(match[0]) : null;
}

function mapTravelerNote(record) {
    return {
        stageReference: travelerNoteStage(firstValue(record, ["etape", "étape"])),
        createdAt: firstValue(record, ["horodateur", "timestamp", "date"]),
        text: firstValue(record, ["note"]),
        photo: sanitizeNotePhotoUrl(firstValue(record, ["photo"])),
        source: "travelerNote"
    };
}

function attachTravelerNotes(stages, rows) {
    const stagesByNumber = stages.reduce((map, stage) => {
        if (stage.stage === null || stage.stage === undefined) return map;
        const key = stage.stage;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(stage);
        return map;
    }, new Map());
    rows
        .map(mapTravelerNote)
        .filter(note => note.stageReference !== null && note.text)
        .forEach(note => {
            const targets = stagesByNumber.get(note.stageReference) || [];
            targets.forEach(stage => {
                if (!Array.isArray(stage.noteItems)) stage.noteItems = [];
                stage.noteItems.push({
                    text: note.text,
                    photo: note.photo,
                    createdAt: note.createdAt || "",
                    source: note.source
                });
            });
        });
}

function normalizeUrlKey(value) {
    const url = normalizeValue(value);
    if (!url) return "";
    try {
        const parsed = new URL(url);
        parsed.hash = "";
        parsed.hostname = parsed.hostname.toLowerCase();
        parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
        return parsed.href.toLowerCase();
    } catch (error) {
        return url.trim().replace(/\/+$/, "").toLowerCase();
    }
}

function compactKey(value) {
    return normalizeHeader(value).replace(/[^a-z0-9]/g, "");
}

function firstAddedAccommodationStageValue(record) {
    return (
        firstValue(record, ADDED_ACCOMMODATION_STAGE_HEADERS) ??
        firstValueByPrefix(record, "etape") ??
        firstValueByPrefix(record, "étape") ??
        record[Object.keys(record).find(key => compactKey(key).endsWith("tape"))] ??
        null
    );
}

function firstAddedAccommodationUrlValue(record) {
    const direct = firstValue(record, ADDED_ACCOMMODATION_URL_HEADERS);
    if (direct) return direct;

    const urlKey = Object.keys(record).find(key => {
        const compact = compactKey(key);
        return compact === "url" || compact.startsWith("url") || compact.includes("lien");
    });

    return urlKey ? record[urlKey] : null;
}

function mapAddedAccommodation(record) {
    return {
        stageReference: travelerNoteStage(firstAddedAccommodationStageValue(record)),
        createdAt: firstValue(record, ["horodateur", "timestamp", "date"]),
        url: firstAddedAccommodationUrlValue(record),
        name: firstValue(record, ADDED_ACCOMMODATION_NAME_HEADERS),
        photo: sanitizeImageUrl(firstValue(record, ADDED_ACCOMMODATION_PHOTO_HEADERS)),
        source: "addedAccommodation"
    };
}

function normalizeAlternativeAccommodationEntry(value, { name = "", photo = "" } = {}) {
    if (value && typeof value === "object") {
        const url = normalizeValue(value.url ?? value.website);
        if (!url) return null;
        return {
            url,
            name: normalizeValue(value.name) || normalizeValue(name) || "",
            photo: sanitizeImageUrl(value.photo || photo),
            createdAt: normalizeValue(value.createdAt) || "",
            source: normalizeValue(value.source) || ""
        };
    }

    const url = normalizeValue(value);
    if (!url) return null;
    return {
        url,
        name: normalizeValue(name) || "",
        photo: sanitizeImageUrl(photo)
    };
}

function buildAlternativeAccommodationEntries(urls, names = [], photos = []) {
    return urls
        .map((url, index) => normalizeAlternativeAccommodationEntry(url, {
            name: names[index] || "",
            photo: photos[index] || ""
        }))
        .filter(Boolean);
}

function syncAccommodationAlternatives(accommodation) {
    if (!accommodation || typeof accommodation !== "object") return;
    const names = Array.isArray(accommodation?.alternativeNames) ? accommodation.alternativeNames : [];
    const photos = Array.isArray(accommodation?.alternativePhotos) ? accommodation.alternativePhotos : [];
    const alternatives = Array.isArray(accommodation?.alternatives) ? accommodation.alternatives : [];

    accommodation.alternatives = buildAlternativeAccommodationEntries(alternatives, names, photos);
    accommodation.alternativeNames = accommodation.alternatives.map(entry => entry.name || "");
    accommodation.alternativePhotos = accommodation.alternatives.map(entry => entry.photo || "");
}

function syncStageAlternativeAccommodation(stage) {
    if (!stage || typeof stage !== "object") return;
    const firstAlternative = stage?.accommodation?.alternatives?.[0] || null;
    stage.alternativeAccommodation = {
        name: firstAlternative?.name || firstAlternative?.url || "",
        photo: firstAlternative?.photo || ""
    };
}

function attachAddedAccommodations(stages, rows) {
    const stagesByNumber = stages.reduce((map, stage) => {
        if (stage.stage === null || stage.stage === undefined) return map;
        const key = stage.stage;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(stage);
        return map;
    }, new Map());
    rows
        .map(mapAddedAccommodation)
        .filter(entry => entry.stageReference !== null && entry.url)
        .forEach(entry => {
            const targets = stagesByNumber.get(entry.stageReference) || [];
            targets.forEach(stage => {

            const accommodation = stage.accommodation || {};
            if (!Array.isArray(accommodation.alternatives)) accommodation.alternatives = [];
            syncAccommodationAlternatives(accommodation);

            const key = normalizeUrlKey(entry.url);
            if (!key) return;

            const mainKey = normalizeUrlKey(accommodation.website || accommodation.url);
            if (mainKey && mainKey === key) {
                if (entry.name) accommodation.name = entry.name;
                if (entry.photo) accommodation.photo = entry.photo;
                accommodation.createdAt = accommodation.createdAt || entry.createdAt || "";
                accommodation.source = accommodation.source || entry.source;
                stage.accommodation = accommodation;
                syncStageAlternativeAccommodation(stage);
                return;
            }

            const existingAlternative = accommodation.alternatives.find(item => normalizeUrlKey(item.url) === key);
            if (existingAlternative) {
                if (entry.name) existingAlternative.name = entry.name;
                if (entry.photo) existingAlternative.photo = entry.photo;
                existingAlternative.createdAt = existingAlternative.createdAt || entry.createdAt || "";
                existingAlternative.source = existingAlternative.source || entry.source;
            } else {
                accommodation.alternatives.push({
                    url: entry.url,
                    name: entry.name || "",
                    photo: entry.photo || "",
                    createdAt: entry.createdAt || "",
                    source: entry.source
                });
            }

            accommodation.alternativeNames = accommodation.alternatives.map(item => item.name || "");
            accommodation.alternativePhotos = accommodation.alternatives.map(item => item.photo || "");
            stage.accommodation = accommodation;
            syncStageAlternativeAccommodation(stage);
            });
        });
}

function buildPoiEntries(record) {
    const names = splitMulti(firstValue(record, ["point d'intérêt", "point d'interet"]));
    const images = splitMulti(firstValue(record, ["images poi", "image poi"]), { preserveEmpty: true });
    const links = splitMulti(firstValue(record, ["lien poi", "url poi"]), { preserveEmpty: true });
    const regions = splitMulti(
        firstValue(record, ["région", "region"]) ?? firstValueByPrefix(record, "region"),
        { preserveEmpty: true }
    );

    return names.map((name, index) => ({
        name,
        image: images[index] || "",
        url: sanitizeLinkUrl(links[index] || ""),
        region: regions[index] || ""
    }));
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

    const records = dataRows.map(values => {
        const record = {};
        normalizedHeaders.forEach((header, index) => {
            record[header] = normalizeValue(values[index]);
        });
        return record;
    });

    Object.defineProperty(records, "headers", {
        value: normalizedHeaders,
        enumerable: false
    });
    return records;
}

function ensureSchema(rows, requiredHeaders) {
    const headers = rows[0] ? Object.keys(rows[0]) : (rows.headers || []);
    const missing = requiredHeaders.filter(header => !headers.includes(header));
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

function normalizedStageNumberLabel(record) {
    return normalizeHeader(firstValue(record, ["numero etape"]));
}

function summaryRowKind(record) {
    const labels = [
        normalizedStageNumberLabel(record),
        normalizeHeader(firstValue(record, ["type"]))
    ].filter(Boolean);

    for (const label of labels) {
        const compact = label.replace(/[^a-z0-9]/g, "");
        if (label === "total" || compact === "totalofficiel") return "official";
        if (
            compact === "totalparcours" ||
            compact === "totaldesetapes" ||
            (compact.startsWith("totaldes") && compact.endsWith("tapes"))
        ) {
            return "stagesTotal";
        }
    }

    return null;
}

function isUnlabeledSummaryRow(record) {
    const hasStageIdentity = [
        firstValue(record, ["numero etape"]),
        firstValue(record, ["depart", "départ"]),
        firstValue(record, ["arrivee", "arrivée"])
    ].some(value => normalizeValue(value));

    if (hasStageIdentity) return false;

    return [
        firstValue(record, ["distance (km)"]),
        firstValue(record, ["d+ (m)"]),
        firstValue(record, ["d− (m)", "d- (m)"]),
        firstValue(record, ["lien d'integration de map"]),
        firstValue(record, ["gpx"]),
        firstValue(record, ["lien"])
    ].some(value => normalizeValue(value));
}

function isSummaryRow(record) {
    return summaryRowKind(record) !== null || isUnlabeledSummaryRow(record);
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
        return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch (error) {
        return null;
    }
}

function buildAccommodation(record) {
    const alternativesValue =
        firstValue(record, ["hebergement alternatif", "hebergement alternative"]) ??
        firstValueByPrefix(record, "hebergement alte");
    const website = firstValue(record, [
        "site web de l'hébergement",
        "site web de l hebergement",
        "site web de l'hebergement",
        "site web de l hébergement"
    ]);
    const alternatives = splitMulti(alternativesValue);
    const alternativeNames = splitMulti(
        firstValue(record, ["nom hebergement alternatif", "nom hébergement alternatif"]),
        { preserveEmpty: true }
    );
    const alternativePhotos = splitMulti(
        firstValue(record, ["photo hebergement alternatif", "photo hébergement alternatif"]),
        { preserveEmpty: true }
    ).map(sanitizeImageUrl);
    const alternativeEntries = buildAlternativeAccommodationEntries(alternatives, alternativeNames, alternativePhotos);

    return {
        name: firstValue(record, ["hebergement", "hébergement"]) || "",
        website: website || "",
        url: website || "",
        photo: sanitizeImageUrl(firstValue(record, ["photo hebergement principal", "photo hébergement principal"])),
        alternatives: alternativeEntries,
        alternativeNames: alternativeEntries.map(entry => entry.name || ""),
        alternativePhotos: alternativeEntries.map(entry => entry.photo || "")
    };
}

function mapSummaryRow(record) {
    return {
        distance: toNumber(firstValue(record, ["distance (km)"])),
        elevationGain: toNumber(firstValue(record, ["d+ (m)"])),
        elevationLoss: toNumber(firstValue(record, ["d− (m)", "d- (m)"])),
        mapEmbedUrl: sanitizeMapEmbedUrl(firstValue(record, ["lien d'integration de map"])),
        gpx: firstValue(record, ["gpx"]),
        link: firstValue(record, ["lien"])
    };
}

function buildSummary(rows) {
    const summary = {
        official: null,
        stagesTotal: null,
        stagesTotalMarker: null
    };
    let unlabeledSummaryIndex = 0;

    rows.forEach(row => {
        let kind = summaryRowKind(row);
        if (!kind && isUnlabeledSummaryRow(row)) {
            kind = unlabeledSummaryIndex === 0 ? "official" : "stagesTotal";
            unlabeledSummaryIndex += 1;
        }

        if (kind === "official") {
            summary.official = mapSummaryRow(row);
        }
        if (kind === "stagesTotal") {
            summary.stagesTotalMarker = mapSummaryRow(row);
        }
    });

    return summary;
}

function addFinite(values) {
    const usable = values.filter(Number.isFinite);
    if (!usable.length) return null;
    return usable.reduce((total, value) => total + value, 0);
}

function buildComputedStagesTotal(stages, marker = null) {
    const source = Array.isArray(stages) ? stages : [];
    return {
        distance: addFinite(source.map(stage => stage.distance)),
        elevationGain: addFinite(source.map(stage => stage.elevationGain)),
        elevationLoss: addFinite(source.map(stage => stage.elevationLoss)),
        mapEmbedUrl: marker?.mapEmbedUrl ?? null,
        gpx: marker?.gpx ?? null,
        link: marker?.link ?? null
    };
}

function mapEtape(record, config = currentRoadbookConfig()) {
    const stageNumber = toNumber(firstValue(record, ["numero etape"]));
    const dayLabel = firstValue(record, ["jour"]);
    const departure = firstValue(record, ["depart", "départ"]);
    const arrival = firstValue(record, ["arrivee", "arrivée"]);
    const notes = firstValue(record, ["notes"]);
    const pois = buildPoiEntries(record);
    const gpx = firstValue(record, ["gpx"]);
    const mapEmbedUrl = sanitizeMapEmbedUrl(firstValue(record, ["lien d'integration de map"]));
    const stagePhoto = resolveRoadbookDataImage(
        firstValue(record, ["photo de l'etape", "photo de l'étape", "photo de l’etape", "photo etape"]) ??
        firstValueByPrefix(record, "photo de l"),
        config
    );
    const distance = toNumber(firstValue(record, ["distance (km)"]));
    const elevationGain = toNumber(firstValue(record, ["d+ (m)"]));
    const elevationLoss = toNumber(firstValue(record, ["d− (m)", "d- (m)"]));
    const accommodation = buildAccommodation(record);
    const firstAlternative = accommodation.alternatives[0] || null;
    const alternativeAccommodation = {
        name: firstAlternative?.name || firstAlternative?.url || "",
        photo: firstAlternative?.photo || ""
    };
    const accommodationType = normalizeAccommodationType(firstValue(record, ["type hebergement", "type hébergement"]));
    const type = "principale";
    const routeLabel = [departure, arrival].filter(Boolean).join(" → ");
    const stageLabel = firstValue(record, ["nom etape", "nom étape", "nom etapes", "nom étapes"]);

    return {
        id: `stage-${stageNumber ?? "unknown"}`,
        itemType: "main",
        isSubstep: false,
        hierarchyLevel: 0,
        parentStage: null,
        parentStageReference: null,
        stage: stageNumber,
        day: dayLabel,
        stageLabel,
        name: routeLabel || `Étape ${stageNumber !== null ? stageNumber : "?"}`,
        type,
        departure,
        arrival,
        distance,
        elevationGain,
        elevationLoss,
        notes,
        gpx,
        mapEmbedUrl,
        stagePhoto,
        accommodation,
        alternativeAccommodation,
        accommodationType,
        substeps: [],
        title: `Étape ${stageNumber !== null ? stageNumber : "?"}${routeLabel ? ` - ${routeLabel}` : ""}`,
        elevation: elevationGain ?? 0,
        duration: "",
        description: "",
        noteItems: splitMulti(notes),
        pois,
        pointsOfInterest: pois,
        interest: pois,
        restaurants: [],
        shops: [],
        water: [],
        warning: [],
        legacyAccommodation: accommodation.name || ""
    };
}

function mapSubstep(record) {
    const stageReference = toNumber(
        firstValue(record, [
            "etape principale associe",
            "etape principale associé",
            "etape principale associee",
            "numero etape",
            "etape"
        ])
    );
    const type = firstValue(record, ["type"]) || "option";
    const departure = firstValue(record, ["depart", "départ"]);
    const arrival = firstValue(record, ["arrivee", "arrivée"]);
    const distance = toNumber(firstValue(record, ["distance (km)"]));
    const elevationGain = toNumber(firstValue(record, ["d+ (m)"]));
    const elevationLoss = toNumber(firstValue(record, ["d− (m)", "d- (m)"]));
    const notes = firstValue(record, ["notes"]);
    const pois = buildPoiEntries(record);
    const gpx = firstValue(record, ["gpx"]);
    const mapEmbedUrl = sanitizeMapEmbedUrl(firstValue(record, ["lien d'integration de map"]));
    const accommodation = buildAccommodation(record);
    const firstAlternative = accommodation.alternatives[0] || null;
    const alternativeAccommodation = {
        name: firstAlternative?.name || firstAlternative?.url || "",
        photo: firstAlternative?.photo || ""
    };
    const accommodationType = normalizeAccommodationType(firstValue(record, ["type hebergement", "type hébergement"]));
    const name =
        firstValue(record, ["nom variante", "nom option", "nom"]) ||
        [departure, arrival].filter(Boolean).join(" → ") ||
        type ||
        `Alternative étape ${stageReference ?? "?"}`;

    return {
        id: `substep-${stageReference ?? "unknown"}-${compactKey(name) || "option"}`,
        itemType: "substep",
        isSubstep: true,
        hierarchyLevel: 1,
        parentStage: stageReference,
        parentStageReference: stageReference,
        stage: stageReference,
        stageReference,
        day: firstValue(record, ["jour"]),
        name,
        type,
        departure,
        arrival,
        distance,
        elevationGain,
        elevationLoss,
        distanceExtra: toNumber(firstValue(record, ["distance supplementaire (km)", "distance supplémentaire (km)"])),
        elevationGainExtra: toNumber(firstValue(record, ["d+ supplementaire (m)", "d+ supplémentaire (m)"])),
        elevationLossExtra: toNumber(firstValue(record, ["d− supplementaire (m)", "d− supplémentaire (m)", "d- supplementaire (m)", "d- supplémentaire (m)"])),
        pois,
        pointsOfInterest: pois,
        interest: pois,
        restaurants: [],
        shops: [],
        water: [],
        warning: [],
        notes,
        noteItems: splitMulti(notes),
        description: notes || firstValue(record, ["description / photos"]) || "",
        link: firstValue(record, ["lien"]),
        gpx,
        mapEmbedUrl,
        accommodation,
        alternativeAccommodation,
        accommodationType,
        substeps: [],
        title: buildSubstepTitle(type, departure, arrival, name),
        elevation: elevationGain ?? 0,
        duration: "",
        legacyAccommodation: accommodation.name || "",
        enabled: true
    };
}

function buildSubstepTitle(type, departure, arrival, name) {
    const label = type || "Option";
    const routeLabel = [departure, arrival].filter(Boolean).join(" → ");
    return routeLabel ? `${label} - ${routeLabel}` : label || name || "Option";
}

function attachSubsteps(stages, substeps) {
    const byNumber = new Map();
    stages.forEach(stage => {
        if (stage.stage !== null) byNumber.set(stage.stage, stage);
    });

    let attached = 0;
    let unmatched = 0;
    const attachedSubsteps = [];

    substeps.forEach(substep => {
        const refNumber = toNumber(substep.stageReference);

        if (refNumber === null) {
            unmatched++;
            console.warn(`[Roadbook] Sous-étape ignorée : "${substep.name}" — aucune référence d'étape.`);
            return;
        }

        const stage = byNumber.get(refNumber);

        if (!stage) {
            unmatched++;
            console.warn(`[Roadbook] Sous-étape ignorée : "${substep.name}" — étape ${refNumber} introuvable.`);
            return;
        }

        if (!Array.isArray(stage.substeps)) stage.substeps = [];
        const attachedSubstep = {
            ...substep,
            parentStage: refNumber,
            parentStageReference: refNumber,
            hierarchyLevel: 1,
            isSubstep: true,
            itemType: "substep",
            parentTitle: stage.title,
            pointsOfInterest: Array.isArray(substep.pointsOfInterest)
                ? [...substep.pointsOfInterest]
                : []
        };
        stage.substeps.push(attachedSubstep);
        attachedSubsteps.push(attachedSubstep);
        attached++;
    });

    console.log(
        `Étapes : ${stages.length}\n` +
        `Sous-étapes : ${substeps.length}\n` +
        `Sous-étapes rattachées : ${attached}\n` +
        `Sous-étapes ignorées : ${unmatched}`
    );

    return attachedSubsteps;
}

function buildNavigableStages(stages) {
    const days = [];
    stages.forEach(stage => {
        days.push(stage);
        if (Array.isArray(stage.substeps)) {
            stage.substeps.forEach(substep => days.push(substep));
        }
    });
    return days;
}

function buildRoadbook(etapesRows, variantesRows, travelerNotesRows = [], addedAccommodationRows = [], config = currentRoadbookConfig()) {
    const summary = buildSummary(etapesRows);
    const stageRows = etapesRows.filter(row => !isSummaryRow(row));
    const stages = stageRows.map(row => mapEtape(row, config));

    console.log(`[Roadbook] Lignes principales choisies : ${stages.length}`);
    console.log(`[Roadbook] Lignes sous-étapes (feuille Variante et option) : ${variantesRows.length}`);

    const substeps = variantesRows.map(mapSubstep);

    attachSubsteps(stages, substeps);
    const navigableStages = buildNavigableStages(stages);

    attachTravelerNotes(navigableStages, travelerNotesRows);
    summary.stagesTotal = buildComputedStagesTotal(stages, summary.stagesTotalMarker);
    attachAddedAccommodations(navigableStages, addedAccommodationRows);

    return {
        id: config.id || config.shortId || "roadbook",
        title: config.title || "RoadBook Explorer",
        description: config.description || "Roadbook d'itinérance à vélo.",
        summary,
        stages,
        days: navigableStages
    };
}

function safeArray(value) {
    return Array.isArray(value) ? value : [];
}

function normalizeAccommodationJson(value = {}) {
    if (typeof value === "string") {
        return {
            name: value,
            website: "",
            url: "",
            photo: "",
            alternatives: [],
            alternativeNames: [],
            alternativePhotos: []
        };
    }

    const source = value && typeof value === "object" ? value : {};
    const alternatives = safeArray(source.alternatives)
        .map(entry => normalizeAlternativeAccommodationEntry(entry))
        .filter(Boolean);

    return {
        name: normalizeValue(source.name) || "",
        website: normalizeValue(source.website || source.url) || "",
        url: normalizeValue(source.url || source.website) || "",
        photo: sanitizeImageUrl(source.photo),
        alternatives,
        alternativeNames: alternatives.map(entry => entry.name || ""),
        alternativePhotos: alternatives.map(entry => entry.photo || "")
    };
}

function normalizePoiJson(value) {
    if (typeof value === "string") {
        return { name: value, image: "", description: "", region: "" };
    }

    const source = value && typeof value === "object" ? value : {};
    const name = normalizeValue(source.name || source.title || source.label);
    if (!name) return null;

    return {
        name,
        image: sanitizeImageUrl(source.image),
        url: sanitizeLinkUrl(source.url || source.link),
        description: normalizeValue(source.description) || "",
        region: normalizeValue(source.region) || "",
        coordinates: source.coordinates || null
    };
}

function normalizeNoteJson(value) {
    if (typeof value === "string") {
        return value.trim() ? { text: value.trim(), photo: "" } : null;
    }

    const source = value && typeof value === "object" ? value : {};
    const text = normalizeValue(source.text || source.note || source.content);
    if (!text) return null;

    return {
        text,
        photo: sanitizeNotePhotoUrl(source.photo || source.image),
        createdAt: normalizeValue(source.createdAt) || "",
        source: normalizeValue(source.source) || ""
    };
}

function normalizeStageJson(stage, index = 0, options = {}) {
    const source = stage && typeof stage === "object" ? stage : {};
    const isSubstep = Boolean(options.isSubstep ?? source.isSubstep);
    const parentStage = toNumber(source.parentStage ?? source.parentStageReference ?? source.stageReference ?? options.parentStage);
    const stageNumber = toNumber(source.stage ?? source.number ?? source.numero) ?? (isSubstep ? parentStage : index + 1);
    const departure = normalizeValue(source.departure ?? source.depart ?? source.start) || "";
    const arrival = normalizeValue(source.arrival ?? source.arrivee ?? source.end) || "";
    const routeLabel = [departure, arrival].filter(Boolean).join(" â†’ ");
    const type = normalizeValue(source.type) || (isSubstep ? "option" : "principale");
    const name = normalizeValue(source.name || source.title || source.stageLabel) || routeLabel || `${isSubstep ? type : "Ã‰tape"} ${stageNumber ?? index + 1}`;
    const notes = safeArray(source.noteItems || source.notes)
        .map(normalizeNoteJson)
        .filter(Boolean);
    const pois = safeArray(source.pois || source.pointsOfInterest || source.interest)
        .map(normalizePoiJson)
        .filter(Boolean);
    const accommodation = normalizeAccommodationJson(source.accommodation);
    const firstAlternative = accommodation.alternatives[0] || null;

    return {
        ...source,
        id: normalizeValue(source.id) || `${isSubstep ? "substep" : "stage"}-${stageNumber ?? index + 1}`,
        itemType: isSubstep ? "substep" : "main",
        isSubstep,
        hierarchyLevel: isSubstep ? 1 : 0,
        parentStage: isSubstep ? parentStage : null,
        parentStageReference: isSubstep ? parentStage : null,
        stage: stageNumber,
        stageReference: isSubstep ? parentStage : source.stageReference,
        day: normalizeValue(source.day) || null,
        stageLabel: normalizeValue(source.stageLabel || source.nomEtape) || null,
        name,
        type,
        departure,
        arrival,
        distance: toNumber(source.distance),
        elevationGain: toNumber(source.elevationGain ?? source.elevation),
        elevationLoss: toNumber(source.elevationLoss),
        notes: typeof source.notes === "string" ? source.notes : "",
        gpx: normalizeValue(source.gpx || source.route?.gpx) || "",
        mapEmbedUrl: sanitizeMapEmbedUrl(source.mapEmbedUrl || source.embeddedMapUrl || source.externalMapEmbed),
        stagePhoto: sanitizeImageUrl(source.stagePhoto || source.stepPhoto || source.photo),
        accommodation,
        alternativeAccommodation: {
            name: firstAlternative?.name || firstAlternative?.url || "",
            photo: firstAlternative?.photo || ""
        },
        accommodationType: normalizeAccommodationType(source.accommodationType || source.typeHebergement),
        substeps: [],
        title: normalizeValue(source.title) || (isSubstep
            ? buildSubstepTitle(type, departure, arrival, name)
            : `Ã‰tape ${stageNumber ?? index + 1}${routeLabel ? ` - ${routeLabel}` : ""}`),
        elevation: toNumber(source.elevationGain ?? source.elevation) ?? 0,
        duration: normalizeValue(source.duration) || "",
        description: normalizeValue(source.description) || "",
        noteItems: notes,
        pois,
        pointsOfInterest: pois,
        interest: pois,
        restaurants: safeArray(source.restaurants),
        shops: safeArray(source.shops),
        water: safeArray(source.water),
        warning: safeArray(source.warning),
        legacyAccommodation: accommodation.name || ""
    };
}

function normalizeRoadbookJson(payload, config = currentRoadbookConfig()) {
    if (!payload || typeof payload !== "object") {
        throw new Error("JSON roadbook invalide");
    }

    const sourceStages = safeArray(payload.stages).length
        ? safeArray(payload.stages)
        : safeArray(payload.days).filter(day => !day?.isSubstep);
    const stages = sourceStages.map((stage, index) => normalizeStageJson(stage, index, { isSubstep: false }));

    const hasEmbeddedSubsteps = sourceStages.some(stage =>
        safeArray(stage?.substeps).length || safeArray(stage?.variants).length
    );
    const topLevelVariants = hasEmbeddedSubsteps ? [] : safeArray(payload.variants)
        .map((variant, index) => normalizeStageJson(variant, index, {
            isSubstep: true,
            parentStage: variant?.parentStage ?? variant?.parentStageReference ?? variant?.stageReference ?? variant?.stage
        }));

    stages.forEach((stage, stageIndex) => {
        const substeps = [
            ...safeArray(sourceStages[stageIndex]?.substeps),
            ...safeArray(sourceStages[stageIndex]?.variants)
        ].map((variant, variantIndex) => normalizeStageJson(variant, variantIndex, {
            isSubstep: true,
            parentStage: stage.stage
        }));

        stage.substeps = substeps;
    });

    if (topLevelVariants.length) {
        attachSubsteps(stages, topLevelVariants);
    }

    const days = buildNavigableStages(stages);
    const summary = {
        official: payload.summary?.official || null,
        stagesTotal: payload.summary?.stagesTotal || null,
        stagesTotalMarker: payload.summary?.stagesTotalMarker || null
    };

    if (!summary.stagesTotal) {
        summary.stagesTotal = buildComputedStagesTotal(stages, summary.stagesTotalMarker);
    }

    return {
        ...payload,
        id: normalizeValue(payload.id) || config.id || config.shortId || "roadbook",
        title: normalizeValue(payload.title) || config.title || "RoadBook Explorer",
        description: normalizeValue(payload.description) || config.description || "Roadbook d'itinÃ©rance Ã  vÃ©lo.",
        metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {},
        summary,
        stages,
        days
    };
}

function roadbookLibraryFallback(config = {}) {
    return {
        id: config.id || config.shortId || "roadbook",
        title: config.title || "RoadBook Explorer",
        activity: config.activity || config.options?.activity || "",
        destination: config.destination || config.options?.destination || "",
        description: config.description || "Roadbook d'itinérance à vélo.",
        coverImage: resolveRoadbookDataImage(config.coverImage || config.options?.coverImage || "", config),
        project: config.project || config.options?.project || "",
        projectStatus: normalizeProjectStatus(config.project || config.options?.project || "")
    };
}

function metadataValueFromObject(values, candidates) {
    for (const candidate of candidates) {
        const normalized = normalizeHeader(candidate);
        const value = normalizeValue(values[normalized]);
        if (value) return value;
    }
    return "";
}

function extractRoadbookLibraryMetadata(rows, config = {}) {
    const fallback = roadbookLibraryFallback(config);
    if (!Array.isArray(rows) || rows.length === 0) return fallback;

    const directRow = rows.find(row => {
        if (!row || typeof row !== "object") return false;
        return Boolean(
            firstValue(row, ["titre", "title", "nom"]) ||
            firstValue(row, ["activite", "activité", "activity"]) ||
            firstValue(row, ["destination"]) ||
            firstValue(row, ["description", "resume", "résumé"]) ||
            firstValue(row, ["image couverture", "image de couverture", "cover image", "cover"]) ||
            firstValue(row, ["projet"])
        );
    });

    if (directRow) {
        const project = firstValue(directRow, ["projet"]) || fallback.project;
        const rawCoverImage = firstValue(directRow, [
            "image couverture",
            "image de couverture",
            "cover image",
            "cover",
            "couverture",
            "image"
        ]);
        return {
            ...fallback,
            title: firstValue(directRow, ["titre", "title", "nom"]) || fallback.title,
            activity: firstValue(directRow, ["activite", "activité", "activity", "type activite", "type activité"]) || fallback.activity,
            destination: firstValue(directRow, ["destination", "lieu", "region", "région"]) || fallback.destination,
            description: firstValue(directRow, ["description", "resume", "résumé"]) || fallback.description,
            project,
            projectStatus: normalizeProjectStatus(project),
            coverImage: rawCoverImage ? resolveRoadbookDataImage(rawCoverImage, config) : fallback.coverImage
        };
    }

    const keyValues = {};
    rows.forEach(row => {
        if (!row || typeof row !== "object") return;
        const keys = Object.keys(row);
        if (!keys.length) return;
        const key = normalizeValue(firstValue(row, ["cle", "clé", "champ", "field", "parametre", "paramètre"]) || row[keys[0]]);
        if (!key) return;
        const value = normalizeValue(firstValue(row, ["valeur", "value", "contenu", "content"]) || row[keys[1]]);
        if (!value) return;
        keyValues[normalizeHeader(key)] = value;
    });

    const project = metadataValueFromObject(keyValues, ["projet"]) || fallback.project;
    const rawCoverImage = metadataValueFromObject(keyValues, ["image couverture", "image de couverture", "cover image", "cover", "couverture", "image"]);

    return {
        ...fallback,
        title: metadataValueFromObject(keyValues, ["titre", "title", "nom"]) || fallback.title,
        activity: metadataValueFromObject(keyValues, ["activite", "activité", "activity", "type activite", "type activité"]) || fallback.activity,
        destination: metadataValueFromObject(keyValues, ["destination", "lieu", "region", "région"]) || fallback.destination,
        description: metadataValueFromObject(keyValues, ["description", "resume", "résumé"]) || fallback.description,
        project,
        projectStatus: normalizeProjectStatus(project),
        coverImage: rawCoverImage ? resolveRoadbookDataImage(rawCoverImage, config) : fallback.coverImage
    };
}

async function loadRoadbookLibraryMetadata(configs = []) {
    const source = Array.isArray(configs) ? configs.filter(Boolean) : [];
    const cards = await Promise.all(source.map(async config => {
        const fallback = roadbookLibraryFallback(config);
        const sheetConfig = config.sheets?.configuration || config.sheets?.config || LIBRARY_CONFIGURATION_SHEET;
        const url = googleSheetCsvUrl(sheetConfig, config);
        if (!url) return fallback;

        try {
            const csv = await fetchCsv(url);
            const rows = parseCsv(csv);
            return extractRoadbookLibraryMetadata(rows, config);
        } catch (error) {
            const reason = error?.message || "erreur inconnue";
            console.warn(`[Roadbook] Configuration de bibliothèque indisponible pour "${fallback.id}" : ${reason}.`);
            return fallback;
        }
    }));

    return cards;
}

async function fetchCsv(url) {
    let response;
    try {
        response = await fetch(url, NETWORK_FIRST_FETCH_OPTIONS);
    } catch (error) {
        throw new Error(ERROR_MESSAGES.NETWORK);
    }

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return response.text();
}

async function loadGoogleSheetRoadbook(config = currentRoadbookConfig()) {
    const sheets = config.sheets || {};
    const stagesUrl = googleSheetCsvUrl(sheets.stages || sheets.etapes || sheets.main, config);
    const substepsUrl = googleSheetCsvUrl(sheets.substeps || sheets.variants || sheets.variantes, config);
    const travelerNotesUrl = googleSheetCsvUrl(sheets.travelerNotes || sheets.notes, config);
    const addedAccommodationUrl = googleSheetCsvUrl(sheets.addedAccommodation || sheets.accommodationAdditions, config);

    if (!stagesUrl || !substepsUrl) {
        throw new Error("Configuration Google Sheet incomplète.");
    }

    const travelerNotesPromise = travelerNotesUrl
        ? fetchCsv(travelerNotesUrl)
        .then(csv => {
            const rows = parseCsv(csv);
            ensureSchema(rows, REQUIRED_TRAVELER_NOTES_HEADERS);
            return rows;
        })
        .catch(error => {
            const reason = error?.message || "erreur inconnue";
            console.warn(`[Roadbook] Notes voyageurs indisponibles : ${reason}.`);
            return [];
        })
        : Promise.resolve([]);

    const addedAccommodationPromise = addedAccommodationUrl
        ? fetchCsv(addedAccommodationUrl)
        .then(csv => parseCsv(csv))
        .catch(error => {
            const reason = error?.message || "erreur inconnue";
            console.warn(`[Roadbook] Ajouts d'hébergements indisponibles : ${reason}.`);
            return [];
        })
        : Promise.resolve([]);

    const [etapesCsv, variantesCsv, travelerNotesRows, addedAccommodationRows] = await Promise.all([
        fetchCsv(stagesUrl),
        fetchCsv(substepsUrl),
        travelerNotesPromise,
        addedAccommodationPromise
    ]);

    const etapesRows = parseCsv(etapesCsv);
    const variantesRows = parseCsv(variantesCsv);

    ensureSchema(etapesRows, REQUIRED_ETAPES_HEADERS);
    ensureSchema(variantesRows, REQUIRED_VARIANTES_HEADERS);

    return buildRoadbook(etapesRows, variantesRows, travelerNotesRows, addedAccommodationRows, config);
}

async function loadFallbackRoadbook(config = currentRoadbookConfig()) {
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

    const validPaths = roadbookJsonPaths(config);

    if (!validPaths.length) {
        const error = new Error("aucun chemin JSON local valide configuré");
        console.warn(`[Roadbook] Fallback JSON ignoré : ${error.message}.`);
        throw error;
    }

    let lastError = null;

    for (const path of validPaths) {
        try {
            const localFallback = await loadNodeFallback(path);
            if (localFallback) return normalizeRoadbookJson(localFallback, config);
        } catch (error) {
            lastError = error;
        }

        try {
            const response = await fetch(path, NETWORK_FIRST_FETCH_OPTIONS);
            if (!response.ok) {
                lastError = new Error(`HTTP ${response.status}`);
                console.warn(`[Roadbook] Fallback JSON échoué (${path}) : ${lastError.message}.`);
                continue;
            }
            const content = await response.text();
            try {
                return normalizeRoadbookJson(JSON.parse(content), config);
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
    const config = await waitForRoadbookConfig();
    try {
        return await loadGoogleSheetRoadbook(config);
    } catch (error) {
        logFallbackError(error);
        try {
            return await loadFallbackRoadbook(config);
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
    window.loadRoadbookLibraryMetadata = loadRoadbookLibraryMetadata;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        buildGoogleSheetCsvUrl,
        googleSheetCsvUrl,
        currentRoadbookConfig,
        parseCsv,
        sanitizeNotePhotoUrl,
        mapTravelerNote,
        attachTravelerNotes,
        buildAccommodation,
        buildRoadbook,
        normalizeRoadbookJson,
        mapAddedAccommodation,
        attachAddedAccommodations,
        sanitizeMapEmbedUrl,
        resolveRoadbookDataImage,
        sanitizeRoadbookAssetName,
        roadbookJsonPaths,
        loadGoogleSheetRoadbook,
        loadFallbackRoadbook,
        loadRoadbook,
        loadRoadbookLibraryMetadata
    };
}
