// app.js
import { initMap, updateGrid, renderCells } from './mapModule.js';
import { setupUI, updateSolutionTable } from './uiModule.js';
import { loadJSONData, loadAllRasters } from './dataModule.js';
import { state, updateState, updateMap, getRasterValueAtPoint, updateSelectedCellKeys } from './stateModule.js';
import { toggleRanking, clearSelection, toggleDrawMode, searchLocation } from './interactionModule.js';
import { updateScores } from './updateScores.js';
import { generateReport } from './reportModule.js';

// Google Sign-In Configuration
const CLIENT_ID = '20635675841-uf569724tui760htgqgqebfi6echcoku.apps.googleusercontent.com';

function initializeGoogleSignIn() {
    gapi.load('auth2', function() {
        gapi.auth2.init({
            client_id: CLIENT_ID
        }).then(function(auth2) {
            console.log('Google Sign-In initialized');
            attachSignIn(document.getElementById('googleSignInButton'));
            checkAuth();
        }, function(error) {
            console.error('Error initializing Google Sign-In:', error);
        });
    });
}

function attachSignIn(element) {
    const auth2 = gapi.auth2.getAuthInstance();
    auth2.attachClickHandler(element, {},
        function(googleUser) {
            console.log('User signed in');
            onSignIn(googleUser);
        }, function(error) {
            console.error('Error signing in:', error);
        });
}

function onSignIn(googleUser) {
    const profile = googleUser.getBasicProfile();
    console.log('ID: ' + profile.getId());
    console.log('Name: ' + profile.getName());
    console.log('Image URL: ' + profile.getImageUrl());
    console.log('Email: ' + profile.getEmail());
    
    document.getElementById('authCheck').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    initializeApp();
}

async function checkAuth() {
    const auth2 = gapi.auth2.getAuthInstance();
    if (auth2.isSignedIn.get()) {
        onSignIn(auth2.currentUser.get());
    } else {
        document.getElementById('authCheck').style.display = 'block';
        document.getElementById('app-container').style.display = 'none';
    }
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
document.addEventListener('DOMContentLoaded', initializeGoogleSignIn);
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

// Add sign out functionality
window.signOut = function() {
    const auth2 = gapi.auth2.getAuthInstance();
    auth2.signOut().then(function () {
        console.log('User signed out.');
        document.getElementById('authCheck').style.display = 'block';
        document.getElementById('app-container').style.display = 'none';
    });
};