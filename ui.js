// ui.js
// DOM wiring: sensors + target + aim + compass + calibration + saved targets.

(function (w) {
  'use strict';

  const $ = id => document.getElementById(id);

  const target = { lat: null, lon: null, elevation: null };

  const STORAGE_KEY = 'aptool_saved_targets_v1';
  let savedTargets = [];
  let editingId = null;

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

  /* --------- Saved targets persistence ---------- */

  function loadSavedTargets() {
    savedTargets = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return;
      savedTargets = arr
        .filter(t => t && typeof t === 'object')
        .map(t => {
          const lat = parseFloat(t.lat);
          const lon = parseFloat(t.lon);
          const elevation = t.elevation === null || t.elevation === undefined
            ? null
            : parseFloat(t.elevation);
          return {
            id: String(t.id || (Date.now() + '_' + Math.random().toString(16).slice(2))),
            name: (t.name && String(t.name)) || 'Target',
            lat: isFinite(lat) ? lat : NaN,
            lon: isFinite(lon) ? lon : NaN,
            elevation: isFinite(elevation) ? elevation : null
          };
        })
        .filter(t => isFinite(t.lat) && isFinite(t.lon));
    } catch (_) {
      savedTargets = [];
    }
  }

  function persistSavedTargets() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedTargets));
    } catch (_) {}
  }

  function updateSavedTargetsUI() {
    const box = $('savedTargetsBox');
    const list = $('savedTargetsList');
    if (!box || !list) return;

    if (!savedTargets.length) {
      box.style.display = 'none';
      list.innerHTML = '';
      return;
    }

    box.style.display = 'block';
    list.innerHTML = savedTargets.map(t => {
      const lat = isFinite(t.lat) ? t.lat.toFixed(4) : '—';
      const lon = isFinite(t.lon) ? t.lon.toFixed(4) : '—';
      const elev = isFinite(t.elevation) ? (t.elevation.toFixed(0) + ' m') : '—';
      const name = t.name || 'Target';
      return (
        `<div class="saved-target-row" data-id="${t.id}">` +
          `<div>` +
            `<div class="saved-name">${name}</div>` +
            `<div class="saved-meta">${lat}, ${lon} · ${elev}</div>` +
          `</div>` +
          `<div style="display:flex;gap:4px;flex-shrink:0;">` +
            `<button class="btn-mini" data-action="load" data-id="${t.id}">&gt; LOAD</button>` +
            `<button class="btn-mini" data-action="edit" data-id="${t.id}">EDIT</button>` +
            `<button class="btn-mini" data-action="delete" data-id="${t.id}">X</button>` +
          `</div>` +
        `</div>`
      );
    }).join('');
  }

  function openSavePanel(existing) {
    const panel = $('saveTargetPanel');
    if (!panel) return;

    const nameInput = $('saveTargetName');
    const latInput = $('saveTargetLat');
    const lonInput = $('saveTargetLon');
    const elevInput = $('saveTargetElev');

    editingId = existing && existing.id ? existing.id : null;

    const baseLat = existing && isFinite(existing.lat)
      ? existing.lat
      : (isFinite(target.lat) ? target.lat : null);
    const baseLon = existing && isFinite(existing.lon)
      ? existing.lon
      : (isFinite(target.lon) ? target.lon : null);
    const baseElev = (existing && isFinite(existing.elevation))
      ? existing.elevation
      : (isFinite(target.elevation) ? target.elevation : null);

    nameInput.value =
      (existing && existing.name)
        ? existing.name
        : (baseLat != null && baseLon != null ? 'Target ' + (savedTargets.length + 1) : '');

    latInput.value = baseLat != null ? baseLat.toFixed(6) : '';
    lonInput.value = baseLon != null ? baseLon.toFixed(6) : '';
    elevInput.value = baseElev != null ? baseElev.toFixed(1) : '';

    panel.style.display = 'block';
  }

  function closeSavePanel() {
    const panel = $('saveTargetPanel');
    if (!panel) return;
    editingId = null;
    panel.style.display = 'none';
  }

  function onSaveConfirm() {
    const nameInput = $('saveTargetName');
    const latInput = $('saveTargetLat');
    const lonInput = $('saveTargetLon');
    const elevInput = $('saveTargetElev');
    if (!latInput || !lonInput || !nameInput) return;

    const lat = parseFloat(latInput.value);
    const lon = parseFloat(lonInput.value);
    const elev = elevInput.value === '' ? null : parseFloat(elevInput.value);

    if (!isFinite(lat) || !isFinite(lon)) {
      return; // invalid
    }

    const name = nameInput.value && nameInput.value.trim()
      ? nameInput.value.trim()
      : 'Target ' + (savedTargets.length + 1);

    if (editingId) {
      const idx = savedTargets.findIndex(t => t.id === editingId);
      if (idx !== -1) {
        savedTargets[idx].name = name;
        savedTargets[idx].lat = lat;
        savedTargets[idx].lon = lon;
        savedTargets[idx].elevation = isFinite(elev) ? elev : null;
      }
    } else {
      const id = String(Date.now()) + '_' + Math.random().toString(16).slice(2);
      savedTargets.push({
        id,
        name,
        lat,
        lon,
        elevation: isFinite(elev) ? elev : null
      });
    }

    persistSavedTargets();
    updateSavedTargetsUI();
    closeSavePanel();

    // Also set as current active target
    target.lat = lat;
    target.lon = lon;
    target.elevation = isFinite(elev) ? elev : null;
    updateTargetUI();
    recomputeAim();
  }

  function handleSavedTargetsClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    if (!id || !action) return;

    const idx = savedTargets.findIndex(t => t.id === id);
    if (idx === -1) return;
    const t = savedTargets[idx];

    if (action === 'load') {
      // DEFINITELY set current target + update UI
      target.lat = t.lat;
      target.lon = t.lon;
      target.elevation = t.elevation != null ? t.elevation : null;

      updateTargetUI();
      recomputeAim();
    } else if (action === 'edit') {
      openSavePanel(t);
    } else if (action === 'delete') {
      savedTargets.splice(idx, 1);
      persistSavedTargets();
      updateSavedTargetsUI();
    }
  }

  /* --------- Sensors UI ---------- */

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
      support.textContent = 'Orientation not supported';
      support.className = 'mini-pill bad';
    } else if (s.oriStatus === 'denied') {
      support.textContent = 'Permission denied';
      support.className = 'mini-pill bad';
    } else if (s.oriStatus === 'listening') {
      if (!support.textContent.includes('Calibrated')) {
        support.textContent = 'Orientation live';
        support.className = 'mini-pill ok';
      }
    } else if (s.oriStatus === 'requesting') {
      support.textContent = 'Requesting permission…';
      support.className = 'mini-pill warn';
    } else {
      if (!support.textContent.includes('Calibrated')) {
        support.textContent = 'Waiting for start…';
        support.className = 'mini-pill';
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
      txt.textContent = 'Ready. Tap <START SENSORS> and accept prompts.';
    }
  }

  /* --------- Target UI ---------- */

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
      txt.textContent = 'No target selected. Use <SELECT TARGET> or load a saved point.';
    } else if (!isFinite(target.elevation)) {
      pill.textContent = 'Target set (no elev)';
      txt.textContent = 'Target chosen. Elevation not available or still loading.';
    } else {
      pill.textContent = 'Target set';
      txt.textContent = 'Target selected and elevation loaded.';
    }
  }

  /* --------- Aim UI ---------- */

  function updateAimUI(sol) {
    const stat = $('aimStatusPill'),
      rh = $('aimReqHeading'), rp = $('aimReqPitch'),
      he = $('aimHeadingErr'), pe = $('aimPitchErr'),
      hd = $('aimHorizDist'), vd = $('aimVertDelta');

    if (!sol || !sol.valid || sol.bearingDeg == null) {
      stat.textContent = 'NO TARGET';
      rh.textContent = rp.textContent = he.textContent =
        pe.textContent = hd.textContent = vd.textContent = '—';
      return;
    }

    stat.textContent = 'READY';
    rh.textContent = fmt.angH(sol.requiredHeadingDeg);
    rp.textContent = isFinite(sol.requiredPitchDeg) ? fmt.ang(sol.requiredPitchDeg) : '—';
    he.textContent = isFinite(sol.headingErrorDeg) ? fmt.ang(sol.headingErrorDeg) : '—';
    pe.textContent = isFinite(sol.pitchErrorDeg) ? fmt.ang(sol.pitchErrorDeg) : '—';
    hd.textContent = fmt.dist(sol.horizontalDistanceM);
    vd.textContent = isFinite(sol.verticalDeltaM) ? fmt.distSigned(sol.verticalDeltaM) : '—';
  }

  /* --------- Recompute aim + compass ---------- */

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
      updateAimUI(null);
      C && C.update(base);
      return;
    }

    const magH = isFinite(s.headingDeg) ? s.headingDeg : null;
    base.currentHeadingDeg = magH == null ? null : toTrue(magH);

    const haveGeo = isFinite(s.gpsLat) && isFinite(s.gpsLon) &&
                    isFinite(target.lat) && isFinite(target.lon);
    if (!haveGeo || !A) {
      updateAimUI(null);
      C && C.update(base);
      return;
    }

    const phone = {
      lat: s.gpsLat,
      lon: s.gpsLon,
      alt: isFinite(s.gpsAlt) ? s.gpsAlt : null,
      headingDeg: base.currentHeadingDeg,
      pitchDeg: base.currentPitchDeg
    };
    const tgt = {
      lat: target.lat,
      lon: target.lon,
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

  /* --------- Calibration ---------- */

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

  /* --------- Init ---------- */

  function init() {
    const S = w.Sensors;
    if (!S) {
      $('comboStatus').textContent = 'Error: sensors.js missing';
      $('statusText').textContent = 'Ensure sensors.js is present.';
      return;
    }

    if (w.CompassUI) {
      w.CompassUI.init({
        headingCanvasId: 'headingCompass',
        pitchCanvasId: 'pitchCompass',
        toleranceDeg: 3
      });
      w.CompassUI.update({});
    }

    const declInput = $('declInput');
    if (declInput && w.Declination && w.Declination.bindInput) {
      w.Declination.bindInput(declInput);
    }

    loadSavedTargets();
    updateSavedTargetsUI();

    S.onUpdate(s => {
      updateSensorsUI(s);
      recomputeAim();
    });

    const startBtn = $('startBtn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        startBtn.classList.add('disabled');
        startBtn.disabled = true;
        S.start();
      });
    }

    const selectBtn = $('selectTargetBtn');
    if (selectBtn && w.TargetMap) {
      selectBtn.addEventListener('click', () => {
        w.TargetMap.open({
          onConfirm: t => {
            if (!t) return;
            target.lat = isFinite(t.lat) ? t.lat : null;
            target.lon = isFinite(t.lon) ? t.lon : null;
            target.elevation = isFinite(t.elevation) ? t.elevation : null;
            updateTargetUI();
            recomputeAim();
          }
        });
      });
    }

    const calBtn = $('calibrateHeadingBtn');
    if (calBtn) calBtn.addEventListener('click', calibrateToTarget);

    const openSaveBtn = $('openSaveTargetBtn');
    if (openSaveBtn) openSaveBtn.addEventListener('click', () => openSavePanel(null));

    const saveConfirmBtn = $('saveTargetConfirmBtn');
    if (saveConfirmBtn) saveConfirmBtn.addEventListener('click', onSaveConfirm);

    const saveCancelBtn = $('saveTargetCancelBtn');
    if (saveCancelBtn) saveCancelBtn.addEventListener('click', closeSavePanel);

    const savedList = $('savedTargetsList');
    if (savedList) savedList.addEventListener('click', handleSavedTargetsClick);

    updateTargetUI();
    updateAimUI(null);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
