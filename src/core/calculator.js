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

function calcIntegralWaitAvg(low, high, L) {
    if (low >= high) return Math.max(low, L);
    if (L <= low) {
        return (low + high) / 2;
    } else if (high <= L) {
        return L;
    } else {
        const term1 = L * (L - low);
        const term2 = (Math.pow(high, 2) - Math.pow(L, 2)) / 2;
        return (term1 + term2) / (high - low);
    }
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
        else if (config.lureType !== 'none' && !p.isNone) {
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

        const t_min = isChum ? (baseBiteMin * GDS.C_CHUM) : baseBiteMin;
        const t_max = isChum ? (baseBiteMax * GDS.C_CHUM) : baseBiteMax;
        const L = lureTime;
        const M = (config.limitMaxTime && config.limitMaxTime > 0) ? config.limitMaxTime : Infinity;
        const Mn = (config.limitMinTime && config.limitMinTime > 0) ? config.limitMinTime : 0;

        // Wait Time & Limit Logic (3-zone algorithm)
        // Zone 1: t < Mn  → 下限見切り（早アタリ竿上げ中断）
        // Zone 2: Mn <= t <= M  → 有効範囲（釣獲）
        // Zone 3: t > M  → 上限見切り（タイムアウト竿上げ中断）
        let waitTimeAvg = 0;
        let cType = '';
        let catchRatio = 1.0;
        let cancelLowRatio = 0;   // 下限見切りによるキャンセル率
        let cancelHighRatio = 0;  // 上限見切りによるキャンセル率
        let cancelLowWaitAvg = 0; // 下限見切り時の平均待機時間
        let waitTimeMinDisplay = Math.max(t_min, L);
        let waitTimeMaxDisplay = Math.max(t_max, L);

        const range = t_max - t_min;

        if (range <= 0) {
            // Fixed bite time (t_min === t_max)
            if (t_min < Mn || M <= L || M <= t_min) {
                catchRatio = 0.0;
                if (t_min < Mn) {
                    cancelLowRatio = 1.0;
                    cancelLowWaitAvg = Math.max(t_min, L);
                    cType = 'Fixed (LowCut)';
                } else {
                    cancelHighRatio = 1.0;
                    cType = 'Fixed (HighCut)';
                }
            } else {
                catchRatio = 1.0;
                waitTimeAvg = Math.max(t_min, L);
                cType = 'Fixed (ZeroRange)';
            }
        } else if (M <= L || M <= t_min || Mn >= t_max) {
            // 全域キャンセル: 上限が有効範囲より前 or 下限が有効範囲より後
            catchRatio = 0.0;
            if (Mn >= t_max) {
                // 全て下限見切り
                cancelLowRatio = 1.0;
                cancelLowWaitAvg = calcIntegralWaitAvg(t_min, t_max, L);
                cType = 'All LowCut';
            } else {
                cancelHighRatio = 1.0;
                cType = 'All HighCut';
            }
        } else {
            // 一般ケース: 3ゾーン分割
            // 有効範囲の実効上下限
            const effLow = Math.max(t_min, Mn);   // 有効範囲の下端
            const effHigh = Math.min(t_max, M);    // 有効範囲の上端

            if (effLow >= effHigh) {
                // 有効範囲がゼロ（下限と上限が逆転）
                catchRatio = 0.0;
                cancelLowRatio = (Mn - t_min) / range;
                cancelHighRatio = 1.0 - cancelLowRatio;
                if (cancelLowRatio > 0) {
                    cancelLowWaitAvg = calcIntegralWaitAvg(t_min, Math.min(Mn, t_max), L);
                }
                cType = 'No Valid Zone';
            } else {
                // Zone 1: 下限見切り (t_min ~ effLow)
                cancelLowRatio = (effLow - t_min) / range;
                if (cancelLowRatio > 0) {
                    // 下限見切りゾーンの平均待機時間
                    cancelLowWaitAvg = calcIntegralWaitAvg(t_min, effLow, L);
                }

                // Zone 2: 有効範囲 (effLow ~ effHigh) — 釣獲
                catchRatio = (effHigh - effLow) / range;
                waitTimeAvg = calcIntegralWaitAvg(effLow, effHigh, L);
                if (L <= effLow) {
                    cType = 'Standard';
                } else if (effHigh <= L) {
                    cType = 'Lure Fixed';
                } else {
                    cType = 'Integral';
                }

                // Zone 3: 上限見切り (effHigh ~ t_max)
                cancelHighRatio = (t_max - effHigh) / range;

                // 表示用の有効待機時間範囲
                waitTimeMinDisplay = Math.max(effLow, L);
                waitTimeMaxDisplay = Math.max(effHigh, L);
            }
        }

        // 見切りタイプの注記
        const hasLimits = [];
        if (Mn > 0 && cancelLowRatio > 0) hasLimits.push('下限');
        if (M !== Infinity && cancelHighRatio > 0) hasLimits.push('上限');
        if (hasLimits.length > 0) cType += ` (w/${hasLimits.join('+')})`;

        const waitTimeRange = catchRatio > 0 ? (waitTimeMaxDisplay - waitTimeMinDisplay) / 2 : 0;
        
        let actualHitProb = hitProb * catchRatio;
        let cancelProb = hitProb * (cancelLowRatio + cancelHighRatio);

        const isTarget = (fName === config.target);
        const actualHookTime = (isTarget || config.isCatchAll) ? fInfo.hook_time : tRest;
        const pre = (isChum ? tChum : 0);

        // 各キャンセルパターンのサイクル時間
        // 下限見切り: キャスト + 待機 + 竿上げ(tRest=2s)
        const cancelLowCycleTime = tCast + cancelLowWaitAvg + tRest + pre;
        // 上限見切り: キャスト + 上限時間 + 竿上げ(tRest=2s)
        const cancelHighCycleTime = tCast + (M !== Infinity ? M : t_max) + tRest + pre;
        // 後方互換用: 加重平均キャンセルサイクル
        const totalCancelRatio = cancelLowRatio + cancelHighRatio;
        const cancelCycleTime = totalCancelRatio > 0
            ? (cancelLowRatio * cancelLowCycleTime + cancelHighRatio * cancelHighCycleTime) / totalCancelRatio
            : tCast + (M !== Infinity ? M : t_max) + tRest + pre;

        let cycleTime = 0;

        if (isQuit) {
            cycleTime = tCast + (p.n * tLureAction) + tRest + pre;
            actualHitProb = 0;
            cancelProb = 0;
        } else {
            cycleTime = tCast + waitTimeAvg + actualHookTime + pre;
        }

        const cancelLowProb = hitProb * cancelLowRatio;
        const cancelHighProb = hitProb * cancelHighRatio;
        sumProbTotalCycle += (actualHitProb * cycleTime) + (cancelLowProb * cancelLowCycleTime) + (cancelHighProb * cancelHighCycleTime);
        sumProbWaitRange += (actualHitProb * waitTimeRange);

        allFishStats.push({
            name: fName, vibration: fInfo.vibration, hitRate: actualHitProb,
            baseBiteMin, baseBiteMax, biteTimeMin: t_min, biteTimeMax: t_max, lureTime: L,
            waitTimeMin: waitTimeMinDisplay, waitTimeMax: waitTimeMaxDisplay, waitTimeAvg, waitTimeRange,
            hookTime: actualHookTime, cycleTime, isTarget, cType,
            originalHitProb: hitProb, cancelProb, cancelCycleTime,
            cancelLowRatio, cancelHighRatio
        });
    });

    if (isQuit) {
        const pre = (isChum ? tChum : 0);
        sumProbTotalCycle = tCast + (p.n * tLureAction) + tRest + pre;
    }

    const targetStat = allFishStats.find(s => s.isTarget);
    const targetHitRate = targetStat ? targetStat.hitRate : 0;
    const targetHookTime = targetStat ? targetStat.hookTime : 0;
    
    let goalOffset = 0;
    if (config.goalTiming === 'catch') {
        goalOffset = targetHookTime;
    } else if (config.goalTiming === 'cast') {
        const tWait = targetStat ? targetStat.waitTimeAvg : 0;
        goalOffset = -tWait;
    }
    
    const expectedTime = (targetHitRate > 0) ? (sumProbTotalCycle - (targetHitRate * targetHookTime) + (targetHitRate * goalOffset)) / targetHitRate : Infinity;
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
    let weightedWaitTime = 0;

    for (const sid of preset.eligible_scenarios) {
        const scenarioConfig = { ...config, lureType: setConfig.lureType, quitIfNoDisc: setConfig.quitIfNoDisc };
        if (setConfig.limitMaxTime !== undefined) {
            scenarioConfig.limitMaxTime = setConfig.limitMaxTime;
        }
        if (setConfig.limitMinTime !== undefined) {
            scenarioConfig.limitMinTime = setConfig.limitMinTime;
        }
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
        weightedWaitTime += (stats.scenarioProb * stats.targetHitRate * (stats.debugData.waitTimeAvg || 0));

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
    
    let goalOffset = 0;
    if (config.goalTiming === 'catch') {
        goalOffset = tHook;
    } else if (config.goalTiming === 'cast') {
        const tWait = (weightedHitRate > 0) ? (weightedWaitTime / weightedHitRate) : 0;
        goalOffset = -tWait;
    }
    
    let expectedTime = (weightedHitRate > 0) ? (weightedCycle - (weightedHitRate * tHook) + (weightedHitRate * goalOffset)) / weightedHitRate : Infinity;
    const avgCastCount = (weightedHitRate > 0) ? (1 / weightedHitRate) : Infinity;

    // --- GP Calculation (Weighted) ---
    // Use the accumulated weighted cost, because Lure usage (cost) varies per scenario path.
    // e.g. Path A (Lure x2) vs Path B (Lure x1) occur with different probs.
    const weightedCostTotal = weightedGPCost;
    const gpCostObj = { total: weightedCostTotal, details: [{ name: 'Weighted Avg', cost: weightedCostTotal }] };

    // Balance depends on AvgCycle
    const gpBalanceObj = calculateGPBalance(weightedCycle, weightedCostTotal, config.useHiCordial);

    return { name: preset.name, description: preset.description, Slap: setConfig.slapFish, setConfig: setConfig, scenarios, totalProb, avgHitRate: weightedHitRate, avgCycle: weightedCycle, avgCastCount, expectedTime, gpStats: { cost: gpCostObj, balance: gpBalanceObj }, error: null };
}
