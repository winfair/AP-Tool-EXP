// compass.js
// Draws heading + pitch gauges on two canvases.

(function (w) {
  'use strict';

  let canvH, ctxH, canvP, ctxP, tol = 3;

  function setupCanvas(id) {
    const c = document.getElementById(id);
    if (!c) return [null, null];
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr;
    c.height = c.clientWidth * dpr;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [c, ctx];
  }

  function init(opts) {
    const hId = opts.headingCanvasId, pId = opts.pitchCanvasId;
    tol = opts.toleranceDeg || 3;
    [canvH, ctxH] = setupCanvas(hId);
    [canvP, ctxP] = setupCanvas(pId);
  }

  function ringColor(err) {
    if (err == null || !isFinite(err)) return '#64748b';
    const a = Math.abs(err);
    if (a <= tol) return '#22c55e';
    if (a <= tol * 2) return '#f59e0b';
    return '#ef4444';
  }

  function drawCircleGauge(ctx, val, tgt, labelFn, range, clockwise) {
    if (!ctx) return;
    const w = ctx.canvas.clientWidth, h = ctx.canvas.clientHeight;
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 6;

    ctx.clearRect(0, 0, w, h);

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(148,163,184,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const relToAngle = v => {
      if (v == null || !isFinite(v)) return null;
      const frac = (v - range.min) / (range.max - range.min);
      const a = clockwise ? frac * 2 * Math.PI : (1 - frac) * 2 * Math.PI;
      return a - Math.PI / 2; // 0 at top
    };

    let err = null;
    if (val != null && tgt != null && isFinite(val) && isFinite(tgt)) {
      err = vAngleDiff(val, tgt);
    }

    // target line
    const tgtAng = relToAngle(tgt);
    if (tgtAng != null) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + r * Math.cos(tgtAng), cy + r * Math.sin(tgtAng));
      ctx.strokeStyle = 'rgba(56,189,248,0.7)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // arrow (current)
    const valAng = relToAngle(val);
    if (valAng != null) {
      const col = ringColor(err);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + (r - 4) * Math.cos(valAng), cy + (r - 4) * Math.sin(valAng));
      ctx.strokeStyle = col;
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
    }

    ctx.fillStyle = '#e5e7eb';
    ctx.font = '11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';

    const txt = labelFn(val, tgt, err);
    if (txt) ctx.fillText(txt, cx, cy + r + 10);
  }

  function vAngleDiff(a, b) {
    if (!isFinite(a) || !isFinite(b)) return null;
    let d = ((a - b) % 360 + 540) % 360 - 180;
    return d;
  }

  function headingLabel(val, tgt, err) {
    if (val == null || !isFinite(val)) return '';
    const h = ((val % 360) + 360) % 360;
    const parts = [h.toFixed(0) + '°'];
    if (tgt != null && isFinite(tgt)) parts.push('→ ' + tgt.toFixed(0) + '°');
    if (err != null && isFinite(err)) parts.push('Δ' + err.toFixed(1) + '°');
    return parts.join('  ');
  }

  function pitchLabel(val, tgt, err) {
    if (val == null || !isFinite(val)) return '';
    const parts = [val.toFixed(1) + '°'];
    if (tgt != null && isFinite(tgt)) parts.push('→ ' + tgt.toFixed(1) + '°');
    if (err != null && isFinite(err)) parts.push('Δ' + err.toFixed(1) + '°');
    return parts.join('  ');
  }

  function update(data) {
    data = data || {};
    const ch = data.currentHeadingDeg, th = data.targetHeadingDeg;
    const cp = data.currentPitchDeg, tp = data.targetPitchDeg;
    const he = data.headingErrorDeg, pe = data.pitchErrorDeg;

    drawCircleGauge(
      ctxH,
      ch,
      th,
      headingLabel,
      { min: 0, max: 360 },
      true
    );
    drawCircleGauge(
      ctxP,
      cp,
      tp,
      pitchLabel,
      { min: -90, max: 90 },
      false
    );
  }

  w.CompassUI = { init, update };
})(window);
