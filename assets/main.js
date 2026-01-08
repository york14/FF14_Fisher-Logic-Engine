/**
 * FLE Simulator メインロジック v1.5
 * 仕様書 (GDS v3.14.0) に基づいて計算プロセスを透明化します。
 */

// --- 【GDS 4.1】 システム固定定数の定義 ---
const GDS = {
    D_CAST: 1.0,   // キャスト硬直
    D_LURE: 2.5,   // ルアー硬直
    D_BLK: 2.5,    // ルアー後空白
    D_CHUM: 1.0,   // 撒き餌硬直
    D_REST: 2.0,   // 竿上げ硬直
    C_CHUM: 0.6,   // 撒き餌による時間短縮係数
    M_N1: 1.5,     // 重み補正(ルアー1回)
    M_N2: 2.0,     // 重み補正(ルアー2回)
    M_N3: 6.0      // 重み補正(ルアー3回)
};

let DB = null; // 読み込んだマスタデータを保持する変数

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

function initSpot() {
    elSpot.innerHTML = '<option value="">-- 釣り場 --</option>';
    Object.keys(DB.spots).forEach(s => {
        const o = document.createElement('option');
        o.value = s; o.textContent = s; elSpot.appendChild(o);
    });
}

/**
 * 入力連動処理
 */
elSpot.addEventListener('change', () => {
    const s = DB.spots[elSpot.value];
    if (!s) return;
    fill(elWeather, s.weather);
    fill(elBait, s.bait);
    fill(elTarget, s.fish);
    // トレードリリース可能魚の抽出
    const slappable = s.fish.filter(f => DB.fish[f] && !DB.fish[f].is_hidden && DB.fish[f].can_slap);
    fill(elSlap, slappable, "トレードなし");
    calculate();
});

function fill(el, list, def) {
    el.innerHTML = def ? `<option value="なし">${def}</option>` : '';
    list.forEach(i => { const o = document.createElement('option'); o.value = i; o.textContent = i; el.appendChild(o); });
    el.disabled = false;
}

elLure.addEventListener('change', () => {
    document.getElementById('lure-steps-area').className = (elLure.value === "なし") ? "hidden" : "";
    genSteps();
});
elLureN.addEventListener('change', genSteps);

function genSteps() {
    const n = parseInt(elLureN.value);
    elLureSteps.innerHTML = '';
    for(let i=1; i<=n; i++) {
        const d = document.createElement('div');
        d.className = 'input-group';
        d.innerHTML = `<label>Step ${i} 結果</label><select class="l-step"><option value="なし">なし</option><option value="発見">発見</option><option value="型確定">型確定</option></select>`;
        elLureSteps.appendChild(d);
        d.querySelector('select').addEventListener('change', calculate);
    }
    calculate();
}

[elWeather, elBait, elTarget, elSlap, elChum, elCatch, elLureN].forEach(e => e.addEventListener('change', calculate));

/**
 * 【メイン計算エンジン】
 * すべての中間計算結果をデバッグ用に保持しながら実行します。
 */
function calculate() {
    if (!DB || !elSpot.value || !elWeather.value || !elBait.value) return;

    // 現在の設定値
    const spot = elSpot.value;
    const weather = elWeather.value;
    const bait = elBait.value;
    const targetFishName = elTarget.value;
    const slap = elSlap.value;
    const lureType = elLure.value;
    const lureN = (lureType === "なし") ? 0 : parseInt(elLureN.value);

    // デバッグ情報収集用オブジェクト
    const debugData = {
        weightDetails: [],
        mathSteps: [],
        sumW: 0,
        pHidden: 0,
        hKey: ""
    };

    // 1. シナリオ判定
    let i_disc = 0, has_guar = false;
    document.querySelectorAll('.l-step').forEach((s, idx) => {
        if (s.value === "発見") i_disc = idx + 1;
        if (s.value === "型確定") has_guar = true;
    });

    const hiddenFish = DB.spots[spot].fish.find(f => DB.fish[f].is_hidden) || "なし";
    const probKey = `${spot}|${weather}|${bait}|${hiddenFish}|${slap}|${lureType}`;
    const pData = DB.probabilities[probKey];
    if (!pData) {
        document.getElementById('debug-scenario').innerText = "マスタデータ(Probability)が見つかりません。";
        return;
    }

    // 2. 隠し魚ヒット率 P_Hidden
    debugData.hKey = i_disc > 0 ? `p${i_disc}_${lureN}_${has_guar ? 'yes' : 'no'}` : "通常抽選(未発見)";
    debugData.pHidden = (i_disc > 0 && pData.hidden_hit_rates[debugData.hKey] !== null) ? pData.hidden_hit_rates[debugData.hKey] : 0;

    // 3. 通常魚の分配計算
    const M_MAP = { 0: 1.0, 1: GDS.M_N1, 2: GDS.M_N2, 3: GDS.M_N3 };
    const M_val = M_MAP[lureN];
    const lureJaws = (lureType === "アンビシャスルアー") ? "large_jaws" : (lureType === "モデストルアー" ? "small_jaws" : null);

    const currentWeights = DB.weights[`${spot}|${weather}|${bait}`] || [];

    // 分母(Sum Weight)の計算
    currentWeights.forEach(f => {
        if (f.name === hiddenFish) return;
        const meta = DB.fish[f.name];
        let m_i = (meta && meta.type === lureJaws) ? M_val : 1.0; // 型一致による補正
        if (f.name === slap) m_i = 0; // トレードリリースによる除外
        
        const finalW = f.w * m_i;
        debugData.sumW += finalW;
        debugData.weightDetails.push({ name: f.name, baseW: f.w, m: m_i, finalW: finalW });
    });

    // 各魚種の確率分配
    const resList = currentWeights.map(f => {
        const meta = DB.fish[f.name];
        let prob = 0;
        if (f.name === hiddenFish) {
            prob = debugData.pHidden;
        } else {
            const detail = debugData.weightDetails.find(d => d.name === f.name);
            // 数式: (自身w / 合計w) * (1 - 隠し魚率)
            prob = (debugData.sumW > 0) ? (detail.finalW / debugData.sumW) * (1 - debugData.pHidden) : 0;
        }
        return { name: f.name, vibe: meta.vibration, prob: prob, baseT: f.t, hook: meta.hook_time };
    });

    // 4. タイムライン・効率計算
    let avgCycle = 0;
    const dPre = elChum.checked ? GDS.D_CHUM : 0;
    const targetObj = resList.find(r => r.name === targetFishName);

    resList.forEach(r => {
        const tPrime = r.baseT * (elChum.checked ? GDS.C_CHUM : 1.0); // 撒き餌補正
        const tMin = GDS.D_CAST + (lureN * GDS.D_LURE) + GDS.D_BLK; // ルアー空白制約
        const tFinal = Math.max(tPrime, tMin); // 実効待機時間
        const dEnd = elCatch.checked ? r.hook : GDS.D_REST; // 終了動作時間
        
        const tCycle = dPre + GDS.D_CAST + tFinal + dEnd;
        avgCycle += r.prob * tCycle;

        // ターゲット魚の計算プロセスをトレース用に保存
        if (r.name === targetFishName) {
            debugData.targetTrace = { tPrime, tMin, tFinal, dEnd, tCycle, prob: r.prob };
        }
    });

    const efficiency = (avgCycle > 0 && targetObj) ? (180 / avgCycle) * targetObj.prob : 0;

    // 画面出力
    updateUI(resList, efficiency, avgCycle, targetFishName);
    updateDebugView(debugData, dPre, lureN, efficiency);
}

/**
 * UI表示更新
 */
function updateUI(resList, efficiency, avgCycle, targetName) {
    const targetObj = resList.find(r => r.name === targetName);
    document.getElementById('res-efficiency').innerHTML = `${efficiency.toFixed(2)} <small>匹</small>`;
    document.getElementById('res-cycle').innerText = avgCycle.toFixed(1);
    
    const tbody = document.getElementById('res-table-body');
    tbody.innerHTML = '';
    resList.sort((a,b) => b.prob - a.prob).forEach(r => {
        const tr = document.createElement('tr');
        if (r.name === targetName) tr.style.backgroundColor = "rgba(59, 130, 246, 0.2)";
        tr.innerHTML = `<td>${r.name}</td><td>${r.vibe}</td><td>${(r.prob * 100).toFixed(1)}%</td><td>${r.baseT.toFixed(1)}s</td>`;
        tbody.appendChild(tr);
    });
}

/**
 * デバッグビュー出力
 * 内部で使われた数値をすべて可視化します
 */
function updateDebugView(debug, dPre, lureN, efficiency) {
    // 1. 定数
    document.getElementById('debug-constants').innerHTML = `
        D_Cast:${GDS.D_CAST}s / D_Lure:${GDS.D_LURE}s / D_Blk:${GDS.D_BLK}s / C_Chum:${GDS.C_CHUM}x
    `;

    // 2. シナリオ
    document.getElementById('debug-scenario').innerHTML = `
        特定キー: <strong>${debug.hKey}</strong><br>
        隠し魚ヒット率 (P_Hidden): <strong>${(debug.pHidden * 100).toFixed(2)}%</strong>
    `;

    // 3. 重み内訳
    let wHtml = '<table><tr><th>魚</th><th>基礎w</th><th>M</th><th>最終w</th></tr>';
    debug.weightDetails.forEach(d => {
        wHtml += `<tr><td>${d.name}</td><td>${d.baseW}</td><td>x${d.m}</td><td>${d.finalW.toFixed(1)}</td></tr>`;
    });
    wHtml += `<tr><td colspan="3">合計(Σw)</td><td><strong>${debug.sumW.toFixed(1)}</strong></td></tr></table>`;
    document.getElementById('debug-weights').innerHTML = wHtml;

    // 4. トレース
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