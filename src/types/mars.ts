export type RegionId =
  | 'global'
  | 'tharsis'
  | 'elysium'
  | 'valles_marineris'
  | 'utopia'
  | 'arcadia'
  | 'syrtis_isidis'
  | 'hellas';

export type MarsBaseLayerId = 'viking' | 'mola' | 'hybrid';

export type NavigationMode = 'safe' | 'fast' | 'water';

export type ClickTool = 'destination' | 'start' | null;

export type FarmingStrategy =
  | 'direct_soil'
  | 'earth_soil_hydro'
  | 'explore_only';

export type FarmingTier =
  | 'optimal'     // 파랑: 최상 (현지 토양·지하수 최적)
  | 'suitable'    // 초록: 적합 (비닐하우스·토양 개량)
  | 'possible'    // 노랑~주황: 가능성 있음 (밀폐 온실·지구흙 수경재배)
  | 'unsuitable'  // 빨강: 농업 불가 (고지대·수분 부족)
  | 'lethal';     // 갈색: 진입 극위험 (절벽·칼데라·치명 구역)

export interface SensorLayers {
  swimWater: boolean;
  elevation: boolean;
  soilFertility: boolean;
  slopeHazard: boolean;
  geothermal: boolean;
}

export type LandmarkType =
  | 'volcano'
  | 'canyon'
  | 'ice_sheet'
  | 'agri_candidate'
  | 'basecamp';

export type LandmarkTier = 1 | 2 | 3;

export interface Landmark {
  id: string;
  region: 'tharsis' | 'elysium' | 'other';
  nameKo: string;
  nameEn: string;
  type: LandmarkType;
  rawCategory: string;
  lat: number;
  lon: number;
  elevationM: number;
  tier: LandmarkTier;
  descriptionKo: string;
  waterNoteKo: string;
}

export interface MarsTelemetryPoint {
  lat: number;
  lon: number;
  elevationM: number;
  slopeDeg: number;
  swimIceProb: number;
  gammaHydrogen: number;
  geothermalIndex: number;
  soilFertility: number;
  roughnessHazard: number;
  isObstacle: boolean;
  combinedWaterProb: number;
  farmingScore: number;
  recommendedStrategy: FarmingStrategy;
  farmingTier: FarmingTier;
  farmingLabelKo: string;
  farmingSolutionKo: string;
  iceDepthM?: number;
  solarFluxWm2?: number;
  daylightHours?: number;
  perchloratePct?: number;
  albaHazardPenalty?: number;
  albaHazardName?: string;
}

export interface GridCell extends MarsTelemetryPoint {
  row: number;
  col: number;
}

export interface RegionViewPreset {
  id: RegionId;
  nameKo: string;
  nameEn: string;
  subtitleKo: string;
  centerLat: number;
  centerLon: number;
  ppd: number; // pixels per degree at default view
}

export interface RoutePoint {
  lat: number;
  lon: number;
  elevationM: number;
  slopeDeg: number;
  waterProb: number;
  distanceFromStartKm: number;
  hazardLevel: 'low' | 'moderate' | 'high';
}

export interface RouteWaypoint {
  index: number;
  code: string;
  lat: number;
  lon: number;
  distanceFromStartKm: number;
  segmentDistanceKm: number;
  bearingDeg: number;
  directionKo: string;
  elevationM: number;
  slopeDeg: number;
  waterProb: number;
  instructionKo: string;
  tag: 'start' | 'avoid' | 'water' | 'checkpoint' | 'target';
}

export interface RouteResult {
  found: boolean;
  mode: NavigationMode;
  terrainSource: 'nasa_tiles' | 'model';
  snappedToSafeApproach?: boolean;
  originalDest?: { lat: number; lon: number };
  points: RoutePoint[];
  waypoints: RouteWaypoint[];
  totalDistanceKm: number;
  directDistanceKm: number;
  estimatedHoursRover: number;
  estimatedHoursEva: number;
  maxSlopeDeg: number;
  avgWaterProb: number;
  hazardSegmentsCount: number;
  safetyScore: number;
  summaryKo: string;
}

export interface NasaDatasetSpec {
  id: string;
  category: 'water' | 'terrain' | 'soil' | 'ar_nav';
  instrument: string;
  mission: string;
  titleKo: string;
  resolution: string;
  dataFormat: string;
  portalName: string;
  portalUrl: string;
  purposeKo: string;
  howItWorksKo: string;
}
