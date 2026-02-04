
/**
 * Optimizer Tab Controller
 */
import { generateAtomicStrategies, simulateMixedStrategy } from '../core/optimizer_module.js';

export function initOptimizerTab(masterDB, probabilityMap) {
    const runBtn = document.getElementById('opt-run-btn');
    if (runBtn) {
        runBtn.addEventListener('click', () => {
            // Delay slightly to prevent UI race conditions? No, just run.
            setTimeout(() => runOptimization(masterDB, probabilityMap), 10);
        });
    }

    // Add listener for Tab activation to update UI state
    // We bind to all tab buttons to catch the switch
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Only update if we are currently in Optimizer tab or switching to it
            if (btn.dataset.mode === 'optimizer' || btn.innerText === '最適化') {
                setTimeout(() => updateOptimizerUI(masterDB), 50);
            }
        });
    });

    // Also bind to Target Selection change
    const targetSel = document.getElementById('targetFishName');
    if (targetSel) {
        targetSel.addEventListener('change', () => {
            // Update UI if we are in Optimizer tab (or just always update the state)
            updateOptimizerUI(masterDB);
        });
    }
}

// Exposed to global scope for debugging if needed (via window if we really wanted, but keep valid module)
// We just rely on internal calls.

function updateOptimizerUI(masterDB) {
    const targetEl = document.getElementById('targetFishName');
    if (!targetEl) return;
    const target = targetEl.value;
    const targetInfo = masterDB.fish[target];
    const isTargetHidden = targetInfo && targetInfo.is_hidden;

    const pInput = document.getElementById('opt-override-p');
    const pCheck = document.getElementById('opt-use-override-p');

    if (pCheck) {
        // If Hidden, Disable
        if (isTargetHidden) {
            pCheck.checked = false;
            pCheck.disabled = true;
            pCheck.parentElement.title = "隠し魚は重み上書きできません (固定シナリオ)";
            pCheck.parentElement.style.opacity = "0.5";
            if (pInput) {
                pInput.disabled = true;
                pInput.value = ""; // Clear value to indicate disabled
                pInput.placeholder = "固定 (Fixed)";
            }
        } else {
            // Normal Fish, Enable
            pCheck.disabled = false;
            pCheck.parentElement.title = "";
            pCheck.parentElement.style.opacity = "1.0";
            if (pInput) {
                pInput.disabled = !pCheck.checked;
                pInput.placeholder = "200";
            }
        }
    }
}

function runOptimization(masterDB, probabilityMap) {
    console.log("Starting Optimization...");
    // 1. Gather Inputs
    const spot = document.getElementById('currentSpot').value;
    const weather = document.getElementById('currentWeather').value;
    const bait = document.getElementById('currentBait').value;
    const target = document.getElementById('targetFishName').value;
    const targetInfo = masterDB.fish[target];
    if (!targetInfo) {
        alert("ターゲット情報がありません");
        return;
    }

    const slapFish = document.getElementById('manualSurfaceSlap') ? document.getElementById('manualSurfaceSlap').value : 'なし';
    const windowTime = parseInt(document.getElementById('opt-window-time').value || 350, 10);
    const initialGP = parseInt(document.getElementById('opt-initial-gp').value || 1000, 10);

    // 4. Override Weight Check (Updated v3.2)
    let overrideWeight = null;
    const pInput = document.getElementById('opt-override-p');
    const pCheck = document.getElementById('opt-use-override-p');
    const isTargetHidden = masterDB.fish[target] && masterDB.fish[target].is_hidden;

    // Double check UI state coherence
    if (!isTargetHidden && pCheck && pCheck.checked && pInput) {
        overrideWeight = parseFloat(pInput.value);
        console.log(`Using Override Weight: ${overrideWeight}`);
    } else {
        console.log("Using Default Weights (No Override or Hidden)");
    }

    const context = {
        masterDB,
        probabilityMap,
        spotConfig: { spot, weather, bait, target, isCatchAll: false, lureType: 'matching_lure' },
        overrideWeight
    };

    // Resolve Lure Type
    if (targetInfo) {
        const targetApps = targetInfo.type;
        context.spotConfig.lureType = (targetApps === 'large_jaws' || targetApps === 'large-sized') ? 'アンビシャスルアー' :
            (targetApps === 'small_jaws' || targetApps === 'small-sized') ? 'モデストルアー' : 'none';

        if (context.spotConfig.lureType === 'none' && (targetApps === undefined)) {
            // Default Fallback
            context.spotConfig.lureType = 'アンビシャスルアー';
        }
    }

    // 2. Generate Candidates
    const candidates = generateAtomicStrategies(masterDB, context.spotConfig, slapFish);
    console.log(`Candidates generated: ${candidates.length}`, candidates.map(c => c.name));

    // 3. Brute Force Pairs
    const results = [];

    // For optimization, we can also consider "Single Strategy" (Burn == Eco).
    // So we iterate i and j.

    for (let i = 0; i < candidates.length; i++) {
        for (let j = 0; j < candidates.length; j++) {
            const burn = candidates[i];
            const eco = candidates[j];

            const res = simulateMixedStrategy(burn, eco, windowTime, initialGP, context);

            if (res && res.error) {
                console.warn(`Skipped [${burn.name} + ${eco.name}]: ${res.error}`);
                continue;
            }
            if (res && res.invalid) continue;

            if (res) {
                results.push(res);
            }
        }
    }
    console.log(`Valid Results Found: ${results.length}`);

    // 4. Sort and Render
    // Sort by expectedTime (asc)
    results.sort((a, b) => a.expectedTime - b.expectedTime);

    renderOptimizerResults(results);
}


function renderOptimizerResults(results) {
    const container = document.getElementById('opt-results-container');
    if (!container) return;

    if (results.length === 0) {
        container.innerHTML = `<div style="padding:20px; text-align:center; color:#888;">有効な戦略が見つかりませんでした。条件を見直してください。</div>`;
        return;
    }

    const best = results[0];
    const top10 = results.slice(0, 10);

    let html = `
        <div class="best-strat-card" style="background:rgba(59,130,246,0.1); border:1px solid var(--primary); padding:15px; border-radius:8px; margin-bottom:20px;">
            <div style="font-size:0.8rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px;">Recommendation</div>
            <div style="font-size:1.5rem; font-weight:bold; color:var(--primary); margin:5px 0;">
                ${best.pairName}
            </div>
            <div style="display:flex; gap:20px; margin-top:10px; align-items:baseline;">
                <div>
                    <span style="font-size:2rem; font-weight:bold;">${best.expectedTime.toFixed(1)}s</span>
                    <span style="font-size:0.8rem; color:#ccc;">/ catch</span>
                </div>
                <div>
                    <span style="font-size:1.2rem;">${best.catchCount.toFixed(2)}</span>
                    <span style="font-size:0.8rem; color:#ccc;">hits in window</span>
                </div>
            </div>
            <div style="margin-top:10px; font-size:0.85rem; color:#ccc;">
                Burn: ${best.counts.burn}回 / Eco: ${best.counts.eco}回 / Wait: ${best.counts.wait}回
            </div>
        </div>
        
        <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
            <thead>
                <tr style="border-bottom:1px solid #444; color:#888;">
                    <th style="text-align:left; padding:5px;">Rank</th>
                    <th style="text-align:left; padding:5px;">Strategy Pair</th>
                    <th style="text-align:right; padding:5px;">Exp Time</th>
                    <th style="text-align:right; padding:5px;">Catch Count</th>
                </tr>
            </thead>
            <tbody>
    `;

    top10.forEach((r, idx) => {
        const rowStyle = (idx === 0) ? 'background:rgba(255,255,255,0.05); font-weight:bold;' : '';
        html += `
            <tr style="border-bottom:1px solid #333; ${rowStyle}">
                <td style="padding:8px;">#${idx + 1}</td>
                <td style="padding:8px;">${r.pairName}</td>
                <td style="padding:8px; text-align:right;">${r.expectedTime.toFixed(1)}s</td>
                <td style="padding:8px; text-align:right;">${r.catchCount.toFixed(2)}</td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}
