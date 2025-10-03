// ===== Base Map (OSM / OpenTopo) =====
const BASES = {
  osm: {
    name: "OpenStreetMap",
    style: {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution:
            '© OpenStreetMap contributors | Heading-up logic © You',
        },
      },
      layers: [{ id: "osm", type: "raster", source: "osm" }],
    },
  },
  topo: {
    name: "OpenTopoMap",
    style: {
      version: 8,
      sources: {
        topo: {
          type: "raster",
          tiles: [
            "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
            "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
            "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
          attribution:
            'Map data: © OpenStreetMap contributors, SRTM | Style: © OpenTopoMap (CC-BY-SA)',
        },
      },
      layers: [{ id: "topo", type: "raster", source: "topo" }],
    },
  },
};

// ===== Map Setup =====
let currentBase = "osm";
const map = new maplibregl.Map({
  container: "map",
  style: BASES[currentBase].style,
  center: [-119.168399, 34.851939],
  zoom: 14,
  bearing: 0,
  pitch: 0,
  attributionControl: true,
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

// ----- UI hooks -----
const btnCompass = document.getElementById("btnCompass");
const btnGPS = document.getElementById("btnGPS");
const btnFollow = document.getElementById("btnFollow");
const btnWaypoints = document.getElementById("btnWaypoints");
const headingArrow = document.getElementById("headingArrow");

const wpPanel = document.getElementById("wpPanel");
const closeWp = document.getElementById("closeWp");
const wpForm = document.getElementById("wpForm");
const wpName = document.getElementById("wpName");
const wpCoords = document.getElementById("wpCoords");
const wpDelete = document.getElementById("wpDelete");
const wpList = document.getElementById("wpList");

// ===== State =====
let followMode = false;
let watchId = null;
let lastPosition = null; // {lat, lon, accuracy}
let headingDeg = null;
let selectedWp = null;

const meEl = document.createElement("div");
meEl.className = "me-marker";
const meMarker = new maplibregl.Marker({ element: meEl, anchor: "center" });

// ===== Persistence for waypoints =====
const LS_KEY = "ap_align_waypoints_v1";
const loadWaypoints = () => {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || {};
  } catch {
    return {};
  }
};
const saveWaypoints = (wps) => localStorage.setItem(LS_KEY, JSON.stringify(wps));
let waypoints = loadWaypoints();

// ===== Utilities =====
function parseLatLon(input) {
  const s = input.trim().replace(/\s+/g, " ");
  const parts = s.split(",");
  if (parts.length !== 2) throw new Error('Use "lat N/S, lon E/W"');

  const parseOne = (p, isLat) => {
    const m = p.trim().match(/^([+-]?\d+(?:\.\d+)?)(?:\s*([NnSsEeWw]))?$/);
    if (!m) throw new Error("Bad coordinate: " + p);
    let val = parseFloat(m[1]);
    const dir = m[2]?.toUpperCase();
    if (dir) {
      if (isLat && !["N", "S"].includes(dir)) throw new Error("Lat must be N/S");
      if (!isLat && !["E", "W"].includes(dir)) throw new Error("Lon must be E/W");
      if (dir === "S" || dir === "W") val = -Math.abs(val);
      else val = Math.abs(val);
    }
    return val;
  };

  const lat = parseOne(parts[0], true);
  const lon = parseOne(parts[1], false);
  if (Math.abs(lat) > 90) throw new Error("Lat out of range");
  if (Math.abs(lon) > 180) throw new Error("Lon out of range");
  return { lat, lon };
}

function formatLatLon(lat, lon) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(6)} ${ns}, ${Math.abs(lon).toFixed(6)} ${ew}`;
}

function updateFollowButton() {
  btnFollow.textContent = `Follow: ${followMode ? "On" : "Off"}`;
}

function rotateUIHeading(deg) {
  headingArrow.style.transform = `translate(-50%, -50%) rotate(${deg}deg)`;
}

// ===== Heading Ray (projects off-screen) =====
const RAY_SRC = "heading-ray-src";
const RAY_LAYER = "heading-ray-layer";

function ensureRayLayer() {
  if (!map.getSource(RAY_SRC)) {
    map.addSource(RAY_SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: RAY_LAYER,
      type: "line",
      source: RAY_SRC,
      paint: {
        "line-width": 2,
        "line-color": "#00ff00",
        "line-opacity": 0.8,
      },
    });
  }
}

function updateRay() {
  if (!lastPosition || headingDeg == null || !map.getSource(RAY_SRC)) return;
  const start = [lastPosition.lon, lastPosition.lat];
  // project 50km in heading direction so it always goes “off-screen”
  const dest = turf.destination(start, 50, headingDeg, { units: "kilometers" }).geometry.coordinates;
  const gj = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates: [start, dest] },
        properties: {},
      },
    ],
  };
  map.getSource(RAY_SRC).setData(gj);
}

// ===== GPS =====
btnGPS.addEventListener("click", () => {
  if (!("geolocation" in navigator)) {
    alert("Geolocation not supported");
    return;
  }
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      lastPosition = { lat: latitude, lon: longitude, accuracy };
      meMarker.setLngLat([longitude, latitude]).addTo(map);
      if (followMode) {
        map.easeTo({ center: [longitude, latitude], duration: 300 });
      }
      updateRay();
    },
    (err) => {
      console.error("GPS error", err);
      alert("GPS error: " + err.message);
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
  );
});

// ===== Follow =====
btnFollow.addEventListener("click", () => {
  followMode = !followMode;
  updateFollowButton();
  if (followMode && lastPosition) {
    map.jumpTo({ center: [lastPosition.lon, lastPosition.lat] });
  }
});

// ===== Compass / Heading-Up =====
function onHeading(deg) {
  headingDeg = deg;
  rotateUIHeading(deg);
  // Keep the map aligned to the real world (north “up” IRL) by rotating opposite the device heading
  map.setBearing(-deg);
  updateRay();
}

function handleOrientation(e) {
  let deg = null;
  if (typeof e.webkitCompassHeading === "number") {
    deg = e.webkitCompassHeading; // iOS Safari (clockwise from north)
  } else if (typeof e.alpha === "number") {
    // alpha: clockwise from device reference; invert for “north=0, clockwise=+”
    deg = 360 - e.alpha;
  }
  if (deg == null || Number.isNaN(deg)) return;
  deg = (deg % 360 + 360) % 360;
  onHeading(deg);
}

async function enableCompass() {
  try {
    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function"
    ) {
      const resp = await DeviceOrientationEvent.requestPermission();
      if (resp !== "granted") {
        alert("Compass permission denied");
        return;
      }
      window.addEventListener("deviceorientation", handleOrientation, true);
    } else {
      // Android / Desktop
      window.addEventListener("deviceorientationabsolute", handleOrientation, true);
      window.addEventListener("deviceorientation", handleOrientation, true);
    }
  } catch (e) {
    console.error(e);
    alert("Compass not available on this device/browser.");
  }
}
btnCompass.addEventListener("click", enableCompass);

// ===== Waypoints =====
btnWaypoints.addEventListener("click", () => {
  wpPanel.classList.remove("hidden");
  refreshWpList();
});
closeWp.addEventListener("click", () => {
  wpPanel.classList.add("hidden");
  selectedWp = null;
  wpForm.reset();
});

wpForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = (wpName.value || "").trim();
  const coords = (wpCoords.value || "").trim();
  if (!name) {
    alert("Enter a name");
    return;
  }
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

wpDelete.addEventListener("click", () => {
  if (!selectedWp) {
    alert("Select a waypoint in the list to delete");
    return;
  }
  if (waypoints[selectedWp]) {
    delete waypoints[selectedWp];
    saveWaypoints(waypoints);
    refreshWpList();
    selectedWp = null;
    wpForm.reset();
  }
});

function refreshWpList() {
  wpList.innerHTML = "";
  const names = Object.keys(waypoints).sort((a, b) => a.localeCompare(b));
  if (names.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No saved waypoints";
    wpList.appendChild(li);
    return;
  }
  names.forEach((name) => {
    const { lat, lon } = waypoints[name];
    const li = document.createElement("li");
    const label = document.createElement("button");
    label.type = "button";
    label.className = "wp-item";
    label.textContent = `${name} — ${formatLatLon(lat, lon)}`;
    label.addEventListener("click", () => {
      selectedWp = name;
      wpName.value = name;
      wpCoords.value = formatLatLon(lat, lon);
      map.easeTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 15), duration: 600 });
      new maplibregl.Popup({ closeButton: true })
        .setLngLat([lon, lat])
        .setHTML(`<strong>${name}</strong><br>${formatLatLon(lat, lon)}`)
        .addTo(map);
    });
    li.appendChild(label);
    wpList.appendChild(li);
  });
}

// ===== Base layer toggle (double-tap compass button) =====
let lastTap = 0;
btnCompass.addEventListener("click", () => {
  const now = Date.now();
  if (now - lastTap < 400) {
    // double-tap: toggle base map
    currentBase = currentBase === "osm" ? "topo" : "osm";
    const center = map.getCenter();
    const zoom = map.getZoom();
    const bearing = map.getBearing();
    map.setStyle(BASES[currentBase].style);
    map.once("styledata", () => {
      map.jumpTo({ center, zoom, bearing });
      if (map.isStyleLoaded()) {
        ensureRayLayer();
        updateRay();
      } else {
        map.once("load", () => {
          ensureRayLayer();
          updateRay();
        });
      }
    });
  }
  lastTap = now;
}, { capture: true });

// ===== Init =====
updateFollowButton();
map.on("load", () => {
  map.resize();
  ensureRayLayer();
  updateRay();
});
window.addEventListener("orientationchange", () => setTimeout(() => map.resize(), 300));
window.addEventListener("resize", () => map.resize());
