/**
 * src/ui/main.js
 */
let fisherData = { spots: [] };

function loadData() {
    if (typeof FISHER_DATA !== 'undefined') {
        fisherData = FISHER_DATA;
    }
}

function switchView(view) {
    document.getElementById('simView').classList.toggle('hidden', view !== 'sim');
    document.getElementById('mgmtView').classList.toggle('hidden', view !== 'mgmt');
    document.getElementById('tabSim').classList.toggle('active', view === 'sim');
    document.getElementById('tabMgmt').classList.toggle('active', view === 'mgmt');
    if (view === 'mgmt') refreshJsonEditor();
}

function initSelectors() {
    const options = fisherData.spots.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    document.getElementById('spotSelect').innerHTML = options;
    document.getElementById('mgmtSpotSelect').innerHTML = options;
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
        document.getElementById('slapSelect').innerHTML = '<option value="none">なし</option>' + spot.allFish.map(f => `<option value="${f}">${f}</option>`).join('');
        document.getElementById('targetSelect').innerHTML = spot.allFish.map(f => `<option value="${f}">${f}</option>`).join('');
        executeSimulation();
    } else {
        refreshJsonEditor();
    }
}

function refreshJsonEditor() {
    const id = document.getElementById('mgmtSpotSelect').value;
    const spot = fisherData.spots.find(s => s.id === id);
    document.getElementById('jsonEditor').value = spot ? JSON.stringify(spot, null, 2) : "";
}

function applyJsonEdit() {
    try {
        const edited = JSON.parse(document.getElementById('jsonEditor').value);
        const idx = fisherData.spots.findIndex(s => s.id === edited.id);
        if (idx !== -1) fisherData.spots[idx] = edited; else fisherData.spots.push(edited);
        initSelectors(); alert("保存しました。");
    } catch(e) { alert("JSONエラー"); }
}

function executeSimulation() {
    const spot = fisherData.spots.find(s => s.id === document.getElementById('spotSelect').value);
    if (!spot) return;

    const result = calculateSimulation({
        spot: spot,
        weather: document.getElementById('envSelect').value,
        bait: document.getElementById('baitSelect').value,
        slapTarget: document.getElementById('slapSelect').value,
        targetName: document.getElementById('targetSelect').value,
        isChum: document.getElementById('chumCheck').checked,
        mode: 'strategy3' // デフォルトで戦略3を実行
    });

    renderResult(result, document.getElementById('targetSelect').value);
}

function renderResult(result, targetName) {
    const tbody = document.querySelector('#resultTable tbody');
    tbody.innerHTML = '';
    result.rows.forEach(f => {
        const tr = document.createElement('tr');
        if (f.name === targetName) tr.className = 'target-row';
        tr.innerHTML = `<td>${f.name}${f.isHidden?' (H)':''}</td><td>${f.type}</td><td>${(f.rate*100).toFixed(1)}%</td><td>${f.waitT.toFixed(1)}s</td><td>-</td>`;
        tbody.appendChild(tr);
    });
    document.getElementById('yieldScore').innerText = `${result.yield10m} / 10min (1匹平均: ${result.timePerCatch}s)`;
}

window.onload = () => {
    loadData();
    initSelectors();
    if (fisherData.spots.length > 0) updateSpotSelections('sim');
};