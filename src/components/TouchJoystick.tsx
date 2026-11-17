import React, { useRef, useState } from 'react';

interface TouchJoystickProps {
  label: string;
  onMove: (x: number, y: number) => void;
}

export const TouchJoystick: React.FC<TouchJoystickProps> = ({ label, onMove }) => {
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const activeTouchId = useRef<number | null>(null);
  const draggingMouse = useRef(false);

  const updateStick = (clientX: number, clientY: number) => {
    const zone = zoneRef.current;
    if (!zone) return;
    const rect = zone.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = rect.width / 2 - 16;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR && dist > 0) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    setKnobOffset({ x: dx, y: dy });
    onMove(dx / maxR, -dy / maxR);
  };

  const resetStick = () => {
    setKnobOffset({ x: 0, y: 0 });
    onMove(0, 0);
  };

  return (
    <div
      ref={zoneRef}
      onTouchStart={(e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        activeTouchId.current = t.identifier;
        updateStick(t.clientX, t.clientY);
      }}
      onTouchMove={(e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === activeTouchId.current) {
            updateStick(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
          }
        }
      }}
      onTouchEnd={(e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === activeTouchId.current) {
            activeTouchId.current = null;
            resetStick();
          }
        }
      }}
      onMouseDown={(e) => {
        draggingMouse.current = true;
        updateStick(e.clientX, e.clientY);
        const handleMove = (ev: MouseEvent) => {
          if (draggingMouse.current) updateStick(ev.clientX, ev.clientY);
        };
        const handleUp = () => {
          draggingMouse.current = false;
          resetStick();
          window.removeEventListener('mousemove', handleMove);
          window.removeEventListener('mouseup', handleUp);
        };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
      }}
      className="relative w-24 h-24 rounded-full border border-cyan-400/50 bg-slate-950/70 flex items-center justify-center pointer-events-auto touch-none cursor-grab"
      aria-label={label}
    >
      <div
        className="w-9 h-9 rounded-full bg-cyan-400 border border-white shadow-md shadow-cyan-500/40 pointer-events-none"
        style={{ transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)` }}
      />
      <span className="absolute -bottom-5 text-[10px] font-mono-tabular uppercase tracking-wider text-cyan-200 whitespace-nowrap">
        {label}
      </span>
    </div>
  );
};
