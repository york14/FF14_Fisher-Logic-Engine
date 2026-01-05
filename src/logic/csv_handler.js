/**
 * src/logic/csv_handler.js
 * JSオブジェクト(FISHER_DATA)から3種類のCSVへの変換および、CSVインポートを管理
 */

/**
 * データをCSV文字列に変換する
 * @param {Object} data - FISHER_DATA オブジェクト
 * @param {string} type - 'spots' | 'fish' | 'probs'
 * @returns {string} - CSV文字列
 */
function convertToCSV(data, type) {
    let rows = [];

    if (type === 'spots') {
        // 1. 釣り場情報 CSV: 釣り場ID, 天気/時間, 釣り餌
        rows.push("釣り場ID,天気/時間,釣り餌");
        data.spots.forEach(s => {
            s.conditions.forEach(c => {
                rows.push(`${s.id},${c.weather},${c.bait}`);
            });
        });
    } 
    else if (type === 'fish') {
        // 2. 魚テーブル2 CSV: 釣り場ID, 天気/時間, 釣り餌, 魚名, 重み, 待機時間, 型, Hidden
        rows.push("釣り場ID,天気/時間,釣り餌,魚名,重み,待機時間,型,Hidden");
        data.spots.forEach(s => {
            s.conditions.forEach(c => {
                c.fishList.forEach(f => {
                    rows.push(`${s.id},${c.weather},${c.bait},${f.name},${f.weight},${f.biteTime},${f.type},${f.isHidden}`);
                });
            });
        });
    } 
    else if (type === 'probs') {
        // 3. 再抽選確率 CSV: 釣り場ID, 天気/時間, 釣り餌, トレリリース対象, 1回発見率, 2回発見率, 3回発見率, 1回確定率, 2回確定率, 3回確定率
        rows.push("釣り場ID,天気/時間,釣り餌,トレリリース対象,1回発見率,2回発見率,3回発見率,1回確定率,2回確定率,3回確定率");
        data.spots.forEach(s => {
            s.conditions.forEach(c => {
                Object.keys(c.dynamics).forEach(targetName => {
                    const d = c.dynamics[targetName];
                    // 配列 [0, 1, 2] から個別の値を取得
                    const pD = d.pDisc;
                    const pG = d.pGuar;
                    rows.push(`${s.id},${c.weather},${c.bait},${targetName},${pD[0]},${pD[1]},${pD[2]},${pG[0]},${pG[1]},${pG[2]}`);
                });
            });
        });
    }

    // CSVとして正しく解釈されるよう、改行コードで結合
    return rows.join("\r\n");
}

/**
 * CSVインポート後のデータ統合処理 (将来的な実装)
 */
async function processCSVUpload() {
    const files = document.getElementById('csvFiles').files;
    const targetSpot = document.getElementById('mgmtSpotSelect').value;
    
    if (files.length === 0) {
        alert("CSVファイルを選択してください。");
        return;
    }

    alert("CSVインポート機能は現在ロジック統合中です。現在はダウンロード機能のみ動作します。");
}