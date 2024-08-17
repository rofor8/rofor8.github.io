// reportModule.js
import { state } from './stateModule.js';

function gatherReportData() {
    console.log('Gathering report data...');
    const selectedCells = Array.from(state.selectedCellKeys).map(key => {
        const cell = state.allCells.get(key);
        const topSolution = getTopSolutionForCell(cell);
        console.log('Report data gathered');
        return {
            key: key,
            solution: topSolution.solution,
            impact: topSolution.impact,
            cost: topSolution.cost
        };
    });

    const solutionBreakdown = {};
    let totalImpact = 0;
    let totalCost = 0;

    selectedCells.forEach(cell => {
        if (!solutionBreakdown[cell.solution]) {
            solutionBreakdown[cell.solution] = { count: 0, totalImpact: 0, totalCost: 0 };
        }
        solutionBreakdown[cell.solution].count++;
        solutionBreakdown[cell.solution].totalImpact += cell.impact;
        solutionBreakdown[cell.solution].totalCost += cell.cost;
        totalImpact += cell.impact;
        totalCost += cell.cost;
    });

    return {
        currentCategory: state.currentCategory,
        currentRanking: state.currentRanking,
        totalImpact: totalImpact,
        totalCost: totalCost,
        solutionBreakdown: solutionBreakdown,
        selectedCells: selectedCells
    };
}

function getTopSolutionForCell(cell) {
    if (!cell || !cell.scores) return { solution: 'N/A', impact: 0, cost: 0 };

    const validSolutions = Object.entries(cell.scores)
        .filter(([sol, scores]) => state.selectedSolutions[sol] !== false);

    if (validSolutions.length === 0) return { solution: 'N/A', impact: 0, cost: 0 };

    validSolutions.sort((a, b) => {
        const aValue = state.currentRanking === 'impact' ? a[1].impact : a[1].cost;
        const bValue = state.currentRanking === 'impact' ? b[1].impact : b[1].cost;
        return state.currentRanking === 'impact' ? bValue - aValue : aValue - bValue;
    });

    const [topSolution, topScores] = validSolutions[0];
    return {
        solution: topSolution,
        impact: topScores.impact,
        cost: topScores.cost
    };
}

export function generateReport() {
    console.log('generateReport function called');
    const reportData = gatherReportData();
    
    console.log('Checking for jsPDF...');
    if (typeof window.jspdf === 'undefined') {
        console.error('jsPDF is not loaded. Make sure the library is included correctly.');
        alert('Unable to generate PDF. jsPDF library is not loaded.');
        return;
    }
    
    try {
        console.log('Initializing jsPDF...');
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        let yOffset = 20;

        console.log('Generating report content...');
        // Cover page
        doc.setFontSize(24);
        doc.setTextColor(0, 102, 204);
        doc.text("Nature Based Solutions Report", 20, yOffset);
        yOffset += 10;
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, yOffset);
        yOffset += 20;

    // Table of contents
    doc.setFontSize(16);
    doc.text("Table of Contents", 20, yOffset);
    yOffset += 10;
    doc.setFontSize(12);
    doc.text("1. Executive Summary", 25, yOffset);
    yOffset += 7;
    doc.text("2. Solution Breakdown", 25, yOffset);
    yOffset += 7;
    doc.text("3. Selected Cells Details", 25, yOffset);
    yOffset += 7;
    doc.text("4. Methodology Overview", 25, yOffset);
    yOffset += 15;

    // Executive Summary
    doc.addPage();
    yOffset = 20;
    doc.setFontSize(18);
    doc.text("1. Executive Summary", 20, yOffset);
    yOffset += 10;
    doc.setFontSize(12);
    
    // Summary table
    const summaryData = [
        ["Category", reportData.currentCategory],
        ["Ranking", reportData.currentRanking],
        ["Total Impact", reportData.totalImpact.toFixed(2)],
        ["Total Cost", `£${reportData.totalCost.toFixed(2)}`]
    ];
    doc.autoTable({
        startY: yOffset,
        head: [['Metric', 'Value']],
        body: summaryData,
        theme: 'grid'
    });
    yOffset = doc.lastAutoTable.finalY + 10;

    // Brief executive summary
    doc.text("This report summarizes the Nature Based Solutions (NBS) identified for the selected area. " +
             "The solutions are ranked based on their impact and cost effectiveness, providing a comprehensive " +
             "overview of potential interventions to address environmental challenges.", 20, yOffset, {maxWidth: 170});

    // Solution Breakdown
    doc.addPage();
    yOffset = 20;
    doc.setFontSize(18);
    doc.text("2. Solution Breakdown", 20, yOffset);
    yOffset += 10;

    // Create data for solution breakdown table
    const breakdownData = Object.entries(reportData.solutionBreakdown).map(([solution, data]) => [
        solution,
        data.count,
        data.totalImpact.toFixed(2),
        `£${data.totalCost.toFixed(2)}`,
        `${((data.totalImpact / reportData.totalImpact) * 100).toFixed(1)}%`,
        `${((data.totalCost / reportData.totalCost) * 100).toFixed(1)}%`
    ]);

    doc.autoTable({
        startY: yOffset,
        head: [['Solution', 'Count', 'Total Impact', 'Total Cost', '% of Impact', '% of Cost']],
        body: breakdownData,
        theme: 'grid'
    });

    // Selected Cells Details
    doc.addPage();
    yOffset = 20;
    doc.setFontSize(18);
    doc.text("3. Selected Cells Details", 20, yOffset);
    yOffset += 10;

    const cellsData = reportData.selectedCells.map((cell, index) => [
        `Cell ${index + 1}`,
        cell.key,
        cell.solution,
        cell.impact.toFixed(2),
        `£${cell.cost.toFixed(2)}`
    ]);

    doc.autoTable({
        startY: yOffset,
        head: [['Cell', 'Key', 'Solution', 'Impact', 'Cost']],
        body: cellsData,
        theme: 'grid'
    });

    // Methodology Overview
    doc.addPage();
    yOffset = 20;
    doc.setFontSize(18);
    doc.text("4. Methodology Overview", 20, yOffset);
    yOffset += 10;
    doc.setFontSize(12);
    doc.text("This report uses a multi-criteria analysis approach to identify and rank Nature Based Solutions. " +
             "The analysis considers various environmental factors, potential impacts, and costs to provide a " +
             "comprehensive assessment of each solution's suitability for the selected area.", 20, yOffset, {maxWidth: 170});

             console.log('Saving PDF...');
             doc.save("NBS_Report.pdf");
             console.log('PDF saved successfully');
         } catch (error) {
             console.error('Error generating PDF:', error);
             alert(`Unable to generate PDF. Error: ${error.message}`);
         }
     }