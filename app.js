"use strict";

/**
 * =====================================================
 * Perinexus Roadbook
 * =====================================================
 */

let roadbook = null;
let currentDay = 0;
let accommodationEnrichmentIndex = new Map();
let poiEnrichmentIndex = new Map();

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

        updateSummary();

        displayDay(currentDay);

        [accommodationEnrichmentIndex, poiEnrichmentIndex] = await Promise.all([
            accommodationEnrichmentPromise,
            poiEnrichmentPromise
        ]);
        renderCurrentAccommodation();
        renderCurrentPois();

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

    const info = document.getElementById("roadbook-info");

    info.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = safeText(roadbook.title, "Roadbook");
    const description = document.createElement("p");
    description.textContent = safeText(roadbook.description, "");
    const count = document.createElement("p");
    count.textContent = `Nombre d'étapes : ${roadbook.days.length}`;
    info.append(title, description, count);

}

/**
 * Affichage d'une journée
 */
function displayDay(index) {

    if (!roadbook || !Array.isArray(roadbook.days)) return;
    if (!Number.isInteger(index) || index < 0 || index >= roadbook.days.length) return;

    const day = roadbook.days[index];

    if (!day) return;

    document.getElementById("current-day").textContent =
        `Étape ${day.stage || (index + 1)}`;

    document.getElementById("day-title").textContent =
        safeText(day.title, `Étape ${day.stage || (index + 1)}`);

    document.getElementById("distance").textContent =
        formatMetric(day.distance, "km");

    document.getElementById("elevation").textContent =
        formatMetric(day.elevationGain ?? day.elevation, "m");

    document.getElementById("elevation-loss").textContent =
        formatMetric(day.elevationLoss, "m");

    document.getElementById("duration").textContent =
        safeText(day.duration);

    document.getElementById("description").textContent =
        safeText(day.description, "Aucune description renseignée.");

    const stageGpxUrl = day.gpx || day.route?.gpx;
    const mapVisible = renderStageMapEmbed(day.mapEmbedUrl, stageGpxUrl);
    renderFieldNavigation(day);
    renderNotes(day.noteItems || day.notes);
    updatePois(day);

    updateButtons();

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
    const name = safeText(sourceName, "Point d'intérêt");
    const metadata = findPoiEnrichment(name);
    const imageCandidate = metadata?.image || sourceImage || "";
    const image = isSafeUrl(imageCandidate) ? imageCandidate : "";
    const description = metadata?.description || sourceDescription || "";

    return {
        name: metadata?.name || name,
        image,
        description,
        isEnriched: Boolean(image || description)
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

    if (entry.description) {
        const description = document.createElement("p");
        description.className = "poi-card__description";
        description.textContent = entry.description;
        content.appendChild(description);
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
    document.getElementById("copy-status").textContent = "";
}

function renderAccommodation(accommodation) {
    const container = document.getElementById("accommodation");
    container.replaceChildren();
    if (!accommodation) {
        container.textContent = "Non renseigné";
        return;
    }

    if (typeof accommodation === "string") {
        container.textContent = safeText(accommodation);
        return;
    }

    const mainMetadata = findAccommodationEnrichment(accommodation.url);
    const name = document.createElement("p");
    name.className = "detail-name";
    name.textContent = safeText(mainMetadata?.name || accommodation.name);
    container.appendChild(name);
    appendAccommodationResource(
        container,
        accommodation.url,
        "Ouvrir le site de l'hébergement",
        mainMetadata
    );
    appendResourceList(container, "Hébergements alternatifs", accommodation.alternatives);
    appendResourceList(container, "Locations maison", accommodation.houseRentals);
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
    ]
        .map(value => safeText(value, "")
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

function renderNotes(notes) {
    const section = document.getElementById("notes-section");
    const list = document.getElementById("notes");
    const items = Array.isArray(notes) ? notes.filter(Boolean) : [];
    list.replaceChildren();
    section.hidden = items.length === 0;
    items.forEach(note => {
        const item = document.createElement("li");
        item.textContent = safeText(note);
        list.appendChild(item);
    });
}

function appendResourceList(container, title, values) {
    const items = Array.isArray(values) ? values.filter(Boolean) : [];
    if (!items.length) return;
    const heading = document.createElement("h3");
    heading.textContent = title;
    const list = document.createElement("ul");
    items.forEach((value, index) => {
        const item = document.createElement("li");
        appendAccommodationResource(
            item,
            value,
            `${title} ${index + 1}`,
            findAccommodationEnrichment(value)
        );
        list.appendChild(item);
    });
    container.append(heading, list);
}

function appendAccommodationResource(container, url, fallbackLabel, metadata) {
    if (!url) return null;
    const label = metadata?.name || fallbackLabel;

    if (!metadata?.image) {
        return appendResource(container, url, label, "terrain-button terrain-button--secondary");
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
    appendResource(resource, url, label, "terrain-button terrain-button--secondary");
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

async function copyCurrentDaySummary() {
    if (!roadbook || !Array.isArray(roadbook.days)) return;
    const day = roadbook.days[currentDay];
    if (!day) return;
    const accommodation = typeof day.accommodation === "string"
        ? day.accommodation
        : day.accommodation?.name;
    const summary = [
        `Jour : ${safeText(day.day, currentDay + 1)}`,
        `Départ : ${safeText(day.departure)}`,
        `Arrivée : ${safeText(day.arrival)}`,
        `Distance : ${formatMetric(day.distance, "km")}`,
        `D+ : ${formatMetric(day.elevationGain ?? day.elevation, "m")}`,
        `D− : ${formatMetric(day.elevationLoss, "m")}`,
        `Hébergement : ${safeText(accommodation)}`
    ].join("\n");

    const status = document.getElementById("copy-status");
    try {
        await copyText(summary);
        status.textContent = "Résumé copié.";
    } catch (error) {
        console.error("[Roadbook] Copie du résumé impossible :", error);
        status.textContent = "Copie impossible sur cet appareil.";
    }
}

async function copyText(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.className = "copy-helper";
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    if (!copied) throw new Error("Clipboard API unavailable");
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

    if (currentDay > 0) {

        currentDay--;

        displayDay(currentDay);

    }

}

function nextDay() {

    if (!roadbook || !Array.isArray(roadbook.days)) return;

    if (currentDay < roadbook.days.length - 1) {

        currentDay++;

        displayDay(currentDay);

    }

}

/**
 * Active / désactive les boutons
 */
function updateButtons() {

    const hasDays = Boolean(roadbook && Array.isArray(roadbook.days) && roadbook.days.length);

    document.getElementById("previous-day").disabled =
        !hasDays || currentDay === 0;

    document.getElementById("next-day").disabled =
        !hasDays || currentDay === roadbook.days.length - 1;

}

/**
 * Initialisation
 */
document
    .getElementById("previous-day")
    .addEventListener("click", previousDay);

document
    .getElementById("next-day")
    .addEventListener("click", nextDay);

document
    .getElementById("copy-summary")
    .addEventListener("click", copyCurrentDaySummary);

updateButtons();
initializeRoadbook();
