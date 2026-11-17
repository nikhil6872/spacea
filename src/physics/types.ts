export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface GravityWellSpec {
  id: string;
  name: string;
  position: Vec3Like;
  gm: number;
  minR: number;
}

export interface CosmicZoneSpec {
  id: number;
  shortLabel: string;
  hindiLabel: string;
  name: string;
  fogColor: number;
  lightColor: number;
}

export const COSMIC_ZONES: CosmicZoneSpec[] = [
  {
    id: 0,
    shortLabel: 'Oort Halo',
    hindiLabel: 'ऊर्ट क्लाउड',
    name: '1. Oort Comet Halo (60 Objects)',
    fogColor: 0x041428,
    lightColor: 0x88eeff,
  },
  {
    id: 1,
    shortLabel: 'Nebulae',
    hindiLabel: 'अंतरतारकीय',
    name: '2. Interstellar Ionized Nebulae',
    fogColor: 0x160418,
    lightColor: 0xff3388,
  },
  {
    id: 2,
    shortLabel: 'Galaxy',
    hindiLabel: 'आकाशगंगा',
    name: '3. Milky Way Spiral Galaxy (6,000 Stars)',
    fogColor: 0x03091c,
    lightColor: 0x00ffcc,
  },
  {
    id: 3,
    shortLabel: 'Cosmic Web',
    hindiLabel: 'ब्रह्मांड',
    name: '4. Observable Universe Cosmic Web',
    fogColor: 0x0c0322,
    lightColor: 0xffcc00,
  },
  {
    id: 4,
    shortLabel: 'Multiverse',
    hindiLabel: 'मल्टीवर्स',
    name: '5. Multiverse Bulk (16 Bubble Universes)',
    fogColor: 0x14022c,
    lightColor: 0xbc13fe,
  },
];

export const ESCORT_REST_MASS_KG = 4.8e6;
export const ESCORT_RCS_FORCE_N = 4.56e8;
export const MOTHERSHIP_REST_MASS_KG = 8.5e11;
export const MOTHERSHIP_RCS_FORCE_N = 4.25e13;
export const SPEED_OF_LIGHT_MS = 299792458;
export const PORTAL_THROAT_RADIUS_M = 460;
export const PORTAL_COOLDOWN_SEC = 3.0;
export const PORTAL_RELOCATE_DIST_M = 1800;
export const CAPACITOR_MAX_EJ = 250;

export interface HudSnapshot {
  phase: GamePhase;
  dispMassKg: number;
  effectiveMassKg: number;
  maxAccelMS2: number;
  higgsSuppression: number;
  localSpeedMS: number;
  gLoad: number;
  admContractionFactor: number;
  metricSpeedC: number;
  bubbleActive: boolean;
  inertialDampers: boolean;
  spacePuller: boolean;
  phaseShift: boolean;
  mothershipControl: boolean;
  wingmenActive: boolean;
  showMetricGrid: boolean;
  mouseSteer: boolean;
  armadaSyncing: boolean;
  armadaCountdownSec: number;
  armadaStageLabel: string;
  fastCountdown: boolean;
  portalJumpCooldownSec: number;
  portalTransits: number;
  tunneledCount: number;
  shearGrazeCount: number;
  nanoStatus: string;
  systemIdx: number;
  zoneName: string;
  capacitorEJ: number;
  conduitIntegrity: number;
  bossHull: number;
  schStability: number;
  hullIntegrity: number;
  totalHarvestedEJ: number;
  enemiesDestroyed: number;
  bossesDestroyed: number;
  fps: number;
  dtMs: number;
  alertMessage: string;
  alertTone: 'info' | 'success' | 'warn' | 'crit';
  endReason: 'victory' | 'defeat' | null;
}

export interface SimCommandBus {
  setCosmicZone: (idx: number) => void;
  toggleBubble: () => void;
  injectStableOrbit: () => void;
  toggleDampers: () => void;
  toggleWarp: () => void;
  togglePhase: () => void;
  firePlayerLaser: () => void;
  firePlayerPlasma: () => void;
  shuntPortalMass: () => void;
  toggleWingmen: () => void;
  toggleMothershipMode: () => void;
  toggleMetricGrid: () => void;
  triggerArmadaJump: () => void;
  toggleCountdownSpeed: () => void;
  toggleMouseSteer: () => void;
  setVirtualKey: (key: string, pressed: boolean) => void;
  setJoystick: (side: 'left' | 'right', x: number, y: number) => void;
  startGame: () => void;
  togglePause: () => void;
  restartGame: () => void;
  returnToTitle: () => void;
}
