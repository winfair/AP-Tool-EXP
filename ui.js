// ui.js
// All DOM wiring for AP-Tool.
// Uses global Sensors, TargetMap, AimMath, CompassUI provided by other modules.

(function (global) {
  'use strict';

  function $(id) {
    return document.getElementById(id);
  }

  var targetState = {
    lat: null,
    lon: null,
    elevation: null
  };

  // ---- Helpers ----

  function formatAngle(val) {
    if (typeof val !== 'number' || !isFinite(val)) return '—';
    return val.toFixed(1) + '°';
  }

  function formatHeading(val) {
    if (typeof val !== 'number' || !isFinite(val)) return '—';
    var n = ((val % 360) + 360) % 360;
    return n.toFixed(1) + '°';
  }

  function formatDistanceMeters(m) {
    if (typeof m !== 'number' || !isFinite(m)) return '—';
    if (Math.abs(m) >= 1000) {
      var km = m / 1000;
      return km.toFixed(2) + ' km';
    }
    return m.toFixed(1) + ' m';
  }

  function formatSignedDistance(m) {
    if (typeof m !== 'number' || !isFinite(m)) return '—';
    var dir = m > 0 ? '↑' : m < 0 ? '↓' : '';
    return (m.toFixed(1) + ' m ' + dir).trim();
  }

  // ---- UI update: Sensors ----

  function updateSensorsUI(state) {
    var comboStatusEl = $('comboStatus');
    var statusTextEl = $('statusText');

    var gpsStatusPill = $('gpsStatusPill');
    var gpsLatEl = $('gpsLat');
    var gpsLonEl = $('gpsLon');
    var gpsAltEl = $('gpsAlt');
    var gpsErrorBox = $('gpsErrorBox');
    var gpsErrorEl = $('gpsError');

    var oriStatusPill = $('oriStatusPill');
    var headingEl = $('headingVal');
    var pitchEl = $('pitchVal');
    var oriErrorBox = $('oriErrorBox');
    var oriErrorEl = $('oriError');
    var oriSupportPill = $('oriSupportPill');

    if (!state) return;

    // GPS
    gpsStatusPill.textContent = 'gps: ' + state.gpsStatus;
    gpsLatEl.textContent =
      typeof state.gpsLat === 'number' ? state.gpsLat.toFixed(6) : '—';
    gpsLonEl.textContent =
      typeof state.gpsLon === 'number' ? state.gpsLon.toFixed(6) : '—';
    gpsAltEl.textContent =
      typeof state.gpsAlt === 'number' ? state.gpsAlt.toFixed(1) + ' m' : '—';

    if (state.gpsError) {
      gpsErrorBox.style.display = 'block';
      gpsErrorEl.textContent = state.gpsError;
    } else {
      gpsErrorBox.style.display = 'none';
      gpsErrorEl.textContent = '—';
    }

    // Orientation
    oriStatusPill.textContent = 'ori: ' + state.oriStatus;
    headingEl.textContent =
      typeof state.headingDeg === 'number'
        ? state.headingDeg.toFixed(1) + '°'
        : '—';
    pitchEl.textContent =
      typeof state.pitchDeg === 'number'
        ? state.pitchDeg.toFixed(1) + '°'
        : '—';

    if (state.oriError) {
      oriErrorBox.style.display = 'block';
      oriErrorEl.textContent = state.oriError;
    } else {
      oriErrorBox.style.display = 'none';
      oriErrorEl.textContent = '—';
    }

    // Orientation support pill
    if (state.oriStatus === 'unsupported') {
      oriSupportPill.textContent = 'Orientation not supported here';
      oriSupportPill.className = 'mini-pill bad';
    } else if (state.oriStatus === 'denied') {
      oriSupportPill.textContent = 'Permission denied – check browser settings';
      oriSupportPill.className = 'mini-pill bad';
    } else if (state.oriStatus === 'listening') {
      oriSupportPill.textContent = 'Orientation live';
      oriSupportPill.className = 'mini-pill ok';
    } else if (state.oriStatus === 'requesting') {
      oriSupportPill.textContent = 'Requesting permission…';
      oriSupportPill.className = 'mini-pill warn';
    } else {
      oriSupportPill.textContent = 'Waiting for start…';
      oriSupportPill.className = 'mini-pill';
    }

    // Combined status
    var comboStatus =
      'gps: ' + state.gpsStatus + ' · ori: ' + state.oriStatus;
    comboStatusEl.textContent = comboStatus;

    // Top info text
    if (state.gpsStatus === 'ok' || state.oriStatus === 'listening') {
      statusTextEl.textContent =
        'Sensors are live. Move and rotate the phone to see updates.';
    } else if (state.gpsStatus === 'denied' || state.oriStatus === 'denied') {
      statusTextEl.textContent =
        'One or more permissions were denied. Check your browser/site settings and try again.';
    } else if (state.gpsStatus === 'unsupported' || state.oriStatus === 'unsupported') {
      statusTextEl.textContent =
        'This browser environment does not support at least one of the sensors.';
    } else if (state.gpsStatus === 'requesting' || state.oriStatus === 'requesting') {
      statusTextEl.textContent =
        'Waiting for permission. If you don’t see a prompt, check browser settings.';
    } else {
      statusTextEl.textContent =
        'Ready. Tap “Start sensors” once and accept the browser prompts on your phone.';
    }
  }

  // ---- UI update: Target card ----

  function updateTargetUI() {
    var targetStatusPill = $('targetStatusPill');
    var targetLatEl = $('targetLat');
    var targetLonEl = $('targetLon');
    var targetElevEl = $('targetElev');
    var targetStatusText = $('targetStatusText');

    if (typeof targetState.lat === 'number' && typeof targetState.lon === 'number') {
      targetLatEl.textContent = targetState.lat.toFixed(6);
      targetLonEl.textContent = targetState.lon.toFixed(6);

      if (typeof targetState.elevation === 'number') {
        targetElevEl.textContent = targetState.elevation.toFixed(1) + ' m';
        targetStatusPill.textContent = 'Target set';
        targetStatusText.textContent = 'Target selected and elevation loaded.';
      } else {
        targetElevEl.textContent = '—';
        targetStatusPill.textContent = 'Target set (no elev)';
        targetStatusText.textContent =
          'Target selected. Elevation not available or still loading.';
      }
    } else {
      targetLatEl.textContent = '—';
      targetLonEl.textContent = '—';
      targetElevEl.textContent = '—';
      targetStatusPill.textContent = 'No target';
      targetStatusText.textContent =
        'No target selected. Tap “Select Target” to choose a point on the map.';
    }
  }

  // ---- UI update: Aim card ----

  function updateAimUI(sol) {
    var statusPill = $('aimStatusPill');
    var reqHeadingEl = $('aimReqHeading');
    var reqPitchEl = $('aimReqPitch');
    var headingErrEl = $('aimHeadingErr');
    var pitchErrEl = $('aimPitchErr');
    var horizEl = $('aimHorizDist');
    var vertEl = $('aimVertDelta');

    if (!sol || !sol.valid || sol.bearingDeg == null) {
      statusPill.textContent = 'No target';
      reqHeadingEl.textContent = '—';
      reqPitchEl.textContent = '—';
      headingErrEl.textContent = '—';
      pitchErrEl.textContent = '—';
      horizEl.textContent = '—';
      vertEl.textContent = '—';
      return;
    }

    statusPill.textContent = 'Ready';

    reqHeadingEl.textContent = formatHeading(sol.requiredHeadingDeg);
    reqPitchEl.textContent =
      typeof sol.requiredPitchDeg === 'number'
        ? formatAngle(sol.requiredPitchDeg)
        : '—';

    headingErrEl.textContent =
      typeof sol.headingErrorDeg === 'number'
        ? formatAngle(sol.headingErrorDeg)
        : '—';

    pitchErrEl.textContent =
      typeof sol.pitchErrorDeg === 'number'
        ? formatAngle(sol.pitchErrorDeg)
        : '—';

    horizEl.textContent = formatDistanceMeters(sol.horizontalDistanceM);
    vertEl.textContent =
      typeof sol.verticalDeltaM === 'number'
        ? formatSignedDistance(sol.verticalDeltaM)
        : '—';
  }

  // ---- Aim computation glue ----

  function recomputeAim() {
    if (!global.Sensors) {
      updateAimUI(null);
      if (global.CompassUI) global.CompassUI.update({});
      return;
    }

    var s = global.Sensors.getState ? global.Sensors.getState() : null;
    if (!s) {
      updateAimUI(null);
      if (global.CompassUI) global.CompassUI.update({});
      return;
    }

    var compassBase = {
      currentHeadingDeg:
        typeof s.headingDeg === 'number' ? s.headingDeg : null,
      currentPitchDeg:
        typeof s.pitchDeg === 'number' ? s.pitchDeg : null,
      toleranceDeg: 3
    };

    // If we don't have geo + target yet, just draw the arrows and clear aim solution.
    if (
      typeof s.gpsLat !== 'number' ||
      typeof s.gpsLon !== 'number' ||
      typeof targetState.lat !== 'number' ||
      typeof targetState.lon !== 'number' ||
      !global.AimMath
    ) {
      updateAimUI(null);
      if (global.CompassUI) {
        global.CompassUI.update(compassBase);
      }
      return;
    }

    var phone = {
      lat: s.gpsLat,
      lon: s.gpsLon,
      alt: typeof s.gpsAlt === 'number' ? s.gpsAlt : null,
      headingDeg:
        typeof s.headingDeg === 'number' ? s.headingDeg : null,
      pitchDeg:
        typeof s.pitchDeg === 'number' ? s.pitchDeg : null
    };

    var target = {
      lat: targetState.lat,
      lon: targetState.lon,
      alt:
        typeof targetState.elevation === 'number'
          ? targetState.elevation
          : null
    };

    var sol = global.AimMath.solution(phone, target);
    updateAimUI(sol);

    if (global.CompassUI) {
      global.CompassUI.update({
        currentHeadingDeg: compassBase.currentHeadingDeg,
        currentPitchDeg: compassBase.currentPitchDeg,
        targetHeadingDeg: sol.requiredHeadingDeg,
        headingErrorDeg: sol.headingErrorDeg,
        targetPitchDeg: sol.requiredPitchDeg,
        pitchErrorDeg: sol.pitchErrorDeg,
        toleranceDeg: compassBase.toleranceDeg
      });
    }
  }

  // ---- Init & Wiring ----

  function init() {
    var startBtn = $('startBtn');

    if (!global.Sensors) {
      var comboStatusEl = $('comboStatus');
      var statusTextEl = $('statusText');
      comboStatusEl.textContent = 'Error: sensors.js not loaded';
      statusTextEl.textContent =
        'Sensors core script is missing. Make sure sensors.js is in the same folder.';
      if (startBtn) startBtn.disabled = true;
      return;
    }

    // Init compass UI if present
    if (global.CompassUI) {
      global.CompassUI.init({
        headingCanvasId: 'headingCompass',
        pitchCanvasId: 'pitchCompass',
        toleranceDeg: 3
      });
      global.CompassUI.update({});
    }

    // Wire sensor updates
    global.Sensors.onUpdate(function (state) {
      updateSensorsUI(state);
      recomputeAim();
    });

    // Start sensors on button click
    if (startBtn) {
      startBtn.addEventListener('click', function () {
        startBtn.disabled = true;
        global.Sensors.start();
      });
    }

    // Target select button
    var selectTargetBtn = $('selectTargetBtn');
    if (selectTargetBtn && global.TargetMap) {
      selectTargetBtn.addEventListener('click', function () {
        global.TargetMap.open({
          onConfirm: function (target) {
            if (!target) return;
            targetState.lat =
              typeof target.lat === 'number' ? target.lat : null;
            targetState.lon =
              typeof target.lon === 'number' ? target.lon : null;
            targetState.elevation =
              typeof target.elevation === 'number' ? target.elevation : null;
            updateTargetUI();
            recomputeAim();
          }
        });
      });
    }

    // Initial UI
    updateTargetUI();
    updateAimUI(null);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
