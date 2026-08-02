export function renderGraphToCanvas(canvasId, dataFuncs, colors, labels, xLabel, yLabel, currentP = null, pMin = 0, pMax = 1) {
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
    const steps = 100; // Increased steps for smoother curves when zoomed in
    const pointsArray = dataFuncs.map(func => {
        const pts = [];
        for (let i = 0; i <= steps; i++) {
            const p = pMin + (i / steps) * (pMax - pMin);
            const val = func(p);
            pts.push({ x: p, y: val });
        }
        return pts;
    });

    let currentPMaxY = 0;
    if (typeof currentP === 'number') {
        dataFuncs.forEach(func => {
            const val = func(currentP);
            if (val !== Infinity && !isNaN(val) && val >= 0) {
                if (val > currentPMaxY) currentPMaxY = val;
            }
        });
    }

    let maxY = 10;
    if (currentPMaxY > 0) {
        maxY = currentPMaxY * 1.5;
    } else {
        let validYs = [];
        pointsArray.forEach(pts => {
            pts.forEach(pt => {
                if (pt.y !== Infinity && !isNaN(pt.y) && pt.y >= 0) {
                    validYs.push(pt.y);
                }
            });
        });
        validYs.sort((a, b) => a - b);
        let refMax = validYs.length > 0 ? validYs[Math.floor(validYs.length * 0.90)] : 10;
        maxY = refMax > 0 ? refMax * 1.5 : 10;
    }
    
    if (maxY > 5000) maxY = 5000; // Cap extreme values
    if (maxY < 1) maxY = 1;

    const mapX = (x) => padding.left + ((x - pMin) / (pMax - pMin)) * (w - padding.left - padding.right);
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
    // X axis grid lines
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= 4; i++) {
        const xVal = pMin + (pMax - pMin) * (i / 4);
        const xPos = mapX(xVal);
        ctx.moveTo(xPos, mapY(0));
        ctx.lineTo(xPos, padding.top);
        ctx.fillText((xVal * 100).toFixed(1).replace('.0','') + '%', xPos, mapY(0) + 5);
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

    // Draw Marker if currentP is provided
    if (typeof currentP === 'number') {
        if (currentP >= pMin && currentP <= pMax) {
            const px = mapX(currentP);
            
            // Draw vertical line
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.setLineDash([5, 5]);
            ctx.lineWidth = 1;
            ctx.moveTo(px, padding.top);
            ctx.lineTo(px, h - padding.bottom);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Draw points at intersection
            pointsArray.forEach((pts, idx) => {
                // Find closest point or interpolate
                let pt = pts.find(p => Math.abs(p.x - currentP) < 0.001);
                if (!pt) {
                    const stepSize = (pMax - pMin) / steps;
                    const index = Math.round((currentP - pMin) / stepSize);
                    if (index >= 0 && index < pts.length) pt = pts[index];
                }
                
                if (pt && pt.y !== Infinity && !isNaN(pt.y) && pt.y >= 0) {
                    const py = mapY(pt.y);
                    if (py >= padding.top && py <= h - padding.bottom) {
                        ctx.beginPath();
                        ctx.fillStyle = colors[idx];
                        ctx.arc(px, py, 4, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.strokeStyle = '#fff';
                        ctx.lineWidth = 1.5;
                        ctx.stroke();
                    }
                }
            });
        }
    }
}
