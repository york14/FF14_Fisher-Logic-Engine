/**
 * Rendering Logic for Fisher Logic Engine
 */

import { GDS } from '../core/calculator.js';
import { getScenarioLabel } from '../core/scenario.js';

export function renderResultTable(stats, targetName, scnStr, scnProb, avgCycle) {
    const tbody = document.getElementById('res-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const scStrEl = document.getElementById('scenario-str');
    const scProbEl = document.getElementById('scenario-prob');
    const avgEl = document.getElementById('avg-cycle-time');

    if (scStrEl) scStrEl.textContent = `シナリオ: ${scnStr}`;
    if (scProbEl) scProbEl.textContent = `発生確率: ${(scnProb !== null ? (scnProb * 100).toFixed(2) + '%' : '-')}`;
    if (avgEl) avgEl.textContent = `平均サイクル: ${(avgCycle > 0 ? avgCycle.toFixed(1) + 'sec' : '-')}`;

    stats.forEach(s => {
        const tr = document.createElement('tr');
        if (s.name === targetName) tr.classList.add('row-target');
        const hitStr = (s.hitRate > 0) ? (s.hitRate * 100).toFixed(1) + '%' : '0.0%';
        const waitTimeStr = (s.waitTimeAvg !== undefined) ?
            `${s.waitTimeMin.toFixed(1)}-${s.waitTimeMax.toFixed(1)}秒(平均 ${s.waitTimeAvg.toFixed(1)}秒)` : '-';
        tr.innerHTML = `<td>${s.name}</td><td>${hitStr}</td><td>${waitTimeStr}</td>`;
        tbody.appendChild(tr);
    });
}

export function renderManualModeResult(stats, config, isChum, slapFish) {
    const resultContent = document.getElementById('result-content');

    // Header Info
    const chumTxt = isChum ? '使用する' : '未使用';
    const slapTxt = (slapFish === 'なし') ? 'なし' : slapFish;

    let scnPrefix = '';
    if (config.lureType !== 'none') {
        const cnt = document.getElementById('lureCount') ? document.getElementById('lureCount').value : (config.lureCount || '');
        scnPrefix = `(${config.lureType} ${cnt}回): `;
    }

    if (stats.error) {
        if (resultContent) resultContent.innerHTML = `<div style="color:var(--accent-red)">Error: ${stats.error}</div>`;
        renderDebugDetails(stats, config, isChum, 'error'); // Pass simplified structure if needed
        return;
    }

    const expTimeStr = (stats.expectedTime === Infinity) ? '-' : `${stats.expectedTime.toFixed(1)}秒`;
    const hitRateStr = (stats.targetHitRate * 100).toFixed(1) + '%';

    // GP消費(秒間)の計算
    const gp = stats.gpStats;
    const gpPerSec = (gp && stats.avgCycleTime > 0) ? (gp.cost.total / stats.avgCycleTime) : 0;
    const gpPerSecStr = gpPerSec.toFixed(1) + ' GP / sec';

    if (resultContent) {
        resultContent.innerHTML = `
            <div style="background:rgba(59,130,246,0.1); border:1px solid var(--primary); padding:10px; border-radius:4px; text-align:center; margin-bottom:15px;">
                <div style="font-size:0.8rem; color:var(--text-muted);">期待時間</div>
                <div style="font-size:2rem; font-weight:bold; color:var(--primary);">${expTimeStr}</div>
                <div style="font-size:0.9rem; margin-top:5px;">ヒット率: ${hitRateStr}</div>
                <div style="font-size:0.9rem; margin-top:3px;">GP消費(秒間)：${gpPerSecStr}</div>
                <div style="font-size:0.75rem; margin-top:8px; padding-top:8px; border-top:1px dashed #444; color:#888;">
                    Spot: ${config.spot} / ${config.weather} / ${config.bait} / ${config.target}
                </div>
            </div>
            <table><thead><tr><th>魚種名</th><th>ヒット率</th><th>実効待機時間(Min-Max)</th></tr></thead><tbody id="res-table-body"></tbody></table>
            <div style="margin-top: 15px; font-size: 0.85rem; color: var(--text-muted);">
                <div id="manual-header-info" style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px dashed #444;">
                         <div>トレードリリース：<strong>${slapTxt}</strong></div><div>撒き餌：<strong>${chumTxt}</strong></div>
                </div>
                <div id="scenario-str" style="margin-bottom: 4px;"></div>
                <div id="scenario-prob" style="color: var(--primary); font-weight: bold; margin-bottom: 8px;"></div>
                <div id="avg-cycle-time"></div>
            </div>`;
    }

    renderResultTable(stats.allFishStats, config.target, scnPrefix + stats.scenarioStr, stats.scenarioProb, stats.avgCycleTime);
    // Note: RenderDebugDetails should be called by main orchestrator or here. 
    // Let's call it here if we pass scenarioId. 
    // But scenarioId is not passed to this function. 
    // We will leave debug rendering to the caller to maintain separation or add it to arguments.
}

export function renderStrategyComparison(resA, resB, config) {
    const resultContent = document.getElementById('result-content');
    const right = document.getElementById('debug-content-wrapper');
    const buildCard = (res, label, color) => {
        const time = (res.error || res.expectedTime === Infinity) ? '∞' : res.expectedTime.toFixed(1);
        const timeDisplay = (res.error || res.expectedTime === Infinity) ? '∞' :
            `${time}<span style="font-size:0.6em; margin-left:4px;">秒</span>`;

        const hit = (res.error) ? '-' : (res.avgHitRate * 100).toFixed(1) + '%';
        const cycle = (res.error) ? '-' : res.avgCycle.toFixed(1) + '秒';

        const gp = res.gpStats;
        const gpPerSec = (gp && res.avgCycle > 0) ? (gp.cost.total / res.avgCycle) : 0;
        const gpPerSecStr = gpPerSec.toFixed(1) + '/s';

        let top3Html = '';
        if (!res.error && res.scenarios) {
            const sorted = [...res.scenarios].sort((a, b) => b.prob - a.prob).slice(0, 3);
            top3Html = `<div class="top3-container"><div class="top3-title">高確率シナリオ Top3</div>${sorted.map(s => `
                <div class="top3-item"><div style="color:${color};font-weight:bold;">${s.label} ${(s.isQuit ? '<span style="color:red">!</span>' : '')}</div>
                <div class="top3-stats"><span>Hit:${(s.hit * 100).toFixed(1)}%</span><span>発生:${(s.prob * 100).toFixed(1)}%</span></div></div>
            `).join('')}</div>`;
        }

        return `<div class="strat-card" style="border-top:4px solid ${color}"><h4>${res.name}</h4><div class="strat-desc">${res.description || ''}</div><div class="main-val">${timeDisplay}</div><div class="val-label">期待時間</div><div class="stat-row"><div class=\"stat-item\">Hit<br><span class=\"stat-val\">${hit}</span></div><div class=\"stat-item\">Cycle<br><span class=\"stat-val\">${cycle}</span></div><div class=\"stat-item\">GP消費<br><span class=\"stat-val\">${gpPerSecStr}</span></div></div>${res.error ? `<div style="color:red">⚠️ ${res.error}</div>` : top3Html}</div>`;
    };

    if (resultContent) {
        resultContent.innerHTML = `<div class="comparison-container" style="align-items:stretch;">${buildCard(resA, "Set A", "var(--accent-a)")}${buildCard(resB, "Set B", "var(--accent-b)")}</div>`;
    }

    let debugHtml = `<div class="debug-section"><label>【定数】</label><div id="debug-constants" class="formula-box" style="font-size:0.75rem;"></div></div>`;
    debugHtml += renderStrategyDebugTable(resA, "Set A", "var(--accent-a)");
    debugHtml += renderStrategyDebugTable(resB, "Set B", "var(--accent-b)");

    if (right) {
        right.innerHTML = debugHtml;
    }

    const tCast = GDS.D_CAST, tLure = GDS.D_LURE, tRest = GDS.D_REST, tBlk = GDS.D_BLK;
    const dbgConst = document.getElementById('debug-constants');
    if (dbgConst) dbgConst.innerHTML = `Cast:${tCast}s / Lure:${tLure}s / Block:${tBlk}s / Rest:${tRest}s`;
}

export function renderStrategyDebugTable(res, label, color) {
    if (res.error) return `<div class="debug-section" style="border-left:3px solid ${color}; padding-left:10px;"><label style="color:${color}">${label}</label><div style="color:red">${res.error}</div></div>`;

    let html = `<div class="debug-section" style="border-left:3px solid ${color}; padding-left:10px;">
        <label style="color:${color}">${label} (${res.name})</label>
        <div style="font-size:0.7rem; color:#ccc; margin-bottom:5px;">Slap: ${res.Slap} / TotalProb: ${(res.totalProb * 100).toFixed(1)}%</div>
        <div style="overflow-x:auto; max-height:200px; overflow-y:auto; border:1px solid #444;">
        <table style="width:100%; font-size:0.7rem; border-collapse:collapse;">
            <thead style="position:sticky; top:0; background:#333;">
                <tr><th>シナリオ</th><th>確率</th><th>Hit</th><th>Cycle</th><th>Exp</th><th>GP</th></tr>
            </thead>
            <tbody>`;

    const sorted = [...res.scenarios].sort((a, b) => b.prob - a.prob);

    sorted.forEach(s => {
        const quitMark = s.isQuit ? '<span style="color:red; font-weight:bold;">!</span> ' : '';
        const gp = s.gpStats;
        // GP列は「1サイクルあたりの消費GP」を表示
        const gpStr = gp ? gp.cost.total.toString() : '-';
        html += `<tr>
            <td style="white-space:nowrap;">${quitMark}${s.label}</td>
            <td>${(s.prob * 100).toFixed(1)}%</td>
            <td>${(s.hit * 100).toFixed(1)}%</td>
            <td>${s.cycle.toFixed(1)}s</td>
            <td>${(s.expected === Infinity) ? '-' : s.expected.toFixed(0)}s</td>
            <td>${gpStr}</td>
        </tr>`;
    });


    // 平均消費GPの計算
    let avgGpCost = 0;
    if (res.gpStats && res.gpStats.cost) {
        avgGpCost = res.gpStats.cost.total;
    }
    const totalGpStr = avgGpCost.toFixed(1);

    html += `</tbody>
            <tfoot style="position:sticky; bottom:0; background:#333; font-weight:bold;">
                <tr>
                    <td>平均/合計</td>
                    <td>${(res.totalProb * 100).toFixed(0)}%</td>
                    <td style="text-align:right;">${res.avgHitRate > 0 ? (res.avgHitRate * 100).toFixed(2) + '%' : '-'}</td>
                    <td style="text-align:right;">${res.avgCycle.toFixed(1)}s</td>
                    <td style="text-align:right;">
                        ${res.expectedTime === Infinity ? '-' : res.expectedTime.toFixed(1) + 's'}
                    </td>
                    <td style="text-align:right;">${totalGpStr}</td>
                </tr>
            </tfoot>
        </table></div></div>`;
    return html;
}

export function renderDebugDetails(stats, config, isChum, scenarioId) {
    const wrapper = document.getElementById('debug-content-wrapper');
    // Ensure skeleton exists for Manual Mode details
    if (wrapper && !document.getElementById('debug-scenario')) {
        wrapper.innerHTML = `
            <div class="debug-section">
                <label>【定数】</label>
                <div id="debug-constants" class="formula-box" style="font-size:0.75rem;"></div>
            </div>
            <div id="debug-scenario" class="formula-box" style="margin-top:10px;"></div>
            <div id="debug-weights" style="font-size:0.75rem; margin-top:10px;"></div>
            <div id="debug-calc-target" class="formula-box" style="margin-top:10px;"></div>
            <div id="debug-calc-expect" class="formula-box" style="margin-top:10px;"></div>
        `;
    }

    const c = GDS;
    const dbgConst = document.getElementById('debug-constants');
    if (dbgConst) dbgConst.innerHTML = `Cast:${c.D_CAST}s / Lure:${c.D_LURE}s / Block:${c.D_BLK}s / Rest:${c.D_REST}s / Chum:${c.D_CHUM}s`;

    const slapVal = config.slapFish || 'なし';

    const searchKeys = `
        <div style="font-size:0.7rem; color:#ccc; margin-bottom:6px; padding-bottom:6px; border-bottom:1px dashed #666; line-height:1.4;">
            <div>Spot: ${config.spot}</div>
            <div>Cond: ${config.weather} / Bait: ${config.bait}</div>
            <div>Target: ${config.target}</div>
            <div>Slap: ${slapVal} / Lure: ${config.lureType}</div>
            <div>Rest if no disc: ${config.quitIfNoDisc ? 'ON' : 'OFF'}</div>
        </div>
    `;

    const dbgScenario = document.getElementById('debug-scenario');
    const label = getScenarioLabel(scenarioId);

    if (stats.error) {
        if (dbgScenario) dbgScenario.innerHTML = searchKeys + `<div>特定キー: ${label} (${scenarioId})</div>`;
        return;
    }

    let analysisHtml = searchKeys;
    analysisHtml += `<div>特定キー: ${label} (${scenarioId})</div>`;

    if (stats.debugData && stats.debugData.rates) {
        const fmt = (arr) => arr ? arr.map(v => (v === null ? 'null' : v + '%')).join(', ') : '';
        analysisHtml += `<div style="margin-top:5px; font-size:0.7rem; color:#bbb;">
            <div>発見率: [${fmt(stats.debugData.rates.disc)}]</div>
            <div>未発見型確定率: [${fmt(stats.debugData.rates.guar)}]</div>
        </div>`;
    }

    if (stats.debugData && stats.debugData.isQuit) {
        analysisHtml += `<div style="color:var(--accent-red); font-weight:bold; margin-top:5px;">※未発見即竿上げ 発動</div>`;
    }

    if (!stats.error) analysisHtml += `<div>隠し魚ヒット率 (P_Hidden): ${(stats.pHidden * 100).toFixed(2)}%</div>`;
    if (dbgScenario) dbgScenario.innerHTML = analysisHtml;

    if (stats.error) return;

    let wHtml = `<table style="width:100%; border-collapse:collapse; font-size:0.7rem;">
        <tr style="border-bottom:1px solid #666; text-align:right;">
            <th style="text-align:left">魚種</th><th>基礎W</th><th>M</th><th>最終W</th><th>確率</th>
        </tr>`;
    stats.weightDetails.forEach(d => {
        if (!d.isHidden) {
            const prob = (stats.totalWeight > 0) ? (d.final / stats.totalWeight) * (1.0 - stats.pHidden) : 0;
            wHtml += `<tr style="text-align:right;">
                <td style="text-align:left">${d.name}</td>
                <td>${d.base}</td>
                <td>x${d.m}</td>
                <td>${d.final.toFixed(1)}</td>
                <td>${(prob * 100).toFixed(2)}%</td>
            </tr>`;
        }
    });
    wHtml += `<tr style="border-top:1px solid #666; font-weight:bold; text-align:right;"><td colspan="3">合計(ΣW)</td><td>${stats.totalWeight.toFixed(1)}</td><td>-</td></tr>`;
    stats.weightDetails.forEach(d => {
        if (d.isHidden) wHtml += `<tr style="color:#888; text-align:right;"><td style="text-align:left">${d.name}(隠)</td><td>-</td><td>-</td><td>-</td><td>${(stats.pHidden * 100).toFixed(2)}%</td></tr>`;
    });
    wHtml += `</table>`;

    const dbgWeights = document.getElementById('debug-weights');
    if (dbgWeights) dbgWeights.innerHTML = wHtml;

    const tStat = stats.allFishStats.find(s => s.isTarget);
    if (!tStat) {
        const dbgCalcT = document.getElementById('debug-calc-target');
        const dbgCalcE = document.getElementById('debug-calc-expect');
        if (dbgCalcT) dbgCalcT.textContent = "ターゲット情報なし";
        if (dbgCalcE) dbgCalcE.textContent = "-";
        return;
    }

    const pre = isChum ? c.D_CHUM : 0;

    let targetTraceHtml = '';

    // Show breakdowns for ALL fish with Hit Rate > 0
    const activeStats = stats.allFishStats.filter(s => s.hitRate > 0);

    activeStats.forEach(s => {
        const isTgt = s.isTarget;
        const style = isTgt ? 'color:var(--accent-a); font-weight:bold;' : 'color:#ddd;';
        const mark = isTgt ? '★' : '';
        const isIntegral = s.cType && s.cType.includes('Integral');
        const cTypeColor = isIntegral ? '#ffaa00' : '#888';

        const parts = [];
        if (pre > 0) parts.push(`撒き餌(${pre})`);
        if (c.D_CAST > 0) parts.push(`キャス(${c.D_CAST})`);
        parts.push(`待機(Avg)`);

        const isCatch = (s.isTarget || config.isCatchAll);
        const actionName = isCatch ? '釣り上げ' : '竿上げ';
        parts.push(`${actionName}(${s.hookTime})`);

        const breakdownStr = parts.join(' + ');
        const chumTxt = isChum ? '(撒き餌有)' : '';

        targetTraceHtml += `
        <div style="margin-bottom:10px; border-bottom:1px dashed #444; padding-bottom:5px;">
            <div style="font-size:0.85rem; ${style}">
                ${mark} ${s.name} (Hit: ${(s.hitRate * 100).toFixed(1)}%)
            </div>
            <div style="font-size:0.75rem; margin-top:2px;">
                    <div>・補正待機: ${s.biteTimeMin.toFixed(1)}～${s.biteTimeMax.toFixed(1)}s ${chumTxt}</div>
                    <div>・ルアー拘束: ${s.lureTime.toFixed(1)}s</div>
                    <div>
                    <strong>待機(Avg):</strong> ${s.waitTimeAvg.toFixed(2)}s (Min ${s.waitTimeMin.toFixed(1)} ～ Max ${s.waitTimeMax.toFixed(1)})
                    <span style="color:${cTypeColor}; font-size:0.8em;">[${s.cType}]</span>
                    </div>
                    <div style="color:#aaa;">
                        <strong>サイクル (${s.cycleTime.toFixed(1)}s):</strong> ${breakdownStr}
                    </div>
            </div>
        </div>`;
    });

    const dbgCalcT = document.getElementById('debug-calc-target');
    if (dbgCalcT) dbgCalcT.innerHTML = targetTraceHtml;

    const avgCycle = stats.avgCycleTime;
    const hitRate = stats.targetHitRate;
    const expectedTime = stats.expectedTime;
    const expectedTimeRange = stats.expectedTimeRange || 0;
    const targetHook = stats.debugData.targetHook;
    const formulaStr = `(${avgCycle.toFixed(2)} - (${(hitRate * 100).toFixed(2)}% × ${targetHook.toFixed(1)})) / ${(hitRate * 100).toFixed(2)}%`;
    const rangeStr = `<span style="font-size:0.8em; color:#888;">±${expectedTimeRange.toFixed(1)}s</span>`;
    const expectExpr = (hitRate > 0) ? `${formulaStr} = <strong>${expectedTime.toFixed(1)}s</strong> ${rangeStr}` : `ターゲット確率が 0% のため計算不可`;

    const expectHtml = `
        <div style="font-size:0.8rem;">
            <div><strong>平均サイクル (E[Cycle]):</strong> ${avgCycle.toFixed(2)}s</div>
            <div><strong>ターゲット確率 (P):</strong> ${(hitRate * 100).toFixed(2)}%</div>
            <div><strong>ターゲット釣り上げ動作時間:</strong> ${targetHook.toFixed(1)}s</div>
            <hr style="margin:5px 0; border:0; border-top:1px dashed #666;">
            <div><strong>式:</strong> (E[Cycle] - (P × 動作時間)) / P</div>
            <div style="margin:5px 0; color:#bbb; font-size:0.75rem; line-height:1.4;">
                ※ターゲット釣り上げ時間（成功時コスト）を除外した待機期待値
            </div>
            <div style="margin-top:4px; color:var(--primary);">${expectExpr}</div>
        </div>
    `;
    const dbgCalcE = document.getElementById('debug-calc-expect');
    if (dbgCalcE) dbgCalcE.innerHTML = expectHtml;

    // --- GP Analysis Section ---
    const gpWrapper = document.getElementById('debug-calc-gp');
    if (!gpWrapper && wrapper) {
        // dynamic addition if missing element
        const div = document.createElement('div');
        div.id = 'debug-calc-gp';
        div.className = 'formula-box';
        div.style.marginTop = '10px';
        wrapper.appendChild(div);
    }
    const gpEl = document.getElementById('debug-calc-gp');

    if (gpEl && stats.gpStats) {
        const gp = stats.gpStats;
        const b = gp.balance;
        const c = gp.cost;

        // GP消費(秒間)の計算
        const gpPerSec = (stats.avgCycleTime > 0) ? (c.total / stats.avgCycleTime) : 0;

        // 回復情報の計算
        const naturalRecoveryPerSec = 8.0 / 3.0; // 3秒ごとに8GP
        const cordialRecoveryPerSec = 400.0 / 180.0; // 180秒ごとに400GP
        const totalRecoveryPerSec = naturalRecoveryPerSec + cordialRecoveryPerSec;

        const recNatural = (b.recovered - (b.itemRecovery || 0)).toFixed(1);
        const recItem = (b.itemRecovery || 0).toFixed(1);

        // 秒間収支
        const balancePerSec = totalRecoveryPerSec - gpPerSec;

        const susColor = b.sustainable ? 'var(--accent-green)' : 'var(--accent-red)';
        const susText = b.sustainable ? '持続可能' : `枯渇まで: 約${b.castsUntilDeplete.toFixed(1)}キャスト`;

        const gpmHtml = `
            <div style="font-size:0.8rem;">
                <div style="font-weight:bold; color:#ddd;">GP分析</div>
                <hr style="margin:5px 0; border:0; border-top:1px dashed #666;">
                <div style="margin-bottom:10px;">
                    <div style="color:#aaa; font-size:0.75rem;">GP消費(秒間)</div>
                    <div style="font-size:1.1rem; font-weight:bold;">${gpPerSec.toFixed(1)} GP / sec</div>
                    <div style="font-size:0.7rem; color:#888; margin-top:2px;">消費内訳: ${c.details.map(d => `${d.name} ${d.cost}GP`).join(', ')}</div>
                </div>
                <div style="margin-bottom:10px;">
                    <div style="color:#aaa; font-size:0.75rem;">GP回復(秒間)</div>
                    <div style="font-size:0.85rem;">
                        <div>・自然回復: ${naturalRecoveryPerSec.toFixed(2)} GP/sec <span style="font-size:0.7rem; color:#888;">(3秒ごとに8GP)</span></div>
                        <div>・ハイコーディアル: ${cordialRecoveryPerSec.toFixed(2)} GP/sec <span style="font-size:0.7rem; color:#888;">(180秒ごとに400GP)</span></div>
                        <div style="margin-top:3px; font-weight:bold;">合計: ${totalRecoveryPerSec.toFixed(2)} GP/sec</div>
                    </div>
                </div>
                <div style="margin-bottom:10px;">
                    <div style="color:#aaa; font-size:0.75rem;">秒間収支</div>
                    <div style="font-size:1.1rem; font-weight:bold; color:${balancePerSec >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">
                        ${balancePerSec >= 0 ? '+' : ''}${balancePerSec.toFixed(2)} GP/sec
                    </div>
                </div>
                <div style="margin-top:8px; padding-top:8px; border-top:1px dashed #666;">
                    <div style="font-size:0.75rem;">
                        <div>サイクル時間: ${stats.avgCycleTime.toFixed(1)}秒</div>
                        <div>サイクルあたり消費: ${c.total} GP</div>
                        <div>サイクルあたり回復: ${b.recovered.toFixed(1)} GP <span style="color:#888;">(自然 ${recNatural} / アイテム ${recItem})</span></div>
                        <div style="margin-top:4px; font-weight:bold; color:${susColor};">${susText}</div>
                    </div>
                </div>
            </div>
        `;
        gpEl.innerHTML = gpmHtml;
    }
}
