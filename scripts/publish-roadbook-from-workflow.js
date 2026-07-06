"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const WORKSPACE = process.cwd();

main();

function main() {
    const roadbookId = normalizeRoadbookId(process.env.ROADBOOK_ID || "");
    const payloadEncoding = String(process.env.PAYLOAD_ENCODING || "gzip-base64").trim();
    const payloadBase64 = String(process.env.PAYLOAD_BASE64 || "").trim();

    if (!roadbookId) {
        fail("ROADBOOK_ID is required and must contain only lowercase letters, numbers, and hyphens.");
    }
    if (!payloadBase64) {
        fail("PAYLOAD_BASE64 is required.");
    }

    const payload = decodePayload(payloadBase64, payloadEncoding);
    const payloadRoadbookId = normalizeRoadbookId(payload.roadbookId || "");
    if (payloadRoadbookId && payloadRoadbookId !== roadbookId) {
        fail(`Payload roadbookId "${payloadRoadbookId}" does not match workflow roadbook_id "${roadbookId}".`);
    }

    const roadbook = parseRoadbookJson(payload.roadbookJson, roadbookId);
    const configJs = validateConfigJs(payload.configJs, roadbookId);
    const catalog = readCatalog();

    roadbook.id = roadbookId;
    if (!catalog.roadbooks.includes(roadbookId)) {
        catalog.roadbooks.push(roadbookId);
    }

    const roadbookDir = resolveInsideWorkspace("roadbooks", roadbookId);
    fs.mkdirSync(roadbookDir, { recursive: true });

    const roadbookPath = path.join(roadbookDir, "roadbook.json");
    const configPath = path.join(roadbookDir, "config.js");
    const catalogPath = resolveInsideWorkspace("roadbooks", "catalog.json");

    fs.writeFileSync(roadbookPath, `${JSON.stringify(roadbook, null, 2)}\n`, "utf8");
    fs.writeFileSync(configPath, ensureTrailingNewline(configJs), "utf8");
    fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

    const gpxFiles = Array.isArray(payload.gpxFiles) ? payload.gpxFiles : [];
    const gpxDir = resolveInsideWorkspace("roadbooks", roadbookId, "gpx");
    if (gpxFiles.length > 0) {
        fs.mkdirSync(gpxDir, { recursive: true });
    }
    gpxFiles.forEach(gpxFile => {
        if (!gpxFile || typeof gpxFile !== "object" || !gpxFile.path || !gpxFile.base64) return;
        const relativePath = gpxFile.path.replace(/^\.?\/+/, "");
        if (!relativePath.endsWith(".gpx")) return;
        const safeName = relativePath.split("/").pop().replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase();
        if (!safeName.endsWith(".gpx")) return;
        const gpxFilePath = path.join(gpxDir, safeName);
        const content = Buffer.from(gpxFile.base64, "base64");
        fs.writeFileSync(gpxFilePath, content);
        console.log(`[publish-roadbook] GPX written: ${toPosixPath(path.relative(WORKSPACE, gpxFilePath))} (${content.length} bytes)`);
    });

    const mediaFiles = Array.isArray(payload.mediaFiles) ? payload.mediaFiles : [];
    const dataDir = resolveInsideWorkspace("roadbooks", roadbookId, "data");
    if (mediaFiles.length > 0) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    mediaFiles.forEach(mediaFile => {
        if (!mediaFile || typeof mediaFile !== "object" || !mediaFile.path || !mediaFile.base64) return;
        const relativePath = mediaFile.path.replace(/^\.?\/+/, "");
        if (!relativePath.startsWith("data/")) return;
        const safeName = sanitizeMediaFilename(relativePath.split("/").pop());
        if (!safeName || !isAllowedImageFilename(safeName)) return;
        const mediaFilePath = path.join(dataDir, safeName);
        const content = Buffer.from(mediaFile.base64, "base64");
        fs.writeFileSync(mediaFilePath, content);
        console.log(`[publish-roadbook] Media written: ${toPosixPath(path.relative(WORKSPACE, mediaFilePath))} (${content.length} bytes)`);
    });

    console.log(`[publish-roadbook] Roadbook written: ${toPosixPath(path.relative(WORKSPACE, roadbookPath))}`);
    console.log(`[publish-roadbook] Config written: ${toPosixPath(path.relative(WORKSPACE, configPath))}`);
    console.log(`[publish-roadbook] Catalog updated: ${toPosixPath(path.relative(WORKSPACE, catalogPath))}`);
    console.log(`[publish-roadbook] Catalog contains "${roadbookId}": ${catalog.roadbooks.includes(roadbookId)}`);
    if (gpxFiles.length > 0) {
        console.log(`[publish-roadbook] GPX files processed: ${gpxFiles.length}`);
    }
    if (mediaFiles.length > 0) {
        console.log(`[publish-roadbook] Media files processed: ${mediaFiles.length}`);
    }
}

function decodePayload(payloadBase64, payloadEncoding) {
    const raw = Buffer.from(payloadBase64, "base64");
    let json;

    if (payloadEncoding === "gzip-base64") {
        json = zlib.gunzipSync(raw).toString("utf8");
    } else if (payloadEncoding === "json-base64") {
        json = raw.toString("utf8");
    } else {
        fail(`Unsupported payload encoding "${payloadEncoding}".`);
    }

    try {
        return JSON.parse(json);
    } catch (error) {
        fail(`Publication payload is not valid JSON: ${error.message}`);
    }
}

function parseRoadbookJson(roadbookJson, roadbookId) {
    if (typeof roadbookJson !== "string" || !roadbookJson.trim()) {
        fail("Payload roadbookJson must be a non-empty JSON string.");
    }

    let roadbook;
    try {
        roadbook = JSON.parse(roadbookJson);
    } catch (error) {
        fail(`roadbookJson is not valid JSON: ${error.message}`);
    }

    if (!roadbook || typeof roadbook !== "object" || Array.isArray(roadbook)) {
        fail("roadbookJson must describe a JSON object.");
    }

    const jsonId = normalizeRoadbookId(roadbook.id || roadbookId);
    if (jsonId && jsonId !== roadbookId) {
        fail(`roadbookJson id "${jsonId}" does not match workflow roadbook_id "${roadbookId}".`);
    }

    if (!Array.isArray(roadbook.stages)) {
        roadbook.stages = [];
    }
    if (!roadbook.metadata || typeof roadbook.metadata !== "object" || Array.isArray(roadbook.metadata)) {
        roadbook.metadata = {};
    }
    if (!roadbook.summary || typeof roadbook.summary !== "object" || Array.isArray(roadbook.summary)) {
        roadbook.summary = {};
    }

    return roadbook;
}

function validateConfigJs(configJs, roadbookId) {
    if (typeof configJs !== "string" || !configJs.trim()) {
        fail("Payload configJs must be a non-empty string.");
    }
    if (!configJs.includes("ROADBOOK_CONFIGS")) {
        fail("configJs must register the roadbook in ROADBOOK_CONFIGS.");
    }
    if (!configJs.includes(`roadbooks/${roadbookId}/roadbook.json`)) {
        fail(`configJs must point to roadbooks/${roadbookId}/roadbook.json.`);
    }
    if (/\bgoogleSheetId\s*:\s*["'][^"']+["']/.test(configJs)) {
        fail("JSON-first config.js must not require a googleSheetId.");
    }
    return configJs;
}

function readCatalog() {
    const catalogPath = resolveInsideWorkspace("roadbooks", "catalog.json");
    if (!fs.existsSync(catalogPath)) {
        return { roadbooks: [] };
    }

    try {
        const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
        const roadbooks = Array.isArray(catalog.roadbooks)
            ? catalog.roadbooks.map(normalizeRoadbookId).filter(Boolean)
            : [];
        return { ...catalog, roadbooks: [...new Set(roadbooks)] };
    } catch (error) {
        fail(`roadbooks/catalog.json is not valid JSON: ${error.message}`);
    }
}

function resolveInsideWorkspace(...segments) {
    const resolved = path.resolve(WORKSPACE, ...segments);
    const relative = path.relative(WORKSPACE, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        fail(`Refusing to write outside workspace: ${resolved}`);
    }
    return resolved;
}

function normalizeRoadbookId(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

function sanitizeMediaFilename(value) {
    return String(value || "")
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
}

function isAllowedImageFilename(value) {
    return /\.(jpe?g|png|webp)$/i.test(value || "");
}

function ensureTrailingNewline(value) {
    return value.endsWith("\n") ? value : `${value}\n`;
}

function toPosixPath(value) {
    return value.split(path.sep).join("/");
}

function fail(message) {
    console.error(`[publish-roadbook] ${message}`);
    process.exit(1);
}
