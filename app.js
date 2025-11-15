// app.js - fully rewritten, single-file logic for AP-Tool-EXP
(function () {
  "use strict";

  // ----- State -----

  var state = {
    gps: null,          // { lat, lon, acc }
    gpsError: null,
    headingDeg: null,   // raw heading from sensors
    pitchDeg: null,     // raw pitch from sensors
    headingOffsetDeg: 0,
    pitchOffsetDeg: 0,
    target: null        // { lat, lon }
  };

  var dom = {};
  var map = null;
  var mapMarker = null;
  var mapInited = false;

  // ----- Utility math -----

  function deg2rad(d) {
    return (d * Math.PI) / 180;
  }

  function rad2deg(r) {
    return (r * 180) / Math.PI;
  }

  function norm360(d) {
    var x = d % 360;
    if (x < 0) x += 360;
    return x;
  }

  function wrap180(d) {
    var x = norm360(d);
    if (x > 180) x -= 180 * 2;
    return x;
  }

  function screenOrientationAngle() {
    var o = window.screen && window.screen.orientation;
    if (o && typeof o.angle === "number") return o.angle;
    return 0;
  }

  // Great-circle distance + bearing, simple sphere
  function bearingDistance(lat1, lon1, lat2, lon2) {
    var phi1 = deg2rad(lat1);
    var phi2 = deg2rad(lat2);
    var dphi = deg2rad(lat2 - lat1);
    var dlambda = deg2rad(lon2 - lon1);

    var a =
      Math.sin(dphi / 2) * Math.sin(dphi / 2) +
      Math.cos(phi1) * Math.cos(phi2) *
        Math.sin(dlambda / 2) * Math.sin(dlambda / 2);

    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var R = 6371000; // m
    var dist = R * c;

    var y = Math.sin(dlambda) * Math.cos(phi2);
    var x =
      Math.cos(phi1) * Math.sin(phi2) -
      Math.sin(phi1) * Math.cos(phi2) * Math.cos(dlambda);
    var bearing = norm360(rad2deg(Math.atan2(y, x)));

    return { distanceMeters: dist, bearingDeg: bearing };
  }

  function computeTargetMetrics() {
    if (!state.gps || !state.target) return null;
    var g = state.gps;
    var t = state.target;

    if (
      typeof g.lat !== "number" ||
      typeof g.lon !== "number" ||
      typeof t.lat !== "number" ||
      typeof t.lon !== "number"
    ) {
      return null;
    }

    var bd = bearingDistance(g.lat, g.lon, t.lat, t.lon);
    var calHeading = getCalibratedHeading();
    var rel = null;
    if (calHeading != null) {
      rel = wrap180(bd.bearingDeg - calHeading);
    }

    return {
      distanceMeters: bd.distanceMeters,
      bearingDeg: bd.bearingDeg,
      relBearingDeg: rel
    };
  }

  function getCalibratedHeading() {
    if (state.headingDeg == null) return null;
    return norm360(state.headingDeg + state.headingOffsetDeg);
  }

  function getCalibratedPitch() {
    if (state.pitchDeg == null) return null;
    return state.pitchDeg - state.pitchOffsetDeg;
  }

  // ----- Status helpers -----

  function setLiveStatus(msg) {
    var el = dom.liveStatus;
    if (el) el.textContent = msg;
  }

  function setSensorStatus(msg) {
    var el = dom.sensorStatus;
    if (el) el.textContent = msg;
  }

  // ----- UI update -----

  function updateUI() {
    // Heading / pitch
    var headingRaw = state.headingDeg;
    var headingCal = getCalibratedHeading();
    var pitchRaw = state.pitchDeg;
    var pitchCal = getCalibratedPitch();

    if (headingCal != null) {
      dom.headingValue.textContent = headingCal.toFixed(1) + "°";
      dom.headingSub.textContent =
        "Raw " +
        headingRaw.toFixed(1) +
        "° · Offset " +
        state.headingOffsetDeg.toFixed(1) +
        "°";
    } else if (headingRaw != null) {
      dom.headingValue.textContent = headingRaw.toFixed(1) + "°";
      dom.headingSub.textContent = "Not calibrated";
    } else {
      dom.headingValue.textContent = "—";
      dom.headingSub.textContent = "No heading yet";
    }

    if (pitchCal != null) {
      dom.pitchValue.textContent = pitchCal.toFixed(1) + "°";
      dom.pitchSub.textContent =
        "Raw " +
        pitchRaw.toFixed(1) +
        "° · Zero " +
        state.pitchOffsetDeg.toFixed(1) +
        "°";
    } else if (pitchRaw != null) {
      dom.pitchValue.textContent = pitchRaw.toFixed(1) + "°";
      dom.pitchSub.textContent = "Not leveled";
    } else {
      dom.pitchValue.textContent = "—";
      dom.pitchSub.textContent = "No pitch yet";
    }

    // GPS
    if (state.gps) {
      dom.gpsLat.textContent = state.gps.lat.toFixed(5);
      dom.gpsLon.textContent = state.gps.lon.toFixed(5);
      if (isFinite(state.gps.acc)) {
        dom.gpsAcc.textContent = state.gps.acc.toFixed(1);
      } else {
        dom.gpsAcc.textContent = "—";
      }
    } else if (state.gpsError) {
      dom.gpsLat.textContent = "Err";
      dom.gpsLon.textContent = "Err";
      dom.gpsAcc.textContent = "—";
    } else {
      dom.gpsLat.textContent = "—";
      dom.gpsLon.textContent = "—";
      dom.gpsAcc.textContent = "—";
    }

    // Target
    if (state.target) {
      dom.targetLat.textContent = state.target.lat.toFixed(5);
      dom.targetLon.textContent = state.target.lon.toFixed(5);

      var metrics = computeTargetMetrics();
      if (metrics) {
        var d = metrics.distanceMeters;
        if (d >= 1000) {
          dom.targetDistance.textContent = (d / 1000).toFixed(2) + " km";
        } else {
          dom.targetDistance.textContent = d.toFixed(1) + " m";
        }

        dom.targetBearing.textContent = metrics.bearingDeg.toFixed(1) + "°";

        if (metrics.relBearingDeg != null) {
          var rel = metrics.relBearingDeg;
          var sign = rel > 0 ? "+" : "";
          dom.targetRelBearing.textContent = sign + rel.toFixed(1) + "°";
        } else {
          dom.targetRelBearing.textContent = "—";
        }
      } else {
        dom.targetDistance.textContent = "—";
        dom.targetBearing.textContent = "—";
        dom.targetRelBearing.textContent = "—";
      }
    } else {
      dom.targetLat.textContent = "—";
      dom.targetLon.textContent = "—";
      dom.targetDistance.textContent = "—";
      dom.targetBearing.textContent = "—";
      dom.targetRelBearing.textContent = "—";
    }
  }

  // ----- GPS -----

  function startGPS() {
    if (!("geolocation" in navigator)) {
      state.gpsError = "Geolocation not available";
      setSensorStatus("No geolocation on this device.");
      updateUI();
      return;
    }

    var opts = {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000
    };

    navigator.geolocation.watchPosition(
      function (pos) {
        var c = pos.coords;
        state.gps = {
          lat: c.latitude,
          lon: c.longitude,
          acc: typeof c.accuracy === "number" ? c.accuracy : NaN
        };
        state.gpsError = null;
        setSensorStatus("GPS running.");
        updateUI();

        // Center map first time if it exists
        if (map && !mapInited) {
          map.setView([state.gps.lat, state.gps.lon], 15);
          mapInited = true;
        }
      },
      function (err) {
        state.gpsError = err && err.message ? err.message : "GPS error";
        setSensorStatus("GPS error: " + state.gpsError);
        updateUI();
      },
      opts
    );
  }

  // ----- Orientation -----

  function handleOrientationEvent(ev) {
    var heading = null;

    // iOS
    if (typeof ev.webkitCompassHeading === "number") {
      heading = ev.webkitCompassHeading;
    } else if (typeof ev.alpha === "number") {
      // alpha is 0 at device pointing east on some devices, so we'll just treat it as "heading-ish"
      heading = norm360(ev.alpha + screenOrientationAngle());
    }

    if (heading != null && isFinite(heading)) {
      state.headingDeg = heading;
    }

    if (typeof ev.beta === "number" && isFinite(ev.beta)) {
      // beta is front/back tilt, we treat it as pitch
      state.pitchDeg = ev.beta;
    }

    setSensorStatus("Orientation running.");
    updateUI();
  }

  function startOrientation() {
    if (!("DeviceOrientationEvent" in window)) {
      setSensorStatus("No DeviceOrientationEvent support.");
      return;
    }

    try {
      // iOS permission flow
      if (
        typeof DeviceOrientationEvent.requestPermission === "function"
      ) {
        DeviceOrientationEvent.requestPermission()
          .then(function (stateStr) {
            if (stateStr === "granted") {
              window.addEventListener(
                "deviceorientation",
                handleOrientationEvent,
                { passive: true }
              );
              setSensorStatus("Orientation running (iOS).");
            } else {
              setSensorStatus("Orientation denied on iOS.");
            }
          })
          .catch(function (err) {
            setSensorStatus("Orientation error: " + err.message);
          });
      } else {
        // Non-iOS
        window.addEventListener(
          "deviceorientation",
          handleOrientationEvent,
          { passive: true }
        );
        setSensorStatus("Orientation running.");
      }
    } catch (e) {
      setSensorStatus("Orientation init error: " + e.message);
    }
  }

  function startSensors() {
    startGPS();
    startOrientation();
  }

  // ----- Calibration -----

  function calibrateHeadingToTarget() {
    if (!state.target || !state.gps) {
      setLiveStatus("Need GPS + target before calibrating.");
      return;
    }
    if (state.headingDeg == null) {
      setLiveStatus("Move/rotate phone to get heading first.");
      return;
    }

    var metrics = computeTargetMetrics();
    if (!metrics) {
      setLiveStatus("Unable to compute bearing to target.");
      return;
    }

    var offset = wrap180(metrics.bearingDeg - state.headingDeg);
    state.headingOffsetDeg = offset;
    setLiveStatus("Heading calibrated to target.");
    updateUI();
  }

  function quickLevel() {
    if (state.pitchDeg == null) {
      setLiveStatus("Move/tilt phone to get pitch first.");
      return;
    }
    state.pitchOffsetDeg = state.pitchDeg;
    setLiveStatus("Quick level: current pitch set as 0°.");
    updateUI();
  }

  function resetCalibration() {
    state.headingOffsetDeg = 0;
    state.pitchOffsetDeg = 0;
    setLiveStatus("Calibration reset.");
    updateUI();
  }

  // ----- Map handling -----

  function ensureMap() {
    if (map) return;
    if (typeof L === "undefined") {
      setLiveStatus("Leaflet library not loaded.");
      return;
    }

    map = L.map("map", {
      zoomControl: true,
      attributionControl: true
    });

    // Default center if GPS not ready yet
    var center = [0, 0];
    if (state.gps && typeof state.gps.lat === "number") {
      center = [state.gps.lat, state.gps.lon];
      mapInited = true;
    }

    map.setView(center, 2);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    map.on("click", function (ev) {
      var lat = ev.latlng.lat;
      var lon = ev.latlng.lng;
      state.target = { lat: lat, lon: lon };
      setLiveStatus("Target set from map tap.");
      updateTargetMarker();
      updateUI();
    });
  }

  function updateTargetMarker() {
    if (!map || !state.target) return;

    var latlng = [state.target.lat, state.target.lon];
    if (!mapMarker) {
      mapMarker = L.marker(latlng).addTo(map);
    } else {
      mapMarker.setLatLng(latlng);
    }
  }

  function openMapModal() {
    ensureMap();
    var modal = dom.mapModal;
    if (!modal) return;

    modal.classList.add("open");

    // Small timeout so the map has a chance to lay out
    setTimeout(function () {
      if (map) {
        map.invalidateSize(false);

        if (state.gps && !mapInited) {
          map.setView([state.gps.lat, state.gps.lon], 15);
          mapInited = true;
        }

        if (state.target) {
          updateTargetMarker();
        }
      }
    }, 50);
  }

  function closeMapModal() {
    var modal = dom.mapModal;
    if (!modal) return;
    modal.classList.remove("open");
  }

  // ----- DOM wiring -----

  function cacheDom() {
    dom.liveStatus = document.getElementById("live-status");
    dom.sensorStatus = document.getElementById("sensor-status");

    dom.headingValue = document.getElementById("heading-value");
    dom.headingSub = document.getElementById("heading-sub");
    dom.pitchValue = document.getElementById("pitch-value");
    dom.pitchSub = document.getElementById("pitch-sub");

    dom.gpsLat = document.getElementById("gps-lat");
    dom.gpsLon = document.getElementById("gps-lon");
    dom.gpsAcc = document.getElementById("gps-acc");

    dom.targetLat = document.getElementById("target-lat");
    dom.targetLon = document.getElementById("target-lon");
    dom.targetDistance = document.getElementById("target-distance");
    dom.targetBearing = document.getElementById("target-bearing");
    dom.targetRelBearing = document.getElementById("target-rel-bearing");

    dom.btnStartSensors = document.getElementById("btn-start-sensors");
    dom.btnOpenMap = document.getElementById("btn-open-map");
    dom.btnCalibrateHeading = document.getElementById("btn-calibrate-heading");
    dom.btnQuickLevel = document.getElementById("btn-quick-level");
    dom.btnResetCalibration = document.getElementById("btn-reset-calibration");
    dom.btnCloseMap = document.getElementById("btn-close-map");

    dom.mapModal = document.getElementById("map-modal");
  }

  function wireEvents() {
    if (dom.btnStartSensors) {
      dom.btnStartSensors.addEventListener("click", function () {
        dom.btnStartSensors.disabled = true;
        dom.btnStartSensors.textContent = "Sensors running";
        setSensorStatus("Starting sensors…");
        startSensors();
      });
    }

    if (dom.btnOpenMap) {
      dom.btnOpenMap.addEventListener("click", function () {
        openMapModal();
      });
    }

    if (dom.btnCloseMap) {
      dom.btnCloseMap.addEventListener("click", function () {
        closeMapModal();
      });
    }

    if (dom.btnCalibrateHeading) {
      dom.btnCalibrateHeading.addEventListener("click", function () {
        calibrateHeadingToTarget();
      });
    }

    if (dom.btnQuickLevel) {
      dom.btnQuickLevel.addEventListener("click", function () {
        quickLevel();
      });
    }

    if (dom.btnResetCalibration) {
      dom.btnResetCalibration.addEventListener("click", function () {
        resetCalibration();
      });
    }
  }

  // ----- Init -----

  document.addEventListener("DOMContentLoaded", function () {
    cacheDom();
    wireEvents();

    setLiveStatus("Ready");
    setSensorStatus("Idle");
    updateUI();
  });
})();
