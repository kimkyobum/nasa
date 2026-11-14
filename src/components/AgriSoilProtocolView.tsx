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

  const isTerrainSafe = slopeDeg < 10;
  const hasUsableWater = waterProb >= 45;
  const isMarsSoilViable = soilFertility >= 56;

  let decisionTitle = '';
  let decisionMode: 'direct' | 'earth_hydro' | 'abort' = 'abort';
  let decisionDesc = '';

  if (!isTerrainSafe || !hasUsableWater) {
    decisionMode = 'abort';
    decisionTitle = '정착·농업 부적합 (탐사/이동 권장)';
    decisionDesc = !isTerrainSafe ? '급경사(10° 이상) · 지형 불안정' : '지하수 확률 45% 미만 · 에너지 과다';
  } else if (isMarsSoilViable) {
    decisionMode = 'direct';
    decisionTitle = '화성 현지 토양 개량 농법';
    decisionDesc = '과염소산염 온수 세척 · 점토/미생물 혼합 · 감자/고구마 재배';
  } else {
    decisionMode = 'earth_hydro';
    decisionTitle = '지구 토양 + 화성 지하수 하이브리드';
    decisionDesc = '경량 압축 배지 운반 · 화성 정제수 순환 · 수경 재배';
  }

  const greenhouseAreaM2 = crewCount * 38;
  const dailyWaterL =
    decisionMode === 'earth_hydro'
      ? Math.round(greenhouseAreaM2 * 1.45)
      : decisionMode === 'direct'
        ? Math.round(greenhouseAreaM2 * 3.1)
        : 0;
  const totalWaterL = dailyWaterL * missionDays;
  const earthSoilKg =
    decisionMode === 'earth_hydro'
      ? Math.round(greenhouseAreaM2 * 12)
      : decisionMode === 'direct'
        ? Math.round(greenhouseAreaM2 * 2.5)
        : 0;
  const dailyHarvestKg =
    decisionMode === 'abort'
      ? 0
      : Number((greenhouseAreaM2 * 0.048 * (waterProb / 80)).toFixed(1));

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-5 text-xs">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <span className="font-mono text-[10px] text-emerald-400 tracking-wider uppercase">
            HYDRO-AGRI PROTOCOL
          </span>
          <h1 className="text-xl font-bold text-white tracking-tight mt-0.5">
            화성 정착지 농업 적합성 & 지하수 수지
          </h1>
        </div>

        {selectedCell && (
          <button
            type="button"
            onClick={syncFromMap}
            className="px-3.5 py-1.5 text-xs bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 rounded-lg hover:bg-cyan-500/25 transition-colors whitespace-nowrap"
          >
            선택 좌표 동기화 ({regionNameKo})
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Sliders */}
        <div className="lg:col-span-5 bg-[#070c16] border border-white/15 rounded-xl p-4 space-y-4">
          <h2 className="text-xs font-bold text-white">환경 변수</h2>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-300">지하수 확률</span>
                <span className="font-mono text-cyan-300 font-bold">{waterProb}%</span>
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
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-300">토양 비옥도 / 점토</span>
                <span className="font-mono text-emerald-300 font-bold">{soilFertility}/100</span>
              </div>
              <input
                type="range"
                min={5}
                max={95}
                value={soilFertility}
                onChange={(e) => setSoilFertility(Number(e.target.value))}
                className="w-full accent-emerald-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-300">경사도</span>
                <span className="font-mono text-amber-300 font-bold">{slopeDeg.toFixed(1)}°</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={25}
                value={slopeDeg}
                onChange={(e) => setSlopeDeg(Number(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
              <div>
                <span className="text-[10px] text-slate-400 block mb-1">대원수</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={crewCount}
                  onChange={(e) => setCrewCount(Math.max(1, Number(e.target.value)))}
                  className="w-full bg-[#030508] border border-white/20 rounded px-2.5 py-1 text-xs font-mono text-white"
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block mb-1">임무일수</span>
                <input
                  type="number"
                  min={30}
                  max={900}
                  step={30}
                  value={missionDays}
                  onChange={(e) => setMissionDays(Math.max(30, Number(e.target.value)))}
                  className="w-full bg-[#030508] border border-white/20 rounded px-2.5 py-1 text-xs font-mono text-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Output */}
        <div className="lg:col-span-7 space-y-4">
          <div
            className={`border rounded-xl p-4 ${
              decisionMode === 'direct'
                ? 'bg-emerald-950/20 border-emerald-500/40'
                : decisionMode === 'earth_hydro'
                  ? 'bg-cyan-950/20 border-cyan-500/40'
                  : 'bg-rose-950/20 border-rose-500/40'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {decisionMode === 'direct' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : decisionMode === 'earth_hydro' ? (
                <Droplets className="w-4 h-4 text-cyan-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <div>
                <div className="text-[10px] font-mono text-slate-400">최적 농법 판정</div>
                <h3 className="text-base font-bold text-white">{decisionTitle}</h3>
                <p className="text-[11px] text-slate-300 mt-1">{decisionDesc}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-[#070c16] border border-white/15 rounded-xl p-3">
              <div className="text-[10px] text-slate-400">온실 면적</div>
              <div className="text-xl font-mono font-bold text-white mt-0.5">
                {decisionMode === 'abort' ? 0 : greenhouseAreaM2}
                <span className="text-[10px] font-normal text-slate-400 ml-0.5">m²</span>
              </div>
            </div>

            <div className="bg-[#070c16] border border-white/15 rounded-xl p-3">
              <div className="text-[10px] text-slate-400">지구 배지 수송</div>
              <div className="text-xl font-mono font-bold text-amber-300 mt-0.5">
                {earthSoilKg.toLocaleString()}
                <span className="text-[10px] font-normal text-slate-400 ml-0.5">kg</span>
              </div>
            </div>

            <div className="bg-[#070c16] border border-white/15 rounded-xl p-3">
              <div className="text-[10px] text-slate-400">일일 정제수</div>
              <div className="text-xl font-mono font-bold text-cyan-300 mt-0.5">
                {dailyWaterL}
                <span className="text-[10px] font-normal text-slate-400 ml-0.5">L/일</span>
              </div>
            </div>

            <div className="bg-[#070c16] border border-white/15 rounded-xl p-3">
              <div className="text-[10px] text-slate-400">일일 수확량</div>
              <div className="text-xl font-mono font-bold text-emerald-300 mt-0.5">
                {dailyHarvestKg}
                <span className="text-[10px] font-normal text-slate-400 ml-0.5">kg/일</span>
              </div>
            </div>
          </div>

          <div className="bg-[#070c16] border border-white/15 rounded-xl p-4 space-y-2">
            <h4 className="text-xs font-bold text-white">
              현장 검증 3단계 요약 ({missionDays}일 · 총 {totalWaterL.toLocaleString()} L)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] text-slate-300">
              <div className="bg-black/40 border border-white/10 rounded-lg p-2.5">
                <span className="text-cyan-300 font-bold block mb-1">1단계 · 시추 & 정수</span>
                <span className="text-slate-400">2~5m 드릴링 · 역삼투압 염분 제거</span>
              </div>
              <div className="bg-black/40 border border-white/10 rounded-lg p-2.5">
                <span className="text-emerald-300 font-bold block mb-1">2단계 · 배지 분기</span>
                <span className="text-slate-400">압축 배지 공급 · 순환 관수 시스템</span>
              </div>
              <div className="bg-black/40 border border-white/10 rounded-lg p-2.5">
                <span className="text-amber-300 font-bold block mb-1">3단계 · 로봇 관리</span>
                <span className="text-slate-400">무인 샘플링 · AR 안전 경로 복귀</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
