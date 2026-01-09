/**
 * FLE Simulator メインロジック v2.0
 * ステップ2：戦略評価モードの導入と「L3固定戦略」の合算ロジック実装。
 * フェーズ1の全機能（リサイズ、解析表示、高速描画）を維持した完全版。
 */

// --- 【GDS 4.1】 システム固定定数の定義 ---
const GDS = {
    D_CAST: 1.0, D_LURE: 2.5, D_BLK: 2.5, D_CHUM: 1.0, D_REST: 2.0, C_CHUM: 0.6,
    M_N1: 1.5, M_N2: 2.0, M_N3: 6.0
};

let DB = null; 
let currentMode = 'manual'; // 'manual' or 'strategy'

// UI要素の取得
const elSpot = document.getElementById('sel-spot');
const elWeather = document.getElementById('sel-weather');
const elBait = document.getElementById('sel-bait');
const elTarget = document.getElementById('sel-target');
const elSlap = document.getElementById('sel-slap');
const elLureManual = document.getElementById('sel-lure');
const elLureStrat = document.getElementById('sel-lure-strat');
const elLureN = document.getElementById('sel-lure-n');
const elLureSteps = document.getElementById('step-selectors');
const elChum = document.getElementById('chk-chum');
const elCatch = document.getElementById('chk-catch');
const elLayout = document.getElementById('main-layout');

/**
 * モード切替の処理
 */
function switchMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
    
    // UIコンテナの表示制御
    document.getElementById('manual-controls').classList.toggle('hidden', mode !== 'manual');
    document.getElementById('strategy-controls').classList.toggle('hidden', mode !== 'strategy');
    
    // 戦略モード時は数式トレースセクションを隠す
    const debugMath = document.getElementById('debug-math').parentElement;
    if (debugMath) debugMath.classList.toggle('hidden', mode === 'strategy');
    
    calculate();
}

/**
 * 指定された単一シナリオの結果を評価する (コアエンジン)
 * @param {Object} params { lureCount, discoveryStep, isGuaranteed }
 * @returns {Object} 期待値計算に必要な中間データ
 */
function evaluateScenario(params) {
    const { lureCount, discoveryStep, isGuaranteed } = params;
    const spot = elSpot.value;
    const weather = elWeather.value;
    const bait = elBait.value;
    const targetFishName = elTarget.value;
    const tradeSlapFish = elSlap.value;
    
    // モードに応じたルアー種類の取得
    const lureType = (currentMode === 'manual') ? elLureManual.value : elLureStrat.value;

    const spotData = DB.spots[spot];
    const hiddenFishName = spotData.fish.find(name => DB.fish[name] && DB.fish[name].is_hidden) || "なし";
    const probKey = `${spot}|${weather}|${bait}|${hiddenFishName}|${tradeSlapFish}|${lureType}`;
    const pData = DB.probabilities[probKey];
    if (!pData) return null;

    // 1. シナリオ発生確率 P(Scenario) の計算
    let pScenario = 1.0;
    let found = false, foundAt = 0;
    let scenarioChain = [];
    for (let t = 1; t <= lureCount; t++) {
        let p_t = 0;
        const isDiscoveryStep = (discoveryStep === t);
        const isStepGuar = (t === lureCount && isGuaranteed); // 最終回のみ判定

        if (!found) {
            const dRate = pData.discovery[t-1], gRate = pData.guarantee[t-1];
            if (isDiscoveryStep) { p_t = dRate; found = true; foundAt = t; }
            else if (isStepGuar) { p_t = (1 - dRate) * gRate; }
            else { p_t = (1 - dRate) * (1 - gRate); }
        } else {
            const gIdx = getDiscoveredGuaranteeIndex(foundAt, t);
            if (gIdx === -1) return null;
            const dgRate = pData.discovered_guarantee[gIdx];
            p_t = isStepGuar ? dgRate : (1 - dgRate);
        }
        pScenario *= p_t;
        scenarioChain.push(p_t);
    }

    // 2. 隠し魚ヒット率の特定
    const hKey = discoveryStep > 0 ? `p${discoveryStep}_${lureCount}_${isGuaranteed ? 'yes' : 'no'}` : "通常抽選(未発見)";
    const pHidden = discoveryStep > 0 ? (pData.hidden_hit_rates[hKey] || 0) : 0;

    // 3. 重み計算と個別確率の算出
    const M_MAP = { 0: 1.0, 1: GDS.M_N1, 2: GDS.M_N2, 3: GDS.M_N3 };
    const lureJaws = (lureType === "アンビシャスルアー") ? "large_jaws" : (lureType === "モデストルアー" ? "small_jaws" : null);
    const spotWeights = DB.weights[`${spot}|${weather}|${bait}`] || [];

    let sumWeight = 0;
    let weightDetails = [];

    spotWeights.forEach(f => {
        const meta = DB.fish[f.name];
        const isHidden = (f.name === hiddenFishName);
        if (!isHidden) {
            const isMatch = (meta.type === lureJaws);
            let mMultiplier = isMatch ? M_MAP[lureCount] : 1.0;
            if (isGuaranteed && !isMatch) mMultiplier = 0;
            if (f.name === tradeSlapFish) mMultiplier = 0;
            
            const finalWeight = f.w * mMultiplier;
            sumWeight += finalWeight;
            weightDetails.push({ name: f.name, baseWeight: f.w, m: mMultiplier, finalWeight, isHidden: false });
        } else {
            weightDetails.push({ name: f.name, baseWeight: 0, m: 0, finalWeight: 0, isHidden: true });
        }
    });

    // 4. 結果リスト（ヒット率と時間）の生成
    const preActionDuration = elChum.checked ? GDS.D_CHUM : 0;
    const minLureWaitTime = GDS.D_CAST + (lureCount * GDS.D_LURE) + GDS.D_BLK;

    let targetProb = 0;
    let targetTrace = null;
    let avgCycleTime = 0;
    const resultList = weightDetails.map(d => {
        const meta = DB.fish[d.name];
        const sw = spotWeights.find(s => s.name === d.name);
        
        let prob = d.isHidden ? pHidden : (sumWeight > 0 ? (d.finalWeight / sumWeight) * (1 - pHidden) : 0);
        
        const correctedBiteTime = sw.t * (elChum.checked ? GDS.C_CHUM : 1.0);
        const effectiveWaitTime = Math.max(correctedBiteTime, minLureWaitTime);
        const endActionDuration = elCatch.checked ? meta.hook_time : GDS.D_REST;
        const totalCycleTime = preActionDuration + GDS.D_CAST + effectiveWaitTime + endActionDuration;

        avgCycleTime += prob * totalCycleTime;
        if (d.name === targetFishName) targetProb = prob;

        const item = { 
            name: d.name, vibe: meta.vibration, prob, correctedBiteTime, minLureWaitTime, 
            effectiveWaitTime, endActionDuration, totalCycleTime 
        };
        if (d.name === targetFishName) targetTrace = item;
        return item;
    });

    return { 
        pScenario, scenarioChain, targetProb, avgCycleTime, resultList, 
        weightDetails, sumWeight, pHidden, hKey, targetTrace 
    };
}

/**
 * 計算のエントリポイント
 */
function calculate() {
    if (!DB || !elSpot.value) return;
    if (currentMode === 'strategy') calculateStrategy();
    else calculateManual();
}

/**
 * モード1：手動設定（1つのシナリオを詳細解析）
 */
function calculateManual() {
    const lureN = (elLureManual.value === "なし") ? 0 : parseInt(elLureN.value);
    const weather = elWeather.value;
    const bait = elBait.value;

    if (!weather || !bait) {
        renderSimpleFishList(elSpot.value);
        return;
    }

    let discoveryStep = 0, isGuaranteed = false;
    const stepSelects = document.querySelectorAll('.l-step');
    stepSelects.forEach((s, i) => {
        if (s.value === "発見" && discoveryStep === 0) discoveryStep = i + 1;
        if (i === lureN - 1) isGuaranteed = (s.value === "型確定");
    });

    const res = evaluateScenario({ lureCount: lureN, discoveryStep, isGuaranteed });
    if (!res) { showCalculationError("データ未登録"); return; }

    // UIの更新
    const targetFish = DB.fish[elTarget.value];
    const dEndTarget = elCatch.checked ? (targetFish ? targetFish.hook_time : GDS.D_REST) : GDS.D_REST;
    const efficiency = (res.targetProb > 0) ? (res.avgCycleTime - (res.targetProb * dEndTarget)) / res.targetProb : 0;

    updateUI(res.resultList, efficiency, res.avgCycleTime, elTarget.value, elSpot.value, "", res.pScenario);
    updateDebugView(res, elChum.checked ? GDS.D_CHUM : 0, lureN, efficiency, res.avgCycleTime, res.pScenario);
}

/**
 * モード2：戦略評価（全シナリオを加重平均で合算）
 */
function calculateStrategy() {
    const lureType = elLureStrat.value;
    const stratPreset = document.getElementById('sel-strategy-preset').value;

    if (lureType === "なし" || stratPreset === "none") {
        showCalculationError("戦略またはルアーを選択してください。");
        return;
    }

    // 戦略「必ず3回使う」の末端シナリオの定義
    const scenarios = [
        { discoveryStep: 1, lureCount: 3, isGuaranteed: true },
        { discoveryStep: 1, lureCount: 3, isGuaranteed: false },
        { discoveryStep: 2, lureCount: 3, isGuaranteed: true },
        { discoveryStep: 2, lureCount: 3, isGuaranteed: false },
        { discoveryStep: 3, lureCount: 3, isGuaranteed: false },
        { discoveryStep: 0, lureCount: 3, isGuaranteed: true },
        { discoveryStep: 0, lureCount: 3, isGuaranteed: false }
    ];

    let totalP_Target = 0;
    let totalT_Cycle = 0;

    scenarios.forEach(s => {
        const res = evaluateScenario(s);
        if (res) {
            totalP_Target += res.pScenario * res.targetProb;
            totalT_Cycle += res.pScenario * res.avgCycleTime;
        }
    });

    const targetFish = DB.fish[elTarget.value];
    const dEndTarget = elCatch.checked ? (targetFish ? targetFish.hook_time : GDS.D_REST) : GDS.D_REST;
    const efficiency = (totalP_Target > 0) ? (totalT_Cycle - (totalP_Target * dEndTarget)) / totalP_Target : 0;

    updateStrategyUI(efficiency, totalT_Cycle, totalP_Target);
}

/**
 * 戦略モード専用のUI更新
 */
function updateStrategyUI(efficiency, cycle, hitRate) {
    document.getElementById('res-efficiency').innerHTML = (efficiency > 0) ? `${efficiency.toFixed(1)} <small>秒</small>` : `- <small>秒</small>`;
    document.getElementById('res-cycle').innerText = cycle.toFixed(1);
    document.getElementById('pattern-occurrence').innerText = `戦略成立確率: 100.00% (全シナリオ合算)`;
    document.getElementById('scenario-text').innerText = `戦略: 全アクション実行（L3固定）`;
    
    const tbody = document.getElementById('res-table-body');
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:var(--text-muted);">
        戦略モードでは全体の期待値のみ算出されます。<br>
        ターゲット獲得率: ${(hitRate * 100).toFixed(2)}%
    </td></tr>`;
}

/**
 * 手動モード用：UI更新ロジック (DocumentFragment最適化済)
 */
function updateUI(resultList, efficiency, avgCycleTime, targetName, spotName, scenarioText, pScenario) {
    const elTableBody = document.getElementById('res-table-body');
    const elFragment = document.createDocumentFragment();

    document.getElementById('res-efficiency').innerHTML = (efficiency > 0) ? `${efficiency.toFixed(1)} <small>秒</small>` : `- <small>秒</small>`;
    document.getElementById('res-cycle').innerText = avgCycleTime.toFixed(1);
    
    const spotFishOrder = DB.spots[spotName].fish;
    spotFishOrder.forEach(name => {
        const item = resultList.find(res => res.name === name);
        if (!item) return;

        const elTr = document.createElement('tr');
        if (item.name === targetName) { 
            elTr.style.backgroundColor = "rgba(59, 130, 246, 0.2)"; 
            elTr.style.fontWeight = "bold"; 
        }
        const waitDisp = (item.prob > 0) ? `${item.correctedBiteTime.toFixed(1)}s` : "-";
        const cycleDisp = (item.prob > 0) ? `${item.totalCycleTime.toFixed(1)}s` : "-";
        
        elTr.innerHTML = `<td>${name}</td><td>${item.vibe}</td><td>${(item.prob * 100).toFixed(1)}%</td><td>${waitDisp}</td><td>${cycleDisp}</td>`;
        elFragment.appendChild(elTr);
    });

    elTableBody.innerHTML = '';
    elTableBody.appendChild(elFragment);
    document.getElementById('pattern-occurrence').innerText = `ルアー効果シナリオ発生確率: ${(pScenario * 100).toFixed(2)}%`;
}

/**
 * 手動モード用：デバッグビュー更新
 */
function updateDebugView(res, preDuration, lureCount, efficiency, avgCycleTime, pScenario) {
    document.getElementById('debug-constants').innerHTML = `D_Cast:${GDS.D_CAST}s | D_Lure:${GDS.D_LURE}s | D_Blk:${GDS.D_BLK}s | C_Chum:${GDS.C_CHUM}x`;
    
    let scenarioHtml = `特定キー: <strong>${res.hKey}</strong><br>`;
    scenarioHtml += `発生率: ${res.scenarioChain.map(p => p.toFixed(3)).join(' × ')} = <strong>${(pScenario * 100).toFixed(2)}%</strong><br>`;
    scenarioHtml += `隠しヒット率 $P_{Hidden}$: <strong>${(res.pHidden * 100).toFixed(2)}%</strong>`;
    document.getElementById('debug-scenario').innerHTML = scenarioHtml;

    let weightTable = '<table><tr><th>魚種</th><th>基礎w</th><th>M</th><th>補正w</th><th>率</th></tr>';
    res.weightDetails.filter(d => !d.isHidden).forEach(d => {
        const p = (res.sumWeight > 0) ? (d.finalWeight / res.sumWeight) * (1 - res.pHidden) : 0;
        weightTable += `<tr><td>${d.name}</td><td>${d.baseWeight}</td><td>x${d.m}</td><td>${d.finalWeight.toFixed(1)}</td><td>${(p * 100).toFixed(1)}%</td></tr>`;
    });
    weightTable += `<tr><td colspan="3">通常魚計 $\\sum W$</td><td><strong>${res.sumWeight.toFixed(1)}</strong></td><td>-</td></tr>`;
    
    const hidden = res.weightDetails.find(d => d.isHidden);
    if (hidden && res.pHidden > 0) {
        weightTable += `<tr><td>${hidden.name} (隠し)</td><td>-</td><td>-</td><td>-</td><td><strong>${(res.pHidden * 100).toFixed(1)}%</strong></td></tr>`;
    }
    document.getElementById('debug-weights').innerHTML = weightTable + '</table>';

    if (res.targetTrace) {
        const t = res.targetTrace;
        const effDisp = (efficiency > 0) ? `${efficiency.toFixed(1)}秒` : "- (釣れない)";
        document.getElementById('debug-math').innerHTML = `
            <div class="math-step">実効待機 $T_{Final}$: max(${t.correctedBiteTime.toFixed(1)}, ${t.minLureWaitTime.toFixed(1)}) = <strong>${t.effectiveWaitTime.toFixed(1)}s</strong></div>
            <div class="math-step">$T_{Cycle}$: ${preDuration}(Pre) + ${GDS.D_CAST}(Cast) + ${t.effectiveWaitTime.toFixed(1)}(Wait) + ${t.endActionDuration}(End) = <strong>${t.totalCycleTime.toFixed(1)}s</strong></div>
            <div class="math-step" style="color:var(--accent-green)">期待時間: ${(avgCycleTime - (t.prob * t.endActionDuration)).toFixed(2)} / ${t.prob.toFixed(3)} = <strong>${effDisp}</strong></div>
        `;
    }
}

/**
 * リサイズ機能
 */
function initResizers() {
    const elResLeft = document.getElementById('resizer-left');
    const elResRight = document.getElementById('resizer-right');
    let isDragging = false;
    let currentResizer = null;

    const onMouseDown = (e) => { isDragging = true; currentResizer = e.target; document.body.style.userSelect = 'none'; };
    const onMouseMove = (e) => {
        if (!isDragging) return;
        const rect = elLayout.getBoundingClientRect();
        const relX = e.clientX - rect.left;
        const cols = window.getComputedStyle(elLayout).getPropertyValue('grid-template-columns').split(' ');
        if (currentResizer === elResLeft) cols[0] = `${Math.max(200, Math.min(500, relX))}px`;
        else if (currentResizer === elResResRight) cols[2] = `${Math.max(300, Math.min(800, relX - parseInt(cols[0]) - 8))}px`;
        elLayout.style.gridTemplateColumns = cols.join(' ');
    };
    const onMouseUp = () => { isDragging = false; document.body.style.userSelect = 'auto'; };

    elResLeft.addEventListener('mousedown', onMouseDown);
    elResRight.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

// --- 初期化・データロード系 ---

function initSpot() {
    elSpot.innerHTML = ''; 
    const names = Object.keys(DB.spots);
    names.forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; elSpot.appendChild(o); });
    if (names.length > 0) elSpot.dispatchEvent(new Event('change'));
}

elSpot.addEventListener('change', () => {
    const data = DB.spots[elSpot.value];
    if (!data) return;
    fillSelector(elWeather, data.weather);
    fillSelector(elBait, data.bait);
    fillSelector(elTarget, data.fish);
    fillSelector(elSlap, data.fish.filter(f => DB.fish[f] && DB.fish[f].can_slap), "なし");
    genLureStepsUI(); 
    calculate(); 
});

function fillSelector(el, list, def) {
    el.innerHTML = def ? `<option value="なし">${def}</option>` : '';
    list.forEach(i => { const o = document.createElement('option'); o.value = i; o.textContent = i; el.appendChild(o); });
    el.disabled = false;
}

function genLureStepsUI() {
    if (!DB || !elSpot.value) return;
    elLureSteps.innerHTML = ''; 
    if (elLureManual.value === "なし") return;
    const hasHidden = DB.spots[elSpot.value].fish.some(f => DB.fish[f] && DB.fish[f].is_hidden);
    const n = parseInt(elLureN.value);
    for(let i = 1; i <= n; i++) {
        const d = document.createElement('div'); d.className = 'input-group';
        let opts = `<option value="なし">なし</option>`;
        if (hasHidden) opts += `<option value="発見">発見</option>`;
        opts += `<option value="型確定">型確定</option>`;
        d.innerHTML = `<label>ルアー使用${i}</label><select class="l-step">${opts}</select>`;
        elLureSteps.appendChild(d);
        d.querySelector('select').addEventListener('change', calculate);
    }
}

document.getElementById('json-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        DB = JSON.parse(ev.target.result);
        document.getElementById('db-status').textContent = "ONLINE";
        document.getElementById('db-status').style.color = "#22c55e";
        initSpot();
    };
    reader.readAsText(file);
});

function toggleDebugView() {
    const panel = document.getElementById('debug-panel');
    const msg = document.getElementById('debug-toggle-msg');
    const isColl = elLayout.classList.toggle('debug-collapsed');
    panel.classList.toggle('collapsed', isColl);
    msg.textContent = isColl ? "(展開)" : "(クリックで閉じる)";
}

function showCalculationError(msg) {
    document.getElementById('debug-scenario').innerHTML = `<span style="color:var(--accent-red)">${msg}</span>`;
    document.getElementById('res-efficiency').innerHTML = `- <small>秒</small>`;
    document.getElementById('res-table-body').innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px;">${msg}</td></tr>`;
}

function renderSimpleFishList(spotName) {
    const names = DB.spots[spotName].fish;
    const body = document.getElementById('res-table-body');
    const frag = document.createDocumentFragment();
    names.forEach(n => {
        const meta = DB.fish[n];
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${n}</td><td>${meta ? meta.vibration : '--'}</td><td>--%</td><td>--s</td><td>--s</td>`;
        frag.appendChild(tr);
    });
    body.innerHTML = ''; body.appendChild(frag);
}

function getDiscoveredGuaranteeIndex(discStep, currStep) {
    if (discStep === 1) return (currStep === 2) ? 0 : 1;
    if (discStep === 2) return 2;
    return -1;
}

// イベント設定
document.querySelectorAll('.mode-tab').forEach(t => t.addEventListener('click', () => switchMode(t.dataset.mode)));
[elSpot, elWeather, elBait, elTarget, elSlap, elChum, elCatch, elLureManual, elLureStrat, elLureN].forEach(el => el.addEventListener('change', calculate));
elLureManual.addEventListener('change', () => {
    document.getElementById('lure-steps-area').className = (elLureManual.value === "なし") ? "hidden" : "";
    genLureStepsUI();
});
elLureN.addEventListener('change', genLureStepsUI);

initResizers();