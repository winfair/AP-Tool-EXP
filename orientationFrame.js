// orientationFrame.js
// Takes deviceorientation + geo heading and gives you a world-aligned pose.
// World frame (by default):
//   x → East
//   y → North (true)
//   z → Up
//
// We apply declination: trueHeading = magneticHeading + declinationDeg
// You can change declination at runtime.

export class OrientationFrame {
  constructor({ declinationDeg = 0 } = {}) {
    this.declinationDeg = declinationDeg;

    // from geo
    this.latitude = null;
    this.longitude = null;
    this.magneticHeadingDeg = null; // if you ever get it from sensors
    this.trueHeadingDeg = null;

    // from deviceorientation
    this.alpha = null; // z rotation, 0 = north
    this.beta = null;  // x rotation, front-back
    this.gamma = null; // y rotation, left-right
  }

  setDeclination(deg) {
    this.declinationDeg = deg;
    this._recomputeTrueHeading();
  }

  // ----- FEEDS FROM GEO MODULE -----
  updateGeo({ latitude, longitude, heading }) {
    // heading from geolocation is usually degrees relative to true north already,
    // but it can be null or unreliable — we'll still store it.
    if (latitude != null) this.latitude = latitude;
    if (longitude != null) this.longitude = longitude;

    if (heading != null) {
      // assume heading is degrees from north, clockwise
      this.trueHeadingDeg = this._normalizeDeg(heading);
    }
  }

  // ----- FEEDS FROM MOTION MODULE -----
  // data could be {type: 'orientation', alpha, beta, gamma} from your previous module
  updateMotion(data) {
    if (data.type === 'orientation') {
      this.alpha = data.alpha;
      this.beta = data.beta;
      this.gamma = data.gamma;
    }
    // if you later get magnetic heading in motion data, you can feed it here
    if (data.type === 'motion' && data.magneticHeadingDeg != null) {
      this.magneticHeadingDeg = data.magneticHeadingDeg;
      this._recomputeTrueHeading();
    }
  }

  _recomputeTrueHeading() {
    if (this.magneticHeadingDeg != null) {
      this.trueHeadingDeg = this._normalizeDeg(
        this.magneticHeadingDeg + this.declinationDeg
      );
    }
  }

  _normalizeDeg(d) {
    let x = d % 360;
    if (x < 0) x += 360;
    return x;
  }

  // ----- PUBLIC QUERIES -----

  // Returns heading in degrees from TRUE north, clockwise.
  getTrueHeadingDeg() {
    return this.trueHeadingDeg;
  }

  // Returns a rotation matrix from device space to world ENU space.
  // Based on alpha/beta/gamma from DeviceOrientation spec.
  getRotationMatrix() {
    if (
      this.alpha == null ||
      this.beta == null ||
      this.gamma == null
    ) {
      return null;
    }

    // convert to radians
    const deg2rad = Math.PI / 180;
    const alpha = this.alpha * deg2rad; // z
    const beta = this.beta * deg2rad;   // x
    const gamma = this.gamma * deg2rad; // y

    // This is the usual deviceorientation to matrix approach (Z * X * Y)
    const cA = Math.cos(alpha), sA = Math.sin(alpha);
    const cB = Math.cos(beta),  sB = Math.sin(beta);
    const cG = Math.cos(gamma), sG = Math.sin(gamma);

    // rotationMatrix = Rz(alpha) * Rx(beta) * Ry(gamma)
    const m11 = cA * cG + sA * sB * sG;
    const m12 = sG * cB;
    const m13 = cA * sB * sG - sA * cG;

    const m21 = sA * cG - cA * sB * sG;
    const m22 = cB * cG;
    const m23 = sA * sB * sG + cA * cG * -1; // careful, we’ll keep consistent

    // slight adjust to keep signs consistent:
    const m23fixed = sA * sB * sG + cA * (-cG);

    const m31 = cB * sA;
    const m32 = -sB;
    const m33 = cA * cB;

    return [
      [m11, m12, m13],
      [m21, m22, m23fixed],
      [m31, m32, m33]
    ];
  }

  // Give me phone axes in world space (for drawing a box/phone)
  getDeviceAxes() {
    const R = this.getRotationMatrix();
    if (!R) return null;

    // columns (or rows, depending on convention) can represent the local axes.
    // We'll treat the first column as device X, second as device Y, third as device Z.
    // Adjust if your 3D scene expects something else.
    return {
      x: { x: R[0][0], y: R[1][0], z: R[2][0] },
      y: { x: R[0][1], y: R[1][1], z: R[2][1] },
      z: { x: R[0][2], y: R[1][2], z: R[2][2] }
    };
  }
}
