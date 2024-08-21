// app.js
import { state, updateState, updateMap, getRasterValueAtPoint, updateSelectedCellKeys } from './stateModule.js';
import { initMap, updateGrid, renderCells } from './mapModule.js';
import { setupUI, updateSolutionTable } from './uiModule.js';
import { loadJSONData, loadAllRasters } from './dataModule.js';
import { toggleRanking, clearSelection, toggleDrawMode, searchLocation } from './interactionModule.js';
import { updateScores } from './updateScores.js';
import { generateReport } from './reportModule.js';

function checkAuth() {
    if (!window.isUserSignedIn()) {
        window.location.href = 'index.html';
        return;
    }
    initializeApp();
}

// Main initialization function
async function initializeApp() {
    try {
        console.log('Initializing app...');
        const data = await loadJSONData();
        updateState({
            solutionCriteria: data.solutionCriteria,
            challengeCategories: data.challengeCategories,
            solutionCosts: data.solutionCosts,
            selectedSolutions: Object.fromEntries(Object.keys(data.solutionCriteria).map(solution => [solution, true]))
        });
        updateSelectedCellKeys(new Set());

        state.colorScale.domain(Object.keys(state.solutionCriteria));

        const { map, gridLayer } = initMap();
        updateState({ map, gridLayer });

        setupUI();
        
        await loadAllRasters();
        
        updateState({
            callUpdateScores: () => {
                updateScores(
                    state.selectedCellKeys,
                    state.allCells,
                    state.currentRanking,
                    state.impactFilter,
                    state.costFilter,
                    state.criteriaRasters,
                    state.solutionCriteria,
                    state.colorScale,
                    state.criteriaColorScale,
                    getRasterValueAtPoint
                );
                updateSolutionTable();
            }
        });

        if (map) {
            updateGrid(map);
            renderCells();
            await updateMap(state.currentCategory);
        } else {
            console.error('Map failed to initialize');
        }
        
        setupReportButton();
        render();
        console.log('App initialization complete');
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

function setupReportButton() {
    console.log('Setting up report button...');
    const reportButton = document.getElementById('generateReport');
    if (!reportButton) {
        console.error('Generate Report button not found');
        return;
    }

    reportButton.addEventListener('click', handleReportGeneration);
    console.log('Report button event listener attached');
}

function handleReportGeneration() {
    console.log('Generate Report button clicked');
    try {
        console.log('Calling generateReport function...');
        generateReport();
        console.log('Report generation complete');
    } catch (error) {
        console.error('Error in report generation:', error);
        alert(`Error generating report: ${error.message}`);
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', checkAuth);
console.log('DOMContentLoaded event listener attached');

// Export functions to global scope for use in HTML
window.toggleRanking = toggleRanking;
window.clearSelection = clearSelection;
window.toggleDrawMode = toggleDrawMode;
window.updateMap = updateMap;
window.searchLocation = searchLocation;
window.updateSolutionTable = updateSolutionTable;

// Expose necessary variables and functions for updateScores.js
Object.assign(window, {
    allCells: state.allCells,
    currentRanking: state.currentRanking,
    criteriaRasters: state.criteriaRasters,
    solutionCriteria: state.solutionCriteria,
    colorScale: state.colorScale,
    criteriaColorScale: state.criteriaColorScale,
    getRasterValueAtPoint,
    selectedSolutions: state.selectedSolutions
});

// Add event listener for sign out
document.getElementById('signOutButton').addEventListener('click', () => {
    window.signOut();
});