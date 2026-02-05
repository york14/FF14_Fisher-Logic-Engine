/**
 * Core Calculation Logic for Fisher Logic Engine
 */

import { parseScenarioId, getScenarioLabel } from './scenario.js';
import { calculateGPCost, calculateGPBalance } from './optimizer.js';

export const GDS = {
    D_CAST: 1.0, D_LURE: 2.5, D_BLK: 2.5, D_CHUM: 1.0, D_REST: 2.0,
    C_CHUM: 0.5, M_N1: 1.5, M_N2: 2.0, M_N3: 6.0
};

export function generateProbabilityMap(probabilities) {
    const map = new Map();
    if (!Array.isArray(probabilities)) return map;
    probabilities.forEach(row => {
        const key = `${row.spot}|${row.weather}|${row.bait}|${row.lure_type}|${row.slap_target}`;
        map.set(key, row);
    });
    return map;
}

export function calculateScenarioStats(masterDB, probabilityMap, config, scenarioId, isChum, slapFish, overrideP = null) {
    if (!masterDB.spots[config.spot]) return { error: "釣り場データが見つかりません" };
    const p = parseScenarioId(scenarioId);
    const weightKey = `${config.spot}|${config.weather}|${config.bait}`;
    const originalWeights = masterDB.weights[weightKey] || [];

    // --- Variable Mode Logic (v3.2 Update: Base Weight Override) ---
    let baseWeights = originalWeights.map(w => ({ ...w })); // Shallow copy
    if (overrideP !== null) {
        // overrideP is now interpreted as "Target Base Weight" (not Probability)
        const overrideWeight = overrideP;
        const targetEntry = baseWeights.find(w => w.fish === config.target);
        if (targetEntry) {
            targetEntry.weight = overrideWeight;
        } else {
            // If target not in original weights, add it
            baseWeights.push({ fish: config.target, weight: overrideWeight, bite_time_min: 0, bite_time_max: 0 });
        }
    }

    let probData = null;
    let fallbackUsed = false;
    if (config.lureType !== 'none') {
        // Try exact match first
        const searchKey = `${config.spot}|${config.weather}|${config.bait}|${config.lureType}|${slapFish}`;
        if (probabilityMap) probData = probabilityMap.get(searchKey);

        // Fallback: If no data for this Slap, try 'none' (No Slap)
        // This assumes that Slap doesn't fundamentally change the 'Scenario' (Discovery/Type rates) 
        // for Normal fish, or at least provides a reasonable approximation.
        if (!probData && slapFish !== 'なし') {
            const fallbackKey = `${config.spot}|${config.weather}|${config.bait}|${config.lureType}|なし`;
            if (probabilityMap) probData = probabilityMap.get(fallbackKey);
            if (probData) fallbackUsed = true;
        }
    }
    const rawRates = probData ? { disc: probData.disc_rates, guar: probData.guar_rates_nodisc, fallback: fallbackUsed } : null;
    if (!probData && config.lureType !== 'none') return { error: "条件に合う確率データがありません", debugData: { rates: rawRates } };

    const tCast = GDS.D_CAST, tLureAction = GDS.D_LURE, tLureBlock = GDS.D_BLK, tChum = GDS.D_CHUM, tRest = GDS.D_REST;

    const isQuit = (config.quitIfNoDisc && !p.isNone && p.d === 0);
    const lureTime = p.isNone ? 0 : (tCast + (p.n * tLureAction) + tLureBlock);

    // Scenario Prob
    let scenarioProb = 1.0, scenarioStrParts = [];
    if (!p.isNone && probData) {
        let found = false, foundStep = 0;
        for (let i = 1; i <= p.n; i++) {
            const idx = i - 1;
            let action = (p.d === i) ? 'disc' : (p.g.includes(i) ? 'guar' : 'none');
            scenarioStrParts.push(action === 'disc' ? '発見' : (action === 'guar' ? '型確定' : '何もなし'));
            let stepProb = 0;
            if (!found) {
                const pDisc = probData.disc_rates[idx], pGuar = probData.guar_rates_nodisc[idx] / 100.0, pD = pDisc / 100.0;
                if (pDisc === null) return { error: `データ不足(Step${i})`, debugData: { rates: rawRates } };
                if (action === 'disc') { stepProb = pD; found = true; foundStep = i; }
                else if (action === 'guar') { stepProb = (1.0 - pD) * pGuar; }
                else { stepProb = (1.0 - pD) * (1.0 - pGuar); }
            } else {
                const pGuarAfterVal = probData.guar_rates_after_disc[`d${foundStep}_g${i}`];
                if (pGuarAfterVal === null || pGuarAfterVal === undefined) return { error: `データ不足(Step${i} after)`, debugData: { rates: rawRates } };
                const pGuarAfter = pGuarAfterVal / 100.0;
                stepProb = (action === 'guar') ? pGuarAfter : (1.0 - pGuarAfter);
            }
            scenarioProb *= stepProb;
        }
    } else {
        if (config.lureType === 'none') scenarioStrParts = ["ルアー使用なし"];
    }

    let pHidden = 0, hiddenFishName = probData && probData.target_hidden ? probData.target_hidden : null;
    if (hiddenFishName && probData.hidden_hit_rates) {
        const rate = probData.hidden_hit_rates[p.fullId];
        if (rate !== undefined && rate !== null) pHidden = rate / 100.0;
    }

    let totalWeight = 0, weightDetails = [];
    let modN = (p.n === 1) ? GDS.M_N1 : (p.n === 2 ? GDS.M_N2 : (p.n === 3 ? GDS.M_N3 : 1.5)); // Fallback fix
    const currentLureJaws = (config.lureType === 'アンビシャスルアー') ? 'large_jaws' : (config.lureType === 'モデストルアー' ? 'small_jaws' : null);
    const lastGuar = (p.g.length > 0 && p.g[p.g.length - 1] === p.n);

    baseWeights.forEach(w => {
        const info = masterDB.fish[w.fish];
        if (!info) return;
        let m = 1.0;
        if (w.fish === hiddenFishName) { weightDetails.push({ name: w.fish, base: w.weight, m: '-', final: '-', isHidden: true }); return; }
        if (w.fish === slapFish) { m = 0; }
        else if (config.lureType !== 'none') {
            const match = (info.type === currentLureJaws);
            if (match) m = modN; else m = lastGuar ? 0 : 1.0;
        }
        let finalW = w.weight * m;
        totalWeight += finalW;
        weightDetails.push({ name: w.fish, base: w.weight, m: m, final: finalW, isHidden: false });
    });

    let allFishStats = [], sumProbTotalCycle = 0, sumProb = 0;
    let sumProbWaitRange = 0;
    const fishList = masterDB.spots[config.spot].fish_list;
    fishList.forEach(fName => {
        const wData = baseWeights.find(x => x.fish === fName);
        const fInfo = masterDB.fish[fName];
        if (!wData || !fInfo) return;

        let hitProb = 0;
        if (isQuit) hitProb = 0;
        else {
            if (fName === hiddenFishName) hitProb = pHidden;
            else {
                const wd = weightDetails.find(x => x.name === fName);
                if (wd && totalWeight > 0) hitProb = (wd.final / totalWeight) * (1.0 - pHidden);
            }
        }
        sumProb += hitProb;
        const baseBiteMin = wData.bite_time_min;
        const baseBiteMax = wData.bite_time_max;

        const biteTimeMin = isChum ? (baseBiteMin * GDS.C_CHUM) : baseBiteMin;
        const biteTimeMax = isChum ? (baseBiteMax * GDS.C_CHUM) : baseBiteMax;

        // Wait Time Logic (Integral)
        let waitTimeAvg, cType = '';
        if (lureTime <= biteTimeMin) {
            waitTimeAvg = (biteTimeMin + biteTimeMax) / 2;
            cType = 'Case1 (Standard)';
        } else if (lureTime >= biteTimeMax) {
            waitTimeAvg = lureTime;
            cType = 'Case2 (Fixed)';
        } else {
            const range = biteTimeMax - biteTimeMin;
            if (range <= 0) {
                waitTimeAvg = lureTime;
                cType = 'Case3 (ZeroRange)';
            } else {
                const term1 = lureTime * (lureTime - biteTimeMin);
                const term2 = (Math.pow(biteTimeMax, 2) - Math.pow(lureTime, 2)) / 2;
                waitTimeAvg = (term1 + term2) / range;
                cType = 'Case3 (Integral)';
            }
        }
        const waitTimeMinDisplay = Math.max(biteTimeMin, lureTime);
        const waitTimeMaxDisplay = Math.max(biteTimeMax, lureTime);
        const waitTimeRange = (waitTimeMaxDisplay - waitTimeMinDisplay) / 2;

        const isTarget = (fName === config.target);
        const actualHookTime = (isTarget || config.isCatchAll) ? fInfo.hook_time : tRest;

        let cycleTime = 0;
        const pre = (isChum ? tChum : 0);

        if (isQuit) {
            cycleTime = tCast + (p.n * tLureAction) + tRest + pre;
        } else {
            cycleTime = tCast + waitTimeAvg + actualHookTime + pre;
        }

        sumProbTotalCycle += (hitProb * cycleTime);
        sumProbWaitRange += (hitProb * waitTimeRange);

        allFishStats.push({
            name: fName, vibration: fInfo.vibration, hitRate: hitProb,
            baseBiteMin, baseBiteMax, biteTimeMin, biteTimeMax, lureTime,
            waitTimeMin: waitTimeMinDisplay, waitTimeMax: waitTimeMaxDisplay, waitTimeAvg, waitTimeRange,
            hookTime: actualHookTime, cycleTime, isTarget, cType
        });
    });

    if (isQuit) {
        const pre = (isChum ? tChum : 0);
        sumProbTotalCycle = tCast + (p.n * tLureAction) + tRest + pre;
    }

    const targetStat = allFishStats.find(s => s.isTarget);
    const targetHitRate = targetStat ? targetStat.hitRate : 0;
    const targetHookTime = targetStat ? targetStat.hookTime : 0;
    const expectedTime = (targetHitRate > 0) ? (sumProbTotalCycle - (targetHitRate * targetHookTime)) / targetHitRate : Infinity;
    const expectedTimeRange = (targetHitRate > 0) ? (sumProbWaitRange / targetHitRate) : 0;

    // --- GP Calculation ---
    // p.n is lure count for this scenario
    const gpCostObj = calculateGPCost({ slapFish, isChum, lureCount: p.n });
    // Note: useHiCordial is not yet in config, default false
    const gpBalanceObj = calculateGPBalance(sumProbTotalCycle, gpCostObj.total, config.useHiCordial);

    return {
        allFishStats, totalWeight, weightDetails, pHidden, hiddenFishName, targetHitRate,
        avgCycleTime: sumProbTotalCycle, expectedTime, expectedTimeRange, scenarioStr: scenarioStrParts.join('→'), scenarioProb,
        gpStats: { cost: gpCostObj, balance: gpBalanceObj },
        debugData: { p, rates: rawRates, lureTime, waitTimeAvg: targetStat?.waitTimeAvg, waitTimeRange: targetStat?.waitTimeRange, targetCycle: targetStat?.cycleTime, targetHook: targetHookTime, isQuit }
    };
}

export function calculateStrategySet(masterDB, probabilityMap, config, setConfig, preset, overrideP = null) {
    if (!preset) return { error: "プリセット未選択" };
    const scenarios = [];
    let weightedHitRate = 0, weightedCycle = 0, totalProb = 0, error = null;

    // Track weighted GP Cost as well
    let weightedGPCost = 0;

    for (const sid of preset.eligible_scenarios) {
        const scenarioConfig = { ...config, lureType: setConfig.lureType, quitIfNoDisc: setConfig.quitIfNoDisc };
        const stats = calculateScenarioStats(masterDB, probabilityMap, scenarioConfig, sid, setConfig.isChum, setConfig.slapFish, overrideP);
        if (stats.error) {
            console.error(`Calc Error [${preset.name}][${sid}]:`, stats.error, stats.debugData);
            error = stats.error; break;
        }
        if (stats.scenarioProb === null) { error = "確率計算不能"; break; }

        totalProb += stats.scenarioProb;
        weightedHitRate += (stats.scenarioProb * stats.targetHitRate);
        weightedCycle += (stats.scenarioProb * stats.avgCycleTime);

        // Accumulate Weighted Cost
        weightedGPCost += (stats.scenarioProb * stats.gpStats.cost.total);

        scenarios.push({
            id: sid, label: getScenarioLabel(sid), prob: stats.scenarioProb, cycle: stats.avgCycleTime, hit: stats.targetHitRate, expected: stats.expectedTime, pObj: stats.debugData.p, isQuit: stats.debugData.isQuit,
            gpStats: stats.gpStats
        });
    }
    if (error) {
        console.warn(`StrategySet Failed [${preset.name}]:`, error);
        return { error, name: preset.name, description: preset.description };
    }

    const targetInfo = masterDB.fish[config.target];
    // Bug fix from original logic: check if targetInfo exists
    const tHook = targetInfo ? targetInfo.hook_time : 0;
    let expectedTime = (weightedHitRate > 0) ? (weightedCycle - (weightedHitRate * tHook)) / weightedHitRate : Infinity;
    const avgCastCount = (weightedHitRate > 0) ? (1 / weightedHitRate) : Infinity;

    // --- GP Calculation (Weighted) ---
    // Use the accumulated weighted cost, because Lure usage (cost) varies per scenario path.
    // e.g. Path A (Lure x2) vs Path B (Lure x1) occur with different probs.
    const weightedCostTotal = weightedGPCost;
    const gpCostObj = { total: weightedCostTotal, details: [{ name: 'Weighted Avg', cost: weightedCostTotal }] };

    // Balance depends on AvgCycle
    const gpBalanceObj = calculateGPBalance(weightedCycle, weightedCostTotal, config.useHiCordial);

    return { name: preset.name, description: preset.description, Slap: setConfig.slapFish, scenarios, totalProb, avgHitRate: weightedHitRate, avgCycle: weightedCycle, avgCastCount, expectedTime, gpStats: { cost: gpCostObj, balance: gpBalanceObj }, error: null };
}
