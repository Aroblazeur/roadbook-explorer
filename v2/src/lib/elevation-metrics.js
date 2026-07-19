const DEFAULT_NOISE_THRESHOLD_M = 5;

export function elevationMetricsFromSamples(samples, noiseThresholdM = DEFAULT_NOISE_THRESHOLD_M) {
  const elevations = (samples ?? [])
    .map(sample => Number(sample?.elevation ?? sample))
    .filter(Number.isFinite);
  if (elevations.length < 2) return { elevationGainM: null, elevationLossM: null };

  let elevationGainM = 0;
  let elevationLossM = 0;
  let pendingDelta = 0;
  for (let index = 1; index < elevations.length; index += 1) {
    pendingDelta += elevations[index] - elevations[index - 1];
    if (Math.abs(pendingDelta) < noiseThresholdM) continue;
    if (pendingDelta > 0) elevationGainM += pendingDelta;
    else elevationLossM += Math.abs(pendingDelta);
    pendingDelta = 0;
  }

  return {
    elevationGainM: Math.round(elevationGainM),
    elevationLossM: Math.round(elevationLossM),
  };
}
