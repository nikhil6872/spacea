import { HudSnapshot } from './types';

export type TelemetryGraphMetric = 'gLoad' | 'effectiveMass';

export interface TelemetrySample {
  seq: number;
  gLoad: number;
  effectiveMassRatioPct: number;
  dispMassKg: number;
}

export const MAX_TELEMETRY_SAMPLES = 60;

/**
 * Appends a new HUD snapshot sample into a bounded sliding window without mutating input.
 */
export function appendTelemetrySample(
  history: readonly TelemetrySample[],
  snap: Pick<HudSnapshot, 'gLoad' | 'higgsSuppression' | 'dispMassKg'>,
  seq: number,
  maxSamples = MAX_TELEMETRY_SAMPLES
): TelemetrySample[] {
  const massCouplingPct = Math.max(0, Math.min(100, (1 - snap.higgsSuppression) * 100));
  const nextSample: TelemetrySample = {
    seq,
    gLoad: Number.isFinite(snap.gLoad) ? Math.max(0, snap.gLoad) : 0,
    effectiveMassRatioPct: snap.dispMassKg === 0 ? 0 : massCouplingPct,
    dispMassKg: snap.dispMassKg,
  };

  if (history.length < maxSamples) {
    return [...history, nextSample];
  }
  return [...history.slice(history.length - maxSamples + 1), nextSample];
}

/**
 * Extracts the active Y-axis domain [min, max] for D3 scaleLinear.
 */
export function computeMetricDomain(
  samples: readonly TelemetrySample[],
  metric: TelemetryGraphMetric
): [number, number] {
  if (metric === 'effectiveMass') {
    return [0, 105];
  }

  let peak = 2.0;
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].gLoad > peak) {
      peak = samples[i].gLoad;
    }
  }
  return [0, Math.ceil(peak * 1.15 * 10) / 10];
}

export function getSampleValue(
  sample: TelemetrySample,
  metric: TelemetryGraphMetric
): number {
  return metric === 'gLoad' ? sample.gLoad : sample.effectiveMassRatioPct;
}
