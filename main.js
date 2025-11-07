// main.js
import { GeoMotionService } from './geoMotion.js';

const svc = new GeoMotionService();

// set callbacks
svc.onGeo = (data) => {
  // do whatever: update UI, feed 3D scene, send to server...
  console.log('GEO:', data);
  const el = document.getElementById('geoOut');
  if (el) {
    el.textContent = JSON.stringify(data, null, 2);
  }
};

svc.onGeoError = (err) => {
  console.warn('GEO ERROR:', err);
  const el = document.getElementById('geoOut');
  if (el) el.textContent = 'Geo error: ' + err.message;
};

svc.onMotion = (data) => {
  console.log('MOTION:', data);
  const el = document.getElementById('motionOut');
  if (el) {
    // show last event
    el.textContent = JSON.stringify(data, null, 2);
  }
};

// maybe bind to buttons in your actual UI
document.getElementById('btnGeo')?.addEventListener('click', () => {
  svc.startGeolocation();
});

document.getElementById('btnMotion')?.addEventListener('click', () => {
  svc.startMotion();
});
