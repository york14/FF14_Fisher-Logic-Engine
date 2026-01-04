/**
 * src/logic/engine.js
 */
const CONST = {
    D_CAST: 1.0, D_LURE_RIGID: 2.5, D_LURE_BLK: 2.5,
    D_HOOK: { "小型": 5.0, "大型": 9.0, "激震": 13.0 },
    D_CHUM_RIGID: 1.0
};

function calculateSimulation(params) {
    const { spot, weather, bait, slapTarget, targetName, isChum, mode } = params;
    const cond = spot.conditions.find(c => c.weather === weather && c.bait === bait) || spot.conditions[0];
    const dynamics = cond.dynamics[slapTarget] || cond.dynamics["なし"];

    if (mode === 'strategy3') {
        return runStrategy3(spot, cond, dynamics, targetName, isChum);
    } else {
        // 手動モード用の実行関数
        return runManual(spot, cond, dynamics, targetName, isChum, params.manualSequence || []);
    }
}

// 手動指定モードのロジック
function runManual(spot, cond, dynamics, targetName, isChum, sequence) {
    let dStep = -1, gType = null;
    sequence.forEach((s, i) => {
        if (s === "発見") dStep = i + 1;
        if (s === "確定") gType = "大型"; // 簡易的に大型固定
    });

    const res = calculateNodeResult(sequence.length, dStep !== -1, gType !== null, cond, dynamics, targetName, isChum, dStep);
    return {
        rows: generateResultRows(cond, res.prob, targetName),
        yield10m: ((res.prob / res.time) * 600).toFixed(2),
        timePerCatch: Math.round(res.time / (res.prob || 0.0001))
    };
}

function runStrategy3(spot, cond, dynamics, targetName, isChum) {
    let targetProbSum = 0, weightedTime = 0;
    const pD1 = dynamics.pDisc[0];
    const pG1 = (1 - pD1) * dynamics.pGuar[0];
    const pN1 = 1 - pD1 - pG1;

    const resA = walkSubTree(1, true, false, cond, dynamics, targetName, isChum);
    targetProbSum += pD1 * resA.prob; weightedTime += pD1 * resA.time;

    const resB = calculateNodeResult(1, false, true, cond, dynamics, targetName, isChum);
    targetProbSum += pG1 * resB.prob; weightedTime += pG1 * resB.time;

    const pD2 = dynamics.pDisc[1];
    const pG2 = (1 - pD2) * dynamics.pGuar[1];
    const pN2 = 1 - pD2 - pG2;

    const resCA = walkSubTree(2, true, false, cond, dynamics, targetName, isChum);
    targetProbSum += pN1 * pD2 * resCA.prob; weightedTime += pN1 * pD2 * resCA.time;

    const resCB = calculateNodeResult(2, false, true, cond, dynamics, targetName, isChum);
    targetProbSum += pN1 * pG2 * resCB.prob; weightedTime += pN1 * pG2 * resCB.time;

    const resCC = calculateNodeResult(2, false, false, cond, dynamics, targetName, isChum);
    targetProbSum += pN1 * pN2 * resCC.prob; weightedTime += pN1 * pN2 * resCC.time;

    return {
        rows: generateResultRows(cond, targetProbSum, targetName),
        yield10m: ((targetProbSum / weightedTime) * 600).toFixed(2),
        timePerCatch: Math.round(weightedTime / (targetProbSum || 0.0001))
    };
}

function walkSubTree(discStep, isDisc, isGuar, cond, dynamics, targetName, isChum) {
    if (discStep === 1) {
        const pG2 = dynamics.pDiscGuar["1-2"];
        const resG = calculateNodeResult(2, true, true, cond, dynamics, targetName, isChum, 1);
        const resN = calculateNodeResult(3, true, false, cond, dynamics, targetName, isChum, 1);
        return { prob: (pG2 * resG.prob) + ((1 - pG2) * resN.prob), time: (pG2 * resG.time) + ((1 - pG2) * resN.time) };
    }
    return calculateNodeResult(3, true, false, cond, dynamics, targetName, isChum, discStep);
}

function calculateNodeResult(actionCount, isDiscovered, isGuaranteed, cond, dynamics, targetName, isChum, discoveryStep = -1) {
    const targetFish = cond.fishList.find(f => f.name === targetName);
    if (!targetFish) return { prob: 0, time: 30 };

    let prob = 0;
    if (targetFish.isHidden) {
        if (isDiscovered) {
            const key = `${discoveryStep}-${actionCount}`;
            prob = dynamics.pDiscHit[key] || 0;
        }
    } else {
        const hiddenProb = isDiscovered ? (dynamics.pDiscHit[`${discoveryStep}-${actionCount}`] || 0) : 0;
        const M = { 0: 1, 1: 1.5, 2: 2, 3: 6 }[actionCount];
        let totalW = 0;
        cond.fishList.forEach(f => {
            if (f.isHidden) return;
            let w = parseFloat(f.weight) || 0;
            if (isGuaranteed && f.type !== targetFish.type) w = 0;
            if (f.type === targetFish.type) w *= M;
            totalW += w;
        });
        prob = (1 - hiddenProb) * (targetFish.weight * M / (totalW || 1));
    }

    const waitT = Math.max(targetFish.biteTime * (isChum ? 0.5 : 1.0), (actionCount * CONST.D_LURE_RIGID) + CONST.D_LURE_BLK);
    const time = CONST.D_CAST + (isChum ? CONST.D_CHUM_RIGID : 0) + waitT + (CONST.D_HOOK[targetFish.type] || 9);
    return { prob, time };
}

function generateResultRows(cond, targetProb, targetName) {
    return cond.fishList.map(f => ({
        name: f.name, type: f.type, isHidden: f.isHidden,
        rate: f.name === targetName ? targetProb : (1 - targetProb) / (cond.fishList.length - 1),
        waitT: f.biteTime
    }));
}