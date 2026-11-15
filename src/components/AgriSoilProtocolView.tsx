import React, { useState } from 'react';
import { Droplets, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { MarsTelemetryPoint } from '../types/mars';

interface AgriSoilProtocolViewProps {
  selectedCell: MarsTelemetryPoint | null;
  regionNameKo: string;
  regionNameEn?: string;
}

export const AgriSoilProtocolView: React.FC<AgriSoilProtocolViewProps> = ({
  selectedCell,
  regionNameKo,
  regionNameEn,
}) => {
  const { pick } = useLanguage();
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
    decisionTitle = pick(
      'Non-Arable (Exploration Recommended)',
      '정착·농업 부적합 (탐사/이동 권장)'
    );
    decisionDesc = !isTerrainSafe
      ? pick('Steep slope (≥10°) · Unstable terrain', '급경사(10° 이상) · 지형 불안정')
      : pick('Water probability <45% · Excessive extraction energy', '지하수 확률 45% 미만 · 에너지 과다');
  } else if (isMarsSoilViable) {
    decisionMode = 'direct';
    decisionTitle = pick(
      'Local Regolith Remediation Farming',
      '화성 현지 토양 개량 농법'
    );
    decisionDesc = pick(
      'Warm-water perchlorate wash · Clay/microbe blend · Potato/sweet potato',
      '과염소산염 온수 세척 · 점토/미생물 혼합 · 감자/고구마 재배'
    );
  } else {
    decisionMode = 'earth_hydro';
    decisionTitle = pick(
      'Earth-Media + Martian Water Hybrid',
      '지구 토양 + 화성 지하수 하이브리드'
    );
    decisionDesc = pick(
      'Compressed Earth-media cargo · Closed-loop Martian water · Hydroponics',
      '경량 압축 배지 운반 · 화성 정제수 순환 · 수경 재배'
    );
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
    <div className="space-y-4 text-xs min-w-0">
      {/* Header + Sync Action */}
      <div className="border-b border-white/10 pb-3 space-y-2.5">
        <div>
          <span className="font-mono text-[10px] text-emerald-400 tracking-wider uppercase block">
            HYDRO-AGRI PROTOCOL
          </span>
          <h1 className="text-base font-bold text-white tracking-tight mt-0.5 leading-snug">
            {pick(
              'Martian Settlement Farming & Water Balance',
              '화성 정착지 농업 적합성 & 지하수 수지'
            )}
          </h1>
        </div>

        {selectedCell && (
          <button
            type="button"
            onClick={syncFromMap}
            className="w-full px-3 py-2 text-xs font-medium bg-cyan-500/15 text-cyan-200 border border-cyan-500/40 rounded-lg hover:bg-cyan-500/25 transition-colors flex items-center justify-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {pick('Sync Selected Site', '선택 좌표 동기화')} (
              {pick(regionNameEn ?? regionNameKo, regionNameKo)})
            </span>
          </button>
        )}
      </div>

      {/* Optimal Farming Protocol Verdict */}
      <div
        className={`border rounded-xl p-3.5 ${
          decisionMode === 'direct'
            ? 'bg-emerald-950/25 border-emerald-500/40'
            : decisionMode === 'earth_hydro'
              ? 'bg-cyan-950/25 border-cyan-500/40'
              : 'bg-rose-950/25 border-rose-500/40'
        }`}
      >
        <div className="flex items-start gap-2.5">
          {decisionMode === 'direct' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : decisionMode === 'earth_hydro' ? (
            <Droplets className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              {pick('Optimal Farming Protocol', '최적 농법 판정')}
            </div>
            <h3 className="text-sm font-bold text-white mt-0.5 leading-snug">
              {decisionTitle}
            </h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">{decisionDesc}</p>
          </div>
        </div>
      </div>

      {/* 2x2 KPI Summary (Comfortable width in side drawer) */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-[#070c16] border border-white/15 rounded-xl p-3 min-w-0">
          <div className="text-[11px] text-slate-400 truncate">
            {pick('Dome Area', '온실 면적')}
          </div>
          <div className="text-lg font-mono tabular-nums font-bold text-white mt-0.5">
            {decisionMode === 'abort' ? 0 : greenhouseAreaM2}
            <span className="text-xs font-normal text-slate-400 ml-1">m²</span>
          </div>
        </div>

        <div className="bg-[#070c16] border border-white/15 rounded-xl p-3 min-w-0">
          <div className="text-[11px] text-slate-400 truncate">
            {pick('Earth Media Cargo', '지구 배지 수송')}
          </div>
          <div className="text-lg font-mono tabular-nums font-bold text-amber-300 mt-0.5">
            {earthSoilKg.toLocaleString()}
            <span className="text-xs font-normal text-slate-400 ml-1">kg</span>
          </div>
        </div>

        <div className="bg-[#070c16] border border-white/15 rounded-xl p-3 min-w-0">
          <div className="text-[11px] text-slate-400 truncate">
            {pick('Purified Water', '일일 정제수')}
          </div>
          <div className="text-lg font-mono tabular-nums font-bold text-cyan-300 mt-0.5">
            {dailyWaterL}
            <span className="text-xs font-normal text-slate-400 ml-1">
              {pick('L/day', 'L/일')}
            </span>
          </div>
        </div>

        <div className="bg-[#070c16] border border-white/15 rounded-xl p-3 min-w-0">
          <div className="text-[11px] text-slate-400 truncate">
            {pick('Daily Harvest', '일일 수확량')}
          </div>
          <div className="text-lg font-mono tabular-nums font-bold text-emerald-300 mt-0.5">
            {dailyHarvestKg}
            <span className="text-xs font-normal text-slate-400 ml-1">
              {pick('kg/day', 'kg/일')}
            </span>
          </div>
        </div>
      </div>

      {/* Environment Sliders & Crew Size */}
      <div className="bg-[#070c16] border border-white/15 rounded-xl p-3.5 space-y-3.5">
        <h2 className="text-xs font-bold text-white">
          {pick('Environment Simulator', '환경 변수 시뮬레이터')}
        </h2>

        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-300">
                {pick('Water Probability', '지하수 확률')}
              </span>
              <span className="font-mono tabular-nums text-cyan-300 font-bold">
                {waterProb}%
              </span>
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
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-300">
                {pick('Soil Fertility / Clay', '토양 비옥도 / 점토')}
              </span>
              <span className="font-mono tabular-nums text-emerald-300 font-bold">
                {soilFertility}/100
              </span>
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
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-300">
                {pick('Terrain Slope', '경사도')}
              </span>
              <span className="font-mono tabular-nums text-amber-300 font-bold">
                {slopeDeg.toFixed(1)}°
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={25}
              step={0.1}
              value={slopeDeg}
              onChange={(e) => setSlopeDeg(Number(e.target.value))}
              className="w-full accent-amber-400 cursor-pointer"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-white/10">
            <label className="block min-w-0">
              <span className="text-[11px] text-slate-400 block mb-1">
                {pick('Crew Size', '대원수 (명)')}
              </span>
              <input
                type="number"
                min={1}
                max={20}
                value={crewCount}
                onChange={(e) => setCrewCount(Math.max(1, Number(e.target.value)))}
                className="w-full bg-[#030508] border border-white/20 rounded-lg px-3 py-1.5 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-cyan-400"
              />
            </label>
            <label className="block min-w-0">
              <span className="text-[11px] text-slate-400 block mb-1">
                {pick('Mission Days', '임무일수 (일)')}
              </span>
              <input
                type="number"
                min={30}
                max={900}
                step={30}
                value={missionDays}
                onChange={(e) => setMissionDays(Math.max(30, Number(e.target.value)))}
                className="w-full bg-[#030508] border border-white/20 rounded-lg px-3 py-1.5 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-cyan-400"
              />
            </label>
          </div>
        </div>
      </div>

      {/* 3-Stage Field Protocol (Full-width stacked cards — zero narrow text wrapping) */}
      <div className="bg-[#070c16] border border-white/15 rounded-xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h4 className="text-xs font-bold text-white">
            {pick('3-Stage Field Protocol', '현장 검증 3단계 요약')}
          </h4>
          <span className="text-[11px] font-mono tabular-nums text-slate-400">
            {missionDays}
            {pick('d', '일')} · {totalWaterL.toLocaleString()} L
          </span>
        </div>

        <div className="space-y-2 text-xs">
          <div className="bg-black/40 border border-white/10 rounded-lg px-3 py-2.5">
            <span className="text-cyan-300 font-bold block mb-0.5">
              {pick('Stage 1 · Drilling & RO', '1단계 · 시추 & 정수')}
            </span>
            <span className="text-slate-300 leading-relaxed">
              {pick(
                '2–5m drilling · Reverse osmosis desalination',
                '2~5m 드릴링 · 역삼투압 염분·과염소산염 제거'
              )}
            </span>
          </div>

          <div className="bg-black/40 border border-white/10 rounded-lg px-3 py-2.5">
            <span className="text-emerald-300 font-bold block mb-0.5">
              {pick('Stage 2 · Substrate Loop', '2단계 · 배지 분기')}
            </span>
            <span className="text-slate-300 leading-relaxed">
              {pick(
                'Compressed media supply · Closed-loop irrigation',
                '압축 배지 공급 · 밀폐 순환 관수 시스템 가동'
              )}
            </span>
          </div>

          <div className="bg-black/40 border border-white/10 rounded-lg px-3 py-2.5">
            <span className="text-amber-300 font-bold block mb-0.5">
              {pick('Stage 3 · Robotic Ops', '3단계 · 로봇 관리')}
            </span>
            <span className="text-slate-300 leading-relaxed">
              {pick(
                'Autonomous sampling · Safe AR return route',
                '무인 샘플링 · AR 안전 경로 기반 기지 복귀'
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
