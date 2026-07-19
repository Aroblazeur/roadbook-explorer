import assert from "node:assert/strict";
import {
  buildCanonicalGpxMediaInput,
  buildGpxBusinessIdentity,
  classifyGpxMedia,
  selectUniqueGpxMedia,
} from "../src/lib/roadbooks/gpx-media.js";
import { buildStartPointRecord, normalizeJourney } from "../src/lib/roadbooks/start-point.js";

const first = buildCanonicalGpxMediaInput({ roadbookId: 7, stageId: 12, scope: "stage", role: "official", routeId: "route-a" });
const second = buildCanonicalGpxMediaInput({ roadbookId: 7, stageId: 12, scope: "stage", role: "official", routeId: "route-b" });
assert.equal(first.ok, true);
assert.equal(second.ok, true);

const mediaA = { id: 1, ...first.record };
const mediaB = { id: 2, ...second.record };
const classA = classifyGpxMedia(mediaA);
const classB = classifyGpxMedia(mediaB);
assert.equal(classA.routeId, "route-a");
assert.notEqual(buildGpxBusinessIdentity(classA), buildGpxBusinessIdentity(classB));
assert.equal(selectUniqueGpxMedia([mediaA, mediaB]).unique.size, 2);
assert.equal(selectUniqueGpxMedia([mediaA, mediaB]).duplicates.length, 0);

for (const scope of ["start", "return"]) {
  const built = buildCanonicalGpxMediaInput({ roadbookId: 7, scope, role: "official", routeId: `${scope}-gpx` });
  assert.equal(built.ok, true);
  assert.equal(classifyGpxMedia({ id: scope, ...built.record }).scope, scope);
}

const journey = normalizeJourney({ route_maps: [
  { label: "Train", url: "https://maps.example/train" },
  "https://maps.example/bike",
] });
assert.equal(journey.route_maps.length, 2);
assert.equal(journey.route_maps[1].label, "");

const record = buildStartPointRecord({ ...journey, return_trip: { route_maps: [{ label: "Retour", url: "https://maps.example/return" }] } }, 7);
assert.equal(record.route_maps.length, 2);
assert.equal(record.return_trip.route_maps.length, 1);

console.log("Ressources d’itinéraire multiples : 14 assertions OK");
