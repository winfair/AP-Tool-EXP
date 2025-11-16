// declination.js
// Handle magnetic declination and convert magnetic heading -> true heading.
// Convention: declinationDeg is +E, -W (east positive, west negative).

window.Declination = (function () {
  let declinationDeg = 0; // default: no correction

  function set(deg) {
    if (typeof deg === "number" && isFinite(deg)) {
      // clamp to a sane range
      declinationDeg = Math.max(-30, Math.min(30, deg));
    }
  }

  function get() {
    return declinationDeg;
  }

  function normalizeAngle(deg) {
    let d = deg % 360;
    if (d < 0) d += 360;
    return d;
  }

  /**
   * Convert a *magnetic* heading (0–360°) into a *true* heading.
   * true = magnetic + declination (east positive, west negative)
   */
  function magneticToTrue(headingMagDeg) {
    if (!isFinite(headingMagDeg)) return NaN;
    return normalizeAngle(headingMagDeg + declinationDeg);
  }

  /**
   * Optional helper: bind to an <input> so user can type declination.
   * Input convention: +E / -W.
   */
  function bindInput(inputEl) {
    if (!inputEl) return;
    inputEl.value = declinationDeg.toFixed(1);

    inputEl.addEventListener("input", () => {
      const v = parseFloat(inputEl.value);
      if (!isNaN(v)) {
        set(v);
      }
    });
  }

  return {
    set,
    get,
    magneticToTrue,
    bindInput
  };
})();
