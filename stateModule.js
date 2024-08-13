// stateModule.js
import { loadTilesForViewport, calculateSuitabilityScores } from './dataModule.js';
import { updateUIForCategory } from './uiModule.js';
import { updateScores } from './updateScores.js';

// Create a single state object
export const state = {
    allCells: new Map(),
    solutionCriteria: {},
    challengeCategories: {},
    solutionCosts: {},
    map: null,
    gridLayer: null,
    rasterLayers: {},
    selectedCellKeys: new Set(),
    currentRanking: 'impact',
    currentRank: 1,
    CELL_SIZE: 100, // meters
    currentCategory: "Biodiversity and soils",
    drawLayer: null,
    isDrawMode: false,
    drawStartTime: null,
    drawingPath: [],
    viewportOverlay: null,
    tileLayer: null,
    mapNeedsUpdate: false,
    criteriaColorScale: d3.scaleOrdinal(d3.schemeCategory10),
    colorScale: d3.scaleOrdinal().range(d3.schemeCategory10),
    criteriaRasters: {},
    callUpdateScores: null, // This will be set in app.js
};

// Functions
export function updateState(newState) {
    Object.assign(state, newState);
}

export function updateSelectedCellKeys(newSelectedCellKeys) {
    state.selectedCellKeys = new Set(newSelectedCellKeys);
}

export async function updateMap(challengeCategory) {
    if (!state.map) {
        console.error('Map not initialized in updateMap');
        return;
    }
    if (challengeCategory === undefined) {
        console.warn('Challenge category is undefined in updateMap');
        return;
    }

    console.log('Updating map for category:', challengeCategory);
    const bounds = state.map.getBounds();

    try {
        await loadTilesForViewport(bounds);
        await calculateSuitabilityScores(bounds, challengeCategory);

        updateUIForCategory(challengeCategory);

        state.mapNeedsUpdate = true;
        if (state.callUpdateScores) {
            state.callUpdateScores();
        } else {
            console.warn('callUpdateScores is not set');
        }
    } catch (error) {
        console.error('Error updating map:', error);
    }
}

export function getRasterValueAtPoint(raster, lat, lng) {
    if (!raster || !raster.bounds || !raster.data || !raster.windowBounds) {
        console.warn('Invalid raster data', raster);
        return 0;
    }

    const { data, width, height, windowBounds } = raster;
    const [minX, minY, maxX, maxY] = windowBounds;

    if (lng < minX || lng > maxX || lat < minY || lat > maxY) {
        console.log('Point outside raster window bounds', { lat, lng, windowBounds });
        return 0;
    }

    const x = Math.floor((lng - minX) / (maxX - minX) * width);
    const y = Math.floor((maxY - lat) / (maxY - minY) * height);

    if (x >= 0 && x < width && y >= 0 && y < height) {
        return data[y * width + x];
    }

    console.log('Invalid raster coordinates', { x, y, width, height });
    return 0;
}