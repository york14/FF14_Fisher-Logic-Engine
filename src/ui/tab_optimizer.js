
/**
 * Optimizer Tab Controller v4.0 (総合戦略評価)
 * 
 * 2つの戦略セット（GP赤字 A / GP黒字 B）を組み合わせ、
 * 制限時間内でGPをちょうど使い切る最適配分を連立方程式で求める。
 */
import { calculateStrategySet } from '../core/calculator.js';
import { calculateGPBalance, GP_CONSTANTS } from '../core/optimizer.js';

export function initOptimizerTab(masterDB, probabilityMap) {
    const runBtn = document.getElementById('opt-run-btn');
    if (runBtn) {
        runBtn.addEventListener('click', () => {
            runOptimizationV2(masterDB, probabilityMap);
        });
    }

    // Lure type change → filter presets (enable/disable no_lure vs lure presets)
    ['optA', 'optB'].forEach(prefix => {
        const lureEl = document.getElementById(`${prefix}Lure`);
        if (lureEl) {
            lureEl.addEventListener('change', () => {
                filterOptimizerPresets(prefix, lureEl.value, masterDB);
            });
            // Initial filter
            filterOptimizerPresets(prefix, lureEl.value, masterDB);
        }
    });
}

/**
 * Filters presets based on lure type selection.
 * no_lure preset: only when lure = 'none'
 * Other presets: only when lure != 'none'
 */
function filterOptimizerPresets(prefix, lureType, masterDB) {
    const presetSel = document.getElementById(`${prefix}Preset`);
    if (!presetSel) return;
    const isNoLure = (lureType === 'none');

    Array.from(presetSel.options).forEach(opt => {
        const isNoLurePreset = (opt.value === 'no_lure');
        opt.disabled = isNoLure ? !isNoLurePreset : isNoLurePreset;
    });

    // If current selection is disabled, auto-select first enabled option
    if (presetSel.options[presetSel.selectedIndex]?.disabled) {
        const firstEnabled = Array.from(presetSel.options).find(o => !o.disabled);
        if (firstEnabled) presetSel.value = firstEnabled.value;
    }
}

/**
 * Main optimization entry point.
 * Reads UI inputs, calculates strategy stats, solves the linear system, and renders results.
 */
function runOptimizationV2(masterDB, probabilityMap) {
    console.log("Starting Optimization V2 (総合戦略評価)...");

    // --- 1. Gather Common Inputs ---
    const spot = document.getElementById('currentSpot').value;
    const weather = document.getElementById('currentWeather').value;
    const bait = document.getElementById('currentBait').value;
    const target = document.getElementById('targetFishName').value;
    const isCatchAll = document.getElementById('isCatchAll').checked;

    const T = parseInt(document.getElementById('opt-window-time').value || 350, 10);
    const GP0 = parseInt(document.getElementById('opt-initial-gp').value || 1000, 10);
    const saljakCount = parseInt(document.getElementById('opt-saljak-count').value || 0, 10);
    const totalGP = GP0 + saljakCount * 150;

    const calcConfig = { spot, weather, bait, target, isCatchAll };

    // --- 2. Gather Strategy Set configs ---
    const getSetConfig = (prefix) => {
        return {
            presetId: document.getElementById(`${prefix}Preset`).value,
            slapFish: document.getElementById(`${prefix}Slap`).value,
            isChum: document.getElementById(`${prefix}Chum`).value === 'yes',
            lureType: document.getElementById(`${prefix}Lure`).value,
            quitIfNoDisc: false     // Not applicable for optimizer
        };
    };

    const setConfigA = getSetConfig('optA');
    const setConfigB = getSetConfig('optB');

    // --- 3. Find presets ---
    const presetA = masterDB.strategy_presets.find(p => p.id === setConfigA.presetId);
    const presetB = masterDB.strategy_presets.find(p => p.id === setConfigB.presetId);

    if (!presetA || !presetB) {
        renderOptimizerError("プリセットが選択されていません。戦略セットA/Bのルアー戦略を選択してください。");
        return;
    }

    // --- 4. Calculate strategy stats ---
    const resultA = calculateStrategySet(masterDB, probabilityMap, calcConfig, setConfigA, presetA);
    const resultB = calculateStrategySet(masterDB, probabilityMap, calcConfig, setConfigB, presetB);

    if (resultA.error) { renderOptimizerError(`戦略セットA エラー: ${resultA.error}`); return; }
    if (resultB.error) { renderOptimizerError(`戦略セットB エラー: ${resultB.error}`); return; }

    // --- 5. Calculate GP balance per cycle ---
    const gpCostA = resultA.gpStats.cost.total;
    const gpCostB = resultB.gpStats.cost.total;
    const cycleA = resultA.avgCycle;
    const cycleB = resultB.avgCycle;
    const hitRateA = resultA.avgHitRate;
    const hitRateB = resultB.avgHitRate;

    const gpBalanceA = calculateGPBalance(cycleA, gpCostA);
    const gpBalanceB = calculateGPBalance(cycleB, gpCostB);

    const gpNetA = gpBalanceA.balance;  // GP回復 - GP消費 (should be negative for "赤字")
    const gpNetB = gpBalanceB.balance;  // GP回復 - GP消費 (should be positive for "黒字")

    console.log(`Set A: cycle=${cycleA.toFixed(1)}s, hit=${hitRateA.toFixed(4)}, gpCost=${gpCostA}, gpNet=${gpNetA.toFixed(1)}`);
    console.log(`Set B: cycle=${cycleB.toFixed(1)}s, hit=${hitRateB.toFixed(4)}, gpCost=${gpCostB}, gpNet=${gpNetB.toFixed(1)}`);

    // --- 6. Validate GP赤字/黒字 ---
    let warnings = [];
    if (gpNetA >= 0) {
        warnings.push(`⚠️ 戦略セットA はGP黒字です（net: +${gpNetA.toFixed(1)}/cyc）。赤字側として使用されますが、最適配分が有意義にならない可能性があります。`);
    }
    if (gpNetB < 0) {
        warnings.push(`⚠️ 戦略セットB はGP赤字です（net: ${gpNetB.toFixed(1)}/cyc）。黒字側として使用されますが、GPが枯渇する可能性があります。`);
    }

    // --- 7. Solve linear system ---
    // n_A * cycle_A + n_B * cycle_B = T            ... (1) Time
    // n_A * gpNet_A + n_B * gpNet_B = -totalGP      ... (2) GP exhaustion
    //
    // Matrix form: [cycle_A, cycle_B] [n_A]   [T       ]
    //              [gpNet_A, gpNet_B] [n_B] = [-totalGP ]

    const det = cycleA * gpNetB - cycleB * gpNetA;

    if (Math.abs(det) < 1e-9) {
        renderOptimizerError("連立方程式の解が定まりません（行列式≈0）。2つの戦略セットのGP効率が同一か近すぎます。");
        return;
    }

    const nA = (T * gpNetB - (-totalGP) * cycleB) / det;
    const nB = ((-totalGP) * cycleA - T * gpNetA) / det;

    // Correct formula: Using Cramer's rule
    // nA = (T * gpNetB - (-totalGP) * cycleB) / det = (T * gpNetB + totalGP * cycleB) / det
    // nB = ((-totalGP) * cycleA - T * gpNetA) / det = (-totalGP * cycleA - T * gpNetA) / det

    console.log(`Solution: nA=${nA.toFixed(2)}, nB=${nB.toFixed(2)}`);

    // --- 8. Validate solution ---
    let solutionValid = true;
    let solutionWarnings = [];

    if (nA < 0) {
        solutionWarnings.push(`戦略セットAの使用回数が負（${nA.toFixed(2)}）です。時間・GP条件下でAは不要です。`);
        solutionValid = false;
    }
    if (nB < 0) {
        solutionWarnings.push(`戦略セットBの使用回数が負（${nB.toFixed(2)}）です。時間・GP条件下でBは不要です。`);
        solutionValid = false;
    }

    // --- 9. Calculate results ---
    const expectedCatch = nA * hitRateA + nB * hitRateB;
    const expectedTimePerCatch = expectedCatch > 0 ? T / expectedCatch : Infinity;

    const result = {
        T, GP0, saljakCount, totalGP,
        setA: {
            name: presetA.name,
            slap: setConfigA.slapFish,
            chum: setConfigA.isChum,
            cycle: cycleA,
            hitRate: hitRateA,
            gpCost: gpCostA,
            gpRecovery: gpBalanceA.recovered,
            gpNet: gpNetA,
            n: nA,
            stratResult: resultA
        },
        setB: {
            name: presetB.name,
            slap: setConfigB.slapFish,
            chum: setConfigB.isChum,
            cycle: cycleB,
            hitRate: hitRateB,
            gpCost: gpCostB,
            gpRecovery: gpBalanceB.recovered,
            gpNet: gpNetB,
            n: nB,
            stratResult: resultB
        },
        nA, nB,
        expectedCatch,
        expectedTimePerCatch,
        solutionValid,
        warnings: [...warnings, ...solutionWarnings],
        det
    };

    console.log("Optimization Result:", result);
    renderOptimizerResult(result);
}


/**
 * Renders the optimization result to the center panel and debug panel.
 */
function renderOptimizerResult(result) {
    const container = document.getElementById('result-content');
    const optContainer = document.getElementById('opt-results-container');
    if (!container) return;

    // Hide opt-results-container (legacy), use result-content
    if (optContainer) optContainer.style.display = 'none';

    const { setA, setB, T, totalGP, expectedCatch, expectedTimePerCatch, nA, nB, solutionValid, warnings, GP0, saljakCount } = result;

    const formatLabel = (set) => {
        let label = set.name;
        if (set.chum) label += '+撒き餌';
        if (set.slap !== 'なし') label += `+TR(${set.slap})`;
        return label;
    };

    // Warning banner
    let warningHtml = '';
    if (warnings.length > 0) {
        warningHtml = `<div style="background:rgba(239,68,68,0.15); border:1px solid var(--accent-red); border-radius:6px; padding:12px; margin-bottom:20px; font-size:0.85rem; color:#fca5a5;">
            ${warnings.map(w => `<div style="margin-bottom:4px;">${w}</div>`).join('')}
        </div>`;
    }

    // Summary card
    const validityBadge = solutionValid
        ? '<span style="color:var(--accent-green); font-weight:bold;">✅ 有効</span>'
        : '<span style="color:var(--accent-red); font-weight:bold;">❌ 不成立</span>';

    let html = warningHtml + `
        <div style="background:rgba(59,130,246,0.1); border:1px solid var(--primary); padding:20px; border-radius:8px; margin-bottom:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <div style="font-size:0.8rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px;">総合戦略評価結果</div>
                ${validityBadge}
            </div>
            <div style="display:flex; gap:30px; align-items:baseline; flex-wrap:wrap;">
                <div>
                    <span style="font-size:2.5rem; font-weight:bold; color:var(--text-main);">${expectedCatch.toFixed(2)}</span>
                    <span style="font-size:0.9rem; color:var(--text-muted);">匹 / ${T}秒</span>
                </div>
                <div>
                    <span style="font-size:1.5rem; font-weight:bold; color:var(--text-main);">${expectedTimePerCatch === Infinity ? '∞' : expectedTimePerCatch.toFixed(1)}s</span>
                    <span style="font-size:0.8rem; color:var(--text-muted);">/ 1匹</span>
                </div>
            </div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:10px;">
                初期GP: ${GP0} ${saljakCount > 0 ? `+ サリャク×${saljakCount} (${saljakCount * 150}GP)` : ''} = 総GP ${totalGP}
            </div>
        </div>
    `;

    // Strategy Set Cards (side by side)
    const buildSetCard = (set, label, borderColor, n) => {
        const gpNetColor = set.gpNet >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
        const gpNetSign = set.gpNet >= 0 ? '+' : '';
        return `
        <div class="strat-card" style="border-top: 3px solid ${borderColor};">
            <h4 style="color:${borderColor};">${label}</h4>
            <div style="font-size:0.85rem; color:#ccc; margin-bottom:10px;">${formatLabel(set)}</div>
            <div style="font-size:2rem; font-weight:bold; margin:10px 0;">${n.toFixed(2)}<span style="font-size:0.9rem; color:var(--text-muted);">回</span></div>
            <div class="stat-row" style="flex-wrap:wrap; gap:10px;">
                <div class="stat-item">
                    <span>Cycle</span>
                    <span class="stat-val">${set.cycle.toFixed(1)}s</span>
                </div>
                <div class="stat-item">
                    <span>Hit Rate</span>
                    <span class="stat-val">${(set.hitRate * 100).toFixed(1)}%</span>
                </div>
                <div class="stat-item">
                    <span>GP/cyc</span>
                    <span class="stat-val" style="color:${gpNetColor};">${gpNetSign}${set.gpNet.toFixed(1)}</span>
                </div>
            </div>
            <div style="margin-top:10px; font-size:0.75rem; color:var(--text-muted);">
                消費: ${set.gpCost.toFixed(1)}GP | 回復: ${set.gpRecovery.toFixed(0)}GP
            </div>
        </div>`;
    };

    html += `
        <div class="comparison-container">
            ${buildSetCard(setA, '戦略セットA', 'var(--accent-red)', nA)}
            ${buildSetCard(setB, '戦略セットB', 'var(--accent-green)', nB)}
        </div>
    `;

    container.innerHTML = html;

    // --- Debug Panel ---
    renderOptimizerDebug(result);
}


/**
 * Renders debug details in the right panel.
 */
function renderOptimizerDebug(result) {
    const wrapper = document.getElementById('debug-content-wrapper');
    if (!wrapper) return;

    const { setA, setB, T, totalGP, nA, nB, det, expectedCatch, expectedTimePerCatch } = result;

    let html = `
        <div class="debug-section">
            <div class="section-label">連立方程式パラメータ</div>
            <div class="formula-box">
n_A × ${setA.cycle.toFixed(1)} + n_B × ${setB.cycle.toFixed(1)} = ${T}  ... (時間)<br>
n_A × (${setA.gpNet.toFixed(1)}) + n_B × (${setB.gpNet.toFixed(1)}) = ${(-totalGP).toFixed(0)}  ... (GP)<br>
<br>
det = ${det.toFixed(2)}<br>
<strong>n_A = ${nA.toFixed(4)}</strong><br>
<strong>n_B = ${nB.toFixed(4)}</strong>
            </div>
        </div>

        <div class="debug-section">
            <div class="section-label">期待値計算</div>
            <div class="formula-box">
期待獲得数 = n_A × hitRate_A + n_B × hitRate_B<br>
= ${nA.toFixed(2)} × ${setA.hitRate.toFixed(4)} + ${nB.toFixed(2)} × ${setB.hitRate.toFixed(4)}<br>
= <strong>${expectedCatch.toFixed(4)}</strong> 匹<br>
<br>
1匹あたり期待時間 = ${T} / ${expectedCatch.toFixed(4)} = <strong>${expectedTimePerCatch === Infinity ? '∞' : expectedTimePerCatch.toFixed(1)}s</strong>
            </div>
        </div>

        <div class="debug-section">
            <div class="section-label">GP収支 内訳</div>
            <table>
                <thead>
                    <tr><th></th><th>セットA</th><th>セットB</th></tr>
                </thead>
                <tbody>
                    <tr><td>サイクル</td><td>${setA.cycle.toFixed(1)}s</td><td>${setB.cycle.toFixed(1)}s</td></tr>
                    <tr><td>GP消費</td><td>${setA.gpCost.toFixed(1)}</td><td>${setB.gpCost.toFixed(1)}</td></tr>
                    <tr><td>GP回復</td><td>${setA.gpRecovery.toFixed(0)}</td><td>${setB.gpRecovery.toFixed(0)}</td></tr>
                    <tr><td>GP収支</td>
                        <td style="color:${setA.gpNet >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">${setA.gpNet >= 0 ? '+' : ''}${setA.gpNet.toFixed(1)}</td>
                        <td style="color:${setB.gpNet >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">${setB.gpNet >= 0 ? '+' : ''}${setB.gpNet.toFixed(1)}</td>
                    </tr>
                    <tr><td>Hit Rate</td><td>${(setA.hitRate * 100).toFixed(2)}%</td><td>${(setB.hitRate * 100).toFixed(2)}%</td></tr>
                    <tr><td>使用回数</td>
                        <td><strong>${nA.toFixed(2)}</strong></td>
                        <td><strong>${nB.toFixed(2)}</strong></td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="debug-section">
            <div class="section-label">検証: 時間消費</div>
            <div class="formula-box">
${nA.toFixed(2)} × ${setA.cycle.toFixed(1)} + ${nB.toFixed(2)} × ${setB.cycle.toFixed(1)}<br>
= ${(nA * setA.cycle).toFixed(1)} + ${(nB * setB.cycle).toFixed(1)}<br>
= <strong>${(nA * setA.cycle + nB * setB.cycle).toFixed(1)}s</strong> (目標: ${T}s)
            </div>
        </div>

        <div class="debug-section">
            <div class="section-label">検証: GP消費</div>
            <div class="formula-box">
総GP: ${totalGP}<br>
${nA.toFixed(2)} × (${setA.gpNet.toFixed(1)}) + ${nB.toFixed(2)} × (${setB.gpNet.toFixed(1)})<br>
= ${(nA * setA.gpNet).toFixed(1)} + ${(nB * setB.gpNet).toFixed(1)}<br>
= <strong>${(nA * setA.gpNet + nB * setB.gpNet).toFixed(1)}</strong> (目標: ${(-totalGP).toFixed(0)})
            </div>
        </div>
    `;

    wrapper.innerHTML = html;
}


/**
 * Renders an error message in the result area.
 */
function renderOptimizerError(message) {
    const container = document.getElementById('result-content');
    if (!container) return;
    container.innerHTML = `
        <div style="padding:30px; text-align:center; color:var(--accent-red); border:2px dashed var(--accent-red); border-radius:8px; background:rgba(239, 68, 68, 0.1);">
            <div style="font-size:1.5rem; margin-bottom:10px;">⚠️ 最適化エラー</div>
            <div>${message}</div>
        </div>
    `;
}
