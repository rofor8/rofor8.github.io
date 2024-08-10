// Web Worker for heavy computations
const worker = new Worker('worker.js');

let solutionCriteria = {};
let challengeCategories = {};
let solutionCosts = {};
let map;
let gridLayer;
let rasterLayers = {};
let selectedCellKeys = new Set();
let allCells = new Map(); // Changed to Map for efficient lookups
let currentRanking = 'impact';
let currentRank = 1;
const CELL_SIZE = 100; // meters
let currentCategory = "Biodiversity and soils";
let drawLayer;
let isDrawMode = false;
let activeCriteriaRasters = new Set();
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

// Add this function to setup the rank slider
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
        setTimeout(() => {
            console.log('Forcing initial render');
            updateGrid();
            updateMap(currentCategory);
        }, 500);
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
    }).setView([51.454514, -2.587910], 17);

    tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        className: 'map-tiles'
    }).addTo(map);

    gridLayer = L.layerGroup().addTo(map);

    map.on('load', function() {
        console.log('Map loaded');
        updateGrid();
        updateMap(currentCategory);
    });

    map.on('moveend', () => {
        updateGrid();
        debouncedUpdateMap(currentCategory);
    });

    map.on('zoomend', () => {
        updateGrid();
        debouncedUpdateMap(currentCategory);
    });

    // Add click event listener to the map
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

    renderCells();
    console.log('Grid updated, cells rendered');
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

        await loadCOGs();
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
            const rasterData = await image.readRasters();
            const width = image.getWidth();
            const height = image.getHeight();
            const [minX, minY, maxX, maxY] = image.getBoundingBox();

            criteriaRasters[criterion] = {
                data: rasterData[0],
                width: width,
                height: height,
                bounds: [minX, minY, maxX, maxY]
            };
            console.log(`Loaded raster for ${criterion}:`, criteriaRasters[criterion]);
        } catch (error) {
            console.error(`Error loading raster for criterion ${criterion}:`, error);
        }
    }
}

// Modify the setupUI function to include the rank slider setup
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

    setupRankSlider(); // Add this line
}


async function updateMap(challengeCategory) {
    if (!map) return;

    console.log('Updating map for category:', challengeCategory);
    const bounds = map.getBounds();

    await calculateSuitabilityScores(bounds, challengeCategory);
    
    // Calculate the maximum rank
    const maxRank = Math.max(...Array.from(allCells.values()).map(cell => 
        Object.values(cell.scores || {}).filter(score => score.impact > 0 || score.cost > 0).length
    ));

    // Update the rank slider
    const rankSlider = document.getElementById('rankSlider');
    rankSlider.max = maxRank;
    rankSlider.value = Math.min(currentRank, maxRank);
    document.getElementById('rankValue').textContent = rankSlider.value;

    renderCells();
    updateScores();
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


function updateScores() {
    const infoPanel = d3.select("#rankInfo");
    infoPanel.html("");

    const selectionTotals = d3.select("#selectionTotals");
    selectionTotals.html("");

    if (selectedCellKeys.size === 0) {
        infoPanel.html("<p>No cells selected. Select cells on the map to see scores.</p>");
        return;
    }

    const barHeight = 20;
    const barSpacing = 5;
    const groupHeight = (barHeight + barSpacing) * 3 + 25;
    const groupSpacing = 20;
    const toggleWidth = 30;
    const valueWidth = 70;
    const barWidth = 250;
    const totalWidth = toggleWidth + valueWidth + barWidth + 20;

    let totalImpact = 0;
    let totalCost = 0;
    let totalCount = 0;

    const rankTotals = {};
    const allRasterCounts = {};
    const solutionOverlaps = {};

    selectedCellKeys.forEach(key => {
        const cellData = allCells.get(key);
        if (cellData && cellData.scores) {
            const validSolutions = Object.entries(cellData.scores)
                .filter(([sol, scores]) => {
                    if (currentRanking === 'impact') {
                        return scores.impact > 0;
                    } else {
                        return scores.cost > 0;
                    }
                })
                .sort((a, b) =>
                    currentRanking === 'impact' ? b[1].impact - a[1].impact : a[1].cost - b[1].cost
                );

            if (currentRank <= validSolutions.length) {
                const [solution, scores] = validSolutions[currentRank - 1];
                if (!rankTotals[solution]) {
                    rankTotals[solution] = { impact: 0, cost: 0, count: 0 };
                }
                rankTotals[solution].impact += scores.impact;
                rankTotals[solution].cost += scores.cost;
                rankTotals[solution].count++;

                totalImpact += scores.impact;
                totalCost += scores.cost;
                totalCount++;

                const [lat, lng] = key.split(',').map(Number);
                Object.keys(criteriaRasters).forEach(criterion => {
                    if (!allRasterCounts[criterion]) {
                        allRasterCounts[criterion] = 0;
                    }
                    if (getRasterValueAtPoint(criteriaRasters[criterion], lat, lng) > 0) {
                        allRasterCounts[criterion]++;
                    }
                });

                const criteria = solutionCriteria[solution] || [];
                if (!solutionOverlaps[solution]) {
                    solutionOverlaps[solution] = 0;
                }

                let allCriteriaPresent = criteria.every(criterion =>
                    getRasterValueAtPoint(criteriaRasters[criterion], lat, lng) > 0
                );

                if (allCriteriaPresent) {
                    solutionOverlaps[solution]++;
                }
            }
        }
    });

    // Display totals
    const totalsToggle = selectionTotals.append("div")
        .attr("class", "totals-toggle")
        .html(`<input type="checkbox" id="totalsToggle"> <label for="totalsToggle">Show all rasters</label>`);

    const totalsSvg = selectionTotals.append("svg")
        .attr("width", totalWidth)
        .attr("height", groupHeight);

    const totalsG = totalsSvg.append("g")
        .attr("transform", "translate(0,10)");

    function updateTotalsGraph(showAllRasters) {
        totalsG.selectAll("*").remove();

        if (showAllRasters) {
            const maxRasterCount = Math.max(...Object.values(allRasterCounts));
            const rasterBarScale = d3.scaleLinear()
                .domain([0, maxRasterCount])
                .range([0, barWidth]);

            Object.entries(allRasterCounts).forEach(([raster, count], index) => {
                totalsG.append("text")
                    .attr("x", toggleWidth)
                    .attr("y", index * 25 + 15)
                    .attr("fill", "black")
                    .text(count);

                totalsG.append("rect")
                    .attr("x", toggleWidth + valueWidth)
                    .attr("y", index * 25)
                    .attr("width", rasterBarScale(count))
                    .attr("height", barHeight)
                    .attr("fill", criteriaColorScale(raster));

                totalsG.append("text")
                    .attr("x", toggleWidth + valueWidth + 5)
                    .attr("y", index * 25 + 15)
                    .attr("fill", "white")
                    .text(raster);
            });

            totalsSvg.attr("height", Object.keys(allRasterCounts).length * 25);
        } else {
            const totalsBarScale = d3.scaleLinear()
                .domain([0, Math.max(totalImpact, totalCost, totalCount)])
                .range([0, barWidth]);

            totalsG.append("text")
                .attr("x", toggleWidth)
                .attr("y", 15)
                .attr("fill", "black")
                .text(`${totalImpact.toFixed(0)}`);

            totalsG.append("rect")
                .attr("x", toggleWidth + valueWidth)
                .attr("y", 0)
                .attr("width", totalsBarScale(totalImpact))
                .attr("height", barHeight)
                .attr("fill", "steelblue");

            totalsG.append("text")
                .attr("x", toggleWidth + valueWidth + 5)
                .attr("y", 15)
                .attr("fill", "white")
                .text("Total Impact");

            totalsG.append("text")
                .attr("x", toggleWidth)
                .attr("y", 40)
                .attr("fill", "black")
                .text(`£${totalCost.toFixed(0)}`);

            totalsG.append("rect")
                .attr("x", toggleWidth + valueWidth)
                .attr("y", 25)
                .attr("width", totalsBarScale(totalCost))
                .attr("height", barHeight)
                .attr("fill", "darkseagreen");

            totalsG.append("text")
                .attr("x", toggleWidth + valueWidth + 5)
                .attr("y", 40)
                .attr("fill", "white")
                .text("Total Cost");

            totalsG.append("text")
                .attr("x", toggleWidth)
                .attr("y", 65)
                .attr("fill", "black")
                .text(`${totalCount}`);

            totalsG.append("rect")
                .attr("x", toggleWidth + valueWidth)
                .attr("y", 50)
                .attr("width", totalsBarScale(totalCount))
                .attr("height", barHeight)
                .attr("fill", "lightcoral");

            totalsG.append("text")
                .attr("x", toggleWidth + valueWidth + 5)
                .attr("y", 65)
                .attr("fill", "white")
                .text("Total Count");

            totalsSvg.attr("height", groupHeight);
        }
    }

    updateTotalsGraph(false);

    d3.select("#totalsToggle").on("change", function () {
        updateTotalsGraph(this.checked);
    });

    // Display solution breakdowns
    const solutions = Object.keys(rankTotals).sort((a, b) => {
        if (currentRanking === 'impact') {
            return rankTotals[b].impact - rankTotals[a].impact;
        } else {
            return rankTotals[a].cost - rankTotals[b].cost;
        }
    });

    const maxValues = {
        impact: d3.max(solutions, s => rankTotals[s].impact),
        cost: d3.max(solutions, s => rankTotals[s].cost),
        count: d3.max(solutions, s => rankTotals[s].count)
    };

    const solutionSvg = infoPanel.append("svg")
        .attr("width", totalWidth)
        .attr("height", solutions.length * groupHeight);

    solutions.forEach((solution, index) => {
        const solutionG = solutionSvg.append("g")
            .attr("transform", `translate(0,${index * groupHeight})`);

        solutionG.append("text")
            .attr("x", 0)
            .attr("y", 15)
            .attr("font-weight", "bold")
            .attr("fill", "black")
            .text(solution);

        const barScale = d3.scaleLinear()
            .domain([0, d3.max([maxValues.impact, maxValues.cost, maxValues.count])])
            .range([0, barWidth]);

        // Impact bar
        solutionG.append("text")
            .attr("x", toggleWidth)
            .attr("y", 40)
            .attr("fill", "black")
            .text(`${rankTotals[solution].impact.toFixed(0)}`);

        solutionG.append("rect")
            .attr("x", toggleWidth + valueWidth)
            .attr("y", 25)
            .attr("width", barScale(rankTotals[solution].impact))
            .attr("height", barHeight)
            .attr("fill", colorScale(solution));

        solutionG.append("text")
            .attr("x", toggleWidth + valueWidth + 5)
            .attr("y", 40)
            .attr("fill", "white")
            .text("Impact");

        // Cost bar
        solutionG.append("text")
            .attr("x", toggleWidth)
            .attr("y", 65)
            .attr("fill", "black")
            .text(`£${rankTotals[solution].cost.toFixed(0)}`);

        solutionG.append("rect")
            .attr("x", toggleWidth + valueWidth)
            .attr("y", 50)
            .attr("width", barScale(rankTotals[solution].cost))
            .attr("height", barHeight)
            .attr("fill", d3.color(colorScale(solution)).darker(0.5));

        solutionG.append("text")
            .attr("x", toggleWidth + valueWidth + 5)
            .attr("y", 65)
            .attr("fill", "white")
            .text("Cost");

        // Count bar
        solutionG.append("text")
            .attr("x", toggleWidth)
            .attr("y", 90)
            .attr("fill", "black")
            .text(`${rankTotals[solution].count}`);

        solutionG.append("rect")
            .attr("x", toggleWidth + valueWidth)
            .attr("y", 75)
            .attr("width", barScale(rankTotals[solution].count))
            .attr("height", barHeight)
            .attr("fill", d3.color(colorScale(solution)).brighter(0.5));

        solutionG.append("text")
            .attr("x", toggleWidth + valueWidth + 5)
            .attr("y", 90)
            .attr("fill", "white")
            .text("Count");
    });
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
    if (!raster || !raster.bounds) {
        console.warn('Invalid raster data', raster);
        return 0;
    }

    const { data, width, height, bounds } = raster;
    const [minX, minY, maxX, maxY] = bounds;
    
    if (lng < minX || lng > maxX || lat < minY || lat > maxY) {
        console.log('Point outside raster bounds', { lat, lng, bounds });
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

    allCells.forEach((cell, key) => {
        const cellCenter = L.latLngBounds(cell.bounds).getCenter();
        if (bounds.contains(cellCenter) && pointInPolygon(cellCenter, drawingPath)) {
            selectedCellKeys.add(key);
        }
    });

    renderCells();
    updateScores();
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