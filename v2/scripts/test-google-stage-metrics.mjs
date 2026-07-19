import assert from "node:assert/strict";
import { elevationMetricsFromSamples } from "../src/lib/elevation-metrics.js";
import { resolveGoogleMapsRoute } from "../src/lib/google-map-links.js";

const pathRoute = await resolveGoogleMapsRoute("https://www.google.com/maps/dir/Amnéville/Vigy/data=!4m2!4m1!3e1");
assert.deepEqual(pathRoute.locations, ["Amnéville", "Vigy"]);
assert.equal(pathRoute.travelMode, "BICYCLE");

const queryRoute = await resolveGoogleMapsRoute("https://www.google.com/maps/dir/?api=1&origin=Schengen&destination=Metz&waypoints=Thionville&travelmode=bicycling");
assert.deepEqual(queryRoute.locations, ["Schengen", "Thionville", "Metz"]);
assert.equal(queryRoute.travelMode, "BICYCLE");

assert.deepEqual(
  elevationMetricsFromSamples([{ elevation: 100 }, { elevation: 102 }, { elevation: 107 }, { elevation: 105 }, { elevation: 96 }]),
  { elevationGainM: 7, elevationLossM: 11 },
);
assert.deepEqual(elevationMetricsFromSamples([]), { elevationGainM: null, elevationLossM: null });

console.log("Google Maps stage metrics: 4 cas OK");
