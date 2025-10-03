/* Basic, key-free, heading-up map with MapLibre + OSM */
(() => {
  // --- Fullscreen sizing fix for mobile (handles 100vh issues) ---
  const mapEl = document.getElementById("map");
  function sizeMap() {
    const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    mapEl.style.height = `${h}px`;
  }
  sizeMap();
  window.addEventListener("resize", sizeMap);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", sizeMap);

  // --- Map init ---
  const map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: [
            "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
            "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
            "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png"
          ],
          tileSize: 256,
          attribution:
            '© <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors'
        }
      },
      layers: [{ id: "osm", type: "raster", source: "osm" }]
    },
    center: [-119.168399, 34.851939], // your area; change if you like
    zoom: 14,
    bearing: 0,
    pitch: 0,
    dragRotate: true,
    touchPitch: true
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-left");

  // --- UI elements ---
  const btnGPS = document.getElementById("btn-gps");
  const btnCompass = document.getElementById("btn-compass");
  const btnFollow = document.getElementById("btn-follow");
  const statusGPS = document.getElementById("status-gps");
  const statusCompass = document.getElementById("status-compass");
  const statusHeading = document.getElementById("status-heading");
  const statusPos = document.getElementById("status-pos");

  // --- State ---
  let gpsWatchId = null;
  let compassOn = false;
  let followOn = false;
  let lastPos = null;
  let lastHeading = null;

  // Smooth bearing transition
  function setBearingSmooth(target) {
    const current = map.getBearing();
    // Normalize difference to [-180,180]
    let diff = ((target - current + 540) % 360) - 180;
    const newBearing = current + diff * 0.6; // damped
    map.rotateTo(newBearing, { duration: 80 });
  }

  // --- Geolocation ---
  function enableGPS() {
    if (!("geolocation" in navigator)) {
      statusGPS.textContent = "GPS: unavailable";
      return;
    }
    if (gpsWatchId != null) return; // already on

    gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        lastPos = [longitude, latitude];
        statusGPS.textContent = `GPS: ${Math.round(accuracy)}m`;
        statusPos.textContent = `Pos: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

        if (followOn && lastPos) {
          map.easeTo({ center: lastPos, duration: 150 });
        }
      },
      (err) => {
        statusGPS.textContent = `GPS: error (${err.code})`;
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000
      }
    );
  }

  // --- Compass / heading ---
  async function enableCompass() {
    // iOS 13+ needs user gesture permission
    const iOSNeedsPerm =
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function";

    if (iOSNeedsPerm) {
      try {
        const resp = await DeviceOrientationEvent.requestPermission();
        if (resp !== "granted") {
          statusCompass.textContent = "Compass: denied";
          return;
        }
      } catch {
        statusCompass.textContent = "Compass: denied";
        return;
      }
    }

    if (!("ondeviceorientationabsolute" in window) && !("ondeviceorientation" in window)) {
      statusCompass.textContent = "Compass: unavailable";
      return;
    }

    if (compassOn) return;

    const handler = (e) => {
      // Prefer absolute alpha; fall back to alpha
      let alpha = null;
      if (e.absolute === true && typeof e.alpha === "number") {
        alpha = e.alpha;
      } else if (typeof e.webkitCompassHeading === "number") {
        // iOS Safari provides webkitCompassHeading (0 = North, increases clockwise)
        alpha = e.webkitCompassHeading;
      } else if (typeof e.alpha === "number") {
        // alpha is degrees clockwise from device's initial frame to Earth frame; often okay
        alpha = 360 - e.alpha; // invert to get compass-like clockwise from North
      }

      if (alpha == null || Number.isNaN(alpha)) {
        statusCompass.textContent = "Compass: no data";
        return;
      }

      // Normalize [0,360)
      const heading = ((alpha % 360) + 360) % 360;
      lastHeading = heading;
      statusCompass.textContent = "Compass: on";
      statusHeading.textContent = `Heading: ${heading.toFixed(0)}°`;

      // Heading-up: rotate map so that device-forward is "up"
      setBearingSmooth(heading);

      // Keep position centered if following
      if (followOn && lastPos) {
        map.easeTo({ center: lastPos, duration: 80, bearing: heading });
      }
    };

    // Prefer absolute if available
    if ("ondeviceorientationabsolute" in window) {
      window.addEventListener("deviceorientationabsolute", handler, { passive: true });
    } else {
      window.addEventListener("deviceorientation", handler, { passive: true });
    }

    compassOn = true;
  }

  // --- Buttons ---
  btnGPS.addEventListener("click", () => {
    enableGPS();
  });

  btnCompass.addEventListener("click", () => {
    enableCompass();
  });

  btnFollow.addEventListener("click", () => {
    followOn = !followOn;
    btnFollow.textContent = `Follow: ${followOn ? "ON" : "OFF"}`;
    if (followOn && lastPos) {
      map.easeTo({ center: lastPos, duration: 200 });
    }
  });

  // Optional: drop a small dot at current location (live-updated)
  let userMarker = null;
  function ensureUserMarker() {
    if (userMarker) return userMarker;
    const el = document.createElement("div");
    el.className = "user-dot";
    userMarker = new maplibregl.Marker({ element: el }).setLngLat(map.getCenter()).addTo(map);
    return userMarker;
  }

  // Update marker on each GPS tick
  const gpsMarkerInterval = setInterval(() => {
    if (lastPos) {
      ensureUserMarker().setLngLat(lastPos);
    }
  }, 200);

  // Start centered if browser returns a quick cached fix
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lastPos = [pos.coords.longitude, pos.coords.latitude];
        map.jumpTo({ center: lastPos, zoom: 16 });
        statusPos.textContent = `Pos: ${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
      },
      () => {},
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 }
    );
  }
})();
