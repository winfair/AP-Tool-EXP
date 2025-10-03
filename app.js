// Initialize Leaflet map
const map = L.map('map').setView([0, 0], 2);

// Tile layers
const street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors"
}).addTo(map);

const topo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenTopoMap contributors"
});

const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  attribution: "Tiles © Esri"
});

L.control.layers({Street: street, Topo: topo, Satellite: satellite}).addTo(map);

// Follow mode toggle
let followMode = false;
const followBtn = document.getElementById("followToggle");
followBtn.onclick = () => {
  followMode = !followMode;
  followBtn.textContent = `Follow: ${followMode ? "ON" : "OFF"}`;
};

// Create a custom user marker with arrow
const userIcon = L.divIcon({
  className: "",
  html: `<svg class="user-marker" viewBox="0 0 64 64">
           <path d="M32 4 L52 60 L32 48 L12 60 Z" fill="red"/>
         </svg>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

let userMarker = null;
let currentHeading = 0;

// Update marker rotation
function setMarkerHeading(marker, angle) {
  if (marker && marker._icon) {
    marker._icon.querySelector("svg").style.transform = `rotate(${angle}deg)`;
  }
  document.getElementById("bearingReadout").textContent = `${angle.toFixed(0)}°`;
}

// GPS tracking
navigator.geolocation.watchPosition(pos => {
  const { latitude, longitude } = pos.coords;

  if (!userMarker) {
    userMarker = L.marker([latitude, longitude], { icon: userIcon }).addTo(map);
  } else {
    userMarker.setLatLng([latitude, longitude]);
  }

  if (followMode) {
    map.setView([latitude, longitude], 16);
  }

  // Keep orientation applied
  setMarkerHeading(userMarker, currentHeading);

  document.getElementById("gpsStatus").textContent = "GPS: OK";
}, () => {
  document.getElementById("gpsStatus").textContent = "GPS: Failed";
});

// Compass handling
window.addEventListener("deviceorientationabsolute", e => {
  if (e.alpha != null) {
    currentHeading = e.alpha; // degrees
    setMarkerHeading(userMarker, currentHeading);
    document.getElementById("compassStatus").textContent = "Compass: OK";
  }
});

// Waypoints
const wpList = document.getElementById("wpList");
const wpPanel = document.getElementById("wpPanel");
document.getElementById("fab").onclick = () => wpPanel.classList.toggle("hidden");

document.getElementById("wpAdd").onclick = () => {
  const name = document.getElementById("wpName").value;
  const coords = document.getElementById("wpCoords").value.split(",").map(c => parseFloat(c.trim()));
  if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
    const li = document.createElement("li");
    li.textContent = `${name || "Waypoint"} (${coords[0].toFixed(4)}, ${coords[1].toFixed(4)})`;
    wpList.appendChild(li);
    L.marker(coords).addTo(map).bindPopup(name || "Waypoint");
  }
};
