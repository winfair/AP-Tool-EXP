// main.js
import { GeoMotionService } from './geoMotion.js';
import { OrientationFrame } from './orientationFrame.js';

const svc = new GeoMotionService();
const frame = new OrientationFrame({ declinationDeg: 0 }); // change to your local declination

// hook up callbacks
svc.onGeo = (data) => {
  frame.updateGeo(data);
  const el = document.getElementById('geoOut');
  if (el) el.textContent = JSON.stringify(data, null, 2);
};

svc.onGeoError = (err) => {
  const el = document.getElementById('geoOut');
  if (el) el.textContent = 'Geo error: ' + err.message;
};

svc.onMotion = (data) => {
  frame.updateMotion(data);
  const el = document.getElementById('motionOut');
  if (el) el.textContent = JSON.stringify(data, null, 2);

  // example: derived axes
  const axes = frame.getDeviceAxes();
  if (axes) {
    const axesEl = document.getElementById('axesOut');
    if (axesEl) axesEl.textContent = JSON.stringify(axes, null, 2);
  }
};

// make sure this runs AFTER DOM is there (script at bottom of HTML)
const btnGeo = document.getElementById('btnGeo');
if (btnGeo) {
  btnGeo.addEventListener('click', () => {
    svc.startGeolocation();
  });
}

const btnMotion = document.getElementById('btnMotion');
if (btnMotion) {
  btnMotion.addEventListener('click', () => {
    svc.startMotion();
  });
}
