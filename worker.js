// worker.js
self.onmessage = function(e) {
    if (e.data.type === 'calculateSuitabilityScores') {
        const { gridSize, challengeCategory, solutionCriteria, challengeCategories, solutionCosts, criteriaRasters } = e.data;
        const scores = calculateSuitabilityScores(gridSize, challengeCategory, solutionCriteria, challengeCategories, solutionCosts, criteriaRasters);
        self.postMessage({ type: 'suitabilityScores', scores });
    }
};

function calculateSuitabilityScores(gridSize, challengeCategory, solutionCriteria, challengeCategories, solutionCosts, criteriaRasters) {
    const grid = [];
    for (let y = 0; y < gridSize; y++) {
        const row = [];
        for (let x = 0; x < gridSize; x++) {
            const cellScores = {};
            for (const [solution, criteria] of Object.entries(solutionCriteria)) {
                const area = calculateOverlapArea(x, y, criteria, gridSize, criteriaRasters);
                const weight = challengeCategories[challengeCategory][solution];
                cellScores[solution] = {
                    impact: area * weight * 100,
                    cost: area * solutionCosts[solution],
                    area: area
                };
            }
            row.push(cellScores);
        }
        grid.push(row);
    }
    return grid;
}

function calculateOverlapArea(x, y, criteria, gridSize, criteriaRasters) {
    let totalValue = 0;
    criteria.forEach(criterion => {
        const raster = criteriaRasters[criterion];
        const rasterX = Math.floor(x / gridSize * raster.length);
        const rasterY = Math.floor(y / gridSize * raster[0].length);
        totalValue += raster[rasterY][rasterX];
    });
    return totalValue / criteria.length;
}