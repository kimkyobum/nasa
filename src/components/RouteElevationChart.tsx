import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { RoutePoint, RouteResult } from '../types/mars';

interface RouteElevationChartProps {
  route: RouteResult;
  onHoverRoutePoint?: (pt: RoutePoint | null) => void;
  onClose?: () => void;
}

export const RouteElevationChart: React.FC<RouteElevationChartProps> = ({
  route,
  onHoverRoutePoint,
  onClose,
}) => {
  const { pick } = useLanguage();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!route.found || route.points.length < 2) {
    return (
      <div className="relative h-[144px] bg-slate-900/42 backdrop-blur-xl border border-white/25 rounded-xl p-4 flex items-center justify-center text-xs text-slate-100 shadow-2xl">
        <span>{pick(route.summaryEn, route.summaryKo)}</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={pick('Close profile chart', '단면 그래프 닫기')}
            className="absolute top-2.5 right-2.5 p-1 text-slate-200 hover:text-white rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  const pts = route.points;
  const W = 720;
  const H = 108;
  const padL = 44;
  const padR = 40;
  const padT = 10;
  const padB = 20;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const minElev = Math.min(...pts.map((p) => p.elevationM));
  const maxElev = Math.max(...pts.map((p) => p.elevationM));
  const elevSpan = Math.max(500, maxElev - minElev);
  const maxDist = Math.max(1, route.totalDistanceKm);

  const toX = (dist: number) => padL + (dist / maxDist) * plotW;
  const toY_Elev = (elev: number) =>
    padT + plotH - ((elev - minElev) / elevSpan) * plotH;
  const toY_Water = (prob: number) => padT + plotH - (prob / 100) * plotH;

  const elevPath = pts
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${toX(p.distanceFromStartKm).toFixed(1)} ${toY_Elev(
          p.elevationM
        ).toFixed(1)}`
    )
    .join(' ');

  const elevArea = `${elevPath} L ${toX(
    pts[pts.length - 1].distanceFromStartKm
  ).toFixed(1)} ${padT + plotH} L ${toX(0).toFixed(1)} ${padT + plotH} Z`;

  const waterPath = pts
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${toX(p.distanceFromStartKm).toFixed(1)} ${toY_Water(
          p.waterProb
        ).toFixed(1)}`
    )
    .join(' ');

  const hoveredPoint: RoutePoint | null =
    hoverIdx !== null ? pts[hoverIdx] ?? null : null;

  return (
    <div className="bg-slate-900/42 backdrop-blur-xl border border-white/25 rounded-xl px-3 py-2.5 shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2.5 text-[11px]">
          <span className="font-semibold text-white">
            {pick('Elevation · Water Profile', '고도 · 지하수 단면')}
          </span>
          <span className="flex items-center gap-1 text-amber-300">
            <span className="w-2.5 h-0.5 bg-amber-400 inline-block" />
            {pick('Elev (m)', '고도(m)')}
          </span>
          <span className="flex items-center gap-1 text-cyan-300">
            <span className="w-2.5 h-0.5 border-b border-dashed border-cyan-400 inline-block" />
            {pick('Water (%)', '지하수(%)')}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {hoveredPoint ? (
            <div className="text-[11px] font-mono text-slate-100 flex items-center gap-2.5 tabular-nums">
              <span>{hoveredPoint.distanceFromStartKm}km</span>
              <span className="text-amber-300">
                {hoveredPoint.elevationM.toLocaleString()}m
              </span>
              <span className="text-cyan-300">
                {pick('Water', '물')} {hoveredPoint.waterProb}%
              </span>
              <span
                className={
                  hoveredPoint.hazardLevel === 'high'
                    ? 'text-rose-300'
                    : hoveredPoint.hazardLevel === 'moderate'
                      ? 'text-amber-300'
                      : 'text-emerald-300'
                }
              >
                {hoveredPoint.slopeDeg}°
              </span>
            </div>
          ) : (
            <div className="text-[11px] font-mono text-slate-300 tabular-nums">
              {route.totalDistanceKm}km · {pick('Rover', '로버')} {route.estimatedHoursRover}h
            </div>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={pick('Close profile chart', '단면 그래프 닫기')}
              className="p-0.5 text-slate-200 hover:text-white rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-[108px] overflow-visible"
        onMouseLeave={() => {
          setHoverIdx(null);
          onHoverRoutePoint?.(null);
        }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * W;
          const distRatio = Math.max(0, Math.min(1, (relX - padL) / plotW));
          const targetDist = distRatio * maxDist;
          let closest = 0;
          let bestDiff = Infinity;
          for (let i = 0; i < pts.length; i++) {
            const d = Math.abs(pts[i].distanceFromStartKm - targetDist);
            if (d < bestDiff) {
              bestDiff = d;
              closest = i;
            }
          }
          setHoverIdx(closest);
          onHoverRoutePoint?.(pts[closest] ?? null);
        }}
      >
        <defs>
          <linearGradient id="elevFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {[0, 0.5, 1].map((t) => {
          const y = padT + plotH * t;
          const eVal = Math.round(maxElev - t * elevSpan);
          const wVal = Math.round((1 - t) * 100);
          return (
            <g key={t}>
              <line
                x1={padL}
                y1={y}
                x2={W - padR}
                y2={y}
                stroke="#1E293B"
                strokeWidth="1"
              />
              <text
                x={padL - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-slate-500 text-[9px] font-mono"
              >
                {eVal}
              </text>
              <text
                x={W - padR + 6}
                y={y + 3}
                textAnchor="start"
                className="fill-cyan-500/70 text-[9px] font-mono"
              >
                {wVal}%
              </text>
            </g>
          );
        })}

        {/* Elevation Area & Line */}
        <path d={elevArea} fill="url(#elevFill)" />
        <path
          d={elevPath}
          fill="none"
          stroke="#F59E0B"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />

        {/* Water Probability Dashed Line */}
        <path
          d={waterPath}
          fill="none"
          stroke="#06B6D4"
          strokeWidth="1.6"
          strokeDasharray="4 3"
          strokeLinejoin="round"
        />

        {/* Hazard dots on high-slope points */}
        {pts.map((p, idx) =>
          p.hazardLevel === 'high' ? (
            <circle
              key={idx}
              cx={toX(p.distanceFromStartKm)}
              cy={toY_Elev(p.elevationM)}
              r="2.8"
              fill="#F43F5E"
            />
          ) : null
        )}

        {/* Distance X-axis ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const x = padL + plotW * t;
          return (
            <text
              key={t}
              x={x}
              y={H - 3}
              textAnchor="middle"
              className="fill-slate-500 text-[9px] font-mono"
            >
              {(maxDist * t).toFixed(0)} km
            </text>
          );
        })}

        {/* Hover Crosshair */}
        {hoveredPoint && (
          <g>
            <line
              x1={toX(hoveredPoint.distanceFromStartKm)}
              y1={padT}
              x2={toX(hoveredPoint.distanceFromStartKm)}
              y2={padT + plotH}
              stroke="#94A3B8"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <circle
              cx={toX(hoveredPoint.distanceFromStartKm)}
              cy={toY_Elev(hoveredPoint.elevationM)}
              r="3.5"
              fill="#F59E0B"
              stroke="#07090E"
              strokeWidth="1.5"
            />
            <circle
              cx={toX(hoveredPoint.distanceFromStartKm)}
              cy={toY_Water(hoveredPoint.waterProb)}
              r="3.5"
              fill="#06B6D4"
              stroke="#07090E"
              strokeWidth="1.5"
            />
          </g>
        )}
      </svg>
    </div>
  );
};
