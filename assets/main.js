/**
 * FLE Simulator メインロジック v1.7
 * GDS v3.14.0 に準拠し、UIの排他制御、表示順の固定、サイクル時間の表示を統合。
 */

// --- 【GDS 4.1】 システム固定定数の定義 ---
// ゲーム内の各動作硬直や補正倍率を管理します。
const GDS = {
    D_CAST: 1.0,   // キャスト硬直
    D_LURE: 2.5,   // ルアー硬直
    D_BLK: 2.5,    // ルアー後空白
    D_CHUM: 1.0,   // 撒き餌硬直
    D_REST: 2.0,   // 竿上げ硬直
    C_CHUM: 0.6,   // 撒き餌補正（待機時間への乗算係数）
    M_N1: 1.5,     // 重み補正1（ルアー1回）
    M_N2: 2.0,     // 重み補正2（ルアー2回）
    M_N3: 6.0      // 重み補正3（ルアー3回）
};

let DB = null; // 統合JSONデータを保持

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
 * 選択されたJSONファイルを解析し、DB変数に格納します。
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

// 釣り場リストの初期化
function initSpot() {
    elSpot.innerHTML = '<option value="">-- 釣り場 --</option>';
    Object.keys(DB.spots).forEach(s => {
        const o = document.createElement('option');
        o.value = s; o.textContent = s; elSpot.appendChild(o);
    });
}

/**
 * 釣り場選択時の連動処理
 * 選択された釣り場に基づき、天気、餌、魚種、トレード候補を更新します。
 */
elSpot.addEventListener('change', () => {
    const s = DB.spots[elSpot.value];
    if (!s) return;

    fill(elWeather, s.weather);
    fill(elBait, s.bait);
    fill(elTarget, s.fish);

    // トレードリリース候補の作成（隠し魚を含む全てを対象とする）
    const slappable = s.fish.filter(f => DB.fish[f] && DB.fish[f].can_slap);
    fill(elSlap, slappable, "トレードなし");

    calculate(); // 初期一覧を表示
});

// ドロップダウン補充用ヘルパー
function fill(el, list, def) {
    el.innerHTML = def ? `<option value="なし">${def}</option>` : '';
    list.forEach(i => { const o = document.createElement('option'); o.value = i; o.textContent = i; el.appendChild(o); });
    el.disabled = false;
}

/**
 * 【追加仕様】全部釣り上げるチェック時の排他制御
 * チェック時はトレードリリースを強制解除し、選択不可にします。
 */
elCatch.addEventListener('change', function() {
    if (this.checked) {
        elSlap.value = "なし"; 
        elSlap.disabled = true; 
    } else {
        elSlap.disabled = false;
    }
    calculate();
});

// ルアー設定UIの制御
elLure.addEventListener('change', () => {
    document.getElementById('lure-steps-area').className = (elLure.value === "なし") ? "hidden" : "";
    genSteps();
});
elLureN.addEventListener('change', genSteps);

// ルアーのアクション回数に応じた入力欄の生成
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

// 入力変更時に再計算
[elWeather, elBait, elTarget, elSlap, elChum, elLureN].forEach(e => e.addEventListener('change', calculate));

/**
 * 【メイン計算エンジン】
 * GDSに基づき、各魚種のヒット率、1サイクル時間、獲得効率を算出します。
 */
function calculate() {
    if (!DB || !elSpot.value) return;

    const spot = elSpot.value;
    const weather = elWeather.value;
    const bait = elBait.value;
    const targetFishName = elTarget.value;
    const slap = elSlap.value;
    const lureType = elLure.value;
    const lureN = (lureType === "なし") ? 0 : parseInt(elLureN.value);

    // 天気または餌が未選択の場合は簡易リストを表示
    if (!weather || !bait) {
        renderSimpleFishList(spot);
        return;
    }

    const debugData = { weightDetails: [], sumW: 0, pHidden: 0, hKey: "", targetTrace: null };

    // 1. シナリオ判定（発見タイミングと型確定の有無）
    let i_disc = 0, has_guar = false;
    document.querySelectorAll('.l-step').forEach((s, idx) => {
        if (s.value === "発見") i_disc = idx + 1;
        if (s.value === "型確定") has_guar = true;
    });

    const hiddenFish = DB.spots[spot].fish.find(f => DB.fish[f].is_hidden) || "なし";
    const probKey = `${spot}|${weather}|${bait}|${hiddenFish}|${slap}|${lureType}`;
    const pData = DB.probabilities[probKey];

    // 2. 隠し魚ヒット率 P_Hidden の特定
    debugData.hKey = i_disc > 0 ? `p${i_disc}_${lureN}_${has_guar ? 'yes' : 'no'}` : "通常抽選(未発見)";
    debugData.pHidden = (pData && i_disc > 0 && pData.hidden_hit_rates[debugData.hKey] !== null) ? pData.hidden_hit_rates[debugData.hKey] : 0;

    // 3. 通常魚の重み分配計算
    const M_MAP = { 0: 1.0, 1: GDS.M_N1, 2: GDS.M_N2, 3: GDS.M_N3 };
    const M_val = M_MAP[lureN];
    const lureJaws = (lureType === "アンビシャスルアー") ? "large_jaws" : (lureType === "モデストルアー" ? "small_jaws" : null);

    const currentWeights = DB.weights[`${spot}|${weather}|${bait}`] || [];

    // 分母（合計重み）の計算
    currentWeights.forEach(f => {
        if (f.name === hiddenFish) return;
        const meta = DB.fish[f.name];
        let m_i = (meta && meta.type === lureJaws) ? M_val : 1.0; 
        if (f.name === slap) m_i = 0; // トレードリリース対象は重み0
        
        const finalW = f.w * m_i;
        debugData.sumW += finalW;
        debugData.weightDetails.push({ name: f.name, baseW: f.w, m: m_i, finalW: finalW });
    });

    // 各魚種の個別計算
    const dPre = elChum.checked ? GDS.D_CHUM : 0; // 撒き餌動作硬直
    const resList = currentWeights.map(f => {
        const meta = DB.fish[f.name];
        let prob = 0;
        if (f.name === hiddenFish) {
            prob = debugData.pHidden;
        } else {
            const detail = debugData.weightDetails.find(d => d.name === f.name);
            prob = (debugData.sumW > 0) ? (detail.finalW / debugData.sumW) * (1 - debugData.pHidden) : 0;
        }

        // 実効待機時間 T_Final の算出
        const tPrime = f.t * (elChum.checked ? GDS.C_CHUM : 1.0);
        const tMin = GDS.D_CAST + (lureN * GDS.D_LURE) + GDS.D_BLK;
        const tFinal = Math.max(tPrime, tMin);

        // 終了動作時間 D_End の分岐（全部釣り上げるか竿上げか）
        const dEnd = elCatch.checked ? meta.hook_time : GDS.D_REST;

        // 1サイクル合計時間 T_Cycle
        const tCycle = dPre + GDS.D_CAST + tFinal + dEnd;

        const resultItem = { name: f.name, vibe: meta.vibration, prob: prob, tCycle: tCycle };
        
        // ターゲット魚のデバッグ用トレースデータを記録
        if (f.name === targetFishName) {
            debugData.targetTrace = { tPrime, tMin, tFinal, dEnd, tCycle, prob: prob };
        }

        return resultItem;
    });

    // 平均サイクル時間と期待効率の算出
    let avgCycle = 0;
    resList.forEach(r => { avgCycle += r.prob * r.tCycle; });
    const targetObj = resList.find(r => r.name === targetFishName);
    const efficiency = (avgCycle > 0 && targetObj) ? (180 / avgCycle) * targetObj.prob : 0;

    // UIへの出力
    updateUI(resList, efficiency, avgCycle, targetFishName, spot);
    updateDebugView(debugData, dPre, lureN, efficiency);
}

/**
 * UI表示更新
 * 並び順を釣り場マスタの定義順に固定し、1サイクル時間を表示します。
 */
function updateUI(resList, efficiency, avgCycle, targetName, spotName) {
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
        // 「待機」列に1サイクル時間を表示
        tr.innerHTML = `<td>${r.name}</td><td>${r.vibe}</td><td>${(r.prob * 100).toFixed(1)}%</td><td>${r.tCycle.toFixed(1)}s</td>`;
        tbody.appendChild(tr);
    });
}

/**
 * 釣り場選択直後の暫定表示
 * マスタの順番に従って魚種名を表示します。
 */
function renderSimpleFishList(spotName) {
    const fishNames = DB.spots[spotName].fish;
    const tbody = document.getElementById('res-table-body');
    tbody.innerHTML = '';
    
    fishNames.forEach(name => {
        const meta = DB.fish[name];
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${name}</td><td>${meta ? meta.vibration : '--'}</td><td>--%</td><td>--s</td>`;
        tbody.appendChild(tr);
    });
}

/**
 * デバッグビューの更新
 * 計算に使用された数値とステップを解析パネルに書き出します。
 */
function updateDebugView(debug, dPre, lureN, efficiency) {
    // 1. 定数の表示
    document.getElementById('debug-constants').innerHTML = `
        D_Cast:${GDS.D_CAST}s / D_Lure:${GDS.D_LURE}s / D_Blk:${GDS.D_BLK}s / C_Chum:${GDS.C_CHUM}x
    `;

    // 2. シナリオ判定
    document.getElementById('debug-scenario').innerHTML = `
        特定キー: <strong>${debug.hKey}</strong><br>
        隠し魚ヒット率 (P_Hidden): <strong>${(debug.pHidden * 100).toFixed(2)}%</strong>
    `;

    // 3. 重み分配の内訳
    let wHtml = '<table><tr><th>魚種</th><th>基礎w</th><th>M</th><th>最終w</th></tr>';
    debug.weightDetails.forEach(d => {
        wHtml += `<tr><td>${d.name}</td><td>${d.baseW}</td><td>x${d.m}</td><td>${d.finalW.toFixed(1)}</td></tr>`;
    });
    wHtml += `<tr><td colspan="3">合計(Σw)</td><td><strong>${debug.sumW.toFixed(1)}</strong></td></tr></table>`;
    document.getElementById('debug-weights').innerHTML = wHtml;

    // 4. 計算式のトレース（ターゲット魚）
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