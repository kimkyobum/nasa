import React, { useEffect, useRef } from 'react';
import { sampleMarsTelemetry } from '../data/marsData';
import { RouteResult } from '../types/mars';

interface MarsZoomedPhotoCanvasProps {
  lat: number;
  lon: number;
  overlayMola?: boolean;
  route?: RouteResult;
  startCoord?: { lat: number; lon: number } | null;
  destCoord?: { lat: number; lon: number } | null;
  className?: string;
}

const LAYER_PATHS = {
  viking: 'Mars_Viking_MDIM21_ClrMosaic_global_232m',
  mola: 'Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw',
  molaFallback: 'Mars_MGS_MOLA_ClrShade_merge_global_463m',
};

const zoomPhotoTileCache = new Map<string, HTMLImageElement | 'loading' | 'error'>();

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function wrapDeltaLon(lonA: number, lonB: number): number {
  let d = lonA - lonB;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

export const MarsZoomedPhotoCanvas: React.FC<MarsZoomedPhotoCanvasProps> = ({
  lat,
  lon,
  overlayMola = false,
  route,
  startCoord,
  destCoord,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawScheduledRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;

    const requestTile = (
      layer: 'viking' | 'mola',
      z: number,
      y: number,
      x: number
    ) => {
      const key = `${layer}/${z}/${y}/${x}`;
      const cached = zoomPhotoTileCache.get(key);
      if (cached) return cached;

      zoomPhotoTileCache.set(key, 'loading');
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        zoomPhotoTileCache.set(key, img);
        if (!cancelled) scheduleDraw();
      };
      img.onerror = () => {
        if (layer === 'mola') {
          const fb = new Image();
          fb.crossOrigin = 'anonymous';
          fb.onload = () => {
            zoomPhotoTileCache.set(key, fb);
            if (!cancelled) scheduleDraw();
          };
          fb.onerror = () => {
            zoomPhotoTileCache.set(key, 'error');
          };
          fb.src = `https://trek.nasa.gov/tiles/Mars/EQ/${LAYER_PATHS.molaFallback}/1.0.0/default/default028mm/${z}/${y}/${x}.jpg`;
        } else {
          zoomPhotoTileCache.set(key, 'error');
        }
      };
      img.src = `https://trek.nasa.gov/tiles/Mars/EQ/${LAYER_PATHS[layer]}/1.0.0/default/default028mm/${z}/${y}/${x}.jpg`;
      return 'loading' as const;
    };

    const drawLayer = (
      ctx: CanvasRenderingContext2D,
      layer: 'viking' | 'mola',
      z: number,
      alpha: number,
      w: number,
      h: number,
      ppd: number
    ) => {
      const numCols = 1 << (z + 1);
      const numRows = 1 << z;
      const tileDeg = 180 / numRows;

      const halfLon = w / 2 / ppd;
      const halfLat = h / 2 / ppd;
      const lonLeft = clamp(lon - halfLon, -180, 180);
      const lonRight = clamp(lon + halfLon, -180, 180);
      const latTop = clamp(lat + halfLat, -90, 90);
      const latBottom = clamp(lat - halfLat, -90, 90);

      const colStart = clamp(Math.floor((lonLeft + 180) / tileDeg), 0, numCols - 1);
      const colEnd = clamp(Math.floor((lonRight + 180) / tileDeg), 0, numCols - 1);
      const rowStart = clamp(Math.floor((90 - latTop) / tileDeg), 0, numRows - 1);
      const rowEnd = clamp(Math.floor((90 - latBottom) / tileDeg), 0, numRows - 1);

      ctx.save();
      ctx.globalAlpha = alpha;
      for (let r = rowStart; r <= rowEnd; r++) {
        const tLatTop = 90 - r * tileDeg;
        const sy = h / 2 + (lat - tLatTop) * ppd;
        const sh = tileDeg * ppd;
        for (let c = colStart; c <= colEnd; c++) {
          const tLonLeft = -180 + c * tileDeg;
          const sx = w / 2 + (tLonLeft - lon) * ppd;
          const sw = tileDeg * ppd;

          const tile = requestTile(layer, z, r, c);
          if (tile instanceof HTMLImageElement) {
            ctx.drawImage(tile, sx - 0.3, sy - 0.3, sw + 0.6, sh + 0.6);
          } else {
            let drewFallback = false;
            for (let pz = z - 1; pz >= 2; pz--) {
              const scale = 1 << (z - pz);
              const pr = Math.floor(r / scale);
              const pc = Math.floor(c / scale);
              const pTile = requestTile(layer, pz, pr, pc);
              if (pTile instanceof HTMLImageElement) {
                const subW = pTile.width / scale;
                const subH = pTile.height / scale;
                const subX = (c % scale) * subW;
                const subY = (r % scale) * subH;
                ctx.drawImage(
                  pTile,
                  subX,
                  subY,
                  subW,
                  subH,
                  sx - 0.3,
                  sy - 0.3,
                  sw + 0.6,
                  sh + 0.6
                );
                drewFallback = true;
                break;
              }
            }
            if (!drewFallback) {
              ctx.fillStyle = '#1b110d';
              ctx.fillRect(sx, sy, sw, sh);
            }
          }
        }
      }
      ctx.restore();
    };

    const draw = () => {
      drawScheduledRef.current = false;
      if (cancelled || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(120, Math.round(rect.width));
      const h = Math.max(100, Math.round(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#140c09';
      ctx.fillRect(0, 0, w, h);

      // Zoomed view (~2.6° horizontal span across the preview pane)
      const ppd = w / 2.6;
      const z = 6;
      drawLayer(ctx, 'viking', z, 1.0, w, h, ppd);
      if (overlayMola) {
        drawLayer(ctx, 'mola', 5, 0.38, w, h, ppd);
      }

      const toScreen = (pLat: number, pLon: number) => ({
        x: w / 2 + wrapDeltaLon(pLon, lon) * ppd,
        y: h / 2 + (lat - pLat) * ppd,
      });

      // Render Active Rover Route across the zoomed satellite photo if present
      if (route?.found && route.points.length >= 2) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const pts = route.points.map((pt) => toScreen(pt.lat, pt.lon));

        // Dark contrast casing
        ctx.strokeStyle = 'rgba(4, 9, 18, 0.78)';
        ctx.lineWidth = 5.5;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.stroke();

        // Bright cyan core path
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.stroke();

        // Directional chevron ticks every ~48px inside visible bounds
        let accumDist = 20;
        for (let i = 1; i < pts.length; i++) {
          const p0 = pts[i - 1];
          const p1 = pts[i];
          const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
          if (segLen < 1) continue;
          accumDist += segLen;
          if (accumDist >= 48) {
            accumDist = 0;
            const mx = (p0.x + p1.x) * 0.5;
            const my = (p0.y + p1.y) * 0.5;
            if (mx >= -10 && mx <= w + 10 && my >= -10 && my <= h + 10) {
              const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
              ctx.save();
              ctx.translate(mx, my);
              ctx.rotate(ang);
              ctx.fillStyle = '#F8FAFC';
              ctx.beginPath();
              ctx.moveTo(4.5, 0);
              ctx.lineTo(-3, -3.2);
              ctx.lineTo(-1.5, 0);
              ctx.lineTo(-3, 3.2);
              ctx.closePath();
              ctx.fill();
              ctx.restore();
            }
          }
        }

        // Intermediate waypoints if visible inside zoomed view
        for (const wp of route.waypoints) {
          if (wp.tag === 'start' || wp.tag === 'target') continue;
          const sp = toScreen(wp.lat, wp.lon);
          if (sp.x < -12 || sp.x > w + 12 || sp.y < -12 || sp.y > h + 12) continue;
          ctx.fillStyle = '#070c16';
          ctx.strokeStyle = wp.tag === 'avoid' ? '#FBBF24' : '#38BDF8';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 7.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.font = '700 8.5px "JetBrains Mono", monospace';
          ctx.fillStyle = '#F8FAFC';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(wp.index), sp.x, sp.y + 0.5);
        }
        ctx.restore();
      }

      // Draw START / TARGET pins if inside zoomed view
      const drawEndpointPin = (
        pLat: number,
        pLon: number,
        label: string,
        color: string
      ) => {
        const sp = toScreen(pLat, pLon);
        if (sp.x < -20 || sp.x > w + 20 || sp.y < -20 || sp.y > h + 20) return;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '700 9px "JetBrains Mono", monospace';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(3, 7, 14, 0.85)';
        ctx.fillRect(sp.x - tw / 2 - 3, sp.y - 22, tw + 6, 12);
        ctx.fillStyle = color;
        ctx.fillText(label, sp.x - tw / 2, sp.y - 13);
        ctx.restore();
      };

      if (startCoord) {
        drawEndpointPin(startCoord.lat, startCoord.lon, 'START', '#F8FAFC');
      }
      if (destCoord) {
        const target =
          route?.found && route.snappedToSafeApproach && route.points.length > 0
            ? route.points[route.points.length - 1]
            : destCoord;
        drawEndpointPin(
          target.lat,
          target.lon,
          route?.found || !startCoord ? 'TARGET' : 'BLOCKED',
          route?.found || !startCoord ? '#38BDF8' : '#FB7185'
        );
      }

      // Subtle AR target reticle in center
      const cx = w / 2;
      const cy = h / 2;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx - 18, cy);
      ctx.lineTo(cx - 7, cy);
      ctx.moveTo(cx + 7, cy);
      ctx.lineTo(cx + 18, cy);
      ctx.moveTo(cx, cy - 18);
      ctx.lineTo(cx, cy - 7);
      ctx.moveTo(cx, cy + 7);
      ctx.lineTo(cx, cy + 18);
      ctx.stroke();

      ctx.fillStyle = '#38BDF8';
      ctx.beginPath();
      ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Scale bar (~50 km)
      const kmPerDegAtLat = 59.16 * Math.max(0.2, Math.cos((lat * Math.PI) / 180));
      const barKm = 50;
      const barPx = clamp((barKm / kmPerDegAtLat) * ppd, 24, w * 0.45);
      const bx = w - 10 - barPx;
      const by = h - 10;

      ctx.fillStyle = 'rgba(3, 7, 14, 0.72)';
      ctx.fillRect(bx - 5, by - 15, barPx + 10, 18);
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.85)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(bx, by - 3);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx + barPx, by);
      ctx.lineTo(bx + barPx, by - 3);
      ctx.stroke();

      ctx.font = '600 9px "JetBrains Mono", monospace';
      ctx.fillStyle = '#E2E8F0';
      ctx.fillText(`${barKm} km`, bx + 2, by - 5);

      // Elevation pill top-right
      const pt = sampleMarsTelemetry(lat, lon);
      const elevLabel = `${pt.elevationM >= 0 ? '+' : ''}${pt.elevationM.toLocaleString()}m`;
      const tw = ctx.measureText(elevLabel).width;
      ctx.fillStyle = 'rgba(3, 7, 14, 0.74)';
      ctx.fillRect(w - tw - 16, 8, tw + 10, 16);
      ctx.fillStyle = '#BAE6FD';
      ctx.fillText(elevLabel, w - tw - 11, 19);

      ctx.restore();
    };

    const scheduleDraw = () => {
      if (drawScheduledRef.current) return;
      drawScheduledRef.current = true;
      requestAnimationFrame(draw);
    };

    const ro = new ResizeObserver(() => scheduleDraw());
    ro.observe(canvas);
    scheduleDraw();

    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [lat, lon, overlayMola, route, startCoord, destCoord]);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full block ${className}`}
    />
  );
};
