// uiModule.js
import { state, updateState, updateMap } from './stateModule.js';

export function setupUI() {
    if (state.challengeCategories && Object.keys(state.challengeCategories).length > 0) {
        createButtons("categoryButtons", Object.keys(state.challengeCategories), "category-button");
    } else {
        console.warn('Challenge categories not loaded yet');
    }

    d3.select("#categoryDropdown .dropbtn").text(state.currentCategory);

    d3.select("#categoryButtons")
        .selectAll("button")
        .filter(d => d === state.currentCategory)
        .classed("active", true);

    document.querySelector('.dropbtn').addEventListener('click', function (e) {
        e.stopPropagation();
        document.getElementById('categoryButtons').classList.toggle('show');
    });

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

    setupRankSlider();
    setupSolutionCheckboxes();
}

function setupRankSlider() {
    const rankSlider = document.getElementById('rankSlider');
    const rankValue = document.getElementById('rankValue');

    rankSlider.addEventListener('input', function() {
        state.currentRank = parseInt(this.value);
        rankValue.textContent = state.currentRank;
        state.mapNeedsUpdate = true;
        state.callUpdateScores();
    });
}

function setupSolutionCheckboxes() {
    const solutionsContainer = d3.select("#solutionsContainer");
    
    Object.keys(state.solutionCriteria).forEach(solution => {
        const checkboxContainer = solutionsContainer.append("div")
            .attr("class", "solution-checkbox-container")
            .style("display", "flex")
            .style("align-items", "center")
            .style("margin-bottom", "5px");

        const colorIndicator = checkboxContainer.append("div")
            .style("width", "20px")
            .style("height", "20px")
            .style("background-color", state.colorScale(solution))
            .style("margin-right", "10px");

        const checkbox = checkboxContainer.append("label")
            .style("display", "flex")
            .style("align-items", "center")
            .html(`<input type="checkbox" name="${solution}" checked> ${solution}`);

        checkbox.select("input")
            .on("change", function() {
                const isChecked = this.checked;
                updateState({ 
                    selectedSolutions: {
                        ...state.selectedSolutions,
                        [solution]: isChecked
                    }
                });
                state.mapNeedsUpdate = true;
                updateMap(state.currentCategory);
            });
    });
}

export function updateUIForCategory(challengeCategory) {
    const maxRank = Math.max(...Array.from(state.allCells.values()).map(cell =>
        Object.values(cell.scores || {}).filter(score => score.impact > 0 || score.cost > 0).length
    ));

    const rankSlider = document.getElementById('rankSlider');
    rankSlider.max = maxRank;
    rankSlider.value = Math.min(state.currentRank, maxRank);
    document.getElementById('rankValue').textContent = rankSlider.value;
}

export function createButtons(containerId, dataArray, buttonClass) {
    const container = d3.select(`#${containerId}`);
    container.selectAll("button")
        .data(dataArray)
        .enter().append("button")
        .attr("class", buttonClass)
        .text(d => d)
        .on("click", function (event, d) {
            d3.selectAll(".category-button").classed("active", false);
            d3.select(this).classed("active", true);
            d3.select("#categoryDropdown .dropbtn").text(d);
            updateState({ currentCategory: d });
            updateMap(d);
        });
}

export function toggleRanking() {
    state.currentRanking = state.currentRanking === 'impact' ? 'cost' : 'impact';
    const toggleButton = document.getElementById('rankingToggle');
    toggleButton.textContent = `Ranked by: ${state.currentRanking.charAt(0).toUpperCase() + state.currentRanking.slice(1)}`;
    toggleButton.classList.toggle('active');

    state.mapNeedsUpdate = true;
    state.callUpdateScores();
}

export function updateRankSlider(maxRank) {
    const rankSlider = document.getElementById('rankSlider');
    rankSlider.max = maxRank;
    rankSlider.value = Math.min(state.currentRank, maxRank);
    document.getElementById('rankValue').textContent = rankSlider.value;
}

export function updateCategoryDropdown(category) {
    d3.select("#categoryDropdown .dropbtn").text(category);
    d3.selectAll(".category-button").classed("active", false);
    d3.select(`.category-button:contains("${category}")`).classed("active", true);
}