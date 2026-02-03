const { Buffer } = require('buffer');

// The EXACT payload I gave the user
const payload = "eyJ2ZXJzaW9uIjozLCJtb2RlIjoibWFudWFsIiwic3BvdCI6IuOCouODrOOCr%2BOCteODs%2BODieODquOCouaXp%2BW4guihlyIsIndlYXRoZXIiOiLpnKfmmbTjgowxMi0xNiIsImJhaXQiOiLntIXjgrXjgrciLCJ0YXJnZXQiOiLjgrTjg7zjg6vjg4fjg7PjgrDjg6vjg7zjg5Hjg7wiLCJpc0NhdGNoQWxsIjpmYWxzZSwiaXNWYXJpYWJsZU1vZGUiOnRydWUsInNsYXBGaXNoIjoi44Gq44GXIiwiaXNDaHVtIjp0cnVlLCJsdXJlVHlwZSI6IuOCouODfeODi%2BOCt%2BODo%2BOCueODq%2BOCouODvCIsImx1cmVDb3VudCI6IjEiLCJsdXJlU3RlcDEiOiJkaXNjIiwibHVyZVN0ZXAyIjoibm9uZSIsImx1cmVTdGVwMyI6Im5vbmUiLCJzdHJhdEEiOnt9LCJzdHJhdEIiOnt9fQ%3D%3D";

// Simulation of Browser Logic in main.js
function testDecode(dataStr) {
    try {
        console.log("Original Input:", dataStr);

        // 1. URLSearchParams.get behaviour simulation:
        // Browsers decode %XX automatically.
        let decodedParam = decodeURIComponent(dataStr);
        console.log("Step 1 (decodeURIComponent/get):", decodedParam);

        // 2. Space replacement
        if (decodedParam.includes(' ')) {
            decodedParam = decodedParam.replace(/ /g, '+');
            console.log("Step 2 (Space -> +):", decodedParam);
        } else {
            console.log("Step 2: No spaces found.");
        }

        // 3. atob (Base64 -> Binary String)
        const binaryStr = Buffer.from(decodedParam, 'base64').toString('binary');
        // Note: Node's 'binary' encoding is essentially Latin1, matching atob behavior for 00-FF range.
        // let's visualize if it looks "garbled" (it should be)
        // console.log("Step 3 (atob binary):", binaryStr);

        // 4. escape (Binary String -> Percent Encoded)
        // Since 'escape' is deprecated and behaves uniquely, checking Node's global.escape
        const escaped = global.escape(binaryStr);
        console.log("Step 4 (escape):", escaped.substring(0, 100) + "...");

        // 5. decodeURIComponent (Percent Encoded -> UTF-8 String)
        const jsonStr = decodeURIComponent(escaped);
        console.log("Step 5 (decodeURIComponent - JSON):", jsonStr);

        const config = JSON.parse(jsonStr);
        console.log("SUCCESS:", config);
    } catch (e) {
        console.error("FAILED during execution:", e);
    }
}

testDecode(payload);
