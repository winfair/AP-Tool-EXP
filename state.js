// state.js
(function () {
  "use strict";

  const AP = (window.APTool = window.APTool || {});
  const s = (AP.state = {
    // sensor state
    gps: null,
    gpsError: null,
    gpsGeoidOffset: 0,
    gpsAltSource: "gps", // "gps" | "manual"
    lastHeadingRaw: null,
    lastPitchRaw: null,
    applyDeclination: true,
    manualDeclination: 0,
    declTotal: null,
    declModelAge: null,
    declLat: null,
    declLon: null,

    // calibration
    headingOffset: 0,
    pitchZeroOffset: 0,
    pitchSign: 1,

    // target
    target: null, // { lat, lon, elev, source }
    targetError: null,

    // elevation / alt mode
    altMode: "gps", // "gps" | "manual"
    manualObserverElev: 0,
    instrumentHeight: 1.5, // meters above ground

    // UI state
    liveStatus: "",
    sensorStatus: "",
  });

  // ---- Basic helpers ----

  AP.deg2rad = function (deg) {
    return (deg * Math.PI) / 180;
  };
  AP.rad2deg = function (rad) {
    return (rad * 180) / Math.PI;
  };
  AP.norm360 = function (deg) {
    let d = deg % 360;
    if (d < 0) d += 360;
    return d;
  };
  AP.wrap180 = function (deg) {
    let d = AP.norm360(deg);
    if (d > 180) d -= 360;
    return d;
  };

  AP.clamp = function (val, min, max) {
    return Math.min(max, Math.max(min, val));
  };

  AP.ema = function (prev, value, alpha = 0.2) {
    if (prev == null) return value;
    return prev + alpha * (value - prev);
  };

  // Great-circle bearing + distance, simple WGS-84-ish sphere
  AP.bearingDistance = function (lat1, lon1, lat2, lon2) {
    const φ1 = AP.deg2rad(lat1);
    const φ2 = AP.deg2rad(lat2);
    const Δφ = AP.deg2rad(lat2 - lat1);
    const Δλ = AP.deg2rad(lon2 - lon1);

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const R = 6371000; // meters
    const d = R * c;

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x =
      Math.cos(φ1) * Math.sin(φ2) -
      Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);
    const bearing = AP.norm360(AP.rad2deg(θ));

    return { distance: d, bearing: bearing, c: c };
  };

  function screenAngle() {
    // best-effort orientation angle in degrees
    const o = window.screen && window.screen.orientation;
    if (!o || typeof o.angle !== "number") return 0;
    return o.angle;
  }

  // Estimate pitch from beta/gamma considering screen rotation
  AP.estimatePitch = function (beta, gamma) {
    const sAng = Math.round(AP.norm360(screenAngle()) / 90) * 90;
    if (beta == null && gamma == null) return null;

    // Fallbacks for older browsers that don't support nullish coalescing
    var b = beta != null ? beta : 0;
    var g = gamma != null ? gamma : 0;

    var raw;
    if (sAng === 0) {
      raw = b; // portrait
    } else if (sAng === 180) {
      raw = -b;
    } else if (sAng === 90) {
      raw = g;
    } else if (sAng === 270) {
      raw = -g;
    } else {
      raw = b;
    }
    return AP.clamp(raw, -90, 90);
  };

  // Deviceorientation → heading
  AP.compassFromEvent = function (ev) {
    // iOS
    if (typeof ev.webkitCompassHeading === "number") {
      return { heading: AP.norm360(ev.webkitCompassHeading), source: "iOS" };
    }

    if (ev.absolute === true && typeof ev.alpha === "number") {
      const h = AP.norm360(ev.alpha + screenAngle());
      return { heading: h, source: "absolute" };
    }

    if (typeof ev.alpha === "number") {
      return { heading: null, source: "relative" };
    }

    return { heading: null, source: null };
  };

  // ---- Status setters ----

  AP.setLiveStatus = function (msg) {
    s.liveStatus = msg;
    const el = document.getElementById("live-status");
    if (el) el.textContent = msg;
  };

  AP.setSensorStatus = function (msg) {
    s.sensorStatus = msg;
    const el = document.getElementById("sensor-status");
    if (el) el.textContent = msg;
  };

  // ---- Target / elevation helpers ----

  AP.setTarget = function (tgt) {
    s.target = tgt;
    s.targetError = null;

    const nameEl = document.getElementById("target-name");
    const coordEl = document.getElementById("target-coords");
    const elevEl = document.getElementById("target-elev");
    const srcEl = document.getElementById("target-elev-src");
    const statusEl = document.getElementById("target-status");

    if (nameEl)
      nameEl.textContent =
        tgt.name || `${tgt.lat.toFixed(5)}, ${tgt.lon.toFixed(5)}`;
    if (coordEl)
      coordEl.textContent = `Lat ${tgt.lat.toFixed(5)}, Lon ${tgt.lon.toFixed(
        5
      )}`;
    if (elevEl && typeof tgt.elev === "number")
      elevEl.textContent = tgt.elev.toFixed(1);
    if (srcEl) srcEl.textContent = tgt.source || "unknown";
    if (statusEl) statusEl.textContent = "Target set";
  };

  AP.setTargetError = function (msg) {
    s.targetError = msg;
    const statusEl = document.getElementById("target-status");
    if (statusEl) statusEl.textContent = msg;
  };

  AP.setGPS = function (gps) {
    s.gps = gps;
    s.gpsError = null;
  };

  AP.setGPSError = function (msg) {
    s.gpsError = msg;
  };

  // Compute effective observer elevation (meters)
  AP.observerElevation = function () {
    let baseElev = 0;
    if (s.altMode === "manual") {
      baseElev = s.manualObserverElev || 0;
    } else if (s.gps && typeof s.gps.alt === "number") {
      baseElev = s.gps.alt + (s.gpsGeoidOffset || 0);
    }
    return baseElev + (s.instrumentHeight || 0);
  };

  // Compute vertical angle to target (degrees)
  AP.targetVerticalAngle = function () {
    if (!s.target) return null;
    const obsElev = AP.observerElevation();
    const tgtElev = s.target.elev;
    if (typeof tgtElev !== "number") return null;

    const gps = s.gps;
    if (!gps || typeof gps.lat !== "number" || typeof gps.lon !== "number") {
      return null;
    }

    const inv = AP.bearingDistance(gps.lat, gps.lon, s.target.lat, s.target.lon);
    const dh = tgtElev - obsElev; // meters
    const d = inv.distance || 0.0001; // avoid zero

    const angleRad = Math.atan2(dh, d);
    return AP.rad2deg(angleRad);
  };

  // ---- Drawing / update loop ----

  function updateHeadingUI() {
    const compassEl = document.getElementById("compass-heading");
    const targetRelEl = document.getElementById("target-heading-rel");
    const targetAbsEl = document.getElementById("target-heading-abs");

    const gps = s.gps;
    const tgt = s.target;

    let heading = s.lastHeadingRaw;
    if (heading == null) {
      if (compassEl) compassEl.textContent = "—";
      if (targetRelEl) targetRelEl.textContent = "—";
      if (targetAbsEl) targetAbsEl.textContent = "—";
      return;
    }

    // Apply declination if set
    if (s.applyDeclination && s.declTotal != null) {
      heading = AP.norm360(heading + s.declTotal);
    }

    const hdgCal = AP.norm360(heading + (s.headingOffset || 0));

    if (compassEl) compassEl.textContent = `${hdgCal.toFixed(1)}°`;

    if (gps && tgt && typeof tgt.lat === "number" && typeof tgt.lon === "number") {
      const inv = AP.bearingDistance(gps.lat, gps.lon, tgt.lat, tgt.lon);
      const absBearing = inv.bearing;
      const rel = AP.wrap180(absBearing - hdgCal);

      if (targetAbsEl) targetAbsEl.textContent = `${absBearing.toFixed(1)}°`;
      if (targetRelEl)
        targetRelEl.textContent =
          (rel > 0 ? "+" : "") + `${rel.toFixed(1)}°`;
    } else {
      if (targetRelEl) targetRelEl.textContent = "—";
      if (targetAbsEl) targetAbsEl.textContent = "—";
    }
  }

  function updatePitchUI() {
    const pitchEl = document.getElementById("pitch-angle");
    const tgtPitchEl = document.getElementById("target-pitch");
    const diffEl = document.getElementById("pitch-diff");

    const pitchRaw = s.lastPitchRaw;
    if (pitchRaw == null) {
      if (pitchEl) pitchEl.textContent = "—";
      if (tgtPitchEl) tgtPitchEl.textContent = "—";
      if (diffEl) diffEl.textContent = "—";
      return;
    }

    const pitch = s.pitchSign * (pitchRaw + (s.pitchZeroOffset || 0));
    if (pitchEl) pitchEl.textContent = `${pitch.toFixed(1)}°`;

    const tgtVert = AP.targetVerticalAngle();
    if (tgtVert == null) {
      if (tgtPitchEl) tgtPitchEl.textContent = "—";
      if (diffEl) diffEl.textContent = "—";
      return;
    }

    if (tgtPitchEl) tgtPitchEl.textContent = `${tgtVert.toFixed(1)}°`;

    const diff = tgtVert - pitch;
    if (diffEl)
      diffEl.textContent = (diff > 0 ? "+" : "") + `${diff.toFixed(1)}°`;
  }

  function updateDeclinationUI() {
    const declEl = document.getElementById("declination");
    const declInfoEl = document.getElementById("declination-info");
    if (!declEl || !declInfoEl) return;

    if (s.declTotal == null) {
      declEl.textContent = "—";
      declInfoEl.textContent = "No declination data yet.";
      return;
    }

    declEl.textContent = `${s.declTotal.toFixed(1)}°`;

    const age = s.declModelAge != null ? `${s.declModelAge} yr` : "?";
    const loc =
      s.declLat != null && s.declLon != null
        ? `@ ${s.declLat.toFixed(2)}, ${s.declLon.toFixed(2)}`
        : "";

    declInfoEl.textContent = `Model age ${age} ${loc}`;
  }

  AP.scheduleUpdate = function () {
    updateHeadingUI();
    updatePitchUI();
    updateDeclinationUI();
  };
})();
