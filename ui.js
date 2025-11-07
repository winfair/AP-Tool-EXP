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

  setGeoStatus(text) {
    if (this.geoStatusEl) this.geoStatusEl.textContent = text;
  }

  showGeo(data) {
    if (this.geoOutEl) this.geoOutEl.textContent = JSON.stringify(data, null, 2);
  }

  showGeoError(err) {
    if (this.geoStatusEl) this.geoStatusEl.textContent = 'error: ' + err;
  }

  setMotionStatus(text) {
    if (this.motionStatusEl) this.motionStatusEl.textContent = text;
  }

  showMotion(data) {
    if (this.motionOutEl) this.motionOutEl.textContent = JSON.stringify(data, null, 2);
  }

  showAxes(axes) {
    if (this.axesOutEl) this.axesOutEl.textContent = JSON.stringify(axes, null, 2);
  }

  showHeading(deg) {
    if (this.headingOutEl) this.headingOutEl.textContent = deg != null
      ? deg.toFixed(1) + '°'
      : '—';
  }
}
