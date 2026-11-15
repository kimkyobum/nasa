import { MarsTelemetryPoint } from '../types/mars';

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
  {
    id: 'mars_potato',
    nameKo: '화성 감자',
    nameEn: 'Martian Russet Potato',
    scientificName: 'Solanum tuberosum',
    category: 'staple',
    categoryKo: '주식 · 탄수화물',
    categoryEn: 'Staple · Carbohydrates',
    growthDays: 90,
    dailyYieldKgPerM2: 0.14,
    waterConsumptionLPerM2Day: 2.8,
    recommendedSoilMethod: 'regolith_wash',
    soilMethodKo: '세척 화성토 60% + 바이오차 40%',
    soilMethodEn: '60% Washed Regolith + 40% Biochar',
    caloriePer100g: 77,
    nutritionalHighlightsKo: '탄수화물 · 칼륨 · 비타민 C',
    nutritionalHighlightsEn: 'Carbohydrates · Potassium · Vitamin C',
    minTempC: 15,
    optTempC: 20,
    optimalHumidityPct: '65 ~ 75%',
    optimalHumidityPctEn: '65 ~ 75%',
    phRange: 'pH 5.5 ~ 6.2',
    co2Ppm: 1200,
    lightHoursDay: 16,
    nutrientsKo: '칼륨(K) 강화 배합 + 질소(N)·인(P) 균형 공급',
    nutrientsEn: 'Potassium (K) enriched blend + balanced Nitrogen (N) & Phosphorus (P)',
    cultivationStepsKo: [
      { stage: '1. 토양 전처리', detail: '65°C 지하수로 표토 과염소산염 세척 후 바이오차·퇴비 혼합' },
      { stage: '2. 파종 · 싹틔우기', detail: '씨감자 눈 2~3개 분할 식재 (깊이 8cm, 간격 25cm)' },
      { stage: '3. 괴경 비대기', detail: '온도 18~20°C 유지, 흙북주기로 괴경 녹화 방지' },
      { stage: '4. 수확 · 저장', detail: '90일 차 잎 황변 시 수확, 4~7°C 암소 장기 보관' },
    ],
    cultivationStepsEn: [
      { stage: '1. Soil Pretreatment', detail: 'Wash topsoil perchlorates with 65°C meltwater, then blend with biochar & compost' },
      { stage: '2. Planting & Sprouting', detail: 'Plant seed potato pieces with 2–3 eyes (8cm depth, 25cm spacing)' },
      { stage: '3. Tuber Bulking', detail: 'Maintain 18–20°C and mound soil to prevent tuber greening' },
      { stage: '4. Harvest & Storage', detail: 'Harvest at day 90 when foliage yellows; store dark at 4–7°C' },
    ],
    harvestTipKo: '감자 잎과 줄기에는 솔라닌 독성이 있으므로 괴경만 식용하고, 줄기는 퇴비로 재활용합니다.',
    harvestTipEn: 'Leaves and stems contain toxic solanine—consume only tubers and compost the vines.',
    whySuitedKo: '화성 토양의 칼륨 활용도가 높고 단위 면적당 칼로리 생산량이 가장 높습니다.',
    whySuitedEn: 'High potassium utilization in Martian regolith and highest caloric yield per m².',
    iconName: '🥔',
  },
  {
    id: 'mars_kale',
    nameKo: '우주 케일',
    nameEn: 'Cosmic Super Kale',
    scientificName: 'Brassica oleracea',
    category: 'greens',
    categoryKo: '엽채류 · 비타민',
    categoryEn: 'Leafy Greens · Vitamins',
    growthDays: 24,
    dailyYieldKgPerM2: 0.22,
    waterConsumptionLPerM2Day: 1.4,
    recommendedSoilMethod: 'hydroponic',
    soilMethodKo: '밀폐 순환 수경재배 (NFT)',
    soilMethodEn: 'Closed-Loop Hydroponics (NFT)',
    caloriePer100g: 49,
    nutritionalHighlightsKo: '비타민 A/C/K · 루테인 · 철분',
    nutritionalHighlightsEn: 'Vitamins A/C/K · Lutein · Iron',
    minTempC: 16,
    optTempC: 22,
    optimalHumidityPct: '60 ~ 70%',
    optimalHumidityPctEn: '60 ~ 70%',
    phRange: 'pH 5.8 ~ 6.5',
    co2Ppm: 1000,
    lightHoursDay: 18,
    nutrientsKo: '질산태 질소(NO3-) 중심 수경 배양액 (EC 1.6~2.0 dS/m)',
    nutrientsEn: 'Nitrate-N (NO3-) dominant hydroponic solution (EC 1.6–2.0 dS/m)',
    cultivationStepsKo: [
      { stage: '1. 육묘', detail: '암면(Rockwool) 큐브에 파종 후 5일간 습도 85% 유지' },
      { stage: '2. 정식', detail: '본엽 3매 전개 시 NFT 수경 채널에 이식' },
      { stage: '3. LED 광합성', detail: '적색(660nm) + 청색(450nm) LED 18시간 조사' },
      { stage: '4. 연속 수확', detail: '24일 차부터 바깥 잎부터 순차 수확하여 4개월 연속 채취' },
    ],
    cultivationStepsEn: [
      { stage: '1. Germination', detail: 'Sow in Rockwool cubes and hold 85% humidity for 5 days' },
      { stage: '2. Transplanting', detail: 'Transfer to NFT hydroponic channels once 3 true leaves emerge' },
      { stage: '3. LED Photoperiod', detail: 'Irradiate 18h/day with red (660nm) + blue (450nm) grow LEDs' },
      { stage: '4. Cut-and-Come-Again', detail: 'Harvest outer leaves from day 24 for 4 months of continuous yield' },
    ],
    harvestTipKo: '뿌리를 뽑지 않고 외엽만 꺾어 수확하면 같은 그루에서 6회 이상 재생 수확할 수 있습니다.',
    harvestTipEn: 'Harvest outer leaves without uprooting to regrow 6+ cycles from the same plant.',
    whySuitedKo: '생육 기간이 24일로 매우 짧고, 사용 수분의 95% 이상을 회수해 물 절약에 최적입니다.',
    whySuitedEn: 'Ultra-fast 24-day cycle and >95% closed-loop water recovery for minimal water loss.',
    iconName: '🥬',
  },
  {
    id: 'mars_soybean',
    nameKo: '화성 대두 (콩)',
    nameEn: 'Dwarf Bio-Soybean',
    scientificName: 'Glycine max',
    category: 'protein',
    categoryKo: '단백질 · 토양개량',
    categoryEn: 'Protein · Soil Fixation',
    growthDays: 70,
    dailyYieldKgPerM2: 0.09,
    waterConsumptionLPerM2Day: 2.1,
    recommendedSoilMethod: 'regolith_wash',
    soilMethodKo: '근류균 접종 세척 토양',
    soilMethodEn: 'Rhizobia-Inoculated Washed Regolith',
    caloriePer100g: 173,
    nutritionalHighlightsKo: '고단백 36% · 필수 아미노산 · 지방산',
    nutritionalHighlightsEn: '36% Protein · Essential Amino Acids · Lipids',
    minTempC: 18,
    optTempC: 24,
    optimalHumidityPct: '55 ~ 65%',
    optimalHumidityPctEn: '55 ~ 65%',
    phRange: 'pH 6.0 ~ 6.8',
    co2Ppm: 1400,
    lightHoursDay: 14,
    nutrientsKo: '초기 미량 질소 + 인(P)·몰리브덴(Mo) 보충으로 뿌리혹 활성화',
    nutrientsEn: 'Low starter N + Phosphorus (P) & Molybdenum (Mo) to activate root nodules',
    cultivationStepsKo: [
      { stage: '1. 균주 접종', detail: '종자에 질소고정 뿌리혹박테리아(Bradyrhizobium) 코팅' },
      { stage: '2. 파종', detail: '세척 토양에 3cm 깊이로 직파, 온실 내부 기류 순환' },
      { stage: '3. 개화 · 착협', detail: '개화기 물 부족 방지, 14시간 광주기 유지' },
      { stage: '4. 수확', detail: '70일 차 꼬투리 건조 후 탈곡 (두유·두부·단백질원 가공)' },
    ],
    cultivationStepsEn: [
      { stage: '1. Inoculation', detail: 'Coat seeds with nitrogen-fixing Bradyrhizobium bacteria' },
      { stage: '2. Direct Seeding', detail: 'Sow 3cm deep in washed regolith with continuous dome airflow' },
      { stage: '3. Flowering & Pod Set', detail: 'Prevent moisture stress at bloom; maintain 14h photoperiod' },
      { stage: '4. Harvest', detail: 'Thresh dried pods at day 70 for soy milk, tofu, and protein rations' },
    ],
    harvestTipKo: '수확 후 남은 뿌리는 질소 비료를 머금고 있어 다음 작물(감자·토마토)의 토양 비옥도를 높여줍니다.',
    harvestTipEn: 'Leave root nodules in soil after harvest to enrich nitrogen for subsequent potato or tomato crops.',
    whySuitedKo: '대기 질소를 고정해 토양을 개량하고 정착민에게 필수 식물성 단백질을 공급합니다.',
    whySuitedEn: 'Fixes atmospheric nitrogen to enrich Martian soil while supplying essential plant protein.',
    iconName: '🫘',
  },
  {
    id: 'mars_micro_tomato',
    nameKo: '방울토마토',
    nameEn: 'Micro-Tom Tomato',
    scientificName: 'Solanum lycopersicum',
    category: 'fruit',
    categoryKo: '과채류 · 항산화',
    categoryEn: 'Fruiting · Antioxidants',
    growthDays: 60,
    dailyYieldKgPerM2: 0.16,
    waterConsumptionLPerM2Day: 2.2,
    recommendedSoilMethod: 'hybrid_substrate',
    soilMethodKo: '코코피트 배지 + 정제수 수경',
    soilMethodEn: 'Coco-Coir Substrate + Purified Water',
    caloriePer100g: 18,
    nutritionalHighlightsKo: '라이코펜 · 비타민 C · 엽산',
    nutritionalHighlightsEn: 'Lycopene · Vitamin C · Folate',
    minTempC: 18,
    optTempC: 25,
    optimalHumidityPct: '60 ~ 70%',
    optimalHumidityPctEn: '60 ~ 70%',
    phRange: 'pH 5.8 ~ 6.3',
    co2Ppm: 1100,
    lightHoursDay: 16,
    nutrientsKo: '개화 후 칼슘(Ca)·칼륨(K) 비율 상향 배양액 (배꼽썩음병 방지)',
    nutrientsEn: 'Elevate Calcium (Ca) & Potassium (K) post-bloom to prevent blossom-end rot',
    cultivationStepsKo: [
      { stage: '1. 배지 세팅', detail: '코코피트 압축 배지를 화성 정제수로 팽창 후 포트 충진' },
      { stage: '2. 육묘 · 정식', detail: '초장 15~20cm 초소형 왜성종으로 다단 선반에 밀식' },
      { stage: '3. 진동 수분', detail: '곤충이 없으므로 개화 시 미세 진동봉으로 인공 수분 수행' },
      { stage: '4. 수확', detail: '60일 차부터 완숙 적색 열매 순차 수확' },
    ],
    cultivationStepsEn: [
      { stage: '1. Substrate Prep', detail: 'Hydrate compressed coco-coir bricks with purified Martian water' },
      { stage: '2. High-Density Racks', detail: 'Plant ultra-dwarf (15–20cm) cultivar on multi-tier vertical shelves' },
      { stage: '3. Buzz Pollination', detail: 'Pollinate blossoms using a micro-vibrator wand (no insects)' },
      { stage: '4. Harvest', detail: 'Pick vine-ripened red fruit sequentially starting day 60' },
    ],
    harvestTipKo: '키가 20cm 이하로 작아 좁은 3단 온실 랙에서도 1m²당 최대 수확량을 얻을 수 있습니다.',
    harvestTipEn: 'Compact <20cm canopy maximizes yield per m² inside 3-tier vertical greenhouse racks.',
    whySuitedKo: '다단 선반 재배에 유리하며 항산화 성분(라이코펜)이 우주 방사선 스트레스 완화에 도움을 줍니다.',
    whySuitedEn: 'Ideal for vertical racks and delivers lycopene antioxidants to mitigate space radiation stress.',
    iconName: '🍅',
  },
  {
    id: 'mars_spirulina',
    nameKo: '스피룰리나',
    nameEn: 'Spirulina Bioreactor',
    scientificName: 'Arthrospira platensis',
    category: 'algae',
    categoryKo: '미세조류 · 산소생산',
    categoryEn: 'Microalgae · O₂ Generation',
    growthDays: 4,
    dailyYieldKgPerM2: 0.38,
    waterConsumptionLPerM2Day: 0.8,
    recommendedSoilMethod: 'hydroponic',
    soilMethodKo: '튜브형 광생물반응기',
    soilMethodEn: 'Tubular Photobioreactor',
    caloriePer100g: 290,
    nutritionalHighlightsKo: '단백질 65% · 철분 · 산소 방출',
    nutritionalHighlightsEn: '65% Protein · Iron · O₂ Output',
    minTempC: 20,
    optTempC: 30,
    optimalHumidityPct: '밀폐 수중 배양',
    optimalHumidityPctEn: 'Sealed Aquatic',
    phRange: 'pH 9.0 ~ 10.2',
    co2Ppm: 2500,
    lightHoursDay: 24,
    nutrientsKo: '탄산수소나트륨(중탄산염) + 질소·인산염 알칼리 배양수',
    nutrientsEn: 'Sodium bicarbonate + Nitrogen/Phosphate alkaline medium',
    cultivationStepsKo: [
      { stage: '1. 배양액 조성', detail: '정제 지하수에 알칼리 염류 용해 (pH 9.5 조정)' },
      { stage: '2. 광배양 순환', detail: '투명 유리관 반응기에서 기포 순환 및 연속 LED 조사' },
      { stage: '3. CO2 포집', detail: '화성 대기에서 압축한 CO2를 주입해 광합성 및 O2 생성' },
      { stage: '4. 원심 여과 수확', detail: '4일마다 미세망으로 여과 수확, 배양수는 반응기로 즉시 환원' },
    ],
    cultivationStepsEn: [
      { stage: '1. Media Prep', detail: 'Dissolve alkaline salts in purified groundwater (adjust to pH 9.5)' },
      { stage: '2. Photobioreactor Loop', detail: 'Circulate bubbles through glass tubes under 24h continuous LED lighting' },
      { stage: '3. Martian CO₂ Capture', detail: 'Inject compressed Martian atmospheric CO₂ to drive photosynthesis & O₂ release' },
      { stage: '4. Micro-Mesh Harvest', detail: 'Filter biomass every 4 days and immediately recycle media back to reactor' },
    ],
    harvestTipKo: '강알칼리 환경 덕분에 다른 잡균이 거의 번식하지 않으며 4일 주기로 연속 수확이 가능합니다.',
    harvestTipEn: 'High alkalinity suppresses microbial contamination and supports continuous harvesting every 4 days.',
    whySuitedKo: '토양 없이 최소한의 물로 대량의 단백질과 호흡용 산소를 동시에 생산합니다.',
    whySuitedEn: 'Produces dense protein and breathable oxygen simultaneously with zero soil and minimal water.',
    iconName: '🧪',
  },
  {
    id: 'mars_sweet_potato',
    nameKo: '황금 고구마',
    nameEn: 'Martian Sweet Potato',
    scientificName: 'Ipomoea batatas',
    category: 'staple',
    categoryKo: '구황작물 · 전초식용',
    categoryEn: 'Root Crop · 100% Edible',
    growthDays: 95,
    dailyYieldKgPerM2: 0.18,
    waterConsumptionLPerM2Day: 2.4,
    recommendedSoilMethod: 'regolith_wash',
    soilMethodKo: '세척 모래토 70% + 부엽토 30%',
    soilMethodEn: '70% Washed Sandy Regolith + 30% Humus',
    caloriePer100g: 86,
    nutritionalHighlightsKo: '베타카로틴 · 식이섬유 · 잎/줄기 식용',
    nutritionalHighlightsEn: 'Beta-Carotene · Dietary Fiber · Edible Leaves',
    minTempC: 18,
    optTempC: 24,
    optimalHumidityPct: '60 ~ 70%',
    optimalHumidityPctEn: '60 ~ 70%',
    phRange: 'pH 5.6 ~ 6.4',
    co2Ppm: 1300,
    lightHoursDay: 14,
    nutrientsKo: '저질소 · 고칼륨 배합 (질소 과다 시 덩이뿌리 대신 덩굴만 무성)',
    nutrientsEn: 'Low Nitrogen, High Potassium blend (excess N favors vines over storage roots)',
    cultivationStepsKo: [
      { stage: '1. 배드 조성', detail: '배수가 잘 되는 세척 현무암 모래와 유기물을 두둑 형태로 배치' },
      { stage: '2. 삽목 식재', detail: '고구마 줄기 순을 비스듬히 심어 뿌리 착근 유도' },
      { stage: '3. 덩굴 관리', detail: '어린 잎과 줄기를 수시로 솎아 쌈·나물로 먼저 식용' },
      { stage: '4. 수확 · 큐어링', detail: '95일 차 수확 후 30°C 고습 환경에서 4일간 상처 치유 후 보관' },
    ],
    cultivationStepsEn: [
      { stage: '1. Raised Beds', detail: 'Form well-drained ridges of washed basalt sand and organic compost' },
      { stage: '2. Slip Planting', detail: 'Plant vine slips diagonally to promote adventitious root formation' },
      { stage: '3. Canopy Pruning', detail: 'Trim young leaves and shoots periodically as fresh edible greens' },
      { stage: '4. Harvest & Curing', detail: 'Harvest at day 95; cure at 30°C high humidity for 4 days before storage' },
    ],
    harvestTipKo: '덩이뿌리 수확 전에도 자라나는 잎과 순을 채소로 바로 먹을 수 있어 식량 공백을 메워줍니다.',
    harvestTipEn: 'Leaves and tender shoots are edible before root harvest, bridging crew fresh-food gaps.',
    whySuitedKo: '배수가 빠른 사질토에서도 잘 자라며 뿌리부터 잎까지 100% 식용 가능합니다.',
    whySuitedEn: 'Thrives in fast-draining sandy regolith and is 100% edible from root to leaf.',
    iconName: '🍠',
  },
];

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

  const scoredCrops = MARS_CROPS_DATABASE.map((crop) => {
    let score = 50;
    if (waterProb >= 60) score += 20;
    if (soil >= 55 && crop.recommendedSoilMethod === 'regolith_wash') score += 30;
    if (soil < 55 && crop.recommendedSoilMethod === 'hydroponic') score += 35;
    if (ambientPressureHpa > 7.0) score += 10;
    return { crop, score };
  }).sort((a, b) => b.score - a.score);

  const recommendedCrops = scoredCrops.slice(0, 3).map((item) => item.crop);

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
