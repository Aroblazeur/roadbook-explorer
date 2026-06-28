"use strict";

(function initializeMapViewer(global) {
    function renderEmbed(source) {
        const section = document.getElementById("map-embed-section");
        const container = document.getElementById("stage-map-embed");
        const status = document.getElementById("map-embed-status");

        if (!section || !container || !status) return false;

        container.replaceChildren();
        const mapyUrl = resolveMapyUrl(source);
        section.hidden = !mapyUrl;
        if (!mapyUrl) return false;

        const iframe = document.createElement("iframe");
        iframe.src = mapyUrl;
        iframe.title = "Carte interactive Mapy de l’étape";
        iframe.loading = "lazy";
        iframe.referrerPolicy = "strict-origin-when-cross-origin";
        iframe.setAttribute("width", "100%");
        iframe.setAttribute("height", "320");
        iframe.style.border = "none";
        iframe.style.borderRadius = "12px";
        iframe.setAttribute("allowfullscreen", "");
        iframe.setAttribute("frameborder", "0");
        container.appendChild(iframe);
        status.hidden = true;
        status.textContent = "";
        return true;
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
        if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate) && !candidate.includes("/") && !candidate.includes("\\") && !candidate.includes("..")) {
            const roadbookId = (global.currentRoadbookConfig?.shortId) || "perinexus";
            const base = `roadbooks/${roadbookId}/gpx/`;
            return /\.gpx$/i.test(candidate) ? `${base}${candidate}` : `${base}${candidate}.gpx`;
        }

        try {
            const url = new URL(candidate, "https://roadbook.local/");
            const validProtocol = ["http:", "https:"].includes(url.protocol);
            return validProtocol && /\.gpx$/i.test(url.pathname) ? candidate : null;
        } catch (error) {
            return null;
        }
    }

    global.roadbookMapViewer = Object.freeze({
        renderEmbed,
        resolveGpxUrl,
        resolveMapyUrl
    });
})(window);
