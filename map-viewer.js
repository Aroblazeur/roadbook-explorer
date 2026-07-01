"use strict";

(function initializeMapViewer(global) {
    let activeLeafletMap = null;

    function renderEmbed(source) {
        const elements = mapElements();
        if (!elements) return false;

        resetMapContainer(elements);
        const embedUrl = resolveExternalMapEmbedUrl(source);
        elements.section.hidden = !embedUrl;
        if (!embedUrl) return false;

        const iframe = document.createElement("iframe");
        iframe.src = embedUrl;
        iframe.title = "Carte interactive externe de l'étape";
        iframe.loading = "lazy";
        iframe.referrerPolicy = "strict-origin-when-cross-origin";
        iframe.setAttribute("width", "100%");
        iframe.setAttribute("height", "320");
        iframe.style.border = "none";
        iframe.style.borderRadius = "12px";
        iframe.setAttribute("allowfullscreen", "");
        iframe.setAttribute("frameborder", "0");
        elements.container.appendChild(iframe);
        setStatus(elements, "");
        console.info("[Map Embed] Iframe externe affichée, fallback GPX ignoré.", { embedUrl });
        return true;
    }

    async function renderGpx(gpxUrl) {
        const elements = mapElements();
        if (!elements) return false;

        resetMapContainer(elements);
        if (!gpxUrl) {
            elements.section.hidden = true;
            setStatus(elements, "");
            return false;
        }

        elements.section.hidden = false;

        if (!global.L) {
            setStatus(elements, "Carte GPX indisponible : Leaflet n'est pas chargé.");
            console.error("[GPX Map] Leaflet indisponible.", { gpxUrl });
            return false;
        }

        try {
            console.info("[GPX Map] Chargement GPX", { gpxUrl });
            const response = await fetch(gpxUrl, {
                headers: { Accept: "application/gpx+xml, application/xml, text/xml, text/plain" }
            });
            console.info("[GPX Map] Réponse GPX", {
                url: gpxUrl,
                httpStatus: response.status,
                ok: response.ok,
                contentType: response.headers.get("content-type") || ""
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const parsed = parseGpxPoints(await response.text());
            console.info("[GPX Map] Parsing GPX", {
                success: parsed.success,
                pointCount: parsed.points.length,
                elevationPointCount: parsed.elevationPointCount,
                error: parsed.error || ""
            });
            if (parsed.success && parsed.elevationPointCount === 0) {
                console.info("[GPX Map] Ce GPX ne contient pas de données d'altitude.", {
                    pointCount: parsed.points.length,
                    elevationPointCount: parsed.elevationPointCount
                });
            }

            if (!parsed.success) {
                throw new Error(parsed.error || "GPX sans point exploitable");
            }

            const bounds = calculateBounds(parsed.points);
            console.info("[GPX Map] Bounds calculés", bounds);

            const map = global.L.map(elements.container, {
                scrollWheelZoom: false,
                tap: true
            });
            activeLeafletMap = map;

            global.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 19,
                attribution: "&copy; OpenStreetMap"
            }).addTo(map);

            const latLngs = parsed.points.map(point => [point.lat, point.lng]);
            const trace = global.L.polyline(latLngs, {
                color: "#2e7d32",
                weight: 4,
                opacity: 0.9
            }).addTo(map);

            map.fitBounds(trace.getBounds(), { padding: [24, 24] });
            setTimeout(() => map.invalidateSize(), 0);
            setStatus(elements, "");
            console.info("[GPX Map] Trace ajoutée à la carte", {
                gpxUrl,
                pointCount: parsed.points.length,
                bounds,
                fitBoundsExecuted: true
            });
            return true;
        } catch (error) {
            setStatus(elements, "La trace GPX est indisponible sur la carte.");
            console.error("[GPX Map] Rendu GPX impossible", {
                gpxUrl,
                message: error?.message || String(error)
            });
            return false;
        }
    }

    function mapElements() {
        const section = document.getElementById("map-embed-section");
        const container = document.getElementById("stage-map-embed");
        const status = document.getElementById("map-embed-status");

        if (!section || !container || !status) return null;
        return { section, container, status };
    }

    function resetMapContainer(elements) {
        if (activeLeafletMap) {
            activeLeafletMap.remove();
            activeLeafletMap = null;
        }
        elements.container.replaceChildren();
        elements.container.classList.remove("map-embed--leaflet");
    }

    function setStatus(elements, message) {
        elements.status.textContent = message;
        elements.status.hidden = !message;
    }

    function resolveExternalMapEmbedUrl(value) {
        if (typeof value !== "string" || !value.trim()) return null;
        const candidate = value.trim();
        let source = candidate;

        if (/^<iframe[\s>]/i.test(candidate)) {
            const documentNode = new DOMParser().parseFromString(candidate, "text/html");
            source = documentNode.querySelector("iframe[src]")?.getAttribute("src") || "";
        }

        try {
            const url = new URL(source, global.location.href);
            return ["http:", "https:"].includes(url.protocol) ? url.href : null;
        } catch (error) {
            return null;
        }
    }

    function resolveGpxUrl(value) {
        if (typeof value !== "string" || !value.trim()) return null;
        const candidate = value.trim();

        if (/^https?:\/\//i.test(candidate)) {
            try {
                const url = new URL(candidate);
                return /\.gpx$/i.test(url.pathname) ? url.href : null;
            } catch (error) {
                return null;
            }
        }

        const localPath = sanitizeLocalGpxPath(candidate);
        if (!localPath) return null;

        const roadbookId = sanitizeRoadbookId(global.currentRoadbookConfig?.shortId || global.currentRoadbookConfig?.id || "perinexus");
        if (!roadbookId) return null;

        const withoutRoadbookPrefix = stripRoadbookGpxPrefix(localPath, roadbookId);
        const withoutGpxPrefix = withoutRoadbookPrefix.replace(/^gpx\//i, "");
        const withExtension = /\.gpx$/i.test(withoutGpxPrefix) ? withoutGpxPrefix : `${withoutGpxPrefix}.gpx`;
        const encoded = withExtension.split("/").map(part => encodeURIComponent(part)).join("/");
        return `roadbooks/${roadbookId}/gpx/${encoded}`;
    }

    function sanitizeLocalGpxPath(value) {
        const candidate = String(value || "").trim().replace(/^\.\/+/, "");
        if (
            !candidate ||
            candidate.startsWith("/") ||
            candidate.startsWith("//") ||
            candidate.includes("\\") ||
            candidate.includes("?") ||
            candidate.includes("#") ||
            /^[a-z][a-z0-9+.-]*:/i.test(candidate)
        ) {
            return "";
        }

        const parts = candidate.split("/");
        if (parts.some(part => !part || part === "." || part === "..")) return "";
        return parts.join("/");
    }

    function stripRoadbookGpxPrefix(path, roadbookId) {
        const prefix = `roadbooks/${roadbookId}/gpx/`;
        return path.toLowerCase().startsWith(prefix.toLowerCase())
            ? path.slice(prefix.length)
            : path;
    }

    function sanitizeRoadbookId(value) {
        const candidate = String(value || "").trim().toLowerCase();
        return /^[a-z0-9-]+$/.test(candidate) ? candidate : "";
    }

    function parseGpxPoints(xmlText) {
        try {
            if (typeof DOMParser !== "function") {
                return { success: false, points: [], error: "DOMParser indisponible" };
            }

            const documentNode = new DOMParser().parseFromString(String(xmlText ?? ""), "application/xml");
            if (documentNode.getElementsByTagName("parsererror").length) {
                return { success: false, points: [], error: "XML/GPX invalide" };
            }

            const nodes = [
                ...Array.from(documentNode.getElementsByTagName("trkpt")),
                ...Array.from(documentNode.getElementsByTagName("rtept")),
                ...Array.from(documentNode.getElementsByTagName("wpt"))
            ];
            const points = nodes
                .map(node => ({
                    lat: Number(node.getAttribute("lat")),
                    lng: Number(node.getAttribute("lon")),
                    elevation: parseElevation(node)
                }))
                .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
            const elevationPointCount = points.filter(point => point.elevation !== null).length;

            return {
                success: points.length > 0,
                points,
                elevationPointCount,
                error: points.length > 0 ? "" : "Aucun point GPX exploitable"
            };
        } catch (error) {
            return { success: false, points: [], elevationPointCount: 0, error: error?.message || String(error) };
        }
    }

    function parseElevation(node) {
        const elevationNode = node.getElementsByTagName("ele")[0];
        if (!elevationNode) return null;
        const elevation = Number(String(elevationNode.textContent || "").trim().replace(",", "."));
        return Number.isFinite(elevation) ? elevation : null;
    }

    function calculateBounds(points) {
        if (!Array.isArray(points) || !points.length) return null;
        return points.reduce((bounds, point) => ({
            minLat: Math.min(bounds.minLat, point.lat),
            maxLat: Math.max(bounds.maxLat, point.lat),
            minLng: Math.min(bounds.minLng, point.lng),
            maxLng: Math.max(bounds.maxLng, point.lng)
        }), {
            minLat: points[0].lat,
            maxLat: points[0].lat,
            minLng: points[0].lng,
            maxLng: points[0].lng
        });
    }

    global.roadbookMapViewer = Object.freeze({
        renderEmbed,
        renderGpx,
        resolveGpxUrl,
        resolveExternalMapEmbedUrl,
        parseGpxPoints,
        calculateBounds
    });
})(window);
