
/**
 * Test Script for Optimizer Logic (v3.2)
 * Running via Node.js
 */

import assert from 'assert';
import { generateAtomicStrategies } from '../core/optimizer_module.js';

// Mock Data for v3.2
const MOCK_DB = {
    fish: {
        'TestTarget': { type: 'large_jaws', hook_time: 10, is_hidden: false }
    },
    strategy_presets: [
        { id: 'p1', name: 'Preset1', eligible_scenarios: ['s1'] },
        { id: 'p2', name: 'Preset2', eligible_scenarios: ['s2'] }
    ]
};
const MOCK_CONFIG = {
    spot: 'TestSpot', target: 'TestTarget', lureType: 'Ambitious Lure'
};

async function testOptimizer() {
    console.log("=== Optimizer Logic Verification (v3.2) ===");

    // 1. Enumeration Test
    // Presets(2) x Chum(2) x Slap(1:none) = 4
    // If we pass 'SomeFish' as slapTarget -> Presets(2) x Chum(2) x Slap(2) = 8

    // Slap = None
    const strats1 = generateAtomicStrategies(MOCK_DB, MOCK_CONFIG, 'なし');
    console.log(`Strats (Slap=None): ${strats1.length}`);
    assert.strictEqual(strats1.length, 4, "Should be 4 combinations for Slap=None");

    // Slap = Specific
    const strats2 = generateAtomicStrategies(MOCK_DB, MOCK_CONFIG, 'SlapFishA');
    console.log(`Strats (Slap=A): ${strats2.length}`);
    assert.strictEqual(strats2.length, 8, "Should be 8 combinations for Slap=A");

    // Check Logic
    const s1 = strats2[0];
    assert.ok(s1.preset, "Strategy should have preset object");
    assert.ok(s1.id.includes("chum"), "ID should include chum info");
    assert.ok(s1.id.includes("slap"), "ID should include slap info");

    console.log("Enumeration: PASS");

    console.log("Logic Structure Verification: PASS");
}

testOptimizer();
