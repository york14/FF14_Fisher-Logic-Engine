const fs = require('fs');
const path = require('path');

const masterPath = path.join(__dirname, '../src/data/logic_master.json');
const data = JSON.parse(fs.readFileSync(masterPath, 'utf8'));

console.log('Total Probs:', data.probabilities.length);

const target = data.probabilities.find(p =>
    p.spot === '満ちた玄関' &&
    p.weather === '曇り雨16-18' &&
    p.bait === 'ゴーストニッパー' &&
    p.lure_type === 'アンビシャスルアー' &&
    (p.slap_target === 'なし' || p.slap_target === null || p.slap_target === undefined)
);

if (target) {
    console.log('✅ Found Matching Data:');
    console.log(JSON.stringify(target, null, 2));
} else {
    console.log('❌ Matching Data NOT Found');
    // 近いデータを表示
    console.log('--- Similar Data ---');
    const similar = data.probabilities.filter(p =>
        p.spot === '満ちた玄関' &&
        p.lure_type === 'アンビシャスルアー'
    );
    console.log(JSON.stringify(similar, null, 2));
}
