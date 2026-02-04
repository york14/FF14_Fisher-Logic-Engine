
import { calculateGPCost, calculateGPBalance, GP_CONSTANTS } from '../core/optimizer.js';

function assert(condition, message) {
    if (!condition) {
        console.error(`❌ FAIL: ${message}`);
        process.exit(1);
    } else {
        console.log(`✅ PASS: ${message}`);
    }
}

console.log("=== GP Logic Verification (Plan B) ===");

// 1. Cost Verification
console.log("\n--- Skill Cost Tests ---");

const cost1 = calculateGPCost({ isChum: true });
assert(cost1.total === 100, `Chum cost should be 100 (Got: ${cost1.total})`);

const cost2 = calculateGPCost({ slapFish: 'Any' });
assert(cost2.total === 200, `Slap cost should be 200 (Got: ${cost2.total})`);

const cost3 = calculateGPCost({ lureCount: 1 });
assert(cost3.total === 10, `Lure x1 cost should be 10 (Got: ${cost3.total})`);

const cost4 = calculateGPCost({ lureCount: 3 });
assert(cost4.total === 60, `Lure x3 cost should be 60 (10+20+30) (Got: ${cost4.total})`);

const cost5 = calculateGPCost({ isChum: true, slapFish: 'Any', lureCount: 2 });
assert(cost5.total === 100 + 200 + 30, `Mixed cost should be 330 (100+200+30) (Got: ${cost5.total})`);

// 2. Recovery Verification (Plan B: Floor Logic)
console.log("\n--- Recovery Tests (Rate: 8GP/3s) ---");

const rec1 = calculateGPBalance(2.9, 0);
assert(rec1.recovered === 0, `2.9s should recover 0 GP (Got: ${rec1.recovered})`);

const rec2 = calculateGPBalance(3.0, 0);
assert(rec2.recovered === 8, `3.0s should recover 8 GP (Got: ${rec2.recovered})`);

const rec3 = calculateGPBalance(5.9, 0);
assert(rec3.recovered === 8, `5.9s should recover 8 GP (Got: ${rec3.recovered})`);

const rec4 = calculateGPBalance(6.1, 0);
assert(rec4.recovered === 16, `6.1s should recover 16 GP (Got: ${rec4.recovered})`);

// 3. Hi-Cordial Verification
console.log("\n--- Hi-Cordial Tests ---");
// 400 GP / 180s = ~2.222 GP/s
// Cycle 100s -> +222.22... GP
const recItem = calculateGPBalance(100, 0, true);
// Natural Recovery: floor(100/3)*8 = 33*8 = 264
const expectedNatural = 264;
const expectedItem = (400 / 180) * 100; // 222.222...
const expectedTotal = expectedNatural + expectedItem;

console.log(`Natural: ${expectedNatural}, Item: ${expectedItem}, Total: ${expectedTotal}`);
console.log(`Actual Recovered: ${recItem.recovered} (includes item)`);

// Allow float precision diff
const diff = Math.abs(recItem.recovered - expectedTotal); // recovered in object includes itemRecovery logic? check code.
// Code says: recovered = natural + itemRecovery.
assert(diff < 0.1, `Hi-Cordial logic mismatch. Expected ~${expectedTotal}, Got ${recItem.recovered}`);

// 4. Sustainability
console.log("\n--- Sustainability Tests ---");
// Burn 100 GP, Recover 16 GP (6s) -> -84 Balance -> Unsustainable
const sus1 = calculateGPBalance(6.0, 100);
assert(sus1.sustainable === false, "Should be unsustainable");
assert(sus1.balance === 16 - 100, `Balance should be -84 (Got: ${sus1.balance})`);
// Casts until deplete: 1000 / 84 = ~11.9
const expectedCasts = 1000 / 84;
assert(Math.abs(sus1.castsUntilDeplete - expectedCasts) < 0.01, `Casts until deplete mismatch`);

console.log("\nAll Tests Passed!");
