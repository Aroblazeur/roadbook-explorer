import { createElement, displayValue, EMPTY_VALUE, formatDuration } from "./utils.js";

const METRICS = [
  { key: "kilometers", label: "Distance", suffix: " km", icon: "\u2194" },
  { key: "elevationGain", label: "D+", suffix: " m", icon: "\u2197" },
  { key: "elevationLoss", label: "D-", suffix: " m", icon: "\u2198" },
  { key: "durationMinutes", label: "Durée", formatter: formatDuration, icon: "\u25f7" },
  { key: "difficulty", label: "Difficulté", icon: "\u25c6" }
];

export function createDayCard(day, index) {
  const article = createElement("article", {
    className: "card stage stage-card",
    attributes: { id: `day-${day.id}`, tabindex: "-1", "aria-labelledby": `day-title-${day.id}` }
  });
  const heading = createElement("header", { className: "stage__heading" });
  heading.append(
    createElement("p", { className: "eyebrow", text: stageLabel(day, index) }),
    createElement("h2", { text: day.title, attributes: { id: `day-title-${day.id}` } }),
    createRoute(day)
  );

  const stats = createElement("dl", { className: "stats", attributes: { "aria-label": "Informations de l'étape" } });
  stats.append(...METRICS.map((metric) => createMetric(day, metric)));

  const description = createElement("section", { className: "stage__description" });
  description.append(
    createElement("h3", { text: "Description" }),
    createElement("p", { text: displayValue(day.description) })
  );

  const details = createElement("div", { className: "details-grid" });
  details.append(
    createDetail("\u2302", "Hébergement", accommodationText(day.accommodation)),
    createCollectionDetail("\u2316", "Points d'intérêt", day.interest),
    createCollectionDetail("\u2668", "Restaurants", day.restaurants),
    createCollectionDetail("\u25a3", "Commerces", day.shops),
    createCollectionDetail("\u25c9", "Points d'eau", day.water),
    createCollectionDetail("!", "Alertes", day.warning, "detail--warning")
  );

  article.append(heading, stats, description, details);
  return article;
}

function stageLabel(day, index) {
  return day.date ? `Étape ${index + 1} - ${day.date}` : `Étape ${index + 1}`;
}

function createRoute(day) {
  const route = createElement("div", { className: "route-summary" });
  route.append(
    routePoint("Départ", day.departure),
    createElement("span", { className: "route-summary__arrow", text: "\u2192", attributes: { "aria-hidden": "true" } }),
    routePoint("Arrivée", day.arrival)
  );
  return route;
}

function routePoint(label, value) {
  const point = createElement("div", { className: "route-summary__point" });
  point.append(createElement("small", { text: label }), createElement("strong", { text: displayValue(value) }));
  return point;
}

function createMetric(day, metric) {
  const value = day[metric.key];
  const rendered = metric.formatter
    ? metric.formatter(value)
    : value === null || value === "" ? EMPTY_VALUE : `${value}${metric.suffix || ""}`;
  const item = createElement("div", { className: "stat" });
  item.append(
    createElement("span", { className: "stat__icon", text: metric.icon, attributes: { "aria-hidden": "true" } }),
    createElement("div")
  );
  item.lastElementChild.append(createElement("dt", { text: metric.label }), createElement("dd", { text: rendered }));
  return item;
}

function createDetail(icon, title, text) {
  const section = createElement("section", { className: "card detail" });
  const content = createElement("div");
  content.append(createElement("h3", { text: title }), createElement("p", { text: displayValue(text) }));
  section.append(createElement("div", { className: "detail__icon", text: icon, attributes: { "aria-hidden": "true" } }), content);
  return section;
}

function createCollectionDetail(icon, title, items, extraClass = "") {
  if (!items.length) return createDetail(icon, title, EMPTY_VALUE, extraClass);
  const section = createElement("section", { className: `card detail ${extraClass}`.trim() });
  const content = createElement("div");
  const list = createElement("ul", { className: "tag-list" });
  list.append(...items.map((item) => createElement("li", { text: itemLabel(item) })));
  content.append(createElement("h3", { text: title }), list);
  section.append(createElement("div", { className: "detail__icon", text: icon, attributes: { "aria-hidden": "true" } }), content);
  return section;
}

function itemLabel(item) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return EMPTY_VALUE;
  const label = item.name || item.label || item.title || EMPTY_VALUE;
  return item.km === undefined ? label : `${label} - km ${item.km}`;
}

function accommodationText(accommodation) {
  if (!accommodation) return EMPTY_VALUE;
  return [accommodation.name, accommodation.details].filter(Boolean).join(" - ") || EMPTY_VALUE;
}
