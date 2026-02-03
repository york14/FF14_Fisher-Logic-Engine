/**
 * UI Controls & State Management for Fisher Logic Engine
 */

export function initResizers() {
    const resizerLeft = document.getElementById('resizer-left');
    const panelLeft = document.getElementById('panel-left');
    const resizerRight = document.getElementById('resizer-right');
    const panelRight = document.getElementById('panel-right');

    if (!resizerLeft || !panelLeft || !resizerRight || !panelRight) return;

    const initDrag = (resizer, panel, isRight) => {
        let startX, startWidth;
        const doDrag = (e) => {
            const dx = e.clientX - startX;
            const newW = startWidth + (isRight ? -dx : dx);
            panel.style.width = `${newW}px`;
        };
        const stopDrag = () => {
            document.removeEventListener('mousemove', doDrag);
            document.removeEventListener('mouseup', stopDrag);
            resizer.classList.remove('active');
        };
        resizer.addEventListener('mousedown', (e) => {
            startX = e.clientX;
            startWidth = parseInt(getComputedStyle(panel).width, 10);
            resizer.classList.add('active');
            document.addEventListener('mousemove', doDrag);
            document.addEventListener('mouseup', stopDrag);
            e.preventDefault();
        });
    };

    initDrag(resizerLeft, panelLeft, false);
    initDrag(resizerRight, panelRight, true);
}

export function updateSelect(id, items) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!items || !Array.isArray(items)) {
        // console.warn(`updateSelect: Invalid items for ${id}`, items);
        el.innerHTML = '';
        return;
    }
    const val = el.value;
    el.innerHTML = '';
    items.forEach(item => el.appendChild(new Option(item, item)));
    if ([...el.options].some(o => o.value === val)) el.value = val;
}

export function populateSelectors(masterDB) {
    if (!masterDB) return;
    const expansionSet = new Set();
    Object.values(masterDB.spots).forEach(s => { if (s.expansion) expansionSet.add(s.expansion); });
    const expSelect = document.getElementById('currentExpansion');
    if (expSelect) {
        expSelect.innerHTML = '';
        Array.from(expansionSet).forEach(exp => expSelect.appendChild(new Option(exp, exp)));
    }

    const presets = masterDB.strategy_presets || [];
    ['stratAPreset', 'stratBPreset'].forEach(id => {
        const sel = document.getElementById(id);
        if (sel) {
            sel.innerHTML = '';
            presets.forEach(p => sel.appendChild(new Option(p.name, p.id)));
        }
    });
}

export function updateAreaOptions(masterDB) {
    if (!masterDB) return;
    const expEl = document.getElementById('currentExpansion');
    if (!expEl) return;
    const currentExp = expEl.value;

    const areaSet = new Set();
    Object.values(masterDB.spots).forEach(s => { if (s.expansion === currentExp && s.area) areaSet.add(s.area); });

    const areaSelect = document.getElementById('currentArea');
    if (areaSelect) {
        areaSelect.innerHTML = '';
        Array.from(areaSet).forEach(area => areaSelect.appendChild(new Option(area, area)));
    }
    updateSpotOptions(masterDB);
}

export function updateSpotOptions(masterDB) {
    if (!masterDB) return;
    const expEl = document.getElementById('currentExpansion');
    const areaEl = document.getElementById('currentArea');
    if (!expEl || !areaEl) return;

    const currentExp = expEl.value;
    const currentArea = areaEl.value;
    const spotSelect = document.getElementById('currentSpot');

    if (spotSelect) {
        spotSelect.innerHTML = '';
        Object.keys(masterDB.spots).forEach(spotName => {
            const s = masterDB.spots[spotName];
            if (s.expansion === currentExp && s.area === currentArea) spotSelect.appendChild(new Option(spotName, spotName));
        });
    }
}

export function updateSpotDependents(masterDB, updateSimulationCallback) {
    const spotEl = document.getElementById('currentSpot');
    if (!spotEl) return;
    const spot = spotEl.value;
    const spotData = masterDB.spots[spot];
    if (!spotData) return;

    if (!spotData.fish_list || spotData.fish_list.length === 0) {
        updateSelect('currentWeather', []);
        updateSelect('currentBait', []);
        updateSelect('targetFishName', []);
        const resultContent = document.getElementById('result-content');
        if (resultContent) {
            resultContent.innerHTML = `
                <div style="padding:30px; text-align:center; color:var(--accent-red); border:2px dashed var(--accent-red); border-radius:8px; background:rgba(239, 68, 68, 0.1);">
                    <div style="font-size:1.5rem; margin-bottom:10px;">⚠️ データ未定義</div>
                    <div>「${spot}」の詳細データ（魚・天気・餌）がマスタに存在しません。</div>
                </div>`;
        }
        return;
    }

    updateSelect('currentWeather', spotData.weathers);
    updateSelect('currentBait', spotData.baits);
    updateSelect('targetFishName', spotData.fish_list);

    const slapOpts = ['manualSurfaceSlap', 'stratASlap', 'stratBSlap'];
    slapOpts.forEach(id => {
        const sel = document.getElementById(id);
        if (sel) {
            sel.innerHTML = '<option value="なし">なし</option>';
            spotData.fish_list.forEach(f => sel.appendChild(new Option(f, f)));
            const catchAll = document.getElementById('isCatchAll');
            if (catchAll && catchAll.checked) {
                sel.value = 'なし'; sel.disabled = true;
            }
        }
    });

    if (updateSimulationCallback) updateSimulationCallback();
}

export function updateLureUI() {
    const typeEl = document.getElementById('lureType');
    const countEl = document.getElementById('lureCount');
    if (!typeEl || !countEl) return;

    const type = typeEl.value;
    const count = parseInt(countEl.value, 10);
    const isLureActive = (type !== 'none');
    countEl.disabled = !isLureActive;

    for (let i = 1; i <= 3; i++) {
        const el = document.getElementById(`lureStep${i}`);
        if (el) {
            el.disabled = !isLureActive || count < i;
            el.style.opacity = (!isLureActive || count < i) ? '0.3' : '1.0';
            if (el.disabled) el.value = 'none';
        }
    }
}

export function updateStrategyPresetsFilter(masterDB) {
    if (!masterDB) return;
    ['A', 'B'].forEach(set => {
        const lureVal = document.getElementById(`strat${set}Lure`).value;
        const presetSel = document.getElementById(`strat${set}Preset`);
        const quitSelect = document.getElementById(`strat${set}Quit`);
        const isNoLure = (lureVal === 'none');

        if (quitSelect) {
            quitSelect.disabled = isNoLure;
            if (isNoLure) quitSelect.value = 'no';
        }

        if (presetSel) {
            Array.from(presetSel.options).forEach(opt => {
                const isNoLureStrat = (opt.value === 'no_lure');
                opt.disabled = isNoLure ? !isNoLureStrat : false;
            });
            if (presetSel.options[presetSel.selectedIndex].disabled) {
                // Assuming preset 1 exists and is suitable fallback if no user default
                presetSel.value = (lureVal === 'none') ? 'no_lure' : (masterDB.strategy_presets[1] ? masterDB.strategy_presets[1].id : '');
            }
        }
    });
}
