/**
 * Fisherman Logic Engine (FLE) v2.0
 * Update: Text Colors, Percentage Units, Layout Tweak
 */

const GDS = {
    D_CAST: 1.0, D_LURE: 2.5, D_BLK: 2.5, D_CHUM: 1.0, D_REST: 2.0,
    C_CHUM: 0.6, M_N1: 1.5, M_N2: 2.0, M_N3: 6.0
};

let masterDB = null;

function init() {
    setupEventListeners();
    initResizers();
}

function setupEventListeners() {
    const uploadBtn = document.getElementById('jsonUpload');
    if (uploadBtn) uploadBtn.addEventListener('change', handleFileUpload);

    const basicInputs = [
        'currentSpot', 'currentWeather', 'currentBait', 'targetFishName',
        'manualChum'
    ];
    basicInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', updateSimulation);
    });

    const isCatchAll = document.getElementById('isCatchAll');
    isCatchAll.addEventListener('change', () => {
        const tradeSlap = document.getElementById('manualTradeSlap');
        if (isCatchAll.checked) {
            tradeSlap.value = 'なし';
            tradeSlap.disabled = true;
        } else {
            tradeSlap.disabled = false;
        }
        updateSimulation();
    });

    document.getElementById('manualTradeSlap').addEventListener('change', updateSimulation);

    const lureInputs = ['lureType', 'lureCount', 'lureStep1', 'lureStep2', 'lureStep3'];
    lureInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => {
            updateLureUI();
            updateSimulation();
        });
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
        if (!isEnabled) {
            el.value = 'none';
            el.style.opacity = '0.3';
        } else {
            el.style.opacity = '1.0';
        }
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
        if (val === 'disc') {
            if (discoveryStep === 0) discoveryStep = i;
        } else if (val === 'guar') {
            guaranteeSteps.push(i);
        }
    }

    const gStr = guaranteeSteps.length > 0 ? guaranteeSteps.join('') : '0';
    return `n${count}_d${discoveryStep}_g${gStr}`;
}

// --- メイン計算処理 ---
function updateSimulation() {
    if (!masterDB) return;

    // バリデーション
    const lureType = document.getElementById('lureType').value;
    const count = parseInt(document.getElementById('lureCount').value, 10);
    let discCount = 0;

    if (lureType !== 'none') {
        for (let i = 1; i <= count; i++) {
            if (document.getElementById(`lureStep${i}`).value === 'disc') discCount++;
        }
    }

    const errorMsgEl = document.getElementById('lure-error-msg');

    const clearResults = (msg) => {
        document.getElementById('main-result-time').textContent = '-';
        document.getElementById('main-result-hit').textContent = 'Hit: -';

        const tableBody = document.getElementById('res-table-body');
        if (msg) {
            tableBody.innerHTML = `<tr><td colspan="5" style="color:var(--accent-red); font-weight:bold; text-align:center; padding:15px;">⚠️ Error: ${msg}</td></tr>`;
        } else {
            tableBody.innerHTML = '';
        }

        document.getElementById('scenario-str').textContent = '';
        document.getElementById('scenario-prob').textContent = '';
        document.getElementById('avg-cycle-time').textContent = '平均サイクル時間: -';

        document.getElementById('debug-constants').innerHTML = '';
        document.getElementById('debug-scenario').innerHTML = '';
        document.getElementById('debug-weights').innerHTML = '';
        document.getElementById('debug-calc-target').innerHTML = '';
        document.getElementById('debug-calc-expect').innerHTML = '';

        if (msg) document.getElementById('debug-scenario').innerHTML = `<span style="color:red">${msg}</span>`;
    };

    if (discCount > 1) {
        errorMsgEl.style.display = 'block';
        clearResults("発見は1度までです");
        return;
    } else {
        errorMsgEl.style.display = 'none';
    }

    // 設定取得
    const config = {
        spot: document.getElementById('currentSpot').value,
        weather: document.getElementById('currentWeather').value,
        bait: document.getElementById('currentBait').value,
        target: document.getElementById('targetFishName').value,
        isCatchAll: document.getElementById('isCatchAll').checked,
        lureType: lureType
    };

    const isChum = document.getElementById('manualChum').value === 'yes';
    const tradeFish = document.getElementById('manualTradeSlap').value;
    const scenarioId = constructScenarioId();

    // 計算実行
    const stats = calculateScenarioStats(config, scenarioId, isChum, tradeFish);

    // 描画更新
    if (stats.error) {
        renderDebugDetails(stats, config, isChum, scenarioId);
        clearResults(stats.error);
    } else {
        const expTimeStr = (stats.expectedTime === Infinity) ? '-' : stats.expectedTime.toFixed(1) + ' s';
        const hitRateStr = (stats.targetHitRate * 100).toFixed(2) + '%';

        document.getElementById('main-result-time').textContent = expTimeStr;
        document.getElementById('main-result-hit').textContent = `Hit: ${hitRateStr}`;

        renderResultTable(stats.allFishStats, config.target, stats.scenarioStr, stats.scenarioProb, stats.avgCycleTime);
        renderDebugDetails(stats, config, isChum, scenarioId);
    }
}

// --- 計算コアロジック ---
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

    const rawRates = probData ? {
        disc: probData.disc_rates,
        guar: probData.guar_rates_nodisc
    } : null;

    if (!probData && config.lureType !== 'none') {
        return { error: "条件に合う確率データがありません (トレード設定等を確認してください)", debugData: { rates: rawRates } };
    }

    const lureTime = p.isNone ? 0 : (GDS.D_CAST + (p.n * GDS.D_LURE) + GDS.D_BLK);

    // シナリオ確率
    let scenarioProb = 1.0;
    let scenarioStrParts = [];
    if (!p.isNone && probData) {
        let found = false;
        let foundStep = 0;
        for (let i = 1; i <= p.n; i++) {
            const val = document.getElementById(`lureStep${i}`).value;
            const idx = i - 1;
            const label = (val === 'disc') ? '発見' : (val === 'guar' ? '型確定' : '何もなし');
            scenarioStrParts.push(label);

            let stepProb = 0;
            if (!found) {
                if (probData.disc_rates[idx] === null || probData.guar_rates_nodisc[idx] === null) {
                    return { error: `データ不足によるエラー: ステップ${i}の確率データがありません`, debugData: { rates: rawRates } };
                }

                const pDisc = probData.disc_rates[idx];
                const pGuar = probData.guar_rates_nodisc[idx] / 100.0;
                const pD = pDisc / 100.0;

                if (val === 'disc') {
                    stepProb = pD;
                    found = true; foundStep = i;
                } else if (val === 'guar') {
                    stepProb = (1.0 - pD) * pGuar;
                } else {
                    stepProb = (1.0 - pD) * (1.0 - pGuar);
                }
            } else {
                const key = `d${foundStep}_g${i}`;

                let pGuarAfterVal = null;
                if (probData.guar_rates_after_disc && probData.guar_rates_after_disc[key] !== undefined) {
                    pGuarAfterVal = probData.guar_rates_after_disc[key];
                }

                if (pGuarAfterVal === null) {
                    return { error: `データ不足によるエラー: ステップ${i} (発見後) のデータがありません`, debugData: { rates: rawRates } };
                }

                const pGuarAfter = pGuarAfterVal / 100.0;

                if (val === 'guar') stepProb = pGuarAfter;
                else stepProb = 1.0 - pGuarAfter;
            }
            scenarioProb *= stepProb;
        }
    } else {
        if (config.lureType === 'none') scenarioStrParts = ["ルアー使用なし"];
    }

    // ヒット率計算
    let pHidden = 0;
    let hiddenFishName = null;
    if (probData && probData.target_hidden) hiddenFishName = probData.target_hidden;

    if (hiddenFishName && probData.hidden_hit_rates) {
        const rate = probData.hidden_hit_rates[p.fullId];
        if (rate === null) {
            return { error: `データ不足によるエラー: シナリオ[${getScenarioLabel(scenarioId)}]のデータが存在しません`, debugData: { rates: rawRates } };
        }
        if (rate !== undefined) pHidden = rate / 100.0;
    }

    let totalWeight = 0;
    let weightDetails = [];
    let modN = 1.0;
    if (p.n === 1) modN = GDS.M_N1;
    if (p.n === 2) modN = GDS.M_N2;
    if (p.n === 3) modN = GDS.M_N3;

    const currentLureJaws = (config.lureType === 'アンビシャスルアー') ? 'large_jaws'
        : (config.lureType === 'モデストルアー' ? 'small_jaws' : null);
    const lastGuar = (p.g.length > 0 && p.g[p.g.length - 1] === p.n);

    baseWeights.forEach(w => {
        const info = masterDB.fish[w.fish];
        if (!info) return;

        let m = 1.0;
        let finalW = 0;
        let isHiddenFish = (w.fish === hiddenFishName);

        if (isHiddenFish) {
            weightDetails.push({ name: w.fish, base: w.weight, m: '-', final: '-', isHidden: true });
            return;
        }

        if (w.fish === tradeFish) {
            m = 0;
        } else {
            if (config.lureType !== 'none') {
                const match = (info.type === currentLureJaws);
                if (match) m = modN;
                else m = lastGuar ? 0 : 1.0;
            }
        }

        finalW = w.weight * m;
        totalWeight += finalW;
        weightDetails.push({ name: w.fish, base: w.weight, m: m, final: finalW, isHidden: false });
    });

    let allFishStats = [];
    let sumProbTotalCycle = 0;
    let sumProb = 0;
    const fishList = masterDB.spots[config.spot].fish_list;

    fishList.forEach(fName => {
        const wData = baseWeights.find(x => x.fish === fName);
        const fInfo = masterDB.fish[fName];
        if (!wData || !fInfo) return;

        let hitProb = 0;
        if (fName === hiddenFishName) {
            hitProb = pHidden;
        } else {
            const wd = weightDetails.find(x => x.name === fName);
            if (wd && totalWeight > 0) {
                hitProb = (wd.final / totalWeight) * (1.0 - pHidden);
            }
        }
        sumProb += hitProb;

        const baseBite = wData.bite_time;
        const biteTime = isChum ? (baseBite * GDS.C_CHUM) : baseBite;
        const waitTime = Math.max(biteTime, lureTime);

        const isTarget = (fName === config.target);
        const actualHookTime = (isTarget || config.isCatchAll) ? fInfo.hook_time : GDS.D_REST;

        const cycleTime = GDS.D_CAST + waitTime + actualHookTime + (isChum ? GDS.D_CHUM : 0);

        sumProbTotalCycle += (hitProb * cycleTime);

        allFishStats.push({
            name: fName,
            vibration: fInfo.vibration,
            hitRate: hitProb,
            baseBite: baseBite,
            biteTime: biteTime,
            lureTime: lureTime,
            waitTime: waitTime,
            hookTime: actualHookTime,
            cycleTime: cycleTime,
            isTarget: isTarget
        });
    });

    const targetStat = allFishStats.find(s => s.isTarget);
    const targetHitRate = targetStat ? targetStat.hitRate : 0;
    const targetHookTime = targetStat ? targetStat.hookTime : 0;

    let expectedTime = Infinity;
    if (targetHitRate > 0) {
        const successCost = targetHitRate * targetHookTime;
        expectedTime = (sumProbTotalCycle - successCost) / targetHitRate;
    }

    return {
        allFishStats, totalWeight, weightDetails, pHidden, hiddenFishName, targetHitRate,
        avgCycleTime: sumProbTotalCycle,
        expectedTime,
        scenarioStr: scenarioStrParts.join('→'),
        scenarioProb: scenarioProb,
        debugData: {
            p: p,
            rates: rawRates,
            lureTime: lureTime,
            biteTime: targetStat ? targetStat.biteTime : 0,
            waitTime: targetStat ? targetStat.waitTime : 0,
            targetCycle: targetStat ? targetStat.cycleTime : 0,
            targetHook: targetHookTime
        }
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
    const tradeSlap = document.getElementById('manualTradeSlap');
    if (isCatchAll.checked) {
        tradeSlap.value = 'なし'; // 【修正】'none' -> 'なし'
        tradeSlap.disabled = true;
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
}

function updateSpotDependents() {
    const spot = document.getElementById('currentSpot').value;
    const spotData = masterDB.spots[spot];
    if (!spotData) return;

    updateSelect('currentWeather', spotData.weathers);
    updateSelect('currentBait', spotData.baits);
    updateSelect('targetFishName', spotData.fish_list);

    const tradeSelect = document.getElementById('manualTradeSlap');
    // 【修正】プルダウン生成時のvalueも "なし" に統一
    tradeSelect.innerHTML = '<option value="なし">なし</option>';
    spotData.fish_list.forEach(f => tradeSelect.appendChild(new Option(f, f)));

    const isCatchAll = document.getElementById('isCatchAll');
    if (isCatchAll.checked) {
        tradeSelect.value = 'なし'; // 【修正】
        tradeSelect.disabled = true;
    }

    updateSimulation();
}

function updateSelect(id, items) {
    const el = document.getElementById(id);
    const val = el.value;
    el.innerHTML = '';
    items.forEach(item => el.appendChild(new Option(item, item)));
    if ([...el.options].some(o => o.value === val)) el.value = val;
}

// --- 描画関数 ---
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

        tr.innerHTML = `
            <td>${s.name}</td>
            <td>${s.vibration}</td>
            <td>${hitStr}</td>
            <td>${waitStr}</td>
            <td>${cycleStr}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderDebugDetails(stats, config, isChum, scenarioId) {
    const c = GDS;

    // 定数表示：1列リスト、日本語説明完全一致
    document.getElementById('debug-constants').innerHTML =
        `<div style="display:flex; flex-direction:column; gap:5px; font-size:0.75rem;">
            <div>D_Cast (キャスト動作時間): ${c.D_CAST}s</div>
            <div>D_Lure (ルアー動作時間): ${c.D_LURE}s</div>
            <div>D_Blk (ルアー後の空白時間): ${c.D_BLK}s</div>
            <div>D_Chum (撒き餌使用動作時間): ${c.D_CHUM}s</div>
            <div>D_Rest (竿上げ動作時間): ${c.D_REST}s</div>
        </div>`;

    // 【修正】検索キーの表示を追加 (文字色を明るく #ccc)
    const searchKeys = `
        <div style="font-size:0.7rem; color:#ccc; margin-bottom:6px; padding-bottom:6px; border-bottom:1px dashed #666; line-height:1.4;">
            <div>Spot: ${config.spot}</div>
            <div>Cond: ${config.weather} / Bait: ${config.bait}</div>
            <div>Target: ${config.target}</div>
            <div>Trade: ${document.getElementById('manualTradeSlap').value} / Lure: ${config.lureType}</div>
        </div>
    `;

    // エラー時のガード
    if (stats.error) {
        document.getElementById('debug-scenario').innerHTML = searchKeys + `<div>特定キー: ${getScenarioLabel(scenarioId)} (${scenarioId})</div>`;
        return;
    }

    let analysisHtml = searchKeys;
    analysisHtml += `<div>特定キー: ${getScenarioLabel(scenarioId)} (${scenarioId})</div>`;

    // 【修正】確率配列の値を表示 (nullはnull, 0は0, 単位%を追加) 文字色も #bbb へ
    if (stats.debugData && stats.debugData.rates) {
        const fmt = (arr) => arr.map(v => (v === null ? 'null' : v + '%')).join(', ');
        analysisHtml += `<div style="margin-top:5px; font-size:0.7rem; color:#bbb;">
            <div>発見率: [${fmt(stats.debugData.rates.disc)}]</div>
            <div>未発見型確定率: [${fmt(stats.debugData.rates.guar)}]</div>
        </div>`;
    }

    if (!stats.error) {
        analysisHtml += `<div>隠し魚ヒット率 (P_Hidden): ${(stats.pHidden * 100).toFixed(2)}%</div>`;
    }

    document.getElementById('debug-scenario').innerHTML = analysisHtml;

    if (stats.error) return;

    let wHtml = `<table style="width:100%; border-collapse:collapse; font-size:0.7rem;">
        <tr style="border-bottom:1px solid #666; text-align:right;">
            <th style="text-align:left">魚種</th><th>基礎W</th><th>M</th><th>最終W</th><th>確率</th>
        </tr>`;
    stats.weightDetails.forEach(d => {
        if (!d.isHidden) {
            const prob = (stats.totalWeight > 0)
                ? (d.final / stats.totalWeight) * (1.0 - stats.pHidden)
                : 0;
            wHtml += `<tr style="text-align:right;">
                <td style="text-align:left">${d.name}</td>
                <td>${d.base}</td>
                <td>x${d.m}</td>
                <td>${d.final.toFixed(1)}</td>
                <td>${(prob * 100).toFixed(2)}%</td>
            </tr>`;
        }
    });
    wHtml += `<tr style="border-top:1px solid #666; font-weight:bold; text-align:right;">
        <td colspan="3">合計(ΣW)</td><td>${stats.totalWeight.toFixed(1)}</td><td>-</td>
    </tr>`;
    stats.weightDetails.forEach(d => {
        if (d.isHidden) {
            wHtml += `<tr style="color:#888; text-align:right;">
                <td style="text-align:left">${d.name}(隠)</td><td>-</td><td>-</td><td>-</td>
                <td>${(stats.pHidden * 100).toFixed(2)}%</td>
            </tr>`;
        }
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

    const expectExpr = (hitRate > 0)
        ? `${formulaStr} = <strong>${expectedTime.toFixed(1)}s</strong>`
        : `ターゲット確率が 0% のため計算不可`;

    // 【修正】注釈文の色を明るく変更 (#bbb)
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

    resizerLeft.addEventListener('mousedown', (e) => {
        e.preventDefault();
        document.addEventListener('mousemove', resizeL);
        document.addEventListener('mouseup', stopL);
    });
    const resizeL = (e) => { if (e.clientX > 200 && e.clientX < 500) leftPanel.style.width = e.clientX + 'px'; };
    const stopL = () => { document.removeEventListener('mousemove', resizeL); document.removeEventListener('mouseup', stopL); };

    resizerRight.addEventListener('mousedown', (e) => {
        e.preventDefault();
        document.addEventListener('mousemove', resizeR);
        document.addEventListener('mouseup', stopR);
    });
    const resizeR = (e) => {
        const w = document.body.clientWidth - e.clientX;
        if (w > 200 && w < 500) rightPanel.style.width = w + 'px';
    };
    const stopR = () => { document.removeEventListener('mousemove', resizeR); document.removeEventListener('mouseup', stopR); };
}

init();