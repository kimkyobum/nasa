import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { sampleMarsTelemetry } from '../data/marsData';
import { RouteResult } from '../types/mars';

export type CameraViewMode = 'orbit' | 'roadview';

export interface RouteGlideInfo {
  lat: number;
  lon: number;
  distanceKm: number;
  elevationM: number;
  slopeDeg: number;
  nearEdge: boolean;
}

interface MarsRegion3DViewerProps {
  lat: number;
  lon: number;
  reliefScale: number;
  showArGrid: boolean;
  autoRotate: boolean;
  cameraViewMode?: CameraViewMode;
  route?: RouteResult;
  startCoord?: { lat: number; lon: number } | null;
  destCoord?: { lat: number; lon: number } | null;
  onRoutePositionChange?: (info: RouteGlideInfo) => void;
  onSelectLatLon?: (lat: number, lon: number) => void;
  className?: string;
}

interface RouteSample {
  x: number;
  z: number;
  tx: number;
  tz: number;
  lat: number;
  lon: number;
  distanceKm: number;
  elevationM: number;
  slopeDeg: number;
}

interface RibbonEntry {
  mesh: THREE.Mesh;
  leftXZ: Float32Array;
  rightXZ: Float32Array;
  centerXZ: Float32Array;
  count: number;
}

interface EndpointEntry {
  post: THREE.Mesh;
  head: THREE.Mesh;
  x: number;
  z: number;
}

interface WaypointEntry {
  mesh: THREE.Mesh;
  x: number;
  z: number;
}

const LAYER_PATHS = {
  viking: 'Mars_Viking_MDIM21_ClrMosaic_global_232m',
  mola: 'Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw',
  molaFallback: 'Mars_MGS_MOLA_ClrShade_merge_global_463m',
};

const tilePromiseCache = new Map<string, Promise<HTMLImageElement | null>>();

// Module-scope reusable math helpers (zero per-frame GC allocations)
const _mouseNdc = new THREE.Vector2();
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function wrapDeltaLon(lonA: number, lonB: number): number {
  let d = lonA - lonB;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

// Liang-Barsky 2D segment clipper against [-half, +half]^2 patch bounds
function clipSegmentToPatch(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  half: number
): [number, number, number, number] | null {
  const dx = x1 - x0;
  const dz = z1 - z0;
  let t0 = 0;
  let t1 = 1;

  const checks: [number, number][] = [
    [-dx, x0 + half],
    [dx, half - x0],
    [-dz, z0 + half],
    [dz, half - z0],
  ];

  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return null;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }

  return [
    x0 + t0 * dx,
    z0 + t0 * dz,
    x0 + t1 * dx,
    z0 + t1 * dz,
  ];
}

function loadCorsTile(
  layer: 'viking' | 'mola',
  z: number,
  y: number,
  x: number
): Promise<HTMLImageElement | null> {
  const key = `${layer}/${z}/${y}/${x}`;
  const existing = tilePromiseCache.get(key);
  if (existing) return existing;

  const p = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      if (layer === 'mola') {
        const fb = new Image();
        fb.crossOrigin = 'anonymous';
        fb.onload = () => resolve(fb);
        fb.onerror = () => resolve(null);
        fb.src = `https://trek.nasa.gov/tiles/Mars/EQ/${LAYER_PATHS.molaFallback}/1.0.0/default/default028mm/${z}/${y}/${x}.jpg`;
      } else {
        resolve(null);
      }
    };
    img.src = `https://trek.nasa.gov/tiles/Mars/EQ/${LAYER_PATHS[layer]}/1.0.0/default/default028mm/${z}/${y}/${x}.jpg`;
  });
  tilePromiseCache.set(key, p);
  return p;
}

function molaRgbToElevationM(
  r: number,
  g: number,
  b: number,
  fallback: number
): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta < 18) {
    return max > 180 ? 16500 : fallback;
  }
  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  if (hue > 280) return -5500;
  const t = Math.max(0, Math.min(1, (265 - hue) / 265));
  return Math.round(-6500 + t * 18500);
}

// Software WebGL probe (matches Three.js skill directive)
function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

// Procedural Naver-Street-View style blue route ribbon with crisp white directional chevrons
function createRouteRibbonTexture(maxAniso: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0.0, 'rgba(125, 211, 252, 0.95)');
  grad.addColorStop(0.08, 'rgba(37, 99, 235, 0.92)');
  grad.addColorStop(0.5, 'rgba(59, 130, 246, 0.94)');
  grad.addColorStop(0.92, 'rgba(37, 99, 235, 0.92)');
  grad.addColorStop(1.0, 'rgba(125, 211, 252, 0.95)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  ctx.fillStyle = 'rgba(224, 242, 254, 0.85)';
  ctx.fillRect(0, 4, 128, 4);
  ctx.fillRect(0, 120, 128, 4);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.beginPath();
  ctx.moveTo(96, 64);
  ctx.lineTo(36, 26);
  ctx.lineTo(50, 64);
  ctx.lineTo(36, 102);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = Math.min(8, maxAniso);
  return tex;
}

function createHoverRingTexture(maxAniso: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;

  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.34)';
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#38BDF8';
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(90, 64);
  ctx.lineTo(48, 44);
  ctx.lineTo(56, 64);
  ctx.lineTo(48, 84);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(4, maxAniso);
  return tex;
}

function reliefGainFactor(reliefScale: number): number {
  const s = clamp(reliefScale, 0.5, 4);
  return 0.55 * Math.pow(s, 1.67);
}

const PATCH_DEG = 4.2;
const SEGMENTS = 72;
const TERRAIN_SIZE = 10;
const SKIRT_BASE_Y = -1.75;

export const MarsRegion3DViewer: React.FC<MarsRegion3DViewerProps> = ({
  lat,
  lon,
  reliefScale,
  showArGrid,
  autoRotate,
  cameraViewMode = 'orbit',
  route,
  startCoord,
  destCoord,
  onRoutePositionChange,
  onSelectLatLon,
  className = '',
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  const stateRef = useRef({
    lat,
    lon,
    reliefScale,
    showArGrid,
    autoRotate,
    cameraViewMode,
    route,
    startCoord,
    destCoord,
    onRoutePositionChange,
    onSelectLatLon,
  });
  stateRef.current = {
    lat,
    lon,
    reliefScale,
    showArGrid,
    autoRotate,
    cameraViewMode,
    route,
    startCoord,
    destCoord,
    onRoutePositionChange,
    onSelectLatLon,
  };

  const sceneHooksRef = useRef<{
    rebuildPatch: (nLat: number, nLon: number) => void;
    setTargetRelief: (nRelief: number) => void;
    rebuildRoute3D: () => void;
    setCameraMode: (mode: CameraViewMode) => void;
    updateToggles: (grid: boolean, rotate: boolean) => void;
    requestRender: () => void;
  } | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    let disposed = false;
    let frameId = 0;
    let patchGeneration = 0;

    // 1. Renderer setup
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const initW = Math.max(120, container.clientWidth);
    const initH = Math.max(100, container.clientHeight);
    renderer.setSize(initW, initH, false);

    // 2. Scene, Camera, Studio Environment & Horizon Fog
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060b14);
    scene.fog = new THREE.FogExp2(0x060b14, 0.022);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(42, initW / initH, 0.05, 140);
    camera.position.set(7.8, 6.2, 8.2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.2, 0);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.065;
    controls.minDistance = 2.2;
    controls.maxDistance = 22;
    controls.minPolarAngle = 0.12;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.autoRotate =
      !isSoftwareGl &&
      stateRef.current.autoRotate &&
      stateRef.current.cameraViewMode === 'orbit';
    controls.autoRotateSpeed = 0.75;
    controls.update();

    // 3. Warm/Cool Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0x7dd3fc, 0x7c2d12, 0.74);
    hemiLight.position.set(0, 14, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.35);
    keyLight.position.set(9, 13, 7);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 2;
      keyLight.shadow.camera.far = 36;
      keyLight.shadow.camera.left = -8;
      keyLight.shadow.camera.right = 8;
      keyLight.shadow.camera.top = 8;
      keyLight.shadow.camera.bottom = -8;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.75);
    rimLight.position.set(-8, 5, -9);
    scene.add(rimLight);

    // 4. Procedural Terrain Texture Canvas
    const texCanvas = document.createElement('canvas');
    texCanvas.width = 512;
    texCanvas.height = 512;
    const texCtx = texCanvas.getContext('2d')!;
    texCtx.fillStyle = '#5c2f20';
    texCtx.fillRect(0, 0, 512, 512);

    const terrainTexture = new THREE.CanvasTexture(texCanvas);
    terrainTexture.colorSpace = THREE.SRGBColorSpace;
    terrainTexture.anisotropy = Math.min(
      8,
      renderer.capabilities.getMaxAnisotropy()
    );
    terrainTexture.wrapS = THREE.ClampToEdgeWrapping;
    terrainTexture.wrapT = THREE.ClampToEdgeWrapping;

    // 5. Displaced Terrain Surface Mesh
    const terrainGeo = new THREE.PlaneGeometry(
      TERRAIN_SIZE,
      TERRAIN_SIZE,
      SEGMENTS,
      SEGMENTS
    );
    terrainGeo.rotateX(-Math.PI / 2);

    const terrainMat = new THREE.MeshStandardMaterial({
      map: terrainTexture,
      roughness: 0.86,
      metalness: 0.06,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = !isSoftwareGl;
    terrainMesh.castShadow = !isSoftwareGl;
    scene.add(terrainMesh);

    // 6. AR Topographic Wireframe Overlay
    const arWireMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.2,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const arWireMesh = new THREE.Mesh(terrainGeo, arWireMat);
    arWireMesh.position.y = 0.015;
    arWireMesh.visible = stateRef.current.showArGrid;
    scene.add(arWireMesh);

    // 7. Geological Cross-Section Side Skirts
    const skirtVerticesPerEdge = SEGMENTS + 1;
    const skirtVertCount = skirtVerticesPerEdge * 2 * 4;
    const skirtPositions = new Float32Array(skirtVertCount * 3);
    const skirtIndices: number[] = [];
    for (let edge = 0; edge < 4; edge++) {
      const base = edge * skirtVerticesPerEdge * 2;
      for (let i = 0; i < SEGMENTS; i++) {
        const tl = base + i * 2;
        const bl = tl + 1;
        const tr = base + (i + 1) * 2;
        const br = tr + 1;
        skirtIndices.push(tl, bl, tr, tr, bl, br);
      }
    }
    const skirtGeo = new THREE.BufferGeometry();
    skirtGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(skirtPositions, 3)
    );
    skirtGeo.setIndex(skirtIndices);
    const skirtMat = new THREE.MeshStandardMaterial({
      color: 0x1e1817,
      roughness: 0.92,
      metalness: 0.14,
      side: THREE.DoubleSide,
    });
    const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
    scene.add(skirtMesh);

    // Cute Chubby Character Generator (matching user reference image)
    const createCuteCharacter = () => {
      const group = new THREE.Group();

      const bodyGeo = new THREE.SphereGeometry(0.22, 20, 20);
      bodyGeo.scale(1, 1.25, 0.9);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xdbeafe,
        emissive: 0x93c5fd,
        emissiveIntensity: 0.3,
        roughness: 0.28,
        metalness: 0.05,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.24;
      group.add(body);

      const eyeGeo = new THREE.SphereGeometry(0.035, 14, 14);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });

      const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
      leftEye.position.set(-0.075, 0.32, 0.17);
      group.add(leftEye);

      const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
      rightEye.position.set(0.075, 0.32, 0.17);
      group.add(rightEye);

      const mouthGeo = new THREE.BoxGeometry(0.05, 0.035, 0.015);
      const mouthMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });
      const mouth = new THREE.Mesh(mouthGeo, mouthMat);
      mouth.position.set(0, 0.24, 0.19);
      group.add(mouth);

      const stemCurve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, 0.5, 0),
        new THREE.Vector3(0.05, 0.65, 0),
        new THREE.Vector3(0.1, 0.72, 0)
      );
      const stemGeo = new THREE.TubeGeometry(stemCurve, 10, 0.014, 6, false);
      const stemMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
      const stem = new THREE.Mesh(stemGeo, stemMat);
      group.add(stem);

      const bulbGeo = new THREE.SphereGeometry(0.068, 16, 16);
      const bulbMat = new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        emissive: 0x22c55e,
        emissiveIntensity: 2.0,
        roughness: 0.15,
      });
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(0.1, 0.72, 0);
      group.add(bulb);

      const bulbLight = new THREE.PointLight(0x22c55e, 1.4, 4.0, 2);
      bulbLight.position.set(0.1, 0.72, 0);
      group.add(bulbLight);

      return group;
    };

    // 8. Cute Character Target Beacon
    const beaconGroup = createCuteCharacter();
    scene.add(beaconGroup);

    // 9. Cute Character Traveling Rover Marker along Route
    const roverGroup = createCuteCharacter();
    scene.add(roverGroup);

    // 10. Street-View Style Blue Route Ribbon + Hover Cursor Disc
    const routeGroup = new THREE.Group();
    scene.add(routeGroup);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const ribbonTexture = createRouteRibbonTexture(maxAniso);
    const ribbonMat = new THREE.MeshBasicMaterial({
      map: ribbonTexture,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    const routeWpMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xd97706,
      emissiveIntensity: 1.15,
      roughness: 0.25,
      metalness: 0.6,
    });
    const routeStartMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0x94a3b8,
      emissiveIntensity: 0.9,
      roughness: 0.25,
      metalness: 0.7,
    });
    const routeTargetMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 1.4,
      roughness: 0.2,
      metalness: 0.7,
    });
    const sharedMarkerGeo = new THREE.SphereGeometry(0.12, 16, 12);
    const sharedPostGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.5, 10);

    const hoverRingTex = createHoverRingTexture(maxAniso);
    const hoverDiscGeo = new THREE.PlaneGeometry(0.62, 0.62);
    hoverDiscGeo.rotateX(-Math.PI / 2);
    const hoverDiscMat = new THREE.MeshBasicMaterial({
      map: hoverRingTex,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const hoverDiscMesh = new THREE.Mesh(hoverDiscGeo, hoverDiscMat);
    hoverDiscMesh.renderOrder = 6;
    hoverDiscMesh.visible = false;
    scene.add(hoverDiscMesh);

    // Route & Elevation runtime state
    let rawHeights = new Float32Array((SEGMENTS + 1) * (SEGMENTS + 1));
    let currentRelief = stateRef.current.reliefScale;
    let targetRelief = stateRef.current.reliefScale;

    let ribbonEntries: RibbonEntry[] = [];
    let endpointEntries: EndpointEntry[] = [];
    let waypointEntries: WaypointEntry[] = [];
    let routeSamples: RouteSample[] = [];

    // Smooth camera & travelling rover state
    let currentBeaconXZ: [number, number] = [0, 0];
    let targetBeaconXZ: [number, number] = [0, 0];
    let travelProgress = 0; // 0 -> 1 traveling along route automatically

    let orbitGlideActive = false;
    const orbitGoalTarget = new THREE.Vector3(0, 0.2, 0);
    const orbitGoalCam = new THREE.Vector3(7.8, 6.2, 8.2);
    let targetFov = 42;

    let userDragging = false;
    let lastRoadviewX = 0;
    let lastRoadviewZ = 0;

    const clearRouteGroup = () => {
      for (const entry of ribbonEntries) {
        entry.mesh.geometry.dispose();
      }
      ribbonEntries = [];
      endpointEntries = [];
      waypointEntries = [];
      routeSamples = [];
      routeGroup.clear();
      hoverDiscMesh.visible = false;
      roverGroup.visible = false;
    };

    const sampleTerrainWorldY = (wx: number, wz: number): number => {
      const half = TERRAIN_SIZE / 2;
      const u = clamp((wx + half) / TERRAIN_SIZE, 0, 1) * SEGMENTS;
      const v = clamp((wz + half) / TERRAIN_SIZE, 0, 1) * SEGMENTS;
      const c0 = Math.floor(u);
      const r0 = Math.floor(v);
      const c1 = Math.min(SEGMENTS, c0 + 1);
      const r1 = Math.min(SEGMENTS, r0 + 1);
      const tx = u - c0;
      const tz = v - r0;

      const cols = SEGMENTS + 1;
      const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute;
      const h00 = posAttr.getY(r0 * cols + c0);
      const h10 = posAttr.getY(r0 * cols + c1);
      const h01 = posAttr.getY(r1 * cols + c0);
      const h11 = posAttr.getY(r1 * cols + c1);

      const hx0 = h00 + (h10 - h00) * tx;
      const hx1 = h01 + (h11 - h01) * tx;
      return hx0 + (hx1 - hx0) * tz;
    };

    const latLonToWorldXZ = (
      pLat: number,
      pLon: number,
      cLat: number,
      cLon: number
    ): [number, number] => {
      const wx = (wrapDeltaLon(pLon, cLon) / PATCH_DEG) * TERRAIN_SIZE;
      const wz = ((cLat - pLat) / PATCH_DEG) * TERRAIN_SIZE;
      return [wx, wz];
    };

    const syncRouteHeightsToTerrain = () => {
      for (const entry of ribbonEntries) {
        const pos = entry.mesh.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < entry.count; i++) {
          const lx = entry.leftXZ[i * 2];
          const lz = entry.leftXZ[i * 2 + 1];
          const rx = entry.rightXZ[i * 2];
          const rz = entry.rightXZ[i * 2 + 1];
          const cx = entry.centerXZ[i * 2];
          const cz = entry.centerXZ[i * 2 + 1];
          const yC = sampleTerrainWorldY(cx, cz);
          const yL = Math.max(yC - 0.04, sampleTerrainWorldY(lx, lz));
          const yR = Math.max(yC - 0.04, sampleTerrainWorldY(rx, rz));
          pos.setY(i * 2, yL + 0.06);
          pos.setY(i * 2 + 1, yR + 0.06);
        }
        pos.needsUpdate = true;
      }

      for (const wp of waypointEntries) {
        wp.mesh.position.y = sampleTerrainWorldY(wp.x, wp.z) + 0.14;
      }
      for (const ep of endpointEntries) {
        const wy = sampleTerrainWorldY(ep.x, ep.z);
        ep.post.position.y = wy + 0.25;
        ep.head.position.y = wy + 0.54;
      }

      beaconGroup.position.set(
        currentBeaconXZ[0],
        sampleTerrainWorldY(currentBeaconXZ[0], currentBeaconXZ[1]),
        currentBeaconXZ[1]
      );
    };

    const applyElevationFromHeights = (
      heightsM: Float32Array,
      relief: number
    ) => {
      const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute;
      const count = posAttr.count;
      let minM = Infinity;
      let maxM = -Infinity;
      let sumM = 0;
      for (let i = 0; i < count; i++) {
        const h = heightsM[i];
        if (h < minM) minM = h;
        if (h > maxM) maxM = h;
        sumM += h;
      }
      const meanM = sumM / Math.max(1, count);
      const spanM = Math.max(480, maxM - minM);
      const gainFactor = reliefGainFactor(relief);
      const verticalGain = (1.15 * gainFactor) / spanM;

      for (let i = 0; i < count; i++) {
        const wy = clamp((heightsM[i] - meanM) * verticalGain + 0.18, -1.35, 5.1);
        posAttr.setY(i, wy);
      }
      posAttr.needsUpdate = true;
      terrainGeo.computeVertexNormals();
      terrainGeo.computeBoundingBox();
      terrainGeo.computeBoundingSphere();

      const cols = SEGMENTS + 1;
      const sp = skirtGeo.attributes.position as THREE.BufferAttribute;
      let ptr = 0;
      const writePair = (vx: number, vy: number, vz: number) => {
        sp.setXYZ(ptr++, vx, vy, vz);
        sp.setXYZ(ptr++, vx, SKIRT_BASE_Y, vz);
      };

      for (let c = 0; c < cols; c++) {
        const idx = c;
        writePair(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx));
      }
      for (let c = 0; c < cols; c++) {
        const idx = SEGMENTS * cols + c;
        writePair(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx));
      }
      for (let r = 0; r < cols; r++) {
        const idx = r * cols;
        writePair(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx));
      }
      for (let r = 0; r < cols; r++) {
        const idx = r * cols + SEGMENTS;
        writePair(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx));
      }
      sp.needsUpdate = true;
      skirtGeo.computeVertexNormals();
      skirtGeo.computeBoundingSphere();

      syncRouteHeightsToTerrain();
    };

    const getSampleAtFloat = (floatIdx: number) => {
      if (routeSamples.length === 0) return null;
      const maxI = routeSamples.length - 1;
      const clamped = clamp(floatIdx, 0, maxI);
      const i0 = Math.floor(clamped);
      const i1 = Math.min(maxI, i0 + 1);
      const t = clamped - i0;
      const a = routeSamples[i0];
      const b = routeSamples[i1];
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const tx = a.tx + (b.tx - a.tx) * t;
      const tz = a.tz + (b.tz - a.tz) * t;
      const len = Math.hypot(tx, tz) || 1;
      return {
        x,
        z,
        y: sampleTerrainWorldY(x, z),
        tx: tx / len,
        tz: tz / len,
        lat: a.lat + (b.lat - a.lat) * t,
        lon: a.lon + (b.lon - a.lon) * t,
        distanceKm: a.distanceKm + (b.distanceKm - a.distanceKm) * t,
        elevationM: Math.round(a.elevationM + (b.elevationM - a.elevationM) * t),
        slopeDeg: Number((a.slopeDeg + (b.slopeDeg - a.slopeDeg) * t).toFixed(1)),
      };
    };

    const rebuildRoute3D = () => {
      clearRouteGroup();
      const {
        lat: cLat,
        lon: cLon,
        route: curRoute,
        startCoord: curStart,
        destCoord: curDest,
      } = stateRef.current;

      const half = TERRAIN_SIZE / 2 - 0.04;

      if (curRoute?.found && curRoute.points.length >= 2) {
        interface ClippedVertex {
          x: number;
          z: number;
          lat: number;
          lon: number;
          distanceKm: number;
          elevationM: number;
          slopeDeg: number;
        }
        const chains: ClippedVertex[][] = [];
        let currentChain: ClippedVertex[] = [];

        for (let i = 1; i < curRoute.points.length; i++) {
          const pA = curRoute.points[i - 1];
          const pB = curRoute.points[i];
          const [x0, z0] = latLonToWorldXZ(pA.lat, pA.lon, cLat, cLon);
          const [x1, z1] = latLonToWorldXZ(pB.lat, pB.lon, cLat, cLon);
          const clipped = clipSegmentToPatch(x0, z0, x1, z1, half);
          if (!clipped) {
            if (currentChain.length >= 2) chains.push(currentChain);
            currentChain = [];
            continue;
          }
          const [cx0, cz0, cx1, cz1] = clipped;
          const segLen = Math.hypot(x1 - x0, z1 - z0) || 1;
          const t0 = clamp(Math.hypot(cx0 - x0, cz0 - z0) / segLen, 0, 1);
          const t1 = clamp(Math.hypot(cx1 - x0, cz1 - z0) / segLen, 0, 1);

          const mkVert = (cx: number, cz: number, t: number): ClippedVertex => ({
            x: cx,
            z: cz,
            lat: pA.lat + (pB.lat - pA.lat) * t,
            lon: pA.lon + (pB.lon - pA.lon) * t,
            distanceKm:
              pA.distanceFromStartKm +
              (pB.distanceFromStartKm - pA.distanceFromStartKm) * t,
            elevationM: Math.round(
              pA.elevationM + (pB.elevationM - pA.elevationM) * t
            ),
            slopeDeg: Number(
              (pA.slopeDeg + (pB.slopeDeg - pA.slopeDeg) * t).toFixed(1)
            ),
          });

          const vStart = mkVert(cx0, cz0, t0);
          const vEnd = mkVert(cx1, cz1, t1);

          if (currentChain.length === 0) {
            currentChain.push(vStart, vEnd);
          } else {
            const last = currentChain[currentChain.length - 1];
            if (Math.hypot(last.x - cx0, last.z - cz0) > 0.05) {
              if (currentChain.length >= 2) chains.push(currentChain);
              currentChain = [vStart, vEnd];
            } else {
              currentChain.push(vEnd);
            }
          }
        }
        if (currentChain.length >= 2) chains.push(currentChain);

        const ribbonHalfWidth = 0.09;
        for (const chain of chains) {
          const dense: ClippedVertex[] = [];
          for (let i = 0; i < chain.length - 1; i++) {
            const a = chain[i];
            const b = chain[i + 1];
            const segDist = Math.hypot(b.x - a.x, b.z - a.z);
            const steps = Math.max(1, Math.ceil(segDist / 0.08));
            for (let s = 0; s < steps; s++) {
              const t = s / steps;
              dense.push({
                x: a.x + (b.x - a.x) * t,
                z: a.z + (b.z - a.z) * t,
                lat: a.lat + (b.lat - a.lat) * t,
                lon: a.lon + (b.lon - a.lon) * t,
                distanceKm: a.distanceKm + (b.distanceKm - a.distanceKm) * t,
                elevationM: Math.round(
                  a.elevationM + (b.elevationM - a.elevationM) * t
                ),
                slopeDeg: Number(
                  (a.slopeDeg + (b.slopeDeg - a.slopeDeg) * t).toFixed(1)
                ),
              });
            }
          }
          dense.push(chain[chain.length - 1]);
          if (dense.length < 2) continue;

          const n = dense.length;
          const positions = new Float32Array(n * 2 * 3);
          const uvs = new Float32Array(n * 2 * 2);
          const indices: number[] = [];
          const leftXZ = new Float32Array(n * 2);
          const rightXZ = new Float32Array(n * 2);
          const centerXZ = new Float32Array(n * 2);

          let cumDist = 0;
          for (let i = 0; i < n; i++) {
            const prev = dense[Math.max(0, i - 1)];
            const next = dense[Math.min(n - 1, i + 1)];
            const cur = dense[i];
            if (i > 0) {
              cumDist += Math.hypot(cur.x - dense[i - 1].x, cur.z - dense[i - 1].z);
            }

            let tx = next.x - prev.x;
            let tz = next.z - prev.z;
            const tLen = Math.hypot(tx, tz) || 1;
            tx /= tLen;
            tz /= tLen;

            const rx = -tz;
            const rz = tx;

            const lx = clamp(cur.x - rx * ribbonHalfWidth, -half, half);
            const lz = clamp(cur.z - rz * ribbonHalfWidth, -half, half);
            const rrx = clamp(cur.x + rx * ribbonHalfWidth, -half, half);
            const rrz = clamp(cur.z + rz * ribbonHalfWidth, -half, half);

            leftXZ[i * 2] = lx;
            leftXZ[i * 2 + 1] = lz;
            rightXZ[i * 2] = rrx;
            rightXZ[i * 2 + 1] = rrz;
            centerXZ[i * 2] = cur.x;
            centerXZ[i * 2 + 1] = cur.z;

            const yC = sampleTerrainWorldY(cur.x, cur.z);
            const yL = Math.max(yC - 0.04, sampleTerrainWorldY(lx, lz));
            const yR = Math.max(yC - 0.04, sampleTerrainWorldY(rrx, rrz));

            const vi = i * 2;
            positions[vi * 3] = lx;
            positions[vi * 3 + 1] = yL + 0.06;
            positions[vi * 3 + 2] = lz;

            positions[(vi + 1) * 3] = rrx;
            positions[(vi + 1) * 3 + 1] = yR + 0.06;
            positions[(vi + 1) * 3 + 2] = rrz;

            const u = cumDist / 0.58;
            uvs[vi * 2] = u;
            uvs[vi * 2 + 1] = 0;
            uvs[(vi + 1) * 2] = u;
            uvs[(vi + 1) * 2 + 1] = 1;

            if (i < n - 1) {
              const a = vi;
              const b = vi + 1;
              const c = vi + 2;
              const d = vi + 3;
              indices.push(a, c, b, b, c, d);
            }

            routeSamples.push({
              x: cur.x,
              z: cur.z,
              tx,
              tz,
              lat: cur.lat,
              lon: cur.lon,
              distanceKm: cur.distanceKm,
              elevationM: cur.elevationM,
              slopeDeg: cur.slopeDeg,
            });
          }

          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
          geo.setIndex(indices);
          geo.computeVertexNormals();

          const mesh = new THREE.Mesh(geo, ribbonMat);
          mesh.renderOrder = 3;
          routeGroup.add(mesh);

          ribbonEntries.push({
            mesh,
            leftXZ,
            rightXZ,
            centerXZ,
            count: n,
          });
        }

        for (const wp of curRoute.waypoints) {
          if (wp.tag === 'start' || wp.tag === 'target') continue;
          const [wx, wz] = latLonToWorldXZ(wp.lat, wp.lon, cLat, cLon);
          if (Math.abs(wx) <= half && Math.abs(wz) <= half) {
            const wy = sampleTerrainWorldY(wx, wz);
            const m = new THREE.Mesh(
              sharedMarkerGeo,
              wp.tag === 'avoid' ? routeWpMat : routeTargetMat
            );
            m.position.set(wx, wy + 0.14, wz);
            routeGroup.add(m);
            waypointEntries.push({ mesh: m, x: wx, z: wz });
          }
        }
      }

      const addEndpointMarker = (
        pLat: number,
        pLon: number,
        mat: THREE.Material
      ) => {
        const [wx, wz] = latLonToWorldXZ(pLat, pLon, cLat, cLon);
        if (Math.abs(wx) > half || Math.abs(wz) > half) return;
        const wy = sampleTerrainWorldY(wx, wz);
        const post = new THREE.Mesh(sharedPostGeo, mat);
        post.position.set(wx, wy + 0.25, wz);
        routeGroup.add(post);
        const head = new THREE.Mesh(sharedMarkerGeo, mat);
        head.scale.setScalar(1.25);
        head.position.set(wx, wy + 0.54, wz);
        routeGroup.add(head);
        endpointEntries.push({ post, head, x: wx, z: wz });
      };

      if (curStart) {
        addEndpointMarker(curStart.lat, curStart.lon, routeStartMat);
      }
      if (curDest) {
        const target =
          curRoute?.found &&
          curRoute.snappedToSafeApproach &&
          curRoute.points.length > 0
            ? curRoute.points[curRoute.points.length - 1]
            : curDest;
        addEndpointMarker(target.lat, target.lon, routeTargetMat);
      }

      if (routeSamples.length > 0) {
        roverGroup.visible = true;
        travelProgress = 0;
      } else {
        roverGroup.visible = false;
        currentBeaconXZ = [0, 0];
        targetBeaconXZ = [0, 0];
        beaconGroup.position.set(0, sampleTerrainWorldY(0, 0), 0);
      }
    };

    // 11. Frame-Rate Independent Smooth Animation & On-Demand Render Loop
    let renderBusy = false;
    let renderDirty = false;
    const clock = new THREE.Clock();

    const needsContinuousLoop = () => {
      if (isSoftwareGl) return false;
      const reliefMoving = Math.abs(currentRelief - targetRelief) > 0.004;
      const fovMoving = Math.abs(camera.fov - targetFov) > 0.05;
      const autoRotating =
        stateRef.current.autoRotate &&
        stateRef.current.cameraViewMode === 'orbit';
      return (
        autoRotating ||
        orbitGlideActive ||
        routeSamples.length > 0 ||
        reliefMoving ||
        fovMoving
      );
    };

    let continuousMode = needsContinuousLoop();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (status === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    }

    const advanceSimulation = (delta: number) => {
      let stillAnimating = false;

      // 1. Smoothly damp 1x/2x/3x vertical relief exaggeration
      if (Math.abs(currentRelief - targetRelief) > 0.002) {
        currentRelief = THREE.MathUtils.damp(
          currentRelief,
          targetRelief,
          10,
          delta
        );
        if (Math.abs(currentRelief - targetRelief) <= 0.004) {
          currentRelief = targetRelief;
        } else {
          stillAnimating = true;
        }
        applyElevationFromHeights(rawHeights, currentRelief);
      }

      // 2. Smoothly damp FOV transitions
      if (Math.abs(camera.fov - targetFov) > 0.04) {
        camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 7, delta);
        camera.updateProjectionMatrix();
        stillAnimating = true;
      }

      // 3. Position rover and beacon at current travelProgress (static unless clicked)
      if (routeSamples.length > 0) {
        const sampleIdx = travelProgress * (routeSamples.length - 1);
        const s = getSampleAtFloat(sampleIdx);
        if (s) {
          roverGroup.position.set(s.x, s.y + 0.12, s.z);
          const yaw = Math.atan2(-s.tz, s.tx);
          roverGroup.rotation.y = yaw;

          currentBeaconXZ = [s.x, s.z];
          beaconGroup.position.set(s.x, s.y, s.z);

          // If in Roadview mode or auto-following, keep camera smoothly following behind & above rover without getting blocked by walls
          if (stateRef.current.cameraViewMode === 'roadview' && !userDragging) {
            targetFov = 56;
            const eyeY = s.y + 0.48;
            const followBack = 2.4;
            const targetCamX = s.x - s.tx * followBack;
            const targetCamZ = s.z - s.tz * followBack;
            const safeCamY = Math.max(eyeY + 0.15, sampleTerrainWorldY(targetCamX, targetCamZ) + 0.35);

            controls.target.set(
              THREE.MathUtils.damp(controls.target.x, s.x, 5.0, delta),
              THREE.MathUtils.damp(controls.target.y, eyeY, 5.0, delta),
              THREE.MathUtils.damp(controls.target.z, s.z, 5.0, delta)
            );
            camera.position.set(
              THREE.MathUtils.damp(camera.position.x, targetCamX, 5.0, delta),
              THREE.MathUtils.damp(camera.position.y, safeCamY, 5.0, delta),
              THREE.MathUtils.damp(camera.position.z, targetCamZ, 5.0, delta)
            );

            const halfLimit = TERRAIN_SIZE * 0.38;
            stateRef.current.onRoutePositionChange?.({
              lat: s.lat,
              lon: s.lon,
              distanceKm: Math.round(s.distanceKm * 10) / 10,
              elevationM: s.elevationM,
              slopeDeg: s.slopeDeg,
              nearEdge: Math.abs(s.x) > halfLimit || Math.abs(s.z) > halfLimit,
            });
          }
        }
        stillAnimating = true;
      }

      // 4. Orbit Mode Smooth Camera Flight to Clicked Point
      if (orbitGlideActive) {
        controls.target.x = THREE.MathUtils.damp(
          controls.target.x,
          orbitGoalTarget.x,
          6.5,
          delta
        );
        controls.target.y = THREE.MathUtils.damp(
          controls.target.y,
          orbitGoalTarget.y,
          6.5,
          delta
        );
        controls.target.z = THREE.MathUtils.damp(
          controls.target.z,
          orbitGoalTarget.z,
          6.5,
          delta
        );

        camera.position.x = THREE.MathUtils.damp(
          camera.position.x,
          orbitGoalCam.x,
          6.5,
          delta
        );
        camera.position.y = THREE.MathUtils.damp(
          camera.position.y,
          orbitGoalCam.y,
          6.5,
          delta
        );
        camera.position.z = THREE.MathUtils.damp(
          camera.position.z,
          orbitGoalCam.z,
          6.5,
          delta
        );

        const rem =
          controls.target.distanceTo(orbitGoalTarget) +
          camera.position.distanceTo(orbitGoalCam);
        if (rem < 0.025) {
          controls.target.copy(orbitGoalTarget);
          camera.position.copy(orbitGoalCam);
          orbitGlideActive = false;
        } else {
          stillAnimating = true;
        }
      }

      // 5. Prevent camera from dipping below terrain or getting blocked by walls
      const terrainFloorY = sampleTerrainWorldY(camera.position.x, camera.position.z);
      if (camera.position.y < terrainFloorY + 0.35) {
        camera.position.y = terrainFloorY + 0.35;
      }

      if (
        stateRef.current.autoRotate &&
        stateRef.current.cameraViewMode === 'orbit' &&
        !userDragging
      ) {
        beaconGroup.rotation.y += delta * 1.0;
        stillAnimating = true;
      }

      return stillAnimating;
    };

    const requestRender = () => {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        const delta = Math.min(clock.getDelta(), 0.05);
        const moreNeeded = advanceSimulation(delta);
        controls.update();
        renderer.render(scene, camera);
        const done = () => {
          renderBusy = false;
          if ((renderDirty || moreNeeded || routeSamples.length > 0) && !disposed) {
            requestRender();
          }
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };

    const tickLoop = () => {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.05);
      advanceSimulation(delta);
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(tickLoop);
    };

    const ensureLoopActive = () => {
      if (isSoftwareGl) {
        requestRender();
        return;
      }
      clock.getDelta();
      frameId = requestAnimationFrame(tickLoop);
    };

    controls.addEventListener('start', () => {
      userDragging = true;
      orbitGlideActive = false;
    });
    controls.addEventListener('end', () => {
      userDragging = false;
    });
    controls.addEventListener('change', () => {
      if (!isSoftwareGl && routeSamples.length === 0) requestRender();
    });

    // 12. Interactive Route Hover & Click-to-Glide Raycasting
    const raycaster = new THREE.Raycaster();
    let pointerDownPos: { x: number; y: number } | null = null;
    let lastHoverTs = 0;

    const findNearestRouteSample = (
      hx: number,
      hz: number,
      maxRadius: number
    ): { idx: number; sample: RouteSample; progress: number } | null => {
      if (routeSamples.length === 0) return null;
      let bestIdx = -1;
      let bestDist = maxRadius;
      for (let i = 0; i < routeSamples.length; i++) {
        const d = Math.hypot(routeSamples[i].x - hx, routeSamples[i].z - hz);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      if (bestIdx < 0) return null;
      return {
        idx: bestIdx,
        sample: routeSamples[bestIdx],
        progress: bestIdx / Math.max(1, routeSamples.length - 1),
      };
    };

    const updateMouseNdc = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      _mouseNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _mouseNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      return true;
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverTs < 32) return;
      lastHoverTs = now;

      if (routeSamples.length === 0) {
        if (hoverDiscMesh.visible) {
          hoverDiscMesh.visible = false;
          renderer.domElement.style.cursor = 'grab';
          if (!isSoftwareGl) requestRender();
        }
        return;
      }

      if (!updateMouseNdc(e.clientX, e.clientY)) return;
      raycaster.setFromCamera(_mouseNdc, camera);
      const hits = raycaster.intersectObject(terrainMesh, false);
      if (hits.length > 0) {
        const hitPt = hits[0].point;
        const nearest = findNearestRouteSample(hitPt.x, hitPt.z, 0.85);
        if (nearest) {
          const sy = sampleTerrainWorldY(nearest.sample.x, nearest.sample.z);
          hoverDiscMesh.position.set(nearest.sample.x, sy + 0.085, nearest.sample.z);
          const yaw = Math.atan2(-nearest.sample.tz, nearest.sample.tx);
          hoverDiscMesh.rotation.set(0, yaw, 0);
          hoverDiscMesh.visible = true;
          renderer.domElement.style.cursor = 'pointer';
          if (!isSoftwareGl) requestRender();
          return;
        }
      }

      if (hoverDiscMesh.visible) {
        hoverDiscMesh.visible = false;
        renderer.domElement.style.cursor = 'grab';
        if (!isSoftwareGl) requestRender();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!pointerDownPos) return;
      const moveDist = Math.hypot(
        e.clientX - pointerDownPos.x,
        e.clientY - pointerDownPos.y
      );
      pointerDownPos = null;
      if (moveDist > 6 || routeSamples.length === 0) return;

      if (!updateMouseNdc(e.clientX, e.clientY)) return;
      raycaster.setFromCamera(_mouseNdc, camera);
      const hits = raycaster.intersectObject(terrainMesh, false);
      if (hits.length === 0) return;

      const hitPt = hits[0].point;
      const nearest = findNearestRouteSample(hitPt.x, hitPt.z, 1.05);
      if (!nearest) return;

      const s = nearest.sample;
      const sy = sampleTerrainWorldY(s.x, s.z);
      travelProgress = nearest.progress;
      targetBeaconXZ = [s.x, s.z];

      if (stateRef.current.cameraViewMode === 'orbit') {
        const viewBack = 3.2;
        const viewHeight = 2.35;
        orbitGoalTarget.set(s.x, sy + 0.12, s.z);
        orbitGoalCam.set(
          s.x - s.tx * viewBack + s.tz * 0.8,
          sy + viewHeight,
          s.z - s.tz * viewBack - s.tx * 0.8
        );
        orbitGlideActive = true;
      }

      ensureLoopActive();

      const halfLimit = TERRAIN_SIZE * 0.38;
      stateRef.current.onRoutePositionChange?.({
        lat: s.lat,
        lon: s.lon,
        distanceKm: Math.round(s.distanceKm * 10) / 10,
        elevationM: s.elevationM,
        slopeDeg: s.slopeDeg,
        nearEdge: Math.abs(s.x) > halfLimit || Math.abs(s.z) > halfLimit,
      });
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // 13. Elevation + NASA Tile Texture Builder
    const rebuildPatch = (cLat: number, cLon: number) => {
      const gen = ++patchGeneration;
      const cols = SEGMENTS + 1;
      const heights = new Float32Array(cols * cols);

      for (let r = 0; r < cols; r++) {
        const vFrac = r / SEGMENTS;
        const gLat = clamp(cLat + (0.5 - vFrac) * PATCH_DEG, -89.5, 89.5);
        for (let c = 0; c < cols; c++) {
          const uFrac = c / SEGMENTS;
          const gLon = clamp(cLon + (uFrac - 0.5) * PATCH_DEG, -180, 180);
          heights[r * cols + c] = sampleMarsTelemetry(gLat, gLon).elevationM;
        }
      }
      rawHeights = heights;
      applyElevationFromHeights(rawHeights, currentRelief);
      rebuildRoute3D();

      texCtx.fillStyle = '#5c2f20';
      texCtx.fillRect(0, 0, 512, 512);
      terrainTexture.needsUpdate = true;
      if (!isSoftwareGl) requestRender();

      const latTop = clamp(cLat + PATCH_DEG / 2, -89.9, 89.9);
      const latBottom = clamp(cLat - PATCH_DEG / 2, -89.9, 89.9);
      const lonLeft = clamp(cLon - PATCH_DEG / 2, -180, 180);
      const lonRight = clamp(cLon + PATCH_DEG / 2, -180, 180);

      const paintVikingTiles = async (z: number) => {
        const numCols = 1 << (z + 1);
        const numRows = 1 << z;
        const tileDeg = 180 / numRows;
        const cs = clamp(Math.floor((lonLeft + 180) / tileDeg), 0, numCols - 1);
        const ce = clamp(Math.floor((lonRight + 180) / tileDeg), 0, numCols - 1);
        const rs = clamp(Math.floor((90 - latTop) / tileDeg), 0, numRows - 1);
        const re = clamp(Math.floor((90 - latBottom) / tileDeg), 0, numRows - 1);

        const jobs: Promise<void>[] = [];
        for (let r = rs; r <= re; r++) {
          for (let c = cs; c <= ce; c++) {
            jobs.push(
              loadCorsTile('viking', z, r, c).then((img) => {
                if (!img || disposed || gen !== patchGeneration) return;
                const tLatTop = 90 - r * tileDeg;
                const tLonLeft = -180 + c * tileDeg;
                const dx = ((tLonLeft - lonLeft) / PATCH_DEG) * 512;
                const dy = ((latTop - tLatTop) / PATCH_DEG) * 512;
                const dw = (tileDeg / PATCH_DEG) * 512;
                const dh = (tileDeg / PATCH_DEG) * 512;
                texCtx.drawImage(img, dx - 0.5, dy - 0.5, dw + 1, dh + 1);
              })
            );
          }
        }
        await Promise.all(jobs);
        if (!disposed && gen === patchGeneration) {
          terrainTexture.needsUpdate = true;
          if (!isSoftwareGl) requestRender();
        }
      };

      const refineMolaHeights = async () => {
        const z = 5;
        const numCols = 1 << (z + 1);
        const numRows = 1 << z;
        const tileDeg = 180 / numRows;
        const cs = clamp(Math.floor((lonLeft + 180) / tileDeg), 0, numCols - 1);
        const ce = clamp(Math.floor((lonRight + 180) / tileDeg), 0, numCols - 1);
        const rs = clamp(Math.floor((90 - latTop) / tileDeg), 0, numRows - 1);
        const re = clamp(Math.floor((90 - latBottom) / tileDeg), 0, numRows - 1);

        const off = document.createElement('canvas');
        off.width = 128;
        off.height = 128;
        const octx = off.getContext('2d');
        if (!octx) return;

        const jobs: Promise<void>[] = [];
        for (let r = rs; r <= re; r++) {
          for (let c = cs; c <= ce; c++) {
            jobs.push(
              loadCorsTile('mola', z, r, c).then((img) => {
                if (!img || disposed || gen !== patchGeneration) return;
                const tLatTop = 90 - r * tileDeg;
                const tLonLeft = -180 + c * tileDeg;
                const dx = ((tLonLeft - lonLeft) / PATCH_DEG) * 128;
                const dy = ((latTop - tLatTop) / PATCH_DEG) * 128;
                const dw = (tileDeg / PATCH_DEG) * 128;
                const dh = (tileDeg / PATCH_DEG) * 128;
                octx.drawImage(img, dx - 0.5, dy - 0.5, dw + 1, dh + 1);
              })
            );
          }
        }
        await Promise.all(jobs);
        if (disposed || gen !== patchGeneration) return;

        try {
          const px = octx.getImageData(0, 0, 128, 128).data;
          const refined = new Float32Array(cols * cols);
          for (let r = 0; r < cols; r++) {
            const py = clamp(Math.round((r / SEGMENTS) * 127), 0, 127);
            for (let c = 0; c < cols; c++) {
              const pxx = clamp(Math.round((c / SEGMENTS) * 127), 0, 127);
              const idx = (py * 128 + pxx) * 4;
              const fallback = heights[r * cols + c];
              const molaElev = molaRgbToElevationM(
                px[idx],
                px[idx + 1],
                px[idx + 2],
                fallback
              );
              refined[r * cols + c] = Math.round(fallback * 0.4 + molaElev * 0.6);
            }
          }
          rawHeights = refined;
          applyElevationFromHeights(rawHeights, currentRelief);
          if (!isSoftwareGl) requestRender();
        } catch {
          // Ignore tainted canvas if CORS fails unexpectedly
        }
      };

      void paintVikingTiles(5).then(() => paintVikingTiles(6));
      void refineMolaHeights();
    };

    sceneHooksRef.current = {
      rebuildPatch,
      setTargetRelief: (nRelief: number) => {
        targetRelief = nRelief;
        if (isSoftwareGl) {
          currentRelief = nRelief;
          applyElevationFromHeights(rawHeights, currentRelief);
          requestRender();
        } else {
          ensureLoopActive();
        }
      },
      rebuildRoute3D: () => {
        rebuildRoute3D();
        if (!isSoftwareGl) requestRender();
      },
      setCameraMode: (mode: CameraViewMode) => {
        if (mode === 'roadview') {
          targetFov = 56;
        } else {
          targetFov = 42;
        }
        ensureLoopActive();
      },
      updateToggles: (grid: boolean, rotate: boolean) => {
        arWireMesh.visible = grid;
        controls.autoRotate =
          !isSoftwareGl &&
          rotate &&
          stateRef.current.cameraViewMode === 'orbit';
        ensureLoopActive();
      },
      requestRender,
    };

    rebuildPatch(stateRef.current.lat, stateRef.current.lon);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const ro = new ResizeObserver((entries) => {
      if (disposed) return;
      for (const entry of entries) {
        const w = Math.max(120, Math.floor(entry.contentRect.width));
        const h = Math.max(100, Math.floor(entry.contentRect.height));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        if (!isSoftwareGl) requestRender();
      }
    });
    ro.observe(container);

    frameId = requestAnimationFrame(tickLoop);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      clearRouteGroup();
      ribbonMat.dispose();
      ribbonTexture.dispose();
      hoverDiscGeo.dispose();
      hoverDiscMat.dispose();
      hoverRingTex.dispose();
      routeWpMat.dispose();
      routeStartMat.dispose();
      routeTargetMat.dispose();
      sharedMarkerGeo.dispose();
      sharedPostGeo.dispose();
      terrainGeo.dispose();
      terrainMat.dispose();
      terrainTexture.dispose();
      arWireMat.dispose();
      skirtGeo.dispose();
      skirtMat.dispose();
      envTarget.dispose();
      renderer.dispose();
      sceneHooksRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneHooksRef.current?.rebuildPatch(lat, lon);
  }, [lat, lon]);

  useEffect(() => {
    sceneHooksRef.current?.setTargetRelief(reliefScale);
  }, [reliefScale]);

  useEffect(() => {
    sceneHooksRef.current?.rebuildRoute3D();
  }, [route, startCoord, destCoord]);

  useEffect(() => {
    sceneHooksRef.current?.setCameraMode(cameraViewMode);
  }, [cameraViewMode]);

  useEffect(() => {
    sceneHooksRef.current?.updateToggles(showArGrid, autoRotate);
  }, [showArGrid, autoRotate]);

  return (
    <div
      ref={mountRef}
      className={`w-full h-full cursor-grab active:cursor-grabbing ${className}`}
    />
  );
};
