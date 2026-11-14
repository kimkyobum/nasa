import {
  KM_PER_DEG,
  normalizeLon,
  sampleMarsTelemetry,
} from '../data/marsData';
import {
  MarsTelemetryPoint,
  NavigationMode,
  RoutePoint,
  RouteResult,
  RouteWaypoint,
} from '../types/mars';

interface AStarNode {
  r: number;
  c: number;
  g: number;
  f: number;
}

interface TileTerrainCell extends MarsTelemetryPoint {
  unwrappedLon: number;
  cliffHazard: number; // 0-100 extracted directly from real NASA Viking + MOLA tiles
  isFissureWall: boolean;
}

const LAYER_PATHS = {
  viking: 'Mars_Viking_MDIM21_ClrMosaic_global_232m',
  mola: 'Mars_MGS_MOLA_ClrShade_merge_global_463m',
};

const tileImageCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadCorsTile(
  layer: 'viking' | 'mola',
  z: number,
  y: number,
  x: number
): Promise<HTMLImageElement | null> {
  const key = `${layer}/${z}/${y}/${x}`;
  const existing = tileImageCache.get(key);
  if (existing) return existing;

  const p = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `https://trek.nasa.gov/tiles/Mars/EQ/${LAYER_PATHS[layer]}/1.0.0/default/default028mm/${z}/${y}/${x}.jpg`;
  });
  tileImageCache.set(key, p);
  return p;
}

function haversineApproxKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const meanLatRad = (((lat1 + lat2) / 2) * Math.PI) / 180;
  const dLatKm = (lat2 - lat1) * KM_PER_DEG;
  const dLonKm = (lon2 - lon1) * KM_PER_DEG * Math.cos(meanLatRad);
  return Math.hypot(dLatKm, dLonKm);
}

function bearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLon = lon2 - lon1;
  const dLat = lat2 - lat1;
  const rad = Math.atan2(dLon, dLat);
  return Math.round(((rad * 180) / Math.PI + 360) % 360);
}

function bearingToKorean(deg: number): string {
  const dirs = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
  return dirs[Math.round(deg / 45) % 8];
}

// Convert MOLA Color Shaded Relief RGB into approximate physical elevation (m)
function molaRgbToElevationM(r: number, g: number, b: number, fallback: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta < 18) {
    // Gray/white peak (e.g., Olympus summit) or deep shadow
    return max > 180 ? 18500 : fallback;
  }
  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;

  // MOLA rainbow ramp: Violet/Blue (~260°) = -6000m -> Cyan (~180°) = -2000m -> Green (~120°) = +500m -> Yellow (~60°) = +3500m -> Red (~0°) = +10000m
  if (hue > 280) return -5500;
  const t = Math.max(0, Math.min(1, (265 - hue) / 265));
  return Math.round(-6500 + t * 18500);
}

async function buildRealTileTerrainGrid(
  latMin: number,
  latMax: number,
  lonMin: number,
  lonMax: number,
  ROWS: number,
  COLS: number
): Promise<{ grid: TileTerrainCell[][]; fromTiles: boolean }> {
  // Choose zoom level so bbox spans <= 5x5 tiles for fast loading while preserving crisp faults/craters
  const spanDeg = Math.max(latMax - latMin, lonMax - lonMin);
  let z = 5;
  if (spanDeg > 60) z = 3;
  else if (spanDeg > 28) z = 4;
  else if (spanDeg > 11) z = 5;
  else z = 6;

  const numCols = 1 << (z + 1);
  const numRows = 1 << z;
  const tileDeg = 180 / numRows;

  const colStart = Math.max(0, Math.floor((lonMin + 180) / tileDeg));
  const colEnd = Math.min(numCols - 1, Math.floor((lonMax + 180) / tileDeg));
  const rowStart = Math.max(0, Math.floor((90 - latMax) / tileDeg));
  const rowEnd = Math.min(numRows - 1, Math.floor((90 - latMin) / tileDeg));

  // Sample at 4x higher pixel resolution first so thin fissures/crater walls are detected
  const HI_SCALE = 4;
  const hiW = COLS * HI_SCALE;
  const hiH = ROWS * HI_SCALE;

  const vikingCanvas = document.createElement('canvas');
  vikingCanvas.width = hiW;
  vikingCanvas.height = hiH;
  const vCtx = vikingCanvas.getContext('2d');

  const molaCanvas = document.createElement('canvas');
  molaCanvas.width = hiW;
  molaCanvas.height = hiH;
  const mCtx = molaCanvas.getContext('2d');

  let loadedCount = 0;

  if (vCtx && mCtx) {
    const tasks: Promise<void>[] = [];
    for (let r = rowStart; r <= rowEnd; r++) {
      const tileLatTop = 90 - r * tileDeg;
      const tileLatBot = tileLatTop - tileDeg;
      const dy = ((latMax - tileLatTop) / (latMax - latMin)) * hiH;
      const dh = ((tileLatTop - tileLatBot) / (latMax - latMin)) * hiH;

      for (let c = colStart; c <= colEnd; c++) {
        const tileLonLeft = -180 + c * tileDeg;
        const dx = ((tileLonLeft - lonMin) / (lonMax - lonMin)) * hiW;
        const dw = (tileDeg / (lonMax - lonMin)) * hiW;

        tasks.push(
          Promise.all([
            loadCorsTile('viking', z, r, c),
            loadCorsTile('mola', z, r, c),
          ]).then(([vImg, mImg]) => {
            if (vImg) {
              vCtx.drawImage(vImg, dx - 0.5, dy - 0.5, dw + 1, dh + 1);
              loadedCount++;
            }
            if (mImg) {
              mCtx.drawImage(mImg, dx - 0.5, dy - 0.5, dw + 1, dh + 1);
            }
          })
        );
      }
    }
    await Promise.all(tasks);
  }

  let vData: Uint8ClampedArray | null = null;
  let mData: Uint8ClampedArray | null = null;

  if (loadedCount > 0 && vCtx && mCtx) {
    try {
      vData = vCtx.getImageData(0, 0, hiW, hiH).data;
      mData = mCtx.getImageData(0, 0, hiW, hiH).data;
    } catch {
      vData = null;
      mData = null;
    }
  }

  // Compute pixel luminance + local shadow/cliff edge map on the hi-res satellite image
  const hiCliff = new Float32Array(hiW * hiH);
  const hiLum = new Float32Array(hiW * hiH);
  if (vData && mData) {
    for (let i = 0; i < hiW * hiH; i++) {
      const p = i * 4;
      hiLum[i] = vData[p] * 0.3 + vData[p + 1] * 0.59 + vData[p + 2] * 0.11;
    }

    for (let y = 2; y < hiH - 2; y++) {
      for (let x = 2; x < hiW - 2; x++) {
        const idx = y * hiW + x;
        const lum = hiLum[idx];

        // 5x5 neighborhood mean to spot sharp dark fissure shadows & bright sunlit scarps
        let sum = 0;
        for (let oy = -2; oy <= 2; oy += 2) {
          for (let ox = -2; ox <= 2; ox += 2) {
            sum += hiLum[(y + oy) * hiW + (x + ox)];
          }
        }
        const localMean = sum / 9;
        const darkShadow = Math.max(0, localMean - lum); // Deep canyon/fissure shadows!
        const brightRim = Math.max(0, lum - localMean); // Sharp sunlit crater/fault rim!

        // Sobel-like gradient on Viking & MOLA relief
        const gx = Math.abs(hiLum[idx + 1] - hiLum[idx - 1]);
        const gy = Math.abs(hiLum[idx + hiW] - hiLum[idx - hiW]);
        const grad = Math.hypot(gx, gy);

        const p = idx * 4;
        const mLum = mData[p] * 0.3 + mData[p + 1] * 0.59 + mData[p + 2] * 0.11;
        const mNextX =
          mData[p + 4] * 0.3 + mData[p + 5] * 0.59 + mData[p + 6] * 0.11;
        const mNextY =
          mData[p + hiW * 4] * 0.3 +
          mData[p + hiW * 4 + 1] * 0.59 +
          mData[p + hiW * 4 + 2] * 0.11;
        const mGrad = Math.hypot(mNextX - mLum, mNextY - mLum);

        // Combine fissure shadow + scarp gradient + MOLA relief gradient
        const cliff =
          darkShadow * 1.9 + brightRim * 1.1 + grad * 0.95 + mGrad * 1.2;
        hiCliff[idx] = cliff;
      }
    }
  }

  // Downsample into routing grid using max/p90 pooling so thin fault cliffs remain blocked
  const grid: TileTerrainCell[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const rowArr: TileTerrainCell[] = [];
    const lat = latMax - (r / (ROWS - 1)) * (latMax - latMin);

    for (let c = 0; c < COLS; c++) {
      const lon = lonMin + (c / (COLS - 1)) * (lonMax - lonMin);
      const baseTel = sampleMarsTelemetry(lat, lon);

      let cliffHazard = baseTel.roughnessHazard;
      let elevM = baseTel.elevationM;
      let slopeDeg = baseTel.slopeDeg;

      if (vData && mData) {
        let maxCliff = 0;
        let avgCliff = 0;
        const bx = c * HI_SCALE;
        const by = r * HI_SCALE;

        for (let oy = 0; oy < HI_SCALE; oy++) {
          for (let ox = 0; ox < HI_SCALE; ox++) {
            const val = hiCliff[(by + oy) * hiW + (bx + ox)];
            if (val > maxCliff) maxCliff = val;
            avgCliff += val;
          }
        }
        avgCliff /= HI_SCALE * HI_SCALE;

        // Center pixel of MOLA color relief for elevation estimate
        const midIdx = ((by + 2) * hiW + (bx + 2)) * 4;
        const molaElev = molaRgbToElevationM(
          mData[midIdx],
          mData[midIdx + 1],
          mData[midIdx + 2],
          baseTel.elevationM
        );
        elevM = Math.round(molaElev * 0.6 + baseTel.elevationM * 0.4);

        const pooledCliff = maxCliff * 0.55 + avgCliff * 0.45;
        cliffHazard = Math.min(100, Math.round(pooledCliff * 0.88));
        // Boost effective slope only where real satellite imagery shows sheer scarps/canyon walls
        slopeDeg = Number(
          Math.min(
            42,
            Math.max(baseTel.slopeDeg, pooledCliff * 0.19)
          ).toFixed(1)
        );
      }

      const isFissureWall = cliffHazard >= 76 || slopeDeg >= 18.0;

      rowArr.push({
        ...baseTel,
        unwrappedLon: lon,
        elevationM: elevM,
        slopeDeg,
        roughnessHazard: Math.max(baseTel.roughnessHazard, cliffHazard),
        cliffHazard,
        isFissureWall,
        isObstacle: baseTel.slopeDeg >= 19.0 || isFissureWall,
      });
    }
    grid.push(rowArr);
  }

  return { grid, fromTiles: loadedCount > 0 };
}

function runWeightedAStar(
  grid: TileTerrainCell[][],
  latMin: number,
  latMax: number,
  lonMin: number,
  lonMax: number,
  startCoord: { lat: number; lon: number },
  destCoord: { lat: number; lon: number },
  mode: NavigationMode,
  fromTiles: boolean
): RouteResult {
  const ROWS = grid.length;
  const COLS = grid[0].length;

  const sLat = Math.max(-85, Math.min(85, startCoord.lat));
  const sLon = normalizeLon(startCoord.lon);
  const dLat = Math.max(-85, Math.min(85, destCoord.lat));
  const dLon = normalizeLon(destCoord.lon);

  const directDist = haversineApproxKm(sLat, sLon, dLat, dLon);

  const toGrid = (lat: number, lon: number) => ({
    row: Math.max(
      0,
      Math.min(ROWS - 1, Math.round(((latMax - lat) / (latMax - latMin)) * (ROWS - 1)))
    ),
    col: Math.max(
      0,
      Math.min(COLS - 1, Math.round(((lon - lonMin) / (lonMax - lonMin)) * (COLS - 1)))
    ),
  });

  let start = toGrid(sLat, sLon);
  const dest = toGrid(dLat, dLon);

  const unreachableResult = (reasonKo: string): RouteResult => ({
    found: false,
    mode,
    terrainSource: fromTiles ? 'nasa_tiles' : 'model',
    points: [],
    waypoints: [],
    totalDistanceKm: 0,
    directDistanceKm: Number(directDist.toFixed(1)),
    estimatedHoursRover: 0,
    estimatedHoursEva: 0,
    maxSlopeDeg: 0,
    avgWaterProb: 0,
    hazardSegmentsCount: 0,
    safetyScore: 0,
    summaryKo: reasonKo,
  });

  if (directDist > 8500) {
    return unreachableResult(
      `단일 로버 탐사 한계 거리(8,500 km)를 초과해 이동이 불가능합니다. (직선 ${directDist.toFixed(0)} km)`
    );
  }

  let startCell = grid[start.row][start.col];
  // If user clicked directly on a sharp cliff line as Start, step to closest safe adjacent cell within ~2-3 cells
  if (
    startCell.isObstacle ||
    startCell.slopeDeg >= 18.0 ||
    (startCell.elevationM >= 16500 && mode !== 'fast')
  ) {
    let bestR = -1;
    let bestC = -1;
    let bestDist = Infinity;
    for (let dr = -4; dr <= 4; dr++) {
      for (let dc = -4; dc <= 4; dc++) {
        const nr = start.row + dr;
        const nc = start.col + dc;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        const cand = grid[nr][nc];
        if (
          !cand.isObstacle &&
          cand.slopeDeg < 18.0 &&
          (cand.elevationM < 16500 || mode === 'fast')
        ) {
          const d = Math.hypot(dr, dc);
          if (d < bestDist) {
            bestDist = d;
            bestR = nr;
            bestC = nc;
          }
        }
      }
    }
    if (bestR === -1) {
      return unreachableResult(
        `출발 지점이 급경사 절벽·고산 지형(경사 ${startCell.slopeDeg}° / 고도 ${startCell.elevationM.toLocaleString()}m)으로 출발할 수 없습니다.`
      );
    }
    start = { row: bestR, col: bestC };
    startCell = grid[bestR][bestC];
  }

  const destCell = grid[dest.row][dest.col];
  const destIsBlocked =
    destCell.isObstacle ||
    destCell.slopeDeg >= 18.0 ||
    (destCell.elevationM >= 16500 && mode !== 'fast');

  const total = ROWS * COLS;
  const gScore = new Float64Array(total).fill(Infinity);
  const cameFrom = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);

  const idx = (r: number, c: number) => r * COLS + c;
  const startIdx = idx(start.row, start.col);
  const destIdx = idx(dest.row, dest.col);

  const stepLatKm = ((latMax - latMin) / (ROWS - 1)) * KM_PER_DEG;
  const meanLatRad = (((latMax + latMin) / 2) * Math.PI) / 180;
  const stepLonKm =
    ((lonMax - lonMin) / (COLS - 1)) * KM_PER_DEG * Math.cos(meanLatRad);

  const heuristic = (r: number, c: number) =>
    Math.hypot((r - dest.row) * stepLatKm, (c - dest.col) * stepLonKm);

  class MinHeap {
    private items: AStarNode[] = [];
    get length() {
      return this.items.length;
    }
    clear() {
      this.items.length = 0;
    }
    push(node: AStarNode) {
      const a = this.items;
      a.push(node);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (a[p].f <= a[i].f) break;
        const tmp = a[p];
        a[p] = a[i];
        a[i] = tmp;
        i = p;
      }
    }
    pop(): AStarNode {
      const a = this.items;
      const top = a[0];
      const last = a.pop()!;
      if (a.length > 0) {
        a[0] = last;
        let i = 0;
        const n = a.length;
        while (true) {
          let smallest = i;
          const l = (i << 1) + 1;
          const r = l + 1;
          if (l < n && a[l].f < a[smallest].f) smallest = l;
          if (r < n && a[r].f < a[smallest].f) smallest = r;
          if (smallest === i) break;
          const tmp = a[i];
          a[i] = a[smallest];
          a[smallest] = tmp;
          i = smallest;
        }
      }
      return top;
    }
  }

  const open = new MinHeap();
  gScore[startIdx] = 0;

  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];

  // Search reachable safe terrain; when exact destination is blocked, explores reachable basin toward target
  const runSearch = (): boolean => {
    gScore.fill(Infinity);
    cameFrom.fill(-1);
    closed.fill(0);
    open.clear();
    gScore[startIdx] = 0;
    open.push({
      r: start.row,
      c: start.col,
      g: 0,
      f: heuristic(start.row, start.col),
    });

    while (open.length > 0) {
      const current = open.pop();
      const cIdx = idx(current.r, current.c);
      if (cIdx === destIdx && !destIsBlocked) {
        closed[cIdx] = 1;
        return true;
      }
      if (closed[cIdx]) continue;
      closed[cIdx] = 1;

      const currCell = grid[current.r][current.c];

      for (const [dr, dc] of dirs) {
        const nr = current.r + dr;
        const nc = current.c + dc;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;

        const nIdx = idx(nr, nc);
        if (closed[nIdx]) continue;

        const nextCell = grid[nr][nc];
        const nextBlocked =
          nextCell.isObstacle ||
          nextCell.slopeDeg >= 18.0 ||
          (nextCell.elevationM >= 16500 && mode !== 'fast');
        if (nextBlocked && (mode !== 'fast' || nextCell.slopeDeg >= 22)) {
          continue;
        }

        const stepKm = Math.hypot(dr * stepLatKm, dc * stepLonKm);
        const elevDiffKm =
          Math.abs(nextCell.elevationM - currCell.elevationM) / 1000;
        const surfaceStepKm = Math.hypot(stepKm, elevDiffKm);

        let penalty = 1.0;
        if (mode === 'safe') {
          const cliffPen = Math.pow(nextCell.cliffHazard / 34, 2.0) * 1.4;
          const slopePen =
            nextCell.slopeDeg > 9
              ? (nextCell.slopeDeg - 8) * 0.85
              : nextCell.slopeDeg * 0.12;
          penalty += cliffPen + slopePen;
        } else if (mode === 'fast') {
          const cliffPen = (nextCell.cliffHazard / 50) * 0.75;
          const wallPen = nextBlocked ? 10 : 0;
          penalty += cliffPen + wallPen + nextCell.slopeDeg * 0.04;
        } else if (mode === 'water') {
          const waterPen = ((100 - nextCell.combinedWaterProb) / 100) * 1.6;
          const cliffPen = Math.pow(nextCell.cliffHazard / 36, 1.8) * 1.0;
          penalty += waterPen + cliffPen;
        }

        const tentativeG = current.g + surfaceStepKm * penalty;
        if (tentativeG < gScore[nIdx]) {
          cameFrom[nIdx] = cIdx;
          gScore[nIdx] = tentativeG;
          open.push({
            r: nr,
            c: nc,
            g: tentativeG,
            f: tentativeG + heuristic(nr, nc),
          });
        }
      }
    }
    return false;
  };

  const reachedExact = runSearch();
  let targetIdx = destIdx;
  let snappedToSafeApproach = false;
  let bestApproachDistKm = 0;

  if (!reachedExact) {
    // Pick the closest reachable safe grid cell to the intended destination!
    let bestIdx = -1;
    let bestScore = Infinity;
    let bestPhysDist = Infinity;

    for (let i = 0; i < total; i++) {
      if (!closed[i]) continue;
      const r = Math.floor(i / COLS);
      const c = i % COLS;
      const cell = grid[r][c];
      if (cell.isObstacle || cell.slopeDeg >= 18.0) continue;
      const distKm = haversineApproxKm(cell.lat, cell.unwrappedLon, dLat, dLon);
      const score = distKm + (cell.slopeDeg > 11 ? (cell.slopeDeg - 11) * 3 : 0);
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
        bestPhysDist = distKm;
      }
    }

    // Reject only if trapped near start with zero meaningful progress toward a distant target
    const trappedNearStart =
      bestIdx === -1 ||
      (bestIdx === startIdx && directDist > 25) ||
      (directDist > 120 && bestPhysDist >= directDist * 0.94);

    if (trappedNearStart) {
      return unreachableResult(
        '협곡·단층 절벽 또는 분화구 외벽으로 완전히 가로막혀 접근 가능한 우회 경로가 존재하지 않습니다.'
      );
    }

    targetIdx = bestIdx;
    snappedToSafeApproach = true;
    bestApproachDistKm = bestPhysDist;
  }

  // Reconstruct raw grid cells
  const rawCells: TileTerrainCell[] = [];
  let trace = targetIdx;
  while (trace !== -1) {
    const r = Math.floor(trace / COLS);
    const c = trace % COLS;
    rawCells.push(grid[r][c]);
    trace = cameFrom[trace];
  }
  rawCells.reverse();

  const endCell = rawCells[rawCells.length - 1];
  const finalDestLat = snappedToSafeApproach ? endCell.lat : dLat;
  const finalDestLon = snappedToSafeApproach ? endCell.unwrappedLon : dLon;

  const startExact = sampleMarsTelemetry(startCell.lat, startCell.unwrappedLon);
  const destExact = sampleMarsTelemetry(finalDestLat, finalDestLon);

  const coords: { lat: number; lon: number; cell: TileTerrainCell }[] = [
    {
      lat: sLat,
      lon: sLon,
      cell: {
        ...startExact,
        unwrappedLon: sLon,
        cliffHazard: 0,
        isFissureWall: false,
      },
    },
    ...rawCells.slice(1, -1).map((cell) => ({
      lat: cell.lat,
      lon: cell.unwrappedLon,
      cell,
    })),
    {
      lat: finalDestLat,
      lon: finalDestLon,
      cell: {
        ...destExact,
        unwrappedLon: finalDestLon,
        cliffHazard: 0,
        isFissureWall: false,
      },
    },
  ];

  // Smooth interior points gently in continuous single-map coordinates
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < coords.length - 1; i++) {
      const sLatAvg =
        coords[i - 1].lat * 0.25 +
        coords[i].lat * 0.5 +
        coords[i + 1].lat * 0.25;
      const sLonAvg =
        coords[i - 1].lon * 0.25 +
        coords[i].lon * 0.5 +
        coords[i + 1].lon * 0.25;
      const gPos = toGrid(sLatAvg, sLonAvg);
      const cand = grid[gPos.row][gPos.col];
      if (!cand.isObstacle) {
        coords[i].lat = sLatAvg;
        coords[i].lon = sLonAvg;
        coords[i].cell = cand;
      }
    }
  }

  const points: RoutePoint[] = [];
  let accumKm = 0;
  let maxSlope = 0;
  let waterSum = 0;
  let hazards = 0;

  for (let i = 0; i < coords.length; i++) {
    const { lat, lon, cell } = coords[i];
    if (i > 0) {
      accumKm += haversineApproxKm(
        coords[i - 1].lat,
        coords[i - 1].lon,
        lat,
        lon
      );
    }

    if (cell.slopeDeg > maxSlope) maxSlope = cell.slopeDeg;
    waterSum += cell.combinedWaterProb;

    let hazardLevel: 'low' | 'moderate' | 'high' = 'low';
    if (cell.slopeDeg >= 14 || cell.cliffHazard >= 60) {
      hazardLevel = 'high';
      hazards++;
    } else if (cell.slopeDeg >= 8.5 || cell.cliffHazard >= 40) {
      hazardLevel = 'moderate';
    }

    points.push({
      lat: Number(lat.toFixed(3)),
      lon: Number(normalizeLon(lon).toFixed(3)),
      elevationM: cell.elevationM,
      slopeDeg: cell.slopeDeg,
      waterProb: cell.combinedWaterProb,
      distanceFromStartKm: Number(accumKm.toFixed(1)),
      hazardLevel,
    });
  }

  if (
    maxSlope >= 21.5 ||
    (mode !== 'fast' && hazards / Math.max(1, points.length) > 0.42)
  ) {
    return unreachableResult(
      `경로 상 위험 급경사 구간(최대 ${maxSlope.toFixed(1)}°)이 과도해 안전한 이동이 불가능합니다.`
    );
  }

  // Extract detailed Turn-by-Turn Waypoints for step-by-step guidance
  const waypoints: RouteWaypoint[] = [];
  if (points.length >= 2) {
    const first = points[0];
    const nextB = bearingDeg(
      first.lat,
      first.lon,
      points[Math.min(3, points.length - 1)].lat,
      points[Math.min(3, points.length - 1)].lon
    );
    waypoints.push({
      index: 1,
      code: 'START',
      lat: first.lat,
      lon: first.lon,
      distanceFromStartKm: 0,
      segmentDistanceKm: 0,
      bearingDeg: nextB,
      directionKo: bearingToKorean(nextB),
      elevationM: first.elevationM,
      slopeDeg: first.slopeDeg,
      waterProb: first.waterProb,
      instructionKo: `기지 출발 · ${bearingToKorean(nextB)}(${nextB}°) 방향으로 초기 주행 개시`,
      tag: 'start',
    });

    let lastWpIdx = 0;
    const minSpacingKm = Math.max(18, accumKm / 7);

    for (let i = 3; i < points.length - 3; i++) {
      const distSinceLast =
        points[i].distanceFromStartKm - points[lastWpIdx].distanceFromStartKm;
      if (distSinceLast < minSpacingKm) continue;

      const bBefore = bearingDeg(
        points[i - 3].lat,
        points[i - 3].lon,
        points[i].lat,
        points[i].lon
      );
      const bAfter = bearingDeg(
        points[i].lat,
        points[i].lon,
        points[i + 3].lat,
        points[i + 3].lon
      );
      let turn = Math.abs(bAfter - bBefore);
      if (turn > 180) turn = 360 - turn;

      const isTurn = turn >= 18;
      const isWaterPeak = points[i].waterProb >= 62;
      const isLongSpan = distSinceLast >= Math.max(45, accumKm / 4.5);

      if (isTurn || isWaterPeak || isLongSpan) {
        const segKm = Number(distSinceLast.toFixed(1));
        const tag: RouteWaypoint['tag'] = isTurn
          ? 'avoid'
          : isWaterPeak
            ? 'water'
            : 'checkpoint';
        const dirKo = bearingToKorean(bAfter);
        const instructionKo = isTurn
          ? `지형·단층 우회 변침 → ${dirKo}(${bAfter}°) 방향 (경사 ${points[i].slopeDeg}°)`
          : isWaterPeak
            ? `SWIM 지하수 유망 구간(${points[i].waterProb}%) 통과 → ${dirKo}(${bAfter}°)`
            : `평탄 구간 직진 유지 → ${dirKo}(${bAfter}°) 진행`;

        waypoints.push({
          index: waypoints.length + 1,
          code: `WP-${String(waypoints.length).padStart(2, '0')}`,
          lat: points[i].lat,
          lon: points[i].lon,
          distanceFromStartKm: points[i].distanceFromStartKm,
          segmentDistanceKm: segKm,
          bearingDeg: bAfter,
          directionKo: dirKo,
          elevationM: points[i].elevationM,
          slopeDeg: points[i].slopeDeg,
          waterProb: points[i].waterProb,
          instructionKo,
          tag,
        });
        lastWpIdx = i;
      }
    }

    const last = points[points.length - 1];
    const finalSeg = Number(
      (last.distanceFromStartKm - points[lastWpIdx].distanceFromStartKm).toFixed(
        1
      )
    );
    const finalB = bearingDeg(
      points[Math.max(0, points.length - 4)].lat,
      points[Math.max(0, points.length - 4)].lon,
      last.lat,
      last.lon
    );
    waypoints.push({
      index: waypoints.length + 1,
      code: 'TARGET',
      lat: last.lat,
      lon: last.lon,
      distanceFromStartKm: last.distanceFromStartKm,
      segmentDistanceKm: finalSeg,
      bearingDeg: finalB,
      directionKo: bearingToKorean(finalB),
      elevationM: last.elevationM,
      slopeDeg: last.slopeDeg,
      waterProb: last.waterProb,
      instructionKo: `목적지 도착 · 현장 시추 및 토양 성분 정밀 검증`,
      tag: 'target',
    });
  }

  const avgWater = Math.round(waterSum / points.length);
  const avgSlope =
    points.reduce((s, p) => s + p.slopeDeg, 0) / Math.max(1, points.length);
  const roverSpeedKmH = Math.max(5.5, 15.0 - avgSlope * 0.42);
  const estimatedHoursRover = Number((accumKm / roverSpeedKmH).toFixed(1));
  const estimatedHoursEva = Number((accumKm / 3.5).toFixed(1));

  const safetyScore = Math.max(
    22,
    Math.min(
      99,
      Math.round(100 - maxSlope * 1.9 - (hazards / points.length) * 42)
    )
  );

  const modeLabel =
    mode === 'safe'
      ? '최적 안전 경로'
      : mode === 'fast'
        ? '최단 신속 경로'
        : '수자원 경유 경로';

  const summaryKo = snappedToSafeApproach
    ? `목적지 인근 절벽·위험 지형을 피해 가장 가까운 안전 접근 지점(원 목표 ${bestApproachDistKm.toFixed(1)}km 앞)으로 조정 · 총 ${accumKm.toFixed(1)} km`
    : `${modeLabel} · 총 ${accumKm.toFixed(
        1
      )} km (직선 대비 ${Math.max(
        0,
        Math.round((accumKm / Math.max(1, directDist) - 1) * 100)
      )}% 우회) · 경유점 ${waypoints.length}개 · 최대 경사 ${maxSlope.toFixed(1)}°`;

  return {
    found: true,
    mode,
    terrainSource: fromTiles ? 'nasa_tiles' : 'model',
    snappedToSafeApproach,
    originalDest: snappedToSafeApproach ? { lat: dLat, lon: dLon } : undefined,
    points,
    waypoints,
    totalDistanceKm: Number(accumKm.toFixed(1)),
    directDistanceKm: Number(directDist.toFixed(1)),
    estimatedHoursRover,
    estimatedHoursEva,
    maxSlopeDeg: Number(maxSlope.toFixed(1)),
    avgWaterProb: avgWater,
    hazardSegmentsCount: hazards,
    safetyScore,
    summaryKo,
  };
}

export async function findMarsRouteFromNasaTiles(
  startCoord: { lat: number; lon: number },
  destCoord: { lat: number; lon: number },
  mode: NavigationMode
): Promise<RouteResult> {
  const sLat = Math.max(-85, Math.min(85, startCoord.lat));
  const sLon = normalizeLon(startCoord.lon);
  const dLat = Math.max(-85, Math.min(85, destCoord.lat));
  const dLon = normalizeLon(destCoord.lon);

  const directDist = haversineApproxKm(sLat, sLon, dLat, dLon);
  if (directDist < 1.2) {
    const pt = sampleMarsTelemetry(dLat, dLon);
    return {
      found: true,
      mode,
      terrainSource: 'model',
      points: [
        {
          lat: sLat,
          lon: sLon,
          elevationM: pt.elevationM,
          slopeDeg: pt.slopeDeg,
          waterProb: pt.combinedWaterProb,
          distanceFromStartKm: 0,
          hazardLevel: 'low',
        },
      ],
      waypoints: [
        {
          index: 1,
          code: 'TARGET',
          lat: pt.lat,
          lon: pt.lon,
          distanceFromStartKm: 0,
          segmentDistanceKm: 0,
          bearingDeg: 0,
          directionKo: '북',
          elevationM: pt.elevationM,
          slopeDeg: pt.slopeDeg,
          waterProb: pt.combinedWaterProb,
          instructionKo: '출발지와 목적지가 동일 지점입니다.',
          tag: 'target',
        },
      ],
      totalDistanceKm: 0,
      directDistanceKm: 0,
      estimatedHoursRover: 0,
      estimatedHoursEva: 0,
      maxSlopeDeg: pt.slopeDeg,
      avgWaterProb: pt.combinedWaterProb,
      hazardSegmentsCount: 0,
      safetyScore: 99,
      summaryKo: '출발지와 목적지가 동일 지점입니다.',
    };
  }

  const spanLat = Math.max(4, Math.abs(dLat - sLat));
  const spanLon = Math.max(4, Math.abs(dLon - sLon));
  const padLat = spanLat * 0.36;
  const padLon = spanLon * 0.36;

  const latMax = Math.min(85, Math.max(sLat, dLat) + padLat);
  const latMin = Math.max(-85, Math.min(sLat, dLat) - padLat);
  const lonMin = Math.max(-180, Math.min(sLon, dLon) - padLon);
  const lonMax = Math.min(180, Math.max(sLon, dLon) + padLon);

  const ROWS = 96;
  const COLS = 120;

  const { grid, fromTiles } = await buildRealTileTerrainGrid(
    latMin,
    latMax,
    lonMin,
    lonMax,
    ROWS,
    COLS
  );

  return runWeightedAStar(
    grid,
    latMin,
    latMax,
    lonMin,
    lonMax,
    startCoord,
    destCoord,
    mode,
    fromTiles
  );
}
