"use strict";

/**
 * =====================================================
 * Perinexus Roadbook
 * =====================================================
 */

let roadbook = null;
let currentDay = 0;

/**
 * Chargement des données
 */
async function initializeRoadbook() {

    try {

        if (typeof loadRoadbook !== "function") {
            throw new Error("Loader indisponible");
        }

        roadbook = await loadRoadbook();

        if (!roadbook || !Array.isArray(roadbook.days) || roadbook.days.length === 0) {
            throw new Error("Le roadbook ne contient aucune étape exploitable.");
        }

        updateSummary();

        displayDay(currentDay);

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
        `Jour ${index + 1}`;

    document.getElementById("day-title").textContent =
        safeText(day.title, `Étape ${index + 1}`);

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

    renderFieldNavigation(day);
    renderStageMapEmbed(day.mapEmbedUrl);
    renderNotes(day.noteItems || day.notes);
    updatePois(day);

    updateButtons();

}

function renderStageMapEmbed(mapEmbedUrl) {
    const viewer = window.roadbookMapViewer;
    if (!viewer || typeof viewer.renderEmbed !== "function") {
        document.getElementById("map-embed-section").hidden = true;
        return;
    }
    viewer.renderEmbed(mapEmbedUrl);
}

/**
 * Points d'intérêt
 */
function updatePois(day) {

    const list = document.getElementById("pois");

    list.innerHTML = "";

    const pois = Array.isArray(day.pois) ? day.pois : [];

    if (!pois.length) {
        const empty = document.createElement("li");
        empty.className = "empty";
        empty.textContent = "Non renseigné";
        list.appendChild(empty);
        return;
    }

    pois.forEach(poi => {

        const li = document.createElement("li");

        li.textContent = safeText(typeof poi === "object" ? poi.name || poi.label : poi);

        list.appendChild(li);

    });

}

function renderFieldNavigation(day) {
    const activeVariants = Array.isArray(day.variants)
        ? day.variants.filter(variant => variant?.enabled)
        : [];
    renderStageGpx(day.gpx || day.route?.gpx);
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

    const name = document.createElement("p");
    name.className = "detail-name";
    name.textContent = safeText(accommodation.name);
    container.appendChild(name);
    appendResource(container, accommodation.url, "Ouvrir le site de l'hébergement", "terrain-button terrain-button--secondary");
    appendResourceList(container, "Hébergements alternatifs", accommodation.alternatives);
    appendResourceList(container, "Locations maison", accommodation.houseRentals);
}

function renderVariants(variants) {
    const section = document.getElementById("variants-section");
    const count = document.getElementById("variants-count");
    const list = document.getElementById("variants");
    list.replaceChildren();
    section.hidden = variants.length === 0;
    section.open = false;
    count.textContent = variants.length ? ` (${variants.length})` : "";

    variants.forEach(variant => {
        const item = document.createElement("li");
        const name = document.createElement("strong");
        name.textContent = safeText(variant.name, "Variante");
        item.appendChild(name);
        const details = [
            safeText(variant.type, ""),
            Number.isFinite(variant.distanceExtra) ? `+${variant.distanceExtra} km` : "",
            Number.isFinite(variant.elevationGainExtra) ? `D+ ${variant.elevationGainExtra} m` : "",
            Number.isFinite(variant.elevationLossExtra) ? `D− ${variant.elevationLossExtra} m` : ""
        ].filter(Boolean);
        if (details.length) {
            const text = document.createElement("p");
            text.textContent = details.join(" · ");
            item.appendChild(text);
        }
        if (variant.description) {
            const description = document.createElement("p");
            description.textContent = variant.description;
            item.appendChild(description);
        }
        appendGpxActions(item, variant.gpx, safeText(variant.name, "variante"));
        appendResource(item, variant.link, "Ouvrir le lien de la variante", "terrain-button terrain-button--secondary");
        list.appendChild(item);
    });
}

function renderStageGpx(url) {
    const section = document.getElementById("terrain-navigation");
    const downloadLink = document.getElementById("terrain-gpx-download");
    const resolvedUrl = window.roadbookMapViewer?.resolveGpxUrl?.(url);
    const valid = Boolean(resolvedUrl);
    section.hidden = !valid;

    if (valid) {
        downloadLink.href = resolvedUrl;
    } else {
        downloadLink.removeAttribute("href");
    }
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
        appendResource(item, value, `${title} ${index + 1}`, "terrain-button terrain-button--secondary");
        list.appendChild(item);
    });
    container.append(heading, list);
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
