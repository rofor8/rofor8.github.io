// uiModule.js
import { state, updateState, updateMap, updateTotals, isWithinFilters, getFilterRanges } from './stateModule.js';
import { renderCells, updateSelectionRectangle, renderSelectedCells } from './mapModule.js';

let isUpdating = false;

function setupUI() {
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
            updateSolutionTable();
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

    // Call updateSolutionTable after a short delay to ensure the table is in the DOM
    setTimeout(updateSolutionTable, 0);
}

function updateSolutionTable() {
    if (isUpdating) return;
    isUpdating = true;

    const table = document.getElementById("solutionsTable");
    if (!table) {
        console.warn("Solutions table not found, retrying...");
        setTimeout(updateSolutionTable, 100);
        isUpdating = false;
        return;
    }

    // Calculate totals for selected cells
    const selectedTotals = calculateSelectedTotals();

    const rows = table.tBodies[0].rows;
    const { maxImpact, maxCost } = calculateMaxValues(selectedTotals);

    // Collect row data
    const rowData = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const solution = row.cells[1].textContent;
        const impact = selectedTotals[solution]?.impact || 0;
        const cost = selectedTotals[solution]?.cost || 0;

        rowData.push({ row, solution, impact, cost });
    }

    // Sort row data
    sortRowData(rowData);

    // Update cells and bar graphs, and reorder rows
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
            updateSolutionTable();
            renderCells();
        });
        checkboxCell.appendChild(checkbox);

        const impactCell = row.cells[2];
        const costCell = row.cells[3];

        const impactBar = impactCell.querySelector('.impact-bar');
        const costBar = costCell.querySelector('.cost-bar');
        const impactValue = impactCell.querySelector('.value');
        const costValue = costCell.querySelector('.value');

        // Clear bar graphs when values are zero
        if (impact === 0) {
            impactBar.style.width = '0%';
            impactBar.style.backgroundColor = 'transparent';
        } else {
            impactBar.style.width = `${(impact / maxImpact) * 100}%`;
            impactBar.style.backgroundColor = state.colorScale(solution);
        }

        if (cost === 0) {
            costBar.style.width = '0%';
            costBar.style.backgroundColor = 'transparent';
        } else {
            costBar.style.width = `${(cost / maxCost) * 100}%`;
            costBar.style.backgroundColor = state.colorScale(solution);
        }

        impactValue.textContent = impact.toFixed(2);
        costValue.textContent = cost.toFixed(2);

        // Append the row to tbody
        tbody.appendChild(row);
    });

    // Highlight the current sorting column
    const headers = table.tHead.rows[0].cells;
    for (let i = 2; i < headers.length; i++) {
        headers[i].classList.toggle('sorted', headers[i].className.includes(state.currentSortColumn));
        headers[i].classList.toggle('ascending', state.isAscending);
    }

    isUpdating = false;
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
        const ranges = getFilterRanges();

        noUiSlider.create(impactSlider, {
            start: [ranges.impact[0], ranges.impact[1]],
            connect: true,
            range: {
                'min': ranges.impact[0],
                'max': ranges.impact[1]
            },
            step: 0.01
        });

        noUiSlider.create(costSlider, {
            start: [ranges.cost[0], ranges.cost[1]],
            connect: true,
            range: {
                'min': ranges.cost[0],
                'max': ranges.cost[1]
            },
            step: 0.01
        });

        impactSlider.noUiSlider.on('update', function (values, handle) {
            if (isUpdating) return;
            isUpdating = true;
            const impactValue = document.getElementById("impactValue");
            if (impactValue) {
                impactValue.textContent = `${parseFloat(values[0]).toFixed(2)} - ${parseFloat(values[1]).toFixed(2)}`;
            }
            updateState({ impactFilter: values.map(Number) });
            renderCells();
            updateSolutionTable();
            isUpdating = false;
        });

        costSlider.noUiSlider.on('update', function (values, handle) {
            if (isUpdating) return;
            isUpdating = true;
            const costValue = document.getElementById("costValue");
            if (costValue) {
                costValue.textContent = `${parseFloat(values[0]).toFixed(2)} - ${parseFloat(values[1]).toFixed(2)}`;
            }
            updateState({ costFilter: values.map(Number) });
            renderCells();
            updateSolutionTable();
            isUpdating = false;
        });
    }
}

function updateSliderRanges() {
    const ranges = getFilterRanges();
    const impactSlider = document.getElementById("impactSlider");
    const costSlider = document.getElementById("costSlider");

    if (impactSlider && impactSlider.noUiSlider) {
        impactSlider.noUiSlider.updateOptions({
            range: {
                'min': ranges.impact[0],
                'max': ranges.impact[1]
            }
        });
        impactSlider.noUiSlider.set([ranges.impact[0], ranges.impact[1]]);
    }

    if (costSlider && costSlider.noUiSlider) {
        costSlider.noUiSlider.updateOptions({
            range: {
                'min': ranges.cost[0],
                'max': ranges.cost[1]
            }
        });
        costSlider.noUiSlider.set([ranges.cost[0], ranges.cost[1]]);
    }
}

function calculateSelectedTotals() {
    const totals = {};
    state.selectedCellKeys.forEach(key => {
        const cell = state.allCells.get(key);
        if (cell && cell.scores) {
            Object.entries(cell.scores).forEach(([solution, scores]) => {
                if (!totals[solution]) {
                    totals[solution] = { impact: 0, cost: 0 };
                }
                if (isWithinFilters(solution, cell.scores)) {
                    totals[solution].impact += scores.impact || 0;
                    totals[solution].cost += scores.cost || 0;
                }
            });
        }
    });
    return totals;
}

function calculateMaxValues(totals) {
    let maxImpact = 0;
    let maxCost = 0;
    Object.values(totals).forEach(({ impact, cost }) => {
        maxImpact = Math.max(maxImpact, impact);
        maxCost = Math.max(maxCost, cost);
    });
    return { maxImpact, maxCost };
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

function updateUIForCategory(challengeCategory) {
    updateSolutionTable();
    updateSliderRanges();
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
    renderCells();
}

// Export all necessary functions at the end of the file
export {
    setupUI,
    updateSolutionTable,
    updateUIForCategory,
    createButtons,
    updateCategoryDropdown,
    updateSliderRanges
};
