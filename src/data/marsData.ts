import {
  FarmingStrategy,
  Landmark,
  MarsTelemetryPoint,
  NasaDatasetSpec,
  RegionId,
  RegionViewPreset,
} from '../types/mars';
import marsLandmarksJson from './marsLandmarks.json';

// Mars radius ~3,389.5 km -> ~59.16 km per degree
export const KM_PER_DEG = 59.16;

export const REGION_PRESETS: Record<RegionId, RegionViewPreset> = {
  global: {
    id: 'global',
    nameKo: '화성 전체',
    nameEn: 'Global Mars',
    subtitleKo: 'NASA Mars Trek 전구 위성 지도 (타르시스 · 엘리시움 · 유토피아 평원 통합 뷰)',
    centerLat: 5,
    centerLon: -15,
    ppd: 3.2,
    defaultStart: { lat: -3.2, lon: -128.4 },
    defaultDest: { lat: 6.4, lon: -119.2 },
  },
  tharsis: {
    id: 'tharsis',
    nameKo: '타르시스 화산대',
    nameEn: 'Tharsis Montes & Olympus',
    subtitleKo: '거대 순상 화산군 주변 지열·빙하 용융 지하수 및 선상지 탐사 구역',
    centerLat: 5.5,
    centerLon: -117.0,
    ppd: 14,
    defaultStart: { lat: -3.2, lon: -128.4 },
    defaultDest: { lat: 6.4, lon: -119.2 },
  },
  elysium: {
    id: 'elysium',
    nameKo: '엘리시움 화산·평원',
    nameEn: 'Elysium Mons & Utopia',
    subtitleKo: '지하 얼음층(SWIM)과 대규모 고대 홍수 유로(Athabasca)가 만나는 수자원 핵심 구역',
    centerLat: 26.0,
    centerLon: 149.0,
    ppd: 14,
    defaultStart: { lat: 14.5, lon: 158.0 },
    defaultDest: { lat: 34.2, lon: 143.5 },
  },
};

export const MARS_LANDMARKS: Landmark[] = marsLandmarksJson as Landmark[];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function normalizeLon(lon: number): number {
  let l = ((lon + 180) % 360 + 360) % 360 - 180;
  if (l === -180 && lon > 0) l = 180;
  return l;
}

// Fast 10°x10° spatial bucket index for O(1) nearby landmark queries across 680 sites
const BUCKET_DEG = 10;
const LANDMARK_BUCKETS = new Map<string, Landmark[]>();
for (const lm of MARS_LANDMARKS) {
  const bLat = Math.floor((lm.lat + 90) / BUCKET_DEG);
  const bLon = Math.floor((normalizeLon(lm.lon) + 180) / BUCKET_DEG);
  const key = `${bLat}_${bLon}`;
  let list = LANDMARK_BUCKETS.get(key);
  if (!list) {
    list = [];
    LANDMARK_BUCKETS.set(key, list);
  }
  list.push(lm);
}

export function findNearestLandmark(
  rawLat: number,
  rawLon: number,
  maxDeg = 1.6
): { landmark: Landmark; distDeg: number } | null {
  const lat = clamp(rawLat, -89.5, 89.5);
  const lon = normalizeLon(rawLon);
  const bLat = Math.floor((lat + 90) / BUCKET_DEG);
  const bLon = Math.floor((lon + 180) / BUCKET_DEG);
  const numLonBuckets = Math.round(360 / BUCKET_DEG);

  let bestLm: Landmark | null = null;
  let bestDist = maxDeg;

  for (let dLat = -1; dLat <= 1; dLat++) {
    const rLat = bLat + dLat;
    if (rLat < 0 || rLat > 18) continue;
    for (let dLon = -1; dLon <= 1; dLon++) {
      const rLon = ((bLon + dLon) % numLonBuckets + numLonBuckets) % numLonBuckets;
      const list = LANDMARK_BUCKETS.get(`${rLat}_${rLon}`);
      if (!list) continue;
      for (const lm of list) {
        const d = Math.hypot(lat - lm.lat, normalizeLon(lon - lm.lon));
        if (d < bestDist) {
          bestDist = d;
          bestLm = lm;
        }
      }
    }
  }

  return bestLm ? { landmark: bestLm, distDeg: bestDist } : null;
}

function hash2d(x: number, y: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash2d(ix, iy);
  const b = hash2d(ix + 1, iy);
  const c = hash2d(ix, iy + 1);
  const d = hash2d(ix + 1, iy + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function fbm(x: number, y: number): number {
  return (
    smoothNoise(x, y) * 0.55 +
    smoothNoise(x * 2.1, y * 2.1) * 0.28 +
    smoothNoise(x * 4.3, y * 4.3) * 0.17
  );
}

const MAJOR_CRATERS = [
  { lat: 10.5, lon: -126.0, r: 2.2, depth: 1800 },
  { lat: -1.5, lon: -107.0, r: 1.8, depth: 1650 },
  { lat: -10.8, lon: -130.5, r: 2.5, depth: 2100 },
  { lat: 15.2, lon: -115.2, r: 1.7, depth: 1500 },
  { lat: 21.0, lon: 136.5, r: 2.1, depth: 1700 },
  { lat: 29.0, lon: 162.0, r: 2.4, depth: 1950 },
  { lat: 12.2, lon: 141.0, r: 1.8, depth: 1600 },
  { lat: 37.0, lon: 158.5, r: 2.0, depth: 1750 },
  // Hellas Planitia giant basin
  { lat: -42.4, lon: 70.5, r: 18.0, depth: 7100 },
];

export function sampleElevationM(rawLat: number, rawLon: number): number {
  const lat = clamp(rawLat, -89.5, 89.5);
  const lon = normalizeLon(rawLon);

  // Martian hemisphere dichotomy: northern lowlands (-3500m), southern highlands (+1800m)
  let elev = lat > 15 ? -3200 : lat < -10 ? 1800 : -400 - lat * 80;

  // Tharsis regional bulge
  const bulgeDist = Math.hypot((lat - 2) * 0.9, normalizeLon(lon + 114));
  if (bulgeDist < 38) {
    elev += Math.max(0, 4600 * Math.exp(-(bulgeDist * bulgeDist) / 520));
  }

  // Olympus Mons
  const dOly = Math.hypot(lat - 18.65, normalizeLon(lon + 133.8));
  if (dOly < 8) {
    elev += 19200 * Math.exp(-(dOly * dOly) / 14.5);
    if (dOly < 0.85) elev -= 2100;
  }

  // Tharsis Montes
  const dAsc = Math.hypot(lat - 11.8, normalizeLon(lon + 104.1));
  if (dAsc < 6) elev += 14200 * Math.exp(-(dAsc * dAsc) / 8.5);
  const dPav = Math.hypot(lat - 0.8, normalizeLon(lon + 112.8));
  if (dPav < 6) elev += 11000 * Math.exp(-(dPav * dPav) / 8.0);
  const dArs = Math.hypot(lat + 8.3, normalizeLon(lon + 120.1));
  if (dArs < 6.5) elev += 13800 * Math.exp(-(dArs * dArs) / 9.2);

  // Valles Marineris & Noctis trough
  if (lon > -105 && lon < -40 && lat > -19 && lat < -2) {
    const canyonAxis = -6.5 - (lon + 101.5) * 0.19;
    const dAxis = Math.abs(lat - canyonAxis);
    if (dAxis < 3.2) {
      elev -= 4800 * Math.exp(-(dAxis * dAxis) / 2.4);
    }
  }

  // Elysium rise & volcanoes
  const dElyBulge = Math.hypot(lat - 24, normalizeLon(lon - 148));
  if (dElyBulge < 22) {
    elev += 2400 * Math.exp(-(dElyBulge * dElyBulge) / 180);
  }
  const dEly = Math.hypot(lat - 25.0, normalizeLon(lon - 147.2));
  if (dEly < 6) elev += 15500 * Math.exp(-(dEly * dEly) / 10.0);
  const dHec = Math.hypot(lat - 32.1, normalizeLon(lon - 150.2));
  if (dHec < 5) elev += 7200 * Math.exp(-(dHec * dHec) / 4.5);
  const dAlb = Math.hypot(lat - 18.9, normalizeLon(lon - 150.5));
  if (dAlb < 5) elev += 6800 * Math.exp(-(dAlb * dAlb) / 4.2);

  // Athabasca outflow channel
  const athLine = Math.abs(lat - (9.0 + (lon - 155.0) * 0.28));
  if (lon > 148 && lon < 167 && athLine < 2.2) {
    elev -= 900 * Math.exp(-(athLine * athLine) / 1.1);
  }

  // Craters
  for (const cr of MAJOR_CRATERS) {
    const dc = Math.hypot(lat - cr.lat, normalizeLon(lon - cr.lon));
    if (dc < cr.r * 1.35) {
      if (dc < cr.r * 0.78) {
        elev -= cr.depth * (1 - (dc / (cr.r * 0.78)) ** 2);
      } else {
        elev += cr.depth * 0.28 * Math.exp(-((dc - cr.r * 0.9) ** 2) / (cr.r * 0.15));
      }
    }
  }

  const n = fbm((lon + 180) * 0.16, (lat + 90) * 0.16);
  elev += (n - 0.5) * 750;

  // Blend smoothly toward verified landmark MOLA elevation when close
  const near = findNearestLandmark(lat, lon, 1.8);
  if (near) {
    const w = Math.exp(-(near.distDeg * near.distDeg) / 0.35);
    elev = elev * (1 - w) + near.landmark.elevationM * w;
  }

  return Math.round(elev);
}

export function sampleMarsTelemetry(
  rawLat: number,
  rawLon: number
): MarsTelemetryPoint {
  const lat = clamp(rawLat, -85, 85);
  const lon = normalizeLon(rawLon);
  const stepDeg = 0.35;
  const stepM = stepDeg * KM_PER_DEG * 1000;

  const elev = sampleElevationM(lat, lon);
  const eLeft = sampleElevationM(lat, lon - stepDeg);
  const eRight = sampleElevationM(lat, lon + stepDeg);
  const eUp = sampleElevationM(lat + stepDeg, lon);
  const eDown = sampleElevationM(lat - stepDeg, lon);

  const dx = (eRight - eLeft) / (2 * stepM);
  const dy = (eUp - eDown) / (2 * stepM);
  const slopeRad = Math.atan(Math.hypot(dx, dy));
  const slopeDeg = clamp(
    Number(((slopeRad * 180) / Math.PI * 2.5).toFixed(1)),
    0.3,
    42.0
  );

  const n1 = fbm((lon + 180) * 0.12 + 5.2, (lat + 90) * 0.12 + 3.1);
  const n2 = fbm((lon + 180) * 0.24 + 12.7, (lat + 90) * 0.24 + 8.4);

  // Geothermal & glacial melt proximity to major volcanoes
  const volcanoes = [
    { lat: 18.65, lon: -133.8 },
    { lat: 11.8, lon: -104.1 },
    { lat: 0.8, lon: -112.8 },
    { lat: -8.3, lon: -120.1 },
    { lat: 25.0, lon: 147.2 },
    { lat: 32.1, lon: 150.2 },
    { lat: 18.9, lon: 150.5 },
  ];

  let minV = 999;
  let glacialMeltZone = 0;
  for (const v of volcanoes) {
    const d = Math.hypot(lat - v.lat, normalizeLon(lon - v.lon));
    if (d < minV) minV = d;
    glacialMeltZone = Math.max(glacialMeltZone, Math.exp(-((d - 5.0) ** 2) / 6.8));
  }

  const geo = clamp(Math.round(95 * Math.exp(-(minV * minV) / 20)), 4, 98);

  // SWIM subsurface water-ice probability
  // Mid-to-high latitudes (>30°), Utopia Planitia, Athabasca, Noctis fault, and volcano glacial rings
  let swimIceProb = 16 + n1 * 18;
  const absLat = Math.abs(lat);
  if (absLat > 26) {
    swimIceProb += clamp((absLat - 26) / 30, 0, 1) * 58;
  }
  // Elysium/Utopia water belt
  if (lon > 125 && lon < 175 && lat > 22) {
    swimIceProb += clamp((lat - 22) / 20, 0, 1) * 26;
  }
  // Athabasca buried ice
  const dAth = Math.abs(lat - (9.0 + (lon - 155.0) * 0.28));
  if (lon > 148 && lon < 166 && dAth < 2.5) {
    swimIceProb += 24;
  }
  // Tharsis basal glacial melt + Noctis
  swimIceProb += glacialMeltZone * 36;
  const dNoctis = Math.hypot(lat + 6.5, normalizeLon(lon + 101.5));
  if (dNoctis < 6) swimIceProb += 26 * Math.exp(-(dNoctis * dNoctis) / 12);
  if (elev < -1500) swimIceProb += 12;
  if (elev > 11000) swimIceProb -= (elev - 11000) / 240;
  swimIceProb = clamp(Math.round(swimIceProb), 4, 97);

  // GRS gamma-ray hydrogen
  let gammaHydrogen = swimIceProb * 0.72 + glacialMeltZone * 20 + n2 * 15;
  if (lat > -5 && lat < 15 && lon > -130 && lon < -110) gammaHydrogen += 12;
  gammaHydrogen = clamp(Math.round(gammaHydrogen), 6, 95);

  // CRISM baseline soil fertility (phyllosilicate clays vs harsh basalt/perchlorate)
  let soilFertility = 36 + n1 * 30;
  if (geo > 65 || elev > 6500) soilFertility -= 28;
  if (elev < 3500 && slopeDeg < 7) soilFertility += 22;
  if (absLat > 26 && absLat < 42 && slopeDeg < 6) soilFertility += 14;

  // Blend geological telemetry priors from nearby verified Mars landmarks
  const nearLm = findNearestLandmark(lat, lon, 1.35);
  let effectiveSlope = slopeDeg;
  if (nearLm) {
    const w = Math.exp(-(nearLm.distDeg * nearLm.distDeg) / 0.32);
    const t = nearLm.landmark.type;
    if (t === 'ice_sheet') {
      swimIceProb = Math.max(swimIceProb, 68 * w + swimIceProb * (1 - w));
      gammaHydrogen = Math.max(gammaHydrogen, 62 * w + gammaHydrogen * (1 - w));
    } else if (t === 'agri_candidate') {
      soilFertility = Math.max(soilFertility, 72 * w + soilFertility * (1 - w));
      swimIceProb = Math.max(swimIceProb, 54 * w + swimIceProb * (1 - w));
      effectiveSlope = Number((slopeDeg * (1 - w * 0.55)).toFixed(1));
    } else if (t === 'volcano') {
      // Volcanoes have geothermal heat but steep terrain
      const geoBoost = 76 * w;
      if (geo < geoBoost) {
        // adjust below via clamp
      }
      effectiveSlope = clamp(Number((slopeDeg + 8.5 * w).toFixed(1)), 0.3, 42.0);
    } else if (t === 'canyon') {
      swimIceProb = Math.max(swimIceProb, 52 * w + swimIceProb * (1 - w));
      effectiveSlope = clamp(Number((slopeDeg + 4.5 * w).toFixed(1)), 0.3, 42.0);
    } else if (t === 'basecamp') {
      effectiveSlope = Number((slopeDeg * (1 - w * 0.45)).toFixed(1));
    }
  }

  const finalGeo =
    nearLm && nearLm.landmark.type === 'volcano'
      ? clamp(
          Math.round(
            Math.max(geo, 78 * Math.exp(-(nearLm.distDeg * nearLm.distDeg) / 0.5))
          ),
          4,
          98
        )
      : geo;

  const finalSwim = clamp(Math.round(swimIceProb), 4, 97);
  const finalGamma = clamp(Math.round(gammaHydrogen), 6, 95);
  const combinedWaterProb = clamp(
    Math.round(finalSwim * 0.56 + finalGamma * 0.29 + finalGeo * 0.15),
    5,
    96
  );

  const finalSoil = clamp(Math.round(soilFertility), 5, 94);
  const roughnessHazard = clamp(
    Math.round(effectiveSlope * 2.4 + n2 * 28 + (finalGeo > 75 ? 16 : 0)),
    4,
    98
  );
  const isObstacle = effectiveSlope >= 18.5;

  const flatBonus = clamp((10 - effectiveSlope) * 5, 0, 40);
  const elevAtmBonus = clamp((4000 - elev) / 220, 0, 32);
  const farmingScore = clamp(
    Math.round(
      combinedWaterProb * 0.38 +
        finalSoil * 0.34 +
        flatBonus * 0.45 +
        elevAtmBonus * 0.35 -
        (finalGeo > 72 ? 25 : 0)
    ),
    4,
    96
  );

  let recommendedStrategy: FarmingStrategy = 'explore_only';
  if (effectiveSlope < 9.5 && elev < 5800 && combinedWaterProb >= 48) {
    if (finalSoil >= 56 && farmingScore >= 60) {
      recommendedStrategy = 'direct_soil';
    } else {
      recommendedStrategy = 'earth_soil_hydro';
    }
  }

  return {
    lat: Number(lat.toFixed(2)),
    lon: Number(lon.toFixed(2)),
    elevationM: elev,
    slopeDeg: effectiveSlope,
    swimIceProb: finalSwim,
    gammaHydrogen: finalGamma,
    geothermalIndex: finalGeo,
    soilFertility: finalSoil,
    roughnessHazard,
    isObstacle,
    combinedWaterProb,
    farmingScore,
    recommendedStrategy,
  };
}

export interface GlobalTelemetryAtlas {
  width: number;
  height: number;
  latMin: number;
  latMax: number;
  water: Uint8Array;
  soil: Uint8Array;
  gamma: Uint8Array;
  geo: Uint8Array;
  slopeX10: Uint16Array;
}

let cachedAtlas: GlobalTelemetryAtlas | null = null;

export function getGlobalTelemetryAtlas(): GlobalTelemetryAtlas {
  if (cachedAtlas) return cachedAtlas;

  const width = 432; // ~0.83 deg/px longitude (-180..180)
  const height = 204; // ~0.83 deg/px latitude (+85..-85)
  const latMax = 85;
  const latMin = -85;
  const total = width * height;

  const water = new Uint8Array(total);
  const soil = new Uint8Array(total);
  const gamma = new Uint8Array(total);
  const geo = new Uint8Array(total);
  const slopeX10 = new Uint16Array(total);

  for (let y = 0; y < height; y++) {
    const lat = latMax - ((y + 0.5) / height) * (latMax - latMin);
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const lon = -180 + ((x + 0.5) / width) * 360;
      const pt = sampleMarsTelemetry(lat, lon);
      const idx = rowOffset + x;
      water[idx] = pt.combinedWaterProb;
      soil[idx] = pt.soilFertility;
      gamma[idx] = pt.gammaHydrogen;
      geo[idx] = pt.geothermalIndex;
      slopeX10[idx] = Math.round(pt.slopeDeg * 10);
    }
  }

  cachedAtlas = { width, height, latMin, latMax, water, soil, gamma, geo, slopeX10 };
  return cachedAtlas;
}

export const NASA_DATASETS: NasaDatasetSpec[] = [
  {
    id: 'mars_trek_wmts',
    category: 'terrain',
    instrument: 'Viking MDIM 2.1 + MOLA + CTX',
    mission: 'NASA JPL Solar System Treks',
    titleKo: 'NASA Mars Trek 실시간 WMTS 타일 API (현재 지도에 직접 연결됨)',
    resolution: '232 m/px (Viking 실사) · 463 m/px (MOLA 컬러 고도)',
    dataFormat: 'RESTful WMTS (EPSG:4326 / default028mm)',
    portalName: 'NASA Mars Trek Portal',
    portalUrl: 'https://trek.nasa.gov/mars/',
    purposeKo:
      '실제 화성 표면의 크레이터, 협곡, 올림푸스 산 등의 초고해상도 위성 사진과 MOLA 지형 음영 타일을 웹사이트에 직접 띄웁니다.',
    howItWorksKo:
      '이 웹사이트는 현재 NASA Mars Trek의 공식 WMTS 타일 서버(trek.nasa.gov/tiles/Mars/EQ/...)에서 실시간으로 타일을 수신해 렌더링합니다.',
  },
  {
    id: 'swim',
    category: 'water',
    instrument: 'SHARAD (MRO) + MARSIS (Mars Express) + GRS',
    mission: 'NASA PSI / JPL SWIM Project',
    titleKo: 'SWIM 지하 얼음 통합 지도 (Subsurface Water Ice Mapping)',
    resolution: '픽셀당 ~3~5 km (글로벌 중·저위도 커버)',
    dataFormat: 'GeoTIFF / NetCDF / PDS4',
    portalName: 'NASA PSI SWIM Portal',
    portalUrl: 'https://swim.psi.edu/',
    purposeKo:
      '화성 지표 아래 0~100m 깊이에 얼음이나 함수층이 존재할 확률(Consistency Index)을 계산하는 핵심 데이터입니다.',
    howItWorksKo:
      '지하 투과 레이더(SHARAD)의 유전율 반사 신호, 열관성(THEMIS), 중성자 분광기 데이터를 융합하여 화산 기저부나 유토피아 평원의 지하 얼음 매장 확률을 산출합니다.',
  },
  {
    id: 'grs',
    category: 'water',
    instrument: 'Gamma Ray Spectrometer (GRS) & Neutron Spectrometer',
    mission: '2001 Mars Odyssey',
    titleKo: '감마선·중성자 분광기 수소(H₂O) 함량 데이터',
    resolution: '약 300~500 km 풋프린트 (표층 1m 깊이)',
    dataFormat: 'PDS3 / GeoTIFF (WTH2O)',
    portalName: 'NASA PDS Geosciences Node',
    portalUrl: 'https://pds-geosciences.wustl.edu/missions/odyssey/grs.html',
    purposeKo:
      '제안하신 "감마선" 기술에 해당하는 실제 NASA 데이터로, 토양 표층 1m 이내에 결합된 물 분자(WEH) 비율(%)을 측정합니다.',
    howItWorksKo:
      '우주선이 화성 토양과 충돌할 때 방출되는 감마선과 중성자의 에너지 감쇠를 분석해 수소 원자 밀도(=수분 함량)를 역산합니다.',
  },
  {
    id: 'mola',
    category: 'terrain',
    instrument: 'MOLA (Mars Orbiter Laser Altimeter)',
    mission: 'Mars Global Surveyor (MGS)',
    titleKo: 'MOLA 레이저 고도계 DEM 및 경사도 데이터',
    resolution: '463 m/pixel (글로벌 MEGDR 128ppd)',
    dataFormat: 'GeoTIFF / IMG / PDS3',
    portalName: 'USGS Astrogeology Science Center',
    portalUrl: 'https://astrogeology.usgs.gov/search/map/Mars/GlobalSurveyor/MOLA/Mars_MGS_MOLA_DEM_mosaic_global_463m',
    purposeKo:
      '제안하신 "방사 레이저" 고도 측정 기술이며, 길찾기(네비게이션) 알고리즘의 경사도(Slope) 및 위험 지형 비용 계산의 뼈대입니다.',
    howItWorksKo:
      '레이저 펄스 왕복 시간으로 정밀 고도(m)를 측정하고, 인접 픽셀 간 고도 차로 경사각(°)을 계산해 로버 전복 위험 구간을 회피합니다.',
  },
  {
    id: 'crism',
    category: 'soil',
    instrument: 'CRISM (영상 분광계) & OMEGA',
    mission: 'MRO / Mars Express',
    titleKo: 'CRISM 광물 성분 및 토양 독성(점토·과염소산염) 데이터',
    resolution: '18~200 m/pixel',
    dataFormat: 'PDS3 / Spectral Cubes',
    portalName: 'PDS Geosciences CRISM',
    portalUrl: 'https://pds-geosciences.wustl.edu/missions/mro/crism.htm',
    purposeKo:
      '화성 현지 토양으로 농사가 가능한지(점토광물 풍부 vs 과염소산염 독성) 판별해 "지구 흙 수경재배 전환 여부"를 결정합니다.',
    howItWorksKo:
      '적외선 반사 스펙트럼으로 물에 의해 형성된 점토(Phyllosilicates)와 황산염을 탐지합니다.',
  },
  {
    id: 'themis',
    category: 'ar_nav',
    instrument: 'THEMIS (열방출 영상 시스템) & InSight',
    mission: '2001 Mars Odyssey / InSight',
    titleKo: 'THEMIS 열관성(Thermal Inertia) 및 지반 강도 데이터',
    resolution: '100 m/pixel',
    dataFormat: 'GeoTIFF / PDS3',
    portalName: 'ASU Mars Space Flight Facility',
    portalUrl: 'https://themis.asu.edu/',
    purposeKo:
      '모래 늪(Dust trap, 로버 바퀴 빠짐)과 단단한 기반암을 구분하고, AR 바이저의 지면 안전도 경고를 제공합니다.',
    howItWorksKo:
      '낮과 밤의 지표 온도 변화율(열관성)을 계산해 미세먼지 구덩이를 네비게이션 경로에서 회피합니다.',
  },
];
