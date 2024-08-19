// dataModule.js

import { state, updateState, getRasterValueAtPoint } from './stateModule.js';

const dataCache = new Map();

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
            data: null,
            width: null,
            height: null,
            windowBounds: null
        };
        console.log(`Loaded raster metadata for ${criterion}:`, state.criteriaRasters[criterion]);
    } catch (error) {
        console.error(`Error loading raster for criterion ${criterion}:`, error);
    }
}

export async function loadTilesForViewport(bounds) {
    console.log("Loading tiles for viewport:", bounds);
    const visibleCriteria = new Set(Object.values(state.solutionCriteria).flat());

    const loadPromises = Array.from(visibleCriteria).map(criterion => loadTileForCriterion(criterion, bounds));
    await Promise.all(loadPromises);
}

async function loadTileForCriterion(criterion, bounds) {
    if (!state.criteriaRasters[criterion]) {
        console.warn(`Criterion ${criterion} not found in criteriaRasters`);
        return;
    }

    const { tiff, bounds: rasterBounds } = state.criteriaRasters[criterion];
    if (!boundsIntersect(bounds, rasterBounds)) {
        console.log(`Viewport does not intersect with raster for ${criterion}`);
        return;
    }

    try {
        const image = await tiff.getImage();
        const imageWidth = image.getWidth();
        const imageHeight = image.getHeight();

        const window = calculateWindow(bounds, rasterBounds, imageWidth, imageHeight);
        const rasterData = await image.readRasters({ window });

        state.criteriaRasters[criterion].data = rasterData[0];
        state.criteriaRasters[criterion].width = window[2] - window[0];
        state.criteriaRasters[criterion].height = window[3] - window[1];
        state.criteriaRasters[criterion].windowBounds = calculateWindowBounds(window, rasterBounds, imageWidth, imageHeight);

        console.log(`Loaded data for ${criterion}:`, {
            dataLength: state.criteriaRasters[criterion].data.length,
            width: state.criteriaRasters[criterion].width,
            height: state.criteriaRasters[criterion].height,
            windowBounds: state.criteriaRasters[criterion].windowBounds
        });
    } catch (error) {
        console.error(`Error loading raster data for ${criterion}:`, error);
    }
}

export async function calculateSuitabilityScores(bounds, challengeCategory) {
    console.time('calculateSuitabilityScores');

    const startTime = performance.now();
    const visibleCells = Array.from(state.allCells.values()).filter(cell =>
        bounds.intersects(L.latLngBounds(cell.bounds))
    );
    console.log('Time to filter visible cells:', performance.now() - startTime, 'ms');

    const batchSize = 1000;
    const batches = Math.ceil(visibleCells.length / batchSize);

    for (let i = 0; i < batches; i++) {
        const batchStart = i * batchSize;
        const batchEnd = Math.min((i + 1) * batchSize, visibleCells.length);
        const cellBatch = visibleCells.slice(batchStart, batchEnd);

        await new Promise(resolve => {
            setTimeout(async () => {
                await Promise.all(cellBatch.map(cell => calculateCellScores(cell, challengeCategory)));
                resolve();
            }, 0);
        });
    }

    console.timeEnd('calculateSuitabilityScores');
}

async function calculateCellScores(cell, challengeCategory) {
    const [lat, lng] = cell.key.split(',').map(Number);
    const cellScores = {};

    const criteriaStartTime = performance.now();
    const promises = Object.entries(state.solutionCriteria)
        .filter(([solution]) => state.selectedSolutions[solution] !== false)
        .map(async ([solution, criteria]) => {
            const [criterion1, criterion2] = criteria;
            const value1 = getRasterValueAtPoint(state.criteriaRasters[criterion1], lat, lng);
            const value2 = getRasterValueAtPoint(state.criteriaRasters[criterion2], lat, lng);
            
            const isSuitable = value1 > 0 && value2 > 0;
            
            const weight = state.challengeCategories[challengeCategory]?.[solution] || 0;
            cellScores[solution] = {
                impact: isSuitable ? weight * 100 : 0,
                cost: isSuitable ? (state.solutionCosts[solution] || 0) : 0,
                isSuitable: isSuitable
            };
        });
    await Promise.all(promises);
    console.log('Time to calculate scores for cell:', performance.now() - criteriaStartTime, 'ms');

    cell.scores = cellScores;
}

function boundsIntersect(bounds1, bounds2) {
    return !(bounds1.getWest() > bounds2[2] || bounds1.getEast() < bounds2[0] ||
             bounds1.getSouth() > bounds2[3] || bounds1.getNorth() < bounds2[1]);
}

function calculateWindow(bounds, rasterBounds, imageWidth, imageHeight) {
    const [minX, minY, maxX, maxY] = rasterBounds;
    return [
        Math.max(0, Math.floor((bounds.getWest() - minX) / (maxX - minX) * imageWidth)),
        Math.max(0, Math.floor((maxY - bounds.getNorth()) / (maxY - minY) * imageHeight)),
        Math.min(imageWidth, Math.ceil((bounds.getEast() - minX) / (maxX - minX) * imageWidth)),
        Math.min(imageHeight, Math.ceil((maxY - bounds.getSouth()) / (maxY - minY) * imageHeight))
    ];
}

function calculateWindowBounds(window, rasterBounds, imageWidth, imageHeight) {
    const [minX, minY, maxX, maxY] = rasterBounds;
    const [left, top, right, bottom] = window;
    return [
        minX + (left / imageWidth) * (maxX - minX),
        maxY - (bottom / imageHeight) * (maxY - minY),
        minX + (right / imageWidth) * (maxX - minX),
        maxY - (top / imageHeight) * (maxY - minY)
    ];
}

export { loadRaster, loadTileForCriterion };