"use strict";

let roadbook = null;
let currentDay = 0;

const elements = {};

function cacheElements() {
  [
    "roadbook-info", "trip-stats", "total-days", "total-distance", "total-elevation",
    "previous-day", "next-day", "current-day", "progress-bar", "stage-label", "day-title",
    "distance", "elevation", "duration", "description", "pois", "supply", "accommodation"
  ].forEach((id) => { elements[id] = document.getElementById(id); });
}

function isValidRoadbook(data) {
  return data && typeof data.title === "string" && Array.isArray(data.days) && data.days.length > 0;
}

async function loadRoadbook() {
  try {
    const response = await fetch("data/roadbook.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!isValidRoadbook(data)) throw new Error("Format du roadbook invalide");

    roadbook = data;
    updateSummary();
    displayDay(currentDay);
  } catch (error) {
    console.error("Chargement du roadbook impossible", error);
    elements["roadbook-info"].innerHTML = `
      <h2 id="roadbook-title">Roadbook indisponible</h2>
      <p>Les donnÃ©es nâ€™ont pas pu Ãªtre chargÃ©es. VÃ©rifiez votre connexion puis rechargez la page.</p>`;
    setNavigationDisabled(true);
  }
}

function updateSummary() {
  const totalDistance = roadbook.days.reduce((total, day) => total + Number(day.distance || 0), 0);
  const totalElevation = roadbook.days.reduce((total, day) => total + Number(day.elevation || 0), 0);

  elements["roadbook-info"].innerHTML = `
    <p class="eyebrow">Votre aventure</p>
    <h2 id="roadbook-title"></h2>
    <p id="roadbook-description"></p>`;
  document.getElementById("roadbook-title").textContent = roadbook.title;
  document.getElementById("roadbook-description").textContent = roadbook.description || "";
  elements["total-days"].textContent = roadbook.days.length;
  elements["total-distance"].textContent = totalDistance;
  elements["total-elevation"].textContent = totalElevation.toLocaleString("fr-FR");
  elements["trip-stats"].hidden = false;
}

function displayDay(index) {
  if (!roadbook || !roadbook.days[index]) return;

  const day = roadbook.days[index];
  currentDay = index;
  elements["current-day"].textContent = `Jour ${index + 1} sur ${roadbook.days.length}`;
  elements["stage-label"].textContent = `Ã‰tape ${index + 1}`;
  elements["day-title"].textContent = day.title || `Jour ${index + 1}`;
  elements.distance.textContent = `${day.distance ?? "â€”"} km`;
  elements.elevation.textContent = `${day.elevation ?? "â€”"} m D+`;
  elements.duration.textContent = day.duration || "â€”";
  elements.description.textContent = day.description || "Aucune description pour cette Ã©tape.";
  elements.supply.textContent = day.supply || "Non renseignÃ©";
  elements.accommodation.textContent = day.accommodation || "Non renseignÃ©";
  elements["progress-bar"].style.width = `${((index + 1) / roadbook.days.length) * 100}%`;
  updatePois(day.pois);
  updateButtons();
  document.title = `${elements["day-title"].textContent} Â· Perinexus Roadbook`;
}

function updatePois(pois = []) {
  elements.pois.replaceChildren();
  if (!Array.isArray(pois) || pois.length === 0) {
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent = "Aucun point renseignÃ©";
    elements.pois.append(item);
    return;
  }

  pois.forEach((poi) => {
    const item = document.createElement("li");
    item.textContent = poi;
    elements.pois.append(item);
  });
}

function setNavigationDisabled(disabled) {
  elements["previous-day"].disabled = disabled;
  elements["next-day"].disabled = disabled;
}

function updateButtons() {
  elements["previous-day"].disabled = currentDay === 0;
  elements["next-day"].disabled = currentDay === roadbook.days.length - 1;
}

function changeDay(offset) {
  const target = currentDay + offset;
  if (!roadbook || target < 0 || target >= roadbook.days.length) return;
  displayDay(target);
  document.getElementById("day-card").focus({ preventScroll: true });
  window.scrollTo({ top: document.getElementById("day-card").offsetTop - 20, behavior: "smooth" });
}

function init() {
  cacheElements();
  setNavigationDisabled(true);
  elements["previous-day"].addEventListener("click", () => changeDay(-1));
  elements["next-day"].addEventListener("click", () => changeDay(1));
  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") changeDay(-1);
    if (event.key === "ArrowRight") changeDay(1);
  });
  loadRoadbook();
}

document.addEventListener("DOMContentLoaded", init);

