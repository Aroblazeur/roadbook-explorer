"use strict";

/**
 * =====================================================
 * Perinexus Roadbook
 * =====================================================
 */

let roadbook = null;
let currentDay = 0;
let currentView = "home";
let accommodationEnrichmentIndex = new Map();
let poiEnrichmentIndex = new Map();
let durationRequestId = 0;

const TRAVELER_NOTES_FORM_URL =
    "https://docs.google.com/forms/d/e/1FAIpQLSd_m6lL7ctB7sxz8VOx2Bm7fzNYBUCmXjAZ30YUkV1EK2pmbA/viewform";
const TRAVELER_NOTES_STAGE_FIELD = "entry.521193530";
const ADD_ACCOMMODATION_FORM_URL =
    "https://docs.google.com/forms/d/e/1FAIpQLSccYxccGvTR1Ih3PBdWDO2Z1kI_qrlM2VnDCmkUYDDpQLormA/viewform";
const ADD_ACCOMMODATION_STAGE_FIELD = "entry.819202802";
const STAT_ICONS = Object.freeze({
    steps: [
        ["path", { d: "M12 21s6-5.7 6-11a6 6 0 1 0-12 0c0 5.3 6 11 6 11Z" }],
        ["circle", { cx: "12", cy: "10", r: "2.4" }]
    ],
    distance: [
        ["path", { d: "M4 17 17 4l3 3L7 20 4 17Z" }],
        ["path", { d: "M8 13 11 16" }],
        ["path", { d: "M11 10 14 13" }],
        ["path", { d: "M14 7 17 10" }]
    ],
    elevationGain: [
        ["path", { d: "m3 18 6.5-11 4.5 7 2-3 5 7H3Z" }],
        ["path", { d: "M16 4v6" }],
        ["path", { d: "m13.5 6.5 2.5-2.5 2.5 2.5" }]
    ],
    elevationLoss: [
        ["path", { d: "m3 18 6.5-11 4.5 7 2-3 5 7H3Z" }],
        ["path", { d: "M16 4v6" }],
        ["path", { d: "m13.5 7.5 2.5 2.5 2.5-2.5" }]
    ],
    duration: [
        ["circle", { cx: "12", cy: "12", r: "8" }],
        ["path", { d: "M12 8v4l3 2" }]
    ]
});

/**
 * Chargement des données
 */
async function initializeRoadbook() {

    try {

        const accommodationEnrichmentPromise = loadOptionalAccommodationEnrichment();
        const poiEnrichmentPromise = loadOptionalPoiEnrichment();

        if (typeof loadRoadbook !== "function") {
            throw new Error("Loader indisponible");
        }

        roadbook = await loadRoadbook();

        if (!roadbook || !Array.isArray(roadbook.days) || roadbook.days.length === 0) {
            throw new Error("Le roadbook ne contient aucune étape exploitable.");
        }

        renderHomePage();
        showHomePage();

        [accommodationEnrichmentIndex, poiEnrichmentIndex] = await Promise.all([
            accommodationEnrichmentPromise,
            poiEnrichmentPromise
        ]);
        if (currentView === "stage") {
            renderCurrentAccommodation();
            renderCurrentPois();
        }

    } catch (error) {

        roadbook = null;
        currentDay = 0;
        console.error("[Roadbook] Chargement impossible :", error);

        document.getElementById("roadbook-info").textContent =
            error && error.message
                ? error.message
                : "Impossible de charger le roadbook.";

        updateButtons();

    }

}

function loadOptionalAccommodationEnrichment() {
    const loader = window.accommodationEnrichmentLoader;
    if (!loader || typeof loader.loadAccommodationEnrichment !== "function") {
        return Promise.resolve(new Map());
    }
    return loader.loadAccommodationEnrichment();
}

function renderCurrentAccommodation() {
    if (!roadbook || !Array.isArray(roadbook.days)) return;
    const day = roadbook.days[currentDay];
    if (day) renderAccommodation(day.accommodation);
}

function loadOptionalPoiEnrichment() {
    const loader = window.poiEnrichmentLoader;
    if (!loader || typeof loader.loadPoiEnrichment !== "function") {
        return Promise.resolve(new Map());
    }
    return loader.loadPoiEnrichment();
}

function renderCurrentPois() {
    if (!roadbook || !Array.isArray(roadbook.days)) return;
    const day = roadbook.days[currentDay];
    if (day) updatePois(day);
}

/**
 * Résumé
 */
function updateSummary() {

    if (!roadbook || !Array.isArray(roadbook.days)) return;

    updateRoadbookChrome();

    const info = document.getElementById("roadbook-info");

    info.replaceChildren();
    renderHomePageContent(info);

}

function renderHomePage() {
    updateSummary();
}

function computeStagesTotal() {
    const sumFinite = arr => {
        const valid = arr.filter(v => Number.isFinite(v));
        return valid.length ? valid.reduce((a, b) => a + b, 0) : null;
    };

    const marker = roadbook.summary?.stagesTotalMarker || null;
    const existing = roadbook.summary?.stagesTotal;
    const existingHasData = existing &&
        [existing.distance, existing.elevationGain, existing.elevationLoss].some(Number.isFinite);
    if (existingHasData) return existing;

    const days = Array.isArray(roadbook.days) ? roadbook.days : [];
    const distance = sumFinite(days.map(d => d.distance));
    const elevationGain = sumFinite(days.map(d => d.elevationGain));
    const elevationLoss = sumFinite(days.map(d => d.elevationLoss));

    const hasAny = [distance, elevationGain, elevationLoss].some(Number.isFinite);
    return hasAny
        ? {
            distance,
            elevationGain,
            elevationLoss,
            mapEmbedUrl: marker?.mapEmbedUrl ?? null,
            gpx: marker?.gpx ?? null,
            link: marker?.link ?? null
        }
        : null;
}

function renderHomePageContent(container) {
    renderOfficialItinerarySummary(container, roadbook.summary?.official);
    renderHomeStageList(container);
    renderRoadbookCurrentSummary(container, computeStagesTotal());
}

function renderOfficialItinerarySummary(container, summary) {
    if (!summary) return;

    const section = document.createElement("div");
    section.className = "official-itinerary";

    const heading = document.createElement("h3");
    heading.textContent = "Itinéraire officiel";
    section.appendChild(heading);

    const stats = document.createElement("div");
    stats.className = "official-itinerary__stats stats stats--compact";
    appendSummaryStatIfPresent(stats, "distance", "Distance", summary.distance, formatDistanceMetric);
    appendSummaryStatIfPresent(stats, "elevationGain", "D+", summary.elevationGain, formatElevationMetric);
    appendSummaryStatIfPresent(stats, "elevationLoss", "D−", summary.elevationLoss, formatElevationMetric);
    section.appendChild(stats);

    appendSummaryMap(section, summary.mapEmbedUrl, {
        title: "Carte interactive de l'itinéraire officiel"
    });
    appendSummaryLink(section, summary.link, "Voir le tracé complet");

    container.appendChild(section);
}

function renderRoadbookCurrentSummary(container, summary) {
    if (!summary) return;

    const section = document.createElement("div");
    section.className = "roadbook-current-summary";

    const heading = document.createElement("h3");
    heading.textContent = "Tracé total actuel";
    section.appendChild(heading);

    const stats = document.createElement("div");
    stats.className = "stats stats--compact";
    appendSummaryStatIfPresent(stats, "distance", "Distance", summary.distance, formatDistanceMetric);
    appendSummaryStatIfPresent(stats, "elevationGain", "D+", summary.elevationGain, formatElevationMetric);
    appendSummaryStatIfPresent(stats, "elevationLoss", "D−", summary.elevationLoss, formatElevationMetric);
    section.appendChild(stats);

    appendSummaryMap(section, summary.mapEmbedUrl, {
        title: "Carte interactive du tracé total actuel",
        className: "roadbook-current-summary__map mapy-embed"
    });
    appendSummaryLink(section, summary.link, "Voir le tracé total actuel", "roadbook-current-summary__actions");

    container.appendChild(section);
}

function renderHomeStageList(container) {
    const section = document.createElement("section");
    section.className = "home-stage-list";
    section.setAttribute("aria-labelledby", "home-stage-list-title");

    const heading = document.createElement("h2");
    heading.id = "home-stage-list-title";
    heading.textContent = "Étapes";
    section.appendChild(heading);

    const list = document.createElement("div");
    list.className = "home-stage-list__items";

    roadbook.days.forEach((day, index) => {
        list.appendChild(createHomeStageCard(day, index));
    });

    section.appendChild(list);
    container.appendChild(section);
}

function createHomeStageCard(day, index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "home-stage-card";
    button.addEventListener("click", () => openStage(index));

    const number = document.createElement("span");
    number.className = "home-stage-card__number";
    number.textContent = safeText(day.stage || (index + 1), String(index + 1));

    const content = document.createElement("span");
    content.className = "home-stage-card__content";

    const route = document.createElement("strong");
    route.className = "home-stage-card__route";
    route.textContent = stageRouteLabel(day, index);
    content.appendChild(route);

    const stats = document.createElement("span");
    stats.className = "home-stage-card__stats stats stats--compact";
    appendSummaryStatIfPresent(stats, "distance", "Distance", day.distance, formatDistanceMetric);
    appendSummaryStatIfPresent(stats, "elevationGain", "D+", day.elevationGain, formatElevationMetric);
    content.appendChild(stats);

    const accommodationIcon = document.createElement("span");
    accommodationIcon.className = "home-stage-card__accommodation";
    setAccommodationIcon(
        accommodationIcon,
        day.accommodationType || accommodationNameForIcon(day.accommodation)
    );

    button.append(number, content, accommodationIcon);
    return button;
}

function accommodationNameForIcon(accommodation) {
    if (typeof accommodation === "string") return accommodation;
    return accommodation?.name || accommodation?.website || accommodation?.url || "";
}

function setAccommodationIcon(element, typeOrName) {
    const icon = getAccommodationIcon(typeOrName);
    element.textContent = icon;
    element.hidden = !icon;
    if (icon) {
        const label = getAccommodationIconLabel(typeOrName);
        element.title = label;
        element.setAttribute("aria-label", label);
    } else {
        element.removeAttribute("title");
        element.removeAttribute("aria-label");
    }
}

function createAccommodationIcon(typeOrName, className = "accommodation-type-icon") {
    const icon = getAccommodationIcon(typeOrName);
    if (!icon) return null;
    const element = document.createElement("span");
    element.className = className;
    element.textContent = icon;
    element.title = getAccommodationIconLabel(typeOrName);
    element.setAttribute("aria-label", element.title);
    return element;
}

function getAccommodationIcon(typeOrName) {
    const detected = detectAccommodationKind(typeOrName);
    if (detected === "camping") return "🏕️";
    if (detected === "maison") return "🏠";
    if (detected === "les deux") return "🏕️🏠";
    return "";
}

function getAccommodationIconLabel(typeOrName) {
    const detected = detectAccommodationKind(typeOrName);
    if (detected === "camping") return "Camping";
    if (detected === "maison") return "Maison";
    if (detected === "les deux") return "Camping et maison";
    return "";
}

function detectAccommodationKind(typeOrName) {
    const normalized = normalizeAccommodationText(typeOrName);
    if (!normalized) return "";
    if (normalized === "camping") return "camping";
    if (normalized === "maison") return "maison";
    if (normalized === "les deux" || normalized === "camping maison" || normalized === "maison camping") {
        return "les deux";
    }

    const campingKeywords = [
        "camping",
        "campsite",
        "camp site",
        "campground",
        "campamento",
        "acampada",
        "acampar",
        "zona de acampada",
        "area de acampada",
        "càmping",
        "campisme",
        "campeggio",
        "campismo",
        "kampeerterrein",
        "kampeerplaats",
        "zeltplatz",
        "campplatz"
    ];
    const homeKeywords = [
        "maison",
        "location",
        "gite",
        "gîte",
        "appartement",
        "villa",
        "chambre",
        "chambres",
        "maison d’hotes",
        "maison d'hotes",
        "hôtel",
        "hotel",
        "hostel",
        "guesthouse",
        "alojamiento",
        "casa",
        "apartamento",
        "vivienda",
        "alquiler",
        "habitacion",
        "habitación",
        "habitaciones",
        "pensión",
        "pension",
        "hostal",
        "albergue",
        "refugio",
        "agroturismo",
        "casa rural",
        "holiday home",
        "vacation rental",
        "apartment"
    ];
    const hasCamping = campingKeywords
        .map(normalizeAccommodationText)
        .some(keyword => normalized.includes(keyword));
    const hasHome = homeKeywords
        .map(normalizeAccommodationText)
        .some(keyword => normalized.includes(keyword));
    if (hasCamping && hasHome) return "les deux";
    if (hasCamping) return "camping";
    if (hasHome) return "maison";
    return "";
}

function normalizeAccommodationText(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[’']/g, " ")
        .replace(/[-_/]+/g, " ")
        .replace(/\s+/g, " ");
}

function stageRouteLabel(day, index) {
    const departure = safeText(day.departure, "");
    const arrival = safeText(day.arrival, "");
    const route = [departure, arrival].filter(Boolean).join(" → ");
    return route || safeText(day.title, `Étape ${index + 1}`);
}

function appendSummaryStatIfPresent(container, icon, label, value, formatter) {
    if (!Number.isFinite(value)) return;
    appendSummaryStat(container, icon, label, formatter(value));
}

function appendSummaryStat(container, icon, label, value) {
    container.appendChild(createStatCard({ icon, label, value }));
}

function appendSummaryMap(container, mapEmbedUrl, options = {}) {
    const mapyUrl = window.roadbookMapViewer?.resolveMapyUrl?.(mapEmbedUrl);
    if (!mapyUrl) return;

    const {
        className = "official-itinerary__map mapy-embed",
        title = "Carte interactive",
        linkClassName = "official-itinerary__map-link",
        link = null,
        linkLabel = "Ouvrir la carte dans un nouvel onglet"
    } = options;
    const safeLink = isSafeUrl(link) ? link : null;
    const mapContainer = document.createElement("div");
    mapContainer.className = className;

    const iframe = document.createElement("iframe");
    iframe.src = mapyUrl;
    iframe.title = title;
    iframe.loading = "lazy";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.setAttribute("width", "100%");
    iframe.setAttribute("height", "320");
    iframe.style.border = "none";
    iframe.style.borderRadius = "12px";
    iframe.setAttribute("allowfullscreen", "");
    iframe.setAttribute("frameborder", "0");
    mapContainer.appendChild(iframe);

    if (safeLink) {
        const overlay = document.createElement("a");
        overlay.href = safeLink;
        overlay.target = "_blank";
        overlay.rel = "noopener noreferrer";
        overlay.className = linkClassName;
        overlay.setAttribute("aria-label", linkLabel);

        const label = document.createElement("span");
        label.className = "summary-map-link__label";
        label.textContent = linkLabel;
        overlay.appendChild(label);

        mapContainer.appendChild(overlay);
    }

    container.appendChild(mapContainer);
}

function appendSummaryLink(container, link, label = "Voir le tracé complet", className = "official-itinerary__actions") {
    if (!isSafeUrl(link)) return;

    const action = document.createElement("div");
    action.className = className;
    appendResource(action, link, label, "terrain-button");
    container.appendChild(action);
}

/**
 * Affichage d'une journée
 */
function displayDay(index) {

    if (!roadbook || !Array.isArray(roadbook.days)) return;
    if (!Number.isInteger(index) || index < 0 || index >= roadbook.days.length) return;

    const day = roadbook.days[index];

    if (!day) return;

    currentDay = index;
    showStagePage();
    updateRoadbookChrome(day);

    document.getElementById("current-day").textContent =
        day.day || `Étape ${day.stage || (index + 1)}`;

    renderStageTitle(day, index);

    renderStageMetricsAndDuration(day, index);

    const stageGpxUrl = day.gpx || day.route?.gpx;
    const mapVisible = renderStageMapEmbed(day.mapEmbedUrl, stageGpxUrl);
    renderFieldNavigation(day);
    renderNotes(day.noteItems || day.notes, day.stage || (index + 1));
    updatePois(day);

    updateButtons();

}

function renderStageTitle(day, index) {
    const heading = document.getElementById("day-title");
    if (!heading) return;

    const fallbackTitle = `Étape ${day.stage || (index + 1)}`;
    const title = safeText(day.title, fallbackTitle);
    const departure = safeText(day.departure, "");
    const arrival = safeText(day.arrival, "");
    heading.replaceChildren(...buildStageTitleContent(title, departure, arrival));
}

function createStageCityLink(city) {
    const link = document.createElement("a");
    link.className = "stage-city-link";
    link.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(city)}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = city;
    return link;
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildStageTitleContent(title, departure, arrival) {
    if (departure && arrival) {
        const routeMatch = title.match(
            new RegExp(
                `^(.*)(${escapeRegExp(departure)})(\\s*(?:→|->|[-–—])\\s*)(${escapeRegExp(arrival)})(\\s*)$`
            )
        );
        if (routeMatch) {
            const content = [document.createTextNode(routeMatch[1]), createStageCityLink(departure), document.createTextNode(routeMatch[3]), createStageCityLink(arrival)];
            if (routeMatch[5]) {
                content.push(document.createTextNode(routeMatch[5]));
            }
            return content;
        }
    }

    const city = departure || arrival;
    if (!city) {
        return [document.createTextNode(title)];
    }

    const cityAtEndPattern = new RegExp(`${escapeRegExp(city)}\\s*$`);
    if (!cityAtEndPattern.test(title)) {
        return [document.createTextNode(title)];
    }

    const cityIndex = title.lastIndexOf(city);
    const previousChar = cityIndex > 0 ? title[cityIndex - 1] : "";
    if (previousChar && /[\p{L}\p{N}]/u.test(previousChar)) {
        return [document.createTextNode(title)];
    }

    const trailingWhitespace = title.slice(cityIndex + city.length);
    const content = [document.createTextNode(title.slice(0, cityIndex)), createStageCityLink(city)];
    if (trailingWhitespace) {
        content.push(document.createTextNode(trailingWhitespace));
    }
    return content;
}

function openStage(index) {
    displayDay(index);
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function showHomePage() {
    currentView = "home";
    updateRoadbookChrome();
    setSectionHidden("summary", false);
    setStageSectionsHidden(true);
    updateButtons();
    document.title = safeText(roadbook?.title, "Roadbook vélo");
}

function showStagePage() {
    currentView = "stage";
    setSectionHidden("summary", true);
    setStageSectionsHidden(false);
}

function setStageSectionsHidden(hidden) {
    [
        "day-navigation",
        "day-card",
        "notes-section",
        "pois-section",
        "primary-accommodation-card",
        "map-embed-section",
        "variants-section",
        "alternative-accommodation-card"
    ].forEach(id => setSectionHidden(id, hidden));
}

function setSectionHidden(id, hidden) {
    const element = document.getElementById(id);
    if (element) element.hidden = hidden;
}

function updateRoadbookChrome(day = null) {
    const title = safeText(roadbook?.title, "Roadbook vélo");
    const pageTitle = day?.title ? `${safeText(day.title)} - ${title}` : title;
    const headerTitle = document.getElementById("roadbook-title");
    const footerTitle = document.getElementById("footer-roadbook-title");

    document.title = pageTitle;

    if (headerTitle) headerTitle.textContent = title;
    if (footerTitle) footerTitle.textContent = title;
}

function renderStageMetricsAndDuration(day, index) {
    ensureStageStatCards();
    const estimator = window.roadbookDurationEstimator;
    const requestId = ++durationRequestId;

    if (!estimator || typeof estimator.estimateStageDuration !== "function") {
        updateStatValue("distance", formatDistanceMetric(day.distance));
        updateStatValue("elevation", formatElevationMetric(day.elevationGain));
        updateStatValue("elevation-loss", formatElevationMetric(day.elevationLoss));
        updateStatValue("duration", safeText(day.duration));
        return;
    }

    const sheetMetrics = estimator.sheetStageMetrics(day);
    renderStageMetricValues(sheetMetrics);
    const fallbackHours = estimator.estimateFallbackHours(
        sheetMetrics.distanceKm,
        sheetMetrics.elevationGainM
    );
    updateStatValue("duration", estimator.formatDuration(fallbackHours) || safeText(day.duration));

    const gpxUrl = resolveStageGpxUrl(day.gpx || day.route?.gpx) || "";
    estimator.estimateStageDuration(day, { gpxUrl }).then(result => {
        if (requestId !== durationRequestId || currentDay !== index) return;
        renderStageMetricValues(result?.metrics);
        if (result?.formatted) updateStatValue("duration", result.formatted);
    }).catch(error => {
        console.warn(`[Durée] Estimation impossible : ${error.message}. Fallback conservé.`);
    });
}

function renderStageMetricValues(metrics) {
    updateStatValue("distance", formatDistanceMetric(metrics?.distanceKm));
    updateStatValue("elevation", formatElevationMetric(metrics?.elevationGainM));
    updateStatValue("elevation-loss", formatElevationMetric(metrics?.elevationLossM));
}

function ensureStageStatCards() {
    const stats = document.querySelector("#day-card .stats");
    if (!stats || stats.dataset.enhanced === "true") return;

    stats.classList.add("stats--compact");
    stats.replaceChildren(
        createStatCard({ icon: "distance", label: "Distance", value: "— km", valueId: "distance" }),
        createStatCard({ icon: "elevationGain", label: "D+", value: "— m", valueId: "elevation" }),
        createStatCard({ icon: "elevationLoss", label: "D−", value: "— m", valueId: "elevation-loss" }),
        createStatCard({ icon: "duration", label: "Durée", value: "Non renseigné", valueId: "duration" })
    );
    stats.dataset.enhanced = "true";
}

function createStatCard({ icon, label, value, valueId = "" }) {
    const item = document.createElement("div");
    item.className = "stat";
    item.dataset.label = label;
    item.setAttribute("aria-label", `${label} : ${value}`);

    const iconElement = createStatIcon(icon);
    const labelElement = document.createElement("span");
    labelElement.className = "stat__label";
    labelElement.textContent = label;

    const valueElement = document.createElement("strong");
    valueElement.className = "stat__value";
    valueElement.textContent = value;
    if (valueId) valueElement.id = valueId;

    item.append(iconElement, labelElement, valueElement);
    return item;
}

function createStatIcon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("stat__icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.9");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");

    (STAT_ICONS[name] || []).forEach(([tag, attributes]) => {
        const child = document.createElementNS("http://www.w3.org/2000/svg", tag);
        Object.entries(attributes).forEach(([key, value]) => child.setAttribute(key, value));
        svg.appendChild(child);
    });

    return svg;
}

function updateStatValue(id, value) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = value;
    const card = element.closest(".stat");
    const label = card?.dataset.label;
    if (card && label) card.setAttribute("aria-label", `${label} : ${value}`);
}

function formatDistanceMetric(value) {
    if (!Number.isFinite(value)) return "— km";
    const rounded = Math.round(value * 10) / 10;
    return `${rounded.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;
}

function formatElevationMetric(value) {
    return Number.isFinite(value) ? `${Math.round(value)} m` : "— m";
}

function renderStageMapEmbed(mapEmbedUrl, gpxUrl) {
    const resolvedGpx = resolveStageGpxUrl(gpxUrl);
    const viewer = window.roadbookMapViewer;
    if (!viewer || typeof viewer.renderEmbed !== "function") {
        const section = document.getElementById("map-embed-section");
        if (section) section.hidden = !resolvedGpx;
        renderMapGpxActions(resolvedGpx);
        return false;
    }
    const mapVisible = viewer.renderEmbed(mapEmbedUrl);
    if (!mapVisible && resolvedGpx) {
        const section = document.getElementById("map-embed-section");
        if (section) section.hidden = false;
    }
    renderMapGpxActions(resolvedGpx);
    return mapVisible;
}

function renderMapGpxActions(gpxUrl) {
    const actions = document.getElementById("map-gpx-actions");
    const downloadLink = document.getElementById("map-gpx-download");
    if (!actions || !downloadLink) return;

    const showGpx = Boolean(gpxUrl);
    actions.hidden = !showGpx;

    if (showGpx) {
        downloadLink.href = gpxUrl;
    } else {
        downloadLink.removeAttribute("href");
    }
}

/**
 * Points d'intérêt
 */
function updatePois(day) {

    const list = document.getElementById("pois");

    list.innerHTML = "";
    list.classList.remove("poi-list--enriched");

    const pois = Array.isArray(day.pois) ? day.pois : [];

    if (!pois.length) {
        const empty = document.createElement("li");
        empty.className = "empty";
        empty.textContent = "Non renseigné";
        list.appendChild(empty);
        return;
    }

    renderPoiList(list, pois);

}

function findPoiEnrichment(name) {
    const loader = window.poiEnrichmentLoader;
    if (!loader || typeof loader.normalizePoiName !== "function") return null;
    const key = loader.normalizePoiName(name);
    return key ? poiEnrichmentIndex.get(key) || null : null;
}

function resolvePoiEntry(poi) {
    const sourceName = typeof poi === "object" ? poi?.name || poi?.label : poi;
    const sourceDescription = typeof poi === "object" ? safeText(poi?.description, "") : "";
    const sourceImage = typeof poi === "object" ? safeText(poi?.image, "") : "";
    const sourceRegion = typeof poi === "object" ? safeText(poi?.region, "") : "";
    const name = safeText(sourceName, "Point d'intérêt");
    const metadata = findPoiEnrichment(name);
    const imageCandidate = sourceImage || metadata?.image || "";
    const image = isSafeUrl(imageCandidate) ? imageCandidate : "";
    const description = metadata?.description || sourceDescription || "";
    const coordinates = metadata?.coordinates || null;

    return {
        name: metadata?.name || name,
        image,
        region: sourceRegion,
        description,
        coordinates,
        isEnriched: Boolean(image || sourceRegion || description || coordinates)
    };
}

function appendPoiCard(list, entry) {
    const li = document.createElement("li");
    li.className = "poi-card";

    if (entry.image) {
        const image = document.createElement("img");
        image.className = "poi-card__image";
        image.src = entry.image;
        image.loading = "lazy";
        image.alt = `Photo de ${entry.name}`;
        image.addEventListener("error", () => {
            image.hidden = true;
            image.removeAttribute("src");
        }, { once: true });
        li.appendChild(image);
    }

    const content = document.createElement("div");
    content.className = "poi-card__content";
    const title = document.createElement("strong");
    title.className = "poi-card__name";
    title.textContent = entry.name;
    content.appendChild(title);

    if (entry.region) {
        const region = document.createElement("p");
        region.className = "variant-subtitle";
        region.textContent = entry.region;
        content.appendChild(region);
    }

    if (entry.description) {
        const description = document.createElement("p");
        description.className = "poi-card__description";
        description.textContent = entry.description;
        content.appendChild(description);
    }

    if (entry.coordinates) {
        const { lat, lng } = entry.coordinates;
        const mapLink = document.createElement("a");
        mapLink.className = "terrain-button terrain-button--secondary poi-card__map-link";
        mapLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
        mapLink.target = "_blank";
        mapLink.rel = "noopener noreferrer";
        mapLink.textContent = "Ouvrir sur la carte";
        content.appendChild(mapLink);
    }

    li.appendChild(content);
    list.appendChild(li);
}

function renderPoiList(list, pois) {
    const entries = pois.map(resolvePoiEntry);
    const hasEnrichedPoi = entries.some(entry => entry.isEnriched);

    list.classList.toggle("poi-list--enriched", hasEnrichedPoi);

    if (!hasEnrichedPoi) {
        entries.forEach(entry => {
            const item = document.createElement("li");
            item.textContent = entry.name;
            list.appendChild(item);
        });
        return;
    }

    entries.forEach(entry => {
        appendPoiCard(list, entry);
    });
}

function renderFieldNavigation(day) {
    const activeVariants = Array.isArray(day.variants) ? day.variants : [];
    renderVariants(activeVariants);
    renderAccommodation(day.accommodation);
}

function renderAccommodation(accommodation) {
    const day = roadbook?.days?.[currentDay] || null;
    renderPrimaryAccommodation(accommodation, day?.accommodationType || "");
    renderAlternativeAccommodation(accommodation, day?.stage || (currentDay + 1));
}

function renderPrimaryAccommodation(accommodation, accommodationType = "") {
    const section = document.getElementById("primary-accommodation-card");
    const container = document.getElementById("primary-accommodation");
    container.replaceChildren();

    if (typeof accommodation === "string") {
        const name = safeText(accommodation, "");
        section.hidden = !name;
        if (!name) return;
        const detail = document.createElement("p");
        detail.className = "detail-name";
        appendAccommodationNameWithIcon(detail, name, accommodationType || name);
        container.appendChild(detail);
        return;
    }

    const mainUrl = safeText(accommodation?.website || accommodation?.url, "");
    const mainPhoto = safeText(accommodation?.photo, "");
    const mainMetadata = mainPhoto ? null : findAccommodationEnrichment(mainUrl);
    const mainName = safeText(mainMetadata?.name || accommodation?.name, "");
    section.hidden = !mainName && !mainUrl;
    if (section.hidden) return;

    if (mainName) {
        const name = document.createElement("p");
        name.className = "detail-name";
        appendAccommodationNameWithIcon(name, mainName, accommodationType || mainName);
        container.appendChild(name);
    }
    appendAccommodationResource(
        container,
        mainUrl,
        "Ouvrir le site de l'hébergement",
        mainPhoto ? { name: mainName, image: mainPhoto } : mainMetadata
    );
}

function renderAlternativeAccommodation(accommodation, stageNumber) {
    const section = document.getElementById("alternative-accommodation-card");
    const title = document.getElementById("alternative-accommodation-title");
    const container = document.getElementById("alternative-accommodation");
    container.replaceChildren();

    const alternatives = Array.isArray(accommodation?.alternatives)
        ? accommodation.alternatives
            .map((url, index) => ({
                url,
                photo: safeText(accommodation?.alternativePhotos?.[index], "")
            }))
            .filter(item => item.url)
        : [];

    section.hidden = false;

    title.textContent = "Hébergements alternatifs";

    appendResourceList(container, "Hébergements alternatifs", alternatives, false);
    appendAddAccommodationButton(container, stageNumber);
}

function appendAddAccommodationButton(container, stageNumber) {
    const action = document.createElement("div");
    action.className = "add-accommodation-action";

    const link = document.createElement("a");
    link.href = buildAddAccommodationFormUrl(stageNumber);
    link.className = "terrain-button terrain-button--secondary";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "➕ Ajouter un hébergement";

    action.appendChild(link);
    container.appendChild(action);
}

function buildAddAccommodationFormUrl(stageNumber) {
    const url = new URL(ADD_ACCOMMODATION_FORM_URL);
    url.searchParams.set("usp", "pp_url");
    url.searchParams.set(ADD_ACCOMMODATION_STAGE_FIELD, safeText(stageNumber, ""));
    return url.href;
}

function isVarianteCourte(type) {
    if (!type) return false;
    const normalized = String(type).trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return normalized.includes("courte");
}

function variantDisplayLabel(variant) {
    return isVarianteCourte(variant.type)
        ? "Variante courte"
        : safeText(variant.name, "Alternative");
}

function variantTitleIdBase(variant) {
    const parts = [
        variant?.type,
        variant?.name,
        variant?.departure,
        variant?.arrival,
        variant?.stageReference,
        variant?.day
    ].map(value => safeText(value, "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""))
        .filter(Boolean);

    return `variant-title-${parts.join("-") || "alternative"}`;
}

function renderVariants(variants) {
    const section = document.getElementById("variants-section");
    const content = document.getElementById("variant-content");
    content.replaceChildren();
    content.classList.toggle("variant-cards", variants.length > 0);
    section.hidden = variants.length === 0;

    if (variants.length === 0) return;

    const titleIdCounts = new Map();

    variants.forEach(variant => {
        const block = document.createElement("article");
        block.className = "variant-block variant-card";

        const courte = isVarianteCourte(variant.type);

        const name = document.createElement("h3");
        name.className = "variant-title";
        name.textContent = variantDisplayLabel(variant);
        const baseTitleId = variantTitleIdBase(variant);
        const duplicateIndex = (titleIdCounts.get(baseTitleId) || 0) + 1;
        titleIdCounts.set(baseTitleId, duplicateIndex);
        const titleId = duplicateIndex === 1 ? baseTitleId : `${baseTitleId}-${duplicateIndex}`;
        name.id = titleId;
        block.setAttribute("aria-labelledby", titleId);
        block.appendChild(name);

        if (courte && variant.name) {
            const subtitle = document.createElement("p");
            subtitle.className = "variant-subtitle";
            subtitle.textContent = safeText(variant.name);
            block.appendChild(subtitle);
        }

        const details = [];
        if (!courte && variant.type) details.push(safeText(variant.type));
        if (Number.isFinite(variant.distance)) details.push(`Distance : ${variant.distance} km`);
        if (Number.isFinite(variant.elevationGain)) details.push(`D+ ${variant.elevationGain} m`);
        if (Number.isFinite(variant.elevationLoss)) details.push(`D− ${variant.elevationLoss} m`);
        if (Number.isFinite(variant.distanceExtra)) details.push(`Écart distance : +${variant.distanceExtra} km`);
        if (Number.isFinite(variant.elevationGainExtra)) details.push(`Écart D+ : ${variant.elevationGainExtra} m`);
        if (Number.isFinite(variant.elevationLossExtra)) details.push(`Écart D− : ${variant.elevationLossExtra} m`);
        if (variant.departure) details.push(`Départ : ${variant.departure}`);
        if (variant.arrival) details.push(`Arrivée : ${variant.arrival}`);
        if (details.length) {
            const text = document.createElement("p");
            text.className = "variant-details";
            text.textContent = details.join(" · ");
            block.appendChild(text);
        }

        if (variant.description) {
            const description = document.createElement("p");
            description.className = "variant-description";
            description.textContent = variant.description;
            block.appendChild(description);
        }

        if (Array.isArray(variant.pointsOfInterest) && variant.pointsOfInterest.length) {
            const poiHeading = document.createElement("p");
            poiHeading.className = "variant-poi-heading";
            poiHeading.textContent = "Points d'intérêt :";
            block.appendChild(poiHeading);
            const poiList = document.createElement("ul");
            poiList.className = "variant-poi-list";
            renderPoiList(poiList, variant.pointsOfInterest);
            block.appendChild(poiList);
        }

        appendGpxActions(block, variant.gpx, variantDisplayLabel(variant));
        appendResource(block, variant.link, "Ouvrir le lien de l'alternative", "terrain-button terrain-button--secondary");

        content.appendChild(block);
    });
}

function resolveStageGpxUrl(url) {
    return window.roadbookMapViewer?.resolveGpxUrl?.(url) || null;
}

function appendGpxActions(container, url, label) {
    const resolvedUrl = window.roadbookMapViewer?.resolveGpxUrl?.(url);
    if (!resolvedUrl) return;
    const actions = document.createElement("div");
    actions.className = "gpx-actions";
    const download = appendResource(actions, resolvedUrl, `⬇ Télécharger le GPX — ${label}`, "terrain-button");
    if (download) download.setAttribute("download", "");
    container.appendChild(actions);
}

function renderNotes(notes, stageNumber) {
    const section = document.getElementById("notes-section");
    const title = document.getElementById("notes-title");
    const list = document.getElementById("notes");
    const addButton = document.getElementById("add-note");
    const items = Array.isArray(notes)
        ? notes.map(normalizeNoteEntry).filter(note => note.text)
        : [];

    list.replaceChildren();
    section.hidden = false;
    title.textContent = `Notes (${items.length})`;
    list.hidden = items.length === 0;
    addButton.href = buildTravelerNotesFormUrl(stageNumber);
    addButton.hidden = false;

    items.forEach(note => {
        const item = document.createElement("li");
        item.className = "note-item";
        const text = document.createElement("p");
        text.className = "note-item__text";
        text.textContent = note.text;
        item.appendChild(text);

        if (isSafeNotePhoto(note.photo)) {
            const image = document.createElement("img");
            image.className = "note-item__photo";
            image.src = note.photo;
            image.loading = "lazy";
            image.alt = "Photo associée à la note";
            image.addEventListener("error", () => {
                image.hidden = true;
                image.removeAttribute("src");
            }, { once: true });
            item.appendChild(image);
        }

        list.appendChild(item);
    });
}

function buildTravelerNotesFormUrl(stageNumber) {
    const url = new URL(TRAVELER_NOTES_FORM_URL);
    url.searchParams.set("usp", "pp_url");
    url.searchParams.set(TRAVELER_NOTES_STAGE_FIELD, safeText(stageNumber, ""));
    return url.href;
}

function normalizeNoteEntry(note) {
    if (note && typeof note === "object") {
        return {
            text: safeText(note.text || note.note, ""),
            photo: safeText(note.photo, "")
        };
    }
    return { text: safeText(note, ""), photo: "" };
}

function isSafeNotePhoto(value) {
    if (typeof value !== "string" || !value.trim()) return false;
    const candidate = value.trim();

    if (/^https:\/\//i.test(candidate)) {
        try {
            return new URL(candidate).protocol === "https:";
        } catch (error) {
            return false;
        }
    }

    const path = candidate.split(/[?#]/)[0];
    return Boolean(
        path &&
        !candidate.startsWith("//") &&
        !candidate.includes("\\") &&
        !/^[a-z][a-z0-9+.-]*:/i.test(candidate) &&
        !path.startsWith("/") &&
        !path.split("/").includes("..")
    );
}

function appendResourceList(container, title, values, showHeading = true) {
    const items = Array.isArray(values) ? values.filter(Boolean) : [];
    if (!items.length) return;
    const list = document.createElement("ul");
    items.forEach((value, index) => {
        const item = document.createElement("li");
        const url = typeof value === "object" ? value.url : value;
        const photo = typeof value === "object" ? safeText(value.photo, "") : "";
        const metadata = photo ? { image: photo } : findAccommodationEnrichment(url);
        appendAccommodationResource(
            item,
            url,
            `${title} ${index + 1}`,
            metadata,
            metadata?.name || url
        );
        list.appendChild(item);
    });
    if (showHeading) {
        const heading = document.createElement("h3");
        heading.textContent = title;
        container.append(heading, list);
    } else {
        container.appendChild(list);
    }
}

function appendAccommodationNameWithIcon(container, name, iconSource) {
    const icon = createAccommodationIcon(iconSource || name);
    if (icon) container.append(icon, document.createTextNode(" "));
    container.appendChild(document.createTextNode(name));
}

function appendAccommodationResource(container, url, fallbackLabel, metadata, iconSource = "") {
    if (!url && !metadata?.image) return null;
    const label = metadata?.name || fallbackLabel;
    const icon = getAccommodationIcon(iconSource || label);
    const labelWithIcon = icon ? `${icon} ${label}` : label;

    if (!metadata?.image) {
        return appendResource(container, url, labelWithIcon, "terrain-button terrain-button--secondary");
    }

    const resource = document.createElement("div");
    resource.className = "accommodation-resource";
    const image = document.createElement("img");
    image.className = "accommodation-resource__image";
    image.src = metadata.image;
    image.loading = "lazy";
    image.alt = `Photo de ${metadata.name || "l'hébergement"}`;
    image.addEventListener("error", () => {
        image.hidden = true;
        image.removeAttribute("src");
    }, { once: true });
    resource.appendChild(image);
    if (url) {
        appendResource(resource, url, labelWithIcon, "terrain-button terrain-button--secondary");
    }
    container.appendChild(resource);
    return resource;
}

function findAccommodationEnrichment(url) {
    const loader = window.accommodationEnrichmentLoader;
    if (!loader || typeof loader.normalizeAccommodationUrl !== "function") return null;
    const key = loader.normalizeAccommodationUrl(url);
    return key ? accommodationEnrichmentIndex.get(key) || null : null;
}

function appendResource(container, value, label, className = "resource-link") {
    if (!value) return null;
    if (!isSafeUrl(value)) {
        const text = document.createElement("span");
        text.textContent = safeText(value);
        container.appendChild(text);
        return text;
    }
    const link = document.createElement("a");
    link.href = value;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    link.className = className;
    container.appendChild(link);
    return link;
}

function isSafeUrl(value) {
    if (typeof value !== "string" || !value.trim()) return false;
    const candidate = value.trim();
    const relativeFile = /^(?:\.{0,2}\/)/.test(candidate) || /\.gpx(?:[?#].*)?$/i.test(candidate);
    if (!/^https?:\/\//i.test(candidate) && !relativeFile) return false;
    try {
        const url = new URL(candidate, window.location.href);
        return ["http:", "https:"].includes(url.protocol);
    } catch (error) {
        return false;
    }
}

function safeText(value, fallback = "Non renseigné") {
    if (value === null || value === undefined || value === "") return fallback;
    return String(value);
}

function formatMetric(value, unit) {
    return Number.isFinite(value) ? `${value} ${unit}` : `— ${unit}`;
}

/**
 * Navigation
 */
function previousDay() {

    if (!roadbook || !Array.isArray(roadbook.days)) return;

    if (currentView === "stage" && currentDay === 0) {

        goHome();

    } else if (currentDay > 0) {

        currentDay--;

        displayDay(currentDay);

    }

}

function nextDay() {

    if (!roadbook || !Array.isArray(roadbook.days)) return;

    if (currentView === "home") {

        openStage(0);

    } else if (currentDay < roadbook.days.length - 1) {

        currentDay++;

        displayDay(currentDay);

    }

}

function goHome() {
    if (!roadbook || !Array.isArray(roadbook.days)) return;
    showHomePage();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * Active / désactive les boutons
 */
function updateButtons() {

    const hasDays = Boolean(roadbook && Array.isArray(roadbook.days) && roadbook.days.length);

    document.getElementById("previous-day").disabled =
        !hasDays || currentView === "home";

    document.getElementById("next-day").disabled =
        !hasDays || (currentView === "stage" && currentDay === roadbook.days.length - 1);

}

/**
 * Initialisation
 */
document
    .getElementById("previous-day")
    .addEventListener("click", previousDay);

document
    .getElementById("home-button")
    .addEventListener("click", goHome);

document
    .getElementById("next-day")
    .addEventListener("click", nextDay);

updateButtons();
initializeRoadbook();
