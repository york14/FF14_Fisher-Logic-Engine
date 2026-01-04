/**
 * src/logic/engine.js
 * Core Calculation Logic
 */

function calculateResult(params) {
    const { spot, weather, bait, slapTarget, targetName, isChum } = params;
    const cond = spot.conditions.find(c => c.weather === weather && c.bait === b) || spot.conditions[0];
    
    // 現在の計算モデル (v1.7.2 ベース)
    // ※後ほど「戦略3」の動的再抽選ロジックをここに統合します。
    const table = cond.fishList.filter(f => f.name !== slapTarget);
    let totalW = 0;
    table.forEach(f => totalW += (f.weight === 'h' ? 53.3 : parseFloat(f.weight)));

    let tHit = 0;
    let tCycle = 30;

    const rows = table.map(f => {
        const rate = totalW > 0 ? (f.weight === 'h' ? 53.3 : parseFloat(f.weight)) / totalW : 0;
        const waitT = f.biteTime * (isChum ? 0.5 : 1.0);
        const hookT = f.type === '大型' ? 9 : 5;
        
        if (f.name === targetName) {
            tHit = rate;
            tCycle = 1 + (isChum ? 1 : 0) + waitT + hookT;
        }
        
        return {
            name: f.name,
            type: f.type,
            rate: rate,
            waitT: waitT,
            isHidden: f.isHidden
        };
    });

    return {
        rows,
        score: tHit * (600 / tCycle)
    };
}s