import React from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Compass,
  HelpCircle,
  Layers,
  Navigation,
  Sparkles,
  X,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { ClickTool, SensorLayers } from '../types/mars';

export type GuidePhase = 'closed' | 'prompt' | 'active';
export type GuideStep = 1 | 2 | 3;

interface MissionOnboardingGuideProps {
  phase: GuidePhase;
  step: GuideStep;
  leftOffsetPx: number;
  rightOffsetPx: number;
  layers: SensorLayers;
  activeLayersCount: number;
  startSet: boolean;
  destSet: boolean;
  clickTool: ClickTool;
  domeInstalled: boolean;
  onStartGuide: () => void;
  onSkipGuide: () => void;
  onGoToStep: (step: GuideStep) => void;
  onFinishGuide: () => void;
  onQuickEnableWaterSoil: () => void;
  onSelectPickTool: (tool: ClickTool) => void;
  onDeployDomeAtTarget: () => void;
}

export const MissionOnboardingGuide: React.FC<MissionOnboardingGuideProps> = ({
  phase,
  step,
  leftOffsetPx,
  rightOffsetPx,
  activeLayersCount,
  startSet,
  destSet,
  clickTool,
  domeInstalled,
  onStartGuide,
  onSkipGuide,
  onGoToStep,
  onFinishGuide,
  onQuickEnableWaterSoil,
  onSelectPickTool,
  onDeployDomeAtTarget,
}) => {
  const { language, setLanguage, pick } = useLanguage();

  if (phase === 'closed') return null;

  // 1. INITIAL FIRST-TIME PROMPT MODAL
  if (phase === 'prompt') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
        <div className="w-full max-w-lg bg-[#090f1d] border border-white/20 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
          {/* Header */}
          <div className="px-5 py-4 border-b border-white/15 bg-[#060a13] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-300 shrink-0">
                <Compass className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-orange-300 font-semibold">
                  MARS HYDRO · MISSION BRIEFING
                </div>
                <h2 className="text-sm font-bold text-white truncate">
                  {pick(
                    'Would you like a quick interactive guide?',
                    '처음 오셨나요? 단계별 미션 가이드를 들으시겠어요?'
                  )}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-1 bg-black/40 border border-white/15 rounded-lg p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-2 py-1 text-[10px] font-mono font-bold rounded ${
                  language === 'en'
                    ? 'bg-sky-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLanguage('ko')}
                className={`px-2 py-1 text-[10px] font-bold rounded ${
                  language === 'ko'
                    ? 'bg-sky-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                한국어
              </button>
            </div>
          </div>

          {/* 3-Step Mission Overview */}
          <div className="p-5 space-y-4">
            <p className="text-xs text-slate-300 leading-relaxed">
              {pick(
                'Follow 3 simple steps to scan Martian water & soil layers, plot a rover route from start to target, and deploy an interactive 3D Bio-Dome colony.',
                '화성의 지하수·토양을 탐색하고 수송로를 개척해 나만의 3D 바이오 돔을 설치하는 3단계 과정을 바로 안내해 드립니다.'
              )}
            </p>

            <div className="space-y-2">
              <div className="flex items-start gap-3 p-2.5 rounded-xl bg-white/[0.04] border border-white/10">
                <div className="w-6 h-6 rounded-md bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
                  <Layers className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">
                    {pick(
                      'Step 1 · Toggle Scientific Sensor Layers',
                      '1단계 · 과학 센서 레이어 켜기'
                    )}
                  </div>
                  <div className="text-[11px] text-slate-300 mt-0.5">
                    {pick(
                      'Open Layers and turn on subsurface water, agricultural soil, elevation, or slope maps.',
                      '레이어 창에서 원하는 지하수·농업 토양·고도·지열 센서를 선택해 화성 지도를 분석합니다.'
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-xl bg-white/[0.04] border border-white/10">
                <div className="w-6 h-6 rounded-md bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 flex items-center justify-center shrink-0 mt-0.5">
                  <Navigation className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">
                    {pick(
                      'Step 2 · Plot Route (START ➔ TARGET)',
                      '2단계 · 수송로에서 출발지 → 목적지 설정'
                    )}
                  </div>
                  <div className="text-[11px] text-slate-300 mt-0.5">
                    {pick(
                      'Enter Route mode and click the map to choose your START origin and TARGET destination.',
                      '수송로 창으로 들어가 지도에서 출발지(START)와 목적지(TARGET)를 직접 찍어 경로를 탐색합니다.'
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-xl bg-white/[0.04] border border-white/10">
                <div className="w-6 h-6 rounded-md bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">
                    {pick(
                      'Step 3 · Deploy 3D Bio-Dome at Target',
                      '3단계 · 목적지에 바이오 돔 설치 및 시뮬레이션'
                    )}
                  </div>
                  <div className="text-[11px] text-slate-300 mt-0.5">
                    {pick(
                      'Install a 3D Bio-Dome at your destination to simulate water drilling, oxygen, crops, and daily life.',
                      '목적지에 3D 바이오 돔을 세우고 지하수 추출, 산소 생산, 작물, 실제 거주 시뮬레이션을 확인합니다.'
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={onSkipGuide}
                className="px-4 py-2 rounded-xl border border-white/20 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.07] transition-colors"
              >
                {pick('Skip · Explore on My Own', '괜찮아요 · 바로 둘러보기')}
              </button>
              <button
                type="button"
                onClick={onStartGuide}
                className="px-5 py-2 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-lg transition-colors"
              >
                <span>{pick('Start Guided Tour', '가이드 시작하기')}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. FLOATING NON-BLOCKING STEP-BY-STEP COACH CARD
  const stepColor =
    step === 1
      ? 'border-amber-400/60'
      : step === 2
        ? 'border-cyan-400/60'
        : 'border-emerald-400/60';

  return (
    <div
      style={{
        left: `${leftOffsetPx}px`,
        maxWidth: `min(410px, calc(100vw - ${leftOffsetPx + rightOffsetPx + 24}px))`,
      }}
      className={`fixed bottom-4 z-30 w-full bg-[#090f1d]/95 border ${stepColor} rounded-2xl shadow-2xl p-3.5 text-slate-100 pointer-events-auto transition-[left] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]`}
    >
      {/* Top Progress Header */}
      <div className="flex items-center justify-between gap-2 pb-2 mb-2.5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-3.5 h-3.5 text-sky-300 shrink-0" />
          <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-sky-300">
            {pick(`Mission Guide · Step ${step} / 3`, `미션 가이드 · ${step} / 3단계`)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {[1, 2, 3].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onGoToStep(s as GuideStep)}
              className={`h-1.5 rounded-full transition-all ${
                step === s
                  ? 'w-6 bg-sky-400'
                  : s < step
                    ? 'w-3 bg-emerald-400'
                    : 'w-3 bg-white/20'
              }`}
              aria-label={`Step ${s}`}
            />
          ))}
          <button
            type="button"
            onClick={onSkipGuide}
            title={pick('Close guide', '가이드 닫기')}
            className="ml-1 p-1 text-slate-400 hover:text-white rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* STEP 1: SCIENTIFIC SENSOR LAYERS */}
      {step === 1 && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-300 shrink-0" />
            <h3 className="text-xs font-bold text-white">
              {pick(
                'Turn On Desired Scientific Sensor Layers',
                '원하는 과학 센서 레이어를 켜보세요'
              )}
            </h3>
          </div>
          <p className="text-[11px] text-slate-200 leading-relaxed">
            {pick(
              'Check any layers in the Layers panel on the left (like Subsurface Water or Agricultural Soil) to highlight prime Mars settlement zones on the map.',
              '왼쪽 레이어 패널에서 [지하수 · 얼음 확률], [농업 적합 토양], [지형 고도] 등 원하는 과학 센서를 체크해 화성 지도를 살펴보세요.'
            )}
          </p>

          <div className="flex items-center justify-between gap-2 bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px]">
            <span className="flex items-center gap-1.5">
              {activeLayersCount > 0 ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span className={activeLayersCount > 0 ? 'text-emerald-200 font-semibold' : 'text-slate-300'}>
                {activeLayersCount > 0
                  ? pick(
                      `${activeLayersCount} sensor layer(s) active`,
                      `${activeLayersCount}개 센서 레이어 활성화됨`
                    )
                  : pick('Waiting for a layer toggle...', '레이어를 1개 이상 켜보세요')}
              </span>
            </span>

            {activeLayersCount === 0 && (
              <button
                type="button"
                onClick={onQuickEnableWaterSoil}
                className="text-[10px] font-semibold text-amber-300 hover:text-amber-200 underline underline-offset-2"
              >
                {pick('Auto-select Water + Soil', '추천 센서 바로 켜기')}
              </button>
            )}
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => onGoToStep(2)}
              className="px-3.5 py-1.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <span>{pick('Next: Plot Route', '다음: 수송로 설정')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: ROUTE START -> TARGET */}
      {step === 2 && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-cyan-300 shrink-0" />
            <h3 className="text-xs font-bold text-white">
              {pick(
                'Set Route from START to TARGET on Map',
                '수송로에서 출발지 → 목적지를 설정하세요'
              )}
            </h3>
          </div>
          <p className="text-[11px] text-slate-200 leading-relaxed">
            {pick(
              'Click two points directly on the Mars map: first your START origin, then your TARGET destination. Rover pathfinding avoids steep cliffs automatically.',
              '지도 위에서 원하는 [출발지(START)]를 먼저 클릭하고, 이어서 정착할 [목적지(TARGET)]를 클릭하면 안전 수송로가 계산됩니다.'
            )}
          </p>

          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => onSelectPickTool('start')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-left transition-colors ${
                startSet
                  ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-200'
                  : clickTool === 'start'
                    ? 'bg-sky-500/20 border-sky-300 text-white font-semibold'
                    : 'bg-white/[0.05] border-white/15 text-slate-300 hover:text-white'
              }`}
            >
              {startSet ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-sky-300 shrink-0" />
              )}
              <span className="truncate">
                {startSet
                  ? pick('START Ready', '출발지 완료')
                  : pick('1. Pick START', '1. 출발지 클릭')}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onSelectPickTool('destination')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-left transition-colors ${
                destSet
                  ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-200'
                  : clickTool === 'destination'
                    ? 'bg-sky-500/20 border-sky-300 text-white font-semibold'
                    : 'bg-white/[0.05] border-white/15 text-slate-300 hover:text-white'
              }`}
            >
              {destSet ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-sky-300 shrink-0" />
              )}
              <span className="truncate">
                {destSet
                  ? pick('TARGET Ready', '목적지 완료')
                  : pick('2. Pick TARGET', '2. 목적지 클릭')}
              </span>
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => onGoToStep(1)}
              className="px-2.5 py-1.5 text-[11px] text-slate-300 hover:text-white"
            >
              {pick('← Back', '← 이전')}
            </button>
            <button
              type="button"
              onClick={() => onGoToStep(3)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                startSet && destSet
                  ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950 shadow-lg'
                  : 'bg-white/15 hover:bg-white/25 text-white'
              }`}
            >
              <span>{pick('Next: Deploy Bio-Dome', '다음: 바이오 돔 설치')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: BIO-DOME AT DESTINATION */}
      {step === 3 && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
            <h3 className="text-xs font-bold text-white">
              {domeInstalled
                ? pick(
                    'Bio-Dome Deployed! Explore Your Colony',
                    '바이오 돔 설치 완료! 거주 시뮬레이션을 확인하세요'
                  )
                : pick(
                    'Install 3D Bio-Dome at Your Destination',
                    '목적지에 3D 바이오 돔을 설치해보세요'
                  )}
            </h3>
          </div>
          <p className="text-[11px] text-slate-200 leading-relaxed">
            {domeInstalled
              ? pick(
                  'Use the right Bio-Dome panel to rotate the 3D dome, inspect subsurface water extraction & O₂ generation, customize 100 crops, and compare living Here vs. There!',
                  '오른쪽 창에서 3D 돔을 돌려보고, 지하수 추출량·산소 생산 방식·작물·실제 화성 거주 및 지역 비교 시뮬레이션을 마음껏 체험해보세요.'
                )
              : destSet
                ? pick(
                    'Your TARGET is locked in! Click below (or click "Dome at Target" in the Route panel) to build your 3D Bio-Dome right on the destination.',
                    '목적지(TARGET)가 설정되었습니다! 아래 버튼을 누르거나 수송로의 [목적지에 돔 설치]를 눌러 바이오 돔을 바로 세워보세요.'
                  )
                : pick(
                    'Click anywhere on the Mars map in Bio-Dome mode—or set a TARGET first—to install your 3D Bio-Dome.',
                    '지도에서 원하는 곳을 직접 클릭하거나 [목적지]를 먼저 지정해 3D 바이오 돔을 설치해보세요.'
                  )}
          </p>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => onGoToStep(2)}
              className="px-2.5 py-1.5 text-[11px] text-slate-300 hover:text-white"
            >
              {pick('← Back', '← 이전')}
            </button>

            {domeInstalled ? (
              <button
                type="button"
                onClick={onFinishGuide}
                className="px-4 py-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-lg"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{pick('Finish Guide', '가이드 완료')}</span>
              </button>
            ) : destSet ? (
              <button
                type="button"
                onClick={onDeployDomeAtTarget}
                className="px-4 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-lg"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{pick('Install Bio-Dome at Target', '목적지에 바이오 돔 설치')}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSelectPickTool('dome')}
                className="px-4 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-lg"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{pick('Click Map to Place Dome', '지도 찍어 돔 설치하기')}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
