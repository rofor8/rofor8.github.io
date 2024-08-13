// app.js
import { initMap, updateGrid, renderCells } from './mapModule.js';
import { setupUI } from './uiModule.js';
import { loadJSONData, loadAllRasters } from './dataModule.js';
import { state, updateState, updateMap, getRasterValueAtPoint, updateSelectedCellKeys } from './stateModule.js';
import { toggleRanking, clearSelection, toggleDrawMode, searchLocation } from './interactionModule.js';

// Main initialization function
async function initializeApp() {
    try {
        const data = await loadJSONData();
        updateState({
            solutionCriteria: data.solutionCriteria,
            challengeCategories: data.challengeCategories,
            solutionCosts: data.solutionCosts
        });
        updateSelectedCellKeys(new Set()); // Ensure selectedCellKeys is initialized

        state.colorScale.domain(Object.keys(state.solutionCriteria));

        // Initialize map before loading rasters
        const { map, gridLayer } = initMap();
        updateState({ map, gridLayer });

        setupUI();
        
        // Load rasters after state has been initialized
        await loadAllRasters();
        
        if (map) {
            updateGrid(map);
            await updateMap(state.currentCategory);
        } else {
            console.error('Map failed to initialize');
        }
        
        render(); // Start the render loop
    } catch (error) {
        console.error('Error initializing app:', error);
    }
}

function render() {
    requestAnimationFrame(render);
    if (state.mapNeedsUpdate) {
        renderCells();
        updateState({ mapNeedsUpdate: false });
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', initializeApp);

// Export functions to global scope for use in HTML
window.toggleRanking = toggleRanking;
window.clearSelection = clearSelection;
window.toggleDrawMode = toggleDrawMode;
window.updateMap = updateMap;
window.renderCells = renderCells;
window.searchLocation = searchLocation;

// Expose necessary variables and functions for updateScores.js
Object.assign(window, {
    allCells: state.allCells,
    currentRanking: state.currentRanking,
    currentRank: state.currentRank,
    criteriaRasters: state.criteriaRasters,
    solutionCriteria: state.solutionCriteria,
    colorScale: state.colorScale,
    criteriaColorScale: state.criteriaColorScale,
    getRasterValueAtPoint
});