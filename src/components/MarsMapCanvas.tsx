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
  RoutePoint,
  RouteResult,
  RouteWaypoint,
  SensorLayers,
} from '../types/mars';

import { Language } from '../i18n/LanguageContext';

interface MarsMapCanvasProps {
  language: Language;
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
  highlightedRoutePoint?: RoutePoint | null;
  hoveredTelemetry?: MarsTelemetryPoint | null;
  hoveredWaypointIndex?: number | null;
  chartOpen?: boolean;
  onHoverPoint: (pt: MarsTelemetryPoint | null) => void;
  onHoverWaypoint?: (
    wp: RouteWaypoint | null,
    screenPos?: { x: number; y: number }
  ) => void;
  onMapClick: (pt: MarsTelemetryPoint, screenPos?: { x: number; y: number }) => void;
  onPinClick?: (pin: 'start' | 'destination') => void;
  onSelectLandmark: (lm: Landmark | null) => void;
  onShowArGuide?: () => void;
}

const LAYER_PATHS: Record<'viking' | 'mola' | 'molaFallback', string> = {
  viking: 'Mars_Viking_MDIM21_ClrMosaic_global_232m',
  mola: 'Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw',
  molaFallback: 'Mars_MGS_MOLA_ClrShade_merge_global_463m',
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

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

// Cover-fit minimum PPD: guarantees Mars (-180..+180, -90..+90) always fills 100% of the viewport with zero black bars
function getMinPpd(width: number, height: number): number {
  return Math.max(width / 360, height / 180);
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
  const maxPanLon = Math.max(0, 180 - halfScreenLon);
  const nextLon = clamp(lon, -maxPanLon, maxPanLon);

  const halfScreenLat = height / 2 / nextPpd;
  const maxPanLat = Math.max(0, 90 - halfScreenLat);
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

// Discrete 5-tier color ramp for MOLA elevation
function elevationToRgb(elevM: number): [number, number, number] {
  if (elevM < -3000) return [37, 99, 235];   // 초저지대: 진한 파랑
  if (elevM < 0) return [6, 182, 212];       // 북부/분지 저지대: 청록
  if (elevM < 3000) return [34, 197, 94];    // 기준 평지: 초록
  if (elevM < 7500) return [245, 158, 11];   // 고원/산록: 노랑·주황
  return [220, 38, 38];                      // 화산 고산대: 진빨강
}

export const MarsMapCanvas: React.FC<MarsMapCanvasProps> = React.memo(
  ({
    language,
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
    highlightedRoutePoint,
    hoveredTelemetry,
    hoveredWaypointIndex,
    chartOpen,
    onHoverPoint,
    onHoverWaypoint,
    onMapClick,
    onPinClick,
    onSelectLandmark,
    onShowArGuide,
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
      language,
      baseLayer,
      startCoord,
      destCoord,
      route,
      clickTool,
      arVisorMode,
      selectedPoint,
      selectedLandmark,
      landmarkTypeFilter,
      highlightedRoutePoint,
      hoveredWaypointIndex,
      canvasSize,
      onViewportChange,
    });
    propsRef.current = {
      language,
      baseLayer,
      startCoord,
      destCoord,
      route,
      clickTool,
      arVisorMode,
      selectedPoint,
      selectedLandmark,
      landmarkTypeFilter,
      highlightedRoutePoint,
      hoveredWaypointIndex,
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
          if (layerKey === 'mola') {
            const fb = new Image();
            fb.crossOrigin = 'anonymous';
            fb.onload = () => {
              tileCache.set(key, { status: 'ready', img: fb });
              scheduleDrawRef.current();
            };
            fb.onerror = () => {
              tileCache.set(key, { status: 'error' });
            };
            fb.src = `https://trek.nasa.gov/tiles/Mars/EQ/${LAYER_PATHS.molaFallback}/1.0.0/default/default028mm/${z}/${y}/${x}.jpg`;
          } else {
            tileCache.set(key, { status: 'error' });
          }
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

      const prev = viewRef.current;
      const clamped = clampSingleMapViewport(
        prev.lat,
        prev.lon,
        prev.ppd,
        canvasSize.width,
        canvasSize.height
      );
      const changed =
        Math.abs(clamped.ppd - prev.ppd) > 0.02 ||
        Math.abs(clamped.lat - prev.lat) > 0.02 ||
        Math.abs(clamped.lon - prev.lon) > 0.02;
      viewRef.current = clamped;
      if (changed) {
        lastEmittedRef.current = clamped;
        propsRef.current.onViewportChange(clamped.lat, clamped.lon, clamped.ppd);
      }
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
      const { water, elevM, geo, slopeX10, farmingTierCode } = atlas;
      const alphaScale = clamp(layerOpacity, 0.2, 1.0);

      for (let i = 0; i < total; i++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;

        // 1. MOLA Elevation 5-tier color ramp
        if (layers.elevation) {
          const [er, eg, eb] = elevationToRgb(elevM[i]);
          r = er;
          g = eg;
          b = eb;
          a = Math.max(a, elevM[i] > 7500 ? 132 : 112);
        }

        // 2. SWIM Subsurface Water probability — distinct 5-tier density blues
        if (layers.swimWater) {
          const wVal = water[i];
          let wr = 148,
            wg = 163,
            wb = 184,
            wa = 18;
          if (wVal >= 80) {
            wr = 30; wg = 64; wb = 175; wa = 176;     // 핵심 지하 얼음: 진한 남청
          } else if (wVal >= 65) {
            wr = 37; wg = 99; wb = 235; wa = 144;     // 고농도 지하수: 진파랑
          } else if (wVal >= 45) {
            wr = 14; wg = 165; wb = 233; wa = 104;    // 유망 지대: 선명 청색
          } else if (wVal >= 25) {
            wr = 56; wg = 189; wb = 248; wa = 58;     // 미량 함수: 연하늘
          }
          if (a === 0) {
            r = wr; g = wg; b = wb; a = wa;
          } else {
            const blend = wa / 180;
            r = Math.round(r * (1 - blend) + wr * blend);
            g = Math.round(g * (1 - blend) + wg * blend);
            b = Math.round(b * (1 - blend) + wb * blend);
            a = Math.max(a, wa);
          }
        }

        // 3. CRISM Farming Suitability — 100% synced 5-tier colors matching click telemetry!
        // 4: optimal(파랑), 3: suitable(초록), 2: possible(노랑~주황), 1: unsuitable(빨강), 0: lethal(진갈색)
        if (layers.soilFertility) {
          const code = farmingTierCode[i];
          let sr = 107,
            sg = 52,
            sb = 16,
            sa = 158;
          if (code === 4) {
            sr = 37; sg = 130; sb = 246; sa = 138;    // 파랑: 농업 최상
          } else if (code === 3) {
            sr = 16; sg = 185; sb = 129; sa = 132;    // 초록: 농업 적합
          } else if (code === 2) {
            sr = 245; sg = 158; sb = 11; sa = 116;    // 노랑~주황: 농업 가능성 있음
          } else if (code === 1) {
            sr = 239; sg = 68; sb = 68; sa = 124;     // 빨강: 농업 불가
          } else {
            sr = 107; sg = 52; sb = 16; sa = 164;     // 갈색: 진입 극위험
          }
          if (a === 0) {
            r = sr; g = sg; b = sb; a = sa;
          } else {
            r = Math.round(r * 0.35 + sr * 0.65);
            g = Math.round(g * 0.35 + sg * 0.65);
            b = Math.round(b * 0.35 + sb * 0.65);
            a = Math.max(a, sa);
          }
        }

        // 4. Volcano & Geothermal Zones (3 clear temperature tiers)
        if (layers.geothermal && geo[i] >= 25) {
          const gVal = geo[i];
          let gr = 253,
            gg = 224,
            gb = 71,
            ga = 68;
          if (gVal >= 75) {
            gr = 220; gg = 38; gb = 38; ga = 158;     // 고열 화산·열수 핵심
          } else if (gVal >= 50) {
            gr = 249; gg = 115; gb = 22; ga = 118;    // 화산 지열대
          }
          if (a === 0) {
            r = gr; g = gg; b = gb; a = ga;
          } else {
            r = Math.round(r * 0.35 + gr * 0.65);
            g = Math.round(g * 0.35 + gg * 0.65);
            b = Math.round(b * 0.35 + gb * 0.65);
            a = Math.max(a, ga);
          }
        }

        // 5. Steep Slope / Cliff Hazard Zones (4 explicit slope tiers)
        if (layers.slopeHazard && slopeX10[i] >= 70) {
          const s10 = slopeX10[i];
          let hr = 250,
            hg = 204,
            hb = 21,
            ha = 64;
          if (s10 >= 250) {
            hr = 107; hg = 40; hb = 20; ha = 180;     // >=25° 극위험 절벽(갈색)
          } else if (s10 >= 180) {
            hr = 239; hg = 68; hb = 68; ha = 150;     // 18~24.9° 전복 위험(빨강)
          } else if (s10 >= 120) {
            hr = 249; hg = 115; hb = 22; ha = 112;    // 12~17.9° 급경사(주황)
          }
          if (a === 0) {
            r = hr; g = hg; b = hb; a = ha;
          } else {
            r = Math.round(r * 0.3 + hr * 0.7);
            g = Math.round(g * 0.3 + hg * 0.7);
            b = Math.round(b * 0.3 + hb * 0.7);
            a = Math.max(a, ha);
          }
        }

        const p = i * 4;
        data[p] = r;
        data[p + 1] = g;
        data[p + 2] = b;
        data[p + 3] = Math.min(225, Math.round(a * alphaScale));
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
        language: curLanguage,
        baseLayer: curBaseLayer,
        startCoord: curStart,
        destCoord: curDest,
        route: curRoute,
        arVisorMode: curAr,
        selectedPoint: curSelectedPt,
        selectedLandmark: curSelectedLm,
        landmarkTypeFilter: curFilter,
        highlightedRoutePoint: curRouteBeacon,
        hoveredWaypointIndex: curHoverWpIdx,
        canvasSize: curSize,
      } = propsRef.current;

      const { lat: cLat, lon: cLon, ppd: curPpd } = viewRef.current;
      const { width, height } = curSize;
      const dpr = canvas.width / Math.max(1, width);

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Base fill behind Mars tiles
      ctx.fillStyle = '#120a07';
      ctx.fillRect(0, 0, width, height);

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

      const mapLeft = width / 2 + (-180 - cLon) * curPpd;
      const mapTop = height / 2 + (cLat - 90) * curPpd;
      const mapW = 360 * curPpd;
      const mapH = 180 * curPpd;

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
          ctx.lineWidth = 3.5;
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
            ctx.lineWidth = 1.4;
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
            const isWpHovered = curHoverWpIdx === wp.index;
            ctx.save();
            const wpColor =
              wp.tag === 'avoid'
                ? '#FBBF24'
                : wp.tag === 'water'
                  ? '#38BDF8'
                  : '#E2E8F0';
            if (isWpHovered) {
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
              ctx.lineWidth = 1.6;
              ctx.beginPath();
              ctx.arc(p.x, p.y, 12.5, 0, Math.PI * 2);
              ctx.stroke();
            }
            ctx.fillStyle = isWpHovered ? '#0F172A' : '#070A10';
            ctx.strokeStyle = wpColor;
            ctx.lineWidth = isWpHovered ? 2.2 : 1.5;
            ctx.beginPath();
            ctx.arc(p.x, p.y, isWpHovered ? 9 : 7.5, 0, Math.PI * 2);
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

          // Chart-hovered live route sync beacon on the Mars map!
          if (curRouteBeacon) {
            const bp = toScreen(curRouteBeacon.lat, curRouteBeacon.lon);
            ctx.save();
            ctx.fillStyle = 'rgba(251, 191, 36, 0.25)';
            ctx.beginPath();
            ctx.arc(bp.x, bp.y, 13, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#FBBF24';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(bp.x, bp.y, 8, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(bp.x, bp.y, 3.8, 0, Math.PI * 2);
            ctx.fill();

            const waterWord = curLanguage === 'en' ? 'Water' : '물';
            const tag = `${curRouteBeacon.distanceFromStartKm}km · ${curRouteBeacon.elevationM.toLocaleString()}m · ${waterWord} ${curRouteBeacon.waterProb}%`;
            ctx.font = '600 10px "JetBrains Mono", monospace';
            const tw = ctx.measureText(tag).width;
            const bx = clamp(bp.x - tw / 2 - 7, 10, width - tw - 24);
            const by = Math.max(56, bp.y - 32);
            ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.75)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(bx, by, tw + 14, 20, 5);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#FEF3C7';
            ctx.textBaseline = 'middle';
            ctx.fillText(tag, bx + 7, by + 10);
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
        const lmLabel = curLanguage === 'en' ? lm.nameEn : lm.nameKo;
        const fontStr = isBold
          ? '600 12px "Plus Jakarta Sans", "IBM Plex Sans KR", sans-serif'
          : '400 11px "Plus Jakarta Sans", "IBM Plex Sans KR", sans-serif';
        const cacheKey = `${curLanguage}:${isBold ? '1' : '0'}:${lmLabel}`;
        let tw = labelWidthCache.get(cacheKey);
        if (tw === undefined) {
          ctx.font = fontStr;
          tw = ctx.measureText(lmLabel).width;
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
          ctx.fillText(lmLabel, lx + 1, ly + 1);
          ctx.fillStyle = isSelected
            ? '#FFFFFF'
            : lm.tier === 1
              ? '#F8FAFC'
              : lm.tier === 2
                ? '#E2E8F0'
                : '#CBD5E1';
          ctx.fillText(lmLabel, lx, ly);
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
      language,
      baseLayer,
      startCoord,
      destCoord,
      route,
      clickTool,
      arVisorMode,
      selectedPoint,
      selectedLandmark,
      landmarkTypeFilter,
      highlightedRoutePoint,
      hoveredWaypointIndex,
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

      const lon = clamp(v.lon + (sx - canvasSize.width / 2) / v.ppd, -180, 180);
      const lat = clamp(v.lat - (sy - canvasSize.height / 2) / v.ppd, -89.9, 89.9);
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
      const nextPpd = clamp(v.ppd * factor, minPpd, 480);

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

      const canvas = canvasRef.current;
      if (canvas && onHoverWaypoint) {
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const v = viewRef.current;
        const wps = propsRef.current.route.waypoints;
        let hitWp: RouteWaypoint | null = null;
        let hitPos: { x: number; y: number } | undefined;
        let bestDist = 15;
        for (let i = 0; i < wps.length; i++) {
          const wp = wps[i];
          const wx = canvasSize.width / 2 + (wp.lon - v.lon) * v.ppd;
          const wy = canvasSize.height / 2 + (v.lat - wp.lat) * v.ppd;
          const d = Math.hypot(sx - wx, sy - wy);
          if (d < bestDist) {
            bestDist = d;
            hitWp = wp;
            hitPos = { x: wx, y: wy };
          }
        }
        onHoverWaypoint(hitWp, hitPos);
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
        const lx = canvasSize.width / 2 + (closestLm.lon - v.lon) * v.ppd;
        const ly = canvasSize.height / 2 + (v.lat - closestLm.lat) * v.ppd;
        onSelectLandmark(closestLm);
        onMapClick(sampleMarsTelemetry(closestLm.lat, closestLm.lon), {
          x: rect.left + lx,
          y: rect.top + ly,
        });
      } else {
        onMapClick(sampleMarsTelemetry(coord.lat, coord.lon), {
          x: e.clientX,
          y: e.clientY,
        });
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
            onHoverWaypoint?.(null);
          }}
          className={`w-full h-full block ${
            cursorGrabbing ? 'cursor-grabbing' : 'cursor-crosshair'
          }`}
        />

        {/* AR Spacesuit Visor HUD Overlay (only when AR mode is toggled) */}
        {arVisorMode && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-cyan-300/65" />
            <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-cyan-300/65" />
            <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-cyan-300/65" />
            <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-cyan-300/65" />

            <div className="pointer-events-auto absolute top-4 left-1/2 -translate-x-1/2 bg-slate-900/45 backdrop-blur-md border border-cyan-300/45 px-4 py-1.5 rounded-lg flex items-center gap-3.5 text-xs font-mono text-cyan-200 shadow-lg">
              <Compass className="w-3.5 h-3.5 text-cyan-300" />
              <span>
                HDG {startCoord && destCoord ? `${String(bearing).padStart(3, '0')}°` : '---'}
              </span>
              <span className="text-white/25">|</span>
              <span>
                DIST {route.found ? `${route.totalDistanceKm} km` : '--'}
              </span>
              <span className="text-white/25">|</span>
              <span>
                ETA {route.found ? `${route.estimatedHoursRover} h` : '--'}
              </span>
              {onShowArGuide && (
                <>
                  <span className="text-white/25">|</span>
                  <button
                    type="button"
                    onClick={onShowArGuide}
                    className="text-[11px] font-sans font-medium text-cyan-200 hover:text-white underline underline-offset-2"
                  >
                    {language === 'en' ? '? Guide' : '? 사용법'}
                  </button>
                </>
              )}
            </div>

            {hoveredTelemetry && (
              <div
                className={`absolute left-1/2 -translate-x-1/2 bg-slate-900/45 backdrop-blur-md border border-cyan-300/35 px-4 py-1.5 rounded-lg flex items-center gap-3 text-[11px] font-mono text-cyan-100 whitespace-nowrap ${
                  chartOpen ? 'top-[60px]' : 'bottom-6'
                }`}
              >
                <span>
                  SCAN {hoveredTelemetry.lat.toFixed(1)}°, {hoveredTelemetry.lon.toFixed(1)}°
                </span>
                <span className="text-white/25">|</span>
                <span>
                  {language === 'en' ? 'ELEV' : '고도'} {hoveredTelemetry.elevationM.toLocaleString()}m
                </span>
                <span className="text-white/25">|</span>
                <span
                  className={
                    hoveredTelemetry.slopeDeg >= 18
                      ? 'text-rose-300 font-bold'
                      : hoveredTelemetry.slopeDeg >= 10
                        ? 'text-amber-300'
                        : 'text-emerald-300'
                  }
                >
                  {language === 'en' ? 'SLOPE' : '경사'} {hoveredTelemetry.slopeDeg}°
                </span>
                <span className="text-white/25">|</span>
                <span className="text-sky-300">
                  {language === 'en' ? 'WATER' : '지하수'} {hoveredTelemetry.combinedWaterProb}%
                </span>
                <span className="text-white/25">|</span>
                <span className="font-sans font-medium text-white">
                  {language === 'en' ? hoveredTelemetry.farmingLabelEn : hoveredTelemetry.farmingLabelKo}
                </span>
              </div>
            )}

            <div className="absolute top-1/2 left-7 -translate-y-1/2 flex flex-col gap-3 text-[10px] font-mono text-cyan-300/75">
              <span>+10° ─</span>
              <span className="text-cyan-200">00° ━━</span>
              <span>-10° ─</span>
            </div>
            <div className="absolute top-1/2 right-16 -translate-y-1/2 flex flex-col gap-3 text-[10px] font-mono text-cyan-300/75 text-right">
              <span>─ +10°</span>
              <span className="text-cyan-200">━━ 00°</span>
              <span>─ -10°</span>
            </div>
          </div>
        )}
      </div>
    );
  }
);
