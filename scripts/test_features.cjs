const fs = require('fs');
const path = require('path');

// Mock Data
const masterDB = {
    version: "3.0.0",
    spots: { "TestSpot": { fish_list: ["FishA", "FishB"] } },
    strategy_presets: [{ id: "no_lure", name: "No Lure" }, { id: "preset1", name: "Preset 1" }]
};

// --- 1. Share Mode Logic (Extracted from main.js) ---
function serializeStateToURL(state) {
    try {
        const jsonStr = JSON.stringify(state);
        const base64 = btoa(unescape(encodeURIComponent(jsonStr)));
        const safeBase64 = encodeURIComponent(base64);
        return `http://localhost:3000/share.html?data=${safeBase64}`;
    } catch (e) {
        console.error("Serialization failed:", e);
        return null;
    }
}

function verifyShareData(url) {
    try {
        const params = new URLSearchParams(url.split('?')[1]);
        let dataStr = params.get('data');
        if (!dataStr) return { success: false, error: "No data param" };

        if (dataStr.includes(' ')) dataStr = dataStr.replace(/ /g, '+');

        const jsonStr = decodeURIComponent(escape(atob(dataStr)));
        const config = JSON.parse(jsonStr);
        return { success: true, config };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// Polyfill for btoa/atob in Node
function btoa(str) { return Buffer.from(str, 'binary').toString('base64'); }
function atob(str) { return Buffer.from(str, 'base64').toString('binary'); }


// --- 2. Test Execution ---
console.log("=== Testing Share Mode URL Generation ===");

const validState = {
    version: 3,
    mode: 'manual',
    spot: "アレクサンドリア旧市街",
    weather: "霧晴れ12-16",
    bait: "紅サシ",
    target: "ゴールデングルーパー",
    isCatchAll: false,
    slapFish: "なし",
    isChum: true,
    lureType: "アンビシャスルアー",
    lureCount: "1",
    lureStep1: "disc",
    lureStep2: "none",
    lureStep3: "none",
    stratA: {}, stratB: {}
};

const url = serializeStateToURL(validState);
console.log("Generated URL:", url);

const decodeResult = verifyShareData(url);
if (decodeResult.success) {
    console.log("[PASS] Data decoding successful.");
    // Compare deep equality if needed, but simple check is fine
    if (decodeResult.config.target === validState.target) {
        console.log("[PASS] Target matches: " + decodeResult.config.target);
    } else {
        console.error("[FAIL] Target mismatch!");
    }
} else {
    console.error("[FAIL] Decoding failed:", decodeResult.error);
}


console.log("\n=== Testing Variable Mode Logic Presence ===");
// Since we found the functions in main.js previously, we just note potential issues.
// User said: "Variable display fails on Recalculation/Strategy Mode".

// Analysis of main.js (mental or via notes):
// In `runManualModeVariable`, it renders `main-result-time` (formula).
// In `runStrategyModeVariable`, it renders specific comparison HTML.
// The user suspects "display fails on recalculation".
// This often happens if elements are re-created or IDs change.

// In `updateSimulation`:
// It calls `runManualModeVariable` OR `runManualMode`.
// `runManualModeVariable` completely overwrites `result-content.innerHTML`.
// So if the DOM structure inside `result-content` changes between modes, 
// AND some other function tries to update a specific sub-element (like a chart) that no longer exists, it fails.

// Checking main.js `runManualModeVariable` (See snippet from previous turn):
// It overwrites `resultContent.innerHTML`.
// It creates `<div id="main-result-time">`.
// It does NOT seem to look for existing elements, so it should be safe "on creation".
// BUT, `renderShareManual` calls `calculateScenarioStats` but `renderShareManual` implementation in main.js 
// does NOT call `runManualModeVariable`.
// If share mode receives `isVariableMode` in config (it wasn't in validState above!), does it handle it?

// Let's check if validState included 'isVariableMode'.
// looking at `serializeStateToURL` in main.js line 150...
// It collects: mode, spot, weather... slapFish... stratA...
// It does NOT collect `isVariableMode` from checkbox!
// -> BUG FOUND: Share URL does not contain "isVariableMode" flag.

console.log("Check for isVariableMode in serialized state:");
if (validState.hasOwnProperty('isVariableMode')) {
    console.log("[INFO] Test state has variable mode (simulated)");
} else {
    console.log("[WARN] logic_master.js serializeStateToURL DOES NOT seemingly include isVariableMode based on previous read.");
}

