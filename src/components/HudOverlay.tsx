import React, { useEffect, useState } from 'react';
import {
  CAPACITOR_MAX_EJ,
  COSMIC_ZONES,
  HudSnapshot,
  PORTAL_THROAT_RADIUS_M,
  SimCommandBus,
} from '../physics/types';
import { audioEngine } from '../scene/audio';
import { TelemetryGraphPanel } from './TelemetryGraphPanel';
import { TouchJoystick } from './TouchJoystick';

interface HudOverlayProps {
  snap: HudSnapshot;
  commands: SimCommandBus | null;
  radarCanvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export const HudOverlay: React.FC<HudOverlayProps> = ({
  snap,
  commands,
  radarCanvasRef,
}) => {
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [showEquations, setShowEquations] = useState(false);
  const [showTouchPads, setShowTouchPads] = useState(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const isCoarse =
      typeof window !== 'undefined' &&
      (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 860);
    if (isCoarse) setShowTouchPads(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (snap.phase !== 'playing') return;
      if (e.key.toLowerCase() === 'l') setShowEquations((v) => !v);
      if (e.key === 'Tab') {
        e.preventDefault();
        setDockCollapsed((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [snap.phase]);

  if (snap.phase === 'title') return null;

  const blurAndRun = (e: React.MouseEvent<HTMLButtonElement>, fn?: () => void) => {
    e.currentTarget.blur();
    fn?.();
  };

  const toggleMute = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    const next = !muted;
    setMuted(next);
    audioEngine.setMuted(next);
  };

  const alertColors: Record<HudSnapshot['alertTone'], string> = {
    info: 'text-amber-300 border-amber-400/35',
    success: 'text-emerald-300 border-emerald-400/40',
    warn: 'text-amber-300 border-amber-400/40',
    crit: 'text-rose-300 border-rose-500/50',
  };

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-2.5 md:p-3">
      {/* TOP PERIMETER CLUSTERS */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        {/* TOP-LEFT: Cosmic Zone Selector + Equations Toggle */}
        <div className="flex flex-col gap-1.5 max-w-full">
          <div className="hud-panel rounded-md px-3 py-2 pointer-events-auto">
            <div className="flex items-center justify-between gap-4 mb-1.5">
              <span className="font-display text-xs font-bold tracking-wider uppercase text-white">
                FTL 6-DOF Physics Lab
              </span>
              <span className="text-[11px] font-mono-tabular text-cyan-300 hidden sm:inline">
                {snap.zoneName}
              </span>
            </div>
            <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Cosmic Zone Switcher">
              {COSMIC_ZONES.map((z) => {
                const active = snap.systemIdx === z.id;
                return (
                  <button
                    key={z.id}
                    type="button"
                    onClick={(e) => blurAndRun(e, () => commands?.setCosmicZone(z.id))}
                    className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      active
                        ? 'bg-cyan-400 text-slate-950 font-semibold'
                        : 'bg-slate-900/90 text-cyan-200 border border-cyan-500/30 hover:border-cyan-400'
                    }`}
                  >
                    [{z.id + 1}] {z.hindiLabel} · {z.shortLabel}
                  </button>
                );
              })}
              <button
                type="button"
                aria-expanded={showEquations}
                onClick={(e) => blurAndRun(e, () => setShowEquations((v) => !v))}
                className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  showEquations
                    ? 'bg-amber-400 text-slate-950 font-semibold'
                    : 'bg-slate-900/90 text-amber-200 border border-amber-500/30 hover:border-amber-400'
                }`}
              >
                [L] Equations
              </button>
            </div>
          </div>

          {showEquations && (
            <div className="hud-panel-amber rounded-md px-3 py-2.5 max-w-sm pointer-events-auto text-[11px] leading-snug">
              <div className="font-display text-xs font-semibold uppercase text-amber-300 mb-1.5">
                Live Audited Physics Equations
              </div>
              <div className="space-y-1.5 font-mono-tabular">
                <div className="border-b border-slate-700/60 pb-1">
                  <div className="text-slate-300">1. Dynamic Mass: a = F_rcs / m₀,eff(ϕ)</div>
                  <div className="text-cyan-300">
                    m_eff = {snap.dispMassKg === 0 ? '0.00 kg' : `${snap.dispMassKg.toExponential(2)} kg`} · a_max ={' '}
                    {snap.maxAccelMS2.toFixed(0)} m/s²
                  </div>
                </div>
                <div className="border-b border-slate-700/60 pb-1">
                  <div className="text-slate-300">2. ADM Contraction: v_eff = v_loc · Λ_ADM(θ)</div>
                  <div className="text-cyan-300">
                    Λ_ADM = {snap.admContractionFactor.toFixed(1)}x · v_eff ={' '}
                    {snap.metricSpeedC >= 10 ? Math.round(snap.metricSpeedC).toLocaleString() : snap.metricSpeedC.toFixed(4)} c
                  </div>
                </div>
                <div className="border-b border-slate-700/60 pb-1">
                  <div className="text-slate-300">
                    3. Morris-Thorne: z(r) = ±b₀ ln(r/b₀ + √((r/b₀)²-1))
                  </div>
                  <div className="text-cyan-300">
                    b(r₀) = {PORTAL_THROAT_RADIUS_M}m · Cooldown:{' '}
                    {snap.portalJumpCooldownSec > 0 ? `${snap.portalJumpCooldownSec.toFixed(1)}s` : 'Ready'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-300">4. 98% Phase-Shift + 0.05s Tier-4 Nano-Armor</div>
                  <div className="text-emerald-300">
                    Tunneled: {snap.tunneledCount} · 2% Grazes: {snap.shearGrazeCount}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* TOP-RIGHT: Tabular Telemetry + Tactical Radar + Utility Buttons + D3 Live Graph */}
        <div className="flex flex-col items-end gap-2 ml-auto">
          <div className="flex items-start gap-2">
          <div className="hud-panel rounded-md px-3 py-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[11px] font-mono-tabular min-w-[275px]">
            <span className="text-slate-400">Eff. Mass:</span>
            <span className={snap.dispMassKg === 0 ? 'text-emerald-300 font-semibold' : 'text-amber-300 font-semibold'}>
              {snap.dispMassKg === 0 ? '0.00 kg (0/0)' : `${snap.dispMassKg.toExponential(2)} kg`}
            </span>

            <span className="text-slate-400">Local Speed:</span>
            <span className="text-cyan-300 font-semibold">
              {snap.localSpeedMS.toFixed(1)} m/s ({snap.gLoad.toFixed(2)}G)
            </span>

            <span className="text-slate-400">ADM Metric:</span>
            <span className="text-cyan-300 font-semibold">
              {snap.spacePuller
                ? `${Math.round(snap.metricSpeedC).toLocaleString()} c`
                : `${snap.metricSpeedC.toFixed(4)} c`}
            </span>

            <span className="text-slate-400">Defense / Nano:</span>
            <span className="text-emerald-300 font-semibold whitespace-nowrap">
              {snap.nanoStatus}
            </span>

            <span className="text-slate-400">Perf / Loop:</span>
            <span className="text-slate-200">
              {snap.fps} FPS · {snap.dtMs.toFixed(1)}ms
            </span>
          </div>

          <div className="hud-panel rounded-md p-1.5 hidden sm:flex flex-col items-center">
            <span className="text-[9px] font-mono-tabular uppercase tracking-wider text-cyan-300 mb-1">
              Radar
            </span>
            <canvas
              ref={radarCanvasRef}
              width={104}
              height={104}
              className="w-[104px] h-[104px] rounded-full border border-cyan-400/70 bg-slate-950/90"
            />
          </div>

          {/* Utility Controls */}
          <div className="flex flex-col gap-1 pointer-events-auto">
            <button
              type="button"
              tabIndex={-1}
              aria-label="Pause Simulation"
              title="Pause [P / Esc]"
              onClick={(e) => blurAndRun(e, () => commands?.togglePause())}
              className="hud-panel w-8 h-8 rounded flex items-center justify-center text-cyan-200 hover:bg-cyan-400 hover:text-slate-950 cursor-pointer transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
              title={muted ? 'Unmute Audio' : 'Mute Audio'}
              onClick={toggleMute}
              className="hud-panel w-8 h-8 rounded flex items-center justify-center text-cyan-200 hover:bg-cyan-400 hover:text-slate-950 cursor-pointer transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" aria-hidden="true">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                {muted ? (
                  <path d="M22 9l-6 6M16 9l6 6" />
                ) : (
                  <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />
                )}
              </svg>
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Toggle Touch Joysticks"
              title="Toggle Touch Joysticks"
              onClick={(e) => blurAndRun(e, () => setShowTouchPads((v) => !v))}
              className={`hud-panel w-8 h-8 rounded flex items-center justify-center cursor-pointer transition-colors ${
                showTouchPads ? 'bg-cyan-400 text-slate-950' : 'text-cyan-200 hover:bg-cyan-400 hover:text-slate-950'
              }`}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="3" fill="currentColor" />
              </svg>
            </button>
          </div>
          </div>

          <TelemetryGraphPanel snap={snap} />
        </div>
      </div>

      {/* EXACT (0, 0) CENTER RETICLE */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Toggle Mouse Flight Aim"
          title="Click to Toggle Mouse Flight Aim"
          onClick={(e) => blurAndRun(e, () => commands?.toggleMouseSteer())}
          className={`pointer-events-auto w-14 h-14 rounded-full border border-dashed flex items-center justify-center cursor-crosshair transition-colors ${
            snap.mouseSteer ? 'border-emerald-400' : 'border-cyan-400/60'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-300" />
        </button>
      </div>

      {/* TOP-CENTER NON-BLOCKING STATUS / COUNTDOWN RIBBON */}
      <div className="fixed top-[146px] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none z-20">
        {snap.armadaSyncing && snap.armadaStageLabel && (
          <div className="px-3 py-1 rounded bg-slate-950/90 border border-cyan-400/45 text-xs font-mono-tabular font-semibold text-emerald-300 whitespace-nowrap">
            {snap.armadaStageLabel}
          </div>
        )}

        <div
          className={`px-3 py-1 rounded bg-slate-950/85 border text-[11px] font-mono-tabular font-medium text-center whitespace-nowrap max-w-[92vw] truncate ${
            alertColors[snap.alertTone]
          }`}
        >
          {snap.alertMessage}
        </div>
      </div>

      {/* TOUCH JOYSTICKS + VERTICAL HEAVE PAD (MOBILE OR TOGGLED) */}
      {showTouchPads && (
        <div className="fixed inset-x-4 bottom-36 flex items-end justify-between pointer-events-none z-25">
          <div className="flex items-center gap-3">
            <TouchJoystick
              label="Surge / Strafe"
              onMove={(x, y) => commands?.setJoystick('left', x, y)}
            />
            <div className="flex flex-col gap-1.5 pointer-events-auto">
              <button
                type="button"
                onMouseDown={() => commands?.setVirtualKey('r', true)}
                onMouseUp={() => commands?.setVirtualKey('r', false)}
                onTouchStart={(e) => {
                  e.preventDefault();
                  commands?.setVirtualKey('r', true);
                }}
                onTouchEnd={() => commands?.setVirtualKey('r', false)}
                className="hud-panel px-2.5 py-2 rounded text-[10px] font-mono-tabular font-semibold text-cyan-200 active:bg-cyan-400 active:text-slate-950 cursor-pointer"
              >
                ▲ UP [R]
              </button>
              <button
                type="button"
                onMouseDown={() => commands?.setVirtualKey('f', true)}
                onMouseUp={() => commands?.setVirtualKey('f', false)}
                onTouchStart={(e) => {
                  e.preventDefault();
                  commands?.setVirtualKey('f', true);
                }}
                onTouchEnd={() => commands?.setVirtualKey('f', false)}
                className="hud-panel px-2.5 py-2 rounded text-[10px] font-mono-tabular font-semibold text-cyan-200 active:bg-cyan-400 active:text-slate-950 cursor-pointer"
              >
                ▼ DN [F]
              </button>
            </div>
          </div>
          <TouchJoystick
            label="Pitch / Yaw"
            onMove={(x, y) => commands?.setJoystick('right', x, y)}
          />
        </div>
      )}

      {/* COLLAPSIBLE BOTTOM TELEMETRY & CONTROL DOCK */}
      <div className="flex flex-col items-end w-full mt-auto">
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => blurAndRun(e, () => setDockCollapsed((v) => !v))}
          className="pointer-events-auto mb-1 px-3 py-0.5 rounded-t bg-slate-900/90 border border-b-0 border-cyan-500/35 text-[10px] font-mono-tabular uppercase tracking-wider text-cyan-200 hover:text-white cursor-pointer"
        >
          {dockCollapsed ? '▴ Show Controls [Tab]' : '▾ Hide Controls [Tab]'}
        </button>

        {!dockCollapsed && (
          <div className="w-full flex flex-col lg:flex-row items-stretch lg:items-end justify-between gap-2">
            {/* Left Vital Bars */}
            <div className="hud-panel rounded-md px-3 py-2 w-full lg:w-80 shrink-0 space-y-1.5 text-[10px] font-mono-tabular">
              <MeterBar
                label="Backup Plasma Capacitor"
                valueText={`${Math.round(snap.capacitorEJ)} / ${CAPACITOR_MAX_EJ} EJ`}
                pct={(snap.capacitorEJ / CAPACITOR_MAX_EJ) * 100}
                fillClass="bg-cyan-400"
              />
              <MeterBar
                label="Portal 450 PW Casimir Conduits"
                valueText={`${Math.round(snap.conduitIntegrity)}%`}
                pct={snap.conduitIntegrity}
                fillClass="bg-sky-400"
              />
              <MeterBar
                label="Hostile Dreadnought Hull"
                valueText={`${Math.round(snap.bossHull)}%`}
                pct={snap.bossHull}
                fillClass="bg-rose-500"
              />
              <MeterBar
                label="Schwarzschild Tension Limit [G]"
                valueText={`${Math.round(snap.schStability)}%`}
                pct={snap.schStability}
                fillClass="bg-amber-400"
              />
              <MeterBar
                label="Tier-4 Nanolattice Hull (0.05s)"
                valueText={`${Math.round(snap.hullIntegrity)}%`}
                pct={snap.hullIntegrity}
                fillClass="bg-emerald-400"
              />
            </div>

            {/* Right Interactive Control Matrix */}
            <div className="hud-panel rounded-md p-2 pointer-events-auto flex flex-wrap gap-1.5 justify-start lg:justify-end max-w-3xl">
              <ControlButton
                label="[B] 0/0 Bubble"
                active={snap.bubbleActive}
                onClick={(e) => blurAndRun(e, () => commands?.toggleBubble())}
              />
              <ControlButton
                label="[O] Inject Orbit"
                onClick={(e) => blurAndRun(e, () => commands?.injectStableOrbit())}
              />
              <ControlButton
                label="[I] RCS Dampers"
                active={snap.inertialDampers}
                onClick={(e) => blurAndRun(e, () => commands?.toggleDampers())}
              />
              <ControlButton
                label="[SHIFT] Space Puller"
                active={snap.spacePuller}
                onClick={(e) => blurAndRun(e, () => commands?.toggleWarp())}
              />
              <ControlButton
                label="[Z] 98% Phase-Shift"
                active={snap.phaseShift}
                onClick={(e) => blurAndRun(e, () => commands?.togglePhase())}
              />
              <ControlButton
                label="[SPACE] 1.85 PW"
                onClick={(e) => blurAndRun(e, () => commands?.firePlayerLaser())}
              />
              <ControlButton
                label="[V] 450 TJ Plasma"
                onClick={(e) => blurAndRun(e, () => commands?.firePlayerPlasma())}
              />
              <ControlButton
                label="[G] 899 EW Shunt"
                onClick={(e) => blurAndRun(e, () => commands?.shuntPortalMass())}
              />
              <ControlButton
                label="[Y] Squadron"
                active={snap.wingmenActive}
                onClick={(e) => blurAndRun(e, () => commands?.toggleWingmen())}
              />
              <ControlButton
                label="[C] Mothership"
                active={snap.mothershipControl}
                onClick={(e) => blurAndRun(e, () => commands?.toggleMothershipMode())}
              />
              <ControlButton
                label="[H] Metric Grid"
                active={snap.showMetricGrid}
                onClick={(e) => blurAndRun(e, () => commands?.toggleMetricGrid())}
              />
              <ControlButton
                label="[M] 120.0s Jump"
                active={snap.armadaSyncing}
                onClick={(e) => blurAndRun(e, () => commands?.triggerArmadaJump())}
              />
              <ControlButton
                label={snap.fastCountdown ? '[X] 10x Timer: ON' : '[X] 10x Timer: OFF'}
                active={snap.fastCountdown}
                onClick={(e) => blurAndRun(e, () => commands?.toggleCountdownSpeed())}
              />
              <button
                type="button"
                onMouseDown={() => commands?.setVirtualKey('r', true)}
                onMouseUp={() => commands?.setVirtualKey('r', false)}
                onMouseLeave={() => commands?.setVirtualKey('r', false)}
                className="px-2 py-1 rounded text-[10px] font-mono-tabular font-semibold uppercase bg-slate-900/90 text-cyan-200 border border-cyan-500/35 hover:border-cyan-300 active:bg-cyan-400 active:text-slate-950 whitespace-nowrap shrink-0 cursor-pointer"
              >
                ▲ UP [R]
              </button>
              <button
                type="button"
                onMouseDown={() => commands?.setVirtualKey('f', true)}
                onMouseUp={() => commands?.setVirtualKey('f', false)}
                onMouseLeave={() => commands?.setVirtualKey('f', false)}
                className="px-2 py-1 rounded text-[10px] font-mono-tabular font-semibold uppercase bg-slate-900/90 text-cyan-200 border border-cyan-500/35 hover:border-cyan-300 active:bg-cyan-400 active:text-slate-950 whitespace-nowrap shrink-0 cursor-pointer"
              >
                ▼ DN [F]
              </button>
            </div>
          </div>
        )}
      </div>

      {/* PAUSE MODAL */}
      {snap.phase === 'paused' && (
        <div className="fixed inset-0 z-40 bg-slate-950/75 flex items-center justify-center p-4 pointer-events-auto">
          <div className="hud-panel rounded-lg p-6 w-full max-w-md text-center">
            <h2 className="font-display text-2xl font-bold text-white mb-1">Simulation Paused</h2>
            <p className="text-xs font-mono-tabular text-slate-400 mb-5">
              6-DOF kinematics and physics integration frozen.
            </p>
            <div className="grid grid-cols-3 gap-2 mb-6 text-xs font-mono-tabular">
              <div className="bg-slate-900/90 border border-slate-700/70 rounded p-2.5">
                <div className="text-slate-400 text-[10px]">Transits</div>
                <div className="text-cyan-300 text-base font-bold">{snap.portalTransits}</div>
              </div>
              <div className="bg-slate-900/90 border border-slate-700/70 rounded p-2.5">
                <div className="text-slate-400 text-[10px]">Cruisers</div>
                <div className="text-emerald-300 text-base font-bold">{snap.enemiesDestroyed}</div>
              </div>
              <div className="bg-slate-900/90 border border-slate-700/70 rounded p-2.5">
                <div className="text-slate-400 text-[10px]">Harvested</div>
                <div className="text-amber-300 text-base font-bold">{snap.totalHarvestedEJ} EJ</div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => commands?.togglePause()}
                className="w-full py-2.5 rounded bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold text-sm cursor-pointer"
              >
                Resume Simulation
              </button>
              <button
                type="button"
                onClick={() => commands?.restartGame()}
                className="w-full py-2.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-sm cursor-pointer"
              >
                Restart Sector
              </button>
              <button
                type="button"
                onClick={() => commands?.returnToTitle()}
                className="w-full py-2 rounded text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                Return to Title
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GAME OVER MODAL */}
      {snap.phase === 'gameover' && (
        <div className="fixed inset-0 z-40 bg-slate-950/80 flex items-center justify-center p-4 pointer-events-auto">
          <div className="hud-panel rounded-lg p-6 w-full max-w-md text-center border-rose-500/40">
            <h2 className="font-display text-2xl font-bold text-rose-400 mb-1">
              Hull Integrity Lost
            </h2>
            <p className="text-xs font-mono-tabular text-slate-300 mb-5">
              Tier-4 nanolattice overwhelmed before re-bonding completed.
            </p>
            <div className="grid grid-cols-3 gap-2 mb-6 text-xs font-mono-tabular">
              <div className="bg-slate-900/90 border border-slate-700/70 rounded p-2.5">
                <div className="text-slate-400 text-[10px]">Transits</div>
                <div className="text-cyan-300 text-base font-bold">{snap.portalTransits}</div>
              </div>
              <div className="bg-slate-900/90 border border-slate-700/70 rounded p-2.5">
                <div className="text-slate-400 text-[10px]">Cruisers</div>
                <div className="text-emerald-300 text-base font-bold">{snap.enemiesDestroyed}</div>
              </div>
              <div className="bg-slate-900/90 border border-slate-700/70 rounded p-2.5">
                <div className="text-slate-400 text-[10px]">Dreadnoughts</div>
                <div className="text-amber-300 text-base font-bold">{snap.bossesDestroyed}</div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                data-start="true"
                onClick={() => commands?.restartGame()}
                className="w-full py-2.5 rounded bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold text-sm cursor-pointer"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={() => commands?.returnToTitle()}
                className="w-full py-2 rounded text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                Return to Title
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface MeterBarProps {
  label: string;
  valueText: string;
  pct: number;
  fillClass: string;
}

const MeterBar: React.FC<MeterBarProps> = ({ label, valueText, pct, fillClass }) => {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div>
      <div className="flex justify-between gap-2 mb-0.5">
        <span className="text-slate-300 truncate">{label}</span>
        <span className="text-cyan-200 font-semibold shrink-0">{valueText}</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full ${fillClass} transition-[width] duration-75`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
};

interface ControlButtonProps {
  label: string;
  active?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

const ControlButton: React.FC<ControlButtonProps> = ({ label, active = false, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1 rounded text-[10px] font-mono-tabular font-semibold uppercase whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
        active
          ? 'bg-cyan-400 text-slate-950 border border-cyan-300'
          : 'bg-slate-900/90 text-slate-200 border border-cyan-500/35 hover:border-cyan-300'
      }`}
    >
      {label}
    </button>
  );
};
