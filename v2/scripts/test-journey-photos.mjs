import assert from "node:assert/strict";
import { buildStartPointRecord, hasJourney, normalizeJourney } from "../src/lib/roadbooks/start-point.js";

const normalized = normalizeJourney({ photos: [
  "https://example.com/depart.jpg",
  { photo_media_id: "42", caption: "  Gare au départ  " },
] });

assert.deepEqual(normalized.photos, [
  { url: "https://example.com/depart.jpg", photoMediaId: null, caption: "" },
  { url: "", photoMediaId: 42, caption: "  Gare au départ  " },
]);
assert.equal(hasJourney({ photos: [{ photoMediaId: 42 }] }), true);

const record = buildStartPointRecord({
  photos: normalized.photos,
  return_trip: { photos: [{ url: " https://example.com/retour.jpg ", caption: " Retour ", photoMediaId: null }] },
}, 7);

assert.deepEqual(record.photos, [
  { url: "https://example.com/depart.jpg", photoMediaId: null, caption: "" },
  { url: "", photoMediaId: 42, caption: "Gare au départ" },
]);
assert.deepEqual(record.return_trip.photos, [
  { url: "https://example.com/retour.jpg", photoMediaId: null, caption: "Retour" },
]);

console.log("Journey photos tests passed.");
