import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  appendTelemetrySample,
  computeMetricDomain,
  getSampleValue,
  MAX_TELEMETRY_SAMPLES,
  TelemetryGraphMetric,
  TelemetrySample,
} from '../physics/telemetrySeries';
import { HudSnapshot } from '../physics/types';

interface TelemetryGraphPanelProps {
  snap: HudSnapshot;
}

const SVG_WIDTH = 280;
const SVG_HEIGHT = 86;
const MARGIN = { top: 8, right: 8, bottom: 14, left: 32 };
const INNER_W = SVG_WIDTH - MARGIN.left - MARGIN.right;
const INNER_H = SVG_HEIGHT - MARGIN.top - MARGIN.bottom;

export const TelemetryGraphPanel: React.FC<TelemetryGraphPanelProps> = ({ snap }) => {
  const [metric, setMetric] = useState<TelemetryGraphMetric>('gLoad');
  const [collapsed, setCollapsed] = useState(false);
  const [samples, setSamples] = useState<TelemetrySample[]>(() =>
    appendTelemetrySample([], snap, 0)
  );
  const seqRef = useRef(1);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Sync directly with the HUD update cycle while playing
  useEffect(() => {
    if (snap.phase !== 'playing') return;
    const seq = seqRef.current++;
    setSamples((prev) => appendTelemetrySample(prev, snap, seq, MAX_TELEMETRY_SAMPLES));
  }, [snap]);

  const latest = samples[samples.length - 1];
  const domainY = useMemo(() => computeMetricDomain(samples, metric), [samples, metric]);

  const peakVal = useMemo(() => {
    let maxV = 0;
    for (let i = 0; i < samples.length; i++) {
      const v = getSampleValue(samples[i], metric);
      if (v > maxV) maxV = v;
    }
    return maxV;
  }, [samples, metric]);

  // Render D3 scales, gridlines, area fill, curve path, and live marker
  useEffect(() => {
    if (collapsed || !svgRef.current || samples.length === 0) return;

    const svg = d3.select(svgRef.current);
    const xScale = d3
      .scaleLinear()
      .domain([0, Math.max(1, MAX_TELEMETRY_SAMPLES - 1)])
      .range([0, INNER_W]);

    const yScale = d3.scaleLinear().domain(domainY).range([INNER_H, 0]).nice();

    const offsetStart = MAX_TELEMETRY_SAMPLES - samples.length;
    const strokeColor = metric === 'gLoad' ? '#22d3ee' : '#f59e0b';
    const areaFillId = metric === 'gLoad' ? 'url(#grad-gload)' : 'url(#grad-mass)';

    // Y-axis ticks & gridlines
    const yAxisGen = d3
      .axisLeft(yScale)
      .ticks(3)
      .tickSize(-INNER_W)
      .tickFormat((d) =>
        metric === 'gLoad' ? `${Number(d).toFixed(1)}` : `${Math.round(Number(d))}%`
      );

    const axisGroup = svg.select<SVGGElement>('.y-axis');
    axisGroup.call(yAxisGen);
    axisGroup.select('.domain').remove();
    axisGroup
      .selectAll('.tick line')
      .attr('stroke', 'rgba(148, 163, 184, 0.16)')
      .attr('stroke-dasharray', '2,2');
    axisGroup
      .selectAll('.tick text')
      .attr('fill', '#94a3b8')
      .attr('font-size', '9px')
      .attr('font-family', 'JetBrains Mono, monospace');

    const lineGen = d3
      .line<TelemetrySample>()
      .x((_, i) => xScale(offsetStart + i))
      .y((d) => yScale(getSampleValue(d, metric)))
      .curve(d3.curveMonotoneX);

    const areaGen = d3
      .area<TelemetrySample>()
      .x((_, i) => xScale(offsetStart + i))
      .y0(INNER_H)
      .y1((d) => yScale(getSampleValue(d, metric)))
      .curve(d3.curveMonotoneX);

    svg
      .select<SVGPathElement>('.telemetry-area')
      .datum(samples)
      .attr('d', areaGen)
      .attr('fill', areaFillId);

    svg
      .select<SVGPathElement>('.telemetry-line')
      .datum(samples)
      .attr('d', lineGen)
      .attr('stroke', strokeColor);

    const lastIdx = offsetStart + samples.length - 1;
    const lastY = yScale(getSampleValue(samples[samples.length - 1], metric));
    svg
      .select<SVGCircleElement>('.telemetry-dot')
      .attr('cx', xScale(lastIdx))
      .attr('cy', lastY)
      .attr('fill', strokeColor);
  }, [samples, metric, domainY, collapsed]);

  const liveReadout =
    metric === 'gLoad'
      ? `${snap.gLoad.toFixed(2)} G`
      : snap.dispMassKg === 0
        ? '0.00 kg (0%)'
        : `${snap.dispMassKg.toExponential(2)} kg (${latest ? Math.round(latest.effectiveMassRatioPct) : 100}%)`;

  const peakReadout =
    metric === 'gLoad' ? `Peak ${peakVal.toFixed(2)} G` : `Peak ${Math.round(peakVal)}%`;

  return (
    <section
      aria-label="Real-Time Telemetry Graph"
      data-testid="d3-telemetry-panel"
      className="hud-panel rounded-md px-2.5 py-2 pointer-events-auto w-[300px]"
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1" role="group" aria-label="Graph Metric Selector">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              setMetric('gLoad');
            }}
            className={`px-2 py-0.5 rounded text-[10px] font-mono-tabular font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              metric === 'gLoad'
                ? 'bg-cyan-400 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-700 hover:border-cyan-400'
            }`}
          >
            G-Load
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              setMetric('effectiveMass');
            }}
            className={`px-2 py-0.5 rounded text-[10px] font-mono-tabular font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              metric === 'effectiveMass'
                ? 'bg-amber-400 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-700 hover:border-amber-400'
            }`}
          >
            Eff. Mass
          </button>
        </div>

        <button
          type="button"
          tabIndex={-1}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand Telemetry Graph' : 'Collapse Telemetry Graph'}
          onClick={(e) => {
            e.currentTarget.blur();
            setCollapsed((c) => !c);
          }}
          className="text-[10px] font-mono-tabular text-slate-400 hover:text-cyan-200 px-1 cursor-pointer"
        >
          {collapsed ? '▾ Open' : '▴ Hide'}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="flex items-baseline justify-between gap-2 mb-1 font-mono-tabular">
            <span
              data-testid="d3-live-value"
              className={`text-xs font-bold ${
                metric === 'gLoad' ? 'text-cyan-300' : 'text-amber-300'
              }`}
            >
              {liveReadout}
            </span>
            <span className="text-[10px] text-slate-400">{peakReadout} · 6s Window</span>
          </div>

          <svg
            ref={svgRef}
            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            className="w-full h-[86px] block overflow-visible"
            role="img"
            aria-label={
              metric === 'gLoad'
                ? 'Real-time G-Load line chart'
                : 'Real-time Effective Mass coupling chart'
            }
          >
            <defs>
              <linearGradient id="grad-gload" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id="grad-mass" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
              <g className="y-axis" />
              <path className="telemetry-area" />
              <path
                className="telemetry-line"
                fill="none"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle className="telemetry-dot" r="2.8" stroke="#030711" strokeWidth="1" />
              <text
                x={INNER_W}
                y={INNER_H + 11}
                textAnchor="end"
                fill="#64748b"
                fontSize="8.5"
                fontFamily="JetBrains Mono, monospace"
              >
                NOW (10 Hz)
              </text>
            </g>
          </svg>
        </>
      )}
    </section>
  );
};
