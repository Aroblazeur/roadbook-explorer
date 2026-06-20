import { createRoadbookStore, parseRoadbook, RoadbookDataError } from "./roadbook-store.js";
import { createRoadbookView } from "./roadbook-view.js";

const DATA_URL = "data/roadbook.json";

async function loadRoadbook(url = DATA_URL) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseRoadbook(await response.json());
}

async function bootstrap() {
  const view = createRoadbookView();
  try {
    const roadbook = await loadRoadbook();
    const store = createRoadbookStore(roadbook);
    view.renderRoadbook(roadbook, (id) => store.select(id));
    view.renderDay(store.getState());
    store.subscribe((state) => view.renderDay(state, { focus: true }));
    view.elements.previous.addEventListener("click", store.previous);
    view.elements.next.addEventListener("click", store.next);
    document.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") store.previous();
      if (event.key === "ArrowRight") store.next();
    });
  } catch (error) {
    console.error("Roadbook bootstrap failed", error);
    const message = error instanceof RoadbookDataError
      ? "Le fichier de donnees ne respecte pas le format attendu."
      : "Les donnees n'ont pas pu etre chargees. Verifiez votre connexion puis rechargez la page.";
    view.renderError(message);
  }
}

document.addEventListener("DOMContentLoaded", bootstrap);

