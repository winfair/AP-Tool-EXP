
// sensors.js
(function () {
  "use strict";

  const AP = (window.APTool = window.APTool || {});
  const s = AP.state;

  let gpsWatchId = null;

  function updateGPSDisplay() {
    const gps = s.gps;
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };
    if (!gps) {
      ["gps-lat","gps-lon","gps-acc","gps-speed","gps-heading","gps-alt"].forEach(id => set(id,"–"));
      return;
    }
    set("gps-lat", gps.lat != null ? gps.lat.toFixed(6) : "–");
    set("gps-lon", gps.lon != null ? gps.lon.toFixed(6) : "–");
    set("gps-acc", gps.acc != null ? gps.acc.toFixed(1) : "–");
    set("gps-speed", gps.speed != null ? gps.speed.toFixed(2) : "–");
    set(
      "gps-heading",
      typeof gps.heading === "number" && !Number.isNaN(gps.heading)
        ? gps.heading.toFixed(1)
        : "–"
    );
    set("gps-alt", gps.alt != null ? gps.alt.toFixed(1) : "–");
  }

  function updateOriDisplay() {
    const ori = s.orientation;
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };
    if (!ori) {
      ["ori-alpha","ori-beta","ori-gamma","ori-abs"].forEach(id => set(id,"–"));
      return;
    }
    set(
      "ori-alpha",
      ori.alpha != null && !Number.isNaN(ori.alpha)
        ? ori.alpha.toFixed(1)
        : "–"
    );
    set(
      "ori-beta",
      ori.beta != null && !Number.isNaN(ori.beta)
        ? ori.beta.toFixed(1)
        : "–"
    );
    set(
      "ori-gamma",
      ori.gamma != null && !Number.isNaN(ori.gamma)
        ? ori.gamma.toFixed(1)
        : "–"
    );
    set(
      "ori-abs",
      ori.absolute === true
        ? "true"
        : ori.absolute === false
        ? "false"
        : "unknown"
    );
  }

  function startGPS() {
    if (!("geolocation" in navigator)) {
      AP.setSensorStatus("No geolocation support.");
      return;
    }
    try {
      if (gpsWatchId != null) {
        navigator.geolocation.clearWatch(gpsWatchId);
      }
      gpsWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          const c = pos.coords || {};
          s.gps = {
            lat: c.latitude,
            lon: c.longitude,
            acc: c.accuracy,
            speed: c.speed,
            heading: c.heading,
            alt: c.altitude,
          };
          updateGPSDisplay();
          AP.setSensorStatus("GPS ok");
          AP.scheduleUpdate();
        },
        (err) => {
          AP.setSensorStatus("GPS error: " + err.message);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 1000,
          timeout: 10000,
        }
      );
    } catch (e) {
      AP.setSensorStatus("GPS init error: " + e.message);
    }
  }

  function startOrientation() {
    const handle = (ev) => {
      const { heading } = AP.compassFromEvent(ev);

      s.orientation = {
        alpha: ev.alpha != null ? ev.alpha : null,
        beta: ev.beta != null ? ev.beta : null,
        gamma: ev.gamma != null ? ev.gamma : null,
        absolute: ev.absolute != null ? ev.absolute : null,
      };

      if (heading != null) {
        s.lastHeadingRaw = AP.ema(s.lastHeadingRaw, heading);
      }

      const estPitch = AP.estimatePitch(ev.beta, ev.gamma);
      if (estPitch != null) {
        s.lastPitchRaw = AP.ema(s.lastPitchRaw, estPitch);
      }

      updateOriDisplay();
      AP.setSensorStatus("Sensors running");
      AP.scheduleUpdate();
    };

    try {
      if (
        window.DeviceOrientationEvent &&
        typeof DeviceOrientationEvent.requestPermission === "function"
      ) {
        // iOS
        DeviceOrientationEvent.requestPermission()
          .then((state) => {
            if (state === "granted") {
              window.addEventListener("deviceorientation", handle, {
                passive: true,
              });
              AP.setSensorStatus("Orientation running (iOS).");
            } else {
              AP.setSensorStatus("Orientation denied on iOS.");
            }
          })
          .catch((err) => {
            AP.setSensorStatus("Orientation error: " + err.message);
          });
      } else if (window.DeviceOrientationEvent) {
        window.addEventListener("deviceorientation", handle, { passive: true });
        AP.setSensorStatus("Orientation running.");
      } else {
        AP.setSensorStatus("No DeviceOrientation support.");
      }
    } catch (e) {
      AP.setSensorStatus("Orientation init error: " + e.message);
    }
  }

  AP.startSensors = function () {
    // Called from the Start sensors button
    startGPS();
    startOrientation();
  };
})();
