import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCircularOrbitVelocity,
  computeGravityAccelerationInPlace,
  evaluateHostileImpact,
  morrisThorneEmbeddingZ,
  stepAdmMetric,
  stepArmadaCountdown,
  stepHiggsMassCoupling,
} from './engine';
import { ESCORT_RCS_FORCE_N, ESCORT_REST_MASS_KG, GravityWellSpec } from './types';

test('stepHiggsMassCoupling preserves rest mass when bubble is off and decouples to 0 display kg when on', () => {
  const coupled = stepHiggsMassCoupling(ESCORT_REST_MASS_KG, ESCORT_RCS_FORCE_N, 0, false, 0.016);
  assert.equal(coupled.effectiveMassKg, ESCORT_REST_MASS_KG);
  assert.equal(coupled.dispMassKg, ESCORT_REST_MASS_KG);
  assert.ok(Math.abs(coupled.maxAccelMS2 - 95) < 0.01);

  let supp = 0;
  for (let i = 0; i < 120; i++) {
    const res = stepHiggsMassCoupling(ESCORT_REST_MASS_KG, ESCORT_RCS_FORCE_N, supp, true, 0.016);
    supp = res.higgsSuppression;
  }
  const decoupled = stepHiggsMassCoupling(ESCORT_REST_MASS_KG, ESCORT_RCS_FORCE_N, supp, true, 0.016);
  assert.equal(decoupled.dispMassKg, 0);
  assert.ok(Math.abs(decoupled.effectiveMassKg - ESCORT_REST_MASS_KG * 0.08) < 1);
  assert.ok(decoupled.maxAccelMS2 > 1100);
});

test('computeGravityAccelerationInPlace follows inverse-square law and decouples under Higgs suppression', () => {
  const wells: GravityWellSpec[] = [
    { id: 'star', name: 'Solar Star', position: { x: 0, y: 0, z: 0 }, gm: 1_000_000, minR: 50 },
  ];
  const out = { x: 0, y: 0, z: 0 };

  computeGravityAccelerationInPlace({ x: 100, y: 0, z: 0 }, wells, 0, out);
  assert.ok(Math.abs(out.x - -100) < 1e-6);
  assert.equal(out.y, 0);
  assert.equal(out.z, 0);

  computeGravityAccelerationInPlace({ x: 100, y: 0, z: 0 }, wells, 0.999999, out);
  assert.equal(out.x, 0);
});

test('computeCircularOrbitVelocity produces tangential velocity matching sqrt(GM/r)', () => {
  const well: GravityWellSpec = {
    id: 'star',
    name: 'Solar Star',
    position: { x: 0, y: 0, z: 0 },
    gm: 1_450_000,
    minR: 110,
  };
  const v = computeCircularOrbitVelocity({ x: 250, y: 0, z: 0 }, well);
  const expectedSpeed = Math.sqrt(1_450_000 / 250);
  assert.ok(Math.abs(v.speedMS - expectedSpeed) < 1e-6);
  assert.ok(Math.abs(v.vx) < 1e-6);
  assert.ok(Math.abs(v.vz - expectedSpeed) < 1e-6);
});

test('stepAdmMetric keeps sub-warp local velocity honest and scales ADM contraction under Space Puller', () => {
  const subWarp = stepAdmMetric(1.0, 28.0, false, false, 0.016);
  assert.equal(subWarp.admContractionFactor, 1.0);
  assert.ok(subWarp.metricSpeedC < 1e-6);

  let adm = 1.0;
  for (let i = 0; i < 180; i++) {
    adm = stepAdmMetric(adm, 50.0, true, true, 0.016).admContractionFactor;
  }
  const warp = stepAdmMetric(adm, 50.0, true, true, 0.016);
  assert.ok(warp.admContractionFactor > 360000);
  assert.ok(warp.metricSpeedC > 395000);
});

test('evaluateHostileImpact enforces 98% phase tunneling, 2% shear graze, and Hex coil redirect', () => {
  const tunneled = evaluateHostileImpact(true, false, 0.5);
  assert.equal(tunneled.type, 'tunneled');
  assert.equal(tunneled.hullDelta, 0);

  const shear = evaluateHostileImpact(true, false, 0.99);
  assert.equal(shear.type, 'shear-graze');
  assert.equal(shear.hullDelta, -9);
  assert.equal(shear.triggerNanoHeal, true);

  const hex = evaluateHostileImpact(false, true, 0.5);
  assert.equal(hex.type, 'hex-redirect');
  assert.equal(hex.capacitorDelta, 24);
});

test('morrisThorneEmbeddingZ returns 0 at throat r=b0 and symmetric branches for r>b0', () => {
  assert.equal(morrisThorneEmbeddingZ(32, 32, 1), 0);
  const zPos = morrisThorneEmbeddingZ(96, 32, 1);
  const zNeg = morrisThorneEmbeddingZ(96, 32, -1);
  assert.ok(zPos > 50);
  assert.ok(Math.abs(zPos + zNeg) < 1e-6);
});

test('stepArmadaCountdown progresses cleanly through stages 1-4 and triggers completion once', () => {
  const flags = { s120: false, s60: false, s30: false, s5: false };
  const s1 = stepArmadaCountdown(120, false, flags, 1.0);
  assert.equal(s1.stage, 1);
  assert.equal(s1.triggerWingmen, true);

  const s2 = stepArmadaCountdown(60.5, true, flags, 0.1); // 1.0s fast -> 59.5s
  assert.equal(s2.stage, 2);
  assert.equal(s2.triggerShunt, true);

  const s3 = stepArmadaCountdown(30.5, true, flags, 0.1);
  assert.equal(s3.stage, 3);
  assert.equal(s3.triggerTether, true);

  const s4 = stepArmadaCountdown(5.2, true, flags, 0.1);
  assert.equal(s4.stage, 4);

  const done = stepArmadaCountdown(0.5, true, flags, 0.1);
  assert.equal(done.stage, 'COMPLETE');
  assert.equal(done.completeJump, true);
});
