import {
  CAPACITOR_MAX_EJ,
  GravityWellSpec,
  SPEED_OF_LIGHT_MS,
  Vec3Like,
} from './types';

export interface MassCouplingResult {
  higgsSuppression: number;
  effectiveMassKg: number;
  dispMassKg: number;
  massRatio: number;
  maxAccelMS2: number;
}

/**
 * Computes dynamic Higgs field suppression and effective inertial mass (m_eff).
 * Clamps internal effective mass floor at 8% of rest mass so F / m_eff stays finite
 * while displaying 0.00 kg once Higgs suppression exceeds 99%.
 */
export function stepHiggsMassCoupling(
  restMassKg: number,
  rcsForceN: number,
  currentSuppression: number,
  bubbleActive: boolean,
  dt: number
): MassCouplingResult {
  const target = bubbleActive ? 0.999999 : 0.0;
  const alpha = Math.min(1.0, 6.0 * dt);
  const higgsSuppression = currentSuppression + (target - currentSuppression) * alpha;
  const effectiveMassKg = restMassKg * Math.max(0.08, 1.0 - higgsSuppression);
  const dispMassKg = higgsSuppression > 0.99 ? 0.0 : effectiveMassKg;
  const massRatio = restMassKg / effectiveMassKg;
  const maxAccelMS2 = rcsForceN / effectiveMassKg;

  return {
    higgsSuppression,
    effectiveMassKg,
    dispMassKg,
    massRatio,
    maxAccelMS2,
  };
}

/**
 * Evaluates inverse-square Keplerian gravitational acceleration in place (zero allocation).
 * Gravity coupling scales linearly by (1 - higgsSuppression).
 */
export function computeGravityAccelerationInPlace(
  pos: Vec3Like,
  wells: readonly GravityWellSpec[],
  higgsSuppression: number,
  outAcc: Vec3Like
): void {
  outAcc.x = 0;
  outAcc.y = 0;
  outAcc.z = 0;

  const gravCoupling = 1.0 - higgsSuppression;
  if (gravCoupling <= 0.001) return;

  for (let i = 0; i < wells.length; i++) {
    const gw = wells[i];
    const dx = gw.position.x - pos.x;
    const dy = gw.position.y - pos.y;
    const dz = gw.position.z - pos.z;
    const lenSq = dx * dx + dy * dy + dz * dz;
    const clampedSq = Math.max(gw.minR * gw.minR, lenSq);
    const len = Math.sqrt(lenSq);
    if (len < 1e-6) continue;
    const forceMag = (gw.gm / clampedSq) * gravCoupling;
    const invLen = 1.0 / len;
    outAcc.x += dx * invLen * forceMag;
    outAcc.y += dy * invLen * forceMag;
    outAcc.z += dz * invLen * forceMag;
  }
}

/**
 * Computes tangential orbital velocity v_orb = sqrt(GM / r) perpendicular to the radial vector
 * around the nearest gravitational body.
 */
export function computeCircularOrbitVelocity(
  shipPos: Vec3Like,
  well: GravityWellSpec
): { vx: number; vy: number; vz: number; speedMS: number } {
  const rx = shipPos.x - well.position.x;
  const ry = shipPos.y - well.position.y;
  const rz = shipPos.z - well.position.z;
  const rawR = Math.sqrt(rx * rx + ry * ry + rz * rz);
  const r = Math.max(well.minR + 40, rawR);
  const speedMS = Math.sqrt(well.gm / r);

  // Tangent in XZ plane: (-rz, 0, rx) normalized
  const tx = -rz;
  const tz = rx;
  const tLen = Math.sqrt(tx * tx + tz * tz);
  if (tLen < 1e-6) {
    return { vx: speedMS, vy: 0, vz: 0, speedMS };
  }
  const scale = speedMS / tLen;
  return {
    vx: tx * scale,
    vy: 0,
    vz: tz * scale,
    speedMS,
  };
}

/**
 * Computes ADM spacetime contraction factor and apparent metric speed (in c)
 * separately from local Newtonian frame speed (m/s).
 */
export function stepAdmMetric(
  currentAdm: number,
  localSpeedMS: number,
  bubbleActive: boolean,
  spacePuller: boolean,
  dt: number
): { admContractionFactor: number; metricSpeedC: number } {
  const targetAdm = spacePuller ? 365000.0 : bubbleActive ? 12.4 : 1.0;
  const alpha = Math.min(1.0, 4.0 * dt);
  const admContractionFactor = currentAdm + (targetAdm - currentAdm) * alpha;
  const metricSpeedC = spacePuller
    ? admContractionFactor * (1.0 + localSpeedMS / 500.0)
    : bubbleActive
      ? localSpeedMS / 40.0
      : localSpeedMS / SPEED_OF_LIGHT_MS;

  return { admContractionFactor, metricSpeedC };
}

export interface ImpactOutcome {
  type: 'tunneled' | 'shear-graze' | 'hex-redirect';
  hullDelta: number;
  capacitorDelta: number;
  harvestedEJ: number;
  triggerNanoHeal: boolean;
}

/**
 * Evaluates hostile projectile impact against 98% quantum phase-shift or Tier-2 Hex Coils.
 */
export function evaluateHostileImpact(
  phaseShiftActive: boolean,
  isPlasma: boolean,
  randomRoll: number
): ImpactOutcome {
  if (phaseShiftActive) {
    if (randomRoll < 0.98) {
      return {
        type: 'tunneled',
        hullDelta: 0,
        capacitorDelta: 0,
        harvestedEJ: 0,
        triggerNanoHeal: false,
      };
    }
    return {
      type: 'shear-graze',
      hullDelta: -9,
      capacitorDelta: 0,
      harvestedEJ: 0,
      triggerNanoHeal: true,
    };
  }

  const recoveredEJ = isPlasma ? 24 : 12;
  return {
    type: 'hex-redirect',
    hullDelta: isPlasma ? -12 : -5,
    capacitorDelta: recoveredEJ,
    harvestedEJ: recoveredEJ,
    triggerNanoHeal: true,
  };
}

export function clampCapacitor(valueEJ: number): number {
  return Math.max(0, Math.min(CAPACITOR_MAX_EJ, valueEJ));
}

/**
 * Morris-Thorne traversable wormhole embedding function:
 * z(r) = +- b0 * ln(r/b0 + sqrt((r/b0)^2 - 1))
 */
export function morrisThorneEmbeddingZ(r: number, b0: number, side: 1 | -1): number {
  const ratio = Math.max(1.0, r / b0);
  return side * b0 * Math.log(ratio + Math.sqrt(ratio * ratio - 1.0));
}

export interface ArmadaStageResult {
  nextSec: number;
  stage: 1 | 2 | 3 | 4 | 'COMPLETE';
  stageLabel: string;
  triggerWingmen: boolean;
  triggerShunt: boolean;
  triggerTether: boolean;
  completeJump: boolean;
}

/**
 * Advances the 120.00s Armada countdown across Stages 1-4.
 */
export function stepArmadaCountdown(
  currentSec: number,
  fastMode: boolean,
  stagesTriggered: { s120: boolean; s60: boolean; s30: boolean; s5: boolean },
  dt: number
): ArmadaStageResult {
  const rate = fastMode ? 10.0 : 1.0;
  const nextSec = Math.max(0, currentSec - dt * rate);

  let triggerWingmen = false;
  let triggerShunt = false;
  let triggerTether = false;

  if (nextSec > 60) {
    if (!stagesTriggered.s120) {
      stagesTriggered.s120 = true;
      triggerWingmen = true;
    }
    return {
      nextSec,
      stage: 1,
      stageLabel: `T - ${nextSec.toFixed(2)}s [STAGE 1]: 240+ ESCORT SQUADRONS IN SPHERICAL FORMATION`,
      triggerWingmen,
      triggerShunt,
      triggerTether,
      completeJump: false,
    };
  }

  if (nextSec > 30) {
    if (!stagesTriggered.s60) {
      stagesTriggered.s60 = true;
      triggerShunt = true;
    }
    return {
      nextSec,
      stage: 2,
      stageLabel: `T - ${nextSec.toFixed(2)}s [STAGE 2]: PORTAL BLEEDING 10⁴ kg/s -> 899 EW | THROAT 920m OPEN`,
      triggerWingmen,
      triggerShunt,
      triggerTether,
      completeJump: false,
    };
  }

  if (nextSec > 5) {
    if (!stagesTriggered.s30) {
      stagesTriggered.s30 = true;
      triggerTether = true;
    }
    return {
      nextSec,
      stage: 3,
      stageLabel: `T - ${nextSec.toFixed(2)}s [STAGE 3]: GOLDEN PLASMA TETHER COUPLED | WORMHOLE LOCK 100%`,
      triggerWingmen,
      triggerShunt,
      triggerTether,
      completeJump: false,
    };
  }

  if (nextSec > 0) {
    stagesTriggered.s5 = true;
    return {
      nextSec,
      stage: 4,
      stageLabel: `T - ${nextSec.toFixed(2)}s [STAGE 4]: 12 MOTHERSHIP CORES AT 0.00 kg — JUMP IMMINENT`,
      triggerWingmen,
      triggerShunt,
      triggerTether,
      completeJump: false,
    };
  }

  return {
    nextSec: 0,
    stage: 'COMPLETE',
    stageLabel: 'EINSTEIN-ROSEN TRANSIT COMPLETE',
    triggerWingmen,
    triggerShunt,
    triggerTether,
    completeJump: true,
  };
}
