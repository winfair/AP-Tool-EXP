// main.js
import { GeoMotionService } from './geoMotion.js';
import { OrientationFrame } from './orientationFrame.js';
import { SensorUI } from './ui.js';
import { computeAzimuthFromDeviceAxes } from './azimuthProjection.js';

const ui = new SensorUI();
const svc = new GeoMotionService();
const frame = new OrientationFrame({ declinationDeg: 0 }); // change if you want real declination

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
  if (axes) {
    ui.showAxes(axes);

    const azInfo = computeAzimuthFromDeviceAxes(axes);
    if (azInfo && azInfo.azimuthDeg != null) {
      ui.drawAzimuth(azInfo.azimuthDeg);
    } else {
      ui.drawAzimuth(null);
    }
  }

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
