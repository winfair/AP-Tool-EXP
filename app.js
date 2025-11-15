// app.js
// Minimal UI that uses SensorHub for lat/lon/elev/heading/pitch.
(function () {
  "use strict";

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function render(state) {
    if (!state) return;

    // Live status: combine high-level summary
    if (els.liveStatus) {
      var msg = "Sensors idle";
      if (state.gpsStatus && state.oriStatus) {
        msg =
          "GPS: " +
          state.gpsStatus +
          " · ORI: " +
          state.oriStatus;
      }
      els.liveStatus.textContent = msg;
    }

    // GPS
    if (els.gpsLat) {
      els.gpsLat.textContent =
        typeof state.gpsLat === "number" ? state.gpsLat.toFixed(6) : "—";
    }
    if (els.gpsLon) {
      els.gpsLon.textContent =
        typeof state.gpsLon === "number" ? state.gpsLon.toFixed(6) : "—";
    }
    if (els.gpsAlt) {
      if (typeof state.gpsAlt === "number") {
        els.gpsAlt.textContent = state.gpsAlt.toFixed(1) + " m";
      } else {
        els.gpsAlt.textContent = "—";
      }
    }
    if (els.gpsAcc) {
      if (typeof state.gpsAcc === "number") {
        els.gpsAcc.textContent = state.gpsAcc.toFixed(1) + " m";
      } else {
        els.gpsAcc.textContent = "—";
      }
    }

    // Orientation
    if (els.heading) {
      els.heading.textContent =
        typeof state.headingDeg === "number"
          ? state.headingDeg.toFixed(1) + "°"
          : "—";
    }
    if (els.pitch) {
      els.pitch.textContent =
        typeof state.pitchDeg === "number"
          ? state.pitchDeg.toFixed(1) + "°"
          : "—";
    }
  }

  function init() {
    // Grab DOM references
    els.liveStatus = $("live-status");

    els.gpsLat = $("gps-lat");
    els.gpsLon = $("gps-lon");
    els.gpsAlt = $("gps-alt");
    els.gpsAcc = $("gps-acc");

    els.heading = $("heading");
    els.pitch = $("pitch");

    var btnStart = $("btn-start-sensors");

    if (!window.SensorHub) {
      if (els.liveStatus) {
        els.liveStatus.textContent = "Error: SensorHub (sensors.js) not loaded.";
      }
      return;
    }

    // Subscribe to updates from SensorHub
    window.SensorHub.onUpdate(render);

    // Wire Start button
    if (btnStart) {
      btnStart.addEventListener("click", function () {
        if (els.liveStatus) {
          els.liveStatus.textContent = "Requesting permissions…";
        }
        // IMPORTANT: this call happens *inside* a user gesture.
        window.SensorHub.startAll();
      });
    }

    if (els.liveStatus) {
      els.liveStatus.textContent = "Ready. Tap 'Start sensors' to request permissions.";
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
