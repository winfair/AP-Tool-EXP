/* Fresh Start — Heading-Up Map with GPS+Compass
   - No API key needed (MapLibre demo style)
   - Fullscreen map
   - Buttons to enable GPS & Compass
   - Heading-up mode with a centered arrow
*/

(() => {
  const map = new maplibregl.Map({
    container: 'map',
    style: 'https://demotiles.maplibre.org/style.json',
    center: [-119.168399, 34.851939], // Pine Mountain Club area as a sane default
    zoom: 14,
    pitch: 0,
    bearing: 0,
    attributionControl: true,
    hash: false
  });

  // Controls (zoom only; we manage compass ourselves)
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'bottom-right');

  // DOM elements
  const btnGps = document.getElementById('btn-gps');
  const btnCompass = document.getElementById('btn-compass');
  const chkHeading = document.getElementById('chk-heading');
  const cursor = document.getElementById('cursor');

  let watchId = null;
  let latestHeadingDeg = 0;
  let haveCompass = false;
  let haveGPS = false;

  // --- GPS handling ---
  function enableGPS() {
    if (!('geolocation' in navigator)) {
      alert('Geolocation is not supported on this device/browser.');
      return;
    }
    if (watchId !== null) return; // already watching

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        haveGPS = true;
        // Keep camera centered on user if we already enabled GPS
        map.easeTo({ center: [longitude, latitude], duration: 500 });

        // Optionally draw a small accuracy circle layer once style is ready
        ensureUserDot([longitude, latitude]);
      },
      (err) => {
        console.warn('GPS error:', err);
        alert(`GPS error: ${err.message}`);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000
      }
    );
  }

  // Add a tiny user dot layer once and update its source data
  let userSourceAdded = false;
  function ensureUserDot(lngLat) {
    if (!map.getStyle() || !map.isStyleLoaded()) return;
    if (!userSourceAdded) {
      if (!map.getSource('me')) {
        map.addSource('me', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });
      }
      if (!map.getLayer('me-dot')) {
        map.addLayer({
          id: 'me-dot',
          type: 'circle',
          source: 'me',
          paint: {
            'circle-radius': 5,
            'circle-color': '#66d9a3',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#0b0f12'
          }
        });
      }
      userSourceAdded = true;
    }
    const src = map.getSource('me');
    if (src) {
      src.setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'Point', coordinates: lngLat },
          properties: {}
        }]
      });
    }
  }

  // Re-try adding user dot after style load
  map.on('load', () => {
    // no-op; user dot will be created on first GPS fix
  });

  btnGps.addEventListener('click', enableGPS);

  // --- Compass / heading handling ---
  async function enableCompass() {
    // iOS requires explicit permission via user gesture
    // Must be HTTPS (GitHub Pages is fine)
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') {
          alert('Compass permission was not granted.');
          return;
        }
      }
    } catch (e) {
      // Ignore; some browsers don’t throw here
    }

    // Attach listeners
    haveCompass = false;
    window.addEventListener('deviceorientationabsolute', onDeviceOrientation, { passive: true });
    window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });
  }

  function onDeviceOrientation(evt) {
    // Try multiple fields that various browsers expose
    let heading;

    // On many devices, 'alpha' is degrees clockwise from device's initial reference
    // We prefer absolute if available
    if (evt.absolute === true && typeof evt.alpha === 'number') {
      heading = evt.alpha;
    } else if (typeof evt.webkitCompassHeading === 'number') {
      // iOS Safari provides webkitCompassHeading (degrees from North, 0 = North)
      heading = evt.webkitCompassHeading;
    } else if (typeof evt.alpha === 'number') {
      // Fallback: treat alpha as compass-esque; may be relative
      heading = 360 - evt.alpha; // invert to approximate "from north"
    }

    if (typeof heading !== 'number' || Number.isNaN(heading)) return;

    latestHeadingDeg = normalizeDeg(heading);
    haveCompass = true;
    updateHeading();
  }

  function normalizeDeg(d) {
    let x = d % 360;
    if (x < 0) x += 360;
    return x;
    }

  function updateHeading() {
    // Rotate center arrow UI
    cursor.style.transform = `translate(-50%, -50%) rotate(${latestHeadingDeg}deg)`;

    // If heading-up mode enabled, rotate the map opposite to heading so that “up” = current heading
    if (chkHeading.checked) {
      // Map bearing is clockwise from North; to keep “up” aligned with device heading,
      // rotate the map by the negative of the heading.
      const targetBearing = -latestHeadingDeg;
      map.rotateTo(targetBearing, { duration: 0 });
    }
  }

  btnCompass.addEventListener('click', enableCompass);

  // If user toggles heading-up off, snap map to 0 bearing (north-up)
  chkHeading.addEventListener('change', () => {
    if (!chkHeading.checked) {
      map.easeTo({ bearing: 0, duration: 300 });
    } else {
      // Re-apply current heading immediately
      updateHeading();
    }
  });

  // Resize handling (belt & suspenders to ensure full screen)
  window.addEventListener('resize', () => map.resize());
})();
