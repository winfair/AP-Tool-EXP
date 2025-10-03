// ===== Basic Map Setup =====
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [-119.168399, 34.851939], // default center (W, N)
  zoom: 14,
  bearing: 0,
  pitch: 0,
  attributionControl: true
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

// UI elements
const btnCompass = document.getElementById('btnCompass');
const btnGPS = document.getElementById('btnGPS');
const btnFollow = document.getElementById('btnFollow');
const btnWaypoints = document.getElementById('btnWaypoints');
const headingArrow = document.getElementById('headingArrow');

const wpPanel = document.getElementById('wpPanel');
const closeWp = document.getElementById('closeWp');
const wpForm = document.getElementById('wpForm');
const wpName = document.getElementById('wpName');
const wpCoords = document.getElementById('wpCoords');
const wpDelete = document.getElementById('wpDelete');
const wpList = document.getElementById('wpList');

// State
let followMode = false;
let watchId = null;
let lastPosition = null;
let headingDeg = null;
let haveCompass = false;
let selectedWp = null; // name string

// Map marker for current location
const meEl = document.createElement('div');
meEl.className = 'me-marker';
const meMarker = new maplibregl.Marker({ element: meEl, anchor: 'center' });

// Waypoints: persist in localStorage
const LS_KEY = 'ap_align_waypoints_v1';
function loadWaypoints() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
  catch { return {}; }
}
function saveWaypoints(wps) {
  localStorage.setItem(LS_KEY, JSON.stringify(wps));
}
let waypoints = loadWaypoints();

// ===== Helpers =====

// Parse "34.851939 N, -119.168399 W" and variants
function parseLatLon(input) {
  // Normalize: strip extra spaces
  const s = input.trim().replace(/\s+/g, ' ');
  // Split by comma
  const parts = s.split(',');
  if (parts.length !== 2) throw new Error('Must be "lat N/S, lon E/W"');

  const parseOne = (p, isLat) => {
    // Accept: "34.85 N" or "-119.16 W" or "34.85N" or "-119.16W"
    const m = p.trim().match(/^([+-]?\d+(?:\.\d+)?)(?:\s*([NnSsEeWw]))?$/);
    if (!m) throw new Error('Bad coordinate: ' + p);
    let val = parseFloat(m[1]);
    const dir = m[2]?.toUpperCase();
    if (dir) {
      if (isLat && !['N','S'].includes(dir)) throw new Error('Lat must be N or S');
      if (!isLat && !['E','W'].includes(dir)) throw new Error('Lon must be E or W');
      if (dir === 'S' || dir === 'W') val = -Math.abs(val);
      else val = Math.abs(val);
    }
    // If no dir and negative sign present, trust the sign
    return val;
  };

  const lat = parseOne(parts[0], true);
  const lon = parseOne(parts[1], false);
  if (Math.abs(lat) > 90) throw new Error('Lat out of range');
  if (Math.abs(lon) > 180) throw new Error('Lon out of range');
  return { lat, lon };
}

function formatLatLon(lat, lon) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(6)} ${ns}, ${Math.abs(lon).toFixed(6)} ${ew}`;
}

function updateFollowButton() {
  btnFollow.textContent = `Follow: ${followMode ? 'On' : 'Off'}`;
}

// ===== GPS =====
btnGPS.addEventListener('click', () => {
  if (!('geolocation' in navigator)) {
    alert('Geolocation not supported');
    return;
  }
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, heading, accuracy } = pos.coords;
      lastPosition = { lat: latitude, lon: longitude, accuracy };
      meMarker.setLngLat([longitude, latitude]).addTo(map);
      if (followMode) {
        map.easeTo({ center: [longitude, latitude], duration: 400 });
      }
    },
    (err) => {
      console.error('GPS error', err);
      alert('GPS error: ' + err.message);
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
  );
});

// ===== Follow Toggle =====
btnFollow.addEventListener('click', () => {
  followMode = !followMode;
  updateFollowButton();
  if (followMode && lastPosition) {
    map.jumpTo({ center: [lastPosition.lon, lastPosition.lat] });
  }
});

// ===== Compass / Heading =====
function rotateUIHeading(deg) {
  headingArrow.style.transform = `translate(-50%, -50%) rotate(${deg}deg)`;
}

function onHeading(deg) {
  headingDeg = deg;
  rotateUIHeading(deg);
  // Keep map north-aligned to real world by rotating the map bearing opposite the device heading
  map.setBearing(-deg);
}

async function enableCompass() {
  try {
    // iOS permission flow
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      const resp = await DeviceOrientationEvent.requestPermission();
      if (resp !== 'granted') {
        alert('Compass permission denied');
        return;
      }
      window.addEventListener('deviceorientation', handleOrientation, true);
      haveCompass = true;
      return;
    }
    // Android / Desktop
    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    window.addEventListener('deviceorientation', handleOrientation, true);
    haveCompass = true;
  } catch (e) {
    console.error(e);
    alert('Compass not available on this device/browser.');
  }
}

function handleOrientation(e) {
  // Prefer 'absolute' alpha if present; fallback to webkitCompassHeading (Safari)
  let deg = null;
  if (typeof e.webkitCompassHeading === 'number') {
    // iOS Safari provides heading degrees *clockwise from north*
    deg = e.webkitCompassHeading;
  } else if (typeof e.alpha === 'number') {
    // alpha is degrees clockwise from device's initial orientation relative to Earth's magnetic north (depends on browser)
    // Try to use e.absolute if available; otherwise treat alpha as 0–360 with north ~ alpha (best-effort)
    deg = 360 - e.alpha; // invert so 0 means north, positive clockwise
  }
  if (deg == null || Number.isNaN(deg)) return;
  deg = (deg % 360 + 360) % 360;
  onHeading(deg);
}

btnCompass.addEventListener('click', enableCompass);

// ===== Waypoints Panel =====
btnWaypoints.addEventListener('click', () => {
  wpPanel.classList.remove('hidden');
  refreshWpList();
});
closeWp.addEventListener('click', () => {
  wpPanel.classList.add('hidden');
  selectedWp = null;
  wpForm.reset();
});

wpForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = (wpName.value || '').trim();
  const coords = (wpCoords.value || '').trim();
  if (!name) { alert('Enter a name'); return; }
  try {
    const { lat, lon } = parseLatLon(coords);
    waypoints[name] = { lat, lon };
    saveWaypoints(waypoints);
    refreshWpList();
    selectedWp = name;
    alert(`Saved "${name}" at ${formatLatLon(lat, lon)}`);
  } catch (err) {
    alert(err.message);
  }
});

wpDelete.addEventListener('click', () => {
  if (!selectedWp) { alert('Select a waypoint in the list to delete'); return; }
  if (waypoints[selectedWp]) {
    delete waypoints[selectedWp];
    saveWaypoints(waypoints);
    refreshWpList();
    selectedWp = null;
    wpForm.reset();
  }
});

function refreshWpList() {
  wpList.innerHTML = '';
  const names = Object.keys(waypoints).sort((a,b)=>a.localeCompare(b));
  if (names.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No saved waypoints';
    wpList.appendChild(li);
    return;
  }
  names.forEach((name) => {
    const { lat, lon } = waypoints[name];
    const li = document.createElement('li');
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'wp-item';
    label.textContent = `${name} — ${formatLatLon(lat, lon)}`;
    label.addEventListener('click', () => {
      selectedWp = name;
      wpName.value = name;
      wpCoords.value = formatLatLon(lat, lon);
      // Fly to it
      map.easeTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 15), duration: 600 });
      // Add a one-off popup marker
      new maplibregl.Popup({ closeButton: true })
        .setLngLat([lon, lat])
        .setHTML(`<strong>${name}</strong><br>${formatLatLon(lat, lon)}`)
        .addTo(map);
    });
    li.appendChild(label);
    wpList.appendChild(li);
  });
}

// ===== Initial UI =====
updateFollowButton();
map.on('load', () => {
  // Stretch map after load, in case CSS/layout changed
  map.resize();
});

// Resize on orientation change / viewport changes
window.addEventListener('orientationchange', () => setTimeout(()=>map.resize(), 300));
window.addEventListener('resize', () => map.resize());
