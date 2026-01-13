/**
 * Fisherman Logic Engine (FLE) v2.5.3
 * Update: Refined "Quit" logic to "Rest" (skip block time)
 */

const GDS = {
    D_CAST: 1.0, D_LURE: 2.5, D_BLK: 2.5, D_CHUM: 1.0, D_REST: 2.0, // D_QUIT 削除
    C_CHUM: 0.6, M_N1: 1.5, M_N2: 2.0, M_N3: 6.0
};

let masterDB = null;
let probabilityMap = null;
let currentMode = 'manual';

function init() {
    console.log("FLE: init() start");
    setupEventListeners();
    initResizers();
}

function setupEventListeners() {
    const uploadBtn = document.getElementById('jsonUpload');
    if (uploadBtn) uploadBtn.addEventListener('change', handleFileUpload);

    const rightToggle = document.getElementById('toggle-right');
    const rightPanel = document.getElementById('panel-right');
    rightPanel.querySelector('h3').addEventListener('click', () => {
        rightPanel.classList.toggle('collapsed');
        rightToggle.textContent = rightPanel.classList.contains('collapsed') ? '▼' : '▶';
    });

    document.querySelectorAll('.tab-btn').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentMode = tab.dataset.mode;
            document.querySelectorAll('.mode-container').forEach(c => c.classList.remove('active'));
            document.getElementById(`mode-${currentMode}`).classList.add('active');
            updateSimulation();
        });
    });

    document.getElementById('currentExpansion').addEventListener('change', updateAreaOptions);
    document.getElementById('currentArea').addEventListener('change', updateSpotOptions);
    document.getElementById('currentSpot').addEventListener('change', updateSpotDependents);

    ['currentWeather', 'currentBait', 'targetFishName', 'manualTradeSlap'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('change', updateSimulation);
    });

    document.getElementById('isCatchAll').addEventListener('change', (e) => {
        const disabled = e.target.checked;
        ['manualTradeSlap', 'stratATrade', 'stratBTrade'].forEach(id => {
            const el = document.getElementById(id);
            if(el) { el.value = 'なし'; el.disabled = disabled; }
        });
        updateSimulation();
    });

    ['manualChum', 'lureType', 'lureCount', 'lureStep1', 'lureStep2', 'lureStep3', 'lureQuitCheck'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('change', () => {
            if(id.startsWith('lure') && id !== 'lureQuitCheck') updateLureUI();
            updateSimulation();
        });
    });

    ['stratALure', 'stratAQuit', 'stratAPreset', 'stratATrade', 'stratAChum',
     'stratBLure', 'stratBQuit', 'stratBPreset', 'stratBTrade', 'stratBChum'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('change', () => {
            if (id.includes('Lure')) updateStrategyPresetsFilter();
            updateSimulation();
        });
    });
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            console.log("FLE: JSON Parsing...");
            masterDB = JSON.parse(e.target.result);
            if (!masterDB || !masterDB.probabilities) throw new Error("Invalid JSON: missing probabilities");
            probabilityMap = generateProbabilityMap(masterDB.probabilities);
            
            document.getElementById('db-status').textContent = `ONLINE (v${masterDB.version})`;
            document.getElementById('db-status').style.color = 'var(--accent-green)';
            
            document.querySelectorAll('select:disabled, input:disabled').forEach(el => el.disabled = false);
            const isCatchAll = document.getElementById('isCatchAll');
            if(isCatchAll.checked) {
                ['manualTradeSlap', 'stratATrade', 'stratBTrade'].forEach(id => {
                    const el = document.getElementById(id);
                    if(el) { el.value='なし'; el.disabled=true; }
                });
            }
            updateLureUI();
            populateSelectors();
        } catch (err) {
            console.error(err);
            alert(`Load Error: ${err.message}`);
        }
    };
    reader.readAsText(file);
}

function populateSelectors() {
    if (!masterDB) return;
    const expansionSet = new Set();
    Object.values(masterDB.spots).forEach(s => { if(s.expansion) expansionSet.add(s.expansion); });
    const expSelect = document.getElementById('currentExpansion');
    expSelect.innerHTML = '';
    Array.from(expansionSet).sort().reverse().forEach(exp => expSelect.appendChild(new Option(exp, exp)));
    const presets = masterDB.strategy_presets || [];
    ['stratAPreset', 'stratBPreset'].forEach(id => {
        const sel = document.getElementById(id);
        sel.innerHTML = '';
        presets.forEach(p => sel.appendChild(new Option(p.name, p.id)));
    });
    updateAreaOptions();
}

function updateAreaOptions() {
    if (!masterDB) return;
    const currentExp = document.getElementById('currentExpansion').value;
    const areaSet = new Set();
    Object.values(masterDB.spots).forEach(s => { if (s.expansion === currentExp && s.area) areaSet.add(s.area); });
    const areaSelect = document.getElementById('currentArea');
    areaSelect.innerHTML = '';
    Array.from(areaSet).sort().forEach(area => areaSelect.appendChild(new Option(area, area)));
    updateSpotOptions();
}

function updateSpotOptions() {
    if (!masterDB) return;
    const currentExp = document.getElementById('currentExpansion').value;
    const currentArea = document.getElementById('currentArea').value;
    const spotSelect = document.getElementById('currentSpot');
    spotSelect.innerHTML = '';
    Object.keys(masterDB.spots).forEach(spotName => {
        const s = masterDB.spots[spotName];
        if (s.expansion === currentExp && s.area === currentArea) spotSelect.appendChild(new Option(spotName, spotName));
    });
    updateSpotDependents();
}

function updateSpotDependents() {
    const spot = document.getElementById('currentSpot').value;
    const spotData = masterDB.spots[spot];
    if (!spotData) return;

    if (!spotData.fish_list || spotData.fish_list.length === 0) {
        updateSelect('currentWeather', []);
        updateSelect('currentBait', []);
        updateSelect('targetFishName', []);
        const resultContent = document.getElementById('result-content');
        if(resultContent) {
            resultContent.innerHTML = `
                <div style="padding:30px; text-align:center; color:var(--accent-red); border:2px dashed var(--accent-red); border-radius:8px; background:rgba(239, 68, 68, 0.1);">
                    <div style="font-size:1.5rem; margin-bottom:10px;">⚠️ データ未定義</div>
                    <div>「${spot}」の詳細データ（魚・天気・餌）がマスタに存在しません。</div>
                </div>`;
        }
        return;
    }

    updateSelect('currentWeather', spotData.weathers);
    updateSelect('currentBait', spotData.baits);
    updateSelect('targetFishName', spotData.fish_list);
    
    const tradeOpts = ['manualTradeSlap', 'stratATrade', 'stratBTrade'];
    tradeOpts.forEach(id => {
        const sel = document.getElementById(id);
        sel.innerHTML = '<option value="なし">なし</option>';
        spotData.fish_list.forEach(f => sel.appendChild(new Option(f, f)));
        if (document.getElementById('isCatchAll').checked) {
            sel.value='なし'; sel.disabled=true;
        }
    });

    updateSimulation();
}

function updateSelect(id, items) {
    const el = document.getElementById(id);
    if(!el) return;
    const val = el.value;
    el.innerHTML = '';
    items.forEach(item => el.appendChild(new Option(item, item)));
    if ([...el.options].some(o => o.value === val)) el.value = val;
}

function updateStrategyPresetsFilter() {
    ['A', 'B'].forEach(set => {
        const lureVal = document.getElementById(`strat${set}Lure`).value;
        const presetSel = document.getElementById(`strat${set}Preset`);
        const quitCheck = document.getElementById(`strat${set}Quit`);
        const isNoLure = (lureVal === 'none');
        quitCheck.disabled = isNoLure;
        if(isNoLure) quitCheck.checked = false;
        Array.from(presetSel.options).forEach(opt => {
            const isNoLureStrat = (opt.value === 'no_lure');
            opt.disabled = isNoLure ? !isNoLureStrat : false;
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
    const quitCheck = document.getElementById('lureQuitCheck');
    quitCheck.disabled = !isLureActive;
    if(!isLureActive) quitCheck.checked = false;
    for(let i=1; i<=3; i++) {
        const el = document.getElementById(`lureStep${i}`);
        el.disabled = !isLureActive || count < i;
        el.style.opacity = (!isLureActive || count < i) ? '0.3' : '1.0';
        if(el.disabled) el.value = 'none';
    }
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
function generateProbabilityMap(probabilities) {
    const map = new Map();
    if (!Array.isArray(probabilities)) return map;
    probabilities.forEach(row => {
        const key = `${row.spot}|${row.weather}|${row.bait}|${row.lure_type}|${row.trade_target}`;
        map.set(key, row);
    });
    return map;
}
function parseScenarioId(id) {
    if (id === 'none_0') return { fullId: id, n: 0, d: 0, g: [], isNone: true };
    const match = id.match(/^n(\d+)_d(\d+)_g(\d+)$/);
    if (!match) return { fullId: id, n:0, d:0, g:[], isNone: true };
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

// --- Main Calc ---
function updateSimulation() {
    if (!masterDB) return;
    const spotVal = document.getElementById('currentSpot').value;
    if (!spotVal || !masterDB.spots[spotVal]) return;
    if (masterDB.spots[spotVal].fish_list.length === 0) return;

    const config = {
        spot: spotVal,
        weather: document.getElementById('currentWeather').value,
        bait: document.getElementById('currentBait').value,
        target: document.getElementById('targetFishName').value,
        isCatchAll: document.getElementById('isCatchAll').checked,
        lureType: document.getElementById('lureType').value,
        quitIfNoDisc: document.getElementById('lureQuitCheck').checked
    };

    if (currentMode === 'manual') runManualMode(config);
    else runStrategyMode(config);
}

function runManualMode(config) {
    const resultContent = document.getElementById('result-content');
    resultContent.innerHTML = `
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

    const isChum = document.getElementById('manualChum').value === 'yes';
    const tradeFish = document.getElementById('manualTradeSlap').value;
    const scenarioId = constructScenarioId();

    let discCount = 0;
    if (config.lureType !== 'none') {
        for (let i = 1; i <= parseInt(document.getElementById('lureCount').value); i++) {
            if (document.getElementById(`lureStep${i}`).value === 'disc') discCount++;
        }
    }
    const errorMsgEl = document.getElementById('lure-error-msg');
    if (discCount > 1) {
        errorMsgEl.style.display = 'block';
        return;
    } else {
        errorMsgEl.style.display = 'none';
    }

    const stats = calculateScenarioStats(config, scenarioId, isChum, tradeFish);

    if (stats.error) {
        renderDebugDetails(stats, config, isChum, scenarioId);
        document.getElementById('res-table-body').innerHTML = `<tr><td colspan="5" style="color:var(--accent-red); font-weight:bold; text-align:center; padding:15px;">⚠️ Error: ${stats.error}</td></tr>`;
    } else {
        const expTimeStr = (stats.expectedTime === Infinity) ? '-' : stats.expectedTime.toFixed(1) + ' sec';
        const hitRateStr = (stats.targetHitRate * 100).toFixed(2) + '%';
        document.getElementById('main-result-time').textContent = expTimeStr;
        document.getElementById('main-result-hit').textContent = `Hit: ${hitRateStr}`;
        renderResultTable(stats.allFishStats, config.target, stats.scenarioStr, stats.scenarioProb, stats.avgCycleTime);
        renderDebugDetails(stats, config, isChum, scenarioId);
    }
}

function runStrategyMode(config) {
    const sets = ['A', 'B'];
    const results = {};
    sets.forEach(set => {
        const setConfig = {
            lureType: document.getElementById(`strat${set}Lure`).value,
            quitIfNoDisc: document.getElementById(`strat${set}Quit`).checked,
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
    let weightedHitRate = 0, weightedCycle = 0, totalProb = 0, error = null;

    for (const sid of preset.eligible_scenarios) {
        const scenarioConfig = { ...config, lureType: setConfig.lureType, quitIfNoDisc: setConfig.quitIfNoDisc };
        const stats = calculateScenarioStats(scenarioConfig, sid, setConfig.isChum, setConfig.tradeFish);
        if (stats.error) { error = stats.error; break; }
        if (stats.scenarioProb === null) { error = "確率計算不能"; break; }

        totalProb += stats.scenarioProb;
        weightedHitRate += (stats.scenarioProb * stats.targetHitRate);
        weightedCycle += (stats.scenarioProb * stats.avgCycleTime);
        scenarios.push({
            id: sid, label: getScenarioLabel(sid), prob: stats.scenarioProb, cycle: stats.avgCycleTime, hit: stats.targetHitRate, expected: stats.expectedTime, pObj: stats.debugData.p, isQuit: stats.debugData.isQuit
        });
    }
    if (error) return { error, name: preset.name, description: preset.description };

    const targetInfo = masterDB.fish[config.target];
    const tHook = targetInfo ? targetInfo.hook_time : 0;
    let expectedTime = (weightedHitRate > 0) ? (weightedCycle - (weightedHitRate * tHook)) / weightedHitRate : Infinity;
    const avgCastCount = (weightedHitRate > 0) ? (1 / weightedHitRate) : Infinity;

    return { name: preset.name, description: preset.description, trade: setConfig.tradeFish, scenarios, totalProb, avgHitRate: weightedHitRate, avgCycle: weightedCycle, avgCastCount, expectedTime, error: null };
}

function calculateScenarioStats(config, scenarioId, isChum, tradeFish) {
    if (!masterDB.spots[config.spot]) return { error: "釣り場データが見つかりません" };
    const p = parseScenarioId(scenarioId);
    const weightKey = `${config.spot}|${config.weather}|${config.bait}`;
    const baseWeights = masterDB.weights[weightKey] || [];
    
    let probData = null;
    if (config.lureType !== 'none') {
        const searchKey = `${config.spot}|${config.weather}|${config.bait}|${config.lureType}|${tradeFish}`;
        if (probabilityMap) probData = probabilityMap.get(searchKey);
    }
    const rawRates = probData ? { disc: probData.disc_rates, guar: probData.guar_rates_nodisc } : null;
    if (!probData && config.lureType !== 'none') return { error: "条件に合う確率データがありません", debugData: { rates: rawRates } };

    const tCast = GDS.D_CAST, tLureAction = GDS.D_LURE, tLureBlock = GDS.D_BLK, tChum = GDS.D_CHUM, tRest = GDS.D_REST;
    
    // 【変更点】未発見即竿上げロジック
    const isQuit = (config.quitIfNoDisc && !p.isNone && p.d === 0);
    const lureTime = p.isNone ? 0 : (tCast + (p.n * tLureAction) + tLureBlock);

    // Scenario Prob
    let scenarioProb = 1.0, scenarioStrParts = [];
    if (!p.isNone && probData) {
        let found = false, foundStep = 0;
        for (let i = 1; i <= p.n; i++) {
            const idx = i - 1;
            let action = (p.d === i) ? 'disc' : (p.g.includes(i) ? 'guar' : 'none');
            scenarioStrParts.push(action === 'disc' ? '発見' : (action === 'guar' ? '型確定' : '何もなし'));
            let stepProb = 0;
            if (!found) {
                const pDisc = probData.disc_rates[idx], pGuar = probData.guar_rates_nodisc[idx] / 100.0, pD = pDisc / 100.0;
                if (pDisc === null) return { error: `データ不足(Step${i})`, debugData: { rates: rawRates } };
                if (action === 'disc') { stepProb = pD; found = true; foundStep = i; }
                else if (action === 'guar') { stepProb = (1.0 - pD) * pGuar; }
                else { stepProb = (1.0 - pD) * (1.0 - pGuar); }
            } else {
                const pGuarAfterVal = probData.guar_rates_after_disc[`d${foundStep}_g${i}`];
                if (pGuarAfterVal === null || pGuarAfterVal === undefined) return { error: `データ不足(Step${i} after)`, debugData: { rates: rawRates } };
                const pGuarAfter = pGuarAfterVal / 100.0;
                stepProb = (action === 'guar') ? pGuarAfter : (1.0 - pGuarAfter);
            }
            scenarioProb *= stepProb;
        }
    } else {
        if (config.lureType === 'none') scenarioStrParts = ["ルアー使用なし"];
    }

    let pHidden = 0, hiddenFishName = probData && probData.target_hidden ? probData.target_hidden : null;
    if (hiddenFishName && probData.hidden_hit_rates) {
        const rate = probData.hidden_hit_rates[p.fullId];
        if (rate !== undefined && rate !== null) pHidden = rate / 100.0;
    }

    let totalWeight = 0, weightDetails = [];
    let modN = (p.n===1) ? GDS.M_N1 : (p.n===2 ? GDS.M_N2 : (p.n===3 ? GDS.M_N3 : 1.0));
    const currentLureJaws = (config.lureType === 'アンビシャスルアー') ? 'large_jaws' : (config.lureType === 'モデストルアー' ? 'small_jaws' : null);
    const lastGuar = (p.g.length > 0 && p.g[p.g.length-1] === p.n);

    baseWeights.forEach(w => {
        const info = masterDB.fish[w.fish];
        if (!info) return;
        let m = 1.0;
        if (w.fish === hiddenFishName) { weightDetails.push({ name: w.fish, base: w.weight, m: '-', final: '-', isHidden: true }); return; }
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
        if (isQuit) hitProb = 0;
        else {
            if (fName === hiddenFishName) hitProb = pHidden;
            else {
                const wd = weightDetails.find(x => x.name === fName);
                if (wd && totalWeight > 0) hitProb = (wd.final / totalWeight) * (1.0 - pHidden);
            }
        }
        sumProb += hitProb;
        const baseBite = wData.bite_time;
        const biteTime = isChum ? (baseBite * GDS.C_CHUM) : baseBite;
        const waitTime = Math.max(biteTime, lureTime);
        const isTarget = (fName === config.target);
        const actualHookTime = (isTarget || config.isCatchAll) ? fInfo.hook_time : tRest;
        
        // 【変更】サイクル時間計算
        let cycleTime = 0;
        const pre = (isChum ? tChum : 0);
        
        if (isQuit) {
            // キャスト + (ルアー動作 * n) + 竿上げ
            cycleTime = tCast + (p.n * tLureAction) + tRest + pre; 
        } else {
            // 通常: キャスト + 待機(ルアー拘束込み) + 釣り上げ(or竿上げ)
            cycleTime = tCast + waitTime + actualHookTime + pre;
        }

        sumProbTotalCycle += (hitProb * cycleTime);
        allFishStats.push({ name: fName, vibration: fInfo.vibration, hitRate: hitProb, baseBite, biteTime, lureTime, waitTime, hookTime: actualHookTime, cycleTime, isTarget });
    });

    if (isQuit) {
        // ヒット率0でも時間はかかるので補正
        const pre = (isChum ? tChum : 0);
        sumProbTotalCycle = tCast + (p.n * tLureAction) + tRest + pre;
    }

    const targetStat = allFishStats.find(s => s.isTarget);
    const targetHitRate = targetStat ? targetStat.hitRate : 0;
    const targetHookTime = targetStat ? targetStat.hookTime : 0;
    const expectedTime = (targetHitRate > 0) ? (sumProbTotalCycle - (targetHitRate * targetHookTime)) / targetHitRate : Infinity;

    return {
        allFishStats, totalWeight, weightDetails, pHidden, hiddenFishName, targetHitRate,
        avgCycleTime: sumProbTotalCycle, expectedTime, scenarioStr: scenarioStrParts.join('→'), scenarioProb,
        debugData: { p, rates: rawRates, lureTime, biteTime: targetStat?.biteTime, waitTime: targetStat?.waitTime, targetCycle: targetStat?.cycleTime, targetHook: targetHookTime, isQuit }
    };
}

function renderStrategyComparison(resA, resB, config) {
    const resultContent = document.getElementById('result-content');
    const right = document.getElementById('debug-content-wrapper');
    const buildCard = (res, label, color) => {
        const time = (res.error || res.expectedTime === Infinity) ? '∞' : res.expectedTime.toFixed(1);
        const hit = (res.error) ? '-' : (res.avgHitRate * 100).toFixed(2) + '%';
        const cycle = (res.error) ? '-' : res.avgCycle.toFixed(1) + ' sec';
        let top3Html = '';
        if (!res.error && res.scenarios) {
            const sorted = [...res.scenarios].sort((a, b) => b.prob - a.prob).slice(0, 3);
            top3Html = `<div class="top3-container"><div class="top3-title">高確率シナリオ Top3</div>${sorted.map(s => `
                <div class="top3-item"><div style="color:${color};font-weight:bold;">${s.label} ${(s.isQuit?'<span style="color:red">!</span>':'')}</div>
                <div class="top3-stats"><span>Hit:${(s.hit*100).toFixed(1)}%</span><span>発生:${(s.prob*100).toFixed(1)}%</span></div></div>
            `).join('')}</div>`;
        }
        return `<div class="strat-card" style="border-top:4px solid ${color}"><h4>${res.name}</h4><div class="strat-desc">${res.description||''}</div><div class="main-val">${time}<span style="font-size:1rem;font-weight:normal;color:#888">sec</span></div><div class="val-label">期待待機時間</div><div class="stat-row"><div class=\"stat-item\">Hit<br><span class=\"stat-val\">${hit}</span></div><div class=\"stat-item\">Cycle<br><span class=\"stat-val\">${cycle}</span></div></div>${res.error?`<div style="color:red">⚠️ ${res.error}</div>`:top3Html}</div>`;
    };
    resultContent.innerHTML = `<div class="comparison-container" style="align-items:stretch;">${buildCard(resA,"Set A","var(--accent-a)")}${buildCard(resB,"Set B","var(--accent-b)")}</div>`;
    
    // Debug info
    let debugHtml = `<div class="debug-section"><label>【定数】</label><div id="debug-constants" class="formula-box" style="font-size:0.75rem;">D_Cast: ${GDS.D_CAST}s, D_Lure: ${GDS.D_LURE}s, D_Rest: ${GDS.D_REST}s</div></div>`;
    right.innerHTML = debugHtml;
}

function renderResultTable(stats, targetName, scnStr, scnProb, avgCycle) {
    const tbody = document.getElementById('res-table-body');
    tbody.innerHTML = '';
    document.getElementById('scenario-str').textContent = `シナリオ: ${scnStr}`;
    document.getElementById('scenario-prob').textContent = `発生確率: ${(scnProb!==null?(scnProb*100).toFixed(2)+'%':'-')}`;
    document.getElementById('avg-cycle-time').textContent = `平均サイクル: ${(avgCycle>0?avgCycle.toFixed(1)+'sec':'-')}`;
    
    stats.forEach(s => {
        const tr = document.createElement('tr');
        if (s.name === targetName) tr.classList.add('row-target');
        const hitStr = (s.hitRate > 0) ? (s.hitRate * 100).toFixed(1) + '%' : '0.0%';
        const cycleStr = s.cycleTime.toFixed(1) + 'sec';
        tr.innerHTML = `<td>${s.name}</td><td>${s.vibration}</td><td>${hitStr}</td><td>${s.waitTime.toFixed(1)}s</td><td>${cycleStr}</td>`;
        tbody.appendChild(tr);
    });
}

function renderDebugDetails(stats, config, isChum, scenarioId) {
    const c = GDS;
    document.getElementById('debug-constants').innerHTML = `D_Cast: ${c.D_CAST}s, D_Lure: ${c.D_LURE}s, D_Rest: ${c.D_REST}s`;
    
    let trace = `<div>Spot: ${config.spot}</div><div>Target: ${config.target}</div>`;
    if(stats.debugData.isQuit) {
        trace += `<div style="color:var(--accent-red);font-weight:bold;margin-top:5px;">※未発見即竿上げ 発動</div>`;
        const lureTimeTotal = (stats.debugData.p.n * c.D_LURE).toFixed(1);
        trace += `<div style="font-size:0.75rem;margin-top:5px;padding-left:10px;">Cast(${c.D_CAST}) + Lure(${lureTimeTotal}) + Rest(${c.D_REST})</div>`;
    }
    
    document.getElementById('debug-scenario').innerHTML = trace;
}

init();