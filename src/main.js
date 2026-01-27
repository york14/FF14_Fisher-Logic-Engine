/**
 * Fisherman Logic Engine (FLE) v3.0
 * Ported to Vite + Module system.
 * Auto-loads logic_master.json
 */

import './style.css';
import masterDBData from './data/logic_master.json';

const GDS = {
    D_CAST: 0.0, D_LURE: 2.5, D_BLK: 2.5, D_CHUM: 1.0, D_REST: 2.0,
    C_CHUM: 0.5, M_N1: 1.5, M_N2: 2.0, M_N3: 6.0
};

let masterDB = null;
let probabilityMap = null;
let currentMode = 'manual';

function init() {
    console.log("FLE: init() start");

    // Initialize Master Data directly
    try {
        masterDB = masterDBData;
        if (!masterDB || !masterDB.probabilities) throw new Error("Invalid JSON: missing probabilities");
        probabilityMap = generateProbabilityMap(masterDB.probabilities);

        const statusEl = document.getElementById('db-status');
        if (statusEl) {
            statusEl.textContent = `ONLINE (v${masterDB.version})`;
            statusEl.style.color = 'var(--accent-green)';
        }

        // Enable Controls
        document.querySelectorAll('select:disabled, input:disabled').forEach(el => el.disabled = false);
        const isCatchAll = document.getElementById('isCatchAll');
        if (isCatchAll && isCatchAll.checked) {
            const slapOpts = ['manualSurfaceSlap', 'stratASlap', 'stratBSlap'];
            slapOpts.forEach(id => {
                const el = document.getElementById(id);
                if (el) { el.value = 'なし'; el.disabled = true; }
            });
        }

        setupEventListeners();
        initResizers();
        updateLureUI();
        populateSelectors();

    } catch (err) {
        console.error(err);
        const statusEl = document.getElementById('db-status');
        if (statusEl) {
            statusEl.textContent = `ERROR: ${err.message}`;
        }
    }
}

function setupEventListeners() {
    // Removed file upload listener

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

    ['currentWeather', 'currentBait', 'targetFishName', 'manualSurfaceSlap'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', updateSimulation);
    });

    document.getElementById('isCatchAll').addEventListener('change', (e) => {
        const disabled = e.target.checked;
        const slapOpts = ['manualSurfaceSlap', 'stratASlap', 'stratBSlap'];
        slapOpts.forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.value = 'なし'; el.disabled = disabled; }
        });
        updateSimulation();
    });

    ['manualChum', 'lureType', 'lureCount', 'lureStep1', 'lureStep2', 'lureStep3'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => {
            if (id.startsWith('lure')) updateLureUI();
            updateSimulation();
        });
    });

    ['stratALure', 'stratAQuit', 'stratAPreset', 'stratASlap', 'stratAChum',
        'stratBLure', 'stratBQuit', 'stratBPreset', 'stratBSlap', 'stratBChum'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => {
                if (id.includes('Lure')) updateStrategyPresetsFilter();
                updateSimulation();
            });
        });
}

function populateSelectors() {
    if (!masterDB) return;
    const expansionSet = new Set();
    Object.values(masterDB.spots).forEach(s => { if (s.expansion) expansionSet.add(s.expansion); });
    const expSelect = document.getElementById('currentExpansion');
    expSelect.innerHTML = '';
    Array.from(expansionSet).forEach(exp => expSelect.appendChild(new Option(exp, exp)));
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
    Array.from(areaSet).forEach(area => areaSelect.appendChild(new Option(area, area)));
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
        if (resultContent) {
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

    const slapOpts = ['manualSurfaceSlap', 'stratASlap', 'stratBSlap'];
    slapOpts.forEach(id => {
        const sel = document.getElementById(id);
        sel.innerHTML = '<option value="なし">なし</option>';
        spotData.fish_list.forEach(f => sel.appendChild(new Option(f, f)));
        if (document.getElementById('isCatchAll').checked) {
            sel.value = 'なし'; sel.disabled = true;
        }
    });

    updateSimulation();
}

function updateSelect(id, items) {
    const el = document.getElementById(id);
    if (!el) return;
    const val = el.value;
    el.innerHTML = '';
    items.forEach(item => el.appendChild(new Option(item, item)));
    if ([...el.options].some(o => o.value === val)) el.value = val;
}

function updateStrategyPresetsFilter() {
    ['A', 'B'].forEach(set => {
        const lureVal = document.getElementById(`strat${set}Lure`).value;
        const presetSel = document.getElementById(`strat${set}Preset`);
        const quitSelect = document.getElementById(`strat${set}Quit`);
        const isNoLure = (lureVal === 'none');

        quitSelect.disabled = isNoLure;
        if (isNoLure) quitSelect.value = 'no';

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

    for (let i = 1; i <= 3; i++) {
        const el = document.getElementById(`lureStep${i}`);
        el.disabled = !isLureActive || count < i;
        el.style.opacity = (!isLureActive || count < i) ? '0.3' : '1.0';
        if (el.disabled) el.value = 'none';
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
        const key = `${row.spot}|${row.weather}|${row.bait}|${row.lure_type}|${row.slap_target}`;
        map.set(key, row);
    });
    return map;
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

// --- Init Resizers ---
function initResizers() {
    const resizerLeft = document.getElementById('resizer-left');
    const panelLeft = document.getElementById('panel-left');
    const resizerRight = document.getElementById('resizer-right');
    const panelRight = document.getElementById('panel-right');

    const initDrag = (resizer, panel, isRight) => {
        let startX, startWidth;
        const doDrag = (e) => {
            const dx = e.clientX - startX;
            const newW = startWidth + (isRight ? -dx : dx);
            panel.style.width = `${newW}px`;
        };
        const stopDrag = () => {
            document.removeEventListener('mousemove', doDrag);
            document.removeEventListener('mouseup', stopDrag);
            resizer.classList.remove('active');
        };
        resizer.addEventListener('mousedown', (e) => {
            startX = e.clientX;
            startWidth = parseInt(getComputedStyle(panel).width, 10);
            resizer.classList.add('active');
            document.addEventListener('mousemove', doDrag);
            document.addEventListener('mouseup', stopDrag);
            e.preventDefault();
        });
    };

    initDrag(resizerLeft, panelLeft, false);
    initDrag(resizerRight, panelRight, true);
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
        quitIfNoDisc: false // Manual mode always false
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
    const slapFish = document.getElementById('manualSurfaceSlap').value;
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

    const stats = calculateScenarioStats(config, scenarioId, isChum, slapFish);

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
            quitIfNoDisc: document.getElementById(`strat${set}Quit`).value === 'yes',
            slapFish: document.getElementById(`strat${set}Slap`).value,
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
        const stats = calculateScenarioStats(scenarioConfig, sid, setConfig.isChum, setConfig.slapFish);
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

    return { name: preset.name, description: preset.description, Slap: setConfig.slapFish, scenarios, totalProb, avgHitRate: weightedHitRate, avgCycle: weightedCycle, avgCastCount, expectedTime, error: null };
}

function calculateScenarioStats(config, scenarioId, isChum, slapFish) {
    if (!masterDB.spots[config.spot]) return { error: "釣り場データが見つかりません" };
    const p = parseScenarioId(scenarioId);
    const weightKey = `${config.spot}|${config.weather}|${config.bait}`;
    const baseWeights = masterDB.weights[weightKey] || [];

    let probData = null;
    if (config.lureType !== 'none') {
        const searchKey = `${config.spot}|${config.weather}|${config.bait}|${config.lureType}|${slapFish}`;
        if (probabilityMap) probData = probabilityMap.get(searchKey);
    }
    const rawRates = probData ? { disc: probData.disc_rates, guar: probData.guar_rates_nodisc } : null;
    if (!probData && config.lureType !== 'none') return { error: "条件に合う確率データがありません", debugData: { rates: rawRates } };

    const tCast = GDS.D_CAST, tLureAction = GDS.D_LURE, tLureBlock = GDS.D_BLK, tChum = GDS.D_CHUM, tRest = GDS.D_REST;

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
    let modN = (p.n === 1) ? GDS.M_N1 : (p.n === 2 ? GDS.M_N2 : (p.n === 3 ? GDS.M_N3 : 1.0));
    const currentLureJaws = (config.lureType === 'アンビシャスルアー') ? 'large_jaws' : (config.lureType === 'モデストルアー' ? 'small_jaws' : null);
    const lastGuar = (p.g.length > 0 && p.g[p.g.length - 1] === p.n);

    baseWeights.forEach(w => {
        const info = masterDB.fish[w.fish];
        if (!info) return;
        let m = 1.0;
        if (w.fish === hiddenFishName) { weightDetails.push({ name: w.fish, base: w.weight, m: '-', final: '-', isHidden: true }); return; }
        if (w.fish === slapFish) { m = 0; }
        else if (config.lureType !== 'none') {
            const match = (info.type === currentLureJaws);
            if (match) m = modN; else m = lastGuar ? 0 : 1.0;
        }
        let finalW = w.weight * m;
        totalWeight += finalW;
        weightDetails.push({ name: w.fish, base: w.weight, m: m, final: finalW, isHidden: false });
    });

    let allFishStats = [], sumProbTotalCycle = 0, sumProb = 0;
    let sumProbWaitRange = 0;
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
        sumProb += hitProb;
        const baseBiteMin = wData.bite_time_min;
        const baseBiteMax = wData.bite_time_max;

        const biteTimeMin = isChum ? (baseBiteMin * GDS.C_CHUM) : baseBiteMin;
        const biteTimeMax = isChum ? (baseBiteMax * GDS.C_CHUM) : baseBiteMax;

        const waitTimeMin = Math.max(biteTimeMin, lureTime);
        const waitTimeMax = Math.max(biteTimeMax, lureTime);
        const waitTimeAvg = (waitTimeMin + waitTimeMax) / 2;
        const waitTimeRange = (waitTimeMax - waitTimeMin) / 2;

        const isTarget = (fName === config.target);
        const actualHookTime = (isTarget || config.isCatchAll) ? fInfo.hook_time : tRest;

        let cycleTime = 0;
        const pre = (isChum ? tChum : 0);

        if (isQuit) {
            cycleTime = tCast + (p.n * tLureAction) + tRest + pre;
        } else {
            cycleTime = tCast + waitTimeAvg + actualHookTime + pre;
        }

        sumProbTotalCycle += (hitProb * cycleTime);
        sumProbWaitRange += (hitProb * waitTimeRange);

        allFishStats.push({
            name: fName, vibration: fInfo.vibration, hitRate: hitProb,
            baseBiteMin, baseBiteMax, biteTimeMin, biteTimeMax, lureTime,
            waitTimeMin, waitTimeMax, waitTimeAvg, waitTimeRange,
            hookTime: actualHookTime, cycleTime, isTarget
        });
    });

    if (isQuit) {
        const pre = (isChum ? tChum : 0);
        sumProbTotalCycle = tCast + (p.n * tLureAction) + tRest + pre;
    }

    const targetStat = allFishStats.find(s => s.isTarget);
    const targetHitRate = targetStat ? targetStat.hitRate : 0;
    const targetHookTime = targetStat ? targetStat.hookTime : 0;
    const expectedTime = (targetHitRate > 0) ? (sumProbTotalCycle - (targetHitRate * targetHookTime)) / targetHitRate : Infinity;
    const expectedTimeRange = (targetHitRate > 0) ? (sumProbWaitRange / targetHitRate) : 0;

    return {
        allFishStats, totalWeight, weightDetails, pHidden, hiddenFishName, targetHitRate,
        avgCycleTime: sumProbTotalCycle, expectedTime, expectedTimeRange, scenarioStr: scenarioStrParts.join('→'), scenarioProb,
        debugData: { p, rates: rawRates, lureTime, waitTimeAvg: targetStat?.waitTimeAvg, waitTimeRange: targetStat?.waitTimeRange, targetCycle: targetStat?.cycleTime, targetHook: targetHookTime, isQuit }
    };
}

function renderStrategyComparison(resA, resB, config) {
    const resultContent = document.getElementById('result-content');
    const right = document.getElementById('debug-content-wrapper');
    const buildCard = (res, label, color) => {
        const time = (res.error || res.expectedTime === Infinity) ? '∞' : res.expectedTime.toFixed(1);
        const range = (res.error || !res.expectedTimeRange) ? '0.0' : res.expectedTimeRange.toFixed(1);
        const timeDisplay = (res.error || res.expectedTime === Infinity) ? '∞' :
            `${time}<span style="font-size:0.6em; margin-left:4px;">±${range}</span>`;

        const hit = (res.error) ? '-' : (res.avgHitRate * 100).toFixed(2) + '%';
        const cycle = (res.error) ? '-' : res.avgCycle.toFixed(1) + ' sec';
        let top3Html = '';
        if (!res.error && res.scenarios) {
            const sorted = [...res.scenarios].sort((a, b) => b.prob - a.prob).slice(0, 3);
            top3Html = `<div class="top3-container"><div class="top3-title">高確率シナリオ Top3</div>${sorted.map(s => `
                <div class="top3-item"><div style="color:${color};font-weight:bold;">${s.label} ${(s.isQuit ? '<span style="color:red">!</span>' : '')}</div>
                <div class="top3-stats"><span>Hit:${(s.hit * 100).toFixed(1)}%</span><span>発生:${(s.prob * 100).toFixed(1)}%</span></div></div>
            `).join('')}</div>`;
        }
        const waitTimeStr = (res.error || !res.targetHitRate || res.debugData.waitTimeAvg === undefined) ? '-' :
            `${res.debugData.waitTimeAvg.toFixed(1)} <span style="font-size:0.8rem">±${res.debugData.waitTimeRange?.toFixed(1) || '0.0'}</span>`;

        return `<div class="strat-card" style="border-top:4px solid ${color}"><h4>${res.name}</h4><div class="strat-desc">${res.description || ''}</div><div class="main-val">${timeDisplay}<span style="font-size:1rem;font-weight:normal;color:#888">sec</span></div><div class="val-label">期待待機時間</div><div class="stat-row"><div class=\"stat-item\">Hit<br><span class=\"stat-val\">${hit}</span></div><div class=\"stat-item\">Wait<br><span class=\"stat-val\">${waitTimeStr}</span></div><div class=\"stat-item\">Cycle<br><span class=\"stat-val\">${cycle}</span></div></div>${res.error ? `<div style="color:red">⚠️ ${res.error}</div>` : top3Html}</div>`;
    };
    resultContent.innerHTML = `<div class="comparison-container" style="align-items:stretch;">${buildCard(resA, "Set A", "var(--accent-a)")}${buildCard(resB, "Set B", "var(--accent-b)")}</div>`;

    let debugHtml = `<div class="debug-section"><label>【定数】</label><div id="debug-constants" class="formula-box" style="font-size:0.75rem;"></div></div>`;
    debugHtml += renderStrategyDebugTable(resA, "Set A", "var(--accent-a)");
    debugHtml += renderStrategyDebugTable(resB, "Set B", "var(--accent-b)");
    right.innerHTML = debugHtml;

    const tCast = GDS.D_CAST, tLure = GDS.D_LURE, tRest = GDS.D_REST, tBlk = GDS.D_BLK;
    document.getElementById('debug-constants').innerHTML = `Cast:${tCast}s / Lure:${tLure}s / Block:${tBlk}s / Rest:${tRest}s`;
}

function renderResultTable(stats, targetName, scnStr, scnProb, avgCycle) {
    const tbody = document.getElementById('res-table-body');
    tbody.innerHTML = '';
    document.getElementById('scenario-str').textContent = `シナリオ: ${scnStr}`;
    document.getElementById('scenario-prob').textContent = `発生確率: ${(scnProb !== null ? (scnProb * 100).toFixed(2) + '%' : '-')}`;
    document.getElementById('avg-cycle-time').textContent = `平均サイクル: ${(avgCycle > 0 ? avgCycle.toFixed(1) + 'sec' : '-')}`;

    stats.forEach(s => {
        const tr = document.createElement('tr');
        if (s.name === targetName) tr.classList.add('row-target');
        const hitStr = (s.hitRate > 0) ? (s.hitRate * 100).toFixed(1) + '%' : '0.0%';
        const cycleStr = s.cycleTime.toFixed(1) + 'sec';
        const waitTimeStr = (s.waitTimeAvg !== undefined) ?
            `${s.waitTimeAvg.toFixed(1)}<span style="font-size:0.7em">±${s.waitTimeRange.toFixed(1)}</span>` : '-';
        tr.innerHTML = `<td>${s.name}</td><td>${s.vibration}</td><td>${hitStr}</td><td>${waitTimeStr}s</td><td>${cycleStr}</td>`;
        tbody.appendChild(tr);
    });
}

function renderDebugDetails(stats, config, isChum, scenarioId) {
    const c = GDS;
    document.getElementById('debug-constants').innerHTML = `Cast:${c.D_CAST}s / Lure:${c.D_LURE}s / Block:${c.D_BLK}s / Rest:${c.D_REST}s / Chum:${c.D_CHUM}s`;

    const searchKeys = `
        <div style="font-size:0.7rem; color:#ccc; margin-bottom:6px; padding-bottom:6px; border-bottom:1px dashed #666; line-height:1.4;">
            <div>Spot: ${config.spot}</div>
            <div>Cond: ${config.weather} / Bait: ${config.bait}</div>
            <div>Target: ${config.target}</div>
            <div>Slap: ${document.getElementById('manualSurfaceSlap').value} / Lure: ${config.lureType}</div>
            <div>Rest if no disc: ${config.quitIfNoDisc ? 'ON' : 'OFF'}</div>
        </div>
    `;

    if (stats.error) {
        document.getElementById('debug-scenario').innerHTML = searchKeys + `<div>特定キー: ${getScenarioLabel(scenarioId)} (${scenarioId})</div>`;
        return;
    }

    let analysisHtml = searchKeys;
    analysisHtml += `<div>特定キー: ${getScenarioLabel(scenarioId)} (${scenarioId})</div>`;
    if (stats.debugData && stats.debugData.rates) {
        const fmt = (arr) => arr.map(v => (v === null ? 'null' : v + '%')).join(', ');
        analysisHtml += `<div style="margin-top:5px; font-size:0.7rem; color:#bbb;">
            <div>発見率: [${fmt(stats.debugData.rates.disc)}]</div>
            <div>未発見型確定率: [${fmt(stats.debugData.rates.guar)}]</div>
        </div>`;
    }

    if (stats.debugData.isQuit) {
        analysisHtml += `<div style="color:var(--accent-red); font-weight:bold; margin-top:5px;">※未発見即竿上げ 発動</div>`;
    }

    if (!stats.error) analysisHtml += `<div>隠し魚ヒット率 (P_Hidden): ${(stats.pHidden * 100).toFixed(2)}%</div>`;
    document.getElementById('debug-scenario').innerHTML = analysisHtml;

    if (stats.error) return;

    let wHtml = `<table style="width:100%; border-collapse:collapse; font-size:0.7rem;">
        <tr style="border-bottom:1px solid #666; text-align:right;">
            <th style="text-align:left">魚種</th><th>基礎W</th><th>M</th><th>最終W</th><th>確率</th>
        </tr>`;
    stats.weightDetails.forEach(d => {
        if (!d.isHidden) {
            const prob = (stats.totalWeight > 0) ? (d.final / stats.totalWeight) * (1.0 - stats.pHidden) : 0;
            wHtml += `<tr style="text-align:right;">
                <td style="text-align:left">${d.name}</td>
                <td>${d.base}</td>
                <td>x${d.m}</td>
                <td>${d.final.toFixed(1)}</td>
                <td>${(prob * 100).toFixed(2)}%</td>
            </tr>`;
        }
    });
    wHtml += `<tr style="border-top:1px solid #666; font-weight:bold; text-align:right;"><td colspan="3">合計(ΣW)</td><td>${stats.totalWeight.toFixed(1)}</td><td>-</td></tr>`;
    stats.weightDetails.forEach(d => {
        if (d.isHidden) wHtml += `<tr style="color:#888; text-align:right;"><td style="text-align:left">${d.name}(隠)</td><td>-</td><td>-</td><td>-</td><td>${(stats.pHidden * 100).toFixed(2)}%</td></tr>`;
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

    let targetTraceHtml = '';
    if (stats.debugData.isQuit) {
        const lureActionTotal = (p.n * c.D_LURE).toFixed(1);
        targetTraceHtml = `
            <div style="font-size:0.8rem; color:var(--accent-red); font-weight:bold;">
                ⚠ 発見なしのため即竿上げ (Rest Executed)
            </div>
            <div style="font-size:0.8rem;">
                <strong>サイクル時間 (${tStat.cycleTime.toFixed(1)}s)</strong>
                <div style="padding-left:10px;">
                   撒き餌(${pre}s) + キャスティング(${c.D_CAST}s) + ルアー動作(${lureActionTotal}s) + 竿上げ(${c.D_REST}s)
                </div>
            </div>
        `;
    } else {
        targetTraceHtml = `
            <div style="font-size:0.8rem; margin-bottom:5px;">
                <strong>A. 待機時間 (Avg ${tStat.waitTimeAvg.toFixed(1)}s ±${tStat.waitTimeRange.toFixed(1)})</strong>
                <div style="padding-left:10px;">
                   ・基礎Range: ${tStat.baseBiteMin.toFixed(1)}～${tStat.baseBiteMax.toFixed(1)}s<br>
                   ・補正Range: ${tStat.biteTimeMin.toFixed(1)}～${tStat.biteTimeMax.toFixed(1)}s (撒き餌:${chumTxt})<br>
                   ・ルアー拘束: ${lureWaitExpr}<br>
                   → 補正Rangeと拘束時間の大きい方を採用 (Min/Max算出)
                </div>
            </div>
            <div style="font-size:0.8rem;">
                <strong>B. サイクル時間 (${tStat.cycleTime.toFixed(1)}s)</strong>
                <div style="padding-left:10px;">
                   撒き餌(${pre}s) + キャスティング(${c.D_CAST}s) + 待機(A_Avg) + 釣り上げ(${tStat.hookTime.toFixed(1)}s)
                </div>
            </div>
        `;
    }
    document.getElementById('debug-calc-target').innerHTML = targetTraceHtml;

    const avgCycle = stats.avgCycleTime;
    const hitRate = stats.targetHitRate;
    const expectedTimeRange = stats.expectedTimeRange || 0;
    const formulaStr = `(${avgCycle.toFixed(2)} - (${(hitRate * 100).toFixed(2)}% × ${targetHook.toFixed(1)})) / ${(hitRate * 100).toFixed(2)}%`;
    const rangeStr = `<span style="font-size:0.8em; color:#888;">±${expectedTimeRange.toFixed(1)}s</span>`;
    const expectExpr = (hitRate > 0) ? `${formulaStr} = <strong>${expectedTime.toFixed(1)}s</strong> ${rangeStr}` : `ターゲット確率が 0% のため計算不可`;

    const expectHtml = `
        <div style="font-size:0.8rem;">
            <div><strong>平均サイクル (E[Cycle]):</strong> ${avgCycle.toFixed(2)}s</div>
            <div><strong>ターゲット確率 (P):</strong> ${(hitRate * 100).toFixed(2)}%</div>
            <div><strong>ターゲット釣り上げ動作時間:</strong> ${targetHook.toFixed(1)}s</div>
            <hr style="margin:5px 0; border:0; border-top:1px dashed #666;">
            <div><strong>式:</strong> (E[Cycle] - (P × 動作時間)) / P</div>
            <div style="margin:5px 0; color:#bbb; font-size:0.75rem; line-height:1.4;">
                ※ターゲット釣り上げ時間（成功時コスト）を除外した待機期待値
            </div>
            <div style="margin-top:4px; color:var(--primary);">${expectExpr}</div>
        </div>
    `;
    document.getElementById('debug-calc-expect').innerHTML = expectHtml;
}

function renderStrategyDebugTable(res, label, color) {
    if (res.error) return `<div class="debug-section" style="border-left:3px solid ${color}; padding-left:10px;"><label style="color:${color}">${label}</label><div style="color:red">${res.error}</div></div>`;

    let html = `<div class="debug-section" style="border-left:3px solid ${color}; padding-left:10px;">
        <label style="color:${color}">${label} (${res.name})</label>
        <div style="font-size:0.7rem; color:#ccc; margin-bottom:5px;">Slap: ${res.Slap} / TotalProb: ${(res.totalProb * 100).toFixed(1)}%</div>
        <div style="overflow-x:auto; max-height:200px; overflow-y:auto; border:1px solid #444;">
        <table style="width:100%; font-size:0.7rem; border-collapse:collapse;">
            <thead style="position:sticky; top:0; background:#333;">
                <tr><th>シナリオ</th><th>確率</th><th>Hit</th><th>Cycle</th><th>Exp</th></tr>
            </thead>
            <tbody>`;

    const sorted = [...res.scenarios].sort((a, b) => b.prob - a.prob);

    sorted.forEach(s => {
        const quitMark = s.isQuit ? '<span style="color:red; font-weight:bold;">!</span> ' : '';
        html += `<tr>
            <td style="white-space:nowrap;">${quitMark}${s.label}</td>
            <td>${(s.prob * 100).toFixed(1)}%</td>
            <td>${(s.hit * 100).toFixed(1)}%</td>
            <td>${s.cycle.toFixed(1)}s</td>
            <td>${(s.expected === Infinity) ? '-' : s.expected.toFixed(0)}s</td>
        </tr>`;
    });

    html += `</tbody>
            <tfoot style="position:sticky; bottom:0; background:#333; font-weight:bold;">
                <tr>
                    <td>平均/合計</td>
                    <td>${(res.totalProb * 100).toFixed(0)}%</td>
                    <td>${(res.avgHitRate * 100).toFixed(2)}%</td>
                    <td>${res.avgCycle.toFixed(1)}s</td>
                    <td>${res.expectedTime.toFixed(1)}s</td>
                </tr>
            </tfoot>
        </table></div></div>`;
    return html;
}

init();
