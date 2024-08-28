// worker.js
import * as comlink from 'https://unpkg.com/comlink/dist/esm/comlink.mjs';

function encodeSolutions(solutionScores) {
    let encoded = 0;
    Object.entries(solutionScores).forEach(([solution, score], index) => {
        if (score.isSuitable) {
            encoded |= (1 << index);
        }
    });
    return encoded;
}

function getRasterValueAtPoint(rasterData, lat, lng) {
    const { bounds, width, height, data } = rasterData;
    const [minX, minY, maxX, maxY] = bounds;

    if (lng < minX || lng > maxX || lat < minY || lat > maxY) {
        return 0;
    }

    const x = Math.floor((lng - minX) / (maxX - minX) * width);
    const y = Math.floor((maxY - lat) / (maxY - minY) * height);

    return data[y * width + x] || 0;
}

function calculateScores(cellData, rasterData, solutionImpact, challengeCategory, solutionCosts) {
    return cellData.map(cell => {
        const { lat, lng } = cell;
        const scores = {};
        const impacts = {};
        const costs = {};

        Object.entries(solutionImpact).forEach(([solution, criteria]) => {
            const [criterion1, criterion2] = criteria;
            const value1 = getRasterValueAtPoint(rasterData[criterion1], lat, lng);
            const value2 = getRasterValueAtPoint(rasterData[criterion2], lat, lng);

            const isSuitable = value1 > 0 && value2 > 0;

            scores[solution] = { isSuitable };
            
            const weight = challengeCategory[solution] || 0;
            impacts[solution] = isSuitable ? weight * 100 : 0;
            costs[solution] = isSuitable ? (solutionCosts[solution] || 0) : 0;
        });

        const encoded = encodeSolutions(scores);

        return { encoded, impacts, costs };
    });
}

const exports = {
    calculateScores,
};

comlink.expose(exports);