// uiModule.js
import { state, updateState, updateMap, updateTotals } from './stateModule.js';
import { renderCells, updateSelectionRectangle } from './mapModule.js';

export function setupUI() {
    if (state.challengeCategories && Object.keys(state.challengeCategories).length > 0) {
        createButtons("categoryButtons", Object.keys(state.challengeCategories), "category-button");
    } else {
        console.warn('Challenge categories not loaded yet');
    }

    setupDropdown();
    setupSolutionTable();
    setupFilterSliders();
    updateCategoryDropdown(state.currentCategory);
}

function setupDropdown() {
    const dropdownBtn = document.querySelector('.dropbtn');
    if (dropdownBtn) {
        dropdownBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            const categoryButtons = document.getElementById('categoryButtons');
            if (categoryButtons) {
                categoryButtons.classList.toggle('show');
            }
        });
    }

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
}

function setupSolutionTable() {
    const solutionsContainer = document.getElementById("solutionsContainer");
    if (!solutionsContainer) {
        console.error("Solutions container not found");
        return;
    }

    const table = document.createElement("table");
    table.id = "solutionsTable";
    table.className = "solutions-table";

    const thead = table.createTHead();
    const tbody = table.createTBody();

    // Add table header
    const headerRow = thead.insertRow();
    ["", "Solution", "Impact", "Cost"].forEach((text, index) => {
        const th = document.createElement("th");
        th.textContent = text;
        th.className = text.toLowerCase();
        if (index > 1) {
            th.addEventListener("click", () => toggleSort(text.toLowerCase()));
        }
        headerRow.appendChild(th);
    });

    // Add table rows
    Object.keys(state.solutionCriteria).forEach(solution => {
        const row = tbody.insertRow();

        // Checkbox cell with color indicator
        const checkboxCell = row.insertCell();
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = state.selectedSolutions[solution] !== false;
        checkbox.style.accentColor = state.colorScale(solution);
        checkbox.addEventListener("change", function() {
            updateState({
                selectedSolutions: {
                    ...state.selectedSolutions,
                    [solution]: this.checked
                }
            });
            updateMap(state.currentCategory);
            updateSliderRanges();
            filterSolutionTable();
            renderCells();
        });
        checkboxCell.appendChild(checkbox);

        // Solution name cell
        const nameCell = row.insertCell();
        nameCell.textContent = solution;

        // Impact cell with bar graph
        const impactCell = row.insertCell();
        impactCell.className = "impact";
        const impactBar = document.createElement("div");
        impactBar.className = "bar-graph impact-bar";
        impactCell.appendChild(impactBar);
        const impactValue = document.createElement("span");
        impactValue.className = "value";
        impactCell.appendChild(impactValue);

        // Cost cell with bar graph
        const costCell = row.insertCell();
        costCell.className = "cost";
        const costBar = document.createElement("div");
        costBar.className = "bar-graph cost-bar";
        costCell.appendChild(costBar);
        const costValue = document.createElement("span");
        costValue.className = "value";
        costCell.appendChild(costValue);
    });

    solutionsContainer.innerHTML = '';
    solutionsContainer.appendChild(table);

    updateSolutionTable();
}

function setupFilterSliders() {
    const sliderContainer = document.getElementById("filterSliders");
    if (!sliderContainer) {
        console.error("Filter sliders container not found");
        return;
    }

    sliderContainer.innerHTML = `
        <div class="slider-container">
            <label for="impactSlider">Impact Filter:</label>
            <div id="impactSlider"></div>
            <span id="impactValue"></span>
        </div>
        <div class="slider-container">
            <label for="costSlider">Cost Filter:</label>
            <div id="costSlider"></div>
            <span id="costValue"></span>
        </div>
    `;

    const impactSlider = document.getElementById("impactSlider");
    const costSlider = document.getElementById("costSlider");

    if (impactSlider && costSlider) {
        noUiSlider.create(impactSlider, {
            start: [0, 100],
            connect: true,
            range: {
                'min': 0,
                'max': 100
            }
        });

        noUiSlider.create(costSlider, {
            start: [0, 100],
            connect: true,
            range: {
                'min': 0,
                'max': 100
            }
        });

        impactSlider.noUiSlider.on('update', function (values, handle) {
            const impactValue = document.getElementById("impactValue");
            if (impactValue) {
                impactValue.textContent = `${values[0]} - ${values[1]}`;
            }
            updateState({ impactFilter: values.map(Number) });
            filterSolutionTable();
            renderCells();
        });

        costSlider.noUiSlider.on('update', function (values, handle) {
            const costValue = document.getElementById("costValue");
            if (costValue) {
                costValue.textContent = `${values[0]} - ${values[1]}`;
            }
            updateState({ costFilter: values.map(Number) });
            filterSolutionTable();
            renderCells();
        });
    }

    updateSliderRanges();
}

function updateSliderRanges() {
    const impactSlider = document.getElementById("impactSlider");
    const costSlider = document.getElementById("costSlider");

    if (!impactSlider || !costSlider) {
        console.error("Slider elements not found");
        return;
    }

    const { maxImpact, maxCost } = calculateMaxValues();

    // Get current slider values
    const currentImpactValues = impactSlider.noUiSlider.get().map(Number);
    const currentCostValues = costSlider.noUiSlider.get().map(Number);

    // Update impact slider
    updateSliderOptions(impactSlider, maxImpact, currentImpactValues);

    // Update cost slider
    updateSliderOptions(costSlider, maxCost, currentCostValues);

    // Update state with the new values
    updateState({
        impactFilter: impactSlider.noUiSlider.get().map(Number),
        costFilter: costSlider.noUiSlider.get().map(Number)
    });
}

function updateSliderOptions(slider, maxValue, currentValues) {
    const epsilon = 0.0001; // Small value to avoid equal min and max
    const newMax = Math.max(maxValue, currentValues[1], epsilon);
    
    slider.noUiSlider.updateOptions({
        range: {
            'min': 0,
            'max': newMax
        }
    });

    // Set sliders to their current values, but ensure they don't exceed the new max
    slider.noUiSlider.set([
        Math.min(currentValues[0], newMax),
        Math.min(currentValues[1], newMax)
    ]);
}

function calculateMaxValues() {
    let maxImpact = 0;
    let maxCost = 0;

    Object.keys(state.solutionCriteria).forEach(solution => {
        maxImpact = Math.max(maxImpact, state.totalImpacts[solution] || 0);
        maxCost = Math.max(maxCost, state.totalCosts[solution] || 0);
    });

    return { maxImpact, maxCost };
}

export function updateSolutionTable() {
    const table = document.getElementById("solutionsTable");
    if (!table) {
        console.error("Solutions table not found");
        return;
    }

    updateTotals();

    const rows = table.tBodies[0].rows;
    let maxImpact = 0;
    let maxCost = 0;

    // First pass: calculate max values and collect row data
    const rowData = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const solution = row.cells[1].textContent;
        const impact = state.totalImpacts[solution] || 0;
        const cost = state.totalCosts[solution] || 0;
        maxImpact = Math.max(maxImpact, impact);
        maxCost = Math.max(maxCost, cost);
        rowData.push({ row, solution, impact, cost });
    }

    // Sort row data
    sortRowData(rowData);

    // Second pass: update cells and bar graphs, and reorder rows
    const tbody = table.tBodies[0];
    tbody.innerHTML = ''; // Clear existing rows
    rowData.forEach(({ row, solution, impact, cost }) => {
        // Recreate the checkbox and add event listener
        const checkboxCell = row.cells[0];
        checkboxCell.innerHTML = '';
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = state.selectedSolutions[solution] !== false;
        checkbox.style.accentColor = state.colorScale(solution);
        checkbox.addEventListener("change", function() {
            updateState({
                selectedSolutions: {
                    ...state.selectedSolutions,
                    [solution]: this.checked
                }
            });
            updateMap(state.currentCategory);
            updateSliderRanges();
            filterSolutionTable();
            renderCells();
        });
        checkboxCell.appendChild(checkbox);

        const impactCell = row.cells[2];
        const costCell = row.cells[3];

        const impactBar = impactCell.querySelector('.impact-bar');
        const costBar = costCell.querySelector('.cost-bar');
        const impactValue = impactCell.querySelector('.value');
        const costValue = costCell.querySelector('.value');

        impactBar.style.width = `${(impact / maxImpact) * 100}%`;
        costBar.style.width = `${(cost / maxCost) * 100}%`;
        impactValue.textContent = impact.toFixed(2);
        costValue.textContent = cost.toFixed(2);

        // Update bar colors
        impactBar.style.backgroundColor = state.colorScale(solution);
        costBar.style.backgroundColor = state.colorScale(solution);

        // Append the row to tbody
        tbody.appendChild(row);
    });

    // Highlight the current sorting column
    const headers = table.tHead.rows[0].cells;
    for (let i = 2; i < headers.length; i++) {
        headers[i].classList.toggle('sorted', headers[i].className.includes(state.currentSortColumn));
        headers[i].classList.toggle('ascending', state.isAscending);
    }

    updateSliderRanges();
    filterSolutionTable();
    renderCells();
    updateSelectionRectangle();
}

function sortRowData(rowData) {
    rowData.sort((a, b) => {
        const aValue = state.currentSortColumn === 'impact' ? a.impact : a.cost;
        const bValue = state.currentSortColumn === 'impact' ? b.impact : b.cost;
        if (state.currentSortColumn === 'cost') {
            return state.isAscending ? aValue - bValue : bValue - aValue;
        } else {
            return state.isAscending ? bValue - aValue : aValue - bValue;
        }
    });
}

function filterSolutionTable() {
    const table = document.getElementById("solutionsTable");

    if (!table) {
        console.error("Required elements for filtering not found");
        return;
    }

    const [impactMin, impactMax] = state.impactFilter;
    const [costMin, costMax] = state.costFilter;

    const rows = table.tBodies[0].rows;
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const solution = row.cells[1].textContent;
        const impact = state.totalImpacts[solution] || 0;
        const cost = state.totalCosts[solution] || 0;
        const isSelected = state.selectedSolutions[solution] !== false;

        const isWithinFilter = impact >= impactMin && impact <= impactMax &&
                               cost >= costMin && cost <= costMax &&
                               (impact > 0 || cost > 0);

        // Always show the row, but adjust opacity based on selection and filter status
        row.style.display = "";
        row.style.opacity = isSelected ? (isWithinFilter ? "1" : "0.5") : "0.3";

        // Adjust the checkbox state
        const checkbox = row.cells[0].querySelector('input[type="checkbox"]');
        if (checkbox) {
            checkbox.checked = isSelected;
        }
    }
}

export function updateUIForCategory(challengeCategory) {
    updateSolutionTable();
}

function createButtons(containerId, dataArray, buttonClass) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container with id ${containerId} not found`);
        return;
    }

    container.innerHTML = '';
    dataArray.forEach(d => {
        const button = document.createElement("button");
        button.className = buttonClass;
        button.textContent = d;
        button.addEventListener("click", function() {
            updateState({ currentCategory: d });
            updateCategoryDropdown(d);
            updateMap(d);
        });
        container.appendChild(button);
    });
}

function updateCategoryDropdown(category) {
    const dropBtn = document.querySelector("#categoryDropdown .dropbtn");
    if (dropBtn) {
        dropBtn.innerHTML = `<span class="dropdown-title">Optimised for: </span>${category}`;
    }
    document.querySelectorAll(".category-button").forEach(btn => {
        btn.classList.toggle('active', btn.textContent === category);
    });
    // Close the dropdown after selection
    const categoryButtons = document.getElementById('categoryButtons');
    if (categoryButtons) {
        categoryButtons.classList.remove('show');
    }
}

function toggleSort(column) {
    if (state.currentSortColumn === column) {
        updateState({ isAscending: !state.isAscending });
    } else {
        updateState({ currentSortColumn: column, isAscending: column === 'cost' });
    }
    updateSolutionTable();
}

export {
    setupUI,
    updateSolutionTable,
    filterSolutionTable,
    updateUIForCategory,
    createButtons,
    updateCategoryDropdown
};