import React, { useEffect, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { ClickTool } from '../types/mars';

export type GuidePhase = 'closed' | 'prompt' | 'active';
export type GuideStep = 1 | 2 | 3;

interface MissionOnboardingGuideProps {
  phase: GuidePhase;
  step: GuideStep;
  activeLayersCount: number;
  startSet: boolean;
  destSet: boolean;
  clickTool: ClickTool;
  domeInstalled: boolean;
  onStartGuide: () => void;
  onSkipGuide: () => void;
  onGoToStep: (step: GuideStep) => void;
  onFinishGuide: () => void;
}

interface SpotRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export const MissionOnboardingGuide: React.FC<MissionOnboardingGuideProps> = ({
  phase,
  step,
  activeLayersCount,
  startSet,
  destSet,
  clickTool,
  domeInstalled,
  onStartGuide,
  onSkipGuide,
  onGoToStep,
  onFinishGuide,
}) => {
  const { language, setLanguage, pick } = useLanguage();
  const [rect, setRect] = useState<SpotRect | null>(null);

  const targetKey =
    step === 1
      ? 'sensor-layers'
      : step === 2
        ? 'route-pickers'
        : domeInstalled
          ? 'dome-panel'
          : 'dome-at-target';

  useEffect(() => {
    if (phase !== 'active') {
      setRect(null);
      return;
    }

    const targetEl = document.querySelector(`[data-guide-target="${targetKey}"]`);
    if (targetEl && targetKey !== 'dome-panel') {
      targetEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    const measure = () => {
      const el = document.querySelector(`[data-guide-target="${targetKey}"]`);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) {
        setRect(null);
        return;
      }
      setRect({
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      });
    };

    measure();
    const t1 = window.setTimeout(measure, 120);
    const t2 = window.setTimeout(measure, 340);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [phase, targetKey, step, domeInstalled, startSet, destSet]);

  if (phase === 'closed') return null;

  // 1. SIMPLE DARK-DIMMED YES / NO GUIDE PROMPT
  if (phase === 'prompt') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
        <div className="w-full max-w-sm bg-[#090f1d] border border-white/25 rounded-2xl shadow-2xl p-6 text-slate-100 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-sky-300">
              {pick('Quick Guide', '사용 가이드')}
            </span>
            <div className="flex items-center gap-1 bg-black/40 border border-white/15 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded ${
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
                className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                  language === 'ko'
                    ? 'bg-sky-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                한국어
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-base font-bold text-white leading-snug">
              {pick('Would you like a quick guide?', '가이드를 시작하시겠습니까?')}
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              {pick(
                'We will point out sensor layers, route planning, and Bio-Dome deployment step by step.',
                '레이어 설정부터 수송로 지정, 목적지 바이오 돔 설치까지 화살표로 간단히 안내해 드립니다.'
              )}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={onSkipGuide}
              className="py-2.5 rounded-xl border border-white/20 bg-white/[0.04] hover:bg-white/[0.1] text-xs font-semibold text-slate-200 transition-colors"
            >
              {pick('No', 'No (건너뛰기)')}
            </button>
            <button
              type="button"
              onClick={onStartGuide}
              className="py-2.5 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 text-xs font-bold transition-colors shadow-lg"
            >
              {pick('Yes', 'Yes (안내 듣기)')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. SPOTLIGHT + SPEECH BUBBLE WITH DIRECTIONAL ARROW
  const isRightAnchored = step === 3 && domeInstalled;
  const pad = 6;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const bubbleW = 300;

  let bubbleLeft = 528;
  let bubbleTop = 210;

  if (rect) {
    if (isRightAnchored) {
      bubbleLeft = Math.max(84, rect.left - bubbleW - 20);
      bubbleTop = Math.min(Math.max(76, rect.top + 88), vh - 210);
    } else {
      bubbleLeft = Math.min(rect.left + rect.width + 20, vw - bubbleW - 20);
      bubbleTop = Math.min(Math.max(76, rect.top + 12), vh - 210);
    }
  }

  const arrowOffsetY = rect
    ? Math.min(Math.max(20, rect.top + Math.min(rect.height / 2, 70) - bubbleTop), 110)
    : 28;

  // Step copy (concise, natural, bilingual)
  let titleText = '';
  let bodyText = '';

  if (step === 1) {
    titleText = pick('1. Turn on Sensor Layers', '1. 과학 센서 레이어 켜기');
    bodyText =
      activeLayersCount > 0
        ? pick(
            `${activeLayersCount} layer(s) active! Check more or click Next to plan your route.`,
            `${activeLayersCount}개 레이어가 켜졌습니다. 더 선택하거나 [다음]을 눌러 수송로로 이동하세요.`
          )
        : pick(
            'Select any scientific sensor layers you want here (e.g. Subsurface Water or Soil).',
            '여기서 원하는 과학 센서 레이어(지하수·농업 토양 등)를 체크해 지도에서 확인해보세요.'
          );
  } else if (step === 2) {
    titleText = pick('2. Set START & TARGET', '2. 출발지 → 목적지 설정');
    if (!startSet) {
      bodyText =
        clickTool === 'start'
          ? pick(
              'Click anywhere on the Mars map to place your START point.',
              '지금 지도에서 원하는 출발지(START)를 클릭해 지정하세요.'
            )
          : pick(
              'Click START here, then click anywhere on the Mars map.',
              '여기 START 버튼을 누른 뒤 지도에서 출발지를 클릭하세요.'
            );
    } else if (!destSet) {
      bodyText =
        clickTool === 'destination'
          ? pick(
              'START is set! Now click anywhere on the map to set your TARGET destination.',
              '출발지가 지정되었습니다! 이제 지도에서 목적지(TARGET)를 클릭하세요.'
            )
          : pick(
              'Click TARGET here, then pick your destination on the map.',
              '여기 TARGET 버튼을 누른 뒤 지도에서 목적지를 클릭하세요.'
            );
    } else {
      bodyText = pick(
        'Route is plotted! Click Next to deploy a Bio-Dome at your destination.',
        '출발지부터 목적지까지 수송로가 연결되었습니다! [다음]을 눌러 바이오 돔을 설치하세요.'
      );
    }
  } else {
    if (domeInstalled) {
      titleText = pick('3. Explore Your Bio-Dome', '3. 바이오 돔 시뮬레이션 확인');
      bodyText = pick(
        'Inspect the 3D dome, subsurface water yield, oxygen production, crops, and Mars living comparison here.',
        '오른쪽 창에서 3D 돔 모델, 지하수 추출량, 산소 생성, 작물 및 실제 화성 거주 시뮬레이션을 확인하세요!'
      );
    } else if (destSet) {
      titleText = pick('3. Deploy Bio-Dome at Target', '3. 목적지에 바이오 돔 설치');
      bodyText = pick(
        'Click "Dome at Target" here to build a 3D Bio-Dome right on your destination.',
        '여기 [목적지에 돔 설치] 버튼을 눌러 목적지에 3D 바이오 돔을 설치하세요.'
      );
    } else {
      titleText = pick('3. Deploy Bio-Dome', '3. 바이오 돔 설치');
      bodyText =
        clickTool === 'dome'
          ? pick(
              'Click anywhere on the Mars map right now to deploy your 3D Bio-Dome.',
              '지금 지도 위 원하는 위치를 클릭해 바이오 돔을 세워보세요.'
            )
          : pick(
              'Click "Place on Map" here (or set a Target first), then click on the map to build your dome.',
              '[지도 찍어 돔 설치]를 누른 뒤 지도 위 원하는 위치를 클릭해 바이오 돔을 세워보세요.'
            );
    }
  }

  return (
    <>
      {/* Non-blocking spotlight dimmer around target */}
      {rect && (
        <div
          aria-hidden="true"
          style={{
            top: `${Math.max(0, rect.top - pad)}px`,
            left: `${Math.max(0, rect.left - pad)}px`,
            width: `${rect.width + pad * 2}px`,
            height: `${rect.height + pad * 2}px`,
            boxShadow:
              (step === 2 && (!startSet || !destSet)) ||
              (step === 3 && clickTool === 'dome' && !domeInstalled)
                ? '0 0 0 9999px rgba(2, 6, 15, 0.36)'
                : '0 0 0 9999px rgba(2, 6, 15, 0.62)',
          }}
          className="fixed z-40 pointer-events-none rounded-xl border-2 border-sky-400 transition-all duration-300 ease-out"
        />
      )}

      {/* Anchored Speech Bubble with Directional Arrow */}
      <div
        style={{
          top: `${bubbleTop}px`,
          left: `${bubbleLeft}px`,
          width: `${bubbleW}px`,
        }}
        className="fixed z-50 bg-[#0b1324] border border-sky-400/80 rounded-xl shadow-2xl p-3.5 text-slate-100 pointer-events-auto transition-all duration-300 ease-out"
      >
        {/* Sharp Arrow Pointing to Target */}
        {isRightAnchored ? (
          <div
            style={{ top: `${arrowOffsetY}px` }}
            className="absolute -right-[9px] w-4 h-4 bg-[#0b1324] border-t border-r border-sky-400/80 rotate-45"
          />
        ) : (
          <div
            style={{ top: `${arrowOffsetY}px` }}
            className="absolute -left-[9px] w-4 h-4 bg-[#0b1324] border-b border-l border-sky-400/80 rotate-45"
          />
        )}

        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-xs font-bold text-white">{titleText}</span>
          <button
            type="button"
            onClick={onSkipGuide}
            className="text-[10px] text-slate-400 hover:text-white"
          >
            {pick('Close', '닫기')}
          </button>
        </div>

        <p className="text-[11px] text-slate-200 leading-relaxed mb-3">
          {bodyText}
        </p>

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
          <span className="text-[10px] font-mono text-sky-300 font-semibold">
            {step} / 3
          </span>
          <div className="flex items-center gap-1.5">
            {step > 1 && (
              <button
                type="button"
                onClick={() => onGoToStep((step - 1) as GuideStep)}
                className="px-2.5 py-1 rounded-lg bg-white/[0.08] hover:bg-white/[0.16] text-[11px] text-slate-200 transition-colors"
              >
                {pick('Back', '이전')}
              </button>
            )}
            {step < 3 ? (
              <button
                type="button"
                onClick={() => onGoToStep((step + 1) as GuideStep)}
                className="px-3 py-1 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 text-[11px] font-bold transition-colors"
              >
                {pick('Next →', '다음 →')}
              </button>
            ) : (
              <button
                type="button"
                onClick={onFinishGuide}
                className="px-3 py-1 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-[11px] font-bold transition-colors"
              >
                {pick('Done', '완료')}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
