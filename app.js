// app.js
(function () {
  "use strict";

  const AP = (window.APTool = window.APTool || {});
  const s = AP.state;

  function openBackdrop(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add("open");
  }
  function closeBackdrop(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove("open");
  }

  // ---- Calibration helpers ----

  function calibrateToTarget() {
    const gps = s.gps;
    const tgt = s.target;
    if (!gps || !tgt || typeof tgt.lat !== "number" || typeof tgt.lon !== "number") {
      AP.setLiveStatus("Need GPS + target to calibrate.");
      return;
    }
    if (s.lastHeadingRaw == null) {
      AP.setLiveStatus("Move/rotate phone to get heading first.");
      return;
    }

    const inv = AP.bearingDistance(gps.lat, gps.lon, tgt.lat, tgt.lon);
    const bearing = inv.bearing;

    let h = s.lastHeadingRaw;
    if (s.applyDeclination && s.declTotal != null) {
      h = AP.norm360(h + s.declTotal);
    }

    s.headingOffset = AP.wrap180(bearing - h);
    AP.setLiveStatus("Calibrated heading to target.");
    AP.scheduleUpdate();
  }

  function quickLevel() {
    if (s.lastPitchRaw == null) {
      AP.setLiveStatus("Move/tilt phone first to get pitch.");
      return;
    }
    s.pitchZeroOffset = -(s.pitchSign * s.lastPitchRaw);
    AP.setLiveStatus("Quick level: current pitch set as 0°.");
    AP.scheduleUpdate();
  }

  function resetAxes() {
    s.headingOffset = 0;
    s.pitchZeroOffset = 0;
    s.pitchSign = 1;
    AP.setLiveStatus("Axes reset.");
    AP.scheduleUpdate();
  }

  function flipPitchAxis() {
    s.pitchSign *= -1;
    AP.setLiveStatus(
      `Pitch axis now ${s.pitchSign === 1 ? "normal" : "inverted"}.`
    );
    AP.scheduleUpdate();
  }

  // ---- Settings wiring ----

  function wireSettings() {
    const btnSettings = document.getElementById("btn-settings");
    const btnCloseSettings = document.getElementById("btn-close-settings");
    const toggleDecl = document.getElementById("toggle-decl");
    const manualDeclRange = document.getElementById("manual-decl-range");
    const manualDeclNumber = document.getElementById("manual-decl-number");
    const selectAltMode = document.getElementById("select-alt-mode");
    const inputManualObs = document.getElementById("input-manual-obs");
    const inputInstH = document.getElementById("input-instrument-h");
    const inputGeoidOffset = document.getElementById("input-geoid-offset");

    if (btnSettings) {
      btnSettings.addEventListener("click", () => {
        // sync UI with state
        if (toggleDecl) toggleDecl.checked = !!s.applyDeclination;
        if (manualDeclRange)
          manualDeclRange.value = String(s.manualDeclination || 0);
        if (manualDeclNumber)
          manualDeclNumber.value = String(s.manualDeclination || 0);

        if (selectAltMode)
          selectAltMode.value = s.altMode === "manual" ? "manual" : "gps";

        if (inputManualObs)
          inputManualObs.value = String(s.manualObserverElev || 0);
        if (inputInstH) inputInstH.value = String(s.instrumentHeight || 1.5);
        if (inputGeoidOffset)
          inputGeoidOffset.value = String(s.gpsGeoidOffset || 0);

        openBackdrop("sheet-settings-backdrop");
      });
    }

    if (btnCloseSettings) {
      btnCloseSettings.addEventListener("click", () => {
        closeBackdrop("sheet-settings-backdrop");
      });
    }

    if (toggleDecl) {
      toggleDecl.addEventListener("change", () => {
        s.applyDeclination = toggleDecl.checked;
        AP.scheduleUpdate();
      });
    }

    function syncManualDecl(v) {
      const val = AP.clamp(v, -30, 30);
      s.manualDeclination = val;
      if (manualDeclRange) manualDeclRange.value = String(val);
      if (manualDeclNumber) manualDeclNumber.value = String(val);
      AP.scheduleUpdate();
    }

    if (manualDeclRange) {
      manualDeclRange.addEventListener("input", (e) => {
        syncManualDecl(parseFloat(e.target.value) || 0);
      });
    }
    if (manualDeclNumber) {
      manualDeclNumber.addEventListener("input", (e) => {
        syncManualDecl(parseFloat(e.target.value) || 0);
      });
    }

    if (selectAltMode) {
      selectAltMode.addEventListener("change", () => {
        s.altMode = selectAltMode.value === "manual" ? "manual" : "gps";
        AP.scheduleUpdate();
      });
    }

    if (inputManualObs) {
      inputManualObs.addEventListener("change", () => {
        const v = parseFloat(inputManualObs.value);
        s.manualObserverElev = isFinite(v) ? v : 0;
        AP.scheduleUpdate();
      });
    }

    if (inputInstH) {
      inputInstH.addEventListener("change", () => {
        const v = parseFloat(inputInstH.value);
        s.instrumentHeight = isFinite(v) ? v : 1.5;
        AP.scheduleUpdate();
      });
    }

    if (inputGeoidOffset) {
      inputGeoidOffset.addEventListener("change", () => {
        const v = parseFloat(inputGeoidOffset.value);
        s.gpsGeoidOffset = isFinite(v) ? v : 0;
        AP.scheduleUpdate();
      });
    }
  }

  // ---- Target elevation sheet ----

  function wireTargetElevSheet() {
    const btnEdit = document.getElementById("btn-edit-target-elev");
    const btnClose = document.getElementById("btn-close-target-elev");
    const btnSave = document.getElementById("btn-elev-save");
    const input = document.getElementById("edit-target-elev");
    const info = document.getElementById("target-elev-info");

    if (btnEdit) {
      btnEdit.addEventListener("click", () => {
        if (!s.target || typeof s.target.elev !== "number") {
          if (info) info.textContent = "No target elevation to edit yet.";
          return;
        }
        if (input) input.value = String(s.target.elev);
        if (info)
          info.textContent =
            "Enter elevation in meters for the current target point.";
        openBackdrop("sheet-target-elev-backdrop");
      });
    }

    if (btnClose) {
      btnClose.addEventListener("click", () => {
        closeBackdrop("sheet-target-elev-backdrop");
      });
    }

    if (btnSave && input) {
      btnSave.addEventListener("click", () => {
        if (!s.target) {
          if (info) info.textContent = "No target selected.";
          return;
        }
        const v = parseFloat(input.value);
        if (!isFinite(v)) {
          if (info) info.textContent = "Please enter a valid number.";
          return;
        }
        s.target = Object.assign({}, s.target, {
          elev: v,
          source: "manual",
        });

        const elevEl = document.getElementById("target-elev");
        const srcEl = document.getElementById("target-elev-src");
        const statusEl = document.getElementById("target-status");

        if (elevEl) elevEl.textContent = v.toFixed(1);
        if (srcEl) srcEl.textContent = "manual";
        if (statusEl) statusEl.textContent = "Target elevation set";

        AP.scheduleUpdate();
      });
    }
  }

  // ---- Main UI wiring ----

  function wireMainUI() {
    const btnSensors = document.getElementById("btn-sensors");
    const btnMap = document.getElementById("btn-map");
    const btnCalibTarget = document.getElementById("btn-calib-target");
    const btnCalibAxes = document.getElementById("btn-calib-axes");
    const btnQuickLevel = document.getElementById("btn-quick-level");
    const btnResetAxes = document.getElementById("btn-reset-axes");
    const btnCloseMap = document.getElementById("btn-close-map");

    if (btnSensors) {
      btnSensors.addEventListener("click", () => {
        btnSensors.disabled = true;
        btnSensors.textContent = "Sensors running";
        AP.startSensors();
      });
    }
    if (btnMap) {
      btnMap.addEventListener("click", () => {
        AP.openMapSheet();
      });
    }
    if (btnCloseMap) {
      btnCloseMap.addEventListener("click", () => {
        AP.closeMapSheet();
      });
    }
    if (btnCalibTarget) {
      btnCalibTarget.addEventListener("click", () => {
        calibrateToTarget();
      });
    }
    if (btnCalibAxes) {
      btnCalibAxes.addEventListener("click", () => {
        flipPitchAxis();
      });
    }
    if (btnQuickLevel) {
      btnQuickLevel.addEventListener("click", () => {
        quickLevel();
      });
    }
    if (btnResetAxes) {
      btnResetAxes.addEventListener("click", () => {
        resetAxes();
      });
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    if (AP.setLiveStatus) AP.setLiveStatus("Ready");
    if (AP.setSensorStatus) AP.setSensorStatus("Sensors idle");

    wireMainUI();
    wireSettings();
    wireTargetElevSheet();

    if (AP.scheduleUpdate) AP.scheduleUpdate();
  });
})();
