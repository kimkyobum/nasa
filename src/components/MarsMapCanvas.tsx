import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Compass } from 'lucide-react';
import {
  MARS_LANDMARKS,
  getGlobalTelemetryAtlas,
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

// Pre-sort landmarks by tier once at module load so render loop never sorts 680 items per frame
const SORTED_LANDMARKS = [...MARS_LANDMARKS].sort((a, b) => a.tier - b.tier);

// Cached label text widths so Canvas 2D measureText runs at most once per landmark
const labelWidthCache = new Map<string, number>();

// Deterministic starfield points for deep-space frame outside Mars bounds
const STARS = Array.from({ length: 120 }, (_, i) => {
  const s1 = Math.sin(i * 127.1) * 43758.5453;
  const s2 = Math.sin(i * 269.5) * 43758.5453;
  const s3 = Math.sin(i * 419.2) * 43758.5453;
  return {
    x: s1 - Math.floor(s1),
    y: s2 - Math.floor(s2),
    a: 0.16 + (s3 - Math.floor(s3)) * 0.42,
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

export const MarsMapCanvas: React.FC<MarsMapCanvasProps> = React.memo(
  ({
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
    const hasOverlayRef = useRef(false);

    const [canvasSize, setCanvasSize] = useState({ width: 1280, height: 760 });
    const [cursorGrabbing, setCursorGrabbing] = useState(false);

    // Mutable viewport ref for zero-React-rerender 60fps pan & zoom
    const viewRef = useRef({ lat: centerLat, lon: centerLon, ppd });
    const lastEmittedRef = useRef({ lat: centerLat, lon: centerLon, ppd });
    const isDraggingRef = useRef(false);
    const dragRef = useRef<{
      x: number;
      y: number;
      startLat: number;
      startLon: number;
    } | null>(null);
    const didDragRef = useRef(false);

    const rafIdRef = useRef<number | null>(null);
    const syncTimerRef = useRef<number | null>(null);
    const lastHoverEmitRef = useRef<number>(0);

    // Keep latest render inputs in refs so RAF drawScene is always fresh without recreating callbacks
    const propsRef = useRef({
      baseLayer,
      startCoord,
      destCoord,
      route,
      arVisorMode,
      selectedPoint,
      selectedLandmark,
      landmarkTypeFilter,
      canvasSize,
      onViewportChange,
    });
    propsRef.current = {
      baseLayer,
      startCoord,
      destCoord,
      route,
      arVisorMode,
      selectedPoint,
      selectedLandmark,
      landmarkTypeFilter,
      canvasSize,
      onViewportChange,
    };

    const scheduleDrawRef = useRef<() => void>(() => {});

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
          // Coalesce multiple arriving tiles into a single animation frame without React state churn
          scheduleDrawRef.current();
        };
        img.onerror = () => {
          tileCache.set(key, { status: 'error' });
        };
        img.src = `https://trek.nasa.gov/tiles/Mars/EQ/${LAYER_PATHS[layerKey]}/1.0.0/default/default028mm/${z}/${y}/${x}.jpg`;
        return entry;
      },
      []
    );

    // Preload low-zoom base tiles once
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

    // Observe container resize
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = Math.max(360, Math.floor(entry.contentRect.width));
          const h = Math.max(320, Math.floor(entry.contentRect.height));
          setCanvasSize((prev) =>
            prev.width === w && prev.height === h ? prev : { width: w, height: h }
          );
        }
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    // Resize GPU canvas backing store ONLY when dimensions actually change
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvasSize.width * dpr);
      canvas.height = Math.round(canvasSize.height * dpr);
      scheduleDrawRef.current();
    }, [canvasSize]);

    // Pre-render global scientific overlay texture ONLY when layer toggles/thresholds change (<2ms)
    useEffect(() => {
      const anyOverlay =
        layers.swimWater ||
        layers.soilFertility ||
        layers.slopeHazard ||
        layers.gammaRay ||
        layers.geothermal;

      hasOverlayRef.current = anyOverlay;
      if (!anyOverlay) {
        scheduleDrawRef.current();
        return;
      }

      const atlas = getGlobalTelemetryAtlas();
      if (!overlayCanvasRef.current) {
        overlayCanvasRef.current = document.createElement('canvas');
      }
      const ov = overlayCanvasRef.current;
      if (ov.width !== atlas.width || ov.height !== atlas.height) {
        ov.width = atlas.width;
        ov.height = atlas.height;
      }
      const octx = ov.getContext('2d');
      if (!octx) return;

      const img = octx.createImageData(atlas.width, atlas.height);
      const data = img.data;
      const total = atlas.width * atlas.height;
      const { water, soil, gamma, geo, slopeX10 } = atlas;
      const waterDenom = Math.max(10, 100 - minWaterThreshold);
      const slopeLimitX10 = maxSlopeThreshold * 10;

      for (let i = 0; i < total; i++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;

        if (layers.soilFertility && soil[i] >= 54) {
          const t = clamp((soil[i] - 52) / 42, 0, 1);
          r = 16;
          g = 185;
          b = 129;
          a = Math.max(a, Math.round(t * 88));
        }
        if (layers.geothermal && geo[i] >= 38) {
          const t = clamp((geo[i] - 38) / 60, 0, 1);
          r = Math.round(r * 0.4 + 245 * 0.6);
          g = Math.round(g * 0.4 + 158 * 0.6);
          b = Math.round(b * 0.4 + 11 * 0.6);
          a = Math.max(a, Math.round(t * 84));
        }
        if (layers.gammaRay && gamma[i] >= 44) {
          const t = clamp((gamma[i] - 44) / 52, 0, 1);
          r = Math.round(r * 0.4 + 99 * 0.6);
          g = Math.round(g * 0.4 + 102 * 0.6);
          b = Math.round(b * 0.4 + 241 * 0.6);
          a = Math.max(a, Math.round(t * 82));
        }
        if (layers.swimWater && water[i] >= minWaterThreshold) {
          const t = clamp((water[i] - minWaterThreshold) / waterDenom, 0.15, 1);
          r = 14;
          g = 165;
          b = 233;
          a = Math.max(a, Math.round(t * 95));
        }
        if (layers.slopeHazard && slopeX10[i] >= slopeLimitX10) {
          const t = clamp((slopeX10[i] - slopeLimitX10) / 140, 0.25, 1);
          r = 244;
          g = 63;
          b = 94;
          a = Math.max(a, Math.round(t * 125));
        }

        const p = i * 4;
        data[p] = r;
        data[p + 1] = g;
        data[p + 2] = b;
        data[p + 3] = a;
      }

      octx.putImageData(img, 0, 0);
      scheduleDrawRef.current();
    }, [layers, minWaterThreshold, maxSlopeThreshold]);

    const drawWmtsLayer = useCallback(
      (
        ctx: CanvasRenderingContext2D,
        layerKey: 'viking' | 'mola',
        z: number,
        alpha: number,
        cLat: number,
        cLon: number,
        curPpd: number,
        width: number,
        height: number
      ) => {
        const numCols = 1 << (z + 1);
        const numRows = 1 << z;
        const tileDeg = 180 / numRows;

        const halfLonSpan = width / 2 / curPpd;
        const halfLatSpan = height / 2 / curPpd;
        const lonLeft = cLon - halfLonSpan;
        const lonRight = cLon + halfLonSpan;
        const latTop = clamp(cLat + halfLatSpan, -90, 90);
        const latBottom = clamp(cLat - halfLatSpan, -90, 90);

        const colStart = Math.floor((lonLeft + 180) / tileDeg);
        const colEnd = Math.floor((lonRight + 180) / tileDeg);
        const rowStart = clamp(Math.floor((90 - latTop) / tileDeg), 0, numRows - 1);
        const rowEnd = clamp(Math.floor((90 - latBottom) / tileDeg), 0, numRows - 1);

        ctx.save();
        ctx.globalAlpha = alpha;

        for (let r = rowStart; r <= rowEnd; r++) {
          const tileLatTop = 90 - r * tileDeg;
          const tileLatBottom = tileLatTop - tileDeg;
          const sy = height / 2 + (cLat - tileLatTop) * curPpd;
          const sh = (tileLatTop - tileLatBottom) * curPpd;

          for (let rawC = colStart; rawC <= colEnd; rawC++) {
            const c = ((rawC % numCols) + numCols) % numCols;
            const tileLonLeft = -180 + rawC * tileDeg;
            const sx = width / 2 + (tileLonLeft - cLon) * curPpd;
            const sw = tileDeg * curPpd;

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
      [requestTile]
    );

    const drawScene = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const {
        baseLayer: curBaseLayer,
        startCoord: curStart,
        destCoord: curDest,
        route: curRoute,
        arVisorMode: curAr,
        selectedPoint: curSelectedPt,
        selectedLandmark: curSelectedLm,
        landmarkTypeFilter: curFilter,
        canvasSize: curSize,
      } = propsRef.current;

      const { lat: cLat, lon: cLon, ppd: curPpd } = viewRef.current;
      const { width, height } = curSize;
      const dpr = canvas.width / Math.max(1, width);

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Deep space background with subtle stars
      ctx.fillStyle = '#030508';
      ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < STARS.length; i++) {
        const s = STARS[i];
        ctx.fillStyle = `rgba(226, 232, 240, ${s.a})`;
        ctx.fillRect(s.x * width, s.y * height, s.r, s.r);
      }

      const idealZ = clamp(Math.round(Math.log2((curPpd * 180) / 256)), 0, 7);

      // 1. Real NASA Mars Trek Imagery
      if (curBaseLayer === 'viking') {
        drawWmtsLayer(ctx, 'viking', idealZ, 1.0, cLat, cLon, curPpd, width, height);
      } else if (curBaseLayer === 'mola') {
        drawWmtsLayer(ctx, 'mola', idealZ, 1.0, cLat, cLon, curPpd, width, height);
      } else {
        drawWmtsLayer(ctx, 'viking', idealZ, 1.0, cLat, cLon, curPpd, width, height);
        drawWmtsLayer(ctx, 'mola', idealZ, 0.34, cLat, cLon, curPpd, width, height);
      }

      // 2. GPU-blitted Scientific Overlay (<0.2ms, zero per-frame telemetry math!)
      if (hasOverlayRef.current && overlayCanvasRef.current) {
        const ov = overlayCanvasRef.current;
        const dy = height / 2 + (cLat - 85) * curPpd;
        const dh = 170 * curPpd;
        const dw = 360 * curPpd;
        const lonLeft = cLon - width / 2 / curPpd;
        const lonRight = cLon + width / 2 / curPpd;
        const wrapStart = Math.floor((lonLeft + 180) / 360);
        const wrapEnd = Math.floor((lonRight + 180) / 360);

        ctx.save();
        ctx.imageSmoothingEnabled = true;
        for (let w = wrapStart; w <= wrapEnd; w++) {
          const worldLonLeft = -180 + w * 360;
          const dx = width / 2 + (worldLonLeft - cLon) * curPpd;
          ctx.drawImage(ov, 0, 0, ov.width, ov.height, dx, dy, dw, dh);
        }
        ctx.restore();
      }

      const toScreen = (lat: number, lon: number) => {
        let dLon = lon - cLon;
        while (dLon > 180) dLon -= 360;
        while (dLon < -180) dLon += 360;
        return {
          x: width / 2 + dLon * curPpd,
          y: height / 2 + (cLat - lat) * curPpd,
        };
      };

      // 3. Subtle NASA-style Graticule
      const stepDeg = curPpd < 5 ? 30 : curPpd < 11 ? 15 : curPpd < 24 ? 10 : 5;
      ctx.save();
      ctx.strokeStyle = curAr
        ? 'rgba(56, 189, 248, 0.20)'
        : 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.font = '400 10px "JetBrains Mono", monospace';
      ctx.fillStyle = curAr
        ? 'rgba(125, 211, 252, 0.72)'
        : 'rgba(226, 232, 240, 0.45)';

      ctx.beginPath();
      for (let lat = -60; lat <= 60; lat += stepDeg) {
        const y = height / 2 + (cLat - lat) * curPpd;
        if (y < 52 || y > height - 48) continue;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      const lonStart = Math.floor((cLon - width / 2 / curPpd) / stepDeg) * stepDeg;
      const lonEnd = Math.ceil((cLon + width / 2 / curPpd) / stepDeg) * stepDeg;
      for (let lon = lonStart; lon <= lonEnd; lon += stepDeg) {
        const x = width / 2 + (lon - cLon) * curPpd;
        if (x < 24 || x > width - 24) continue;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      ctx.stroke();

      for (let lat = -60; lat <= 60; lat += stepDeg) {
        const y = height / 2 + (cLat - lat) * curPpd;
        if (y < 52 || y > height - 48) continue;
        ctx.fillText(
          lat === 0 ? '0° EQ' : lat > 0 ? `${lat}°N` : `${Math.abs(lat)}°S`,
          14,
          y - 4
        );
      }
      for (let lon = lonStart; lon <= lonEnd; lon += stepDeg) {
        const x = width / 2 + (lon - cLon) * curPpd;
        if (x < 24 || x > width - 24) continue;
        const norm = Math.round(normalizeLon(lon));
        ctx.fillText(`${norm}°E`, x + 4, height - 64);
      }
      ctx.restore();

      // 4. Computed A* Navigation Route (or Unreachable indicator)
      if (curRoute.found && curRoute.points.length > 1) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        let prevScreen: { x: number; y: number } | null = null;
        for (let idx = 0; idx < curRoute.points.length; idx++) {
          const pt = curRoute.points[idx];
          const p = toScreen(pt.lat, pt.lon);
          if (!prevScreen || Math.abs(p.x - prevScreen.x) > width * 0.5) {
            ctx.moveTo(p.x, p.y);
          } else {
            ctx.lineTo(p.x, p.y);
          }
          prevScreen = p;
        }
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
        ctx.lineWidth = 7;
        ctx.stroke();

        for (let i = 1; i < curRoute.points.length; i++) {
          const p0 = toScreen(curRoute.points[i - 1].lat, curRoute.points[i - 1].lon);
          const p1 = toScreen(curRoute.points[i].lat, curRoute.points[i].lon);
          if (Math.abs(p1.x - p0.x) > width * 0.5) continue;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          const hz = curRoute.points[i].hazardLevel;
          ctx.strokeStyle =
            hz === 'high' ? '#FB7185' : hz === 'moderate' ? '#FBBF24' : '#38BDF8';
          ctx.lineWidth = 2.4;
          ctx.stroke();
        }

        ctx.fillStyle = '#E0F2FE';
        for (let i = 5; i < curRoute.points.length - 2; i += 7) {
          const p0 = toScreen(curRoute.points[i - 1].lat, curRoute.points[i - 1].lon);
          const p1 = toScreen(curRoute.points[i].lat, curRoute.points[i].lon);
          if (Math.abs(p1.x - p0.x) > width * 0.5) continue;
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

        for (let wi = 0; wi < curRoute.waypoints.length; wi++) {
          const wp = curRoute.waypoints[wi];
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
      } else if (!curRoute.found && curRoute.directDistanceKm > 0) {
        const pStart = toScreen(curStart.lat, curStart.lon);
        const pDest = toScreen(curDest.lat, curDest.lon);
        if (Math.abs(pDest.x - pStart.x) <= width * 0.55) {
          ctx.save();
          ctx.setLineDash([6, 6]);
          ctx.strokeStyle = 'rgba(251, 113, 133, 0.55)';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(pStart.x, pStart.y);
          ctx.lineTo(pDest.x, pDest.y);
          ctx.stroke();
          ctx.restore();
        }
      }

      // 5. Landmarks with tier-based zoom decluttering + cached label widths (zero shadowBlur!)
      const maxTier =
        curFilter !== 'all'
          ? curPpd < 5
            ? 2
            : 3
          : curPpd < 5.5
            ? 1
            : curPpd < 13.5
              ? 2
              : 3;

      const placedLabels: { x: number; y: number; w: number; h: number }[] = [];

      const drawLandmark = (lm: Landmark, isSelected: boolean) => {
        const p = toScreen(lm.lat, lm.lon);
        if (p.x < 16 || p.x > width - 16 || p.y < 54 || p.y > height - 54) {
          return;
        }

        let color = '#CBD5E1';
        if (lm.type === 'volcano') color = '#FBBF24';
        else if (lm.type === 'ice_sheet') color = '#38BDF8';
        else if (lm.type === 'agri_candidate') color = '#34D399';
        else if (lm.type === 'canyon') color = '#7DD3FC';

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

        const isBold = lm.tier === 1 || isSelected;
        const fontStr = isBold
          ? '600 12px "IBM Plex Sans KR", "Plus Jakarta Sans", sans-serif'
          : '400 11px "IBM Plex Sans KR", "Plus Jakarta Sans", sans-serif';
        const cacheKey = `${isBold ? '1' : '0'}:${lm.nameKo}`;
        let tw = labelWidthCache.get(cacheKey);
        if (tw === undefined) {
          ctx.font = fontStr;
          tw = ctx.measureText(lm.nameKo).width;
          labelWidthCache.set(cacheKey, tw);
        }

        const lx = p.x + 8;
        const ly = p.y + 4;
        const box = { x: lx - 6, y: ly - 13, w: tw + 12, h: 18 };

        let overlaps = false;
        for (let bIdx = 0; bIdx < placedLabels.length; bIdx++) {
          const b = placedLabels[bIdx];
          if (
            box.x < b.x + b.w &&
            box.x + box.w > b.x &&
            box.y < b.y + b.h &&
            box.y + box.h > b.y
          ) {
            overlaps = true;
            break;
          }
        }

        if (!overlaps || isSelected) {
          placedLabels.push(box);
          ctx.font = fontStr;
          // Crisp 1px dark halo instead of expensive GPU shadowBlur
          ctx.fillStyle = 'rgba(3, 5, 8, 0.9)';
          ctx.fillText(lm.nameKo, lx + 1, ly + 1);
          ctx.fillStyle = isSelected
            ? '#FFFFFF'
            : lm.tier === 1
              ? '#F8FAFC'
              : lm.tier === 2
                ? '#E2E8F0'
                : '#CBD5E1';
          ctx.fillText(lm.nameKo, lx, ly);
        }
      };

      ctx.save();
      if (curSelectedLm) {
        drawLandmark(curSelectedLm, true);
      }
      for (let i = 0; i < SORTED_LANDMARKS.length; i++) {
        const lm = SORTED_LANDMARKS[i];
        if (lm.tier > maxTier) break; // sorted by tier, so we can exit early!
        if (curSelectedLm && lm.id === curSelectedLm.id) continue;
        if (curFilter !== 'all' && lm.type !== curFilter) continue;
        drawLandmark(lm, false);
      }
      ctx.restore();

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
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(3, 5, 8, 0.92)';
        ctx.fillText(label, p.x - tw / 2 + 1, p.y - 13);
        ctx.fillStyle = color;
        ctx.fillText(label, p.x - tw / 2, p.y - 14);
        ctx.restore();
      };

      drawPin(curStart.lat, curStart.lon, 'START', '#F8FAFC');
      drawPin(
        curDest.lat,
        curDest.lon,
        curRoute.found ? 'TARGET' : 'BLOCKED',
        curRoute.found ? '#38BDF8' : '#FB7185'
      );

      if (curSelectedPt) {
        const p = toScreen(curSelectedPt.lat, curSelectedPt.lon);
        ctx.save();
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    }, [drawWmtsLayer]);

    const scheduleDraw = useCallback(() => {
      if (rafIdRef.current !== null) return;
      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = null;
        drawScene();
      });
    }, [drawScene]);

    scheduleDrawRef.current = scheduleDraw;

    // Sync external prop viewport changes (preset clicks, zoom +/- buttons, search flyTo)
    useEffect(() => {
      const sameAsEmitted =
        Math.abs(centerLat - lastEmittedRef.current.lat) < 1e-4 &&
        Math.abs(centerLon - lastEmittedRef.current.lon) < 1e-4 &&
        Math.abs(ppd - lastEmittedRef.current.ppd) < 1e-4;

      if (!sameAsEmitted && !isDraggingRef.current) {
        if (syncTimerRef.current !== null) {
          clearTimeout(syncTimerRef.current);
          syncTimerRef.current = null;
        }
        viewRef.current = { lat: centerLat, lon: centerLon, ppd };
        lastEmittedRef.current = { lat: centerLat, lon: centerLon, ppd };
      }
      scheduleDraw();
    }, [centerLat, centerLon, ppd, scheduleDraw]);

    // Trigger canvas redraw when non-viewport props change
    useEffect(() => {
      scheduleDraw();
    }, [
      baseLayer,
      startCoord,
      destCoord,
      route,
      arVisorMode,
      selectedPoint,
      selectedLandmark,
      landmarkTypeFilter,
      scheduleDraw,
    ]);

    useEffect(() => {
      return () => {
        if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
        if (syncTimerRef.current !== null) clearTimeout(syncTimerRef.current);
      };
    }, []);

    const scheduleViewportSync = useCallback((immediate = false) => {
      const emit = () => {
        syncTimerRef.current = null;
        const v = viewRef.current;
        lastEmittedRef.current = { lat: v.lat, lon: v.lon, ppd: v.ppd };
        propsRef.current.onViewportChange(v.lat, v.lon, v.ppd);
      };
      if (immediate) {
        if (syncTimerRef.current !== null) {
          clearTimeout(syncTimerRef.current);
          syncTimerRef.current = null;
        }
        emit();
        return;
      }
      if (syncTimerRef.current === null) {
        syncTimerRef.current = window.setTimeout(emit, 120);
      }
    }, []);

    const screenToLatLon = (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      const v = viewRef.current;

      const lon = normalizeLon(v.lon + (sx - canvasSize.width / 2) / v.ppd);
      const lat = v.lat - (sy - canvasSize.height / 2) / v.ppd;
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

      const v = viewRef.current;
      const factor = e.deltaY < 0 ? 1.22 : 0.82;
      const nextPpd = clamp(v.ppd * factor, 2.2, 140);

      const mouseLon = v.lon + (sx - canvasSize.width / 2) / v.ppd;
      const mouseLat = v.lat - (sy - canvasSize.height / 2) / v.ppd;

      const nextLon = normalizeLon(
        mouseLon - (sx - canvasSize.width / 2) / nextPpd
      );
      const nextLat = clamp(
        mouseLat + (sy - canvasSize.height / 2) / nextPpd,
        -78,
        78
      );

      viewRef.current = { lat: nextLat, lon: nextLon, ppd: nextPpd };
      scheduleDraw();
      scheduleViewportSync(false);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
      didDragRef.current = false;
      isDraggingRef.current = true;
      dragRef.current = {
        x: e.clientX,
        y: e.clientY,
        startLat: viewRef.current.lat,
        startLon: viewRef.current.lon,
      };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
      if (isDraggingRef.current && dragRef.current) {
        const dx = e.clientX - dragRef.current.x;
        const dy = e.clientY - dragRef.current.y;
        if (!didDragRef.current && Math.hypot(dx, dy) > 4) {
          didDragRef.current = true;
          setCursorGrabbing(true);
        }
        const curPpd = viewRef.current.ppd;
        const nextLon = normalizeLon(dragRef.current.startLon - dx / curPpd);
        const nextLat = clamp(dragRef.current.startLat + dy / curPpd, -78, 78);
        viewRef.current = { lat: nextLat, lon: nextLon, ppd: curPpd };
        scheduleDraw();
        return;
      }

      // Throttle hover telemetry to ~13fps so moving the mouse never floods React state
      const now = performance.now();
      if (now - lastHoverEmitRef.current < 75) return;
      lastHoverEmitRef.current = now;
      const coord = screenToLatLon(e.clientX, e.clientY);
      onHoverPoint(coord ? sampleMarsTelemetry(coord.lat, coord.lon) : null);
    };

    const handleMouseUp = (e: React.MouseEvent) => {
      const wasDragging = didDragRef.current;
      isDraggingRef.current = false;
      dragRef.current = null;
      if (cursorGrabbing) setCursorGrabbing(false);

      if (wasDragging) {
        scheduleViewportSync(true);
        return;
      }

      const coord = screenToLatLon(e.clientX, e.clientY);
      if (!coord) return;

      const v = viewRef.current;
      const maxHitTier =
        landmarkTypeFilter !== 'all'
          ? v.ppd < 5
            ? 2
            : 3
          : v.ppd < 5.5
            ? 1
            : v.ppd < 13.5
              ? 2
              : 3;

      let cDLon = coord.lon - v.lon;
      while (cDLon > 180) cDLon -= 360;
      while (cDLon < -180) cDLon += 360;
      const cx = canvasSize.width / 2 + cDLon * v.ppd;
      const cy = canvasSize.height / 2 + (v.lat - coord.lat) * v.ppd;

      let closestLm: Landmark | null = null;
      let closestScore = 20;
      for (let i = 0; i < SORTED_LANDMARKS.length; i++) {
        const lm = SORTED_LANDMARKS[i];
        if (lm.tier > maxHitTier && lm.id !== selectedLandmark?.id) continue;
        if (landmarkTypeFilter !== 'all' && lm.type !== landmarkTypeFilter) continue;
        let dLon = lm.lon - v.lon;
        while (dLon > 180) dLon -= 360;
        while (dLon < -180) dLon += 360;
        const lx = canvasSize.width / 2 + dLon * v.ppd;
        const ly = canvasSize.height / 2 + (v.lat - lm.lat) * v.ppd;
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
            if (isDraggingRef.current) {
              isDraggingRef.current = false;
              dragRef.current = null;
              setCursorGrabbing(false);
              scheduleViewportSync(true);
            }
            onHoverPoint(null);
          }}
          className={`w-full h-full block ${
            cursorGrabbing ? 'cursor-grabbing' : 'cursor-crosshair'
          }`}
        />

        {/* AR Spacesuit Visor HUD Overlay (only when AR mode is toggled) */}
        {arVisorMode && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute top-16 left-6 w-10 h-10 border-t border-l border-cyan-400/70" />
            <div className="absolute top-16 right-6 w-10 h-10 border-t border-r border-cyan-400/70" />
            <div className="absolute bottom-20 left-6 w-10 h-10 border-b border-l border-cyan-400/70" />
            <div className="absolute bottom-20 right-6 w-10 h-10 border-b border-r border-cyan-400/70" />

            <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-[#05070B]/90 border border-cyan-400/35 px-4 py-1.5 rounded flex items-center gap-4 text-xs font-mono text-cyan-300">
              <Compass className="w-3.5 h-3.5 text-cyan-400" />
              <span>HDG {String(bearing).padStart(3, '0')}°</span>
              <span className="text-white/20">|</span>
              <span>
                DIST {route.found ? `${route.totalDistanceKm} km` : '--'}
              </span>
              <span className="text-white/20">|</span>
              <span>
                ETA {route.found ? `${route.estimatedHoursRover} h` : '--'}
              </span>
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
  }
);
