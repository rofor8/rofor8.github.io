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
    callUpdateScores: null,
    selectedSolutions: {},
    impactFilter: [0, 100],
    costFilter: [0, 100],
    currentSortColumn: 'impact',
    isAscending: true,
    totalImpacts: {},
    totalCosts: {},
    impactRange: [0, 100],
    costRange: [0, 100]
};

export function updateState(newState) {
    Object.assign(state, newState);
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
        return data[y * width + x];
    }

    console.log('Invalid raster coordinates', { x, y, width, height });
    return 0;
}

export function updateTotals() {
    const totalImpacts = {};
    const totalCosts = {};
    let minImpact = Infinity;
    let maxImpact = -Infinity;
    let minCost = Infinity;
    let maxCost = -Infinity;

    state.selectedCellKeys.forEach(key => {
        const cell = state.allCells.get(key);
        if (cell && cell.scores) {
            Object.entries(cell.scores).forEach(([solution, scores]) => {
                if (!totalImpacts[solution]) totalImpacts[solution] = 0;
                if (!totalCosts[solution]) totalCosts[solution] = 0;
                
                totalImpacts[solution] += scores.impact || 0;
                totalCosts[solution] += scores.cost || 0;

                minImpact = Math.min(minImpact, totalImpacts[solution]);
                maxImpact = Math.max(maxImpact, totalImpacts[solution]);
                minCost = Math.min(minCost, totalCosts[solution]);
                maxCost = Math.max(maxCost, totalCosts[solution]);
            });
        }
    });

    // Ensure we always have valid ranges
    if (minImpact === Infinity) minImpact = 0;
    if (maxImpact === -Infinity) maxImpact = 100;
    if (minCost === Infinity) minCost = 0;
    if (maxCost === -Infinity) maxCost = 100;

    updateState({ 
        totalImpacts, 
        totalCosts, 
        impactRange: [minImpact, maxImpact],
        costRange: [minCost, maxCost],
        impactFilter: [minImpact, maxImpact],
        costFilter: [minCost, maxCost]
    });
}

export function isWithinFilters(solution) {
    const impact = state.totalImpacts[solution] || 0;
    const cost = state.totalCosts[solution] || 0;
    return impact >= state.impactFilter[0] && impact <= state.impactFilter[1] &&
           cost >= state.costFilter[0] && cost <= state.costFilter[1];
}

export function getFilterRanges() {
    return {
        impact: state.impactRange,
        cost: state.costRange
    };
}