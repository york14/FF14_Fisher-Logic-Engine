/**
 * Fisherman Logic Engine (FLE) v2.0
 * Update: Strategy Details, Top 3 Scenarios, JP Descriptions
 */

const GDS = {
    D_CAST: 1.0, D_LURE: 2.5, D_BLK: 2.5, D_CHUM: 1.0, D_REST: 2.0,
    C_CHUM: 0.6, M_N1: 1.5, M_N2: 2.0, M_N3: 6.0
};

let masterDB = null;
let currentMode = 'manual'; // 'manual' or 'strategy'

function init() {
    setupEventListeners();
    initResizers();
}

function setupEventListeners() {
    const uploadBtn = document.getElementById('jsonUpload');
    if (uploadBtn) uploadBtn.addEventListener('change', handleFileUpload);

    // タブ切替
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            currentMode = tab.dataset.mode;
            document.querySelectorAll('.mode-container').forEach(c => c.classList.remove('active'));
            document.getElementById(`mode-${currentMode}`).classList.add('active');

            updateSimulation();
        });
    });

    const commonInputs = ['currentSpot', 'currentWeather', 'currentBait', 'targetFishName'];
    commonInputs.forEach(id => document.getElementById(id).addEventListener('change', updateSimulation));

    const isCatchAll = document.getElementById('isCatchAll');
    isCatchAll.addEventListener('change', () => {
        const manualTrade = document.getElementById('manualTradeSlap');
        const stratATrade = document.getElementById('stratATrade');
        const stratBTrade = document.getElementById('stratBTrade');

        const disabled = isCatchAll.checked;
        if (disabled) {
            manualTrade.value = 'なし'; manualTrade.disabled = true;
            stratATrade.value = 'なし'; stratATrade.disabled = true;
            stratBTrade.value = 'なし'; stratBTrade.disabled = true;
        } else {
            manualTrade.disabled = false;
            stratATrade.disabled = false;
            stratBTrade.disabled = false;
        }
        updateSimulation();
    });

    document.getElementById('manualTradeSlap').addEventListener('change', updateSimulation);

    // 手動モード設定
    const manualInputs = ['manualChum', 'lureType', 'lureCount', 'lureStep1', 'lureStep2', 'lureStep3'];
    manualInputs.forEach(id => document.getElementById(id).addEventListener('change', () => {
        if (id.startsWith('lure')) updateLureUI();
        updateSimulation();
    }));

    // 戦略モード設定
    const strategyInputs = [
        'stratALure', 'stratAPreset', 'stratATrade', 'stratAChum',
        'stratBLure', 'stratBPreset', 'stratBTrade', 'stratBChum'
    ];
    strategyInputs.forEach(id => document.getElementById(id).addEventListener('change', () => {
        if (id === 'stratALure' || id === 'stratBLure') updateStrategyPresetsFilter();
        updateSimulation();
    }));
}

function updateStrategyPresetsFilter() {
    ['A', 'B'].forEach(set => {
        const lureVal = document.getElementById(`strat${set}Lure`).value;
        const presetSel = document.getElementById(`strat${set}Preset`);

        Array.from(presetSel.options).forEach(opt => {
            const isNoLureStrat = (opt.value === 'no_lure');
            if (lureVal === 'none') {
                opt.disabled = !isNoLureStrat;
            } else {
                opt.disabled = false;
            }
        });

        if (presetSel.options[presetSel.selectedIndex].disabled) {
            presetSel.value = (lureVal === 'none') ? 'no_lure' : masterDB.strategy_presets[1].id;
        }
    });
}

function updateLureUI() {
    const type = document.getElementById('lureType').value;
    const count = parseInt(document.getElementById('lureCount').value, 10);
    const isLureActive = (type !== 'none');
    document.getElementById('lureCount').disabled = !isLureActive;

    const setStepState = (stepNum, isEnabled) => {
        const el = document.getElementById(`lureStep${stepNum}`);
        el.disabled = !isEnabled;
        if (!isEnabled) { el.value = 'none'; el.style.opacity = '0.3'; }
        else { el.style.opacity = '1.0'; }
    };
    setStepState(1, isLureActive && count >= 1);
    setStepState(2, isLureActive && count >= 2);
    setStepState(3, isLureActive && count >= 3);
}

function constructScenarioId() {
    const type = document.getElementById('lureType').value;
    if (type === 'none') return 'none_0';
    const count = parseInt(document.getElementById('lureCount').value, 10);
    let discoveryStep = 0;
    let guaranteeSteps = [];
    for (let i = 1; i <= count; i++) {
        const val = document.getElementById(`lureStep${i}`).value;
        if (val === 'disc') { if (discoveryStep === 0) discoveryStep = i; }
        else if (val === 'guar') { guaranteeSteps.push(i); }
    }
    const gStr = guaranteeSteps.length > 0 ? guaranteeSteps.join('') : '0';
    return `n${count}_d${discoveryStep}_g${gStr}`;
}

// --- メイン処理 ---
function updateSimulation() {
    if (!masterDB) return;

    const config = {
        spot: document.getElementById('currentSpot').value,
        weather: document.getElementById('currentWeather').value,
        bait: document.getElementById('currentBait').value,
        target: document.getElementById('targetFishName').value,
        isCatchAll: document.getElementById('isCatchAll').checked
    };

    if (currentMode === 'manual') {
        runManualMode(config);
    } else {
        runStrategyMode(config);
    }
}

// --- モード1: 手動 ---
function runManualMode(config) {
    const resultPanel = document.getElementById('panel-center');
    resultPanel.innerHTML = `<h3>📊 結果</h3>
        <div style="background:rgba(59,130,246,0.1); border:1px solid var(--primary); padding:10px; border-radius:4px; text-align:center; margin-bottom:15px;">
            <div style="font-size:0.8rem; color:var(--text-muted);">ターゲットヒット時間期待</div>
            <div id="main-result-time" style="font-size:2rem; font-weight:bold; color:var(--primary);">-</div>
            <div id="main-result-hit" style="font-size:0.9rem;">Hit: -</div>
        </div>
        <table><thead><tr><th>魚種</th><th>演出</th><th>ヒット率</th><th>待機時間</th><th>サイクル時間</th></tr></thead><tbody id="res-table-body"></tbody></table>
        <div style="margin-top: 15px; font-size: 0.85rem; color: var(--text-muted);">
            <div id="scenario-str" style="margin-bottom: 4px;"></div>
            <div id="scenario-prob" style="color: var(--primary); font-weight: bold; margin-bottom: 8px;"></div>
            <div id="avg-cycle-time">平均サイクル時間: -</div>
        </div>`;

    document.getElementById('debug-content-wrapper').innerHTML = `
        <div class="debug-section"><label>【定数】</label><div id="debug-constants" class="formula-box" style="font-size:0.75rem;"></div></div>
        <div class="debug-section"><label>【シナリオ解析】</label><div id="debug-scenario" class="formula-box"></div></div>
        <div class="debug-section"><label>【重み・確率分配の内訳】</label><div id="debug-weights" style="font-size:0.75rem;"></div></div>
        <div class="debug-section"><label>【ターゲットのサイクル時間内訳】</label><div id="debug-calc-target" class="formula-box"></div></div>
        <div class="debug-section"><label>【期待値計算の詳細】</label><div id="debug-calc-expect" class="formula-box"></div></div>
    `;

    const lureType = document.getElementById('lureType').value;
    const count = parseInt(document.getElementById('lureCount').value, 10);
    let discCount = 0;
    if (lureType !== 'none') {
        for (let i = 1; i <= count; i++) {
            if (document.getElementById(`lureStep${i}`).value === 'disc') discCount++;
        }
    }
    const errorMsgEl = document.getElementById('lure-error-msg');
    if (discCount > 1) {
        errorMsgEl.style.display = 'block';
        document.getElementById('res-table-body').innerHTML = `<tr><td colspan="5" style="color:var(--accent-red); font-weight:bold; text-align:center; padding:15px;">⚠️ Error: 発見は1度までです</td></tr>`;
        return;
    } else {
        errorMsgEl.style.display = 'none';
    }

    config.lureType = lureType;
    const isChum = document.getElementById('manualChum').value === 'yes';
    const tradeFish = document.getElementById('manualTradeSlap').value;
    const scenarioId = constructScenarioId();

    const stats = calculateScenarioStats(config, scenarioId, isChum, tradeFish);

    if (stats.error) {
        renderDebugDetails(stats, config, isChum, scenarioId);
        document.getElementById('res-table-body').innerHTML = `<tr><td colspan="5" style="color:var(--accent-red); font-weight:bold; text-align:center; padding:15px;">⚠️ Error: ${stats.error}</td></tr>`;
    } else {
        const expTimeStr = (stats.expectedTime === Infinity) ? '-' : stats.expectedTime.toFixed(1) + ' s';
        const hitRateStr = (stats.targetHitRate * 100).toFixed(2) + '%';
        document.getElementById('main-result-time').textContent = expTimeStr;
        document.getElementById('main-result-hit').textContent = `Hit: ${hitRateStr}`;
        renderResultTable(stats.allFishStats, config.target, stats.scenarioStr, stats.scenarioProb, stats.avgCycleTime);
        renderDebugDetails(stats, config, isChum, scenarioId);
    }
}

// --- モード2: 戦略評価 ---
function runStrategyMode(config) {
    const sets = ['A', 'B'];
    const results = {};

    sets.forEach(set => {
        const setConfig = {
            lureType: document.getElementById(`strat${set}Lure`).value,
            tradeFish: document.getElementById(`strat${set}Trade`).value,
            isChum: document.getElementById(`strat${set}Chum`).value === 'yes',
            presetId: document.getElementById(`strat${set}Preset`).value
        };
        const preset = masterDB.strategy_presets.find(p => p.id === setConfig.presetId);
        results[set] = calculateStrategySet(config, setConfig, preset);
    });

    renderStrategyComparison(results.A, results.B, config);
}

function calculateStrategySet(config, setConfig, preset) {
    if (!preset) return { error: "プリセット未選択" };

    const scenarios = [];
    let weightedHitRate = 0;
    let weightedCycle = 0;
    let weightedWait = 0; // 実効待機時間の加重平均
    let totalProb = 0;
    let error = null;

    for (const sid of preset.eligible_scenarios) {
        const scenarioConfig = { ...config, lureType: setConfig.lureType };
        const stats = calculateScenarioStats(scenarioConfig, sid, setConfig.isChum, setConfig.tradeFish);

        if (stats.error) {
            error = stats.error;
            break;
        }

        const pScenario = stats.scenarioProb;
        if (pScenario === null) {
            error = "確率計算不能"; break;
        }

        totalProb += pScenario;
        weightedHitRate += (pScenario * stats.targetHitRate);
        weightedCycle += (pScenario * stats.avgCycleTime);

        // stats.allFishStats からターゲットの waitTime を取得して加重平均 (外道含む平均ではなく、そのシナリオでのターゲット待機時間を代表とする)
        // または stats.debugData.waitTime を使用
        const waitTime = stats.debugData.waitTime || 0;
        weightedWait += (pScenario * waitTime);

        scenarios.push({
            id: sid,
            label: getScenarioLabel(sid),
            prob: pScenario,
            cycle: stats.avgCycleTime,
            hit: stats.targetHitRate,
            expected: stats.expectedTime,
            pObj: stats.debugData.p // {n, d, g}
        });
    }

    if (error) return { error, name: preset.name, description: preset.description };

    const targetInfo = masterDB.fish[config.target];
    const tHook = targetInfo ? targetInfo.hook_time : 0;

    let expectedTime = Infinity;
    if (weightedHitRate > 0) {
        const successCost = weightedHitRate * tHook;
        expectedTime = (weightedCycle - successCost) / weightedHitRate;
    }

    // 平均キャスト回数
    const avgCastCount = (weightedHitRate > 0) ? (1 / weightedHitRate) : Infinity;

    return {
        name: preset.name,
        description: preset.description,
        trade: setConfig.tradeFish,
        scenarios: scenarios,
        totalProb,
        avgHitRate: weightedHitRate,
        avgCycle: weightedCycle,
        avgWait: weightedWait,
        avgCastCount: avgCastCount,
        expectedTime,
        error: null
    };
}

// --- 描画: 戦略比較 ---
function renderStrategyComparison(resA, resB, config) {
    const center = document.getElementById('panel-center');
    const right = document.getElementById('debug-content-wrapper');

    // 勝敗判定削除、詳細情報の表示へ変更

    const buildCard = (res, label, color) => {
        const time = (res.error || res.expectedTime === Infinity) ? '∞' : res.expectedTime.toFixed(1);
        const hit = (res.error) ? '-' : (res.avgHitRate * 100).toFixed(2) + '%';
        const cast = (res.error || res.avgCastCount === Infinity) ? '-' : res.avgCastCount.toFixed(1);
        const wait = (res.error) ? '-' : res.avgWait.toFixed(1) + 's';

        let descHtml = `<div style="font-size:0.8rem; color:#ccc; margin-bottom:10px; min-height:3em;">${res.description || ''}</div>`;
        let statsHtml = `
            <div style="display:flex; justify-content:space-around; font-size:0.85rem; margin:10px 0; border-top:1px solid #444; padding-top:10px;">
                <div>平均キャスト<br><strong style="font-size:1.1rem">${cast}</strong> 回</div>
                <div>平均実行待機<br><strong style="font-size:1.1rem">${wait}</strong></div>
            </div>
        `;

        // 上位3シナリオ
        let top3Html = '';
        if (!res.error && res.scenarios) {
            const sorted = [...res.scenarios].sort((a, b) => b.prob - a.prob).slice(0, 3);
            top3Html = `<div style="text-align:left; font-size:0.75rem; margin-top:15px; background:rgba(0,0,0,0.2); padding:8px; border-radius:4px;">
                <div style="font-weight:bold; margin-bottom:5px; color:#aaa;">発生確率の高いシナリオ Top3</div>
                ${sorted.map(s => {
                const jpDesc = getJpScenarioDescription(s.pObj);
                return `<div style="margin-bottom:4px; border-bottom:1px dashed #444; padding-bottom:2px;">
                        <div style="color:${color}; font-weight:bold;">${s.label} <span style="font-weight:normal; color:#ccc;">: ${jpDesc}</span></div>
                        <div style="display:flex; justify-content:space-between; color:#bbb;">
                            <span>発生: ${(s.prob * 100).toFixed(1)}%</span>
                            <span>Hit: ${(s.hit * 100).toFixed(1)}%</span>
                        </div>
                    </div>`;
            }).join('')}
            </div>`;
        }

        return `
            <div class="strat-card" style="border-top: 4px solid ${color}">
                <h4>${label}: ${res.name}</h4>
                <div class="main-val">${time} <span style="font-size:1rem; font-weight:normal; color:#888;">s</span></div>
                <div style="font-size:0.9rem; margin-bottom:10px;">Target Hit: ${hit}</div>
                ${descHtml}
                ${statsHtml}
                ${res.error ? `<div style="color:red; font-weight:bold;">⚠️ ${res.error}</div>` : top3Html}
            </div>
        `;
    };

    center.innerHTML = `
        <h3>📊 戦略比較</h3>
        <div class="comparison-container" style="align-items:stretch;">
            ${buildCard(resA, "Set A", "var(--accent-a)")}
            ${buildCard(resB, "Set B", "var(--accent-b)")}
        </div>
    `;

    // 右: 詳細内訳リスト
    let debugHtml = `<div class="debug-section"><label>【定数】</label><div id="debug-constants" class="formula-box" style="font-size:0.75rem;"></div></div>`;
    debugHtml += renderStrategyDebugTable(resA, "Set A", "var(--accent-a)");
    debugHtml += renderStrategyDebugTable(resB, "Set B", "var(--accent-b)");
    right.innerHTML = debugHtml;

    // 定数表示
    const c = GDS;
    document.getElementById('debug-constants').innerHTML =
        `<div style="display:flex; flex-direction:column; gap:5px; font-size:0.75rem;">
            <div>D_Cast (キャスト動作時間): ${c.D_CAST}s</div>
            <div>D_Lure (ルアー動作時間): ${c.D_LURE}s</div>
            <div>D_Blk (ルアー後の空白時間): ${c.D_BLK}s</div>
            <div>D_Chum (撒き餌使用動作時間): ${c.D_CHUM}s</div>
            <div>D_Rest (竿上げ動作時間): ${c.D_REST}s</div>
        </div>`;
}

// 日本語説明生成ヘルパー
function getJpScenarioDescription(p) {
    // p = { n, d, g[] }
    if (p.n === 0) return "ルアー使用なし";

    let parts = [`${p.n}回使用`];

    if (p.d > 0) parts.push(`${p.d}回目に発見`);
    else parts.push("発見なし");

    if (p.g.length > 0) parts.push(`${p.g.join(',')}回目に型確定`);
    else parts.push("型確定なし");

    return parts.join("、");
}

function renderStrategyDebugTable(res, label, color) {
    if (res.error) return `<div class="debug-section" style="border-left:3px solid ${color}; padding-left:10px;"><label style="color:${color}">${label}</label><div style="color:red">${res.error}</div></div>`;

    let html = `<div class="debug-section" style="border-left:3px solid ${color}; padding-left:10px;">
        <label style="color:${color}">${label} (${res.name})</label>
        <div style="font-size:0.7rem; color:#ccc; margin-bottom:5px;">Trade: ${res.trade} / TotalProb: ${(res.totalProb * 100).toFixed(1)}%</div>
        <div style="overflow-x:auto; max-height:200px; overflow-y:auto; border:1px solid #444;">
        <table style="width:100%; font-size:0.7rem; border-collapse:collapse;">
            <thead style="position:sticky; top:0; background:#333;">
                <tr><th>シナリオ</th><th>確率</th><th>Hit</th><th>Cycle</th><th>Exp</th></tr>
            </thead>
            <tbody>`;

    // 確率順にソートして表示
    const sorted = [...res.scenarios].sort((a, b) => b.prob - a.prob);

    sorted.forEach(s => {
        html += `<tr>
            <td style="white-space:nowrap;">${s.label}</td>
            <td>${(s.prob * 100).toFixed(1)}%</td>
            <td>${(s.hit * 100).toFixed(1)}%</td>
            <td>${s.cycle.toFixed(1)}s</td>
            <td>${(s.expected === Infinity) ? '-' : s.expected.toFixed(0)}s</td>
        </tr>`;
    });

    html += `</tbody>
            <tfoot style="position:sticky; bottom:0; background:#333; font-weight:bold;">
                <tr>
                    <td>平均/合計</td>
                    <td>${(res.totalProb * 100).toFixed(0)}%</td>
                    <td>${(res.avgHitRate * 100).toFixed(2)}%</td>
                    <td>${res.avgCycle.toFixed(1)}s</td>
                    <td>${res.expectedTime.toFixed(1)}s</td>
                </tr>
            </tfoot>
        </table></div></div>`;
    return html;
}

// --- 以下、既存ロジック ---
function calculateScenarioStats(config, scenarioId, isChum, tradeFish) {
    const p = parseScenarioId(scenarioId);
    const weightKey = `${config.spot}|${config.weather}|${config.bait}`;
    const baseWeights = masterDB.weights[weightKey] || [];

    const probData = masterDB.probabilities.find(row =>
        row.spot === config.spot &&
        row.weather === config.weather &&
        row.bait === config.bait &&
        (config.lureType === 'none' || row.lure_type === config.lureType) &&
        row.trade_target === tradeFish
    );

    const rawRates = probData ? { disc: probData.disc_rates, guar: probData.guar_rates_nodisc } : null;

    if (!probData && config.lureType !== 'none') {
        return { error: "条件に合う確率データがありません", debugData: { rates: rawRates } };
    }

    const lureTime = p.isNone ? 0 : (GDS.D_CAST + (p.n * GDS.D_LURE) + GDS.D_BLK);

    // シナリオ確率
    let scenarioProb = 1.0;
    let scenarioStrParts = [];
    if (!p.isNone && probData) {
        let found = false;
        let foundStep = 0;
        for (let i = 1; i <= p.n; i++) {
            const idx = i - 1;
            let action = 'none';
            if (p.d === i) action = 'disc';
            else if (p.g.includes(i)) action = 'guar';
            else action = 'none';

            const label = (action === 'disc') ? '発見' : (action === 'guar' ? '型確定' : '何もなし');
            scenarioStrParts.push(label);

            let stepProb = 0;
            if (!found) {
                if (probData.disc_rates[idx] === null) return { error: `データ不足(Step${i})`, debugData: { rates: rawRates } };
                const pDisc = probData.disc_rates[idx];
                const pGuar = probData.guar_rates_nodisc[idx] / 100.0;
                const pD = pDisc / 100.0;

                if (action === 'disc') { stepProb = pD; found = true; foundStep = i; }
                else if (action === 'guar') { stepProb = (1.0 - pD) * pGuar; }
                else { stepProb = (1.0 - pD) * (1.0 - pGuar); }
            } else {
                const key = `d${foundStep}_g${i}`;
                const pGuarAfterVal = (probData.guar_rates_after_disc && probData.guar_rates_after_disc[key] !== undefined) ? probData.guar_rates_after_disc[key] : null;
                if (pGuarAfterVal === null) return { error: `データ不足(Step${i} after)`, debugData: { rates: rawRates } };
                const pGuarAfter = pGuarAfterVal / 100.0;

                if (action === 'guar') stepProb = pGuarAfter;
                else stepProb = 1.0 - pGuarAfter;
            }
            scenarioProb *= stepProb;
        }
    } else {
        if (config.lureType === 'none') scenarioStrParts = ["ルアー使用なし"];
    }

    let pHidden = 0;
    let hiddenFishName = probData && probData.target_hidden ? probData.target_hidden : null;
    if (hiddenFishName && probData.hidden_hit_rates) {
        const rate = probData.hidden_hit_rates[p.fullId];
        if (rate === null) return { error: `データ不足(Scenario ${scenarioId})`, debugData: { rates: rawRates } };
        if (rate !== undefined) pHidden = rate / 100.0;
    }

    let totalWeight = 0, weightDetails = [];
    let modN = (p.n === 1) ? GDS.M_N1 : (p.n === 2 ? GDS.M_N2 : (p.n === 3 ? GDS.M_N3 : 1.0));
    const currentLureJaws = (config.lureType === 'アンビシャスルアー') ? 'large_jaws' : (config.lureType === 'モデストルアー' ? 'small_jaws' : null);
    const lastGuar = (p.g.length > 0 && p.g[p.g.length - 1] === p.n);

    baseWeights.forEach(w => {
        const info = masterDB.fish[w.fish];
        if (!info) return;
        let m = 1.0;
        let isHiddenFish = (w.fish === hiddenFishName);
        if (isHiddenFish) { weightDetails.push({ name: w.fish, base: w.weight, m: '-', final: '-', isHidden: true }); return; }
        if (w.fish === tradeFish) { m = 0; }
        else if (config.lureType !== 'none') {
            const match = (info.type === currentLureJaws);
            if (match) m = modN; else m = lastGuar ? 0 : 1.0;
        }
        let finalW = w.weight * m;
        totalWeight += finalW;
        weightDetails.push({ name: w.fish, base: w.weight, m: m, final: finalW, isHidden: false });
    });

    let allFishStats = [], sumProbTotalCycle = 0, sumProb = 0;
    const fishList = masterDB.spots[config.spot].fish_list;
    fishList.forEach(fName => {
        const wData = baseWeights.find(x => x.fish === fName);
        const fInfo = masterDB.fish[fName];
        if (!wData || !fInfo) return;
        let hitProb = 0;
        if (fName === hiddenFishName) hitProb = pHidden;
        else {
            const wd = weightDetails.find(x => x.name === fName);
            if (wd && totalWeight > 0) hitProb = (wd.final / totalWeight) * (1.0 - pHidden);
        }
        sumProb += hitProb;
        const baseBite = wData.bite_time;
        const biteTime = isChum ? (baseBite * GDS.C_CHUM) : baseBite;
        const waitTime = Math.max(biteTime, lureTime);
        const isTarget = (fName === config.target);
        const actualHookTime = (isTarget || config.isCatchAll) ? fInfo.hook_time : GDS.D_REST;
        const cycleTime = GDS.D_CAST + waitTime + actualHookTime + (isChum ? GDS.D_CHUM : 0);
        sumProbTotalCycle += (hitProb * cycleTime);
        allFishStats.push({ name: fName, vibration: fInfo.vibration, hitRate: hitProb, baseBite, biteTime, lureTime, waitTime, hookTime: actualHookTime, cycleTime, isTarget });
    });

    const targetStat = allFishStats.find(s => s.isTarget);
    const targetHitRate = targetStat ? targetStat.hitRate : 0;
    const expectedTime = (targetHitRate > 0) ? (sumProbTotalCycle - (targetHitRate * (targetStat.hookTime))) / targetHitRate : Infinity;

    return {
        allFishStats, totalWeight, weightDetails, pHidden, hiddenFishName, targetHitRate,
        avgCycleTime: sumProbTotalCycle,
        expectedTime,
        scenarioStr: scenarioStrParts.join('→'),
        scenarioProb: scenarioProb,
        debugData: { p, rates: rawRates, lureTime, biteTime: targetStat?.biteTime, waitTime: targetStat?.waitTime, targetCycle: targetStat?.cycleTime, targetHook: targetStat?.hookTime }
    };
}

function parseScenarioId(id) {
    if (id === 'none_0') return { fullId: id, n: 0, d: 0, g: [], isNone: true };
    const match = id.match(/^n(\d+)_d(\d+)_g(\d+)$/);
    if (!match) return { fullId: id, n: 0, d: 0, g: [], isNone: true };
    const g = (match[3] === '0') ? [] : match[3].split('').map(Number);
    return { fullId: id, n: parseInt(match[1]), d: parseInt(match[2]), g, isNone: false };
}
function getScenarioLabel(id) {
    const p = parseScenarioId(id);
    if (p.isNone) return "素振り";
    let text = `L${p.n}`;
    text += (p.d > 0) ? `: 発見${p.d}` : "";
    text += (p.g.length > 0) ? ` (型確${p.g.join(',')})` : "";
    return text;
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            masterDB = JSON.parse(e.target.result);
            document.getElementById('db-status').textContent = `ONLINE (v${masterDB.version})`;
            document.getElementById('db-status').style.color = 'var(--accent-green)';
            enableControls();
            populateSelectors();
            updateSimulation();
        } catch (err) { alert("Invalid JSON"); }
    };
    reader.readAsText(file);
}

function enableControls() {
    document.querySelectorAll('select:disabled, input:disabled').forEach(el => el.disabled = false);

    const isCatchAll = document.getElementById('isCatchAll');
    if (isCatchAll.checked) {
        ['manualTradeSlap', 'stratATrade', 'stratBTrade'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.value = 'なし'; el.disabled = true; }
        });
    }
    updateLureUI();
}

function populateSelectors() {
    if (!masterDB) return;
    const spotSelect = document.getElementById('currentSpot');
    spotSelect.innerHTML = '';
    Object.keys(masterDB.spots).forEach(spot => spotSelect.appendChild(new Option(spot, spot)));
    spotSelect.addEventListener('change', updateSpotDependents);
    updateSpotDependents();

    const presets = masterDB.strategy_presets || [];
    ['stratAPreset', 'stratBPreset'].forEach(id => {
        const sel = document.getElementById(id);
        sel.innerHTML = '';
        presets.forEach(p => sel.appendChild(new Option(p.name, p.id)));
    });
}

function updateSpotDependents() {
    const spot = document.getElementById('currentSpot').value;
    const spotData = masterDB.spots[spot];
    if (!spotData) return;

    updateSelect('currentWeather', spotData.weathers);
    updateSelect('currentBait', spotData.baits);
    updateSelect('targetFishName', spotData.fish_list);

    const tradeOpts = ['manualTradeSlap', 'stratATrade', 'stratBTrade'];
    tradeOpts.forEach(id => {
        const sel = document.getElementById(id);
        sel.innerHTML = '<option value="なし">なし</option>';
        spotData.fish_list.forEach(f => sel.appendChild(new Option(f, f)));
        if (document.getElementById('isCatchAll').checked) {
            sel.value = 'なし'; sel.disabled = true;
        }
    });

    updateSimulation();
}

function updateSelect(id, items) {
    const el = document.getElementById(id);
    const val = el.value;
    el.innerHTML = '';
    items.forEach(item => el.appendChild(new Option(item, item)));
    if ([...el.options].some(o => o.value === val)) el.value = val;
}

function renderResultTable(stats, targetName, scnStr, scnProb, avgCycle) {
    const tbody = document.getElementById('res-table-body');
    tbody.innerHTML = '';
    const probStr = (scnProb !== null) ? (scnProb * 100).toFixed(2) + '%' : '-';
    document.getElementById('scenario-str').textContent = `シナリオ: ${scnStr}`;
    document.getElementById('scenario-prob').textContent = `ルアー効果シナリオ発生確率: ${probStr}`;
    const avgCycleStr = (avgCycle > 0) ? avgCycle.toFixed(1) + 's' : '-';
    document.getElementById('avg-cycle-time').textContent = `平均サイクル時間: ${avgCycleStr}`;

    stats.forEach(s => {
        const tr = document.createElement('tr');
        if (s.name === targetName) tr.classList.add('row-target');
        const hitStr = (s.hitRate > 0) ? (s.hitRate * 100).toFixed(1) + '%' : (s.hitRate === 0 ? '0.0%' : '-');
        const waitStr = (s.hitRate > 0 || s.waitTime > 0) ? s.waitTime.toFixed(1) + 's' : '-';
        const cycleStr = (s.hitRate > 0 || s.cycleTime > 0) ? s.cycleTime.toFixed(1) + 's' : '-';
        tr.innerHTML = `<td>${s.name}</td><td>${s.vibration}</td><td>${hitStr}</td><td>${waitStr}</td><td>${cycleStr}</td>`;
        tbody.appendChild(tr);
    });
}

function renderDebugDetails(stats, config, isChum, scenarioId) {
    const c = GDS;
    document.getElementById('debug-constants').innerHTML =
        `<div style="display:flex; flex-direction:column; gap:5px; font-size:0.75rem;">
            <div>D_Cast (キャスト動作時間): ${c.D_CAST}s</div>
            <div>D_Lure (ルアー動作時間): ${c.D_LURE}s</div>
            <div>D_Blk (ルアー後の空白時間): ${c.D_BLK}s</div>
            <div>D_Chum (撒き餌使用動作時間): ${c.D_CHUM}s</div>
            <div>D_Rest (竿上げ動作時間): ${c.D_REST}s</div>
        </div>`;

    const searchKeys = `
        <div style="font-size:0.7rem; color:#ccc; margin-bottom:6px; padding-bottom:6px; border-bottom:1px dashed #666; line-height:1.4;">
            <div>Spot: ${config.spot}</div>
            <div>Cond: ${config.weather} / Bait: ${config.bait}</div>
            <div>Target: ${config.target}</div>
            <div>Trade: ${document.getElementById('manualTradeSlap').value} / Lure: ${config.lureType}</div>
        </div>
    `;

    if (stats.error) {
        document.getElementById('debug-scenario').innerHTML = searchKeys + `<div>特定キー: ${getScenarioLabel(scenarioId)} (${scenarioId})</div>`;
        return;
    }

    let analysisHtml = searchKeys;
    analysisHtml += `<div>特定キー: ${getScenarioLabel(scenarioId)} (${scenarioId})</div>`;
    if (stats.debugData && stats.debugData.rates) {
        const fmt = (arr) => arr.map(v => (v === null ? 'null' : v + '%')).join(', ');
        analysisHtml += `<div style="margin-top:5px; font-size:0.7rem; color:#bbb;">
            <div>発見率: [${fmt(stats.debugData.rates.disc)}]</div>
            <div>未発見型確定率: [${fmt(stats.debugData.rates.guar)}]</div>
        </div>`;
    }
    if (!stats.error) analysisHtml += `<div>隠し魚ヒット率 (P_Hidden): ${(stats.pHidden * 100).toFixed(2)}%</div>`;
    document.getElementById('debug-scenario').innerHTML = analysisHtml;

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
    document.getElementById('debug-weights').innerHTML = wHtml;

    const tStat = stats.allFishStats.find(s => s.isTarget);
    if (!tStat) {
        document.getElementById('debug-calc-target').textContent = "ターゲット情報なし";
        document.getElementById('debug-calc-expect').textContent = "-";
        return;
    }

    const p = stats.debugData.p;
    const chumTxt = isChum ? '使用(x0.6)' : '未使用';
    const lureWaitExpr = (p.isNone) ? '0s (なし)' : `${tStat.lureTime.toFixed(1)}s (1.0 + ${p.n}×2.5 + 2.5)`;
    const pre = isChum ? c.D_CHUM : 0;

    const targetTraceHtml = `
        <div style="font-size:0.8rem; margin-bottom:5px;">
            <strong>A. 待機時間 (${tStat.waitTime.toFixed(1)}s)</strong>
            <div style="padding-left:10px;">
               ・補正バイト: ${tStat.biteTime.toFixed(1)}s (基礎${tStat.baseBite.toFixed(1)}s, 撒き餌:${chumTxt})<br>
               ・ルアー拘束: ${lureWaitExpr}<br>
               → 長い方を採用
            </div>
        </div>
        <div style="font-size:0.8rem;">
            <strong>B. サイクル時間 (${tStat.cycleTime.toFixed(1)}s)</strong>
            <div style="padding-left:10px;">
               撒き餌(${pre}s) + キャスト(${c.D_CAST}s) + 待機(A) + 釣り上げ(${tStat.hookTime.toFixed(1)}s)
            </div>
        </div>
    `;
    document.getElementById('debug-calc-target').innerHTML = targetTraceHtml;

    const avgCycle = stats.avgCycleTime;
    const hitRate = stats.targetHitRate;
    const expectedTime = stats.expectedTime;
    const targetHook = stats.debugData.targetHook;
    const formulaStr = `(${avgCycle.toFixed(2)} - (${(hitRate * 100).toFixed(2)}% × ${targetHook.toFixed(1)})) / ${(hitRate * 100).toFixed(2)}%`;
    const expectExpr = (hitRate > 0) ? `${formulaStr} = <strong>${expectedTime.toFixed(1)}s</strong>` : `ターゲット確率が 0% のため計算不可`;

    const expectHtml = `
        <div style="font-size:0.8rem;">
            <div><strong>平均サイクル (E[Cycle]):</strong> ${avgCycle.toFixed(2)}s</div>
            <div><strong>ターゲット確率 (P):</strong> ${(hitRate * 100).toFixed(2)}%</div>
            <div><strong>ターゲット釣り上げ動作時間:</strong> ${targetHook.toFixed(1)}s</div>
            <hr style="margin:5px 0; border:0; border-top:1px dashed #666;">
            <div><strong>式:</strong> (E[Cycle] - (P × 動作時間)) / P</div>
            <div style="margin:5px 0; color:#bbb; font-size:0.75rem; line-height:1.4;">
                ※1匹釣るための平均総時間から、ターゲットを釣り上げる動作時間（成功時のコスト）を除外することで、純粋にヒットするまでの待ち時間を算出しています。
            </div>
            <div style="margin-top:4px; color:var(--primary);">${expectExpr}</div>
        </div>
    `;
    document.getElementById('debug-calc-expect').innerHTML = expectHtml;
}

function initResizers() {
    const leftPanel = document.getElementById('panel-left');
    const rightPanel = document.getElementById('panel-right');
    const resizerLeft = document.getElementById('resizer-left');
    const resizerRight = document.getElementById('resizer-right');

    resizerLeft.addEventListener('mousedown', (e) => { e.preventDefault(); document.addEventListener('mousemove', resizeL); document.addEventListener('mouseup', stopL); });
    const resizeL = (e) => { if (e.clientX > 200 && e.clientX < 500) leftPanel.style.width = e.clientX + 'px'; };
    const stopL = () => { document.removeEventListener('mousemove', resizeL); document.removeEventListener('mouseup', stopL); };

    resizerRight.addEventListener('mousedown', (e) => { e.preventDefault(); document.addEventListener('mousemove', resizeR); document.addEventListener('mouseup', stopR); });
    const resizeR = (e) => { const w = document.body.clientWidth - e.clientX; if (w > 200 && w < 500) rightPanel.style.width = w + 'px'; };
    const stopR = () => { document.removeEventListener('mousemove', resizeR); document.removeEventListener('mouseup', stopR); };
}

init();