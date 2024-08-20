// mapModule.js
import { state, updateState, isWithinFilters } from './stateModule.js';
import { toggleCellSelection } from './interactionModule.js';

const CELL_RENDER_BATCH_SIZE = 500;

export function renderCells() {
    if (!state.map || !state.gridLayer) return;
    state.gridLayer.clearLayers();
    const mapBounds = state.map.getBounds();
    
    const sortedCells = Array.from(state.allCells.values()).sort((a, b) => {
        if (!a.scores || !b.scores) return 0;
        const aValue = getTopSolutionValue(a.scores);
        const bValue = getTopSolutionValue(b.scores);
        return state.isAscending ? aValue - bValue : bValue - aValue;
    });

    sortedCells.forEach(cell => renderCell(cell, mapBounds));
}

export function initMap() {
    const map = L.map('map', {
        maxZoom: 20,
        minZoom: 19,
        renderer: L.canvas({ pane: 'overlayPane' }),
        tap: true,
        touchZoom: true,
        dragging: true,
        zoomControl: false
    }).setView([51.454514, -2.587910], 19);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 20,
        minZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenstreetMap</a> contributors',
        className: 'map-tiles'
    }).addTo(map);

    const gridLayer = L.layerGroup().addTo(map);

    map.on('moveend', () => debouncedUpdateGrid(map));
    map.on('zoomend', () => debouncedUpdateGrid(map));
    map.on('click', handleMapClick);

    return { map, gridLayer };
}

export function updateGrid(map) {
    console.log('Updating grid');
    if (!map) {
        console.error('Map not provided to updateGrid');
        return;
    }
    const bounds = map.getBounds();
    
    const cellSizeMeters = state.CELL_SIZE;
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
            if (state.allCells.has(cellKey)) {
                newCells.set(cellKey, state.allCells.get(cellKey));
            } else {
                newCells.set(cellKey, { key: cellKey, bounds: cellBounds, scores: null });
            }
        }
    }

    state.selectedCellKeys.forEach(key => {
        if (!newCells.has(key) && state.allCells.has(key)) {
            newCells.set(key, state.allCells.get(key));
        }
    });

    updateState({ allCells: newCells, mapNeedsUpdate: true });
    console.log('Grid updated, cells rendered');
    renderCellsBatched();
    updateSelectionRectangle();
}

function renderCellsBatched() {
    if (!state.map || !state.gridLayer) return;
    state.gridLayer.clearLayers();
    const mapBounds = state.map.getBounds();
    
    const sortedCells = Array.from(state.allCells.values()).sort((a, b) => {
        if (!a.scores || !b.scores) return 0;
        const aValue = getTopSolutionValue(a.scores);
        const bValue = getTopSolutionValue(b.scores);
        return state.isAscending ? aValue - bValue : bValue - aValue;
    });

    let batchCount = 0;
    const totalCells = sortedCells.length;

    function renderBatch() {
        const start = batchCount * CELL_RENDER_BATCH_SIZE;
        const end = Math.min(start + CELL_RENDER_BATCH_SIZE, totalCells);

        for (let i = start; i < end; i++) {
            renderCell(sortedCells[i], mapBounds);
        }

        batchCount++;

        if (batchCount * CELL_RENDER_BATCH_SIZE < totalCells) {
        }
    }

    renderBatch();
}

function renderCell(cell, mapBounds) {
    const { key, bounds, scores } = cell;
    const cellBounds = L.latLngBounds(bounds);
    const isVisible = mapBounds.intersects(cellBounds);
    const isSelected = state.selectedCellKeys.has(key);

    if (isVisible || isSelected) {
        let fillColor = "rgba(200,200,200,0.5)";
        let fillOpacity = 0.5;

        if (scores) {
            let validSolutions = Object.entries(scores)
                .filter(([sol, score]) => score.isSuitable && isWithinFilters(sol, score) && state.selectedSolutions[sol] !== false);

            if (validSolutions.length > 0) {
                validSolutions.sort((a, b) => {
                    const aValue = state.currentSortColumn === 'impact' ? a[1].impact : a[1].cost;
                    const bValue = state.currentSortColumn === 'impact' ? b[1].impact : b[1].cost;
                    return state.isAscending ? aValue - bValue : bValue - aValue;
                });

                const selectedSolution = validSolutions[0];
                fillColor = state.colorScale(selectedSolution[0]);
                fillOpacity = 0.7;
            }
        }

        if (isSelected) {
            fillOpacity = 0.9;
        }

        const rectangle = L.rectangle(cellBounds, {
            color: isSelected ? 'red' : 'transparent',
            weight: isSelected ? 2 : 1,
            fillColor: fillColor,
            fillOpacity: fillOpacity
        }).addTo(state.gridLayer);

        rectangle.on('click', function() {
            if (!state.isDrawMode) {
                toggleCellSelection(key);
            }
        });
    }
}

export function renderSelectedCells() {
    if (!state.map || !state.gridLayer) return;
    
    state.selectedCellKeys.forEach(key => {
        const cell = state.allCells.get(key);
        if (cell) {
            renderCell(cell, state.map.getBounds());
        }
    });
}

export function highlightSolutionCells(solution) {
    if (!state.map || !state.gridLayer) return;
    state.gridLayer.clearLayers();
    const mapBounds = state.map.getBounds();

    state.allCells.forEach(cell => {
        const { key, bounds, scores } = cell;
        const cellBounds = L.latLngBounds(bounds);
        const isVisible = mapBounds.intersects(cellBounds);
        const isSelected = state.selectedCellKeys.has(key);

        if (isVisible || isSelected) {
            let fillColor = "rgba(200,200,200,0.5)";
            let fillOpacity = 0.5;

            if (scores && scores[solution] && scores[solution].isSuitable) {
                fillColor = state.colorScale(solution);
                fillOpacity = 0.7;
            }

            if (isSelected) {
                fillOpacity = 0.9;
            }

            L.rectangle(cellBounds, {
                color: isSelected ? 'red' : 'transparent',
                weight: isSelected ? 2 : 1,
                fillColor: fillColor,
                fillOpacity: fillOpacity
            }).addTo(state.gridLayer);
        }
    });
}

export function clearHighlightedCells() {
    renderCells();
}

export function updateSelectionRectangle() {
    if (!state.map) return;
    
    const bounds = state.map.getBounds();
    const rectangle = L.rectangle(bounds, {
        color: "red",
        weight: 2,
        fill: false,
        dashArray: '5, 5',
        interactive: false
    });
    
    if (state.selectionRectangle) {
        state.map.removeLayer(state.selectionRectangle);
    }
    
    state.selectionRectangle = rectangle;
    rectangle.addTo(state.map);
}

function handleMapClick(e) {
    if (!state.isDrawMode) {
        const clickedPoint = e.latlng;
        const cellKey = getCellKeyFromLatLng(clickedPoint.lat, clickedPoint.lng);
        if (cellKey) {
            toggleCellSelection(cellKey);
        }
    }
}

function getCellKeyFromLatLng(lat, lng) {
    const cellLat = Math.floor(lat / (state.CELL_SIZE / 111111)) * (state.CELL_SIZE / 111111);
    const cellLng = Math.floor(lng / (state.CELL_SIZE / (111111 * Math.cos(lat * Math.PI / 180)))) * (state.CELL_SIZE / (111111 * Math.cos(lat * Math.PI / 180)));
    return `${cellLat.toFixed(6)},${cellLng.toFixed(6)}`;
}

function getTopSolutionValue(scores) {
    const validSolutions = Object.entries(scores)
        .filter(([sol, score]) => score.isSuitable && isWithinFilters(sol, score) && state.selectedSolutions[sol] !== false);

    if (validSolutions.length === 0) return 0;

    validSolutions.sort((a, b) => {
        const aValue = state.currentSortColumn === 'impact' ? a[1].impact : a[1].cost;
        const bValue = state.currentSortColumn === 'impact' ? b[1].impact : b[1].cost;
        return state.isAscending ? aValue - bValue : bValue - aValue;
    });

    return state.currentSortColumn === 'impact' ? validSolutions[0][1].impact : validSolutions[0][1].cost;
}

const debouncedUpdateGrid = debounce((map) => {
    updateGrid(map);
    updateMap(state.currentCategory);
}, 250);

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

export { debouncedUpdateGrid };