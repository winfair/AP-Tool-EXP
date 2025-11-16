// declination.js
// Declination + calibration offset, stored in localStorage.

(function (w) {
  'use strict';

  const KEY = 'aptool_heading_params_v1';
  let decl = 0, offset = 0;

  const norm360 = d => (d % 360 + 360) % 360;
  const clampDecl = d => !isFinite(d) ? 0 : Math.max(-40, Math.min(40, d));

  (function load() {
    try {
      const p = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (typeof p.declinationDeg === 'number') decl = clampDecl(p.declinationDeg);
      if (typeof p.calibrationOffsetDeg === 'number') offset = norm360(p.calibrationOffsetDeg);
    } catch (_) {}
  })();

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        declinationDeg: decl,
        calibrationOffsetDeg: offset
      }));
    } catch (_) {}
  }

  function setDeclination(d) { decl = clampDecl(d); save(); }
  function getDeclination() { return decl; }
  function getCalibrationOffset() { return offset; }
  function setCalibrationOffset(o) { if (isFinite(o)) { offset = norm360(o); save(); } }

  function magneticToTrue(mag) {
    if (!isFinite(mag)) return NaN;
    return norm360(mag + decl + offset);
  }

  // Solve offset so: true = norm(mag + decl + offset)
  function calibrate(mag, trueHd) {
    if (!isFinite(mag) || !isFinite(trueHd)) return;
    offset = norm360(trueHd - (mag + decl));
    save();
  }

  function bindInput(el) {
    if (!el) return;
    el.value = decl.toFixed(1);
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      if (!isNaN(v)) setDeclination(v);
    });
  }

  w.Declination = {
    setDeclination, getDeclination,
    getCalibrationOffset, setCalibrationOffset,
    magneticToTrue, calibrate, bindInput,
    // legacy alias
    set: setDeclination,
    get: getDeclination
  };
})(window);
