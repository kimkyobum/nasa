import React, { useState } from 'react';
import { Droplets, Sprout, Mountain, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { MarsTelemetryPoint } from '../types/mars';

interface AgriSoilProtocolViewProps {
  selectedCell: MarsTelemetryPoint | null;
  regionNameKo: string;
}

export const AgriSoilProtocolView: React.FC<AgriSoilProtocolViewProps> = ({
  selectedCell,
  regionNameKo,
}) => {
  const [waterProb, setWaterProb] = useState<number>(
    selectedCell?.combinedWaterProb ?? 68
  );
  const [soilFertility, setSoilFertility] = useState<number>(
    selectedCell?.soilFertility ?? 42
  );
  const [slopeDeg, setSlopeDeg] = useState<number>(
    selectedCell?.slopeDeg ?? 4.5
  );
  const [crewCount, setCrewCount] = useState<number>(4);
  const [missionDays, setMissionDays] = useState<number>(180);

  const syncFromMap = () => {
    if (!selectedCell) return;
    setWaterProb(selectedCell.combinedWaterProb);
    setSoilFertility(selectedCell.soilFertility);
    setSlopeDeg(selectedCell.slopeDeg);
  };

  // Decision logic matching user's 2-branch concept:
  // 1. Slope >= 10° or Water < 45%: Not suitable for farming settlement (Exploration/Sample only)
  // 2. Water >= 45% & Soil >= 56%: Direct Mars Regolith Remediation Farming
  // 3. Water >= 45% & Soil < 56%: Bring Earth Soil / Hydroponics + Use Extracted Mars Groundwater!
  const isTerrainSafe = slopeDeg < 10;
  const hasUsableWater = waterProb >= 45;
  const isMarsSoilViable = soilFertility >= 56;

  let decisionTitle = '';
  let decisionMode: 'direct' | 'earth_hydro' | 'abort' = 'abort';
  let decisionDesc = '';

  if (!isTerrainSafe || !hasUsableWater) {
    decisionMode = 'abort';
    decisionTitle = '정착·농업 부적합 — 샘플 채취 및 로봇 탐사 전용 구역';
    decisionDesc = !isTerrainSafe
      ? '경사가 10° 이상으로 가파르며 화산 지형 불안정성이 높아 온실 모듈 설치가 위험합니다. 비교적 평탄한 인근 선상지·평원으로 이동이 필요합니다.'
      : '지하수/얼음 추정 확률이 45% 미만으로 자급자족 농사에 필요한 물 추출 에너지 비용이 과도합니다.';
  } else if (isMarsSoilViable) {
    decisionMode = 'direct';
    decisionTitle = '화성 현지 토양 개량 농법 (과염소산염 세척 + 점토 배합)';
    decisionDesc =
      '점토 광물(Phyllosilicates) 비율이 높고 경사가 완만합니다. 추출한 화성 지하수로 표토의 독성 과염소산염을 1차 세척한 뒤 퇴비·미생물을 혼합해 현지 토양 농사를 진행합니다.';
  } else {
    decisionMode = 'earth_hydro';
    decisionTitle = '지구 토양 투입 + 화성 정제 지하수 하이브리드 농법';
    decisionDesc =
      '화산 주변이라 물(지하수·얼음 용융수)은 존재하지만, 현무암 모래 및 산성/과염소산염 농도가 높아 현지 흙으로는 작물 생육이 어렵습니다. 지구에서 고농축 경량 토양·배지를 운반해 화성의 정제된 지하수로 수경·혼합 재배를 수행합니다.';
  }

  // Quantitative resource calculations
  const greenhouseAreaM2 = crewCount * 38; // ~38 m2 per astronaut for fresh crops + caloric supplement
  const dailyWaterL =
    decisionMode === 'earth_hydro'
      ? Math.round(greenhouseAreaM2 * 1.45) // Closed-loop hydroponics saves ~65% water
      : decisionMode === 'direct'
        ? Math.round(greenhouseAreaM2 * 3.1) // Regolith washing + soil irrigation uses more water
        : 0;
  const totalWaterL = dailyWaterL * missionDays;
  // Earth soil/substrate required (kg) for Earth-soil hybrid vs minimal starter inoculum
  const earthSoilKg =
    decisionMode === 'earth_hydro'
      ? Math.round(greenhouseAreaM2 * 12) // Lightweight coco-peat / enriched Earth substrate (~12 kg/m2)
      : decisionMode === 'direct'
        ? Math.round(greenhouseAreaM2 * 2.5) // Only microbial starter + compost from Earth
        : 0;
  const dailyHarvestKg =
    decisionMode === 'abort'
      ? 0
      : Number((greenhouseAreaM2 * 0.048 * (waterProb / 80)).toFixed(1));

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <p className="text-xs font-mono text-emerald-400 uppercase tracking-wider mb-1.5">
            Hydro-Agri Decision Protocol
          </p>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            화성 정착지 농업 가능성 판별 및 지구 토양 하이브리드 시뮬레이터
          </h1>
          <p className="mt-1.5 text-sm text-slate-300 max-w-2xl">
            화산 주변 지하수 확보 가능성과 토양 비옥도를 조합하여 현지 개량 농법 또는 지구 토양 + 화성 물
            수경재배 전략을 자동으로 산출합니다.
          </p>
        </div>

        {selectedCell && (
          <button
            type="button"
            onClick={syncFromMap}
            className="px-4 py-2 text-xs font-medium bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 rounded-lg hover:bg-cyan-500/25 transition-colors whitespace-nowrap shrink-0"
          >
            지도 선택 좌표값 불러오기 ({regionNameKo})
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Environmental Inputs */}
        <div className="lg:col-span-5 bg-[#0B0E17] border border-slate-800 rounded-lg p-5 space-y-5">
          <h2 className="text-sm font-semibold text-white">
            탐사 지점 환경 변수 설정
          </h2>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-300">지하수 · 얼음 확률 (SWIM + GRS)</span>
                <span className="font-mono text-cyan-300">{waterProb}%</span>
              </div>
              <input
                type="range"
                min={5}
                max={96}
                value={waterProb}
                onChange={(e) => setWaterProb(Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-300">현지 토양 비옥도 / 점토 함량 (CRISM)</span>
                <span className="font-mono text-emerald-300">{soilFertility} / 100</span>
              </div>
              <input
                type="range"
                min={5}
                max={95}
                value={soilFertility}
                onChange={(e) => setSoilFertility(Number(e.target.value))}
                className="w-full accent-emerald-400 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                56 미만: 화산재·과염소산염 독성 우세 → 지구 토양 운반 필요
              </p>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-300">지형 평균 경사도 (MOLA)</span>
                <span className="font-mono text-amber-300">{slopeDeg.toFixed(1)}°</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={25}
                step={0.5}
                value={slopeDeg}
                onChange={(e) => setSlopeDeg(Number(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  정착 대원 수 (명)
                </label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={crewCount}
                  onChange={(e) =>
                    setCrewCount(Math.max(1, Math.min(24, Number(e.target.value))))
                  }
                  className="w-full bg-[#07090E] border border-slate-700 rounded px-3 py-1.5 text-sm font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  임무 체류 기간 (일)
                </label>
                <input
                  type="number"
                  min={30}
                  max={900}
                  step={30}
                  value={missionDays}
                  onChange={(e) =>
                    setMissionDays(Math.max(30, Math.min(900, Number(e.target.value))))
                  }
                  className="w-full bg-[#07090E] border border-slate-700 rounded px-3 py-1.5 text-sm font-mono text-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Protocol Output & Resource Breakdown */}
        <div className="lg:col-span-7 space-y-4">
          {/* Decision Banner */}
          <div
            className={`border rounded-lg p-5 ${
              decisionMode === 'direct'
                ? 'bg-emerald-950/25 border-emerald-500/40'
                : decisionMode === 'earth_hydro'
                  ? 'bg-cyan-950/25 border-cyan-500/40'
                  : 'bg-rose-950/25 border-rose-500/40'
            }`}
          >
            <div className="flex items-start gap-3">
              {decisionMode === 'direct' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : decisionMode === 'earth_hydro' ? (
                <Droplets className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="text-xs font-mono text-slate-400 mb-1">
                  판정 결과 ·{' '}
                  {decisionMode === 'direct'
                    ? 'BRANCH 1: LOCAL SOIL'
                    : decisionMode === 'earth_hydro'
                      ? 'BRANCH 2: EARTH SOIL + MARS WATER'
                      : 'HOLD: RELOCATE TO SAFE BASIN'}
                </div>
                <h3 className="text-lg font-bold text-white">{decisionTitle}</h3>
                <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                  {decisionDesc}
                </p>
              </div>
            </div>
          </div>

          {/* 4-column Numeric Telemetry Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4">
              <div className="text-[11px] text-slate-400">필요 온실 면적</div>
              <div className="text-2xl font-mono font-bold text-white mt-1">
                {decisionMode === 'abort' ? 0 : greenhouseAreaM2}
                <span className="text-xs font-normal text-slate-400 ml-1">m²</span>
              </div>
            </div>

            <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4">
              <div className="text-[11px] text-slate-400">지구 토양/배지 수송량</div>
              <div className="text-2xl font-mono font-bold text-amber-300 mt-1">
                {earthSoilKg.toLocaleString()}
                <span className="text-xs font-normal text-slate-400 ml-1">kg</span>
              </div>
            </div>

            <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4">
              <div className="text-[11px] text-slate-400">화성 정제수 일일 수요</div>
              <div className="text-2xl font-mono font-bold text-cyan-300 mt-1">
                {dailyWaterL}
                <span className="text-xs font-normal text-slate-400 ml-1">L/일</span>
              </div>
            </div>

            <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4">
              <div className="text-[11px] text-slate-400">예상 신선 작물 수확</div>
              <div className="text-2xl font-mono font-bold text-emerald-300 mt-1">
                {dailyHarvestKg}
                <span className="text-xs font-normal text-slate-400 ml-1">kg/일</span>
              </div>
            </div>
          </div>

          {/* 3-Step Field Workflow */}
          <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-5 space-y-3">
            <h4 className="text-sm font-semibold text-white">
              우주비행사 현장 검증 및 정착 프로토콜 ({missionDays}일 임무 기준 총{' '}
              {totalWaterL.toLocaleString()} L 수자원 필요)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-300">
              <div className="bg-[#07090E] border border-slate-800 rounded p-3 space-y-1">
                <div className="font-semibold text-cyan-300 flex items-center gap-1.5">
                  <Droplets className="w-3.5 h-3.5" />
                  1단계: 현장 시추 및 수질 검사
                </div>
                <p className="text-slate-400 leading-relaxed">
                  SWIM 고확률 지점에 2~5m 드릴링 후 용융수의 염분·과염소산염 제거(RO 역삼투 필터) 수행.
                </p>
              </div>
              <div className="bg-[#07090E] border border-slate-800 rounded p-3 space-y-1">
                <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
                  <Sprout className="w-3.5 h-3.5" />
                  2단계: 토양 분기 적용
                </div>
                <p className="text-slate-400 leading-relaxed">
                  현지 토양 부적합 시 지구에서 가져온 경량 압축 배지({earthSoilKg.toLocaleString()} kg)에
                  화성 정제수를 순환 공급.
                </p>
              </div>
              <div className="bg-[#07090E] border border-slate-800 rounded p-3 space-y-1">
                <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                  <Mountain className="w-3.5 h-3.5" />
                  3단계: 로봇 정비 & 샘플 이송
                </div>
                <p className="text-slate-400 leading-relaxed">
                  화산 급경사 지역은 무인 로봇의 정밀 샘플 채취 전용으로 두고, 사람은 평탄한 AR 안전 경로를
                  따라 기지로 복귀.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
