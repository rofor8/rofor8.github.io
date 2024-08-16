// interactionModule.js
import { state, updateState } from './stateModule.js';
import { updateSliderRanges } from './sliderModule.js';
import { updateSolutionTable } from './uiModule.js';

export function toggleCellSelection(key) {
    const newSelectedCellKeys = new Set(state.selectedCellKeys);
    if (newSelectedCellKeys.has(key)) {
        newSelectedCellKeys.delete(key);
    } else {
        newSelectedCellKeys.add(key);
    }
    updateState({ selectedCellKeys: newSelectedCellKeys, mapNeedsUpdate: true });
    if (state.callUpdateScores) {
        state.callUpdateScores();
    } else {
        console.warn('callUpdateScores is not set');
    }
    updateSliderRanges();
    updateSolutionTable();
}

export function clearSelection() {
    updateState({ selectedCellKeys: new Set(), mapNeedsUpdate: true });
    if (state.drawLayer) {
        state.map.removeLayer(state.drawLayer);
        updateState({ drawLayer: null });
    }
    if (state.callUpdateScores) {
        state.callUpdateScores();
    } else {
        console.warn('callUpdateScores is not set');
    }
}

export function toggleDrawMode() {
    const newIsDrawMode = !state.isDrawMode;
    updateState({ isDrawMode: newIsDrawMode });
    const drawToggle = document.getElementById('drawToggle');
    drawToggle.classList.toggle('active');

    if (newIsDrawMode) {
        state.map.dragging.disable();
        state.map.touchZoom.disable();
        state.map.doubleClickZoom.disable();
        state.map.scrollWheelZoom.disable();
        state.map.boxZoom.disable();
        state.map.keyboard.disable();

        state.map.getContainer().addEventListener('mousedown', handleDrawStart);
        state.map.getContainer().addEventListener('mousemove', handleDrawMove);
        state.map.getContainer().addEventListener('mouseup', handleDrawEnd);
        state.map.getContainer().addEventListener('touchstart', handleDrawStart);
        state.map.getContainer().addEventListener('touchmove', handleDrawMove);
        state.map.getContainer().addEventListener('touchend', handleDrawEnd);
    } else {
        state.map.dragging.enable();
        state.map.touchZoom.enable();
        state.map.doubleClickZoom.enable();
        state.map.scrollWheelZoom.enable();
        state.map.boxZoom.enable();
        state.map.keyboard.enable();

        state.map.getContainer().removeEventListener('mousedown', handleDrawStart);
        state.map.getContainer().removeEventListener('mousemove', handleDrawMove);
        state.map.getContainer().removeEventListener('mouseup', handleDrawEnd);
        state.map.getContainer().removeEventListener('touchstart', handleDrawStart);
        state.map.getContainer().removeEventListener('touchmove', handleDrawMove);
        state.map.getContainer().removeEventListener('touchend', handleDrawEnd);

        if (state.drawLayer) {
            state.map.removeLayer(state.drawLayer);
            updateState({ drawLayer: null });
        }
    }
}

export function handleDrawStart(e) {
    if (!state.isDrawMode) return;
    e.preventDefault();
    updateState({ drawStartTime: new Date().getTime(), drawingPath: [] });
    const point = e.touches ? e.touches[0] : e;
    const latlng = state.map.containerPointToLatLng(L.point(point.clientX, point.clientY));
    state.drawingPath.push(latlng);

    if (state.drawLayer) {
        state.map.removeLayer(state.drawLayer);
    }
    const newDrawLayer = L.polyline(state.drawingPath, { color: 'red' }).addTo(state.map);
    updateState({ drawLayer: newDrawLayer });
}

export function handleDrawMove(e) {
    if (!state.isDrawMode || !state.drawLayer) return;
    e.preventDefault();
    const point = e.touches ? e.touches[0] : e;
    const latlng = state.map.containerPointToLatLng(L.point(point.clientX, point.clientY));
    state.drawingPath.push(latlng);
    state.drawLayer.setLatLngs(state.drawingPath);
}

export function handleDrawEnd(e) {
    if (!state.isDrawMode) return;
    e.preventDefault();
    const drawEndTime = new Date().getTime();
    const drawDuration = drawEndTime - state.drawStartTime;

    if (drawDuration < 500 && state.drawingPath.length < 3) {
        state.map.removeLayer(state.drawLayer);
        updateState({ drawLayer: null, drawingPath: [] });
        return;
    }

    state.drawingPath.push(state.drawingPath[0]);
    if (state.drawLayer) {
        state.drawLayer.setLatLngs(state.drawingPath);
        selectCellsInShape(state.drawLayer);
    }
    toggleDrawMode();
}

export function selectCellsInShape(shape) {
    if (!state.gridLayer) return;

    const bounds = L.latLngBounds(state.drawingPath);

    state.allCells.forEach((cell, key) => {
        const cellCenter = L.latLngBounds(cell.bounds).getCenter();
        if (bounds.contains(cellCenter) && pointInPolygon(cellCenter, state.drawingPath)) {
            state.selectedCellKeys.add(key);
        }
    });

    updateState({ mapNeedsUpdate: true });
    if (state.callUpdateScores) {
        state.callUpdateScores();
    } else {
        console.warn('callUpdateScores is not set');
    }
}

export function pointInPolygon(point, polygon) {
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

export function searchLocation() {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput.value;

    if (query) {
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
            .then(response => response.json())
            .then(data => {
                if (data && data.length > 0) {
                    const { lat, lon } = data[0];
                    state.map.setView([lat, lon], 15);
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

export function toggleRanking() {
    const newRanking = state.currentRanking === 'impact' ? 'cost' : 'impact';
    updateState({ currentRanking: newRanking });
    const toggleButton = document.getElementById('rankingToggle');
    toggleButton.textContent = `Ranked by: ${newRanking.charAt(0).toUpperCase() + newRanking.slice(1)}`;
    toggleButton.classList.toggle('active');

    updateState({ mapNeedsUpdate: true });
    if (state.callUpdateScores) {
        state.callUpdateScores();
    } else {
        console.warn('callUpdateScores is not set');
    }
}