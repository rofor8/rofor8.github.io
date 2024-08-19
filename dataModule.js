// dataModule.js

import { state, updateState } from './stateModule.js';

const dataCache = new Map();
const tileCache = new Map();
const TILE_SIZE = 256;

export async function loadJSONData() {
    const cachedData = dataCache.get('jsonData');
    if (cachedData) {
        return cachedData;
    }

    const [solutionCriteriaData, challengeCategoriesData, solutionCostsData] = await Promise.all([
        fetch('data/solutionCriteria.json').then(response => response.json()),
        fetch('data/challengeCategories.json').then(response => response.json()),
        fetch('data/solutionCosts.json').then(response => response.json())
    ]);

    const data = {
        solutionCriteria: solutionCriteriaData,
        challengeCategories: challengeCategoriesData,
        solutionCosts: solutionCostsData
    };

    dataCache.set('jsonData', data);
    return data;
}

export async function loadAllRasters() {
    if (!state.solutionCriteria || Object.keys(state.solutionCriteria).length === 0) {
        console.error('Solution criteria not loaded yet');
        return;
    }

    const criteria = new Set(Object.values(state.solutionCriteria).flat());
    const loadPromises = Array.from(criteria).map(loadRaster);
    await Promise.all(loadPromises);
}

async function loadRaster(criterion) {
    if (state.criteriaRasters[criterion]) {
        return;
    }

    try {
        const response = await fetch(`rasters/${criterion}.tif`);
        const arrayBuffer = await response.arrayBuffer();
        const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
        const image = await tiff.getImage();
        const [minX, minY, maxX, maxY] = image.getBoundingBox();

        state.criteriaRasters[criterion] = {
            tiff: tiff,
            bounds: [minX, minY, maxX, maxY],
            width: image.getWidth(),
            height: image.getHeight()
        };
        console.log(`Loaded raster metadata for ${criterion}:`, state.criteriaRasters[criterion]);
    } catch (error) {
        console.error(`Error loading raster for criterion ${criterion}:`, error);
    }
}

export async function loadTilesForViewport(bounds) {
    console.time('loadTilesForViewport');
    const visibleCriteria = new Set(Object.values(state.solutionCriteria).flat());
    const tilePromises = [];

    for (const criterion of visibleCriteria) {
        const raster = state.criteriaRasters[criterion];
        if (!raster || !boundsIntersect(bounds, raster.bounds)) continue;

        const tiles = getTilesForBounds(bounds, raster);
        for (const tile of tiles) {
            const tileKey = `${criterion}-${tile.x}-${tile.y}-${tile.z}`;
            if (!tileCache.has(tileKey)) {
                tilePromises.push(loadTile(criterion, tile, tileKey));
            }
        }
    }

    await Promise.all(tilePromises);
    console.timeEnd('loadTilesForViewport');
}

async function loadTile(criterion, tile, tileKey) {
    const raster = state.criteriaRasters[criterion];
    const { tiff, width, height, bounds } = raster;

    const tileWidth = Math.min(TILE_SIZE, width - tile.x * TILE_SIZE);
    const tileHeight = Math.min(TILE_SIZE, height - tile.y * TILE_SIZE);

    const window = [
        tile.x * TILE_SIZE,
        tile.y * TILE_SIZE,
        tile.x * TILE_SIZE + tileWidth,
        tile.y * TILE_SIZE + tileHeight
    ];

    try {
        const image = await tiff.getImage();
        const rasterData = await image.readRasters({ window });
        
        const tileData = {
            data: rasterData[0],
            width: tileWidth,
            height: tileHeight,
            bounds: calculateTileBounds(window, bounds, width, height)
        };

        tileCache.set(tileKey, tileData);
    } catch (error) {
        console.error(`Error loading tile for ${criterion}:`, error);
    }
}

function getTilesForBounds(bounds, raster) {
    const { width, height, bounds: rasterBounds } = raster;
    const [minX, minY, maxX, maxY] = rasterBounds;

    const topLeftTile = latLngToTile(bounds.getNorth(), bounds.getWest(), minX, minY, maxX, maxY, width, height);
    const bottomRightTile = latLngToTile(bounds.getSouth(), bounds.getEast(), minX, minY, maxX, maxY, width, height);

    const tiles = [];
    for (let x = topLeftTile.x; x <= bottomRightTile.x; x++) {
        for (let y = topLeftTile.y; y <= bottomRightTile.y; y++) {
            tiles.push({ x, y, z: topLeftTile.z });
        }
    }

    return tiles;
}

function latLngToTile(lat, lng, minX, minY, maxX, maxY, width, height) {
    const x = Math.floor((lng - minX) / (maxX - minX) * width / TILE_SIZE);
    const y = Math.floor((maxY - lat) / (maxY - minY) * height / TILE_SIZE);
    return { x, y, z: 0 }; // z is always 0 for our single-zoom-level rasters
}

export async function calculateSuitabilityScores(bounds, challengeCategory) {
    console.time('calculateSuitabilityScores');

    const visibleCells = Array.from(state.allCells.values()).filter(cell =>
        bounds.intersects(L.latLngBounds(cell.bounds))
    );

    const batchSize = 1000;
    const batches = Math.ceil(visibleCells.length / batchSize);

    for (let i = 0; i < batches; i++) {
        const batchStart = i * batchSize;
        const batchEnd = Math.min((i + 1) * batchSize, visibleCells.length);
        const cellBatch = visibleCells.slice(batchStart, batchEnd);

        await new Promise(resolve => {
            setTimeout(async () => {
                cellBatch.forEach(cell => calculateCellScores(cell, challengeCategory));
                resolve();
            }, 0);
        });
    }

    console.timeEnd('calculateSuitabilityScores');
}

function calculateCellScores(cell, challengeCategory) {
    const [lat, lng] = cell.key.split(',').map(Number);
    const cellScores = {};

    Object.entries(state.solutionCriteria)
        .filter(([solution]) => state.selectedSolutions[solution] !== false)
        .forEach(([solution, criteria]) => {
            const [criterion1, criterion2] = criteria;
            const value1 = getRasterValueAtPoint(criterion1, lat, lng);
            const value2 = getRasterValueAtPoint(criterion2, lat, lng);
            
            const isSuitable = value1 > 0 && value2 > 0;
            
            const weight = state.challengeCategories[challengeCategory]?.[solution] || 0;
            cellScores[solution] = {
                impact: isSuitable ? weight * 100 : 0,
                cost: isSuitable ? (state.solutionCosts[solution] || 0) : 0,
                isSuitable: isSuitable
            };
        });

    cell.scores = cellScores;
}

function getRasterValueAtPoint(criterion, lat, lng) {
    const raster = state.criteriaRasters[criterion];
    if (!raster) return 0;

    const { bounds, width, height } = raster;
    const [minX, minY, maxX, maxY] = bounds;

    if (lng < minX || lng > maxX || lat < minY || lat > maxY) {
        return 0;
    }

    const tileX = Math.floor((lng - minX) / (maxX - minX) * width / TILE_SIZE);
    const tileY = Math.floor((maxY - lat) / (maxY - minY) * height / TILE_SIZE);
    const tileKey = `${criterion}-${tileX}-${tileY}-0`;

    const tile = tileCache.get(tileKey);
    if (!tile) return 0;

    const { data, width: tileWidth, height: tileHeight, bounds: tileBounds } = tile;
    const [tMinX, tMinY, tMaxX, tMaxY] = tileBounds;

    const x = Math.floor((lng - tMinX) / (tMaxX - tMinX) * tileWidth);
    const y = Math.floor((tMaxY - lat) / (tMaxY - tMinY) * tileHeight);

    return data[y * tileWidth + x] || 0;
}

function boundsIntersect(bounds1, bounds2) {
    return !(bounds1.getWest() > bounds2[2] || bounds1.getEast() < bounds2[0] ||
             bounds1.getSouth() > bounds2[3] || bounds1.getNorth() < bounds2[1]);
}

function calculateTileBounds(window, rasterBounds, imageWidth, imageHeight) {
    const [minX, minY, maxX, maxY] = rasterBounds;
    const [left, top, right, bottom] = window;
    return [
        minX + (left / imageWidth) * (maxX - minX),
        maxY - (bottom / imageHeight) * (maxY - minY),
        minX + (right / imageWidth) * (maxX - minX),
        maxY - (top / imageHeight) * (maxY - minY)
    ];
}

export { loadRaster };