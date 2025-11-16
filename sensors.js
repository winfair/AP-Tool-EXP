// sensors.js
// Provides GPS + orientation readings to the rest of the app.
//
// API:
//   Sensors.start()            // begin GPS + orientation
//   Sensors.onUpdate(cb)       // subscribe to state changes
//   Sensors.getState()         // get latest snapshot
//
// State fields:
//   gpsStatus: 'idle' | 'requesting' | 'ok' | 'denied' | 'error' | 'unsupported'
//   gpsLat, gpsLon: number|null
//   gpsAlt: number|null        // meters, if available
//   gpsError: string|null
//
//   oriStatus: 'idle' | 'requesting' | 'listening' | 'denied' | 'error' | 'unsupported'
//   headingDeg: number|null    // 0..360, from whatever best source we have
//   pitchDeg: number|null      // -90..90 front/back tilt
//   oriError: string|null
//   oriFrame: 'earth' | 'device' | null
//       // 'earth'  = heading is tied to Earth frame (magnetic/true north capable)
//       // 'device' = heading is only relative to some arbitrary starting frame

(function (global) {
  'use strict';

  var state = {
    // GPS
    gpsStatus: 'idle',
    gpsLat: null,
    gpsLon: null,
    gpsAlt: null,
    gpsError: null,

    // Orientation
    oriStatus: 'idle',
    headingDeg: null,
    pitchDeg: null,
    oriError: null,
    oriFrame: null
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

  function normalizeHeading(deg) {
    var d = deg % 360;
    if (d < 0) d += 360;
    return d;
  }

  function handleOrientationEvent(ev) {
    var heading = null;
    var pitch = null;
    var frame = state.oriFrame;

    // PRIORITY 1: iOS Safari real compass (magnetic heading)
    if (typeof ev.webkitCompassHeading === 'number' && !isNaN(ev.webkitCompassHeading)) {
      // 0 = magnetic north, clockwise
      heading = ev.webkitCompassHeading;
      frame = 'earth';
    } else {
      // OTHER BROWSERS: fall back to alpha/beta/gamma
      if (typeof ev.alpha === 'number' && !isNaN(ev.alpha)) {
        // NOTE:
        //  - On deviceorientationabsolute, alpha SHOULD be Earth-frame. 
        //  - On many Chrome/Android combos, plain deviceorientation is relative. 
        // We keep it as-is; the app can see state.oriFrame to know if it's earth/relative.
        heading = ev.alpha;
        frame = ev.absolute === true ? 'earth' : (frame || 'device');
      }
    }

    // Pitch: front-back tilt from beta
    if (typeof ev.beta === 'number' && !isNaN(ev.beta)) {
      var b = ev.beta;
      if (b > 90) b = 90;
      if (b < -90) b = -90;
      pitch = b;
    }

    if (heading != null && isFinite(heading)) {
      state.headingDeg = normalizeHeading(heading);
    }

    if (pitch != null && isFinite(pitch)) {
      state.pitchDeg = pitch;
    }

    state.oriFrame = frame;

    if (state.oriStatus !== 'listening') {
      state.oriStatus = 'listening';
      state.oriError = null;
    }

    notify();
  }

  function attachOrientationListeners() {
    if (orientationActive) return;
    orientationActive = true;

    // BEST-EFFORT PRIORITY:
    // 1) deviceorientationabsolute (Chrome & friends, Earth frame) 
    // 2) deviceorientation (fallback)
    if ('ondeviceorientationabsolute' in global) {
      global.addEventListener('deviceorientationabsolute', handleOrientationEvent, true);
    } else if ('ondeviceorientation' in global) {
      global.addEventListener('deviceorientation', handleOrientationEvent, true);
    } else {
      state.oriStatus = 'unsupported';
      state.oriError = 'Orientation events not supported in this browser.';
      notify();
    }
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

    try {
      // iOS 13+ requires explicit permission
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
          .then(function (result) {
            if (result === 'granted') {
              attachOrientationListeners();
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
        // Non-iOS (or older iOS)
        attachOrientationListeners();
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
