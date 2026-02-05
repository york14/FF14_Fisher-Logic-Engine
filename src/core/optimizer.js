/**
 * GP Optimization Logic for Fisher Logic Engine
 * v2.0 (Plan B Implementation)
 */

export const GP_CONSTANTS = {
    RECOVERY_PER_TICK: 8.0,
    TICK_INTERVAL: 3.0,
    MAX_GP: 1000,
    INITIAL_GP: 1000
};

export const SKILL_COSTS = {
    CHUM: 100,
    SURFACE_SLAP: 200,
    LURE_1: 10,
    LURE_2: 20,
    LURE_3: 30,
    IDENTICAL_CAST: 350, // Reference
    PRIZE_CATCH: 200     // Reference
};

export const ITEM_CONFIG = {
    HI_CORDIAL: {
        RECOVERY: 400,
        RECAST: 180,
        DELAY: 1.0
    }
};

/**
 * Calculates the total GP cost for a single cast cycle.
 * @param {Object} config { slapFish, isChum, lureCount }
 */
export function calculateGPCost(config) {
    let cost = 0;
    const details = [];

    // 1. Surface Slap
    // ユーザー指示: トレードリリースの200GPは基本的に考慮しない
    // Note: Surface Slapのコストは計算に含めない
    // if (config.slapFish && config.slapFish !== 'なし') {
    //     cost += SKILL_COSTS.SURFACE_SLAP;
    //     details.push({ name: 'Surface Slap', cost: SKILL_COSTS.SURFACE_SLAP });
    // }

    // 2. Chum
    if (config.isChum) {
        cost += SKILL_COSTS.CHUM;
        details.push({ name: 'Chum', cost: SKILL_COSTS.CHUM });
    }

    // 3. Lures (Progressive)
    const n = config.lureCount || 0;
    if (n > 0) {
        let lureCost = 0;
        if (n >= 1) lureCost += SKILL_COSTS.LURE_1;
        if (n >= 2) lureCost += SKILL_COSTS.LURE_2;
        if (n >= 3) lureCost += SKILL_COSTS.LURE_3;
        cost += lureCost;
        details.push({ name: `Lures (x${n})`, cost: lureCost });
    }

    return { total: cost, details };
}

/**
 * Calculates GP Balance and Sustainability Metrics.
 * Uses "Plan B" (Floor Logic) for recovery.
 * 
 * @param {number} cycleTime - Total time for one cycle (seconds).
 * @param {number} gpCost - Total GP consumption per cycle.
 * @param {boolean} useHiCordial - Whether to simulate Hi-Cordial usage.
 */
export function calculateGPBalance(cycleTime, gpCost, useHiCordial = false) {
    if (cycleTime <= 0) return { balance: -gpCost, recovered: 0, sustainable: false };

    // Plan B: Discrete Recovery
    // floor(Time / 3.0) * 8
    // Note: If using Hi-Cordial, cycleTime should ideally include item delay (1.0s) handled in calculator.

    const ticks = Math.floor(cycleTime / GP_CONSTANTS.TICK_INTERVAL);
    let recovered = ticks * GP_CONSTANTS.RECOVERY_PER_TICK;

    let itemRecovery = 0;
    if (useHiCordial) {
        // Simple Model: Amortized recovery
        // 400GP every 180s = ~2.22 GP/s additional?
        // Or discrete: If cycle > 180 (impossible), or just add amortized value.
        // For sustainability check, we can treat it as:
        // Max theoretical recovery per cycle = (400 / 180) * cycleTime?
        // Or strictly: Can we maintain?
        // Let's use amortized for "Balance" stat, but keep note it's item dependent.

        // Strategy: Add amortized amount to balance
        const cordialRate = ITEM_CONFIG.HI_CORDIAL.RECOVERY / ITEM_CONFIG.HI_CORDIAL.RECAST;
        itemRecovery = cycleTime * cordialRate;
        recovered += itemRecovery;
    }

    const balance = recovered - gpCost;

    // Sustainability
    // Sustainable if Gain >= Loss
    const sustainable = (balance >= -0.1);

    let castsUntilDeplete = Infinity;
    if (!sustainable) {
        castsUntilDeplete = GP_CONSTANTS.MAX_GP / Math.abs(balance);
    }

    return {
        recovered,
        itemRecovery,
        balance,
        sustainable,
        castsUntilDeplete
    };
}
