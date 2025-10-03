/* ==========
   Maps Starter — GPS + Search + Routing
   Three files only: index.html, style.css, app.js
   ========== */

// ------- Map bootstrap -------
const map = L.map('map', {
  zoomControl: true
});

// Safe initial view (in case geolocation is denied/slow)
map.setView([37.773972, -122.431297], 12); // San Francisco as a default

// OSM raster tiles (respect usage + attribution)
const osm = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }
).addTo(map);

L.control.scale({ metric: true, imperial: true, position: 'bottomleft' }).addTo(map);

// ------- State -------
let watchId = null;
let userMarker = null;
let accuracyCircle = null;

let startCoord = null; // [lat, lng]
let endCoord = null;

let routeLayer = null;
let startMarker = null;
let endMarker = null;

// ------- DOM -------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const searchInput = $('#search');
const suggestions = $('#suggestions');
const startInput = $('#start');
const endInput = $('#end');
const routeBtn = $('#routeBtn');
const clearRouteBtn = $('#clearRouteBtn');
const useLocStartBtn = $('#useLocStart');
const useLocEndBtn = $('#useLocEnd');
const locateBtn = $('#locateBtn');
const centerBtn = $('#centerBtn');
const panel = $('#panel');
const stepsList = $('#steps');
const summaryEl = $('#summary');
const closePanel = $('#closePanel');

// ------- Helpers -------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function fmtDistance(m) {
  if (m >= 1000) return (m / 1000).toFixed(1) + ' km';
  return Math.round(m) + ' m';
}
function fmtDuration(s) {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h) return `${h} hr ${m} min`;
  return `${m} min`;
}
function debounce(fn, wait = 350) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
function toLatLng(obj) {
  // Accept {lat, lon} or {lat, lng} or [lat,lng]
  if (Array.isArray(obj)) return { lat: obj[0], lng: obj[1] };
  const lat = +obj.lat;
  const lng = +('lng' in obj ? obj.lng : obj.lon);
  return { lat, lng };
}
function setStart(latlng, label = '') {
  startCoord = [latlng.lat, latlng.lng];
  startInput.value = label || `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
  if (!startMarker) startMarker = L.marker(startCoord, { draggable: true }).addTo(map);
  startMarker.setLatLng(startCoord).bindPopup('Start').openPopup();
  startMarker.off('dragend').on('dragend', () => {
    const p = startMarker.getLatLng();
    startCoord = [p.lat, p.lng];
  });
}
function setEnd(latlng, label = '') {
  endCoord = [latlng.lat, latlng.lng];
  endInput.value = label || `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
  if (!endMarker) endMarker = L.marker(endCoord, { draggable: true }).addTo(map);
  endMarker.setLatLng(endCoord).bindPopup('End').openPopup();
  endMarker.off('dragend').on('dragend', () => {
    const p = endMarker.getLatLng();
    endCoord = [p.lat, p.lng];
  });
}
function clearRoute() {
  if (routeLayer) { routeLayer.remove(); routeLayer = null; }
  stepsList.innerHTML = '';
  summaryEl.textContent = '';
  panel.hidden = true;
}

// ------- Geolocation / Tracking -------
async function ensureUserMarker(lat, lng, acc) {
  const latlng = [lat, lng];
  if (!userMarker) {
    userMarker = L.marker(latlng, { title: 'You' }).addTo(map);
  } else {
    userMarker.setLatLng(latlng);
  }
  if (!accuracyCircle) {
    accuracyCircle = L.circle(latlng, {
      radius: acc || 15,
      color: '#3b82f6',
      fillColor: '#3b82f6',
      fillOpacity: 0.15,
      weight: 1
    }).addTo(map);
  } else {
    accuracyCircle.setLatLng(latlng);
    if (acc) accuracyCircle.setRadius(acc);
  }
}

function startTracking() {
  if (!('geolocation' in navigator)) {
    alert('Geolocation not supported in this browser.');
    return;
  }
  if (watchId !== null) return; // already tracking

  watchId = navigator.geolocation.watchPosition(
    pos => {
      const { latitude, longitude, accuracy } = pos.coords;
      ensureUserMarker(latitude, longitude, accuracy);
    },
    err => {
      console.warn('Geolocation error:', err);
      alert('Could not access your location. Check permissions.');
      stopTracking();
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
  );
  locateBtn.textContent = '⏸️ Tracking';
}
function stopTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  locateBtn.textContent = '▶️ Track';
}
locateBtn.addEventListener('click', () => (watchId === null ? startTracking() : stopTracking()));
centerBtn.addEventListener('click', async () => {
  if (userMarker) {
    map.flyTo(userMarker.getLatLng(), Math.max(map.getZoom(), 15));
  } else {
    // single-shot getCurrentPosition
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000 })
      );
      await ensureUserMarker(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      map.flyTo([pos.coords.latitude, pos.coords.longitude], 16);
    } catch (e) {
      alert('Could not get current position.');
    }
  }
});

// ------- Search (Nominatim) -------
/*
  Nominatim demo policy: identify via Referer (your GitHub Pages URL) and keep light.
  We also bias results to current map bounds and limit to 5.
  Policy refs: OSMF Nominatim usage policy. 
*/
const NOM_BASE = 'https://nominatim.openstreetmap.org';

async function geocode(q) {
  const bbox = map.getBounds();
  const viewbox = [bbox.getWest(), bbox.getNorth(), bbox.getEast(), bbox.getSouth()].join(',');
  const url = `${NOM_BASE}/search?format=jsonv2&q=${encodeURIComponent(q)}&addressdetails=1&limit=5&viewbox=${viewbox}&bounded=1`;
  const resp = await fetch(url, { headers: { 'Accept-Language': 'en' }});
  if (!resp.ok) throw new Error('Geocoding failed');
  return resp.json();
}
async function reverseGeocode(lat, lon) {
  const url = `${NOM_BASE}/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1`;
  const resp = await fetch(url, { headers: { 'Accept-Language': 'en' }});
  if (!resp.ok) throw new Error('Reverse geocoding failed');
  return resp.json();
}

const renderSuggestions = (items) => {
  suggestions.innerHTML = '';
  items.forEach((it, idx) => {
    const div = document.createElement('div');
    div.className = 'item' + (idx === 0 ? ' active' : '');
    div.tabIndex = 0;
    div.textContent = it.display_name;
    div.addEventListener('click', () => {
      const lat = +it.lat, lon = +it.lon;
      map.flyTo([lat, lon], 16);
      L.marker([lat, lon]).addTo(map).bindPopup(it.display_name).openPopup();
      searchInput.value = it.display_name;
      suggestions.hidden = true;
    });
    suggestions.appendChild(div);
  });
  suggestions.hidden = items.length === 0;
};

searchInput.addEventListener('input', debounce(async (e) => {
  const q = e.target.value.trim();
  if (!q) { suggestions.hidden = true; return; }
  try {
    const results = await geocode(q);
    renderSuggestions(results);
  } catch (err) {
    console.warn(err);
    suggestions.hidden = true;
  }
}, 350));

searchInput.addEventListener('keydown', (e) => {
  if (suggestions.hidden) return;
  const items = [...suggestions.querySelectorAll('.item')];
  const idx = items.findIndex(n => n.classList.contains('active'));
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = items[(idx + 1) % items.length];
    items.forEach(n => n.classList.remove('active'));
    next.classList.add('active');
    next.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prev = items[(idx - 1 + items.length) % items.length];
    items.forEach(n => n.classList.remove('active'));
    prev.classList.add('active');
    prev.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    items[idx]?.click();
  } else if (e.key === 'Escape') {
    suggestions.hidden = true;
  }
});

// ------- Click to reverse-geocode -------
map.on('click', async (ev) => {
  try {
    const { lat, lng } = ev.latlng;
    const data = await reverseGeocode(lat, lng);
    const name = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const popupHtml = `
      <div>
        <div style="margin-bottom:6px"><strong>${name}</strong></div>
        <div style="display:flex;gap:6px">
          <button id="popSetA">Set as Start</button>
          <button id="popSetB">Set as End</button>
        </div>
      </div>`;
    const pop = L.popup().setLatLng([lat, lng]).setContent(popupHtml).openOn(map);
    // delegate after popup is added to DOM
    setTimeout(() => {
      const a = document.getElementById('popSetA');
      const b = document.getElementById('popSetB');
      a?.addEventListener('click', () => { setStart({lat,lng}, name); map.closePopup(pop); });
      b?.addEventListener('click', () => { setEnd({lat,lng}, name); map.closePopup(pop); });
    }, 0);
  } catch (e) {
    console.warn(e);
  }
});

// ------- Route (OSRM demo) -------
/*
  OSRM public demo endpoint is for light/demo use only — not production/heavy traffic.
  You can self-host or use a paid provider if needed.
*/
const OSRM = 'https://router.project-osrm.org/route/v1/driving';

async function route(startLatLng, endLatLng) {
  const a = toLatLng(startLatLng), b = toLatLng(endLatLng);
  const url = `${OSRM}/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson&alternatives=true&steps=true&annotations=distance,duration`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Routing failed');
  const json = await resp.json();
  if (!json.routes?.length) throw new Error('No routes found');
  return json.routes[0];
}

function renderRoute(route) {
  // Remove old route
  if (routeLayer) { routeLayer.remove(); routeLayer = null; }

  // Draw geometry
  routeLayer = L.geoJSON(route.geometry, {
    style: { color: '#22c55e', weight: 5, opacity: 0.9 }
  }).addTo(map);

  // Fit map to route
  map.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });

  // Summary
  summaryEl.textContent = `${fmtDistance(route.distance)} • ${fmtDuration(route.duration)}`;
  panel.hidden = false;

  // Steps (basic string from maneuver + road name)
  stepsList.innerHTML = '';
  route.legs.forEach(leg => {
    leg.steps.forEach(step => {
      const li = document.createElement('li');
      const m = step.maneuver || {};
      const name = step.name || '';
      const modifier = m.modifier ? ` ${m.modifier}` : '';
      const text = `${(m.type || 'Continue')}${modifier}${name ? ` onto ${name}` : ''} — ${fmtDistance(step.distance)} (${fmtDuration(step.duration)})`;
      li.textContent = text;
      stepsList.appendChild(li);
    });
  });
}

routeBtn.addEventListener('click', async () => {
  if (!startCoord || !endCoord) {
    alert('Set both Start and End (search or click the map).');
    return;
  }
  try {
    const r = await route(startCoord, endCoord);
    renderRoute(r);
  } catch (e) {
    console.warn(e);
    alert('Routing error. Try different points.');
  }
});

clearRouteBtn.addEventListener('click', () => {
  clearRoute();
  if (startMarker) { startMarker.remove(); startMarker = null; }
  if (endMarker) { endMarker.remove(); endMarker = null; }
  startCoord = endCoord = null;
  startInput.value = endInput.value = '';
});

closePanel.addEventListener('click', () => { panel.hidden = true; });

// Apply "use my location" buttons
useLocStartBtn.addEventListener('click', async () => {
  try {
    const p = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000 })
    );
    const { latitude: lat, longitude: lng } = p.coords;
    setStart({ lat, lng }, 'My location');
  } catch { alert('Location unavailable.'); }
});
useLocEndBtn.addEventListener('click', async () => {
  try {
    const p = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000 })
    );
    const { latitude: lat, longitude: lng } = p.coords;
    setEnd({ lat, lng }, 'My location');
  } catch { alert('Location unavailable.'); }
});

// Optional: start lightweight tracking auto
startTracking();
