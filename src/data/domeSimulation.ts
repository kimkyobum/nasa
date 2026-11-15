import {
  DeployedDome,
  DomeTier,
  MarsTelemetryPoint,
} from '../types/mars';
import {
  MARS_CROPS_DATABASE,
  MarsCrop,
  scoreCropForPoint,
} from './marsCrops';
import {
  findNearestLandmark,
  sampleMarsTelemetry,
} from './marsData';

export interface DomeTierSpec {
  id: DomeTier;
  labelEn: string;
  labelKo: string;
  diameterM: number;
  floorAreaM2: number;
  cropAreaM2: number;
  recommendedCrewMin: number;
  recommendedCrewMax: number;
  shellMassTons: number;
  basePowerKw: number;
}

export const DOME_TIER_SPECS: Record<DomeTier, DomeTierSpec> = {
  outpost: {
    id: 'outpost',
    labelEn: 'Pioneer Outpost (28m)',
    labelKo: '개척 전초 돔 (28m)',
    diameterM: 28,
    floorAreaM2: 615,
    cropAreaM2: 180,
    recommendedCrewMin: 2,
    recommendedCrewMax: 8,
    shellMassTons: 42,
    basePowerKw: 65,
  },
  habitat: {
    id: 'habitat',
    labelEn: 'Bio-Dome Habitat (56m)',
    labelKo: '생태 거주 돔 (56m)',
    diameterM: 56,
    floorAreaM2: 2460,
    cropAreaM2: 760,
    recommendedCrewMin: 6,
    recommendedCrewMax: 24,
    shellMassTons: 128,
    basePowerKw: 185,
  },
  metropolis: {
    id: 'metropolis',
    labelEn: 'Colony Canopy (110m)',
    labelKo: '대형 정착 돔 (110m)',
    diameterM: 110,
    floorAreaM2: 9500,
    cropAreaM2: 3100,
    recommendedCrewMin: 18,
    recommendedCrewMax: 60,
    shellMassTons: 410,
    basePowerKw: 540,
  },
};

export interface OxygenSourceMix {
  totalProducedKgDay: number;
  crewDemandKgDay: number;
  surplusKgDay: number;
  bufferDays: number;
  moxieKgDay: number;
  moxieSharePct: number;
  electrolysisKgDay: number;
  electrolysisSharePct: number;
  photosynthesisKgDay: number;
  photosynthesisSharePct: number;
  co2ScrubbedKgDay: number;
  h2FuelByproductKgDay: number;
}

export interface WaterExtractionSim {
  drillDepthM: number;
  aquiferTypeEn: string;
  aquiferTypeKo: string;
  rawExtractLDay: number;
  purifiedYieldLDay: number;
  closedLoopRecoveryPct: number;
  crewAndCropNetUseLDay: number;
  surplusLDay: number;
  reservoirCapacityL: number;
  autonomyDays: number;
  roPurificationKwhDay: number;
}

export interface HabitatEnvironmentSim {
  outsideTempDayC: number;
  outsideTempNightC: number;
  outsideTempMeanC: number;
  insideTempDayC: number;
  insideTempNightC: number;
  outsidePressureHpa: number;
  insidePressureKpa: number;
  insidePressureAtm: number;
  insideO2Pct: number;
  insideCo2Ppm: number;
  insideHumidityPct: number;
  perchloratePct: number;
  soilTypeEn: string;
  soilTypeKo: string;
  solarFluxWm2: number;
  daylightHours: number;
  radiationOutsideMSvYr: number;
  radiationInsideMSvYr: number;
  dustStormRiskEn: string;
  dustStormRiskKo: string;
  climateZoneEn: string;
  climateZoneKo: string;
  energyMixEn: string;
  energyMixKo: string;
}

export interface DomeLivingExperience {
  livabilityScore: number;
  ratingEn: string;
  ratingKo: string;
  dailyKcalPerCrew: number;
  foodAutonomyPct: number;
  dailyHarvestKg: number;
  waterRoutineEn: string;
  waterRoutineKo: string;
  airAndBreathingEn: string;
  airAndBreathingKo: string;
  dailyLifeNarrativeEn: string;
  dailyLifeNarrativeKo: string;
  keyAdvantagesEn: string[];
  keyAdvantagesKo: string[];
  keyChallengesEn: string[];
  keyChallengesKo: string[];
}

export interface DomeSimulationResult {
  telemetry: MarsTelemetryPoint;
  tierSpec: DomeTierSpec;
  water: WaterExtractionSim;
  oxygen: OxygenSourceMix;
  environment: HabitatEnvironmentSim;
  living: DomeLivingExperience;
  activeCrops: MarsCrop[];
  recommendedCrops: MarsCrop[];
}

export interface ComparisonBenchmarkSite {
  id: string;
  nameEn: string;
  nameKo: string;
  lat: number;
  lon: number;
  tagEn: string;
  tagKo: string;
}

export const COMPARISON_BENCHMARK_SITES: ComparisonBenchmarkSite[] = [
  {
    id: 'bench_arcadia',
    nameEn: 'Arcadia–Alba Ice Basin',
    nameKo: '아르카디아–알바 빙하 분지',
    lat: 39.2,
    lon: -112.5,
    tagEn: 'Shallow Ice + Geothermal',
    tagKo: '얕은 지하빙 + 지열',
  },
  {
    id: 'bench_jezero',
    nameEn: 'Jezero Clay Delta',
    nameKo: '예제로 점토 삼각주',
    lat: 18.38,
    lon: 77.58,
    tagEn: 'Equatorial Clay Belt',
    tagKo: '적도 점토 토양대',
  },
  {
    id: 'bench_hellas',
    nameEn: 'Hellas Deep Basin',
    nameKo: '헬라스 초저지 분지',
    lat: -42.4,
    lon: 70.5,
    tagEn: 'Highest Air Pressure',
    tagKo: '화성 최고 대기압',
  },
  {
    id: 'bench_olympus',
    nameEn: 'Olympus Mons Summit',
    nameKo: '올림푸스 산 정상',
    lat: 18.65,
    lon: -133.8,
    tagEn: 'Extreme High Altitude',
    tagKo: '초고지대 화산 정상',
  },
];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function getDefaultCropIdsForPoint(
  point: MarsTelemetryPoint,
  count = 4
): string[] {
  return [...MARS_CROPS_DATABASE]
    .sort((a, b) => scoreCropForPoint(b, point) - scoreCropForPoint(a, point))
    .slice(0, count)
    .map((c) => c.id);
}

export function createDeployedDome(
  lat: number,
  lon: number,
  existingCount: number,
  tier: DomeTier = 'habitat'
): DeployedDome {
  const pt = sampleMarsTelemetry(lat, lon);
  const near = findNearestLandmark(lat, lon, 1.1);
  const baseNameEn = near
    ? `${near.landmark.nameEn} Dome`
    : `Bio-Dome Outpost ${existingCount + 1}`;
  const baseNameKo = near
    ? `${near.landmark.nameKo} 바이오 돔`
    : `화성 바이오 돔 ${existingCount + 1}호`;

  return {
    id: `dome_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    nameEn: baseNameEn,
    nameKo: baseNameKo,
    lat: Number(lat.toFixed(2)),
    lon: Number(lon.toFixed(2)),
    tier,
    crewCount: tier === 'outpost' ? 6 : tier === 'habitat' ? 12 : 32,
    selectedCropIds: getDefaultCropIdsForPoint(pt, 4),
    installedAtSol: 12 + existingCount * 14,
  };
}

export function simulateMarsDome(
  lat: number,
  lon: number,
  tier: DomeTier,
  crewCount: number,
  selectedCropIds?: string[]
): DomeSimulationResult {
  const telemetry = sampleMarsTelemetry(lat, lon);
  const tierSpec = DOME_TIER_SPECS[tier];
  const absLat = Math.abs(lat);

  // Outside temperature & pressure derived from latitude and MOLA elevation
  const outsideTempMeanC = Math.round(
    clamp(-46 - absLat * 0.56 - telemetry.elevationM * 0.0022 + telemetry.geothermalIndex * 0.08, -118, -18)
  );
  const diurnalSwing = absLat > 55 ? 24 : 38;
  const outsideTempDayC = Math.round(outsideTempMeanC + diurnalSwing * 0.52);
  const outsideTempNightC = Math.round(outsideTempMeanC - diurnalSwing * 0.65);

  const outsidePressureHpa = Math.max(
    0.9,
    Number((6.1 * Math.exp(-telemetry.elevationM / 11100)).toFixed(1))
  );

  // Solar irradiance & daylight
  const solarFluxWm2 = telemetry.solarFluxWm2
    ? Math.round(telemetry.solarFluxWm2)
    : Math.round(clamp(590 * Math.cos((absLat * Math.PI) / 180) * 0.86 + 75, 165, 595));
  const daylightHours = telemetry.daylightHours
    ? Number(telemetry.daylightHours.toFixed(1))
    : Number(clamp(12.3 - (absLat / 90) * 2.1, 8.2, 13.4).toFixed(1));

  // Subsurface water extraction model
  const waterProb = telemetry.combinedWaterProb;
  const drillDepthM = telemetry.iceDepthM
    ? Number(telemetry.iceDepthM.toFixed(1))
    : Number(
        clamp(
          18.5 - waterProb * 0.16 - (absLat > 30 ? 2.4 : 0) + Math.max(0, telemetry.elevationM) * 0.0005,
          0.4,
          28.0
        ).toFixed(1)
      );

  const tierDrillMultiplier = tier === 'outpost' ? 0.68 : tier === 'habitat' ? 1.0 : 1.85;
  const rawExtractLDay = Math.round(
    (28 + waterProb * 4.4 + (telemetry.geothermalIndex > 55 ? 40 : 0)) * tierDrillMultiplier
  );
  const purifiedYieldLDay = Math.round(rawExtractLDay * 0.88);
  const closedLoopRecoveryPct = tier === 'metropolis' ? 95 : tier === 'habitat' ? 93 : 90;

  let aquiferTypeEn = 'Trace Hydrated Minerals & Clay Pore Water';
  let aquiferTypeKo = '점토 공극수 · 미량 수화 광물층';
  if (waterProb >= 70) {
    aquiferTypeEn = 'Massive Shallow Buried Water-Ice Sheet (SWIM Core)';
    aquiferTypeKo = '고농도 얕은 지하 빙하층 (SWIM 핵심 지대)';
  } else if (waterProb >= 48) {
    aquiferTypeEn = 'Permafrost Meltwater Lens & Subsurface Regolith Ice';
    aquiferTypeKo = '영구동토 해빙수 렌즈 · 지하 얼음층';
  } else if (telemetry.geothermalIndex >= 65) {
    aquiferTypeEn = 'Geothermal Brine Vapor & Deep Fractured Aquifer';
    aquiferTypeKo = '지열 수증기 균열대 · 심부 염수층';
  }

  // Crops selection
  const recommendedCrops = [...MARS_CROPS_DATABASE]
    .sort((a, b) => scoreCropForPoint(b, telemetry) - scoreCropForPoint(a, telemetry))
    .slice(0, 8);

  const activeCropObjects = (selectedCropIds ?? [])
    .map((id) => MARS_CROPS_DATABASE.find((c) => c.id === id))
    .filter((c): c is MarsCrop => Boolean(c));
  const activeCrops =
    activeCropObjects.length > 0 ? activeCropObjects : recommendedCrops.slice(0, 4);

  const avgCropWaterPerM2 =
    activeCrops.reduce((acc, c) => acc + c.waterConsumptionLPerM2Day, 0) / activeCrops.length;
  const avgCropYieldPerM2 =
    activeCrops.reduce((acc, c) => acc + c.dailyYieldKgPerM2, 0) / activeCrops.length;
  const avgKcalPer100g =
    activeCrops.reduce((acc, c) => acc + c.caloriePer100g, 0) / activeCrops.length;

  // Net water demand after closed-loop transpiration & greywater recycling
  const grossCropWaterL = tierSpec.cropAreaM2 * avgCropWaterPerM2;
  const grossCrewWaterL = crewCount * 38; // drinking, hygiene, galley
  const netCropLossL = grossCropWaterL * (1 - closedLoopRecoveryPct / 100);
  const netCrewLossL = grossCrewWaterL * 0.14;
  // Additional water split for O2 electrolysis
  const crewO2NeedKg = Number((crewCount * 0.84).toFixed(2));
  const electrolysisTargetO2Kg = Number((crewO2NeedKg * 0.34).toFixed(2));
  const electrolysisWaterL = electrolysisTargetO2Kg * 1.125; // stoichiometry: 18g H2O -> 16g O2

  const crewAndCropNetUseLDay = Math.round(netCropLossL + netCrewLossL + electrolysisWaterL);
  const surplusLDay = purifiedYieldLDay - crewAndCropNetUseLDay;
  const reservoirCapacityL =
    tier === 'outpost' ? 12000 : tier === 'habitat' ? 42000 : 140000;
  const autonomyDays =
    surplusLDay >= 0
      ? Math.min(365, Math.round(reservoirCapacityL / Math.max(25, crewAndCropNetUseLDay)))
      : Math.max(4, Math.round((reservoirCapacityL * 0.45) / Math.abs(surplusLDay)));
  const roPurificationKwhDay = Number((rawExtractLDay * 0.042 + drillDepthM * 0.9).toFixed(1));

  // Oxygen generation breakdown:
  // 1) MOXIE Atmospheric CO2 Electrolysis (benefits from higher outside atmospheric pressure)
  const pressureFactor = clamp(outsidePressureHpa / 6.1, 0.35, 1.8);
  const moxieBaseKg =
    (tier === 'outpost' ? 3.2 : tier === 'habitat' ? 7.4 : 18.5) * pressureFactor;
  // 2) Subsurface H2O Electrolysis (scales with available purified water)
  const waterAvailFactor = clamp(purifiedYieldLDay / Math.max(80, crewAndCropNetUseLDay), 0.55, 1.5);
  const electrolysisKgDay = Number(
    ((tier === 'outpost' ? 2.4 : tier === 'habitat' ? 5.6 : 14.5) * waterAvailFactor).toFixed(2)
  );
  // 3) Bio-Dome Crop & Algae Photosynthesis (~12g O2 / m2 / day under high-PPFD LEDs)
  const algaeBoost = activeCrops.some((c) => c.category === 'algae') ? 1.24 : 1.0;
  const photosynthesisKgDay = Number(
    (tierSpec.cropAreaM2 * 0.0115 * algaeBoost).toFixed(2)
  );
  const moxieKgDay = Number(moxieBaseKg.toFixed(2));
  const totalProducedKgDay = Number(
    (moxieKgDay + electrolysisKgDay + photosynthesisKgDay).toFixed(2)
  );
  const o2SurplusKgDay = Number((totalProducedKgDay - crewO2NeedKg).toFixed(2));

  const moxieSharePct = Math.round((moxieKgDay / totalProducedKgDay) * 100);
  const electrolysisSharePct = Math.round((electrolysisKgDay / totalProducedKgDay) * 100);
  const photosynthesisSharePct = Math.max(1, 100 - moxieSharePct - electrolysisSharePct);

  const co2ScrubbedKgDay = Number((photosynthesisKgDay * 1.375 + crewCount * 1.0).toFixed(2));
  const h2FuelByproductKgDay = Number((electrolysisKgDay * 0.125).toFixed(2));
  const o2TankReserveKg = tier === 'outpost' ? 320 : tier === 'habitat' ? 980 : 3200;
  const bufferDays =
    o2SurplusKgDay >= 0
      ? Math.min(365, Math.round(o2TankReserveKg / Math.max(1, crewO2NeedKg)))
      : Math.max(2, Math.round(o2TankReserveKg / Math.abs(o2SurplusKgDay)));

  // Perchlorates, soil, radiation & dust risk
  const perchloratePct = telemetry.perchloratePct
    ? Number(telemetry.perchloratePct.toFixed(2))
    : Number(
        clamp(0.82 - telemetry.soilFertility * 0.0055 + (telemetry.geothermalIndex > 65 ? 0.25 : 0), 0.18, 1.35).toFixed(2)
      );

  const radiationOutsideMSvYr = Math.round(
    clamp(235 + telemetry.elevationM * 0.0045 - (telemetry.elevationM < -3000 ? 28 : 0), 185, 340)
  );
  const radiationInsideMSvYr = Math.round(radiationOutsideMSvYr * (tier === 'metropolis' ? 0.14 : 0.18));

  const soilTypeEn =
    telemetry.soilFertility >= 68
      ? 'Smectite Clay-Rich Regolith (Direct Wash Viable)'
      : telemetry.soilFertility >= 46
        ? 'Mixed Basalt & Phyllosilicate Loam'
        : 'Iron-Oxide Basaltic Sand (Hydroponic Recommended)';
  const soilTypeKo =
    telemetry.soilFertility >= 68
      ? '스멕타이트 점토질 토양 (세척 후 직접 재배 가능)'
      : telemetry.soilFertility >= 46
        ? '현무암·점토 혼합 토양 (개량 후 재배)'
        : '산화철 현무암질 사토 (밀폐 수경재배 권장)';

  const dustStormRiskEn =
    absLat < 30 && telemetry.elevationM < 2000
      ? 'Moderate–High (Seasonal Dust Belt)'
      : telemetry.elevationM > 6000
        ? 'Low (Above Dense Dust Layer)'
        : 'Moderate (Periodic Regional Plumes)';
  const dustStormRiskKo =
    absLat < 30 && telemetry.elevationM < 2000
      ? '중~높음 (적도·저지 계절 먼지폭풍대)'
      : telemetry.elevationM > 6000
        ? '낮음 (고고도 맑은 상층 대기)'
        : '보통 (간헐적 국지 먼지 기류)';

  const climateZoneEn =
    absLat > 48
      ? 'Polar–Subpolar Cryosphere'
      : absLat > 26
        ? 'Mid-Latitude Permafrost Belt'
        : telemetry.elevationM > 6000
          ? 'Tharsis High-Volcanic Plateau'
          : 'Equatorial Lowland Desert';
  const climateZoneKo =
    absLat > 48
      ? '고위도 극지·빙설 기후'
      : absLat > 26
        ? '중위도 영구동토대 기후'
        : telemetry.elevationM > 6000
          ? '고지대 화산 고원 기후'
          : '적도 저지대 건조 사막 기후';

  const energyMixEn =
    telemetry.geothermalIndex >= 55
      ? 'Geothermal Steam + Kilopower Nuclear + Solar Array'
      : absLat > 45
        ? 'Kilopower Nuclear Fission + High-Efficiency Solar'
        : 'Solar Tracking Canopy + Kilopower Backup';
  const energyMixKo =
    telemetry.geothermalIndex >= 55
      ? '지열 발전 + 킬로파워 소형 원전 + 태양광'
      : absLat > 45
        ? '킬로파워 소형 원전 + 보조 태양광 어레이'
        : '고효율 추적식 태양광 + 킬로파워 백업';

  // Crop food production & daily life narrative
  const dailyHarvestKg = Number((tierSpec.cropAreaM2 * avgCropYieldPerM2 * 0.92).toFixed(1));
  const totalKcalDay = dailyHarvestKg * 10 * avgKcalPer100g;
  const dailyKcalPerCrew = Math.round(totalKcalDay / Math.max(1, crewCount));
  const foodAutonomyPct = clamp(Math.round((dailyKcalPerCrew / 2350) * 100), 8, 160);

  // Overall Livability Score (0-100)
  const waterScore = surplusLDay >= 40 ? 28 : surplusLDay >= 0 ? 21 : 8;
  const o2Score = o2SurplusKgDay >= 1.5 ? 25 : o2SurplusKgDay >= 0 ? 18 : 6;
  const terrainSafetyScore =
    telemetry.slopeDeg < 6
      ? 18
      : telemetry.slopeDeg < 12
        ? 13
        : telemetry.slopeDeg < 18
          ? 7
          : 2;
  const soilAndPressureScore = clamp(
    Math.round(telemetry.soilFertility * 0.16 + outsidePressureHpa * 1.4),
    4,
    18
  );
  const foodScore = clamp(Math.round(foodAutonomyPct * 0.11), 2, 11);

  const livabilityScore = clamp(
    waterScore + o2Score + terrainSafetyScore + soilAndPressureScore + foodScore,
    18,
    98
  );

  const ratingEn =
    livabilityScore >= 82
      ? 'Prime Self-Sustaining Haven'
      : livabilityScore >= 66
        ? 'Viable Long-Term Colony'
        : livabilityScore >= 48
          ? 'Challenging Frontier Outpost'
          : 'High-Risk Survival Zone';
  const ratingKo =
    livabilityScore >= 82
      ? '최상급 자급자족 정착지'
      : livabilityScore >= 66
        ? '장기 거주 가능 정착 돔'
        : livabilityScore >= 48
          ? '고난도 개척 전초 기지'
          : '고위험 생존 한계 구역';

  const waterRoutineEn =
    surplusLDay >= 40
      ? `Abundant subsurface yield (+${surplusLDay} L/day surplus). Crew enjoys full showers, relaxed laundry cycles, and continuous greenhouse misting.`
      : surplusLDay >= 0
        ? `Balanced water budget (+${surplusLDay} L/day). Daily hygiene uses 4-minute low-flow misting while 93% condensate feeds crops.`
        : `Water deficit (${surplusLDay} L/day)! Strict 1.8 L/person rationing required; reserve tanks deplete within ${autonomyDays} sols without rover ice convoys.`;

  const waterRoutineKo =
    surplusLDay >= 40
      ? `지하수 추출 여유가 풍부합니다(+${surplusLDay} L/일 흑자). 온수 샤워·세탁과 온실 분무 관개가 여유롭게 유지됩니다.`
      : surplusLDay >= 0
        ? `물 수지가 간신히 균형을 이룹니다(+${surplusLDay} L/일). 4분 절수 미스트 샤워와 93% 응축수 재순환으로 농업을 유지합니다.`
        : `수자원 적자(${surplusLDay} L/일) 상태입니다! 1인당 엄격한 식수 배급이 필요하며, 외부 얼음 수송 없이는 ${autonomyDays}솔 내 고갈됩니다.`;

  const airAndBreathingEn =
    o2SurplusKgDay >= 0
      ? `Crisp shirtsleeve atmosphere at ${insidePressureLabel(tier)} (21.2% O₂, 21.5°C). Green crops scrub CO₂ naturally and supply ${photosynthesisSharePct}% of daily oxygen alongside MOXIE & water electrolysis.`
      : `Oxygen demand exceeds local dome output by ${Math.abs(o2SurplusKgDay)} kg/day. Crew size exceeds dome bio-regeneration; increase dome tier or reduce crew.`;

  const airAndBreathingKo =
    o2SurplusKgDay >= 0
      ? `내부는 0.68 기압·산소 21.2%·21.5°C의 쾌적한 반팔 환경입니다. MOXIE·물 전기분해와 함께 농작물 광합성이 산소의 ${photosynthesisSharePct}%를 자연 공급합니다.`
      : `산소 소비가 생산을 ${Math.abs(o2SurplusKgDay)} kg/일 초과합니다. 돔 규모를 키우거나 인원을 줄여야 합니다.`;

  const dailyLifeNarrativeEn =
    livabilityScore >= 75
      ? `Living inside this ${tierSpec.diameterM}m dome feels surprisingly lush: humid earth-scented air filled with ${activeCrops
          .slice(0, 2)
          .map((c) => c.nameEn.toLowerCase())
          .join(' and ')} leaves, turquoise meltwater circulating beneath glass bridges, and steady ${energyMixEn.toLowerCase()} power keeping the Martian freeze (${outsideTempMeanC}°C) outside the double-glazed hull.`
      : livabilityScore >= 52
        ? `Life here is a disciplined frontier routine. Outside the airlock, ${outsidePressureHpa} hPa air and ${outsideTempNightC}°C nights require full EVA suits, while inside you tend pressurized ${activeCrops[0]?.nameEn.toLowerCase() ?? 'hydroponic'} racks bathed in magenta grow-LEDs and monitor subsurface drill pressure.`
        : `Survival at this coordinate demands constant engineering vigilance. Steep ${telemetry.slopeDeg}° terrain or scarce subsurface ice (${waterProb}%) leaves narrow margins—every drop of condensate is tracked and EVA excursions face harsh ${outsideTempNightC}°C cold and elevated radiation.`;

  const dailyLifeNarrativeKo =
    livabilityScore >= 75
      ? `이 지름 ${tierSpec.diameterM}m 바이오 돔에서의 일상은 의외로 푸르고 풍요롭습니다. 유리 산책로 아래로 지하에서 끌어올린 청록빛 정제수가 흐르고, ${activeCrops
          .slice(0, 2)
          .map((c) => c.nameKo)
          .join('·')}의 흙내음과 습한 공기가 바깥의 영하 ${Math.abs(outsideTempMeanC)}°C 화성 황무지를 잊게 합니다.`
      : livabilityScore >= 52
        ? `이곳에서의 삶은 정교한 우주 개척 루틴입니다. 에어록 바깥은 ${outsidePressureHpa} hPa 저기압과 밤 영하 ${Math.abs(outsideTempNightC)}°C의 혹한이지만, 돔 안에서는 분홍빛 생장 LED 아래 ${activeCrops[0]?.nameKo ?? '수경 작물'}을 가꾸며 지하 시추 펌프와 산소 분압을 점검합니다.`
        : `이 좌표는 극한의 생존 전초지입니다. 가파른 ${telemetry.slopeDeg}° 지형 또는 빈약한 지하수(${waterProb}%) 때문에 물 한 방울까지 통제해야 하며, 정착보다는 단기 탐사·자원 채굴에 적합합니다.`;

  const keyAdvantagesEn: string[] = [];
  const keyAdvantagesKo: string[] = [];
  const keyChallengesEn: string[] = [];
  const keyChallengesKo: string[] = [];

  if (waterProb >= 55) {
    keyAdvantagesEn.push(`Shallow ${drillDepthM}m ice drill yields ${purifiedYieldLDay} L/day fresh water`);
    keyAdvantagesKo.push(`${drillDepthM}m 얕은 시추로 하루 ${purifiedYieldLDay}L 식수·농업수 확보`);
  } else {
    keyChallengesEn.push(`Low subsurface ice (${waterProb}%) limits water surplus`);
    keyChallengesKo.push(`낮은 지하수 확률(${waterProb}%)로 수자원 여유 부족`);
  }

  if (telemetry.soilFertility >= 60) {
    keyAdvantagesEn.push(`Clay-rich soil (${telemetry.soilFertility}/100) supports washed-regolith beds`);
    keyAdvantagesKo.push(`점토 비옥도(${telemetry.soilFertility}/100) 우수 — 세척 토양 직접 재배 가능`);
  } else {
    keyChallengesEn.push(`Barren regolith & ${perchloratePct}% perchlorate need sealed hydroponics`);
    keyChallengesKo.push(`척박한 토양 및 과염소산염(${perchloratePct}%) — 수경재배 필수`);
  }

  if (outsidePressureHpa >= 7.0) {
    keyAdvantagesEn.push(`Higher ambient air (${outsidePressureHpa} hPa) boosts MOXIE O₂ efficiency`);
    keyAdvantagesKo.push(`높은 주변 대기압(${outsidePressureHpa} hPa)으로 MOXIE 산소 효율 상승`);
  }
  if (telemetry.geothermalIndex >= 55) {
    keyAdvantagesEn.push(`Geothermal heat (${telemetry.geothermalIndex}/100) slashes dome heating power`);
    keyAdvantagesKo.push(`풍부한 지열(${telemetry.geothermalIndex}/100)로 난방 전력 절감`);
  }
  if (telemetry.slopeDeg >= 12) {
    keyChallengesEn.push(`Steep ${telemetry.slopeDeg}° slope complicates heavy dome anchoring & rovers`);
    keyChallengesKo.push(`${telemetry.slopeDeg}° 급경사로 돔 기초 고정 및 로버 주행 불리`);
  }
  if (outsideTempNightC <= -85) {
    keyChallengesEn.push(`Severe ${outsideTempNightC}°C nights drive high thermal insulation load`);
    keyChallengesKo.push(`야간 ${outsideTempNightC}°C 극한 한파로 보온 에너지 소모 증가`);
  }
  if (keyAdvantagesEn.length === 0) {
    keyAdvantagesEn.push('High solar clarity above dense equatorial dust layers');
    keyAdvantagesKo.push('맑은 상층 태양광 일사량 확보 가능');
  }
  if (keyChallengesEn.length === 0) {
    keyChallengesEn.push('Routine perchlorate washing & radiation shield maintenance');
    keyChallengesKo.push('정기적 과염소산염 세척 및 방사선 차폐 점검 필요');
  }

  return {
    telemetry,
    tierSpec,
    water: {
      drillDepthM,
      aquiferTypeEn,
      aquiferTypeKo,
      rawExtractLDay,
      purifiedYieldLDay,
      closedLoopRecoveryPct,
      crewAndCropNetUseLDay,
      surplusLDay,
      reservoirCapacityL,
      autonomyDays,
      roPurificationKwhDay,
    },
    oxygen: {
      totalProducedKgDay,
      crewDemandKgDay: crewO2NeedKg,
      surplusKgDay: o2SurplusKgDay,
      bufferDays,
      moxieKgDay,
      moxieSharePct,
      electrolysisKgDay,
      electrolysisSharePct,
      photosynthesisKgDay,
      photosynthesisSharePct,
      co2ScrubbedKgDay,
      h2FuelByproductKgDay,
    },
    environment: {
      outsideTempDayC,
      outsideTempNightC,
      outsideTempMeanC,
      insideTempDayC: 21.5,
      insideTempNightC: 17.0,
      outsidePressureHpa,
      insidePressureKpa: 68.9,
      insidePressureAtm: 0.68,
      insideO2Pct: 21.2,
      insideCo2Ppm: 1200,
      insideHumidityPct: 62,
      perchloratePct,
      soilTypeEn,
      soilTypeKo,
      solarFluxWm2,
      daylightHours,
      radiationOutsideMSvYr,
      radiationInsideMSvYr,
      dustStormRiskEn,
      dustStormRiskKo,
      climateZoneEn,
      climateZoneKo,
      energyMixEn,
      energyMixKo,
    },
    living: {
      livabilityScore,
      ratingEn,
      ratingKo,
      dailyKcalPerCrew,
      foodAutonomyPct,
      dailyHarvestKg,
      waterRoutineEn,
      waterRoutineKo,
      airAndBreathingEn,
      airAndBreathingKo,
      dailyLifeNarrativeEn,
      dailyLifeNarrativeKo,
      keyAdvantagesEn,
      keyAdvantagesKo,
      keyChallengesEn,
      keyChallengesKo,
    },
    activeCrops,
    recommendedCrops,
  };
}

function insidePressureLabel(_tier: DomeTier): string {
  return '68.9 kPa (0.68 atm)';
}
