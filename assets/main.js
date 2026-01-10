/**
 * Fisherman Logic Engine (FLE) v2.0
 * 物理定数・計算ロジック・UI制御の統合スクリプト
 * * 対応機能:
 * - 新ID体系 (n3_d1_g2 etc) の解析と計算
 * - 手動設定 / 戦略評価 の2モード対応
 * - 戦略ごとの期待値（時給効率）算出
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
let currentMode = 'manual';

// --- 2. 初期化とイベント設定 ---

/**
 * アプリケーション初期化
 */
async function init() {
    try {
        // コンバーターで生成した新しいファイル名を読み込む
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
            debugContent.innerHTML = `<div class="error" style="color:red; padding:10px;">データ読み込みエラー: ${e.message}<br>logic_master.json が同じフォルダにあるか確認してください。</div>`;
        }
    }
}

/**
 * UIイベントリスナーの登録
 */
function setupEventListeners() {
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
 * モード切り替えタブの制御
 */
function setupModeTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // アクティブクラスの切り替え
            document.querySelectorAll('.tab-btn, .mode-content').forEach(el => el.classList.remove('active'));
            tab.classList.add('active');
            
            currentMode = tab.dataset.mode;
            const contentId = `${currentMode}-settings`;
            const contentEl = document.getElementById(contentId);
            if(contentEl) contentEl.classList.add('active');
            
            updateSimulation();
        });
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

    // IDリスト生成ロジック (idx.md準拠の全33パターン)
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
        debugContainer.innerHTML += `<h4>戦略A: ${presetA.name}</h4>`;
        debugContainer.innerHTML += renderStrategyDebug(statsA);
        debugContainer.innerHTML += `<hr><h4>戦略B: ${presetB.name}</h4>`;
        debugContainer.innerHTML += renderStrategyDebug(statsB);
    }

    // 結果表示
    renderComparisonResult(statsA, statsB, presetA.name, presetB.name);
}

function renderStrategyDebug(stats) {
    if(stats.error) return `<div class="error">${stats.error}</div>`;
    return `
        <div style="font-size:0.8rem">
            <div>合計確率: ${(stats.totalProb*100).toFixed(1)}%</div>
            <div>平均サイクル: ${stats.avgCycle.toFixed(1)}s</div>
            <div>平均ヒット率: ${(stats.avgHitRate*100).toFixed(2)}%</div>
        </div>