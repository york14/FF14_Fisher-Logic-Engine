
/**
 * Optimizer Module for Fisher Logic Engine
 * 
 * Responsibilities:
 * 1. Enumerate all possible atomic strategies (Burn/Eco candidates).
 * 2. Simulate Mixed Strategy (Burn/Eco) over a time window.
 * 3. Find the optimal pair maximizing catch efficiency.
 */

import { calculateScenarioStats, calculateStrategySet } from './calculator.js';
import { calculateGPCost, calculateGPBalance, GP_CONSTANTS } from './optimizer.js';

// --- 1. Strategy Enumeration (v3.2) ---
// Atomic Strategy = Preset x Chum x Slap

export function generateAtomicStrategies(masterDB, config, slapFish) {
    const strategies = [];
    const presets = masterDB.strategy_presets || [];
    const isTargetHidden = masterDB.fish[config.target] && masterDB.fish[config.target].is_hidden;

    // Determine Slap options
    // If slapFish is "none", only one opt: "none"
    // If slapFish is specific, opts: "none", "specific"
    const slapOptions = (slapFish === 'なし') ? ['なし'] : ['なし', slapFish];

    // Determine Chum options
    const chumOptions = [false, true];

    // Hidden Fish cannot use Override Weight Logic properly
    const disableOverride = isTargetHidden;

    for (const preset of presets) {
        for (const chum of chumOptions) {
            for (const slap of slapOptions) {
                strategies.push({
                    id: `${preset.id}_chum${chum ? 1 : 0}_slap[${slap}]`,
                    preset: preset,
                    isChum: chum,
                    slapFish: slap,
                    disableOverride: disableOverride
                });
            }
        }
    }
    return strategies;
}


// --- 2. Simulation Logic (Time-Limited Mixed Strategy) ---

/**
 * Simulates a time window with a specific Burn/Eco pair.
 * 
 * @param {Object} burnStrat - Strategy config for Burn
 * @param {Object} ecoStrat - Strategy config for Eco
 * @param {number} windowTime - Limit in seconds
 * @param {number} initialGP - Start GP
 * @param {Object} context - { masterDB, probabilityMap, spotConfig, overrideWeight }
 */
export function simulateMixedStrategy(burnStrat, ecoStrat, windowTime, initialGP, context) {
    const { masterDB, probabilityMap, spotConfig, overrideWeight } = context;

    // Helper to calculate stats for a unified strategy object
    const resolveStats = (strat) => {
        return calculateStrategySet(
            masterDB, probabilityMap, spotConfig,
            { // SetConfig
                lureType: strat.lureType, // Use strategy-specific lure type (fixes No Lure bug)
                isChum: strat.isChum,
                slapFish: strat.slapFish,
                quitIfNoDisc: false // Forced to FALSE as per design v3.2
            },
            strat.preset,
            strat.disableOverride ? null : overrideWeight
        );
    };

    const sBurn = resolveStats(burnStrat);
    const sEco = resolveStats(ecoStrat);

    if (sBurn.error || sEco.error) return { error: sBurn.error || sEco.error };

    // Cost Check: Optimized Burn/Eco logic
    // We assume Burn is the "Active" strategy that costs more GP but is faster/better?
    // Actually, Burn MUST cost more GP than Eco to be a "Burn". 
    // And generally, Burn MUST have better HitRate/Time (Efficiency) to be worth burning.
    // If Burn is less efficient than Eco, we should just use Eco always.

    // Format Labels
    function formatLabel(s) {
        let n = s.preset.name;
        if (s.isChum) n += "+撒き餌";
        // if (s.slapFish !== 'なし') n += `+Trade(${s.slapFish})`; // Too long?
        if (s.slapFish !== 'なし') n += `+トレード`;
        return n;
    }

    let currentGP = initialGP;
    let currentTime = 0;

    // totalHitProb in v3.1 was cumulative probability of catching >=1 ?? 
    // No, it was sum(prob * hitRate) = expected catch count.
    // Let's call it totalExpectedCatch.
    let totalExpectedCatch = 0;

    let loopCount = 0;
    let burnCount = 0, ecoCount = 0, waitCount = 0;

    while (currentTime < windowTime && loopCount < 1000) {
        loopCount++;
        let chosen = null;
        let isBurn = false;

        // Opener Logic: Treat first cast as having "Full GP" or "Prep Time".
        // But cost is paid.
        // Simple logic: If we have GP for Burn, do Burn.

        // Note on sBurn.gpStats: calculateStrategySet returns 'gpStats.cost.total' (Weighted Average)
        const burnCost = sBurn.gpStats.cost.total;
        const ecoCost = sEco.gpStats.cost.total;

        if (currentGP >= burnCost) {
            chosen = sBurn;
            isBurn = true;
            burnCount++;
            currentGP -= burnCost;
        } else {
            // Eco Check
            if (currentGP >= ecoCost) {
                chosen = sEco;
                ecoCount++;
                currentGP -= ecoCost;
            } else {
                // Wait for Eco (or Burn if Eco is impossible?)
                // If Eco cost > 0 and we don't have it, we wait for Eco.
                const targetGP = (ecoCost > 0) ? ecoCost : burnCost;

                const missing = targetGP - currentGP;
                const ticksNeeded = Math.ceil(missing / GP_CONSTANTS.RECOVERY_PER_TICK);
                const waitTime = ticksNeeded * GP_CONSTANTS.TICK_INTERVAL;

                currentTime += waitTime;
                waitCount++;

                const recovered = Math.floor(waitTime / 3.0) * 8.0;
                currentGP += recovered;
                currentGP = Math.min(currentGP, GP_CONSTANTS.MAX_GP);

                if (currentTime >= windowTime) break;

                continue;
            }
        }

        // Execute Action
        if (currentTime + chosen.avgCycle > windowTime) {
            // Strict cutoff? Or allow finish?
            // "Catch within window". If cast ends after, catched after.
            // Let's break to be safe/strict. 
            // Or add partial? No, partial catch is weird.
            break;
        }

        currentTime += chosen.avgCycle;
        totalExpectedCatch += chosen.avgHitRate; // Expected Hit Count per Cycle

        // Recover GP during action
        const cycleRec = Math.floor(chosen.avgCycle / GP_CONSTANTS.TICK_INTERVAL) * GP_CONSTANTS.RECOVERY_PER_TICK;
        currentGP += cycleRec;
        currentGP = Math.min(currentGP, GP_CONSTANTS.MAX_GP);
    }

    if (totalExpectedCatch <= 0) return {
        pairName: `Burn:[${formatLabel(burnStrat)}] + Eco:[${formatLabel(ecoStrat)}]`,
        expectedTime: Infinity,
        catchCount: 0,
        valid: false
    };

    const expectedTime = currentTime / totalExpectedCatch;

    return {
        pairName: `Burn:[${formatLabel(burnStrat)}] + Eco:[${formatLabel(ecoStrat)}]`,
        expectedTime: expectedTime,
        catchCount: totalExpectedCatch,
        burnStats: sBurn, ecoStats: sEco,
        counts: { burn: burnCount, eco: ecoCount, wait: waitCount },
        burnLabel: formatLabel(burnStrat), ecoLabel: formatLabel(ecoStrat)
    };
}



