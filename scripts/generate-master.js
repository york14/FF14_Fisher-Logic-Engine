import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CSV_DIR = path.join(PROJECT_ROOT, 'src', 'data', 'csv');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'src', 'data', 'logic_master.json');

const REQUIRED_FILES = {
    fish: "マスタ - 1_魚種.csv",
    hierarchy: "マスタ - 2_拡張・エリア定義.csv",
    spots: "マスタ - 3_釣り場定義.csv",
    weights: "マスタ - 4_基礎重み・基礎待機時間.csv",
    probs: "マスタ - 5_発見・型確定・隠しヒット率.csv",
    presets: "マスタ - 6_ルアー戦略プリセット.csv"
};

async function main() {
    console.log("🎣 Starting Master Data Generation...");

    try {
        // 1. Read and Parse CSVs
        const data = {};
        for (const [key, filename] of Object.entries(REQUIRED_FILES)) {
            const filePath = path.join(CSV_DIR, filename);
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }
            console.log(`Reading: ${filename}`);
            const fileContent = fs.readFileSync(filePath, 'utf8');
            // Remove BOM if present
            const cleanContent = fileContent.replace(/^\uFEFF/, '');

            data[key] = parse(cleanContent, {
                columns: true,
                skip_empty_lines: true,
                trim: true
            });
        }

        // 2. Initialize Master Object
        const master = {
            version: "3.0.0",
            updated_at: new Date().toISOString(),
            fish: {},
            spots: {},
            weights: {},
            probabilities: [],
            strategy_presets: []
        };

        // 3. Process Hierarchy (Spots Init)
        data.hierarchy.forEach(row => {
            const spot = row['釣り場'];
            if (spot) {
                master.spots[spot] = {
                    expansion: row['拡張'],
                    area: row['エリア'],
                    weathers: [],
                    baits: [],
                    fish_list: []
                };
            }
        });

        // 4. Process Fish
        const typeMap = { "小型": "small_jaws", "大型": "large_jaws", "中型": "medium_jaws" };
        data.fish.forEach(row => {
            if (!row['魚種']) return;
            master.fish[row['魚種']] = {
                type: typeMap[row['型']] || "small_jaws",
                vibration: row['演出'],
                hook_time: parseFloat(row['釣り上げ動作時間']),
                is_hidden: (row['隠し判定'] == '1'),
                can_slap: (row['トレード可否'] == '1')
            };
        });

        // 5. Process Spots Details (Aggregation)
        data.spots.forEach(row => {
            const spot = row['釣り場'];
            const type = row['データ種別'];
            const val = row['データ'];
            if (!spot || !type || !val) return;

            if (!master.spots[spot]) {
                console.warn(`Warning: Spot '${spot}' definition found in details but not in hierarchy.`);
                master.spots[spot] = {
                    expansion: "その他", area: "不明",
                    weathers: [], baits: [], fish_list: []
                };
            }

            if (type === '天気 / 時間') master.spots[spot].weathers.push(val);
            else if (type === '餌') master.spots[spot].baits.push(val);
            else if (type === '魚種') master.spots[spot].fish_list.push(val);
        });

        // 6. Process Weights
        data.weights.forEach(row => {
            const key = `${row['釣り場']}|${row['天気 / 時間']}|${row['餌']}`;
            if (!master.weights[key]) master.weights[key] = [];
            master.weights[key].push({
                fish: row['魚種'],
                weight: parseFloat(row['基礎重み']),
                bite_time_min: parseFloat(row['基礎待機時間min']),
                bite_time_max: parseFloat(row['基礎待機時間max'])
            });
        });

        // 7. Process Probabilities
        const hiddenHitMap = {
            '発見1型確1なし隠しヒット率1': 'n1_d1_g0',
            '発見1型確2あり隠しヒット率2': 'n2_d1_g2',
            '発見1型確2なし隠しヒット率2': 'n2_d1_g0',
            '発見1型確3あり隠しヒット率3': 'n3_d1_g3',
            '発見1型確3なし隠しヒット率3': 'n3_d1_g0',
            '発見2型確2なし隠しヒット率2': 'n2_d2_g0',
            '発見2型確3あり隠しヒット率3': 'n3_d2_g3',
            '発見2型確3なし隠しヒット率3': 'n3_d2_g0',
            '発見3型確3なし隠しヒット率3': 'n3_d3_g0'
        };

        data.probs.forEach(row => {
            const parsePercent = (val) => {
                if (!val) return null;
                const num = parseFloat(val.replace('%', ''));
                return isNaN(num) ? null : num;
            };
            const discRates = [parsePercent(row['発見率1']), parsePercent(row['発見率2']), parsePercent(row['発見率3'])];
            const guarRatesNoDisc = [parsePercent(row['未発見型確定率1']), parsePercent(row['未発見型確定率2']), parsePercent(row['未発見型確定率3'])];

            const guarRatesAfter = {};
            const addGA = (k, v) => { if (v) guarRatesAfter[k] = parsePercent(v); };
            addGA('d1_g2', row['発見1型確定率2']);
            addGA('d1_g3', row['発見1型確定率3']);
            addGA('d2_g3', row['発見2型確定率3']);

            const hiddenHit = {};
            Object.keys(hiddenHitMap).forEach(header => {
                if (row[header]) hiddenHit[hiddenHitMap[header]] = parsePercent(row[header]);
            });

            master.probabilities.push({
                spot: row['釣り場'],
                weather: row['天気 / 時間'],
                bait: row['餌'],
                target_hidden: row['対象隠し魚'] === 'なし' ? null : row['対象隠し魚'],
                slap_target: row['トレード対象'],
                lure_type: row['ルアー種類'],
                disc_rates: discRates,
                guar_rates_nodisc: guarRatesNoDisc,
                guar_rates_after_disc: guarRatesAfter,
                hidden_hit_rates: hiddenHit
            });
        });

        // 8. Process Presets
        data.presets.forEach(row => {
            if (!row['戦略ID']) return;
            const scenarios = [];
            Object.keys(row).forEach(k => {
                if (k !== '戦略ID' && k !== '戦略名' && k !== '説明' && row[k] == '1') {
                    scenarios.push(k);
                }
            });
            master.strategy_presets.push({
                id: row['戦略ID'],
                name: row['戦略名'],
                description: row['説明'],
                eligible_scenarios: scenarios
            });
        });

        // 9. Write Output
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(master, null, 2), 'utf8');
        console.log(`✅ Successfully generated ${OUTPUT_FILE}`);
        console.log(`Summary:`);
        console.log(`- Spots: ${Object.keys(master.spots).length}`);
        console.log(`- Fish: ${Object.keys(master.fish).length}`);
        console.log(`- Probs: ${master.probabilities.length}`);

    } catch (err) {
        console.error("❌ Error generating master data:");
        console.error(err);
        process.exit(1);
    }
}

main();
