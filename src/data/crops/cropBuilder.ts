import type { MarsCrop } from '../marsCrops';

export type SoilMethodKey = 'regolith_wash' | 'hydroponic' | 'hybrid_substrate';
export type CropCategoryKey = 'staple' | 'greens' | 'protein' | 'fruit' | 'algae';

export interface CompactCropSpec {
  id: string;
  nameEn: string;
  nameKo: string;
  scientificName: string;
  category: CropCategoryKey;
  growthDays: number;
  dailyYieldKgPerM2: number;
  waterConsumptionLPerM2Day: number;
  recommendedSoilMethod: SoilMethodKey;
  soilMethodEn: string;
  soilMethodKo: string;
  caloriePer100g: number;
  nutritionalHighlightsEn: string;
  nutritionalHighlightsKo: string;
  minTempC: number;
  optTempC: number;
  optimalHumidityPctEn: string;
  optimalHumidityPct: string;
  phRange: string;
  co2Ppm: number;
  lightHoursDay: number;
  nutrientsEn: string;
  nutrientsKo: string;
  stepsEn: [string, string, string, string];
  stepsKo: [string, string, string, string];
  harvestTipEn: string;
  harvestTipKo: string;
  whySuitedEn: string;
  whySuitedKo: string;
  iconName: string;
}

const CATEGORY_LABELS: Record<CropCategoryKey, { en: string; ko: string }> = {
  staple: { en: 'Staple · Carbohydrates', ko: '주식 · 탄수화물' },
  greens: { en: 'Leafy Greens · Herbs', ko: '엽채류 · 허브' },
  protein: { en: 'Protein · Legumes & Sprouts', ko: '단백질 · 두류/새싹' },
  fruit: { en: 'Fruiting Veg · Berries & Fruit', ko: '과채류 · 베리/과수' },
  algae: { en: 'Microalgae · Fungi', ko: '미세조류 · 버섯류' },
};

const STAGE_TITLES: Record<CropCategoryKey, { en: [string, string, string, string]; ko: [string, string, string, string] }> = {
  staple: {
    en: ['1. Substrate Prep', '2. Seeding / Planting', '3. Vegetative & Bulking', '4. Harvest & Storage'],
    ko: ['1. 토양·배지 전처리', '2. 파종·정식', '3. 생육·결실 관리', '4. 수확·저장'],
  },
  greens: {
    en: ['1. Germination', '2. Transplanting', '3. LED Canopy Growth', '4. Harvest Cycle'],
    ko: ['1. 육묘·발아', '2. 정식·이식', '3. LED 광합성 생육', '4. 수확·재생 관리'],
  },
  protein: {
    en: ['1. Inoculation / Soak', '2. Seeding / Setup', '3. Pod / Biomass Growth', '4. Harvest & Processing'],
    ko: ['1. 종자 접종·침지', '2. 파종·베드 세팅', '3. 개화·결실 생육', '4. 수확·가공'],
  },
  fruit: {
    en: ['1. Substrate & Nursery', '2. Training & Canopy', '3. Pollination & Fruit Set', '4. Ripening & Harvest'],
    ko: ['1. 육묘·배지 세팅', '2. 정식·유인 관리', '3. 인공 수분·착과', '4. 숙성·수확'],
  },
  algae: {
    en: ['1. Culture Prep', '2. Inoculation', '3. Environmental Control', '4. Harvest & Reuse'],
    ko: ['1. 배지·배양액 조성', '2. 종균 접종', '3. 환경·광/습도 제어', '4. 수확·순환 재사용'],
  },
};

export function buildMarsCrop(spec: CompactCropSpec): MarsCrop {
  const catLabel = CATEGORY_LABELS[spec.category];
  const stageHeaders = STAGE_TITLES[spec.category];

  return {
    id: spec.id,
    nameKo: spec.nameKo,
    nameEn: spec.nameEn,
    scientificName: spec.scientificName,
    category: spec.category,
    categoryKo: catLabel.ko,
    categoryEn: catLabel.en,
    growthDays: spec.growthDays,
    dailyYieldKgPerM2: spec.dailyYieldKgPerM2,
    waterConsumptionLPerM2Day: spec.waterConsumptionLPerM2Day,
    recommendedSoilMethod: spec.recommendedSoilMethod,
    soilMethodKo: spec.soilMethodKo,
    soilMethodEn: spec.soilMethodEn,
    caloriePer100g: spec.caloriePer100g,
    nutritionalHighlightsKo: spec.nutritionalHighlightsKo,
    nutritionalHighlightsEn: spec.nutritionalHighlightsEn,
    minTempC: spec.minTempC,
    optTempC: spec.optTempC,
    optimalHumidityPct: spec.optimalHumidityPct,
    optimalHumidityPctEn: spec.optimalHumidityPctEn,
    phRange: spec.phRange,
    co2Ppm: spec.co2Ppm,
    lightHoursDay: spec.lightHoursDay,
    nutrientsKo: spec.nutrientsKo,
    nutrientsEn: spec.nutrientsEn,
    cultivationStepsKo: stageHeaders.ko.map((stage, idx) => ({
      stage,
      detail: spec.stepsKo[idx],
    })),
    cultivationStepsEn: stageHeaders.en.map((stage, idx) => ({
      stage,
      detail: spec.stepsEn[idx],
    })),
    harvestTipKo: spec.harvestTipKo,
    harvestTipEn: spec.harvestTipEn,
    whySuitedKo: spec.whySuitedKo,
    whySuitedEn: spec.whySuitedEn,
    iconName: spec.iconName,
  };
}
