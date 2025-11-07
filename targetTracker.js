// targetTracker.js
// Treat everything as directions on a sphere.
// Phone pointing = device Y axis.
// Target = azimuth/elevation in degrees (0° az = north, clockwise; 0° el = horizon, +90° zenith)

export class TargetTracker {
  constructor() {
    this.targetAzDeg = null;
    this.targetElDeg = null;
  }

  setTarget(azDeg, elDeg) {
    this.targetAzDeg = azDeg;
    this.targetElDeg = elDeg;
  }

  // from device axes (world)
  computePhonePointing(deviceAxes) {
    if (!deviceAxes || !deviceAxes.y) return null;
    const v = deviceAxes.y; // phone top

    const east = v.x;
    const north = v.y;
    const up = v.z;

    const horiz = Math.hypot(east, north);
    const azRad = Math.atan2(east, north); // 0=north, cw
    let azDeg = azRad * 180 / Math.PI;
    if (azDeg < 0) azDeg += 360;

    const elRad = Math.atan2(up, horiz); // up vs horizontal
    const elDeg = elRad * 180 / Math.PI;

    return {
      azDeg,
      elDeg,
      vector: this._dirFromAzEl(azDeg, elDeg)
    };
  }

  // returns angle in degrees between phone dir and target dir
  computeError(deviceAxes) {
    const phone = this.computePhonePointing(deviceAxes);
    if (!phone) return null;
    if (this.targetAzDeg == null || this.targetElDeg == null) {
      return { phone, target: null, errorDeg: null };
    }

    const targetVec = this._dirFromAzEl(this.targetAzDeg, this.targetElDeg);
    const dot = phone.vector.x * targetVec.x +
                phone.vector.y * targetVec.y +
                phone.vector.z * targetVec.z;
    const clamped = Math.min(1, Math.max(-1, dot));
    const angleRad = Math.acos(clamped);
    const angleDeg = angleRad * 180 / Math.PI;

    return {
      phone,
      target: {
        azDeg: this.targetAzDeg,
        elDeg: this.targetElDeg,
        vector: targetVec
      },
      errorDeg: angleDeg
    };
  }

  _dirFromAzEl(azDeg, elDeg) {
    const az = azDeg * Math.PI / 180;
    const el = elDeg * Math.PI / 180;
    // world x=east, y=north, z=up
    const x = Math.sin(az) * Math.cos(el); // east
    const y = Math.cos(az) * Math.cos(el); // north
    const z = Math.sin(el);                // up
    return { x, y, z };
  }
}
