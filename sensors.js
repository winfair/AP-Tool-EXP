// sensors.js
// GPS + orientation wrapper with best-effort earth-frame heading.

(function (w) {
  'use strict';

  const st = {
    gpsStatus: 'idle', gpsLat: null, gpsLon: null, gpsAlt: null, gpsError: null,
    oriStatus: 'idle', headingDeg: null, pitchDeg: null, oriError: null, oriFrame: null
  };
  const listeners = [];
  let geoWatchId = null, oriOn = false;

  const clone = o => Object.assign({}, o);
  const notify = () => listeners.forEach(cb => { try { cb(clone(st)); } catch (_) {} });

  function onUpdate(cb) { if (typeof cb === 'function') listeners.push(cb); }
  function getState() { return clone(st); }

  // ---------- GPS ----------

  function startGPS() {
    const g = navigator.geolocation;
    if (!g) {
      st.gpsStatus = 'unsupported';
      st.gpsError = 'Geolocation not supported.'; notify(); return;
    }
    if (geoWatchId != null) return;

    st.gpsStatus = 'requesting'; st.gpsError = null; notify();

    geoWatchId = g.watchPosition(
      pos => {
        const c = pos.coords;
        st.gpsStatus = 'ok';
        st.gpsLat = c.latitude;
        st.gpsLon = c.longitude;
        st.gpsAlt = typeof c.altitude === 'number' ? c.altitude : null;
        st.gpsError = null; notify();
      },
      err => {
        st.gpsStatus = (err && err.code === err.PERMISSION_DENIED) ? 'denied' : 'error';
        st.gpsError = (err && err.message) || 'Geolocation error.'; notify();
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
  }

  // ---------- Orientation ----------

  const norm360 = d => (d % 360 + 360) % 360;

  function handleOri(ev) {
    let h = null, p = null, frame = st.oriFrame;

    if (typeof ev.webkitCompassHeading === 'number' && !isNaN(ev.webkitCompassHeading)) {
      h = ev.webkitCompassHeading;      // iOS magnetic north
      frame = 'earth';
    } else if (typeof ev.alpha === 'number' && !isNaN(ev.alpha)) {
      h = ev.alpha;                     // alpha; absolute implies earth-frame
      frame = ev.absolute === true ? 'earth' : (frame || 'device');
    }

    if (typeof ev.beta === 'number' && !isNaN(ev.beta)) {
      p = Math.max(-90, Math.min(90, ev.beta)); // pitch
    }

    if (h != null && isFinite(h)) st.headingDeg = norm360(h);
    if (p != null && isFinite(p)) st.pitchDeg = p;
    st.oriFrame = frame;

    if (st.oriStatus !== 'listening') { st.oriStatus = 'listening'; st.oriError = null; }
    notify();
  }

  function attachOri() {
    if (oriOn) return;
    oriOn = true;
    if ('ondeviceorientationabsolute' in w) {
      w.addEventListener('deviceorientationabsolute', handleOri, true);
    } else if ('ondeviceorientation' in w) {
      w.addEventListener('deviceorientation', handleOri, true);
    } else {
      st.oriStatus = 'unsupported';
      st.oriError = 'Orientation not supported.'; notify();
    }
  }

  function startOrientation() {
    if (oriOn) return;
    if (!w.DeviceOrientationEvent) {
      st.oriStatus = 'unsupported';
      st.oriError = 'Device orientation not supported.'; notify(); return;
    }
    st.oriStatus = 'requesting'; st.oriError = null; notify();

    try {
      const D = w.DeviceOrientationEvent;
      if (typeof D.requestPermission === 'function') {
        D.requestPermission()
          .then(res => {
            if (res === 'granted') attachOri();
            else { st.oriStatus = 'denied'; st.oriError = 'Orientation permission denied.'; notify(); }
          })
          .catch(e => { st.oriStatus = 'error'; st.oriError = e?.message || 'Orientation error.'; notify(); });
      } else {
        attachOri();
      }
    } catch (e) {
      st.oriStatus = 'error';
      st.oriError = e?.message || 'Orientation error.'; notify();
    }
  }

  function start() { startGPS(); startOrientation(); }

  w.Sensors = { start, onUpdate, getState };
})(window);
