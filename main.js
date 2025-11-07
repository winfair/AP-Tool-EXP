// main.js
import { GeoMotionService } from './geoMotion.js';
import { OrientationFrame } from './orientationFrame.js';
import { SensorUI } from './ui.js';

const ui = new SensorUI();
const svc = new GeoMotionService();

// set your actual declination here if you want real map north
const frame = new OrientationFrame({ declinationDeg: 0 });

// wire sensor callbacks
svc.onGeo = (data) => {
  ui.setGeoStatus('watching position');
  ui.showGeo(data);
  frame.updateGeo(data);

  const heading = frame.getTrueHeadingDeg();
  if (heading != null) ui.showHeading(heading);
};

svc.onGeoError = (err) => {
  ui.showGeoError(err.message || String(err));
};

svc.onMotion = (data) => {
  ui.setMotionStatus('receiving…');
  ui.showMotion(data);
  frame.updateMotion(data);

  const axes = frame.getDeviceAxes();
  if (axes) ui.showAxes(axes);

  const heading = frame.getTrueHeadingDeg();
  if (heading != null) ui.showHeading(heading);
};

// buttons
document.getElementById('btnGeo')?.addEventListener('click', () => {
  ui.setGeoStatus('requesting…');
  svc.startGeolocation();
});

document.getElementById('btnMotion')?.addEventListener('click', () => {
  ui.setMotionStatus('requesting permission…');
  svc.startMotion();
});
