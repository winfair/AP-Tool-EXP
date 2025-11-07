// orientationFrame.js
// Gives you device axes in world frame: x=east, y=north, z=up

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
  }

  updateGeo({ latitude, longitude, heading }) {
    if (latitude != null) this.latitude = latitude;
    if (longitude != null) this.longitude = longitude;
    if (heading != null) this.trueHeadingDeg = this._normalizeDeg(heading);
  }

  updateMotion(data) {
    if (data.type === 'orientation') {
      this.alpha = data.alpha;
      this.beta = data.beta;
      this.gamma = data.gamma;
    }
  }

  _normalizeDeg(d) {
    let x = d % 360;
    if (x < 0) x += 360;
    return x;
  }

  getTrueHeadingDeg() {
    return this.trueHeadingDeg;
  }

  getRotationMatrix() {
    if (this.alpha == null || this.beta == null || this.gamma == null) return null;

    const deg2rad = Math.PI / 180;
    const alpha = this.alpha * deg2rad;
    const beta = this.beta * deg2rad;
    const gamma = this.gamma * deg2rad;

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
      x: { x: R[0][0], y: R[1][0], z: R[2][0] }, // across width
      y: { x: R[0][1], y: R[1][1], z: R[2][1] }, // along length (TOP EDGE)
      z: { x: R[0][2], y: R[1][2], z: R[2][2] }  // out of screen (device z)
    };
  }
}
