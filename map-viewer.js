"use strict";

(function initializeMapViewer(global) {
    const traceCache = new Map();
    let map = null;
    let traceLayer = null;
    let requestController = null;
    let renderId = 0;

    async function render(url, { fetchImpl = global.fetch } = {}) {
        const section = document.getElementById("map-section");
        const container = document.getElementById("stage-map");
        const status = document.getElementById("map-status");
        clear();

        if (!isSafeUrl(url)) {
            section.hidden = true;
            return false;
        }

        section.hidden = false;
        container.hidden = false;
        status.hidden = false;
        status.textContent = "Chargement de la trace…";

        if (!isLeafletAvailable()) {
            showError(container, status, "La carte interactive n’est pas disponible.");
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
            showError(container, status, error?.message || "La trace GPX ne peut pas être affichée.");
            return false;
        }
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

        let response;
        try {
            response = await fetchImpl(url, { signal, headers: { Accept: "application/gpx+xml, application/xml, text/xml" } });
        } catch (error) {
            if (error?.name === "AbortError") throw error;
            throw new Error("La trace GPX ne peut pas être téléchargée.");
        }
        if (!response.ok) throw new Error(`La trace GPX est indisponible (HTTP ${response.status}).`);

        const points = parseGpx(await response.text());
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

    function isSafeUrl(value) {
        if (typeof value !== "string" || !value.trim()) return false;
        const candidate = value.trim();
        const relativeGpx = /^(?:\.{0,2}\/)/.test(candidate) || /\.gpx(?:[?#].*)?$/i.test(candidate);
        if (!/^https?:\/\//i.test(candidate) && !relativeGpx) return false;
        try {
            return ["http:", "https:"].includes(new URL(candidate, global.location.href).protocol);
        } catch (error) {
            return false;
        }
    }

    global.roadbookMapViewer = Object.freeze({ render, clear });
})(window);
