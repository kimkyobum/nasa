import React, { useMemo, useState } from 'react';
import {
  Sprout,
  Droplets,
  Thermometer,
  Gauge,
  Layers,
  CheckCircle2,
  X,
  Box,
  Clock,
  Sun,
  FlaskConical,
  Info,
  Search,
  Sparkles,
  Leaf,
  AlertTriangle,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { Landmark, MarsTelemetryPoint } from '../types/mars';
import {
  analyzeMarsFarmingPotential,
  MARS_CROPS_DATABASE,
  MarsCrop,
  scoreCropForPoint,
} from '../data/marsCrops';
import { matchesHangulOrText } from '../utils/hangulSearch';

interface MarsFarmModalProps {
  point: MarsTelemetryPoint;
  landmark: Landmark | null;
  onClose: () => void;
  onSetAsFarmTarget?: (lat: number, lon: number) => void;
  onSetAsWaterSource?: (lat: number, lon: number) => void;
  onViewIn3D?: (lat: number, lon: number) => void;
}

type CropFilterTab = 'all' | 'recommended' | MarsCrop['category'];
type ModalMobileSection = 'crops' | 'site';

function formatCoord(lat: number, lon: number): string {
  const latStr = lat >= 0 ? `${lat.toFixed(2)}°N` : `${Math.abs(lat).toFixed(2)}°S`;
  return `${latStr}, ${lon.toFixed(2)}°E`;
}

export const MarsFarmModal: React.FC<MarsFarmModalProps> = ({
  point,
  landmark,
  onClose,
  onSetAsFarmTarget,
  onSetAsWaterSource,
  onViewIn3D,
}) => {
  const { language, setLanguage, pick } = useLanguage();
  const recipe = useMemo(() => analyzeMarsFarmingPotential(point), [point]);
  const [selectedCrop, setSelectedCrop] = useState<MarsCrop>(
    () => recipe.recommendedCrops[0] ?? MARS_CROPS_DATABASE[0]
  );
  const [cropSearch, setCropSearch] = useState<string>('');
  const [activeTab, setActiveTab] = useState<CropFilterTab>('all');
  const [mobileSection, setMobileSection] = useState<ModalMobileSection>('crops');

  const recommendedIdSet = useMemo(
    () => new Set(recipe.recommendedCrops.map((c) => c.id)),
    [recipe.recommendedCrops]
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<MarsCrop['category'], number> = {
      staple: 0,
      greens: 0,
      protein: 0,
      fruit: 0,
      algae: 0,
    };
    for (const c of MARS_CROPS_DATABASE) {
      counts[c.category] += 1;
    }
    return counts;
  }, []);

  const filteredCrops = useMemo(() => {
    const query = cropSearch.trim();
    const baseList =
      activeTab === 'recommended'
        ? recipe.recommendedCrops
        : activeTab === 'all'
          ? MARS_CROPS_DATABASE
          : MARS_CROPS_DATABASE.filter((c) => c.category === activeTab);

    if (!query) return baseList;

    return baseList.filter((crop) => {
      return (
        matchesHangulOrText(crop.nameEn, query) ||
        matchesHangulOrText(crop.nameKo, query) ||
        matchesHangulOrText(crop.scientificName, query) ||
        matchesHangulOrText(crop.categoryEn, query) ||
        matchesHangulOrText(crop.categoryKo, query) ||
        matchesHangulOrText(crop.nutritionalHighlightsEn, query) ||
        matchesHangulOrText(crop.nutritionalHighlightsKo, query)
      );
    });
  }, [activeTab, cropSearch, recipe.recommendedCrops]);

  const filterTabs: { id: CropFilterTab; labelEn: string; labelKo: string; count: number }[] = [
    { id: 'all', labelEn: 'All', labelKo: '전체', count: MARS_CROPS_DATABASE.length },
    { id: 'recommended', labelEn: 'Top Picks', labelKo: '추천', count: recipe.recommendedCrops.length },
    { id: 'staple', labelEn: 'Staples', labelKo: '주식·구근', count: categoryCounts.staple },
    { id: 'greens', labelEn: 'Greens', labelKo: '엽채·허브', count: categoryCounts.greens },
    { id: 'protein', labelEn: 'Protein', labelKo: '콩·새싹', count: categoryCounts.protein },
    { id: 'fruit', labelEn: 'Fruit/Veg', labelKo: '과채·과수', count: categoryCounts.fruit },
    { id: 'algae', labelEn: 'Algae/Fungi', labelKo: '조류·버섯', count: categoryCounts.algae },
  ];

  const selectedCropScore = useMemo(
    () => scoreCropForPoint(selectedCrop, point),
    [selectedCrop, point]
  );

  const siteCompatibility = useMemo(() => {
    const soilMatch =
      (point.soilFertility >= 55 && selectedCrop.recommendedSoilMethod === 'regolith_wash') ||
      (point.soilFertility < 55 && selectedCrop.recommendedSoilMethod !== 'regolith_wash') ||
      selectedCrop.recommendedSoilMethod === 'hybrid_substrate';

    const waterFor10m2 = Number((selectedCrop.waterConsumptionLPerM2Day * 10).toFixed(1));
    const waterComfortable = recipe.dailyWaterHarvestableL >= waterFor10m2;

    if (soilMatch && waterComfortable) {
      return {
        tone: 'emerald' as const,
        titleEn: 'Strong Site Match',
        titleKo: '현지 환경 적합',
        descEn: `10m² uses ${waterFor10m2} L/d vs ${recipe.dailyWaterHarvestableL} L/d site yield. Soil (${point.soilFertility}/100) fits this method.`,
        descKo: `10m² 재배 시 일일 ${waterFor10m2} L 소비 (추출량 ${recipe.dailyWaterHarvestableL} L/일). 토양(${point.soilFertility}/100)과 배지 방식이 잘 맞습니다.`,
      };
    }
    if (!waterComfortable) {
      return {
        tone: 'amber' as const,
        titleEn: 'High Water Recycling Needed',
        titleKo: '고효율 물 재순환 필요',
        descEn: `10m² needs ${waterFor10m2} L/d (> ${recipe.dailyWaterHarvestableL} L/d raw yield). Use >92% closed-loop recovery.`,
        descKo: `10m² 기준 ${waterFor10m2} L/일이 필요해 추출량(${recipe.dailyWaterHarvestableL} L/일)을 넘습니다. 밀폐 응축수 회수(92%+)가 필수입니다.`,
      };
    }
    return {
      tone: 'sky' as const,
      titleEn: 'Substrate Adaptation',
      titleKo: '배지·수경 전환 권장',
      descEn: `Soil score is ${point.soilFertility}/100. Run ${selectedCrop.soilMethodEn} inside sealed dome.`,
      descKo: `토양 점수(${point.soilFertility}/100)에 맞춰 돔 내부에서 '${selectedCrop.soilMethodKo}' 방식으로 재배하세요.`,
    };
  }, [point.soilFertility, recipe.dailyWaterHarvestableL, selectedCrop]);

  const cropName = pick(selectedCrop.nameEn, selectedCrop.nameKo);
  const tenM2YieldKg = Number((selectedCrop.dailyYieldKgPerM2 * 10).toFixed(2));
  const tenM2WaterL = Number((selectedCrop.waterConsumptionLPerM2Day * 10).toFixed(1));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-6xl h-[92vh] bg-[#07090E] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100 min-w-0"
      >
        {/* Top Calibration Header (Guaranteed fit without horizontal overflow) */}
        <header className="px-4 sm:px-5 py-3 bg-[#0B0E17] border-b border-slate-800 flex items-center justify-between gap-2 shrink-0 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-[#111827] border border-slate-700 flex items-center justify-center text-cyan-400 shrink-0">
              <Sprout className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-tight truncate max-w-full">
                  {landmark ? pick(landmark.nameEn, landmark.nameKo) : pick('Selected Site', '선택 지점')}{' '}
                  · {pick('Greenhouse & Crops', '온실 · 작물 백과')}
                </h2>
                <span className="px-1.5 py-0.5 text-[11px] font-mono tabular-nums rounded bg-[#111827] text-cyan-300 border border-slate-700 shrink-0">
                  {formatCoord(point.lat, point.lon)}
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 text-[11px] font-semibold rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
                  {pick(recipe.settlementRatingEn, recipe.settlementRatingKo)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <div
              role="group"
              aria-label={pick('Language selector', '언어 선택')}
              className="flex items-center bg-[#07090E] border border-slate-700 rounded-lg p-0.5"
            >
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-2 py-1 text-[11px] font-mono font-bold rounded transition-colors ${
                  language === 'en'
                    ? 'bg-cyan-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLanguage('ko')}
                className={`px-2 py-1 text-[11px] font-bold rounded transition-colors ${
                  language === 'ko'
                    ? 'bg-cyan-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                한국어
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-700 transition-colors"
              aria-label={pick('Close', '닫기')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Compact Always-Visible 4-KPI Water Balance Strip (No tall vertical blocking) */}
        <div className="grid grid-cols-4 gap-px bg-slate-800 border-b border-slate-800 shrink-0">
          <div className="bg-[#0C111B] px-3 py-2 min-w-0">
            <div className="text-[11px] text-slate-400 truncate flex items-center gap-1">
              <Droplets className="w-3 h-3 text-cyan-400 shrink-0" />
              <span className="truncate">{pick('Water Prob.', '지하수')}</span>
            </div>
            <div className="text-sm sm:text-base font-mono tabular-nums font-bold text-cyan-300">
              {point.combinedWaterProb}%
            </div>
          </div>

          <div className="bg-[#0C111B] px-3 py-2 min-w-0">
            <div className="text-[11px] text-slate-400 truncate">
              {pick('Extraction', '일일 추출')}
            </div>
            <div className="text-sm sm:text-base font-mono tabular-nums font-bold text-white">
              {recipe.dailyWaterHarvestableL}
              <span className="text-[11px] font-normal text-slate-400 ml-0.5">
                {pick('L/d', 'L/일')}
              </span>
            </div>
          </div>

          <div className="bg-[#0C111B] px-3 py-2 min-w-0">
            <div className="text-[11px] text-slate-400 truncate">
              {pick('40m² Need', '온실 수요')}
            </div>
            <div className="text-sm sm:text-base font-mono tabular-nums font-bold text-white">
              {recipe.dailyWaterRequirementL}
              <span className="text-[11px] font-normal text-slate-400 ml-0.5">
                {pick('L/d', 'L/일')}
              </span>
            </div>
          </div>

          <div className="bg-[#0C111B] px-3 py-2 min-w-0">
            <div className="text-[11px] text-slate-400 truncate">
              {pick('Net Surplus', '수자원 여유')}
            </div>
            <div
              className={`text-sm sm:text-base font-mono tabular-nums font-bold ${
                recipe.waterSurplusL >= 0 ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {recipe.waterSurplusL >= 0 ? `+${recipe.waterSurplusL}` : recipe.waterSurplusL}
              <span className="text-[11px] font-normal text-slate-400 ml-0.5">
                {pick('L/d', 'L/일')}
              </span>
            </div>
          </div>
        </div>

        {/* Workspace Switcher on < XL Screens (Zero scroll-down needed to reach crops OR site telemetry) */}
        <div className="xl:hidden px-4 py-2 bg-[#080B12] border-b border-slate-800 grid grid-cols-2 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setMobileSection('crops')}
            className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-colors flex items-center justify-center gap-1.5 ${
              mobileSection === 'crops'
                ? 'bg-cyan-400/15 border-cyan-400 text-cyan-200'
                : 'bg-[#111827] border-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Leaf className="w-3.5 h-3.5" />
            <span>{pick('100-Crop Encyclopedia', '100종 작물 선택 · 재배법')}</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileSection('site')}
            className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-colors flex items-center justify-center gap-1.5 ${
              mobileSection === 'site'
                ? 'bg-cyan-400/15 border-cyan-400 text-cyan-200'
                : 'bg-[#111827] border-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span>{pick('Site Climate & Soil Prep', '현지 환경 · 토양 처리')}</span>
          </button>
        </div>

        {/* Main Body: Side-by-side on XL (>=1280px), Instant Tabbed View on < XL */}
        <div className="flex-1 min-h-0 flex flex-col xl:grid xl:grid-cols-[320px_1fr] overflow-hidden">
          {/* LEFT COLUMN: Site Environment, Dome Targets & Soil Prep */}
          <aside
            className={`${
              mobileSection === 'site' ? 'flex' : 'hidden xl:flex'
            } flex-col flex-1 min-h-0 min-w-0 bg-[#0B0E17] xl:border-r border-slate-800 p-4 space-y-3.5 overflow-y-auto`}
          >
            {/* Ambient vs Pressurized Dome Table */}
            <section className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                {pick('Mars Ambient vs. Dome Target', '화성 외부 vs 온실 내부 기준')}
              </div>
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-[#111827] divide-y divide-slate-800 text-xs">
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-1.5 bg-slate-900/70 text-[11px] font-mono uppercase text-slate-400">
                  <span>{pick('Metric', '항목')}</span>
                  <span className="text-right">{pick('Outside', '외부')}</span>
                  <span className="text-right text-emerald-400">{pick('Dome', '온실')}</span>
                </div>
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 items-center">
                  <span className="text-slate-300 flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    {pick('Pressure', '기압')}
                  </span>
                  <span className="font-mono tabular-nums text-slate-300">
                    {recipe.ambientPressureHpa} hPa
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-emerald-300">
                    {recipe.domePressureAtm} atm
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 items-center">
                  <span className="text-slate-300 flex items-center gap-1.5">
                    <Thermometer className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    {pick('Temp', '기온')}
                  </span>
                  <span className="font-mono tabular-nums text-slate-300">
                    {recipe.ambientTempC}°C
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-emerald-300">
                    {recipe.domeTempC}°C / 16°C
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 items-center">
                  <span className="text-slate-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    {pick('Soil / CO₂', '토양 / CO₂')}
                  </span>
                  <span className="font-mono tabular-nums text-slate-300">
                    {point.soilFertility}/100
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-emerald-300">
                    {recipe.co2BoostPpm} ppm
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 items-center">
                  <span className="text-slate-300">{pick('Slope / O₂', '경사 / O₂')}</span>
                  <span className="font-mono tabular-nums text-slate-300">
                    {point.slopeDeg}°
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-emerald-300">
                    {recipe.o2Pct}% O₂
                  </span>
                </div>
              </div>
            </section>

            {/* Soil & Substrate Preparation */}
            <section className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <FlaskConical className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                {pick('Site Soil Prep Protocol', '현지 토양·배지 처리 방식')}
              </div>
              <div className="border border-slate-800 rounded-xl bg-[#111827] p-3 space-y-2">
                <div className="text-xs font-semibold text-amber-300 leading-snug">
                  {pick(recipe.soilMethodSummaryEn, recipe.soilMethodSummaryKo)}
                </div>
                <ol className="space-y-1.5">
                  {pick(recipe.soilRemediationStepsEn, recipe.soilRemediationStepsKo).map(
                    (step, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 text-xs text-slate-200 leading-relaxed"
                      >
                        <span className="w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-mono font-bold text-slate-300 flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    )
                  )}
                </ol>
              </div>
            </section>

            {/* Selected Crop vs Site Compatibility Callout */}
            <section
              className={`rounded-xl border p-3 space-y-1 ${
                siteCompatibility.tone === 'emerald'
                  ? 'bg-emerald-950/30 border-emerald-500/35'
                  : siteCompatibility.tone === 'amber'
                    ? 'bg-amber-950/30 border-amber-500/35'
                    : 'bg-sky-950/30 border-sky-500/35'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  {siteCompatibility.tone === 'amber' ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  )}
                  {pick(siteCompatibility.titleEn, siteCompatibility.titleKo)}
                </span>
                <span className="text-[11px] font-mono tabular-nums text-slate-300 shrink-0">
                  {pick('Match', '적합도')} {Math.min(99, selectedCropScore)}%
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {pick(siteCompatibility.descEn, siteCompatibility.descKo)}
              </p>
            </section>
          </aside>

          {/* RIGHT COLUMN: 100-Crop Search & Detailed Cultivation Encyclopedia */}
          <div
            className={`${
              mobileSection === 'crops' ? 'flex' : 'hidden xl:flex'
            } flex-col flex-1 min-h-0 min-w-0 bg-[#07090E]`}
          >
            {/* Compact Search + Category Filter Toolbar */}
            <div className="px-4 py-3 border-b border-slate-800 space-y-2.5 shrink-0 bg-[#080B12] min-w-0">
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={cropSearch}
                    onChange={(e) => setCropSearch(e.target.value)}
                    placeholder={pick(
                      'Search 100 crops (e.g. potato, rice, strawberry, garlic, kale)...',
                      '100대 작물 검색 (예: 감자, 딸기, 쌀, 토마토, ㅅㄱㅊ, basil)...'
                    )}
                    className="w-full bg-[#111827] border border-slate-700 rounded-xl pl-9 pr-8 py-2 text-xs sm:text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-cyan-400 transition-colors"
                  />
                  {cropSearch && (
                    <button
                      type="button"
                      onClick={() => setCropSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5"
                      aria-label={pick('Clear crop search', '작물 검색 초기화')}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-400 shrink-0 whitespace-nowrap">
                  {filteredCrops.length}/{MARS_CROPS_DATABASE.length}
                </span>
              </div>

              {/* Category Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                {filterTabs.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap border transition-colors flex items-center gap-1 ${
                        isActive
                          ? 'bg-cyan-400/15 border-cyan-400 text-cyan-200 font-semibold'
                          : 'bg-[#111827] border-slate-800 text-slate-300 hover:border-slate-600 hover:text-white'
                      }`}
                    >
                      <span>{pick(tab.labelEn, tab.labelKo)}</span>
                      <span className="text-[11px] font-mono tabular-nums text-slate-400">
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Compact Horizontal Crop Strip on Mobile/Narrow (< md) so Detail Card stays visible immediately! */}
              <div className="md:hidden flex items-center gap-1.5 overflow-x-auto pt-0.5 pb-1">
                {filteredCrops.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCropSearch('');
                      setActiveTab('all');
                    }}
                    className="px-3 py-1.5 text-xs bg-slate-800 text-cyan-300 rounded-lg border border-slate-700"
                  >
                    {pick('No matches · Reset search', '검색 결과 없음 · 초기화')}
                  </button>
                ) : (
                  filteredCrops.map((crop) => {
                    const isSelected = selectedCrop.id === crop.id;
                    const label = pick(crop.nameEn, crop.nameKo);
                    return (
                      <button
                        key={crop.id}
                        type="button"
                        onClick={() => setSelectedCrop(crop)}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs whitespace-nowrap flex items-center gap-1.5 shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-cyan-500/20 border-cyan-400 text-white font-semibold'
                            : 'bg-[#0E1420] border-slate-800 text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        <span>{crop.iconName}</span>
                        <span>{label}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Crop Directory (md+) + Full Crop Detail View */}
            <div className="flex-1 min-h-0 flex md:grid md:grid-cols-[230px_1fr] overflow-hidden">
              {/* Scrollable Left Crop Directory (md+) */}
              <div className="hidden md:block overflow-y-auto border-r border-slate-800 p-2.5 space-y-1.5 bg-[#090C14] min-w-0">
                {filteredCrops.length === 0 ? (
                  <div className="p-4 text-center space-y-2.5">
                    <p className="text-xs text-slate-400">
                      {pick(
                        `No crops found matching "${cropSearch}".`,
                        `"${cropSearch}"에 해당하는 작물이 없습니다.`
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setCropSearch('');
                        setActiveTab('all');
                      }}
                      className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg border border-slate-700"
                    >
                      {pick('Reset Search', '검색 초기화')}
                    </button>
                  </div>
                ) : (
                  filteredCrops.map((crop) => {
                    const isSelected = selectedCrop.id === crop.id;
                    const isRec = recommendedIdSet.has(crop.id);
                    const label = pick(crop.nameEn, crop.nameKo);
                    return (
                      <button
                        key={crop.id}
                        type="button"
                        onClick={() => setSelectedCrop(crop)}
                        className={`w-full text-left px-2.5 py-2 rounded-xl border transition-colors flex items-center gap-2 min-w-0 ${
                          isSelected
                            ? 'bg-cyan-500/15 border-cyan-400 text-white'
                            : 'bg-[#0E1420] border-slate-800/90 text-slate-300 hover:border-slate-600 hover:bg-[#131B2B]'
                        }`}
                      >
                        <span className="text-lg shrink-0" role="img" aria-label={label}>
                          {crop.iconName}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold truncate">{label}</span>
                            {isRec && (
                              <span className="px-1 py-0.5 text-[9px] font-mono uppercase rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                                {pick('REC', '추천')}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5 flex items-center justify-between">
                            <span>
                              {crop.growthDays}
                              {pick('d', '일')} · {crop.waterConsumptionLPerM2Day}L
                            </span>
                            <span>{crop.caloriePer100g}kcal</span>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Selected Crop Encyclopedia Sheet */}
              <div className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-5 space-y-4">
                {/* Crop Hero */}
                <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3 flex-wrap">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-11 h-11 rounded-xl bg-[#111827] border border-slate-700 flex items-center justify-center text-2xl shrink-0">
                      <span role="img" aria-label={cropName}>
                        {selectedCrop.iconName}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-base sm:text-lg font-bold text-white">{cropName}</h4>
                        <span className="text-xs font-mono italic text-slate-400">
                          {selectedCrop.scientificName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-[#111827] text-cyan-300 border border-slate-700">
                          {pick(selectedCrop.categoryEn, selectedCrop.categoryKo)}
                        </span>
                        <span className="text-xs text-slate-300 flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>
                            {pick(
                              selectedCrop.nutritionalHighlightsEn,
                              selectedCrop.nutritionalHighlightsKo
                            )}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#111827] border border-slate-800 rounded-xl px-3 py-1.5 text-right shrink-0">
                    <div className="text-base font-mono tabular-nums font-bold text-white">
                      {selectedCrop.caloriePer100g}{' '}
                      <span className="text-xs font-normal text-slate-400">kcal</span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400">
                      {pick('per 100g', '100g 기준')}
                    </div>
                  </div>
                </div>

                {/* Martian Bio-Dome Rationale */}
                <div className="bg-[#0E1624] border border-cyan-500/25 rounded-xl px-3.5 py-2.5 text-xs sm:text-[13px] text-slate-200 leading-relaxed">
                  <span className="font-semibold text-cyan-300 mr-1.5">
                    {pick('Martian Advantage:', '화성 온실 적합 이유:')}
                  </span>
                  {pick(selectedCrop.whySuitedEn, selectedCrop.whySuitedKo)}
                </div>

                {/* 6 Calibrated Cultivation Telemetry Cells */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-slate-800 border border-slate-800 rounded-xl overflow-hidden">
                  <div className="bg-[#111827] p-2.5 sm:p-3">
                    <div className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-cyan-400 shrink-0" />
                      {pick('Harvest Cycle', '수확 소요일')}
                    </div>
                    <div className="text-sm sm:text-base font-mono tabular-nums font-bold text-white mt-0.5">
                      {selectedCrop.growthDays} {pick('days', '일')}
                    </div>
                  </div>

                  <div className="bg-[#111827] p-2.5 sm:p-3">
                    <div className="text-[11px] text-slate-400">{pick('Daily Yield', '일일 수확량')}</div>
                    <div className="text-sm sm:text-base font-mono tabular-nums font-bold text-emerald-300 mt-0.5">
                      {selectedCrop.dailyYieldKgPerM2}{' '}
                      <span className="text-[11px] font-normal text-slate-400">kg/m²·d</span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">
                      {tenM2YieldKg} kg/d (10m²)
                    </div>
                  </div>

                  <div className="bg-[#111827] p-2.5 sm:p-3">
                    <div className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Droplets className="w-3 h-3 text-sky-400 shrink-0" />
                      {pick('Water Use', '물 소비량')}
                    </div>
                    <div className="text-sm sm:text-base font-mono tabular-nums font-bold text-sky-300 mt-0.5">
                      {selectedCrop.waterConsumptionLPerM2Day}{' '}
                      <span className="text-[11px] font-normal text-slate-400">
                        {pick('L/m²·d', 'L/m²·일')}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">
                      {tenM2WaterL} {pick('L/d', 'L/일')} (10m²)
                    </div>
                  </div>

                  <div className="bg-[#111827] p-2.5 sm:p-3">
                    <div className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Thermometer className="w-3 h-3 text-amber-400 shrink-0" />
                      {pick('Temperature', '적정 온도')}
                    </div>
                    <div className="text-sm sm:text-base font-mono tabular-nums font-bold text-white mt-0.5">
                      {selectedCrop.minTempC}–{selectedCrop.optTempC}°C
                    </div>
                  </div>

                  <div className="bg-[#111827] p-2.5 sm:p-3">
                    <div className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Sun className="w-3 h-3 text-amber-300 shrink-0" />
                      {pick('LED · CO₂', 'LED · CO₂')}
                    </div>
                    <div className="text-sm sm:text-base font-mono tabular-nums font-bold text-amber-200 mt-0.5">
                      {selectedCrop.lightHoursDay}h · {selectedCrop.co2Ppm} ppm
                    </div>
                  </div>

                  <div className="bg-[#111827] p-2.5 sm:p-3">
                    <div className="text-[11px] text-slate-400">{pick('Humidity · pH', '습도 · pH')}</div>
                    <div className="text-xs sm:text-sm font-mono tabular-nums font-bold text-white mt-0.5">
                      {pick(selectedCrop.optimalHumidityPctEn, selectedCrop.optimalHumidityPct)}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">
                      {selectedCrop.phRange}
                    </div>
                  </div>
                </div>

                {/* Substrate & Nutrient Prescription */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="bg-[#111827] border border-slate-800 rounded-xl p-3 space-y-1">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                      {pick('Recommended Substrate', '권장 토양 · 배지 방식')}
                    </div>
                    <div className="text-xs sm:text-[13px] font-semibold text-white leading-snug">
                      {pick(selectedCrop.soilMethodEn, selectedCrop.soilMethodKo)}
                    </div>
                  </div>
                  <div className="bg-[#111827] border border-slate-800 rounded-xl p-3 space-y-1">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                      {pick('Nutrient Formula', '필수 양분 · 비료 처방')}
                    </div>
                    <div className="text-xs sm:text-[13px] font-semibold text-white leading-snug">
                      {pick(selectedCrop.nutrientsEn, selectedCrop.nutrientsKo)}
                    </div>
                  </div>
                </div>

                {/* 4-Stage Step-by-Step Guide */}
                <div className="space-y-2">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                    {pick('4-Stage Greenhouse Cultivation Protocol', '단계별 온실 재배 절차')}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {pick(selectedCrop.cultivationStepsEn, selectedCrop.cultivationStepsKo).map(
                      (step, idx) => (
                        <div
                          key={idx}
                          className="bg-[#0D131F] border border-slate-800 rounded-xl p-3 space-y-1"
                        >
                          <div className="text-xs font-bold text-cyan-300">{step.stage}</div>
                          <div className="text-xs sm:text-[13px] text-slate-200 leading-relaxed">
                            {step.detail}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* Practical Harvest / Safety Tip */}
                <div className="bg-amber-950/25 border border-amber-500/35 rounded-xl px-3.5 py-2.5 flex items-start gap-2 text-xs sm:text-[13px] text-slate-200 leading-relaxed">
                  <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-amber-300 font-semibold mr-1.5">
                      {pick('Grower Tip:', '재배 핵심 팁:')}
                    </strong>
                    {pick(selectedCrop.harvestTipEn, selectedCrop.harvestTipKo)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Clean Action Footer */}
        <footer className="px-4 sm:px-5 py-2.5 bg-[#0B0E17] border-t border-slate-800 flex items-center justify-between gap-2 flex-wrap shrink-0">
          <div className="text-xs text-slate-400 font-mono tabular-nums">
            {formatCoord(point.lat, point.lon)} · {pick('Elev', '고도')}{' '}
            {point.elevationM.toLocaleString()}m
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {onSetAsWaterSource && (
              <button
                type="button"
                onClick={() => {
                  onSetAsWaterSource(point.lat, point.lon);
                  onClose();
                }}
                className="px-3 py-1.5 text-xs font-medium bg-[#111827] hover:bg-slate-800 text-cyan-300 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Droplets className="w-3.5 h-3.5" />
                {pick('Water Source (Start)', '수자원 시추지(출발)')}
              </button>
            )}

            {onSetAsFarmTarget && (
              <button
                type="button"
                onClick={() => {
                  onSetAsFarmTarget(point.lat, point.lon);
                  onClose();
                }}
                className="px-3 py-1.5 text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Sprout className="w-3.5 h-3.5" />
                {pick('Greenhouse Site (Target)', '온실 농경지(도착)')}
              </button>
            )}

            {onViewIn3D && (
              <button
                type="button"
                onClick={() => {
                  onViewIn3D(point.lat, point.lon);
                  onClose();
                }}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:text-white bg-[#111827] hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
                title={pick('View 3D Terrain', '3D 지형 보기')}
              >
                <Box className="w-3.5 h-3.5" />
                <span>{pick('3D Terrain', '3D 지형')}</span>
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};
