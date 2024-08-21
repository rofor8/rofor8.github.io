// stateModule.js
import { loadTilesForViewport, calculateSuitabilityScores } from './dataModule.js';
import { updateUIForCategory, updateSolutionTable } from './uiModule.js';
import { renderCells, renderSelectedCells } from './mapModule.js';

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
    CELL_SIZE: 1, // meters
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
    callUpdateScores: null,
    selectedSolutions: {},
    impactFilter: [0, 1], // Impact weight range
    costFilter: [0, 100], // Cost range
    currentSortColumn: 'impact',
    isAscending: false,
    totalImpacts: {},
    totalCosts: {},
    impactRange: [0, 1],
    costRange: [0, 100],
    maxImpactWeight: 1,
    maxCostPerCell: 100,
    categorySliderValues: {} // New property to store slider values for each category
};

export function updateState(newState) {
    Object.assign(state, newState);
    
    // If the category has changed, update the sliders with stored values
    if (newState.currentCategory && state.categorySliderValues[newState.currentCategory]) {
        state.impactFilter = state.categorySliderValues[newState.currentCategory].impact;
        state.costFilter = state.categorySliderValues[newState.currentCategory].cost;
    }
}

export function updateSelectedCellKeys(newSelectedCellKeys) {
    state.selectedCellKeys = new Set(newSelectedCellKeys);
    state.mapNeedsUpdate = true;
    updateTotals();
    if (state.callUpdateScores) {
        state.callUpdateScores();
    }
    updateSolutionTable();
    renderSelectedCells();
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
        updateTotals();
        updateMaxValues();

        state.mapNeedsUpdate = true;
        if (state.callUpdateScores) {
            state.callUpdateScores();
        } else {
            console.warn('callUpdateScores is not set');
        }

        updateSolutionTable();
        renderCells();
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
        return data[y * width + x] || 0;
    }

    console.log('Invalid raster coordinates', { x, y, width, height });
    return 0;
}

export function updateTotals() {
    const totalImpacts = {};
    const totalCosts = {};

    state.selectedCellKeys.forEach(key => {
        const cell = state.allC