import React from 'react';

interface TitleOverlayProps {
  onStart: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({ onStart }) => {
  return (
    <div
      className="fixed inset-0 z-30 flex flex-col justify-between p-6 md:p-10 pointer-events-none"
      style={{
        background:
          'linear-gradient(90deg, rgba(3, 8, 20, 0.88) 0%, rgba(3, 8, 20, 0.72) 38%, rgba(3, 8, 20, 0.12) 72%, rgba(3, 8, 20, 0.04) 100%)',
      }}
    >
      <div className="max-w-xl my-auto pointer-events-auto">
        <div className="flex items-center gap-4 mb-5">
          <svg
            viewBox="0 0 64 64"
            className="w-14 h-14 shrink-0"
            aria-hidden="true"
          >
            <circle
              cx="32"
              cy="32"
              r="28"
              fill="rgba(6, 182, 212, 0.08)"
              stroke="#38bdf8"
              strokeWidth="1.5"
              strokeDasharray="6 3"
            />
            <ellipse
              cx="32"
              cy="32"
              rx="22"
              ry="10"
              transform="rotate(-24 32 32)"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.5"
            />
            <ellipse
              cx="32"
              cy="32"
              rx="22"
              ry="10"
              transform="rotate(24 32 32)"
              fill="none"
              stroke="#22d3ee"
              strokeWidth="1.5"
            />
            <circle cx="32" cy="32" r="5" fill="#22d3ee" />
            <circle cx="32" cy="32" r="2.2" fill="#ffffff" />
          </svg>
          <div>
            <p className="text-xs font-mono-tabular tracking-widest uppercase text-cyan-300 mb-1">
              6-DOF Relativistic Physics &amp; Cosmic Scale Lab
            </p>
            <h1
              className="font-display text-3xl md:text-5xl font-bold tracking-tight text-white leading-none"
              style={{ textWrap: 'balance' }}
            >
              Hacking the Light Barrier
            </h1>
          </div>
        </div>

        <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-6 max-w-lg">
          Pilot an escort vessel or 3.25 km mothership across five cosmic scales with true 6-DOF
          Newtonian inertia, dynamic Higgs mass-nullification, ADM spacetime contraction, and
          Morris-Thorne wormhole transits.
        </p>

        <div className="grid grid-cols-2 gap-3 mb-7 max-w-lg text-xs text-slate-300">
          <div className="hud-panel rounded-md px-3.5 py-2.5">
            <div className="text-cyan-300 font-semibold mb-0.5">Higgs Mass Nullification</div>
            <div className="font-mono-tabular text-slate-400">4.80×10⁶ kg → 0.00 kg (0.0G)</div>
          </div>
          <div className="hud-panel rounded-md px-3.5 py-2.5">
            <div className="text-amber-300 font-semibold mb-0.5">ADM Metric Contraction</div>
            <div className="font-mono-tabular text-slate-400">Local m/s + 365,000c Shift</div>
          </div>
          <div className="hud-panel rounded-md px-3.5 py-2.5">
            <div className="text-emerald-300 font-semibold mb-0.5">98% Quantum Phase-Shift</div>
            <div className="font-mono-tabular text-slate-400">2% Shear Graze · 0.05s Heal</div>
          </div>
          <div className="hud-panel rounded-md px-3.5 py-2.5">
            <div className="text-sky-300 font-semibold mb-0.5">5 Cosmic Environments</div>
            <div className="font-mono-tabular text-slate-400">Oort → Galaxy → Multiverse</div>
          </div>
        </div>

        <button
          type="button"
          data-start="true"
          onClick={onStart}
          className="font-display px-7 py-3.5 rounded-md bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-sm tracking-wider uppercase transition-colors cursor-pointer shadow-lg shadow-cyan-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
        >
          Launch Physics Engine
        </button>
      </div>

      <div className="text-xs font-mono-tabular text-slate-400 tracking-wide">
        W/S Surge · A/D Strafe · R/F Heave · Q/E Roll · Arrows Pitch/Yaw · B 0/0 Bubble · Space Fire · Enter Launch
      </div>
    </div>
  );
};
