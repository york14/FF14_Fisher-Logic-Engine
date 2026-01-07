/**
 * src/logic/engine.js (Updated to v3.3.0)
 */
const CONST = {
    D_CAST: 1.0,           // キャスト硬直
    D_LURE_RIGID: 2.5,     // ルアーアクション硬直
    D_LURE_BLK: 2.5,       // ルアー後空白
    D_HOOK: { "小型": 5.0, "大型": 10.0, "激震": 15.0 }, // 釣り上げ動作時間
    D_REST: 2.0,           // 竿上げ硬直
    D_CHUM_RIGID: 1.0,     // 撒き餌使用硬直
    C_CHUM: 0.6            // 撒き餌短縮補正
};

function calculateSimulation(params) {
    const { spot, weather, bait, slapTarget, targetName, isChum, mode, skipMode } = params;
    const cond = spot.conditions.find(c => c.weather === weather && c.bait === bait) || spot.conditions[0];
    const dynamics = cond.dynamics[slapTarget] || cond.dynamics["なし"];

    if (mode === 'manual') {
        const actionCount = params.manualSequence ? params.manualSequence.length : 0;
        return runManual(spot, cond, dynamics, targetName, isChum, skipMode, params.manualSequence || [], params.lureTargetType, actionCount);
    } else {
        // TODO: Strategy 等の自動計算モードは今後実装
        return { rows: [], yield180: 0, timePerCatch: 0 };
    }
}

function runManual(spot, cond, dynamics, targetName, isChum, skipMode, sequence, lureTargetType, actionCount) {
    let dStep = -1, isG = false;
    sequence.forEach((s, i) => {
        if (s === "発見") dStep = i + 1;
        if (s === "確定") isG = true;
    });

    const res = calculateNodeResult(actionCount, dStep !== -1, isG, cond, dynamics, targetName, isChum, skipMode, dStep, lureTargetType);
    
    return {
        rows: generateResultRows(cond, res.prob, targetName, skipMode, isChum, actionCount),
        // 3分間あたりの期待獲得量 (Yield / 180s) へ変更
        yield180: ((res.prob / res.time) * 180).toFixed(3), 
        // 1匹獲得までの期待時間 (Expected Time to Catch)
        timePerCatch: Math.round(res.time / (res.prob || 0.0001)) 
    };
}

function calculateNodeResult(actionCount, isD, isG, cond, dynamics, targetName, isChum, skipMode, dStep = -1, lureTargetType = "大型") {
    const targetFish = cond.fishList.find(f => f.name === targetName);
    if (!targetFish) return { prob: 0, time: 30 };

    let prob = 0;
    // --- Hit率算出 (第2章 / 第5章) ---
    if (targetFish.isHidden) {
        if (isD) {
            const key = `${dStep}-${actionCount}`;
            prob = dynamics.pDiscHit[key] || 0;
        }
    } else {
        const hiddenProb = isD ? (dynamics.pDiscHit[`${dStep}-${actionCount}`] || 0) : 0;
        const M = { 0: 1, 1: 1.5, 2: 2, 3: 6 }[actionCount]; // 重み補正倍率
        
        let totalW = 0;
        cond.fishList.forEach(f => {
            if (f.isHidden) return;
            let w = parseFloat(f.weight) || 0;
            if (isG && f.type !== lureTargetType) w = 0; // 型確定の効果
            if (f.type === lureTargetType) w *= M;       // 重み補正の常時適用
            totalW += w;
        });
        
        const targetW = targetFish.weight * (targetFish.type === lureTargetType ? M : 1);
        prob = (1 - hiddenProb) * (targetW / (totalW || 1));
    }

    // --- 時間算出 (第4章) ---
    // 空白時間 T_Blank = D_Cast + (n * D_Lure) + D_Blk
    const blankT = CONST.D_CAST + (actionCount * CONST.D_LURE_RIGID) + CONST.D_LURE_BLK;
    
    const chumMult = isChum ? CONST.C_CHUM : 1.0;
    const waitT = targetFish.biteTime * chumMult;
    
    // 実効待機時間 T_Final = max(T_Bite * C_Chum, T_Blank)
    const finalWait = Math.max(waitT, blankT);
    
    let hookT = CONST.D_HOOK[targetFish.type] || 10;
    // ハズレ時の「竿上げ」対応
    if (skipMode === 'rest' && targetFish.name !== targetName) hookT = CONST.D_REST; 

    // 合計サイクル時間 T_Cycle
    const time = (isChum ? CONST.D_CHUM_RIGID : 0) + CONST.D_CAST + finalWait + hookT;
    
    return { prob, time };
}

function generateResultRows(cond, targetProb, targetName, skipMode, isChum, actionCount) {
    const chumMult = isChum ? CONST.C_CHUM : 1.0;
    const blankT = CONST.D_CAST + (actionCount * CONST.D_LURE_RIGID) + CONST.D_LURE_BLK;

    return cond.fishList.map(f => {
        let hookType = f.type === '大型' ? "！！" : "！";
        if (f.type === '激震') hookType = "！！！";
        if (skipMode === 'rest' && f.name !== targetName) hookType = "竿上げ";
        
        return {
            name: f.name, type: f.type, isHidden: f.isHidden,
            // 表示用の簡易確率計算
            rate: f.name === targetName ? targetProb : (1 - targetProb) / (cond.fishList.length - 1),
            waitT: f.biteTime * chumMult,
            blankT: blankT,
            hookType: hookType
        };
    });
}