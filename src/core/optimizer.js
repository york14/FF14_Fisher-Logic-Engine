/**
 * GP Optimization Logic for Fisher Logic Engine
 */

export const GP_CONSTANTS = {
    RECOVERY_PER_TICK: 7.0,
    TICK_INTERVAL: 3.0,
    MAX_GP: 1000 // Default max GP
};

export const SKILL_COSTS = {
    CHUM: 145,
    SURFACE_SLAP: 200,
    IDENTICAL_CAST: 350,
    DOUBLE_HOOK: 400,
    TRIPLE_HOOK: 700,
    PRIZE_CATCH: 200
};

export function getGPRecoveryRate() {
    return GP_CONSTANTS.RECOVERY_PER_TICK / GP_CONSTANTS.TICK_INTERVAL; // GP per second ~2.33
}

export function calculateGPCost(config) {
    let cost = 0;
    const details = [];

    if (config.slapFish && config.slapFish !== 'なし') {
        cost += SKILL_COSTS.SURFACE_SLAP;
        details.push({ name: 'Surface Slap', cost: SKILL_COSTS.SURFACE_SLAP });
    }

    if (config.isChum) {
        cost += SKILL_COSTS.CHUM;
        details.push({ name: 'Chum', cost: SKILL_COSTS.CHUM });
    }

    // Future: Add other skills if implemented in config
    return { total: cost, details };
}

export function calculateGPBalance(cycleTime, gpCost) {
    if (cycleTime <= 0) return { balance: -gpCost, recovered: 0, sustainable: false };

    const recoveryRate = getGPRecoveryRate();
    const recovered = cycleTime * recoveryRate;
    const balance = recovered - gpCost;

    // Sustainable means we recover at least what we spend
    // However, in reality, we start with MaxGP. 
    // True sustainability is Balance >= 0.
    // If Balance < 0, we define "Casts until deplete" = MaxGP / (-Balance)

    let castsUntilDeplete = Infinity;
    if (balance < 0) {
        castsUntilDeplete = GP_CONSTANTS.MAX_GP / Math.abs(balance);
    }

    return {
        recovered,
        balance,
        sustainable: (balance >= -0.1), // Float tolerance
        castsUntilDeplete
    };
}
