/**
 * Fisherman Logic Engine (FLE) v3.1 (Refactored)
 * Ported to Vite + Module system.
 * Auto-loads logic_master.json
 */

import './style.css';
import masterDBData from './data/logic_master.json';
import { GDS, generateProbabilityMap, calculateScenarioStats, calculateStrategySet } from './core/calculator.js';
import { constructScenarioId, parseScenarioId, getScenarioLabel } from './core/scenario.js';
import {
    initResizers, updateSelect, populateSelectors, updateAreaOptions, updateSpotOptions,
    updateSpotDependents, updateLureUI, updateStrategyPresetsFilter
} from './ui/controls.js';
import {
    renderManualModeResult, renderStrategyComparison, renderDebugDetails, renderResultTable,
    renderVariableManualResult, renderVariableDebugDetails,
    renderVariableStrategyComparison
} from './ui/render.js';
import { initOptimizerTab, runOptimizationV2 } from './ui/tab_optimizer.js';

let masterDB = null;
let probabilityMap = null;
let currentMode = 'manual';

function init() {
    console.log("FLE: init() start");

    // Detect Share Mode
    if (document.body.classList.contains('share-page')) {
        initShareMode();
        return;
    }

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
            const slapOpts = ['manualSurfaceSlap', 'stratASlap', 'stratBSlap', 'optASlap', 'optBSlap'];
            slapOpts.forEach(id => {
                const el = document.getElementById(id);
                if (el) { el.value = 'なし'; el.disabled = true; }
            });
        }

        setupEventListeners();
        initResizers();
        updateLureUI();
        populateSelectors(masterDB);

        // デフォルト設定: 満ちた玄関 / 曇り雨16-18 / ゴーストニッパー / リッチパース
        const defaults = {
            expansion: '黄金の遺産_7.x',
            area: 'トライヨラ',
            spot: '満ちた玄関',
            weather: '曇り雨16-18',
            bait: 'ゴーストニッパー',
            target: 'リッチパース'
        };
        const setIfExists = (id, val) => {
            const el = document.getElementById(id);
            if (el && Array.from(el.options).some(o => o.value === val)) el.value = val;
        };
        setIfExists('currentExpansion', defaults.expansion);
        updateAreaOptions(masterDB);
        setIfExists('currentArea', defaults.area);
        updateSpotOptions(masterDB);
        setIfExists('currentSpot', defaults.spot);
        updateSpotDependents(masterDB, () => { }); // populate weather/bait/target without triggering simulation yet
        setIfExists('currentWeather', defaults.weather);
        setIfExists('currentBait', defaults.bait);
        setIfExists('targetFishName', defaults.target);
        updateSimulation();
        initOptimizerTab(masterDB, probabilityMap);

        // Share Button Listener
        const shareBtn = document.getElementById('btn-share-result');
        if (shareBtn) {
            shareBtn.addEventListener('click', async () => {
                const url = serializeStateToURL();
                if (url) {
                    try {
                        await navigator.clipboard.writeText(url);
                        const originalText = shareBtn.textContent;
                        shareBtn.textContent = "✅ Copied!";
                        setTimeout(() => shareBtn.textContent = originalText, 2000);
                    } catch (err) {
                        console.error('Failed to copy: ', err);
                        alert('URLの生成に成功しましたが、コピーに失敗しました。\nコンソールを確認してください。');
                    }
                }
            });
        }

    } catch (err) {
        console.error(err);
        const statusEl = document.getElementById('db-status');
        if (statusEl) {
            statusEl.textContent = `ERROR: ${err.message}`;
        }
    }
}

// --- Share Mode Logic ---
async function initShareMode() {
    console.log("FLE: Share Mode Init");
    try {
        masterDB = masterDBData;
        probabilityMap = generateProbabilityMap(masterDB.probabilities);

        const params = new URLSearchParams(window.location.search);
        let dataStr = params.get('data');

        if (!dataStr) {
            document.getElementById('result-content').innerHTML = '<div style="padding:20px; text-align:center; color:red;">結果データが見つかりません (No Data)</div>';
            return;
        }

        if (dataStr.includes(' ')) {
            dataStr = dataStr.replace(/ /g, '+');
        }

        let config;
        try {
            const jsonStr = decodeURIComponent(escape(atob(dataStr)));
            config = JSON.parse(jsonStr);
        } catch (e) {
            console.error(e);
            throw new Error(`データの読み込みに失敗しました (${e.message})`);
        }

        console.log("Restored Config:", config);
        currentMode = config.mode;

        // UI Population (Read Only - Simplified for check)
        // Note: For full Read-Only UI population we would need more logic here, 
        // but since Share Mode usually just renders the result, we might not need to populate all inputs if they are hidden/disabled.
        // However, the original code did populate them.
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        const setCheck = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };
        const addOpt = (id, val) => {
            const el = document.getElementById(id);
            if (el && val) { el.innerHTML = ''; el.appendChild(new Option(val, val)); el.value = val; }
        };

        if (config.spot && masterDB.spots[config.spot]) {
            const sInfo = masterDB.spots[config.spot];
            addOpt('currentExpansion', sInfo.expansion);
            addOpt('currentArea', sInfo.area);
        }

        addOpt('currentSpot', config.spot);
        addOpt('currentWeather', config.weather);
        addOpt('currentBait', config.bait);
        addOpt('targetFishName', config.target);
        setCheck('isCatchAll', config.isCatchAll);
        setCheck('isVariableMode', config.isVariableMode);
        setVal('macroLimitTime', config.macroLimitTime || '');

        document.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.mode === config.mode);
        });
        document.querySelectorAll('.mode-container').forEach(c => {
            c.classList.toggle('active', c.id === `mode-${config.mode}`);
        });

        // 手動設定の UI 復元（share.htmlのmode-manual内要素）
        addOpt('manualSurfaceSlap', config.slapFish || 'なし');
        setVal('manualChum', config.isChum ? 'yes' : 'no');
        addOpt('lureType', config.lureType || 'none');
        setVal('lureCount', config.lureCount || '1');
        setVal('lureStep1', config.lureStep1 || 'disc');
        setVal('lureStep2', config.lureStep2 || 'disc');
        setVal('lureStep3', config.lureStep3 || 'disc');

        if (config.mode === 'manual') {
            if (config.isVariableMode) {
                await runManualModeVariable(config);
            } else {
                // Manual Render
                // Reconstruct config
                const calcConfig = {
                    spot: config.spot, weather: config.weather, bait: config.bait, target: config.target,
                    isCatchAll: config.isCatchAll, lureType: config.lureType, slapFish: config.slapFish,
                    quitIfNoDisc: false,
                    macroLimitTime: parseFloat(config.macroLimitTime) || 0
                };

                // Reconstruct Scenario ID
                let scenarioId = 'none_0';
                if (config.lureType !== 'none') {
                    const steps = [];
                    const count = parseInt(config.lureCount || 0);
                    for (let i = 1; i <= count; i++) steps.push(config[`lureStep${i}`] || 'none');
                    scenarioId = constructScenarioId(config.lureType, count, steps);
                }

                const stats = calculateScenarioStats(masterDB, probabilityMap, calcConfig, scenarioId, config.isChum, config.slapFish);
                renderManualModeResult(stats, calcConfig, config.isChum, config.slapFish);
                // Debug details
                renderDebugDetails(stats, calcConfig, config.isChum, scenarioId);
            }
        } else if (config.mode === 'optimizer') {
            // Optimizer Mode UI Restore
            const opt = config.opt || {};

            // 制約パラメータ
            setVal('opt-window-time', opt.time || '350');
            setVal('opt-initial-gp', opt.gp || '1000');
            setVal('opt-saljak-count', opt.saljak || '0');

            // SetA / SetB
            ['A', 'B'].forEach(side => {
                const s = opt[`set${side}`] || {};
                addOpt(`opt${side}Lure`, s.lure || 'none');
                addOpt(`opt${side}Slap`, s.slap || 'なし');
                addOpt(`opt${side}Chum`, s.chum || 'no');
                // Preset: find name from masterDB
                const presetId = s.preset || '';
                const preset = masterDB.strategy_presets.find(p => p.id === presetId);
                const presetEl = document.getElementById(`opt${side}Preset`);
                if (presetEl && preset) {
                    presetEl.innerHTML = '';
                    presetEl.appendChild(new Option(preset.name, preset.id));
                    presetEl.value = preset.id;
                }
            });

            // Run optimizer calculation
            runOptimizationV2(masterDB, probabilityMap, config.isVariableMode);

        } else {
            // Strategy Mode UI Restore
            ['A', 'B'].forEach(set => {
                const sDat = config[`strat${set}`];
                if (sDat) {
                    addOpt(`strat${set}Lure`, sDat.lureType || 'none');
                    setVal(`strat${set}Quit`, sDat.quit || 'no');
                    setVal(`strat${set}MacroLimit`, sDat.macroLimit || '');
                    addOpt(`strat${set}Slap`, sDat.slap || 'なし');
                    setVal(`strat${set}Chum`, sDat.chum || 'no');
                    // Preset: find name from masterDB
                    const preset = masterDB.strategy_presets.find(p => p.id === sDat.preset);
                    const presetName = preset ? preset.name : sDat.preset;
                    addOpt(`strat${set}Preset`, presetName);
                    // Set the actual value to the preset ID for display
                    const presetEl = document.getElementById(`strat${set}Preset`);
                    if (presetEl && preset) {
                        presetEl.innerHTML = '';
                        presetEl.appendChild(new Option(preset.name, preset.id));
                        presetEl.value = preset.id;
                    }
                }
            });

            // Strategy Calculation
            const calcConfig = {
                spot: config.spot, weather: config.weather, bait: config.bait,
                target: config.target, isCatchAll: config.isCatchAll,
                macroLimitTime: parseFloat(config.macroLimitTime) || 0
            };
            const sets = ['A', 'B'];
            const results = {};

            if (config.isVariableMode) {
                // Variable mode strategy — inline calculation to avoid DOM dependency
                sets.forEach(set => {
                    const sDat = config[`strat${set}`];
                    const setConfig = {
                        lureType: sDat.lureType, quitIfNoDisc: sDat.quit === 'yes',
                        slapFish: sDat.slap, isChum: sDat.chum === 'yes', presetId: sDat.preset,
                        macroLimitTime: sDat.macroLimit !== undefined && sDat.macroLimit !== '' ? parseFloat(sDat.macroLimit) : undefined
                    };
                    const preset = masterDB.strategy_presets.find(p => p.id === setConfig.presetId);
                    if (!preset) {
                        results[set] = { error: 'プリセット未選択', name: '(未選択)', description: '' };
                        return;
                    }
                    const stratResult = calculateStrategySet(masterDB, probabilityMap, calcConfig, setConfig, preset, 100);
                    if (stratResult.error) { results[set] = stratResult; return; }

                    let weightedA = 0, weightedB = 0;
                    const enrichedScenarios = [];
                    for (const scn of stratResult.scenarios) {
                        const scenarioConfig = { ...calcConfig, lureType: setConfig.lureType, quitIfNoDisc: setConfig.quitIfNoDisc };
                        const stats = calculateScenarioStats(masterDB, probabilityMap, scenarioConfig, scn.id, setConfig.isChum, setConfig.slapFish, 100);
                        if (stats.error || !stats.allFishStats.find(s => s.isTarget)) {
                            enrichedScenarios.push({ ...scn, A: 0, B: 0 }); continue;
                        }
                        const tStat = stats.allFishStats.find(s => s.isTarget);
                        const A_i = tStat.cycleTime - tStat.hookTime;
                        const K = stats.weightDetails.filter(d => d.name !== calcConfig.target && !d.isHidden).reduce((acc, d) => acc + d.base, 0);
                        const targetWD = stats.weightDetails.find(d => d.name === calcConfig.target);
                        const M = (targetWD && targetWD.m !== '-') ? targetWD.m : 1.0;
                        let sum_wT = 0;
                        stats.allFishStats.filter(s => !s.isTarget).forEach(o => {
                            const wd = stats.weightDetails.find(d => d.name === o.name);
                            if (wd && !wd.isHidden) sum_wT += (wd.final * o.cycleTime);
                        });
                        const B_i = (K > 0 && M > 0) ? sum_wT / (M * K) : 0;
                        weightedA += scn.prob * A_i;
                        weightedB += scn.prob * B_i;
                        enrichedScenarios.push({ ...scn, A: A_i, B: B_i });
                    }
                    const tp = stratResult.totalProb;
                    results[set] = {
                        ...stratResult, scenarios: enrichedScenarios,
                        variableInfo: { A: tp > 0 ? weightedA / tp : 0, B: tp > 0 ? weightedB / tp : 0 }
                    };
                });
                renderVariableStrategyComparison(results.A, results.B, calcConfig);
            } else {
                sets.forEach(set => {
                    const sDat = config[`strat${set}`];
                    const setConfig = {
                        lureType: sDat.lureType, quitIfNoDisc: sDat.quit === 'yes', slapFish: sDat.slap,
                        isChum: sDat.chum === 'yes', presetId: sDat.preset,
                        macroLimitTime: sDat.macroLimit !== undefined && sDat.macroLimit !== '' ? parseFloat(sDat.macroLimit) : undefined
                    };
                    const preset = masterDB.strategy_presets.find(p => p.id === setConfig.presetId);
                    results[set] = calculateStrategySet(masterDB, probabilityMap, calcConfig, setConfig, preset);
                });
                renderStrategyComparison(results.A, results.B, calcConfig);
            }
        }

    } catch (err) {
        document.getElementById('result-content').innerHTML = `
            <div style="padding:20px; text-align:center; color:red; border:1px solid red; background:#fff0f0;">
                <h3>エラーが発生しました</h3>
                <p>${err.message}</p>
            </div>`;
    }
}

function serializeStateToURL() {
    const state = {
        version: 3, mode: currentMode,
        spot: document.getElementById('currentSpot').value,
        weather: document.getElementById('currentWeather').value,
        bait: document.getElementById('currentBait').value,
        target: document.getElementById('targetFishName').value,
        isCatchAll: document.getElementById('isCatchAll').checked,
        isVariableMode: document.getElementById('isVariableMode').checked,
        macroLimitTime: document.getElementById('macroLimitTime').value,

        slapFish: document.getElementById('manualSurfaceSlap').value,
        isChum: document.getElementById('manualChum').value === 'yes',
        lureType: document.getElementById('lureType').value,
        lureCount: document.getElementById('lureCount').value,
        lureStep1: document.getElementById('lureStep1').value,
        lureStep2: document.getElementById('lureStep2').value,
        lureStep3: document.getElementById('lureStep3').value,

        stratA: {
            lureType: document.getElementById('stratALure').value,
            quit: document.getElementById('stratAQuit').value,
            macroLimit: document.getElementById('stratAMacroLimit').value,
            preset: document.getElementById('stratAPreset').value,
            slap: document.getElementById('stratASlap').value,
            chum: document.getElementById('stratAChum').value
        },
        stratB: {
            lureType: document.getElementById('stratBLure').value,
            quit: document.getElementById('stratBQuit').value,
            macroLimit: document.getElementById('stratBMacroLimit').value,
            preset: document.getElementById('stratBPreset').value,
            slap: document.getElementById('stratBSlap').value,
            chum: document.getElementById('stratBChum').value
        }
    };

    // Optimizer-specific fields
    if (currentMode === 'optimizer') {
        state.opt = {
            time: document.getElementById('opt-window-time').value,
            gp: document.getElementById('opt-initial-gp').value,
            saljak: document.getElementById('opt-saljak-count').value,
            setA: {
                lure: document.getElementById('optALure').value,
                preset: document.getElementById('optAPreset').value,
                slap: document.getElementById('optASlap').value,
                chum: document.getElementById('optAChum').value
            },
            setB: {
                lure: document.getElementById('optBLure').value,
                preset: document.getElementById('optBPreset').value,
                slap: document.getElementById('optBSlap').value,
                chum: document.getElementById('optBChum').value
            }
        };
    }

    try {
        const jsonStr = JSON.stringify(state);
        const base64 = btoa(unescape(encodeURIComponent(jsonStr)));
        const safeBase64 = encodeURIComponent(base64);
        const url = `${window.location.origin}/share.html?data=${safeBase64}`;
        console.log("Generated URL:", url);
        return url;
    } catch (e) {
        console.error("Serialization failed:", e);
        return null;
    }
}

function setupEventListeners() {
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

            // Toggle Result Containers
            const resManStrat = document.getElementById('result-content');
            const resOpt = document.getElementById('opt-results-container');
            resManStrat.style.display = 'block';
            resOpt.style.display = 'none';

            // 詳細パネルの全デバッグ要素をクリア（前モードの表示残留を防止）
            const debugIds = ['debug-content-wrapper', 'debug-constants', 'debug-scenario', 'debug-weights', 'debug-calc-target', 'debug-calc-expect'];
            debugIds.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });

            updateSimulation();
        });
    });

    document.getElementById('currentExpansion').addEventListener('change', () => {
        updateAreaOptions(masterDB);
        updateSpotDependents(masterDB, updateSimulation);
    });
    document.getElementById('currentArea').addEventListener('change', () => {
        updateSpotOptions(masterDB);
        updateSpotDependents(masterDB, updateSimulation);
    });
    document.getElementById('currentSpot').addEventListener('change', () => updateSpotDependents(masterDB, updateSimulation));

    ['currentWeather', 'currentBait', 'targetFishName', 'manualSurfaceSlap', 'macroLimitTime'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', updateSimulation);
    });

    document.getElementById('isVariableMode').addEventListener('change', updateSimulation);

    document.getElementById('isCatchAll').addEventListener('change', (e) => {
        const disabled = e.target.checked;
        const slapOpts = ['manualSurfaceSlap', 'stratASlap', 'stratBSlap', 'optASlap', 'optBSlap'];
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

    ['stratALure', 'stratAQuit', 'stratAMacroLimit', 'stratAPreset', 'stratASlap', 'stratAChum',
        'stratBLure', 'stratBQuit', 'stratBMacroLimit', 'stratBPreset', 'stratBSlap', 'stratBChum'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => {
                if (id.includes('Lure')) updateStrategyPresetsFilter(masterDB);
                updateSimulation();
            });
        });

    // --- Time Limit Mode ---
    // Manual mode: checkbox toggle
    const manualTLCheck = document.getElementById('manualTimeLimitEnabled');
    if (manualTLCheck) {
        manualTLCheck.addEventListener('change', () => {
            document.getElementById('manualTimeLimitContainer').style.display = manualTLCheck.checked ? 'block' : 'none';
            updateSimulation();
        });
    }
    const manualTLInput = document.getElementById('manualTimeLimit');
    if (manualTLInput) manualTLInput.addEventListener('input', updateSimulation);

    // Strategy mode: A/B sync + toggle
    ['stratATimeLimitEnabled', 'stratBTimeLimitEnabled'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => {
            // Sync: checking one checks both
            const otherCheckId = id === 'stratATimeLimitEnabled' ? 'stratBTimeLimitEnabled' : 'stratATimeLimitEnabled';
            const otherCheck = document.getElementById(otherCheckId);
            if (otherCheck) otherCheck.checked = el.checked;
            document.getElementById('stratATimeLimitContainer').style.display = el.checked ? 'block' : 'none';
            document.getElementById('stratBTimeLimitContainer').style.display = el.checked ? 'block' : 'none';
            updateSimulation();
        });
    });
    ['stratATimeLimit', 'stratBTimeLimit'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateSimulation);
    });

    // Optimizer tab UI elements → reactive recalculation
    ['opt-window-time', 'opt-initial-gp', 'opt-saljak-count',
        'optALure', 'optAPreset', 'optASlap', 'optAChum',
        'optBLure', 'optBPreset', 'optBSlap', 'optBChum'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const evType = el.tagName === 'INPUT' ? 'input' : 'change';
                el.addEventListener(evType, updateSimulation);
            }
        });
}


function updateSimulation() {
    if (!masterDB) return;
    const spotVal = document.getElementById('currentSpot').value;
    if (!spotVal || !masterDB.spots[spotVal]) return;
    const spotData = masterDB.spots[spotVal];
    if (spotData.fish_list.length === 0) return;

    // 変数モードの有効/無効制御:
    // - ターゲット自体が隠し魚の場合 → 重みに依存しないため変数モード不可
    // - 総合戦略評価モード → 未対応のため無効化
    const vmCheck = document.getElementById('isVariableMode');
    const targetFishName = document.getElementById('targetFishName').value;
    const targetIsHidden = masterDB.fish[targetFishName]?.is_hidden;
    if (targetIsHidden || currentMode === 'optimizer') {
        vmCheck.disabled = true;
        vmCheck.checked = false;
    } else {
        vmCheck.disabled = false;
    }

    const config = {
        spot: spotVal,
        weather: document.getElementById('currentWeather').value,
        bait: document.getElementById('currentBait').value,
        target: document.getElementById('targetFishName').value,
        isCatchAll: document.getElementById('isCatchAll').checked,
        isVariableMode: vmCheck.checked,
        lureType: document.getElementById('lureType').value,
        quitIfNoDisc: false,
        macroLimitTime: parseFloat(document.getElementById('macroLimitTime').value) || 0,
        // Time Limit Mode
        manualTimeLimitEnabled: document.getElementById('manualTimeLimitEnabled')?.checked || false,
        manualTimeLimit: parseFloat(document.getElementById('manualTimeLimit')?.value) || 0,
        stratTimeLimitEnabled: document.getElementById('stratATimeLimitEnabled')?.checked || false,
        stratATimeLimit: parseFloat(document.getElementById('stratATimeLimit')?.value) || 0,
        stratBTimeLimit: parseFloat(document.getElementById('stratBTimeLimit')?.value) || 0
    };

    if (currentMode === 'manual') {
        if (config.isVariableMode) runManualModeVariable(config);
        else runManualMode(config);
    }
    else if (currentMode === 'optimizer') {
        runOptimizationV2(masterDB, probabilityMap, config.isVariableMode);
    }
    else {
        if (config.isVariableMode) runStrategyModeVariable(config);
        else runStrategyMode(config);
    }
}

function runManualMode(config) {
    const isChum = document.getElementById('manualChum').value === 'yes';
    const slapFish = document.getElementById('manualSurfaceSlap').value;

    // Construct IDs
    const steps = [];
    if (config.lureType !== 'none') {
        const c = parseInt(document.getElementById('lureCount').value);
        for (let i = 1; i <= c; i++) steps.push(document.getElementById(`lureStep${i}`).value);
    }

    // Validation
    let discCount = steps.filter(s => s === 'disc').length;
    const errorMsgEl = document.getElementById('lure-error-msg');
    if (discCount > 1) {
        if (errorMsgEl) errorMsgEl.style.display = 'block';
        return;
    } else {
        if (errorMsgEl) errorMsgEl.style.display = 'none';
    }

    const scenarioId = constructScenarioId(config.lureType, document.getElementById('lureCount').value, steps);

    const stats = calculateScenarioStats(masterDB, probabilityMap, config, scenarioId, isChum, slapFish);
    renderManualModeResult(stats, config, isChum, slapFish);
    renderDebugDetails(stats, config, isChum, scenarioId);
}

function runStrategyMode(config) {
    const sets = ['A', 'B'];
    const results = {};
    sets.forEach(set => {
        const setConfig = {
            lureType: document.getElementById(`strat${set}Lure`).value,
            quitIfNoDisc: document.getElementById(`strat${set}Quit`).value === 'yes',
            macroLimitTime: document.getElementById(`strat${set}MacroLimit`).value !== '' ? parseFloat(document.getElementById(`strat${set}MacroLimit`).value) : undefined,
            slapFish: document.getElementById(`strat${set}Slap`).value,
            isChum: document.getElementById(`strat${set}Chum`).value === 'yes',
            presetId: document.getElementById(`strat${set}Preset`).value
        };
        const preset = masterDB.strategy_presets.find(p => p.id === setConfig.presetId);
        results[set] = calculateStrategySet(masterDB, probabilityMap, config, setConfig, preset);
    });
    renderStrategyComparison(results.A, results.B, config);
}


// --- Variable Mode Implementation ---
async function runManualModeVariable(config) {
    const resultContent = document.getElementById('result-content');

    let scenarioId, isChum, slapFish;
    let validationSteps = [];

    if (config.isChum !== undefined) {
        // Share Mode
        isChum = config.isChum;
        slapFish = config.slapFish;
        if (config.lureType !== 'none') {
            const count = parseInt(config.lureCount);
            for (let i = 1; i <= count; i++) validationSteps.push(config[`lureStep${i}`]);
            scenarioId = constructScenarioId(config.lureType, count, validationSteps);
        } else {
            scenarioId = 'none_0';
        }
    } else {
        // DOM Mode
        isChum = document.getElementById('manualChum').value === 'yes';
        slapFish = document.getElementById('manualSurfaceSlap').value;
        if (config.lureType !== 'none') {
            const c = parseInt(document.getElementById('lureCount').value);
            for (let i = 1; i <= c; i++) validationSteps.push(document.getElementById(`lureStep${i}`).value);
        }
        scenarioId = constructScenarioId(config.lureType, document.getElementById('lureCount').value, validationSteps);
    }

    // Validation
    let discCount = validationSteps.filter(s => s === 'disc').length;
    const errorMsgEl = document.getElementById('lure-error-msg');
    if (discCount > 1) {
        if (errorMsgEl) errorMsgEl.style.display = 'block';
        return;
    } else {
        if (errorMsgEl) errorMsgEl.style.display = 'none';
    }

    // Run with overrideP=100 (dummy base weight) to extract structural info
    const stats = calculateScenarioStats(masterDB, probabilityMap, config, scenarioId, isChum, slapFish, 100);

    if (stats.error) {
        resultContent.innerHTML = `<div style="color:red">Error: ${stats.error}</div>`;
        return;
    }

    const tStat = stats.allFishStats.find(s => s.isTarget);
    if (!tStat) {
        resultContent.innerHTML = `<div style="color:red">Error: Target stats missing</div>`;
        return;
    }

    // --- Extract constants for p-expression ---
    // W_others_total: sum of final weights for ALL non-target fish
    const wOthersTotal = stats.weightDetails
        .filter(d => d.name !== config.target && !d.isHidden)
        .reduce((acc, d) => acc + d.final, 0);

    const targetWD = stats.weightDetails.find(d => d.name === config.target);
    const targetM = (targetWD && targetWD.m !== '-') ? targetWD.m : 1.0;

    // R_i = w_i_final / W_others_total for each non-target fish
    const fishRatios = stats.weightDetails
        .filter(d => !d.isHidden)
        .map(d => ({
            name: d.name,
            ratio: (d.name === config.target) ? null : (wOthersTotal > 0 ? d.final / wOthersTotal : 0),
            isTarget: d.name === config.target,
            baseW: d.base,
            m: d.m,
            finalW: d.final
        }));

    // S = sum(R_i * cycleTime_i) for avg cycle formula: p*Ct + pHidden*C_hidden + (1-p-pHidden)*S
    let S = 0;
    stats.allFishStats.filter(s => !s.isTarget).forEach(o => {
        const fr = fishRatios.find(r => r.name === o.name);
        if (fr && fr.ratio !== null) S += fr.ratio * o.cycleTime;
    });

    let C_hidden = 0;
    if (stats.hiddenFishName) {
        const hStat = stats.allFishStats.find(s => s.name === stats.hiddenFishName);
        if (hStat) C_hidden = hStat.cycleTime;
    }

    const Ct = tStat.cycleTime;
    const targetHook = tStat.hookTime;
    const p_h = stats.pHidden || 0;

    // Expected Time E = (E[Cycle] - p*Hook) / p
    // E[Cycle] = p*Ct + p_h*C_hidden + (1 - p - p_h)*S
    // E = (p(Ct - Hook) + p_h*C_hidden + (1 - p_h)*S - p*S) / p
    // E = (Ct - Hook - S) + (p_h*C_hidden + (1 - p_h)*S) / p
    // A_prime = Ct - Hook - S
    // B_prime = p_h*C_hidden + S*(1 - p_h)
    
    const A = Ct - targetHook - S;
    const B = p_h * C_hidden + S * (1 - p_h);

    const K = stats.weightDetails
        .filter(d => d.name !== config.target && !d.isHidden)
        .reduce((acc, d) => acc + d.base, 0);

    // GP cost per cycle (fixed, independent of p)
    const gpCostPerCycle = stats.gpStats.cost.total;
    const gpCostDetails = stats.gpStats.cost.details;
    
    const H = (tStat.originalHitProb > 0) ? (tStat.hitRate / tStat.originalHitProb) : 0;
    const C_val = (K > 0 && targetM > 0) ? wOthersTotal / (targetM * K) : 0;
    const F_100 = (targetM > 0) ? (100 * targetM) / ((100 * targetM) + wOthersTotal) : 0;
    const D_val = (F_100 > 0) ? (tStat.hitRate / F_100) : 0;

    // Attach variableInfo to stats
    stats.variableInfo = {
        A, B, S, H, C: C_val, D: D_val,
        targetM,
        wOthersTotal,
        fishRatios,
        gpCostPerCycle,
        gpCostDetails,
        targetCycleTime: tStat.cycleTime,
        pHidden: stats.pHidden,
        hiddenFishName: stats.hiddenFishName,
        C_hidden: C_hidden
    };

    // Render using the dedicated variable-mode renderers
    renderVariableManualResult(stats, config, isChum, slapFish);
    renderVariableDebugDetails(stats, config, isChum, scenarioId);
}

async function runStrategyModeVariable(config) {
    const sets = ['A', 'B'];
    const results = {};

    sets.forEach(set => {
        const setConfig = {
            lureType: document.getElementById(`strat${set}Lure`).value,
            quitIfNoDisc: document.getElementById(`strat${set}Quit`).value === 'yes',
            macroLimitTime: document.getElementById(`strat${set}MacroLimit`).value !== '' ? parseFloat(document.getElementById(`strat${set}MacroLimit`).value) : undefined,
            slapFish: document.getElementById(`strat${set}Slap`).value,
            isChum: document.getElementById(`strat${set}Chum`).value === 'yes',
            presetId: document.getElementById(`strat${set}Preset`).value
        };
        const preset = masterDB.strategy_presets.find(p => p.id === setConfig.presetId);

        if (!preset) {
            results[set] = { error: 'プリセット未選択', name: '(未選択)', description: '' };
            return;
        }

        // Run normal calculateStrategySet with overrideP=100 to get structure
        const stratResult = calculateStrategySet(masterDB, probabilityMap, config, setConfig, preset, 100);

        if (stratResult.error) {
            results[set] = stratResult;
            return;
        }

        // For each scenario, calculate A_i and B_i
        const targetInfo = masterDB.fish[config.target];
        const tHook = targetInfo ? targetInfo.hook_time : 0;

        let weightedA = 0, weightedB = 0, weightedH = 0;
        let weightedPHidden = 0;
        let hiddenFishName = null;
        const enrichedScenarios = [];

        for (const scn of stratResult.scenarios) {
            // Re-run individual scenario to get full stats
            const scenarioConfig = { ...config, lureType: setConfig.lureType, quitIfNoDisc: setConfig.quitIfNoDisc };
            const stats = calculateScenarioStats(masterDB, probabilityMap, scenarioConfig, scn.id, setConfig.isChum, setConfig.slapFish, 100);

            if (stats.error) {
                enrichedScenarios.push({ ...scn, A: 0, B: 0 });
                continue;
            }

            const tStat = stats.allFishStats.find(s => s.isTarget);
            if (!tStat) {
                enrichedScenarios.push({ ...scn, A: 0, B: 0 });
                continue;
            }

            const wOthers = stats.weightDetails
                .filter(d => d.name !== config.target && !d.isHidden)
                .reduce((acc, d) => acc + d.final, 0);
            
            let S_i = 0;
            stats.allFishStats.filter(s => !s.isTarget).forEach(o => {
                const wd = stats.weightDetails.find(d => d.name === o.name);
                if (wd && !wd.isHidden) {
                    const ratio = wOthers > 0 ? wd.final / wOthers : 0;
                    S_i += ratio * o.cycleTime;
                }
            });

            let C_hidden = 0;
            if (stats.hiddenFishName) {
                const hStat = stats.allFishStats.find(s => s.name === stats.hiddenFishName);
                if (hStat) C_hidden = hStat.cycleTime;
            }

            const p_h = stats.pHidden || 0;
            const A_i = tStat.cycleTime - tStat.hookTime - S_i;
            const B_i = p_h * C_hidden + S_i * (1 - p_h);

            const K = stats.weightDetails
                .filter(d => d.name !== config.target && !d.isHidden)
                .reduce((acc, d) => acc + d.base, 0);
            const targetWD = stats.weightDetails.find(d => d.name === config.target);
            const M = (targetWD && targetWD.m !== '-') ? targetWD.m : 1.0;
            const C_i = (K > 0 && M > 0) ? wOthers / (M * K) : 0;
            const F_100 = (M > 0) ? (100 * M) / ((100 * M) + wOthers) : 0;
            const D_i = (F_100 > 0) ? (tStat.hitRate / F_100) : 0;
            const H_i = (tStat.originalHitProb > 0) ? (tStat.hitRate / tStat.originalHitProb) : 0;

            weightedA += scn.prob * A_i;
            weightedB += scn.prob * B_i;
            weightedH += scn.prob * H_i;
            weightedPHidden += scn.prob * (stats.pHidden || 0);
            if (stats.hiddenFishName) hiddenFishName = stats.hiddenFishName;

            enrichedScenarios.push({ ...scn, A: A_i, B: B_i, H: H_i, C: C_i, D: D_i });
        }

        // Strategy-level A and B
        const tp = stratResult.totalProb;
        const A_avg = tp > 0 ? weightedA / tp : 0;
        const B_avg = tp > 0 ? weightedB / tp : 0;
        const H_avg = tp > 0 ? weightedH / tp : 0;

        results[set] = {
            ...stratResult,
            scenarios: enrichedScenarios,
            variableInfo: {
                A: A_avg, B: B_avg, H: H_avg,
                pHidden: tp > 0 ? weightedPHidden / tp : 0,
                hiddenFishName
            }
        };
    });

    renderVariableStrategyComparison(results.A, results.B, config);
}

init();
