"use strict";

/**
 * =====================================================
 * Perinexus Roadbook
 * =====================================================
 */

let roadbook = null;
let currentDay = 0;
let currentView = "home";
let isApplyingRoute = false;
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
const GENERIC_ACCOMMODATION_METADATA_NAMES = Object.freeze([
    "booking",
    "booking.com",
    "airbnb",
    "airbnb.fr",
    "hotels.com",
    "expedia",
    "tripadvisor",
    "vrbo",
    "abritel"
]);
const GENERIC_ACCOMMODATION_PLATFORM_HOSTS = Object.freeze([
    "booking.com",
    "airbnb.com",
    "airbnb.fr",
    "tripadvisor.com",
    "expedia.com",
    "hotels.com",
    "vrbo.com",
    "abritel.fr",
    "google.com",
    "google.fr",
    "mapy.com",
    "openstreetmap.org"
]);
const ACCOMMODATION_DOMAIN_WORD_HINTS = Object.freeze([
    "camping",
    "hostal",
    "hostel",
    "hotel",
    "apartamento",
    "apartament",
    "appart",
    "gite",
    "gites",
    "casa",
    "maison",
    "villa",
    "els",
    "les",
    "el",
    "la",
    "le",
    "vall",
    "de",
    "del",
    "dels",
    "des",
    "can",
    "mas",
    "san",
    "sant",
    "santa"
]);
const GENERIC_ACCOMMODATION_MAP_QUERIES = Object.freeze([
    "camping",
    "campsite",
    "maison",
    "house",
    "hebergement",
    "hébergement",
    "accommodation",
    "hotel",
    "hôtel",
    "hostel",
    "gite",
    "gîte",
    "location"
]);
const APP_VERSION_TOKEN = resolveCurrentVersionToken();
const APP_VERSION_LABEL = formatVersionLabel(APP_VERSION_TOKEN);

function resolveCurrentVersionToken() {
    if (typeof window !== "undefined" && typeof window.__ROADBOOK_APP_VERSION__ === "string") {
        return window.__ROADBOOK_APP_VERSION__;
    }
    if (typeof document !== "undefined" && typeof document.lastModified === "string") {
        return document.lastModified;
    }
    return "version inconnue";
}

function formatVersionLabel(token) {
    const normalized = String(token || "").trim();
    if (!normalized) return "inconnue";

    const parsed = new Date(normalized);
    if (!Number.isFinite(parsed.getTime())) return normalized;

    return parsed.toLocaleString("fr-FR", {
        dateStyle: "short",
        timeStyle: "short"
    });
}

function updateVersionFooter(versionLabel = APP_VERSION_LABEL) {
    const version = document.getElementById("app-version");
    if (version) {
        version.textContent = versionLabel;
        version.title = APP_VERSION_TOKEN;
    }
}

function initializeVersionManagement() {
    updateVersionFooter();
}

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

        applyAccommodationDisplayData();
        renderHomePage();
        applyRouteFromUrl({ replace: true });

        [accommodationEnrichmentIndex, poiEnrichmentIndex] = await Promise.all([
            accommodationEnrichmentPromise,
            poiEnrichmentPromise
        ]);
        applyAccommodationDisplayData();
        if (currentView === "home") updateSummary();
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
    button.className = day?.isSubstep
        ? "home-stage-card home-stage-card--substep"
        : "home-stage-card";
    button.addEventListener("click", () => openStage(index));
    if (day?.isSubstep) {
        button.setAttribute("aria-label", `Sous-étape de l'étape ${safeText(day.parentStage || day.stage, "")} : ${stageRouteLabel(day, index)}`);
    }

    const number = document.createElement("span");
    number.className = "home-stage-card__number";
    number.textContent = homeStageNumberLabel(day, index);

    const content = document.createElement("span");
    content.className = "home-stage-card__content";

    const route = document.createElement("strong");
    route.className = "home-stage-card__route";
    route.textContent = stageRouteLabel(day, index);
    content.appendChild(route);

    if (day?.isSubstep && day.type) {
        const type = document.createElement("span");
        type.className = "home-stage-card__substep-type";
        type.textContent = safeText(day.type);
        content.appendChild(type);
    }

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
    return accommodation?.displayName || accommodation?.name || accommodation?.website || accommodation?.url || "";
}

function homeStageNumberLabel(day, index) {
    if (day?.isSubstep) return "↳";
    return safeText(day.stage || (index + 1), String(index + 1));
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

function applyAccommodationDisplayData() {
    if (!roadbook) return;

    const collections = [roadbook.stages, roadbook.days].filter(Array.isArray);
    const seen = new Set();

    collections.forEach(collection => {
        collection.forEach(entry => {
            const accommodation = entry?.accommodation;
            if (accommodation && typeof accommodation === "object" && !seen.has(accommodation)) {
                hydrateAccommodationDisplay(accommodation, entry?.accommodationType || "");
                seen.add(accommodation);
            }

            if (entry?.alternativeAccommodation && typeof entry.alternativeAccommodation === "object") {
                const firstAlternative = accommodation?.alternatives?.[0] || null;
                entry.alternativeAccommodation.name =
                    safeText(firstAlternative?.displayName || firstAlternative?.name || firstAlternative?.url, "");
                entry.alternativeAccommodation.photo =
                    safeText(firstAlternative?.photo, entry.alternativeAccommodation.photo || "");
            }
        });
    });
}

function hydrateAccommodationDisplay(accommodation, accommodationType = "") {
    if (!accommodation || typeof accommodation !== "object") return;

    const mainUrl = safeText(accommodation.website || accommodation.url, "");
    accommodation.displayName = resolveAccommodationDisplayName({
        preferredName: accommodation.name,
        url: mainUrl,
        fallbackType: accommodationType || accommodation.name || mainUrl
    });

    const alternatives = Array.isArray(accommodation.alternatives) ? accommodation.alternatives : [];
    accommodation.alternatives = alternatives
        .map(normalizeAccommodationAlternative)
        .filter(Boolean);

    accommodation.alternatives.forEach(entry => {
        entry.displayName = resolveAccommodationDisplayName({
            preferredName: entry.name,
            url: entry.url,
            fallbackType: entry.name || accommodationType || entry.url
        });
    });

    accommodation.alternativeNames = accommodation.alternatives.map(entry => entry.name || "");
    accommodation.alternativePhotos = accommodation.alternatives.map(entry => entry.photo || "");
}

function normalizeAccommodationAlternative(entry) {
    if (typeof entry === "string") {
        const url = safeText(entry, "");
        return url ? { url, name: "", photo: "", displayName: "" } : null;
    }

    if (!entry || typeof entry !== "object") return null;

    const url = safeText(entry.url || entry.website, "");
    return url || entry.name
        ? {
            url,
            name: safeText(entry.name, ""),
            photo: safeText(entry.photo, ""),
            displayName: safeText(entry.displayName, "")
        }
        : null;
}

function resolveAccommodationDisplayName({ preferredName = "", url = "", fallbackType = "" } = {}) {
    const manualName = safeText(preferredName, "");
    if (manualName) return manualName;

    const metadataName = normalizeAutomaticAccommodationName(findAccommodationEnrichment(url)?.name || "", url);
    if (metadataName) return metadataName;

    const mapName = deriveAccommodationNameFromMapUrl(url);
    if (mapName) return mapName;

    const domainName = inferAccommodationNameFromUrl(url);
    if (domainName) return domainName;

    return genericAccommodationLabel(fallbackType || url);
}

function normalizeAutomaticAccommodationName(name, url = "") {
    const value = safeText(name, "");
    if (!value) return "";

    const normalized = normalizeAccommodationText(value);
    if (GENERIC_ACCOMMODATION_METADATA_NAMES.some(item => normalizeAccommodationText(item) === normalized)) return "";

    const inferredHostName = inferAccommodationNameFromUrl(url);
    if (inferredHostName && normalized === normalizeAccommodationText(inferredHostName)) return "";

    return value;
}

function inferAccommodationNameFromUrl(url) {
    if (!isSafeUrl(url)) return "";
    try {
        const parsed = new URL(url, window.location.href);
        const hostname = parsed.hostname.toLowerCase().replace(/^www\./i, "");

        const platformName = inferAccommodationNameFromPlatformUrl(parsed);
        if (platformName) return platformName;

        if (isGenericAccommodationPlatformHost(hostname)) return "";

        const domainLabel = hostname.split(".")[0] || "";
        return formatAccommodationNameFromToken(domainLabel);
    } catch (error) {
        return "";
    }
}

function inferAccommodationNameFromPlatformUrl(parsedUrl) {
    const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./i, "");

    if (matchesHostname(hostname, "booking.com")) {
        const segments = parsedUrl.pathname.split("/").filter(Boolean);
        const hotelIndex = segments.indexOf("hotel");
        if (hotelIndex >= 0 && segments.length > hotelIndex + 2) {
            const fromHotelPath = formatAccommodationNameFromToken(segments[hotelIndex + 2]);
            if (fromHotelPath) return fromHotelPath;
        }
        const htmlSegment = segments.find(segment => /\.html?$/i.test(segment));
        return formatAccommodationNameFromToken(htmlSegment || "");
    }

    if (matchesHostname(hostname, "airbnb.com") || matchesHostname(hostname, "airbnb.fr")) {
        return firstMeaningfulAccommodationLabel([
            parsedUrl.searchParams.get("name"),
            parsedUrl.searchParams.get("title"),
            parsedUrl.searchParams.get("listing_name"),
            parsedUrl.searchParams.get("description")
        ]);
    }

    return "";
}

function isGenericAccommodationPlatformHost(hostname) {
    return GENERIC_ACCOMMODATION_PLATFORM_HOSTS.some(domain => matchesHostname(hostname, domain));
}

function formatAccommodationNameFromToken(value) {
    const candidate = safeText(value, "")
        .replace(/^www\./i, "")
        .replace(/\.[a-z]{2,}$/i, "")
        .replace(/\.html?$/i, "")
        .replace(/%[0-9a-f]{2}/gi, "")
        .replace(/[?#].*$/, "")
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (!candidate) return "";
    if (/^\d+$/.test(candidate)) return "";

    const normalizedCandidate = normalizeAccommodationText(candidate);
    if (GENERIC_ACCOMMODATION_METADATA_NAMES.some(item => normalizeAccommodationText(item) === normalizedCandidate)) {
        return "";
    }

    const splitWords = candidate
        .split(" ")
        .flatMap(token => splitAccommodationDomainToken(token.toLowerCase()));
    const words = splitWords.filter(Boolean);
    if (!words.length) return "";

    return words.map(word => word.replace(/\b\p{L}/gu, character => character.toUpperCase())).join(" ");
}

function splitAccommodationDomainToken(token) {
    const cleanToken = safeText(token, "").replace(/[^a-z0-9]+/gi, "").trim();
    if (!cleanToken) return [];
    if (cleanToken.length <= 3) return [cleanToken];

    const words = [];
    let remaining = cleanToken;
    while (remaining.length > 3) {
        const hint = ACCOMMODATION_DOMAIN_WORD_HINTS
            .filter(word => remaining.startsWith(word) && remaining.length > word.length)
            .sort((a, b) => b.length - a.length)[0];
        if (!hint) break;
        const next = remaining.slice(hint.length);
        if (next.length < 3) break;
        words.push(hint);
        remaining = next;
    }
    words.push(remaining);

    return words.filter(Boolean);
}

function deriveAccommodationNameFromMapUrl(url) {
    if (!isSafeUrl(url)) return "";

    try {
        const parsed = new URL(url, window.location.href);
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
            return firstMeaningfulAccommodationLabel(candidates);
        }

        if (matchesHostname(hostname, "mapy.com")) {
            const slug = parsed.pathname.split("/").filter(Boolean).pop() || "";
            return firstMeaningfulAccommodationLabel([...candidates, slug]);
        }

        if (matchesHostname(hostname, "openstreetmap.org")) {
            return firstMeaningfulAccommodationLabel(candidates);
        }
    } catch (error) {
        return "";
    }

    return "";
}

function firstMeaningfulAccommodationLabel(values) {
    for (const value of values) {
        const cleaned = cleanAccommodationLocationLabel(value);
        if (cleaned) return cleaned;
    }
    return "";
}

function isGoogleMapsHostname(hostname) {
    return /(^|\.)google\.[a-z.]+$/i.test(hostname);
}

function matchesHostname(hostname, expectedDomain) {
    return hostname === expectedDomain || hostname.endsWith(`.${expectedDomain}`);
}

function cleanAccommodationLocationLabel(value) {
    const candidate = decodeURIComponent(String(value || "").replace(/\+/g, " ")).trim();
    if (!candidate) return "";
    if (/^-?\d+(?:[.,]\d+)?\s*,\s*-?\d+(?:[.,]\d+)?$/.test(candidate)) return "";

    return candidate
        .replace(/\bplace_id:[^&\s]+/gi, "")
        .replace(/\s+/g, " ")
        .trim();
}

function genericAccommodationLabel(typeOrName) {
    return getAccommodationIconLabel(typeOrName) || "Hébergement";
}

function stageRouteLabel(day, index) {
    if (day?.isSubstep) {
        const name = safeText(day.name, "");
        const route = [safeText(day.departure, ""), safeText(day.arrival, "")]
            .filter(Boolean)
            .join(" → ");
        return name || route || safeText(day.title, `Alternative ${index + 1}`);
    }

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
function displayDay(index, options = {}) {

    if (!roadbook || !Array.isArray(roadbook.days)) return;
    if (!Number.isInteger(index) || index < 0 || index >= roadbook.days.length) return;

    const { updateUrl = true, replace = false } = options;
    const day = roadbook.days[index];

    if (!day) return;

    currentDay = index;
    showStagePage();
    updateRoadbookChrome(day);

    document.getElementById("current-day").textContent = navigationCenterLabel(day, index);

    renderStageTitle(day, index);

    renderStageMetricsAndDuration(day, index);

    const stageGpxUrl = day.gpx || day.route?.gpx;
    const mapVisible = renderStageMapEmbed(day.mapEmbedUrl, stageGpxUrl);
    renderFieldNavigation(day);
    renderNotes(day.noteItems || day.notes, day.stage || (index + 1));
    updatePois(day);

    updateButtons();
    if (updateUrl) updateUrlForStage(index, { replace });

}

function navigationCenterLabel(day, index) {
    const dayLabel = safeText(day?.day, "");
    const label = day?.isSubstep
        ? substepNavigationLabel(day, index)
        : mainStageNavigationLabel(day, index);

    return [label, dayLabel].filter(Boolean).join(" · ");
}

function mainStageNavigationLabel(day, index) {
    return safeText(
        day?.stageLabel,
        `Étape ${day?.stage || (index + 1)}`
    );
}

function substepNavigationLabel(day, index) {
    const fallback = stageRouteLabel(day, index) || `Sous-étape ${index + 1}`;
    return `Variante – ${safeText(day?.name, fallback)}`;
}

function renderStageTitle(day, index) {
    const heading = document.getElementById("day-title");
    if (!heading) return;

    const fallbackTitle = `Étape ${day.stage || (index + 1)}`;
    if (day?.isSubstep) {
        const type = safeText(day.type, "Option");
        const departure = safeText(day.departure, "");
        const arrival = safeText(day.arrival, "");
        heading.replaceChildren(...buildSubstepTitleContent(type, departure, arrival));
        return;
    }

    const title = safeText(day.title, fallbackTitle);
    const departure = safeText(day.departure, "");
    const arrival = safeText(day.arrival, "");
    heading.replaceChildren(...buildStageTitleContent(title, departure, arrival));
}

function buildSubstepTitleContent(type, departure, arrival) {
    const content = [document.createTextNode(type)];
    if (!departure && !arrival) return content;

    content.push(document.createElement("br"));
    const route = document.createElement("span");
    route.className = "stage-title-route";
    if (departure && arrival) {
        route.append(createStageCityLink(departure), document.createTextNode(" → "), createStageCityLink(arrival));
    } else {
        route.appendChild(createStageCityLink(departure || arrival));
    }
    content.push(route);
    return content;
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

function openStage(index, options = {}) {
    displayDay(index, options);
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function showHomePage(options = {}) {
    const { updateUrl = true, replace = false } = options;
    currentView = "home";
    updateRoadbookChrome();
    setSectionHidden("summary", false);
    setStageSectionsHidden(true);
    updateButtons();
    if (updateUrl) updateUrlForHome({ replace });
    document.title = safeText(roadbook?.title, "Roadbook vélo");
}

function showStagePage() {
    currentView = "stage";
    setSectionHidden("summary", true);
    setStageSectionsHidden(false);
}

function applyRouteFromUrl(options = {}) {
    if (!roadbook || !Array.isArray(roadbook.days)) return;

    const { replace = false } = options;
    const params = new URLSearchParams(window.location.search);
    const targetIndex = resolveRouteIndex(params);

    isApplyingRoute = true;
    try {
        if (targetIndex === null) {
            showHomePage({ updateUrl: replace, replace });
        } else {
            displayDay(targetIndex, { updateUrl: replace, replace });
        }
    } finally {
        isApplyingRoute = false;
    }
}

function resolveRouteIndex(params) {
    const stageNumber = parseRouteNumber(params.get("stage"));
    if (stageNumber === null) return null;

    const mainStageIndex = findMainStageIndex(stageNumber);
    if (params.has("substage")) {
        const substageNumber = parseRouteNumber(params.get("substage"));
        const substageIndex = substageNumber === null
            ? null
            : findSubstageIndex(stageNumber, substageNumber);
        return substageIndex ?? mainStageIndex;
    }

    return mainStageIndex;
}

function parseRouteNumber(value) {
    const normalized = String(value || "").trim();
    if (!/^\d+$/.test(normalized)) return null;

    const number = Number.parseInt(normalized, 10);
    return number > 0 ? number : null;
}

function findMainStageIndex(stageNumber) {
    const index = roadbook.days.findIndex(day =>
        !day?.isSubstep && Number(day?.stage) === stageNumber
    );
    return index >= 0 ? index : null;
}

function findSubstageIndex(stageNumber, substageNumber) {
    let count = 0;
    for (let index = 0; index < roadbook.days.length; index++) {
        const day = roadbook.days[index];
        if (!day?.isSubstep || Number(day.parentStageReference || day.parentStage || day.stage) !== stageNumber) {
            continue;
        }

        count++;
        if (count === substageNumber) return index;
    }

    return null;
}

function updateUrlForHome(options = {}) {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    updateBrowserUrl(url, options);
}

function updateUrlForStage(index, options = {}) {
    if (!roadbook || !Array.isArray(roadbook.days)) return;

    const day = roadbook.days[index];
    if (!day) return;

    const stageNumber = Number(day.isSubstep
        ? (day.parentStageReference || day.parentStage || day.stage)
        : day.stage);

    if (!Number.isFinite(stageNumber) || stageNumber <= 0) return;

    const params = new URLSearchParams();
    params.set("stage", String(stageNumber));

    if (day.isSubstep) {
        const substageNumber = substageNumberForIndex(index);
        if (substageNumber !== null) params.set("substage", String(substageNumber));
    }

    const url = new URL(window.location.href);
    url.search = params.toString();
    url.hash = "";
    updateBrowserUrl(url, options);
}

function substageNumberForIndex(targetIndex) {
    const target = roadbook?.days?.[targetIndex];
    if (!target?.isSubstep) return null;

    const stageNumber = Number(target.parentStageReference || target.parentStage || target.stage);
    let count = 0;
    for (let index = 0; index <= targetIndex; index++) {
        const day = roadbook.days[index];
        if (day?.isSubstep && Number(day.parentStageReference || day.parentStage || day.stage) === stageNumber) {
            count++;
        }
    }

    return count || null;
}

function updateBrowserUrl(url, options = {}) {
    if (isApplyingRoute && !options.replace) return;
    if (url.href === window.location.href) return;

    const method = options.replace ? "replaceState" : "pushState";
    window.history[method]({}, "", url);
}

function setStageSectionsHidden(hidden) {
    [
        "day-navigation",
        "day-card",
        "notes-section",
        "pois-section",
        "primary-accommodation-card",
        "map-embed-section",
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
        region.className = "poi-card__region";
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
        appendAccommodationNameWithIcon(detail, name, accommodationType || name, [name]);
        container.appendChild(detail);
        return;
    }

    const mainUrl = safeText(accommodation?.website || accommodation?.url, "");
    const mainPhoto = safeText(accommodation?.photo, "");
    const mainMetadata = findAccommodationEnrichment(mainUrl);
    const mainName = safeText(accommodation?.displayName || accommodation?.name, "");
    section.hidden = !mainName && !mainUrl && !mainPhoto && !mainMetadata?.image;
    if (section.hidden) return;

    if (mainName) {
        const name = document.createElement("p");
        name.className = "detail-name";
        appendAccommodationNameWithIcon(name, mainName, accommodationType || mainName, [
            accommodation?.name,
            accommodation?.displayName,
            mainMetadata?.name,
            mainUrl
        ]);
        container.appendChild(name);
    }
    if (mainUrl || mainPhoto || mainMetadata?.image) {
        appendAccommodationResource(
            container,
            mainUrl,
            mainName || genericAccommodationLabel(accommodationType || mainUrl),
            mainMetadata,
            accommodationType || mainName,
            mainPhoto
        );
    }
}

function renderAlternativeAccommodation(accommodation, stageNumber) {
    const section = document.getElementById("alternative-accommodation-card");
    const title = document.getElementById("alternative-accommodation-title");
    const container = document.getElementById("alternative-accommodation");
    container.replaceChildren();

    const alternatives = Array.isArray(accommodation?.alternatives)
        ? accommodation.alternatives
            .map((entry, index) => ({
                url: safeText(typeof entry === "object" ? entry?.url : entry, ""),
                rawName: safeText(
                    typeof entry === "object" ? entry?.name : "",
                    ""
                ),
                name: safeText(
                    typeof entry === "object" ? entry?.displayName || entry?.name : "",
                    ""
                ),
                photo: safeText(
                    typeof entry === "object"
                        ? entry?.photo
                        : accommodation?.alternativePhotos?.[index],
                    ""
                )
            }))
            .filter(item => item.url || item.name || item.photo)
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
        const preferredLabel = typeof value === "object"
            ? safeText(value.displayName || value.name, "")
            : "";
        const rawName = typeof value === "object" ? safeText(value.rawName || value.name, "") : "";
        const photo = typeof value === "object" ? safeText(value.photo, "") : "";
        const metadata = findAccommodationEnrichment(url);
        const label = preferredLabel || metadata?.name || `${title} ${index + 1}`;
        const detail = document.createElement("p");
        detail.className = "detail-name detail-name--compact";
        appendAccommodationNameWithIcon(detail, label, label, [
            rawName,
            preferredLabel,
            metadata?.name,
            url
        ]);
        item.appendChild(detail);
        appendAccommodationResource(
            item,
            url,
            label,
            metadata,
            preferredLabel || metadata?.name || url,
            photo
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

function appendAccommodationNameWithIcon(container, name, iconSource, mapQueryCandidates = []) {
    const icon = createAccommodationIcon(iconSource || name);
    if (icon) container.append(icon, document.createTextNode(" "));
    container.appendChild(document.createTextNode(name));

    const mapLink = createAccommodationMapLink(mapQueryCandidates);
    if (mapLink) container.append(document.createTextNode(" "), mapLink);
}

function createAccommodationMapLink(candidates) {
    const query = bestAccommodationMapQuery(candidates);
    if (!query) return null;

    const link = document.createElement("a");
    link.className = "accommodation-map-link";
    link.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = `Rechercher ${query} sur Google Maps`;
    link.setAttribute("aria-label", `Rechercher ${query} sur Google Maps`);
    link.appendChild(createAccommodationMapIcon());
    return link;
}

function bestAccommodationMapQuery(candidates) {
    const items = Array.isArray(candidates) ? candidates : [candidates];
    for (const candidate of items) {
        const value = cleanAccommodationMapQuery(safeText(candidate, ""));
        if (isUsefulAccommodationMapQuery(value)) return value;
    }
    return "";
}

function cleanAccommodationMapQuery(value) {
    const trimmed = safeText(value, "").trim();
    if (!trimmed || /^https?:\/\//i.test(trimmed)) return trimmed;

    const parts = trimmed
        .split(/\s+[|–—-]\s+/)
        .map(part => part.trim())
        .filter(Boolean);

    return parts[0] || trimmed;
}

function isUsefulAccommodationMapQuery(value) {
    if (!value) return false;
    if (/^https?:\/\//i.test(value)) return true;

    const normalized = normalizeAccommodationText(value);
    if (!normalized) return false;
    if (GENERIC_ACCOMMODATION_MAP_QUERIES.some(item => normalizeAccommodationText(item) === normalized)) {
        return false;
    }
    return normalized.length >= 4;
}

function createAccommodationMapIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    [
        ["path", { d: "M9 18 3.5 20.5v-15L9 3l6 3 5.5-2.5v15L15 21l-6-3Z" }],
        ["path", { d: "M9 3v15" }],
        ["path", { d: "M15 6v15" }]
    ].forEach(([tag, attrs]) => {
        const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
        Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
        svg.appendChild(element);
    });

    return svg;
}

function appendAccommodationResource(container, url, preferredLabel, metadata, iconSource = "", manualPhoto = "") {
    if (!url && !metadata?.image && !manualPhoto && !metadata?.name && !preferredLabel) return null;
    const label = safeText(preferredLabel, "") || metadata?.name || "Hébergement";
    const icon = getAccommodationIcon(iconSource || label);
    const labelWithIcon = icon ? `${icon} ${label}` : label;

    const resource = document.createElement("div");
    resource.className = "accommodation-resource";
    appendAccommodationVisual(resource, {
        manualPhoto,
        automaticPhoto: metadata?.image,
        websiteUrl: url,
        label
    });
    if (url) {
        appendResource(resource, url, labelWithIcon, "terrain-button terrain-button--secondary");
    } else {
        const text = document.createElement("span");
        text.className = "accommodation-resource__label";
        text.textContent = labelWithIcon;
        resource.appendChild(text);
    }
    container.appendChild(resource);
    return resource;
}

function appendAccommodationVisual(container, { manualPhoto = "", automaticPhoto = "", websiteUrl = "", label = "" } = {}) {
    const sources = uniqueValues([
        isSafeUrl(manualPhoto) ? manualPhoto : "",
        isSafeUrl(automaticPhoto) ? automaticPhoto : "",
        buildWebsitePreviewUrl(websiteUrl)
    ]);

    if (!sources.length) {
        container.appendChild(createAccommodationPlaceholder(label));
        return;
    }

    const image = document.createElement("img");
    image.className = "accommodation-resource__image";
    image.loading = "lazy";
    image.alt = `Photo de ${label || "l'hébergement"}`;
    let sourceIndex = 0;
    const fallbackToNextSource = () => {
        sourceIndex += 1;
        if (sourceIndex < sources.length) {
            image.src = sources[sourceIndex];
            return;
        }
        image.replaceWith(createAccommodationPlaceholder(label));
    };
    image.addEventListener("error", fallbackToNextSource);
    image.src = sources[sourceIndex];
    container.appendChild(image);
}

function buildWebsitePreviewUrl(websiteUrl) {
    if (!isSafeUrl(websiteUrl) || !/^https?:\/\//i.test(websiteUrl)) return "";
    return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(websiteUrl)}?w=900`;
}

function createAccommodationPlaceholder(label = "") {
    const placeholder = document.createElement("div");
    placeholder.className = "accommodation-resource__placeholder";
    placeholder.setAttribute("role", "img");
    placeholder.setAttribute("aria-label", `Image indisponible pour ${label || "cet hébergement"}`);

    const icon = document.createElement("span");
    icon.className = "accommodation-resource__placeholder-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = getAccommodationIcon(label) || "🏡";

    const text = document.createElement("span");
    text.textContent = "Aperçu indisponible";

    placeholder.append(icon, text);
    return placeholder;
}

function uniqueValues(values) {
    return [...new Set(values.map(value => safeText(value, "").trim()).filter(Boolean))];
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

window.addEventListener("popstate", () => {
    applyRouteFromUrl({ replace: false });
    window.scrollTo({ top: 0, behavior: "auto" });
});

initializeVersionManagement();
updateButtons();
initializeRoadbook();
