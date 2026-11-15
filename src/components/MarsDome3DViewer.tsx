import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  Eye,
  Layers,
  RotateCw,
  Shield,
  Sprout,
  Waves,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { DomeSubsystemId, DomeTier } from '../types/mars';

export type DomeCameraPreset = 'hero' | 'cutaway' | 'airlock' | 'drill' | 'top';

interface MarsDome3DViewerProps {
  lat: number;
  lon: number;
  waterProb: number;
  soilFertility: number;
  elevationM: number;
  geothermalIndex: number;
  tier: DomeTier;
  activeSubsystem: DomeSubsystemId;
  onSelectSubsystem?: (sub: DomeSubsystemId) => void;
  className?: string;
}

// Reusable module-scope math temporaries (zero per-frame allocations)
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vMid = new THREE.Vector3();
const _vDir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _dummy = new THREE.Object3D();
const _mouseNdc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();

function detectSoftwareGl(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const str = dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    return /SwiftShader|llvmpipe|Software|Mesa/i.test(str);
  } catch {
    return false;
  }
}

function createDeckTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#333b48';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle concentric & radial metallic deck plating
  const cx = 256;
  const cy = 256;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
  ctx.lineWidth = 2;
  for (const r of [64, 118, 172, 224, 246]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 64, cy + Math.sin(a) * 64);
    ctx.lineTo(cx + Math.cos(a) * 246, cy + Math.sin(a) * 246);
    ctx.stroke();
  }

  // Subtle metallic micro-grain
  for (let i = 0; i < 2600; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const y = (Math.sin(i * 78.233) * 24634.6345) % 1;
    const px = Math.abs(x) * 512;
    const py = Math.abs(y) * 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(px, py, 2, 2);
  }

  // Yellow docking/walkway centerline markings
  ctx.strokeStyle = '#eab308';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 6]);
  ctx.beginPath();
  ctx.moveTo(cx, cy + 165);
  ctx.lineTo(cx, cy + 250);
  ctx.stroke();
  ctx.setLineDash([]);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createAirlockSignTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(0, 0, 512, 128);

  // Brushed border & warning stripes at edges
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(8, 8, 496, 112);

  ctx.fillStyle = '#f59e0b';
  for (let x = 14; x < 74; x += 18) {
    ctx.fillRect(x, 16, 10, 96);
    ctx.fillRect(512 - x - 10, 16, 10, 96);
  }

  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 58px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AIRLOCK', 256, 66);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createTankBandTexture(accentHex: string, label: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#dbe4ee';
  ctx.fillRect(0, 0, 256, 256);

  // Horizontal metal seam rings
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(0, 36, 256, 12);
  ctx.fillRect(0, 208, 256, 12);

  // Vertical hazard/species stripe
  ctx.fillStyle = accentHex;
  ctx.fillRect(108, 48, 36, 160);

  ctx.save();
  ctx.translate(126, 128);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 22px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 0);
  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSolarTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0f2547';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createMartianRegolithTexture(soilFertility: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;

  // Blend rust iron-oxide with clay tone depending on site fertility
  const base = soilFertility >= 65 ? '#6e3d28' : '#7c331d';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 4200; i++) {
    const rx = Math.abs((Math.sin(i * 19.31) * 43758.5) % 1) * 512;
    const ry = Math.abs((Math.sin(i * 41.73) * 19384.2) % 1) * 512;
    const rad = 1 + (i % 5);
    ctx.fillStyle =
      i % 3 === 0
        ? 'rgba(194, 92, 48, 0.24)'
        : i % 3 === 1
          ? 'rgba(54, 24, 14, 0.26)'
          : 'rgba(148, 86, 62, 0.18)';
    ctx.beginPath();
    ctx.arc(rx, ry, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

/**
 * Extract unique geodesic dome struts & upper-hemisphere nodes from a subdivided Icosahedron
 */
function buildGeodesicData(radius: number, detail = 2) {
  const ico = new THREE.IcosahedronGeometry(radius, detail);
  const pos = ico.attributes.position;
  const vertexMap = new Map<string, THREE.Vector3>();
  const vertices: THREE.Vector3[] = [];
  const edgeSet = new Set<string>();
  const edges: [THREE.Vector3, THREE.Vector3][] = [];

  const getKey = (v: THREE.Vector3) =>
    `${Math.round(v.x * 1000)}_${Math.round(v.y * 1000)}_${Math.round(v.z * 1000)}`;

  const getUniqueVertex = (x: number, y: number, z: number) => {
    const v = new THREE.Vector3(x, y, z);
    const k = getKey(v);
    let found = vertexMap.get(k);
    if (!found) {
      found = v;
      vertexMap.set(k, found);
      vertices.push(found);
    }
    return found;
  };

  const triCount = pos.count / 3;
  for (let t = 0; t < triCount; t++) {
    const i0 = t * 3;
    const v0 = getUniqueVertex(pos.getX(i0), pos.getY(i0), pos.getZ(i0));
    const v1 = getUniqueVertex(pos.getX(i0 + 1), pos.getY(i0 + 1), pos.getZ(i0 + 1));
    const v2 = getUniqueVertex(pos.getX(i0 + 2), pos.getY(i0 + 2), pos.getZ(i0 + 2));

    // Keep upper dome triangles (min y slightly below 0 so base meets deck collar cleanly)
    if (v0.y < -0.35 && v1.y < -0.35 && v2.y < -0.35) continue;

    const pairs: [THREE.Vector3, THREE.Vector3][] = [
      [v0, v1],
      [v1, v2],
      [v2, v0],
    ];
    for (const [a, b] of pairs) {
      if (a.y < -0.35 || b.y < -0.35) continue;
      const ka = getKey(a);
      const kb = getKey(b);
      const ek = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (!edgeSet.has(ek)) {
        edgeSet.add(ek);
        edges.push([a, b]);
      }
    }
  }

  const upperNodes = vertices.filter((v) => v.y >= -0.35);
  ico.dispose();
  return { edges, upperNodes };
}

const CAMERA_PRESETS: Record<
  DomeCameraPreset,
  { pos: [number, number, number]; target: [number, number, number]; cutaway: boolean }
> = {
  hero: { pos: [7.4, 4.9, 8.8], target: [0, 0.85, 0], cutaway: false },
  cutaway: { pos: [6.2, 5.4, 6.8], target: [0, 0.65, 0], cutaway: true },
  airlock: { pos: [3.2, 2.2, 8.2], target: [0.3, 0.75, 3.6], cutaway: false },
  drill: { pos: [6.5, -1.6, 6.9], target: [0, -1.35, 0], cutaway: false },
  top: { pos: [0.01, 11.4, 2.2], target: [0, 0.5, 0], cutaway: true },
};

export const MarsDome3DViewer: React.FC<MarsDome3DViewerProps> = ({
  lat,
  lon,
  waterProb,
  soilFertility,
  geothermalIndex,
  tier,
  activeSubsystem,
  onSelectSubsystem,
  className = '',
}) => {
  const { pick } = useLanguage();
  const mountRef = useRef<HTMLDivElement>(null);

  const [preset, setPreset] = useState<DomeCameraPreset>('hero');
  const [cutaway, setCutaway] = useState<boolean>(false);
  const [autoOrbit, setAutoOrbit] = useState<boolean>(true);

  const callbacksRef = useRef({ onSelectSubsystem });
  callbacksRef.current = { onSelectSubsystem };

  const hooksRef = useRef<{
    applyPreset: (p: DomeCameraPreset) => void;
    setCutaway: (c: boolean) => void;
    setAutoOrbit: (a: boolean) => void;
    updateTelemetryVisuals: (
      waterProb: number,
      soilFertility: number,
      geothermalIndex: number,
      tier: DomeTier
    ) => void;
  } | null>(null);

  const tierScale = useMemo(
    () => (tier === 'outpost' ? 0.88 : tier === 'habitat' ? 1.0 : 1.12),
    [tier]
  );

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let disposed = false;
    let frameId = 0;

    const width = Math.max(240, container.clientWidth || 440);
    const height = Math.max(200, container.clientHeight || 300);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    const isSoftwareGl = detectSoftwareGl(renderer);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#070b14');
    scene.fog = new THREE.FogExp2('#090e1a', 0.022);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 120);
    camera.position.set(...CAMERA_PRESETS.hero.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 4.2;
    controls.maxDistance = 18.5;
    controls.maxPolarAngle = Math.PI * 0.64; // Allow tilting low to inspect subsurface drill!
    controls.minPolarAngle = 0.12;
    controls.target.set(...CAMERA_PRESETS.hero.target);
    controls.autoRotate = !isSoftwareGl && autoOrbit;
    controls.autoRotateSpeed = 0.85;

    // Lighting: Three-point + Martian hemisphere + Interior Bio-Dome Grow-LEDs
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x7c2d12, 0.85);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffe7d1, 2.35);
    sunLight.position.set(11, 15, 9);
    sunLight.castShadow = !isSoftwareGl;
    if (!isSoftwareGl) {
      sunLight.shadow.mapSize.set(1024, 1024);
      sunLight.shadow.camera.near = 2;
      sunLight.shadow.camera.far = 36;
      const d = 9;
      sunLight.shadow.camera.left = -d;
      sunLight.shadow.camera.right = d;
      sunLight.shadow.camera.top = d;
      sunLight.shadow.camera.bottom = -d;
      sunLight.shadow.bias = -0.0004;
    }
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.9);
    rimLight.position.set(-10, 7, -9);
    scene.add(rimLight);

    const interiorLight = new THREE.PointLight(0x67e8f9, 3.2, 14, 1.5);
    interiorLight.position.set(0, 2.1, 0);
    scene.add(interiorLight);

    const growLightA = new THREE.PointLight(0xe879f9, 1.8, 9, 1.6);
    growLightA.position.set(-2.2, 1.1, 1.4);
    scene.add(growLightA);

    const growLightB = new THREE.PointLight(0x4ade80, 1.6, 9, 1.6);
    growLightB.position.set(2.1, 1.1, -1.6);
    scene.add(growLightB);

    // Track disposable textures/geometries/materials
    const disposables: { dispose: () => void }[] = [];
    const track = <T extends { dispose: () => void }>(item: T): T => {
      disposables.push(item);
      return item;
    };

    const clickableMeshes: THREE.Object3D[] = [];
    const tagSubsystem = (obj: THREE.Object3D, subsystem: DomeSubsystemId) => {
      obj.userData.subsystem = subsystem;
      clickableMeshes.push(obj);
    };

    // Procedural Textures
    const deckTex = track(createDeckTexture());
    const airlockSignTex = track(createAirlockSignTexture());
    const o2TankTex = track(createTankBandTexture('#dc2626', 'O₂ PRESS'));
    const h2oTankTex = track(createTankBandTexture('#0284c7', 'H₂O CRYO'));
    const solarTex = track(createSolarTexture());
    let regolithTex = track(createMartianRegolithTexture(soilFertility));

    // Shared PBR Materials
    const titaniumMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x64748b,
        metalness: 0.72,
        roughness: 0.34,
      })
    );
    const darkArmorMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.65,
        roughness: 0.44,
      })
    );
    const copperStrutMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xc2703e,
        metalness: 0.82,
        roughness: 0.28,
      })
    );
    const hubSteelMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.88,
        roughness: 0.22,
      })
    );
    const deckMat = track(
      new THREE.MeshStandardMaterial({
        map: deckTex,
        metalness: 0.45,
        roughness: 0.52,
      })
    );
    const regolithMat = track(
      new THREE.MeshStandardMaterial({
        map: regolithTex,
        roughness: 0.92,
        metalness: 0.04,
      })
    );
    const aquiferMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x0ea5e9,
        emissive: 0x0284c7,
        emissiveIntensity: 0.95,
        roughness: 0.2,
        metalness: 0.1,
        transparent: true,
        opacity: 0.88,
      })
    );
    const waterMoatMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        emissive: 0x0891b2,
        emissiveIntensity: 0.42,
        roughness: 0.14,
        metalness: 0.22,
        transparent: true,
        opacity: 0.86,
      })
    );
    const soilBedMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x3b2f26,
        roughness: 0.94,
        metalness: 0.02,
      })
    );
    const foliageMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        roughness: 0.58,
        metalness: 0.05,
      })
    );
    const growLedMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xf0abfc,
        emissive: 0xd946ef,
        emissiveIntensity: 1.5,
        roughness: 0.3,
      })
    );
    const cyanGlowMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x67e8f9,
        emissive: 0x22d3ee,
        emissiveIntensity: 1.6,
        roughness: 0.2,
      })
    );
    const domeGlassMat = track(
      isSoftwareGl
        ? new THREE.MeshStandardMaterial({
            color: 0xbae6fd,
            roughness: 0.14,
            metalness: 0.15,
            transparent: true,
            opacity: 0.26,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        : new THREE.MeshPhysicalMaterial({
            color: 0xcffafe,
            roughness: 0.08,
            metalness: 0.05,
            transmission: 0.72,
            transparent: true,
            opacity: 0.34,
            ior: 1.45,
            thickness: 0.18,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
    );

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    // ------------------------------------------------------------------
    // 1. MARTIAN TERRAIN APRON & SUBSURFACE BORE / AQUIFER CUTAWAY
    // ------------------------------------------------------------------
    const terrainGroup = new THREE.Group();
    rootGroup.add(terrainGroup);

    const terrainGeo = track(new THREE.CylinderGeometry(8.8, 9.2, 0.36, 64, 1));
    const terrainMesh = new THREE.Mesh(terrainGeo, regolithMat);
    terrainMesh.position.y = -0.18;
    terrainMesh.receiveShadow = true;
    terrainGroup.add(terrainMesh);

    // Scattered Martian boulders around the perimeter (InstancedMesh)
    const rockGeo = track(new THREE.DodecahedronGeometry(0.18, 0));
    const rockInst = new THREE.InstancedMesh(rockGeo, regolithMat, 28);
    for (let i = 0; i < 28; i++) {
      const ang = (i / 28) * Math.PI * 2 + (i % 3) * 0.21;
      const dist = 5.4 + ((i * 37) % 10) * 0.32;
      _dummy.position.set(Math.cos(ang) * dist, 0.04, Math.sin(ang) * dist);
      _dummy.rotation.set(i * 0.7, i * 1.1, 0);
      const sc = 0.55 + ((i * 13) % 10) * 0.12;
      _dummy.scale.set(sc * 1.3, sc * 0.7, sc);
      _dummy.updateMatrix();
      rockInst.setMatrixAt(i, _dummy.matrix);
    }
    rockInst.instanceMatrix.needsUpdate = true;
    terrainGroup.add(rockInst);

    // Subsurface geological bore column (inspired by image_9d36d7af.png)
    const drillGroup = new THREE.Group();
    rootGroup.add(drillGroup);

    const pierProfile = [
      new THREE.Vector2(0.01, -3.1),
      new THREE.Vector2(1.45, -3.1),
      new THREE.Vector2(1.45, -2.55),
      new THREE.Vector2(1.18, -2.35),
      new THREE.Vector2(1.18, -1.1),
      new THREE.Vector2(1.42, -0.75),
      new THREE.Vector2(1.62, -0.15),
      new THREE.Vector2(0.01, -0.15),
    ];
    const pierGeo = track(new THREE.LatheGeometry(pierProfile, 32));
    const pierMesh = new THREE.Mesh(pierGeo, darkArmorMat);
    pierMesh.castShadow = true;
    drillGroup.add(pierMesh);
    tagSubsystem(pierMesh, 'drill');

    // Vertical structural ribs around the subsurface pier
    const pierRibGeo = track(new THREE.BoxGeometry(0.14, 2.35, 0.24));
    const pierRibs = new THREE.InstancedMesh(pierRibGeo, titaniumMat, 12);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      _dummy.position.set(Math.cos(a) * 1.24, -1.7, Math.sin(a) * 1.24);
      _dummy.rotation.set(0, -a, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      pierRibs.setMatrixAt(i, _dummy.matrix);
    }
    pierRibs.instanceMatrix.needsUpdate = true;
    drillGroup.add(pierRibs);

    // Subsurface ice aquifer disc & drill stem
    const aquiferDiscGeo = track(new THREE.CylinderGeometry(2.35, 2.45, 0.28, 40));
    const aquiferDisc = new THREE.Mesh(aquiferDiscGeo, aquiferMat);
    aquiferDisc.position.y = -3.18;
    drillGroup.add(aquiferDisc);
    tagSubsystem(aquiferDisc, 'drill');

    // Animated ascending cryo-water pump rings along the drill shaft
    const pumpRingGeo = track(new THREE.TorusGeometry(1.26, 0.045, 10, 36));
    const pumpRings: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(pumpRingGeo, cyanGlowMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -2.8 + i * 0.85;
      drillGroup.add(ring);
      pumpRings.push(ring);
    }

    // ------------------------------------------------------------------
    // 2. ARMORED CIRCULAR FOUNDATION DECK (image_9d36d7af.png)
    // ------------------------------------------------------------------
    const deckGroup = new THREE.Group();
    rootGroup.add(deckGroup);

    const baseRingGeo = track(new THREE.CylinderGeometry(4.62, 4.92, 0.38, 64));
    const baseRing = new THREE.Mesh(baseRingGeo, darkArmorMat);
    baseRing.position.y = 0.19;
    baseRing.receiveShadow = true;
    baseRing.castShadow = true;
    deckGroup.add(baseRing);

    const floorDiscGeo = track(new THREE.CylinderGeometry(4.45, 4.45, 0.06, 64));
    const floorDisc = new THREE.Mesh(floorDiscGeo, deckMat);
    floorDisc.position.y = 0.39;
    floorDisc.receiveShadow = true;
    deckGroup.add(floorDisc);

    // 24 armored perimeter buttress cleats around the circular deck
    const cleatGeo = track(new THREE.BoxGeometry(0.22, 0.44, 0.48));
    const cleats = new THREE.InstancedMesh(cleatGeo, titaniumMat, 24);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      _dummy.position.set(Math.cos(a) * 4.7, 0.22, Math.sin(a) * 4.7);
      _dummy.rotation.set(0, -a, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      cleats.setMatrixAt(i, _dummy.matrix);
    }
    cleats.instanceMatrix.needsUpdate = true;
    cleats.castShadow = true;
    deckGroup.add(cleats);

    // ------------------------------------------------------------------
    // 3. INTERIOR ECOSYSTEM: TURQUOISE RESERVOIR + RADIAL BRIDGES + CROPS + SPIRE
    //    (image_65eb33ea.png & image_9d36d7af.png)
    // ------------------------------------------------------------------
    const interiorGroup = new THREE.Group();
    interiorGroup.position.y = 0.42;
    rootGroup.add(interiorGroup);

    // Annular turquoise hydrological reservoir moat
    const moatGeo = track(new THREE.RingGeometry(1.18, 2.18, 48));
    moatGeo.rotateX(-Math.PI / 2);
    const moatMesh = new THREE.Mesh(moatGeo, waterMoatMat);
    moatMesh.position.y = 0.025;
    interiorGroup.add(moatMesh);
    tagSubsystem(moatMesh, 'hydroponics');

    // Containment rim walls for moat
    const innerCurbGeo = track(new THREE.TorusGeometry(1.18, 0.055, 8, 48));
    innerCurbGeo.rotateX(Math.PI / 2);
    interiorGroup.add(new THREE.Mesh(innerCurbGeo, titaniumMat));
    const outerCurbGeo = track(new THREE.TorusGeometry(2.18, 0.06, 8, 48));
    outerCurbGeo.rotateX(Math.PI / 2);
    interiorGroup.add(new THREE.Mesh(outerCurbGeo, titaniumMat));

    // 4 Radial steel walkways spanning over the water reservoir
    const bridgeGeo = track(new THREE.BoxGeometry(0.28, 0.08, 1.32));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const bridge = new THREE.Mesh(bridgeGeo, titaniumMat);
      bridge.position.set(Math.sin(a) * 1.68, 0.065, Math.cos(a) * 1.68);
      bridge.rotation.y = a;
      bridge.castShadow = true;
      interiorGroup.add(bridge);
    }

    // Concentric agricultural soil/hydroponic rings + raised curved beds
    const outerSoilRingGeo = track(new THREE.RingGeometry(2.28, 3.82, 48));
    outerSoilRingGeo.rotateX(-Math.PI / 2);
    const outerSoilRing = new THREE.Mesh(outerSoilRingGeo, soilBedMat);
    outerSoilRing.position.y = 0.012;
    outerSoilRing.receiveShadow = true;
    interiorGroup.add(outerSoilRing);
    tagSubsystem(outerSoilRing, 'hydroponics');

    const innerIslandGeo = track(new THREE.CylinderGeometry(1.12, 1.15, 0.08, 36));
    const innerIsland = new THREE.Mesh(innerIslandGeo, foliageMat);
    innerIsland.position.y = 0.03;
    interiorGroup.add(innerIsland);

    // Instanced lush crop canopies & hydroponic trays in outer belt (avoid airlock front arc)
    const cropGeo = track(new THREE.IcosahedronGeometry(0.11, 1));
    const cropPositions: { x: number; z: number; scale: number }[] = [];
    for (let ring = 0; ring < 3; ring++) {
      const r = 2.48 + ring * 0.44;
      const count = 26 + ring * 10;
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2;
        // Leave clear walkway corridor toward front Airlock (+Z axis)
        if (Math.abs(Math.sin(ang - Math.PI / 2)) > 0.94 && Math.sin(ang) > 0) continue;
        cropPositions.push({
          x: Math.cos(ang) * r,
          z: Math.sin(ang) * r,
          scale: 0.78 + ((i + ring) % 4) * 0.16,
        });
      }
    }
    const cropsInst = new THREE.InstancedMesh(cropGeo, foliageMat, cropPositions.length);
    const colorTmp = new THREE.Color();
    cropPositions.forEach((cp, idx) => {
      _dummy.position.set(cp.x, 0.11, cp.z);
      _dummy.rotation.set(0, idx * 0.5, 0);
      _dummy.scale.set(cp.scale * 1.15, cp.scale * 0.85, cp.scale);
      _dummy.updateMatrix();
      cropsInst.setMatrixAt(idx, _dummy.matrix);
      // Subtle botanical variation: emerald, lime, deep kale green
      colorTmp.setHSL(0.31 + ((idx % 5) - 2) * 0.025, 0.68, 0.36 + (idx % 3) * 0.06);
      cropsInst.setColorAt(idx, colorTmp);
    });
    cropsInst.instanceMatrix.needsUpdate = true;
    if (cropsInst.instanceColor) cropsInst.instanceColor.needsUpdate = true;
    cropsInst.castShadow = true;
    interiorGroup.add(cropsInst);
    tagSubsystem(cropsInst, 'hydroponics');

    // Magenta/cyan grow-LED light arcs suspended above crop sectors
    const ledArcGeo = track(new THREE.TorusGeometry(3.05, 0.032, 8, 48, Math.PI * 1.55));
    ledArcGeo.rotateX(Math.PI / 2);
    ledArcGeo.rotateZ(Math.PI * 0.72);
    const ledArc = new THREE.Mesh(ledArcGeo, growLedMat);
    ledArc.position.y = 0.72;
    interiorGroup.add(ledArc);

    // Twin Interior Bio-Filtration / Seed Bank Silos (from image_9d36d7af.png)
    const siloBodyGeo = track(new THREE.CylinderGeometry(0.46, 0.48, 0.78, 24));
    const siloCapGeo = track(new THREE.ConeGeometry(0.46, 0.24, 24));
    const siloOffsets: [number, number][] = [
      [-1.55, -2.55],
      [-2.62, -1.78],
    ];
    siloOffsets.forEach(([sx, sz]) => {
      const body = new THREE.Mesh(siloBodyGeo, hubSteelMat);
      body.position.set(sx, 0.39, sz);
      body.castShadow = true;
      interiorGroup.add(body);
      const cap = new THREE.Mesh(siloCapGeo, titaniumMat);
      cap.position.set(sx, 0.9, sz);
      interiorGroup.add(cap);
    });

    // Central Hydrological & Atmospheric Spire Tower (image_65eb33ea.png)
    const spireGroup = new THREE.Group();
    interiorGroup.add(spireGroup);

    const spireProfile = [
      new THREE.Vector2(0.01, 0),
      new THREE.Vector2(0.56, 0),
      new THREE.Vector2(0.42, 0.32),
      new THREE.Vector2(0.28, 0.65),
      new THREE.Vector2(0.24, 2.35),
      new THREE.Vector2(0.46, 2.75),
      new THREE.Vector2(0.32, 3.05),
      new THREE.Vector2(0.12, 3.65),
      new THREE.Vector2(0.03, 4.35),
      new THREE.Vector2(0.01, 4.4),
    ];
    const spireGeo = track(new THREE.LatheGeometry(spireProfile, 28));
    const spireMesh = new THREE.Mesh(spireGeo, hubSteelMat);
    spireMesh.castShadow = true;
    spireGroup.add(spireMesh);
    tagSubsystem(spireMesh, 'spire');

    // Louvered condenser rings & glowing cyan O2 scrubber halo on spire
    const spireRingGeo = track(new THREE.TorusGeometry(0.32, 0.035, 8, 28));
    spireRingGeo.rotateX(Math.PI / 2);
    for (let r = 0; r < 5; r++) {
      const sr = new THREE.Mesh(spireRingGeo, r === 2 ? cyanGlowMat : titaniumMat);
      sr.position.y = 0.85 + r * 0.36;
      spireGroup.add(sr);
    }

    // Rotating top solar-telemetry collar on spire apex
    const rotorGroup = new THREE.Group();
    rotorGroup.position.y = 3.12;
    spireGroup.add(rotorGroup);
    const solarWingGeo = track(new THREE.BoxGeometry(1.5, 0.04, 0.42));
    const solarMat = track(
      new THREE.MeshStandardMaterial({
        map: solarTex,
        metalness: 0.45,
        roughness: 0.25,
      })
    );
    const wingA = new THREE.Mesh(solarWingGeo, solarMat);
    wingA.position.x = 1.05;
    wingA.rotation.x = 0.25;
    rotorGroup.add(wingA);
    const wingB = new THREE.Mesh(solarWingGeo, solarMat);
    wingB.position.x = -1.05;
    wingB.rotation.x = -0.25;
    rotorGroup.add(wingB);

    // ------------------------------------------------------------------
    // 4. GEODESIC COPPER-TITANIUM FRAME + HUBS + GLAZED CANOPY
    //    (image_352a5d46.png & image_65eb33ea.png)
    // ------------------------------------------------------------------
    const domeShellGroup = new THREE.Group();
    domeShellGroup.position.y = 0.38;
    rootGroup.add(domeShellGroup);

    const domeRadius = 4.35;
    const { edges, upperNodes } = buildGeodesicData(domeRadius, 2);

    // Geodesic Struts (InstancedMesh cylinders)
    const strutGeo = track(new THREE.CylinderGeometry(0.045, 0.045, 1, 8));
    const strutsInst = new THREE.InstancedMesh(strutGeo, copperStrutMat, edges.length);
    edges.forEach(([a, b], idx) => {
      _vMid.addVectors(a, b).multiplyScalar(0.5);
      _vDir.subVectors(b, a);
      const len = _vDir.length();
      _vDir.normalize();
      _quat.setFromUnitVectors(_up, _vDir);
      _dummy.position.copy(_vMid);
      _dummy.quaternion.copy(_quat);
      _dummy.scale.set(1, len, 1);
      _dummy.updateMatrix();
      strutsInst.setMatrixAt(idx, _dummy.matrix);
    });
    strutsInst.instanceMatrix.needsUpdate = true;
    strutsInst.castShadow = true;
    domeShellGroup.add(strutsInst);

    // Spherical Hub Connector Nodes (InstancedMesh)
    const nodeGeo = track(new THREE.SphereGeometry(0.105, 12, 10));
    const nodesInst = new THREE.InstancedMesh(nodeGeo, hubSteelMat, upperNodes.length);
    upperNodes.forEach((v, idx) => {
      _dummy.position.copy(v);
      _dummy.quaternion.identity();
      _dummy.scale.set(1, 0.72, 1);
      _dummy.updateMatrix();
      nodesInst.setMatrixAt(idx, _dummy.matrix);
    });
    nodesInst.instanceMatrix.needsUpdate = true;
    domeShellGroup.add(nodesInst);

    // Base collar ring sealing dome to armored deck
    const collarGeo = track(new THREE.TorusGeometry(domeRadius, 0.095, 12, 64));
    collarGeo.rotateX(Math.PI / 2);
    const collarMesh = new THREE.Mesh(collarGeo, titaniumMat);
    collarMesh.position.y = 0.02;
    domeShellGroup.add(collarMesh);

    // Transparent Pressurized Canopy (smoothly lifts/fades on Cutaway)
    const canopyGeo = track(
      new THREE.SphereGeometry(domeRadius - 0.03, 40, 22, 0, Math.PI * 2, 0, Math.PI * 0.51)
    );
    const canopyMesh = new THREE.Mesh(canopyGeo, domeGlassMat);
    canopyMesh.renderOrder = 3;
    domeShellGroup.add(canopyMesh);

    // ------------------------------------------------------------------
    // 5. PRESSURIZED AIRLOCK VESTIBULE & EXTERNAL O2 / H2O SILOS
    //    (directly modeled after image_352a5d46.png)
    // ------------------------------------------------------------------
    const airlockGroup = new THREE.Group();
    airlockGroup.position.set(0, 0.38, 4.18);
    rootGroup.add(airlockGroup);

    // Heavy armored vestibule housing
    const frameGeo = track(new THREE.BoxGeometry(2.05, 1.55, 1.05));
    const frameMesh = new THREE.Mesh(frameGeo, hubSteelMat);
    frameMesh.position.set(0, 0.76, 0.12);
    frameMesh.castShadow = true;
    airlockGroup.add(frameMesh);
    tagSubsystem(frameMesh, 'airlock');

    // "AIRLOCK" Header Plate
    const signGeo = track(new THREE.PlaneGeometry(1.48, 0.34));
    const signMat = track(new THREE.MeshBasicMaterial({ map: airlockSignTex }));
    const signMesh = new THREE.Mesh(signGeo, signMat);
    signMesh.position.set(0, 1.32, 0.655);
    airlockGroup.add(signMesh);

    // Circular recessed airlock portal rings & hatch tunnel
    const portalOuterGeo = track(new THREE.TorusGeometry(0.48, 0.09, 14, 32));
    const portalOuter = new THREE.Mesh(portalOuterGeo, copperStrutMat);
    portalOuter.position.set(0, 0.6, 0.63);
    airlockGroup.add(portalOuter);

    const hatchTunnelGeo = track(new THREE.CylinderGeometry(0.43, 0.43, 0.75, 28));
    hatchTunnelGeo.rotateX(Math.PI / 2);
    const hatchTunnel = new THREE.Mesh(hatchTunnelGeo, darkArmorMat);
    hatchTunnel.position.set(0, 0.6, 0.28);
    airlockGroup.add(hatchTunnel);

    const hatchDoorGeo = track(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 24));
    hatchDoorGeo.rotateX(Math.PI / 2);
    const hatchDoor = new THREE.Mesh(hatchDoorGeo, cyanGlowMat);
    hatchDoor.position.set(0, 0.6, 0.1);
    airlockGroup.add(hatchDoor);

    // Boarding ramp onto Martian terrain
    const rampGeo = track(new THREE.BoxGeometry(1.22, 0.09, 0.95));
    const rampMesh = new THREE.Mesh(rampGeo, titaniumMat);
    rampMesh.position.set(0, -0.18, 0.92);
    rampMesh.rotation.x = 0.24;
    airlockGroup.add(rampMesh);

    // External Vertical O2 Gas Cylinder + Horizontal H2O Cryo Tank & Manifold
    const o2TankMat = track(
      new THREE.MeshStandardMaterial({
        map: o2TankTex,
        metalness: 0.45,
        roughness: 0.32,
      })
    );
    const h2oTankMat = track(
      new THREE.MeshStandardMaterial({
        map: h2oTankTex,
        metalness: 0.45,
        roughness: 0.32,
      })
    );

    const vertTankGeo = track(new THREE.CylinderGeometry(0.24, 0.24, 1.35, 24));
    const vertCapGeo = track(new THREE.SphereGeometry(0.24, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2));
    const vertTank = new THREE.Mesh(vertTankGeo, o2TankMat);
    vertTank.position.set(1.36, 0.68, 0.42);
    vertTank.castShadow = true;
    airlockGroup.add(vertTank);
    tagSubsystem(vertTank, 'airlock');

    const vertCap = new THREE.Mesh(vertCapGeo, hubSteelMat);
    vertCap.position.set(1.36, 1.35, 0.42);
    airlockGroup.add(vertCap);

    // Horizontal Cryo Water/MOXIE Buffer Tank on cradle
    const horizTankGeo = track(new THREE.CapsuleGeometry(0.26, 0.85, 8, 20));
    horizTankGeo.rotateZ(Math.PI / 2);
    const horizTank = new THREE.Mesh(horizTankGeo, h2oTankMat);
    horizTank.position.set(2.35, 0.35, 0.35);
    horizTank.castShadow = true;
    airlockGroup.add(horizTank);
    tagSubsystem(horizTank, 'airlock');

    const cradleGeo = track(new THREE.BoxGeometry(1.05, 0.24, 0.56));
    const cradle = new THREE.Mesh(cradleGeo, darkArmorMat);
    cradle.position.set(2.35, -0.02, 0.35);
    airlockGroup.add(cradle);

    // Twin supply pipes feeding from exterior tanks into dome base
    const pipeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.36, 0.25, 0.42),
      new THREE.Vector3(1.36, 0.25, -0.15),
      new THREE.Vector3(0.95, 0.25, -0.45),
    ]);
    const pipeGeo = track(new THREE.TubeGeometry(pipeCurve, 16, 0.045, 8, false));
    airlockGroup.add(new THREE.Mesh(pipeGeo, copperStrutMat));

    // ------------------------------------------------------------------
    // 6. INTERACTION, ANIMATION & STATE SYNC
    // ------------------------------------------------------------------
    let targetCutaway = 0;
    let currentCutaway = 0;
    let isCameraAnimating = false;
    const targetCamPos = new THREE.Vector3(...CAMERA_PRESETS.hero.pos);
    const targetCtrlTarget = new THREE.Vector3(...CAMERA_PRESETS.hero.target);
    let currentTierScale = tierScale;
    let targetTierScale = tierScale;

    let pointerDownPos = { x: 0, y: 0 };
    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) > 5) {
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      _mouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _mouseNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_mouseNdc, camera);
      const hits = _raycaster.intersectObjects(clickableMeshes, false);
      if (hits.length > 0) {
        const sub = hits[0].object.userData.subsystem as DomeSubsystemId | undefined;
        if (sub) {
          callbacksRef.current.onSelectSubsystem?.(sub);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const onControlsStart = () => {
      isCameraAnimating = false;
    };
    controls.addEventListener('start', onControlsStart);

    const requestRender = () => {
      if (disposed) return;
      renderer.render(scene, camera);
    };

    const clock = new THREE.Clock();
    const tick = () => {
      if (disposed) return;
      const dt = Math.min(0.05, clock.getDelta());
      const elapsed = clock.elapsedTime;

      // Smooth cutaway lift & fade
      currentCutaway = THREE.MathUtils.damp(currentCutaway, targetCutaway, 6.5, dt);
      domeShellGroup.position.y = 0.38 + currentCutaway * 2.15;
      canopyMesh.visible = currentCutaway < 0.92;
      domeGlassMat.opacity = (isSoftwareGl ? 0.26 : 0.34) * (1 - currentCutaway * 0.85);
      strutsInst.visible = currentCutaway < 0.96;
      nodesInst.visible = currentCutaway < 0.96;

      // Smooth tier scaling
      currentTierScale = THREE.MathUtils.damp(currentTierScale, targetTierScale, 5.5, dt);
      rootGroup.scale.setScalar(currentTierScale);

      // Smooth camera transition when preset clicked
      if (isCameraAnimating) {
        camera.position.lerp(targetCamPos, 1 - Math.exp(-5.5 * dt));
        controls.target.lerp(targetCtrlTarget, 1 - Math.exp(-6.5 * dt));
        if (
          camera.position.distanceTo(targetCamPos) < 0.04 &&
          controls.target.distanceTo(targetCtrlTarget) < 0.03
        ) {
          isCameraAnimating = false;
        }
      }

      // Subtle living biomechanics: rotating solar rotor & ascending cryo-water pulse rings
      if (!isSoftwareGl) {
        rotorGroup.rotation.y += dt * 0.45;
        pumpRings.forEach((ring, i) => {
          const cycle = ((elapsed * 0.55 + i * 0.33) % 1);
          ring.position.y = -2.95 + cycle * 2.55;
          const s = 1.0 + Math.sin(cycle * Math.PI) * 0.08;
          ring.scale.set(s, s, 1);
        });
        aquiferMat.emissiveIntensity = 0.82 + Math.sin(elapsed * 2.0) * 0.16;
      }

      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(tick);
    };

    if (isSoftwareGl) {
      // Static initial render + on-demand OrbitControls updates on SwiftShader
      controls.addEventListener('change', requestRender);
      requestRender();
    } else {
      renderer.compile(scene, camera);
      frameId = requestAnimationFrame(tick);
    }

    hooksRef.current = {
      applyPreset: (p: DomeCameraPreset) => {
        const cfg = CAMERA_PRESETS[p];
        targetCamPos.set(...cfg.pos);
        targetCtrlTarget.set(...cfg.target);
        targetCutaway = cfg.cutaway ? 1 : 0;
        isCameraAnimating = true;
        if (isSoftwareGl) {
          camera.position.copy(targetCamPos);
          controls.target.copy(targetCtrlTarget);
          currentCutaway = targetCutaway;
          domeShellGroup.position.y = 0.38 + currentCutaway * 2.15;
          canopyMesh.visible = currentCutaway < 0.92;
          strutsInst.visible = currentCutaway < 0.96;
          nodesInst.visible = currentCutaway < 0.96;
          controls.update();
          requestRender();
        }
      },
      setCutaway: (c: boolean) => {
        targetCutaway = c ? 1 : 0;
        if (isSoftwareGl) {
          currentCutaway = targetCutaway;
          domeShellGroup.position.y = 0.38 + currentCutaway * 2.15;
          canopyMesh.visible = currentCutaway < 0.92;
          strutsInst.visible = currentCutaway < 0.96;
          nodesInst.visible = currentCutaway < 0.96;
          requestRender();
        }
      },
      setAutoOrbit: (a: boolean) => {
        controls.autoRotate = !isSoftwareGl && a;
      },
      updateTelemetryVisuals: (wp, sf, geo, nextTier) => {
        targetTierScale = nextTier === 'outpost' ? 0.88 : nextTier === 'habitat' ? 1.0 : 1.12;
        // Adjust aquifer brightness & color with subsurface water probability
        aquiferMat.color.setHex(wp >= 60 ? 0x38bdf8 : wp >= 35 ? 0x0ea5e9 : 0x475569);
        aquiferMat.emissive.setHex(geo >= 65 ? 0xf59e0b : wp >= 45 ? 0x0284c7 : 0x1e293b);

        // Rebuild Martian regolith texture if fertility class changed meaningfully
        const nextTex = createMartianRegolithTexture(sf);
        regolithTex.dispose();
        regolithTex = nextTex;
        regolithMat.map = regolithTex;
        regolithMat.needsUpdate = true;

        if (isSoftwareGl) {
          rootGroup.scale.setScalar(targetTierScale);
          requestRender();
        }
      },
    };

    const ro = new ResizeObserver((entries) => {
      if (disposed) return;
      for (const entry of entries) {
        const w = Math.max(200, Math.floor(entry.contentRect.width));
        const h = Math.max(180, Math.floor(entry.contentRect.height));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        if (isSoftwareGl) requestRender();
      }
    });
    ro.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      ro.disconnect();
      controls.removeEventListener('start', onControlsStart);
      controls.removeEventListener('change', requestRender);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      envTarget.dispose();
      disposables.forEach((d) => d.dispose());
      regolithTex.dispose();
      renderer.dispose();
      hooksRef.current = null;
    };
  }, []);

  // Sync props to live Three.js scene
  useEffect(() => {
    hooksRef.current?.updateTelemetryVisuals(waterProb, soilFertility, geothermalIndex, tier);
  }, [waterProb, soilFertility, geothermalIndex, tier, lat, lon]);

  useEffect(() => {
    hooksRef.current?.setAutoOrbit(autoOrbit);
  }, [autoOrbit]);

  const handleSelectPreset = (p: DomeCameraPreset) => {
    setPreset(p);
    setCutaway(CAMERA_PRESETS[p].cutaway);
    hooksRef.current?.applyPreset(p);
  };

  const handleToggleCutaway = () => {
    const next = !cutaway;
    setCutaway(next);
    hooksRef.current?.setCutaway(next);
  };

  const subsystemBadge =
    activeSubsystem === 'drill'
      ? pick('Subsurface Bore & Ice Pump', '지하 수자원 시추 코어')
      : activeSubsystem === 'airlock'
        ? pick('Airlock & MOXIE / O₂ Silos', '에어록 & 산소·MOXIE 탱크')
        : activeSubsystem === 'hydroponics'
          ? pick('Hydroponic Crop Ring & Reservoir', '수경 작물 링 & 저수조')
          : activeSubsystem === 'spire'
            ? pick('Atmospheric Condenser Spire', '중앙 대기·수분 순환 타워')
            : pick('Click 3D Modules to Inspect', '3D 모듈을 클릭해 세부 점검');

  return (
    <div className={`relative w-full h-full bg-[#070b14] overflow-hidden select-none ${className}`}>
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top-Left Minimal Solid Telemetry Badge (no backdrop-blur over WebGL) */}
      <div className="pointer-events-none absolute top-2.5 left-2.5 flex items-center gap-2">
        <div className="bg-[#0b1220] border border-white/20 rounded-lg px-2.5 py-1 text-[10px] font-mono text-sky-200 shadow-lg flex items-center gap-1.5">
          {activeSubsystem === 'drill' ? (
            <Waves className="w-3 h-3 text-sky-400" />
          ) : activeSubsystem === 'airlock' ? (
            <Shield className="w-3 h-3 text-amber-300" />
          ) : activeSubsystem === 'hydroponics' ? (
            <Sprout className="w-3 h-3 text-emerald-400" />
          ) : (
            <Layers className="w-3 h-3 text-cyan-300" />
          )}
          <span>{subsystemBadge}</span>
        </div>
      </div>

      {/* Bottom Solid Camera & Cutaway Control Dock */}
      <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1.5 flex-wrap pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-1 bg-[#0b1220] border border-white/20 rounded-lg p-1 shadow-lg">
          {(
            [
              { id: 'hero', label: pick('Exterior', '외관') },
              { id: 'cutaway', label: pick('Interior', '내부') },
              { id: 'airlock', label: pick('Airlock', '에어록') },
              { id: 'drill', label: pick('Drill', '지하 시추') },
              { id: 'top', label: pick('Top', '상단') },
            ] as { id: DomeCameraPreset; label: string }[]
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectPreset(item.id)}
              className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                preset === item.id
                  ? 'bg-sky-500 text-slate-950 font-bold'
                  : 'text-slate-200 hover:bg-white/10 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="pointer-events-auto flex items-center gap-1 bg-[#0b1220] border border-white/20 rounded-lg p-1 shadow-lg">
          <button
            type="button"
            onClick={handleToggleCutaway}
            className={`px-2 py-1 text-[10px] font-medium rounded flex items-center gap-1 transition-colors ${
              cutaway
                ? 'bg-amber-400 text-slate-950 font-bold'
                : 'text-slate-200 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Eye className="w-3 h-3" />
            <span>{pick('Cutaway', '단면 열기')}</span>
          </button>
          <button
            type="button"
            onClick={() => setAutoOrbit((v) => !v)}
            title={pick('Auto rotate', '자동 회전')}
            className={`p-1 rounded transition-colors ${
              autoOrbit
                ? 'bg-cyan-500/25 text-cyan-200'
                : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
