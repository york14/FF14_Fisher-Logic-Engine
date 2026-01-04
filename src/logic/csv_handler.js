/**
 * src/logic/csv_handler.js
 * CSV Import/Export & Parsing Logic
 */

// --- CSV Import ---
async function importCSVs() {
    const fS = document.getElementById('csvSpot').files[0];
    const fT1 = document.getElementById('csvT1').files[0];
    const fT2 = document.getElementById('csvT2').files[0];

    if (!fS || !fT1 || !fT2) return alert("3つのCSVファイルを選択してください。");

    const [tS, tT1, tT2] = await Promise.all([readText(fS), readText(fT1), readText(fT2)]);
    const newSpot = parseCsvToJSON(tS, tT1, tT2);
    
    // 上書きチェック
    const existingIdx = fisherData.spots.findIndex(s => s.name === newSpot.name);
    if (existingIdx !== -1) {
        fisherData.spots[existingIdx] = newSpot;
        alert(`既存の釣り場「${newSpot.name}」を上書き更新しました。`);
    } else {
        fisherData.spots.push(newSpot);
        alert(`新規釣り場「${newSpot.name}」を登録しました。`);
    }

    initSelectors();
    updateSpotSelections('sim');
}

function parseCsvToJSON(tS, tT1, tT2) {
    const sR = tS.split('\n').filter(r => r.trim()).map(r => r.split(','));
    const t1R = tT1.split('\n').filter(r => r.trim()).map(r => r.split(','));
    const t2R = tT2.split('\n').filter(r => r.trim()).map(r => r.split(','));

    const name = sR[1][0].trim();
    const hFish = sR[1][4]?.trim() || "";
    const allFish = sR.slice(1).map(r => r[3]?.trim()).filter(Boolean);

    const conds = {};
    t1R.slice(1).forEach(r => {
        const k = `${r[1].trim()}|${r[2].trim()}`;
        if (!conds[k]) conds[k] = { weather: r[1].trim(), bait: r[2].trim(), fishList: [], dynamics: {} };
        conds[k].fishList.push({
            name: r[3].trim(), weight: r[4].trim(), biteTime: parseFloat(r[5]) || 0,
            type: r[3].includes('ボウフィン') || r[3].includes('グルーパー') ? '大型' : '小型',
            isHidden: r[3].trim() === hFish
        });
    });

    t2R.slice(1).forEach(r => {
        const k = `${r[1].trim()}|${r[2].trim()}`;
        if (conds[k]) {
            conds[k].dynamics[r[3].trim()] = {
                pDisc: [p_conv(r[4]), p_conv(r[5]), p_conv(r[6])],
                pGuar: [p_conv(r[7]), p_conv(r[8]), p_conv(r[9])],
                pDiscGuar: { "1-2": p_conv(r[10]), "1-3": p_conv(r[11]), "2-3": p_conv(r[12]) },
                pDiscHit: { "1-1": p_conv(r[13]), "1-2": p_conv(r[14]), "1-3": p_conv(r[15]), "2-2": p_conv(r[16]), "2-3": p_conv(r[17]), "3-3": p_conv(r[18]) }
            };
        }
    });

    return { id: name, name, allFish, conditions: Object.values(conds) };
}

// Utility: 文字列(%)を小数に変換
function p_conv(v) { return parseFloat(v?.replace('%', '')) / 100 || 0; }

// Utility: 小数を文字列(%)に変換
function pct_conv(v) { return (v * 100).toFixed(2) + "%"; }

function readText(f) { return new Promise(res => { const r = new FileReader(); r.onload = e => res(e.target.result); r.readAsText(f); }); }

// --- CSV Export ---
function exportSelectedSpotCSVs() {
    const id = document.getElementById('mgmtSpotSelect').value;
    const spot = fisherData.spots.find(s => s.id === id);
    if (!spot) return;

    let sInfo = "釣り場,天気 / 時間,餌,魚種,隠し\n";
    let sT1 = "釣り場,天気 / 時間,餌,魚種,重み,待機時間\n";
    let sT2 = "釣り場,天気 / 時間,餌,トレード対象,発見率1,発見率2,発見率3,確定率1,確定率2,確定率3,発見1確定率2,発見1確定率3,発見2確定率3,発見1隠しHit率1,発見1隠しHit率2,発見1隠しHit率3,発見2隠しHit率2,発見2隠しHit率3,発見3隠しHit率3\n";

    const hFish = spot.conditions[0].fishList.find(f => f.isHidden)?.name || "";
    spot.allFish.forEach((f, i) => sInfo += `${i===0?spot.name:''},,,${f},${i===0?hFish:''}\n`);

    spot.conditions.forEach(c => {
        c.fishList.forEach(f => sT1 += `${spot.name},${c.weather},${c.bait},${f.name},${f.weight},${f.biteTime}\n`);
        Object.entries(c.dynamics).forEach(([tr, d]) => {
            sT2 += `${spot.name},${c.weather},${c.bait},${tr},${pct_conv(d.pDisc[0])},${pct_conv(d.pDisc[1])},${pct_conv(d.pDisc[2])},${pct_conv(d.pGuar[0])},${pct_conv(d.pGuar[1])},${pct_conv(d.pGuar[2])},${pct_conv(d.pDiscGuar['1-2'])},${pct_conv(d.pDiscGuar['1-3'])},${pct_conv(d.pDiscGuar['2-3'])},${pct_conv(d.pDiscHit['1-1'])},${pct_conv(d.pDiscHit['1-2'])},${pct_conv(d.pDiscHit['1-3'])},${pct_conv(d.pDiscHit['2-2'])},${pct_conv(d.pDiscHit['2-3'])},${pct_conv(d.pDiscHit['3-3'])}\n`;
        });
    });

    downloadFile(sInfo, `spot_info_${spot.id}.csv`);
    downloadFile(sT1, `table1_${spot.id}.csv`);
    downloadFile(sT2, `table2_${spot.id}.csv`);
}

// --- Master Data JS Export ---
function exportFullMasterData() {
    const code = `/** Fisher’s Logic Engine - Master Data Export */\nconst FISHER_DATA = ${JSON.stringify(fisherData, null, 2)};`;
    downloadFile(code, "fisherdata.js", "text/javascript");
    alert("fisherdata.js を出力しました。src/data/ フォルダのファイルを上書きしてください。");
}

function downloadFile(content, name, type = 'text/csv') {
    const blob = new Blob([content], { type: `${type};charset=utf-8;` });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
}