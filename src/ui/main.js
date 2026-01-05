/**
 * src/ui/main.js
 */
let fisherData = { spots: [] };

function loadData() {
    if (typeof FISHER_DATA !== 'undefined') {
        fisherData = FISHER_DATA;
    }
}

// 解析モード切り替え
function updateModeUI() {
    const mode = document.getElementById('modeSelect').value;
    document.getElementById('areaModeA').classList.toggle('hidden', mode !== 'manual');
    document.getElementById('execBtn').classList.toggle('hidden', mode === 'manual');
    
    if (mode === 'manual') updateModeAUI();
    executeSimulation();
}

// モードA：1行ルアー設定UI
function updateModeAUI() {
    const type = document.getElementById('lureTypeSelect').value;
    const config = document.getElementById('lureActionConfig');
    
    if (type === 'none') {
        config.classList.add('hidden');
        executeSimulation();
        return;
    }
    
    config.classList.remove('hidden');
    const countSel = document.getElementById('lureCountSelect');
    if (countSel.options.length === 0) {
        [1,2,3].forEach(i => countSel.add(new Option(i+'回', i)));
    }
    
    const container = document.getElementById('lureResults');
    container.innerHTML = '';
    
    for (let i = 1; i <= countSel.value; i++) {
        const sel = document.createElement('select');
        sel.className = 'lure-action-result';
        sel.style.width = "75px";
        sel.innerHTML = `<option value="なし">-</option><option value="発見">発</option><option value="確定">確</option>`;
        sel.onchange = executeSimulation;
        container.appendChild(sel);
    }
    executeSimulation();
}

function displayInternalParams(spot, weather, bait, slapTarget) {
    const container = document.getElementById('internalParamsContent');
    const cond = spot.conditions.find(c => c.weather === weather && c.bait === bait);
    
    if (!cond || !cond.dynamics[slapTarget]) {
        container.innerHTML = "<div>この組み合わせのデータはありません</div>";
        return;
    }
    
    const d = cond.dynamics[slapTarget];
    const pct = (v) => (v * 100).toFixed(1) + "%";
    
    container.innerHTML = `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
            <div><strong>発見率</strong>: 1回[${pct(d.pDisc[0])}] 2回[${pct(d.pDisc[1])}] 3回[${pct(d.pDisc[2])}]</div>
            <div><strong>型確定率</strong>: 1回[${pct(d.pGuar[0])}] 2回[${pct(d.pGuar[1])}] 3回[${pct(d.pGuar[2])}]</div>
        </div>
    `;
}

function executeSimulation() {
    const spotId = document.getElementById('spotSelect').value;
    const spot = fisherData.spots.find(s => s.id === spotId);
    if (!spot) return;

    const weather = document.getElementById('envSelect').value;
    const bait = document.getElementById('baitSelect').value;
    const slapTarget = document.getElementById('slapSelect').value;

    displayInternalParams(spot, weather, bait, slapTarget);

    const params = {
        spot, weather, bait, slapTarget,
        skipMode: document.getElementById('skipSelect').value,
        targetName: document.getElementById('targetSelect').value,
        isChum: document.getElementById('chumCheck').checked,
        mode: document.getElementById('modeSelect').value
    };

    if (params.mode === 'manual') {
        const results = [];
        document.querySelectorAll('.lure-action-result').forEach(sel => results.push(sel.value));
        params.manualSequence = results;
        params.lureTargetType = document.getElementById('lureTypeSelect').value === 'ambitious' ? '大型' : '小型';
    }

    const result = calculateSimulation(params);
    renderResult(result, params.targetName);
}

function renderResult(result, targetName) {
    const tbody = document.querySelector('#resultTable tbody');
    tbody.innerHTML = '';
    result.rows.forEach(f => {
        const tr = document.createElement('tr');
        if (f.name === targetName) tr.className = 'target-row';
        tr.innerHTML = `
            <td>${f.name}${f.isHidden?' (H)':''}</td>
            <td>${f.type}</td>
            <td>${(f.rate*100).toFixed(1)}%</td>
            <td>${f.waitT.toFixed(1)}s</td>
            <td>${f.blankT.toFixed(1)}s</td>
            <td>${f.hookType}</td>
        `;
        tbody.appendChild(tr);
    });
    document.getElementById('yieldScore').innerText = `${result.yield10m} / 10分 (期待: ${result.timePerCatch}s)`;
}

function updateSpotSelections(mode) {
    const id = document.getElementById(mode === 'sim' ? 'spotSelect' : 'mgmtSpotSelect').value;
    const spot = fisherData.spots.find(s => s.id === id);
    if (!spot) return;

    if (mode === 'sim') {
        const envs = [...new Set(spot.conditions.map(c => c.weather))];
        const baits = [...new Set(spot.conditions.map(c => c.bait))];
        document.getElementById('envSelect').innerHTML = envs.map(e => `<option value="${e}">${e}</option>`).join('');
        document.getElementById('baitSelect').innerHTML = baits.map(b => `<option value="${b}">${b}</option>`).join('');
        document.getElementById('slapSelect').innerHTML = '<option value="なし">なし</option>' + spot.allFish.map(f => `<option value="${f}">${f}</option>`).join('');
        document.getElementById('targetSelect').innerHTML = spot.allFish.map(f => `<option value="${f}">${f}</option>`).join('');
        executeSimulation();
    }
}

function switchView(view) {
    document.getElementById('simView').classList.toggle('hidden', view !== 'sim');
    document.getElementById('mgmtView').classList.toggle('hidden', view !== 'mgmt');
    document.getElementById('tabSim').classList.toggle('active', view === 'sim');
    document.getElementById('tabMgmt').classList.toggle('active', view === 'mgmt');
}

window.onload = () => {
    loadData();
    const s = document.getElementById('spotSelect');
    const ms = document.getElementById('mgmtSpotSelect');
    const options = fisherData.spots.map(sp => `<option value="${sp.id}">${sp.name}</option>`).join('');
    s.innerHTML = options;
    ms.innerHTML = options;
    updateSpotSelections('sim');
};