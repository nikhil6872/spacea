import { useCallback, useRef, useState } from 'react';
import { HudOverlay } from './components/HudOverlay';
import { TitleOverlay } from './components/TitleOverlay';
import {
  COSMIC_ZONES,
  ESCORT_RCS_FORCE_N,
  ESCORT_REST_MASS_KG,
  HudSnapshot,
  SimCommandBus,
} from './physics/types';
import { SimulationCanvas } from './scene/SimulationCanvas';

const INITIAL_SNAPSHOT: HudSnapshot = {
  phase:
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1'
      ? 'playing'
      : 'title',
  dispMassKg: ESCORT_REST_MASS_KG,
  effectiveMassKg: ESCORT_REST_MASS_KG,
  maxAccelMS2: ESCORT_RCS_FORCE_N / ESCORT_REST_MASS_KG,
  higgsSuppression: 0,
  localSpeedMS: 28,
  gLoad: 1.0,
  admContractionFactor: 1.0,
  metricSpeedC: 0.0,
  bubbleActive: false,
  inertialDampers: true,
  spacePuller: false,
  phaseShift: false,
  mothershipControl: false,
  wingmenActive: true,
  showMetricGrid: true,
  mouseSteer: false,
  armadaSyncing: false,
  armadaCountdownSec: 120.0,
  armadaStageLabel: '',
  fastCountdown: false,
  portalJumpCooldownSec: 0,
  portalTransits: 0,
  tunneledCount: 0,
  shearGrazeCount: 0,
  nanoStatus: 'Solid · 0.05s Nano Ready',
  systemIdx: 0,
  zoneName: COSMIC_ZONES[0].name,
  capacitorEJ: 188,
  conduitIntegrity: 100,
  bossHull: 100,
  schStability: 20,
  hullIntegrity: 100,
  totalHarvestedEJ: 0,
  enemiesDestroyed: 0,
  bossesDestroyed: 0,
  fps: 60,
  dtMs: 16.6,
  alertMessage: '6-DOF READY: W/S Surge · A/D Strafe · R/F Heave · Q/E Roll · [B] 0/0 Bubble',
  alertTone: 'info',
  endReason: null,
};

export default function App() {
  const [snapshot, setSnapshot] = useState<HudSnapshot>(INITIAL_SNAPSHOT);
  const commandBusRef = useRef<SimCommandBus | null>(null);
  const radarCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const warpOverlayRef = useRef<HTMLDivElement | null>(null);

  const handleSnapshot = useCallback((next: HudSnapshot) => {
    setSnapshot(next);
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#030711]">
      <SimulationCanvas
        onSnapshot={handleSnapshot}
        commandBusRef={commandBusRef}
        radarCanvasRef={radarCanvasRef}
        warpOverlayRef={warpOverlayRef}
      />

      <div
        ref={warpOverlayRef}
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none z-10 hidden"
        style={{
          background:
            'radial-gradient(circle at center, transparent 42%, rgba(0, 243, 255, 0.18) 82%, rgba(188, 19, 254, 0.36) 100%)',
          boxShadow: 'inset 0 0 110px rgba(0, 243, 255, 0.4)',
        }}
      />

      {snapshot.phase === 'title' && (
        <TitleOverlay onStart={() => commandBusRef.current?.startGame()} />
      )}

      <HudOverlay
        snap={snapshot}
        commands={commandBusRef.current}
        radarCanvasRef={radarCanvasRef}
      />
    </main>
  );
}
