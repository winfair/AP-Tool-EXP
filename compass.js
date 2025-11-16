// compass.js
// Draws two compass-style indicators (heading & pitch) on canvas.
// Global CompassUI:
//   CompassUI.init({ headingCanvasId, pitchCanvasId, toleranceDeg? })
//   CompassUI.update({
//     currentHeadingDeg, targetHeadingDeg, headingErrorDeg,
//     currentPitchDeg,   targetPitchDeg,   pitchErrorDeg,
//     toleranceDeg?
//   })
(function (global) {
  'use strict';

  var headingCanvas = null;
  var headingCtx = null;
  var pitchCanvas = null;
  var pitchCtx = null;
  var defaultTolerance = 3;

  function init(opts) {
    opts = opts || {};
    if (opts.headingCanvasId) {
      headingCanvas = document.getElementById(opts.headingCanvasId);
      headingCtx = headingCanvas ? headingCanvas.getContext('2d') : null;
    }
    if (opts.pitchCanvasId) {
      pitchCanvas = document.getElementById(opts.pitchCanvasId);
      pitchCtx = pitchCanvas ? pitchCanvas.getContext('2d') : null;
    }
  }

  function toRad(deg) {
    return (deg * Math.PI) / 180;
  }

  // Map "compass degrees" (0 = north/up, 90 = east/right) into canvas angle.
  function compassDegToCanvasRad(deg) {
    return toRad(deg - 90); // 0deg => up, 90deg => right, etc.
  }

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function drawCompass(ctx, canvas, currentDeg, targetDeg, errorDeg, toleranceDeg) {
    if (!ctx || !canvas) return;

    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    var cx = w / 2;
    var cy = h / 2;
    var r = Math.min(w, h) / 2 - 8;

    ctx.save();
    ctx.translate(cx, cy);

    // Outer circle
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(148,163,184,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Cardinal tick marks (N/E/S/W)
    var cardinals = [0, 90, 180, 270];
    ctx.strokeStyle = 'rgba(148,163,184,0.6)';
    ctx.lineWidth = 1;
    cardinals.forEach(function (deg) {
      var rad = compassDegToCanvasRad(deg);
      var inner = r * 0.8;
      var outer = r;
      ctx.beginPath();
      ctx.moveTo(inner * Math.cos(rad), inner * Math.sin(rad));
      ctx.lineTo(outer * Math.cos(rad), outer * Math.sin(rad));
      ctx.stroke();
    });

    var tol = isNum(toleranceDeg) ? toleranceDeg : defaultTolerance;
    var onTarget = isNum(errorDeg) && Math.abs(errorDeg) <= tol;

    var arrowColor = onTarget ? '#22c55e' : '#38bdf8'; // green vs accent
    var targetColor = onTarget ? '#22c55e' : 'rgba(248,250,252,0.75)';

    // Target line
    if (isNum(targetDeg)) {
      var tRad = compassDegToCanvasRad(targetDeg);
      ctx.save();
      ctx.rotate(tRad);
      ctx.beginPath();
      ctx.moveTo(-r * 0.1, 0);
      ctx.lineTo(r * 0.85, 0);
      ctx.strokeStyle = targetColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.restore();
    }

    // Current arrow
    if (isNum(currentDeg)) {
      var cRad = compassDegToCanvasRad(currentDeg);
      ctx.save();
      ctx.rotate(cRad);

      // Shaft
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, 0);
      ctx.lineTo(r * 0.6, 0);
      ctx.strokeStyle = arrowColor;
      ctx.lineWidth = 4;
      ctx.setLineDash([]);
      ctx.stroke();

      // Arrow head
      ctx.beginPath();
      ctx.moveTo(r * 0.6, 0);
      ctx.lineTo(r * 0.4, -r * 0.12);
      ctx.lineTo(r * 0.4, r * 0.12);
      ctx.closePath();
      ctx.fillStyle = arrowColor;
      ctx.fill();

      ctx.restore();
    }

    // Center dot
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fillStyle = arrowColor;
    ctx.fill();

    ctx.restore();
  }

  function update(opts) {
    opts = opts || {};
    var tol = isNum(opts.toleranceDeg) ? opts.toleranceDeg : defaultTolerance;

    // Heading compass
    if (headingCtx && headingCanvas) {
      drawCompass(
        headingCtx,
        headingCanvas,
        opts.currentHeadingDeg,
        opts.targetHeadingDeg,
        opts.headingErrorDeg,
        tol
      );
    }

    // Pitch compass (same visual logic; values are just "angles to match")
    if (pitchCtx && pitchCanvas) {
      drawCompass(
        pitchCtx,
        pitchCanvas,
        opts.currentPitchDeg,
        opts.targetPitchDeg,
        opts.pitchErrorDeg,
        tol
      );
    }
  }

  global.CompassUI = {
    init: init,
    update: update
  };
})(window);
