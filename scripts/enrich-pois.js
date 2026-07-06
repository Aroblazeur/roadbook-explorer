"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const ROADBOOK_ID = process.env.ROADBOOK_ID || "perinexus";
const ROADBOOK_CONFIG = loadRoadbookConfig(ROADBOOK_ID);
const SHEET_ID = process.env.ROADBOOK_SHEET_ID || ROADBOOK_CONFIG.googleSheetId;
const SHEET_URLS = [
    process.env.ROADBOOK_ETAPES_URL || googleSheetCsvUrl(ROADBOOK_CONFIG.sheets?.stages?.name || "etapes principales"),
    process.env.ROADBOOK_VARIANTES_URL || googleSheetCsvUrl(ROADBOOK_CONFIG.sheets?.substeps?.name || "Variante et option")
];
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const OUTPUT_PATH = path.resolve(__dirname, "..", "roadbooks", ROADBOOK_ID, "data", "poi-enrichment.json");
const REQUEST_DELAY_MS = toNonNegativeInteger(process.env.POI_DELAY_MS, 250);
const REQUEST_TIMEOUT_MS = toNonNegativeInteger(process.env.POI_TIMEOUT_MS, 8_000);
const SEARCH_LANGUAGES = ["fr", "ca", "es", "en"];
const USER_AGENT = `RoadbookEnginePOITool/1.0 (${ROADBOOK_ID})`;
const COMMONS_EXACT_SOURCE = "commons-exact";
const COMMONS_VARIANT_SOURCE = "commons-variant";
const COMMONS_SOURCES = new Set([COMMONS_EXACT_SOURCE, COMMONS_VARIANT_SOURCE]);
const COMMONS_LOCATION_VARIANTS = (process.env.POI_COMMONS_LOCATION_VARIANTS || "Cadaqués,Costa Brava,Catalunya,Girona")
    .split(",")
    .map(normalizeWhitespace)
    .filter(Boolean);
const COMMONS_QUERY_VARIANTS = [
    { suffix: "", imageSource: COMMONS_EXACT_SOURCE },
    ...COMMONS_LOCATION_VARIANTS.map(suffix => ({ suffix, imageSource: COMMONS_VARIANT_SOURCE }))
];
const COMMONS_GENERIC_TOKENS = new Set([
    "beach",
    "cala",
    "calaix",
    "cami",
    "cami de ronda",
    "cami ronda",
    "camí",
    "de",
    "del",
    "dels",
    "d",
    "el",
    "en",
    "es",
    "la",
    "les",
    "l",
    "los",
    "platja",
    "playa",
    "sa",
    "san",
    "sant",
    "santa",
    "ses",
    "the",
    "via",
    "verda",
    "voie",
    "verde",
    "du"
]);
const COMMONS_SCORE_EXACT_MATCH = 120;
const COMMONS_SCORE_CONTAINS_ORIGINAL = 110;
const COMMONS_SCORE_CONTAINS_QUERY = 105;
const COMMONS_SCORE_TOKEN_OVERLAP = 90;
const COMMONS_SCORE_EXACT_PREFIX_BONUS = 10;
const COMMONS_SCORE_LOCATION_BONUS = 8;
const COMMONS_SCORE_INVALID_MATCH = -100;
const MIN_TOKEN_LENGTH = 3;
const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;
// Exact-name searches use a lower threshold because the API query is already narrow.
// Variant searches add regional context, so they require stronger title confirmation.
const COMMONS_THRESHOLD_EXACT = 85;
const COMMONS_THRESHOLD_VARIANT = 92;

let lastApiRequestAt = 0;

async function main() {
    if (typeof fetch !== "function") {
        throw new Error("Ce script nécessite Node.js 18 ou une version plus récente (fetch natif).");
    }

    console.log("[POI] Lecture des onglets Google Sheets publiés…");
    const csvDocuments = await Promise.all(SHEET_URLS.map(url => fetchText(url)));
    const poiNames = collectPoiNames(csvDocuments.flatMap(parseCsv));
    const existingItems = await loadExistingPoiIndex();
    const items = [];

    console.log(`[POI] ${poiNames.length} point(s) d’intérêt unique(s) à enrichir.\n`);

    for (let index = 0; index < poiNames.length; index += 1) {
        const name = poiNames[index];
        const item = await enrichPoi(name, existingItems.get(normalizeSearchText(name)));
        items.push(item);
        printReport(index + 1, poiNames.length, item);
    }

    const output = {
        generatedAt: new Date().toISOString(),
        items
    };
    const serialized = `${JSON.stringify(output, null, 2)}\n`;

    if (/wikipedia/i.test(serialized)) {
        throw new Error("Validation échouée : un lien Wikipédia a été détecté dans la sortie.");
    }

    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await fs.writeFile(OUTPUT_PATH, serialized, "utf8");

    const successCount = items.filter(item => item.status === "ok").length;
    console.log(`\n[POI] Terminé : ${successCount}/${items.length} POI enrichi(s).`);
    console.log(`[POI] Rapport écrit dans ${OUTPUT_PATH}`);
}

async function enrichPoi(name, existingItem) {
    try {
        const candidate = await findBestWikidataCandidate(name);
        const entity = candidate ? await fetchWikidataEntity(candidate.id) : null;
        const imageInfo = await resolvePoiImage(name, entity, existingItem);
        const status = entity || imageInfo.image ? "ok" : "not_found";

        return {
            name,
            image: imageInfo.image,
            imageSource: imageInfo.imageSource,
            imageStatus: imageInfo.imageStatus,
            description: shortDescription(entity ? (entityDescription(entity) || candidate?.description) : ""),
            coordinates: coordinatesFromClaims(entity?.claims?.P625),
            url: entity ? `https://www.wikidata.org/wiki/${candidate.id}` : imageInfo.url,
            source: resolvePoiSource({ entity, imageSource: imageInfo.imageSource }),
            status
        };
    } catch (error) {
        const preservedPoi = preserveExistingPoi(name, existingItem);
        return {
            ...(preservedPoi || emptyPoi(name, "error")),
            error: formatError(error)
        };
    }
}

async function resolvePoiImage(name, entity, existingItem) {
    const preservedImage = preserveExistingImage(existingItem);
    if (preservedImage) return preservedImage;
    let hadLookupError = false;

    const imageName = claimValue(entity?.claims?.P18);
    if (typeof imageName === "string" && imageName.trim()) {
        try {
            const image = await fetchCommonsImageUrl(imageName.trim());
            if (image) {
                return {
                    image,
                    url: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(imageName.trim()).replace(/%20/g, "_")}`,
                    imageSource: "wikidata-p18",
                    imageStatus: "found"
                };
            }
        } catch (error) {
            hadLookupError = true;
        }
    }

    try {
        const commonsMatch = await findCommonsImage(name);
        if (commonsMatch) return commonsMatch;
    } catch (error) {
        hadLookupError = true;
    }

    return emptyImage(hadLookupError ? "error" : "not_found");
}

async function findBestWikidataCandidate(name) {
    const queries = buildSearchQueries(name);
    let best = null;

    for (const query of queries) {
        for (const language of SEARCH_LANGUAGES) {
            const url = new URL(WIKIDATA_API);
            url.search = new URLSearchParams({
                action: "wbsearchentities",
                format: "json",
                type: "item",
                limit: "7",
                language,
                uselang: "fr",
                search: query
            }).toString();

            const data = await fetchJson(url);
            const results = Array.isArray(data.search) ? data.search : [];
            results.forEach(candidate => {
                const score = scoreCandidate(candidate, queries);
                if (!best || score > best.score) best = { ...candidate, score };
            });

            if (best?.score >= 95) return best;
        }
    }

    return best && best.score >= 45 ? best : null;
}

async function fetchWikidataEntity(id) {
    if (!/^Q\d+$/.test(String(id || ""))) return null;
    const url = new URL(WIKIDATA_API);
    url.search = new URLSearchParams({
        action: "wbgetentities",
        format: "json",
        ids: id,
        props: "claims|descriptions|labels",
        languages: "fr|ca|es|en",
        languagefallback: "1"
    }).toString();
    const data = await fetchJson(url);
    const entity = data.entities?.[id];
    return entity && !entity.missing ? entity : null;
}

async function fetchCommonsImageUrl(filename) {
    const url = new URL(COMMONS_API);
    url.search = new URLSearchParams({
        action: "query",
        format: "json",
        prop: "imageinfo",
        iiprop: "url",
        titles: `File:${filename}`
    }).toString();
    const data = await fetchJson(url);
    const pages = Object.values(data.query?.pages || {});
    const imageUrl = pages[0]?.imageinfo?.[0]?.url;
    if (!safeHttpUrl(imageUrl)) return "";
    return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(filename)}`;
}

async function findCommonsImage(name) {
    const queries = buildCommonsImageQueries(name);
    for (const query of queries) {
        const results = await searchCommonsFiles(query.search);
        const match = selectCommonsImageResult(results, name, query);
        if (match) {
            return {
                image: commonsFileRedirectUrl(match.title),
                url: commonsFilePageUrl(match.title),
                imageSource: query.imageSource,
                imageStatus: "found"
            };
        }
    }
    return null;
}

async function searchCommonsFiles(search) {
    const url = new URL(COMMONS_API);
    url.search = new URLSearchParams({
        action: "query",
        format: "json",
        generator: "search",
        gsrnamespace: "6",
        gsrlimit: "8",
        gsrsearch: normalizeWhitespace(search),
        prop: "imageinfo",
        iiprop: "url"
    }).toString();
    const data = await fetchJson(url);
    return Object.values(data.query?.pages || {});
}

function selectCommonsImageResult(results, originalName, query) {
    let best = null;
    results.forEach(result => {
        const score = scoreCommonsCandidate(result?.title, originalName, query);
        if (!best || score > best.score) best = { result, score };
    });
    return best && best.score >= commonsScoreThreshold(query) ? best.result : null;
}

function scoreCommonsCandidate(title, originalName, query) {
    const titleText = normalizeCommonsTitle(title);
    const normalizedOriginal = normalizeSearchText(originalName);
    const normalizedQuery = normalizeSearchText(query.search);
    const titleTokens = new Set(meaningfulTokensFromNormalized(titleText));
    const originalTokens = meaningfulTokensFromNormalized(normalizedOriginal);
    const locationTokens = meaningfulTokens(query.location || "");

    if (!titleText || !originalTokens.length) return COMMONS_SCORE_INVALID_MATCH;

    const containsAllOriginalTokens = originalTokens.every(token => titleTokens.has(token));
    if (!containsAllOriginalTokens) return COMMONS_SCORE_INVALID_MATCH;

    let score = 0;
    if (titleText === normalizedOriginal) score = Math.max(score, COMMONS_SCORE_EXACT_MATCH);
    if (titleText.includes(normalizedOriginal)) score = Math.max(score, COMMONS_SCORE_CONTAINS_ORIGINAL);
    if (titleText.includes(normalizedQuery)) score = Math.max(score, COMMONS_SCORE_CONTAINS_QUERY);

    const overlap = originalTokens.filter(token => titleTokens.has(token)).length;
    score = Math.max(score, Math.round((overlap / originalTokens.length) * COMMONS_SCORE_TOKEN_OVERLAP));

    if (locationTokens.length > 0) {
        const locationMatch = locationTokens.some(token => titleTokens.has(token));
        if (!(locationMatch || titleText.includes(normalizedQuery))) return COMMONS_SCORE_INVALID_MATCH;
        if (locationMatch) score += COMMONS_SCORE_LOCATION_BONUS;
    }

    if (query.imageSource === COMMONS_EXACT_SOURCE && titleText.startsWith(normalizedOriginal)) {
        score += COMMONS_SCORE_EXACT_PREFIX_BONUS;
    }

    return score;
}

function commonsScoreThreshold(query) {
    return query.imageSource === COMMONS_EXACT_SOURCE ? COMMONS_THRESHOLD_EXACT : COMMONS_THRESHOLD_VARIANT;
}

function buildCommonsImageQueries(name) {
    const original = normalizeWhitespace(name);
    const accentless = removeAccents(original);
    const queries = COMMONS_QUERY_VARIANTS.flatMap(variant => {
        const base = variant.suffix ? `${original} ${variant.suffix}` : original;
        const items = [{ search: base, location: variant.suffix, imageSource: variant.imageSource }];
        if (accentless && accentless !== original) {
            items.push({
                search: variant.suffix ? `${accentless} ${variant.suffix}` : accentless,
                location: variant.suffix,
                imageSource: variant.imageSource
            });
        }
        return items;
    }).filter(item => normalizeWhitespace(item.search));
    const unique = new Map();
    queries.forEach(item => {
        const key = normalizeSearchText(item.search);
        const current = unique.get(key);
        if (!current || item.imageSource === COMMONS_EXACT_SOURCE) unique.set(key, item);
    });
    return [...unique.values()];
}

function preserveExistingImage(item) {
    const image = safeHttpUrl(item?.image);
    if (!image) return null;
    return {
        image,
        imageSource: safeText(item?.imageSource) || inferLegacyImageSource(item),
        imageStatus: safeText(item?.imageStatus) || "existing"
    };
}

function preserveExistingPoi(name, item) {
    const imageInfo = preserveExistingImage(item);
    if (!imageInfo) return null;
    return {
        name,
        image: imageInfo.image,
        imageSource: imageInfo.imageSource,
        imageStatus: imageInfo.imageStatus,
        description: safeText(item?.description),
        coordinates: safeCoordinates(item?.coordinates),
        url: safeHttpUrl(item?.url || item?.link || item?.sourceUrl),
        source: safeText(item?.source) || resolvePoiSource({ imageSource: imageInfo.imageSource }),
        status: safeText(item?.status) || "ok"
    };
}

function inferLegacyImageSource(item) {
    if (!safeText(item?.image)) return "";
    return item?.source === "wikidata" ? "wikidata-p18" : "wikimedia-commons";
}

async function loadExistingPoiIndex() {
    try {
        const serialized = await fs.readFile(OUTPUT_PATH, "utf8");
        const data = JSON.parse(serialized);
        const items = Array.isArray(data?.items) ? data.items : [];
        const index = new Map();
        items.forEach(item => {
            const key = normalizeSearchText(item?.name);
            if (key) index.set(key, item);
        });
        return index;
    } catch (error) {
        if (error?.code === "ENOENT") return new Map();
        throw error;
    }
}

async function fetchJson(url) {
    const elapsed = Date.now() - lastApiRequestAt;
    if (lastApiRequestAt && elapsed < REQUEST_DELAY_MS) await delay(REQUEST_DELAY_MS - elapsed);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                Accept: "application/json",
                "User-Agent": USER_AGENT
            }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status} pour ${url.hostname}`);
        return JSON.parse(await response.text());
    } catch (error) {
        if (error?.name === "AbortError") {
            throw new Error(`délai dépassé après ${REQUEST_TIMEOUT_MS} ms pour ${url.hostname}`);
        }
        throw error;
    } finally {
        clearTimeout(timeout);
        lastApiRequestAt = Date.now();
    }
}

async function fetchText(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { "User-Agent": USER_AGENT }
        });
        if (!response.ok) throw new Error(`Google Sheet indisponible (HTTP ${response.status})`);
        return response.text();
    } catch (error) {
        if (error?.name === "AbortError") throw new Error("Délai dépassé pendant la lecture du Google Sheet.");
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

function collectPoiNames(rows) {
    const unique = new Map();
    rows.forEach(record => {
        splitMulti(record["point d interet"]).forEach(name => {
            const key = normalizeSearchText(name);
            if (key && !unique.has(key)) unique.set(key, normalizeWhitespace(name));
        });
    });
    return [...unique.values()];
}

function buildSearchQueries(name) {
    const original = normalizeWhitespace(name);
    const accentless = removeAccents(original);
    const translated = original
        .replace(/\bvoie\s+verte\s+du\b/i, "Via Verda del")
        .replace(/\bvoie\s+verte\s+de\s+la\b/i, "Via Verda de la");
    const distinctive = original.replace(
        /^(?:voie\s+verte\s+(?:du|de\s+la)|via\s+verda\s+(?:del|de\s+la)|platja\s+(?:de\s+la\s+|de\s+l['']\s*|d['']\s*en\s+|(?!\s))\s*|cala\s+(?:de\s+la\s+|de\s+l['']\s*|d['']\s*en\s+|(?!\s))\s*|plage\s+(?:de\s+la\s+|de\s+l['']\s*|du\s+|(?!\s))\s*)/i,
        ""
    ).trim();
    const LOCATION_SUFFIXES = ["Cadaqués", "Costa Brava", "Girona"];
    const locationVariants = LOCATION_SUFFIXES.flatMap(suffix => {
        const variants = [`${original} ${suffix}`];
        if (distinctive && distinctive !== original) variants.push(`${distinctive} ${suffix}`);
        return variants;
    });
    const candidates = [
        original,
        translated !== original ? translated : null,
        accentless !== original ? accentless : null,
        distinctive !== original ? distinctive : null,
        ...locationVariants
    ].filter(value => value && value.length >= 3);
    return [...new Set(candidates)];
}

function normalizeCommonsTitle(title) {
    return normalizeSearchText(
        String(title || "")
            .replace(/^File:/i, "")
            .replace(/\.[a-z0-9]{2,5}$/i, "")
            .replace(/\([^)]*\)/g, " ")
    );
}

function commonsFileRedirectUrl(title) {
    const filename = String(title || "").replace(/^File:/i, "").trim();
    return filename
        ? `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(filename)}`
        : "";
}

function commonsFilePageUrl(title) {
    const filename = String(title || "").replace(/^File:/i, "").trim();
    return filename
        ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename).replace(/%20/g, "_")}`
        : "";
}

function meaningfulTokens(value) {
    return meaningfulTokensFromNormalized(normalizeSearchText(value));
}

function meaningfulTokensFromNormalized(value) {
    return [...new Set(
        String(value || "")
            .split(" ")
            .filter(token => token.length >= MIN_TOKEN_LENGTH && !COMMONS_GENERIC_TOKENS.has(token))
    )];
}

function scoreCandidate(candidate, queries) {
    const description = normalizeSearchText(candidate.description);
    if (/homonymie|disambiguation|desambiguacion/.test(description)) return COMMONS_SCORE_INVALID_MATCH;

    const candidateTexts = [candidate.label, candidate.match?.text]
        .map(normalizeSearchText)
        .filter(Boolean);
    let best = 0;

    queries.map(normalizeSearchText).forEach(query => {
        candidateTexts.forEach(candidateText => {
            if (candidateText === query) {
                best = Math.max(best, 100);
                return;
            }
            if (candidateText.includes(query) || query.includes(candidateText)) {
                best = Math.max(best, 72);
            }
            const queryTokens = new Set(query.split(" ").filter(token => token.length >= MIN_TOKEN_LENGTH));
            const candidateTokens = new Set(candidateText.split(" ").filter(token => token.length >= MIN_TOKEN_LENGTH));
            const intersection = [...queryTokens].filter(token => candidateTokens.has(token)).length;
            const denominator = Math.max(queryTokens.size, candidateTokens.size, 1);
            best = Math.max(best, Math.round((intersection / denominator) * 65));
        });
    });
    return best;
}

function claimValue(claims) {
    const claim = (Array.isArray(claims) ? claims : [])
        .find(item => item.rank !== "deprecated" && item.mainsnak?.snaktype === "value");
    return claim?.mainsnak?.datavalue?.value ?? null;
}

function coordinatesFromClaims(claims) {
    const value = claimValue(claims);
    const lat = Number(value?.latitude);
    const lng = Number(value?.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function entityDescription(entity) {
    for (const language of SEARCH_LANGUAGES) {
        const value = entity.descriptions?.[language]?.value;
        if (value) return value;
    }
    return "";
}

function shortDescription(value) {
    const description = normalizeWhitespace(value);
    if (description.length <= 240) return description;
    const truncated = description.slice(0, 237);
    const boundary = truncated.lastIndexOf(" ");
    return `${truncated.slice(0, boundary > 160 ? boundary : 237).trim()}…`;
}

function emptyPoi(name, status) {
    return {
        name,
        image: "",
        imageSource: "",
        imageStatus: status === "error" ? "error" : "not_found",
        description: "",
        coordinates: null,
        url: "",
        source: "wikidata",
        status
    };
}

function emptyImage(imageStatus) {
    return {
        image: "",
        imageSource: "",
        imageStatus
    };
}

function safeHttpUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
        const url = new URL(value.trim());
        return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch (error) {
        return "";
    }
}

function safeCoordinates(value) {
    const lat = Number(value?.lat);
    const lng = Number(value?.lng);
    return Number.isFinite(lat)
        && Number.isFinite(lng)
        && Math.abs(lat) <= MAX_LATITUDE
        && Math.abs(lng) <= MAX_LONGITUDE
        ? { lat, lng }
        : null;
}

function resolvePoiSource({ entity, imageSource } = {}) {
    if (entity) return "wikidata";
    if (isCommonsImageSource(imageSource)) return "wikimedia-commons";
    if (safeText(imageSource) === "wikidata-p18") return "wikidata";
    return "";
}

function isCommonsImageSource(value) {
    return COMMONS_SOURCES.has(safeText(value));
}

function splitMulti(value) {
    return String(value || "")
        .split("---")
        .map(normalizeWhitespace)
        .filter(Boolean);
}

function parseCsv(csvText) {
    const input = String(csvText || "").replace(/^\uFEFF/, "");
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;

    for (let index = 0; index < input.length; index += 1) {
        const character = input[index];
        const next = input[index + 1];
        if (character === '"') {
            if (quoted && next === '"') {
                cell += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (!quoted && character === ",") {
            row.push(cell);
            cell = "";
        } else if (!quoted && (character === "\n" || character === "\r")) {
            if (character === "\r" && next === "\n") index += 1;
            row.push(cell);
            if (row.some(value => value.trim())) rows.push(row);
            row = [];
            cell = "";
        } else {
            cell += character;
        }
    }

    if (quoted) throw new Error("CSV Google Sheets invalide : guillemet non fermé.");
    if (cell || row.length) {
        row.push(cell);
        if (row.some(value => value.trim())) rows.push(row);
    }
    if (!rows.length) return [];

    const [headers, ...dataRows] = rows;
    const normalizedHeaders = headers.map(normalizeHeader);
    return dataRows.map(values => Object.fromEntries(
        normalizedHeaders.map((header, index) => [header, normalizeWhitespace(values[index])])
    ));
}

function normalizeHeader(value) {
    return normalizeSearchText(value);
}

function normalizeSearchText(value) {
    return normalizeWhitespace(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[’']/g, " ")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .toLowerCase();
}

function normalizeWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function removeAccents(value) {
    return normalizeWhitespace(safeText(value))
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function safeText(value) {
    return typeof value === "string" ? value.trim() : "";
}

function loadRoadbookConfig(id) {
    const configPath = path.resolve(__dirname, "..", "roadbooks", id, "config.js");
    globalThis.ROADBOOK_CONFIGS = globalThis.ROADBOOK_CONFIGS || {};
    try {
        require(configPath);
    } catch (error) {
        throw new Error(`Configuration roadbook introuvable (${id}) : ${error.message}`);
    }

    const config = globalThis.ROADBOOK_CONFIGS[id];
    if (!config) throw new Error(`Configuration roadbook invalide (${id}).`);
    return config;
}

function googleSheetCsvUrl(sheetName) {
    return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

function printReport(index, total, item) {
    console.log(`[${index}/${total}] ${item.name}`);
    console.log(`  Statut      : ${item.status}${item.error ? ` · ${item.error}` : ""}`);
    console.log(`  Description : ${item.description || "non trouvée"}`);
    console.log(`  Image       : ${item.image ? `trouvée (${item.imageSource || "source inconnue"})` : "non trouvée"}`);
    console.log(`  Image statut: ${item.imageStatus}`);
    console.log(`  Coordonnées : ${item.coordinates ? `${item.coordinates.lat}, ${item.coordinates.lng}` : "non trouvées"}`);
}

function formatError(error) {
    return normalizeWhitespace(error?.message || String(error || "erreur inconnue"));
}

function toNonNegativeInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function delay(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

if (require.main === module) {
    main().catch(error => {
        console.error(`[POI] Échec global : ${formatError(error)}`);
        process.exitCode = 1;
    });
}

module.exports = {
    buildCommonsImageQueries,
    buildSearchQueries,
    collectPoiNames,
    normalizeSearchText,
    parseCsv,
    scoreCommonsCandidate,
    selectCommonsImageResult,
    scoreCandidate,
    shortDescription
};
