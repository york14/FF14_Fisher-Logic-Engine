export function renderGraphToCanvas(canvasId, dataFuncs, colors, labels, xLabel, yLabel, isTimeLimitMode) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Use a high-DPI scaling approach
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const padding = { top: 20, right: 20, bottom: 30, left: 50 };
    
    // Draw Background
    ctx.clearRect(0, 0, w, h);
    
    // Calculate Data Points
    const steps = 50;
    const pointsArray = dataFuncs.map(func => {
        const pts = [];
        for (let i = 0; i <= steps; i++) {
            const p = i / steps; // p ranges from 0 to 1 (0% to 100%)
            const val = func(p);
            pts.push({ x: p, y: val });
        }
        return pts;
    });

    // Find Min/Max Y
    let maxY = 0;
    // To prevent the graph from being flattened by huge values at p -> 0,
    // we use the value at p=0.1 as a reference for scaling, or simply cap it if the peak is > 5x the median.
    let refMax = 0;
    pointsArray.forEach(pts => {
        pts.forEach(pt => {
            if (pt.x >= 0.05 && pt.y !== Infinity && !isNaN(pt.y)) {
                if (pt.y > refMax) refMax = pt.y;
            }
        });
    });
    
    // If the curve is extremely steep, cap the visual maxY
    maxY = refMax > 0 ? refMax * 1.5 : 10;
    
    pointsArray.forEach(pts => {
        pts.forEach(pt => {
            if (pt.y !== Infinity && !isNaN(pt.y) && pt.y > maxY && pt.y < refMax * 10) {
                 // if there are valid points slightly above refMax*1.5, we can allow up to that, but we just cap at maxY for display.
            }
        });
    });

    // Add some margin to max Y
    maxY = maxY > 0 ? maxY * 1.1 : 10;
    if (maxY > 1000) maxY = 1000; // Cap to avoid infinite bounds

    const mapX = (x) => padding.left + x * (w - padding.left - padding.right);
    const mapY = (y) => h - padding.bottom - (y / maxY) * (h - padding.top - padding.bottom);

    // Draw Grid and Axes
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // Y axis grid lines
    const ySteps = 5;
    ctx.fillStyle = '#888';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= ySteps; i++) {
        const yVal = (maxY * i) / ySteps;
        const yPos = mapY(yVal);
        ctx.moveTo(padding.left, yPos);
        ctx.lineTo(w - padding.right, yPos);
        ctx.fillText(yVal.toFixed(1), padding.left - 5, yPos);
    }
    // X axis grid lines (0%, 25%, 50%, 75%, 100%)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= 4; i++) {
        const xVal = i * 0.25;
        const xPos = mapX(xVal);
        ctx.moveTo(xPos, mapY(0));
        ctx.lineTo(xPos, padding.top);
        ctx.fillText((xVal * 100) + '%', xPos, mapY(0) + 5);
    }
    ctx.stroke();

    // Draw Labels
    ctx.fillStyle = '#bbb';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(xLabel, w / 2, h - 10);
    
    ctx.save();
    ctx.translate(15, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();

    // Draw Lines
    pointsArray.forEach((pts, idx) => {
        ctx.beginPath();
        ctx.strokeStyle = colors[idx];
        ctx.lineWidth = 2;
        let started = false;
        pts.forEach((pt) => {
            if (pt.y === Infinity || isNaN(pt.y) || pt.y < 0) return;
            const px = mapX(pt.x);
            const py = mapY(pt.y);
            if (!started) {
                ctx.moveTo(px, py);
                started = true;
            } else {
                ctx.lineTo(px, py);
            }
        });
        ctx.stroke();
    });

    // Draw Legend
    const legendWidth = labels.length > 1 ? 80 : 0;
    if (legendWidth > 0) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '11px sans-serif';
        labels.forEach((label, idx) => {
            const lx = w - padding.right - 70;
            const ly = padding.top + 10 + idx * 15;
            ctx.fillStyle = colors[idx];
            ctx.fillRect(lx, ly - 4, 12, 8);
            ctx.fillStyle = '#fff';
            ctx.fillText(label, lx + 16, ly);
        });
    }
}
