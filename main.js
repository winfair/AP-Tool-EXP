// main.js
import { GeoMotionService } from './geoMotion.js';
import { OrientationFrame } from './orientationFrame.js';
import { SensorUI } from './ui.js';
import { Compass3D } from './compass3d.js';

const ui = new SensorUI();
const svc = new GeoMotionService();
const frame = new OrientationFrame({ declinationDeg: 0 });
const compass3d = new Compass3D('threeContainer');

svc.onGeo = (data) => {
  ui.setGeoStatus('watching…');
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
  if (axes) {
    ui.showAxes(axes);
    compass3d.updateFromAxes(axes);
  }

  const heading = frame.getTrueHeadingDeg();
  if (heading != null) ui.showHeading(heading);
};

document.getElementById('btnGeo')?.addEventListener('click', () => {
  ui.setGeoStatus('requesting…');
  svc.startGeolocation();
});

document.getElementById('btnMotion')?.addEventListener('click', () => {
  ui.setMotionStatus('requesting permission…');
  svc.startMotion();
});

window.addEventListener('resize', () => {
  compass3d.onResize();
});
