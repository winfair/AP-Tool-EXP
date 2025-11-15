// sensors.js
// Dedicated module for GPS + orientation permissions and parsed values.
// Exposes window.SensorHub with:
//   - SensorHub.startAll()
//   - SensorHub.startGPS()
//   - SensorHub.startOrientation()
//   - SensorHub.onUpdate(function (state) {})
//   - SensorHub.getState()
(function (global) {
  "use strict";

  var state = {
    // GPS
    gpsLat: null,
    gpsLon: null,
    gpsAlt: null,  // elevation (meters) if available
    gpsAcc: null,  // accuracy (meters) if available
    gpsStatus: "idle",  // "idle" | "requesting" | "ok" | "error:..." | "unsupported"

    // Orientation
    headingDeg: null,   // degrees, 0–360
    pitchDeg: null,     // degrees, front/back tilt
    oriStatus: "idle",  // "idle" | "requesting" | "listening" | "denied" | "error:..." | "unsupported"

    // internal
    _gpsWatchId: null,
    _oriAttached: false
  };

  var listeners = [];

  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](state);
      } catch (e) {
        // swallow listener errors
      }
    }
  }

  function onUpdate(cb) {
    if (typeof cb === "function") {
      listeners.push(cb);
      // immediately give current state
      cb(state);
    }
  }

  function deg2rad(d) {
    return (d * Math.PI) / 180;
  }

  function norm360(d) {
    var x = d % 360;
    if (x < 0) x += 360;
    return x;
  }

  function screenOrientationAngle() {
    var o = global.screen && global.screen.orientation;
    if (o && typeof o.angle === "number") return o.angle;
    return 0;
  }

  // ----- GPS -----

  function startGPS() {
    if (!("geolocation" in navigator)) {
      state.gpsStatus = "unsupported";
      notify();
      return;
    }

    if (state._gpsWatchId != null) {
      // already running
      return;
    }

    state.gpsStatus = "requesting";
    notify();

    var opts = {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000
    };

    state._gpsWatchId = navigator.geolocation.watchPosition(
      function (pos) {
        var c = pos && pos.coords ? pos.coords : {};
        state.gpsLat = typeof c.latitude === "number" ? c.latitude : null;
        state.gpsLon = typeof c.longitude === "number" ? c.longitude : null;
        state.gpsAlt = typeof c.altitude === "number" ? c.altitude : null;
        state.gpsAcc = typeof c.accuracy === "number" ? c.accuracy : null;
        state.gpsStatus = "ok";
        notify();
      },
      function (err) {
        var msg =
          err && err.message
            ? err.message
            : (err && err.code ? "code " + err.code : "unknown");
        state.gpsStatus = "error:" + msg;
        notify();
      },
      opts
    );
  }

  // ----- Orientation -----

  function handleOrientation(ev) {
    var heading = null;

    // iOS webkitCompassHeading
    if (typeof ev.webkitCompassHeading === "number") {
      heading = ev.webkitCompassHeading;
    } else if (typeof ev.alpha === "number") {
      // alpha is usually around 0 when facing "north-ish", but vendors differ.
      // We'll just treat it as heading-ish and adjust by screen orientation.
      heading = norm360(ev.alpha + screenOrientationAngle());
    }

    if (heading != null && isFinite(heading)) {
      state.headingDeg = heading;
    }

    if (typeof ev.beta === "number" && isFinite(ev.beta)) {
      // beta is front/back tilt; treat as pitch
      state.pitchDeg = ev.beta;
    }

    state.oriStatus = "listening";
    notify();
  }

  function attachOrientationListener() {
    if (state._oriAttached) return;
    if (!("DeviceOrientationEvent" in global)) {
      state.oriStatus = "unsupported";
      notify();
      return;
    }

    global.addEventListener("deviceorientation", handleOrientation, false);
    state._oriAttached = true;
    state.oriStatus = "listening";
    notify();
  }

  function startOrientation() {
    if (!("DeviceOrientationEvent" in global)) {
      state.oriStatus = "unsupported";
      notify();
      return;
    }

    try {
      // iOS 13+ requires explicit permission; MUST be called in a user gesture.
      if (
        typeof global.DeviceOrientationEvent.requestPermission === "function"
      ) {
        state.oriStatus = "requesting";
        notify();

        global.DeviceOrientationEvent.requestPermission()
          .then(function (res) {
            if (res === "granted") {
              attachOrientationListener();
            } else {
              state.oriStatus = "denied";
              notify();
            }
          })
          .catch(function (e) {
            state.oriStatus = "error:" + (e && e.message ? e.message : "unknown");
            notify();
          });
      } else {
        // Non-iOS / older
        attachOrientationListener();
      }
    } catch (e) {
      state.oriStatus = "error:" + (e && e.message ? e.message : "unknown");
      notify();
    }
  }

  function startAll() {
    // IMPORTANT: call this from a click/tap handler so iOS treats it as a user gesture.
    startGPS();
    startOrientation();
  }

  // ----- Public API -----

  global.SensorHub = {
    startAll: startAll,
    startGPS: startGPS,
    startOrientation: startOrientation,
    onUpdate: onUpdate,
    getState: function () {
      return state;
    }
  };
})(window);
