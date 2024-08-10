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
const EARTH_RADIUS = 6371000; // meters

// Choose a fixed reference point (e.g., the southwest corner of your area of interest)
const REF_LAT = 51.4; // Adjust this to a suitable reference latitude for your area
const REF_LNG = -2.6; // Adjust this to a suitable reference longitude for your area

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

function metersToLatLng(x, y) {
    const newLat = REF_LAT + (y / EARTH_RADIUS) * (180 / Math.PI);
    const newLng = REF_LNG + (x / (EARTH_RADIUS * Math.cos(REF_LAT * Math.PI / 180))) * (180 / Math.PI);
    return [newLat, newLng];
}

function latLngToMeters(lat, lng) {
    const y = (lat - REF_LAT) * (Math.PI / 180) * EARTH_RADIUS;
    const x = (lng - REF_LNG) * (Math.PI / 180) * EARTH_RADIUS * Math.cos(REF_LAT * Math.PI / 180);
    return [x, y];
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

function getCellKey(lat, lng) {
    const [x, y] = latLngToMeters(lat, lng);
    const cellX = Math.floor(x / CELL_SIZE) * CELL_SIZE;
    const cellY = Math.floor(y / CELL_SIZE) * CELL_SIZE;
    return `${cellX},${cellY}`;
}

function getCellBounds(cellKey) {
    const [cellX, cellY] = cellKey.split(',').map(Number);
    const [swLat, swLng] = metersToLatLng(cellX, cellY);
    const [neLat, neLng] = metersToLatLng(cellX + CELL_SIZE, cellY + CELL_SIZE);
    return [[swLat, swLng], [neLat, neLng]];
}

function handleMapClick(e) {
    if (!isDrawMode) {
        const cellKey = getCellKey(e.latlng.lat, e.latlng.lng);
        toggleCellSelection(cellKey);
    }
}

function updateGrid() {
    console.log('Updating grid');
    const bounds = map.getBounds();
    
    // Store the current selection before clearing allCells
    const currentSelection = new Set(selectedCellKeys);
    
    allCells.clear();

    const [minX, minY] = latLngToMeters(bounds.getSouth(), bounds.getWest());
    const [maxX, maxY] = latLngToMeters(bounds.getNorth(), bounds.getEast());

    for (let x = Math.floor(minX / CELL_SIZE) * CELL_SIZE; x < maxX; x += CELL_SIZE) {
        for (let y = Math.floor(minY / CELL_SIZE) * CELL_SIZE; y < maxY; y += CELL_SIZE) {
            const cellKey = `${x},${y}`;
            const cellBounds = getCellBounds(cellKey);
            allCells.set(cellKey, { key: cellKey, bounds: cellBounds, scores: null });
        }
    }

    // Restore selections
    currentSelection.forEach(key => {
        if (!allCells.has(key)) {
            const bounds = getCellBounds(key);
            allCells.set(key, { key: key, bounds: bounds, scores: null });
        }
        selectedCellKeys.add(key);
    });

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
    
    const visibleBounds = map.getBounds();

    allCells.forEach((cell, key) => {
        const { bounds, scores } = cell;
        const isSelected = selectedCellKeys.has(key);
        const isVisible = visibleBounds.intersects(L.latLngBounds(bounds));

        if (isVisible || isSelected) {
            let fillColor = "rgba(200,200,200,0.5)";
            let fillOpacity = 0.5;

            if (scores && isVisible) {
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
            } else if (!isVisible && isSelected) {
                fillColor = "rgba(255,0,0,0.2)";
                fillOpacity = 0.5;
            }

            const rectangle = L.rectangle(bounds, {
                color: isSelected ? 'red' : 'transparent',
                weight: isSelected ? 2 : 1,
                fillColor: fillColor,
                fillOpacity: fillOpacity
            }).addTo(gridLayer);

            rectangle.on('click', function(e) {
                if (!isDrawMode) {
                    L.DomEvent.stopPropagation(e);
                    toggleCellSelection(key);
                }
            });
        }
    });
}

function toggleCellSelection(key) {
    if (selectedCellKeys.has(key)) {
        selectedCellKeys.delete(key);
    } else {
        selectedCellKeys.add(key);
    }
    if (!allCells.has(key)) {
        const bounds = getCellBounds(key);
        allCells.set(key, { key: key, bounds: bounds, scores: null });
    }
    renderCells();
    updateScores();
}

function updateScores() {
    console.log("Updating scores...");
    const infoPanel = d3.select("#rankInfo");
    infoPanel.html("");

    const selectionTotals = d3.select("#selectionTotals");
    selectionTotals.html("");

    if (selectedCellKeys.size === 0) {
        infoPanel.html("<p>No cells selected. Select cells on the map to see scores.</p>");
        console.log("No cells selected");
        return;
    }

    console.log(`Selected cells: ${selectedCellKeys.size}`);

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
    const solutionTotals = {};

    selectedCellKeys.forEach(key => {
        const cellData = allCells.get(key);
        if (cellData && cellData.scores) {
            Object.entries(cellData.scores).forEach(([solution, scores]) => {
                if (!solutionTotals[solution]) {
                    solutionTotals[solution] = { impact: 0, cost: 0, count: 0 };
                }
                solutionTotals[solution].impact += scores.impact;
                solutionTotals[solution].cost += scores.cost;
                solutionTotals[solution].count++;

                totalImpact += scores.impact;
                totalCost += scores.cost;
                totalCount++;
            });
        }
    });

    console.log("Solution totals:", solutionTotals);

    // Add toggle for totals
    const totalsToggle = selectionTotals.append("div")
        .attr("class", "totals-toggle")
        .html(`<input type="checkbox" id="totalsToggle"> <label for="totalsToggle">totals</label>`);

    // Display totals graph
    const totalsSvg = selectionTotals.append("svg")
        .attr("width", totalWidth)
        .attr("height", groupHeight);

    const totalsG = totalsSvg.append("g")
        .attr("transform", `translate(0,10)`);

    const isDarkMode = document.body.classList.contains('dark-mode');
    const textColor = isDarkMode ? 'white' : 'black';

    function updateTotalsGraph(showAllRasters) {
        totalsG.selectAll("*").remove();  // Clear previous content

        if (!showAllRasters) {
            const totalsBarScale = d3.scaleLinear()
                .domain([0, Math.max(totalImpact, totalCost, totalCount)])
                .range([0, barWidth]);

            // Total Impact
            totalsG.append("text")
                .attr("x", toggleWidth)
                .attr("y", barHeight / 2)
                .attr("dominant-baseline", "middle")
                .attr("text-anchor", "start")
                .attr("fill", textColor)
                .text(`${totalImpact.toFixed(0)}`);

            totalsG.append("rect")
                .attr("x", toggleWidth + valueWidth + 5)
                .attr("y", 0)
                .attr("width", totalsBarScale(totalImpact))
                .attr("height", barHeight)
                .attr("fill", "steelblue");

            totalsG.append("text")
                .attr("x", toggleWidth + valueWidth + 10)
                .attr("y", barHeight / 2)
                .attr("dominant-baseline", "middle")
                .attr("fill", "white")
                .text("Total Impact");

            // Total Cost
            totalsG.append("text")
                .attr("x", toggleWidth)
                .attr("y", barHeight + barSpacing + barHeight / 2)
                .attr("dominant-baseline", "middle")
                .attr("text-anchor", "start")
                .attr("fill", textColor)
                .text(`£${totalCost.toFixed(0)}`);

            totalsG.append("rect")
                .attr("x", toggleWidth + valueWidth + 5)
                .attr("y", barHeight + barSpacing)
                .attr("width", totalsBarScale(totalCost))
                .attr("height", barHeight)
                .attr("fill", "darkseagreen");

            totalsG.append("text")
                .attr("x", toggleWidth + valueWidth + 10)
                .attr("y", barHeight + barSpacing + barHeight / 2)
                .attr("dominant-baseline", "middle")
                .attr("fill", "white")
                .text("Total Cost");

            // Total Count
            totalsG.append("text")
                .attr("x", toggleWidth)
                .attr("y", (barHeight + barSpacing) * 2 + barHeight / 2)
                .attr("dominant-baseline", "middle")
                .attr("text-anchor", "start")
                .attr("fill", textColor)
                .text(`${totalCount}`);

            totalsG.append("rect")
                .attr("x", toggleWidth + valueWidth + 5)
                .attr("y", (barHeight + barSpacing) * 2)
                .attr("width", totalsBarScale(totalCount))
                .attr("height", barHeight)
                .attr("fill", "lightcoral");

            totalsG.append("text")
                .attr("x", toggleWidth + valueWidth + 10)
                .attr("y", (barHeight + barSpacing) * 2 + barHeight / 2)
                .attr("dominant-baseline", "middle")
                .attr("fill", "white")
                .text("Total Count");
        }
        // If showAllRasters is true, you can add code here to display raster information
    }

    updateTotalsGraph(false);  // Initial display of original totals

    d3.select("#totalsToggle").on("change", function () {
        updateTotalsGraph(this.checked);
    });

    // Individual solutions
    const solutions = Object.keys(solutionTotals).sort((a, b) => {
        if (currentRanking === 'impact') {
            return solutionTotals[b].impact - solutionTotals[a].impact;
        } else {
            return solutionTotals[a].cost - solutionTotals[b].cost;
        }
    });

    const maxValues = {
        impact: d3.max(solutions, s => solutionTotals[s].impact),
        cost: d3.max(solutions, s => solutionTotals[s].cost),
        count: d3.max(solutions, s => solutionTotals[s].count)
    };

    const totalHeight = (groupHeight + groupSpacing) * solutions.length;

    const svg = infoPanel.append("svg")
        .attr("width", totalWidth)
        .attr("height", totalHeight);

    const g = svg.append("g")
        .attr("transform", `translate(0,10)`);

    solutions.forEach((solution, index) => {
        const yOffset = index * (groupHeight + groupSpacing);

        g.append("foreignObject")
            .attr("x", 0)
            .attr("y", yOffset)
            .attr("width", toggleWidth)
            .attr("height", 20)
            .html(`<input type="checkbox" class="criteria-toggle" data-solution="${solution}" ${activeCriteriaRasters.has(solution) ? 'checked' : ''}>`);

        const solutionGroup = g.append("g")
            .attr("transform", `translate(${toggleWidth + 5}, ${yOffset + 15})`);

        solutionGroup.append("text")
            .attr("text-anchor", "start")
            .attr("font-weight", "bold")
            .attr("fill", textColor)
            .text(solution);

        const valueStartX = toggleWidth;
        const barStartX = valueStartX + valueWidth + 5;
        const barStartY = yOffset + 25;

        const isToggled = activeCriteriaRasters.has(solution);
        const solutionBars = solutionGroup.append("g")
            .attr("class", "solution-bars")
            .attr("transform", `translate(0, ${barStartY - yOffset - 15})`);

        if (!isToggled) {
            // Display original impact, cost, and count bars
            const impactWidth = (solutionTotals[solution].impact / maxValues.impact) * barWidth;
            solutionBars.append("text")
                .attr("x", valueStartX)
                .attr("y", barHeight / 2)
                .attr("dominant-baseline", "middle")
                .attr("text-anchor", "start")
                .attr("fill", textColor)
                .text(`${solutionTotals[solution].impact.toFixed(0)}`);

            solutionBars.append("rect")
                .attr("x", barStartX)
                .attr("y", 0)
                .attr("width", impactWidth)
                .attr("height", barHeight)
                .attr("fill", colorScale(solution));

            solutionBars.append("text")
                .attr("x", barStartX + 5)
                .attr("y", barHeight / 2)
                .attr("dominant-baseline", "middle")
                .attr("fill", "white")
                .text("Impact");

            const costWidth = (solutionTotals[solution].cost / maxValues.cost) * barWidth;
            solutionBars.append("text")
                .attr("x", valueStartX)
                .attr("y", barHeight + barSpacing + barHeight / 2)
                .attr("dominant-baseline", "middle")
                .attr("text-anchor", "start")
                .attr("fill", textColor)
                .text(`£${solutionTotals[solution].cost.toFixed(0)}`);

            solutionBars.append("rect")
                .attr("x", barStartX)
                .attr("y", barHeight + barSpacing)
                .attr("width", costWidth)
                .attr("height", barHeight)
                .attr("fill", d3.color(colorScale(solution)).darker(0.5));

            solutionBars.append("text")
                .attr("x", barStartX + 5)
                .attr("y", barHeight + barSpacing + barHeight / 2)
                .attr("dominant-baseline", "middle")
                .attr("fill", "white")
                .text("Cost");

            const countWidth = (solutionTotals[solution].count / maxValues.count) * barWidth;
            solutionBars.append("text")
                .attr("x", valueStartX)
                .attr("y", (barHeight + barSpacing) * 2 + barHeight / 2)
                .attr("dominant-baseline", "middle")
                .attr("text-anchor", "start")
                .attr("fill", textColor)
                .text(`${solutionTotals[solution].count}`);

            solutionBars.append("rect")
                .attr("x", barStartX)
                .attr("y", (barHeight + barSpacing) * 2)
                .attr("width", countWidth)
                .attr("height", barHeight)
                .attr("fill", d3.color(colorScale(solution)).brighter(0.5));

            solutionBars.append("text")
                .attr("x", barStartX + 5)
                .attr("y", (barHeight + barSpacing) * 2 + barHeight / 2)
                .attr("dominant-baseline", "middle")
                .attr("fill", "white")
                .text("Count");
        }
        // If isToggled is true, you can add code here to display raster information
    });

    infoPanel.selectAll(".criteria-toggle")
        .on("change", function () {
            const solution = this.getAttribute("data-solution");
            const isChecked = this.checked;
            if (isChecked) {
                activeCriteriaRasters.add(solution);
            } else {
                activeCriteriaRasters.delete(solution);
            }
            updateScores();
            updateCriteriaRasters();
        });

    // Add a note about the current ranking and rank
    infoPanel.append("p")
        .attr("class", "ranking-note")
        .text(`Showing solutions ranked by ${currentRanking} at rank ${currentRank}`);

    console.log("Scores updated");
}

function createCriteriaKey(solution) {
    const criteria = solutionCriteria[solution] || [];
    return criteria.map(criterion =>
        `<span style="color:${criteriaColorScale(criterion)}">■</span> ${criterion}`
    ).join(', ');
}

async function calculateSuitabilityScores(bounds, challengeCategory) {
    const visibleCells = Array.from(allCells.values()).filter(cell =>
        bounds.intersects(L.latLngBounds(cell.bounds))
    );

    for (const cell of visibleCells) {
        const [swLat, swLng] = cell.bounds[0];
        const cellScores = {};
        for (const [solution, criteria] of Object.entries(solutionCriteria)) {
            const area = await calculateOverlapArea(swLat, swLng, criteria);
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
window.pointInPolygon = pointInPolyg