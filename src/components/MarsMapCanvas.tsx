import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Compass } from 'lucide-react';
import {
  MARS_LANDMARKS,
  normalizeLon,
  sampleMarsTelemetry,
} from '../data/marsData';
import {
  ClickTool,
  Landmark,
  LandmarkType,
  MarsBaseLayerId,
  MarsTelemetryPoint,
  RouteResult,
  SensorLayers,
} from '../types/mars';

interface MarsMapCanvasProps {
  baseLayer: MarsBaseLayerId;
  centerLat: number;
  centerLon: number;
  ppd: number;
  onViewportChange: (lat: number, lon: number, ppd: number) => void;
  layers: SensorLayers;
  minWaterThreshold: number;
  maxSlopeThreshold: number;
  startCoord: { lat: number; lon: number };
  destCoord: { lat: number; lon: number };
  route: RouteResult;
  clickTool: ClickTool;
  arVisorMode: boolean;
  selectedPoint: MarsTelemetryPoint | null;
  selectedLandmark: Landmark | null;
  landmarkTypeFilter: LandmarkType | 'all';
  onHoverPoint: (pt: MarsTelemetryPoint | null) => void;
  onMapClick: (pt: MarsTelemetryPoint) => void;
  onSelectLandmark: (lm: Landmark | null) => void;
}

const LAYER_PATHS: Record<'viking' | 'mola', string> = {
  viking: 'Mars_Viking_MDIM21_ClrMosaic_global_232m',
  mola: 'Mars_MGS_MOLA_ClrShade_merge_global_463m',
};

type CachedTile =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; img: HTMLImageElement };

const tileCache = new Map<string, CachedTile>();

// Deterministic starfield points for deep-space frame outside Mars bounds
const STARS = Array.from({ length: 140 }, (_, i) => {
  const s1 = Math.sin(i * 127.1) * 43758.5453;
  const s2 = Math.sin(i * 269.5) * 43758.5453;
  const s3 = Math.sin(i * 419.2) * 43758.5453;
  return {
    x: s1 - Math.floor(s1),
    y: s2 - Math.floor(s2),
    a: 0.15 + (s3 - Math.floor(s3)) * 0.45,
    r: i % 7 === 0 ? 1.3 : 0.8,
  };
});

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function computeBearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  let dLon = lon2 - lon1;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  const dLat = lat2 - lat1;
  const rad = Math.atan2(dLon, dLat);
  return Math.round(((rad * 180) / Math.PI + 360) % 360);
}

export const MarsMapCanvas: React.FC<MarsMapCanvasProps> = ({
  baseLayer,
  centerLat,
  centerLon,
  ppd,
  onViewportChange,
  layers,
  minWaterThreshold,
  maxSlopeThreshold,
  startCoord,
  destCoord,
  route,
  clickTool,
  arVisorMode,
  selectedPoint,
  selectedLandmark,
  landmarkTypeFilter,
  onHoverPoint,
  onMapClick,
  onSelectLandmark,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [canvasSize, setCanvasSize] = useState({ width: 1280, height: 760 });
  const [tileTick, setTileTick] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const dragRef = useRef<{
    x: number;
    y: number;
    startLat: number;
    startLon: number;
  } | null>(null);
  const didDragRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(360, Math.floor(entry.contentRect.width));
        const h = Math.max(320, Math.floor(entry.contentRect.height));
        setCanvasSize({ width: w, height: h });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const requestTile = useCallback(
    (layerKey: 'viking' | 'mola', z: number, y: number, x: number): CachedTile => {
      const key = `${layerKey}/${z}/${y}/${x}`;
      const existing = tileCache.get(key);
      if (existing) return existing;

      const entry: CachedTile = { status: 'loading' };
      tileCache.set(key, entry);

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        tileCache.set(key, { status: 'ready', img });
        setTileTick((t) => (t + 1) % 100000);
      };
      img.onerror = () => {
        tileCache.set(key, { status: 'error' });
      };
      img.src = `https://trek.nasa.gov/tiles/Mars/EQ/${LAYER_PATHS[layerKey]}/1.0.0/default/default028mm/${z}/${y}/${x}.jpg`;
      return entry;
    },
    []
  );

  useEffect(() => {
    for (const lk of ['viking', 'mola'] as const) {
      requestTile(lk, 0, 0, 0);
      requestTile(lk, 0, 0, 1);
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 4; x++) {
          requestTile(lk, 1, y, x);
        }
      }
    }
  }, [requestTile]);

  const drawWmtsLayer = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      layerKey: 'viking' | 'mola',
      z: number,
      alpha: number
    ) => {
      const { width, height } = canvasSize;
      const numCols = 1 << (z + 1);
      const numRows = 1 << z;
      const tileDeg = 180 / numRows;

      const halfLonSpan = width / 2 / ppd;
      const halfLatSpan = height / 2 / ppd;
      const lonLeft = centerLon - halfLonSpan;
      const lonRight = centerLon + halfLonSpan;
      const latTop = clamp(centerLat + halfLatSpan, -90, 90);
      const latBottom = clamp(centerLat - halfLatSpan, -90, 90);

      const colStart = Math.floor((lonLeft + 180) / tileDeg);
      const colEnd = Math.floor((lonRight + 180) / tileDeg);
      const rowStart = clamp(Math.floor((90 - latTop) / tileDeg), 0, numRows - 1);
      const rowEnd = clamp(
        Math.floor((90 - latBottom) / tileDeg),
        0,
        numRows - 1
      );

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      for (let r = rowStart; r <= rowEnd; r++) {
        const tileLatTop = 90 - r * tileDeg;
        const tileLatBottom = tileLatTop - tileDeg;
        const sy = height / 2 + (centerLat - tileLatTop) * ppd;
        const sh = (tileLatTop - tileLatBottom) * ppd;

        for (let rawC = colStart; rawC <= colEnd; rawC++) {
          const c = ((rawC % numCols) + numCols) % numCols;
          const tileLonLeft = -180 + rawC * tileDeg;
          const sx = width / 2 + (tileLonLeft - centerLon) * ppd;
          const sw = tileDeg * ppd;

          const tile = requestTile(layerKey, z, r, c);
          if (tile.status === 'ready') {
            ctx.drawImage(tile.img, sx - 0.35, sy - 0.35, sw + 0.7, sh + 0.7);
          } else {
            let drawn = false;
            for (let pz = z - 1; pz >= 0; pz--) {
              const scale = 1 << (z - pz);
              const pr = Math.floor(r / scale);
              const pc = Math.floor(c / scale);
              const pTile = requestTile(layerKey, pz, pr, pc);
              if (pTile.status === 'ready') {
                const subW = pTile.img.width / scale;
                const subH = pTile.img.height / scale;
                const subX = (c % scale) * subW;
                const subY = (r % scale) * subH;
                ctx.drawImage(
                  pTile.img,
                  subX,
                  subY,
                  subW,
                  subH,
                  sx - 0.35,
                  sy - 0.35,
                  sw + 0.7,
                  sh + 0.7
                );
                drawn = true;
                break;
              }
            }
            if (!drawn) {
              ctx.fillStyle = '#140c09';
              ctx.fillRect(sx, sy, sw, sh);
            }
          }
        }
      }
      ctx.restore();
    },
    [canvasSize, centerLat, centerLon, ppd, requestTile]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.width * dpr;
    canvas.height = canvasSize.height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvasSize;
    ctx.save();
    ctx.scale(dpr, dpr);

    // Deep space background with subtle stars
    ctx.fillStyle = '#030508';
    ctx.fillRect(0, 0, width, height);
    for (const s of STARS) {
      ctx.fillStyle = `rgba(226, 232, 240, ${s.a})`;
      ctx.beginPath();
      ctx.arc(s.x * width, s.y * height, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    const idealZ = clamp(Math.round(Math.log2((ppd * 180) / 256)), 0, 7);

    // 1. Real NASA Mars Trek Imagery
    if (baseLayer === 'viking') {
      drawWmtsLayer(ctx, 'viking', idealZ, 1.0);
    } else if (baseLayer === 'mola') {
      drawWmtsLayer(ctx, 'mola', idealZ, 1.0);
    } else {
      drawWmtsLayer(ctx, 'viking', idealZ, 1.0);
      drawWmtsLayer(ctx, 'mola', idealZ, 0.34);
    }

    // 2. Translucent Scientific Overlay
    const anyOverlay =
      layers.swimWater ||
      layers.soilFertility ||
      layers.slopeHazard ||
      layers.gammaRay ||
      layers.geothermal;

    if (anyOverlay) {
      if (!overlayCanvasRef.current) {
        overlayCanvasRef.current = document.createElement('canvas');
      }
      const ov = overlayCanvasRef.current;
      const ovW = 144;
      const ovH = Math.max(72, Math.round((height / width) * ovW));
      ov.width = ovW;
      ov.height = ovH;
      const octx = ov.getContext('2d');
      if (octx) {
        const img = octx.createImageData(ovW, ovH);
        const data = img.data;

        for (let py = 0; py < ovH; py++) {
          const screenY = ((py + 0.5) / ovH) * height;
          const lat = centerLat - (screenY - height / 2) / ppd;
          if (lat < -85 || lat > 85) continue;

          for (let px = 0; px < ovW; px++) {
            const screenX = ((px + 0.5) / ovW) * width;
            const lon = centerLon + (screenX - width / 2) / ppd;
            const tel = sampleMarsTelemetry(lat, lon);

            let r = 0;
            let g = 0;
            let b = 0;
            let a = 0;

            if (layers.soilFertility && tel.soilFertility >= 54) {
              const t = clamp((tel.soilFertility - 52) / 42, 0, 1);
              r = 16;
              g = 185;
              b = 129;
              a = Math.max(a, Math.round(t * 88));
            }
            if (layers.geothermal && tel.geothermalIndex >= 38) {
              const t = clamp((tel.geothermalIndex - 38) / 60, 0, 1);
              r = Math.round(r * 0.4 + 245 * 0.6);
              g = Math.round(g * 0.4 + 158 * 0.6);
              b = Math.round(b * 0.4 + 11 * 0.6);
              a = Math.max(a, Math.round(t * 84));
            }
            if (layers.gammaRay && tel.gammaHydrogen >= 44) {
              const t = clamp((tel.gammaHydrogen - 44) / 52, 0, 1);
              r = Math.round(r * 0.4 + 99 * 0.6);
              g = Math.round(g * 0.4 + 102 * 0.6);
              b = Math.round(b * 0.4 + 241 * 0.6);
              a = Math.max(a, Math.round(t * 82));
            }
            if (layers.swimWater && tel.combinedWaterProb >= minWaterThreshold) {
              const t = clamp(
                (tel.combinedWaterProb - minWaterThreshold) /
                  Math.max(10, 100 - minWaterThreshold),
                0.15,
                1
              );
              r = 14;
              g = 165;
              b = 233;
              a = Math.max(a, Math.round(t * 95));
            }
            if (layers.slopeHazard && tel.slopeDeg >= maxSlopeThreshold) {
              const t = clamp((tel.slopeDeg - maxSlopeThreshold) / 14, 0.25, 1);
              r = 244;
              g = 63;
              b = 94;
              a = Math.max(a, Math.round(t * 125));
            }

            const idx = (py * ovW + px) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = a;
          }
        }

        octx.putImageData(img, 0, 0);
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(ov, 0, 0, width, height);
        ctx.restore();
      }
    }

    const toScreen = (lat: number, lon: number) => {
      let dLon = lon - centerLon;
      while (dLon > 180) dLon -= 360;
      while (dLon < -180) dLon += 360;
      return {
        x: width / 2 + dLon * ppd,
        y: height / 2 + (centerLat - lat) * ppd,
      };
    };

    // 3. Subtle NASA-style Graticule
    const stepDeg = ppd < 5 ? 30 : ppd < 11 ? 15 : ppd < 24 ? 10 : 5;
    ctx.save();
    ctx.strokeStyle = arVisorMode
      ? 'rgba(56, 189, 248, 0.20)'
      : 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.font = '400 10px "JetBrains Mono", monospace';
    ctx.fillStyle = arVisorMode
      ? 'rgba(125, 211, 252, 0.72)'
      : 'rgba(226, 232, 240, 0.45)';

    for (let lat = -60; lat <= 60; lat += stepDeg) {
      const y = height / 2 + (centerLat - lat) * ppd;
      if (y < 52 || y > height - 48) continue;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.fillText(
        lat === 0 ? '0° EQ' : lat > 0 ? `${lat}°N` : `${Math.abs(lat)}°S`,
        14,
        y - 4
      );
    }

    const lonStart = Math.floor((centerLon - width / 2 / ppd) / stepDeg) * stepDeg;
    const lonEnd = Math.ceil((centerLon + width / 2 / ppd) / stepDeg) * stepDeg;
    for (let lon = lonStart; lon <= lonEnd; lon += stepDeg) {
      const x = width / 2 + (lon - centerLon) * ppd;
      if (x < 24 || x > width - 24) continue;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      const norm = Math.round(normalizeLon(lon));
      ctx.fillText(`${norm}°E`, x + 4, height - 64);
    }
    ctx.restore();

    // 4. Computed A* Navigation Route
    if (route.found && route.points.length > 1) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      route.points.forEach((pt, idx) => {
        const p = toScreen(pt.lat, pt.lon);
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.lineWidth = 7;
      ctx.stroke();

      for (let i = 1; i < route.points.length; i++) {
        const p0 = toScreen(route.points[i - 1].lat, route.points[i - 1].lon);
        const p1 = toScreen(route.points[i].lat, route.points[i].lon);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        const hz = route.points[i].hazardLevel;
        ctx.strokeStyle =
          hz === 'high' ? '#FB7185' : hz === 'moderate' ? '#FBBF24' : '#38BDF8';
        ctx.lineWidth = 2.4;
        ctx.stroke();
      }

      ctx.fillStyle = '#E0F2FE';
      for (let i = 5; i < route.points.length - 2; i += 7) {
        const p0 = toScreen(route.points[i - 1].lat, route.points[i - 1].lon);
        const p1 = toScreen(route.points[i].lat, route.points[i].lon);
        const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
        ctx.save();
        ctx.translate(p1.x, p1.y);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(5, 0);
        ctx.lineTo(-3.5, -3);
        ctx.lineTo(-3.5, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Draw numbered intermediate turn-by-turn waypoints
      for (const wp of route.waypoints) {
        if (wp.tag === 'start' || wp.tag === 'target') continue;
        const p = toScreen(wp.lat, wp.lon);
        if (p.x < 10 || p.x > width - 10 || p.y < 10 || p.y > height - 10) {
          continue;
        }
        ctx.save();
        const wpColor =
          wp.tag === 'avoid'
            ? '#FBBF24'
            : wp.tag === 'water'
              ? '#38BDF8'
              : '#E2E8F0';
        ctx.fillStyle = '#070A10';
        ctx.strokeStyle = wpColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.font = '700 9px "JetBrains Mono", monospace';
        ctx.fillStyle = wpColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(wp.index - 1), p.x, p.y + 0.5);
        ctx.restore();
      }
      ctx.restore();
    }

    // 5. Clean NASA Eyes-style Landmarks with tier-based zoom decluttering
    const maxTier =
      landmarkTypeFilter !== 'all'
        ? ppd < 5
          ? 2
          : 3
        : ppd < 5.5
          ? 1
          : ppd < 13.5
            ? 2
            : 3;

    const placedLabels: { x: number; y: number; w: number; h: number }[] = [];

    const visibleForRender: Landmark[] = [];
    if (selectedLandmark) visibleForRender.push(selectedLandmark);
    for (const lm of MARS_LANDMARKS) {
      if (selectedLandmark && lm.id === selectedLandmark.id) continue;
      if (landmarkTypeFilter !== 'all' && lm.type !== landmarkTypeFilter) continue;
      if (lm.tier > maxTier) continue;
      visibleForRender.push(lm);
    }
    visibleForRender.sort((a, b) => {
      if (selectedLandmark && a.id === selectedLandmark.id) return -1;
      if (selectedLandmark && b.id === selectedLandmark.id) return 1;
      return a.tier - b.tier;
    });

    for (const lm of visibleForRender) {
      const p = toScreen(lm.lat, lm.lon);
      if (p.x < 16 || p.x > width - 16 || p.y < 54 || p.y > height - 54) {
        continue;
      }

      const isSelected = selectedLandmark?.id === lm.id;
      ctx.save();
      let color = '#CBD5E1';
      if (lm.type === 'volcano') color = '#FBBF24';
      else if (lm.type === 'ice_sheet') color = '#38BDF8';
      else if (lm.type === 'agri_candidate') color = '#34D399';
      else if (lm.type === 'canyon') color = '#7DD3FC';

      // Delicate ring / marker (smaller for tier 3 so high-zoom maps stay clean)
      const rSize = isSelected ? 6 : lm.tier === 1 ? 4.4 : lm.tier === 2 ? 3.4 : 2.5;
      ctx.strokeStyle = isSelected ? '#FFFFFF' : color;
      ctx.lineWidth = isSelected ? 1.8 : lm.tier === 3 ? 1.1 : 1.4;
      ctx.beginPath();
      if (lm.type === 'volcano') {
        ctx.moveTo(p.x, p.y - (rSize + 1.2));
        ctx.lineTo(p.x + rSize, p.y + rSize * 0.85);
        ctx.lineTo(p.x - rSize, p.y + rSize * 0.85);
        ctx.closePath();
      } else {
        ctx.arc(p.x, p.y, rSize, 0, Math.PI * 2);
      }
      ctx.stroke();

      // Label with soft shadow and strict collision culling
      ctx.font =
        lm.tier === 1 || isSelected
          ? '600 12px "IBM Plex Sans KR", "Plus Jakarta Sans", sans-serif'
          : '400 11px "IBM Plex Sans KR", "Plus Jakarta Sans", sans-serif';
      const tw = ctx.measureText(lm.nameKo).width;
      const lx = p.x + 8;
      const ly = p.y + 4;
      const box = { x: lx - 6, y: ly - 13, w: tw + 12, h: 18 };

      const overlaps = placedLabels.some(
        (b) =>
          box.x < b.x + b.w &&
          box.x + box.w > b.x &&
          box.y < b.y + b.h &&
          box.y + box.h > b.y
      );

      if (!overlaps || isSelected) {
        placedLabels.push(box);
        ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
        ctx.shadowBlur = 5;
        ctx.fillStyle = isSelected
          ? '#FFFFFF'
          : lm.tier === 1
            ? '#F8FAFC'
            : lm.tier === 2
              ? '#E2E8F0'
              : '#CBD5E1';
        ctx.fillText(lm.nameKo, lx, ly);
      }
      ctx.restore();
    }

    // 6. Clean Target & Start Markers
    const drawPin = (
      lat: number,
      lon: number,
      label: string,
      color: string
    ) => {
      const p = toScreen(lat, lon);
      if (p.x < -30 || p.x > width + 30 || p.y < -30 || p.y > height + 30) {
        return;
      }
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
      ctx.shadowBlur = 4;
      ctx.fillStyle = color;
      const tw = ctx.measureText(label).width;
      ctx.fillText(label, p.x - tw / 2, p.y - 14);
      ctx.restore();
    };

    drawPin(startCoord.lat, startCoord.lon, 'START', '#F8FAFC');
    drawPin(destCoord.lat, destCoord.lon, 'TARGET', '#38BDF8');

    if (selectedPoint) {
      const p = toScreen(selectedPoint.lat, selectedPoint.lon);
      ctx.save();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }, [
    canvasSize,
    baseLayer,
    centerLat,
    centerLon,
    ppd,
    layers,
    minWaterThreshold,
    maxSlopeThreshold,
    startCoord,
    destCoord,
    route,
    selectedPoint,
    selectedLandmark,
    landmarkTypeFilter,
    arVisorMode,
    tileTick,
    drawWmtsLayer,
  ]);

  const screenToLatLon = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;

    const lon = normalizeLon(centerLon + (sx - canvasSize.width / 2) / ppd);
    const lat = centerLat - (sy - canvasSize.height / 2) / ppd;
    if (lat < -85 || lat > 85) return null;
    return { lat, lon };
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.22 : 0.82;
    const nextPpd = clamp(ppd * factor, 2.2, 140);

    const mouseLon = centerLon + (sx - canvasSize.width / 2) / ppd;
    const mouseLat = centerLat - (sy - canvasSize.height / 2) / ppd;

    const nextLon = normalizeLon(
      mouseLon - (sx - canvasSize.width / 2) / nextPpd
    );
    const nextLat = clamp(
      mouseLat + (sy - canvasSize.height / 2) / nextPpd,
      -78,
      78
    );

    onViewportChange(nextLat, nextLon, nextPpd);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    didDragRef.current = false;
    setIsDragging(true);
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      startLat: centerLat,
      startLon: centerLon,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const coord = screenToLatLon(e.clientX, e.clientY);
    onHoverPoint(coord ? sampleMarsTelemetry(coord.lat, coord.lon) : null);

    if (isDragging && dragRef.current) {
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      if (Math.hypot(dx, dy) > 4) {
        didDragRef.current = true;
      }
      const nextLon = normalizeLon(dragRef.current.startLon - dx / ppd);
      const nextLat = clamp(dragRef.current.startLat + dy / ppd, -78, 78);
      onViewportChange(nextLat, nextLon, ppd);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    setIsDragging(false);
    if (!didDragRef.current) {
      const coord = screenToLatLon(e.clientX, e.clientY);
      if (!coord) return;

      const maxHitTier =
        landmarkTypeFilter !== 'all'
          ? ppd < 5
            ? 2
            : 3
          : ppd < 5.5
            ? 1
            : ppd < 13.5
              ? 2
              : 3;
      let cDLon = coord.lon - centerLon;
      while (cDLon > 180) cDLon -= 360;
      while (cDLon < -180) cDLon += 360;
      const cx = canvasSize.width / 2 + cDLon * ppd;
      const cy = canvasSize.height / 2 + (centerLat - coord.lat) * ppd;

      let closestLm: Landmark | null = null;
      let closestScore = 20;
      for (const lm of MARS_LANDMARKS) {
        if (landmarkTypeFilter !== 'all' && lm.type !== landmarkTypeFilter) continue;
        if (lm.tier > maxHitTier && lm.id !== selectedLandmark?.id) continue;
        let dLon = lm.lon - centerLon;
        while (dLon > 180) dLon -= 360;
        while (dLon < -180) dLon += 360;
        const lx = canvasSize.width / 2 + dLon * ppd;
        const ly = canvasSize.height / 2 + (centerLat - lm.lat) * ppd;
        const dist = Math.hypot(lx - cx, ly - cy);
        if (dist < 18) {
          const score = dist + (lm.tier - 1) * 1.5;
          if (score < closestScore) {
            closestScore = score;
            closestLm = lm;
          }
        }
      }

      if (closestLm) {
        onSelectLandmark(closestLm);
        onMapClick(sampleMarsTelemetry(closestLm.lat, closestLm.lon));
      } else {
        onMapClick(sampleMarsTelemetry(coord.lat, coord.lon));
      }
    }
  };

  const bearing = computeBearingDeg(
    startCoord.lat,
    startCoord.lon,
    destCoord.lat,
    destCoord.lon
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#030508] overflow-hidden select-none"
    >
      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          setIsDragging(false);
          onHoverPoint(null);
        }}
        className={`w-full h-full block ${
          isDragging && didDragRef.current
            ? 'cursor-grabbing'
            : clickTool === 'inspect'
              ? 'cursor-crosshair'
              : 'cursor-crosshair'
        }`}
      />

      {/* AR Spacesuit Visor HUD Overlay (only when AR mode is toggled) */}
      {arVisorMode && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-16 left-6 w-10 h-10 border-t border-l border-cyan-400/70" />
          <div className="absolute top-16 right-6 w-10 h-10 border-t border-r border-cyan-400/70" />
          <div className="absolute bottom-20 left-6 w-10 h-10 border-b border-l border-cyan-400/70" />
          <div className="absolute bottom-20 right-6 w-10 h-10 border-b border-r border-cyan-400/70" />

          <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-[#05070B]/80 backdrop-blur-md border border-cyan-400/35 px-4 py-1.5 rounded flex items-center gap-4 text-xs font-mono text-cyan-300">
            <Compass className="w-3.5 h-3.5 text-cyan-400" />
            <span>HDG {String(bearing).padStart(3, '0')}°</span>
            <span className="text-white/20">|</span>
            <span>DIST {route.found ? `${route.totalDistanceKm} km` : '--'}</span>
            <span className="text-white/20">|</span>
            <span>ETA {route.found ? `${route.estimatedHoursRover} h` : '--'}</span>
          </div>

          <div className="absolute top-1/2 left-7 -translate-y-1/2 flex flex-col gap-3 text-[10px] font-mono text-cyan-400/65">
            <span>+10° ─</span>
            <span className="text-cyan-300">00° ━━</span>
            <span>-10° ─</span>
          </div>
          <div className="absolute top-1/2 right-16 -translate-y-1/2 flex flex-col gap-3 text-[10px] font-mono text-cyan-400/65 text-right">
            <span>─ +10°</span>
            <span className="text-cyan-300">━━ 00°</span>
            <span>─ -10°</span>
          </div>
        </div>
      )}
    </div>
  );
};
