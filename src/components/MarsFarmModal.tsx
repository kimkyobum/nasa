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
  ChevronRight,
  Clock,
  Sun,
  FlaskConical,
  Info,
} from 'lucide-react';
import { Landmark, MarsTelemetryPoint } from '../types/mars';
import {
  analyzeMarsFarmingPotential,
  MARS_CROPS_DATABASE,
  MarsCrop,
} from '../data/marsCrops';

interface MarsFarmModalProps {
  point: MarsTelemetryPoint;
  landmark: Landmark | null;
  onClose: () => void;
  onSetAsFarmTarget?: (lat: number, lon: number) => void;
  onSetAsWaterSource?: (lat: number, lon: number) => void;
  onViewIn3D?: (lat: number, lon: number) => void;
}

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
  const recipe = useMemo(() => analyzeMarsFarmingPotential(point), [point]);
  const [selectedCrop, setSelectedCrop] = useState<MarsCrop>(
    () => recipe.recommendedCrops[0] ?? MARS_CROPS_DATABASE[0]
  );
  const [showAllCrops, setShowAllCrops] = useState<boolean>(false);

  const displayedCrops = showAllCrops
    ? MARS_CROPS_DATABASE
    : recipe.recommendedCrops;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-3xl bg-[#0a0e17] border border-white/15 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-100"
      >
        {/* Clean Solid Header */}
        <div className="px-5 py-3.5 bg-[#070a10] border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-slate-800 border border-white/15 flex items-center justify-center text-sky-400 shrink-0">
              <Sprout className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-mono tracking-wider text-slate-400 truncate">
                The Vision of Mars and warter extraction
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <h2 className="text-sm font-bold text-white">
                  {landmark ? landmark.nameKo : '선택 지점'} 온실 재배 분석
                </h2>
                <span className="text-xs font-mono text-slate-400">
                  {formatCoord(point.lat, point.lon)}
                </span>
                <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-slate-800 text-slate-200 border border-white/10">
                  {recipe.settlementRatingKo}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* 1. Water Balance Summary Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-[#111622] border border-white/10 rounded-lg p-3">
              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                <Droplets className="w-3 h-3 text-sky-400" />
                지하수 확률
              </div>
              <div className="text-lg font-mono font-bold text-sky-300 mt-1">
                {point.combinedWaterProb}%
              </div>
            </div>

            <div className="bg-[#111622] border border-white/10 rounded-lg p-3">
              <div className="text-[10px] text-slate-400">일일 추출량</div>
              <div className="text-lg font-mono font-bold text-white mt-1">
                {recipe.dailyWaterHarvestableL}
                <span className="text-[10px] font-normal text-slate-400 ml-1">L/일</span>
              </div>
            </div>

            <div className="bg-[#111622] border border-white/10 rounded-lg p-3">
              <div className="text-[10px] text-slate-400">온실(40m²) 수요</div>
              <div className="text-lg font-mono font-bold text-white mt-1">
                {recipe.dailyWaterRequirementL}
                <span className="text-[10px] font-normal text-slate-400 ml-1">L/일</span>
              </div>
            </div>

            <div className="bg-[#111622] border border-white/10 rounded-lg p-3">
              <div className="text-[10px] text-slate-400">일일 수자원 여유</div>
              <div
                className={`text-lg font-mono font-bold mt-1 ${
                  recipe.waterSurplusL >= 0 ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {recipe.waterSurplusL >= 0 ? `+${recipe.waterSurplusL}` : recipe.waterSurplusL}
                <span className="text-[10px] font-normal text-slate-400 ml-1">L/일</span>
              </div>
            </div>
          </div>

          {/* 2. Side-by-Side Environment & Greenhouse Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* External Telemetry */}
            <div className="bg-[#111622] border border-white/10 rounded-lg p-3.5">
              <div className="text-[11px] font-bold text-slate-200 mb-2.5 flex items-center justify-between">
                <span>외부 현지 환경</span>
                <span className="text-[10px] font-mono text-slate-400">실측/모델값</span>
              </div>
              <div className="grid grid-cols-2 gap-y-2 gap-x-4 font-mono text-[11px]">
                <div className="flex items-center justify-between border-b border-white/5 pb-1">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Gauge className="w-3 h-3 text-slate-400" /> 기압
                  </span>
                  <span className="text-white">{recipe.ambientPressureHpa} hPa</span>
                </div>
                <div className="flex items-center justify-between border-b border-white/5 pb-1">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Thermometer className="w-3 h-3 text-slate-400" /> 기온
                  </span>
                  <span className="text-white">{recipe.ambientTempC}°C</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Layers className="w-3 h-3 text-slate-400" /> 토양 점토
                  </span>
                  <span className="text-white">{point.soilFertility}/100</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">지형 경사</span>
                  <span className="text-white">{point.slopeDeg}°</span>
                </div>
              </div>
            </div>

            {/* Greenhouse Target Settings */}
            <div className="bg-[#111622] border border-white/10 rounded-lg p-3.5">
              <div className="text-[11px] font-bold text-slate-200 mb-2.5 flex items-center justify-between">
                <span>온실 내부 유지 조건</span>
                <span className="text-[10px] font-mono text-emerald-400">가압 비닐하우스</span>
              </div>
              <div className="grid grid-cols-2 gap-y-2 gap-x-4 font-mono text-[11px]">
                <div className="flex items-center justify-between border-b border-white/5 pb-1">
                  <span className="text-slate-400">내부 기압</span>
                  <span className="text-slate-100">{recipe.domePressureAtm} atm</span>
                </div>
                <div className="flex items-center justify-between border-b border-white/5 pb-1">
                  <span className="text-slate-400">재배 온도</span>
                  <span className="text-slate-100">{recipe.domeTempC}°C / 16°C</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">CO₂ 농도</span>
                  <span className="text-slate-100">{recipe.co2BoostPpm} ppm</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">산소(O₂)</span>
                  <span className="text-slate-100">{recipe.o2Pct}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Concise Soil Prep Method */}
          <div className="bg-[#111622] border border-white/10 rounded-lg p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                <FlaskConical className="w-3.5 h-3.5 text-amber-400" />
                토양·배지 처리 방식
              </span>
              <span className="text-[11px] font-semibold text-amber-300">
                {recipe.soilMethodSummaryKo}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              {recipe.soilRemediationStepsKo.map((step, idx) => (
                <div
                  key={idx}
                  className="bg-black/35 border border-white/10 rounded px-2.5 py-2 text-[11px] text-slate-300 flex items-start gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span className="leading-snug">{step}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 4. Interactive Crop Selector + Detailed Cultivation Panel */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">
                작물 선택 (누르면 상세 재배법 표시)
              </span>
              <button
                type="button"
                onClick={() => setShowAllCrops((v) => !v)}
                className="text-[11px] text-sky-400 hover:text-sky-300 transition-colors"
              >
                {showAllCrops ? '추천 TOP 3만 보기' : '전체 작물 6종 모두 보기'}
              </button>
            </div>

            {/* Crop Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {displayedCrops.map((crop) => {
                const isSelected = selectedCrop.id === crop.id;
                const isRecommended = recipe.recommendedCrops.some(
                  (r) => r.id === crop.id
                );
                return (
                  <button
                    key={crop.id}
                    type="button"
                    onClick={() => setSelectedCrop(crop)}
                    className={`text-left rounded-lg p-2.5 border transition-all flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-slate-800 border-sky-400 text-white shadow-sm'
                        : 'bg-[#111622] border-white/10 text-slate-300 hover:border-white/25 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg shrink-0" role="img" aria-label={crop.nameKo}>
                        {crop.iconName}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-bold truncate">
                            {crop.nameKo}
                          </span>
                          {isRecommended && (
                            <span className="text-[9px] px-1 rounded bg-sky-500/20 text-sky-300 shrink-0">
                              추천
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {crop.growthDays}일 · {crop.dailyYieldKgPerM2}kg/m²
                        </div>
                      </div>
                    </div>
                    <ChevronRight
                      className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                        isSelected ? 'text-sky-400 translate-x-0.5' : 'text-slate-500'
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            {/* Detailed Crop Sheet for Selected Crop */}
            <div className="bg-[#0d121d] border border-sky-500/35 rounded-xl p-4 space-y-3.5">
              {/* Crop Header */}
              <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl" role="img" aria-label={selectedCrop.nameKo}>
                    {selectedCrop.iconName}
                  </span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-white">
                        {selectedCrop.nameKo}
                      </h3>
                      <span className="text-[11px] font-mono text-slate-400 italic">
                        {selectedCrop.scientificName}
                      </span>
                      <span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-800 text-sky-300 border border-white/10">
                        {selectedCrop.categoryKo}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1">
                      {selectedCrop.whySuitedKo}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 font-mono">
                  <div className="text-xs font-bold text-white">
                    {selectedCrop.caloriePer100g} kcal
                  </div>
                  <div className="text-[10px] text-slate-400">100g 기준</div>
                </div>
              </div>

              {/* 5 Key Cultivation Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
                <div className="bg-black/35 border border-white/10 rounded p-2">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> 생육 기간
                  </span>
                  <div className="font-mono font-bold text-white mt-0.5">
                    {selectedCrop.growthDays}일
                  </div>
                </div>
                <div className="bg-black/35 border border-white/10 rounded p-2">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Thermometer className="w-3 h-3" /> 적정 온도
                  </span>
                  <div className="font-mono font-bold text-white mt-0.5">
                    {selectedCrop.minTempC}~{selectedCrop.optTempC}°C
                  </div>
                </div>
                <div className="bg-black/35 border border-white/10 rounded p-2">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Droplets className="w-3 h-3" /> 물 소비량
                  </span>
                  <div className="font-mono font-bold text-sky-300 mt-0.5">
                    {selectedCrop.waterConsumptionLPerM2Day} L/m²·일
                  </div>
                </div>
                <div className="bg-black/35 border border-white/10 rounded p-2">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Sun className="w-3 h-3" /> LED 일조
                  </span>
                  <div className="font-mono font-bold text-amber-300 mt-0.5">
                    일 {selectedCrop.lightHoursDay}시간
                  </div>
                </div>
                <div className="bg-black/35 border border-white/10 rounded p-2">
                  <span className="text-[10px] text-slate-400">습도 / pH</span>
                  <div className="font-mono font-bold text-white mt-0.5 truncate">
                    {selectedCrop.optimalHumidityPct} · {selectedCrop.phRange.replace('pH ', '')}
                  </div>
                </div>
              </div>

              {/* Substrate & Nutrients */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="bg-black/35 border border-white/10 rounded p-2.5">
                  <span className="text-[10px] text-slate-400 block">권장 토양 · 배지</span>
                  <span className="text-slate-100 font-medium">{selectedCrop.soilMethodKo}</span>
                </div>
                <div className="bg-black/35 border border-white/10 rounded p-2.5">
                  <span className="text-[10px] text-slate-400 block">필수 양분 · 비료 처방</span>
                  <span className="text-slate-100 font-medium">{selectedCrop.nutrientsKo}</span>
                </div>
              </div>

              {/* 4-Stage Step-by-Step Guide */}
              <div>
                <div className="text-[11px] font-bold text-slate-200 mb-1.5">
                  단계별 온실 재배 절차
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedCrop.cultivationStepsKo.map((step, idx) => (
                    <div
                      key={idx}
                      className="bg-black/30 border border-white/10 rounded p-2.5 space-y-0.5"
                    >
                      <div className="text-[11px] font-bold text-sky-300">
                        {step.stage}
                      </div>
                      <div className="text-[11px] text-slate-300 leading-snug">
                        {step.detail}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Practical Harvest / Safety Tip */}
              <div className="bg-slate-900/90 border border-white/10 rounded-lg px-3 py-2 flex items-start gap-2 text-[11px] text-slate-300">
                <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-amber-300 font-semibold">재배 핵심 팁: </strong>
                  {selectedCrop.harvestTipKo}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Clean Action Footer */}
        <div className="px-5 py-3 bg-[#070a10] border-t border-white/10 flex items-center justify-between gap-2 flex-wrap shrink-0">
          <div className="text-[11px] text-slate-400 font-mono">
            {formatCoord(point.lat, point.lon)}
          </div>

          <div className="flex items-center gap-2">
            {onSetAsWaterSource && (
              <button
                type="button"
                onClick={() => {
                  onSetAsWaterSource(point.lat, point.lon);
                  onClose();
                }}
                className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-sky-300 border border-white/15 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Droplets className="w-3.5 h-3.5" />
                수자원 시추지(출발)
              </button>
            )}

            {onSetAsFarmTarget && (
              <button
                type="button"
                onClick={() => {
                  onSetAsFarmTarget(point.lat, point.lon);
                  onClose();
                }}
                className="px-3 py-1.5 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Sprout className="w-3.5 h-3.5" />
                온실 농경지(도착)
              </button>
            )}

            {onViewIn3D && (
              <button
                type="button"
                onClick={() => {
                  onViewIn3D(point.lat, point.lon);
                  onClose();
                }}
                className="p-1.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-white/15 rounded-lg transition-colors"
                title="3D 지형 보기"
              >
                <Box className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
