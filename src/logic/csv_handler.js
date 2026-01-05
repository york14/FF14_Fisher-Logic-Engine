/**
 * src/logic/csv_handler.js
 */
function convertToCSV(data, type) {
    let rows = [];
    if (type === 'spots') {
        rows.push("釣り場ID,天気/時間,釣り餌");
        data.spots.forEach(s => {
            s.conditions.forEach(c => rows.push(`${s.id},${c.weather},${c.bait}`));
        });
    } else if (type === 'fish') {
        rows.push("釣り場ID,天気/時間,釣り餌,魚名,重み,待機時間,型,Hidden");
        data.spots.forEach(s => {
            s.conditions.forEach(c => {
                c.fishList.forEach(f => rows.push(`${s.id},${c.weather},${c.bait},${f.name},${f.weight},${f.biteTime},${f.type},${f.isHidden}`));
            });
        });
    } else if (type === 'probs') {
        rows.push("釣り場ID,天気/時間,釣り餌,トレリリース対象,1回発見率,2回発見率,3回発見率,1回確定率,2回確定率,3回確定率");
        data.spots.forEach(s => {
            s.conditions.forEach(c => {
                Object.keys(c.dynamics).forEach(target => {
                    const d = c.dynamics[target];
                    rows.push(`${s.id},${c.weather},${c.bait},${target},${d.pDisc[0]},${d.pDisc[1]},${d.pDisc[2]},${d.pGuar[0]},${d.pGuar[1]},${d.pGuar[2]}`);
                });
            });
        });
    }
    return rows.join("\n");
}

function processCSVUpload() {
    const files = document.getElementById('csvFiles').files;
    const targetSpot = document.getElementById('mgmtSpotSelect').value;
    
    if (files.length === 0) {
        alert("CSVファイルを選択してください。");
        return;
    }

    // アップロードされたCSVを統合して fisherdata.js 形式でダウンロードさせる処理をここに実装
    console.log(`${targetSpot} に対して ${files.length} 個のファイルを処理します。`);
    // (実装詳細はスモールステップで進める)
    alert("この機能は現在バックエンド統合中です。");
}