/**
 * Fisherman Logic Engine (FLE) v2.0
 * 新ID体系・戦略評価モード・ファイル手動読み込み対応版
 */

// --- 1. 物理定数定義 (GDS v3.14.0) ---
const GDS = {
    D_CAST: 1.0, D_LURE: 2.5, D_BLK: 2.5, D_CHUM: 1.0, D_REST: 2.0,
    C_CHUM: 0.6, M_N1: 1.5, M_N2: 2.0, M_N3: 6.0
};

// --- グローバル状態 ---
let masterDB = null;
let currentMode = 'manual';

// --- 2. 初期化とイベント設定 ---

function init() {
    setupModeTabs();
    setupEventListeners();
    // ここでの自動計算は行わない（データがないため）
}

function setupEventListeners() {
    // 1. ファイルアップロード監視
    const uploadBtn = document.getElementById('jsonUpload');
    if (uploadBtn) {
        uploadBtn.addEventListener('change', handleFileUpload);
    }

    // 2. 入力変更監視
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
 * ファイル読み込み処理 (FileReader)
 */
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const json = JSON.parse(e.target.result);
            // 簡易バリデーション
            if (!json.version || !json.spots) {
                throw new Error("不正なJSON形式です。logic_master.jsonを選択してください。");
            }

            masterDB = json;
            console.log("Master DB Loaded:", masterDB);

            // UIの有効化と初期構築
            enableControls();
            populateSelectors();
            updateSimulation();

            document.getElementById('debug-content').innerHTML = `<div style="color:green">データ読み込み完了: v${json.version}</div>`;
        } catch (err) {
            console.error(err);
            alert("読み込みエラー: " + err.message);
        }
    };
    reader.readAsText(file);
}

function enableControls() {
    const disabledElements = document.querySelectorAll('select:disabled, input:disabled');
    disabledElements.forEach(el => el.disabled = false);
}

function setupModeTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.mode-content').forEach(el => el.classList.remove('active'));

            tab.classList.add('active');
            currentMode = tab.dataset.mode;

            const contentId = `${currentMode}-settings`;
            const contentEl = document.getElementById(contentId);
            if (contentEl) contentEl.classList.add('active');

            if (masterDB) updateSimulation();
        });
    });
}

// --- 3. UI構築 (Populate) ---

function populateSelectors() {
    if (!masterDB) return;

    // 1. 釣り場
    const spotSelect = document.getElementById('currentSpot');
    spotSelect.innerHTML = '';
    Object.keys(masterDB.spots).forEach(spot => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = spot;
        spotSelect.appendChild(opt);
    });

    spotSelect.addEventListener('change', updateSpotDependents);
    updateSpotDependents(); // 初回連動

    // 2. ルアーシナリオ (33パターン)
    populateLureScenarios();

    // 3. 戦略プリセット
    populateStrategyPresets();
}

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

    // 魚リスト (ターゲット & トレード)
    const fishList = spotData.fish_list;
    const targets = ['targetFishName', 'manualTradeSlap', 'strategyTradeSlap'];

    targets.forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const currentVal = sel.value;
        sel.innerHTML = '';

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

        if ([...sel.options].some(o => o.value === currentVal)) {
            sel.value = currentVal;
        }
    });
}

function populateLureScenarios() {
    const select = document.getElementById('manualLureScenario');
    if (!select) return;
    select.innerHTML = '';

    // ID生成
    const scenarios = generateAllScenarioIds();
    scenarios.forEach(id => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = getScenarioLabel(id);
        select.appendChild(opt);
    });
}

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

// --- 4. 計算ロジック (Core) ---

function updateSimulation() {
    if (!masterDB) return;

    const config = {
        spot: document.getElementById('currentSpot').value,
        weather: document.getElementById('currentWeather').value,
        bait: document.getElementById('currentBait').value,
        target: document.getElementById('targetFishName').value,
        isCatchAll: document.getElementById('isCatchAll').checked
    };

    const debugContainer = document.getElementById('debug-content');
    if (debugContainer) debugContainer.innerHTML = '';

    if (currentMode === 'manual') {
        runManualMode(config, debugContainer);
    } else {
        runStrategyMode(config, debugContainer);
    }
}

function runManualMode(config, debugContainer) {
    const scenarioId = document.getElementById('manualLureScenario').value;
    const isChum = document.getElementById('manualChum').value === 'yes';
    const tradeFish = document.getElementById('manualTradeSlap').value;

    const stats = calculateScenarioStats(config, scenarioId, isChum, tradeFish);

    if (debugContainer) renderDebugInfo(debugContainer, stats, `シナリオ: ${getScenarioLabel(scenarioId)}`);
    renderSingleResult(stats);
}

function runStrategyMode(config, debugContainer) {
    const isChum = document.getElementById('strategyChum').value === 'yes';
    const tradeFish = document.getElementById('strategyTradeSlap').value;

    const presetA = masterDB.strategy_presets.find(p => p.id === document.getElementById('strategyPresetA').value);
    const presetB = masterDB.strategy_presets.find(p => p.id === document.getElementById('strategyPresetB').value);

    const statsA = calculateStrategyAverage(config, presetA, isChum, tradeFish);
    const statsB = calculateStrategyAverage(config, presetB, isChum, tradeFish);

    if (debugContainer) {
        debugContainer.innerHTML += `<h4>A: ${presetA ? presetA.name : '-'}</h4>` + renderStrategyDebug(statsA);
        debugContainer.innerHTML += `<hr><h4>B: ${presetB ? presetB.name : '-'}</h4>` + renderStrategyDebug(statsB);
    }
    renderComparisonResult(statsA, statsB, presetA, presetB);
}

function calculateStrategyAverage(config, preset, isChum, tradeFish) {
    if (!preset) return { error: "未選択" };

    let totalProb = 0;
    let weightedCycle = 0;
    let weightedHitRate = 0;

    preset.eligible_scenarios.forEach(sid => {
        const stats = calculateScenarioStats(config, sid, isChum, tradeFish);
        if (!stats.error) {
            const p = 1.0; // 簡易確率
            totalProb += p;
            weightedCycle += (stats.totalCycleTime * p);
            weightedHitRate += (stats.targetHitRate * p);
        }
    });

    if (totalProb === 0) return { error: "有効データなし" };

    const avgCycle = weightedCycle / totalProb;
    const avgHitRate = weightedHitRate / totalProb;
    const expectedTime = (avgHitRate > 0) ? (avgCycle / avgHitRate) : Infinity;

    return { expectedTime, avgCycle, avgHitRate, totalProb };
}

function calculateScenarioStats(config, scenarioId, isChum, tradeFish) {
    const p = parseScenarioId(scenarioId);

    const weightKey = `${config.spot}|${config.weather}|${config.bait}`;
    const baseWeights = masterDB.weights[weightKey] || [];

    const probData = masterDB.probabilities.find(row =>
        row.spot === config.spot &&
        row.weather === config.weather &&
        row.bait === config.bait
    );

    // 時間計算
    const lureTime = p.isNone ? 0 : (GDS.D_CAST + (p.n * GDS.D_LURE) + GDS.D_BLK);
    const targetData = baseWeights.find(w => w.fish === config.target);
    const baseBite = targetData ? targetData.bite_time : 15;
    const biteTime = isChum ? (baseBite * GDS.C_CHUM) : baseBite;
    const waitTime = Math.max(biteTime, lureTime);
    const totalCycleTime = GDS.D_CAST + waitTime + GDS.D_REST;

    // ヒット率計算
    const hitRate = calculateHitRateInScenario(p, baseWeights, probData, config.target, tradeFish);

    if (hitRate === null) {
        return { error: "データ不足", totalCycleTime, targetHitRate: 0, expectedTime: Infinity, debugData: { lureTime, biteTime, waitTime } };
    }

    return {
        scenarioId,
        totalCycleTime,
        targetHitRate: hitRate,
        expectedTime: (hitRate > 0) ? totalCycleTime / hitRate : Infinity,
        debugData: { lureTime, biteTime, waitTime }
    };
}

function calculateHitRateInScenario(p, baseWeights, probData, target, tradeFish) {
    if (!baseWeights || baseWeights.length === 0) return 0;
    const targetFishInfo = masterDB.fish[target];
    if (!targetFishInfo) return 0;

    if (targetFishInfo.is_hidden) {
        if (probData && probData.hidden_hit_rates) {
            const rate = probData.hidden_hit_rates[p.fullId];
            return (rate === null || rate === undefined) ? null : rate / 100.0;
        }
        return 0;
    } else {
        let totalWeight = 0, targetWeight = 0;
        let mod = p.isNone ? 1.0 : (p.n === 3 ? GDS.M_N3 : (p.n === 2 ? GDS.M_N2 : GDS.M_N1));

        baseWeights.forEach(w => {
            if (w.fish === tradeFish) return;
            const info = masterDB.fish[w.fish];
            if (!info || info.is_hidden) return;

            const finalW = w.weight * mod;
            totalWeight += finalW;
            if (w.fish === target) targetWeight = finalW;
        });

        if (totalWeight === 0) return 0;
        return (targetWeight / totalWeight);
    }
}

// --- ヘルパー ---
function parseScenarioId(id) {
    if (id === 'none_0') return { fullId: id, n: 0, d: 0, g: [], isNone: true };
    const match = id.match(/^n(\d+)_d(\d+)_g(\d+)$/);
    if (!match) return { fullId: id, n: 0, d: 0, g: [], isNone: true };
    const g = (match[3] === '0') ? [] : match[3].split('').map(Number);
    return { fullId: id, n: parseInt(match[1]), d: parseInt(match[2]), g, isNone: false };
}

function generateAllScenarioIds() {
    return [
        "none_0", "n1_d0_g0", "n1_d0_g1", "n1_d1_g0",
        "n2_d0_g0", "n2_d0_g1", "n2_d0_g2", "n2_d0_g12", "n2_d1_g0", "n2_d1_g2", "n2_d2_g0", "n2_d2_g1",
        "n3_d0_g0", "n3_d0_g1", "n3_d0_g2", "n3_d0_g3", "n3_d0_g12", "n3_d0_g13", "n3_d0_g23", "n3_d0_g123",
        "n3_d1_g0", "n3_d1_g2", "n3_d1_g3", "n3_d1_g23", "n3_d2_g0", "n3_d2_g1", "n3_d2_g3", "n3_d2_g13",
        "n3_d3_g0", "n3_d3_g1", "n3_d3_g2", "n3_d3_g12"
    ];
}

function getScenarioLabel(id) {
    const p = parseScenarioId(id);
    if (p.isNone) return "素振り (使用なし)";
    let text = `L${p.n}`;
    text += (p.d > 0) ? `: 発見${p.d}` : ": 未発見";
    text += (p.g.length > 0) ? ` (型確${p.g.join(',')})` : " (型確なし)";
    return text;
}

// --- 描画関数 ---
function renderSingleResult(stats) {
    const container = document.getElementById('results-container');
    if (!container) return;
    if (stats.error) {
        container.innerHTML = `<div class="result-card error"><h3>データ不足</h3><p>${stats.error}</p></div>`;
        return;
    }
    const timeStr = (stats.expectedTime === Infinity) ? '∞' : stats.expectedTime.toFixed(1);
    container.innerHTML = `<div class="result-card"><h3>単一評価</h3><div class="main-metric">${timeStr} <span class="unit">s</span></div><div>Hit: ${(stats.targetHitRate * 100).toFixed(2)}%</div></div>`;
}

function renderComparisonResult(statsA, statsB, presetA, presetB) {
    const container = document.getElementById('results-container');
    if (!container) return;
    const nameA = presetA ? presetA.name : "未選択";
    const nameB = presetB ? presetB.name : "未選択";
    const timeA = (!statsA.expectedTime || statsA.expectedTime === Infinity) ? '∞' : statsA.expectedTime.toFixed(1);
    const timeB = (!statsB.expectedTime || statsB.expectedTime === Infinity) ? '∞' : statsB.expectedTime.toFixed(1);

    container.innerHTML = `
        <div class="comparison-container">
            <div class="result-card strategy-a"><h3>${nameA}</h3><div class="main-metric">${timeA}<span class="unit">s</span></div><div>Hit: ${(statsA.avgHitRate * 100).toFixed(2)}%</div></div>
            <div class="vs">VS</div>
            <div class="result-card strategy-b"><h3>${nameB}</h3><div class="main-metric">${timeB}<span class="unit">s</span></div><div>Hit: ${(statsB.avgHitRate * 100).toFixed(2)}%</div></div>
        </div>
    `;
}

function renderStrategyDebug(stats) {
    if (stats.error) return `<div class="error">${stats.error}</div>`;
    return `<div style="font-size:0.8rem">AvgCycle: ${stats.avgCycle.toFixed(2)}s, AvgHit: ${(stats.avgHitRate * 100).toFixed(2)}%</div>`;
}

function renderDebugInfo(container, stats, title) {
    if (stats.error) { container.innerHTML = `<h5 style="color:red">${title}: ${stats.error}</h5>`; return; }
    const d = stats.debugData;
    container.innerHTML = `<h5>${title}</h5><ul><li>Wait: ${d.waitTime.toFixed(2)}s</li><li>Cycle: ${stats.totalCycleTime.toFixed(2)}s</li><li>Hit: ${(stats.targetHitRate * 100).toFixed(2)}%</li></ul>`;
}

// 起動
init();