"use strict";

(function initializeMapViewer(global) {
    const traceCache = new Map();
    let map = null;
    let traceLayer = null;
    let requestController = null;
    let renderId = 0;

    async function render(source, { fetchImpl = global.fetch } = {}) {
        const section = document.getElementById("map-section");
        const container = document.getElementById("stage-map");
        const status = document.getElementById("map-status");

        if (!section || !container || !status) {
            console.error("[Roadbook map] Conteneurs de carte introuvables.");
            return false;
        }
        clear();

        const url = resolveGpxUrl(source);
        if (!url) {
            section.hidden = true;
            return false;
        }

        section.hidden = false;
        container.hidden = false;
        status.hidden = false;
        status.textContent = "Chargement de la trace…";

        if (!isLeafletAvailable()) {
            const message = "Leaflet n’est pas disponible. Vérifiez le chargement du script CDN.";
            console.error(`[Roadbook map] ${message}`);
            showError(container, status, message);
            return false;
        }

        const currentRender = ++renderId;
        requestController = new AbortController();

        try {
            const points = await loadTrace(url, fetchImpl, requestController.signal);
            if (currentRender !== renderId) return false;
            createMap(container, points);
            status.hidden = true;
            status.textContent = "";
            return true;
        } catch (error) {
            if (error?.name === "AbortError" || currentRender !== renderId) return false;
            const message = error?.message || "La trace GPX ne peut pas être affichée.";
            console.error("[Roadbook map] Échec du chargement GPX.", { url, reason: message });
            showError(container, status, message);
            return false;
        }
    }

    function renderEmbed(source) {
        const section = document.getElementById("map-embed-section");
        const container = document.getElementById("stage-map-embed");
        const status = document.getElementById("map-embed-status");

        if (!section || !container || !status) return false;

        container.replaceChildren();
        const mapyUrl = resolveMapyUrl(source);
        section.hidden = !mapyUrl;
        if (!mapyUrl) return false;

        renderMapyEmbed(container, status, mapyUrl);
        return true;
    }

    function clear() {
        renderId += 1;
        requestController?.abort();
        requestController = null;
        traceLayer = null;
        if (map) {
            map.remove();
            map = null;
        }
        const container = document.getElementById("stage-map");
        const status = document.getElementById("map-status");
        if (container) {
            container.hidden = false;
            container.replaceChildren();
            container.className = "";
            container.removeAttribute("style");
        }
        if (status) {
            status.hidden = true;
            status.textContent = "";
        }
    }

    async function loadTrace(url, fetchImpl, signal) {
        if (traceCache.has(url)) return traceCache.get(url);
        if (typeof fetchImpl !== "function") throw new Error("La trace GPX est inaccessible hors connexion.");
        if (isMapyShareUrl(url)) {
            throw new Error("Ce lien Mapy est une page de partage, pas un fichier GPX direct. Utilisez une URL vers un fichier .gpx.");
        }

        let response;
        try {
            response = await fetchImpl(url, { signal, headers: { Accept: "application/gpx+xml, application/xml, text/xml" } });
        } catch (error) {
            if (error?.name === "AbortError") throw error;
            throw new Error("La trace GPX ne peut pas être téléchargée depuis le navigateur (réseau ou CORS).");
        }
        if (!response.ok) throw new Error(`La trace GPX est indisponible (HTTP ${response.status}).`);

        const contentType = response.headers?.get?.("content-type") || "";
        const source = await response.text();
        if (/text\/html/i.test(contentType) || /^\s*<!doctype\s+html/i.test(source) || /^\s*<html[\s>]/i.test(source)) {
            throw new Error("Le lien fourni renvoie une page web, pas un fichier GPX direct.");
        }

        const points = parseGpx(source);
        traceCache.set(url, points);
        return points;
    }

    function parseGpx(source) {
        const documentNode = new DOMParser().parseFromString(String(source || ""), "application/xml");
        if (documentNode.querySelector("parsererror")) throw new Error("Le fichier GPX est invalide.");

        const trackPoints = [
            ...documentNode.getElementsByTagNameNS("*", "trkpt"),
            ...documentNode.getElementsByTagNameNS("*", "rtept")
        ];
        const points = trackPoints.map(point => ({
            lat: Number(point.getAttribute("lat")),
            lng: Number(point.getAttribute("lon"))
        })).filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng)
            && point.lat >= -90 && point.lat <= 90 && point.lng >= -180 && point.lng <= 180);

        if (points.length < 2) throw new Error("Le fichier GPX ne contient pas de trace exploitable.");
        return points;
    }

    function createMap(container, points) {
        map = global.L.map(container, {
            scrollWheelZoom: false,
            tap: true,
            touchZoom: true
        });
        global.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        const coordinates = points.map(point => [point.lat, point.lng]);
        traceLayer = global.L.polyline(coordinates, {
            color: "#d34f1f",
            weight: 5,
            opacity: 0.9,
            lineJoin: "round"
        }).addTo(map);
        global.L.marker(coordinates[0], { title: "Départ" }).bindTooltip("Départ").addTo(map);
        global.L.marker(coordinates.at(-1), { title: "Arrivée" }).bindTooltip("Arrivée").addTo(map);
        map.fitBounds(traceLayer.getBounds(), { padding: [24, 24], maxZoom: 15 });
        requestAnimationFrame(() => map?.invalidateSize());
    }

    function renderMapyEmbed(container, status, url) {
        const iframe = document.createElement("iframe");
        iframe.src = url;
        iframe.title = "Carte interactive Mapy de l’étape";
        iframe.loading = "lazy";
        iframe.referrerPolicy = "strict-origin-when-cross-origin";
        iframe.setAttribute("width", "100%");
        iframe.setAttribute("height", "320");
        iframe.style.border = "none";
        iframe.style.borderRadius = "12px";
        iframe.setAttribute("allowfullscreen", "");
        iframe.setAttribute("frameborder", "0");
        container.replaceChildren(iframe);
        container.className = "mapy-embed";
        status.hidden = true;
        status.textContent = "";
    }

    function showError(container, status, message) {
        if (map) {
            map.remove();
            map = null;
        }
        container.hidden = true;
        status.hidden = false;
        status.textContent = message;
    }

    function isLeafletAvailable() {
        return global.L && typeof global.L.map === "function" && typeof global.L.polyline === "function";
    }

    function isMapyShareUrl(value) {
        try {
            const url = new URL(value, global.location.href);
            return /(^|\.)mapy\.(?:com|cz)$/i.test(url.hostname) && /^\/s\//i.test(url.pathname);
        } catch (error) {
            return false;
        }
    }

    function resolveMapyUrl(value) {
        if (typeof value !== "string" || !value.trim()) return null;
        const candidate = value.trim();
        let source = candidate;

        if (/^<iframe[\s>]/i.test(candidate)) {
            const documentNode = new DOMParser().parseFromString(candidate, "text/html");
            source = documentNode.querySelector("iframe[src]")?.getAttribute("src") || "";
        }

        try {
            const url = new URL(source, global.location.href);
            return url.origin === "https://mapy.com" && url.href.startsWith("https://mapy.com/")
                ? url.href
                : null;
        } catch (error) {
            return null;
        }
    }

    function resolveGpxUrl(value) {
        if (typeof value !== "string" || !value.trim()) return null;
        const candidate = value.trim();
        try {
            const url = new URL(candidate, "https://roadbook.local/");
            const validProtocol = ["http:", "https:"].includes(url.protocol);
            return validProtocol && /\.gpx$/i.test(url.pathname) ? candidate : null;
        } catch (error) {
            return null;
        }
    }

    global.roadbookMapViewer = Object.freeze({
        render,
        renderEmbed,
        clear,
        resolveGpxUrl,
        resolveMapyUrl
    });
})(window);
