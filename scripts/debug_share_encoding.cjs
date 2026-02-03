const { Buffer } = require('buffer');

// 1. Logic copied EXACTLY from main.js (Client Side)
function parseShareData_MainJS(dataStr) {
    if (dataStr.includes(' ')) dataStr = dataStr.replace(/ /g, '+');
    try {
        // MDN: decodeURIComponent(escape(window.atob(str)))
        // We need to simulate browser's atob, escape, decodeURIComponent
        const binaryString = atob_browser_sim(dataStr);
        const escaped = escape_sim(binaryString);
        const jsonStr = decodeURIComponent(escaped);
        return JSON.parse(jsonStr);
    } catch (e) {
        return { error: e.message, stack: e.stack };
    }
}

// 2. Logic used in my previous test (Server Side Node Simulation)
function btoa_node_prev(str) {
    // In previous script: btoa was Buffer.from(str, 'binary').toString('base64')
    // And input was unescape(encodeURIComponent(jsonStr))
    // Let's see if that produced valid output.
    return Buffer.from(str, 'binary').toString('base64');
}

// Browser Polyfills for Node
function atob_browser_sim(str) {
    return Buffer.from(str, 'base64').toString('binary');
}

// escape is deprecated but available in Node/V8 usually. 
// If not, we need a polyfill, but main.js relies on browser's escape.
// Browser escape: replaces non-ASCII with %xx or %uxxxx.
// Actually, 'escape' behavior on binary strings (0-255) is specific.
function escape_sim(str) {
    return global.escape(str);
}


// 3. The Broken URL Payload (from User Report / History)
const brokenPayload = "eyJ2ZXJzaW9uIjozLCJtb2RlIjoibWFudWFsIiwic3BvdCI6IuOCouODrOOCr_jgteODs_ODieODquOCouaXp_W4guihlyIsIndlYXRoZXIiOiLpnKfmmbTjgowxMi0xNiIsImJhaXQiOiLntIXjgrXjgrciLCJ0YXJnZXQiOiLjgrTjg7zjg6vjg4fjg7PjgrDjg6vjg7zjg5Hjg7wiLCJpc0NhdGNoQWxsIjpmYWxzZSwic2xhcEZpc2giOiLjgarjgZciLCJpc0NodW0iOnRydWUsImx1cmVUeXBlIjoi44Ki44Oz44OT44K344Oj44K544Or44Ki44O8IiwibHVyZUNvdW50IjoiMSIsImx1cmVTdGVwMSI6ImRpc2MiLCJsdXJlU3RlcDIiOiJub25lIiwibHVyZVN0ZXAzIjoibm9uZSIsInN0cmF0QSI6e30sInN0cmF0QiI6e319";
// Note: In the tool output, there was a %2B or similar? 
// The tool output in previous turn: ...IuOCouODrOOCr_jgteODs_ODieODquOCouaXp_W4guihlyIsIm...
// Wait, `_` and `-`? That looks like URL-safe Base64?
// My previous script using encodeURIComponent(base64) would convert `+` to `%2B` and `/` to `%2F`.
// But the URL I pasted in the output has `_` and `-` ...?
// Ah, `IuOCouODrOOCr_jgteODs_ODieODquOCouaXp_W4guihlyIsIm`
// Base64 usually uses `+` and `/`. 
// If I see `_` and `-`, that is URL-Safe Base64.
// BUT `main.js` does NOT implement URL-Safe Base64 decoding (replace - with +, _ with /).
// main.js only does `dataStr.replace(/ /g, '+')`. It does NOT replace `_` or `-`.

// Let's check my previous script logic:
// const safeBase64 = encodeURIComponent(base64);
// `encodeURIComponent` does NOT change `+` or `/` to `_` or `-`. It changes them to `%2B` and `%2F`.
// So where did `_` come from? 
// Looking at the URL I gave to user:
// `http://localhost:3000/share.html?data=eyJ2ZXJza...`
// Wait, the text I see above in "brokenPayload" might be my hallucination or me misreading the previous tool output.
// Let's look at the ACTUAL generated output from Step 336:
// `Generated URL: http://localhost:3000/share.html?data=eyJ2ZXJza...jc10%3D` (truncated visual)
// Output: `...ODieODquOCouaXp%2BW4guihlyIsInd...`
// It has `%2B` (which is `+`).
// So my script produced standard Base64 with % encoding.

// Debug Case 1: Try to decode the payload assuming it was properly passed.
// I will assume the browser decoded the %xx.
console.log("=== Debugging Payload ===");

// Reconstructing the payload I gave (this is an approximation, I'll generate a fresh one to be sure)
// Let's just run the Generator again and see what it outputs, then try to decode it with main.js logic.

const testState = {
    version: 3,
    spot: "アレクサンドリア旧市街" // Japanese text is key
};

// My Node Gen Logic
function nodeGen(state) {
    const json = JSON.stringify(state);
    // unescape is deprecated. using basic Buffer
    // logic: btoa(unescape(encodeURIComponent(jsonStr)))

    // Step 1: encodeURIComponent (UTF-8 -> URI String)
    const uri = encodeURIComponent(json);
    // Step 2: unescape (URI String -> Binary String)
    const binary = global.unescape(uri);
    // Step 3: btoa (Binary String -> Base64)
    const b64 = Buffer.from(binary, 'binary').toString('base64');

    return encodeURIComponent(b64);
}

const generatedEnc = nodeGen(testState);
console.log("Generated (Encoded):", generatedEnc);

const generatedBase64 = decodeURIComponent(generatedEnc);
console.log("Generated (Base64):", generatedBase64);

// Main JS Decode Logic
console.log("--- Attempting Main.js Decode ---");
// 4. Generate the FULL URL for the User
const fullState = {
    version: 3,
    mode: 'manual',
    spot: "アレクサンドリア旧市街",
    weather: "霧晴れ12-16",
    bait: "紅サシ",
    target: "ゴールデングルーパー",
    isCatchAll: false,
    isVariableMode: true, // Enable Variable Mode
    slapFish: "なし",
    isChum: true,
    lureType: "アンビシャスルアー",
    lureCount: "1",
    lureStep1: "disc",
    lureStep2: "none",
    lureStep3: "none",
    stratA: {}, stratB: {}
};

console.log("\n=== Generating Full Share URL ===");
const encodedParam = nodeGen(fullState);
const fullUrl = `http://localhost:3000/share.html?data=${encodedParam}`;
console.log("THE_URL_START");
console.log(fullUrl);
console.log("THE_URL_END");

// Verify it immediately
const decodedBase64 = decodeURIComponent(encodedParam);
const decodedObj = parseShareData_MainJS(decodedBase64);

if (decodedObj.target === fullState.target) {
    console.log("[PASS] Generated URL verifies correctly.");
} else {
    console.error("[FAIL] Verification failed on generated URL.");
}

