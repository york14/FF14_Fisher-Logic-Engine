/**
 * FLE Simulator メインロジック v1.5
 * 修正11：デバッグビューの重み表において、隠し魚を常に合計行の下に表示するよう調整。
 */

const GDS = {
    D_CAST: 1.0, D_LURE: 2.5, D_BLK: 2.5, D_CHUM: 1.0, D_REST: 2.0, C_CHUM: 0.6,
    M_N1: 1.5, M_N2: 2.0, M_N3: 6.0
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
const elLayout = document.getElementById('main-layout');

/**
 * リサイズ機能の初期化
 */
function initResizers() {
    const elResizerLeft = document.getElementById('resizer-left');
    const elResizerRight = document.getElementById('resizer-right');
    let isDragging = false;
    let currentResizer = null;

    const onMouseDown = (e) => {
        isDragging = true;
        currentResizer = e.target;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    const onMouseMove = (e) => {
        if (!isDragging) return;
        const containerRect = elLayout.getBoundingClientRect();
        const relativeX = e.clientX - containerRect.left;
        const style = window.getComputedStyle(elLayout);
        const columns = style.getPropertyValue('grid-template-columns').split(' ');
        const barWidth = 8;

        if (currentResizer === elResizerLeft) {
            const newWidth = Math.max(200, Math.min(500, relativeX));
            columns[0] = `${newWidth}px`;
        } else if (currentResizer === elResizerRight) {
            const leftWidth = parseInt(columns[0]);
            const newMiddleWidth = Math.max(300, Math.min(800, relativeX - leftWidth - barWidth));
            columns[2] = `${newMiddleWidth}px`;
        }
        elLayout.style.gridTemplateColumns = columns.join(' ');
    };

    const onMouseUp = () => {
        if (!isDragging) return;
        isDragging = false;
        currentResizer = null;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
    };

    elResizerLeft.addEventListener('mousedown', onMouseDown);
    elResizerRight.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

initResizers();

function toggleDebugView() {
    const elPanel = document.getElementById('debug-panel');
    const elMsg = document.getElementById('debug-toggle-msg');
    const isCollapsed = elLayout.classList.contains('debug-collapsed');
    
    if (isCollapsed) {
        elLayout.classList.remove('debug-collapsed');
        elPanel.classList.remove('collapsed');
        elMsg.textContent = "(クリックで閉じる)";
    } else {
        elLayout.classList.add('debug-collapsed');
        elPanel.classList.add('collapsed');
        elMsg.textContent = "(展開)";
    }
}

document.getElementById('json-upload').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (fileEvent) => {
        DB = JSON.parse(fileEvent.target.result);
        document.getElementById('db-status').textContent = "ONLINE";
        document.getElementById('db-status').style.color = "#22c55e";
        initSpot();
    };
    reader.readAsText(file);
});

function initSpot() {
    elSpot.innerHTML = ''; 
    const spotNames = Object.keys(DB.spots);
    spotNames.forEach(name => {
        const elOption = document.createElement('option');
        elOption.value = name; elOption.textContent = name; elSpot.appendChild(elOption);
    });
    if (spotNames.length > 0) {
        elSpot.dispatchEvent(new Event('change'));
    }
}

elSpot.addEventListener('change', () => {
    const spotData = DB.spots[elSpot.value];
    if (!spotData) return;
    fillSelector(elWeather, spotData.weather);
    fillSelector(elBait, spotData.bait);
    fillSelector(elTarget, spotData.fish);
    const slappableFish = spotData.fish.filter(fishName => DB.fish[fishName] && DB.fish[fishName].can_slap);
    fillSelector(elSlap, slappableFish, "なし");
    genLureStepsUI(); 
    calculate(); 
});

function fillSelector(el, itemList, defaultLabel) {
    el.innerHTML = defaultLabel ? `<option value="なし">${defaultLabel}</option>` : '';
    itemList.forEach(item => { 
        const elOption = document.createElement('option'); 
        elOption.value = item; elOption.textContent = item; el.appendChild(elOption); 
    });
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
    genLureStepsUI();
});
elLureN.addEventListener('change', genLureStepsUI);

function genLureStepsUI() {
    if (!DB || !elSpot.value) return;
    const lureType = elLure.value;
    elLureSteps.innerHTML = ''; 
    if (lureType === "なし") return;
    const hasHiddenFish = DB.spots[elSpot.value].fish.some(fishName => DB.fish[fishName] && DB.fish[fishName].is_hidden);
    const lureCount = parseInt(elLureN.value);
    for(let i = 1; i <= lureCount; i++) {
        const elDiv = document.createElement('div');
        elDiv.className = 'input-group';
        let optionsHtml = `<option value="なし">なし</option>`;
        if (hasHiddenFish) optionsHtml += `<option value="発見">発見</option>`;
        optionsHtml += `<option value="型確定">型確定</option>`;
        elDiv.innerHTML = `<label>ルアー使用${i} 結果</label><select class="l-step">${optionsHtml}</select>`;
        elLureSteps.appendChild(elDiv);
        elDiv.querySelector('select').addEventListener('change', calculate);
    }
    calculate();
}

function getDiscoveredGuaranteeIndex(discoveryStep, currentStep) {
    if (discoveryStep === 1) return (currentStep === 2) ? 0 : 1;
    if (discoveryStep === 2) return 2;
    return -1;
}

[elWeather, elBait, elTarget, elSlap, elChum, elLureN].forEach(el => el.addEventListener('change', calculate));

function calculate() {
    if (!DB || !elSpot.value) return;
    const currentSpot = elSpot.value;
    const currentWeather = elWeather.value;
    const currentBait = elBait.value;
    const targetFishName = elTarget.value;
    const tradeSlapFish = elSlap.value;
    const lureType = elLure.value;
    const lureCount = (lureType === "なし") ? 0 : parseInt(elLureN.value);

    if (!currentWeather || !currentBait) {
        renderSimpleFishList(currentSpot);
        return;
    }

    const spotData = DB.spots[currentSpot];
    const hiddenFishName = spotData.fish.find(name => DB.fish[name] && DB.fish[name].is_hidden) || "なし";
    const debugData = { weightDetails: [], sumWeight: 0, pHidden: 0, hKey: "", targetTrace: null, error: null, scenarioChain: [], hiddenFishName };
    
    let discoveryStep = 0, discoveryCount = 0, isGuaranteed = false, scenarioParts = [], discoveredAnywhere = false;

    if (lureCount > 0) {
        const elStepSelects = document.querySelectorAll('.l-step');
        elStepSelects.forEach((elSelect, index) => {
            const stepValue = elSelect.value;
            const stepNumber = index + 1;
            if (stepValue === "発見") { 
                if (discoveryStep === 0) discoveryStep = stepNumber; 
                discoveryCount++; scenarioParts.push(`発見${stepNumber}`); discoveredAnywhere = true; 
            }
            else if (stepValue === "型確定") { scenarioParts.push(`型確定${discoveredAnywhere ? "(発見済)" : ""}${stepNumber}`); }
            else { scenarioParts.push("なし"); }
            if (index === lureCount - 1) { isGuaranteed = (stepValue === "型確定"); }
        });
        if (discoveryCount > 1) { debugData.error = "制約エラー: 発見は1サイクルに1回しか発生しません。"; showCalculationError(debugData.error); return; }
    }

    const scenarioText = scenarioParts.join("→");
    const probabilityKey = `${currentSpot}|${currentWeather}|${currentBait}|${hiddenFishName}|${tradeSlapFish}|${lureType}`;
    const probData = DB.probabilities[probabilityKey];

    let scenarioProbability = 0;
    if (lureType === "なし") { scenarioProbability = null; } 
    else {
        if (!probData) { debugData.error = `データ未登録 [${probabilityKey}]`; showCalculationError(debugData.error); return; }
        scenarioProbability = 1.0;
        let found = false, foundAt = 0;
        const elStepSelects = document.querySelectorAll('.l-step');
        for (let index = 0; index < lureCount; index++) {
            const stepValue = elStepSelects[index]?.value || "なし";
            const currentStepNumber = index + 1;
            let stepProbability = 0;
            if (!found) {
                const discoveryRate = probData.discovery[index], guaranteeRate = probData.guarantee[index];
                if (discoveryRate === null || guaranteeRate === null) { debugData.error = `確率データ欠損(ステップ${currentStepNumber})`; showCalculationError(debugData.error); return; }
                if (stepValue === "発見") { stepProbability = discoveryRate; found = true; foundAt = currentStepNumber; }
                else if (stepValue === "型確定") { stepProbability = (1 - discoveryRate) * guaranteeRate; }
                else { stepProbability = (1 - discoveryRate) * (1 - guaranteeRate); }
            } else {
                const guaranteeIndex = getDiscoveredGuaranteeIndex(foundAt, currentStepNumber);
                if (guaranteeIndex === -1) { debugData.error = `インデックス異常(ステップ${currentStepNumber})`; showCalculationError(debugData.error); return; }
                const discoveredGuaranteeRate = probData.discovered_guarantee[guaranteeIndex];
                if (discoveredGuaranteeRate === null) { debugData.error = `発見済データ欠損(ステップ${currentStepNumber})`; showCalculationError(debugData.error); return; }
                if (stepValue === "型確定") stepProbability = discoveredGuaranteeRate; else stepProbability = 1 - discoveredGuaranteeRate;
            }
            scenarioProbability *= stepProbability;
            debugData.scenarioChain.push(stepProbability);
        }
    }

    debugData.hKey = discoveryStep > 0 ? `p${discoveryStep}_${lureCount}_${isGuaranteed ? 'yes' : 'no'}` : "通常抽選(未発見)";
    if (discoveryStep > 0) {
        if (!probData) { debugData.error = `無効な発見フラグ。`; showCalculationError(debugData.error); return; }
        const hiddenHitRate = probData.hidden_hit_rates[debugData.hKey];
        if (hiddenHitRate === null) { debugData.error = `隠しヒット率データ欠損 [${debugData.hKey}]`; showCalculationError(debugData.error); return; }
        debugData.pHidden = hiddenHitRate;
    } else { debugData.pHidden = 0; }

    const M_MAP = { 0: 1.0, 1: GDS.M_N1, 2: GDS.M_N2, 3: GDS.M_N3 };
    const lureJawsType = (lureType === "アンビシャスルアー") ? "large_jaws" : (lureType === "モデストルアー" ? "small_jaws" : null);
    const spotWeights = DB.weights[`${currentSpot}|${currentWeather}|${currentBait}`] || [];

    for (const fishWeightData of spotWeights) {
        const fishMeta = DB.fish[fishWeightData.name];
        if (!fishMeta) { debugData.error = `魚種マスタ未登録: [${fishWeightData.name}]`; showCalculationError(debugData.error); return; }
        
        const isHidden = (fishWeightData.name === hiddenFishName);

        if (!isHidden) {
            const isLureMatch = (fishMeta.type === lureJawsType);
            let mMultiplier = isLureMatch ? M_MAP[lureCount] : 1.0; 
            if (isGuaranteed && !isLureMatch) mMultiplier = 0; 
            if (fishWeightData.name === tradeSlapFish) mMultiplier = 0; 
            const finalWeight = fishWeightData.w * mMultiplier;
            
            debugData.sumWeight += finalWeight;
            debugData.weightDetails.push({ 
                name: fishWeightData.name, baseWeight: fishWeightData.w, 
                m: mMultiplier, finalWeight: finalWeight, isHidden: false 
            });
        } else {
            debugData.weightDetails.push({ 
                name: fishWeightData.name, baseWeight: 0, 
                m: 0, finalWeight: 0, isHidden: true 
            });
        }
    }

    const preActionDuration = elChum.checked ? GDS.D_CHUM : 0; 
    const resultList = spotWeights.map(fishWeightData => {
        const fishMeta = DB.fish[fishWeightData.name];
        if (!fishMeta) return null; 
        
        const isHidden = (fishWeightData.name === hiddenFishName);
        let hitProbability = 0;
        
        if (isHidden) { 
            hitProbability = debugData.pHidden; 
        } else {
            const weightDetail = debugData.weightDetails.find(detail => detail.name === fishWeightData.name);
            hitProbability = (debugData.sumWeight > 0 && weightDetail) ? (weightDetail.finalWeight / debugData.sumWeight) * (1 - debugData.pHidden) : 0;
        }

        const correctedBiteTime = fishWeightData.t * (elChum.checked ? GDS.C_CHUM : 1.0);
        const minLureWaitTime = GDS.D_CAST + (lureCount * GDS.D_LURE) + GDS.D_BLK;
        const effectiveWaitTime = Math.max(correctedBiteTime, minLureWaitTime);
        const endActionDuration = elCatch.checked ? fishMeta.hook_time : GDS.D_REST;
        const totalCycleTime = preActionDuration + GDS.D_CAST + effectiveWaitTime + endActionDuration;

        const resultItem = { 
            name: fishWeightData.name, vibe: fishMeta.vibration, prob: hitProbability, 
            baseBiteTime: fishWeightData.t, correctedBiteTime, minLureWaitTime, 
            effectiveWaitTime, endActionDuration, totalCycleTime 
        };
        if (fishWeightData.name === targetFishName) debugData.targetTrace = resultItem;
        return resultItem;
    }).filter(item => item !== null);

    let averageCycleTime = 0;
    resultList.forEach(item => { averageCycleTime += item.prob * item.totalCycleTime; });
    const targetResult = resultList.find(item => item.name === targetFishName);
    let hitExpectationSeconds = (averageCycleTime > 0 && targetResult && targetResult.prob > 0) ? (averageCycleTime - (targetResult.prob * targetResult.endActionDuration)) / targetResult.prob : 0;

    updateUI(resultList, hitExpectationSeconds, averageCycleTime, targetFishName, currentSpot, scenarioText, scenarioProbability);
    updateDebugView(debugData, preActionDuration, lureCount, hitExpectationSeconds, averageCycleTime, scenarioProbability);
}

function showCalculationError(message) {
    document.getElementById('debug-scenario').innerHTML = `<span style="color:var(--accent-red)">${message}</span>`;
    document.getElementById('debug-math').innerHTML = `<div class="math-step">計算不能</div>`;
    document.getElementById('res-efficiency').innerHTML = `- <small>秒</small>`;
    const elTableBody = document.getElementById('res-table-body');
    elTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">データがありません<br><small>${message}</small></td></tr>`;
    document.getElementById('pattern-occurrence').innerText = "";
    document.getElementById('scenario-text').innerText = "";
}

function updateUI(resultList, hitExpectationSeconds, averageCycleTime, targetFishName, currentSpotName, scenarioText, scenarioProbability) {
    const elTableBody = document.getElementById('res-table-body');
    const elFragment = document.createDocumentFragment();
    document.getElementById('res-efficiency').innerHTML = (hitExpectationSeconds > 0) ? `${hitExpectationSeconds.toFixed(1)} <small>秒</small>` : `- <small>秒</small>`;
    document.getElementById('res-cycle').innerText = averageCycleTime.toFixed(1);
    const spotFishOrder = DB.spots[currentSpotName].fish;
    spotFishOrder.forEach(name => {
        const item = resultList.find(res => res.name === name);
        if (!item) return;
        const elTr = document.createElement('tr');
        if (item.name === targetFishName) { elTr.style.backgroundColor = "rgba(59, 130, 246, 0.2)"; elTr.style.fontWeight = "bold"; }
        const waitDisplay = (item.prob > 0) ? `${item.correctedBiteTime.toFixed(1)}s` : "-";
        const cycleDisplay = (item.prob > 0) ? `${item.totalCycleTime.toFixed(1)}s` : "-";
        elTr.innerHTML = `<td>${name}</td><td>${item.vibe}</td><td>${(item.prob * 100).toFixed(1)}%</td><td>${waitDisplay}</td><td>${cycleDisplay}</td>`;
        elFragment.appendChild(elTr);
    });
    elTableBody.innerHTML = ''; elTableBody.appendChild(elFragment);
    document.getElementById('scenario-text').innerText = scenarioText ? `シナリオ: ${scenarioText}` : "";
    const elPatternOccurrence = document.getElementById('pattern-occurrence');
    elPatternOccurrence.innerText = (scenarioProbability === null) ? `ルアー効果シナリオ発生確率: -%` : `ルアー効果シナリオ発生確率: ${(scenarioProbability * 100).toFixed(2)}%`;
}

function renderSimpleFishList(spotName) {
    const fishNames = DB.spots[spotName].fish;
    const elTableBody = document.getElementById('res-table-body');
    const elFragment = document.createDocumentFragment();
    fishNames.forEach(name => {
        const meta = DB.fish[name];
        const elTr = document.createElement('tr');
        elTr.innerHTML = `<td>${name}</td><td>${meta ? meta.vibration : '--'}</td><td>--%</td><td>--s</td><td>--s</td>`;
        elFragment.appendChild(elTr);
    });
    elTableBody.innerHTML = ''; elTableBody.appendChild(elFragment);
}

/**
 * デバッグビューの更新
 * 【修正】表示時のみ隠し魚を特別扱いし、合計行の下に強制配置する。
 */
function updateDebugView(debugData, preActionDuration, lureCount, efficiencyValue, averageCycleTime, scenarioProbability) {
    if (debugData.error) return;
    document.getElementById('debug-constants').innerHTML = `D_Cast:${GDS.D_CAST}s | D_Lure:${GDS.D_LURE}s | D_Blk:${GDS.D_BLK}s | C_Chum:${GDS.C_CHUM}x`;
    
    let scenarioInfoHtml = `特定キー: <strong>${debugData.hKey}</strong><br>`;
    if (scenarioProbability !== null) scenarioInfoHtml += `シナリオ発生率 $P(Pattern)$: ${debugData.scenarioChain.map(p => p.toFixed(3)).join(' × ')} = <strong>${(scenarioProbability * 100).toFixed(2)}%</strong><br>`; 
    scenarioInfoHtml += `隠しヒット率 $P_{Hidden}$: <strong>${(debugData.pHidden * 100).toFixed(2)}%</strong>`;
    document.getElementById('debug-scenario').innerHTML = scenarioInfoHtml;

    let weightTableHtml = '<table><tr><th>魚種</th><th>基礎w</th><th>M</th><th>補正w</th><th>率</th></tr>';
    
    // 【修正】まず通常魚だけを先にループして出力
    const normalFishList = debugData.weightDetails.filter(d => !d.isHidden);
    normalFishList.forEach(detail => {
        const prob = (debugData.sumWeight > 0) ? (detail.finalWeight / debugData.sumWeight) * (1 - debugData.pHidden) : 0;
        weightTableHtml += `<tr><td>${detail.name}</td><td>${detail.baseWeight}</td><td>x${detail.m}</td><td>${detail.finalWeight.toFixed(1)}</td><td>${(prob * 100).toFixed(1)}%</td></tr>`;
    });
    
    // 通常魚合計行（ここが通常魚と隠し魚の境界線になる）
    weightTableHtml += `<tr><td colspan="3">通常魚計 $\\sum W$</td><td><strong>${debugData.sumWeight.toFixed(1)}</strong></td><td>-</td></tr>`;
    
    // 【修正】最後に隠し魚がいれば、合計行の下に出力
    const hiddenFishDetail = debugData.weightDetails.find(d => d.isHidden);
    if (hiddenFishDetail && debugData.pHidden > 0) {
        weightTableHtml += `<tr><td>${hiddenFishDetail.name} (隠し)</td><td>-</td><td>-</td><td>-</td><td><strong>${(debugData.pHidden * 100).toFixed(1)}%</strong></td></tr>`;
    }

    weightTableHtml += '</table>';
    document.getElementById('debug-weights').innerHTML = weightTableHtml;

    if (debugData.targetTrace) {
        const trace = debugData.targetTrace;
        const efficiencyDisplay = (efficiencyValue > 0) ? `${efficiencyValue.toFixed(1)}秒` : "- (釣れない)";
        document.getElementById('debug-math').innerHTML = `
            <div class="math-step">【1. 待機時間と制約】<br>補正待機 $T'_{Bite}$: ${trace.correctedBiteTime.toFixed(1)}s (基礎:${trace.baseBiteTime.toFixed(1)}s × ${elChum.checked ? GDS.C_CHUM : 1.0})<br>ルアー制約 $T_{Min}$: ${GDS.D_CAST} + (${lureCount}×${GDS.D_LURE}) + ${GDS.D_BLK} = ${trace.minLureWaitTime.toFixed(1)}s<br>実効待機 $T_{Final}$: max(${trace.correctedBiteTime.toFixed(1)}, ${trace.minLureWaitTime.toFixed(1)}) = <strong>${trace.effectiveWaitTime.toFixed(1)}s</strong></div>
            <div class="math-step">【2. 1サイクル時間】<br>$T_{Cycle}$: ${preActionDuration}(Pre) + ${GDS.D_CAST}(Cast) + ${trace.effectiveWaitTime.toFixed(1)}(Wait) + ${trace.endActionDuration}(End) = <strong>${trace.totalCycleTime.toFixed(1)}s</strong></div>
            <div class="math-step" style="color:var(--accent-green)">【3. 期待時間導出 ($E[T_{Hit}]$)】<br>失敗コスト期待値: ${averageCycleTime.toFixed(2)}s - (${trace.prob.toFixed(3)} × ${trace.endActionDuration.toFixed(1)}s) = ${(averageCycleTime - (trace.prob * trace.endActionDuration)).toFixed(2)}s<br>ヒット期待時間: ${(averageCycleTime - (trace.prob * trace.endActionDuration)).toFixed(2)} / ${trace.prob.toFixed(3)} = <strong>${efficiencyDisplay}</strong></div>
        `;
    }
}