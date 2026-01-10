/**
 * Fisherman Logic Engine (FLE) v2.0
 * 新ID体系 (n3_d1_g2 etc) 対応・戦略評価モード搭載版
 */

// --- 1. 物理定数定義 (GDS v3.14.0) ---
const GDS = {
    D_CAST: 1.0,    // キャスト硬直
    D_LURE: 2.5,    // ルアーアクション時間
    D_BLK: 2.5,     // ルアー後のヒット禁止空白時間
    D_CHUM: 1.0,    // 撒き餌動作硬直
    D_REST: 2.0,    // 竿上げ（リリース）硬直
    C_CHUM: 0.6,    // 撒き餌によるヒット時間短縮係数
    M_N1: 1.5,      // ルアー1回時の重み倍率
    M_N2: 2.0,      // ルアー2回時の重み倍率
    M_N3: 6.0       // ルアー3回時の重み倍率
};

// --- グローバル状態 ---
let masterDB = null;
let currentMode = 'manual'; // 'manual' or 'strategy'

// --- 2. 初期化とイベント設定 ---

/**
 * アプリケーション初期化
 */
async function init() {
    try {
        // 新しいJSONファイルを読み込む
        const response = await fetch('logic_master.json');
        if (!response.ok) throw new Error("JSON load failed");
        
        masterDB = await response.json();
        console.log("Master DB Loaded:", masterDB);

        // 初期セットアップ
        setupModeTabs();
        setupEventListeners();
        populateSelectors();
        
        // 初回計算実行
        updateSimulation();

    } catch (e) {
        console.error("初期化エラー:", e);
        const debugContent = document.getElementById('debug-content');
        if(debugContent) {
            debugContent.innerHTML = `<div class="error" style="color:red; padding:10px;">データ読み込みエラー: ${e.message}<br>logic_master.json が配置されているか確認してください。</div>`;
        }
    }
}

/**
 * モード切り替えタブの制御
 */
function setupModeTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // アクティブクラスの切り替え
            document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.mode-content').forEach(el => el.classList.remove('active'));
            
            tab.classList.add('active');
            
            // モード更新
            currentMode = tab.dataset.mode;
            
            // 対応するコンテンツを表示
            const contentId = `${currentMode}-settings`;
            const contentEl = document.getElementById(contentId);
            if(contentEl) contentEl.classList.add('active');
            
            // 再計算
            updateSimulation();
        });
    });
}

/**
 * UIイベントリスナーの登録
 */
function setupEventListeners() {
    // 監視対象のIDリスト
    const inputs = [
        'currentSpot', 'currentWeather', 'currentBait', 'targetFishName', 'isCatchAll',
        'manualChum', 'manualTradeSlap', 'manualLureScenario',
        'strategyChum', 'strategyTradeSlap', 'strategyPresetA', 'strategyPresetB'
    ];

    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', updateSimulation);
    });
}

/**
 * セレクタの選択肢生成
 */
function populateSelectors() {
    if (!masterDB) return;

    // 1. 釣り場 (Spot)
    const spotSelect = document.getElementById('currentSpot');
    spotSelect.innerHTML = '';
    Object.keys(masterDB.spots).forEach(spot => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = spot;
        spotSelect.appendChild(opt);
    });

    // 2. 釣り場変更時の連動設定（天気・エサ・ターゲット）
    spotSelect.addEventListener('change', updateSpotDependents);
    updateSpotDependents(); // 初回実行

    // 3. ルアーシナリオ (手動モード用: 33パターン)
    populateLureScenarios();

    // 4. 戦略プリセット (戦略モード用)
    populateStrategyPresets();
}

/**
 * 釣り場に紐づく選択肢（天気・エサ・魚）を更新
 */
function updateSpotDependents() {
    const spot = document.getElementById('currentSpot').value;
    const spotData = masterDB.spots[spot];
    if (!spotData) return;

    // 天気
    const weatherSelect = document.getElementById('currentWeather');
    weatherSelect.innerHTML = '';
    spotData.weathers.forEach(w => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = w;
        weatherSelect.appendChild(opt);
    });

    // エサ
    const baitSelect = document.getElementById('currentBait');
    baitSelect.innerHTML = '';
    spotData.baits.forEach(b => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = b;
        baitSelect.appendChild(opt);
    });

    // ターゲット魚 & トレード対象
    const fishList = spotData.fish_list;
    const targets = ['targetFishName', 'manualTradeSlap', 'strategyTradeSlap'];
    
    targets.forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const currentVal = sel.value;
        sel.innerHTML = '';
        
        // トレード対象には「なし」を追加
        if (id.includes('Trade')) {
            const opt = document.createElement('option');
            opt.value = 'none';
            opt.textContent = 'なし';
            sel.appendChild(opt);
        }

        fishList.forEach(f => {
            const opt = document.createElement('option');
            opt.value = opt.textContent = f;
            sel.appendChild(opt);
        });
        
        // 可能なら前の値を保持
        if ([...sel.options].some(o => o.value === currentVal)) {
            sel.value = currentVal;
        }
    });
}

/**
 * ルアーシナリオID (33種) の生成とセレクトボックス設定
 */
function populateLureScenarios() {
    const select = document.getElementById('manualLureScenario');
    if (!select) return;
    select.innerHTML = '';

    // IDリスト生成
    const scenarios = generateAllScenarioIds();
    
    scenarios.forEach(id => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = getScenarioLabel(id);
        select.appendChild(opt);
    });
}

/**
 * 戦略プリセットの選択肢設定
 */
function populateStrategyPresets() {
    const presets = masterDB.strategy_presets || [];
    ['strategyPresetA', 'strategyPresetB'].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        select.innerHTML = '';
        
        presets.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            select.appendChild(opt);
        });
    });
}


// --- 3. 計算ロジック (Core) ---

/**
 * シミュレーション実行エントリポイント
 */
function updateSimulation() {
    if (!masterDB) return;

    // 共通設定の取得
    const config = {
        spot: document.getElementById('currentSpot').value,
        weather: document.getElementById('currentWeather').value,
        bait: document.getElementById('currentBait').value,
        target: document.getElementById('targetFishName').value,
        isCatchAll: document.getElementById('isCatchAll').checked
    };

    const debugContainer = document.getElementById('debug-content');
    if(debugContainer) debugContainer.innerHTML = ''; // クリア

    if (currentMode === 'manual') {
        runManualMode(config, debugContainer);
    } else {
        runStrategyMode(config, debugContainer);
    }
}

/**
 * 手動モード: 特定の1シナリオを計算
 */
function runManualMode(config, debugContainer) {
    const scenarioId = document.getElementById('manualLureScenario').value;
    const isChum = document.getElementById('manualChum').value === 'yes';
    const tradeFish = document.getElementById('manualTradeSlap').value;

    // 計算実行
    const stats = calculateScenarioStats(config, scenarioId, isChum, tradeFish);

    // デバッグ表示
    if(debugContainer) {
        renderDebugInfo(debugContainer, stats, `シナリオ: ${getScenarioLabel(scenarioId)}`);
    }
    
    // 結果表示
    renderSingleResult(stats);
}

/**
 * 戦略モード: 2つの戦略を比較
 */
function runStrategyMode(config, debugContainer) {
    const isChum = document.getElementById('strategyChum').value === 'yes';
    const tradeFish = document.getElementById('strategyTradeSlap').value;
    
    const presetA = masterDB.strategy_presets.find(p => p.id === document.getElementById('strategyPresetA').value);
    const presetB = masterDB.strategy_presets.find(p => p.id === document.getElementById('strategyPresetB').value);

    // 戦略Aの計算
    const statsA = calculateStrategyAverage(config, presetA, isChum, tradeFish);
    // 戦略Bの計算
    const statsB = calculateStrategyAverage(config, presetB, isChum, tradeFish);

    // デバッグ表示
    if(debugContainer) {
        debugContainer.innerHTML += `<h4>戦略A: ${presetA ? presetA.name : '未選択'}</h4>`;
        debugContainer.innerHTML += renderStrategyDebug(statsA);
        debugContainer.innerHTML += `<hr><h4>戦略B: ${presetB ? presetB.name : '未選択'}</h4>`;
        debugContainer.innerHTML += renderStrategyDebug(statsB);
    }

    // 結果表示
    renderComparisonResult(statsA, statsB, presetA, presetB);
}

function renderStrategyDebug(stats) {
    if(stats.error) return `<div class="error">${stats.error}</div>`;
    return `
        <div style="font-size:0.8rem">
            <div>平均サイクル: ${stats.avgCycle.toFixed(2)}s</div>
            <div>平均ヒット率: ${(stats.avgHitRate * 100).toFixed(2)}%</div>
            <div>期待値: ${stats.expectedTime === Infinity ? '∞' : stats.expectedTime.toFixed(1)}s</div>
        </div>
    `;
}

/**
 * 戦略の平均期待値を計算
 */
function calculateStrategyAverage(config, preset, isChum, tradeFish) {
    if(!preset) return { error: "戦略が選択されていません" };

    let totalProb = 0;
    let weightedCycle = 0;
    let weightedHitRate = 0;
    let errorMsg = null;

    // 戦略に含まれる各シナリオについて加重平均
    preset.eligible_scenarios.forEach(sid => {
        const stats = calculateScenarioStats(config, sid, isChum, tradeFish);
        
        if (stats.error) {
            // データ不足等のエラーがあれば記録（今回は計算続行せずエラーとする）
            // errorMsg = stats.error; 
        }

        // 簡易実装: 戦略上の分岐確率は本来動的計算が必要だが、今回は均等または1.0として扱う
        // ※正確な分岐確率は「確率ツリー」の実装が必要
        const p = 1.0; 
        
        if (p > 0) {
            totalProb += p;
            weightedCycle += (stats.totalCycleTime * p);
            weightedHitRate += (stats.targetHitRate * p); 
        }
    });

    if (errorMsg) return { error: errorMsg };
    if (totalProb === 0) return { error: "有効なシナリオがありません" };

    const avgCycle = weightedCycle / totalProb;
    const avgHitRate = weightedHitRate / totalProb;
    
    const expectedTime = (avgHitRate > 0) ? (avgCycle / avgHitRate) : Infinity;

    return {
        expectedTime: expectedTime,
        avgCycle: avgCycle,
        avgHitRate: avgHitRate,
        totalProb: totalProb
    };
}

/**
 * 単一シナリオの統計量を計算 (Core Logic)
 */
function calculateScenarioStats(config, scenarioId, isChum, tradeFish) {
    // 1. ID解析
    const p = parseScenarioId(scenarioId); 
    
    // 2. 基礎データの取得
    const weightKey = `${config.spot}|${config.weather}|${config.bait}`;
    const baseWeights = masterDB.weights[weightKey] || [];
    
    // 3. 確率データの取得
    const probData = masterDB.probabilities.find(row => 
        row.spot === config.spot && 
        row.weather === config.weather && 
        row.bait === config.bait
    );

    // A. 時間コスト算出
    // ルアー拘束時間: Cast(1) + (n * Action(2.5)) + Blank(2.5)
    // ※ none_0 の場合はルアー時間0
    const lureTime = p.isNone ? 0 : (GDS.D_CAST + (p.n * GDS.D_LURE) + GDS.D_BLK);
    
    // ターゲット魚の基礎バイト時間を取得
    const targetData = baseWeights.find(w => w.fish === config.target);
    const baseBite = targetData ? targetData.bite_time : 15; 
    
    // 撒き餌短縮
    const biteTime = isChum ? (baseBite * GDS.C_CHUM) : baseBite;
    
    // 実効待機時間 (長い方)
    const waitTime = Math.max(biteTime, lureTime);
    
    // 1サイクル合計: Cast(1) + Wait + Rest(2)
    const totalCycleTime = GDS.D_CAST + waitTime + GDS.D_REST;

    // B. ターゲットヒット率算出
    const hitRate = calculateHitRateInScenario(p, baseWeights, probData, config.target, tradeFish);

    if (hitRate === null) {
        return { 
            scenarioId, totalCycleTime, targetHitRate: 0, 
            expectedTime: Infinity, error: "データ不足 (確率データなし)", debugData: { lureTime, biteTime, waitTime }
        };
    }

    return {
        scenarioId: scenarioId,
        totalCycleTime: totalCycleTime,
        targetHitRate: hitRate,
        expectedTime: (hitRate > 0) ? totalCycleTime / hitRate : Infinity,
        debugData: { lureTime, biteTime, waitTime }
    };
}


/**
 * 特定シナリオ下でのターゲットヒット率計算
 */
function calculateHitRateInScenario(p, baseWeights, probData, target, tradeFish) {
    if (!baseWeights || baseWeights.length === 0) return 0;
    
    const targetFishInfo = masterDB.fish[target];
    if(!targetFishInfo) return 0;

    const isHiddenTarget = targetFishInfo.is_hidden;

    if (isHiddenTarget) {
        // 隠し魚: マスタの hidden_hit_rates から新IDキーで取得
        if (probData && probData.hidden_hit_rates) {
            const rate = probData.hidden_hit_rates[p.fullId];
            if (rate === null || rate === undefined) return null; // データなし
            return rate / 100.0; // % -> decimal
        }
        return 0;
    } else {
        // 通常魚: 重み計算
        let totalWeight = 0;
        let targetWeight = 0;
        
        // ルアー回数によるボーナス (簡易版: 一律適用)
        let mod = 1.0;
        if (p.n === 1) mod = GDS.M_N1;
        if (p.n === 2) mod = GDS.M_N2;
        if (p.n === 3) mod = GDS.M_N3;
        
        // 素振り(none_0)はボーナスなし
        if (p.isNone) mod = 1.0;

        baseWeights.forEach(w => {
            if (w.fish === tradeFish) return; // トレード除外

            const info = masterDB.fish[w.fish];
            if (!info || info.is_hidden) return; // 隠し魚は通常抽選枠外

            // 重み加算
            const finalW = w.weight * mod;
            totalWeight += finalW;
            
            if (w.fish === target) targetWeight = finalW;
        });

        if (totalWeight === 0) return 0;
        
        // 隠し魚の出現確率分を引く必要があるが、
        // Step 2では簡易的に「隠し魚が出なかった場合の確率」として 1.0 ベースで計算
        const remainingProb = 1.0; 
        
        return (targetWeight / totalWeight) * remainingProb;
    }
}


// --- 4. ヘルパー関数 ---

/**
 * ID解析: "n3_d1_g23" -> { n:3, d:1, g:[2,3], fullId:"..." }
 */
function parseScenarioId(id) {
    if (id === 'none_0') {
        return { fullId: id, n: 0, d: 0, g: [], isNone: true };
    }
    
    // Regex: n(\d)_d(\d)_g(\d+)
    const match = id.match(/^n(\d+)_d(\d+)_g(\d+)$/);
    if (!match) return { fullId: id, n:0, d:0, g:[], isNone: true }; 

    const n = parseInt(match[1], 10);
    const d = parseInt(match[2], 10);
    const gPart = match[3];
    // gパートが "0" なら空、それ以外は各桁を数値化
    const g = (gPart === '0') ? [] : gPart.split('').map(Number);

    return { fullId: id, n, d, g, isNone: false };
}

/**
 * ID生成: 33パターン全てを生成
 */
function generateAllScenarioIds() {
    return [
        "none_0",
        "n1_d0_g0", "n1_d0_g1", "n1_d1_g0",
        "n2_d0_g0", "n2_d0_g1", "n2_d0_g2", "n2_d0_g12", "n2_d1_g0", "n2_d1_g2", "n2_d2_g0", "n2_d2_g1",
        "n3_d0_g0", "n3_d0_g1", "n3_d0_g2", "n3_d0_g3", "n3_d0_g12", "n3_d0_g13", "n3_d0_g23", "n3_d0_g123",
        "n3_d1_g0", "n3_d1_g2", "n3_d1_g3", "n3_d1_g23",
        "n3_d2_g0", "n3_d2_g1", "n3_d2_g3", "n3_d2_g13",
        "n3_d3_g0", "n3_d3_g1", "n3_d3_g2", "n3_d3_g12"
    ];
}

/**
 * ラベル生成: n3_d1_g23 -> "L3: 発見1 (型確2,3)"
 */
function getScenarioLabel(id) {
    const p = parseScenarioId(id);
    if (p.isNone) return "素振り (使用なし)";
    
    let text = `L${p.n}`;
    text += (p.d > 0) ? `: 発見${p.d}` : ": 未発見";
    
    if (p.g.length > 0) {
        text += ` (型確${p.g.join(',')})`;
    } else {
        text += " (型確なし)";
    }
    return text;
}

// --- 5. 描画関数 ---

function renderSingleResult(stats) {
    const container = document.getElementById('results-container');
    if (!container) return;

    if (stats.error) {
        container.innerHTML = `<div class="result-card error"><h3>データ不足</h3><p>${stats.error}</p></div>`;
        return;
    }

    const timeStr = (stats.expectedTime === Infinity) ? '∞' : stats.expectedTime.toFixed(1);
    
    container.innerHTML = `
        <div class="result-card">
            <h3>単一シナリオ評価</h3>
            <div class="main-metric">${timeStr} <span class="unit">秒/匹</span></div>
            <div class="sub-metric">ヒット率: ${(stats.targetHitRate * 100).toFixed(2)}%</div>
            <div class="sub-metric">サイクル: ${stats.totalCycleTime.toFixed(1)}秒</div>
        </div>
    `;
}

function renderComparisonResult(statsA, statsB, presetA, presetB) {
    const container = document.getElementById('results-container');
    if (!container) return;
    
    const nameA = presetA ? presetA.name : "未選択";
    const nameB = presetB ? presetB.name : "未選択";

    const timeA = (statsA.expectedTime === Infinity || !statsA.expectedTime) ? '∞' : statsA.expectedTime.toFixed(1);
    const timeB = (statsB.expectedTime === Infinity || !statsB.expectedTime) ? '∞' : statsB.expectedTime.toFixed(1);

    container.innerHTML = `
        <div class="comparison-container">
            <div class="result-card strategy-a">
                <h3>${nameA}</h3>
                <div class="main-metric">${timeA} <span class="unit">s</span></div>
                <div>Hit: ${(statsA.avgHitRate * 100).toFixed(2)}%</div>
            </div>
            <div class="vs">VS</div>
            <div class="result-card strategy-b">
                <h3>${nameB}</h3>
                <div class="main-metric">${timeB} <span class="unit">s</span></div>
                <div>Hit: ${(statsB.avgHitRate * 100).toFixed(2)}%</div>
            </div>
        </div>
    `;
}

function renderDebugInfo(container, stats, title) {
    if(stats.error) {
        container.innerHTML = `<h5 style="color:red">${title}: ${stats.error}</h5>`;
        return;
    }
    const d = stats.debugData;
    container.innerHTML = `
        <h5>${title}</h5>
        <ul>
            <li>WaitTime: ${d.waitTime.toFixed(2)}s (Bite: ${d.biteTime.toFixed(2)}, Lure: ${d.lureTime.toFixed(2)})</li>
            <li>TotalCycle: ${stats.totalCycleTime.toFixed(2)}s</li>
            <li>HitRate: ${(stats.targetHitRate * 100).toFixed(4)}%</li>
        </ul>
    `;
}

// アプリ起動
init();