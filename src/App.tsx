import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
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
  LandmarkType,
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

const LANDMARK_TYPE_TABS: { id: LandmarkType | 'all'; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'volcano', label: '화산' },
  { id: 'ice_sheet', label: '지하얼음' },
  { id: 'agri_candidate', label: '농경지' },
  { id: 'canyon', label: '협곡' },
  { id: 'basecamp', label: '전초기지' },
];

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
  summaryKo: '경로를 분석하는 중입니다...',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('map');
  const [activeDrawer, setActiveDrawer] = useState<ActiveDrawer>('none');
  const [chartOpen, setChartOpen] = useState<boolean>(false);

  const [regionId, setRegionId] = useState<RegionId>('tharsis');
  const [baseLayer, setBaseLayer] = useState<MarsBaseLayerId>('hybrid');
  const [arVisorMode, setArVisorMode] = useState<boolean>(false);

  const [viewLat, setViewLat] = useState<number>(
    REGION_PRESETS.tharsis.centerLat
  );
  const [viewLon, setViewLon] = useState<number>(
    REGION_PRESETS.tharsis.centerLon
  );
  const [viewPpd, setViewPpd] = useState<number>(REGION_PRESETS.tharsis.ppd);

  const [clickTool, setClickTool] = useState<ClickTool>('destination');
  const [navMode, setNavMode] = useState<NavigationMode>('safe');

  const [layers, setLayers] = useState<SensorLayers>({
    swimWater: true,
    slopeHazard: false,
    gammaRay: false,
    soilFertility: false,
    geothermal: false,
  });

  const [minWaterThreshold, setMinWaterThreshold] = useState<number>(54);
  const [maxSlopeThreshold, setMaxSlopeThreshold] = useState<number>(13);

  const [startCoord, setStartCoord] = useState<{ lat: number; lon: number }>(
    REGION_PRESETS.tharsis.defaultStart
  );
  const [destCoord, setDestCoord] = useState<{ lat: number; lon: number }>(
    REGION_PRESETS.tharsis.defaultDest
  );

  const [destLatInput, setDestLatInput] = useState<string>(
    String(REGION_PRESETS.tharsis.defaultDest.lat)
  );
  const [destLonInput, setDestLonInput] = useState<string>(
    String(REGION_PRESETS.tharsis.defaultDest.lon)
  );

  const [selectedLandmark, setSelectedLandmark] = useState<Landmark | null>(
    MARS_LANDMARKS.find((l) => l.id === 'tharsis_agri') ?? null
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [landmarkTypeFilter, setLandmarkTypeFilter] = useState<
    LandmarkType | 'all'
  >('all');
  const [regionScopeOnly, setRegionScopeOnly] = useState<boolean>(false);

  const [inspectedPoint, setInspectedPoint] = useState<MarsTelemetryPoint>(() =>
    sampleMarsTelemetry(
      REGION_PRESETS.tharsis.defaultDest.lat,
      REGION_PRESETS.tharsis.defaultDest.lon
    )
  );
  const [hoveredPoint, setHoveredPoint] = useState<MarsTelemetryPoint | null>(
    null
  );

  const [route, setRoute] = useState<RouteResult>(EMPTY_ROUTE);
  const [isRouting, setIsRouting] = useState<boolean>(false);

  // Run NASA Mars Trek tile-aware A* pathfinding whenever Start/Dest/Mode changes
  useEffect(() => {
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

    setStartCoord(preset.defaultStart);
    setDestCoord(preset.defaultDest);
    setDestLatInput(String(preset.defaultDest.lat));
    setDestLonInput(String(preset.defaultDest.lon));
    setInspectedPoint(
      sampleMarsTelemetry(preset.defaultDest.lat, preset.defaultDest.lon)
    );
    setSelectedLandmark(
      MARS_LANDMARKS.find((l) =>
        nextId === 'elysium' ? l.id === 'elysium_agri' : l.id === 'tharsis_agri'
      ) ?? null
    );
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
      const near = findNearestLandmark(pt.lat, pt.lon, 0.35);
      if (clickTool === 'destination') {
        setDestCoord({ lat: pt.lat, lon: pt.lon });
        setDestLatInput(String(pt.lat));
        setDestLonInput(String(pt.lon));
        setSelectedLandmark(near ? near.landmark : null);
      } else if (clickTool === 'start') {
        setStartCoord({ lat: pt.lat, lon: pt.lon });
      } else {
        if (near) setSelectedLandmark(near.landmark);
        setActiveDrawer('inspect');
      }
    },
    [clickTool]
  );

  const applyManualDest = () => {
    const lat = parseFloat(destLatInput);
    const lon = parseFloat(destLonInput);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return;
    const cLat = Math.max(-85, Math.min(85, lat));
    const cLon = Math.max(-180, Math.min(180, lon));
    setDestCoord({
      lat: Number(cLat.toFixed(2)),
      lon: Number(cLon.toFixed(2)),
    });
    setDestLatInput(String(Number(cLat.toFixed(2))));
    setDestLonInput(String(Number(cLon.toFixed(2))));
    setInspectedPoint(sampleMarsTelemetry(cLat, cLon));
    const near = findNearestLandmark(cLat, cLon, 0.4);
    setSelectedLandmark(near ? near.landmark : null);
    setViewLat(cLat);
    setViewLon(cLon);
  };

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
    setDestLatInput(String(best.lat));
    setDestLonInput(String(best.lon));
    setInspectedPoint(best);
    setSelectedLandmark(bestLm);
    setViewLat(best.lat);
    setViewLon(best.lon);
    if (viewPpd < 12) setViewPpd(14);
  };

  const flyToLandmark = (
    lm: Landmark,
    action: 'inspect' | 'dest' | 'start' = 'dest'
  ) => {
    setSelectedLandmark(lm);
    const pt = sampleMarsTelemetry(lm.lat, lm.lon);
    setInspectedPoint(pt);
    if (action === 'dest') {
      setDestCoord({ lat: lm.lat, lon: lm.lon });
      setDestLatInput(String(lm.lat));
      setDestLonInput(String(lm.lon));
    } else if (action === 'start') {
      setStartCoord({ lat: lm.lat, lon: lm.lon });
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
      if (landmarkTypeFilter !== 'all' && lm.type !== landmarkTypeFilter) {
        return false;
      }
      if (regionScopeOnly && regionId !== 'global' && lm.region !== regionId) {
        return false;
      }
      if (!q) return true;
      return (
        lm.nameKo.toLowerCase().includes(q) ||
        lm.nameEn.toLowerCase().includes(q) ||
        lm.rawCategory.toLowerCase().includes(q) ||
        lm.descriptionKo.toLowerCase().includes(q)
      );
    }).sort((a, b) => a.tier - b.tier);
  }, [searchQuery, landmarkTypeFilter, regionScopeOnly, regionId]);

  const quickRegionLandmarks = useMemo(
    () =>
      MARS_LANDMARKS.filter(
        (l) =>
          l.tier <= 2 &&
          (regionId === 'global' ? l.tier === 1 : l.region === regionId)
      ).slice(0, 18),
    [regionId]
  );

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

        {/* Zone 3: Primary Action (Search + AR Visor HUD) */}
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
            <span className="hidden sm:inline font-mono text-[11px]">
              {MARS_LANDMARKS.length} 지역
            </span>
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
            minWaterThreshold={minWaterThreshold}
            maxSlopeThreshold={maxSlopeThreshold}
            startCoord={startCoord}
            destCoord={destCoord}
            route={route}
            clickTool={clickTool}
            arVisorMode={arVisorMode}
            selectedPoint={inspectedPoint}
            selectedLandmark={selectedLandmark}
            landmarkTypeFilter={landmarkTypeFilter}
            onHoverPoint={setHoveredPoint}
            onMapClick={handleMapClick}
            onSelectLandmark={setSelectedLandmark}
          />

          {/* Bottom-Left Region Quick-Switch */}
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
              {liveProbe.lat >= 0
                ? `${liveProbe.lat.toFixed(2)}°N`
                : `${Math.abs(liveProbe.lat).toFixed(2)}°S`}{' '}
              {liveProbe.lon.toFixed(2)}°E
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
              onClick={() => toggleDrawer('inspect')}
              className="font-mono text-emerald-300 hover:text-emerald-200 whitespace-nowrap"
            >
              {isRouting
                ? '실사 지형 경로 분석 중...'
                : route.found
                  ? `상세 경로 ${route.totalDistanceKm}km (${route.waypoints.length}개 경유점)`
                  : '경로 없음'}
            </button>
          </div>

          {/* Bottom-Right Vertical Minimal Toolbar */}
          <div className="absolute bottom-5 right-5 z-20 flex flex-col gap-1 bg-[#06090F]/90 border border-white/10 p-1 rounded">
            <button
              type="button"
              onClick={() => toggleDrawer('search')}
              title="화성 지형·탐사지 검색 (680곳)"
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
                setViewPpd((p) => Math.max(2.2, Number((p * 0.68).toFixed(2))))
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
            <aside className="absolute top-16 right-16 bottom-16 w-[345px] z-20 bg-[#070A10]/94 border border-white/10 rounded-lg flex flex-col overflow-hidden shadow-2xl">
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wide text-white">
                  {activeDrawer === 'search'
                    ? `화성 전체 지형 데이터베이스 (${MARS_LANDMARKS.length}곳)`
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
                {activeDrawer === 'search' && (
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="지역명(한글/영문), 얼음, 농경, 화산 검색..."
                        className="w-full bg-black/65 border border-white/15 rounded pl-8 pr-8 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400/60"
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

                    <div className="grid grid-cols-3 gap-1">
                      {LANDMARK_TYPE_TABS.map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setLandmarkTypeFilter(tab.id)}
                          className={`py-1.5 px-2 rounded border text-[11px] transition-colors whitespace-nowrap ${
                            landmarkTypeFilter === tab.id
                              ? 'bg-sky-400/15 border-sky-400/45 text-sky-300 font-medium'
                              : 'bg-black/40 border-white/10 text-slate-400 hover:text-white'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                      <span>
                        검색 결과{' '}
                        <span className="font-mono text-white">
                          {filteredLandmarks.length}
                        </span>
                        곳
                        {filteredLandmarks.length > 80 ? ' (상위 80개 표시)' : ''}
                      </span>
                      {regionId !== 'global' && (
                        <label className="flex items-center gap-1.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={regionScopeOnly}
                            onChange={(e) => setRegionScopeOnly(e.target.checked)}
                            className="accent-sky-400 w-3 h-3"
                          />
                          <span>
                            {regionId === 'tharsis' ? '타르시스만' : '엘리시움만'}
                          </span>
                        </label>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {filteredLandmarks.slice(0, 80).map((lm) => {
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
                            className={`p-2.5 rounded border transition-colors space-y-1.5 ${
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
                                <div className="font-medium text-white group-hover:text-sky-300 transition-colors">
                                  {lm.nameKo}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {lm.nameEn}
                                </div>
                              </button>
                              <span
                                className={`text-[10px] whitespace-nowrap ${typeColor}`}
                              >
                                {lm.rawCategory}
                              </span>
                            </div>

                            <p className="text-[11px] text-slate-400 leading-snug line-clamp-2">
                              {lm.descriptionKo}
                            </p>

                            <div className="flex items-center justify-between pt-1">
                              <span className="font-mono text-[10px] text-slate-400">
                                {lm.lat >= 0
                                  ? `${lm.lat.toFixed(1)}°N`
                                  : `${Math.abs(lm.lat).toFixed(1)}°S`}{' '}
                                {lm.lon.toFixed(1)}°E ·{' '}
                                {lm.elevationM.toLocaleString()}m
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => flyToLandmark(lm, 'start')}
                                  className="px-2 py-0.5 text-[10px] bg-white/10 hover:bg-white/20 text-slate-200 rounded"
                                >
                                  출발
                                </button>
                                <button
                                  type="button"
                                  onClick={() => flyToLandmark(lm, 'dest')}
                                  className="px-2 py-0.5 text-[10px] bg-sky-400/20 hover:bg-sky-400/30 text-sky-300 rounded font-medium"
                                >
                                  목적지
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeDrawer === 'nav' && (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-slate-400">
                        <span>지도 클릭 동작</span>
                        <button
                          type="button"
                          onClick={jumpToBestAgriSite}
                          className="text-emerald-400 hover:text-emerald-300 font-medium"
                        >
                          최적 농경지 자동 찾기
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-1 p-1 bg-black/50 border border-white/10 rounded">
                        {(
                          [
                            { id: 'destination', label: '목적지 찍기' },
                            { id: 'start', label: '출발지 변경' },
                            { id: 'inspect', label: '지점 검사' },
                          ] as { id: ClickTool; label: string }[]
                        ).map((tool) => (
                          <button
                            key={tool.id}
                            type="button"
                            onClick={() => setClickTool(tool.id)}
                            className={`py-1.5 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                              clickTool === tool.id
                                ? 'bg-sky-400/20 text-sky-300'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {tool.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 pt-4 border-t border-white/10">
                      <label className="text-slate-400 block">
                        목적지 좌표 직접 입력 (°N / °E)
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          step="0.5"
                          value={destLatInput}
                          onChange={(e) => setDestLatInput(e.target.value)}
                          aria-label="목적지 위도"
                          className="w-full bg-black/60 border border-white/15 rounded px-2.5 py-1.5 font-mono text-white"
                        />
                        <input
                          type="number"
                          step="0.5"
                          value={destLonInput}
                          onChange={(e) => setDestLonInput(e.target.value)}
                          aria-label="목적지 경도"
                          className="w-full bg-black/60 border border-white/15 rounded px-2.5 py-1.5 font-mono text-white"
                        />
                        <button
                          type="button"
                          onClick={applyManualDest}
                          className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded whitespace-nowrap shrink-0"
                        >
                          적용
                        </button>
                      </div>
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
                            className={`py-1.5 rounded border text-[11px] transition-colors whitespace-nowrap ${
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
                          단계별 상세 길안내 ({route.waypoints.length}단계)
                        </span>
                        <span className="font-mono text-[10px] text-sky-300">
                          {route.terrainSource === 'nasa_tiles'
                            ? 'NASA 실사지형 반영'
                            : '지형모델'}
                        </span>
                      </div>

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
                    </div>

                    <div className="space-y-2 pt-4 border-t border-white/10">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">
                          주요 화산 · 탐사 거점
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
                            className={`py-1.5 rounded border text-[11px] transition-colors whitespace-nowrap ${
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

                    <div className="space-y-2 pt-4 border-t border-white/10">
                      <span className="text-slate-400 block">
                        과학 센서 데이터 오버레이
                      </span>
                      <div className="space-y-1.5">
                        {(
                          [
                            {
                              key: 'swimWater',
                              label: 'SWIM 지하 얼음·수자원 확률',
                              color: 'accent-sky-400',
                            },
                            {
                              key: 'soilFertility',
                              label: 'CRISM 농업 적합 토양',
                              color: 'accent-emerald-400',
                            },
                            {
                              key: 'slopeHazard',
                              label: 'MOLA 급경사 위험 지형',
                              color: 'accent-rose-400',
                            },
                            {
                              key: 'gammaRay',
                              label: 'GRS 감마선 표층 수소',
                              color: 'accent-indigo-400',
                            },
                            {
                              key: 'geothermal',
                              label: '화산 지열·용융 구배',
                              color: 'accent-amber-400',
                            },
                          ] as {
                            key: keyof SensorLayers;
                            label: string;
                            color: string;
                          }[]
                        ).map((item) => (
                          <label
                            key={item.key}
                            className="flex items-center justify-between px-3 py-2 bg-black/40 border border-white/10 rounded cursor-pointer hover:border-white/20 text-slate-200"
                          >
                            <span>{item.label}</span>
                            <input
                              type="checkbox"
                              checked={layers[item.key]}
                              onChange={() => toggleLayer(item.key)}
                              className={`${item.color} w-3.5 h-3.5 cursor-pointer`}
                            />
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3 pt-4 border-t border-white/10">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-slate-400">
                            최소 지하수 표시 임계값
                          </span>
                          <span className="font-mono text-sky-300">
                            {minWaterThreshold}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={20}
                          max={85}
                          value={minWaterThreshold}
                          onChange={(e) =>
                            setMinWaterThreshold(Number(e.target.value))
                          }
                          className="w-full accent-sky-400 cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-slate-400">
                            급경사 위험 경고 기준
                          </span>
                          <span className="font-mono text-rose-300">
                            {maxSlopeThreshold}°
                          </span>
                        </div>
                        <input
                          type="range"
                          min={6}
                          max={22}
                          value={maxSlopeThreshold}
                          onChange={(e) =>
                            setMaxSlopeThreshold(Number(e.target.value))
                          }
                          className="w-full accent-rose-400 cursor-pointer"
                        />
                      </div>
                    </div>
                  </>
                )}

                {activeDrawer === 'inspect' && (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-slate-400">
                        <span>네비게이션 요약</span>
                        <span className="font-mono text-sky-300">
                          {route.found
                            ? `안전도 ${route.safetyScore}/100`
                            : '경로 없음'}
                        </span>
                      </div>
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
                          {inspectedPoint.lat >= 0
                            ? `${inspectedPoint.lat.toFixed(2)}°N`
                            : `${Math.abs(inspectedPoint.lat).toFixed(2)}°S`}
                          , {inspectedPoint.lon.toFixed(2)}°E
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
                        <div className="grid grid-cols-2 gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() =>
                              flyToLandmark(selectedLandmark, 'start')
                            }
                            className="py-1.5 text-[11px] bg-white/10 hover:bg-white/15 text-slate-200 rounded transition-colors"
                          >
                            출발지로 설정
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              flyToLandmark(selectedLandmark, 'dest')
                            }
                            className="py-1.5 text-[11px] bg-sky-400/20 hover:bg-sky-400/30 text-sky-300 font-medium rounded transition-colors"
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
