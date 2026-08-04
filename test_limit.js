import fs from 'fs';
import { calculateScenarioStats } from './src/core/calculator.js';

const db = JSON.parse(fs.readFileSync('./src/data/logic_master.json', 'utf8'));

const probabilityMap = new Map();
db.probabilities.forEach(p => {
    probabilityMap.set(p.searchKey, p.prob);
});

const config1 = {
    spot: "セノーテ・ジャユンジャ",
    weather: "ヌシ以外",
    bait: "紅サシ",
    target: "トゥルーソーサー",
    isCatchAll: false,
    limitMaxTime: 0,
    limitMinTime: 0,
    lureType: "アンビシャスルアー",
    quitIfNoDisc: false,
    goalTiming: "hit",
    isVariableMode: false
};

const config2 = {
    ...config1,
    limitMinTime: 15
};

const stats1 = calculateScenarioStats(db, probabilityMap, config1, 'S_no_lure_C0_S1', false, '星粒魚');
const stats2 = calculateScenarioStats(db, probabilityMap, config2, 'S_no_lure_C0_S1', false, '星粒魚');

console.log("=== config1 (No Limit) ===");
console.log("Expected Time:", stats1.expectedTime);
console.log("Target Hit Rate:", stats1.targetHitRate);
console.log("Avg Cycle Time:", stats1.avgCycleTime);

console.log("\n=== config2 (LimitMin=15) ===");
console.log("Expected Time:", stats2.expectedTime);
console.log("Target Hit Rate:", stats2.targetHitRate);
console.log("Avg Cycle Time:", stats2.avgCycleTime);

console.log("\n=== Differences in Fish Stats ===");
const diffs = [];
stats1.allFishStats.forEach((f1, i) => {
    const f2 = stats2.allFishStats[i];
    if (f1.cycleTime !== f2.cycleTime || f1.hitRate !== f2.hitRate || f1.cancelProb !== f2.cancelProb || f1.waitTimeAvg !== f2.waitTimeAvg) {
        diffs.push({
            name: f1.name,
            hitRateNoLimit: f1.hitRate,
            hitRateLimit15: f2.hitRate,
            cycleTimeNoLimit: f1.cycleTime,
            cycleTimeLimit15: f2.cycleTime,
            cancelProbNoLimit: f1.cancelProb,
            cancelProbLimit15: f2.cancelProb,
            waitAvg1: f1.waitTimeAvg,
            waitAvg2: f2.waitTimeAvg,
            cancelLowWait2: f2.cancelLowWaitAvg,
            cType: f2.cType
        });
    }
});
console.log(JSON.stringify(diffs, null, 2));
