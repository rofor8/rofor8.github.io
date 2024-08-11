import { updateScores } from './updateScores.js';
import * as d3 from 'd3';
import idb from 'idb';
import GeoTIFF from 'geotiff';


let solutionCriteria = {};
let challengeCategories = {};
let solutionCosts = {};
let map;
let gridLayer;
let rasterLayers = {};
let selectedCellKeys = new Set();
let allCells = new Map();
let currentRanking = 'impact';
let currentRank = 1;
const CELL_SIZE = 100; // meters
let currentCategory = "Biodiversity and soils";
let drawLayer;
let isDrawMode = false;
let activeCriteriaRasters = new Set();
let drawStartTime;
let drawingPath = [];

// Export necessary variables and functions
export {
    allCells,
    currentRanking,
    currentRank,
    criteriaRasters,
    solutionCriteria,
    challengeCategories,
    solutionCosts,
    colorScale,
    criteriaColorScale
};

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

function setupRankSlider() {
    const rankSlider = document.getElementById('rankSlider');
    const rankValue = document.getElementById('rankValue');

    rankSlider.addEventListener('input', function() {
        currentRank = parseInt(this.value);
        rankValue.textContent = currentRank;
        renderCells();
        updateScores();
    });
}

async function initializeApp() {
    try {
        await fetchJSONData();
        await loadCOGs();
        setupMap();
        setupUI();
    } catch (error) {
        console.error('Error initializing app:', error);
    }
}

function setupMap() {
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

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        className: 'map-tiles',
        maxZoom: 19,
        zIndex: 1
    }).addTo(map);

    gridLayer = L.featureGroup().addTo(map);
    gridLayer.setZIndex(2);

    map.on('load', function() {
        console.log('Map loaded');
        updateGrid();
        updateMap(currentCategory);
    });

    map.on('moveend', debounce(() => {
        console.log('Map moved');
        updateGrid();
        updateMap(currentCategory);
    }, 250));

    map.on('zoomend', debounce(() => {
        console.log('Map zoomed');
        updateGrid();
        updateMap(currentCategory);
    }, 250));

    map.on('click', handleMapClick);
}

function getCellKeyFromLatLng(lat, lng) {
    const cellLat = Math.floor(lat / (CELL_SIZE / 111111)) * (CELL_SIZE / 111111);
    const cellLng = Math.floor(lng / (CELL_SIZE / (111111 * Math.cos(lat * Math.PI / 180)))) * (CELL_SIZE / (111111 * Math.cos(lat * Math.PI / 180)));
    return `${cellLat.toFixed(6)},${cellLng.toFixed(6)}`;
}

function handleMapClick(e) {
    if (!isDrawMode) {
        const clickedPoint = e.latlng;
        const cellKey = getCellKeyFromLatLng(clickedPoint.lat, clickedPoint.lng);
        if (cellKey) {
            toggleCellSelection(cellKey);
        }
    }
}

function updateGrid() {
    console.log('Updating grid');
    const bounds = map.getBounds();
    gridLayer.clearLayers();
    allCells.clear();

    const zoom = map.getZoom();
    const cellSizeMeters = CELL_SIZE;

    const cellSizeLat = cellSizeMeters / 111111;
    const cellSizeLng = cellSizeMeters / (111111 * Math.cos(bounds.getCenter().lat * Math.PI / 180));

    const minLat = bounds.getSouth();
    const maxLat = bounds.getNorth();
    const minLng = bounds.getWest();
    const maxLng = bounds.getEast();

    for (let lat = minLat; lat <= maxLat; lat += cellSizeLat) {
        for (let lng = minLng; lng <= maxLng; lng += cellSizeLng) {
            const cellKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
            const cellBounds = [
                [lat, lng],
                [lat + cellSizeLat, lng + cellSizeLng]
            ];
            allCells.set(cellKey, { key: cellKey, bounds: cellBounds, scores: null });
        }
    }

    console.log('Number of cells:', allCells.size);
    renderCells();
    console.log('Grid updated, cells rendered');
}

function renderCells() {
    if (!map) return;
    gridLayer.clearLayers();
    const bounds = map.getBounds();
    const visibleCells = Array.from(allCells.values()).filter(cell =>
        bounds.intersects(L.latLngBounds(cell.bounds))
    );

    visibleCells.forEach(({ key, bounds, scores }) => {
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

        const rectangle = L.rectangle(bounds, {
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
}

function toggleCellSelection(key) {
    if (selectedCellKeys.has(key)) {
        selectedCellKeys.delete(key);
    } else {
        selectedCellKeys.add(key);
    }
    renderCells();
    updateScores();
}

async function fetchJSONData() {
    try {
        const db = await dbPromise;
        let cachedData = await Promise.all([
            db.get('json-data', 'solutionCriteria'),
            db.get('json-data', 'challengeCategories'),
            db.get('json-data', 'solutionCosts')
        ]);

        if (cachedData.every(data => data !== undefined)) {
            [solutionCriteria, challengeCategories, solutionCosts] = cachedData;
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
        }
    } catch (error) {
        console.error('Error loading JSON data:', error);
        alert('Failed to load JSON data. Please try again later.');
        throw error;
    }
}

async function loadCOGs() {
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
            console.log(`Loaded raster metadata for ${criterion}:`, criteriaRasters[criterion]);
        } catch (error) {
            console.error(`Error loading raster for criterion ${criterion}:`, error);
        }
    }
}

async function loadTilesForViewport(bounds) {
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

        console.log(`Processing criterion: ${criterion}`);
        console.log(`Raster bounds: ${rasterBounds}`);
        console.log(`Viewport bounds: ${[bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]}`);

        // Check if the viewport intersects with the raster bounds
        if (bounds.getWest() > maxX || bounds.getEast() < minX ||
            bounds.getSouth() > maxY || bounds.getNorth() < minY) {
            console.log(`Viewport does not intersect with raster for ${criterion}`);
            continue;
        }

        try {
            const image = await tiff.getImage();
            const imageWidth = image.getWidth();
            const imageHeight = image.getHeight();

            // Calculate the window coordinates
            const left = Math.max(0, Math.floor((bounds.getWest() - minX) / (maxX - minX) * imageWidth));
            const top = Math.max(0, Math.floor((maxY - bounds.getNorth()) / (maxY - minY) * imageHeight));
            const right = Math.min(imageWidth, Math.ceil((bounds.getEast() - minX) / (maxX - minX) * imageWidth));
            const bottom = Math.min(imageHeight, Math.ceil((maxY - bounds.getSouth()) / (maxY - minY) * imageHeight));

            const window = [left, top, right, bottom];
            console.log(`Window for ${criterion}:`, window);

            // Read only the required portion of the raster
            const rasterData = await image.readRasters({ window });

            criteriaRasters[criterion].data = rasterData[0];
            criteriaRasters[criterion].width = right - left;
            criteriaRasters[criterion].height = bottom - top;
            criteriaRasters[criterion].windowBounds = [
                minX + (left / imageWidth) * (maxX - minX),
                maxY - (bottom / imageHeight) * (maxY - minY),
                minX + (right / imageWidth) * (maxX - minX),
                maxY - (top / imageHeight) * (maxY - minY)
            ];

            console.log(`Loaded data for ${criterion}:`, {
                dataLength: criteriaRasters[criterion].data.length,
                width: criteriaRasters[criterion].width,
                height: criteriaRasters[criterion].height,
                windowBounds: criteriaRasters[criterion].windowBounds
            });
        } catch (error) {
            console.error(`Error loading raster data for ${criterion}:`, error);
        }
    }
}

function setupUI() {
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
}

async function updateMap(challengeCategory) {
    if (!map) {
        console.warn("Map not initialized");
        return;
    }

    console.log('Updating map for category:', challengeCategory);
    const bounds = map.getBounds();

    console.log("Calling loadTilesForViewport");
    await loadTilesForViewport(bounds);

    console.log("Calling calculateSuitabilityScores");
    await calculateSuitabilityScores(bounds, challengeCategory);

    const maxRank = Math.max(...Array.from(allCells.values()).map(cell =>
        Object.values(cell.scores || {}).filter(score => score.impact > 0 || score.cost > 0).length
    ));

    console.log("Max rank:", maxRank);

    const rankSlider = document.getElementById('rankSlider');
    rankSlider.max = maxRank;
    rankSlider.value = Math.min(currentRank, maxRank);
    document.getElementById('rankValue').textContent = rankSlider.value;

    console.log("Calling renderCells");
    renderCells();

    console.log("Calling updateScores");
    updateScores(selectedCellKeys); // Pass selectedCellKeys here
}

async function calculateSuitabilityScores(bounds, challengeCategory) {
    console.log("Calculating suitability scores");
    const visibleCells = Array.from(allCells.values()).filter(cell =>
        bounds.intersects(L.latLngBounds(cell.bounds))
    );

    console.log(`Number of visible cells: ${visibleCells.length}`);

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
        console.log(`Calculated scores for cell ${cell.key}:`, cellScores);
    }

    console.log("Suitability scores calculated");
}

async function calculateOverlapArea(lat, lng, criteria) {
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
    return validCriteria > 0 ? totalValue / validCriteria : 0;
}

function getRasterValueAtPoint(raster, lat, lng) {
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

function toggleRanking() {
    currentRanking = currentRanking === 'impact' ? 'cost' : 'impact';
    const toggleButton = document.getElementById('rankingToggle');
    toggleButton.textContent = `Ranked by: ${currentRanking.charAt(0).toUpperCase() + currentRanking.slice(1)}`;
    toggleButton.classList.toggle('active');

    renderCells();
    updateScores();
}

function createButtons(containerId, dataArray, buttonClass) {
    const container = d3.select(`#${containerId}`);
    container.selectAll("button")
        .data(dataArray)
        .enter().append("button")
        .attr("class", buttonClass)
        .text(d => d)
        .on("click", function (event, d) {
            d3.selectAll(".category-button").classed("active", false);
            d3.select(this).classed("active", true);
            d3.select("#categoryDropdown .dropbtn").text(d);
            currentCategory = d;

            updateMap(currentCategory);
        });
}

function toggleDrawMode() {
    isDrawMode = !isDrawMode;
    const drawToggle = document.getElementById('drawToggle');
    drawToggle.classList.toggle('active');

    if (isDrawMode) {
        map.dragging.disable();
        map.touchZoom.disable();
        map.doubleClickZoom.disable();
        map.scrollWheelZoom.disable();
        map.boxZoom.disable();
        map.keyboard.disable();

        map.getContainer().addEventListener('mousedown', handleDrawStart);
        map.getContainer().addEventListener('mousemove', handleDrawMove);
        map.getContainer().addEventListener('mouseup', handleDrawEnd);
        map.getContainer().addEventListener('touchstart', handleDrawStart);
        map.getContainer().addEventListener('touchmove', handleDrawMove);
        map.getContainer().addEventListener('touchend', handleDrawEnd);
    } else {
        map.dragging.enable();
        map.touchZoom.enable();
        map.doubleClickZoom.enable();
        map.scrollWheelZoom.enable();
        map.boxZoom.enable();
        map.keyboard.enable();

        map.getContainer().removeEventListener('mousedown', handleDrawStart);
        map.getContainer().removeEventListener('mousemove', handleDrawMove);
        map.getContainer().removeEventListener('mouseup', handleDrawEnd);
        map.getContainer().removeEventListener('touchstart', handleDrawStart);
        map.getContainer().removeEventListener('touchmove', handleDrawMove);
        map.getContainer().removeEventListener('touchend', handleDrawEnd);

        if (drawLayer) {
            map.removeLayer(drawLayer);
            drawLayer = null;
        }
    }
}

function handleDrawStart(e) {
    if (!isDrawMode) return;
    e.preventDefault();
    drawStartTime = new Date().getTime();
    const point = e.touches ? e.touches[0] : e;
    const latlng = map.containerPointToLatLng(L.point(point.clientX, point.clientY));
    drawingPath = [latlng];

    if (drawLayer) {
        map.removeLayer(drawLayer);
    }
    drawLayer = L.polyline(drawingPath, { color: 'red' }).addTo(map);
}

function handleDrawMove(e) {
    if (!isDrawMode || !drawLayer) return;
    e.preventDefault();
    const point = e.touches ? e.touches[0] : e;
    const latlng = map.containerPointToLatLng(L.point(point.clientX, point.clientY));
    drawingPath.push(latlng);
    drawLayer.setLatLngs(drawingPath);
}

function handleDrawEnd(e) {
    if (!isDrawMode) return;
    e.preventDefault();
    const drawEndTime = new Date().getTime();
    const drawDuration = drawEndTime - drawStartTime;

    if (drawDuration < 500 && drawingPath.length < 3) {
        map.removeLayer(drawLayer);
        drawLayer = null;
        return;
    }

    drawingPath.push(drawingPath[0]);
    if (drawLayer) {
        drawLayer.setLatLngs(drawingPath);
        selectCellsInShape(drawLayer);
    }
    toggleDrawMode();
}

function selectCellsInShape(shape) {
    if (!gridLayer) return;

    const bounds = L.latLngBounds(drawingPath);

    allCells.forEach((cell) => {
        const cellCenter = L.latLngBounds(cell.bounds).getCenter();
        if (bounds.contains(cellCenter) && pointInPolygon(cellCenter, drawingPath)) {
            selectedCellKeys.add(cell.key);
        }
    });

    renderCells();
    updateScores(selectedCellKeys); // Pass selectedCellKeys here
}

function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lat, yi = polygon[i].lng;
        const xj = polygon[j].lat, yj = polygon[j].lng;

        const intersect = ((yi > point.lng) !== (yj > point.lng))
            && (point.lat < (xj - xi) * (point.lng - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function clearSelection() {
    selectedCellKeys.clear();
    if (drawLayer) {
        map.removeLayer(drawLayer);
        drawLayer = null;
    }
    renderCells();
    updateScores();
}

function updateCriteriaRasters() {
    Object.values(rasterLayers).forEach(layer => map.removeLayer(layer));
    rasterLayers = {};

    const bounds = map.getBounds();
    const visibleCells = Array.from(allCells.values()).filter(cell =>
        bounds.intersects(L.latLngBounds(cell.bounds))
    );

    activeCriteriaRasters.forEach((solution) => {
        const criteria = solutionCriteria[solution];
        criteria.forEach((criterion, criterionIndex) => {
            const raster = criteriaRasters[criterion];
            const rasterLayer = L.layerGroup().addTo(map);
            rasterLayers[`${solution}_${criterion}`] = rasterLayer;

            const criterionColor = criteriaColorScale(criterion);

            visibleCells.forEach(cell => {
                const [lat, lng] = cell.key.split(',').map(Number);
                const rasterValue = getRasterValueAtPoint(raster, lat, lng);
                if (rasterValue > 0) {
                    const xOffset = (criterionIndex % 2) * (cell.bounds[1][1] - cell.bounds[0][1]) / 2;
                    const yOffset = Math.floor(criterionIndex / 2) * (cell.bounds[1][0] - cell.bounds[0][0]) / 2;
                    const adjustedBounds = [
                        [cell.bounds[0][0] + yOffset, cell.bounds[0][1] + xOffset],
                        [cell.bounds[1][0] + yOffset, cell.bounds[1][1] + xOffset]
                    ];
                    L.polyline([
                        [adjustedBounds[0][0], adjustedBounds[0][1]],
                        [adjustedBounds[1][0], adjustedBounds[1][1]]
                    ], {
                        color: criterionColor,
                        weight: 2,
                        opacity: 0.8
                    }).addTo(rasterLayer);
                    L.polyline([
                        [adjustedBounds[0][0], adjustedBounds[1][1]],
                        [adjustedBounds[1][0], adjustedBounds[0][1]]
                    ], {
                        color: criterionColor,
                        weight: 2,
                        opacity: 0.8
                    }).addTo(rasterLayer);
                }
            });
        });
    });
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

const debouncedUpdateMap = debounce((category) => {
    updateMap(category);
}, 250);

function searchLocation() {
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
            })
            .catch(error => {
                console.error('Error searching for location:', error);
                alert('An error occurred while searching for the location');
            });
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
window.updateScores = updateScores;
window.createButtons = createButtons;
window.toggleCellSelection = toggleCellSelection;
window.pointInPolygon = pointInPolygon;
window.selectCellsInShape = selectCellsInShape;
window.updateCriteriaRasters = updateCriteriaRasters;
window.calculateSuitabilityScores = calculateSuitabilityScores;
window.calculateOverlapArea = calculateOverlapArea;
window.handleDrawStart = handleDrawStart;
window.handleDrawMove = handleDrawMove;
window.handleDrawEnd = handleDrawEnd;
window.searchLocation = searchLocation;
