let map, userMarker, accuracyCircle;
let followOn = false;
let lastPos = null;

// Init map
map = L.map('map').setView([34.851939, -119.168399], 13);

// OSM tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Create marker + circle
userMarker = L.marker([0,0], {opacity:0}).addTo(map);
accuracyCircle = L.circle([0,0], {radius:0, opacity:0}).addTo(map);

function updatePosition(lat, lon, accuracy) {
  lastPos = [lat, lon];
  userMarker.setLatLng([lat, lon]).setOpacity(1);
  accuracyCircle.setLatLng([lat, lon]).setRadius(accuracy).setStyle({opacity:0.3});
  if (followOn) {
    map.setView([lat, lon], map.getZoom(), {animate:true});
  }
}

// GPS button
document.getElementById("btn-gps").addEventListener("click", () => {
  if (!navigator.geolocation) {
    alert("Geolocation not supported");
    return;
  }
  navigator.geolocation.watchPosition(
    (pos) => {
      updatePosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
    },
    (err) => {
      console.error("GPS error", err);
    },
    {enableHighAccuracy:true}
  );
});

// Follow button
document.getElementById("btn-follow").addEventListener("click", () => {
  followOn = !followOn;
  document.getElementById("btn-follow").textContent = `Follow: ${followOn ? "ON" : "OFF"}`;
  if (followOn && lastPos) {
    map.setView(lastPos, map.getZoom());
  }
});
