/**
 * FLE Simulator メインロジック v1.10
 * 隠し魚不在時のUI制御と、マスタデータ整合性の強化。
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

function initSpot() {
    elSpot.innerHTML = '<option value="">-- 釣り場 --</option>';
    Object.keys(DB.spots).forEach(s => {
        const o = document.createElement('option');
        o.value = s; o.textContent = s; elSpot.appendChild(o);
    });
}

elSpot.addEventListener('change', () => {
    const s = DB.spots[elSpot.value];
    if (!s) return;
    fill(elWeather, s.weather);
    fill(elBait, s.bait);
    fill(elTarget, s.fish);
    const slappable = s.fish.filter(f => DB.fish[f] && DB.fish[f].can_slap);
    fill(elSlap, slappable, "トレードなし");
    
    // 釣り場が変わったらルアー入力欄を再生成（発見の選択肢制御のため）
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

/**
 * ルアーアクション回数に応じた入力欄の生成
 * 【修正】釣り場に隠し魚がいない場合、「発見」を選択肢から除外します。
 */
function genSteps() {
    if (!DB || !elSpot.value) return;
    
    // 釣り場に隠し魚が存在するか確認
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

    const debugData = { weightDetails: [], sumW: 0, pHidden: 0, hKey: "", targetTrace: null, error: null };

    let i_disc = 0; 
    let discCount = 0;
    let has_guar = false;
    let scenarioParts = [];
    let discoveredAnywhere = false;

    const stepSelects = document.querySelectorAll('.l-step');
    stepSelects.forEach((s, idx) => {
        const val = s.value;
        const t = idx + 1;
        if (val === "発見") {
            if (i_disc === 0) i_disc = t; 
            discCount++;
            scenarioParts.push(`発見${t}`);
            discoveredAnywhere = true;
        } else if (val === "型確定") {
            scenarioParts.push(`型確定${discoveredAnywhere ? "(発見済)" : ""}${t}`);
        } else {
            scenarioParts.push("なし");
        }
        if (idx === lureN - 1) {
            has_guar = (val === "型確定");
        }
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
    if (lureType === "なし") {
        patternProb = null;
    } else {
        if (!pData) {
            debugData.error = "該当するルアー設定のマスタデータが存在しません。";
            showCalculationError(debugData.error);
            return;
        }
        patternProb = 1.0;
        let found = false;
        let foundAt = 0;
        for (let idx = 0; idx < lureN; idx++) {
            const t = idx + 1;
            const val = stepSelects[idx].value;
            let p_t = 0;
            if (!found) {
                const dRate = pData.discovery[idx];
                const gRate = pData.guarantee[idx];
                if (dRate === null || gRate === null) {
                    debugData.error = "マスタデータに確率(Discovery/Guarantee)が定義されていません(null)。";
                    showCalculationError(debugData.error);
                    return;
                }
                if (val === "発見") { p_t = dRate; found = true; foundAt = t; }
                else if (val === "型確定") { p_t = (1 - dRate) * gRate; }
                else { p_t = (1 - dRate) * (1 - gRate); }
            } else {
                let gIdx = (foundAt === 1) ? (t === 2 ? 0 : 1) : 2;
                const dgRate = pData.discovered_guarantee[gIdx];
                if (dgRate === null) {
                    debugData.error = "マスタデータに確率(Discovered Guarantee)が定義されていません(null)。";
                    showCalculationError(debugData.error);
                    return;
                }
                if (val === "型確定") p_t = dgRate;
                else p_t = 1 - dgRate;
            }
            patternProb *= p_t;
        }
    }

    debugData.hKey = i_disc > 0 ? `p${i_disc}_${lureN}_${has_guar ? 'yes' : 'no'}` : "通常抽選(未発見)";
    if (i_disc > 0) {
        const hRate = pData.hidden_hit_rates[debugData.hKey];
        if (hRate === null) {
            debugData.error = "マスタデータに隠し魚のヒット率が定義されていません(null)。";
            showCalculationError(debugData.error);
            return;
        }
        debugData.pHidden = hRate;
    } else {
        debugData.pHidden = 0;
    }

    const M_MAP = { 0: 1.0, 1: GDS.M_N1, 2: GDS.M_N2, 3: GDS.M_N3 };
    const M_val = M_MAP[lureN];
    const lureJaws = (lureType === "アンビシャスルアー") ? "large_jaws" : (lureType === "モデストルアー" ? "small_jaws" : null);
    const currentWeights = DB.weights[`${spot}|${weather}|${bait}`] || [];

    currentWeights.forEach(f => {
        if (f.name === hiddenFish) return;
        const meta = DB.fish[f.name];
        const isMatch = (meta && meta.type === lureJaws);
        let m_i = isMatch ? M_val : 1.0; 
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
        if (f.name === hiddenFish) {
            prob = debugData.pHidden;
        } else {
            const detail = debugData.weightDetails.find(d => d.name === f.name);
            prob = (debugData.sumW > 0) ? (detail.finalW / debugData.sumW) * (1 - debugData.pHidden) : 0;
        }
        const tPrime = f.t * (elChum.checked ? GDS.C_CHUM : 1.0);
        const tMin = GDS.D_CAST + (lureN * GDS.D_LURE) + GDS.D_BLK;
        const tFinal = Math.max(tPrime, tMin);
        const dEnd = elCatch.checked ? meta.hook_time : GDS.D_REST;
        const tCycle = dPre + GDS.D_CAST + tFinal + dEnd;
        const resultItem = { name: f.name, vibe: meta.vibration, prob: prob, tPrime: tPrime, tCycle: tCycle };
        if (f.name === targetFishName) {
            debugData.targetTrace = { tPrime, tMin, tFinal, dEnd, tCycle, prob: prob };
        }
        return resultItem;
    });

    let avgCycle = 0;
    resList.forEach(r => { avgCycle += r.prob * r.tCycle; });
    const targetObj = resList.find(r => r.name === targetFishName);
    const efficiency = (avgCycle > 0 && targetObj) ? (180 / avgCycle) * targetObj.prob : 0;

    updateUI(resList, efficiency, avgCycle, targetFishName, spot, scenarioText, patternProb);
    updateDebugView(debugData, dPre, lureN, efficiency);
}

function showCalculationError(msg) {
    document.getElementById('debug-scenario').innerHTML = `<span style="color:var(--accent-red)">${msg}</span>`;
    document.getElementById('res-efficiency').innerHTML = `0.00 <small>匹</small>`;
    document.getElementById('res-table-body').innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">データがありません (${msg})</td></tr>`;
    document.getElementById('pattern-occurrence').innerText = "";
    document.getElementById('scenario-text').innerText = "";
}

function updateUI(resList, efficiency, avgCycle, targetName, spotName, scenarioText, patternProb) {
    const tbody = document.getElementById('res-table-body');
    tbody.innerHTML = '';
    document.getElementById('res-efficiency').innerHTML = `${efficiency.toFixed(2)} <small>匹</small>`;
    document.getElementById('res-cycle').innerText = avgCycle.toFixed(1);
    const masterOrder = DB.spots[spotName].fish;
    masterOrder.forEach(name => {
        const r = resList.find(item => item.name === name);
        if (!r) return;
        const tr = document.createElement('tr');
        if (r.name === targetName) {
            tr.style.backgroundColor = "rgba(59, 130, 246, 0.2)";
            tr.style.fontWeight = "bold";
        }
        const waitDisplay = (r.prob > 0) ? `${r.tPrime.toFixed(1)}s` : "-";
        const timeDisplay = (r.prob > 0) ? `${r.tCycle.toFixed(1)}s` : "-";
        tr.innerHTML = `<td>${r.name}</td><td>${r.vibe}</td><td>${(r.prob * 100).toFixed(1)}%</td><td>${waitDisplay}</td><td>${timeDisplay}</td>`;
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
    document.getElementById('pattern-occurrence').innerText = "";
    document.getElementById('scenario-text').innerText = "";
}

function updateDebugView(debug, dPre, lureN, efficiency) {
    if (debug.error) return;

    document.getElementById('debug-constants').innerHTML = `
        D_Cast:${GDS.D_CAST}s / D_Lure:${GDS.D_LURE}s / D_Blk:${GDS.D_BLK}s / C_Chum:${GDS.C_CHUM}x
    `;

    document.getElementById('debug-scenario').innerHTML = `
        特定キー: <strong>${debug.hKey}</strong><br>
        隠し魚ヒット率 (P_Hidden): <strong>${(debug.pHidden * 100).toFixed(2)}%</strong>
    `;

    let wHtml = '<table><tr><th>魚種</th><th>基礎w</th><th>M</th><th>最終w</th></tr>';
    debug.weightDetails.forEach(d => {
        wHtml += `<tr><td>${d.name}</td><td>${d.baseW}</td><td>x${d.m}</td><td>${d.finalW.toFixed(1)}</td></tr>`;
    });
    wHtml += `<tr><td colspan="3">合計(Σw)</td><td><strong>${debug.sumW.toFixed(1)}</strong></td></tr></table>`;
    document.getElementById('debug-weights').innerHTML = wHtml;

    if (debug.targetTrace) {
        const t = debug.targetTrace;
        document.getElementById('debug-math').innerHTML = `
            <div class="math-step">① 補正待機: ${t.tPrime.toFixed(1)}s (撒き餌:${elChum.checked})</div>
            <div class="math-step">② 空白制約: ${GDS.D_CAST} + (${lureN}x${GDS.D_LURE}) + ${GDS.D_BLK} = ${t.tMin.toFixed(1)}s</div>
            <div class="math-step">③ T_Final: max(①, ②) = ${t.tFinal.toFixed(1)}s</div>
            <div class="math-step">④ T_Cycle: ${dPre} + ${GDS.D_CAST} + ${t.tFinal.toFixed(1)} + ${t.dEnd} = ${t.tCycle.toFixed(1)}s</div>
            <div class="math-step" style="color:var(--accent-green)">⑤ 期待釣果: (180 / ${t.tCycle.toFixed(1)}) × ${(t.prob*100).toFixed(1)}% = ${efficiency.toFixed(2)}匹</div>
        `;
    }
}