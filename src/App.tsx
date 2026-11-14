import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Compass,
  Eye,
  Globe2,
  HelpCircle,
  Layers,
  MapPin,
  Minus,
  Navigation,
  Plus,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { MarsMapCanvas } from './components/MarsMapCanvas';
import { MarsRegionSidePanel } from './components/MarsRegionSidePanel';
import { RouteElevationChart } from './components/RouteElevationChart';
import {
  MARS_LANDMARKS,
  REGION_PRESETS,
  findNearestLandmark,
  sampleMarsTelemetry,
} from './data/marsData';
import {
  ClickTool,
  FarmingTier,
  Landmark,
  MarsBaseLayerId,
  MarsTelemetryPoint,
  NavigationMode,
  RegionId,
  RoutePoint,
  RouteResult,
  RouteWaypoint,
  SensorLayers,
} from './types/mars';
import { matchesHangulOrText } from './utils/hangulSearch';
import { findMarsRouteFromNasaTiles } from './utils/pathfinding';

type ActiveDrawer = 'none' | 'place' | 'search' | 'nav' | 'layers' | 'inspect';

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

const REGION_MENU_ITEMS: { id: RegionId; label: string }[] = [
  { id: 'global', label: '화성 전체' },
  { id: 'tharsis', label: '타르시스' },
  { id: 'elysium', label: '엘리시움' },
  { id: 'arcadia', label: '알바·아르카디아' },
  { id: 'valles_marineris', label: '마리너 계곡' },
  { id: 'utopia', label: '유토피아' },
  { id: 'syrtis_isidis', label: '시르티스' },
  { id: 'hellas', label: '헬라스' },
];

function formatCoord(lat: number, lon: number): string {
  const latStr = lat >= 0 ? `${lat.toFixed(2)}°N` : `${Math.abs(lat).toFixed(2)}°S`;
  return `${latStr}, ${lon.toFixed(2)}°E`;
}

function getGlobalCoverPpd(): number {
  if (typeof window === 'undefined') return 4.2;
  return Number(
    Math.max((window.innerWidth - 68) / 360, window.innerHeight / 180).toFixed(2)
  );
}

function farmingTierBadgeClass(tier: FarmingTier): string {
  switch (tier) {
    case 'optimal':
      return 'text-sky-100 border-sky-400/70 bg-sky-500/30';
    case 'suitable':
      return 'text-emerald-100 border-emerald-400/70 bg-emerald-500/30';
    case 'possible':
      return 'text-amber-100 border-amber-400/70 bg-amber-500/30';
    case 'unsuitable':
      return 'text-rose-100 border-rose-400/70 bg-rose-500/30';
    case 'lethal':
      return 'text-orange-100 border-amber-700/80 bg-amber-950/65';
  }
}

function waypointTraitTitle(wp: RouteWaypoint): string {
  switch (wp.tag) {
    case 'start':
      return '탐사 출발 기지 · 초기 주행 시작점';
    case 'avoid':
      return '험지·단층 우회 변침 구간';
    case 'water':
      return `지하수 집중 유망 구간 (${wp.waterProb}%)`;
    case 'checkpoint':
      return '평탄 순항 · 중간 점검 지점';
    case 'target':
      return '최종 목표 도착 지점';
  }
}

function waypointTraitNote(wp: RouteWaypoint): string {
  if (wp.tag === 'start') {
    return `${wp.directionKo}(${wp.bearingDeg}°) 방면으로 로버 주행을 개시하는 기점입니다.`;
  }
  if (wp.tag === 'target') {
    return `누적 ${wp.distanceFromStartKm} km 주행 완료 지점 · 경사 ${wp.slopeDeg}° · 지하수 ${wp.waterProb}%`;
  }
  if (wp.tag === 'avoid') {
    return `인접 협곡·급경사 절벽을 우회하여 ${wp.directionKo}(${wp.bearingDeg}°) 방향으로 궤도를 수정하는 구간입니다.`;
  }
  if (wp.tag === 'water') {
    return `지하 얼음·함수층 확률 ${wp.waterProb}%의 수자원 시추 유망 통과 구간입니다.`;
  }
  return `비교적 완만한(${wp.slopeDeg}°) 지형을 따라 ${wp.directionKo}(${wp.bearingDeg}°)으로 직진하는 구간입니다.`;
}

export default function App() {
  const [activeDrawer, setActiveDrawer] = useState<ActiveDrawer>('none');
  const [customDrawerWidth, setCustomDrawerWidth] = useState<number>(384);
  const [isResizingDrawer, setIsResizingDrawer] = useState<boolean>(false);
  const [fullscreen3D, setFullscreen3D] = useState<boolean>(false);
  const [regionsOpen, setRegionsOpen] = useState<boolean>(false);
  const [chartOpen, setChartOpen] = useState<boolean>(false);

  const [regionId, setRegionId] = useState<RegionId>('global');
  const [baseLayer, setBaseLayer] = useState<MarsBaseLayerId>('viking');
  const [arVisorMode, setArVisorMode] = useState<boolean>(false);
  const [arGuideOpen, setArGuideOpen] = useState<boolean>(false);

  const [viewLat, setViewLat] = useState<number>(REGION_PRESETS.global.centerLat);
  const [viewLon, setViewLon] = useState<number>(REGION_PRESETS.global.centerLon);
  const [viewPpd, setViewPpd] = useState<number>(() => getGlobalCoverPpd());

  const [startCoord, setStartCoord] = useState<{ lat: number; lon: number } | null>(null);
  const [destCoord, setDestCoord] = useState<{ lat: number; lon: number } | null>(null);
  const [clickTool, setClickTool] = useState<ClickTool>('start');
  const [navMode, setNavMode] = useState<NavigationMode>('safe');

  const [layers, setLayers] = useState<SensorLayers>({
    swimWater: false,
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
  const [hoveredWaypoint, setHoveredWaypoint] = useState<{
    wp: RouteWaypoint;
    pos?: { x: number; y: number };
  } | null>(null);
  const [chartHoverPoint, setChartHoverPoint] = useState<RoutePoint | null>(null);

  const [route, setRoute] = useState<RouteResult>(EMPTY_ROUTE);
  const [isRouting, setIsRouting] = useState<boolean>(false);

  const regionsMenuRef = useRef<HTMLDivElement>(null);
  const lastDrawerRef = useRef<Exclude<ActiveDrawer, 'none'>>('place');

  useEffect(() => {
    if (activeDrawer !== 'none') {
      lastDrawerRef.current = activeDrawer;
    }
    if (activeDrawer !== 'place') {
      setFullscreen3D(false);
    }
  }, [activeDrawer]);

  // Allow ESC key to exit fullscreen 3D mode smoothly
  useEffect(() => {
    if (!fullscreen3D) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen3D(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreen3D]);

  const handleStartResizeDrawer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = customDrawerWidth;
      setIsResizingDrawer(true);

      const onMove = (ev: PointerEvent) => {
        const maxW = Math.max(420, window.innerWidth - 76);
        const nextW = Math.round(
          Math.max(320, Math.min(maxW, startWidth + (ev.clientX - startX)))
        );
        setCustomDrawerWidth(nextW);
      };
      const onUp = () => {
        setIsResizingDrawer(false);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [customDrawerWidth]
  );

  // Close region popover when clicking outside
  useEffect(() => {
    if (!regionsOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        regionsMenuRef.current &&
        !regionsMenuRef.current.contains(e.target as Node)
      ) {
        setRegionsOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [regionsOpen]);

  // Run NASA Mars Trek tile-aware A* pathfinding whenever BOTH Start and Dest are set
  useEffect(() => {
    if (!startCoord || !destCoord) {
      setRoute(EMPTY_ROUTE);
      setIsRouting(false);
      setChartHoverPoint(null);
      return;
    }

    let cancelled = false;
    setIsRouting(true);
    findMarsRouteFromNasaTiles(startCoord, destCoord, navMode).then((res) => {
      if (!cancelled) {
        setRoute(res);
        setIsRouting(false);
        setChartHoverPoint(null);
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
    setViewPpd(nextId === 'global' ? getGlobalCoverPpd() : preset.ppd);
    setRegionsOpen(false);
  };

  const handleResetView = () => {
    const preset = REGION_PRESETS[regionId];
    setViewLat(preset.centerLat);
    setViewLon(preset.centerLon);
    setViewPpd(regionId === 'global' ? getGlobalCoverPpd() : preset.ppd);
  };

  const handleViewportChange = useCallback(
    (lat: number, lon: number, nextPpd: number) => {
      setViewLat(lat);
      setViewLon(lon);
      setViewPpd(nextPpd);
    },
    []
  );

  // Clicking on a region on the map smoothly slides open the Left-Wall Place + 3D AR Panel
  const handleMapClick = useCallback(
    (pt: MarsTelemetryPoint) => {
      if (regionsOpen) setRegionsOpen(false);

      setInspectedPoint(pt);
      const near = findNearestLandmark(pt.lat, pt.lon, 0.55);
      setSelectedLandmark(near ? near.landmark : null);

      if (clickTool === 'start') {
        setStartCoord({ lat: pt.lat, lon: pt.lon });
        setClickTool(destCoord === null ? 'destination' : null);
        if (near) setActiveDrawer('place');
      } else if (clickTool === 'destination') {
        setDestCoord({ lat: pt.lat, lon: pt.lon });
        setClickTool(null);
        if (near) setActiveDrawer('place');
      } else {
        setActiveDrawer('place');
      }
    },
    [regionsOpen, clickTool, destCoord]
  );

  const handlePinClick = useCallback((pin: 'start' | 'destination') => {
    setClickTool(pin);
  }, []);

  const handleHoverWaypoint = useCallback(
    (wp: RouteWaypoint | null, screenPos?: { x: number; y: number }) => {
      if (!wp) {
        setHoveredWaypoint((prev) => (prev === null ? null : null));
        return;
      }
      setHoveredWaypoint({ wp, pos: screenPos });
    },
    []
  );

  const handleToggleArVisor = () => {
    setArVisorMode((prev) => {
      const next = !prev;
      if (next) {
        try {
          const seen = window.localStorage.getItem('mars_ar_guide_seen');
          if (!seen) setArGuideOpen(true);
        } catch {
          setArGuideOpen(true);
        }
      } else {
        setArGuideOpen(false);
      }
      return next;
    });
  };

  const dismissArGuide = (dontShowAgain = false) => {
    setArGuideOpen(false);
    if (dontShowAgain) {
      try {
        window.localStorage.setItem('mars_ar_guide_seen', '1');
      } catch {
        // ignore storage errors
      }
    }
  };

  const jumpToBestAgriSite = () => {
    const candidates = MARS_LANDMARKS.filter(
      (lm) =>
        lm.type === 'agri_candidate' &&
        (regionId === 'global' ||
          regionId === 'tharsis' ||
          regionId === 'elysium'
          ? regionId === 'global' || lm.region === regionId
          : true)
    );
    let bestLm: Landmark | null = null;
    let best = sampleMarsTelemetry(4, -118);
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
    setActiveDrawer('place');
    setClickTool(startCoord ? null : 'start');
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
    setActiveDrawer('place');
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

  const openDrawerFromMenu = (drawer: Exclude<ActiveDrawer, 'none'>) => {
    setActiveDrawer((prev) => (prev === drawer ? 'none' : drawer));
    setRegionsOpen(false);
  };

  const handleJumpToCoord = useCallback(
    (targetLat: number, targetLon: number) => {
      const pt = sampleMarsTelemetry(targetLat, targetLon);
      setInspectedPoint(pt);
      const near = findNearestLandmark(targetLat, targetLon, 0.55);
      setSelectedLandmark(near ? near.landmark : null);
      setViewLat(targetLat);
      setViewLon(targetLon);
      if (viewPpd < 12) setViewPpd(14);
    },
    [viewPpd]
  );

  const filteredLandmarks = useMemo(() => {
    const q = searchQuery.trim();
    return MARS_LANDMARKS.filter((lm) => {
      if (!q) return true;
      return (
        matchesHangulOrText(lm.nameKo, q) ||
        matchesHangulOrText(lm.nameEn, q) ||
        matchesHangulOrText(lm.rawCategory, q)
      );
    }).sort((a, b) => a.tier - b.tier);
  }, [searchQuery]);

  const quickRegionLandmarks = useMemo(
    () =>
      MARS_LANDMARKS.filter(
        (l) =>
          l.tier <= 2 &&
          (regionId === 'global'
            ? l.tier === 1
            : regionId === 'tharsis' || regionId === 'elysium'
              ? l.region === regionId
              : l.tier <= 2)
      ).slice(0, 12),
    [regionId]
  );

  const startLabel = useMemo(() => {
    if (!startCoord) return null;
    const near = findNearestLandmark(startCoord.lat, startCoord.lon, 0.8);
    return {
      title: near ? near.landmark.nameKo : '사용자 출발지',
      coord: formatCoord(startCoord.lat, startCoord.lon),
    };
  }, [startCoord]);

  const destLabel = useMemo(() => {
    if (!destCoord) return null;
    const near = findNearestLandmark(destCoord.lat, destCoord.lon, 0.8);
    return {
      title: near ? near.landmark.nameKo : '사용자 목적지',
      coord: formatCoord(destCoord.lat, destCoord.lon),
    };
  }, [destCoord]);

  const activePoint = hoveredPoint ?? inspectedPoint;
  const activeLayersCount = Object.values(layers).filter(Boolean).length;
  const isDrawerOpen = activeDrawer !== 'none';
  const isPlaceFullscreen = fullscreen3D && activeDrawer === 'place';
  const drawerWidthPx = customDrawerWidth;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#030508] text-slate-100 flex flex-row">
      {/* Left Docked Navigation Rail (Clean, off the map canvas) */}
      <nav
        aria-label="주 메뉴"
        className="w-[68px] h-full bg-[#070c16] border-r border-white/15 flex flex-col items-center justify-between py-3 z-40 shrink-0 select-none"
      >
        <div className="flex flex-col items-center w-full gap-1.5">
          {/* Orbital Brand Logo (resets view) */}
          <button
            type="button"
            onClick={() => {
              handleResetView();
              setRegionsOpen(false);
            }}
            title="THE VISION OF MARS · WATER EXTRACTION (시점 초기화)"
            className="w-12 py-1.5 mb-1.5 rounded-xl flex flex-col items-center gap-1 hover:bg-white/[0.06] transition-colors group"
          >
            <svg
              width="26"
              height="26"
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
                stroke="#070c16"
                strokeWidth="1.2"
              />
              <circle cx="24" cy="9.5" r="1.4" fill="#38BDF8" />
            </svg>
            <span className="text-[8.5px] font-bold tracking-[0.14em] text-slate-200 leading-none">
              MARS
            </span>
          </button>

          <div className="w-8 h-px bg-white/10 mb-1" />

          {/* Primary Rail Navigation Buttons */}
          <button
            type="button"
            onClick={() => openDrawerFromMenu('place')}
            className={`relative w-full py-2.5 flex flex-col items-center gap-1 transition-colors ${
              activeDrawer === 'place'
                ? 'text-sky-300 bg-sky-500/12'
                : 'text-slate-300 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            {activeDrawer === 'place' && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-sky-400" />
            )}
            <MapPin className="w-[18px] h-[18px]" strokeWidth={1.8} />
            <span className="text-[10px] font-medium">지점</span>
          </button>

          <button
            type="button"
            onClick={() => openDrawerFromMenu('search')}
            className={`relative w-full py-2.5 flex flex-col items-center gap-1 transition-colors ${
              activeDrawer === 'search'
                ? 'text-sky-300 bg-sky-500/12'
                : 'text-slate-300 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            {activeDrawer === 'search' && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-sky-400" />
            )}
            <Search className="w-[18px] h-[18px]" strokeWidth={1.8} />
            <span className="text-[10px] font-medium">검색</span>
          </button>

          <button
            type="button"
            onClick={() => openDrawerFromMenu('nav')}
            className={`relative w-full py-2.5 flex flex-col items-center gap-1 transition-colors ${
              activeDrawer === 'nav'
                ? 'text-emerald-300 bg-emerald-500/12'
                : 'text-slate-300 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            {activeDrawer === 'nav' && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-emerald-400" />
            )}
            <Navigation className="w-[18px] h-[18px]" strokeWidth={1.8} />
            <span className="text-[10px] font-medium">경로</span>
          </button>

          <button
            type="button"
            onClick={() => openDrawerFromMenu('layers')}
            className={`relative w-full py-2.5 flex flex-col items-center gap-1 transition-colors ${
              activeDrawer === 'layers'
                ? 'text-amber-300 bg-amber-500/12'
                : 'text-slate-300 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            {activeDrawer === 'layers' && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-amber-400" />
            )}
            <div className="relative">
              <Layers className="w-[18px] h-[18px]" strokeWidth={1.8} />
              {activeLayersCount > 0 && (
                <span className="absolute -top-1.5 -right-2.5 px-1 min-w-[14px] h-[14px] text-[9px] font-mono font-bold rounded-full bg-sky-400 text-slate-950 flex items-center justify-center leading-none">
                  {activeLayersCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium">레이어</span>
          </button>

          <button
            type="button"
            onClick={() => setChartOpen((v) => !v)}
            className={`relative w-full py-2.5 flex flex-col items-center gap-1 transition-colors ${
              chartOpen
                ? 'text-sky-300 bg-sky-500/12'
                : 'text-slate-300 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <Activity className="w-[18px] h-[18px]" strokeWidth={1.8} />
            <span className="text-[10px] font-medium">단면도</span>
          </button>

          <button
            type="button"
            onClick={handleToggleArVisor}
            className={`relative w-full py-2.5 flex flex-col items-center gap-1 transition-colors ${
              arVisorMode
                ? 'text-cyan-300 bg-cyan-500/15'
                : 'text-slate-300 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <Eye className="w-[18px] h-[18px]" strokeWidth={1.8} />
            <span className="text-[10px] font-medium">AR뷰</span>
          </button>
        </div>

        {/* Bottom Region Presets & Inspect Trigger */}
        <div
          className="relative flex flex-col items-center w-full gap-1.5 pt-2 border-t border-white/10"
          ref={regionsMenuRef}
        >
          <button
            type="button"
            onClick={() => openDrawerFromMenu('inspect')}
            className={`relative w-full py-2 flex flex-col items-center gap-1 transition-colors ${
              activeDrawer === 'inspect'
                ? 'text-cyan-300 bg-cyan-500/12'
                : 'text-slate-300 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            {activeDrawer === 'inspect' && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-cyan-400" />
            )}
            <Compass className="w-[18px] h-[18px]" strokeWidth={1.8} />
            <span className="text-[10px] font-medium">정밀</span>
          </button>

          <button
            type="button"
            onClick={() => setRegionsOpen((v) => !v)}
            className={`w-full py-2 flex flex-col items-center gap-1 transition-colors ${
              regionsOpen
                ? 'text-white bg-white/10'
                : 'text-slate-300 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <Globe2 className="w-[18px] h-[18px]" strokeWidth={1.8} />
            <span className="text-[10px] font-medium">구역</span>
          </button>

          {regionsOpen && (
            <div className="absolute left-[72px] bottom-2 w-60 bg-[#0b1220]/[0.96] border border-white/25 rounded-xl p-2.5 shadow-2xl z-50 text-xs">
              <div className="px-1.5 pb-2 mb-2 border-b border-white/15">
                <div className="text-[11px] font-bold tracking-wider text-white">
                  THE VISION OF MARS
                </div>
                <div className="text-[9px] font-mono tracking-widest text-sky-300/90">
                  WATER EXTRACTION · 구역 이동
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {REGION_MENU_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleRegionChange(item.id)}
                    className={`px-2.5 py-2 rounded-lg text-[11px] text-left truncate transition-colors ${
                      regionId === item.id
                        ? 'bg-sky-400/25 text-sky-100 font-semibold border border-sky-300/45'
                        : 'text-slate-100 hover:bg-white/12'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Main Unobstructed Fullscreen Mars Map + Left-Wall Sliding Drawer */}
      <main className="relative flex-1 h-full overflow-hidden">
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
          highlightedRoutePoint={chartHoverPoint}
          hoveredTelemetry={hoveredPoint}
          hoveredWaypointIndex={hoveredWaypoint?.wp.index ?? null}
          chartOpen={chartOpen}
          onHoverPoint={setHoveredPoint}
          onHoverWaypoint={handleHoverWaypoint}
          onMapClick={handleMapClick}
          onPinClick={handlePinClick}
          onSelectLandmark={setSelectedLandmark}
          onShowArGuide={() => setArGuideOpen(true)}
        />

        {/* Borderless Route Distance & Rover Time Readout (shifts cleanly alongside open left drawer) */}
        <div
          style={{ left: `${isDrawerOpen ? drawerWidthPx + 22 : 20}px` }}
          className="absolute top-4 z-20 flex flex-col gap-1 pointer-events-auto transition-[left] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        >
          {startCoord && destCoord ? (
            <button
              type="button"
              onClick={() => openDrawerFromMenu('nav')}
              className="flex items-center gap-4 text-left transition-opacity hover:opacity-85 [filter:drop-shadow(0_2px_3px_rgba(0,0,0,1))_drop-shadow(0_0_10px_rgba(0,0,0,0.92))]"
            >
              {isRouting ? (
                <span className="font-mono text-sm font-semibold text-white">
                  경로 분석 중...
                </span>
              ) : route.found ? (
                <>
                  <div>
                    <div className="text-[10px] font-bold tracking-wider text-amber-300 leading-none mb-0.5">
                      총 거리
                    </div>
                    <div className="text-2xl font-mono font-extrabold text-white tabular-nums leading-none">
                      {route.totalDistanceKm.toLocaleString()}
                      <span className="text-xs font-semibold text-slate-200 ml-1">km</span>
                    </div>
                  </div>
                  <span className="h-7 w-px bg-white/40" />
                  <div>
                    <div className="text-[10px] font-bold tracking-wider text-sky-300 leading-none mb-0.5">
                      로버 이동
                    </div>
                    <div className="text-2xl font-mono font-extrabold text-cyan-300 tabular-nums leading-none">
                      {route.estimatedHoursRover}
                      <span className="text-xs font-semibold text-cyan-100 ml-0.5">h</span>
                    </div>
                  </div>
                </>
              ) : (
                <span className="font-mono text-base text-rose-300 font-bold">
                  이동 불가 경로
                </span>
              )}
            </button>
          ) : (
            <div className="flex items-baseline gap-2.5 text-xs [filter:drop-shadow(0_2px_3px_rgba(0,0,0,1))_drop-shadow(0_0_8px_rgba(0,0,0,0.9))]">
              <span className="font-mono font-semibold text-white tabular-nums">
                {formatCoord(activePoint.lat, activePoint.lon)}
              </span>
              <span className="text-white/45">|</span>
              <span className="font-mono font-bold text-cyan-300 tabular-nums">
                지하수 {activePoint.combinedWaterProb}%
              </span>
            </div>
          )}
        </div>

        {/* Waypoint Hover Characteristic Tooltip Floating Over Map */}
        {hoveredWaypoint && hoveredWaypoint.pos && (
          <div
            style={{
              left: `${Math.min(Math.max(hoveredWaypoint.pos.x + 14, 84), window.innerWidth - 290)}px`,
              top: `${Math.min(Math.max(hoveredWaypoint.pos.y - 24, 24), window.innerHeight - 170)}px`,
            }}
            className="pointer-events-none fixed z-30 w-68 bg-slate-900/75 border border-white/30 rounded-xl p-3 shadow-2xl space-y-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={`font-mono text-[11px] font-bold px-1.5 py-0.5 rounded ${
                  hoveredWaypoint.wp.tag === 'avoid'
                    ? 'bg-amber-400/25 text-amber-200'
                    : hoveredWaypoint.wp.tag === 'water'
                      ? 'bg-sky-400/25 text-sky-200'
                      : hoveredWaypoint.wp.tag === 'target'
                        ? 'bg-emerald-400/25 text-emerald-200'
                        : 'bg-white/20 text-white'
                }`}
              >
                {hoveredWaypoint.wp.code}
              </span>
              <span className="font-mono text-[10px] text-slate-200">
                {hoveredWaypoint.wp.distanceFromStartKm} km 지점
              </span>
            </div>
            <div className="text-xs font-semibold text-white">
              {waypointTraitTitle(hoveredWaypoint.wp)}
            </div>
            <p className="text-[11px] text-slate-100/90 leading-snug">
              {waypointTraitNote(hoveredWaypoint.wp)}
            </p>
            <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-white/15 text-[10px] font-mono">
              <div>
                <span className="text-slate-300 block">고도</span>
                <span className="text-white font-semibold">
                  {hoveredWaypoint.wp.elevationM.toLocaleString()}m
                </span>
              </div>
              <div>
                <span className="text-slate-300 block">경사</span>
                <span className="text-amber-200 font-semibold">
                  {hoveredWaypoint.wp.slopeDeg}°
                </span>
              </div>
              <div>
                <span className="text-slate-300 block">지하수</span>
                <span className="text-sky-200 font-semibold">
                  {hoveredWaypoint.wp.waterProb}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Top-Center Interactive Pick Prompt or Blocked/Snapped Notice */}
        {clickTool !== null ? (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 max-w-[90vw] flex items-center gap-3 bg-slate-900/75 border border-sky-300/50 text-white px-4 py-1.5 rounded-lg text-xs shadow-xl">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                clickTool === 'start' ? 'bg-white' : 'bg-sky-300'
              }`}
            />
            <span>
              {clickTool === 'start'
                ? '지도를 클릭해 출발지(START)를 설정하세요'
                : '지도를 클릭해 목적지(TARGET)를 설정하세요'}
            </span>
            <button
              type="button"
              onClick={() => setClickTool(null)}
              className="text-slate-200 hover:text-white pl-2 border-l border-white/25"
            >
              닫기
            </button>
          </div>
        ) : startCoord && destCoord && !isRouting && !route.found ? (
          <button
            type="button"
            onClick={() => openDrawerFromMenu('nav')}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-20 max-w-[90vw] flex items-center gap-2 bg-rose-950/80 border border-rose-400/55 text-rose-100 px-3.5 py-1.5 rounded-lg text-xs shadow-xl hover:border-rose-300"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-300 shrink-0" />
            <span className="font-semibold text-rose-200">이동 불가</span>
            <span className="text-white/90 truncate">{route.summaryKo}</span>
          </button>
        ) : startCoord &&
          destCoord &&
          !isRouting &&
          route.found &&
          route.snappedToSafeApproach ? (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 max-w-[90vw] flex items-center gap-2 bg-amber-950/75 border border-amber-300/45 text-amber-100 px-3.5 py-1.5 rounded-lg text-xs shadow-xl">
            <span className="w-2 h-2 rounded-full bg-amber-300 shrink-0" />
            <span className="truncate">{route.summaryKo}</span>
          </div>
        ) : null}

        {/* AR Visor Usage Guide Modal (opens on first toggle or via '? 사용법') */}
        {arGuideOpen && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 w-[370px] max-w-[92vw] bg-[#0b1220]/95 border border-cyan-300/45 rounded-2xl p-4 shadow-2xl space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-cyan-300 shrink-0" />
                <span className="text-sm font-semibold text-white">
                  AR 우주복 바이저 사용법
                </span>
              </div>
              <button
                type="button"
                onClick={() => dismissArGuide(false)}
                className="p-1 text-slate-200 hover:text-white rounded"
                aria-label="가이드 닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-100 leading-relaxed">
              <div className="bg-white/[0.08] border border-white/15 rounded-lg p-2.5">
                <div className="font-semibold text-cyan-200 mb-0.5">
                  1. 실시간 지형 레이저 스캐너
                </div>
                <p className="text-[11px] text-slate-200">
                  화성 지도 위로 마우스를 움직이면 하단 바이저 바에 실시간 좌표·고도·경사각·지하수 확률·농업 등급이 즉시 표시됩니다.
                </p>
              </div>
              <div className="bg-white/[0.08] border border-white/15 rounded-lg p-2.5">
                <div className="font-semibold text-cyan-200 mb-0.5">
                  2. 항법 방위각(HDG) · 잔여거리 HUD
                </div>
                <p className="text-[11px] text-slate-200">
                  출발지·목적지를 지정하면 상단 중앙 헬멧 HUD에 진행 방위각, 총 이동 거리(DIST), 예상 주행 시간(ETA)이 고정 표시됩니다.
                </p>
              </div>
              <div className="bg-white/[0.08] border border-white/15 rounded-lg p-2.5">
                <div className="font-semibold text-cyan-200 mb-0.5">
                  3. 급경사·위험 지형 경보
                </div>
                <p className="text-[11px] text-slate-200">
                  경사 18° 이상의 절벽·분화구 구역을 스캔하면 경사 수치가 붉게 점등되어 로버 전복 위험을 경고합니다.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => dismissArGuide(true)}
                className="text-[11px] text-slate-300 hover:text-white underline underline-offset-2"
              >
                다시 보지 않기
              </button>
              <button
                type="button"
                onClick={() => dismissArGuide(false)}
                className="px-3.5 py-1.5 text-xs font-semibold bg-cyan-400/90 hover:bg-cyan-300 text-slate-950 rounded-lg transition-colors"
              >
                확인 · 탐사 시작
              </button>
            </div>
          </div>
        )}

        {/* Minimal Translucent Zoom Controls (Bottom-Right Corner) */}
        <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1 bg-slate-900/75 border border-white/25 p-1 rounded-lg shadow-lg">
          <button
            type="button"
            onClick={() =>
              setViewPpd((p) => Math.min(140, Number((p * 1.45).toFixed(2))))
            }
            title="확대"
            aria-label="지도 확대"
            className="w-7 h-7 flex items-center justify-center rounded text-slate-100 hover:text-white hover:bg-white/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.8} />
          </button>
          <button
            type="button"
            onClick={() =>
              setViewPpd((p) =>
                Math.max(getGlobalCoverPpd(), Number((p * 0.68).toFixed(2)))
              )
            }
            title="축소"
            aria-label="지도 축소"
            className="w-7 h-7 flex items-center justify-center rounded text-slate-100 hover:text-white hover:bg-white/20 transition-colors"
          >
            <Minus className="w-3.5 h-3.5" strokeWidth={1.8} />
          </button>
          <button
            type="button"
            onClick={handleResetView}
            title="시점 초기화"
            aria-label="시점 초기화"
            className="w-7 h-7 flex items-center justify-center rounded text-slate-100 hover:text-white hover:bg-white/20 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.8} />
          </button>
        </div>

        {/* Left-Wall Animated / Resizable / Fullscreen Panel */}
        <div
          className={
            isPlaceFullscreen
              ? 'fixed inset-0 z-50 flex items-stretch pointer-events-none'
              : 'absolute top-0 bottom-0 left-0 z-30 flex items-stretch pointer-events-none'
          }
        >
          <aside
            style={
              isPlaceFullscreen
                ? { width: '100vw' }
                : { width: isDrawerOpen ? `${drawerWidthPx}px` : '0px' }
            }
            className={`relative h-full overflow-hidden bg-[#0a111e]/[0.95] pointer-events-auto ${
              isPlaceFullscreen
                ? 'w-screen border-r-0'
                : `max-w-[calc(100vw-68px)] border-r shadow-[14px_0_40px_rgba(0,0,0,0.55)] ${
                    isResizingDrawer
                      ? 'transition-none'
                      : 'transition-[width,opacity,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]'
                  }`
            } ${
              isDrawerOpen
                ? 'opacity-100 border-white/18'
                : 'opacity-0 border-transparent'
            }`}
          >
            <div
              style={
                isPlaceFullscreen
                  ? { width: '100%' }
                  : { width: `${drawerWidthPx}px` }
              }
              className={`h-full flex flex-col ${
                isPlaceFullscreen ? '' : 'max-w-[calc(100vw-68px)]'
              }`}
            >
              {/* Branded Panel Header */}
              <div className="px-4 py-3 border-b border-white/15 flex items-center justify-between bg-white/[0.02] shrink-0">
                <div className="min-w-0">
                  <div className="text-[9px] font-mono tracking-[0.2em] text-sky-300/90 uppercase">
                    THE VISION OF MARS · WATER EXTRACTION
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {activeDrawer === 'inspect' && (
                      <button
                        type="button"
                        onClick={() => setActiveDrawer('place')}
                        className="p-0.5 text-slate-300 hover:text-white rounded"
                        title="지점 정보로 돌아가기"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <span className="text-[13px] font-bold text-white tracking-wide truncate">
                      {activeDrawer === 'place'
                        ? isPlaceFullscreen
                          ? '3D AR 전체화면 · 경로 탐색'
                          : '지점 확대 · 3D AR 지형'
                        : activeDrawer === 'search'
                          ? '화성 지형 검색'
                          : activeDrawer === 'nav'
                            ? '경로 네비게이션'
                            : activeDrawer === 'layers'
                              ? '위성 · 센서 레이어'
                              : '경로 · 지점 정밀 분석'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFullscreen3D(false);
                    setActiveDrawer('none');
                  }}
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors shrink-0"
                  aria-label="패널 닫기"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div
                className={`p-4 flex-1 min-h-0 text-xs ${
                  activeDrawer === 'place'
                    ? 'flex flex-col overflow-hidden'
                    : 'space-y-4 overflow-y-auto'
                }`}
              >
                {/* 0. PLACE PREVIEW PANEL (ZOOMED SATELLITE + RESIZABLE/FULLSCREEN 3D AR) */}
                {activeDrawer === 'place' && (
                  <MarsRegionSidePanel
                    point={inspectedPoint}
                    landmark={selectedLandmark}
                    drawerWidthPx={drawerWidthPx}
                    fullscreen3D={isPlaceFullscreen}
                    onSetDrawerWidth={setCustomDrawerWidth}
                    onSetFullscreen3D={setFullscreen3D}
                    onJumpToCoord={handleJumpToCoord}
                    route={route}
                    startCoord={startCoord}
                    destCoord={destCoord}
                  />
                )}

                {/* 1. CHOSEONG-ENABLED CLEAN SEARCH DRAWER */}
              {activeDrawer === 'search' && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-200 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="지역명, 초성(ㅇㄹㅍㅅ), 영문 검색..."
                      className="w-full bg-white/10 border border-white/25 rounded-lg pl-9 pr-8 py-2.5 text-xs text-white placeholder:text-slate-300 focus:outline-none focus:border-sky-300"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-200 hover:text-white"
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
                          ? 'text-amber-200'
                          : lm.type === 'ice_sheet'
                            ? 'text-sky-200'
                            : lm.type === 'agri_candidate'
                              ? 'text-emerald-200'
                              : lm.type === 'canyon'
                                ? 'text-cyan-200'
                                : 'text-slate-200';
                      return (
                        <div
                          key={lm.id}
                          className={`p-3 rounded-lg border transition-colors space-y-2 ${
                            selectedLandmark?.id === lm.id
                              ? 'bg-sky-400/20 border-sky-300/60'
                              : 'bg-white/[0.07] border-white/18 hover:border-white/35'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => flyToLandmark(lm, 'inspect')}
                              className="text-left flex-1 group"
                            >
                              <div className="text-[13px] font-semibold text-white group-hover:text-sky-200 transition-colors">
                                {lm.nameKo}
                              </div>
                              <div className="text-[10px] text-slate-200/80 font-mono mt-0.5">
                                {lm.nameEn} · {formatCoord(lm.lat, lm.lon)} ·{' '}
                                {lm.elevationM.toLocaleString()}m
                              </div>
                            </button>
                            <span className={`text-[10px] whitespace-nowrap ${typeColor}`}>
                              {lm.rawCategory}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => flyToLandmark(lm, 'start')}
                              className="py-1.5 text-xs font-medium bg-white/15 hover:bg-white/25 text-white rounded transition-colors"
                            >
                              출발지
                            </button>
                            <button
                              type="button"
                              onClick={() => flyToLandmark(lm, 'dest')}
                              className="py-1.5 text-xs font-semibold bg-sky-400/30 hover:bg-sky-400/45 border border-sky-300/45 text-sky-100 rounded transition-colors"
                            >
                              목적지
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. CONCISE NAVIGATION DRAWER */}
              {activeDrawer === 'nav' && (
                <>
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-slate-200">
                      <span>클릭 후 지도에서 위치 선택</span>
                      <button
                        type="button"
                        onClick={jumpToBestAgriSite}
                        className="text-emerald-200 hover:text-emerald-100 font-semibold"
                      >
                        최적 농경지 추천
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setClickTool((prev) =>
                          prev === 'start' ? null : 'start'
                        )
                      }
                      className={`w-full text-left p-3 rounded-lg border transition-colors flex items-center justify-between gap-2 ${
                        clickTool === 'start'
                          ? 'bg-white/20 border-white/70'
                          : 'bg-white/[0.08] border-white/20 hover:border-white/40'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-white shrink-0" />
                          <span className="font-mono text-[11px] font-semibold text-white">
                            출발지 (START)
                          </span>
                        </div>
                        <div className="text-xs text-slate-100 mt-1 truncate pl-4">
                          {clickTool === 'start'
                            ? '지도에서 새 출발지를 클릭하세요...'
                            : startLabel
                              ? `${startLabel.title} · ${startLabel.coord}`
                              : '클릭 후 지도에서 선택'}
                        </div>
                      </div>
                      <span className="text-[11px] text-slate-200 shrink-0">
                        {clickTool === 'start' ? '선택 중' : '변경'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setClickTool((prev) =>
                          prev === 'destination' ? null : 'destination'
                        )
                      }
                      className={`w-full text-left p-3 rounded-lg border transition-colors flex items-center justify-between gap-2 ${
                        clickTool === 'destination'
                          ? 'bg-sky-400/25 border-sky-300'
                          : 'bg-white/[0.08] border-white/20 hover:border-sky-300/50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-sky-300 shrink-0" />
                          <span className="font-mono text-[11px] font-semibold text-sky-200">
                            목적지 (TARGET)
                          </span>
                        </div>
                        <div className="text-xs text-slate-100 mt-1 truncate pl-4">
                          {clickTool === 'destination'
                            ? '지도에서 새 목적지를 클릭하세요...'
                            : destLabel
                              ? `${destLabel.title} · ${destLabel.coord}`
                              : '클릭 후 지도에서 선택'}
                        </div>
                      </div>
                      <span className="text-[11px] text-sky-200 shrink-0">
                        {clickTool === 'destination' ? '선택 중' : '변경'}
                      </span>
                    </button>
                  </div>

                  <div className="space-y-2 pt-3 border-t border-white/15">
                    <span className="text-slate-200 block">경로 기준</span>
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
                          className={`py-2 rounded-lg border text-[11px] transition-colors whitespace-nowrap ${
                            navMode === m.id
                              ? 'bg-sky-400/30 text-white border-sky-300/60 font-semibold'
                              : 'bg-white/[0.07] text-slate-200 border-white/18 hover:text-white'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Concise Turn-by-Turn Waypoints with Hover Sync */}
                  <div className="space-y-2 pt-3 border-t border-white/15">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-medium">
                        {route.found
                          ? `경유지 (${route.waypoints.length})`
                          : '경로 안내'}
                      </span>
                      <span className="font-mono text-[10px] text-sky-200">
                        {route.terrainSource === 'nasa_tiles' ? 'NASA 지형' : '모델'}
                      </span>
                    </div>

                    {!startCoord || !destCoord ? (
                      <div className="bg-white/[0.07] border border-white/18 rounded-lg p-3 text-[11px] text-slate-200">
                        출발지와 목적지를 설정하면 경로가 안내됩니다.
                      </div>
                    ) : !isRouting && !route.found ? (
                      <div className="bg-rose-950/50 border border-rose-400/50 rounded-lg p-3 space-y-1">
                        <div className="flex items-center gap-1.5 text-rose-200 font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>이동 불가</span>
                        </div>
                        <p className="text-[11px] text-rose-100">{route.summaryKo}</p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {route.waypoints.map((wp) => (
                          <button
                            key={wp.index}
                            type="button"
                            onMouseEnter={() => setHoveredWaypoint({ wp })}
                            onMouseLeave={() => setHoveredWaypoint(null)}
                            onClick={() => {
                              setViewLat(wp.lat);
                              setViewLon(wp.lon);
                              if (viewPpd < 24) setViewPpd(26);
                              setInspectedPoint(sampleMarsTelemetry(wp.lat, wp.lon));
                            }}
                            title={waypointTraitNote(wp)}
                            className="w-full text-left bg-white/[0.07] hover:bg-white/[0.16] border border-white/18 rounded-lg px-3 py-2 transition-colors flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`font-mono text-[11px] font-semibold shrink-0 ${
                                  wp.tag === 'avoid'
                                    ? 'text-amber-200'
                                    : wp.tag === 'water'
                                      ? 'text-sky-200'
                                      : wp.tag === 'target'
                                        ? 'text-emerald-200'
                                        : 'text-white'
                                }`}
                              >
                                {wp.code}
                              </span>
                              <span className="text-[11px] text-slate-100 truncate">
                                {wp.instructionKo}
                              </span>
                            </div>
                            <span className="font-mono text-[10px] text-slate-200 shrink-0 tabular-nums">
                              {wp.distanceFromStartKm}km · {wp.slopeDeg}°
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 pt-3 border-t border-white/15">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-200">주요 지형 바로가기</span>
                      <button
                        type="button"
                        onClick={() => setActiveDrawer('search')}
                        className="text-sky-200 hover:text-white text-[11px]"
                      >
                        전체 검색
                      </button>
                    </div>
                    <div className="space-y-1">
                      {quickRegionLandmarks.map((lm) => (
                        <button
                          key={lm.id}
                          type="button"
                          onClick={() => flyToLandmark(lm, 'inspect')}
                          className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors flex items-center justify-between ${
                            selectedLandmark?.id === lm.id
                              ? 'bg-sky-400/25 border-sky-300/60 text-white'
                              : 'bg-white/[0.07] border-white/18 text-slate-100 hover:border-white/35'
                          }`}
                        >
                          <span>{lm.nameKo}</span>
                          <span className="font-mono text-[11px] text-slate-200 tabular-nums">
                            {lm.elevationM.toLocaleString()}m
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* 3. SENSOR LAYERS DRAWER WITH EXACT MULTI-TIER THRESHOLD LEGENDS */}
              {activeDrawer === 'layers' && (
                <>
                  <div className="space-y-2">
                    <span className="text-slate-200 block">
                      NASA Mars Trek 기본 위성 지도
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'viking', label: 'Viking 실사' },
                          { id: 'hybrid', label: '위성+고도' },
                          { id: 'mola', label: 'MOLA 고도' },
                        ] as { id: MarsBaseLayerId; label: string }[]
                      ).map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setBaseLayer(b.id)}
                          className={`py-2 rounded-lg border text-[11px] transition-colors whitespace-nowrap ${
                            baseLayer === b.id
                              ? 'bg-amber-400/30 text-amber-100 border-amber-300/60 font-semibold'
                              : 'bg-white/[0.07] text-slate-200 border-white/18 hover:text-white'
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 pt-3 border-t border-white/15">
                    <span className="text-slate-200 block">
                      과학 센서 레이어
                    </span>
                    <div className="space-y-2">
                      {(
                        [
                          {
                            key: 'swimWater',
                            label: '지하수 · 얼음 확률',
                            accent: 'accent-sky-400',
                            stops: [
                              { color: '#38BDF8', text: '25% 미량' },
                              { color: '#0EA5E9', text: '45% 유망' },
                              { color: '#2563EB', text: '65% 고농도' },
                              { color: '#1E40AF', text: '80%+ 핵심' },
                            ],
                          },
                          {
                            key: 'soilFertility',
                            label: '농업 적합 토양',
                            accent: 'accent-emerald-400',
                            stops: [
                              { color: '#2582F6', text: '최상' },
                              { color: '#10B981', text: '적합' },
                              { color: '#F59E0B', text: '가능' },
                              { color: '#EF4444', text: '불가' },
                              { color: '#6B3410', text: '극위험' },
                            ],
                          },
                          {
                            key: 'elevation',
                            label: '지형 고도 (MOLA)',
                            accent: 'accent-cyan-400',
                            stops: [
                              { color: '#2563EB', text: '<-3km' },
                              { color: '#06B6D4', text: '-3~0' },
                              { color: '#22C55E', text: '0~3km' },
                              { color: '#F59E0B', text: '3~7.5' },
                              { color: '#DC2626', text: '>7.5km' },
                            ],
                          },
                          {
                            key: 'slopeHazard',
                            label: '위험 지형 (경사)',
                            accent: 'accent-rose-400',
                            stops: [
                              { color: '#FACC15', text: '7° 주의' },
                              { color: '#F97316', text: '12° 급경사' },
                              { color: '#EF4444', text: '18° 위험' },
                              { color: '#6B2814', text: '25°+ 절벽' },
                            ],
                          },
                          {
                            key: 'geothermal',
                            label: '화산 · 지열 지대',
                            accent: 'accent-amber-400',
                            stops: [
                              { color: '#FDE047', text: '25 약지열' },
                              { color: '#F97316', text: '50 화산열' },
                              { color: '#DC2626', text: '75+ 열수' },
                            ],
                          },
                        ] as {
                          key: keyof SensorLayers;
                          label: string;
                          accent: string;
                          stops: { color: string; text: string }[];
                        }[]
                      ).map((item) => {
                        const active = layers[item.key];
                        return (
                          <label
                            key={item.key}
                            className={`block px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                              active
                                ? 'bg-white/18 border-white/45 text-white'
                                : 'bg-white/[0.07] border-white/18 text-slate-100 hover:border-white/35'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-xs">
                                {item.label}
                              </span>
                              <input
                                type="checkbox"
                                checked={active}
                                onChange={() => toggleLayer(item.key)}
                                className={`${item.accent} w-3.5 h-3.5 cursor-pointer`}
                              />
                            </div>

                            {/* Segmented Color Bar + Aligned Single-Row Labels */}
                            <div className="mt-2 space-y-1">
                              <div className="h-1.5 w-full rounded-full overflow-hidden flex gap-px bg-black/25">
                                {item.stops.map((st) => (
                                  <div
                                    key={st.text}
                                    className="flex-1 h-full"
                                    style={{ backgroundColor: st.color }}
                                  />
                                ))}
                              </div>
                              <div
                                className="grid gap-1 text-center text-[10px] text-slate-200/90 tabular-nums leading-none pt-0.5"
                                style={{
                                  gridTemplateColumns: `repeat(${item.stops.length}, minmax(0, 1fr))`,
                                }}
                              >
                                {item.stops.map((st) => (
                                  <span key={st.text} className="truncate">
                                    {st.text}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2 pt-3 border-t border-white/15">
                    <div className="flex justify-between">
                      <span className="text-slate-200">레이어 색상 진하기</span>
                      <span className="font-mono text-sky-200">
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

              {/* 4. CONCISE INSPECT DRAWER */}
              {activeDrawer === 'inspect' && (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-slate-200">
                      <span>네비게이션 요약</span>
                      <span
                        className={`font-mono ${
                          !startCoord || !destCoord
                            ? 'text-slate-200'
                            : route.found
                              ? 'text-sky-200'
                              : 'text-rose-300 font-semibold'
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
                      <div className="bg-rose-950/50 border border-rose-400/50 rounded-lg p-2.5 text-[11px] text-rose-100">
                        {route.summaryKo}
                      </div>
                    )}
                    {startCoord &&
                      destCoord &&
                      !isRouting &&
                      route.found &&
                      route.snappedToSafeApproach && (
                        <div className="bg-amber-950/45 border border-amber-300/45 rounded-lg p-2.5 text-[11px] text-amber-100">
                          {route.summaryKo}
                        </div>
                      )}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white/[0.08] border border-white/18 rounded-lg p-2.5">
                        <div className="text-[10px] text-slate-200/80">총 거리</div>
                        <div className="text-base font-mono font-semibold text-white">
                          {route.found ? `${route.totalDistanceKm} km` : '--'}
                        </div>
                      </div>
                      <div className="bg-white/[0.08] border border-white/18 rounded-lg p-2.5">
                        <div className="text-[10px] text-slate-200/80">
                          로버 / 도보
                        </div>
                        <div className="text-base font-mono font-semibold text-sky-200">
                          {route.found
                            ? `${route.estimatedHoursRover}h / ${route.estimatedHoursEva}h`
                            : '--'}
                        </div>
                      </div>
                      <div className="bg-white/[0.08] border border-white/18 rounded-lg p-2.5">
                        <div className="text-[10px] text-slate-200/80">최대 경사</div>
                        <div className="text-base font-mono font-semibold text-amber-200">
                          {route.found ? `${route.maxSlopeDeg}°` : '--'}
                        </div>
                      </div>
                      <div className="bg-white/[0.08] border border-white/18 rounded-lg p-2.5">
                        <div className="text-[10px] text-slate-200/80">
                          평균 지하수
                        </div>
                        <div className="text-base font-mono font-semibold text-emerald-200">
                          {route.found ? `${route.avgWaterProb}%` : '--'}
                        </div>
                      </div>
                    </div>

                    {route.waypoints.length > 0 && (
                      <div className="pt-2 space-y-1.5">
                        <div className="text-slate-200 flex justify-between">
                          <span>경유지 (호버·클릭 시 확인)</span>
                          <span className="font-mono text-[10px] text-sky-200">
                            {route.terrainSource === 'nasa_tiles'
                              ? 'NASA 지형'
                              : '모델'}
                          </span>
                        </div>
                        <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                          {route.waypoints.map((wp) => (
                            <button
                              key={wp.index}
                              type="button"
                              onMouseEnter={() => setHoveredWaypoint({ wp })}
                              onMouseLeave={() => setHoveredWaypoint(null)}
                              onClick={() => {
                                setViewLat(wp.lat);
                                setViewLon(wp.lon);
                                if (viewPpd < 24) setViewPpd(26);
                              }}
                              title={waypointTraitNote(wp)}
                              className="w-full text-left bg-white/[0.07] hover:bg-white/[0.16] border border-white/18 rounded-lg px-2.5 py-1.5 transition-colors flex items-center justify-between gap-2"
                            >
                              <span className="font-mono text-[10px] text-sky-200 shrink-0">
                                {wp.code}
                              </span>
                              <span className="text-[11px] text-slate-100 truncate flex-1">
                                {wp.instructionKo}
                              </span>
                              <span className="font-mono text-[10px] text-slate-200 shrink-0">
                                {wp.distanceFromStartKm}km
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 pt-3 border-t border-white/15">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-200">선택 좌표 데이터</span>
                      <span className="font-mono text-white">
                        {formatCoord(inspectedPoint.lat, inspectedPoint.lon)}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between py-1 border-b border-white/15">
                        <span className="text-slate-200">MOLA 고도 · 경사</span>
                        <span className="font-mono text-white">
                          {inspectedPoint.elevationM.toLocaleString()}m ·{' '}
                          {inspectedPoint.slopeDeg}°
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-white/15">
                        <span className="text-slate-200">지하수 확률</span>
                        <span className="font-mono text-sky-200">
                          {inspectedPoint.combinedWaterProb}%
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-white/15">
                        <span className="text-slate-200">GRS 감마선 수소</span>
                        <span className="font-mono text-indigo-200">
                          {inspectedPoint.gammaHydrogen}%
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-white/15">
                        <span className="text-slate-200">토양 비옥도</span>
                        <span className="font-mono text-emerald-200">
                          {inspectedPoint.soilFertility} / 100
                        </span>
                      </div>
                    </div>

                    <div className="bg-white/[0.08] border border-white/20 rounded-lg p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-200">비닐하우스 농업 판정</span>
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded border ${farmingTierBadgeClass(
                            inspectedPoint.farmingTier
                          )}`}
                        >
                          {inspectedPoint.farmingLabelKo}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-100 leading-relaxed">
                        {inspectedPoint.farmingSolutionKo}
                      </p>
                    </div>
                  </div>

                  {selectedLandmark && (
                    <div className="pt-3 border-t border-white/15 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-sky-200 flex items-center gap-1.5">
                            <Compass className="w-3.5 h-3.5 shrink-0" />
                            <span>{selectedLandmark.nameKo}</span>
                          </div>
                          <div className="text-[10px] font-mono text-slate-200/80 pl-5">
                            {selectedLandmark.nameEn}
                          </div>
                        </div>
                        <span className="text-[10px] text-white bg-white/15 px-1.5 py-0.5 rounded whitespace-nowrap">
                          {selectedLandmark.rawCategory}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-100 leading-relaxed">
                        {selectedLandmark.descriptionKo}
                      </p>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            flyToLandmark(selectedLandmark, 'start')
                          }
                          className="py-1.5 text-xs bg-white/15 hover:bg-white/25 text-white rounded transition-colors"
                        >
                          출발지
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            flyToLandmark(selectedLandmark, 'dest')
                          }
                          className="py-1.5 text-xs bg-sky-400/30 hover:bg-sky-400/45 border border-sky-300/45 text-sky-100 font-semibold rounded transition-colors"
                        >
                          목적지
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
              </div>
            </div>
          </aside>

          {/* Draggable Right-Edge Resizer Handle (when open & not fullscreen) */}
          {isDrawerOpen && !isPlaceFullscreen && (
            <div
              role="separator"
              aria-orientation="vertical"
              title="드래그하여 창 너비 조절"
              onPointerDown={handleStartResizeDrawer}
              className="w-2 -ml-1 h-full cursor-ew-resize pointer-events-auto flex items-center justify-center group"
            >
              <div
                className={`w-[3px] h-16 rounded-full transition-colors ${
                  isResizingDrawer
                    ? 'bg-sky-400'
                    : 'bg-white/15 group-hover:bg-sky-400/85'
                }`}
              />
            </div>
          )}

          {/* Naver-Map Style Side Collapse/Expand Tab Handle (< / >) */}
          {!isPlaceFullscreen && (
            <button
              type="button"
              onClick={() =>
                setActiveDrawer((prev) =>
                  prev === 'none' ? lastDrawerRef.current : 'none'
                )
              }
              title={isDrawerOpen ? '패널 접기' : '패널 펼치기'}
              aria-label={isDrawerOpen ? '패널 접기' : '패널 펼치기'}
              className="self-center -ml-px w-5 h-12 bg-[#0a111e]/[0.95] hover:bg-[#131d31] border border-l-0 border-white/25 rounded-r-lg flex items-center justify-center text-slate-200 hover:text-white shadow-lg pointer-events-auto transition-colors"
            >
              {isDrawerOpen ? (
                <ChevronLeft className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>

        {/* Optional Floating Route Elevation Chart Synced With Map Beacon (Overlap-free) */}
        {chartOpen && (
          <div
            style={{ left: `${isDrawerOpen ? drawerWidthPx + 20 : 16}px` }}
            className="absolute bottom-4 right-[124px] z-20 shadow-2xl transition-[left] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          >
            <RouteElevationChart
              route={route}
              onHoverRoutePoint={setChartHoverPoint}
              onClose={() => {
                setChartOpen(false);
                setChartHoverPoint(null);
              }}
            />
          </div>
        )}
      </main>
    </div>
  );
}
