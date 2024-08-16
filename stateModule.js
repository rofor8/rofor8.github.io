// stateModule.js
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
    totalCosts: {}
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
    if (typeof window.updateSolutionTable === 'function') {
        window.updateSolutionTable();
    }
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

    Object.keys(state.solutionCriteria).forEach(solution => {
        let impactSum = 0;
        let costSum = 0;

        state.selectedCellKeys.forEach(key => {
            const cell = state.allCells.get(key);
            if (cell && cell.scores && cell.scores[solution]) {
                impactSum += cell.scores[solution].impact || 0;
                costSum += cell.scores[solution].cost || 0;
            }
        });

        totalImpacts[solution] = impactSum;
        totalCosts[solution] = costSum;
    });

    updateState({ totalImpacts, totalCosts });
}