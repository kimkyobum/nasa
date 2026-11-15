import React, { useMemo, useState } from 'react';
import {
  Box,
  Compass,
  Grid,
  Maximize2,
  Minimize2,
  Navigation,
  RotateCw,
  X,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { Landmark, MarsTelemetryPoint, RouteResult } from '../types/mars';
import {
  CameraViewMode,
  MarsRegion3DViewer,
  RouteGlideInfo,
} from './MarsRegion3DViewer';
import { MarsZoomedPhotoCanvas } from './MarsZoomedPhotoCanvas';

interface MarsRegionSidePanelProps {
  point: MarsTelemetryPoint;
  landmark: Landmark | null;
  drawerWidthPx: number;
  fullscreen3D: boolean;
  onSetDrawerWidth: (width: number) => void;
  onSetFullscreen3D: (fullscreen: boolean) => void;
  onJumpToCoord?: (lat: number, lon: number) => void;
  route?: RouteResult;
  startCoord?: { lat: number; lon: number } | null;
  destCoord?: { lat: number; lon: number } | null;
}

type PreviewLayout = 'split' | 'ar3d' | 'photo2d';

function formatCoord(lat: number, lon: number): string {
  const latStr = lat >= 0 ? `${lat.toFixed(2)}°N` : `${Math.abs(lat).toFixed(2)}°S`;
  return `${latStr}, ${lon.toFixed(2)}°E`;
}

function wrapDeltaLon(lonA: number, lonB: number): number {
  let d = lonA - lonB;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

function findClosestRoutePoint(
  lat: number,
  lon: number,
  route?: RouteResult
): { lat: number; lon: number; inPatch: boolean } | null {
  if (!route?.found || route.points.length < 2) return null;
  const halfPatchDeg = 2.05;
  let bestDist = Infinity;
  let bestPt = route.points[0];
  let inPatch = false;

  for (const p of route.points) {
    const dLat = Math.abs(p.lat - lat);
    const dLon = Math.abs(wrapDeltaLon(p.lon, lon));
    if (dLat <= halfPatchDeg && dLon <= halfPatchDeg) {
      inPatch = true;
    }
    const d = Math.hypot(dLat, dLon);
    if (d < bestDist) {
      bestDist = d;
      bestPt = p;
    }
  }
  return { lat: bestPt.lat, lon: bestPt.lon, inPatch };
}

export const MarsRegionSidePanel: React.FC<MarsRegionSidePanelProps> = ({
  point,
  landmark,
  drawerWidthPx,
  fullscreen3D,
  onSetDrawerWidth,
  onSetFullscreen3D,
  onJumpToCoord,
  route,
  startCoord,
  destCoord,
}) => {
  const { language, setLanguage, pick } = useLanguage();
  const [layout, setLayout] = useState<PreviewLayout>('split');
  const [reliefScale, setReliefScale] = useState<number>(2);
  const [showArGrid, setShowArGrid] = useState<boolean>(true);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [molaTint2d, setMolaTint2d] = useState<boolean>(false);
  const [cameraViewMode, setCameraViewMode] = useState<CameraViewMode>('orbit');
  const [glideInfo, setGlideInfo] = useState<RouteGlideInfo | null>(null);

  const routeInfo = useMemo(
    () => findClosestRoutePoint(point.lat, point.lon, route),
    [point.lat, point.lon, route]
  );

  const hasRoute = Boolean(route?.found && route.points.length >= 2);

  const handleExpand3DFullscreen = () => {
    setLayout('ar3d');
    if (routeInfo && !routeInfo.inPatch && onJumpToCoord) {
      onJumpToCoord(routeInfo.lat, routeInfo.lon);
    }
    onSetFullscreen3D(true);
  };

  const handleExitFullscreen = () => {
    onSetFullscreen3D(false);
    setCameraViewMode('orbit');
  };

  return (
    <div className="h-full flex flex-col gap-3 text-slate-100 select-none">
      {/* Region Header + Window Size Controls */}
      <div className="flex items-center justify-between gap-2 shrink-0 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-white leading-tight truncate">
            {landmark ? pick(landmark.nameEn, landmark.nameKo) : pick('Selected Site', '선택 지점')}
          </h2>
          <div className="text-[11px] font-mono text-slate-300/85 mt-0.5 truncate">
            {glideInfo
              ? `${formatCoord(glideInfo.lat, glideInfo.lon)} · ${glideInfo.distanceKm}km · ${glideInfo.elevationM.toLocaleString()}m`
              : formatCoord(point.lat, point.lon)}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!fullscreen3D && (
            <>
              <button
                type="button"
                onClick={() => onSetDrawerWidth(384)}
                title={pick('Default panel width (384px)', '기본 창 폭 (384px)')}
                className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                  drawerWidthPx <= 430
                    ? 'bg-sky-500/25 border-sky-400/60 text-sky-100 font-semibold'
                    : 'bg-white/[0.06] border-white/15 text-slate-300 hover:text-white'
                }`}
              >
                {pick('Default', '기본')}
              </button>
              <button
                type="button"
                onClick={() => onSetDrawerWidth(560)}
                title={pick('Wide panel (560px)', '넓은 창 (560px)')}
                className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                  drawerWidthPx > 430
                    ? 'bg-sky-500/25 border-sky-400/60 text-sky-100 font-semibold'
                    : 'bg-white/[0.06] border-white/15 text-slate-300 hover:text-white'
                }`}
              >
                {pick('Wide', '넓게')}
              </button>
            </>
          )}

          {fullscreen3D ? (
            <>
              <div
                role="group"
                aria-label={pick('Language selector', '언어 선택')}
                className="flex items-center bg-slate-950/90 border border-white/20 rounded-lg p-0.5 mr-1"
              >
                <button
                  type="button"
                  onClick={() => setLanguage('en')}
                  className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded transition-colors ${
                    language === 'en'
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage('ko')}
                  className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-colors ${
                    language === 'ko'
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  한국어
                </button>
              </div>
              <button
                type="button"
                onClick={handleExitFullscreen}
                title={pick('Restore panel size (ESC)', '창 크기로 복원 (ESC)')}
                className="px-2.5 py-1 text-[11px] font-semibold text-white bg-white/15 hover:bg-white/25 border border-white/25 rounded-lg flex items-center gap-1 transition-colors"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span>{pick('Restore', '창 복원')}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleExpand3DFullscreen}
              title={pick('Fullscreen 3D view', '3D 전체화면으로 보기')}
              className="p-1.5 text-slate-200 hover:text-white bg-white/[0.08] hover:bg-white/20 border border-white/20 rounded-lg transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Split / Fullscreen Content */}
      <div className="flex-1 min-h-0 flex flex-col gap-3">
        {/* Top: Enlarged NASA Satellite Photo */}
        {layout !== 'ar3d' && !fullscreen3D && (
          <div className="relative flex-1 min-h-[180px] rounded-xl overflow-hidden border border-white/20 bg-[#140c09]">
            <MarsZoomedPhotoCanvas
              lat={point.lat}
              lon={point.lon}
              overlayMola={molaTint2d}
              route={route}
              startCoord={startCoord}
              destCoord={destCoord}
            />
            <div className="absolute top-2 left-2">
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-950/85 text-white border border-white/15">
                {pick('Zoomed Photo', '확대 사진')}
              </span>
            </div>
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setMolaTint2d((v) => !v)}
                className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                  molaTint2d
                    ? 'bg-amber-500/85 text-slate-950 border-amber-300 font-bold'
                    : 'bg-slate-950/85 text-slate-200 border-white/20 hover:bg-slate-800'
                }`}
              >
                {pick('Elev Tint', '고도색')}
              </button>
              <button
                type="button"
                onClick={() =>
                  setLayout((prev) => (prev === 'photo2d' ? 'split' : 'photo2d'))
                }
                className="px-2 py-0.5 text-[10px] rounded bg-slate-950/85 text-slate-200 border border-white/20 hover:bg-slate-800"
              >
                {layout === 'photo2d' ? pick('Split View', '둘 다 보기') : pick('Expand', '크게')}
              </button>
            </div>
          </div>
        )}

        {/* Bottom (or Fullscreen): Three.js 3D AR Terrain */}
        <div
          className={`relative rounded-xl overflow-hidden border border-cyan-400/35 bg-[#060b14] ${
            layout === 'photo2d' && !fullscreen3D
              ? 'hidden'
              : 'flex-1 min-h-[210px]'
          }`}
        >
          <MarsRegion3DViewer
            lat={point.lat}
            lon={point.lon}
            reliefScale={reliefScale}
            showArGrid={showArGrid}
            autoRotate={autoRotate}
            cameraViewMode={cameraViewMode}
            route={route}
            startCoord={startCoord}
            destCoord={destCoord}
            onRoutePositionChange={setGlideInfo}
            onSelectLatLon={onJumpToCoord}
          />

          {/* Top-left Mode Badge & Route Jump Helper */}
          <div className="pointer-events-none absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-950/88 text-cyan-200 border border-cyan-400/45 flex items-center gap-1">
                <Box className="w-3 h-3 text-cyan-300" />
                {cameraViewMode === 'roadview'
                  ? pick('3D Route Roadview', '3D 경로 로드뷰')
                  : pick('3D AR Terrain', '3D AR 지형')}
              </span>
              {hasRoute && routeInfo?.inPatch && (
                <span className="px-2 py-0.5 text-[10px] rounded bg-slate-950/85 text-sky-200 border border-sky-400/35">
                  {pick('Click route to glide', '경로 클릭 시 부드러운 이동')}
                </span>
              )}
            </div>

            <div className="pointer-events-auto flex items-center gap-1.5">
              {routeInfo && !routeInfo.inPatch && onJumpToCoord && (
                <button
                  type="button"
                  onClick={() => onJumpToCoord(routeInfo.lat, routeInfo.lon)}
                  className="px-2 py-0.5 text-[10px] font-semibold rounded bg-sky-500/90 hover:bg-sky-400 text-slate-950 flex items-center gap-1 shadow"
                >
                  <Navigation className="w-3 h-3" />
                  {pick('Jump to Route', '경로 위치로 이동')}
                </button>
              )}
              {glideInfo?.nearEdge && onJumpToCoord && (
                <button
                  type="button"
                  onClick={() => onJumpToCoord(glideInfo.lat, glideInfo.lon)}
                  className="px-2 py-0.5 text-[10px] font-semibold rounded bg-amber-400/90 hover:bg-amber-300 text-slate-950 shadow"
                >
                  {pick('Continue Next Segment', '다음 구간 이어보기')}
                </button>
              )}
            </div>
          </div>

          {layout === 'split' && !fullscreen3D ? (
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-1.5 pointer-events-none">
              <div className="pointer-events-auto flex items-center gap-1">
                {hasRoute && (
                  <button
                    type="button"
                    onClick={() => {
                      if (routeInfo && !routeInfo.inPatch && onJumpToCoord) {
                        onJumpToCoord(routeInfo.lat, routeInfo.lon);
                      }
                      setCameraViewMode((m) =>
                        m === 'roadview' ? 'orbit' : 'roadview'
                      );
                    }}
                    className={`px-2 py-0.5 text-[10px] font-semibold rounded flex items-center gap-1 transition-colors ${
                      cameraViewMode === 'roadview'
                        ? 'bg-sky-400 text-slate-950 font-bold shadow'
                        : 'bg-slate-900/85 text-sky-200 border border-sky-400/35 hover:bg-slate-800'
                    }`}
                  >
                    <Navigation className="w-3 h-3" />
                    <span>
                      {cameraViewMode === 'roadview'
                        ? pick('Roadview On', '로드뷰 주행중')
                        : pick('Drive Roadview', '로드뷰 주행')}
                    </span>
                  </button>
                )}
                <span className="px-2 py-0.5 text-[10px] rounded bg-slate-950/85 text-slate-200 border border-white/15">
                  {pick('Drag to Orbit', '드래그 회전')}
                </span>
              </div>
              <button
                type="button"
                onClick={handleExpand3DFullscreen}
                className="pointer-events-auto px-2.5 py-0.5 text-[10px] font-semibold rounded bg-cyan-500/90 text-slate-950 hover:bg-cyan-400 shadow"
              >
                {pick('Expand 3D', '3D 확대')}
              </button>
            </div>
          ) : (
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 flex-wrap">
              {/* Compact 3D Control Dock (Zero backdrop-blur over WebGL) */}
              <div className="flex items-center gap-1 bg-slate-950/92 border border-white/20 rounded-lg px-2 py-1 flex-wrap">
                {hasRoute && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (routeInfo && !routeInfo.inPatch && onJumpToCoord) {
                          onJumpToCoord(routeInfo.lat, routeInfo.lon);
                        }
                        setCameraViewMode((m) =>
                          m === 'roadview' ? 'orbit' : 'roadview'
                        );
                      }}
                      className={`px-2 py-0.5 text-[10px] font-semibold rounded flex items-center gap-1 transition-colors ${
                        cameraViewMode === 'roadview'
                          ? 'bg-sky-500 text-slate-950'
                          : 'bg-sky-500/20 text-sky-200 border border-sky-400/45 hover:bg-sky-500/35'
                      }`}
                    >
                      <Compass className="w-3 h-3" />
                      {cameraViewMode === 'roadview'
                        ? pick('Roadview ON', '로드뷰 ON')
                        : pick('Roadview', '로드뷰')}
                    </button>
                    <span className="w-px h-3.5 bg-white/15 mx-0.5" />
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setShowArGrid((v) => !v)}
                  className={`px-1.5 py-0.5 text-[10px] rounded flex items-center gap-1 ${
                    showArGrid
                      ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/50'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Grid className="w-3 h-3" />
                  {pick('Grid', '격자')}
                </button>
                <button
                  type="button"
                  onClick={() => setAutoRotate((v) => !v)}
                  className={`px-1.5 py-0.5 text-[10px] rounded flex items-center gap-1 ${
                    autoRotate
                      ? 'bg-sky-500/25 text-sky-200 border border-sky-400/50'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <RotateCw className="w-3 h-3" />
                  {pick('Spin', '회전')}
                </button>
                <span className="w-px h-3.5 bg-white/15 mx-0.5" />
                <span className="text-[10px] text-slate-400 px-0.5">
                  {pick('Relief', '기복')}
                </span>
                {[1, 2, 3].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setReliefScale(val)}
                    className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors ${
                      reliefScale === val
                        ? 'bg-amber-400 text-slate-950 font-bold'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {val}x
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onSetFullscreen3D(false);
                    setCameraViewMode('orbit');
                    setLayout('split');
                  }}
                  className="px-2.5 py-1 text-[10px] font-medium rounded-lg bg-slate-950/92 border border-white/25 text-slate-100 hover:bg-slate-800"
                >
                  {pick('Split View', '둘 다 보기')}
                </button>
                {fullscreen3D && (
                  <button
                    type="button"
                    onClick={handleExitFullscreen}
                    className="px-2.5 py-1 text-[10px] font-semibold rounded-lg bg-slate-950/92 border border-white/25 text-white hover:bg-slate-800 flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    {pick('Exit Fullscreen', '전체화면 닫기')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
