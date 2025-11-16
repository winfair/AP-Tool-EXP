// declination.js
// Simple global heading offset: raw (sensor) -> map/true-ish heading.

(function (w) {
  'use strict';

  let offsetDeg = 0;           // added to raw heading to get "true/map" heading
  let inputEl = null;
  let onChangeCb = null;

  function norm(a) {
    if (!isFinite(a)) return a;
    a = a % 360;
    return a < 0 ? a + 360 : a;
  }

  function applyChange() {
    if (typeof onChangeCb === 'function') {
      onChangeCb(offsetDeg);
    }
  }

  const Declination = {
    // Convert raw sensor heading -> map/true heading
    magneticToTrue(rawDeg) {
      if (!isFinite(rawDeg)) return rawDeg;
      return norm(rawDeg + offsetDeg);
    },

    // Manually set offset (e.g. user types local declination)
    setOffset(deg) {
      offsetDeg = isFinite(deg) ? deg : 0;
      if (inputEl) {
        inputEl.value = offsetDeg.toFixed(1);
      }
      applyChange();
    },

    // Bind to <input> so typing a value updates the offset
    bindInput(el, onChange) {
      inputEl = el || null;
      onChangeCb = typeof onChange === 'function' ? onChange : null;

      if (!inputEl) return;

      const handler = () => {
        const v = parseFloat(inputEl.value);
        offsetDeg = isFinite(v) ? v : 0;
        applyChange();
      };

      inputEl.addEventListener('input', handler);

      // Initialize from any default value in the input
      handler();
    },

    // Calibrate: "when rawHeading = rawDeg, I *want* it to equal desiredTrueDeg"
    calibrate(rawDeg, desiredTrueDeg) {
      if (!isFinite(rawDeg) || !isFinite(desiredTrueDeg)) return;
      offsetDeg = desiredTrueDeg - rawDeg;
      if (inputEl) {
        inputEl.value = offsetDeg.toFixed(1);
      }
      applyChange();
    }
  };

  w.Declination = Declination;
})(window);
