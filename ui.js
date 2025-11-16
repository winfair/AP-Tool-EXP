// ui.js
// DOM wiring: sensors + target + aim + compass + calibration.

(function (w) {
  'use strict';

  const $ = id => document.getElementById(id);

  const target = { lat: null, lon: null, elevation: null };

  const fmt = {
    ang: v => !isFinite(v) ? '—' : v.toFixed(1) + '°',
    angH: v => !isFinite(v) ? '—' : (((v % 360) + 360) % 360).toFixed(1) + '°',
    dist: m => !isFinite(m) ? '—' : (Math.abs(m) >= 1000 ? (m / 1000).toFixed(2) + ' km' : m.toFixed(1) + ' m'),
    distSigned: m => !isFinite(m) ? '—' : (m.toFixed(1) + ' m ' + (m > 0 ? '↑' : m < 0 ? '↓' : '')).trim()
  };

  function toTrue(mag) {
    if (!isFinite(mag) || !w.Declination || !w.Declination.magneticToTrue) return mag;
    const t = w.Declination.magneticToTrue(mag);
    return isFinite(t) ? t : mag;
  }

  // ---------- Sensors UI ----------

  function updateSensorsUI(s) {
    const combo = $('comboStatus'), txt = $('statusText');

    $('gpsStatusPill').textContent = 'gps: ' + s.gpsStatus;
    $('gpsLat').textContent = isFinite(s.gpsLat) ? s.gpsLat.toFixed(6) : '—';
    $('gpsLon').textContent = isFinite(s.gpsLon) ? s.gpsLon.toFixed(6) : '—';
    $('gpsAlt').textContent = isFinite(s.gpsAlt) ? s.gpsAlt.toFixed(1) + ' m' : '—';

    if (s.gpsError) {
      $('gpsErrorBox').style.display = 'block';
      $('gpsError').textContent = s.gpsError;
    } else {
      $('gpsErrorBox').style.display = 'none';
    }

    $('oriStatusPill').textContent = 'ori: ' + s.oriStatus;

    const magH = isFinite(s.headingDeg) ? s.headingDeg : null;
    const trueH = magH == null ? null : toTrue(magH);
    $('headingVal').textContent = trueH == null ? '—' : trueH.toFixed(1) + '°';
    $('pitchVal').textContent = isFinite(s.pitchDeg) ? s.pitchDeg.toFixed(1) + '°' : '—';

    if (s.oriError) {
      $('oriErrorBox').style.display = 'block';
      $('oriError').textContent = s.oriError;
    } else {
      $('oriErrorBox').style.display = 'none';
    }

    const support = $('oriSupportPill');
    if (s.oriStatus === 'unsupported') {
      support.textContent = 'Orientation not supported'; support.className = 'mini-pill bad';
    } else if (s.oriStatus === 'denied') {
      support.textContent = 'Permission denied'; support.className = 'mini-pill bad';
    } else if (s.oriStatus === 'listening') {
      if (!support.textContent.includes('Calibrated')) {
        support.textContent = 'Orientation live'; support.className = 'mini-pill ok';
      }
    } else if (s.oriStatus === 'requesting') {
      support.textContent = 'Requesting permission…'; support.className = 'mini-pill warn';
    } else {
      if (!support.textContent.includes('Calibrated')) {
        support.textContent = 'Waiting for start…'; support.className = 'mini-pill';
      }
    }

    combo.textContent = `gps: ${s.gpsStatus} · ori: ${s.oriStatus}`;

    if (s.gpsStatus === 'ok' || s.oriStatus === 'listening') {
      txt.textContent = 'Sensors live. Move and rotate the phone to see updates.';
    } else if (s.gpsStatus === 'denied' || s.oriStatus === 'denied') {
      txt.textContent = 'Some permissions denied. Check browser/site settings.';
    } else if (s.gpsStatus === 'unsupported' || s.oriStatus === 'unsupported') {
      txt.textContent = 'This browser does not support at least one sensor.';
    } else if (s.gpsStatus === 'requesting' || s.oriStatus === 'requesting') {
      txt.textContent = 'Waiting for permission. If no prompt, check settings.';
    } else {
      txt.textContent = 'Ready. Tap “Start sensors” and accept prompts.';
    }
  }

  // ---------- Target UI ----------

  function updateTargetUI() {
    const hasTarget = isFinite(target.lat) && isFinite(target.lon);
    $('targetLat').textContent = hasTarget ? target.lat.toFixed(6) : '—';
    $('targetLon').textContent = hasTarget ? target.lon.toFixed(6) : '—';
    $('targetElev').textContent =
      hasTarget && isFinite(target.elevation) ? target.elevation.toFixed(1) + ' m' : (hasTarget ? '—' : '—');

    const pill = $('targetStatusPill');
    const txt = $('targetStatusText');
    if (!hasTarget) {
      pill.textContent = 'No target';
      txt.textContent = 'Tap “Select Target” to choose a point on the map.';
    } else if (!isFinite(target.elevation)) {
      pill.textContent = 'Target set (no elev)';
      txt.textContent = 'Target chosen. Elevation not available or still loading.';
    } else {
      pill.textContent = 'Target set';
      txt.textContent = 'Target selected and elevation loaded.';
    }
  }

  // ---------- Aim UI ----------

  function updateAimUI(sol) {
    const stat = $('aimStatusPill'),
      rh = $('aimReqHeading'), rp = $('aimReqPitch'),
      he = $('aimHeadingErr'), pe = $('aimPitchErr'),
      hd = $('aimHorizDist'), vd = $('aimVertDelta');

    if (!sol || !sol.valid || sol.bearingDeg == null) {
      stat.textContent = 'No target';
      rh.textContent = rp.textContent = he.textContent = pe.textContent = hd.textContent = vd.textContent = '—';
      return;
    }

    stat.textContent = 'Ready';
    rh.textContent = fmt.angH(sol.requiredHeadingDeg);
    rp.textContent = isFinite(sol.requiredPitchDeg) ? fmt.ang(sol.requiredPitchDeg) : '—';
    he.textContent = isFinite(sol.headingErrorDeg) ? fmt.ang(sol.headingErrorDeg) : '—';
    pe.textContent = isFinite(sol.pitchErrorDeg) ? fmt.ang(sol.pitchErrorDeg) : '—';
    hd.textContent = fmt.dist(sol.horizontalDistanceM);
    vd.textContent = isFinite(sol.verticalDeltaM) ? fmt.distSigned(sol.verticalDeltaM) : '—';
  }

  // ---------- Recompute aim + compass ----------

  function recomputeAim() {
    const S = w.Sensors, A = w.AimMath, C = w.CompassUI;
    if (!S) return;

    const s = S.getState ? S.getState() : null;
    const base = {
      currentHeadingDeg: null,
      currentPitchDeg: s && isFinite(s.pitchDeg) ? s.pitchDeg : null,
      toleranceDeg: 3
    };

    if (!s) {
      updateAimUI(null); C && C.update(base); return;
    }

    const magH = isFinite(s.headingDeg) ? s.headingDeg : null;
    base.currentHeadingDeg = magH == null ? null : toTrue(magH);

    const haveGeo = isFinite(s.gpsLat) && isFinite(s.gpsLon) &&
                    isFinite(target.lat) && isFinite(target.lon);
    if (!haveGeo || !A) {
      updateAimUI(null); C && C.update(base); return;
    }

    const phone = {
      lat: s.gpsLat, lon: s.gpsLon,
      alt: isFinite(s.gpsAlt) ? s.gpsAlt : null,
      headingDeg: base.currentHeadingDeg,
      pitchDeg: base.currentPitchDeg
    };
    const tgt = {
      lat: target.lat, lon: target.lon,
      alt: isFinite(target.elevation) ? target.elevation : null
    };

    const sol = A.solution(phone, tgt);
    updateAimUI(sol);

    C && C.update({
      currentHeadingDeg: base.currentHeadingDeg,
      currentPitchDeg: base.currentPitchDeg,
      targetHeadingDeg: sol.requiredHeadingDeg,
      headingErrorDeg: sol.headingErrorDeg,
      targetPitchDeg: sol.requiredPitchDeg,
      pitchErrorDeg: sol.pitchErrorDeg,
      toleranceDeg: base.toleranceDeg
    });
  }

  // ---------- Calibration ----------

  function calibrateToTarget() {
    const S = w.Sensors, D = w.Declination, A = w.AimMath;
    if (!S || !D || !A) return;
    const s = S.getState ? S.getState() : null;
    if (!s || !isFinite(s.headingDeg) || !isFinite(s.gpsLat) || !isFinite(s.gpsLon) ||
        !isFinite(target.lat) || !isFinite(target.lon)) return;

    const sol = A.solution(
      { lat: s.gpsLat, lon: s.gpsLon, alt: isFinite(s.gpsAlt) ? s.gpsAlt : null, headingDeg: 0, pitchDeg: 0 },
      { lat: target.lat, lon: target.lon, alt: isFinite(target.elevation) ? target.elevation : null }
    );
    if (!sol || !sol.valid || !isFinite(sol.requiredHeadingDeg)) return;

    D.calibrate(s.headingDeg, sol.requiredHeadingDeg);

    const pill = $('oriSupportPill');
    pill.textContent = 'Calibrated to target';
    pill.className = 'mini-pill ok';

    recomputeAim();
  }

  // ---------- Init ----------

  function init() {
    const S = w.Sensors;
    if (!S) {
      $('comboStatus').textContent = 'Error: sensors.js missing';
      $('statusText').textContent = 'Ensure sensors.js is present.'; return;
    }

    if (w.CompassUI) {
      w.CompassUI.init({ headingCanvasId: 'headingCompass', pitchCanvasId: 'pitchCompass', toleranceDeg: 3 });
      w.CompassUI.update({});
    }

    const declInput = $('declInput');
    if (declInput && w.Declination && w.Declination.bindInput) {
      w.Declination.bindInput(declInput);
    }

    S.onUpdate(s => { updateSensorsUI(s); recomputeAim(); });

    const startBtn = $('startBtn');
    if (startBtn) startBtn.addEventListener('click', () => { startBtn.disabled = true; S.start(); });

    const selectBtn = $('selectTargetBtn');
    if (selectBtn && w.TargetMap) {
      selectBtn.addEventListener('click', () => {
        w.TargetMap.open({
          onConfirm: t => {
            if (!t) return;
            target.lat = isFinite(t.lat) ? t.lat : null;
            target.lon = isFinite(t.lon) ? t.lon : null;
            target.elevation = isFinite(t.elevation) ? t.elevation : null;
            updateTargetUI(); recomputeAim();
          }
        });
      });
    }

    const calBtn = $('calibrateHeadingBtn');
    if (calBtn) calBtn.addEventListener('click', calibrateToTarget);

    updateTargetUI();
    updateAimUI(null);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
