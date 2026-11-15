import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  Droplets,
  Maximize2,
  Minimize2,
  Plus,
  Search,
  Sparkles,
  Sprout,
  Thermometer,
  Trash2,
  Users,
  Wind,
  X,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import {
  COMPARISON_BENCHMARK_SITES,
  DOME_TIER_SPECS,
  simulateMarsDome,
} from '../data/domeSimulation';
import { MARS_CROPS_DATABASE, scoreCropForPoint } from '../data/marsCrops';
import {
  DeployedDome,
  DomeSubsystemId,
  DomeTier,
} from '../types/mars';
import { matchesHangulOrText } from '../utils/hangulSearch';
import { MarsDome3DViewer } from './MarsDome3DViewer';

interface MarsDomeSidePanelProps {
  dome: DeployedDome;
  allDomes: DeployedDome[];
  wideMode: boolean;
  onToggleWideMode: () => void;
  onClose: () => void;
  onSelectDome: (domeId: string) => void;
  onUpdateDome: (domeId: string, patch: Partial<DeployedDome>) => void;
  onRemoveDome: (domeId: string) => void;
  onJumpToMap: (lat: number, lon: number) => void;
  onOpenFullCropModal: (lat: number, lon: number) => void;
}

type DomeTab = 'systems' | 'env_crops' | 'living';

function formatCoord(lat: number, lon: number): string {
  const latStr = lat >= 0 ? `${lat.toFixed(2)}°N` : `${Math.abs(lat).toFixed(2)}°S`;
  return `${latStr}, ${lon.toFixed(2)}°E`;
}

export const MarsDomeSidePanel: React.FC<MarsDomeSidePanelProps> = ({
  dome,
  allDomes,
  wideMode,
  onToggleWideMode,
  onClose,
  onSelectDome,
  onUpdateDome,
  onRemoveDome,
  onJumpToMap,
  onOpenFullCropModal,
}) => {
  const { language, pick } = useLanguage();
  const [activeTab, setActiveTab] = useState<DomeTab>('systems');
  const [activeSubsystem, setActiveSubsystem] = useState<DomeSubsystemId>('overview');
  const [cropSearch, setCropSearch] = useState<string>('');
  const [showCropPicker, setShowCropPicker] = useState<boolean>(false);
  const [compareTargetId, setCompareTargetId] = useState<string>('bench_arcadia');

  const sim = useMemo(
    () =>
      simulateMarsDome(
        dome.lat,
        dome.lon,
        dome.tier,
        dome.crewCount,
        dome.selectedCropIds
      ),
    [dome.lat, dome.lon, dome.tier, dome.crewCount, dome.selectedCropIds]
  );

  // Build comparison target list (other deployed domes + benchmark Mars locations)
  const compareTarget = useMemo(() => {
    const otherDome = allDomes.find((d) => d.id === compareTargetId && d.id !== dome.id);
    if (otherDome) {
      return {
        id: otherDome.id,
        nameEn: otherDome.nameEn,
        nameKo: otherDome.nameKo,
        lat: otherDome.lat,
        lon: otherDome.lon,
        isUserDome: true,
        sim: simulateMarsDome(
          otherDome.lat,
          otherDome.lon,
          otherDome.tier,
          dome.crewCount,
          otherDome.selectedCropIds
        ),
      };
    }

    const bench =
      COMPARISON_BENCHMARK_SITES.find((b) => b.id === compareTargetId) ??
      COMPARISON_BENCHMARK_SITES[0];
    return {
      id: bench.id,
      nameEn: bench.nameEn,
      nameKo: bench.nameKo,
      lat: bench.lat,
      lon: bench.lon,
      isUserDome: false,
      sim: simulateMarsDome(bench.lat, bench.lon, dome.tier, dome.crewCount),
    };
  }, [allDomes, compareTargetId, dome.id, dome.tier, dome.crewCount]);

  const filteredCrops = useMemo(() => {
    const q = cropSearch.trim();
    return [...MARS_CROPS_DATABASE]
      .filter((c) => {
        if (!q) return true;
        return (
          matchesHangulOrText(c.nameEn, q) ||
          matchesHangulOrText(c.nameKo, q) ||
          matchesHangulOrText(c.categoryEn, q) ||
          matchesHangulOrText(c.categoryKo, q)
        );
      })
      .sort((a, b) => scoreCropForPoint(b, sim.telemetry) - scoreCropForPoint(a, sim.telemetry))
      .slice(0, 28);
  }, [cropSearch, sim.telemetry]);

  const toggleCropInDome = (cropId: string) => {
    const exists = dome.selectedCropIds.includes(cropId);
    if (exists && dome.selectedCropIds.length <= 1) return;
    const next = exists
      ? dome.selectedCropIds.filter((id) => id !== cropId)
      : [...dome.selectedCropIds.slice(0, 5), cropId];
    onUpdateDome(dome.id, { selectedCropIds: next });
  };

  const handleSelectSubsystem = (sub: DomeSubsystemId) => {
    setActiveSubsystem(sub);
    if (sub === 'drill' || sub === 'airlock') setActiveTab('systems');
    else if (sub === 'hydroponics') setActiveTab('env_crops');
    else if (sub === 'spire') setActiveTab('systems');
  };

  const livabilityDelta =
    sim.living.livabilityScore - compareTarget.sim.living.livabilityScore;
  const waterDelta = sim.water.purifiedYieldLDay - compareTarget.sim.water.purifiedYieldLDay;
  const o2Delta = Number(
    (sim.oxygen.totalProducedKgDay - compareTarget.sim.oxygen.totalProducedKgDay).toFixed(1)
  );
  const tempDelta =
    sim.environment.outsideTempMeanC - compareTarget.sim.environment.outsideTempMeanC;

  return (
    <aside
      className={`h-full bg-[#090e19] border-l border-white/20 flex flex-col text-slate-100 shadow-[-16px_0_44px_rgba(0,0,0,0.75)] transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        wideMode ? 'w-[660px] max-w-[92vw]' : 'w-[470px] max-w-[92vw]'
      }`}
    >
      {/* Top Panel Header */}
      <div className="px-4 py-3 border-b border-white/15 bg-[#060a12] flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-amber-300 font-semibold">
              {pick('Mars Bio-Dome Habitat', '화성 바이오 돔 관제')}
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              Sol {dome.installedAtSol}
            </span>
          </div>
          <h2 className="text-sm font-bold text-white truncate mt-0.5">
            {pick(dome.nameEn, dome.nameKo)}
          </h2>
          <button
            type="button"
            onClick={() => onJumpToMap(dome.lat, dome.lon)}
            className="text-[11px] font-mono text-sky-300 hover:text-sky-200 transition-colors"
          >
            {formatCoord(dome.lat, dome.lon)} ·{' '}
            {sim.telemetry.elevationM.toLocaleString()}m
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onToggleWideMode}
            title={wideMode ? pick('Compact width', '기본 너비') : pick('Expand panel', '패널 넓히기')}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            {wideMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => onRemoveDome(dome.id)}
            title={pick('Decommission dome', '돔 철거')}
            className="p-1.5 text-slate-300 hover:text-rose-300 hover:bg-rose-500/15 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={pick('Close dome panel', '바이오 돔 창 닫기')}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Multi-Dome Switcher Strip when >1 domes exist */}
      {allDomes.length > 1 && (
        <div className="px-3 py-1.5 bg-[#0b1220] border-b border-white/10 flex items-center gap-1.5 overflow-x-auto shrink-0">
          {allDomes.map((d) => {
            const isActive = d.id === dome.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => onSelectDome(d.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] whitespace-nowrap transition-colors shrink-0 ${
                  isActive
                    ? 'bg-amber-400/20 text-amber-200 border border-amber-300/60 font-semibold'
                    : 'bg-white/[0.05] text-slate-300 border border-white/10 hover:text-white'
                }`}
              >
                {pick(d.nameEn, d.nameKo)}
              </button>
            );
          })}
        </div>
      )}

      {/* Interactive 3D Bio-Dome Viewport */}
      <div className="relative w-full h-[255px] border-b border-white/15 shrink-0 bg-[#070b14]">
        <MarsDome3DViewer
          lat={dome.lat}
          lon={dome.lon}
          waterProb={sim.telemetry.combinedWaterProb}
          soilFertility={sim.telemetry.soilFertility}
          elevationM={sim.telemetry.elevationM}
          geothermalIndex={sim.telemetry.geothermalIndex}
          tier={dome.tier}
          activeSubsystem={activeSubsystem}
          onSelectSubsystem={handleSelectSubsystem}
        />
      </div>

      {/* Live Dome Tier & Crew Simulator Controls */}
      <div className="px-4 py-2.5 bg-[#0c1322] border-b border-white/15 space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-black/35 p-0.5 rounded-lg border border-white/10">
            {(['outpost', 'habitat', 'metropolis'] as DomeTier[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onUpdateDome(dome.id, { tier: t })}
                className={`px-2 py-1 text-[10px] rounded transition-colors whitespace-nowrap ${
                  dome.tier === t
                    ? 'bg-sky-500 text-slate-950 font-bold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {t === 'outpost'
                  ? pick('28m Outpost', '28m 전초')
                  : t === 'habitat'
                    ? pick('56m Habitat', '56m 거주')
                    : pick('110m Colony', '110m 대형')}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-sky-300" />
            <span className="text-[11px] font-mono text-slate-200">
              {dome.crewCount} {pick('Crew', '명')}
            </span>
            <input
              type="range"
              min={2}
              max={40}
              value={dome.crewCount}
              onChange={(e) =>
                onUpdateDome(dome.id, { crewCount: Number(e.target.value) })
              }
              className="w-20 accent-sky-400 cursor-pointer"
            />
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              { id: 'systems', label: pick('Water & Oxygen', '지하수 · 산소') },
              { id: 'env_crops', label: pick('Climate · Crops', '환경 · 작물') },
              { id: 'living', label: pick('Living Here Sim', '거주 · 비교 시뮬') },
            ] as { id: DomeTab; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold border transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-white/15 border-sky-400/70 text-white'
                  : 'bg-white/[0.04] border-white/10 text-slate-300 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable Simulation Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 text-xs">
        {/* TAB 1: WATER EXTRACTION & OXYGEN GENERATION */}
        {activeTab === 'systems' && (
          <>
            {/* Subsurface Water Extraction */}
            <section className="bg-[#0e1627] border border-sky-400/25 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-sky-400" />
                  <h3 className="text-xs font-bold text-white">
                    {pick('Subsurface Water Extraction', '지하수 시추 · 정제 수지')}
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-sky-300 font-semibold">
                  {sim.telemetry.combinedWaterProb}% {pick('Ice Prob.', '함수율')}
                </span>
              </div>

              <div className="text-[11px] text-slate-300 bg-black/25 border border-white/10 rounded-lg px-2.5 py-1.5">
                {pick(sim.water.aquiferTypeEn, sim.water.aquiferTypeKo)}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-white/[0.05] border border-white/10 rounded-lg p-2">
                  <div className="text-[10px] text-slate-400">
                    {pick('Drill Depth', '시추 깊이')}
                  </div>
                  <div className="text-sm font-mono font-bold text-white">
                    {sim.water.drillDepthM} m
                  </div>
                </div>
                <div className="bg-white/[0.05] border border-white/10 rounded-lg p-2">
                  <div className="text-[10px] text-slate-400">
                    {pick('Pure Water', '일일 정제수')}
                  </div>
                  <div className="text-sm font-mono font-bold text-sky-300">
                    {sim.water.purifiedYieldLDay} {pick('L/d', 'L/일')}
                  </div>
                </div>
                <div className="bg-white/[0.05] border border-white/10 rounded-lg p-2">
                  <div className="text-[10px] text-slate-400">
                    {pick('Recycling', '순환 회수율')}
                  </div>
                  <div className="text-sm font-mono font-bold text-emerald-300">
                    {sim.water.closedLoopRecoveryPct}%
                  </div>
                </div>
                <div className="bg-white/[0.05] border border-white/10 rounded-lg p-2">
                  <div className="text-[10px] text-slate-400">
                    {pick('Net Balance', '일일 여유')}
                  </div>
                  <div
                    className={`text-sm font-mono font-bold ${
                      sim.water.surplusLDay >= 0 ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {sim.water.surplusLDay >= 0 ? '+' : ''}
                    {sim.water.surplusLDay} {pick('L/d', 'L/일')}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-300 pt-1 border-t border-white/10">
                <span>
                  {pick('Pump & RO Power:', '시추·역삼투 전력:')}{' '}
                  <strong className="font-mono text-white">
                    {sim.water.roPurificationKwhDay} kWh/d
                  </strong>
                </span>
                <span>
                  {pick('Tank Autonomy:', '비상 저수:')}{' '}
                  <strong className="font-mono text-sky-200">
                    {sim.water.autonomyDays} {pick('sols', '솔')}
                  </strong>
                </span>
              </div>
            </section>

            {/* Oxygen Generation Mix */}
            <section className="bg-[#0e1627] border border-cyan-400/25 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Wind className="w-4 h-4 text-cyan-300" />
                  <h3 className="text-xs font-bold text-white">
                    {pick('Oxygen Production System', '산소(O₂) 생산 · 대기 순환 방식')}
                  </h3>
                </div>
                <span
                  className={`text-[11px] font-mono font-bold ${
                    sim.oxygen.surplusKgDay >= 0 ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {sim.oxygen.totalProducedKgDay} / {sim.oxygen.crewDemandKgDay}{' '}
                  {pick('kg/d', 'kg/일')}
                </span>
              </div>

              {/* Segmented Production Bar */}
              <div className="space-y-1.5">
                <div className="h-2.5 w-full rounded-full overflow-hidden flex gap-0.5 bg-black/40">
                  <div
                    style={{ width: `${sim.oxygen.moxieSharePct}%` }}
                    className="h-full bg-amber-400"
                    title="MOXIE CO₂ Electrolysis"
                  />
                  <div
                    style={{ width: `${sim.oxygen.electrolysisSharePct}%` }}
                    className="h-full bg-sky-400"
                    title="H₂O Electrolysis"
                  />
                  <div
                    style={{ width: `${sim.oxygen.photosynthesisSharePct}%` }}
                    className="h-full bg-emerald-400"
                    title="Crop Photosynthesis"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div className="bg-white/[0.04] rounded-lg p-2 border border-amber-400/20">
                    <div className="flex items-center gap-1 text-amber-300 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span>MOXIE CO₂</span>
                    </div>
                    <div className="font-mono text-white font-bold mt-0.5">
                      {sim.oxygen.moxieKgDay} kg ({sim.oxygen.moxieSharePct}%)
                    </div>
                    <div className="text-slate-400 mt-0.5 leading-tight">
                      {pick(
                        'Splits Martian CO₂ air into O₂ + CO',
                        '화성 대기 CO₂ 고온 전기분해'
                      )}
                    </div>
                  </div>

                  <div className="bg-white/[0.04] rounded-lg p-2 border border-sky-400/20">
                    <div className="flex items-center gap-1 text-sky-300 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-sky-400" />
                      <span>{pick('H₂O Split', '물 전기분해')}</span>
                    </div>
                    <div className="font-mono text-white font-bold mt-0.5">
                      {sim.oxygen.electrolysisKgDay} kg ({sim.oxygen.electrolysisSharePct}%)
                    </div>
                    <div className="text-slate-400 mt-0.5 leading-tight">
                      {pick(
                        `Also yields ${sim.oxygen.h2FuelByproductKgDay} kg H₂ fuel`,
                        `부생 수소(H₂) ${sim.oxygen.h2FuelByproductKgDay}kg 확보`
                      )}
                    </div>
                  </div>

                  <div className="bg-white/[0.04] rounded-lg p-2 border border-emerald-400/20">
                    <div className="flex items-center gap-1 text-emerald-300 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>{pick('Crops O₂', '작물 광합성')}</span>
                    </div>
                    <div className="font-mono text-white font-bold mt-0.5">
                      {sim.oxygen.photosynthesisKgDay} kg ({sim.oxygen.photosynthesisSharePct}%)
                    </div>
                    <div className="text-slate-400 mt-0.5 leading-tight">
                      {pick(
                        `Scrubs ${sim.oxygen.co2ScrubbedKgDay} kg CO₂/d`,
                        `하루 CO₂ ${sim.oxygen.co2ScrubbedKgDay}kg 자연 정화`
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-300 pt-1 border-t border-white/10">
                <span>
                  {pick('Pressurized O₂ Reserve:', '비상 산소 탱크 비축:')}{' '}
                  <strong className="font-mono text-cyan-200">
                    {sim.oxygen.bufferDays} {pick('sols', '솔')}
                  </strong>
                </span>
                <span>
                  {pick('Power Source:', '전력:')}{' '}
                  <strong className="text-white">
                    {pick(sim.environment.energyMixEn, sim.environment.energyMixKo)}
                  </strong>
                </span>
              </div>
            </section>
          </>
        )}

        {/* TAB 2: OUTSIDE MARS VS INSIDE DOME ENVIRONMENT & CROPS */}
        {activeTab === 'env_crops' && (
          <>
            <section className="bg-[#0e1627] border border-white/15 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Thermometer className="w-4 h-4 text-amber-300" />
                  {pick('Outside Mars vs. Dome Interior', '화성 외부 환경 vs. 돔 내부 유지 조건')}
                </h3>
                <span className="text-[10px] font-mono text-slate-300">
                  {pick(sim.environment.climateZoneEn, sim.environment.climateZoneKo)}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-[11px] border-b border-white/10 pb-1.5 text-slate-400 font-semibold">
                <span>{pick('Metric', '항목')}</span>
                <span>{pick('Outside Mars', '바깥 화성')}</span>
                <span className="text-emerald-300">{pick('Inside Dome', '돔 내부')}</span>
              </div>

              <div className="space-y-1.5 text-[11px]">
                <div className="grid grid-cols-3 gap-2 items-center py-1 border-b border-white/5">
                  <span className="text-slate-300">{pick('Temperature', '기온 (주/야)')}</span>
                  <span className="font-mono text-rose-200">
                    {sim.environment.outsideTempDayC}° / {sim.environment.outsideTempNightC}°C
                  </span>
                  <span className="font-mono text-emerald-300 font-semibold">
                    {sim.environment.insideTempDayC}° / {sim.environment.insideTempNightC}°C
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 items-center py-1 border-b border-white/5">
                  <span className="text-slate-300">{pick('Pressure', '기압')}</span>
                  <span className="font-mono text-amber-200">
                    {sim.environment.outsidePressureHpa} hPa
                  </span>
                  <span className="font-mono text-emerald-300 font-semibold">
                    {sim.environment.insidePressureKpa} kPa ({sim.environment.insidePressureAtm} atm)
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 items-center py-1 border-b border-white/5">
                  <span className="text-slate-300">{pick('Atmosphere', '대기 성분')}</span>
                  <span className="font-mono text-slate-300">95.3% CO₂</span>
                  <span className="font-mono text-cyan-300 font-semibold">
                    {sim.environment.insideO2Pct}% O₂ · {sim.environment.insideHumidityPct}% RH
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 items-center py-1 border-b border-white/5">
                  <span className="text-slate-300">{pick('Radiation', '연간 방사선')}</span>
                  <span className="font-mono text-rose-300">
                    {sim.environment.radiationOutsideMSvYr} mSv/yr
                  </span>
                  <span className="font-mono text-emerald-300 font-semibold">
                    {sim.environment.radiationInsideMSvYr} mSv/yr
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 items-center py-1">
                  <span className="text-slate-300">{pick('Solar · Day', '일사 · 낮 길이')}</span>
                  <span className="font-mono text-amber-200">
                    {sim.environment.solarFluxWm2} W/m²
                  </span>
                  <span className="font-mono text-slate-100">
                    {sim.environment.daylightHours} h/sol + LED
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10 text-[11px]">
                <div className="bg-white/[0.04] rounded-lg p-2">
                  <div className="text-[10px] text-slate-400">
                    {pick('Regolith & Soil', '현지 토질 · 과염소산염')}
                  </div>
                  <div className="text-slate-100 font-medium mt-0.5">
                    {pick(sim.environment.soilTypeEn, sim.environment.soilTypeKo)}
                  </div>
                  <div className="text-[10px] font-mono text-amber-300 mt-0.5">
                    {pick('Fertility', '비옥도')} {sim.telemetry.soilFertility}/100 · ClO₄⁻{' '}
                    {sim.environment.perchloratePct}%
                  </div>
                </div>
                <div className="bg-white/[0.04] rounded-lg p-2">
                  <div className="text-[10px] text-slate-400">
                    {pick('Dust & Slope Hazard', '먼지폭풍 · 지형 경사')}
                  </div>
                  <div className="text-slate-100 font-medium mt-0.5">
                    {pick(sim.environment.dustStormRiskEn, sim.environment.dustStormRiskKo)}
                  </div>
                  <div className="text-[10px] font-mono text-sky-300 mt-0.5">
                    {pick('Slope', '경사')} {sim.telemetry.slopeDeg}° ·{' '}
                    {pick('Geo Heat', '지열')} {sim.telemetry.geothermalIndex}/100
                  </div>
                </div>
              </div>
            </section>

            {/* Active Dome Crops & Food Production */}
            <section className="bg-[#0e1627] border border-emerald-400/25 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Sprout className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-bold text-white">
                    {pick(
                      `Dome Crops (${sim.tierSpec.cropAreaM2}m² Canopy)`,
                      `돔 내부 재배 작물 (${sim.tierSpec.cropAreaM2}m²)`
                    )}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCropPicker((v) => !v)}
                  className="px-2 py-1 text-[10px] font-semibold bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/45 text-emerald-200 rounded-md flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  {showCropPicker
                    ? pick('Done', '완료')
                    : pick('Customize (100 Crops)', '작물 변경 (100종)')}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white/[0.05] border border-white/10 rounded-lg p-2">
                  <div className="text-[10px] text-slate-400">
                    {pick('Daily Harvest', '일일 수확량')}
                  </div>
                  <div className="text-sm font-mono font-bold text-emerald-300">
                    {sim.living.dailyHarvestKg} {pick('kg/d', 'kg/일')}
                  </div>
                </div>
                <div className="bg-white/[0.05] border border-white/10 rounded-lg p-2">
                  <div className="text-[10px] text-slate-400">
                    {pick('Energy / Crew', '1인 열량 공급')}
                  </div>
                  <div className="text-sm font-mono font-bold text-white">
                    {sim.living.dailyKcalPerCrew.toLocaleString()} kcal
                  </div>
                </div>
                <div className="bg-white/[0.05] border border-white/10 rounded-lg p-2">
                  <div className="text-[10px] text-slate-400">
                    {pick('Food Autonomy', '식량 자급률')}
                  </div>
                  <div className="text-sm font-mono font-bold text-sky-300">
                    {sim.living.foodAutonomyPct}%
                  </div>
                </div>
              </div>

              {/* Active Crop Chips */}
              <div className="flex flex-wrap gap-1.5">
                {sim.activeCrops.map((crop) => (
                  <button
                    key={crop.id}
                    type="button"
                    onClick={() => toggleCropInDome(crop.id)}
                    title={pick(crop.whySuitedEn, crop.whySuitedKo)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-400/40 text-emerald-100 text-[11px] flex items-center gap-1.5 hover:bg-emerald-500/25"
                  >
                    <span className="font-semibold">
                      {pick(crop.nameEn, crop.nameKo)}
                    </span>
                    <span className="text-[10px] font-mono text-emerald-300">
                      {crop.growthDays}d
                    </span>
                  </button>
                ))}
              </div>

              {showCropPicker && (
                <div className="pt-2 border-t border-white/10 space-y-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={cropSearch}
                      onChange={(e) => setCropSearch(e.target.value)}
                      placeholder={pick(
                        'Search any of 100 crops (potato, rice, basil, algae...)',
                        '100대 작물 검색 (감자, 벼, 바질, 스피루리나...)'
                      )}
                      className="w-full bg-black/40 border border-white/20 rounded-lg pl-8 pr-3 py-1.5 text-[11px] text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                    {filteredCrops.map((c) => {
                      const selected = dome.selectedCropIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleCropInDome(c.id)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-2 transition-colors ${
                            selected
                              ? 'bg-emerald-500/20 border-emerald-400/60 text-white'
                              : 'bg-white/[0.04] border-white/10 text-slate-200 hover:border-white/30'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-semibold truncate">
                              {pick(c.nameEn, c.nameKo)}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {pick(c.categoryEn, c.categoryKo)} · {c.growthDays}d ·{' '}
                              {c.caloriePer100g} kcal/100g
                            </div>
                          </div>
                          {selected && <Check className="w-3.5 h-3.5 text-emerald-300 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => onOpenFullCropModal(dome.lat, dome.lon)}
                className="w-full py-1.5 text-[11px] font-semibold bg-white/[0.06] hover:bg-white/12 border border-white/15 rounded-lg text-sky-200 transition-colors"
              >
                {pick(
                  'Open Full 100-Crop Encyclopedia & Cultivation Guide ↗',
                  '100대 작물 백과사전 · 상세 재배법 전체 보기 ↗'
                )}
              </button>
            </section>
          </>
        )}

        {/* TAB 3: WHAT LIVING HERE FEELS LIKE + SITE-VS-SITE COMPARISON */}
        {activeTab === 'living' && (
          <>
            {/* Daily Life Experience Inside This Dome */}
            <section className="bg-[#0e1627] border border-amber-400/25 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <h3 className="text-xs font-bold text-white">
                    {pick('Life Inside This Bio-Dome', '이 돔에서의 실제 거주 시뮬레이션')}
                  </h3>
                </div>
                <div className="px-2 py-0.5 rounded-md bg-amber-400/20 border border-amber-300/40 font-mono text-[11px] font-bold text-amber-200">
                  {sim.living.livabilityScore}/100 ·{' '}
                  {pick(sim.living.ratingEn, sim.living.ratingKo)}
                </div>
              </div>

              <p className="text-[11px] text-slate-100 leading-relaxed bg-black/30 border border-white/10 rounded-lg p-3">
                {pick(sim.living.dailyLifeNarrativeEn, sim.living.dailyLifeNarrativeKo)}
              </p>

              <div className="space-y-2 text-[11px]">
                <div className="bg-sky-950/35 border border-sky-400/20 rounded-lg p-2.5">
                  <div className="font-semibold text-sky-300 mb-0.5">
                    {pick('Daily Water & Hygiene Routine', '일상 식수 · 샤워 · 위생 루틴')}
                  </div>
                  <p className="text-slate-200 leading-snug">
                    {pick(sim.living.waterRoutineEn, sim.living.waterRoutineKo)}
                  </p>
                </div>

                <div className="bg-emerald-950/35 border border-emerald-400/20 rounded-lg p-2.5">
                  <div className="font-semibold text-emerald-300 mb-0.5">
                    {pick('Air, Microclimate & Morale', '호흡 · 돔 내 미기후 · 거주 쾌적성')}
                  </div>
                  <p className="text-slate-200 leading-snug">
                    {pick(sim.living.airAndBreathingEn, sim.living.airAndBreathingKo)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 text-[10px]">
                <div className="space-y-1">
                  <div className="font-semibold text-emerald-300">
                    {pick('Site Advantages', '이 입지의 강점')}
                  </div>
                  {(language === 'en'
                    ? sim.living.keyAdvantagesEn
                    : sim.living.keyAdvantagesKo
                  ).map((adv) => (
                    <div key={adv} className="text-slate-200 leading-snug flex gap-1">
                      <span className="text-emerald-400 shrink-0">•</span>
                      <span>{adv}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  <div className="font-semibold text-rose-300">
                    {pick('Survival Constraints', '생존 리스크 · 제약')}
                  </div>
                  {(language === 'en'
                    ? sim.living.keyChallengesEn
                    : sim.living.keyChallengesKo
                  ).map((ch) => (
                    <div key={ch} className="text-slate-200 leading-snug flex gap-1">
                      <span className="text-rose-400 shrink-0">•</span>
                      <span>{ch}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* HERE vs. THERE Comparison Simulator */}
            <section className="bg-[#0e1627] border border-cyan-400/30 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <ArrowLeftRight className="w-4 h-4 text-cyan-300" />
                  <h3 className="text-xs font-bold text-white">
                    {pick('"Here vs. There" Colony Comparison', '"여기서 살면 vs 저기서 살면" 비교')}
                  </h3>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 block">
                  {pick('Compare living HERE against:', '비교 대상 정착지 선택:')}
                </label>
                <select
                  value={compareTarget.id}
                  onChange={(e) => setCompareTargetId(e.target.value)}
                  className="w-full bg-[#070b14] border border-white/25 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
                >
                  {allDomes
                    .filter((d) => d.id !== dome.id)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {pick(`[My Dome] ${d.nameEn}`, `[내 돔] ${d.nameKo}`)}
                      </option>
                    ))}
                  {COMPARISON_BENCHMARK_SITES.map((b) => (
                    <option key={b.id} value={b.id}>
                      {pick(`${b.nameEn} (${b.tagEn})`, `${b.nameKo} (${b.tagKo})`)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Side-by-Side Comparison Matrix */}
              <div className="bg-black/30 border border-white/10 rounded-lg p-2.5 space-y-2 text-[11px]">
                <div className="grid grid-cols-3 gap-2 pb-1 border-b border-white/10 text-[10px] font-semibold">
                  <span className="text-slate-400">{pick('Factor', '비교 지표')}</span>
                  <span className="text-sky-300 truncate">
                    {pick('HERE (This Dome)', '여기 (현재 돔)')}
                  </span>
                  <span className="text-amber-300 truncate">
                    {pick(compareTarget.nameEn, compareTarget.nameKo)}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 items-center">
                  <span className="text-slate-300">{pick('Livability', '거주 적합도')}</span>
                  <span className="font-mono font-bold text-white">
                    {sim.living.livabilityScore}/100
                  </span>
                  <span className="font-mono text-slate-200">
                    {compareTarget.sim.living.livabilityScore}/100{' '}
                    <span
                      className={
                        livabilityDelta >= 0 ? 'text-emerald-300' : 'text-rose-300'
                      }
                    >
                      ({livabilityDelta >= 0 ? '+' : ''}
                      {livabilityDelta})
                    </span>
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 items-center">
                  <span className="text-slate-300">{pick('Water Yield', '일일 정제수')}</span>
                  <span className="font-mono font-bold text-sky-300">
                    {sim.water.purifiedYieldLDay} L/d
                  </span>
                  <span className="font-mono text-slate-200">
                    {compareTarget.sim.water.purifiedYieldLDay} L/d{' '}
                    <span
                      className={waterDelta >= 0 ? 'text-emerald-300' : 'text-rose-300'}
                    >
                      ({waterDelta >= 0 ? '+' : ''}
                      {waterDelta})
                    </span>
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 items-center">
                  <span className="text-slate-300">{pick('O₂ Output', '일일 산소 생산')}</span>
                  <span className="font-mono font-bold text-cyan-300">
                    {sim.oxygen.totalProducedKgDay} kg
                  </span>
                  <span className="font-mono text-slate-200">
                    {compareTarget.sim.oxygen.totalProducedKgDay} kg{' '}
                    <span className={o2Delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                      ({o2Delta >= 0 ? '+' : ''}
                      {o2Delta})
                    </span>
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 items-center">
                  <span className="text-slate-300">{pick('Mean Temp', '평균 외기온')}</span>
                  <span className="font-mono text-white">
                    {sim.environment.outsideTempMeanC}°C
                  </span>
                  <span className="font-mono text-slate-200">
                    {compareTarget.sim.environment.outsideTempMeanC}°C{' '}
                    <span className={tempDelta >= 0 ? 'text-emerald-300' : 'text-sky-300'}>
                      ({tempDelta >= 0 ? '+' : ''}
                      {tempDelta}°)
                    </span>
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 items-center">
                  <span className="text-slate-300">{pick('Soil · Clay', '토양 비옥도')}</span>
                  <span className="font-mono text-emerald-300">
                    {sim.telemetry.soilFertility}/100
                  </span>
                  <span className="font-mono text-slate-200">
                    {compareTarget.sim.telemetry.soilFertility}/100
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 items-center">
                  <span className="text-slate-300">{pick('Pressure', '외부 대기압')}</span>
                  <span className="font-mono text-white">
                    {sim.environment.outsidePressureHpa} hPa
                  </span>
                  <span className="font-mono text-slate-200">
                    {compareTarget.sim.environment.outsidePressureHpa} hPa
                  </span>
                </div>
              </div>

              <div className="bg-cyan-950/35 border border-cyan-400/25 rounded-lg p-2.5 text-[11px] text-cyan-100 leading-relaxed">
                {livabilityDelta >= 6
                  ? pick(
                      `Living HERE beats ${compareTarget.nameEn} (+${livabilityDelta} pts): ${
                        waterDelta > 0
                          ? `you extract ${waterDelta} L/day more water`
                          : 'terrain & soil readiness require less energy'
                      }, giving colonists higher daily comfort and crop security.`,
                      `이곳에서의 거주가 ${compareTarget.nameKo}보다 +${livabilityDelta}점 유리합니다. ${
                        waterDelta > 0
                          ? `하루 ${waterDelta}L 더 많은 지하수를 확보해 `
                          : '지형 안정성과 토양 조건이 뛰어나 '
                      }정착민의 생활 여유와 작물 자급률이 훨씬 높습니다.`
                    )
                  : livabilityDelta <= -6
                    ? pick(
                        `${compareTarget.nameEn} scores +${Math.abs(livabilityDelta)} pts higher than HERE. Moving your colony there offers ${
                          waterDelta < 0
                            ? `${Math.abs(waterDelta)} L/day extra water`
                            : 'gentler climate/soil conditions'
                        } and lower survival overhead.`,
                        `${compareTarget.nameKo}가 이곳보다 +${Math.abs(livabilityDelta)}점 더 쾌적합니다. 그곳에 살면 ${
                          waterDelta < 0
                            ? `하루 ${Math.abs(waterDelta)}L 더 풍부한 물과 `
                            : '더 완만한 지형·토질과 '
                        }낮은 생명유지 전력 소모로 훨씬 안정적인 정착이 가능합니다.`
                      )
                    : pick(
                        `HERE and ${compareTarget.nameEn} offer nearly balanced livability (${Math.abs(livabilityDelta)} pt difference). Choose HERE for ${
                          sim.environment.solarFluxWm2 >= compareTarget.sim.environment.solarFluxWm2
                            ? 'stronger sunlight'
                            : 'better local water/geothermal access'
                        }, or THERE for ${
                          compareTarget.sim.environment.outsidePressureHpa > sim.environment.outsidePressureHpa
                            ? 'higher MOXIE air pressure'
                            : 'different soil mineral balance'
                        }.`,
                        `현재 돔과 ${compareTarget.nameKo}의 거주 적합도가 거의 비슷합니다(${Math.abs(livabilityDelta)}점 차). 일사량·지열·대기압 중 어느 자원을 우선하느냐에 따라 선택이 갈립니다.`
                      )}
              </div>
            </section>
          </>
        )}
      </div>
    </aside>
  );
};
