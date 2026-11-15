import { MarsTelemetryPoint } from '../types/mars';
import { STAPLES_ROOTS_CROPS } from './crops/cropsStaplesRoots';
import { GREENS_HERBS_CROPS } from './crops/cropsGreensHerbs';
import { PROTEIN_LEGUMES_CROPS } from './crops/cropsProteinLegumes';
import { FRUITS_FRUITING_CROPS } from './crops/cropsFruitsFruiting';
import { ALGAE_FUNGI_CROPS } from './crops/cropsAlgaeFungi';

export interface MarsCrop {
  id: string;
  nameKo: string;
  nameEn: string;
  scientificName: string;
  category: 'staple' | 'greens' | 'protein' | 'fruit' | 'algae';
  categoryKo: string;
  categoryEn: string;
  growthDays: number;
  dailyYieldKgPerM2: number;
  waterConsumptionLPerM2Day: number;
  recommendedSoilMethod: 'regolith_wash' | 'hydroponic' | 'hybrid_substrate';
  soilMethodKo: string;
  soilMethodEn: string;
  caloriePer100g: number;
  nutritionalHighlightsKo: string;
  nutritionalHighlightsEn: string;
  minTempC: number;
  optTempC: number;
  optimalHumidityPct: string;
  optimalHumidityPctEn: string;
  phRange: string;
  co2Ppm: number;
  lightHoursDay: number;
  nutrientsKo: string;
  nutrientsEn: string;
  cultivationStepsKo: { stage: string; detail: string }[];
  cultivationStepsEn: { stage: string; detail: string }[];
  harvestTipKo: string;
  harvestTipEn: string;
  whySuitedKo: string;
  whySuitedEn: string;
  iconName: string;
}

export const MARS_CROPS_DATABASE: MarsCrop[] = [
  ...STAPLES_ROOTS_CROPS,
  ...GREENS_HERBS_CROPS,
  ...PROTEIN_LEGUMES_CROPS,
  ...FRUITS_FRUITING_CROPS,
  ...ALGAE_FUNGI_CROPS,
];

const CORE_MISSION_IDS = new Set([
  'mars_potato',
  'mars_kale',
  'mars_soybean',
  'mars_micro_tomato',
  'mars_spirulina',
  'mars_sweet_potato',
  'romaine_lettuce',
  'cherry_radish',
  'albion_strawberry',
  'mung_bean_sprouts',
]);

export function scoreCropForPoint(
  crop: MarsCrop,
  point: MarsTelemetryPoint
): number {
  const waterProb = point.combinedWaterProb;
  const soil = point.soilFertility;
  const ambientPressureHpa = Math.max(
    1.2,
    Number((6.1 * Math.exp(-point.elevationM / 11100)).toFixed(1))
  );

  let score = 50;
  if (waterProb >= 60) score += 16;
  else if (waterProb < 30 && crop.waterConsumptionLPerM2Day <= 1.5) score += 18;
  else if (waterProb < 30 && crop.waterConsumptionLPerM2Day > 2.4) score -= 12;

  if (soil >= 55 && crop.recommendedSoilMethod === 'regolith_wash') score += 26;
  if (soil < 55 && crop.recommendedSoilMethod === 'hydroponic') score += 28;
  if (crop.recommendedSoilMethod === 'hybrid_substrate') score += 14;
  if (ambientPressureHpa > 7.0) score += 6;
  if (CORE_MISSION_IDS.has(crop.id)) score += 8;
  if (crop.growthDays <= 35) score += 5;
  return score;
}

export interface GreenhouseRecipe {
  ambientPressureHpa: number;
  domePressureAtm: number;
  ambientTempC: number;
  domeTempC: number;
  co2BoostPpm: number;
  o2Pct: number;
  dailyWaterRequirementL: number;
  dailyWaterHarvestableL: number;
  waterSurplusL: number;
  soilMethodSummaryKo: string;
  soilMethodSummaryEn: string;
  soilRemediationStepsKo: string[];
  soilRemediationStepsEn: string[];
  recommendedCrops: MarsCrop[];
  farmingViabilityScore: number;
  settlementRatingKo: string;
  settlementRatingEn: string;
}

export function analyzeMarsFarmingPotential(
  point: MarsTelemetryPoint,
  greenhouseAreaM2 = 40
): GreenhouseRecipe {
  const elev = point.elevationM;
  const slope = point.slopeDeg;
  const waterProb = point.combinedWaterProb;
  const soil = point.soilFertility;

  const ambientPressureHpa = Math.max(
    1.2,
    Number((6.1 * Math.exp(-elev / 11100)).toFixed(1))
  );

  const ambientTempC = Math.round(
    -60 - (elev / 1000) * 1.5 - Math.abs(point.lat) * 0.45
  );

  const domePressureAtm = 0.35;
  const domeTempC = 21;
  const co2BoostPpm = 1200;
  const o2Pct = 21;

  const extractionRateLPerM2Day = Number(((waterProb / 100) * 8.5).toFixed(1));
  const dailyWaterHarvestableL = Math.round(extractionRateLPerM2Day * 35);
  const avgCropConsumption = 2.1;
  const dailyWaterRequirementL = Math.round(greenhouseAreaM2 * avgCropConsumption);
  const waterSurplusL = dailyWaterHarvestableL - dailyWaterRequirementL;

  let soilMethodSummaryKo = '';
  let soilMethodSummaryEn = '';
  const soilRemediationStepsKo: string[] = [];
  const soilRemediationStepsEn: string[] = [];

  if (soil >= 55) {
    soilMethodSummaryKo = '현지 점토 개량 농법 (과염소산염 세척 후 직접 재배)';
    soilMethodSummaryEn = 'Local Clay Remediation (Direct Regolith Cultivation after Wash)';
    soilRemediationStepsKo.push('65°C 온수 세척으로 표토 과염소산염(독성 염류) 98% 제거');
    soilRemediationStepsKo.push('질소고정 미생물 + 유기 부식토 15% 혼합');
    soilRemediationStepsKo.push('세척토 60% + 바이오차 40% 베드 구축 후 식재');

    soilRemediationStepsEn.push('65°C hot-water rinse removes 98% of toxic topsoil perchlorate salts');
    soilRemediationStepsEn.push('Inoculate nitrogen-fixing microbes + blend 15% organic humus');
    soilRemediationStepsEn.push('Construct 60% washed regolith + 40% biochar beds and plant');
  } else {
    soilMethodSummaryKo = '지구 배지 + 화성 정제수 순환 수경재배';
    soilMethodSummaryEn = 'Earth Substrate + Purified Martian Water Hydroponics';
    soilRemediationStepsKo.push('현무암질 사질토 · 독성 농도 높음 → 수경 배지 사용');
    soilRemediationStepsKo.push('지하수 RO(역삼투압) 정수 후 무기 양액(N-P-K) 배합');
    soilRemediationStepsKo.push('코코피트/암면 배지 설치 및 밀폐 순환 관수 가동');

    soilRemediationStepsEn.push('High-toxicity basaltic sand detected → bypass local soil via hydroponic media');
    soilRemediationStepsEn.push('Purify groundwater via Reverse Osmosis (RO) & dose inorganic N-P-K nutrients');
    soilRemediationStepsEn.push('Install coco-coir/rockwool slabs and activate closed-loop recirculation');
  }

  const scoredCrops = MARS_CROPS_DATABASE.map((crop) => ({
    crop,
    score: scoreCropForPoint(crop, point),
  })).sort((a, b) => b.score - a.score);

  const recommendedCrops: MarsCrop[] = [];
  const usedCats = new Set<string>();
  for (const item of scoredCrops) {
    if (!usedCats.has(item.crop.category)) {
      recommendedCrops.push(item.crop);
      usedCats.add(item.crop.category);
    }
    if (recommendedCrops.length >= 6) break;
  }
  for (const item of scoredCrops) {
    if (recommendedCrops.length >= 6) break;
    if (!recommendedCrops.some((c) => c.id === item.crop.id)) {
      recommendedCrops.push(item.crop);
    }
  }

  let viability = Math.round(
    waterProb * 0.45 +
      soil * 0.35 +
      Math.max(0, 20 - slope * 2) +
      (elev < 1000 ? 10 : 0)
  );
  viability = Math.max(8, Math.min(98, viability));

  let settlementRatingKo = '최적 농경지';
  let settlementRatingEn = 'Prime Agricultural Site';
  if (viability < 35) {
    settlementRatingKo = '탐사 전용 (농업 부적합)';
    settlementRatingEn = 'Explore Only (Non-Arable)';
  } else if (viability < 60) {
    settlementRatingKo = '수경 온실 가능';
    settlementRatingEn = 'Hydroponic Dome Viable';
  } else if (viability < 80) {
    settlementRatingKo = '온실 설치 적합';
    settlementRatingEn = 'Greenhouse Suitable';
  }

  return {
    ambientPressureHpa,
    domePressureAtm,
    ambientTempC,
    domeTempC,
    co2BoostPpm,
    o2Pct,
    dailyWaterRequirementL,
    dailyWaterHarvestableL,
    waterSurplusL,
    soilMethodSummaryKo,
    soilMethodSummaryEn,
    soilRemediationStepsKo,
    soilRemediationStepsEn,
    recommendedCrops,
    farmingViabilityScore: viability,
    settlementRatingKo,
    settlementRatingEn,
  };
}
