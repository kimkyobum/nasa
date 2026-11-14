import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Compass,
  Eye,
  Layers,
  MapPin,
  Minus,
  Navigation,
  Plus,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { AgriSoilProtocolView } from './components/AgriSoilProtocolView';
import { MarsMapCanvas } from './components/MarsMapCanvas';
import { NasaDatasetsView } from './components/NasaDatasetsView';
import { RouteElevationChart } from './components/RouteElevationChart';
import {
  MARS_LANDMARKS,
  REGION_PRESETS,
  findNearestLandmark,
  sampleMarsTelemetry,
} from './data/marsData';
import {
  ClickTool,
  Landmark,
  MarsBaseLayerId,
  MarsTelemetryPoint,
  NavigationMode,
  RegionId,
  RouteResult,
  SensorLayers,
} from './types/mars';
import { findMarsRouteFromNasaTiles } from './utils/pathfinding';

type ActiveTab = 'map' | 'datasets' | 'agri';
type ActiveDrawer = 'none' | 'search' | 'nav' | 'layers' | 'inspect';

const EMPTY_ROUTE: RouteResult = {
  found: false,
  mode: 'safe',
  terrainSource: 'nasa_tiles',
  points: [],
  waypoints: [],
  totalDistanceKm: 0,
  directDistanceKm: 0,
  estimatedHoursRover: 0,
  estimatedHoursEva: 0,
  maxSlopeDeg: 0,
  avgWaterProb: 0,
  hazardSegmentsCount: 0,
  safetyScore: 0,
  summaryKo: '출발지와 목적지를 선택하면 경로가 표시됩니다.',
};

function formatCoord(lat: number, lon: number): string {
  const latStr = lat >= 0 ? `${lat.toFixed(2)}°N` : `${Math.abs(lat).toFixed(2)}°S`;
  return `${latStr}, ${lon.toFixed(2)}°E`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('map');
  const [activeDrawer, setActiveDrawer] = useState<ActiveDrawer>('none');
  const [chartOpen, setChartOpen] = useState<boolean>(false);

  const [regionId, setRegionId] = useState<RegionId>('global');
  const [baseLayer, setBaseLayer] = useState<MarsBaseLayerId>('hybrid');
  const [arVisorMode, setArVisorMode] = useState<boolean>(false);

  const [viewLat, setViewLat] = useState<number>(REGION_PRESETS.global.centerLat);
  const [viewLon, setViewLon] = useState<number>(REGION_PRESETS.global.centerLon);
  const [viewPpd, setViewPpd] = useState<number>(REGION_PRESETS.global.ppd);

  // Start with no preset route — guide user to choose Start first, then Destination
  const [startCoord, setStartCoord] = useState<{ lat: number; lon: number } | null>(null);
  const [destCoord, setDestCoord] = useState<{ lat: number; lon: number } | null>(null);
  const [clickTool, setClickTool] = useState<ClickTool>('start');
  const [navMode, setNavMode] = useState<NavigationMode>('safe');

  const [layers, setLayers] = useState<SensorLayers>({
    swimWater: true,
    elevation: false,
    soilFertility: false,
    slopeHazard: false,
    geothermal: false,
  });
  const [layerOpacity, setLayerOpacity] = useState<number>(0.78);

  const [selectedLandmark, setSelectedLandmark] = useState<Landmark | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [inspectedPoint, setInspectedPoint] = useState<MarsTelemetryPoint>(() =>
    sampleMarsTelemetry(5, 0)
  );
  const [hoveredPoint, setHoveredPoint] = useState<MarsTelemetryPoint | null>(null);

  const [route, setRoute] = useState<RouteResult>(EMPTY_ROUTE);
  const [isRouting, setIsRouting] = useState<boolean>(false);

  // Run NASA Mars Trek tile-aware A* pathfinding whenever BOTH Start and Dest are set
  useEffect(() => {
    if (!startCoord || !destCoord) {
      setRoute(EMPTY_ROUTE);
      setIsRouting(false);
      return;
    }

    let cancelled = false;
    setIsRouting(true);
    findMarsRouteFromNasaTiles(startCoord, destCoord, navMode).then((res) => {
      if (!cancelled) {
        setRoute(res);
        setIsRouting(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [startCoord, destCoord, navMode]);

  const handleRegionChange = (nextId: RegionId) => {
    setRegionId(nextId);
    const preset = REGION_PRESETS[nextId];
    setViewLat(preset.centerLat);
    setViewLon(preset.centerLon);
    setViewPpd(preset.ppd);
  };

  const handleResetView = () => {
    const preset = REGION_PRESETS[regionId];
    setViewLat(preset.centerLat);
    setViewLon(preset.centerLon);
    setViewPpd(preset.ppd);
  };

  const handleViewportChange = useCallback(
    (lat: number, lon: number, nextPpd: number) => {
      setViewLat(lat);
      setViewLon(lon);
      setViewPpd(nextPpd);
    },
    []
  );

  const handleMapClick = useCallback(
    (pt: MarsTelemetryPoint) => {
      setInspectedPoint(pt);
      const near = findNearestLandmark(pt.lat, pt.lon, 0.45);

      if (clickTool === 'start') {
        setStartCoord({ lat: pt.lat, lon: pt.lon });
        setSelectedLandmark(near ? near.landmark : null);
        setClickTool(destCoord === null ? 'destination' : null);
      } else if (clickTool === 'destination') {
        setDestCoord({ lat: pt.lat, lon: pt.lon });
        setSelectedLandmark(near ? near.landmark : null);
        setClickTool(null);
      } else {
        setSelectedLandmark(near ? near.landmark : null);
        setActiveDrawer('inspect');
      }
    },
    [clickTool, destCoord]
  );

  const handlePinClick = useCallback((pin: 'start' | 'destination') => {
    setClickTool(pin);
  }, []);

  const jumpToBestAgriSite = () => {
    const candidates = MARS_LANDMARKS.filter(
      (lm) =>
        lm.type === 'agri_candidate' &&
        (regionId === 'global' || lm.region === regionId)
    );
    let bestLm: Landmark | null = null;
    let best = sampleMarsTelemetry(
      regionId === 'elysium' ? 30 : 4,
      regionId === 'elysium' ? 148 : -118
    );
    for (const lm of candidates) {
      const pt = sampleMarsTelemetry(lm.lat, lm.lon);
      if (pt.farmingScore > best.farmingScore) {
        best = pt;
        bestLm = lm;
      }
    }
    setDestCoord({ lat: best.lat, lon: best.lon });
    setInspectedPoint(best);
    setSelectedLandmark(bestLm);
    if (!startCoord) {
      setClickTool('start');
    } else {
      setClickTool(null);
    }
    setViewLat(best.lat);
    setViewLon(best.lon);
    if (viewPpd < 12) setViewPpd(14);
  };

  const flyToLandmark = (
    lm: Landmark,
    action: 'inspect' | 'dest' | 'start' = 'inspect'
  ) => {
    setSelectedLandmark(lm);
    const pt = sampleMarsTelemetry(lm.lat, lm.lon);
    setInspectedPoint(pt);
    if (action === 'start') {
      setStartCoord({ lat: lm.lat, lon: lm.lon });
      setClickTool(destCoord === null ? 'destination' : null);
    } else if (action === 'dest') {
      setDestCoord({ lat: lm.lat, lon: lm.lon });
      setClickTool(startCoord === null ? 'start' : null);
    }
    setViewLat(lm.lat);
    setViewLon(lm.lon);
    if (viewPpd < 14) setViewPpd(18);
  };

  const toggleLayer = (key: keyof SensorLayers) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleDrawer = (drawer: Exclude<ActiveDrawer, 'none'>) => {
    setActiveDrawer((prev) => (prev === drawer ? 'none' : drawer));
  };

  const strategyLabel = (s: MarsTelemetryPoint['recommendedStrategy']) => {
    if (s === 'direct_soil') return '화성 현지 토양 개량 농법 가능';
    if (s === 'earth_soil_hydro')
      return '지구 토양 투입 + 화성 지하수 수경재배';
    return '정착·농업 부적합 (탐사/샘플 채취 구역)';
  };

  const filteredLandmarks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return MARS_LANDMARKS.filter((lm) => {
      if (!q) return true;
      return (
        lm.nameKo.toLowerCase().includes(q) ||
        lm.nameEn.toLowerCase().includes(q) ||
        lm.rawCategory.toLowerCase().includes(q)
      );
    }).sort((a, b) => a.tier - b.tier);
  }, [searchQuery]);

  const quickRegionLandmarks = useMemo(
    () =>
      MARS_LANDMARKS.filter(
        (l) =>
          l.tier <= 2 &&
          (regionId === 'global' ? l.tier === 1 : l.region === regionId)
      ).slice(0, 14),
    [regionId]
  );

  const startLabel = useMemo(() => {
    if (!startCoord) return null;
    const near = findNearestLandmark(startCoord.lat, startCoord.lon, 0.8);
    return {
      title: near ? near.landmark.nameKo : '사용자 지정 출발지',
      coord: formatCoord(startCoord.lat, startCoord.lon),
    };
  }, [startCoord]);

  const destLabel = useMemo(() => {
    if (!destCoord) return null;
    const near = findNearestLandmark(destCoord.lat, destCoord.lon, 0.8);
    return {
      title: near ? near.landmark.nameKo : '사용자 지정 목적지',
      coord: formatCoord(destCoord.lat, destCoord.lon),
    };
  }, [destCoord]);

  const liveProbe = hoveredPoint ?? inspectedPoint;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#030508] text-slate-100 flex flex-col">
      {/* Top Floating Scrim Bar */}
      <header
        className={`h-14 px-6 flex items-center justify-between gap-8 z-30 shrink-0 ${
          activeTab === 'map'
            ? 'fixed top-0 left-0 right-0 bg-gradient-to-b from-black/85 via-black/45 to-transparent pointer-events-none'
            : 'bg-[#080B12] border-b border-white/10'
        }`}
      >
        {/* Zone 1: Custom Minimalist Orbital Brand Mark + MARS VISION */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('map');
          }}
          className="pointer-events-auto flex items-center gap-3 whitespace-nowrap shrink-0 group"
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 28 28"
            fill="none"
            aria-hidden="true"
            className="text-white transition-transform duration-300 group-hover:scale-105"
          >
            <circle
              cx="14"
              cy="14"
              r="11.5"
              stroke="currentColor"
              strokeOpacity="0.28"
              strokeWidth="1"
            />
            <ellipse
              cx="14"
              cy="14"
              rx="13"
              ry="4.8"
              transform="rotate(-24 14 14)"
              stroke="#38BDF8"
              strokeWidth="1.2"
            />
            <circle
              cx="14"
              cy="14"
              r="5.2"
              fill="#D97757"
              stroke="#030508"
              strokeWidth="1.2"
            />
            <circle cx="24" cy="9.5" r="1.4" fill="#38BDF8" />
          </svg>
          <div className="flex flex-col leading-none">
            <span className="text-[15px] font-bold tracking-[0.18em] text-white">
              MARS VISION
            </span>
            <span className="text-[9px] font-mono tracking-[0.24em] text-slate-400 mt-1">
              WATER EXTRACTION
            </span>
          </div>
        </a>

        {/* Zone 2: Clean Text Navigation Links */}
        <nav className="pointer-events-auto flex items-center gap-7 text-[13px] font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('map')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'map'
                ? 'text-white border-b border-sky-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            탐사 지도
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('datasets')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'datasets'
                ? 'text-white border-b border-sky-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            필요 데이터셋
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('agri')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'agri'
                ? 'text-white border-b border-sky-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            농업 프로토콜
          </button>
        </nav>

        {/* Zone 3: Search + AR Visor HUD */}
        <div className="pointer-events-auto flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveTab('map');
              toggleDrawer('search');
            }}
            title={`화성 전체 지형 검색 (${MARS_LANDMARKS.length}곳)`}
            className={`px-2.5 py-1.5 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              activeTab === 'map' && activeDrawer === 'search'
                ? 'bg-white/15 text-white border-white/30'
                : 'bg-[#06090F]/88 text-slate-300 border-white/15 hover:border-white/35 hover:text-white'
            }`}
          >
            <Search className="w-3.5 h-3.5" strokeWidth={1.6} />
            <span className="hidden sm:inline text-[11px]">지역 검색</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('map');
              setArVisorMode((v) => !v);
            }}
            className={`px-3.5 py-1.5 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              arVisorMode
                ? 'bg-sky-400 text-slate-950 border-sky-300 font-semibold'
                : 'bg-[#06090F]/88 text-slate-200 border-white/15 hover:border-sky-400/60 hover:text-white'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{arVisorMode ? 'AR 바이저 켜짐' : 'AR 바이저'}</span>
          </button>
        </div>
      </header>

      {/* Page Body */}
      {activeTab === 'datasets' ? (
        <main className="flex-1 overflow-y-auto bg-[#07090E]">
          <NasaDatasetsView />
        </main>
      ) : activeTab === 'agri' ? (
        <main className="flex-1 overflow-y-auto bg-[#07090E]">
          <AgriSoilProtocolView
            selectedCell={inspectedPoint}
            regionNameKo={REGION_PRESETS[regionId].nameKo}
          />
        </main>
      ) : (
        <main className="relative flex-1 w-full h-full overflow-hidden">
          <MarsMapCanvas
            baseLayer={baseLayer}
            centerLat={viewLat}
            centerLon={viewLon}
            ppd={viewPpd}
            onViewportChange={handleViewportChange}
            layers={layers}
            layerOpacity={layerOpacity}
            startCoord={startCoord}
            destCoord={destCoord}
            route={route}
            clickTool={clickTool}
            arVisorMode={arVisorMode}
            selectedPoint={inspectedPoint}
            selectedLandmark={selectedLandmark}
            landmarkTypeFilter="all"
            onHoverPoint={setHoveredPoint}
            onMapClick={handleMapClick}
            onPinClick={handlePinClick}
            onSelectLandmark={setSelectedLandmark}
          />

          {/* Interactive Start / Destination Pick Prompt OR Unreachable / Snapped Banner */}
          {clickTool !== null ? (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 max-w-[90vw] flex items-center gap-3 bg-[#070C14]/92 border border-sky-400/45 text-slate-100 px-4 py-2 rounded text-xs shadow-xl">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  clickTool === 'start' ? 'bg-white' : 'bg-sky-400'
                }`}
              />
              <span>
                {clickTool === 'start'
                  ? '지도를 클릭해 출발지(START)를 설정하세요'
                  : '지도를 클릭해 목적지(TARGET)를 설정하세요'}
              </span>
              {(startCoord !== null || destCoord !== null) && (
                <button
                  type="button"
                  onClick={() => setClickTool(null)}
                  className="text-slate-400 hover:text-white pl-1 border-l border-white/15"
                >
                  취소
                </button>
              )}
            </div>
          ) : startCoord && destCoord && !isRouting && !route.found ? (
            <button
              type="button"
              onClick={() => setActiveDrawer('nav')}
              className="absolute top-16 left-1/2 -translate-x-1/2 z-20 max-w-[90vw] flex items-center gap-2.5 bg-[#16080C]/94 border border-rose-500/45 text-rose-200 px-4 py-2 rounded text-xs shadow-xl hover:border-rose-400 transition-colors"
            >
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="font-semibold text-rose-300 whitespace-nowrap">
                이동 불가
              </span>
              <span className="text-slate-200 truncate">{route.summaryKo}</span>
            </button>
          ) : startCoord &&
            destCoord &&
            !isRouting &&
            route.found &&
            route.snappedToSafeApproach ? (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 max-w-[90vw] flex items-center gap-2 bg-[#141006]/92 border border-amber-400/40 text-amber-200 px-3.5 py-1.5 rounded text-xs shadow-xl">
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              <span className="truncate">{route.summaryKo}</span>
            </div>
          ) : null}

          {/* Bottom-Left Region Quick-Switch (Camera only — keeps chosen pins) */}
          <div className="absolute bottom-5 left-5 z-20 flex items-center gap-1 bg-[#06090F]/90 border border-white/10 rounded p-1">
            {(['global', 'tharsis', 'elysium'] as RegionId[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => handleRegionChange(id)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                  regionId === id
                    ? 'bg-white/15 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {id === 'global'
                  ? '화성 전체'
                  : id === 'tharsis'
                    ? '타르시스'
                    : '엘리시움'}
              </button>
            ))}
          </div>

          {/* Bottom-Center Sleek Telemetry & Route Strip */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 hidden md:flex items-center gap-4 bg-[#06090F]/90 border border-white/10 px-5 py-2 rounded text-xs">
            <span className="font-mono text-white whitespace-nowrap">
              {formatCoord(liveProbe.lat, liveProbe.lon)}
            </span>
            <span className="text-white/20">|</span>
            <span className="font-mono text-slate-300 whitespace-nowrap">
              {liveProbe.elevationM.toLocaleString()} m · {liveProbe.slopeDeg}°
            </span>
            <span className="text-white/20">|</span>
            <span className="font-mono text-sky-300 whitespace-nowrap">
              지하수 {liveProbe.combinedWaterProb}%
            </span>
            <span className="text-white/20">|</span>
            <button
              type="button"
              onClick={() =>
                toggleDrawer(startCoord && destCoord ? 'inspect' : 'nav')
              }
              className={`font-mono whitespace-nowrap ${
                !startCoord || !destCoord
                  ? 'text-slate-300 hover:text-white'
                  : isRouting
                    ? 'text-slate-300'
                    : route.found
                      ? 'text-emerald-300 hover:text-emerald-200'
                      : 'text-rose-400 hover:text-rose-300 font-semibold'
              }`}
            >
              {!startCoord
                ? '출발지(START) 먼저 선택'
                : !destCoord
                  ? '목적지(TARGET) 선택 대기'
                  : isRouting
                    ? '실사 지형 경로 분석 중...'
                    : route.found
                      ? `경로 ${route.totalDistanceKm}km (${route.waypoints.length}개 경유점)`
                      : '이동 불가 경로'}
            </button>
          </div>

          {/* Bottom-Right Vertical Minimal Toolbar */}
          <div className="absolute bottom-5 right-5 z-20 flex flex-col gap-1 bg-[#06090F]/90 border border-white/10 p-1 rounded">
            <button
              type="button"
              onClick={() => toggleDrawer('search')}
              title={`화성 지형 검색 (${MARS_LANDMARKS.length}곳)`}
              aria-label="화성 지형 검색"
              className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
                activeDrawer === 'search'
                  ? 'bg-sky-400/20 text-sky-300'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Search className="w-4 h-4" strokeWidth={1.6} />
            </button>

            <button
              type="button"
              onClick={() => toggleDrawer('nav')}
              title="경로 및 상세 길안내"
              aria-label="경로 및 상세 길안내"
              className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
                activeDrawer === 'nav'
                  ? 'bg-sky-400/20 text-sky-300'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Navigation className="w-4 h-4" strokeWidth={1.6} />
            </button>

            <button
              type="button"
              onClick={() => toggleDrawer('layers')}
              title="지도 및 센서 레이어"
              aria-label="지도 및 센서 레이어"
              className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
                activeDrawer === 'layers'
                  ? 'bg-sky-400/20 text-sky-300'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Layers className="w-4 h-4" strokeWidth={1.6} />
            </button>

            <button
              type="button"
              onClick={() => toggleDrawer('inspect')}
              title="지점 및 경유지 상세 분석"
              aria-label="지점 및 경유지 상세 분석"
              className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
                activeDrawer === 'inspect'
                  ? 'bg-sky-400/20 text-sky-300'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <MapPin className="w-4 h-4" strokeWidth={1.6} />
            </button>

            <button
              type="button"
              onClick={() => setChartOpen((v) => !v)}
              title="경로 고도 단면 그래프"
              aria-label="경로 고도 단면 그래프"
              className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
                chartOpen
                  ? 'bg-sky-400/20 text-sky-300'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Activity className="w-4 h-4" strokeWidth={1.6} />
            </button>

            <div className="h-px bg-white/10 my-0.5" />

            <button
              type="button"
              onClick={() =>
                setViewPpd((p) => Math.min(140, Number((p * 1.45).toFixed(2))))
              }
              title="확대"
              aria-label="지도 확대"
              className="w-8 h-8 flex items-center justify-center rounded text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Plus className="w-4 h-4" strokeWidth={1.6} />
            </button>

            <button
              type="button"
              onClick={() =>
                setViewPpd((p) => Math.max(2.3, Number((p * 0.68).toFixed(2))))
              }
              title="축소"
              aria-label="지도 축소"
              className="w-8 h-8 flex items-center justify-center rounded text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Minus className="w-4 h-4" strokeWidth={1.6} />
            </button>

            <button
              type="button"
              onClick={handleResetView}
              title="시점 초기화"
              aria-label="시점 초기화"
              className="w-8 h-8 flex items-center justify-center rounded text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.6} />
            </button>
          </div>

          {/* On-Demand Slide-In Drawer */}
          {activeDrawer !== 'none' && (
            <aside className="absolute top-16 right-16 bottom-16 w-[350px] z-20 bg-[#070A10]/94 border border-white/10 rounded-lg flex flex-col overflow-hidden shadow-2xl">
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wide text-white">
                  {activeDrawer === 'search'
                    ? '화성 지형 검색'
                    : activeDrawer === 'nav'
                      ? '경로 네비게이션 · 상세 길안내'
                      : activeDrawer === 'layers'
                        ? 'NASA 위성 · 센서 레이어'
                        : '경로 정밀 분석 · 경유점'}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveDrawer('none')}
                  className="p-1 text-slate-400 hover:text-white rounded"
                  aria-label="패널 닫기"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-5 overflow-y-auto flex-1 text-xs">
                {/* 1. CLEAN SEARCH DRAWER */}
                {activeDrawer === 'search' && (
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="지역명(한글/영문), 화산, 협곡 검색..."
                        className="w-full bg-black/70 border border-white/15 rounded-md pl-9 pr-8 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400/60"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                          aria-label="검색어 지우기"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {filteredLandmarks.slice(0, 60).map((lm) => {
                        const typeColor =
                          lm.type === 'volcano'
                            ? 'text-amber-300'
                            : lm.type === 'ice_sheet'
                              ? 'text-sky-300'
                              : lm.type === 'agri_candidate'
                                ? 'text-emerald-300'
                                : lm.type === 'canyon'
                                  ? 'text-cyan-300'
                                  : 'text-slate-300';
                        return (
                          <div
                            key={lm.id}
                            className={`p-3 rounded-md border transition-colors space-y-2.5 ${
                              selectedLandmark?.id === lm.id
                                ? 'bg-sky-400/10 border-sky-400/40'
                                : 'bg-black/45 border-white/10 hover:border-white/25'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => flyToLandmark(lm, 'inspect')}
                                className="text-left flex-1 group"
                              >
                                <div className="text-[13px] font-semibold text-white group-hover:text-sky-300 transition-colors">
                                  {lm.nameKo}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                  {lm.nameEn} · {formatCoord(lm.lat, lm.lon)} ·{' '}
                                  {lm.elevationM.toLocaleString()}m
                                </div>
                              </button>
                              <span
                                className={`text-[10px] whitespace-nowrap ${typeColor}`}
                              >
                                {lm.rawCategory}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => flyToLandmark(lm, 'start')}
                                className="py-2 text-xs font-medium bg-white/10 hover:bg-white/20 text-slate-100 rounded transition-colors"
                              >
                                출발지로 설정
                              </button>
                              <button
                                type="button"
                                onClick={() => flyToLandmark(lm, 'dest')}
                                className="py-2 text-xs font-semibold bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/35 text-sky-200 rounded transition-colors"
                              >
                                목적지로 설정
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. SIMPLIFIED NAVIGATION DRAWER */}
                {activeDrawer === 'nav' && (
                  <>
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between text-slate-400">
                        <span>출발 · 목적지 설정 (클릭 후 지도 선택)</span>
                        <button
                          type="button"
                          onClick={jumpToBestAgriSite}
                          className="text-emerald-400 hover:text-emerald-300 font-medium"
                        >
                          최적 농경지 추천
                        </button>
                      </div>

                      {/* Clickable START Card */}
                      <button
                        type="button"
                        onClick={() =>
                          setClickTool((prev) =>
                            prev === 'start' ? null : 'start'
                          )
                        }
                        className={`w-full text-left p-3 rounded-md border transition-colors flex items-center justify-between gap-2 ${
                          clickTool === 'start'
                            ? 'bg-white/15 border-white/60'
                            : 'bg-black/50 border-white/15 hover:border-white/35'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-white shrink-0" />
                            <span className="font-mono text-[11px] font-semibold text-white">
                              출발지 (START)
                            </span>
                          </div>
                          <div className="text-xs text-slate-200 mt-1 truncate pl-4">
                            {clickTool === 'start'
                              ? '지도에서 새 출발지를 클릭하세요...'
                              : startLabel
                                ? `${startLabel.title} · ${startLabel.coord}`
                                : '클릭 후 지도에서 출발지 선택'}
                          </div>
                        </div>
                        <span className="text-[11px] text-slate-400 shrink-0">
                          {clickTool === 'start' ? '선택 중' : '변경'}
                        </span>
                      </button>

                      {/* Clickable TARGET Card */}
                      <button
                        type="button"
                        onClick={() =>
                          setClickTool((prev) =>
                            prev === 'destination' ? null : 'destination'
                          )
                        }
                        className={`w-full text-left p-3 rounded-md border transition-colors flex items-center justify-between gap-2 ${
                          clickTool === 'destination'
                            ? 'bg-sky-400/15 border-sky-400'
                            : 'bg-black/50 border-white/15 hover:border-sky-400/40'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0" />
                            <span className="font-mono text-[11px] font-semibold text-sky-300">
                              목적지 (TARGET)
                            </span>
                          </div>
                          <div className="text-xs text-slate-200 mt-1 truncate pl-4">
                            {clickTool === 'destination'
                              ? '지도에서 새 목적지를 클릭하세요...'
                              : destLabel
                                ? `${destLabel.title} · ${destLabel.coord}`
                                : '클릭 후 지도에서 목적지 선택'}
                          </div>
                        </div>
                        <span className="text-[11px] text-sky-300 shrink-0">
                          {clickTool === 'destination' ? '선택 중' : '변경'}
                        </span>
                      </button>
                    </div>

                    <div className="space-y-2 pt-4 border-t border-white/10">
                      <span className="text-slate-400 block">
                        길찾기 최적화 기준
                      </span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          [
                            { id: 'safe', label: '최적 안전' },
                            { id: 'fast', label: '최단 신속' },
                            { id: 'water', label: '수자원 경유' },
                          ] as { id: NavigationMode; label: string }[]
                        ).map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setNavMode(m.id)}
                            className={`py-2 rounded border text-[11px] transition-colors whitespace-nowrap ${
                              navMode === m.id
                                ? 'bg-sky-400/15 text-sky-300 border-sky-400/40 font-medium'
                                : 'bg-black/40 text-slate-400 border-white/10 hover:text-white'
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Step-by-Step Turn-by-Turn Navigation Guide */}
                    <div className="space-y-2 pt-4 border-t border-white/10">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300 font-medium">
                          {route.found
                            ? `단계별 상세 길안내 (${route.waypoints.length}단계)`
                            : '상세 길안내'}
                        </span>
                        <span className="font-mono text-[10px] text-sky-300">
                          {route.terrainSource === 'nasa_tiles'
                            ? 'NASA 실사지형 반영'
                            : '지형모델'}
                        </span>
                      </div>

                      {!startCoord || !destCoord ? (
                        <div className="bg-black/45 border border-white/10 rounded p-3 text-[11px] text-slate-400 leading-relaxed">
                          위 출발지(START)와 목적지(TARGET)를 모두 설정하면 NASA
                          실사 지형 기반 안전 경로와 상세 길안내가 표시됩니다.
                        </div>
                      ) : !isRouting && !route.found ? (
                        <div className="bg-rose-950/40 border border-rose-500/35 rounded p-3 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-rose-300 font-semibold">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>갈 수 없는 경로 (이동 불가)</span>
                          </div>
                          <p className="text-[11px] text-slate-200 leading-relaxed">
                            {route.summaryKo}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {route.waypoints.map((wp) => (
                            <button
                              key={wp.index}
                              type="button"
                              onClick={() => {
                                setViewLat(wp.lat);
                                setViewLon(wp.lon);
                                if (viewPpd < 24) setViewPpd(26);
                                setInspectedPoint(
                                  sampleMarsTelemetry(wp.lat, wp.lon)
                                );
                              }}
                              className="w-full text-left bg-black/45 hover:bg-white/10 border border-white/10 rounded p-2.5 transition-colors space-y-1"
                            >
                              <div className="flex items-center justify-between font-mono text-[11px]">
                                <span
                                  className={
                                    wp.tag === 'avoid'
                                      ? 'text-amber-300 font-semibold'
                                      : wp.tag === 'water'
                                        ? 'text-sky-300 font-semibold'
                                        : wp.tag === 'target'
                                          ? 'text-emerald-300 font-semibold'
                                          : 'text-white font-semibold'
                                  }
                                >
                                  {wp.code === 'START' || wp.code === 'TARGET'
                                    ? wp.code
                                    : `${wp.index - 1}. ${wp.code}`}
                                </span>
                                <span className="text-slate-400">
                                  {wp.distanceFromStartKm} km · {wp.bearingDeg}°
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-200 leading-snug">
                                {wp.instructionKo}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 pt-4 border-t border-white/10">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">
                          주요 화산 · 탐사 지형
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveDrawer('search')}
                          className="text-sky-300 hover:text-sky-200 text-[11px]"
                        >
                          전체 {MARS_LANDMARKS.length}곳 검색
                        </button>
                      </div>
                      <div className="space-y-1">
                        {quickRegionLandmarks.map((lm) => (
                          <button
                            key={lm.id}
                            type="button"
                            onClick={() => flyToLandmark(lm, 'dest')}
                            className={`w-full text-left px-2.5 py-2 rounded border transition-colors flex items-center justify-between ${
                              selectedLandmark?.id === lm.id
                                ? 'bg-sky-400/15 border-sky-400/40 text-white'
                                : 'bg-black/35 border-white/10 text-slate-300 hover:border-white/25'
                            }`}
                          >
                            <span>{lm.nameKo}</span>
                            <span className="font-mono text-[11px] text-slate-400">
                              {lm.elevationM.toLocaleString()}m
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* 3. REDESIGNED SENSOR LAYERS DRAWER */}
                {activeDrawer === 'layers' && (
                  <>
                    <div className="space-y-2">
                      <span className="text-slate-400 block">
                        NASA Mars Trek 기본 위성 지도
                      </span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          [
                            { id: 'hybrid', label: '위성+고도' },
                            { id: 'viking', label: 'Viking 실사' },
                            { id: 'mola', label: 'MOLA 고도' },
                          ] as { id: MarsBaseLayerId; label: string }[]
                        ).map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => setBaseLayer(b.id)}
                            className={`py-2 rounded border text-[11px] transition-colors whitespace-nowrap ${
                              baseLayer === b.id
                                ? 'bg-amber-400/15 text-amber-300 border-amber-400/40 font-medium'
                                : 'bg-black/40 text-slate-400 border-white/10 hover:text-white'
                            }`}
                          >
                            {b.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2.5 pt-4 border-t border-white/10">
                      <span className="text-slate-400 block">
                        과학 센서 데이터 레이어
                      </span>
                      <div className="space-y-2">
                        {(
                          [
                            {
                              key: 'swimWater',
                              label: '지하수 · 얼음 확률 (기본)',
                              desc: '진한 파랑일수록 지하수 매장 확률 높음',
                              gradient: 'from-sky-300/25 via-sky-500 to-blue-700',
                              accent: 'accent-sky-400',
                            },
                            {
                              key: 'elevation',
                              label: '지형 고도 (MOLA)',
                              desc: '저지대(파랑) → 평지(초록) → 고지대(주황·빨강)',
                              gradient:
                                'from-blue-600 via-emerald-500 to-rose-500',
                              accent: 'accent-cyan-400',
                            },
                            {
                              key: 'soilFertility',
                              label: '농업 적합 토양 (CRISM)',
                              desc: '점토 광물 풍부·낮은 독성 비옥 지대',
                              gradient: 'from-emerald-900/40 to-emerald-400',
                              accent: 'accent-emerald-400',
                            },
                            {
                              key: 'slopeHazard',
                              label: '위험 지형 (급경사·절벽)',
                              desc: '로버 전복 위험이 높은 가파른 경사면',
                              gradient: 'from-rose-900/40 to-rose-500',
                              accent: 'accent-rose-400',
                            },
                            {
                              key: 'geothermal',
                              label: '화산 · 지열 지대',
                              desc: '대형 화산 밀집 및 지열 구배 지역',
                              gradient: 'from-amber-900/40 to-orange-500',
                              accent: 'accent-amber-400',
                            },
                          ] as {
                            key: keyof SensorLayers;
                            label: string;
                            desc: string;
                            gradient: string;
                            accent: string;
                          }[]
                        ).map((item) => {
                          const active = layers[item.key];
                          return (
                            <label
                              key={item.key}
                              className={`block px-3 py-2.5 rounded-md border cursor-pointer transition-colors ${
                                active
                                  ? 'bg-white/[0.06] border-white/25 text-white'
                                  : 'bg-black/40 border-white/10 text-slate-300 hover:border-white/20'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-xs">
                                  {item.label}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={active}
                                  onChange={() => toggleLayer(item.key)}
                                  className={`${item.accent} w-3.5 h-3.5 cursor-pointer`}
                                />
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {item.desc}
                              </div>
                              <div
                                className={`h-1.5 w-full rounded-full mt-2 bg-gradient-to-r ${item.gradient}`}
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2 pt-4 border-t border-white/10">
                      <div className="flex justify-between">
                        <span className="text-slate-400">레이어 색상 진하기</span>
                        <span className="font-mono text-sky-300">
                          {Math.round(layerOpacity * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={25}
                        max={100}
                        value={Math.round(layerOpacity * 100)}
                        onChange={(e) =>
                          setLayerOpacity(Number(e.target.value) / 100)
                        }
                        className="w-full accent-sky-400 cursor-pointer"
                      />
                    </div>
                  </>
                )}

                {/* 4. INSPECT DRAWER */}
                {activeDrawer === 'inspect' && (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-slate-400">
                        <span>네비게이션 요약</span>
                        <span
                          className={`font-mono ${
                            !startCoord || !destCoord
                              ? 'text-slate-400'
                              : route.found
                                ? 'text-sky-300'
                                : 'text-rose-400 font-semibold'
                          }`}
                        >
                          {!startCoord || !destCoord
                            ? '경로 미지정'
                            : route.found
                              ? `안전도 ${route.safetyScore}/100`
                              : '이동 불가'}
                        </span>
                      </div>
                      {startCoord && destCoord && !isRouting && !route.found && (
                        <div className="bg-rose-950/40 border border-rose-500/35 rounded p-2.5 text-[11px] text-rose-200 leading-relaxed">
                          {route.summaryKo}
                        </div>
                      )}
                      {startCoord &&
                        destCoord &&
                        !isRouting &&
                        route.found &&
                        route.snappedToSafeApproach && (
                          <div className="bg-amber-950/35 border border-amber-400/35 rounded p-2.5 text-[11px] text-amber-200 leading-relaxed">
                            {route.summaryKo}
                          </div>
                        )}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-black/45 border border-white/10 rounded p-2.5">
                          <div className="text-[10px] text-slate-400">총 거리</div>
                          <div className="text-base font-mono font-semibold text-white">
                            {route.found ? `${route.totalDistanceKm} km` : '--'}
                          </div>
                        </div>
                        <div className="bg-black/45 border border-white/10 rounded p-2.5">
                          <div className="text-[10px] text-slate-400">
                            로버 / 도보
                          </div>
                          <div className="text-base font-mono font-semibold text-sky-300">
                            {route.found
                              ? `${route.estimatedHoursRover}h / ${route.estimatedHoursEva}h`
                              : '--'}
                          </div>
                        </div>
                        <div className="bg-black/45 border border-white/10 rounded p-2.5">
                          <div className="text-[10px] text-slate-400">최대 경사</div>
                          <div className="text-base font-mono font-semibold text-amber-300">
                            {route.found ? `${route.maxSlopeDeg}°` : '--'}
                          </div>
                        </div>
                        <div className="bg-black/45 border border-white/10 rounded p-2.5">
                          <div className="text-[10px] text-slate-400">
                            평균 지하수
                          </div>
                          <div className="text-base font-mono font-semibold text-emerald-300">
                            {route.found ? `${route.avgWaterProb}%` : '--'}
                          </div>
                        </div>
                      </div>

                      {route.waypoints.length > 0 && (
                        <div className="pt-2 space-y-1.5">
                          <div className="text-slate-400 flex justify-between">
                            <span>경로 경유점 (클릭 시 이동)</span>
                            <span className="font-mono text-[10px] text-sky-400">
                              {route.terrainSource === 'nasa_tiles'
                                ? 'NASA 위성지형 기반'
                                : '지형 모델'}
                            </span>
                          </div>
                          <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                            {route.waypoints.map((wp) => (
                              <button
                                key={wp.index}
                                type="button"
                                onClick={() => {
                                  setViewLat(wp.lat);
                                  setViewLon(wp.lon);
                                  if (viewPpd < 24) setViewPpd(26);
                                }}
                                className="w-full text-left bg-black/45 hover:bg-white/10 border border-white/10 rounded px-2.5 py-1.5 transition-colors"
                              >
                                <div className="flex justify-between font-mono text-[10px]">
                                  <span className="text-sky-300">{wp.code}</span>
                                  <span className="text-slate-400">
                                    {wp.distanceFromStartKm} km · 경사 {wp.slopeDeg}°
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-200 mt-0.5">
                                  {wp.instructionKo}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 pt-4 border-t border-white/10">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">선택 좌표 데이터</span>
                        <span className="font-mono text-white">
                          {formatCoord(inspectedPoint.lat, inspectedPoint.lon)}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between py-1 border-b border-white/10">
                          <span className="text-slate-400">MOLA 고도 · 경사</span>
                          <span className="font-mono text-white">
                            {inspectedPoint.elevationM.toLocaleString()}m ·{' '}
                            {inspectedPoint.slopeDeg}°
                          </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-white/10">
                          <span className="text-slate-400">
                            SWIM 지하수 확률
                          </span>
                          <span className="font-mono text-sky-300">
                            {inspectedPoint.combinedWaterProb}%
                          </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-white/10">
                          <span className="text-slate-400">GRS 감마선 수소</span>
                          <span className="font-mono text-indigo-300">
                            {inspectedPoint.gammaHydrogen}%
                          </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-white/10">
                          <span className="text-slate-400">
                            CRISM 토양 비옥도
                          </span>
                          <span className="font-mono text-emerald-300">
                            {inspectedPoint.soilFertility} / 100
                          </span>
                        </div>
                      </div>

                      <div className="bg-black/50 border border-white/10 rounded p-3 space-y-2 mt-2">
                        <div className="font-semibold text-white">
                          {strategyLabel(inspectedPoint.recommendedStrategy)}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          {inspectedPoint.recommendedStrategy === 'direct_soil'
                            ? '점토 광물과 지하수 확률이 우수해 과염소산염 세척 후 현지 토양 농사가 가능합니다.'
                            : inspectedPoint.recommendedStrategy ===
                                'earth_soil_hydro'
                              ? '물은 확보 가능하나 화산재·독성으로 현지 흙이 부적합해 지구 토양 + 화성 물 수경재배를 권장합니다.'
                              : '급경사 또는 수자원 부족 구역입니다. 무인 로버 정밀 샘플 채취 전용으로 활용하세요.'}
                        </p>
                        <button
                          type="button"
                          onClick={() => setActiveTab('agri')}
                          className="w-full py-1.5 text-[11px] font-medium bg-white/10 hover:bg-white/15 text-sky-300 rounded transition-colors"
                        >
                          지구 흙·물 수송량 시뮬레이션 열기
                        </button>
                      </div>
                    </div>

                    {selectedLandmark && (
                      <div className="pt-4 border-t border-white/10 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold text-sky-300 flex items-center gap-1.5">
                              <Compass className="w-3.5 h-3.5 shrink-0" />
                              <span>{selectedLandmark.nameKo}</span>
                            </div>
                            <div className="text-[10px] font-mono text-slate-400 pl-5">
                              {selectedLandmark.nameEn}
                            </div>
                          </div>
                          <span className="text-[10px] text-slate-300 bg-white/10 px-1.5 py-0.5 rounded whitespace-nowrap">
                            {selectedLandmark.rawCategory}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          {selectedLandmark.descriptionKo}
                        </p>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          {selectedLandmark.waterNoteKo}
                        </p>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() =>
                              flyToLandmark(selectedLandmark, 'start')
                            }
                            className="py-2 text-xs bg-white/10 hover:bg-white/20 text-slate-100 rounded transition-colors"
                          >
                            출발지로 설정
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              flyToLandmark(selectedLandmark, 'dest')
                            }
                            className="py-2 text-xs bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/35 text-sky-200 font-semibold rounded transition-colors"
                          >
                            목적지로 설정
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </aside>
          )}

          {/* Optional Floating Route Elevation Chart */}
          {chartOpen && (
            <div className="absolute bottom-16 left-5 right-16 max-w-3xl mx-auto z-20 shadow-2xl">
              <RouteElevationChart route={route} />
            </div>
          )}
        </main>
      )}
    </div>
  );
}
