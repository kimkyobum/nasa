import { Landmark } from '../types/mars';

export interface AlbaObstacle {
  id: string;
  name: string;
  type: string;
  lat: number;
  lon: number; // normalized -180..180
  radiusKm: number;
  maxSlopeDeg: number;
  hazardLevel: 'CRITICAL' | 'HIGH' | 'MODERATE';
  routingPenalty: number; // Infinity for CRITICAL
  description: string;
}

export interface AlbaIceSolarSample {
  iceDepthM: number;
  waterIceWtPct: number;
  daylightHours: number;
  solarFluxWm2: number;
  perchlorateRiskPct: number;
}

// Section 1: 8 Volcanic & Geothermal sites (Lon 247..253 -> -113..-107°E)
export const ALBA_GEOTHERMAL_LANDMARKS: Landmark[] = [
  {
    id: 'geo_001',
    region: 'tharsis',
    nameKo: '알바 몬스 북부 열수 균열대',
    nameEn: 'Alba Mons North Fissure Zone',
    type: 'volcano',
    rawCategory: '화산 지열·가스 분출지',
    lat: 41.25,
    lon: -110.2,
    elevationM: 4120,
    tier: 2,
    descriptionKo: '계절성 염화수소(HCl 3.8 ppb) 방출 및 +4.2K 열적 이상 관측 지점.',
    waterNoteKo: '지하 추정 온도 -12.5°C로 지하 열수 및 얼음 융해 가능성 최상(정착 점수 91).',
  },
  {
    id: 'geo_002',
    region: 'tharsis',
    nameKo: '알바 포사이 동부 지구대',
    nameEn: 'Alba Fossae East Graben',
    type: 'canyon',
    rawCategory: '단층 지구대·용암 튜브',
    lat: 39.8,
    lon: -108.9,
    elevationM: 3450,
    tier: 2,
    descriptionKo: '단층 균열 지대로 지열 추출 및 지하 용암 튜브 방사선 차폐 활용 유리.',
    waterNoteKo: '열적 이상 +2.1K, 지하 얼음 융해수 추출 잠재력 양호(정착 점수 78).',
  },
  {
    id: 'geo_003',
    region: 'tharsis',
    nameKo: '케라우니우스 포사이 북부 능선',
    nameEn: 'Ceraunius Fossae Northern Ridge',
    type: 'agri_candidate',
    rawCategory: '완만 화산 능선',
    lat: 38.4,
    lon: -111.1,
    elevationM: 2890,
    tier: 3,
    descriptionKo: '완만한 경사도와 안정적 기반암을 갖춘 탐사 착륙 및 물류 적합 지형.',
    waterNoteKo: '지하 온도 -35.2°C, 사면 안정성 우수(정착 점수 65).',
  },
  {
    id: 'geo_004',
    region: 'tharsis',
    nameKo: '알바 칼데라 남부 림',
    nameEn: 'Alba Caldera Rim South',
    type: 'volcano',
    rawCategory: '칼데라 능선',
    lat: 40.45,
    lon: -110.05,
    elevationM: 6420,
    tier: 2,
    descriptionKo: '고도 6,420m의 휴화산 칼데라 외벽. 지열(+3.5K)이 높으나 접근 경사 가파름.',
    waterNoteKo: 'HCl 2.9 ppb 관측, 고지대 저기압 주의(정착 점수 72).',
  },
  {
    id: 'geo_005',
    region: 'tharsis',
    nameKo: '아르카디아-알바 열수 분지',
    nameEn: 'Arcadia-Alba Thermal Basin',
    type: 'ice_sheet',
    rawCategory: '빙하·잔류 열원 교차지',
    lat: 42.3,
    lon: -111.8,
    elevationM: 2150,
    tier: 2,
    descriptionKo: '얕은 지하 빙하층과 화산 잔류 열원이 만나는 대규모 수자원 채굴 최적지.',
    waterNoteKo: '심도 0.2~0.3m 내 70%대 고순도 지하 얼음 매장 + 잔류 지열(정착 점수 89).',
  },
  {
    id: 'geo_006',
    region: 'tharsis',
    nameKo: '탄탈루스 북부 열수 분출공',
    nameEn: 'Tantalus North Vent',
    type: 'volcano',
    rawCategory: '열수 분출 후보지',
    lat: 41.8,
    lon: -108.1,
    elevationM: 3780,
    tier: 2,
    descriptionKo: '과거 열수 분출 흔적(규산염 퇴적물) 다수 분포. 외계 미생물 흔적 탐사 구역.',
    waterNoteKo: 'HCl 3.1 ppb · 열적 이상 +3.8K(정착 점수 84).',
  },
  {
    id: 'geo_007',
    region: 'tharsis',
    nameKo: '우라니우스 북부 고대 유출로',
    nameEn: 'Uranius North Outflow Channel',
    type: 'agri_candidate',
    rawCategory: '평탄 용암·수로 지형',
    lat: 37.5,
    lon: -109.6,
    elevationM: 2410,
    tier: 3,
    descriptionKo: '일조량(422 W/m²)이 풍부하고 평탄해 태양광·농업 부지로 적합.',
    waterNoteKo: '지하 1.8m 깊이 약 22 wt% 수분 얼음층 분포(정착 점수 68).',
  },
  {
    id: 'geo_008',
    region: 'tharsis',
    nameKo: '서부 알바 용암 튜브 지대',
    nameEn: 'Western Alba Lava Tube Complex',
    type: 'canyon',
    rawCategory: '지하 용암 동굴',
    lat: 40.1,
    lon: -112.4,
    elevationM: 3120,
    tier: 2,
    descriptionKo: '붕괴 천장(Skylight) 확인 구역으로 방사선 및 모래폭풍 차폐 우수.',
    waterNoteKo: '열적 이상 +1.6K, 지하 얼음 심도 약 0.9m(정착 점수 82).',
  },
];

// Section 3-B: 10 Hazardous Terrain Obstacles (Lon 247..253 -> -113..-107°E)
export const ALBA_HAZARD_OBSTACLES: AlbaObstacle[] = [
  {
    id: 'OBS-01',
    name: 'Alba Central Caldera Pit',
    type: 'caldera_cliff',
    lat: 40.35,
    lon: -110.0,
    radiusKm: 14.0,
    maxSlopeDeg: 44.8,
    hazardLevel: 'CRITICAL',
    routingPenalty: Infinity,
    description: '알바 몬스 정상부 거대 칼데라 함몰지. 수직 단애로 횡단 불가.',
  },
  {
    id: 'OBS-02',
    name: 'Tantalus Fossae Deep Canyon',
    type: 'cliff_fissure',
    lat: 40.3,
    lon: -108.4,
    radiusKm: 9.5,
    maxSlopeDeg: 41.5,
    hazardLevel: 'CRITICAL',
    routingPenalty: Infinity,
    description: '깊이 450m 이상의 수직 협곡 단층대.',
  },
  {
    id: 'OBS-03',
    name: 'Alba South Impact Crater',
    type: 'crater',
    lat: 38.9,
    lon: -110.5,
    radiusKm: 8.5,
    maxSlopeDeg: 34.2,
    hazardLevel: 'CRITICAL',
    routingPenalty: Infinity,
    description: '직경 17km 급경사 충돌 크레이터.',
  },
  {
    id: 'OBS-04',
    name: 'Western Dust Trap Basin',
    type: 'soft_sand_dune',
    lat: 38.8,
    lon: -112.2,
    radiusKm: 7.2,
    maxSlopeDeg: 11.5,
    hazardLevel: 'HIGH',
    routingPenalty: 4.5,
    description: '미세 먼지 퇴적 분지(바퀴 빠짐 위험).',
  },
  {
    id: 'OBS-05',
    name: 'North Ridge Boulder Field',
    type: 'rock_field',
    lat: 41.4,
    lon: -110.9,
    radiusKm: 5.5,
    maxSlopeDeg: 18.5,
    hazardLevel: 'MODERATE',
    routingPenalty: 2.2,
    description: '고밀도 현무암 암석 지대.',
  },
  {
    id: 'OBS-06',
    name: 'Ceraunius Fault Scarp',
    type: 'fault_scarp',
    lat: 37.8,
    lon: -110.8,
    radiusKm: 6.8,
    maxSlopeDeg: 29.0,
    hazardLevel: 'CRITICAL',
    routingPenalty: Infinity,
    description: '급경사 단층 절벽.',
  },
  {
    id: 'OBS-07',
    name: 'Eastern Wind-Scoured Corridor',
    type: 'dust_storm_corridor',
    lat: 39.2,
    lon: -107.8,
    radiusKm: 10.0,
    maxSlopeDeg: 8.0,
    hazardLevel: 'HIGH',
    routingPenalty: 3.0,
    description: '계절풍 집중 통로.',
  },
  {
    id: 'OBS-08',
    name: 'Arcadia Sublimation Sinkholes',
    type: 'collapse_pit',
    lat: 42.1,
    lon: -110.2,
    radiusKm: 4.5,
    maxSlopeDeg: 36.0,
    hazardLevel: 'CRITICAL',
    routingPenalty: Infinity,
    description: '지하 얼음 승화 싱크홀 군집 지대.',
  },
  {
    id: 'OBS-09',
    name: 'Northwest Lava Flow Front',
    type: 'rough_lava',
    lat: 41.1,
    lon: -112.1,
    radiusKm: 6.0,
    maxSlopeDeg: 16.2,
    hazardLevel: 'MODERATE',
    routingPenalty: 2.0,
    description: '거친 아아(Aa) 용암류 선단부.',
  },
  {
    id: 'OBS-10',
    name: 'Southeast Secondary Crater Cluster',
    type: 'crater',
    lat: 37.6,
    lon: -108.6,
    radiusKm: 5.0,
    maxSlopeDeg: 27.5,
    hazardLevel: 'HIGH',
    routingPenalty: 5.0,
    description: '소형 운석구 밀집 지역.',
  },
];

// Section 3-A: MOLA DEM 13x13 Elevation Grid (Lat 37.0..43.0 by 0.5, Lon -113.0..-107.0 by 0.5)
// Rows: lat = 37.0 + r * 0.5 (r = 0..12), Cols: lon = -113.0 + c * 0.5 (c = 0..12)
const ALBA_DEM_GRID: number[][] = [
  [2180, 2240, 2310, 2390, 2460, 2520, 2580, 2530, 2470, 2410, 2350, 2290, 2220], // 37.0
  [2320, 2410, 2510, 2600, 2690, 2760, 2830, 2780, 2710, 2630, 2540, 2450, 2370], // 37.5
  [2490, 2610, 2740, 2860, 2980, 3090, 3180, 3110, 3020, 2910, 2790, 2680, 2560], // 38.0
  [2680, 2840, 3010, 3190, 3360, 3510, 3640, 3550, 3420, 3270, 3110, 2950, 2790], // 38.5
  [2890, 3110, 3350, 3610, 3880, 4120, 4290, 4180, 3980, 3750, 3510, 3280, 3050], // 39.0
  [3120, 3420, 3780, 4190, 4620, 5040, 5310, 5150, 4820, 4410, 3990, 3610, 3290], // 39.5
  [3310, 3690, 4150, 4720, 5380, 6020, 6480, 6210, 5640, 4980, 4350, 3840, 3420], // 40.0
  [3250, 3610, 4050, 4610, 5290, 6110, 6580, 6190, 5520, 4810, 4190, 3710, 3310], // 40.5
  [3010, 3310, 3680, 4120, 4650, 5180, 5490, 5210, 4740, 4210, 3750, 3380, 3050], // 41.0
  [2740, 2960, 3240, 3580, 3950, 4280, 4460, 4290, 3980, 3610, 3280, 2990, 2760], // 41.5
  [2460, 2620, 2810, 3040, 3290, 3510, 3640, 3520, 3310, 3060, 2830, 2640, 2480], // 42.0
  [2210, 2330, 2470, 2630, 2810, 2960, 3050, 2970, 2820, 2650, 2490, 2340, 2220], // 42.5
  [1980, 2070, 2180, 2310, 2450, 2560, 2620, 2570, 2460, 2320, 2190, 2080, 1990], // 43.0
];

// Section 2: 6x6 Subsurface Ice & Solar Irradiance Grid
// Rows: lat = 37.5 + r * 1.0 (r = 0..5), Cols: lon = -112.5 + c * 1.0 (c = 0..5)
const ALBA_ICE_GRID: AlbaIceSolarSample[][] = [
  [
    { iceDepthM: 2.2, waterIceWtPct: 18.4, daylightHours: 12.1, solarFluxWm2: 422.5, perchlorateRiskPct: 0.68 },
    { iceDepthM: 2.0, waterIceWtPct: 20.1, daylightHours: 12.1, solarFluxWm2: 422.1, perchlorateRiskPct: 0.66 },
    { iceDepthM: 1.9, waterIceWtPct: 21.5, daylightHours: 12.1, solarFluxWm2: 421.8, perchlorateRiskPct: 0.65 },
    { iceDepthM: 1.8, waterIceWtPct: 22.0, daylightHours: 12.1, solarFluxWm2: 422.0, perchlorateRiskPct: 0.69 },
    { iceDepthM: 2.1, waterIceWtPct: 19.2, daylightHours: 12.1, solarFluxWm2: 422.4, perchlorateRiskPct: 0.71 },
    { iceDepthM: 2.3, waterIceWtPct: 17.8, daylightHours: 12.1, solarFluxWm2: 422.6, perchlorateRiskPct: 0.72 },
  ],
  [
    { iceDepthM: 1.9, waterIceWtPct: 21.8, daylightHours: 11.9, solarFluxWm2: 415.5, perchlorateRiskPct: 0.64 },
    { iceDepthM: 1.8, waterIceWtPct: 22.5, daylightHours: 11.9, solarFluxWm2: 415.2, perchlorateRiskPct: 0.65 },
    { iceDepthM: 1.5, waterIceWtPct: 25.0, daylightHours: 11.9, solarFluxWm2: 414.8, perchlorateRiskPct: 0.62 },
    { iceDepthM: 1.6, waterIceWtPct: 24.1, daylightHours: 11.9, solarFluxWm2: 415.0, perchlorateRiskPct: 0.70 },
    { iceDepthM: 1.7, waterIceWtPct: 23.0, daylightHours: 11.9, solarFluxWm2: 415.3, perchlorateRiskPct: 0.68 },
    { iceDepthM: 1.9, waterIceWtPct: 20.9, daylightHours: 11.9, solarFluxWm2: 415.6, perchlorateRiskPct: 0.67 },
  ],
  [
    { iceDepthM: 1.4, waterIceWtPct: 29.5, daylightHours: 11.7, solarFluxWm2: 408.8, perchlorateRiskPct: 0.59 },
    { iceDepthM: 1.2, waterIceWtPct: 31.4, daylightHours: 11.7, solarFluxWm2: 408.5, perchlorateRiskPct: 0.58 },
    { iceDepthM: 0.9, waterIceWtPct: 38.2, daylightHours: 11.7, solarFluxWm2: 408.1, perchlorateRiskPct: 0.55 },
    { iceDepthM: 1.1, waterIceWtPct: 34.0, daylightHours: 11.7, solarFluxWm2: 408.3, perchlorateRiskPct: 0.61 },
    { iceDepthM: 1.3, waterIceWtPct: 30.8, daylightHours: 11.7, solarFluxWm2: 408.6, perchlorateRiskPct: 0.60 },
    { iceDepthM: 1.5, waterIceWtPct: 28.1, daylightHours: 11.7, solarFluxWm2: 409.0, perchlorateRiskPct: 0.63 },
  ],
  [
    { iceDepthM: 0.9, waterIceWtPct: 42.1, daylightHours: 11.5, solarFluxWm2: 401.5, perchlorateRiskPct: 0.52 },
    { iceDepthM: 0.7, waterIceWtPct: 45.6, daylightHours: 11.5, solarFluxWm2: 401.2, perchlorateRiskPct: 0.50 },
    { iceDepthM: 0.5, waterIceWtPct: 52.8, daylightHours: 11.5, solarFluxWm2: 400.9, perchlorateRiskPct: 0.48 },
    { iceDepthM: 0.6, waterIceWtPct: 49.1, daylightHours: 11.5, solarFluxWm2: 401.0, perchlorateRiskPct: 0.52 },
    { iceDepthM: 0.8, waterIceWtPct: 44.3, daylightHours: 11.5, solarFluxWm2: 401.4, perchlorateRiskPct: 0.54 },
    { iceDepthM: 1.0, waterIceWtPct: 40.0, daylightHours: 11.5, solarFluxWm2: 401.8, perchlorateRiskPct: 0.56 },
  ],
  [
    { iceDepthM: 0.5, waterIceWtPct: 55.2, daylightHours: 11.3, solarFluxWm2: 394.3, perchlorateRiskPct: 0.46 },
    { iceDepthM: 0.4, waterIceWtPct: 58.0, daylightHours: 11.3, solarFluxWm2: 394.0, perchlorateRiskPct: 0.45 },
    { iceDepthM: 0.3, waterIceWtPct: 64.5, daylightHours: 11.3, solarFluxWm2: 393.8, perchlorateRiskPct: 0.42 },
    { iceDepthM: 0.4, waterIceWtPct: 61.2, daylightHours: 11.3, solarFluxWm2: 394.1, perchlorateRiskPct: 0.46 },
    { iceDepthM: 0.5, waterIceWtPct: 57.4, daylightHours: 11.3, solarFluxWm2: 394.5, perchlorateRiskPct: 0.48 },
    { iceDepthM: 0.6, waterIceWtPct: 53.9, daylightHours: 11.3, solarFluxWm2: 394.9, perchlorateRiskPct: 0.50 },
  ],
  [
    { iceDepthM: 0.3, waterIceWtPct: 66.8, daylightHours: 11.1, solarFluxWm2: 386.5, perchlorateRiskPct: 0.41 },
    { iceDepthM: 0.2, waterIceWtPct: 71.4, daylightHours: 11.1, solarFluxWm2: 386.2, perchlorateRiskPct: 0.39 },
    { iceDepthM: 0.2, waterIceWtPct: 73.0, daylightHours: 11.1, solarFluxWm2: 386.0, perchlorateRiskPct: 0.38 },
    { iceDepthM: 0.3, waterIceWtPct: 69.5, daylightHours: 11.1, solarFluxWm2: 386.3, perchlorateRiskPct: 0.40 },
    { iceDepthM: 0.3, waterIceWtPct: 67.1, daylightHours: 11.1, solarFluxWm2: 386.6, perchlorateRiskPct: 0.43 },
    { iceDepthM: 0.4, waterIceWtPct: 63.8, daylightHours: 11.1, solarFluxWm2: 387.0, perchlorateRiskPct: 0.45 },
  ],
];

export function sampleAlbaDemElevation(lat: number, lon: number): number | null {
  if (lat < 37.0 || lat > 43.0 || lon < -113.0 || lon > -107.0) return null;
  const fr = ((lat - 37.0) / 6.0) * 12;
  const fc = ((lon + 113.0) / 6.0) * 12;
  const r0 = Math.min(11, Math.max(0, Math.floor(fr)));
  const c0 = Math.min(11, Math.max(0, Math.floor(fc)));
  const dr = fr - r0;
  const dc = fc - c0;

  const v00 = ALBA_DEM_GRID[r0][c0];
  const v01 = ALBA_DEM_GRID[r0][c0 + 1];
  const v10 = ALBA_DEM_GRID[r0 + 1][c0];
  const v11 = ALBA_DEM_GRID[r0 + 1][c0 + 1];

  return (
    v00 * (1 - dr) * (1 - dc) +
    v01 * (1 - dr) * dc +
    v10 * dr * (1 - dc) +
    v11 * dr * dc
  );
}

export function sampleAlbaIceSolar(lat: number, lon: number): AlbaIceSolarSample | null {
  if (lat < 37.0 || lat > 43.0 || lon < -113.0 || lon > -107.0) return null;
  const fr = Math.max(0, Math.min(5, lat - 37.5));
  const fc = Math.max(0, Math.min(5, lon + 112.5));
  const r0 = Math.min(4, Math.floor(fr));
  const c0 = Math.min(4, Math.floor(fc));
  const dr = fr - r0;
  const dc = fc - c0;

  const a = ALBA_ICE_GRID[r0][c0];
  const b = ALBA_ICE_GRID[r0][c0 + 1];
  const c = ALBA_ICE_GRID[r0 + 1][c0];
  const d = ALBA_ICE_GRID[r0 + 1][c0 + 1];

  const interp = (k: keyof AlbaIceSolarSample) =>
    a[k] * (1 - dr) * (1 - dc) +
    b[k] * (1 - dr) * dc +
    c[k] * dr * (1 - dc) +
    d[k] * dr * dc;

  return {
    iceDepthM: Number(interp('iceDepthM').toFixed(2)),
    waterIceWtPct: Number(interp('waterIceWtPct').toFixed(1)),
    daylightHours: Number(interp('daylightHours').toFixed(1)),
    solarFluxWm2: Math.round(interp('solarFluxWm2')),
    perchlorateRiskPct: Number(interp('perchlorateRiskPct').toFixed(2)),
  };
}

export function getAlbaObstacleAt(lat: number, lon: number): AlbaObstacle | null {
  if (lat < 36.5 || lat > 43.5 || lon < -113.5 || lon > -106.5) return null;
  const meanLatRad = (lat * Math.PI) / 180;
  for (let i = 0; i < ALBA_HAZARD_OBSTACLES.length; i++) {
    const obs = ALBA_HAZARD_OBSTACLES[i];
    const dLatKm = (lat - obs.lat) * 59.16;
    const dLonKm = (lon - obs.lon) * 59.16 * Math.cos(meanLatRad);
    if (Math.hypot(dLatKm, dLonKm) <= obs.radiusKm) {
      return obs;
    }
  }
  return null;
}
