"use strict";

const ETAPES_URL =
    "https://docs.google.com/spreadsheets/d/1jhlhFPZF-oeAaiJ0pLKKagNMMa-SBxJ9HgnB4SMnyPU/gviz/tq?tqx=out:csv&sheet=etapes%20principales";

const VARIANTES_URL =
    "https://docs.google.com/spreadsheets/d/1jhlhFPZF-oeAaiJ0pLKKagNMMa-SBxJ9HgnB4SMnyPU/gviz/tq?tqx=out:csv&gid=15169789";

const TRAVELER_NOTES_URL =
    "https://docs.google.com/spreadsheets/d/1jhlhFPZF-oeAaiJ0pLKKagNMMa-SBxJ9HgnB4SMnyPU/gviz/tq?tqx=out:csv&sheet=Notes%20voyageurs";

const ADDED_ACCOMMODATION_URL =
    "https://docs.google.com/spreadsheets/d/1jhlhFPZF-oeAaiJ0pLKKagNMMa-SBxJ9HgnB4SMnyPU/gviz/tq?tqx=out:csv&sheet=ajout%20hebergement";

// Les exports CSV Google Sheets ne fournissent pas les métadonnées du fichier.
// Modifier cette constante si le nom du Google Sheet change.
const ROADBOOK_TITLE = "pirenexus a vélo";

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
    "nom",
    "nom hebergement",
    "nom hébergement"
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

function travelerNoteStage(value) {
    const direct = toNumber(value);
    if (direct !== null) return direct;
    const match = String(value ?? "").match(/\d+(?:[.,]\d+)?/);
    return match ? toNumber(match[0]) : null;
}

function mapTravelerNote(record) {
    return {
        stageReference: travelerNoteStage(firstValue(record, ["etape", "étape"])),
        text: firstValue(record, ["note"]),
        photo: sanitizeNotePhotoUrl(firstValue(record, ["photo"]))
    };
}

function attachTravelerNotes(stages, rows) {
    const stagesByNumber = new Map(stages.map(stage => [stage.stage, stage]));
    rows
        .map(mapTravelerNote)
        .filter(note => note.stageReference !== null && note.text)
        .forEach(note => {
            const stage = stagesByNumber.get(note.stageReference);
            if (!stage) return;
            if (!Array.isArray(stage.noteItems)) stage.noteItems = [];
            stage.noteItems.push({ text: note.text, photo: note.photo });
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
        url: firstAddedAccommodationUrlValue(record),
        name: firstValue(record, ADDED_ACCOMMODATION_NAME_HEADERS),
        photo: sanitizeImageUrl(firstValue(record, ADDED_ACCOMMODATION_PHOTO_HEADERS))
    };
}

function normalizeAlternativeAccommodationEntry(value, { name = "", photo = "" } = {}) {
    if (value && typeof value === "object") {
        const url = normalizeValue(value.url ?? value.website);
        if (!url) return null;
        return {
            url,
            name: normalizeValue(value.name) || normalizeValue(name) || "",
            photo: sanitizeImageUrl(value.photo || photo)
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
    const stagesByNumber = new Map(stages.map(stage => [stage.stage, stage]));
    rows
        .map(mapAddedAccommodation)
        .filter(entry => entry.stageReference !== null && entry.url)
        .forEach(entry => {
            const stage = stagesByNumber.get(entry.stageReference);
            if (!stage) return;

            const accommodation = stage.accommodation || {};
            if (!Array.isArray(accommodation.alternatives)) accommodation.alternatives = [];
            syncAccommodationAlternatives(accommodation);

            const key = normalizeUrlKey(entry.url);
            if (!key) return;

            const mainKey = normalizeUrlKey(accommodation.website || accommodation.url);
            if (mainKey && mainKey === key) {
                if (entry.name) accommodation.name = entry.name;
                if (entry.photo) accommodation.photo = entry.photo;
                stage.accommodation = accommodation;
                syncStageAlternativeAccommodation(stage);
                return;
            }

            const existingAlternative = accommodation.alternatives.find(item => normalizeUrlKey(item.url) === key);
            if (existingAlternative) {
                if (entry.name) existingAlternative.name = entry.name;
                if (entry.photo) existingAlternative.photo = entry.photo;
            } else {
                accommodation.alternatives.push({
                    url: entry.url,
                    name: entry.name || "",
                    photo: entry.photo || ""
                });
            }

            accommodation.alternativeNames = accommodation.alternatives.map(item => item.name || "");
            accommodation.alternativePhotos = accommodation.alternatives.map(item => item.photo || "");
            stage.accommodation = accommodation;
            syncStageAlternativeAccommodation(stage);
        });
}

function buildPoiEntries(record) {
    const names = splitMulti(firstValue(record, ["point d'intérêt", "point d'interet"]));
    const images = splitMulti(firstValue(record, ["images poi", "image poi"]), { preserveEmpty: true });
    const regions = splitMulti(
        firstValue(record, ["région", "region"]) ?? firstValueByPrefix(record, "region"),
        { preserveEmpty: true }
    );

    return names.map((name, index) => ({
        name,
        image: images[index] || "",
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
            compact === "totaldesetapes" ||
            (compact.startsWith("totaldes") && compact.endsWith("tapes"))
        ) {
            return "stagesTotal";
        }
    }

    return null;
}

function isSummaryRow(record) {
    return summaryRowKind(record) !== null;
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
        name: firstValue(record, ["nom hebergement", "nom hébergement", "hebergement", "hébergement"]),
        website,
        url: website,
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

    rows.forEach(row => {
        const kind = summaryRowKind(row);
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

function createVariant(fields = {}) {
    return {
        stageReference: null,
        day: null,
        name: null,
        type: null,
        departure: null,
        arrival: null,
        distance: null,
        elevationGain: null,
        elevationLoss: null,
        distanceExtra: null,
        elevationGainExtra: null,
        elevationLossExtra: null,
        pointsOfInterest: [],
        description: null,
        link: null,
        gpx: null,
        mapEmbedUrl: null,
        enabled: true,
        ...fields
    };
}

function mapEtape(record) {
    const stageNumber = toNumber(firstValue(record, ["numero etape"]));
    const dayLabel = firstValue(record, ["jour"]);
    const departure = firstValue(record, ["depart", "départ"]);
    const arrival = firstValue(record, ["arrivee", "arrivée"]);
    const notes = firstValue(record, ["notes"]);
    const pois = buildPoiEntries(record);
    const gpx = firstValue(record, ["gpx"]);
    const mapEmbedUrl = sanitizeMapEmbedUrl(firstValue(record, ["lien d'integration de map"]));
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
        alternativeAccommodation,
        accommodationType,
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
    const pois = buildPoiEntries(record);
    const notes = firstValue(record, ["notes"]);
    const mapEmbedUrl = sanitizeMapEmbedUrl(firstValue(record, ["lien d'integration de map"]));
    const routeLabel = [departure, arrival].filter(Boolean).join(" → ");

    return createVariant({
        stageReference: stageNumber,
        day: toNumber(firstValue(record, ["jour"])),
        name: routeLabel || `Variante étape ${stageNumber ?? "?"}`,
        type: firstValue(record, ["type"]) || "variante",
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
    });
}

function mapVariante(record) {
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

    return createVariant({
        stageReference,
        day: toNumber(firstValue(record, ["jour"])),
        name:
            firstValue(record, ["nom variante", "nom option", "nom"]) ||
            type ||
            `Alternative étape ${stageReference ?? "?"}`,
        type,
        distanceExtra: toNumber(firstValue(record, ["distance supplementaire (km)", "distance supplémentaire (km)"])),
        elevationGainExtra: toNumber(firstValue(record, ["d+ supplementaire (m)", "d+ supplémentaire (m)"])),
        elevationLossExtra: toNumber(firstValue(record, ["d− supplementaire (m)", "d− supplémentaire (m)", "d- supplementaire (m)", "d- supplémentaire (m)"])),
        pointsOfInterest: buildPoiEntries(record),
        description: firstValue(record, ["description / photos"]),
        link: firstValue(record, ["lien"]),
        gpx: firstValue(record, ["gpx"]),
        enabled: true
    });
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

        if (!Array.isArray(stage.variants)) stage.variants = [];
        stage.variants.push({
            ...variant,
            pointsOfInterest: Array.isArray(variant.pointsOfInterest)
                ? [...variant.pointsOfInterest]
                : []
        });
        attached++;
    });

    console.log(
        `Étapes : ${stages.length}\n` +
        `Variantes : ${variants.length}\n` +
        `Variantes rattachées : ${attached}\n` +
        `Variantes ignorées : ${unmatched}`
    );
}

function buildRoadbook(etapesRows, variantesRows, travelerNotesRows = [], addedAccommodationRows = []) {
    const summary = buildSummary(etapesRows);
    const stageRows = etapesRows.filter(row => !isSummaryRow(row));

    // Group ALL rows by "Numero etape" — no row is discarded based on Type
    const groups = new Map();
    stageRows.forEach(row => {
        const num = firstValue(row, ["numero etape"]);
        const key = num !== null ? String(num) : NO_STAGE_NUMBER_KEY;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    });

    const stages = [];
    const alternativesFromEtapes = [];

    const stageNumberFromRow = row => toNumber(firstValue(row, ["numero etape"]));

    groups.forEach((rows, key) => {
        // Choose the row whose Type (normalised) contains "principale", else the first row
        const mainIndex = Math.max(0, rows.findIndex(row =>
            normalizeHeader(firstValue(row, ["type"]) || "").includes("principale")
        ));

        const mainRow = rows[mainIndex];
        const groupStageNumber =
            stageNumberFromRow(mainRow) ??
            (key === NO_STAGE_NUMBER_KEY ? null : toNumber(key));

        stages.push(mapEtape(mainRow));

        rows.forEach((row, i) => {
            if (i === mainIndex) return;
            const variant = mapEtapeVarianteFromEtape(row);
            variant.stageReference =
                stageNumberFromRow(row) ??
                groupStageNumber;
            alternativesFromEtapes.push(variant);
        });
    });

    console.log(`[Roadbook] Groupes (étapes uniques) : ${groups.size}`);
    console.log(`[Roadbook] Lignes principales choisies : ${stages.length}`);
    console.log(`[Roadbook] Lignes alternatives (étapes) : ${alternativesFromEtapes.length}`);
    console.log(`[Roadbook] Lignes variantes (feuille variantes) : ${variantesRows.length}`);

    const variantesFromSecondSheet = variantesRows.map(mapVariante);

    attachVariants(stages, alternativesFromEtapes);
    attachVariants(stages, variantesFromSecondSheet);

    attachTravelerNotes(stages, travelerNotesRows);
    summary.stagesTotal = buildComputedStagesTotal(stages, summary.stagesTotalMarker);
    attachAddedAccommodations(stages, addedAccommodationRows);

    return {
        title: ROADBOOK_TITLE || "Roadbook vélo",
        description: "Roadbook d'itinérance à vélo.",
        summary,
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
    const travelerNotesPromise = fetchCsv(TRAVELER_NOTES_URL)
        .then(csv => {
            const rows = parseCsv(csv);
            ensureSchema(rows, REQUIRED_TRAVELER_NOTES_HEADERS);
            return rows;
        })
        .catch(error => {
            const reason = error?.message || "erreur inconnue";
            console.warn(`[Roadbook] Notes voyageurs indisponibles : ${reason}.`);
            return [];
        });

    const addedAccommodationPromise = fetchCsv(ADDED_ACCOMMODATION_URL)
        .then(csv => parseCsv(csv))
        .catch(error => {
            const reason = error?.message || "erreur inconnue";
            console.warn(`[Roadbook] Ajouts d'hébergements indisponibles : ${reason}.`);
            return [];
        });

    const [etapesCsv, variantesCsv, travelerNotesRows, addedAccommodationRows] = await Promise.all([
        fetchCsv(ETAPES_URL),
        fetchCsv(VARIANTES_URL),
        travelerNotesPromise,
        addedAccommodationPromise
    ]);

    const etapesRows = parseCsv(etapesCsv);
    const variantesRows = parseCsv(variantesCsv);

    ensureSchema(etapesRows, REQUIRED_ETAPES_HEADERS);
    ensureSchema(variantesRows, REQUIRED_VARIANTES_HEADERS);

    return buildRoadbook(etapesRows, variantesRows, travelerNotesRows, addedAccommodationRows);
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
        TRAVELER_NOTES_URL,
        ADDED_ACCOMMODATION_URL,
        parseCsv,
        sanitizeNotePhotoUrl,
        mapTravelerNote,
        attachTravelerNotes,
        buildAccommodation,
        buildRoadbook,
        mapAddedAccommodation,
        attachAddedAccommodations,
        sanitizeMapEmbedUrl,
        loadGoogleSheetRoadbook,
        loadFallbackRoadbook,
        loadRoadbook
    };
}
