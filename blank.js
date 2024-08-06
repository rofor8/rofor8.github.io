<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>NBS Tool</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css"/>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css"/>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css"/>
    <script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js"></script>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/geotiff"></script>
    <script src="https://d3js.org/d3-scale-chromatic.v1.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/idb@7/build/umd.js"></script>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            height: 100vh;
            overflow: hidden;
        }

        #app-container {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }

        #mapContainer {
            flex-grow: 1;
            position: relative;
        }

        #map {
            width: 100%;
            height: 100%;
        }

        #infoPanel {
            width: 100%;
            background: white;
            border-top: 1px solid #ddd;
            padding: 10px;
            overflow-y: auto;
            max-height: 50vh;
        }

        #infoPanel h3 {
            margin-top: 0;
            margin-bottom: 10px;
            color: #333;
            border-bottom: 1px solid #ddd;
            padding-bottom: 5px;
        }

        #infoPanel table {
            width: 100%;
            border-collapse: collapse;
        }

        #infoPanel th, #infoPanel td {
            text-align: left;
            padding: 5px;
            border-bottom: 1px solid #ddd;
        }

        #infoPanel tr.current-rank {
            background-color: #e0e0e0;
        }

        .slider-container {
            margin-bottom: 10px;
        }

        .slider-value {
            font-size: 14px;
        }

        .dropdown {
            margin-bottom: 10px;
        }

        .dropbtn {
            background-color: #f1f1f1;
            color: black;
            padding: 10px;
            font-size: 16px;
            border: none;
            cursor: pointer;
            width: 100%;
            text-align: left;
        }

        .dropdown-content {
            display: none;
            background-color: #f9f9f9;
            box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);
            z-index: 1;
            max-height: 200px;
            overflow-y: auto;
        }

        .dropdown-content button {
            color: black;
            padding: 12px 16px;
            text-decoration: none;
            display: block;
            width: 100%;
            text-align: left;
            border: none;
            background-color: white;
            cursor: pointer;
        }

        .dropdown-content button:hover {background-color: #f1f1f1}

        .dropdown:hover .dropdown-content {
            display: block;
        }

        .toggle-button {
            background-color: #4CAF50;
            border: none;
            color: white;
            padding: 10px 20px;
            text-align: center;
            text-decoration: none;
            display: inline-block;
            font-size: 16px;
            margin: 4px 2px;
            cursor: pointer;
            border-radius: 4px;
            transition-duration: 0.4s;
        }

        .toggle-button:hover {
            background-color: #45a049;
        }

        .toggle-button.active {
            background-color: #357a38;
        }

        .map-button {
            background-color: white;
            border: 2px solid #4CAF50;
            color: black;
            padding: 10px;
            text-align: center;
            text-decoration: none;
            display: inline-block;
            font-size: 16px;
            margin: 4px 2px;
            cursor: pointer;
            border-radius: 50%;
            transition-duration: 0.4s;
        }

        .map-button:hover {
            background-color: #4CAF50;
            color: white;
        }

        .map-button.active {
            background-color: #4CAF50;
            color: white;
        }

        #mapButtons {
            position: absolute;
            top: 20px;
            right: 20px;
            z-index: 1000;
        }

        .criteria-toggle {
            cursor: pointer;
            margin-left: 10px;
        }

        .leaflet-tile-pane {
            filter: grayscale(100%) brightness(105%) contrast(105%);
        }

        body.dark-mode {
            background-color: #333;
            color: #f0f0f0;
        }

        .dark-mode #map {
            filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%);
        }

        .dark-mode .leaflet-control-attribution {
            background-color: rgba(0, 0, 0, 0.5);
            color: #f0f0f0;
        }

        .dark-mode #infoPanel {
            background-color: #222;
            color: #f0f0f0;
        }

        .dark-mode .toggle-button {
            background-color: #555;
        }

        .dark-mode .toggle-button.active {
            background-color: #777;
        }

        .dark-mode .dropbtn {
            background-color: #444;
            color: #f0f0f0;
        }

        .dark-mode .dropdown-content {
            background-color: #333;
        }

        .dark-mode .dropdown-content button {
            background-color: #444;
            color: #f0f0f0;
        }

        .dark-mode .dropdown-content button:hover {
            background-color: #555;
        }

        #searchContainer {
            background-color: white;
            border-radius: 4px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        #searchButton {
            background: none;
            border: none;
            cursor: pointer;
            padding: 10px;
            font-size: 18px;
            color: #4CAF50;
        }

        #searchButton:hover {
            color: #45a049;
        }

        #searchInput {
            padding: 5px;
            width: 200px;
            border: none;
            outline: none;
        }

        .dark-mode #searchContainer {
            background-color: #333;
        }

        .dark-mode #searchButton {
            color: #4CAF50;
        }

        .dark-mode #searchButton:hover {
            color: #45a049;
        }

        .dark-mode #searchInput {
            background-color: #444;
            color: #f0f0f0;
        }

        @media (min-width: 768px) {
            #app-container {
                flex-direction: row;
            }

            #infoPanel {
                width: 300px;
                border-left: 1px solid #ddd;
                border-top: none;
                max-height: none;
            }
        }

        @media (max-width: 767px) {
            #mapButtons {
                top: 10px;
                right: 10px;
            }

            .map-button {
                padding: 8px;
                font-size: 14px;
            }

            #infoPanel {
                max-height: 40vh;
            }

            .dropdown-content {
                max-height: 150px;
            }

            .toggle-button {
                padding: 8px 16px;
                font-size: 14px;
            }
        }
    </style>
</head>
<body>
    <div id="app-container">
        <div id="mapContainer">
            <div id="map"></div>
            <div id="searchContainer" style="position: absolute; top: 20px; left: 20px; z-index: 1000;">
                <button id="searchButton" onclick="toggleSearch()"><i class="fas fa-search"></i></button>
                <input type="text" id="searchInput" placeholder="Enter location" style="display: none;">
            </div>
            <div id="mapButtons">
                <button id="drawToggle" class="map-button" onclick="toggleDrawMode()"><i class="fas fa-draw-polygon"></i></button>
                <button id="clearSelection" class="map-button" onclick="clearSelection()"><i class="fas fa-trash-alt"></i></button>
                <button id="darkModeToggle" class="map-button" onclick="toggleDarkMode()"><i class="fas fa-moon"></i></button>
            </div>
        </div>
        
        <div id="infoPanel">
            <div id="categoryDropdown" class="dropdown">
                <button class="dropbtn">Biodiversity and soils</button>
                <div id="categoryButtons" class="dropdown-content"></div>
            </div>
            <button id="rankingToggle" class="toggle-button" onclick="toggleRanking()">Ranked by: Impact</button>
            <div class="slider-container">
                <label for="rankSlider">Rank:</label>
                <input type="range" id="rankSlider" min="1" max="1" step="1" value="1">
                <div id="rankValue" class="slider-value">1</div>
            </div>
            <div id="rankInfo"></div>
        </div>
    </div>

    <script>
    // Web Worker for heavy computations
    const worker = new Worker('worker.js');

    let solutionCriteria = {};
    let challengeCategories = {};
    let solutionCosts = {};
    let map;
    let gridLayer;
    let rasterLayers = {};
    let selectedCellKeys = new Set();
    let allCells = [];
    let gridOrigin = null;
    let gridExtent = null;
    let currentRanking = 'impact';
    let currentRank = 1;
    const GRID_SIZE = 100;
    let currentCategory = "Biodiversity and soils";
    let cellSizeLat, cellSizeLng;
    let drawLayer;
    let isDrawMode = false;
    let activeCriteriaRasters = new Set();
    let drawStartTime;
    let drawingPath = [];

    const criteriaColorScale = d3.scaleOrdinal(d3.schemeCategory10);

    const colorScale = d3.scaleOrdinal()
        .domain(Object.keys(solutionCriteria))
        .range(d3.schemeCategory10);

    const criteriaRasters = {};

    // Use IndexedDB for caching
    const dbPromise = idb.openDB('nbs-tool-cache', 1, {
        upgrade(db) {
            db.createObjectStore('json-data');
            db.createObjectStore('raster-data');
        },
    });

    async function initializeApp() {
        try {
            await fetchJSONData();
            setupMap();
            setupUI();
            await updateMap(currentCategory);
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
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            className: 'map-tiles'
        }).addTo(map);

        // Add event listeners for pan and zoom
        map.on('moveend', () => debouncedUpdateMap(currentCategory));
        map.on('zoomend', () => debouncedUpdateMap(currentCategory));
    }

    async function loadCOGs() {
        const criteria = new Set(Object.values(solutionCriteria).flat());
        for (const criterion of criteria) {
            const cachedRaster = await getCachedRaster(criterion);
            if (cachedRaster) {
                criteriaRasters[criterion] = cachedRaster;
            } else {
                const response = await fetch(`rasters/${criterion}.tif`);
                const arrayBuffer = await response.arrayBuffer();
                const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
                const image = await tiff.getImage();
                const rasterData = await image.readRasters();
                
                criteriaRasters[criterion] = Array.from({ length: GRID_SIZE }, (_, y) => 
                    Array.from({ length: GRID_SIZE }, (_, x) => 
                        rasterData[0][y * GRID_SIZE + x] > 0 ? 1 : 0
                    )
                );
                await cacheRaster(criterion, criteriaRasters[criterion]);
            }
        }
    }

    async function getCachedRaster(criterion) {
        const db = await dbPromise;
        return db.get('raster-data', criterion);
    }

    async function cacheRaster(criterion, rasterData) {
        const db = await dbPromise;
        await db.put('raster-data', rasterData, criterion);
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
            throw error;
        }
    }

    function setupUI() {
        createButtons("categoryButtons", Object.keys(challengeCategories), "category-button");

        d3.select("#categoryDropdown .dropbtn").text(currentCategory);

        d3.select("#categoryButtons")
            .selectAll("button")
            .filter(d => d === currentCategory)
            .classed("active", true);

        document.querySelector('.dropbtn').addEventListener('click', function(e) {
            e.stopPropagation();
            document.getElementById('categoryButtons').classList.toggle('show');
        });

        window.addEventListener('click', function(e) {
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

        document.getElementById('rankSlider').addEventListener('input', function() {
            currentRank = parseInt(this.value);
            document.getElementById('rankValue').textContent = currentRank;
            renderCells();
            updateScores();
        });
    }

    async function updateMap(challengeCategory) {
        if (!map) return;

        const currentCenter = map.getCenter();
        const currentZoom = map.getZoom();

        const suitabilityScores = await calculateSuitabilityScores(GRID_SIZE, challengeCategory);

        if (gridLayer) {
            map.removeLayer(gridLayer);
        }

        gridLayer = L.layerGroup().addTo(map);

        if (!gridOrigin) {
            gridOrigin = currentCenter;
        }

        const mapCenter = currentCenter;
        
        const gridSizeMeters = 2000;

        const latDegreeSize = 111000;
        const lngDegreeSize = 111000 * Math.cos(mapCenter.lat * Math.PI / 180);

        const cellSizeMeters = gridSizeMeters / GRID_SIZE;
        cellSizeLat = cellSizeMeters / latDegreeSize;
        cellSizeLng = cellSizeMeters / lngDegreeSize;

        gridExtent = {
            north: gridOrigin.lat + (gridSizeMeters / latDegreeSize) / 2,
            south: gridOrigin.lat - (gridSizeMeters / latDegreeSize) / 2,
            east: gridOrigin.lng + (gridSizeMeters / lngDegreeSize) / 2,
            west: gridOrigin.lng - (gridSizeMeters / lngDegreeSize) / 2
        };

        allCells = [];

        suitabilityScores.forEach((row, y) => {
            row.forEach((cell, x) => {
                const cellBounds = [
                    [gridExtent.north - y * cellSizeLat, gridExtent.west + x * cellSizeLng],
                    [gridExtent.north - (y + 1) * cellSizeLat, gridExtent.west + (x + 1) * cellSizeLng]
                ];

                const key = `${x},${y}`;
                
                allCells.push({key, cell, bounds: cellBounds});
            });
        });

        renderCells();

        const maxRank = Math.max(...suitabilityScores.flat().map(cell => 
            Object.entries(cell)
                .filter(([sol, scores]) => {
                    if (currentRanking === 'impact') {
                        return scores.impact > 0;
                    } else {
                        return scores.cost > 0;
                    }
                })
                .length
        ));
        const rankSlider = document.getElementById('rankSlider');
        rankSlider.max = maxRank;
        rankSlider.value = Math.min(currentRank, maxRank);
        document.getElementById('rankValue').textContent = rankSlider.value;

        updateScores();
        updateCriteriaRasters();
    }

    function renderCells() {
        if (!map) return;

        const bounds = map.getBounds();
        const visibleCells = allCells.filter(({bounds: cellBounds}) => 
            bounds.intersects(L.latLngBounds(cellBounds))
        );

        const canvas = document.createElement('canvas');
        canvas.width = map.getSize().x;
        canvas.height = map.getSize().y;
        const ctx = canvas.getContext('2d');

        requestAnimationFrame(() => {
            visibleCells.forEach(({key, cell, bounds}) => {
                let fillColor, fillOpacity;
                const validSolutions = Object.entries(cell)
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
                    } else {
                        fillColor = "rgba(0,0,0,0)";
                        fillOpacity = 0;
                    }
                } else {
                    fillColor = "rgba(0,0,0,0)";
                    fillOpacity = 0;
                }

                const isSelected = selectedCellKeys.has(key);

                const pixelBounds = bounds.map(latlng => map.latLngToContainerPoint(latlng));
                ctx.fillStyle = fillColor;
                ctx.globalAlpha = fillOpacity;
                ctx.fillRect(pixelBounds[0].x, pixelBounds[0].y, pixelBounds[1].x - pixelBounds[0].x, pixelBounds[1].y - pixelBounds[0].y);

                if (isSelected) {
                    ctx.strokeStyle = "red";
                    ctx.lineWidth = 2;
                    ctx.strokeRect(pixelBounds[0].x, pixelBounds[0].y, pixelBounds[1].x - pixelBounds[0].x, pixelBounds[1].y - pixelBounds[0].y);
                }
            });

            const canvasLayer = L.imageOverlay(canvas.toDataURL(), map.getBounds());
            gridLayer.clearLayers();
            gridLayer.addLayer(canvasLayer);
        });

        map.off('click');
        map.on('click', function(e) {
            if (!isDrawMode) {
                const clickedPoint = map.latLngToContainerPoint(e.latlng);
                const clickedCell = visibleCells.find(({bounds}) => {
                    const pixelBounds = bounds.map(latlng => map.latLngToContainerPoint(latlng));
                    return clickedPoint.x >= pixelBounds[0].x && clickedPoint.x <= pixelBounds[1].x &&
                           clickedPoint.y >= pixelBounds[0].y && clickedPoint.y <= pixelBounds[1].y;
                });

                if (clickedCell) {
                    toggleCellSelection(clickedCell.key);
                }
            }
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
        infoPanel.html("");  // Clear previous content

        if (selectedCellKeys.size === 0) {
            infoPanel.html("<p>No cells selected. Select cells on the map to see scores.</p>");
            return;
        }

        const rankTotals = {};
        selectedCellKeys.forEach(key => {
            const cellData = allCells.find(cell => cell.key === key);
            if (cellData) {
                const {cell} = cellData;
                const validSolutions = Object.entries(cell)
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
                }
            }
        });

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

        const barHeight = 20;
        const barSpacing = 5;
        const groupHeight = (barHeight + barSpacing) * 3 + 25;
        const groupSpacing = 20;
        const toggleWidth = 30;
        const valueWidth = 70;
        const barWidth = 250;
        const totalWidth = toggleWidth + valueWidth + barWidth + 20;
        const totalHeight = (groupHeight + groupSpacing) * solutions.length;

        const svg = infoPanel.append("svg")
            .attr("width", totalWidth)
            .attr("height", totalHeight);

        const g = svg.append("g")
            .attr("transform", `translate(0,10)`);

        const isDarkMode = document.body.classList.contains('dark-mode');
        const textColor = isDarkMode ? 'white' : 'black';

        solutions.forEach((solution, index) => {
            const yOffset = index * (groupHeight + groupSpacing);

            g.append("foreignObject")
                .attr("x", 0)
                .attr("y", yOffset)
                .attr("width", toggleWidth)
                .attr("height", 20)
                .html(`<input type="checkbox" class="criteria-toggle" data-solution="${solution}" ${activeCriteriaRasters.has(solution) ? 'checked' : ''}>`);

            g.append("text")
                .attr("x", toggleWidth + 5)
                .attr("y", yOffset + 15)
                .attr("text-anchor", "start")
                .attr("font-weight", "bold")
                .attr("fill", textColor)
                .text(solution);

            const valueStartX = toggleWidth;
            const barStartX = valueStartX + valueWidth + 5;
            const barStartY = yOffset + 25;

            const impactWidth = (rankTotals[solution].impact / maxValues.impact) * barWidth;
            g.append("text")
                .attr("x", valueStartX)
                .attr("y", barStartY + barHeight / 2)
                .attr("dominant-baseline", "middle")
                .attr("text-anchor", "start")
                .attr("fill", textColor)
                .text(`${rankTotals[solution].impact.toFixed(0)}`);

            g.append("rect")
                .attr("x", barStartX)
                .attr("y", barStartY)
                .attr("width", impactWidth)
                .attr("height", barHeight)
                .attr("fill", colorScale(solution));

            g.append("text")
                .attr("x", barStartX + 5)
                .attr("y", barStartY + barHeight / 2)
                .attr("dominant-baseline", "middle")
                .attr("fill", "white")
                .text("Impact");

            const costWidth = (rankTotals[solution].cost / maxValues.cost) * barWidth;
            g.append("text")
                .attr("x", valueStartX)
                .attr("y", barStartY + barHeight + barSpacing + barHeight / 2)
                .attr("dominant-baseline", "middle")
                .attr("text-anchor", "start")
                .attr("fill", textColor)
                .text(`£${rankTotals[solution].cost.toFixed(0)}`);

            g.append("rect")
                .attr("x", barStartX)
                .attr("y", barStartY + barHeight + barSpacing)
                .attr("width", costWidth)
                .attr("height", barHeight)
                .attr("fill", d3.color(colorScale(solution)).darker(0.5));

            g.append("text")
                .attr("x", barStartX + 5)
                .attr("y", barStartY + barHeight + barSpacing + barHeight / 2)
                .attr("dominant-baseline", "middle")
                .attr("fill", "white")
                .text("Cost");

            const countWidth = (rankTotals[solution].count / maxValues.count) * barWidth;
            g.append("text")
                .attr("x", valueStartX)
                .attr("y", barStartY + (barHeight + barSpacing) * 2 + barHeight / 2)
                .attr("dominant-baseline", "middle")
                .attr("text-anchor", "start")
                .attr("fill", textColor)
                .text(`${rankTotals[solution].count}`);

            g.append("rect")
                .attr("x", barStartX)
                .attr("y", barStartY + (barHeight + barSpacing) * 2)
                .attr("width", countWidth)
                .attr("height", barHeight)
                .attr("fill", d3.color(colorScale(solution)).brighter(0.5));

            g.append("text")
                .attr("x", barStartX + 5)
                .attr("y", barStartY + (barHeight + barSpacing) * 2 + barHeight / 2)
                .attr("dominant-baseline", "middle")
                .attr("fill", "white")
                .text("Count");
        });

        infoPanel.selectAll(".criteria-toggle")
            .on("change", function() {
                const solution = this.getAttribute("data-solution");
                if (this.checked) {
                    activeCriteriaRasters.add(solution);
                } else {
                    activeCriteriaRasters.delete(solution);
                }
                updateCriteriaRasters();
            });
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
            .on("click", function(event, d) {
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
        drawLayer = L.polyline(drawingPath, {color: 'red'}).addTo(map);
    }

    function handleDrawMove(e) {
        if (!isDrawMode) return;
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

        allCells.forEach(({key, bounds: cellBounds}) => {
            const cellCenter = L.latLngBounds(cellBounds).getCenter();
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

        activeCriteriaRasters.forEach(solution => {
            const criteria = solutionCriteria[solution];
            criteria.forEach((criterion, index) => {
                const raster = criteriaRasters[criterion];
                const rasterLayer = L.layerGroup().addTo(map);
                rasterLayers[`${solution}_${criterion}`] = rasterLayer;

                const criterionColor = criteriaColorScale(criterion);

                raster.forEach((row, y) => {
                    row.forEach((value, x) => {
                        if (value) {
                            const cellBounds = [
                                [gridExtent.north - y * cellSizeLat, gridExtent.west + x * cellSizeLng],
                                [gridExtent.north - (y + 1) * cellSizeLat, gridExtent.west + (x + 1) * cellSizeLng]
                            ];
                            L.polyline([
                                [cellBounds[0][0], cellBounds[0][1]],
                                [cellBounds[1][0], cellBounds[1][1]]
                            ], {
                                color: criterionColor,
                                weight: 2,
                                opacity: 0.8
                            }).addTo(rasterLayer);
                            L.polyline([
                                [cellBounds[0][0], cellBounds[1][1]],
                                [cellBounds[1][0], cellBounds[0][1]]
                            ], {
                                color: criterionColor,
                                weight: 2,
                                opacity: 0.8
                            }).addTo(rasterLayer);
                        }
                    });
                });
            });
        });
    }

    function toggleDarkMode() {
        const isDarkMode = document.body.classList.toggle('dark-mode');
        const darkModeButton = document.getElementById('darkModeToggle');
        if (isDarkMode) {
            darkModeButton.innerHTML = '<i class="fas fa-sun"></i>';
        } else {
            darkModeButton.innerHTML = '<i class="fas fa-moon"></i>';
        }
        
        // Store current map state
        const currentCenter = map.getCenter();
        const currentZoom = map.getZoom();
        
        // Recreate the map layer to apply dark mode styles
        map.eachLayer(function (layer) {
            if (layer instanceof L.TileLayer) {
                map.removeLayer(layer);
            }
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            className: 'map-tiles'
        }).addTo(map);

        // Restore map state
        map.setView(currentCenter, currentZoom);

        updateMap(currentCategory);
    }

    function toggleSearch() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput.style.display === 'none') {
            searchInput.style.display = 'inline-block';
            searchInput.focus();
        } else {
            searchInput.style.display = 'none';
        }
    }

    function searchLocation() {
        const query = document.getElementById('searchInput').value;
        if (!query) return;

        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;

        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (data && data.length > 0) {
                    const lat = parseFloat(data[0].lat);
                    const lon = parseFloat(data[0].lon);
                    map.setView([lat, lon], 16);
                    L.marker([lat, lon]).addTo(map)
                        .bindPopup(data[0].display_name)
                        .openPopup();
                    document.getElementById('searchInput').style.display = 'none';
                } else {
                    alert('Location not found');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('An error occurred while searching');
            });
    }

    // Use Web Worker for heavy computations
    function calculateSuitabilityScores(gridSize, challengeCategory) {
        return new Promise((resolve) => {
            worker.postMessage({
                type: 'calculateSuitabilityScores',
                gridSize,
                challengeCategory,
                solutionCriteria,
                challengeCategories,
                solutionCosts,
                criteriaRasters
            });

            worker.onmessage = (e) => {
                if (e.data.type === 'suitabilityScores') {
                    resolve(e.data.scores);
                }
            };
        });
    }

    // Debounce function to limit the frequency of map updates
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }

    // Debounced version of updateMap
    const debouncedUpdateMap = debounce((category) => {
        updateMap(category);
    }, 250);

    // Initialize the application
    document.addEventListener('DOMContentLoaded', initializeApp);

    // Global functions that need to be accessible from HTML
    window.toggleRanking = toggleRanking;
    window.clearSelection = clearSelection;
    window.toggleDrawMode = toggleDrawMode;
    window.toggleDarkMode = toggleDarkMode;
    window.toggleSearch = toggleSearch;
    window.searchLocation = searchLocation;

    // Add this event listener to allow searching when the Enter key is pressed
    document.getElementById('searchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchLocation();
        }
    });

    </script>
</body>
</html>