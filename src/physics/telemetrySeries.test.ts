import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendTelemetrySample,
  computeMetricDomain,
  getSampleValue,
  TelemetrySample,
} from './telemetrySeries';

test('appendTelemetrySample caps history length at maxSamples and tracks Higgs mass percentage', () => {
  let samples: TelemetrySample[] = [];
  for (let i = 0; i < 65; i++) {
    samples = appendTelemetrySample(
      samples,
      { gLoad: i * 0.1, higgsSuppression: 0, dispMassKg: 4.8e6 },
      i,
      60
    );
  }
  assert.equal(samples.length, 60);
  assert.equal(samples[0].seq, 5);
  assert.equal(samples[59].seq, 64);
  assert.equal(samples[59].effectiveMassRatioPct, 100);

  const decoupled = appendTelemetrySample(
    samples,
    { gLoad: 0.0, higgsSuppression: 0.999999, dispMassKg: 0 },
    65,
    60
  );
  assert.equal(decoupled[59].effectiveMassRatioPct, 0);
  assert.equal(decoupled[59].gLoad, 0);
});

test('computeMetricDomain adapts G-load ceiling and keeps Effective Mass fixed 0-105%', () => {
  const samples: TelemetrySample[] = [
    { seq: 0, gLoad: 1.0, effectiveMassRatioPct: 100, dispMassKg: 4.8e6 },
    { seq: 1, gLoad: 8.0, effectiveMassRatioPct: 50, dispMassKg: 2.4e6 },
  ];

  const [gMin, gMax] = computeMetricDomain(samples, 'gLoad');
  assert.equal(gMin, 0);
  assert.ok(gMax >= 9.2);

  const [mMin, mMax] = computeMetricDomain(samples, 'effectiveMass');
  assert.equal(mMin, 0);
  assert.equal(mMax, 105);
  assert.equal(getSampleValue(samples[1], 'gLoad'), 8.0);
  assert.equal(getSampleValue(samples[1], 'effectiveMass'), 50);
});
