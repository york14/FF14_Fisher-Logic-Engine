/**
 * Scenario ID Management for Fisher Logic Engine
 */

export function constructScenarioId(lureType, lureCount, steps) {
    if (lureType === 'none') return 'none_0';
    const count = parseInt(lureCount, 10);
    let discoveryStep = 0;
    let guaranteeSteps = [];

    // steps should be an array of strings ['none', 'disc', 'guar', ...]
    // corresponding to step 1, 2, 3...
    for (let i = 0; i < count; i++) {
        const val = steps[i];
        if (val === 'disc') {
            if (discoveryStep === 0) discoveryStep = i + 1;
        } else if (val === 'guar') {
            guaranteeSteps.push(i + 1);
        }
    }
    const gStr = guaranteeSteps.length > 0 ? guaranteeSteps.join('') : '0';
    return `n${count}_d${discoveryStep}_g${gStr}`;
}

export function parseScenarioId(id) {
    if (id === 'none_0') return { fullId: id, n: 0, d: 0, g: [], isNone: true };
    const match = id.match(/^n(\d+)_d(\d+)_g(\d+)$/);
    if (!match) return { fullId: id, n: 0, d: 0, g: [], isNone: true };
    const g = (match[3] === '0') ? [] : match[3].split('').map(Number);
    return { fullId: id, n: parseInt(match[1]), d: parseInt(match[2]), g, isNone: false };
}

export function getScenarioLabel(id) {
    const p = parseScenarioId(id);
    if (p.isNone) return "素振り";
    let text = `L${p.n}`;
    text += (p.d > 0) ? `: 発見${p.d}` : "";
    text += (p.g.length > 0) ? ` (型確${p.g.join(',')})` : "";
    return text;
}
