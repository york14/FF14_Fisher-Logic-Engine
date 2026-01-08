/**
 * FLE Simulator メインロジック v1.14
 * 横方向のデバッグパネル開閉、プレースホルダ削除、トレース不具合修正。
 */

// --- 【GDS 4.1】 システム固定定数の定義 ---
const GDS = {
    D_CAST: 1.0,   
    D_LURE: 2.5,   
    D_BLK: 2.5,    
    D_CHUM: 1.0,   
    D_REST: 2.0,   
    C_CHUM: 0.6,   
    M_N1: 1.5,     
    M_N2: 2.0,     
    M_N3: 6.0      
};

let DB = null; 

// UI要素の取得
const elSpot = document.getElementById('sel-spot');
const elWeather = document.getElementById('sel-weather');
const elBait = document.getElementById('sel-bait');
const elTarget = document.getElementById('sel-target');
const elSlap = document.getElementById('sel-slap');
const elLure = document.getElementById('sel-lure');
const elLureN = document.getElementById('sel-lure-n');
const elLureSteps = document.getElementById('step-selectors');
const elChum = document.getElementById('chk-chum');
const elCatch = document.getElementById('chk-catch');

/**
 * デバッグパネルの開閉制御 (横方向)
 */
function toggleDebugView() {
    const layout = document.getElementById('main-layout');
    const panel = document.getElementById('debug-panel');
    const msg = document.getElementById('debug-toggle-msg');
    const isCollapsed = layout.classList.contains('debug-collapsed');
    
    if (isCollapsed) {
        layout.classList.remove('debug-collapsed');
        panel.classList.remove('collapsed');
        msg.textContent = "(クリックで閉じる)";
    } else {
        layout.classList.add('debug-collapsed');
        panel.classList.add('collapsed');
        msg.textContent = "(展開)";
    }
}

/**
 * データ読み込み処理
 */
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

/**
 * 釣り場リストの初期化
 * 「釣り場」というプレースホルダを削除し、最初の候補を自動選択します。
 */
function initSpot() {
    elSpot.innerHTML = ''; 
    const spots = Object.keys(DB.spots);
    spots.forEach(s => {
        const o = document.createElement('option');
        o.value = s; o.textContent = s; elSpot.appendChild(o);
    });
    // JSONロード後、最初の釣り場を反映
    if (spots.length > 0) {
        elSpot.dispatchEvent(new Event('change'));
    }
}

elSpot.addEventListener('change', () => {
    const s = DB.spots[elSpot.value];
    if (!s) return;
    fill(elWeather, s.weather);
    fill(elBait, s.bait);
    fill(elTarget, s.fish);
    const slappable = s.fish.filter(f => DB.fish[f] && DB.fish[f].can_slap);
    fill(elSlap, slappable, "トレードなし");
    if (elLure.value !== "なし") genSteps();
    calculate(); 
});

function fill(el, list, def) {
    el.innerHTML = def ? `<option value="なし">${def}</option>` : '';
    list.forEach(i => { const o = document.createElement('option'); o.value = i; o.textContent = i; el.appendChild(o); });
    el.disabled = false;
}

elCatch.addEventListener('change', function() {
    if (this.checked) {
        elSlap.value = "なし"; 
        elSlap.disabled = true; 
    } else {
        elSlap.disabled = false;
    }
    calculate();
});

elLure.addEventListener('change', () => {
    document.getElementById('lure-steps-area').className = (elLure.value === "なし") ? "hidden" : "";
    genSteps();
});
elLureN.addEventListener('change', genSteps);

function genSteps() {
    if (!DB || !elSpot.value) return;
    const hasHiddenFish = DB.spots[elSpot.value].fish.some(f => DB.fish[f].is_hidden);
    const n = parseInt(elLureN.value);
    elLureSteps.innerHTML = '';
    for(let i=1; i<=n; i++) {
        const d = document.createElement('div');
        d.className = 'input-group';
        let options = `<option value="なし">なし</option>`;
        if (hasHiddenFish) options += `<option value="発見">発見</option>`;
        options += `<option value="型確定">型確定</option>`;
        d.innerHTML = `<label>ルアー使用${i} 結果</label><select class="l-step">${options}</select>`;
        elLureSteps.appendChild(d);
        d.querySelector('select').addEventListener('change', calculate);
    }
    calculate();
}

[elWeather, elBait, elTarget, elSlap, elChum, elLureN].forEach(e => e.addEventListener('change', calculate));

function calculate() {
    if (!DB || !elSpot.value) return;
    const spot = elSpot.value;
    const weather = elWeather.value;
    const bait = elBait.value;
    const targetFishName = elTarget.value;
    const slap = elSlap.value;
    const lureType = elLure.value;
    const lureN = (lureType === "なし") ? 0 : parseInt(elLureN.value);

    if (!weather || !bait) {
        renderSimpleFishList(spot);
        return;
    }

    const debugData = { weightDetails: [], sumW: 0, pHidden: 0, hKey: "", targetTrace: null, error: null, scenarioChain: [] };
    let i_disc = 0, discCount = 0, has_guar = false, scenarioParts = [], discoveredAnywhere = false;

    const stepSelects = document.querySelectorAll('.l-step');
    stepSelects.forEach((s, idx) => {
        const val = s.value;
        const t = idx + 1;
        if (val === "発見") { if (i_disc === 0) i_disc = t; discCount++; scenarioParts.push(`発見${t}`); discoveredAnywhere = true; }
        else if (val === "型確定") { scenarioParts.push(`型確定${discoveredAnywhere ? "(発見済)" : ""}${t}`); }
        else { scenarioParts.push("なし"); }
        if (idx === lureN - 1) { has_guar = (val === "型確定"); }
    });

    if (discCount > 1) {
        debugData.error = "制約エラー: 発見は1サイクルに1回しか発生しません。";
        showCalculationError(debugData.error);
        return;
    }

    const scenarioText = scenarioParts.join("→");
    const hiddenFish = DB.spots[spot].fish.find(f => DB.fish[f].is_hidden) || "なし";
    const probKey = `${spot}|${weather}|${bait}|${hiddenFish}|${slap}|${lureType}`;
    const pData = DB.probabilities[probKey];

    let patternProb = 0;
    if (lureType === "なし") { patternProb = null; } 
    else {
        if (!pData) { debugData.error = `マスタにデータがありません [${probKey}]`; showCalculationError(debugData.error); return; }
        patternProb = 1.0;
        let found = false, foundAt = 0;
        for (let idx = 0; idx < lureN; idx++) {
            const val = stepSelects[idx].value;
            let p_t = 0;
            if (!found) {
                const dRate = pData.discovery[idx], gRate = pData.guarantee[idx];
                if (dRate === null || gRate === null) { debugData.error = `未発見時Null(確率${idx+1})`; showCalculationError(debugData.error); return; }
                if (val === "発見") { p_t = dRate; found = true; foundAt = idx + 1; }
                else if (val === "型確定") { p_t = (1 - dRate) * gRate; }
                else { p_t = (1 - dRate) * (1 - gRate); }
            } else {
                let gIdx = (foundAt === 1) ? (idx === 1 ? 0 : 1) : 2;
                const dgRate = pData.discovered_guarantee[gIdx];
                if (dgRate === null) { debugData.error = `発見済時Null(確率${idx+1})`; showCalculationError(debugData.error); return; }
                if (val === "型確定") p_t = dgRate; else p_t = 1 - dgRate;
            }
            patternProb *= p_t;
            debugData.scenarioChain.push(p_t);
        }
    }

    debugData.hKey = i_disc > 0 ? `p${i_disc}_${lureN}_${has_guar ? 'yes' : 'no'}` : "通常抽選(未発見)";
    if (i_disc > 0) {
        const hRate = pData.hidden_hit_rates[debugData.hKey];
        if (hRate === null) { debugData.error = `隠しヒット率Null [${debugData.hKey}]`; showCalculationError(debugData.error); return; }
        debugData.pHidden = hRate;
    } else { debugData.pHidden = 0; }

    const M_MAP = { 0: 1.0, 1: GDS.M_N1, 2: GDS.M_N2, 3: GDS.M_N3 };
    const lureJaws = (lureType === "アンビシャスルアー") ? "large_jaws" : (lureType === "モデストルアー" ? "small_jaws" : null);
    const currentWeights = DB.weights[`${spot}|${weather}|${bait}`] || [];

    currentWeights.forEach(f => {
        if (f.name === hiddenFish) return;
        const meta = DB.fish[f.name];
        const isMatch = (meta && meta.type === lureJaws);
        let m_i = isMatch ? M_MAP[lureN] : 1.0; 
        if (has_guar && !isMatch) m_i = 0; 
        if (f.name === slap) m_i = 0; 
        const finalW = f.w * m_i;
        debugData.sumW += finalW;
        debugData.weightDetails.push({ name: f.name, baseW: f.w, m: m_i, finalW: finalW });
    });

    const dPre = elChum.checked ? GDS.D_CHUM : 0; 
    const resList = currentWeights.map(f => {
        const meta = DB.fish[f.name];
        let prob = 0;
        if (f.name === hiddenFish) { prob = debugData.pHidden; } 
        else {
            const detail = debugData.weightDetails.find(d => d.name === f.name);
            prob = (debugData.sumW > 0) ? (detail.finalW / debugData.sumW) * (1 - debugData.pHidden) : 0;
        }
        const tPrime = f.t * (elChum.checked ? GDS.C_CHUM : 1.0);
        const tMin = GDS.D_CAST + (lureN * GDS.D_LURE) + GDS.D_BLK;
        const tFinal = Math.max(tPrime, tMin);
        const dEnd = elCatch.checked ? meta.hook_time : GDS.D_REST;
        const tCycle = dPre + GDS.D_CAST + tFinal + dEnd;
        const res = { name: f.name, vibe: meta.vibration, prob: prob, tPrime: tPrime, tMin: tMin, tFinal: tFinal, dEnd: dEnd, tCycle: tCycle };
        if (f.name === targetFishName) debugData.targetTrace = res;
        return res;
    });

    let avgCycle = 0;
    resList.forEach(r => { avgCycle += r.prob * r.tCycle; });
    const targetObj = resList.find(r => r.name === targetFishName);
    
    let efficiency = 0;
    if (avgCycle > 0 && targetObj && targetObj.prob > 0) {
        efficiency = (avgCycle - (targetObj.prob * targetObj.dEnd)) / targetObj.prob;
    }

    updateUI(resList, efficiency, avgCycle, targetFishName, spot, scenarioText, patternProb);
    updateDebugView(debugData, dPre, lureN, efficiency, avgCycle, patternProb);
}

function showCalculationError(msg) {
    document.getElementById('debug-scenario').innerHTML = `<span style="color:var(--accent-red)">${msg}</span>`;
    document.getElementById('res-efficiency').innerHTML = `0.0 <small>秒</small>`;
    document.getElementById('res-table-body').innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">データがありません<br><small>${msg}</small></td></tr>`;
    document.getElementById('pattern-occurrence').innerText = "";
    document.getElementById('scenario-text').innerText = "";
}

function updateUI(resList, efficiency, avgCycle, targetName, spotName, scenarioText, patternProb) {
    const tbody = document.getElementById('res-table-body');
    tbody.innerHTML = '';
    document.getElementById('res-efficiency').innerHTML = `${efficiency.toFixed(1)} <small>秒</small>`;
    document.getElementById('res-cycle').innerText = avgCycle.toFixed(1);
    const masterOrder = DB.spots[spotName].fish;
    masterOrder.forEach(name => {
        const r = resList.find(item => item.name === name);
        if (!r) return;
        const tr = document.createElement('tr');
        if (r.name === targetName) { tr.style.backgroundColor = "rgba(59, 130, 246, 0.2)"; tr.style.fontWeight = "bold"; }
        const waitDisplay = (r.prob > 0) ? `${r.tPrime.toFixed(1)}s` : "-";
        const timeDisplay = (r.prob > 0) ? `${r.tCycle.toFixed(1)}s` : "-";
        tr.innerHTML = `<td>${name}</td><td>${r.vibe}</td><td>${(r.prob * 100).toFixed(1)}%</td><td>${waitDisplay}</td><td>${timeDisplay}</td>`;
        tbody.appendChild(tr);
    });
    document.getElementById('scenario-text').innerText = scenarioText ? `シナリオ: ${scenarioText}` : "";
    const patEl = document.getElementById('pattern-occurrence');
    if (patternProb === null) patEl.innerText = `ルアー効果シナリオ発生確率: -%`;
    else patEl.innerText = `ルアー効果シナリオ発生確率: ${(patternProb * 100).toFixed(2)}%`;
}

function renderSimpleFishList(spotName) {
    const fishNames = DB.spots[spotName].fish;
    const tbody = document.getElementById('res-table-body');
    tbody.innerHTML = '';
    fishNames.forEach(name => {
        const meta = DB.fish[name];
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${name}</td><td>${meta ? meta.vibration : '--'}</td><td>--%</td><td>--s</td><td>--s</td>`;
        tbody.appendChild(tr);
    });
}

function updateDebugView(debug, dPre, lureN, efficiency, avgCycle, patternProb) {
    if (debug.error) return;
    document.getElementById('debug-constants').innerHTML = `D_Cast:${GDS.D_CAST}s | D_Lure:${GDS.D_LURE}s | D_Blk:${GDS.D_BLK}s | C_Chum:${GDS.C_CHUM}x`;
    let scenarioDetail = `特定キー: <strong>${debug.hKey}</strong><br>`;
    if (patternProb !== null) { scenarioDetail += `シナリオ発生率 $P(Pattern)$: ${debug.scenarioChain.map(p => p.toFixed(3)).join(' × ')} = <strong>${(patternProb * 100).toFixed(2)}%</strong><br>`; }
    scenarioDetail += `隠しヒット率 $P_{Hidden}$: <strong>${(debug.pHidden * 100).toFixed(2)}%</strong>`;
    document.getElementById('debug-scenario').innerHTML = scenarioDetail;

    let wHtml = '<table><tr><th>魚種</th><th>基礎w</th><th>M</th><th>補正w</th><th>率</th></tr>';
    debug.weightDetails.forEach(d => {
        const fishProb = (debug.sumW > 0) ? (d.finalW / debug.sumW) * (1 - debug.pHidden) : 0;
        wHtml += `<tr><td>${d.name}</td><td>${d.baseW}</td><td>x${d.m}</td><td>${d.finalW.toFixed(1)}</td><td>${(fishProb*100).toFixed(1)}%</td></tr>`;
    });
    wHtml += `<tr><td colspan="3">通常魚計 $\\sum W$</td><td><strong>${debug.sumW.toFixed(1)}</strong></td><td>-</td></tr></table>`;
    document.getElementById('debug-weights').innerHTML = wHtml;

    if (debug.targetTrace) {
        const t = debug.targetTrace;
        document.getElementById('debug-math').innerHTML = `
            <div class="math-step">【1. 待機時間と制約】<br>補正待機 $T'_{Bite}$: ${t.tPrime.toFixed(1)}s (基礎:${(t.tPrime / (elChum.checked ? GDS.C_CHUM : 1.0)).toFixed(1)}s × ${elChum.checked ? GDS.C_CHUM : 1.0})<br>ルアー制約 $T_{Min}$: ${GDS.D_CAST} + (${lureN}×${GDS.D_LURE}) + ${GDS.D_BLK} = ${t.tMin.toFixed(1)}s<br>実効待機 $T_{Final}$: max(${t.tPrime.toFixed(1)}, ${t.tMin.toFixed(1)}) = <strong>${t.tFinal.toFixed(1)}s</strong></div>
            <div class="math-step">【2. 1サイクル時間】<br>$T_{Cycle}$: ${dPre}(Pre) + ${GDS.D_CAST}(Cast) + ${t.tFinal.toFixed(1)}(Wait) + ${t.dEnd}(End) = <strong>${t.tCycle.toFixed(1)}s</strong></div>
            <div class="math-step" style="color:var(--accent-green)">【3. 期待時間導出 ($E[T_{Hit}]$)】<br>失敗コスト期待値: ${avgCycle.toFixed(2)}s - (${t.prob.toFixed(3)} × ${t.dEnd.toFixed(1)}s) = ${(avgCycle - (t.prob * t.dEnd)).toFixed(2)}s<br>ヒット期待時間: ${(avgCycle - (t.prob * t.dEnd)).toFixed(2)} / ${t.prob.toFixed(3)} = <strong>${efficiency.toFixed(1)}秒</strong></div>
        `;
    }
}