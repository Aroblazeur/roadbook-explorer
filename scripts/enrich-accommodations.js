"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const ROADBOOK_ID = process.env.ROADBOOK_ID || "perinexus";
const ROADBOOK_CONFIG = loadRoadbookConfig(ROADBOOK_ID);
const SHEET_ID = process.env.ROADBOOK_SHEET_ID || ROADBOOK_CONFIG.googleSheetId;
const SHEET_URL =
    process.env.ROADBOOK_SHEET_URL ||
    googleSheetCsvUrl(ROADBOOK_CONFIG.sheets?.stages?.name || "etapes principales");
const ADDED_SHEET_URL =
    process.env.ROADBOOK_ADDED_ACCOMMODATION_SHEET_URL ||
    googleSheetCsvUrl(ROADBOOK_CONFIG.sheets?.addedAccommodation?.name || "ajout hebergement");
const OUTPUT_PATH = path.resolve(__dirname, "..", "data", "accommodation-enrichment.json");
const REQUEST_DELAY_MS = toPositiveInteger(process.env.ENRICH_DELAY_MS, 500);
const REQUEST_TIMEOUT_MS = toPositiveInteger(process.env.ENRICH_TIMEOUT_MS, 10_000);
const MAX_HTML_BYTES = 2_000_000;
const NOMINATIM_BASE_URL = process.env.NOMINATIM_BASE_URL || "https://nominatim.openstreetmap.org";
const PLATFORM_HOSTNAMES = [
    "booking.com",
    "airbnb.com",
    "airbnb.fr",
    "pitchup.com",
    "camping.info",
    "huttopia.com",
    "acsi.eu",
    "acsi.com"
];
const SCHEMA_ACCOMMODATION_TYPES = new Set([
    "hotel",
    "motel",
    "campground",
    "lodgingbusiness",
    "touristaccommodation",
    "hostel",
    "bedandbreakfast",
    "resort",
    "vacationrental"
]);

const SOURCE_COLUMNS = [
    {
        label: "site web de l'hebergement",
        aliases: ["site web de l'hebergement", "site web de l'hébergement"],
        nameAliases: ["nom hebergement", "nom hébergement", "hebergement", "hébergement"]
    },
    {
        label: "Hebergement altenatif",
        aliases: ["Hebergement altenatif", "Hébergement alternatif", "Hebergement alternatif"],
        nameAliases: ["nom hebergement alternatif", "nom hébergement alternatif"]
    },
    {
        label: "Possibilité de location maison",
        aliases: ["Possibilité de location maison", "Possibilite de location maison"],
        nameAliases: ["nom hebergement alternatif", "nom hébergement alternatif"]
    }
];

const ADDED_ACCOMMODATION_URL_HEADERS = [
    "url hebergement",
    "url hébergement",
    "url de l'hebergement",
    "url de l'hébergement",
    "url du site web de l'hebergement",
    "url du site web de l'hébergement",
    "lien hebergement",
    "lien hébergement"
];
const ADDED_ACCOMMODATION_NAME_HEADERS = ["nom hebergement", "nom hébergement"];

async function main() {
    if (typeof fetch !== "function") {
        throw new Error("Ce script nécessite Node.js 18 ou une version plus récente (fetch natif). ");
    }

    console.log(`[Hébergements] Lecture du Google Sheet : ${SHEET_URL}`);
    const csv = await fetchText(SHEET_URL, "Google Sheet");
    const { headers, rows } = parseCsv(csv);
    const links = collectAccommodationLinks(headers, rows);
    const addedNamesByUrl = await loadAddedAccommodationNamesByUrl();
    const cache = new Map();
    const items = [];

    console.log(`[Hébergements] ${links.length} lien(s) à analyser.\n`);

    for (let index = 0; index < links.length; index += 1) {
        const link = links[index];
        let enrichment = cache.get(link.url);

        if (!enrichment) {
            if (cache.size > 0) await delay(REQUEST_DELAY_MS);
            enrichment = await enrichUrl(link, addedNamesByUrl);
            cache.set(link.url, enrichment);
        }

        const item = { ...link, ...enrichment };
        items.push(item);
        printReport(index + 1, links.length, item);
    }

    const output = {
        generatedAt: new Date().toISOString(),
        items
    };

    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");

    const successCount = items.filter(item => item.status === "ok").length;
    console.log(`\n[Hébergements] Terminé : ${successCount}/${items.length} URL traitée(s) avec succès.`);
    console.log(`[Hébergements] Rapport écrit dans ${OUTPUT_PATH}`);
}

async function enrichUrl(link, addedNamesByUrl) {
    const url = link?.url || "";
    const key = normalizeAccommodationUrl(url);
    const manualAddedName = key ? normalizeWhitespace(addedNamesByUrl.get(key) || "") : "";
    if (manualAddedName) {
        return {
            name: manualAddedName,
            image: "",
            status: "ok",
            nameMethod: "manual-added-sheet"
        };
    }

    const manualSheetName = normalizeWhitespace(link?.manualName || "");
    if (manualSheetName) {
        return {
            name: manualSheetName,
            image: "",
            status: "ok",
            nameMethod: "manual-main-sheet"
        };
    }

    try {
        const { html, finalUrl } = await fetchHtml(url);
        const context = extractSchemaContext(html);
        const rawTitle = findDocumentTitle(html);
        const ogTitle =
            findMetaContent(html, "property", "og:title") ||
            findMetaContent(html, "name", "twitter:title");
        const schemaTitle = context.names[0] || "";
        const mapLinks = collectMapLinks(html, finalUrl);
        const mapCandidates = uniqueValues([url, finalUrl, ...mapLinks, ...context.sameAsUrls]);
        const imageCandidates = uniqueValues([
            findMetaContent(html, "property", "og:image"),
            findMetaContent(html, "name", "twitter:image"),
            context.images[0] || ""
        ]);
        const rawImage =
            imageCandidates.find(candidate => resolveHttpUrl(candidate, finalUrl)) || "";

        const resolvedFromTitle = chooseUsableAccommodationName(rawTitle, finalUrl);
        if (resolvedFromTitle) {
            return {
                name: resolvedFromTitle.name,
                image: resolveHttpUrl(rawImage, finalUrl),
                status: "ok",
                nameMethod: resolvedFromTitle.method || "html-title"
            };
        }

        const resolvedFromOg = chooseUsableAccommodationName(ogTitle, finalUrl);
        if (resolvedFromOg) {
            return {
                name: resolvedFromOg.name,
                image: resolveHttpUrl(rawImage, finalUrl),
                status: "ok",
                nameMethod: resolvedFromOg.method || "html-og-title"
            };
        }

        const resolvedFromSchema = chooseUsableAccommodationName(schemaTitle, finalUrl);
        if (resolvedFromSchema) {
            return {
                name: resolvedFromSchema.name,
                image: resolveHttpUrl(rawImage, finalUrl),
                status: "ok",
                nameMethod: resolvedFromSchema.method || "schema-org"
            };
        }

        const mapName = mapCandidates.map(deriveAccommodationNameFromMapUrl).find(Boolean) || "";
        if (mapName) {
            return {
                name: mapName,
                image: resolveHttpUrl(rawImage, finalUrl),
                status: "ok",
                nameMethod: "map-link"
            };
        }

        const nominatimName = await resolveNameFromNominatim({
            coordinates: context.coordinates,
            addresses: context.addresses
        });
        if (nominatimName) {
            return {
                name: nominatimName,
                image: resolveHttpUrl(rawImage, finalUrl),
                status: "ok",
                nameMethod: "nominatim"
            };
        }

        return {
            name: "",
            image: resolveHttpUrl(rawImage, finalUrl),
            status: "ok",
            nameMethod: "none",
            reason: "Aucun nom exploitable (titre, og:title, Schema.org, Google Maps, Nominatim)."
        };

    } catch (error) {
        return {
            name: "",
            image: "",
            status: "error",
            nameMethod: "error",
            error: formatError(error)
        };
    }
}

async function fetchHtml(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            redirect: "follow",
            signal: controller.signal,
            headers: {
                Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
                "User-Agent": `RoadbookEngineMetadataTool/1.0 (${ROADBOOK_ID})`
            }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const contentType = response.headers.get("content-type") || "";
        if (contentType && !/html|xhtml/i.test(contentType)) {
            throw new Error(`contenu non HTML (${contentType})`);
        }

        return {
            html: await readLimitedText(response, MAX_HTML_BYTES, contentType),
            finalUrl: response.url || url
        };
    } catch (error) {
        if (error && error.name === "AbortError") {
            throw new Error(`délai dépassé après ${REQUEST_TIMEOUT_MS} ms`);
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

async function fetchText(url, label) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`${label} indisponible (HTTP ${response.status})`);
        return response.text();
    } catch (error) {
        if (error && error.name === "AbortError") {
            throw new Error(`${label} indisponible : délai dépassé après ${REQUEST_TIMEOUT_MS} ms`);
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

async function readLimitedText(response, maxBytes, contentType = "") {
    if (!response.body || typeof response.body.getReader !== "function") {
        const buffer = Buffer.from(await response.arrayBuffer()).subarray(0, maxBytes);
        return decodeHtmlBuffer(buffer, contentType);
    }

    const reader = response.body.getReader();
    let total = 0;
    const chunks = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
        total += value.byteLength;
        if (total >= maxBytes) {
            await reader.cancel();
            break;
        }
    }

    return decodeHtmlBuffer(Buffer.concat(chunks).subarray(0, maxBytes), contentType);
}

function decodeHtmlBuffer(buffer, contentType) {
    const utf8ReplacementBytes = Buffer.from([0xef, 0xbf, 0xbd]);
    if (buffer.includes(utf8ReplacementBytes)) {
        return new TextDecoder("utf-8").decode(buffer);
    }

    const headerCharset = String(contentType).match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1];
    const preview = buffer.subarray(0, 8192).toString("latin1");
    const metaCharset =
        preview.match(/<meta[^>]+charset\s*=\s*["']?([^\s"'/>;]+)/i)?.[1] ||
        preview.match(/<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([^\s"';]+)/i)?.[1];
    const charset = normalizeCharset(headerCharset || metaCharset || "utf-8");

    try {
        return new TextDecoder(charset).decode(buffer);
    } catch (error) {
        return new TextDecoder("utf-8").decode(buffer);
    }
}

function normalizeCharset(value) {
    const charset = String(value || "").trim().toLowerCase();
    if (["iso-8859-1", "latin1", "latin-1"].includes(charset)) return "windows-1252";
    return charset || "utf-8";
}

function collectAccommodationLinks(headers, rows) {
    const normalizedHeaders = new Map(headers.map(header => [normalizeHeader(header), header]));
    const stageHeader = normalizedHeaders.get("etape");
    const columns = SOURCE_COLUMNS.map(column => ({
        ...column,
        header: column.aliases
            .map(alias => normalizedHeaders.get(normalizeHeader(alias)))
            .find(Boolean)
    })).filter(column => column.header);

    if (!columns.length) {
        throw new Error("Aucune colonne d’hébergement reconnue dans le Google Sheet.");
    }

    const links = [];
    rows.forEach(row => {
        const stage = normalizeCell(stageHeader ? row[stageHeader] : "");
        columns.forEach(column => {
            const urls = extractUrls(row[column.header]);
            const names = splitMulti(
                firstValueFromAliases(row, normalizedHeaders, column.nameAliases || []),
                { preserveEmpty: true }
            );
            urls.forEach((url, index) => {
                links.push({
                    sourceColumn: column.label,
                    stage,
                    url,
                    manualName: normalizeWhitespace(names[index] || "")
                });
            });
        });
    });
    return links;
}

function extractUrls(value) {
    const matches = String(value || "").match(/https?:\/\/[^\s<>"']+/gi) || [];
    return [...new Set(matches.map(url => url.replace(/[),.;]+$/g, "")))];
}

function findMetaContent(html, attributeName, expectedValue) {
    const metaTags = String(html || "").match(/<meta\b[^>]*>/gi) || [];
    for (const tag of metaTags) {
        const attributes = parseHtmlAttributes(tag);
        if (String(attributes[attributeName] || "").toLowerCase() === expectedValue.toLowerCase()) {
            return attributes.content || "";
        }
    }
    return "";
}

function parseHtmlAttributes(tag) {
    const attributes = {};
    const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
    let match;
    while ((match = pattern.exec(tag))) {
        attributes[match[1].toLowerCase()] = decodeHtmlEntities(match[2] || match[3] || match[4] || "");
    }
    return attributes;
}

function findDocumentTitle(html) {
    const match = String(html || "").match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    return match ? match[1] : "";
}

function cleanTitle(value, url = "") {
    let title = normalizeWhitespace(decodeHtmlEntities(stripTags(value)));
    const genericSuffix =
        /\s*(?:\||-|–|—)\s*(?:Booking\.com|Airbnb|Hotels\.com|Expedia|Tripadvisor|Vrbo|Abritel|Pitchup|Huttopia|Camping\.info|ACSI)\s*$/i;
    while (genericSuffix.test(title)) title = title.replace(genericSuffix, "").trim();
    if (isGenericPlatformName(title)) return "";
    const platformName = extractPlatformNameFromUrl(url);
    if (platformName && isPlatformUrl(url)) return platformName;
    return title;
}

function chooseUsableAccommodationName(candidate, url = "") {
    const cleaned = cleanTitle(candidate, url);
    if (cleaned && !isGenericPlatformName(cleaned)) return { name: cleaned, method: "html" };

    const platformName = extractPlatformNameFromUrl(url);
    if (platformName) return { name: platformName, method: "platform-url" };
    return null;
}

function isGenericPlatformName(value) {
    const normalized = normalizeHeader(value);
    return [
        "booking",
        "booking.com",
        "airbnb",
        "airbnb.fr",
        "airbnbfr",
        "hotels.com",
        "expedia",
        "tripadvisor",
        "vrbo",
        "abritel",
        "pitchup",
        "camping.info",
        "huttopia",
        "acsi"
    ].includes(normalized);
}

function isPlatformUrl(value) {
    const hostname = parseHostname(value);
    return PLATFORM_HOSTNAMES.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
}

function extractPlatformNameFromUrl(value) {
    if (!value) return "";
    let parsed;
    try {
        parsed = new URL(value);
    } catch (error) {
        return "";
    }
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = decodeURIComponent(parsed.pathname || "");

    if (matchesHostname(hostname, "booking.com")) {
        const match = path.match(/\/hotel\/[^/]+\/([^/?#]+)\.html?/i);
        return humanizeSlug(match?.[1] || "");
    }
    if (matchesHostname(hostname, "pitchup.com")) {
        const parts = path.split("/").filter(Boolean);
        return humanizeSlug(parts.at(-1) || "");
    }
    if (matchesHostname(hostname, "camping.info")) {
        const parts = path.split("/").filter(Boolean);
        return humanizeSlug(parts.at(-1) || "");
    }
    if (matchesHostname(hostname, "huttopia.com")) {
        const parts = path.split("/").filter(Boolean);
        return humanizeSlug(parts.at(-1) || "");
    }
    if (matchesHostname(hostname, "acsi.com") || matchesHostname(hostname, "acsi.eu")) {
        const parts = path.split("/").filter(Boolean);
        return humanizeSlug(parts.at(-1) || "");
    }
    return "";
}

function humanizeSlug(value) {
    const cleaned = normalizeWhitespace(
        String(value || "")
            .replace(/\.(html?|php)$/i, "")
            .replace(/[_-]+/g, " ")
    );
    return cleaned && !isGenericPlatformName(cleaned) ? toTitleCase(cleaned) : "";
}

function toTitleCase(value) {
    return String(value || "").replace(/\b\p{L}/gu, character => character.toUpperCase());
}

function collectMapLinks(html, baseUrl = "") {
    const links = [];
    const matches = String(html || "").match(/<a\b[^>]*href=(?:"[^"]*"|'[^']*'|[^\s>]+)[^>]*>/gi) || [];
    for (const tag of matches) {
        const attributes = parseHtmlAttributes(tag);
        const href = resolveHttpUrl(attributes.href || "", baseUrl);
        if (isMapUrl(href)) links.push(href);
    }
    return uniqueValues(links);
}

function isMapUrl(url) {
    if (!url) return false;
    const hostname = parseHostname(url);
    return isGoogleMapsHostname(hostname) || matchesHostname(hostname, "openstreetmap.org") || matchesHostname(hostname, "mapy.com");
}

function deriveAccommodationNameFromMapUrl(url) {
    if (!url) return "";
    try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.toLowerCase();
        const candidates = [
            parsed.searchParams.get("query"),
            parsed.searchParams.get("q"),
            parsed.searchParams.get("destination"),
            parsed.searchParams.get("daddr"),
            parsed.searchParams.get("name"),
            parsed.searchParams.get("title")
        ];
        if (isGoogleMapsHostname(hostname) && parsed.pathname.includes("/maps")) {
            const direct = firstMeaningfulAccommodationLabel(candidates);
            return direct || extractGoogleMapsPlaceFromPath(parsed.pathname);
        }
        if (matchesHostname(hostname, "mapy.com")) {
            const slug = parsed.pathname.split("/").filter(Boolean).pop() || "";
            return firstMeaningfulAccommodationLabel([...candidates, slug]);
        }
        if (matchesHostname(hostname, "openstreetmap.org")) return firstMeaningfulAccommodationLabel(candidates);
    } catch (error) {
        return "";
    }
    return "";
}

function extractGoogleMapsPlaceFromPath(pathname = "") {
    const match = String(pathname).match(/\/place\/([^/]+)/i);
    return match ? cleanAccommodationLocationLabel(match[1]) : "";
}

function resolveHttpUrl(value, baseUrl) {
    const candidate = normalizeWhitespace(decodeHtmlEntities(value));
    if (!candidate) return "";
    try {
        const url = new URL(candidate, baseUrl);
        const localHost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase());
        return ["http:", "https:"].includes(url.protocol) && !localHost ? url.href : "";
    } catch (error) {
        return "";
    }
}

function decodeHtmlEntities(value) {
    const named = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
    return String(value || "").replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (entity, code) => {
        const normalized = code.toLowerCase();
        if (normalized.startsWith("#x")) return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
        if (normalized.startsWith("#")) return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
        return named[normalized] || entity;
    });
}

function stripTags(value) {
    return String(value || "").replace(/<[^>]*>/g, " ");
}

function normalizeWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeHeader(value) {
    return normalizeWhitespace(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function normalizeCell(value) {
    return normalizeWhitespace(value);
}

function splitMulti(value, { preserveEmpty = false } = {}) {
    const parts = String(value || "")
        .split(/\r?\n|[;|]/g)
        .map(item => normalizeWhitespace(item));
    return preserveEmpty ? parts : parts.filter(Boolean);
}

function firstValueFromAliases(row, normalizedHeaders, aliases = []) {
    for (const alias of aliases) {
        const header = normalizedHeaders.get(normalizeHeader(alias));
        const value = normalizeCell(header ? row[header] : "");
        if (value) return value;
    }
    return "";
}

async function loadAddedAccommodationNamesByUrl() {
    try {
        console.log(`[Hébergements] Lecture de la feuille Ajout hebergement : ${ADDED_SHEET_URL}`);
        const csv = await fetchText(ADDED_SHEET_URL, "Feuille Ajout hebergement");
        const { headers, rows } = parseCsv(csv);
        const normalizedHeaders = new Map(headers.map(header => [normalizeHeader(header), header]));
        const namesByUrl = new Map();
        rows.forEach(row => {
            const name = firstValueFromAliases(row, normalizedHeaders, ADDED_ACCOMMODATION_NAME_HEADERS);
            if (!name) return;
            const rawUrl = firstValueFromAliases(row, normalizedHeaders, ADDED_ACCOMMODATION_URL_HEADERS);
            extractUrls(rawUrl).forEach(url => {
                const key = normalizeAccommodationUrl(url);
                if (key && !namesByUrl.has(key)) namesByUrl.set(key, name);
            });
        });
        return namesByUrl;
    } catch (error) {
        console.warn(`[Hébergements] Feuille Ajout hebergement indisponible : ${formatError(error)}`);
        return new Map();
    }
}

function normalizeAccommodationUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
        const url = new URL(value.trim());
        if (!["http:", "https:"].includes(url.protocol)) return "";
        url.hash = "";
        url.pathname = url.pathname.replace(/\/+$/g, "") || "/";
        const sortedParameters = [...url.searchParams.entries()]
            .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
                const keyCompare = leftKey.localeCompare(rightKey);
                return keyCompare !== 0 ? keyCompare : leftValue.localeCompare(rightValue);
            });
        url.search = "";
        sortedParameters.forEach(([key, parameterValue]) => url.searchParams.append(key, parameterValue));
        return url.href.replace(/\/$/, "");
    } catch (error) {
        return "";
    }
}

function extractSchemaContext(html) {
    const context = { names: [], addresses: [], coordinates: [], sameAsUrls: [], images: [] };
    const scripts = String(html || "").match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script[^>]*>/gi) || [];
    scripts.forEach(script => {
        const json = (script.match(/<script\b[^>]*>([\s\S]*?)<\/script[^>]*>\s*$/i)?.[1] || "").trim();
        if (!json) return;
        let parsed;
        try {
            parsed = JSON.parse(json);
        } catch (error) {
            return;
        }
        flattenSchemaNodes(parsed).forEach(node => {
            if (!node || typeof node !== "object") return;
            const types = toSchemaTypes(node["@type"]);
            const isAccommodationType = types.some(type => SCHEMA_ACCOMMODATION_TYPES.has(type));
            if (!isAccommodationType && !types.includes("lodgingreservation")) return;
            if (node.name) context.names.push(node.name);
            if (node.alternateName) context.names.push(node.alternateName);
            if (node.image) context.images.push(typeof node.image === "string" ? node.image : node.image?.url || "");
            if (node.sameAs) {
                const sameAsValues = Array.isArray(node.sameAs) ? node.sameAs : [node.sameAs];
                sameAsValues.forEach(value => context.sameAsUrls.push(safeText(value, "")));
            }
            if (node.address) context.addresses.push(schemaAddressToText(node.address));
            if (node.geo) {
                const latitude = Number.parseFloat(node.geo.latitude);
                const longitude = Number.parseFloat(node.geo.longitude);
                if (Number.isFinite(latitude) && Number.isFinite(longitude)) context.coordinates.push({ latitude, longitude });
            }
        });
    });
    context.names = uniqueValues(context.names.map(value => safeText(value, "")).filter(Boolean));
    context.addresses = uniqueValues(context.addresses);
    context.sameAsUrls = uniqueValues(context.sameAsUrls.filter(Boolean));
    context.images = uniqueValues(context.images.filter(Boolean));
    return context;
}

function flattenSchemaNodes(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.flatMap(flattenSchemaNodes);
    if (typeof value !== "object") return [];
    const graph = Array.isArray(value["@graph"]) ? value["@graph"].flatMap(flattenSchemaNodes) : [];
    return [value, ...graph];
}

function toSchemaTypes(value) {
    const values = Array.isArray(value) ? value : [value];
    return values
        .map(item => String(item || "").replace(/^https?:\/\/schema\.org\//i, ""))
        .map(normalizeHeader)
        .filter(Boolean);
}

function schemaAddressToText(value) {
    if (!value) return "";
    if (typeof value === "string") return normalizeWhitespace(value);
    if (typeof value !== "object") return "";
    return normalizeWhitespace([
        value.streetAddress,
        value.postalCode,
        value.addressLocality,
        value.addressRegion,
        value.addressCountry
    ].filter(Boolean).join(", "));
}

async function resolveNameFromNominatim({ coordinates = [], addresses = [] } = {}) {
    for (const coordinate of coordinates) {
        const value = await reverseGeocodeNominatim(coordinate);
        if (value) return value;
    }
    for (const address of addresses) {
        const value = await searchNominatimByAddress(address);
        if (value) return value;
    }
    return "";
}

async function reverseGeocodeNominatim({ latitude, longitude }) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";
    const url = `${NOMINATIM_BASE_URL}/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&addressdetails=1`;
    const payload = await fetchJson(url, "Nominatim reverse");
    return cleanAccommodationLocationLabel(payload?.name || payload?.display_name || payload?.address?.tourism || "");
}

async function searchNominatimByAddress(address) {
    const query = normalizeWhitespace(address);
    if (!query) return "";
    const url = `${NOMINATIM_BASE_URL}/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
    const payload = await fetchJson(url, "Nominatim search");
    const first = Array.isArray(payload) ? payload[0] : null;
    return cleanAccommodationLocationLabel(first?.name || first?.display_name || "");
}

async function fetchJson(url, label) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                Accept: "application/json",
                "User-Agent": `RoadbookEngineMetadataTool/1.0 (${ROADBOOK_ID})`
            }
        });
        if (!response.ok) throw new Error(`${label} indisponible (HTTP ${response.status})`);
        return JSON.parse(await response.text());
    } catch (error) {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

function firstMeaningfulAccommodationLabel(values) {
    for (const value of values) {
        const cleaned = cleanAccommodationLocationLabel(value);
        if (cleaned) return cleaned;
    }
    return "";
}

function cleanAccommodationLocationLabel(value) {
    const candidate = decodeURIComponent(String(value || "").replace(/\+/g, " ")).trim();
    if (!candidate) return "";
    if (/^-?\d+(?:[.,]\d+)?\s*,\s*-?\d+(?:[.,]\d+)?$/.test(candidate)) return "";
    return normalizeWhitespace(
        candidate
            .replace(/\bplace_id:[^&\s]+/gi, "")
            .replace(/\bmaps?\b/gi, "")
            .replace(/[_-]+/g, " ")
    );
}

function isGoogleMapsHostname(hostname) {
    return /(^|\.)google\.[a-z.]+$/i.test(hostname);
}

function matchesHostname(hostname, expectedDomain) {
    return hostname === expectedDomain || hostname.endsWith(`.${expectedDomain}`);
}

function parseHostname(url) {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch (error) {
        return "";
    }
}

function safeText(value, fallback = "") {
    const text = typeof value === "string" ? value.trim() : "";
    return text || fallback;
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

function uniqueValues(values) {
    return [...new Set((Array.isArray(values) ? values : []).map(value => safeText(value, "")).filter(Boolean))];
}

function parseCsv(csvText) {
    const input = String(csvText || "").replace(/^\uFEFF/, "");
    const rawRows = [];
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
            if (row.some(value => value.trim())) rawRows.push(row);
            row = [];
            cell = "";
        } else {
            cell += character;
        }
    }

    if (quoted) throw new Error("CSV Google Sheets invalide : guillemet non fermé.");
    if (cell || row.length) {
        row.push(cell);
        if (row.some(value => value.trim())) rawRows.push(row);
    }
    if (!rawRows.length) throw new Error("CSV Google Sheets vide.");

    const [headers, ...values] = rawRows;
    return {
        headers,
        rows: values.map(cells => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""])))
    };
}

function printReport(index, total, item) {
    console.log(`[${index}/${total}] ${item.url}`);
    console.log(`  Colonne : ${item.sourceColumn} · Étape : ${item.stage}`);
    console.log(`  Nom     : ${item.name || "non trouvé"}`);
    console.log(`  Méthode : ${item.nameMethod || "inconnue"}`);
    console.log(`  Image   : ${item.image || "non trouvée"}`);
    const detail = item.error || item.reason || "";
    console.log(`  Statut  : ${item.status}${detail ? ` · ${detail}` : ""}`);
}

function formatError(error) {
    if (!error) return "erreur inconnue";
    return normalizeWhitespace(error.message || String(error));
}

function toPositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function delay(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

if (require.main === module) {
    main().catch(error => {
        console.error(`[Hébergements] Échec global : ${formatError(error)}`);
        process.exitCode = 1;
    });
}

module.exports = {
    cleanTitle,
    collectAccommodationLinks,
    decodeHtmlEntities,
    extractUrls,
    findMetaContent,
    parseCsv
};
