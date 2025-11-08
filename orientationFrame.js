// orientationFrame.js
export class OrientationFrame {
  constructor({ declinationDeg = 0 } = {}) {
    this.declinationDeg = declinationDeg;
    this.trueHeadingDeg = null;
    this.alpha = null;
    this.beta = null;
    this.gamma = null;
  }

  updateGeo({ heading }) {
    if (heading != null) {
      this.trueHeadingDeg = this._normalize(heading);
    }
  }

  updateMotion(data) {
    if (data.type === 'orientation') {
      this.alpha = data.alpha;
      this.beta = data.beta;
      this.gamma = data.gamma;
    }
  }

  _normalize(d) {
    let x = d % 360;
    if (x < 0) x += 360;
    return x;
  }

  getTrueHeadingDeg() {
    return this.trueHeadingDeg;
  }

  getRotationMatrix() {
    if (this.alpha == null || this.beta == null || this.gamma == null) return null;

    const toRad = Math.PI / 180;
    const a = this.alpha * toRad;
    const b = this.beta * toRad;
    const g = this.gamma * toRad;

    const cA = Math.cos(a), sA = Math.sin(a);
    const cB = Math.cos(b), sB = Math.sin(b);
    const cG = Math.cos(g), sG = Math.sin(g);

    // Rz(a) * Rx(b) * Ry(g)
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
      // x: short width, y: long side (TOP), z: out of screen
      x: { x: R[0][0], y: R[1][0], z: R[2][0] },
      y: { x: R[0][1], y: R[1][1], z: R[2][1] },
      z: { x: R[0][2], y: R[1][2], z: R[2][2] }
    };
  }
}
