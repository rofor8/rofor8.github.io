// Import updateScores from separate file
import { updateScores } from './updateScores.js';

// Global variables
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

async function initializeApp() {
    try {
        await fetchJSONData();
        await loadCOGs();
        setupMap();
        setupUI();
        updateGrid();
        updateMap(currentCategory);
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

    tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        className: 'map-tiles'
    }).addTo(map);

    gridLayer = L.layerGroup().addTo(map);

    map.on('moveend', debouncedUpdateGrid);
    map.on('zoomend', debouncedUpdateGrid);
    map.on('click', handleMapClick);
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

function getCellKeyFromLatLng(lat, lng) {
    const cellLat = Math.floor(lat / (CELL_SIZE / 111111)) * (CELL_SIZE / 111111);
    const cellLng = Math.floor(lng / (CELL_SIZE / (111111 * Math.cos(lat * Math.PI / 180)))) * (CELL_SIZE / (111111 * Math.cos(lat * Math.PI / 180)));
    return `${cellLat.toFixed(6)},${cellLng.toFixed(6)}`;
}

function updateGrid() {
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
}

function renderCells() {
    if (!map) return;
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
}

function toggleCellSelection(key) {
    if (selectedCellKeys.has(key)) {
        selectedCellKeys.delete(key);
    } else {
        selectedCellKeys.add(key);
    }
    renderCells();
    updateScores(selectedCellKeys);
}

async function updateMap(challengeCategory) {
    if (!map) return;

    console.log('Updating map for category:', challengeCategory);
    const bounds = map.getBounds();

    await loadTilesForViewport(bounds);
    await calculateSuitabilityScores(bounds, challengeCategory);

    const maxRank = Math.max(...Array.from(allCells.values()).map(cell =>
        Object.values(cell.scores || {}).filter(score => score.impact > 0 || score.cost > 0).length
    ));

    const rankSlider = document.getElementById('rankSlider');
    rankSlider.max = maxRank;
    rankSlider.value = Math.min(currentRank, maxRank);
    document.getElementById('rankValue').textContent = rankSlider.value;

    renderCells();
    updateScores(selectedCellKeys);
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

function setupRankSlider() {
    const rankSlider = document.getElementById('rankSlider');
    const rankValue = document.getElementById('rankValue');

    rankSlider.addEventListener('input', function() {
        currentRank = parseInt(this.value);
        rankValue.textContent = currentRank;
        renderCells();
        updateScores(selectedCellKeys);
    });
}

function toggleRanking() {
    currentRanking = currentRanking === 'impact' ? 'cost' : 'impact';
    const toggleButton = document.getElementById('rankingToggle');
    toggleButton.textContent = `Ranked by: ${currentRanking.charAt(0).toUpperCase() + currentRanking.slice(1)}`;
    toggleButton.classList.toggle('active');

    renderCells();
    updateScores(selectedCellKeys);
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

    allCells.forEach((cell, key) => {
        const cellCenter = L.latLngBounds(cell.bounds).getCenter();
        if (bounds.contains(cellCenter) && pointInPolygon(cellCenter, drawingPath)) {
            selectedCellKeys.add(key);
        }
    });

    renderCells();
    updateScores(selectedCellKeys);
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
    updateScores(selectedCellKeys);
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

async function calculateSuitabilityScores(bounds, challengeCategory) {
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

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

const debouncedUpdateGrid = debounce(() => {
    updateGrid();
    updateMap(currentCategory);
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