"use strict";

console.log("APP.JS VERSION GOOGLE SHEETS ACTIVE");

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

    info.innerHTML = `
        <strong>${roadbook.title}</strong><br>
        ${roadbook.description}<br><br>

        Nombre d'étapes : ${roadbook.days.length}
    `;

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
        day.title;

    document.getElementById("distance").textContent =
        `${day.distance} km`;

    document.getElementById("elevation").textContent =
        `${day.elevation} m`;

    document.getElementById("duration").textContent =
        day.duration;

    document.getElementById("description").textContent =
        day.description;

    document.getElementById("accommodation").textContent =
        day.accommodation;

    updatePois(day);

    updateButtons();

}

/**
 * Points d'intérêt
 */
function updatePois(day) {

    const list = document.getElementById("pois");

    list.innerHTML = "";

    const pois = Array.isArray(day.pois) ? day.pois : [];

    pois.forEach(poi => {

        const li = document.createElement("li");

        li.textContent = poi;

        list.appendChild(li);

    });

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

updateButtons();
initializeRoadbook();
