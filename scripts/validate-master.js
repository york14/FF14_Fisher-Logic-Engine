import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MASTER_PATH = path.join(__dirname, '../src/data/logic_master.json');

function validate() {
    console.log('🔍 Validating Master Data...');

    if (!fs.existsSync(MASTER_PATH)) {
        console.error('❌ logic_master.json not found!');
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf8'));
    const { spots, fish, weights } = data;
    let errors = [];
    let warnings = [];

    // 1. Check Spots
    console.log(`Checking ${Object.keys(spots).length} spots...`);
    Object.keys(spots).forEach(spotName => {
        const spot = spots[spotName];

        // Check Fish Integrity
        if (!spot.fish_list || spot.fish_list.length === 0) {
            warnings.push(`Spot '${spotName}' has no fish defined.`);
        } else {
            spot.fish_list.forEach(fName => {
                if (!fish[fName]) {
                    errors.push(`Spot '${spotName}' references missing fish: '${fName}'`);
                }
            });
        }
    });

    // 2. Check Weights coverage
    // Ideally, every spot should have weights for its weather/bait combinations.
    // However, we can at least check if there are orphan weights or spots without weights.
    Object.keys(data.spots).forEach(spotName => {
        // Logic to check if at least one weight entry exists for this spot
        const hasWeight = Object.keys(weights).some(k => k.startsWith(spotName));
        if (!hasWeight) {
            warnings.push(`Spot '${spotName}' has no probability weights defined in 'weights' section.`);
        }
    });

    // 3. Check Fish Definitions
    Object.keys(fish).forEach(fName => {
        const f = fish[fName];
        if (!f.hook_time && f.hook_time !== 0) {
            errors.push(`Fish '${fName}' has invalid hook_time: ${f.hook_time}`);
        }
    });

    // Report
    if (errors.length > 0) {
        console.error('\n❌ IMPROPER DATA FOUND:');
        errors.forEach(e => console.error(` - ${e}`));
        console.log('\nPlease correct the CSV files.');
        process.exit(1);
    } else {
        console.log('\n✅ Data Integrity Check Passed.');
    }

    if (warnings.length > 0) {
        console.warn('\n⚠️ Warnings:');
        warnings.forEach(w => console.warn(` - ${w}`));
    }
}

validate();
