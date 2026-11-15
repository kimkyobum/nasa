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

export type ClickTool = 'destination' | 'start' | 'dome' | null;

export type DomeTier = 'outpost' | 'habitat' | 'metropolis';

export type DomeSubsystemId = 'overview' | 'drill' | 'airlock' | 'hydroponics' | 'spire';

export interface DeployedDome {
  id: string;
  nameEn: string;
  nameKo: string;
  lat: number;
  lon: number;
  tier: DomeTier;
  crewCount: number;
  selectedCropIds: string[];
  installedAtSol: number;
}

export type FarmingStrategy =
  | 'direct_soil'
  | 'earth_soil_hydro'
  | 'explore_only';

export type FarmingTier =
  | 'optimal'     // Blue: Optimal (local clay soil & subsurface water)
  | 'suitable'    // Green: Suitable (greenhouse & soil remediation)
  | 'possible'    // Amber: Viable (sealed dome & Earth-media hydroponics)
  | 'unsuitable'  // Red: Unsuitable (high elevation / arid)
  | 'lethal';     // Brown: Extreme Hazard (cliffs, calderas, lethal terrain)

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
  rawCategoryEn?: string;
  lat: number;
  lon: number;
  elevationM: number;
  tier: LandmarkTier;
  descriptionKo: string;
  descriptionEn?: string;
  waterNoteKo: string;
  waterNoteEn?: string;
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
  farmingLabelEn: string;
  farmingSolutionKo: string;
  farmingSolutionEn: string;
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
  subtitleEn: string;
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
  directionEn: string;
  elevationM: number;
  slopeDeg: number;
  waterProb: number;
  instructionKo: string;
  instructionEn: string;
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
  summaryEn: string;
}

export interface NasaDatasetSpec {
  id: string;
  category: 'water' | 'terrain' | 'soil' | 'ar_nav';
  instrument: string;
  mission: string;
  titleKo: string;
  titleEn: string;
  resolution: string;
  resolutionEn: string;
  dataFormat: string;
  portalName: string;
  portalUrl: string;
  purposeKo: string;
  purposeEn: string;
  howItWorksKo: string;
  howItWorksEn: string;
}
