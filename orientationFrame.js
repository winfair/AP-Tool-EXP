// orientationFrame.js
// Interprets deviceorientation into a world-aligned frame (x=east, y=north, z=up)

export class OrientationFrame {
  constructor({ declinationDeg = 0 } = {}) {
    this.declinationDeg = declinationDeg;

    this.latitude = null;
    this.longitude = null;
    this.trueHeadingDeg = null;

    this.alpha = null;
    this.beta = null;
    this.gamma = null;
  }

  setDeclination(deg) {
    this.declinationDeg = deg;
    this._recomputeHeading();
  }

  // from geolocation
  updateGeo({ latitude, longitude, heading }) {
    if (latitude != null) this.latitude = latitude;
    if (longitude != null) this.longitude = longitude;

    // geolocation heading is usually true north already
    if (heading != null) {
      this.trueHeadingDeg = this._normalizeDeg(heading);
    }
  }

  // from motion/orientation
  updateMotion(data) {
    if (data.type === 'orientation') {
      this.alpha = data.alpha;
      this.beta = data.beta;
      this.gamma = data.gamma;
    }
  }

  _recomputeHeading() {
    // placeholder for when you feed magnetic heading + declination
  }

  _normalizeDeg(d) {
    let x = d % 360;
    if (x < 0) x += 360;
    return x;
  }

  getTrueHeadingDeg() {
    return this.trueHeadingDeg;
  }

  // rotation matrix from DeviceOrientation (Z * X * Y)
  getRotationMatrix() {
    if (this.alpha == null || this.beta == null || this.gamma == null) return null;

    const deg2rad = Math.PI / 180;
    const alpha = this.alpha * deg2rad; // z
    const beta = this.beta * deg2rad;   // x
    const gamma = this.gamma * deg2rad; // y

    const cA = Math.cos(alpha), sA = Math.sin(alpha);
    const cB = Math.cos(beta),  sB = Math.sin(beta);
    const cG = Math.cos(gamma), sG = Math.sin(gamma);

    // R = Rz(alpha) * Rx(beta) * Ry(gamma)
    const m11 = cA * cG + sA * sB * sG;
    const m12 = sG * cB;
    const m13 = cA * sB * sG - sA * cG;

    const m21 = sA * cG - cA * sB * sG;
    const m22 = cB * cG;
    const m23 = sA * sB * sG + cA * (-cG);

    const m31 = cB * sA;
    const m32 = -sB;
    const m33 = cA * cB;

    return [
      [m11, m12, m13],
      [m21, m22, m23],
      [m31, m32, m33]
    ];
  }

  getDeviceAxes() {
    const R = this.getRotationMatrix();
    if (!R) return null;
    return {
      x: { x: R[0][0], y: R[1][0], z: R[2][0] },
      y: { x: R[0][1], y: R[1][1], z: R[2][1] },
      z: { x: R[0][2], y: R[1][2], z: R[2][2] }
    };
  }
}
