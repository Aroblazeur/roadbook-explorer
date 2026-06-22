"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const SHEET_ID = "1jhlhFPZF-oeAaiJ0pLKKagNMMa-SBxJ9HgnB4SMnyPU";
const SHEET_URLS = [
    process.env.ROADBOOK_ETAPES_URL || googleSheetCsvUrl("etapes principales"),
    process.env.ROADBOOK_VARIANTES_URL || googleSheetCsvUrl("Variante et option")
];
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const OUTPUT_PATH = path.resolve(__dirname, "..", "data", "poi-enrichment.json");
const REQUEST_DELAY_MS = toNonNegativeInteger(process.env.POI_DELAY_MS, 250);
const REQUEST_TIMEOUT_MS = toNonNegativeInteger(process.env.POI_TIMEOUT_MS, 8_000);
const SEARCH_LANGUAGES = ["fr", "ca", "es", "en"];
const USER_AGENT = "PerinexusRoadbookPOITool/1.0 (+https://github.com/Aroblazeur/perinexus-roadbook)";
const COMMONS_QUERY_VARIANTS = [
    { suffix: "", imageSource: "commons-exact" },
    { suffix: "Costa Brava", imageSource: "commons-variant" },
    { suffix: "Catalunya", imageSource: "commons-variant" },
    { suffix: "Girona", imageSource: "commons-variant" }
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
            source: entity ? "wikidata" : imageInfo.imageSource.startsWith("commons") ? "wikimedia-commons" : "wikidata",
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
        gsrsearch: `"${search}"`,
        prop: "imageinfo",
        iiprop: "url"
    }).toString();
    const data = await fetchJson(url);
    return Object.values(data.query?.pages || {});
}

function selectCommonsImageResult(results, originalName, query) {
    let best = null;
    (Array.isArray(results) ? results : []).forEach(result => {
        const score = scoreCommonsCandidate(result?.title, originalName, query);
        if (!best || score > best.score) best = { result, score };
    });
    return best && best.score >= commonsScoreThreshold(query) ? best.result : null;
}

function scoreCommonsCandidate(title, originalName, query) {
    const titleText = normalizeCommonsTitle(title);
    const normalizedOriginal = normalizeSearchText(originalName);
    const normalizedQuery = normalizeSearchText(query.search);
    const titleTokens = meaningfulTokens(titleText);
    const originalTokens = meaningfulTokens(originalName);
    const locationTokens = meaningfulTokens(query.location || "");

    if (!titleText || !originalTokens.length) return -100;

    const containsAllOriginalTokens = originalTokens.every(token => titleTokens.includes(token));
    if (!containsAllOriginalTokens) return -100;

    let score = 0;
    if (titleText === normalizedOriginal) score = Math.max(score, 120);
    if (titleText.includes(normalizedOriginal)) score = Math.max(score, 110);
    if (titleText.includes(normalizedQuery)) score = Math.max(score, 105);

    const overlap = originalTokens.filter(token => titleTokens.includes(token)).length;
    score = Math.max(score, Math.round((overlap / originalTokens.length) * 90));

    if (locationTokens.length > 0) {
        const locationMatch = locationTokens.some(token => titleTokens.includes(token));
        if (!locationMatch && !titleText.includes(normalizedQuery)) return -100;
        if (locationMatch) score += 8;
    }

    if (query.imageSource === "commons-exact" && titleText.startsWith(normalizedOriginal)) score += 10;

    return score;
}

function commonsScoreThreshold(query) {
    return query.imageSource === "commons-exact" ? 85 : 92;
}

function buildCommonsImageQueries(name) {
    const original = normalizeWhitespace(name);
    const accentless = removeAccents(original);
    return [...new Map(
        COMMONS_QUERY_VARIANTS
            .flatMap(variant => {
                const base = variant.suffix ? `${original} ${variant.suffix}` : original;
                const items = [{ search: base, location: variant.suffix, imageSource: variant.imageSource }];
                if (accentless && accentless !== original) {
                    const accentlessSearch = variant.suffix ? `${accentless} ${variant.suffix}` : accentless;
                    items.push({
                        search: accentlessSearch,
                        location: variant.suffix,
                        imageSource: variant.imageSource
                    });
                }
                return items;
            })
            .filter(item => normalizeWhitespace(item.search))
            .map(item => [normalizeSearchText(item.search), item])
    ).values()];
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
        source: safeText(item?.source) || (imageInfo.imageSource.startsWith("commons") ? "wikimedia-commons" : "wikidata"),
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
    const translated = original
        .replace(/\bvoie\s+verte\s+du\b/i, "Via Verda del")
        .replace(/\bvoie\s+verte\s+de\s+la\b/i, "Via Verda de la");
    const distinctive = original.replace(
        /^(?:voie\s+verte\s+(?:du|de\s+la)|via\s+verda\s+(?:del|de\s+la)|platja\s+(?:de\s+la|de\s+l['’]|d['’]en)?|cala\s+(?:de\s+la|de\s+l['’]|d['’]en)?)/i,
        ""
    ).trim();
    return [...new Set([original, translated, distinctive].filter(value => value.length >= 3))];
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

function meaningfulTokens(value) {
    return [...new Set(normalizeSearchText(value)
        .split(" ")
        .filter(token => token.length >= 3 && !COMMONS_GENERIC_TOKENS.has(token)))];
}

function scoreCandidate(candidate, queries) {
    const description = normalizeSearchText(candidate.description);
    if (/homonymie|disambiguation|desambiguacion/.test(description)) return -100;

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
            const queryTokens = new Set(query.split(" ").filter(token => token.length > 2));
            const candidateTokens = new Set(candidateText.split(" ").filter(token => token.length > 2));
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
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
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
    return normalizeWhitespace(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function safeText(value) {
    return typeof value === "string" ? value.trim() : "";
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
