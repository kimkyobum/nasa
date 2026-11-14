import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Compass } from 'lucide-react';
import {
  MARS_LANDMARKS,
  getGlobalTelemetryAtlas,
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
  layerOpacity: number;
  startCoord: { lat: number; lon: number } | null;
  destCoord: { lat: number; lon: number } | null;
  route: RouteResult;
  clickTool: ClickTool;
  arVisorMode: boolean;
  selectedPoint: MarsTelemetryPoint | null;
  selectedLandmark: Landmark | null;
  landmarkTypeFilter: LandmarkType | 'all';
  onHoverPoint: (pt: MarsTelemetryPoint | null) => void;
  onMapClick: (pt: MarsTelemetryPoint) => void;
  onPinClick?: (pin: 'start' | 'destination') => void;
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

// Pre-sort landmarks by tier once at module load so render loop never sorts per frame
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

function getMinPpd(width: number, height: number): number {
  return Math.max(2.3, Math.min(width / 360, height / 170) * 0.94);
}

function clampSingleMapViewport(
  lat: number,
  lon: number,
  ppd: number,
  width: number,
  height: number
) {
  const minPpd = getMinPpd(width, height);
  const nextPpd = clamp(ppd, minPpd, 140);

  const halfScreenLon = width / 2 / nextPpd;
  const maxPanLon =
    halfScreenLon >= 178 ? 0 : Math.max(0, 180 - halfScreenLon * 0.92);
  const nextLon = clamp(lon, -maxPanLon, maxPanLon);

  const halfScreenLat = height / 2 / nextPpd;
  const maxPanLat =
    halfScreenLat >= 82 ? 0 : Math.max(0, 85 - halfScreenLat * 0.92);
  const nextLat = clamp(lat, -maxPanLat, maxPanLat);

  return { lat: nextLat, lon: nextLon, ppd: nextPpd };
}

function computeBearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLon = lon2 - lon1;
  const dLat = lat2 - lat1;
  const rad = Math.atan2(dLon, dLat);
  return Math.round(((rad * 180) / Math.PI + 360) % 360);
}

// Color ramp helper for MOLA elevation (-6000m .. +12000m)
function elevationToRgb(elevM: number): [number, number, number] {
  const t = clamp((elevM + 5500) / 16000, 0, 1);
  if (t < 0.25) {
    const k = t / 0.25;
    return [
      Math.round(37 + k * (14 - 37)),
      Math.round(99 + k * (165 - 99)),
      Math.round(235 + k * (233 - 235)),
    ];
  }
  if (t < 0.5) {
    const k = (t - 0.25) / 0.25;
    return [
      Math.round(14 + k * (34 - 14)),
      Math.round(165 + k * (197 - 165)),
      Math.round(233 + k * (94 - 233)),
    ];
  }
  if (t < 0.75) {
    const k = (t - 0.5) / 0.25;
    return [
      Math.round(34 + k * (245 - 34)),
      Math.round(197 + k * (158 - 197)),
      Math.round(94 + k * (11 - 94)),
    ];
  }
  const k = (t - 0.75) / 0.25;
  return [
    Math.round(245 + k * (239 - 245)),
    Math.round(158 + k * (68 - 158)),
    Math.round(11 + k * (68 - 11)),
  ];
}

export const MarsMapCanvas: React.FC<MarsMapCanvasProps> = React.memo(
  ({
    baseLayer,
    centerLat,
    centerLon,
    ppd,
    onViewportChange,
    layers,
    layerOpacity,
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
    onPinClick,
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

    const propsRef = useRef({
      baseLayer,
      startCoord,
      destCoord,
      route,
      clickTool,
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
      clickTool,
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

    // Resize GPU canvas backing store and clamp viewport when dimensions change
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvasSize.width * dpr);
      canvas.height = Math.round(canvasSize.height * dpr);

      const clamped = clampSingleMapViewport(
        viewRef.current.lat,
        viewRef.current.lon,
        viewRef.current.ppd,
        canvasSize.width,
        canvasSize.height
      );
      viewRef.current = clamped;
      scheduleDrawRef.current();
    }, [canvasSize]);

    // Pre-render global scientific overlay texture when layers or opacity change (<2ms)
    useEffect(() => {
      const anyOverlay =
        layers.swimWater ||
        layers.elevation ||
        layers.soilFertility ||
        layers.slopeHazard ||
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
      const { water, soil, elevM, geo, slopeX10 } = atlas;
      const alphaScale = clamp(layerOpacity, 0.2, 1.0);

      for (let i = 0; i < total; i++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;

        // 1. MOLA Elevation color ramp (lowest layer so features stack clearly)
        if (layers.elevation) {
          const [er, eg, eb] = elevationToRgb(elevM[i]);
          r = er;
          g = eg;
          b = eb;
          a = Math.max(a, 115);
        }

        // 2. SWIM Subsurface Water probability — continuous color depth from faint to deep vivid blue
        if (layers.swimWater) {
          const wVal = water[i];
          const t = clamp((wVal - 10) / 86, 0, 1);
          // Smooth gradient: light cyan (#38BDF8) -> rich deep ocean blue (#0284C7 -> #1D4ED8)
          const wr = Math.round(56 - t * 44);
          const wg = Math.round(195 - t * 88);
          const wb = Math.round(248 - t * 18);
          const wa = Math.round(14 + Math.pow(t, 1.25) * 145);
          if (a === 0) {
            r = wr;
            g = wg;
            b = wb;
            a = wa;
          } else {
            const blend = wa / 160;
            r = Math.round(r * (1 - blend) + wr * blend);
            g = Math.round(g * (1 - blend) + wg * blend);
            b = Math.round(b * (1 - blend) + wb * blend);
            a = Math.max(a, wa);
          }
        }

        // 3. CRISM Farming Suitable Soil
        if (layers.soilFertility && soil[i] >= 36) {
          const t = clamp((soil[i] - 36) / 56, 0, 1);
          const sr = 16;
          const sg = Math.round(165 + t * 50);
          const sb = Math.round(115 + t * 25);
          const sa = Math.round(18 + t * 115);
          if (a === 0) {
            r = sr;
            g = sg;
            b = sb;
            a = sa;
          } else {
            r = Math.round(r * 0.45 + sr * 0.55);
            g = Math.round(g * 0.45 + sg * 0.55);
            b = Math.round(b * 0.45 + sb * 0.55);
            a = Math.max(a, sa);
          }
        }

        // 4. Volcano & Geothermal Zones
        if (layers.geothermal && geo[i] >= 26) {
          const t = clamp((geo[i] - 26) / 70, 0, 1);
          const gr = 249;
          const gg = Math.round(158 - t * 55);
          const gb = 16;
          const ga = Math.round(22 + t * 125);
          if (a === 0) {
            r = gr;
            g = gg;
            b = gb;
            a = ga;
          } else {
            r = Math.round(r * 0.4 + gr * 0.6);
            g = Math.round(g * 0.4 + gg * 0.6);
            b = Math.round(b * 0.4 + gb * 0.6);
            a = Math.max(a, ga);
          }
        }

        // 5. Steep Slope / Cliff Hazard Zones
        if (layers.slopeHazard && slopeX10[i] >= 95) {
          const t = clamp((slopeX10[i] - 95) / 140, 0.15, 1);
          const hr = 244;
          const hg = 63;
          const hb = 94;
          const ha = Math.round(35 + t * 135);
          if (a === 0) {
            r = hr;
            g = hg;
            b = hb;
            a = ha;
          } else {
            r = Math.round(r * 0.35 + hr * 0.65);
            g = Math.round(g * 0.35 + hg * 0.65);
            b = Math.round(b * 0.35 + hb * 0.65);
            a = Math.max(a, ha);
          }
        }

        const p = i * 4;
        data[p] = r;
        data[p + 1] = g;
        data[p + 2] = b;
        data[p + 3] = Math.min(220, Math.round(a * alphaScale));
      }

      octx.putImageData(img, 0, 0);
      scheduleDrawRef.current();
    }, [layers, layerOpacity]);

    // Strictly render ONE single Mars map (-180..+180) without duplicating side-by-side
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
        const lonLeft = clamp(cLon - halfLonSpan, -180, 180);
        const lonRight = clamp(cLon + halfLonSpan, -180, 180);
        const latTop = clamp(cLat + halfLatSpan, -90, 90);
        const latBottom = clamp(cLat - halfLatSpan, -90, 90);

        const colStart = clamp(Math.floor((lonLeft + 180) / tileDeg), 0, numCols - 1);
        const colEnd = clamp(Math.floor((lonRight + 180) / tileDeg), 0, numCols - 1);
        const rowStart = clamp(Math.floor((90 - latTop) / tileDeg), 0, numRows - 1);
        const rowEnd = clamp(Math.floor((90 - latBottom) / tileDeg), 0, numRows - 1);

        ctx.save();
        ctx.globalAlpha = alpha;

        for (let r = rowStart; r <= rowEnd; r++) {
          const tileLatTop = 90 - r * tileDeg;
          const tileLatBottom = tileLatTop - tileDeg;
          const sy = height / 2 + (cLat - tileLatTop) * curPpd;
          const sh = (tileLatTop - tileLatBottom) * curPpd;

          for (let c = colStart; c <= colEnd; c++) {
            const tileLonLeft = -180 + c * tileDeg;
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

      // 1. Real NASA Mars Trek Imagery (single Mars -180..+180)
      if (curBaseLayer === 'viking') {
        drawWmtsLayer(ctx, 'viking', idealZ, 1.0, cLat, cLon, curPpd, width, height);
      } else if (curBaseLayer === 'mola') {
        drawWmtsLayer(ctx, 'mola', idealZ, 1.0, cLat, cLon, curPpd, width, height);
      } else {
        drawWmtsLayer(ctx, 'viking', idealZ, 1.0, cLat, cLon, curPpd, width, height);
        drawWmtsLayer(ctx, 'mola', idealZ, 0.34, cLat, cLon, curPpd, width, height);
      }

      // 2. Single-Map GPU-blitted Scientific Overlay (-180..+180, 85..-85)
      if (hasOverlayRef.current && overlayCanvasRef.current) {
        const ov = overlayCanvasRef.current;
        const dx = width / 2 + (-180 - cLon) * curPpd;
        const dy = height / 2 + (cLat - 85) * curPpd;
        const dw = 360 * curPpd;
        const dh = 170 * curPpd;

        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(ov, 0, 0, ov.width, ov.height, dx, dy, dw, dh);
        ctx.restore();
      }

      // Subtle frame border around single Mars projection when zoomed out
      const mapLeft = width / 2 + (-180 - cLon) * curPpd;
      const mapTop = height / 2 + (cLat - 90) * curPpd;
      const mapW = 360 * curPpd;
      const mapH = 180 * curPpd;
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
      ctx.lineWidth = 1;
      ctx.strokeRect(mapLeft, mapTop, mapW, mapH);
      ctx.restore();

      // Linear single-map projection — zoom-invariant!
      const toScreen = (lat: number, lon: number) => ({
        x: width / 2 + (lon - cLon) * curPpd,
        y: height / 2 + (cLat - lat) * curPpd,
      });

      // 3. Subtle NASA-style Graticule bounded inside single Mars [-180, 180]
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

      const gridLeftX = Math.max(0, mapLeft);
      const gridRightX = Math.min(width, mapLeft + mapW);
      const gridTopY = Math.max(0, mapTop);
      const gridBotY = Math.min(height, mapTop + mapH);

      ctx.beginPath();
      for (let lat = -60; lat <= 60; lat += stepDeg) {
        const y = height / 2 + (cLat - lat) * curPpd;
        if (y < Math.max(52, gridTopY) || y > Math.min(height - 48, gridBotY)) continue;
        ctx.moveTo(gridLeftX, y);
        ctx.lineTo(gridRightX, y);
      }
      const lonStart = Math.max(
        -180,
        Math.ceil((cLon - width / 2 / curPpd) / stepDeg) * stepDeg
      );
      const lonEnd = Math.min(
        180,
        Math.floor((cLon + width / 2 / curPpd) / stepDeg) * stepDeg
      );
      for (let lon = lonStart; lon <= lonEnd; lon += stepDeg) {
        const x = width / 2 + (lon - cLon) * curPpd;
        if (x < 24 || x > width - 24) continue;
        ctx.moveTo(x, gridTopY);
        ctx.lineTo(x, gridBotY);
      }
      ctx.stroke();

      for (let lat = -60; lat <= 60; lat += stepDeg) {
        const y = height / 2 + (cLat - lat) * curPpd;
        if (y < Math.max(52, gridTopY) || y > Math.min(height - 48, gridBotY)) continue;
        ctx.fillText(
          lat === 0 ? '0° EQ' : lat > 0 ? `${lat}°N` : `${Math.abs(lat)}°S`,
          Math.max(14, gridLeftX + 10),
          y - 4
        );
      }
      for (let lon = lonStart; lon <= lonEnd; lon += stepDeg) {
        const x = width / 2 + (lon - cLon) * curPpd;
        if (x < 24 || x > width - 24) continue;
        ctx.fillText(`${lon}°E`, x + 4, Math.min(height - 64, gridBotY - 8));
      }
      ctx.restore();

      // 4. Computed A* Navigation Route
      if (curStart && curDest) {
        if (curRoute.found && curRoute.points.length > 1) {
          ctx.save();
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          ctx.beginPath();
          for (let idx = 0; idx < curRoute.points.length; idx++) {
            const p = toScreen(curRoute.points[idx].lat, curRoute.points[idx].lon);
            if (idx === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          }
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
          ctx.lineWidth = 7;
          ctx.stroke();

          for (let i = 1; i < curRoute.points.length; i++) {
            const p0 = toScreen(curRoute.points[i - 1].lat, curRoute.points[i - 1].lon);
            const p1 = toScreen(curRoute.points[i].lat, curRoute.points[i].lon);
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

          // If snapped to closest safe point near an impassable cliff, show subtle amber connector to original click
          if (curRoute.snappedToSafeApproach && curRoute.originalDest) {
            const endPt = curRoute.points[curRoute.points.length - 1];
            const pSafe = toScreen(endPt.lat, endPt.lon);
            const pOrig = toScreen(curRoute.originalDest.lat, curRoute.originalDest.lon);
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(pSafe.x, pSafe.y);
            ctx.lineTo(pOrig.x, pOrig.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.75)';
            ctx.beginPath();
            ctx.arc(pOrig.x, pOrig.y, 5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }

          ctx.restore();
        } else if (!curRoute.found && curRoute.directDistanceKm > 0) {
          const pStart = toScreen(curStart.lat, curStart.lon);
          const pDest = toScreen(curDest.lat, curDest.lon);
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

      // 5. Landmarks with tier-based zoom decluttering + cached label widths
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
        if (lm.tier > maxTier) break;
        if (curSelectedLm && lm.id === curSelectedLm.id) continue;
        if (curFilter !== 'all' && lm.type !== curFilter) continue;
        drawLandmark(lm, false);
      }
      ctx.restore();

      // 6. Start & Target Pins (nullable until user picks them!)
      const drawPin = (
        lat: number,
        lon: number,
        label: string,
        color: string,
        activeHalo: boolean
      ) => {
        const p = toScreen(lat, lon);
        if (p.x < -30 || p.x > width + 30 || p.y < -30 || p.y > height + 30) {
          return;
        }
        ctx.save();
        if (activeHalo) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
          ctx.lineWidth = 1.2;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '600 10px "JetBrains Mono", monospace';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(3, 5, 8, 0.92)';
        ctx.fillText(label, p.x - tw / 2 + 1, p.y - 13);
        ctx.fillStyle = color;
        ctx.fillText(label, p.x - tw / 2, p.y - 14);
        ctx.restore();
      };

      if (curStart) {
        drawPin(
          curStart.lat,
          curStart.lon,
          'START',
          '#F8FAFC',
          propsRef.current.clickTool === 'start'
        );
      }
      if (curDest) {
        const targetCoord =
          curRoute.found && curRoute.snappedToSafeApproach && curRoute.points.length > 0
            ? curRoute.points[curRoute.points.length - 1]
            : curDest;
        drawPin(
          targetCoord.lat,
          targetCoord.lon,
          curRoute.found || !curStart ? 'TARGET' : 'BLOCKED',
          curRoute.found || !curStart ? '#38BDF8' : '#FB7185',
          propsRef.current.clickTool === 'destination'
        );
      }

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
        const clamped = clampSingleMapViewport(
          centerLat,
          centerLon,
          ppd,
          canvasSize.width,
          canvasSize.height
        );
        viewRef.current = clamped;
        lastEmittedRef.current = clamped;
      }
      scheduleDraw();
    }, [centerLat, centerLon, ppd, canvasSize.width, canvasSize.height, scheduleDraw]);

    useEffect(() => {
      scheduleDraw();
    }, [
      baseLayer,
      startCoord,
      destCoord,
      route,
      clickTool,
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

      const lon = v.lon + (sx - canvasSize.width / 2) / v.ppd;
      const lat = v.lat - (sy - canvasSize.height / 2) / v.ppd;
      if (lon < -180 || lon > 180 || lat < -85 || lat > 85) return null;
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
      const minPpd = getMinPpd(canvasSize.width, canvasSize.height);
      const nextPpd = clamp(v.ppd * factor, minPpd, 140);

      const mouseLon = v.lon + (sx - canvasSize.width / 2) / v.ppd;
      const mouseLat = v.lat - (sy - canvasSize.height / 2) / v.ppd;

      const rawLon = mouseLon - (sx - canvasSize.width / 2) / nextPpd;
      const rawLat = mouseLat + (sy - canvasSize.height / 2) / nextPpd;

      viewRef.current = clampSingleMapViewport(
        rawLat,
        rawLon,
        nextPpd,
        canvasSize.width,
        canvasSize.height
      );
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
        const rawLon = dragRef.current.startLon - dx / curPpd;
        const rawLat = dragRef.current.startLat + dy / curPpd;
        viewRef.current = clampSingleMapViewport(
          rawLat,
          rawLon,
          curPpd,
          canvasSize.width,
          canvasSize.height
        );
        scheduleDraw();
        return;
      }

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

      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const v = viewRef.current;

      // Direct click on existing START or TARGET pin enters relocate mode for that pin
      if (clickTool === null && onPinClick) {
        if (startCoord) {
          const px = canvasSize.width / 2 + (startCoord.lon - v.lon) * v.ppd;
          const py = canvasSize.height / 2 + (v.lat - startCoord.lat) * v.ppd;
          if (Math.hypot(sx - px, sy - py) < 18) {
            onPinClick('start');
            return;
          }
        }
        if (destCoord) {
          const effectiveDest =
            route.found && route.snappedToSafeApproach && route.points.length > 0
              ? route.points[route.points.length - 1]
              : destCoord;
          const px = canvasSize.width / 2 + (effectiveDest.lon - v.lon) * v.ppd;
          const py = canvasSize.height / 2 + (v.lat - effectiveDest.lat) * v.ppd;
          if (Math.hypot(sx - px, sy - py) < 18) {
            onPinClick('destination');
            return;
          }
        }
      }

      const coord = screenToLatLon(e.clientX, e.clientY);
      if (!coord) return;

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

      const cx = canvasSize.width / 2 + (coord.lon - v.lon) * v.ppd;
      const cy = canvasSize.height / 2 + (v.lat - coord.lat) * v.ppd;

      let closestLm: Landmark | null = null;
      let closestScore = 20;
      for (let i = 0; i < SORTED_LANDMARKS.length; i++) {
        const lm = SORTED_LANDMARKS[i];
        if (lm.tier > maxHitTier && lm.id !== selectedLandmark?.id) continue;
        if (landmarkTypeFilter !== 'all' && lm.type !== landmarkTypeFilter) continue;
        const lx = canvasSize.width / 2 + (lm.lon - v.lon) * v.ppd;
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

    const bearing =
      startCoord && destCoord
        ? computeBearingDeg(
            startCoord.lat,
            startCoord.lon,
            destCoord.lat,
            destCoord.lon
          )
        : 0;

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
              <span>
                HDG {startCoord && destCoord ? `${String(bearing).padStart(3, '0')}°` : '---'}
              </span>
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
