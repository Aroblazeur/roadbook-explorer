"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_SHEET_URL =
    "https://docs.google.com/spreadsheets/d/1jhlhFPZF-oeAaiJ0pLKKagNMMa-SBxJ9HgnB4SMnyPU/gviz/tq?tqx=out:csv&sheet=etapes%20principales";
const SHEET_URL = process.env.ROADBOOK_SHEET_URL || DEFAULT_SHEET_URL;
const OUTPUT_PATH = path.resolve(__dirname, "..", "data", "accommodation-enrichment.json");
const REQUEST_DELAY_MS = toPositiveInteger(process.env.ENRICH_DELAY_MS, 500);
const REQUEST_TIMEOUT_MS = toPositiveInteger(process.env.ENRICH_TIMEOUT_MS, 10_000);
const MAX_HTML_BYTES = 2_000_000;

const SOURCE_COLUMNS = [
    {
        label: "site web de l'hebergement",
        aliases: ["site web de l'hebergement", "site web de l'hébergement"]
    },
    {
        label: "Hebergement altenatif",
        aliases: ["Hebergement altenatif", "Hébergement alternatif", "Hebergement alternatif"]
    },
    {
        label: "Possibilité de location maison",
        aliases: ["Possibilité de location maison", "Possibilite de location maison"]
    }
];

async function main() {
    if (typeof fetch !== "function") {
        throw new Error("Ce script nécessite Node.js 18 ou une version plus récente (fetch natif). ");
    }

    console.log(`[Hébergements] Lecture du Google Sheet : ${SHEET_URL}`);
    const csv = await fetchText(SHEET_URL, "Google Sheet");
    const { headers, rows } = parseCsv(csv);
    const links = collectAccommodationLinks(headers, rows);
    const cache = new Map();
    const items = [];

    console.log(`[Hébergements] ${links.length} lien(s) à analyser.\n`);

    for (let index = 0; index < links.length; index += 1) {
        const link = links[index];
        let enrichment = cache.get(link.url);

        if (!enrichment) {
            if (cache.size > 0) await delay(REQUEST_DELAY_MS);
            enrichment = await enrichUrl(link.url);
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

async function enrichUrl(url) {
    try {
        const { html, finalUrl } = await fetchHtml(url);
        const rawTitle =
            findMetaContent(html, "property", "og:title") ||
            findMetaContent(html, "name", "twitter:title") ||
            findDocumentTitle(html);
        const rawImage =
            findMetaContent(html, "property", "og:image") ||
            findMetaContent(html, "name", "twitter:image");

        return {
            name: cleanTitle(rawTitle) || inferNameFromUrl(finalUrl),
            image: resolveHttpUrl(rawImage, finalUrl),
            status: "ok"
        };
    } catch (error) {
        return {
            name: "",
            image: "",
            status: "error",
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
                "User-Agent": "PerinexusRoadbookMetadataTool/1.0 (+https://github.com/Aroblazeur/perinexus-roadbook)"
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
            extractUrls(row[column.header]).forEach(url => {
                links.push({ sourceColumn: column.label, stage, url });
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

function cleanTitle(value) {
    let title = normalizeWhitespace(decodeHtmlEntities(stripTags(value)));
    const genericSuffix = /\s*(?:\||-|–|—)\s*(?:Booking\.com|Airbnb|Hotels\.com|Expedia|Tripadvisor|Vrbo|Abritel)\s*$/i;
    while (genericSuffix.test(title)) title = title.replace(genericSuffix, "").trim();
    return title;
}

function inferNameFromUrl(value) {
    try {
        const hostname = new URL(value).hostname.replace(/^www\./i, "");
        const name = hostname.split(".")[0].replace(/[-_]+/g, " ");
        return name.replace(/\b\p{L}/gu, character => character.toUpperCase());
    } catch (error) {
        return "";
    }
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
    console.log(`  Image   : ${item.image || "non trouvée"}`);
    console.log(`  Statut  : ${item.status}${item.error ? ` · ${item.error}` : ""}`);
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
