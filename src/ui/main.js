/**
 * src/ui/main.js
 */
let fisherData = { spots: [] };

function loadData() {
    if (typeof FISHER_DATA !== 'undefined') {
        fisherData = FISHER_DATA;
    }
}

// 解析モード自体の切り替え
function updateModeUI() {
    const mode = document.getElementById('modeSelect').value;
    document.getElementById('areaModeA').classList.toggle('hidden', mode !== 'manual');
    if (mode === 'manual') updateModeAUI();
    executeSimulation();
}

// モードA内のルアー詳細設定
function updateModeAUI() {
    const type = document.getElementById('lureTypeSelect').value;
    const config = document.getElementById('lureActionConfig');
    
    if (type === 'none') {
        config.classList.add('hidden');
        executeSimulation();
        return;
    }
    
    config.classList.remove('hidden');
    const count = parseInt(document.getElementById('lureCountSelect').value);
    const container = document.getElementById('lureResults');
    container.innerHTML = '';
    
    for (let i = 1; i <= count; i++) {
        const div = document.createElement('div');
        div.style.padding = "8px";
        div.style.background = "#222";
        div.style.marginBottom = "5px";
        div.style.borderRadius = "4px";
        div.innerHTML = `
            <label style="font-size:0.7rem;">${i}回目の結果</label>
            <select class="lure-action-result" onchange="executeSimulation()">
                <option value="なし">何もなし</option>
                <option value="発見">発見成功</option>
                <option value="確定">型確定成功</option>
            </select>
        `;
        container.appendChild(div);
    }
    executeSimulation();
}

function executeSimulation() {
    const spotId = document.getElementById('spotSelect').value;
    const spot = fisherData.spots.find(s => s.id === spotId);
    if (!spot) return;

    const params = {
        spot: spot,
        weather: document.getElementById('envSelect').value,
        bait: document.getElementById('baitSelect').value,
        skipMode: document.getElementById('skipSelect').value,
        slapTarget: document.getElementById('slapSelect').value,
        targetName: document.getElementById('targetSelect').value,
        isChum: document.getElementById('chumCheck').checked,
        mode: document.getElementById('modeSelect').value
    };

    // モードAのパラメータ
    if (params.mode === 'manual') {
        const results = [];
        document.querySelectorAll('.lure-action-result').forEach(sel => results.push(sel.value));
        params.manualSequence = results;
        params.lureTargetType = document.getElementById('lureTypeSelect').value === 'ambitious' ? '大型' : '小型';
    }

    const result = calculateSimulation(params);
    renderResult(result, params.targetName);
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

function renderResult(result, targetName) {
    const tbody = document.querySelector('#resultTable tbody');
    tbody.innerHTML = '';
    result.rows.forEach(f => {
        const tr = document.createElement('tr');
        if (f.name === targetName) tr.className = 'target-row';
        tr.innerHTML = `<td>${f.name}${f.isHidden?' (H)':''}</td><td>${f.type}</td><td>${(f.rate*100).toFixed(1)}%</td><td>${f.waitT.toFixed(1)}s</td><td>${f.hookType}</td>`;
        tbody.appendChild(tr);
    });
    document.getElementById('yieldScore').innerText = `${result.yield10m} / 10min (1匹期待: ${result.timePerCatch}s)`;
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
    s.innerHTML = fisherData.spots.map(sp => `<option value="${sp.id}">${sp.name}</option>`).join('');
    updateSpotSelections('sim');
};