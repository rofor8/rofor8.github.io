// updateScores.js
export function updateScores(
    selectedCellKeys,
    allCells,
    currentRanking,
    impactFilter,
    costFilter,
    criteriaRasters,
    solutionImpact,
    colorScale,
    criteriaColorScale,
    getRasterValueAtPoint
) {
    if (!allCells) {
        console.error('allCells is undefined in updateScores');
        return;
    }

    const infoPanel = d3.select("#rankInfo");
    infoPanel.html("");

    if (selectedCellKeys.size === 0) {
        infoPanel.html("<p>No cells selected. Select cells on the map to see scores.</p>");
        return;
    }

    const barHeight = 20;
    const barSpacing = 5;
    const groupHeight = (barHeight + barSpacing) * 2 + 10;
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
        const cellData = allCells.get(key);
        if (cellData && cellData.scores) {
            const validSolutions = Object.entries(cellData.scores)
                .filter(([sol, scores]) => {
                    return scores.impact >= impactFilter[0] && scores.impact <= impactFilter[1] &&
                           scores.cost >= costFilter[0] && scores.cost <= costFilter[1];
                })
                .sort((a, b) =>
                    currentRanking === 'impact' ? b[1].impact - a[1].impact : a[1].cost - b[1].cost
                );

            if (validSolutions.length > 0) {
                const [solution, scores] = validSolutions[0];
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

                const criteria = solutionImpact[solution] || [];
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
        .attr("height", solutions.length * groupHeight + groupHeight); // Added extra height for totals row

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
    });

    // Add totals row
    const totalsG = solutionSvg.append("g")
        .attr("transform", `translate(0,${solutions.length * groupHeight})`);

    totalsG.append("text")
        .attr("x", 0)
        .attr("y", 15)
        .attr("font-weight", "bold")
        .attr("fill", "black")
        .text("Totals");

    const totalsBarScale = d3.scaleLinear()
        .domain([0, d3.max([totalImpact, totalCost])])
        .range([0, barWidth]);

    // Total Impact
    totalsG.append("text")
        .attr("x", toggleWidth)
        .attr("y", 40)
        .attr("fill", "black")
        .text(`${totalImpact.toFixed(0)}`);

    totalsG.append("rect")
        .attr("x", toggleWidth + valueWidth)
        .attr("y", 25)
        .attr("width", totalsBarScale(totalImpact))
        .attr("height", barHeight)
        .attr("fill", "steelblue");

    totalsG.append("text")
        .attr("x", toggleWidth + valueWidth + 5)
        .attr("y", 40)
        .attr("fill", "white")
        .text("Total Impact");

    // Total Cost
    totalsG.append("text")
        .attr("x", toggleWidth)
        .attr("y", 65)
        .attr("fill", "black")
        .text(`£${totalCost.toFixed(0)}`);

    totalsG.append("rect")
        .attr("x", toggleWidth + valueWidth)
        .attr("y", 50)
        .attr("width", totalsBarScale(totalCost))
        .attr("height", barHeight)
        .attr("fill", "darkseagreen");

    totalsG.append("text")
        .attr("x", toggleWidth + valueWidth + 5)
        .attr("y", 65)
        .attr("fill", "white")
        .text("Total Cost");
}

