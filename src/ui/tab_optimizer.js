
/**
 * Optimizer Tab Controller v4.0 (総合戦略評価)
 * 
 * 2つの戦略セット（GP赤字 A / GP黒字 B）を組み合わせ、
 * 制限時間内でGPをちょうど使い切る最適配分を連立方程式で求める。
 */
import { calculateStrategySet, calculateScenarioStats } from '../core/calculator.js';
import { calculateGPBalance, GP_CONSTANTS } from '../core/optimizer.js';

export function initOptimizerTab(masterDB, probabilityMap) {
    const runBtn = document.getElementById('opt-run-btn');
    if (runBtn) {
        runBtn.addEventListener('click', () => {
            const isVar = document.getElementById('isVariableMode')?.checked || false;
            runOptimizationV2(masterDB, probabilityMap, isVar);
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
 * @param {boolean} isVariableMode - If true, calculates as p-expression instead of fixed probability.
 */
export function runOptimizationV2(masterDB, probabilityMap, isVariableMode = false) {
    console.log(`Starting Optimization V2 (総合戦略評価)... variableMode=${isVariableMode}`);

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
    // In variable mode, use overrideP=100 to extract structural constants
    const overrideP = isVariableMode ? 100 : null;
    const resultA = calculateStrategySet(masterDB, probabilityMap, calcConfig, setConfigA, presetA, overrideP);
    const resultB = calculateStrategySet(masterDB, probabilityMap, calcConfig, setConfigB, presetB, overrideP);

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

    // --- Variable Mode Branch ---
    if (isVariableMode) {
        runOptimizerVariableMode(masterDB, probabilityMap, calcConfig, setConfigA, setConfigB,
            presetA, presetB, resultA, resultB, T, totalGP, saljakCount, GP0,
            cycleA, cycleB, gpCostA, gpCostB, gpNetA, gpNetB, gpBalanceA, gpBalanceB);
        return;
    }

    // --- 6. Validate GP赤字/黒字 ---
    let warnings = [];
    if (gpNetA >= 0) {
        warnings.push(`⚠️ 戦略セットA はGP黒字です（net: +${gpNetA.toFixed(1)}/cyc）。赤字側として使用されますが、最適配分が有意義にならない可能性があります。`);
    }
    if (gpNetB < 0) {
        warnings.push(`⚠️ 戦略セットB はGP赤字です（net: ${gpNetB.toFixed(1)}/cyc）。黒字側として使用されますが、GPが枯渇する可能性があります。`);
    }

    // --- 7. Solve linear system ---
    const det = cycleA * gpNetB - cycleB * gpNetA;

    if (Math.abs(det) < 1e-9) {
        renderOptimizerError("連立方程式の解が定まりません（行列式≈0）。2つの戦略セットのGP効率が同一か近すぎます。");
        return;
    }

    const nA = (T * gpNetB - (-totalGP) * cycleB) / det;
    const nB = ((-totalGP) * cycleA - T * gpNetA) / det;

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
        <div style="font-size:1.3rem; font-weight:bold; margin-bottom:5px; color:var(--primary)">総合戦略評価</div>
        <div style="font-size:0.75rem; margin-bottom:10px; padding-bottom:8px; border-bottom:1px dashed #444; color:#888;">
            Spot: ${document.getElementById('currentSpot')?.value || '-'} / ${document.getElementById('currentWeather')?.value || '-'} / ${document.getElementById('currentBait')?.value || '-'} / ${document.getElementById('targetFishName')?.value || '-'}
        </div>
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


/**
 * Variable mode optimization.
 * Extracts A/B constants per set (cycle = p*A + (1-p)*B structure)
 * and solves the linear system as a function of p.
 */
function runOptimizerVariableMode(masterDB, probabilityMap, calcConfig, setConfigA, setConfigB,
    presetA, presetB, resultA, resultB, T, totalGP, saljakCount, GP0,
    cycleA, cycleB, gpCostA, gpCostB, gpNetA, gpNetB, gpBalanceA, gpBalanceB) {

    console.log("Running optimizer variable mode...");

    // Extract A_avg, B_avg for each set (weighted across scenarios)
    const extractVariableConstants = (stratResult, setConfig, preset) => {
        let weightedConstA = 0, weightedConstB = 0;
        const enrichedScenarios = [];

        for (const scn of stratResult.scenarios) {
            const scenarioConfig = { ...calcConfig, lureType: setConfig.lureType, quitIfNoDisc: false };
            const stats = calculateScenarioStats(masterDB, probabilityMap, scenarioConfig, scn.id, setConfig.isChum, setConfig.slapFish, 100);

            if (stats.error || !stats.allFishStats.find(s => s.isTarget)) {
                enrichedScenarios.push({ ...scn, A: 0, B: 0 });
                continue;
            }

            const tStat = stats.allFishStats.find(s => s.isTarget);
            const A_i = tStat.cycleTime - tStat.hookTime;

            const K = stats.weightDetails
                .filter(d => d.name !== calcConfig.target && !d.isHidden)
                .reduce((acc, d) => acc + d.base, 0);
            const targetWD = stats.weightDetails.find(d => d.name === calcConfig.target);
            const M = (targetWD && targetWD.m !== '-') ? targetWD.m : 1.0;

            let sum_wT = 0;
            stats.allFishStats.filter(s => !s.isTarget).forEach(o => {
                const wd = stats.weightDetails.find(d => d.name === o.name);
                if (wd && !wd.isHidden) sum_wT += (wd.final * o.cycleTime);
            });

            const B_i = (K > 0 && M > 0) ? sum_wT / (M * K) : 0;

            weightedConstA += scn.prob * A_i;
            weightedConstB += scn.prob * B_i;
            enrichedScenarios.push({ ...scn, A: A_i, B: B_i });
        }

        const tp = stratResult.totalProb;
        return {
            A: tp > 0 ? weightedConstA / tp : 0,
            B: tp > 0 ? weightedConstB / tp : 0,
            scenarios: enrichedScenarios
        };
    };

    const varA = extractVariableConstants(resultA, setConfigA, presetA);
    const varB = extractVariableConstants(resultB, setConfigB, presetB);

    // cycleX(p) = p * A_X + (1-p) * B_X
    // hitRate(p) = p  (probability = target base weight p / total weights)
    // gpNet is independent of p (GP cost is fixed per strategy)
    //
    // Solve for nA(p), nB(p):
    //   nA(p) * cycle_A(p) + nB(p) * cycle_B(p) = T
    //   nA(p) * gpNetA + nB(p) * gpNetB = -totalGP
    //
    // Since gpNet is p-independent, nA/nB depend on p only through cycle times.
    // Expected catch E(p) = nA(p) * p + nB(p) * p = p * (nA(p) + nB(p))

    // Evaluate at sample points for display
    const samplePoints = [0.001, 0.005, 0.01, 0.03, 0.05, 0.1, 0.25, 0.5, 0.75, 0.95];
    const samples = [];

    for (const p of samplePoints) {
        const cA = p * varA.A + (1 - p) * varA.B;
        const cB = p * varB.A + (1 - p) * varB.B;

        const det = cA * gpNetB - cB * gpNetA;
        if (Math.abs(det) < 1e-9) {
            samples.push({ p, nA: NaN, nB: NaN, expected: NaN, timePerCatch: NaN });
            continue;
        }

        const nA = (T * gpNetB + totalGP * cB) / det;
        const nB = (-totalGP * cA - T * gpNetA) / det;

        const expected = (nA >= 0 && nB >= 0) ? p * (nA + nB) : NaN;
        const timePerCatch = expected > 0 ? T / expected : Infinity;

        samples.push({ p, nA, nB, expected, timePerCatch, cycleA: cA, cycleB: cB });
    }

    const result = {
        T, GP0, saljakCount, totalGP,
        setA: { name: presetA.name, gpNet: gpNetA, gpCost: gpCostA, gpRecovery: gpBalanceA.recovered, varConst: varA },
        setB: { name: presetB.name, gpNet: gpNetB, gpCost: gpCostB, gpRecovery: gpBalanceB.recovered, varConst: varB },
        samples,
        gpNetA, gpNetB
    };

    renderOptimizerVariableResult(result);
}


/**
 * Renders variable mode optimizer result.
 * Shows a table of expected catch for various p values.
 */
function renderOptimizerVariableResult(result) {
    const container = document.getElementById('result-content');
    if (!container) return;

    const { setA, setB, T, totalGP, samples } = result;

    // Build sample table rows
    const tableRows = samples.map(s => {
        if (isNaN(s.expected)) {
            return `<tr style="color:var(--text-muted)">
                <td>${(s.p * 100).toFixed(0)}%</td>
                <td colspan="4">解なし（行列式≈0）</td>
            </tr>`;
        }
        if (s.nA < 0 || s.nB < 0) {
            return `<tr style="color:var(--text-muted)">
                <td>${(s.p * 100) < 1 ? (s.p * 100).toFixed(1) : (s.p * 100).toFixed(0)}%</td>
                <td>${s.nA.toFixed(1)}</td>
                <td>${s.nB.toFixed(1)}</td>
                <td colspan="2" style="color:var(--accent-red)">不成立 (n<0)</td>
            </tr>`;
        }
        return `<tr>
            <td>${(s.p * 100) < 1 ? (s.p * 100).toFixed(1) : (s.p * 100).toFixed(0)}%</td>
            <td>${s.nA.toFixed(1)}</td>
            <td>${s.nB.toFixed(1)}</td>
            <td style="font-weight:bold; color:var(--primary)">${s.expected.toFixed(2)}</td>
            <td>${s.timePerCatch === Infinity ? '∞' : s.timePerCatch.toFixed(1) + 's'}</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <div style="padding:15px;">
            <div style="font-size:1.3rem; font-weight:bold; margin-bottom:5px; color:var(--primary)">
                📐 総合戦略評価（変数モード）
            </div>
            <div style="font-size:0.75rem; margin-bottom:15px; padding-bottom:8px; border-bottom:1px dashed #444; color:#888;">
                Spot: ${document.getElementById('currentSpot')?.value || '-'} / ${document.getElementById('currentWeather')?.value || '-'} / ${document.getElementById('currentBait')?.value || '-'} / ${document.getElementById('targetFishName')?.value || '-'}
            </div>

            <div style="display:flex; gap:15px; margin-bottom:15px; flex-wrap:wrap;">
                <div style="flex:1; min-width:200px; padding:12px; border-radius:8px; border-left:3px solid var(--accent-red); background:rgba(239,68,68,0.05);">
                    <div style="font-weight:bold; color:var(--accent-red); margin-bottom:5px;">セットA: ${setA.name}</div>
                    <div style="font-size:0.9rem;">GP収支: <strong>${setA.gpNet >= 0 ? '+' : ''}${setA.gpNet.toFixed(1)}</strong>/cyc</div>
                    <div style="font-size:0.85rem; color:var(--text-muted);">Cycle(p) = ${setA.varConst.A.toFixed(1)}p + ${setA.varConst.B.toFixed(1)}(1-p)</div>
                </div>
                <div style="flex:1; min-width:200px; padding:12px; border-radius:8px; border-left:3px solid var(--accent-green); background:rgba(34,197,94,0.05);">
                    <div style="font-weight:bold; color:var(--accent-green); margin-bottom:5px;">セットB: ${setB.name}</div>
                    <div style="font-size:0.9rem;">GP収支: <strong>${setB.gpNet >= 0 ? '+' : ''}${setB.gpNet.toFixed(1)}</strong>/cyc</div>
                    <div style="font-size:0.85rem; color:var(--text-muted);">Cycle(p) = ${setB.varConst.A.toFixed(1)}p + ${setB.varConst.B.toFixed(1)}(1-p)</div>
                </div>
            </div>

            <div style="font-size:0.9rem; margin-bottom:10px; color:var(--text-muted);">
                制限時間: ${T}秒 / 総GP: ${totalGP} (初期${result.GP0} + サリャク${result.saljakCount}×150)
            </div>

            <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                <thead>
                    <tr style="border-bottom:2px solid var(--border); text-align:left;">
                        <th style="padding:8px 4px;">確率 p</th>
                        <th style="padding:8px 4px;">n_A</th>
                        <th style="padding:8px 4px;">n_B</th>
                        <th style="padding:8px 4px;">期待獲得数</th>
                        <th style="padding:8px 4px;">1匹あたり</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>

            <div style="margin-top:12px; font-size:0.8rem; color:var(--text-muted); border-top:1px solid var(--border); padding-top:8px;">
                <div>E(p) = p × (n_A(p) + n_B(p))</div>
                <div>n_A(p), n_B(p) は Cycle(p) を通じて p に依存します</div>
            </div>
        </div>
    `;

    // Debug panel
    const debugPanel = document.getElementById('debug-content');
    if (debugPanel) {
        debugPanel.innerHTML = `
            <div style="padding:10px; font-size:0.85rem;">
                <h4 style="margin:0 0 8px;">変数モード定数</h4>
                <div><strong>セットA:</strong> A=${setA.varConst.A.toFixed(3)}, B=${setA.varConst.B.toFixed(3)}, gpNet=${setA.gpNet.toFixed(1)}</div>
                <div><strong>セットB:</strong> A=${setB.varConst.A.toFixed(3)}, B=${setB.varConst.B.toFixed(3)}, gpNet=${setB.gpNet.toFixed(1)}</div>
                <div style="margin-top:8px;"><strong>GP Cost A:</strong> ${setA.gpCost} / <strong>Recovery:</strong> ${setA.gpRecovery.toFixed(1)}</div>
                <div><strong>GP Cost B:</strong> ${setB.gpCost} / <strong>Recovery:</strong> ${setB.gpRecovery.toFixed(1)}</div>
            </div>
        `;
    }
}

