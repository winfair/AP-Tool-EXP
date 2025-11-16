// compass.js
// Terminal-style heading compass + vertical pitch bar HUD.

(function (w) {
  'use strict';

  const TWO_PI = Math.PI * 2;

  function normDeg(d) {
    if (!isFinite(d)) return null;
    const n = d % 360;
    return n < 0 ? n + 360 : n;
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function drawHeading(ctx, width, height, state) {
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.42;

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // Outer ring
    ctx.strokeStyle = '#00ff5b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TWO_PI);
    ctx.stroke();

    // Inner grid circle
    ctx.strokeStyle = '#006b33';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.6, 0, TWO_PI);
    ctx.stroke();

    // Tick marks + ASCII-ish rose
    const cardinalLabels = ['N', 'E', 'S', 'W'];
    for (let i = 0; i < 36; i++) {
      const deg = i * 10;
      const rad = (deg - 90) * Math.PI / 180;
      const isCardinal = (deg % 90 === 0);
      const isMajor = (deg % 30 === 0);

      const rOuter = radius;
      const rInner = rOuter - (isCardinal ? 10 : isMajor ? 7 : 4);

      const x1 = cx + rInner * Math.cos(rad);
      const y1 = cy + rInner * Math.sin(rad);
      const x2 = cx + rOuter * Math.cos(rad);
      const y2 = cy + rOuter * Math.sin(rad);

      ctx.strokeStyle = isCardinal ? '#00ff5b' : isMajor ? '#00b34a' : '#004526';
      ctx.lineWidth = isCardinal ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      if (isCardinal) {
        const idx = (deg / 90) % 4;
        const label = cardinalLabels[idx];
        const lr = radius * 0.8;
        const lx = cx + lr * Math.cos(rad);
        const ly = cy + lr * Math.sin(rad) + 3;

        ctx.fillStyle = '#00ff5b';
        ctx.font = '10px ui-monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, lx, ly);
      }
    }

    // HUD label
    ctx.fillStyle = '#00b34a';
    ctx.font = '9px ui-monospace';
    ctx.textAlign = 'center';
    ctx.fillText('<HDG HUD>', cx, cy + radius + 12);

    const curr = normDeg(state.currentHeadingDeg);
    const tgt = normDeg(state.targetHeadingDeg);
    const tol = isFinite(state.toleranceDeg) ? Math.max(0.5, state.toleranceDeg) : 3;

    const onTarget =
      curr != null && tgt != null &&
      Math.abs((((curr - tgt + 540) % 360) - 180)) <= tol;

    // Target band + radial line (very visible)
    if (tgt != null) {
      const bandSize = Math.max(3, tol);
      const bandRad1 = (tgt - 90 - bandSize) * Math.PI / 180;
      const bandRad2 = (tgt - 90 + bandSize) * Math.PI / 180;

      // Arc band on outer ring
      ctx.beginPath();
      ctx.strokeStyle = onTarget ? '#ffffff' : '#00ff5b';
      ctx.lineWidth = 3;
      ctx.arc(cx, cy, radius * 0.9, bandRad1, bandRad2);
      ctx.stroke();

      // Radial line from center to ring
      const rad = (tgt - 90) * Math.PI / 180;
      const rLine = radius * 0.9;
      const xTip = cx + rLine * Math.cos(rad);
      const yTip = cy + rLine * Math.sin(rad);

      ctx.strokeStyle = onTarget ? '#ffffff' : '#00ff5b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(xTip, yTip);
      ctx.stroke();

      // Small 'TGT' mark near ring
      const lx = cx + (radius * 0.65) * Math.cos(rad);
      const ly = cy + (radius * 0.65) * Math.sin(rad) + 3;
      ctx.fillStyle = onTarget ? '#ffffff' : '#00ff5b';
      ctx.font = '9px ui-monospace';
      ctx.textAlign = 'center';
      ctx.fillText('T', lx, ly);
    }

    // Current heading arrow
    if (curr != null) {
      const rad = (curr - 90) * Math.PI / 180;
      const arrowR = radius * 0.72;
      const xTip = cx + arrowR * Math.cos(rad);
      const yTip = cy + arrowR * Math.sin(rad);

      ctx.strokeStyle = onTarget ? '#ffffff' : '#00ff5b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(xTip, yTip);
      ctx.stroke();

      // Arrowhead
      const side = 8;
      const leftRad = rad + Math.PI * 0.75;
      const rightRad = rad - Math.PI * 0.75;
      const xl = xTip + side * Math.cos(leftRad);
      const yl = yTip + side * Math.sin(leftRad);
      const xr = xTip + side * Math.cos(rightRad);
      const yr = yTip + side * Math.sin(rightRad);

      ctx.beginPath();
      ctx.moveTo(xTip, yTip);
      ctx.lineTo(xl, yl);
      ctx.lineTo(xr, yr);
      ctx.closePath();
      ctx.fillStyle = onTarget ? '#ffffff' : '#00ff5b';
      ctx.fill();
    }

    // Center crosshair
    ctx.strokeStyle = '#006b33';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy);
    ctx.lineTo(cx + 8, cy);
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx, cy + 8);
    ctx.stroke();

    ctx.restore();
  }

  function drawPitch(ctx, width, height, state) {
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    const barWidth = width * 0.4;
    const barX = (width - barWidth) / 2;
    const topMargin = 10;
    const bottomMargin = 14;
    const barTop = topMargin;
    const barBottom = height - bottomMargin;
    const barH = barBottom - barTop;

    // Bar background
    ctx.fillStyle = '#000000';
    ctx.strokeStyle = '#00b34a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(barX, barTop, barWidth, barH, 3);
    ctx.stroke();

    // Ticks: -60..+60
    const maxPitch = 60;
    ctx.font = '9px ui-monospace';
    ctx.textAlign = 'left';

    for (let deg = -60; deg <= 60; deg += 15) {
      const t = (deg + maxPitch) / (2 * maxPitch); // 0..1
      const y = barTop + (1 - t) * barH;

      ctx.strokeStyle = deg === 0 ? '#00ff5b' : '#004526';
      ctx.lineWidth = deg === 0 ? 1.5 : 1;
      const tickL = barX - (deg % 30 === 0 ? 8 : 5);
      const tickR = barX;
      ctx.beginPath();
      ctx.moveTo(tickL, y);
      ctx.lineTo(tickR, y);
      ctx.stroke();

      if (deg === 30 || deg === 0 || deg === -30) {
        ctx.fillStyle = deg === 0 ? '#00ff5b' : '#00b34a';
        ctx.fillText((deg > 0 ? '+' : '') + deg, tickL - 2, y + 3);
      }
    }

    // Label
    ctx.fillStyle = '#00b34a';
    ctx.font = '9px ui-monospace';
    ctx.textAlign = 'center';
    ctx.fillText('<PCH BAR>', width / 2, height - 3);

    const curr = state.currentPitchDeg != null ? clamp(state.currentPitchDeg, -maxPitch, maxPitch) : null;
    const tgt = state.targetPitchDeg != null ? clamp(state.targetPitchDeg, -maxPitch, maxPitch) : null;
    const tol = isFinite(state.toleranceDeg) ? Math.max(0.5, state.toleranceDeg) : 3;

    const onTarget =
      curr != null && tgt != null &&
      Math.abs(curr - tgt) <= tol;

    // Target line
    if (tgt != null) {
      const t = (tgt + maxPitch) / (2 * maxPitch);
      const y = barTop + (1 - t) * barH;
      ctx.strokeStyle = onTarget ? '#ffffff' : '#00ff5b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(barX, y);
      ctx.lineTo(barX + barWidth, y);
      ctx.stroke();
    }

    // Current pitch block
    if (curr != null) {
      const t = (curr + maxPitch) / (2 * maxPitch);
      const y = barTop + (1 - t) * barH;
      const h = 8;
      ctx.fillStyle = onTarget ? '#ffffff' : '#00ff5b';
      ctx.strokeStyle = '#006b33';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(barX + 2, y - h / 2, barWidth - 4, h, 3);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  const CompassUI = {
    _headingCtx: null,
    _pitchCtx: null,
    _hSize: null,
    _pSize: null,
    _tolerance: 3,

    init(opts) {
      const hCanvas = document.getElementById(opts.headingCanvasId);
      const pCanvas = document.getElementById(opts.pitchCanvasId);
      this._tolerance = isFinite(opts.toleranceDeg) ? opts.toleranceDeg : 3;

      if (hCanvas && hCanvas.getContext) {
        this._headingCtx = hCanvas.getContext('2d');
        this._hSize = { w: hCanvas.width, h: hCanvas.height };
        drawHeading(this._headingCtx, this._hSize.w, this._hSize.h, {});
      }
      if (pCanvas && pCanvas.getContext) {
        this._pitchCtx = pCanvas.getContext('2d');
        this._pSize = { w: pCanvas.width, h: pCanvas.height };
        drawPitch(this._pitchCtx, this._pSize.w, this._pSize.h, {});
      }
    },

    update(state) {
      const s = state || {};
      const tol = isFinite(s.toleranceDeg) ? s.toleranceDeg : this._tolerance;

      const headingState = {
        currentHeadingDeg: s.currentHeadingDeg,
        targetHeadingDeg: s.targetHeadingDeg,
        headingErrorDeg: s.headingErrorDeg,
        toleranceDeg: tol
      };
      const pitchState = {
        currentPitchDeg: s.currentPitchDeg,
        targetPitchDeg: s.targetPitchDeg,
        pitchErrorDeg: s.pitchErrorDeg,
        toleranceDeg: tol
      };

      if (this._headingCtx && this._hSize) {
        drawHeading(this._headingCtx, this._hSize.w, this._hSize.h, headingState);
      }
      if (this._pitchCtx && this._pSize) {
        drawPitch(this._pitchCtx, this._pSize.w, this._pSize.h, pitchState);
      }
    }
  };

  w.CompassUI = CompassUI;
})(window);
