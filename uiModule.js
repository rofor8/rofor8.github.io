// uiModule.js
import { state, updateState, updateMap } from './stateModule.js';
import { renderCells } from './mapModule.js';

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
        checkbox.checked = true;
        checkbox.style.accentColor = state.colorScale(solution);
        checkbox.addEventListener("change", function() {
            updateState({ 
                selectedSolutions: {
                    ...state.selectedSolutions,
                    [solution]: this.checked
                }
            });
            updateMap(state.currentCategory);
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
            <input type="range" id="impactSlider" min="0" max="100" value="0">
            <span id="impactValue">0</span>
        </div>
        <div class="slider-container">
            <label for="costSlider">Cost Filter:</label>
            <input type="range" id="costSlider" min="0" max="100" value="100">
            <span id="costValue">100</span>
        </div>
    `;

    const impactSlider = document.getElementById("impactSlider");
    const costSlider = document.getElementById("costSlider");
    
    if (impactSlider) {
        impactSlider.addEventListener("input", function() {
            const impactValue = document.getElementById("impactValue");
            if (impactValue) {
                impactValue.textContent = this.value;
            }
            updateState({ impactFilter: parseFloat(this.value) });
            filterSolutionTable();
            renderCells();
        });
    }

    if (costSlider) {
        costSlider.addEventListener("input", function() {
            const costValue = document.getElementById("costValue");
            if (costValue) {
                costValue.textContent = this.value;
            }
            updateState({ costFilter: parseFloat(this.value) });
            filterSolutionTable();
            renderCells();
        });
    }

    updateSliderRanges();
}

function updateSliderRanges() {
    const impactSlider = document.getElementById("impactSlider");
    const costSlider = document.getElementById("costSlider");
    const impactValue = document.getElementById("impactValue");
    const costValue = document.getElementById("costValue");

    if (!impactSlider || !costSlider || !impactValue || !costValue) {
        console.error("Slider elements not found");
        return;
    }

    const { maxImpact, maxCost } = calculateMaxValues();

    impactSlider.max = maxImpact > 0 ? maxImpact : 100;
    costSlider.max = maxCost > 0 ? maxCost : 100;

    // Set impact slider to its current value or 0 if it exceeds the new max
    impactSlider.value = Math.min(state.impactFilter, impactSlider.max);
    impactValue.textContent = impactSlider.value;

    // Set cost slider to its maximum value
    costSlider.value = costSlider.max;
    costValue.textContent = costSlider.max;

    // Update state with the new values
    updateState({
        impactFilter: parseFloat(impactSlider.value),
        costFilter: parseFloat(costSlider.max)
    });
}

function calculateMaxValues() {
    let maxImpact = 0;
    let maxCost = 0;

    Object.keys(state.solutionCriteria).forEach(solution => {
        const impact = calculateTotalImpact(solution);
        const cost = calculateTotalCost(solution);
        maxImpact = Math.max(maxImpact, impact);
        maxCost = Math.max(maxCost, cost);
    });

    return { maxImpact, maxCost };
}

export function updateSolutionTable() {
    const table = document.getElementById("solutionsTable");
    if (!table) {
        console.error("Solutions table not found");
        return;
    }

    const rows = table.tBodies[0].rows;
    let maxImpact = 0;
    let maxCost = 0;

    // First pass: calculate max values and collect row data
    const rowData = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const solution = row.cells[1].textContent;
        const impact = calculateTotalImpact(solution);
        const cost = calculateTotalCost(solution);
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

        // Highlight the row if the solution is displayed in the grid
        row.classList.toggle('highlighted', state.displayedSolutions.includes(solution));

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
    renderCells(); // Re-render cells to update colors based on new sorting
}

function calculateTotalImpact(solution) {
    return Array.from(state.selectedCellKeys).reduce((total, key) => {
        const cell = state.allCells.get(key);
        if (cell && cell.scores && cell.scores[solution]) {
            return total + (cell.scores[solution].impact || 0);
        }
        return total;
    }, 0);
}

function calculateTotalCost(solution) {
    return Array.from(state.selectedCellKeys).reduce((total, key) => {
        const cell = state.allCells.get(key);
        if (cell && cell.scores && cell.scores[solution]) {
            return total + (cell.scores[solution].cost || 0);
        }
        return total;
    }, 0);
}

function toggleSort(column) {
    if (state.currentSortColumn === column) {
        updateState({ isAscending: !state.isAscending });
    } else {
        updateState({ currentSortColumn: column, isAscending: column === 'cost' });
    }
    updateSolutionTable();
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

    const impactThreshold = state.impactFilter;
    const costThreshold = state.costFilter;

    const rows = table.tBodies[0].rows;
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const impact = parseFloat(row.cells[2].querySelector('.value').textContent);
        const cost = parseFloat(row.cells[3].querySelector('.value').textContent);
        row.style.display = (impact >= impactThreshold && cost <= costThreshold && (impact > 0 || cost > 0)) ? "" : "none";
    }
}

export function updateUIForCategory(challengeCategory) {
    updateSolutionTable();
}

export function createButtons(containerId, dataArray, buttonClass) {
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

export function updateCategoryDropdown(category) {
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