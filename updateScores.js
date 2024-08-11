import { allCells, currentRanking, currentRank, criteriaRasters, solutionCriteria, challengeCategories, solutionCosts, colorScale, criteriaColorScale } from './app.js';
function updateScores(selectedCellKeys) {
    console.log("updateScores function called");
    const infoPanel = d3.select("#rankInfo");
    infoPanel.html("");

    const selectionTotals = d3.select("#selectionTotals");
    selectionTotals.html("");

    if (selectedCellKeys.size === 0) {
        infoPanel.html("<p>No cells selected. Select cells on the map to see scores.</p>");
        return;
    }

    const barHeight = 20;
    const barSpacing = 5;
    const groupHeight = (barHeight + barSpacing) * 3 + 25;
    const groupSpacing = 20;
    const toggleWidth = 30;
    const valueWidth = 70;
    const barWidth = 250;
    const totalWidth = toggleWidth + valueWidth + barWidth + 20;

    let totalImpact = 0;
    let totalCost = 0;
    let totalCount = 0;

    const rankTotals = {};
    const allRasterCounts = {};
    const solutionOverlaps = {};

    selectedCellKeys.forEach(key => {
        const cellData = allCells.find(cell => cell.key === key);
        if (cellData && cellData.scores) {
            const validSolutions = Object.entries(cellData.scores)
                .filter(([sol, scores]) => {
                    if (currentRanking === 'impact') {
                        return scores.impact > 0;
                    } else {
                        return scores.cost > 0;
                    }
                })
                .sort((a, b) =>
                    currentRanking === 'impact' ? b[1].impact - a[1].impact : a[1].cost - b[1].cost
                );

            if (currentRank <= validSolutions.length) {
                const [solution, scores] = validSolutions[currentRank - 1];
                if (!rankTotals[solution]) {
                    rankTotals[solution] = { impact: 0, cost: 0, count: 0 };
                }
                rankTotals[solution].impact += scores.impact;
                rankTotals[solution].cost += scores.cost;
                rankTotals[solution].count++;

                totalImpact += scores.impact;
                totalCost += scores.cost;
                totalCount++;

                const [lat, lng] = key.split(',').map(Number);
                Object.keys(criteriaRasters).forEach(criterion => {
                    if (!allRasterCounts[criterion]) {
                        allRasterCounts[criterion] = 0;
                    }
                    if (getRasterValueAtPoint(criteriaRasters[criterion], lat, lng) > 0) {
                        allRasterCounts[criterion]++;
                    }
                });

                const criteria = solutionCriteria[solution] || [];
                if (!solutionOverlaps[solution]) {
                    solutionOverlaps[solution] = 0;
                }

                let allCriteriaPresent = criteria.every(criterion =>
                    getRasterValueAtPoint(criteriaRasters[criterion], lat, lng) > 0
                );

                if (allCriteriaPresent) {
                    solutionOverlaps[solution]++;
                }
            }
        }
    });

    // Display totals
    const totalsToggle = selectionTotals.append("div")
        .attr("class", "totals-toggle")
        .html(`<input type="checkbox" id="totalsToggle"> <label for="totalsToggle">Show all rasters</label>`);

    const totalsSvg = selectionTotals.append("svg")
        .attr("width", totalWidth)
        .attr("height", groupHeight);

    const totalsG = totalsSvg.append("g")
        .attr("transform", "translate(0,10)");

    function updateTotalsGraph(showAllRasters) {
        totalsG.selectAll("*").remove();

        if (showAllRasters) {
            const maxRasterCount = Math.max(...Object.values(allRasterCounts));
            const rasterBarScale = d3.scaleLinear()
                .domain([0, maxRasterCount])
                .range([0, barWidth]);

            Object.entries(allRasterCounts).forEach(([raster, count], index) => {
                totalsG.append("text")
                    .attr("x", toggleWidth)
                    .attr("y", index * 25 + 15)
                    .attr("fill", "black")
                    .text(count);

                totalsG.append("rect")
                    .attr("x", toggleWidth + valueWidth)
                    .attr("y", index * 25)
                    .attr("width", rasterBarScale(count))
                    .attr("height", barHeight)
                    .attr("fill", criteriaColorScale(raster));

                totalsG.append("text")
                    .attr("x", toggleWidth + valueWidth + 5)
                    .attr("y", index * 25 + 15)
                    .attr("fill", "white")
                    .text(raster);
            });

            totalsSvg.attr("height", Object.keys(allRasterCounts).length * 25);
        } else {
            const totalsBarScale = d3.scaleLinear()
                .domain([0, Math.max(totalImpact, totalCost, totalCount)])
                .range([0, barWidth]);

            totalsG.append("text")
                .attr("x", toggleWidth)
                .attr("y", 15)
                .attr("fill", "black")
                .text(`${totalImpact.toFixed(0)}`);

            totalsG.append("rect")
                .attr("x", toggleWidth + valueWidth)
                .attr("y", 0)
                .attr("width", totalsBarScale(totalImpact))
                .attr("height", barHeight)
                .attr("fill", "steelblue");

            totalsG.append("text")
                .attr("x", toggleWidth + valueWidth + 5)
                .attr("y", 15)
                .attr("fill", "white")
                .text("Total Impact");

            totalsG.append("text")
                .attr("x", toggleWidth)
                .attr("y", 40)
                .attr("fill", "black")
                .text(`£${totalCost.toFixed(0)}`);

            totalsG.append("rect")
                .attr("x", toggleWidth + valueWidth)
                .attr("y", 25)
                .attr("width", totalsBarScale(totalCost))
                .attr("height", barHeight)
                .attr("fill", "darkseagreen");

            totalsG.append("text")
                .attr("x", toggleWidth + valueWidth + 5)
                .attr("y", 40)
                .attr("fill", "white")
                .text("Total Cost");

            totalsG.append("text")
                .attr("x", toggleWidth)
                .attr("y", 65)
                .attr("fill", "black")
                .text(`${totalCount}`);

            totalsG.append("rect")
                .attr("x", toggleWidth + valueWidth)
                .attr("y", 50)
                .attr("width", totalsBarScale(totalCount))
                .attr("height", barHeight)
                .attr("fill", "lightcoral");

            totalsG.append("text")
                .attr("x", toggleWidth + valueWidth + 5)
                .attr("y", 65)
                .attr("fill", "white")
                .text("Total Count");

            totalsSvg.attr("height", groupHeight);
        }
    }

    updateTotalsGraph(false);

    d3.select("#totalsToggle").on("change", function () {
        updateTotalsGraph(this.checked);
    });

    // Display solution breakdowns
    const solutions = Object.keys(rankTotals).sort((a, b) => {
        if (currentRanking === 'impact') {
            return rankTotals[b].impact - rankTotals[a].impact;
        } else {
            return rankTotals[a].cost - rankTotals[b].cost;
        }
    });

    const maxValues = {
        impact: d3.max(solutions, s => rankTotals[s].impact),
        cost: d3.max(solutions, s => rankTotals[s].cost),
        count: d3.max(solutions, s => rankTotals[s].count)
    };

    const solutionSvg = infoPanel.append("svg")
        .attr("width", totalWidth)
        .attr("height", solutions.length * groupHeight);

    solutions.forEach((solution, index) => {
        const solutionG = solutionSvg.append("g")
            .attr("transform", `translate(0,${index * groupHeight})`);

        solutionG.append("text")
            .attr("x", 0)
            .attr("y", 15)
            .attr("font-weight", "bold")
            .attr("fill", "black")
            .text(solution);

        const barScale = d3.scaleLinear()
            .domain([0, d3.max([maxValues.impact, maxValues.cost, maxValues.count])])
            .range([0, barWidth]);

        // Impact bar
        solutionG.append("text")
            .attr("x", toggleWidth)
            .attr("y", 40)
            .attr("fill", "black")
            .text(`${rankTotals[solution].impact.toFixed(0)}`);

        solutionG.append("rect")
            .attr("x", toggleWidth + valueWidth)
            .attr("y", 25)
            .attr("width", barScale(rankTotals[solution].impact))
            .attr("height", barHeight)
            .attr("fill", colorScale(solution));

        solutionG.append("text")
            .attr("x", toggleWidth + valueWidth + 5)
            .attr("y", 40)
            .attr("fill", "white")
            .text("Impact");

        // Cost bar
        solutionG.append("text")
            .attr("x", toggleWidth)
            .attr("y", 65)
            .attr("fill", "black")
            .text(`£${rankTotals[solution].cost.toFixed(0)}`);

        solutionG.append("rect")
            .attr("x", toggleWidth + valueWidth)
            .attr("y", 50)
            .attr("width", barScale(rankTotals[solution].cost))
            .attr("height", barHeight)
            .attr("fill", d3.color(colorScale(solution)).darker(0.5));

        solutionG.append("text")
            .attr("x", toggleWidth + valueWidth + 5)
            .attr("y", 65)
            .attr("fill", "white")
            .text("Cost");

        // Count bar
        solutionG.append("text")
            .attr("x", toggleWidth)
            .attr("y", 90)
            .attr("fill", "black")
            .text(`${rankTotals[solution].count}`);

        solutionG.append("rect")
            .attr("x", toggleWidth + valueWidth)
            .attr("y", 75)
            .attr("width", barScale(rankTotals[solution].count))
            .attr("height", barHeight)
            .attr("fill", d3.color(colorScale(solution)).brighter(0.5));

        solutionG.append("text")
            .attr("x", toggleWidth + valueWidth + 5)
            .attr("y", 90)
            .attr("fill", "white")
            .text("Count");
    });
}

export { updateScores };
