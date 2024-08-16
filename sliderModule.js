// sliderModule.js
import { state, updateState } from './stateModule.js';

export function updateSliderRanges() {
    if (state.isUpdating) return;
    state.isUpdating = true;

    const impactSlider = document.getElementById("impactSlider");
    const costSlider = document.getElementById("costSlider");

    if (!impactSlider || !costSlider) {
        console.warn("Slider elements not found, retrying...");
        setTimeout(updateSliderRanges, 100); // Retry after a short delay
        state.isUpdating = false;
        return;
    }

    const { minImpact, maxImpact, minCost, maxCost } = calculateRangesForSelection();

    // Update impact slider
    updateSliderOptions(impactSlider, minImpact, maxImpact, state.impactFilter);

    // Update cost slider
    updateSliderOptions(costSlider, minCost, maxCost, state.costFilter);

    // Update state with the new values
    updateState({
        impactFilter: impactSlider.noUiSlider.get().map(Number),
        costFilter: costSlider.noUiSlider.get().map(Number)
    });

    state.isUpdating = false;
}

function updateSliderOptions(slider, minValue, maxValue, currentValues) {
    const epsilon = 0.01; // Small value to avoid equal min and max
    const newMin = minValue;
    const newMax = Math.max(maxValue, minValue + epsilon);
    
    slider.noUiSlider.updateOptions({
        range: {
            'min': newMin,
            'max': newMax
        }
    }, true); // The 'true' here prevents the 'update' event from firing

    // Set sliders to their current values, but ensure they don't exceed the new range
    slider.noUiSlider.set([
        Math.max(currentValues[0], newMin),
        Math.min(currentValues[1], newMax)
    ]);
}

function calculateRangesForSelection() {
    let minImpact = Infinity;
    let maxImpact = -Infinity;
    let minCost = Infinity;
    let maxCost = -Infinity;

    state.selectedCellKeys.forEach(key => {
        const cell = state.allCells.get(key);
        if (cell && cell.scores) {
            Object.values(cell.scores).forEach(score => {
                if (score.impact !== undefined) {
                    minImpact = Math.min(minImpact, score.impact);
                    maxImpact = Math.max(maxImpact, score.impact);
                }
                if (score.cost !== undefined) {
                    minCost = Math.min(minCost, score.cost);
                    maxCost = Math.max(maxCost, score.cost);
                }
            });
        }
    });

    // If no cells are selected, use the overall ranges
    if (state.selectedCellKeys.size === 0) {
        Object.values(state.totalImpacts).forEach(impact => {
            minImpact = Math.min(minImpact, impact);
            maxImpact = Math.max(maxImpact, impact);
        });
        Object.values(state.totalCosts).forEach(cost => {
            minCost = Math.min(minCost, cost);
            maxCost = Math.max(maxCost, cost);
        });
    }

    // Ensure we always have valid ranges
    if (minImpact === Infinity) minImpact = 0;
    if (maxImpact === -Infinity) maxImpact = 100;
    if (minCost === Infinity) minCost = 0;
    if (maxCost === -Infinity) maxCost = 100;

    return { minImpact, maxImpact, minCost, maxCost };
}