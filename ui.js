// ui.js
// Safe UI helper: only updates elements that actually exist.
// Works with:
// - geoStatus, geoOut
// - motionStatus, motionOut
// - axesOut
// - headingOut
// - azimuthCanvas, azimuthLabel (optional)
// - targetStatus, pointingOut (optional)

export class SensorUI {
  constructor() {
    // core panels
    this.geoStatusEl = document.getElementById('geoStatus');
    this.geoOutEl = document.getElementById('geoOut');

    this.motionStatusEl = document.getElementById('motionStatus');
    this.motionOutEl = document.getElementById('motionOut');

    this.axesOutEl = document.getElementById('axesOut');
    this.headingOutEl = document.getElementById('headingOut');

    // optional 2D azimuth stuff
    this.azCanvas = document.getElementById('azimuthCanvas');
    this.azLabel = document.getElementById('azimuthLabel');
    this.azCtx = this.azCanvas ? this.azCanvas.getContext('2d') : null;

    // optional target panel
    this.targetStatusEl = document.getElementById('targetStatus');
    this.pointingOutEl = document.getElementById('pointingOut');
  }

  // ===== geo =====
  setGeoStatus(text) {
    if (this.geoStatusEl) this.geoStatusEl.textContent = text;
  }
  showGeo(data) {
    if (this.geoOutEl) this.geoOutEl.textContent = JSON.stringify(data, null, 2);
  }
  showGeoError(msg) {
    if (this.geoStatusEl) this.geoStatusEl.textContent = 'error: ' + msg;
  }

  // ===== motion =====
  setMotionStatus(text) {
    if (this.motionStatusEl) this.motionStatusEl.textContent = text;
  }
  showMotion(data) {
    if (this.motionOutEl) this.motionOutEl.textContent = JSON.stringify(data, null, 2);
  }

  // ===== axes =====
  showAxes(axes) {
    if (this.axesOutEl) this.axesOutEl.textContent = JSON.stringify(axes, null, 2);
  }

  // ===== heading =====
  showHeading(deg) {
    if (!this.headingOutEl) return;
    if (deg == null) {
      this.headingOutEl.textContent = '—';
    } else {
      this.headingOutEl.textContent = deg.toFixed(1) + '°';
    }
  }

  // ===== optional 2D azimuth (if canvas is present) =====
  drawAzimuth(angleDeg) {
    if (!this.azCtx || !this.azCanvas) return;

    const ctx = this.azCtx;
    const w = this.azCanvas.width;
    const h = this.azCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) / 2 - 10;

    ctx.clearRect(0, 0, w, h);

    // outer circle
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // north tick
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy - r + 14);
    ctx.strokeStyle = 'rgba(255,50,50,0.8)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, cy - r - 4);

    if (angleDeg == null) {
      if (this.azLabel) this.azLabel.textContent = 'no azimuth';
      return;
    }

    // 0° = north, clockwise
    const rad = angleDeg * Math.PI / 180;
    const vx = Math.sin(rad);
    const vy = -Math.cos(rad);
    const arrowLen = r - 16;

    const endX = cx + vx * arrowLen;
    const endY = cy + vy * arrowLen;

    // shaft
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = 'rgba(61,169,252,0.9)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.stroke();

    // head
    const headLen = 10;
    const perpX = -vy;
    const perpY = vx;
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - vx * headLen + perpX * 5, endY - vy * headLen + perpY * 5);
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - vx * headLen - perpX * 5, endY - vy * headLen - perpY * 5);
    ctx.strokeStyle = 'rgba(61,169,252,0.9)';
    ctx.lineWidth = 3;
    ctx.stroke();

    if (this.azLabel) this.azLabel.textContent = angleDeg.toFixed(1) + '°';
  }

  // ===== optional target panel =====
  showTargetSet(azDeg, elDeg) {
    if (this.targetStatusEl) {
      this.targetStatusEl.textContent = `Target: az ${azDeg.toFixed(1)}°, el ${elDeg.toFixed(1)}°`;
    }
  }

  showPointingResult(result) {
    if (this.pointingOutEl) {
      this.pointingOutEl.textContent = JSON.stringify(result, null, 2);
    }
  }
}
