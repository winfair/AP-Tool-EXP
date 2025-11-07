// main.js
import { GeoMotionService } from './geoMotion.js';
import { OrientationFrame } from './orientationFrame.js';

const svc = new GeoMotionService();
const frame = new OrientationFrame({ declinationDeg: 12 }); // example declination

svc.onGeo = (data) => {
  frame.updateGeo(data);
  // ... your existing UI stuff
};

svc.onMotion = (data) => {
  frame.updateMotion(data);
  // ... your existing UI stuff

  const axes = frame.getDeviceAxes();
  if (axes) {
    // now you can feed this to your 3D renderer
    // e.g. updatePhoneModel(axes);
    console.log('Device axes in world:', axes);
  }

  const heading = frame.getTrueHeadingDeg();
  if (heading != null) {
    console.log('True heading:', heading);
  }
};

// rest of your button wiring stays the same
