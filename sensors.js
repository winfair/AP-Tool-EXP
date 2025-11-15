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
      set("gps-lat", "—");
      set("gps-lon", "—");
      set("gps-alt", "—");
      set("gps-acc", "—");
      return;
    }

    set("gps-lat", gps.lat.toFixed(5));
    set("gps-lon", gps.lon.toFixed(5));
    set("gps-alt", `${gps.alt.toFixed(1)} m`);
    set("gps-acc", `${gps.acc.toFixed(1)} m`);
  }

  function startGPS() {
    if (!navigator.geolocation) {
      AP.setSensorStatus("No geolocation available.");
      return;
    }

    const opts = {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 20000,
    };

    gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const c = pos.coords;
        const gps = {
          lat: c.latitude,
          lon: c.longitude,
          alt: typeof c.altitude === "number" ? c.altitude : 0,
          acc: typeof c.accuracy === "number" ? c.accuracy : NaN,
        };
        AP.setGPS(gps);
        updateGPSDisplay();
        AP.setSensorStatus("GPS running.");
        AP.scheduleUpdate();
      },
      (err) => {
        AP.setGPSError(err.message || String(err));
        AP.setSensorStatus("GPS error: " + (err.message || err.code));
      },
      opts
    );
  }

  function updateOriDisplay() {
    const ori = s.orientation;
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };

    if (!ori) {
      set("ori-alpha", "—");
      set("ori-beta", "—");
      set("ori-gamma", "—");
      return;
    }

    set(
      "ori-alpha",
      ori.alpha == null ? "—" : `${ori.alpha.toFixed(1)}°`
    );
    set("ori-beta", ori.beta == null ? "—" : `${ori.beta.toFixed(1)}°`);
    set("ori-gamma", ori.gamma == null ? "—" : `${ori.gamma.toFixed(1)}°`);
  }

  function startOrientation() {
    const handle = (ev) => {
      const result = AP.compassFromEvent(ev);
      const heading =
        result && typeof result.heading === "number"
          ? result.heading
          : result.heading;

      s.orientation = {
        alpha: ev.alpha != null ? ev.alpha : null,
        beta: ev.beta != null ? ev.beta : null,
        gamma: ev.gamma != null ? ev.gamma : null,
        absolute: ev.absolute != null ? ev.absolute : null,
      };

      if (heading != null) {
        s.lastHeadingRaw = AP.ema(s.lastHeadingRaw, heading);
      }

      const estPitch = AP.estimatePitch(
        ev.beta != null ? ev.beta : null,
        ev.gamma != null ? ev.gamma : null
      );
      if (estPitch != null) {
        s.lastPitchRaw = AP.ema(s.lastPitchRaw, estPitch);
      }

      updateOriDisplay();
      AP.setSensorStatus("Orientation running.");
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
          .catch((e) => {
            AP.setSensorStatus("Orientation permission error: " + e.message);
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
