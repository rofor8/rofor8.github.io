// uiModule.js
import { state, updateState, updateMap, updateTotals, isWithinFilters, getFilterRanges, storeSliderValues } from './stateModule.js';
import { updateGrid, updateSelectionRectangle, highlightSolutionCells } from './mapModule.js';

let isUpdating = false;
let updateSolutionTableTimeout = null;

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
            document.getElementById('categoryButtons').classList.toggle('show');
        });
    }

    window.addEventListener('click', function (e) {
        if (!e.target.matches('.dropbtn')) {
            document.getElementById('categoryButtons').classList.remove('show');
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

    const headerRow = thead.insertRow();
    ["", "Solution", "Impact", "Cost", "Count"].forEach((text, index) => {
        const th = document.createElement("th");
        th.textContent = text;
        th.className = text.toLowerCase();
        if (index > 1) {
            th.addEventListener("click", () => toggleSort(text.toLowerCase()));
        }
        headerRow.appendChild(th);
    });

    solutionsContainer.innerHTML = '';
    solutionsContainer.appendChild(table);

    setTimeout(updateSolutionTable, 0);
}

function updateSolutionTable() {
    if (isUpdating) return;
    isUpdating = true;

    if (updateSolutionTableTimeout) {
        clearTimeout(updateSolutionTableTimeout);
    }

    updateSolutionTableTimeout = setTimeout(() => {
        const table = document.getElementById("solutionsTable");
        if (!table) {
            console.warn("Solutions table not found, retrying...");
            updateSolutionTableTimeout = setTimeout(updateSolutionTable, 100);
            isUpdating = false;
            return;
        }

        const tbody = table.tBodies[0];
        const selectedCellCount = state.selectedCellKeys.size;

        const solutionTotals = calculateSolutionTotals();
        const { maxImpact, maxCost, maxCount } = getMaxValues(solutionTotals);

        const rowData = prepareRowData(solutionTotals);
        sortRowData(rowData);

        const fragment = document.createDocumentFragment();
        rowData.forEach(({ solution, impact, cost, count }) => {
            const row = createTableRow(solution, impact, cost, count, maxImpact, maxCost, maxCount);
            fragment.appendChild(row);
        });

        tbody.innerHTML = '';
        tbody.appendChild(fragment);

        updateTableHeader(table);
        highlightVisibleSolutions();

        isUpdating = false;
    }, 0);
}

function calculateSolutionTotals() {
    const solutionTotals = {};
    state.selectedCellKeys.forEach(key => {
        const cell = state.allCells.get(key);
        if (cell && cell.scores) {
            Object.entries(cell.scores).forEach(([solution, scores]) => {
                if (!solutionTotals[solution]) {
                    solutionTotals[solution] = { impact: 0, cost: 0, count: 0 };
                }
                solutionTotals[solution].impact += scores.impact;
                solutionTotals[solution].cost += scores.cost;
                solutionTotals[solution].count++;
            });
        }
    });
    return solutionTotals;
}

function getMaxValues(solutionTotals) {
    return {
        maxImpact: Math.max(...Object.values(solutionTotals).map(s => s.impact)),
        maxCost: Math.max(...Object.values(solutionTotals).map(s => s.cost)),
        maxCount: Math.max(...Object.values(solutionTotals).map(s => s.count))
    };
}

function prepareRowData(solutionTotals) {
    return Object.entries(solutionTotals).map(([solution, totals]) => ({
        solution,
        impact: totals.impact,
        cost: totals.cost,
        count: totals.count
    }));
}

function createTableRow(solution, impact, cost, count, maxImpact, maxCost, maxCount) {
    const row = document.createElement('tr');
    row.setAttribute('data-solution', solution);

    row.innerHTML = `
        <td>
            <input type="checkbox" ${state.selectedSolutions[solution] !== false ? 'checked' : ''}
                   style="accent-color: ${state.colorScale(solution)}">
        </td>
        <td>${solution}</td>
        <td class="impact">
            <div class="bar-graph impact-bar" style="width: ${(impact / maxImpact) * 100}%; background-color: ${state.colorScale(solution)}"></div>
            <span class="value">${impact.toFixed(2)}</span>
        </td>
        <td class="cost">
            <div class="bar-graph cost-bar" style="width: ${(cost / maxCost) * 100}%; background-color: ${state.colorScale(solution)}"></div>
            <span class="value">${cost.toFixed(2)}</span>
        </td>
        <td class="count">
            <div class="bar-graph count-bar" style="width: ${(count / maxCount) * 100}%; background-color: ${state.colorScale(solution)}"></div>
            <span class="value">${count}</span>
        </td>
    `;

    const checkbox = row.querySelector('input[type="checkbox"]');
    checkbox.addEventListener("change", function() {
        const updatedSolutions = {
            ...state.selectedSolutions,
            [solution]: this.checked
        };
        
        updateState({
            selectedSolutions: updatedSolutions
        });
        
        updateSolutionTable();
        updateGrid(state.map);
    });

    const isFiltered = !isWithinFilters(solution, { impact, cost });
    row.style.opacity = isFiltered ? '0.3' : '1';
    row.style.pointerEvents = 'auto';

    row.addEventListener('mouseenter', () => highlightSolutionCells(solution));
    row.addEventListener('mouseleave', () => updateGrid(state.map));

    return row;
}

function updateTableHeader(table) {
    const headers = table.tHead.rows[0].cells;
    for (let i = 2; i < headers.length; i++) {
        headers[i].classList.toggle('sorted', headers[i].className.includes(state.currentSortColumn));
        headers[i].classList.toggle('ascending', state.isAscending);
    }
}

function highlightVisibleSolutions() {
    const table = document.getElementById("solutionsTable");
    if (!table) return;

    const tbody = table.tBodies[0];
    const rows = tbody.rows;

    const solutionsInSelection = new Set();
    state.selectedCellKeys.forEach(key => {
        const cell = state.allCells.get(key);
        if (cell && cell.scores) {
            Object.entries(cell.scores).forEach(([solution, score]) => {
                if (score.isSuitable && (score.impact > 0 || score.cost > 0)) {
                    solutionsInSelection.add(solution);
                }
            });
        }
    });

    for (let row of rows) {
        const solution = row.getAttribute('data-solution');
        row.style.border = solutionsInSelection.has(solution) ? '2px solid red' : '';
    }
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
        const storedValues = state.categorySliderValues[state.currentCategory] || {};

        setupSlider(impactSlider, "impact", ranges.impact, storedValues.impact);
        setupSlider(costSlider, "cost", ranges.cost, storedValues.cost);
    }
}

function setupSlider(slider, type, range, storedValues) {
    noUiSlider.create(slider, {
        start: storedValues || [range[0], range[1]],
        connect: true,
        range: {
            'min': range[0],
            'max': range[1]
        },
        step: 0.01
    });

    slider.noUiSlider.on('update', debounce(function (values) {
        if (isUpdating) return;
        isUpdating = true;
        
        document.getElementById(`${type}Value`).textContent = `${parseFloat(values[0]).toFixed(2)} - ${parseFloat(values[1]).toFixed(2)}`;
        updateState({ [`${type}Filter`]: values.map(Number) });
        storeSliderValues();
        updateTableStyles();
        updateGrid(state.map);
        
        isUpdating = false;
    }, 100));
}

function updateTableStyles() {
    const table = document.getElementById("solutionsTable");
    if (!table) return;

    const tbody = table.tBodies[0];
    const rows = tbody.rows;

    for (let row of rows) {
        const solution = row.getAttribute('data-solution');
        const impact = parseFloat(row.cells[2].textContent);
        const cost = parseFloat(row.cells[3].textContent);

        const isFiltered = !isWithinFilters(solution, { impact, cost });
        row.style.opacity = isFiltered ? '0.3' : '1';
        row.style.pointerEvents = isFiltered ? 'none' : 'auto';
    }

    highlightVisibleSolutions();
}

function updateSliderRanges() {
    const ranges = getFilterRanges();
    const impactSlider = document.getElementById("impactSlider");
    const costSlider = document.getElementById("costSlider");

    updateSliderRange(impactSlider, "impact", ranges.impact);
    updateSliderRange(costSlider, "cost", ranges.cost);
}

function updateSliderRange(slider, type, range) {
    if (slider && slider.noUiSlider) {
        slider.noUiSlider.updateOptions({
            range: {
                'min': range[0],
                'max': range[1]
            }
        });
        const storedValues = state.categorySliderValues[state.currentCategory]?.[type] || [range[0], range[1]];
        slider.noUiSlider.set(storedValues);
    }
}

function sortRowData(rowData) {
    rowData.sort((a, b) => {
        const aValue = a[state.currentSortColumn];
        const bValue = b[state.currentSortColumn];
        return state.isAscending ? aValue - bValue : bValue - aValue;
    });
}

function updateUIForCategory(challengeCategory) {
    updateSolutionTable();
}

function createButtons(containerId, dataArray, buttonClass) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container with id ${containerId} not found`);
        return;
    }

    const fragment = document.createDocumentFragment();
    dataArray.forEach(d => {
        const button = document.createElement("button");
        button.className = buttonClass;
        button.textContent = d;
        button.addEventListener("click", function() {
            updateState({ currentCategory: d });
            updateCategoryDropdown(d);
            updateMap(d);
        });
        fragment.appendChild(button);
    });

    container.innerHTML = '';
    container.appendChild(fragment);
}

function updateCategoryDropdown(category) {
    const dropBtn = document.querySelector("#categoryDropdown .dropbtn");
    if (dropBtn) {
        dropBtn.innerHTML = `<span class="dropdown-title">Optimised for: </span>${category}`;
    }
    document.querySelectorAll(".category-button").forEach(btn => {
        btn.classList.toggle('active', btn.textContent === category);
    });
    document.getElementById('categoryButtons').classList.remove('show');
}

function toggleSort(column) {
    if (state.currentSortColumn === column) {
        updateState({ isAscending: !state.isAscending });
    } else {
        updateState({ currentSortColumn: column, isAscending: false });
    }
    updateSolutionTable();
    updateGrid(state.map);
}

function updateSelectionTotals() {
    const selectionTotals = document.getElementById('selectionTotals');
    if (!selectionTotals) return;

    const selectedCells = state.selectedCellKeys.size;
    let totalImpact = 0;
    let totalCost = 0;

    state.selectedCellKeys.forEach(key => {
        const cell = state.allCells.get(key);
        if (cell && cell.scores) {
            Object.entries(cell.scores).forEach(([solution, score]) => {
                if (isWithinFilters(solution, score)) {
                    totalImpact += score.impact;
                    totalCost += score.cost;
                }
            });
        }
    });

    selectionTotals.innerHTML = `
        <p>Selected Cells: ${selectedCells}</p>
        <p>Total Impact: ${totalImpact.toFixed(2)}</p>
        <p>Total Cost: £${totalCost.toFixed(2)}</p>
    `;
}

function updateFilterDisplay() {
    const impactValue = document.getElementById("impactValue");
    const costValue = document.getElementById("costValue");
    
    if (impactValue) {
        impactValue.textContent = `${state.impactFilter[0].toFixed(2)} - ${state.impactFilter[1].toFixed(2)}`;
    }
    
    if (costValue) {
        costValue.textContent = `${state.costFilter[0].toFixed(2)} - ${state.costFilter[1].toFixed(2)}`;
    }
}

function setupReportButton() {
    const reportButton = document.getElementById('generateReport');
    if (reportButton) {
        reportButton.addEventListener('click', generateReport);
    }
}

function generateReport() {
    console.log('Generating report...');
    // You can call a function from reportModule.js here
    // For example: reportModule.generatePDFReport(state);
}

function setupSearchBar() {
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    
    if (searchInput && searchButton) {
        searchButton.addEventListener('click', () => searchLocation(searchInput.value));
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchLocation(searchInput.value);
            }
        });
    }
}

function searchLocation(query) {
    console.log('Searching for location:', query);
    // You can call a function from a geocoding service or API here
    // For example: mapModule.geocodeAndZoom(query);
}

function initializeUI() {
    setupUI();
    setupReportButton();
    setupSearchBar();
    updateSelectionTotals();
    updateFilterDisplay();
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Event listeners for window resize
window.addEventListener('resize', debounce(() => {
    updateSelectionRectangle();
    updateGrid(state.map);
}, 250));

// Export all necessary functions
export {
    setupUI,
    updateSolutionTable,
    updateUIForCategory,
    createButtons,
    updateCategoryDropdown,
    updateSliderRanges,
    updateSelectionTotals,
    updateFilterDisplay,
    generateReport,
    searchLocation,
    initializeUI,
    highlightVisibleSolutions
};