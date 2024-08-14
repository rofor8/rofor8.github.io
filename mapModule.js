// mapModule.js
import { state, updateState, updateSelectedCellKeys, updateMap } from './stateModule.js';
import { toggleCellSelection } from './interactionModule.js';

export function initMap() {
    const map = L.map('map', {
        renderer: L.canvas(),
        tap: true,
        touchZoom: true,
        dragging: true,
        zoomControl: false
    }).setView([51.454514, -2.587910], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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

    const newSelectedCellKeys = new Set([...state.selectedCellKeys].filter(key => 
        newCells.has(key) || state.allCells.has(key)
    ));
    updateSelectedCellKeys(newSelectedCellKeys);

    updateState({ allCells: newCells, mapNeedsUpdate: true });
    console.log('Grid updated, cells rendered');
    renderCells();
}

export function renderCells() {
    if (!state.map || !state.gridLayer) return;
    state.gridLayer.clearLayers();
    const mapBounds = state.map.getBounds();
    
    const displayedSolutions = new Set();

    state.allCells.forEach(({ key, bounds, scores }) => {
        const cellBounds = L.latLngBounds(bounds);
        if (!mapBounds.intersects(cellBounds)) return;

        let fillColor = "rgba(200,200,200,0.5)";
        let fillOpacity = 0.5;

        if (scores) {
            const validSolutions = Object.entries(scores)
                .filter(([sol, scores]) => {
                    return state.selectedSolutions[sol] !== false && 
                           scores.impact >= state.impactFilter &&
                           scores.cost <= state.costFilter &&
                           (scores.impact > 0 || scores.cost > 0);
                });

            if (validSolutions.length > 0) {
                validSolutions.sort((a, b) => {
                    const aValue = state.currentSortColumn === 'impact' ? a[1].impact : a[1].cost;
                    const bValue = state.currentSortColumn === 'impact' ? b[1].impact : b[1].cost;
                    if (state.currentSortColumn === 'cost') {
                        return state.isAscending ? aValue - bValue : bValue - aValue;
                    } else {
                        return state.isAscending ? bValue - aValue : aValue - bValue;
                    }
                });

                const selectedSolution = validSolutions[0];
                fillColor = state.colorScale(selectedSolution[0]);
                fillOpacity = 0.7;

                displayedSolutions.add(selectedSolution[0]);
            }
        }

        const isSelected = state.selectedCellKeys.has(key);

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
    });

    updateState({ displayedSolutions: Array.from(displayedSolutions) });
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

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

const debouncedUpdateGrid = debounce((map) => {
    updateGrid(map);
    updateMap(state.currentCategory);
}, 500);

export { debouncedUpdateGrid };