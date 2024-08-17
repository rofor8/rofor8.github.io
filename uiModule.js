// uiModule.js
import { state, updateState, updateMap, updateTotals, isWithinFilters, getFilterRanges } from './stateModule.js';
import { renderCells, updateSelectionRectangle, renderSelectedCells, highlightSolutionCells } from './mapModule.js';

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
        row.setAttribute('data-solution', solution);

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

        // Add hover effect
        row.addEventListener('mouseenter', () => highlightSolutionCells(solution));
        row.addEventListener('mouseleave', () => renderCells());
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

    const rows = table.tBodies[0].rows;
    const selectedCellCount = state.selectedCellKeys.size;

    // Calculate totals
    const solutionTotals = {};
    Object.keys(state.solutionCriteria).forEach(solution => {
        const impactWeight = state.challengeCategories[state.currentCategory][solution] || 0;
        const cost = state.solutionCosts[solution] || 0;
        solutionTotals[solution] = {
            impact: impactWeight * selectedCellCount,
            cost: cost * selectedCellCount
        };
    });

    // Calculate max values for scaling
    const maxImpact = Math.max(...Object.values(solutionTotals).map(s => s.impact));
    const maxCost = Math.max(...Object.values(solutionTotals).map(s => s.cost));

    // Collect row data
    const rowData = Object.entries(solutionTotals).map(([solution, totals]) => ({
        solution,
        impact: totals.impact,
        cost: totals.cost
    }));

    // Sort row data
    sortRowData(rowData);

    // Clear existing rows
    while (table.tBodies[0].firstChild) {
        table.tBodies[0].removeChild(table.tBodies[0].firstChild);
    }

    // Add sorted rows
    rowData.forEach(({ solution, impact, cost }) => {
        const row = table.tBodies[0].insertRow();
        row.setAttribute('data-solution', solution);

        // Checkbox cell
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
        impactBar.style.width = `${(impact / maxImpact) * 100}%`;
        impactBar.style.backgroundColor = state.colorScale(solution);
        impactCell.appendChild(impactBar);
        const impactValue = document.createElement("span");
        impactValue.className = "value";
        impactValue.textContent = impact.toFixed(2);
        impactCell.appendChild(impactValue);

        // Cost cell with bar graph
        const costCell = row.insertCell();
        costCell.className = "cost";
        const costBar = document.createElement("div");
        costBar.className = "bar-graph cost-bar";
        costBar.style.width = `${(cost / maxCost) * 100}%`;
        costBar.style.backgroundColor = state.colorScale(solution);
        costCell.appendChild(costBar);
        const costValue = document.createElement("span");
        costValue.className = "value";
        costValue.textContent = cost.toFixed(2);
        costCell.appendChild(costValue);

        row.style.opacity = state.selectedSolutions[solution] !== false ? '1' : '0.5';

        // Add hover effect
        row.addEventListener('mouseenter', () => highlightSolutionCells(solution));
        row.addEventListener('mouseleave', () => renderCells());
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

function sortRowData(rowData) {
    rowData.sort((a, b) => {
        const aValue = state.currentSortColumn === 'impact' ? a.impact : a.cost;
        const bValue = state.currentSortColumn === 'impact' ? b.impact : b.cost;
        return state.isAscending ? aValue - bValue : bValue - aValue;
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
        updateState({ currentSortColumn: column, isAscending: false });
    }
    updateSolutionTable();
    renderCells();
}

// Export all necessary functions
export {
    setupUI,
    updateSolutionTable,
    updateUIForCategory,
    createButtons,
    updateCategoryDropdown,
    updateSliderRanges
};