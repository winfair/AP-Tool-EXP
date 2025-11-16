// sensors.js
// Provides GPS + orientation readings to the rest of the app.
//
// API:
//   Sensors.start()            // begin GPS + orientation
//   Sensors.onUpdate(cb)       // subscribe to state changes
//   Sensors.getState()         // get latest snapshot
//
// State fields (what ui.js expects):
//   gpsStatus: 'idle' | 'requesting' | 'ok' | 'denied' | 'error' | 'unsupported'
//   gpsLat, gpsLon: number|null
//   gpsAlt: number|null   (meters, if available)
//   gpsError: string|null
//
//   oriStatus: 'idle' | 'requesting' | 'listening' | 'denied' | 'error' | 'unsupported'
//   headingDeg: number|null   // ~magnetic heading, 0..360 (NO auto-zero)
//   pitchDeg: number|null     // tilt up/down in degrees
//   oriError: string|null

(function (global) {
  'use strict';

  var state = {
    gpsStatus: 'idle',
    gpsLat: null,
    gpsLon: null,
    gpsAlt: null,
    gpsError: null,

    oriStatus: 'idle',
    headingDeg: null,
    pitchDeg: null,
    oriError: null
  };

  var listeners = [];
  var geoWatchId = null;
  var orientationActive = false;

  function notify() {
    var snapshot = Object.assign({}, state);
    listeners.forEach(function (cb) {
      try {
        cb(snapshot);
      } catch (e) {
        // ignore listener errors
      }
    });
  }

  function onUpdate(cb) {
    if (typeof cb === 'function') {
      listeners.push(cb);
    }
  }

  function getState() {
    return Object.assign({}, state);
  }

  // ---------- GPS ----------

  function startGPS() {
    if (!navigator.geolocation) {
      state.gpsStatus = 'unsupported';
      state.gpsError = 'Geolocation not supported in this browser.';
      notify();
      return;
    }

    if (geoWatchId != null) {
      return; // already running
    }

    state.gpsStatus = 'requesting';
    state.gpsError = null;
    notify();

    geoWatchId = navigator.geolocation.watchPosition(
      function (pos) {
        state.gpsStatus = 'ok';
        state.gpsLat = pos.coords.latitude;
        state.gpsLon = pos.coords.longitude;
        state.gpsAlt =
          typeof pos.coords.altitude === 'number' ? pos.coords.altitude : null;
        state.gpsError = null;
        notify();
      },
      function (err) {
        if (err && err.code === err.PERMISSION_DENIED) {
          state.gpsStatus = 'denied';
        } else {
          state.gpsStatus = 'error';
        }
        state.gpsError =
          (err && err.message) || 'Geolocation error.';
        notify();
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 20000
      }
    );
  }

  // ---------- Orientation ----------

  function handleOrientationEvent(ev) {
    var heading = null;
    var pitch = null;

    // Prefer iOS Safari magnetic heading if available
    if (typeof ev.webkitCompassHeading === 'number') {
      // 0..360, 0 = magnetic north
      heading = ev.webkitCompassHeading;
    } else if (typeof ev.alpha === 'number') {
      // Fallback: interpret alpha as rotation around z-axis.
      // Common pattern: compass heading ≈ 360 - alpha
      heading = 360 - ev.alpha;
    }

    // Pitch: simple approximation using beta (front/back tilt)
    if (typeof ev.beta === 'number') {
      var b = ev.beta;
      if (b > 90) b = 90;
      if (b < -90) b = -90;
      pitch = b;
    }

    if (heading != null && isFinite(heading)) {
      var h = heading % 360;
      if (h < 0) h += 360;
      state.headingDeg = h; // NOTE: no auto-zero here
    }

    if (pitch != null && isFinite(pitch)) {
      state.pitchDeg = pitch;
    }

    if (state.oriStatus !== 'listening') {
      state.oriStatus = 'listening';
      state.oriError = null;
    }

    notify();
  }

  function startOrientation() {
    if (orientationActive) return;

    if (!global.DeviceOrientationEvent) {
      state.oriStatus = 'unsupported';
      state.oriError = 'Device orientation not supported in this browser.';
      notify();
      return;
    }

    state.oriStatus = 'requesting';
    state.oriError = null;
    notify();

    function attachListener() {
      if (orientationActive) return;
      orientationActive = true;
      global.addEventListener('deviceorientation', handleOrientationEvent, true);
      // oriStatus switches to "listening" on first event
    }

    try {
      // iOS 13+ requires explicit permission
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
          .then(function (result) {
            if (result === 'granted') {
              attachListener();
            } else {
              state.oriStatus = 'denied';
              state.oriError = 'Orientation permission denied.';
              notify();
            }
          })
          .catch(function (err) {
            state.oriStatus = 'error';
            state.oriError =
              (err && err.message) || 'Orientation error.';
            notify();
          });
      } else {
        // Non-iOS
        attachListener();
      }
    } catch (e) {
      state.oriStatus = 'error';
      state.oriError = (e && e.message) || 'Orientation error.';
      notify();
    }
  }

  // ---------- Public API ----------

  function start() {
    startGPS();
    startOrientation();
  }

  global.Sensors = {
    start: start,
    onUpdate: onUpdate,
    getState: getState
  };
})(window);
