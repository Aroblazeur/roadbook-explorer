import assert from "node:assert/strict";
import {
  buildStartPointRecord,
  hasReturnTrip,
  hasStartJourney,
  journeyCities,
  journeyDistance,
  journeyTransportModes,
  normalizeStartPoint,
} from "../src/lib/roadbooks/start-point.js";

const legacy = normalizeStartPoint({
  departure_city: "Metz",
  arrival_city: "Schengen",
  transport_mode: "train",
  distance_km: 55,
});
assert.equal(legacy.transport_segments.length, 1);
assert.equal(legacy.transport_segments[0].transport_mode, "train");
assert.equal(hasStartJourney(legacy), true);
assert.equal(hasReturnTrip(legacy), false);

const multimodal = normalizeStartPoint({
  transport_segments: [
    { departure_city: "Nancy", arrival_city: "Metz", transport_mode: "train", distance_km: 58 },
    { departure_city: "Metz", arrival_city: "Schengen", transport_mode: "bicycle", distance_km: 52.4 },
  ],
  return_trip: {
    transport_segments: [
      { departure_city: "Schengen", arrival_city: "Thionville", transport_mode: "bicycle", distance_km: 39.2 },
      { departure_city: "Thionville", arrival_city: "Nancy", transport_mode: "train", distance_km: 91 },
    ],
  },
});

assert.deepEqual(journeyTransportModes(multimodal), ["train", "bicycle"]);
assert.deepEqual(journeyCities(multimodal), ["Nancy", "Metz", "Schengen"]);
assert.equal(journeyDistance(multimodal), 110.4);
assert.equal(hasReturnTrip(multimodal), true);

const record = buildStartPointRecord(multimodal, 4);
assert.equal(record.transport_mode, "multimodal");
assert.equal(record.transport_segments.length, 2);
assert.equal(record.return_trip.transport_segments.length, 2);
assert.equal(record.departure_city, "Nancy");
assert.equal(record.arrival_city, "Schengen");

console.log("Retour et trajets multimodaux : 13 assertions OK");
