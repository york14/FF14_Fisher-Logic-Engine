/**
 * src/logic/engine.js
 * Fisher’s Logic Engine - Calculation Core
 */

// --- 1. 定数定義 (Spec v1.7.2 準拠) ---
const CONST = {
    D_CAST: 1.0,         // キャスト硬直
    D_LURE_RIGID: 2.5,   // ルアー硬直
    D_LURE_BLK: 2.5,     // ルアー演出空白
    D_HOOK: {            // 演出拘束時間
        "小型": 5.0,     // ！
        "大型": 9.0,     // ！！
        "激震": 13.0     // ！！！
    },
    D_CHUM_RIGID: 1.0    // 撒き餌硬直
};

/**
 * シミュレーション実行メイン関数
 */
function calculateSimulation(params) {
    const { spot, weather, bait, slapTarget, targetName, isChum, mode } = params;
    const cond = spot.conditions.find(c => c.weather === weather && c.bait === bait) || spot.conditions[0];
    const dynamics = cond.dynamics[slapTarget] || cond.dynamics["なし"];
    const targetFish = spot.allFish.find(name => name === targetName);

    if (mode === 'strategy3') {
        // 戦略3: 適応型（発見追従・確定終了）の期待値計算
        return runStrategy3(spot, cond, dynamics, targetName, isChum);
    } else {
        // 手動指定モード
        return runManual(spot, cond, dynamics, targetName, isChum, params.manualSequence);
    }
}

/**
 * 戦略3：適応型アルゴリズム
 * 確率木の全分岐を辿り、期待値を合算する
 */
function runStrategy3(spot, cond, dynamics, targetName, isChum) {
    let totalExpectation = 0; // P(Target) / T(Cycle) の合計
    let weightedCycleTime = 0;
    let targetProbSum = 0;

    // 1アクション目の分岐
    const pD1 = dynamics.pDisc[0];
    const pG1 = (1 - pD1) * dynamics.pGuar[0];
    const pN1 = 1 - pD1 - pG1;

    // 分岐 A: 1回目で発見 (D1) -> 戦略により 3回目まで追う
    const resA = walkSubTree(1, true, false, cond, dynamics, targetName, isChum);
    targetProbSum += pD1 * resA.prob;
    weightedCycleTime += pD1 * resA.time;

    // 分岐 B: 1回目で確定 (G1) -> 戦略により即キャスト
    const resB = calculateNodeResult(1, false, true, cond, dynamics, targetName, isChum);
    targetProbSum += pG1 * resB.prob;
    weightedCycleTime += pG1 * resB.time;

    // 分岐 C: 1回目何もなし (N1) -> 2回目へ
    const pD2 = dynamics.pDisc[1];
    const pG2 = (1 - pD2) * dynamics.pGuar[1];
    const pN2 = 1 - pD2 - pG2;

    // C-A: 2回目で発見 -> 3回目まで追う
    const resCA = walkSubTree(2, true, false, cond, dynamics, targetName, isChum);
    targetProbSum += pN1 * pD2 * resCA.prob;
    weightedCycleTime += pN1 * pD2 * resCA.time;

    // C-B: 2回目で確定 -> 即キャスト
    const resCB = calculateNodeResult(2, false, true, cond, dynamics, targetName, isChum);
    targetProbSum += pN1 * pG2 * resCB.prob;
    weightedCycleTime += pN1 * pG2 * resCB.time;

    // C-C: 2回目も何もなし -> 終了(キャスト)
    const resCC = calculateNodeResult(2, false, false, cond, dynamics, targetName, isChum);
    targetProbSum += pN1 * pN2 * resCC.prob;
    weightedCycleTime += pN1 * pN2 * resCC.time;

    const yield10m = (targetProbSum / weightedCycleTime) * 600;
    const timePerCatch = weightedCycleTime / (targetProbSum || 0.0001);

    // 表示用に行データを生成（簡略化のため代表値を使用）
    return {
        rows: generateResultRows(cond, targetProbSum),
        yield10m: yield10m.toFixed(2),
        timePerCatch: Math.round(timePerCatch)
    };
}

/**
 * 発見後のサブツリー計算 (発見n -> n+1, n+2回目へ)
 */
function walkSubTree(discStep, isDisc, isGuar, cond, dynamics, targetName, isChum) {
    if (discStep === 1) {
        // 発見1回目 -> 2回目の確定分岐
        const pG2 = dynamics.pDiscGuar["1-2"];
        const resG = calculateNodeResult(2, true, true, cond, dynamics, targetName, isChum, 1);
        const resN = calculateNodeResult(3, true, false, cond, dynamics, targetName, isChum, 1); // 確定なしなら3回目まで
        return {
            prob: (pG2 * resG.prob) + ((1 - pG2) * resN.prob),
            time: (pG2 * resG.time) + ((1 - pG2) * resN.time)
        };
    }
    // 発見2回目以降は単純化して最終ステップの結果を返す
    return calculateNodeResult(3, true, false, cond, dynamics, targetName, isChum, discStep);
}

/**
 * 特定の最終状態でターゲットが釣れる確率と時間を算出
 */
function calculateNodeResult(actionCount, isDiscovered, isGuaranteed, cond, dynamics, targetName, isChum, discoveryStep = -1) {
    const isTargetHidden = cond.fishList.find(f => f.name === targetName)?.isHidden;
    const targetFish = cond.fishList.find(f => f.name === targetName);
    
    let prob = 0;
    if (isTargetHidden) {
        if (isDiscovered) {
            const key = `${discoveryStep}-${actionCount}`;
            prob = dynamics.pDiscHit[key] || 0;
        }
    } else {
        // 通常魚の計算（Hiddenに取られた残りの確率を重みで分配）
        const hiddenProb = isDiscovered ? (dynamics.pDiscHit[`${discoveryStep}-${actionCount}`] || 0) : 0;
        const multipliers = { 0: 1, 1: 1.5, 2: 2, 3: 6 };
        const M = multipliers[actionCount];
        const gType = isGuaranteed ? (targetFish.type) : null; // 本来はルアー種類に依存
        
        // 簡易的な重み計算
        let totalW = 0;
        cond.fishList.forEach(f => {
            if (f.isHidden) return;
            let w = parseFloat(f.weight) || 0;
            if (gType && f.type !== gType) w = 0;
            if (f.type === targetFish.type) w *= M;
            totalW += w;
        });
        prob = (1 - hiddenProb) * (targetFish.weight * M / totalW);
    }

    const waitT = Math.max(targetFish.biteTime * (isChum ? 0.5 : 1.0), (actionCount * CONST.D_LURE_RIGID) + CONST.D_LURE_BLK);
    const hookT = CONST.D_HOOK[targetFish.type] || 9;
    const time = CONST.D_CAST + (isChum ? CONST.D_CHUM_RIGID : 0) + waitT + hookT;

    return { prob, time };
}

function generateResultRows(cond, targetProb) {
    // UI表示用にテーブル1の内容をベースに調整
    return cond.fishList.map(f => ({
        name: f.name,
        type: f.type,
        rate: f.name.includes('グルーパー') ? targetProb : (1 - targetProb) / (cond.fishList.length - 1),
        waitT: f.biteTime,
        isHidden: f.isHidden
    }));
}