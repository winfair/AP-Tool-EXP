// ui.js
export class SensorUI {
  constructor() {
    this.geoStatusEl = document.getElementById('geoStatus');
    this.geoOutEl = document.getElementById('geoOut');
    this.motionStatusEl = document.getElementById('motionStatus');
    this.motionOutEl = document.getElementById('motionOut');
    this.axesOutEl = document.getElementById('axesOut');
    this.headingOutEl = document.getElementById('headingOut');
  }

  setGeoStatus(t) { if (this.geoStatusEl) this.geoStatusEl.textContent = t; }
  showGeo(d) { if (this.geoOutEl) this.geoOutEl.textContent = JSON.stringify(d, null, 2); }
  showGeoError(e) { if (this.geoStatusEl) this.geoStatusEl.textContent = 'error: ' + e; }

  setMotionStatus(t) { if (this.motionStatusEl) this.motionStatusEl.textContent = t; }
  showMotion(d) { if (this.motionOutEl) this.motionOutEl.textContent = JSON.stringify(d, null, 2); }
  showAxes(a) { if (this.axesOutEl) this.axesOutEl.textContent = JSON.stringify(a, null, 2); }
  showHeading(h) { if (this.headingOutEl) this.headingOutEl.textContent = h != null ? h.toFixed(1) + '°' : '—'; }
}
