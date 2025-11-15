// sensors.js
// Dedicated module for geolocation + orientation permissions and values.
// Exposes window.SensorHub with:
//   - SensorHub.startAll()        // call inside a user gesture (click/tap)
//   - SensorHub.startGPS()
//   - SensorHub.startOrientation()
//   - SensorHub.onUpdate(fn)
//   - SensorHub.getState()

(function (global) {
  "use strict";

  var state = {
    // Geolocation
    gpsLat: null,
    gpsLon: null,
    gpsAlt: null,   // meters
    gpsAcc: null,   // meters
    gpsStatus: "idle",   // "idle" | "requesting" | "ok" | "denied" | "error:..." | "unsupported"

    // Orientation
    headingDeg: null,    // 0–360
    pitchDeg: null,      // roughly -180..180 front/back tilt
    oriStatus: "idle",   // "idle" | "requesting" | "listening" | "denied" | "error:..." | "unsupported"

    // internals
    _gpsWatchId: null,
    _oriAttached: false
  };

  var listeners = [];

  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](state);
      } catch (e) {
        // ignore listener errors
      }
    }
  }

  function onUpdate(cb) {
    if (typeof cb === "function") {
      listeners.push(cb);
      cb(state); // push current state immediately
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

  // --- Geolocation helpers ---

  function handleGeoSuccess(pos, fromGetCurrent) {
    var c = pos && pos.coords ? pos.coords : {};
    state.gpsLat = typeof c.latitude === "number" ? c.latitude : null;
    state.gpsLon = typeof c.longitude === "number" ? c.longitude : null;
    state.gpsAlt = typeof c.altitude === "number" ? c.altitude : null;
    state.gpsAcc = typeof c.accuracy === "number" ? c.accuracy : null;
    state.gpsStatus = "ok";
    notify();

    // After initial allow, start watchPosition for live updates
    if (fromGetCurrent) {
      startGeoWatch();
    }
  }

  function handleGeoError(err) {
    // PERMISSION_DENIED is code 1 in the spec
    // https://developer.mozilla.org/docs/Web/API/GeolocationPositionError :contentReference[oaicite:1]{index=1}
    if (err && typeof err.code === "number" && err.code === 1) {
      state.gpsStatus = "denied";
    } else {
      var msg = err && err.message ? err.message : "unknown";
      state.gpsStatus = "error:" + msg;
    }
    notify();
  }

  function startGeoWatch() {
    if (!("geolocation" in navigator)) {
      state.gpsStatus = "unsupported";
      notify();
      return;
    }
    if (state._gpsWatchId != null) {
      return; // already watching
    }

    var opts = {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 20000
    };

    state._gpsWatchId = navigator.geolocation.watchPosition(
      function (pos) {
        handleGeoSuccess(pos, false);
      },
      function (err) {
        handleGeoError(err);
      },
      opts
    );
  }

  function requestGeolocation() {
    if (!("geolocation" in navigator)) {
      state.gpsStatus = "unsupported";
      notify();
      return;
    }

    state.gpsStatus = "requesting";
    notify();

    // Using getCurrentPosition inside a user gesture triggers the permission prompt if needed. :contentReference[oaicite:2]{index=2}
    var opts = {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 20000
    };

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        handleGeoSuccess(pos, true);
      },
      function (err) {
        handleGeoError(err);
      },
      opts
    );
  }

  // --- Orientation helpers ---

  function handleOrientation(ev) {
    var heading = null;

    if (typeof ev.webkitCompassHeading === "number") {
      // iOS Safari compass heading (0 = North)
      heading = ev.webkitCompassHeading;
    } else if (typeof ev.alpha === "number") {
      // Generic deviceorientation: alpha is rotation around z-axis
      heading = norm360(ev.alpha + screenOrientationAngle());
    }

    if (heading != null && isFinite(heading)) {
      state.headingDeg = heading;
    }

    if (typeof ev.beta === "number" && isFinite(ev.beta)) {
      // beta is front/back tilt; treat as pitch
      state.pitchDeg = ev.beta;
    }

    if (state.oriStatus === "requesting") {
      state.oriStatus = "listening";
    }
    notify();
  }

  function attachOrientationListener() {
    if (state._oriAttached) return;

    if (!("DeviceOrientationEvent" in global)) {
      state.oriStatus = "unsupported";
      notify();
      return;
    }

    global.addEventListener("deviceorientation", handleOrientation, { passive: true });
    state._oriAttached = true;
    if (state.oriStatus === "idle" || state.oriStatus === "requesting") {
      state.oriStatus = "listening";
    }
    notify();
  }

  function requestOrientation() {
    if (!("DeviceOrientationEvent" in global)) {
      state.oriStatus = "unsupported";
      notify();
      return;
    }

    try {
      // iOS 14.5+ requires DeviceOrientationEvent.requestPermission() inside a user gesture. :contentReference[oaicite:3]{index=3}
      if (typeof global.DeviceOrientationEvent.requestPermission === "function") {
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
            var msg = e && e.message ? e.message : "unknown";
            state.oriStatus = "error:" + msg;
            notify();
          });
      } else {
        // Other browsers (Chrome, Firefox, Android) don't use requestPermission; just attach listener.
        attachOrientationListener();
      }
    } catch (e) {
      var msg2 = e && e.message ? e.message : "unknown";
      state.oriStatus = "error:" + msg2;
      notify();
    }
  }

  // --- Combined start ---

  function startAll() {
    // MUST be called from a click/tap handler so iOS treats as user gesture. :contentReference[oaicite:4]{index=4}
    requestGeolocation();
    requestOrientation();
  }

  // --- Public API ---

  global.SensorHub = {
    startAll: startAll,
    startGPS: requestGeolocation,
    startOrientation: requestOrientation,
    onUpdate: onUpdate,
    getState: function () {
      return state;
    }
  };
})(window);
