// main.js
import { GeoMotionService } from './geoMotion.js';
import { OrientationFrame } from './orientationFrame.js';
import { SensorUI } from './ui.js';
import { computeAzimuthFromTopEdge } from './azimuthProjection.js';
import { TargetTracker } from './targetTracker.js';

const ui = new SensorUI();
const svc = new GeoMotionService();
const frame = new OrientationFrame({ declinationDeg: 0 });
const tracker = new TargetTracker();

// handle geo
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

// handle motion
svc.onMotion = (data) => {
  ui.setMotionStatus('receiving…');
  ui.showMotion(data);
  frame.updateMotion(data);

  const axes = frame.getDeviceAxes();
  if (axes) {
    ui.showAxes(axes);

    // azimuth from phone top edge (device Y)
    const azInfo = computeAzimuthFromTopEdge(axes);
    if (azInfo && azInfo.azimuthDeg != null) {
      ui.drawAzimuth(azInfo.azimuthDeg);
    } else {
      ui.drawAzimuth(null);
    }

    // target pointing
    const pointingResult = tracker.computeError(axes);
    if (pointingResult) {
      ui.showPointingResult(pointingResult);
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

document.getElementById('btnSetTarget')?.addEventListener('click', () => {
  const azInput = document.getElementById('targetAz');
  const elInput = document.getElementById('targetEl');
  const az = parseFloat(azInput?.value ?? '0');
  const el = parseFloat(elInput?.value ?? '0');
  tracker.setTarget(az, el);
  ui.showTargetSet(az, el);
});
