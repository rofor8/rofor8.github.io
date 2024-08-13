// workerModule.js
export function initializeWebWorker() {
    const workerCode = `
    self.onmessage = function(e) {
        if (e.data.type === 'calculateSuitabilityScores') {
            const { bounds, challengeCategory, allCells, solutionCriteria, challengeCategories, solutionCosts, criteriaRasters } = e.data;
            
            const updatedCells = new Map(allCells);
            
            updatedCells.forEach((cell, key) => {
                const [lat, lng] = key.split(',').map(Number);
                
                const scores = {};
                Object.keys(solutionCriteria).forEach(solution => {
                    const criteria = solutionCriteria[solution];
                    const criteriaScores = criteria.map(criterion => {
                        const rasterValue = getRasterValueAtPoint(criteriaRasters[criterion], lat, lng);
                        return rasterValue > 0 ? 1 : 0;
                    });
                    
                    const criteriaScore = criteriaScores.reduce((sum, score) => sum + score, 0) / criteria.length;
                    const challengeScore = challengeCategories[challengeCategory][solution];
                    const impact = criteriaScore * challengeScore;
                    const cost = solutionCosts[solution];
                    
                    scores[solution] = { impact, cost };
                });
                
                cell.scores = scores;
            });
            
            self.postMessage({ type: 'suitabilityScoresCalculated', allCells: Array.from(updatedCells.entries()) });
        }
    };

    // workerModule.js (continued)
    function getRasterValueAtPoint(raster, lat, lng) {
        if (!raster || !raster.bounds || !raster.data || !raster.windowBounds) {
            console.warn('Invalid raster data', raster);
            return 0;
        }

        const { data, width, height, windowBounds } = raster;
        const [minX, minY, maxX, maxY] = windowBounds;

        if (lng < minX || lng > maxX || lat < minY || lat > maxY) {
            console.log('Point outside raster window bounds', { lat, lng, windowBounds });
            return 0;
        }

        const x = Math.floor((lng - minX) / (maxX - minX) * width);
        const y = Math.floor((maxY - lat) / (maxY - minY) * height);

        if (x >= 0 && x < width && y >= 0 && y < height) {
            return data[y * width + x];
        }

        console.log('Invalid raster coordinates', { x, y, width, height });
        return 0;
    }
    `;

    const blob = new Blob([workerCode], {type: 'application/javascript'});
    const worker = new Worker(URL.createObjectURL(blob));
    return worker;
}