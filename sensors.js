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
    gpsStatus: "idle",   // "idle" | "requesting" | "ok" | "denied" | "error:..." | "unsupported",

    // Orientation
    headingDeg: null,    // 0–360
    pitchDeg: null,      // roughly -180..180 front/back tilt
    oriStatus: "idle",   // "idle" | "requesting" | "listening" | "denied" | "error:..." | "unsupported"

    // internals
    _gpsWatchId: null,
    _oriAttached: false
  };

  var listeners = [];

  function log() {
    if (console && console.log) {
      console.log.apply(console, ["[SensorHub]"].concat([].slice.call(arguments)));
    }
  }

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
    log("Geolocation success:", state.gpsLat, state.gpsLon, "acc", state.gpsAcc);
    notify();

    // After initial allow, start watchPosition for live updates
    if (fromGetCurrent) {
      startGeoWatch();
    }
  }

  function handleGeoError(err) {
    var code = err && typeof err.code === "number" ? err.code : null;
    var msg = err && err.message ? err.message : "unknown";

    if (code === 1) {
      // PERMISSION_DENIED per spec
      state.gpsStatus = "denied";
      log("Geolocation permission denied");
    } else {
      state.gpsStatus = "error:" + msg;
      log("Geolocation error:", msg, "code:", code);
    }
    notify();
  }

  function startGeoWatch() {
    if (!("geolocation" in navigator)) {
      state.gpsStatus = "unsupported";
      log("navigator.geolocation not available");
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
    log("Started geolocation watchPosition");
  }

  function requestGeolocation() {
    if (!("geolocation" in navigator)) {
      state.gpsStatus = "unsupported";
      log("navigator.geolocation not available (unsupported)");
      notify();
      return;
    }

    if (!global.isSecureContext) {
      // Needed for modern browsers 
      state.gpsStatus = "unsupported";
      log("Not a secure context (https) – geolocation blocked");
      notify();
      return;
    }

    state.gpsStatus = "requesting";
    log("Requesting geolocation via getCurrentPosition (user gesture)");
    notify();

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

    if (state.oriStatus === "requesting" || state.oriStatus === "idle") {
      state.oriStatus = "listening";
    }
    notify();
  }

  function attachOrientationListener() {
    if (state._oriAttached) return;

    if (!("DeviceOrientationEvent" in global)) {
      state.oriStatus = "unsupported";
      log("DeviceOrientationEvent not available (unsupported)");
      notify();
      return;
    }

    log("Attaching deviceorientation listener");
    // Use boolean for older Safari / Android
    global.addEventListener("deviceorientation", handleOrientation, false);
    state._oriAttached = true;
    if (state.oriStatus === "idle") {
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
      var DOE = global.DeviceOrientationEvent;
      var hasRequest = DOE && typeof DOE.requestPermission === "function";

      log("requestOrientation: has DeviceOrientationEvent =", !!DOE, "has requestPermission =", hasRequest);

      if (hasRequest) {
        // iOS 13+ needs this inside a user gesture 
        state.oriStatus = "requesting";
        notify();

        DOE.requestPermission()
          .then(function (res) {
            log("DeviceOrientationEvent.requestPermission result:", res);
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
            log("Orientation permission error:", msg);
            notify();
          });
      } else {
        // Android / older iOS / other browsers
        attachOrientationListener();
      }
    } catch (e) {
      var msg2 = e && e.message ? e.message : "unknown";
      state.oriStatus = "error:" + msg2;
      log("Orientation init exception:", msg2);
      notify();
    }
  }

  // --- Combined start ---

  function startAll() {
    // MUST be called from a click/tap handler so iOS treats as user gesture. 
    log("startAll() called – secureContext =", global.isSecureContext);
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

  log("SensorHub init. geolocation in navigator =", "geolocation" in navigator,
      "DeviceOrientationEvent in window =", "DeviceOrientationEvent" in global,
      "secureContext =", global.isSecureContext);

})(window);
