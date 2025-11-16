// sensors.js
// Minimal sensor module: request GPS + orientation and hold latest values.
// Exposes a global `Sensors` object with:
//   Sensors.start()       -> call from a button click
//   Sensors.onUpdate(fn)  -> get state updates
//   Sensors.getState()    -> read current state

(function (global) {
  'use strict';

  var state = {
    // GPS
    gpsStatus: 'idle',   // 'idle' | 'requesting' | 'ok' | 'denied' | 'error' | 'unsupported'
    gpsLat: null,
    gpsLon: null,
    gpsAlt: null,        // meters above sea level (may be null)
    gpsAcc: null,        // horizontal accuracy in meters (may be null)
    gpsError: null,

    // Orientation
    oriStatus: 'idle',   // 'idle' | 'requesting' | 'listening' | 'denied' | 'error' | 'unsupported'
    headingDeg: null,
    pitchDeg: null,
    oriError: null
  };

  var listeners = [];
  var geoWatchId = null;
  var oriListening = false;

  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](state);
      } catch (e) {
        // ignore listener errors
      }
    }
  }

  function onUpdate(fn) {
    if (typeof fn === 'function') {
      listeners.push(fn);
      // push initial state immediately
      fn(state);
    }
  }

  // ---------------- GPS ----------------

  function applyCoords(coords) {
    if (!coords) return;
    state.gpsLat = (typeof coords.latitude === 'number') ? coords.latitude : null;
    state.gpsLon = (typeof coords.longitude === 'number') ? coords.longitude : null;
    state.gpsAlt = (typeof coords.altitude === 'number') ? coords.altitude : null;
    state.gpsAcc = (typeof coords.accuracy === 'number') ? coords.accuracy : null;
  }

  function startGPS() {
    if (!('geolocation' in navigator)) {
      state.gpsStatus = 'unsupported';
      state.gpsError = 'navigator.geolocation not available';
      notify();
      return;
    }

    state.gpsStatus = 'requesting';
    state.gpsError = null;
    notify();

    var opts = {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000
    };

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var c = pos.coords || {};
        applyCoords(c);
        state.gpsStatus = 'ok';
        notify();

        // Start watching for changes after first fix
        if (geoWatchId === null) {
          geoWatchId = navigator.geolocation.watchPosition(
            function (pos2) {
              var c2 = pos2.coords || {};
              applyCoords(c2);
              state.gpsStatus = 'ok';
              notify();
            },
            function (err2) {
              state.gpsStatus = err2 && err2.code === 1 ? 'denied' : 'error';
              state.gpsError =
                (err2 && err2.message) ? err2.message : 'Unknown error';
              notify();
            },
            opts
          );
        }
      },
      function (err) {
        state.gpsStatus = err && err.code === 1 ? 'denied' : 'error';
        state.gpsError = (err && err.message) ? err.message : 'Unknown error';
        notify();
      },
      opts
    );
  }

  // ---------------- Orientation ----------------

  function handleOrientation(ev) {
    if (!ev) return;

    // alpha ~ heading, beta ~ pitch
    if (typeof ev.alpha === 'number') {
      var h = ev.alpha % 360;
      if (h < 0) h += 360;
      state.headingDeg = h;
    }

    if (typeof ev.beta === 'number') {
      state.pitchDeg = ev.beta;
    }

    if (state.oriStatus === 'idle' || state.oriStatus === 'requesting') {
      state.oriStatus = 'listening';
    }

    notify();
  }

  function attachOrientation() {
    if (oriListening) return;

    global.addEventListener('deviceorientation', handleOrientation, false);
    oriListening = true;

    if (state.oriStatus === 'idle') {
      state.oriStatus = 'listening';
    }

    notify();
  }

  function startOrientation() {
    if (!('DeviceOrientationEvent' in global)) {
      state.oriStatus = 'unsupported';
      state.oriError = 'DeviceOrientationEvent not available';
      notify();
      return;
    }

    state.oriStatus = 'requesting';
    state.oriError = null;
    notify();

    try {
      var DOE = global.DeviceOrientationEvent;
      if (DOE && typeof DOE.requestPermission === 'function') {
        // iOS 13+ path – must be called from a user gesture
        DOE.requestPermission().then(
          function (res) {
            if (res === 'granted') {
              attachOrientation();
            } else {
              state.oriStatus = 'denied';
              state.oriError = 'Permission ' + res;
              notify();
            }
          },
          function (e) {
            state.oriStatus = 'error';
            state.oriError = e && e.message ? e.message : 'Unknown error';
            notify();
          }
        );
      } else {
        // Other browsers: no explicit permission API, just listen
        attachOrientation();
      }
    } catch (e) {
      state.oriStatus = 'error';
      state.oriError = e && e.message ? e.message : 'Unknown error';
      notify();
    }
  }

  // ---------------- Public API ----------------

  function startAll() {
    // Call this from a click/tap handler
    startGPS();
    startOrientation();
  }

  global.Sensors = {
    start: startAll,
    onUpdate: onUpdate,
    getState: function () { return state; }
  };
})(window);
