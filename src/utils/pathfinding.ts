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
  let dLon = lon2 - lon1;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  const dLonKm = dLon * KM_PER_DEG * Math.cos(meanLatRad);
  return Math.hypot(dLatKm, dLonKm);
}

function bearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  let dLon = lon2 - lon1;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
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

  const colStart = Math.floor((lonMin + 180) / tileDeg);
  const colEnd = Math.floor((lonMax + 180) / tileDeg);
  const rowStart = Math.max(0, Math.floor((90 - latMax) / tileDeg));
  const rowEnd = Math.min(numRows - 1, Math.floor((90 - latMin) / tileDeg));

  // Sample at 4x higher pixel resolution first so thin fissures/crater walls are never missed by downsampling
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

      for (let rawC = colStart; rawC <= colEnd; rawC++) {
        const c = ((rawC % numCols) + numCols) % numCols;
        const tileLonLeft = -180 + rawC * tileDeg;
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

        const pooledCliff = maxCliff * 0.68 + avgCliff * 0.32;
        cliffHazard = Math.min(100, Math.round(pooledCliff * 1.15));
        // Boost effective slope where real satellite imagery shows sharp scarps/fissures
        slopeDeg = Number(
          Math.min(
            42,
            Math.max(baseTel.slopeDeg, pooledCliff * 0.24)
          ).toFixed(1)
        );
      }

      const isFissureWall = cliffHazard >= 58 || slopeDeg >= 16.5;

      rowArr.push({
        ...baseTel,
        elevationM: elevM,
        slopeDeg,
        roughnessHazard: Math.max(baseTel.roughnessHazard, cliffHazard),
        cliffHazard,
        isFissureWall,
        isObstacle: baseTel.isObstacle || isFissureWall,
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

  const sLat = startCoord.lat;
  const sLon = normalizeLon(startCoord.lon);
  const dLat = destCoord.lat;
  let dLon = normalizeLon(destCoord.lon);
  if (dLon - sLon > 180) dLon -= 360;
  if (dLon - sLon < -180) dLon += 360;

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

  const start = toGrid(sLat, sLon);
  const dest = toGrid(dLat, dLon);

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

  const open: AStarNode[] = [
    {
      r: start.row,
      c: start.col,
      g: 0,
      f: heuristic(start.row, start.col),
    },
  ];
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

  // Try strict obstacle avoidance first; if blocked by a closed crater rim, fall back to high-penalty crossing
  const runSearch = (strictBlock: boolean): boolean => {
    gScore.fill(Infinity);
    cameFrom.fill(-1);
    closed.fill(0);
    open.length = 0;
    gScore[startIdx] = 0;
    open.push({
      r: start.row,
      c: start.col,
      g: 0,
      f: heuristic(start.row, start.col),
    });

    while (open.length > 0) {
      let bestI = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestI].f) bestI = i;
      }
      const current = open[bestI];
      open[bestI] = open[open.length - 1];
      open.pop();

      const cIdx = idx(current.r, current.c);
      if (cIdx === destIdx) return true;
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
        const distFromStart = Math.hypot(nr - start.row, nc - start.col);
        const distFromDest = Math.hypot(nr - dest.row, nc - dest.col);
        const nearEndpoint = distFromStart <= 2.2 || distFromDest <= 2.2;

        if (strictBlock && !nearEndpoint && nextCell.isObstacle && mode !== 'fast') {
          continue;
        }

        const stepKm = Math.hypot(dr * stepLatKm, dc * stepLonKm);
        const elevDiffKm =
          Math.abs(nextCell.elevationM - currCell.elevationM) / 1000;
        const surfaceStepKm = Math.hypot(stepKm, elevDiffKm);

        let penalty = 1.0;
        if (mode === 'safe') {
          const cliffPen = Math.pow(nextCell.cliffHazard / 26, 2.2) * 1.6;
          const slopePen =
            nextCell.slopeDeg > 8
              ? (nextCell.slopeDeg - 7) * 0.95
              : nextCell.slopeDeg * 0.14;
          const wallPen = nextCell.isObstacle ? 18 : 0;
          penalty += cliffPen + slopePen + wallPen;
        } else if (mode === 'fast') {
          const cliffPen = (nextCell.cliffHazard / 45) * 0.9;
          const wallPen = nextCell.isObstacle ? 6 : 0;
          penalty += cliffPen + wallPen + nextCell.slopeDeg * 0.04;
        } else if (mode === 'water') {
          const waterPen = ((100 - nextCell.combinedWaterProb) / 100) * 1.7;
          const cliffPen = Math.pow(nextCell.cliffHazard / 30, 1.9) * 1.1;
          const wallPen = nextCell.isObstacle ? 14 : 0;
          penalty += waterPen + cliffPen + wallPen;
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

  let reached = runSearch(true);
  if (!reached) {
    reached = runSearch(false);
  }

  if (!reached) {
    return {
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
      summaryKo: '경로를 산출할 수 없습니다. 다른 좌표를 선택해 주세요.',
    };
  }

  // Reconstruct raw grid cells
  const rawCells: TileTerrainCell[] = [];
  let trace = destIdx;
  while (trace !== -1) {
    const r = Math.floor(trace / COLS);
    const c = trace % COLS;
    rawCells.push(grid[r][c]);
    trace = cameFrom[trace];
  }
  rawCells.reverse();

  // Anchor exact Start & Destination coordinates so line connects cleanly to pins!
  const startExact = sampleMarsTelemetry(sLat, sLon);
  const destExact = sampleMarsTelemetry(dLat, dLon);

  const coords: { lat: number; lon: number; cell: TileTerrainCell }[] = [
    {
      lat: sLat,
      lon: normalizeLon(sLon),
      cell: { ...startExact, cliffHazard: 0, isFissureWall: false },
    },
    ...rawCells.slice(1, -1).map((cell) => ({
      lat: cell.lat,
      lon: cell.lon,
      cell,
    })),
    {
      lat: dLat,
      lon: normalizeLon(dLon),
      cell: { ...destExact, cliffHazard: 0, isFissureWall: false },
    },
  ];

  // Smooth interior points gently (preserving exact start/end) to eliminate 45° grid zigzags
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
        coords[i].lon = normalizeLon(sLonAvg);
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
        points[i - 1].lat,
        points[i - 1].lon,
        lat,
        lon
      );
    }

    if (cell.slopeDeg > maxSlope) maxSlope = cell.slopeDeg;
    waterSum += cell.combinedWaterProb;

    let hazardLevel: 'low' | 'moderate' | 'high' = 'low';
    if (cell.slopeDeg >= 13 || cell.cliffHazard >= 52) {
      hazardLevel = 'high';
      hazards++;
    } else if (cell.slopeDeg >= 7.5 || cell.cliffHazard >= 34) {
      hazardLevel = 'moderate';
    }

    points.push({
      lat: Number(lat.toFixed(3)),
      lon: Number(lon.toFixed(3)),
      elevationM: cell.elevationM,
      slopeDeg: cell.slopeDeg,
      waterProb: cell.combinedWaterProb,
      distanceFromStartKm: Number(accumKm.toFixed(1)),
      hazardLevel,
    });
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

  const summaryKo = `${modeLabel} · 총 ${accumKm.toFixed(
    1
  )} km (직선 대비 ${Math.max(
    0,
    Math.round((accumKm / Math.max(1, directDist) - 1) * 100)
  )}% 우회) · 경유점 ${waypoints.length}개 · 최대 경사 ${maxSlope.toFixed(1)}°`;

  return {
    found: true,
    mode,
    terrainSource: fromTiles ? 'nasa_tiles' : 'model',
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
  const sLat = startCoord.lat;
  const sLon = normalizeLon(startCoord.lon);
  const dLat = destCoord.lat;
  let dLon = normalizeLon(destCoord.lon);
  if (dLon - sLon > 180) dLon -= 360;
  if (dLon - sLon < -180) dLon += 360;

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
  const lonMin = Math.min(sLon, dLon) - padLon;
  const lonMax = Math.max(sLon, dLon) + padLon;

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
