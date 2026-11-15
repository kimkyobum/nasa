import React, { useState } from 'react';
import { Database, Layers, Navigation, Sprout, ArrowUpRight } from 'lucide-react';
import { NASA_DATASETS } from '../data/marsData';
import { useLanguage } from '../i18n/LanguageContext';
import { NasaDatasetSpec } from '../types/mars';

type CategoryFilter = 'all' | NasaDatasetSpec['category'];

export const NasaDatasetsView: React.FC = () => {
  const { pick } = useLanguage();
  const [filter, setFilter] = useState<CategoryFilter>('all');

  const filtered =
    filter === 'all'
      ? NASA_DATASETS
      : NASA_DATASETS.filter((d) => d.category === filter);

  const categoryLabel = (cat: NasaDatasetSpec['category']) => {
    switch (cat) {
      case 'water':
        return pick('Subsurface Water · Ice', '지하수 · 얼음 탐지');
      case 'terrain':
        return pick('Terrain · Navigation', '지형 · 네비게이션');
      case 'soil':
        return pick('Soil · Agriculture', '토양 · 농업 판별');
      case 'ar_nav':
        return pick('Ground Stability · AR Safety', '지반 강도 · AR 안전');
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      {/* Header & Architecture Overview */}
      <div className="border-b border-slate-800 pb-6">
        <p className="text-xs font-mono text-cyan-400 uppercase tracking-wider mb-2">
          NASA Space Apps Challenge · Data & Pipeline Architecture
        </p>
        <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
          {pick(
            'NASA Datasets Powering Martian Groundwater Mapping & Safe Rover Navigation',
            '화성 지하수 지도 및 안전 경로 네비게이션 구축에 필요한 NASA 실제 데이터셋'
          )}
        </h1>
        <p className="mt-2 text-sm text-slate-300 max-w-3xl leading-relaxed">
          {pick(
            'To drive the interactive Mars map and astronaut AR visor navigation, these six public NASA and USGS observation datasets are co-registered onto a unified Areocentric Lat/Lon grid.',
            '웹사이트 지도와 우주복 AR 바이저 네비게이션을 실제로 구동하려면 아래 6가지 NASA·USGS 공개 관측 데이터를 좌표계(Areocentric Lat/Lon) 기준으로 정합(Overlay)해야 합니다.'
          )}
        </p>

        {/* 3-Layer Pipeline Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-cyan-400 text-sm font-semibold mb-1.5">
              <Layers className="w-4 h-4" />
              <span>{pick('01. Base Map & Coordinate Tiles', '01. 배경 지도 & 좌표 타일')}</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {pick(
                <>
                  Connects <strong className="text-white">NASA Mars Trek WMTS API</strong> and{' '}
                  <strong className="text-white">CTX/HiRISE</strong> satellite imagery as the base layers for the interactive Canvas map.
                </>,
                <>
                  <strong className="text-white">NASA Mars Trek WMTS API</strong>와{' '}
                  <strong className="text-white">CTX/HiRISE</strong> 위성 이미지를 웹 지도(Leaflet / Mapbox /
                  Canvas)의 기본 레이어로 연결합니다.
                </>
              )}
            </p>
          </div>

          <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold mb-1.5">
              <Sprout className="w-4 h-4" />
              <span>{pick('02. Water Probability & Farming Verdict', '02. 지하수 확률 & 농사 판별')}</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {pick(
                <>
                  Computes water probability from <strong className="text-white">SWIM (radar ice)</strong> +{' '}
                  <strong className="text-white">GRS (gamma hydrogen)</strong>, then branches between local soil remediation vs. Earth-media hydroponics using <strong className="text-white">CRISM</strong> mineral spectra.
                </>,
                <>
                  <strong className="text-white">SWIM(레이더 얼음)</strong> +{' '}
                  <strong className="text-white">GRS(감마선 수소)</strong>로 물 확률을 계산하고,{' '}
                  <strong className="text-white">CRISM</strong> 광물 데이터로 현지 농사 vs 지구 흙 수경재배를 분기합니다.
                </>
              )}
            </p>
          </div>

          <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-amber-400 text-sm font-semibold mb-1.5">
              <Navigation className="w-4 h-4" />
              <span>{pick('03. Safe Pathfinding Cost Grid', '03. 안전 길찾기 비용 지도')}</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {pick(
                <>
                  Extracts slope angles (°) from <strong className="text-white">MOLA DEM (laser altimetry)</strong>, avoids dust traps via <strong className="text-white">THEMIS thermal inertia</strong>, and solves optimal routes with A* pathfinding.
                </>,
                <>
                  <strong className="text-white">MOLA DEM(방사 레이저 고도)</strong>에서 경사각(°)을 뽑고,{' '}
                  <strong className="text-white">THEMIS 열관성</strong>으로 모래 늪을 피해 A*(A-Star) 알고리즘으로
                  최적 경로를 계산합니다.
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0B0E17] border border-slate-800 rounded-lg">
          {(
            [
              { id: 'all', label: pick('All Datasets (6)', '전체 데이터 (6)') },
              { id: 'water', label: pick('Water · Ice', '지하수 · 얼음') },
              { id: 'terrain', label: pick('Altimetry · Hazards', '레이저 고도 · 장애물') },
              { id: 'soil', label: pick('Soil · Minerals', '토양 · 농업 성분') },
              { id: 'ar_nav', label: pick('Thermal · Surface Safety', '열관성 · 지반 안전') },
            ] as { id: CategoryFilter; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                filter === tab.id
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="text-xs font-mono text-slate-400">
          {pick(
            'Coordinate Standard: IAU Mars 2000 / Planetocentric Lat-Lon',
            '좌표계 표준: IAU Mars 2000 / Planetocentric Lat-Lon'
          )}
        </div>
      </div>

      {/* Dataset Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((ds) => (
          <article
            key={ds.id}
            className="bg-[#0B0E17] border border-slate-800 rounded-lg p-5 flex flex-col justify-between gap-4"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                <div className="flex items-center gap-2 font-mono">
                  <Database className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-cyan-300">{categoryLabel(ds.category)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{ds.mission}</span>
                </div>
                <span className="font-mono text-slate-500">{ds.dataFormat}</span>
              </div>

              <div>
                <h2 className="text-base font-semibold text-white">
                  {pick(ds.titleEn, ds.titleKo)}
                </h2>
                <p className="text-xs font-mono text-slate-400 mt-1">
                  {pick('Instrument', '센서/장비')}: {ds.instrument} · {pick('Resolution', '해상도')}:{' '}
                  {pick(ds.resolutionEn, ds.resolution)}
                </p>
              </div>

              <div className="space-y-2 pt-1 text-xs leading-relaxed">
                <p className="text-slate-200">
                  <span className="text-slate-400 font-medium">
                    {pick('Purpose: ', '왜 필요한가: ')}
                  </span>
                  {pick(ds.purposeEn, ds.purposeKo)}
                </p>
                <p className="text-slate-400">
                  <span className="text-slate-300 font-medium">
                    {pick('How It Works: ', '작동 원리: ')}
                  </span>
                  {pick(ds.howItWorksEn, ds.howItWorksKo)}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-400">{ds.portalName}</span>
              <a
                href={ds.portalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-medium whitespace-nowrap"
              >
                {pick('Official Portal', '공식 포털 확인')}
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </article>
        ))}
      </div>

      {/* Navigation Cost Formula Guide */}
      <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white">
          {pick(
            'Weighted A* Pathfinding Cost Function',
            '네비게이션 길찾기 알고리즘(A* Pathfinding)에 들어가는 실제 가중치 공식'
          )}
        </h3>
        <p className="text-xs text-slate-300 leading-relaxed">
          {pick(
            'When START and TARGET coordinates are placed on the map, the terrain grid evaluates traversal cost for every cell using the fused NASA sensor model:',
            '사용자가 웹 지도에서 출발지와 목적지 좌표를 찍으면, 백엔드 또는 브라우저에서 지도를 격자(Grid)로 나눈 뒤 각 칸의 이동 비용(Cost)을 아래 NASA 데이터 조합으로 계산합니다:'
          )}
        </p>
        <div className="bg-[#07090E] border border-slate-800 rounded p-3 font-mono text-xs text-cyan-300 overflow-x-auto">
          {pick(
            'MoveCost(cell) = Dist(km) × [ 1 + w₁·Slope(MOLA) + w₂·DustTrap(THEMIS) + w₃·RockHazard(CTX) - w₄·WaterBonus(SWIM) ]',
            'MoveCost(cell) = 거리(km) × [ 1 + w₁·Slope(MOLA) + w₂·DustTrap(THEMIS) + w₃·RockHazard(CTX) - w₄·WaterBonus(SWIM) ]'
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-400 pt-1">
          <div>
            <span className="text-slate-200 font-medium">
              {pick('1. Hard Slope Constraint: ', '1. 경사도 제한(Hard Constraint): ')}
            </span>
            {pick(
              'Cliffs and crater walls steeper than 18°–20° (MOLA/HiRISE) are treated as impassable obstacles.',
              'MOLA/HiRISE 기준 경사 18°~20° 이상 절벽·분화구 벽면은 통행 불가(Obstacle) 처리.'
            )}
          </div>
          <div>
            <span className="text-slate-200 font-medium">
              {pick('2. Dust-Trap Avoidance (THEMIS): ', '2. 모래 늪 회피(THEMIS): ')}
            </span>
            {pick(
              'Low-thermal-inertia thick dust blankets incur a 2× traversal penalty to prevent rover wheel entrapment.',
              '열관성이 극도로 낮은 두꺼운 먼지 지대는 로버 바퀴 빠짐 방지를 위해 비용 가중치 2배 부여.'
            )}
          </div>
          <div>
            <span className="text-slate-200 font-medium">
              {pick('3. AR Visor Projection (SUITS): ', '3. AR 바이저 출력(SUITS 연동): ')}
            </span>
            {pick(
              'Projects heading (°), distance (m/km), and steep-slope warnings directly into the helmet HUD.',
              '산출된 경로의 다음 웨이포인트 방위각(°), 거리(m), 경사 경고를 우주복 HUD 시야에 투영.'
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
