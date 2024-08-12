// Import updateScores from separate file
import { updateScores } from './updateScores.js';

// Global variables (unchanged)
let allCells = new Map();
let solutionCriteria = {};
let challengeCategories = {};
let solutionCosts = {};
let map;
let gridLayer;
let rasterLayers = {};
let selectedCellKeys = new Set();

let currentRanking = 'impact';
let currentRank = 1;
const CELL_SIZE = 100; // meters
let currentCategory = "Biodiversity and soils";
let drawLayer;
let isDrawMode = false;
let drawStartTime;
let drawingPath = [];
let viewportOverlay;
let tileLayer;

const criteriaColorScale = d3.scaleOrdinal(d3.schemeCategory10);

const colorScale = d3.scaleOrdinal()
    .domain(Object.keys(solutionCriteria))
    .range(d3.schemeCategory10);

const criteriaRasters = {};

const dbPromise = idb.openDB('nbs-tool-cache', 1, {
    upgrade(db) {
        db.createObjectStore('json-data');
        db.createObjectStore('raster-data');
    },
});

// New timing function
function logTiming(stage, startTime) {
    const endTime = performance.now();
    const duration = endTime - startTime;
    console.log(`${stage} completed in ${duration.toFixed(2)} ms`);
    return endTime;
}

async function initializeApp() {
    const startTime = performance.now();
    console.log('Starting app initialization...');

    try {
        let timing = startTime;

        timing = await fetchJSONData(timing);
        timing = await loadCOGs(timing);
        timing = setupMap(timing);
        timing = setupUI(timing);
        timing = updateGrid(timing);
        timing = await updateMap(currentCategory, timing);

        logTiming('Total initialization', startTime);
    } catch (error) {
        console.error('Error initializing app:', error);
    }
}

function setupMap(startTime = performance.now()) {
    if (map) {
        map.remove();
    }
    map = L.map('map', {
        renderer: L.canvas(),
        tap: true,
        touchZoom: true,
        dragging: true,
        zoomControl: false
    }).setView([51.454514, -2.587910], 15);

    tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        className: 'map-tiles'
    }).addTo(map);

    gridLayer = L.layerGroup().addTo(map);

    map.on('moveend', debouncedUpdateGrid);
    map.on('zoomend', debouncedUpdateGrid);
    map.on('click', handleMapClick);

    return logTiming('Setup map', startTime);
}

async function fetchJSONData(startTime = performance.now()) {
    try {
        const db = await dbPromise;
        let cachedData = await Promise.all([
            db.get('json-data', 'solutionCriteria'),
            db.get('json-data', 'challengeCategories'),
            db.get('json-data', 'solutionCosts')
        ]);

        if (cachedData.every(data => data !== undefined)) {
            [solutionCriteria, challengeCategories, solutionCosts] = cachedData;
            console.log('Loaded JSON data from cache');
        } else {
            const [solutionCriteriaResponse, challengeCategoriesResponse, solutionCostsResponse] = await Promise.all([
                fetch('solutionCriteria.json'),
                fetch('challengeCategories.json'),
                fetch('solutionCosts.json')
            ]);

            if (!solutionCriteriaResponse.ok || !challengeCategoriesResponse.ok || !solutionCostsResponse.ok) {
                throw new Error('Failed to fetch JSON data');
            }

            solutionCriteria = await solutionCriteriaResponse.json();
            challengeCategories = await challengeCategoriesResponse.json();
            solutionCosts = await solutionCostsResponse.json();

            await Promise.all([
                db.put('json-data', solutionCriteria, 'solutionCriteria'),
                db.put('json-data', challengeCategories, 'challengeCategories'),
                db.put('json-data', solutionCosts, 'solutionCosts')
            ]);
            console.log('Loaded JSON data from server and cached');
        }
    } catch (error) {
        console.error('Error loading JSON data:', error);
        alert('Failed to load JSON data. Please try again later.');
        throw error;
    }

    return logTiming('Fetch JSON data', startTime);
}

async function loadCOGs(startTime = performance.now()) {
    const criteria = new Set(Object.values(solutionCriteria).flat());
    for (const criterion of criteria) {
        try {
            const response = await fetch(`rasters/${criterion}.tif`);
            const arrayBuffer = await response.arrayBuffer();
            const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
            const image = await tiff.getImage();
            const [minX, minY, maxX, maxY] = image.getBoundingBox();

            criteriaRasters[criterion] = {
                tiff: tiff,
                bounds: [minX, minY, maxX, maxY],
                data: null,
                width: null,
                height: null,
                windowBounds: null
            };
            console.log(`Loaded raster metadata for ${criterion}`);
        } catch (error) {
            console.error(`Error loading raster for criterion ${criterion}:`, error);
        }
    }

    return logTiming('Load COGs', startTime);
}

function setupUI(startTime = performance.now()) {
    createButtons("categoryButtons", Object.keys(challengeCategories), "category-button");

    d3.select("#categoryDropdown .dropbtn").text(currentCategory);

    d3.select("#categoryButtons")
        .selectAll("button")
        .filter(d => d === currentCategory)
        .classed("active", true);

    document.querySelector('.dropbtn').addEventListener('click', function (e) {
        e.stopPropagation();
        document.getElementById('categoryButtons').classList.toggle('show');
    });

    window.addEventListener('click', function (e) {
        if (!e.target.matches('.dropbtn')) {
            var dropdowns = document.getElementsByClassName("dropdown-content");
            for (var d = 0; d < dropdowns.length; d++) {
                var openDropdown = dropdowns[d];
                if (openDropdown.classList.contains('show')) {
                    openDropdown.classList.remove('show');
                }
            }
        }
    });

    setupRankSlider();

    return logTiming('Setup UI', startTime);
}

function updateGrid(startTime = performance.now()) {
    console.log('Updating grid');
    const bounds = map.getBounds();
    
    const cellSizeMeters = CELL_SIZE;
    const cellSizeLat = cellSizeMeters / 111111;
    const cellSizeLng = cellSizeMeters / (111111 * Math.cos(bounds.getCenter().lat * Math.PI / 180));

    const minLat = Math.floor(bounds.getSouth() / cellSizeLat) * cellSizeLat;
    const maxLat = Math.ceil(bounds.getNorth() / cellSizeLat) * cellSizeLat;
    const minLng = Math.floor(bounds.getWest() / cellSizeLng) * cellSizeLng;
    const maxLng = Math.ceil(bounds.getEast() / cellSizeLng) * cellSizeLng;

    const newCells = new Map();

    for (let lat = minLat; lat < maxLat; lat += cellSizeLat) {
        for (let lng = minLng; lng < maxLng; lng += cellSizeLng) {
            const cellKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
            const cellBounds = [
                [lat, lng],
                [lat + cellSizeLat, lng + cellSizeLng]
            ];
            if (allCells.has(cellKey)) {
                newCells.set(cellKey, allCells.get(cellKey));
            } else {
                newCells.set(cellKey, { key: cellKey, bounds: cellBounds, scores: null });
            }
        }
    }

    // Preserve selected cells that are no longer in view
    selectedCellKeys.forEach(key => {
        if (!newCells.has(key) && allCells.has(key)) {
            newCells.set(key, allCells.get(key));
        }
    });

    allCells = newCells;
    renderCells();
    console.log('Grid updated, cells rendered');

    return logTiming('Update grid', startTime);
}

async function updateMap(challengeCategory, startTime = performance.now()) {
    if (!map) return startTime;

    console.log('Updating map for category:', challengeCategory);
    const bounds = map.getBounds();

    let timing = startTime;
    timing = await loadTilesForViewport(bounds, timing);
    timing = await calculateSuitabilityScores(bounds, challengeCategory, timing);

    const maxRank = Math.max(...Array.from(allCells.values()).map(cell =>
        Object.values(cell.scores || {}).filter(score => score.impact > 0 || score.cost > 0).length
    ));

    const rankSlider = document.getElementById('rankSlider');
    rankSlider.max = maxRank;
    rankSlider.value = Math.min(currentRank, maxRank);
    document.getElementById('rankValue').textContent = rankSlider.value;

    timing = renderCells(timing);
    timing = callUpdateScores(timing);

    return logTiming('Update map', startTime);
}

async function loadTilesForViewport(bounds, startTime = performance.now()) {
    console.log("Loading tiles for viewport:", bounds);
    const visibleCriteria = new Set();
    Object.values(solutionCriteria).forEach(criteria => {
        criteria.forEach(criterion => visibleCriteria.add(criterion));
    });

    for (const criterion of visibleCriteria) {
        if (!criteriaRasters[criterion]) {
            console.warn(`Criterion ${criterion} not found in criteriaRasters`);
            continue;
        }

        const { tiff, bounds: rasterBounds } = criteriaRasters[criterion];
        const [minX, minY, maxX, maxY] = rasterBounds;

        if (!boundsIntersect(bounds, rasterBounds)) {
            console.log(`Viewport does not intersect with raster for ${criterion}`);
            continue;
        }

        try {
            const image = await tiff.getImage();
            const imageWidth = image.getWidth();
            const imageHeight = image.getHeight();

            const window = calculateWindow(bounds, rasterBounds, imageWidth, imageHeight);
            const rasterData = await image.readRasters({ window });

            criteriaRasters[criterion].data = rasterData[0];
            criteriaRasters[criterion].width = window[2] - window[0];
            criteriaRasters[criterion].height = window[3] - window[1];
            criteriaRasters[criterion].windowBounds = calculateWindowBounds(window, rasterBounds, imageWidth, imageHeight);

            console.log(`Loaded data for ${criterion}`);
        } catch (error) {
            console.error(`Error loading raster data for ${criterion}:`, error);
        }
    }

    return logTiming('Load tiles for viewport', startTime);
}

async function calculateSuitabilityScores(bounds, challengeCategory, startTime = performance.now()) {
    const visibleCells = Array.from(allCells.values()).filter(cell =>
        bounds.intersects(L.latLngBounds(cell.bounds))
    );

    for (const cell of visibleCells) {
        const [lat, lng] = cell.key.split(',').map(Number);
        const cellScores = {};
        for (const [solution, criteria] of Object.entries(solutionCriteria)) {
            const area = await calculateOverlapArea(lat, lng, criteria);
            const weight = challengeCategories[challengeCategory]?.[solution] || 0;
            cellScores[solution] = {
                impact: area * weight * 100,
                cost: area * (solutionCosts[solution] || 0),
                area: area
            };
        }
        cell.scores = cellScores;
    }

    return logTiming('Calculate suitability scores', startTime);
}

function renderCells(startTime = performance.now()) {
    if (!map) return startTime;
    gridLayer.clearLayers();
    const mapBounds = map.getBounds();
    
    allCells.forEach(({ key, bounds, scores }) => {
        const cellBounds = L.latLngBounds(bounds);
        if (!mapBounds.intersects(cellBounds)) return;

        let fillColor = "rgba(200,200,200,0.5)";
        let fillOpacity = 0.5;

        if (scores) {
            const validSolutions = Object.entries(scores)
                .filter(([sol, scores]) => {
                    if (currentRanking === 'impact') {
                        return scores.impact > 0;
                    } else {
                        return scores.cost > 0;
                    }
                });

            if (validSolutions.length > 0) {
                let sortedSolutions = validSolutions.sort((a, b) =>
                    currentRanking === 'impact' ? b[1].impact - a[1].impact : a[1].cost - b[1].cost
                );

                if (currentRank <= sortedSolutions.length) {
                    const rankedSolution = sortedSolutions[currentRank - 1];
                    fillColor = colorScale(rankedSolution[0]);
                    fillOpacity = 0.7;
                }
            }
        }

        const isSelected = selectedCellKeys.has(key);

        const rectangle = L.rectangle(cellBounds, {
            color: isSelected ? 'red' : 'transparent',
            weight: isSelected ? 2 : 1,
            fillColor: fillColor,
            fillOpacity: fillOpacity
        }).addTo(gridLayer);

        rectangle.on('click', function() {
            if (!isDrawMode) {
                toggleCellSelection(key);
            }
        });
    });

    return logTiming('Render cells', startTime);
}

function callUpdateScores(startTime = performance.now()) {
    console.log('Calling updateScores');
    updateScores(
        selectedCellKeys,
        allCells,
        currentRanking,
        currentRank,
        criteriaRasters,
        solutionCriteria,
        colorScale,
        criteriaColorScale,
        getRasterValueAtPoint
    );
    return logTiming('Call updateScores', startTime);
}

async function calculateOverlapArea(lat, lng, criteria, startTime = performance.now()) {
    let totalValue = 0;
    let validCriteria = 0;
    for (const criterion of criteria) {
        const raster = criteriaRasters[criterion];
        if (raster) {
            try {
                const value = getRasterValueAtPoint(raster, lat, lng);
                if (value !== undefined) {
                    totalValue += value;
                    validCriteria++;
                }
            } catch (error) {
                console.error(`Error calculating overlap for ${criterion}:`, error);
            }
        } else {
            console.warn(`Raster not found for criterion: ${criterion}`);
        }
    }
    logTiming('Calculate overlap area', startTime);
    return validCriteria > 0 ? totalValue / validCriteria : 0;
}

function getRasterValueAtPoint(raster, lat, lng, startTime = performance.now()) {
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
        logTiming('Get raster value at point', startTime);
        return data[y * width + x];
    }

    console.log('Invalid raster coordinates', { x, y, width, height });
    logTiming('Get raster value at point', startTime);
    return 0;
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

const debouncedUpdateGrid = debounce(() => {
    const startTime = performance.now();
    updateGrid(startTime);
    updateMap(currentCategory, startTime);
}, 250);

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

function searchLocation(startTime = performance.now()) {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput.value;

    if (query) {
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
            .then(response => response.json())
            .then(data => {
                if (data && data.length > 0) {
                    const { lat, lon } = data[0];
                    map.setView([lat, lon], 15);
                } else {
                    alert('Location not found');
                }
                logTiming('Search location', startTime);
            })
            .catch(error => {
                console.error('Error searching for location:', error);
                alert('An error occurred while searching for the location');
                logTiming('Search location (error)', startTime);
            });
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    const startTime = performance.now();
    initializeApp().then(() => {
        logTiming('Total DOMContentLoaded', startTime);
    });
});

// Export functions to global scope for use in HTML
window.toggleRanking = toggleRanking;
window.clearSelection = clearSelection;
window.toggleDrawMode = toggleDrawMode;
window.updateMap = updateMap;
window.renderCells = renderCells;
window.createButtons = createButtons;
window.toggleCellSelection = toggleCellSelection;
window.pointInPolygon = pointInPolygon;
window.selectCellsInShape = selectCellsInShape;
window.calculateSuitabilityScores = calculateSuitabilityScores;
window.calculateOverlapArea = calculateOverlapArea;
window.handleDrawStart = handleDrawStart;
window.handleDrawMove = handleDrawMove;
window.handleDrawEnd = handleDrawEnd;
window.searchLocation = searchLocation;

// Expose necessary variables and functions for updateScores.js
window.allCells = allCells;
window.currentRanking = currentRanking;
window.currentRank = currentRank;
window.criteriaRasters = criteriaRasters;
window.solutionCriteria = solutionCriteria;
window.colorScale = colorScale;
window.criteriaColorScale = criteriaColorScale;
window.getRasterValueAtPoint = getRasterValueAtPoint;