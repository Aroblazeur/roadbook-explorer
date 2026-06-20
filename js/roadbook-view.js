import { formatDuration, getRoadbookTotals } from "./roadbook-store.js";

const $ = (id) => document.getElementById(id);

export function createRoadbookView() {
  const elements = {
    app: $("app"), brandEyebrow: $("brand-eyebrow"), brandTitle: $("brand-title"),
    brandTagline: $("brand-tagline"), info: $("roadbook-info"), tripStats: $("trip-stats"),
    stageCount: $("stage-count"), stageList: $("stage-list"), previous: $("previous-day"),
    next: $("next-day"), currentDay: $("current-day"), progress: $("progress-bar"),
    stageLabel: $("stage-label"), dayTitle: $("day-title"), stageStats: $("stage-stats"),
    description: $("description"), details: $("stage-details"), detail: $("stage-detail"),
    footerTitle: $("footer-title"), footerMessage: $("footer-message")
  };

  function renderRoadbook(roadbook, onSelect) {
    const branding = roadbook.branding;
    const totals = getRoadbookTotals(roadbook);
    document.documentElement.lang = roadbook.locale.split("-")[0];
    document.title = roadbook.title;
    elements.brandEyebrow.textContent = branding.eyebrow || "Roadbook";
    elements.brandTitle.textContent = branding.title || roadbook.title;
    elements.brandTagline.textContent = branding.tagline || roadbook.description;
    elements.footerTitle.textContent = branding.footerTitle || roadbook.title;
    elements.footerMessage.textContent = branding.footerMessage || "";
    elements.info.replaceChildren(
      textElement("p", "eyebrow", "Votre aventure"),
      textElement("h2", "", roadbook.title, "roadbook-title"),
      textElement("p", "", roadbook.description)
    );
    renderDefinitionList(elements.tripStats, [
      [roadbook.days.length, "etapes"], [totals.distanceKm, "kilometres"],
      [totals.elevationGainM.toLocaleString(roadbook.locale), "metres D+"]
    ]);
    elements.tripStats.hidden = false;
    elements.stageCount.textContent = `${roadbook.days.length} etapes`;
    renderStageList(roadbook.days, onSelect);
    elements.app.setAttribute("aria-busy", "false");
  }

  function renderStageList(days, onSelect) {
    elements.stageList.replaceChildren(...days.map((day, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.dayId = day.id;
      button.append(
        textElement("span", "stage-list__number", String(index + 1).padStart(2, "0")),
        textElement("span", "stage-list__title", day.title),
        textElement("span", "stage-list__distance", `${day.distanceKm} km`)
      );
      button.addEventListener("click", () => onSelect(day.id));
      item.append(button);
      return item;
    }));
  }

  function renderDay(state, options = {}) {
    const { roadbook, currentDay: day, currentIndex } = state;
    elements.currentDay.textContent = `Jour ${currentIndex + 1} sur ${roadbook.days.length}`;
    elements.progress.style.width = `${((currentIndex + 1) / roadbook.days.length) * 100}%`;
    elements.stageLabel.textContent = `Etape ${currentIndex + 1}`;
    elements.dayTitle.textContent = day.title;
    elements.description.textContent = day.summary;
    elements.previous.disabled = !state.hasPrevious;
    elements.next.disabled = !state.hasNext;
    elements.stageList.querySelectorAll("button").forEach((button) => {
      const active = button.dataset.dayId === day.id;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "step"); else button.removeAttribute("aria-current");
    });

    renderStats(day);
    renderDetails(day);
    document.title = `${day.title} - ${roadbook.title}`;
    if (options.focus) elements.detail.focus({ preventScroll: true });
  }

  function renderStats(day) {
    const stats = [
      ["&#x2194;", "Distance", `${day.distanceKm} km`],
      ["&#x2197;", "Denivele", `${day.elevationGainM} m D+`],
      ["&#x25f7;", "Duree", formatDuration(day.durationMinutes)]
    ];
    elements.stageStats.replaceChildren(...stats.map(([icon, label, value]) => {
      const node = $("stat-template").content.firstElementChild.cloneNode(true);
      node.querySelector(".stat__icon").innerHTML = icon;
      node.querySelector("small").textContent = label;
      node.querySelector("strong").textContent = value;
      return node;
    }));
  }

  function renderDetails(day) {
    const details = [
      ["&#x2316;", "Points d'interet", listContent(day.pois, (poi) => poi.name)],
      ["&#x2668;", "Ravitaillement", listContent(day.supply, supplyLabel)],
      ["&#x2302;", "Hebergement", accommodationContent(day.accommodation)]
    ];
    elements.details.replaceChildren(...details.map(([icon, title, content]) => {
      const node = $("detail-template").content.firstElementChild.cloneNode(true);
      node.querySelector(".detail__icon").innerHTML = icon;
      node.querySelector("h2").textContent = title;
      node.querySelector(".detail__content").append(content);
      return node;
    }));
  }

  function renderError(message) {
    elements.info.replaceChildren(
      textElement("h2", "", "Roadbook indisponible", "roadbook-title"),
      textElement("p", "", message)
    );
    elements.app.setAttribute("aria-busy", "false");
    elements.previous.disabled = true;
    elements.next.disabled = true;
  }

  return Object.freeze({ elements, renderRoadbook, renderDay, renderError });
}

function textElement(tag, className, text, id) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (id) element.id = id;
  element.textContent = text;
  return element;
}

function renderDefinitionList(container, entries) {
  container.replaceChildren(...entries.flatMap(([value, label]) => [
    textElement("div", "summary__stat", ""),
  ]));
  [...container.children].forEach((item, index) => {
    item.append(textElement("dd", "", String(entries[index][0])), textElement("dt", "", entries[index][1]));
  });
}

function listContent(items, formatter) {
  if (!items.length) return textElement("p", "empty", "Non renseigne");
  const list = document.createElement("ul");
  list.className = "tag-list";
  list.append(...items.map((item) => textElement("li", "", formatter(item))));
  return list;
}

function supplyLabel(item) {
  return item.km === undefined ? item.label : `${item.label} - km ${item.km}`;
}

function accommodationContent(accommodation) {
  if (!accommodation) return textElement("p", "empty", "Non renseigne");
  const wrapper = document.createDocumentFragment();
  wrapper.append(textElement("p", "detail__lead", accommodation.name));
  if (accommodation.details) wrapper.append(textElement("p", "", accommodation.details));
  return wrapper;
}

