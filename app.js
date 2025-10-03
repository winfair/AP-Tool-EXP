// Initialize the map
const map = L.map('map');

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Variables to hold the marker and accuracy circle
let userMarker = null;
let accuracyCircle = null;

// Success callback for geolocation
function onLocationFound(e) {
  const latlng = [e.latitude, e.longitude];

  if (!userMarker) {
    userMarker = L.marker(latlng).addTo(map);
  } else {
    userMarker.setLatLng(latlng);
  }

  if (!accuracyCircle) {
    accuracyCircle = L.circle(latlng, {
      radius: e.accuracy,
      color: '#136AEC',
      fillColor: '#136AEC',
      fillOpacity: 0.2
    }).addTo(map);
  } else {
    accuracyCircle.setLatLng(latlng).setRadius(e.accuracy);
  }

  map.setView(latlng, 16);
}

// Error callback for geolocation
function onLocationError(err) {
  alert("Unable to retrieve your location: " + err.message);
}

// Use browser's geolocation API
if ("geolocation" in navigator) {
  navigator.geolocation.watchPosition(
    pos => {
      onLocationFound({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy
      });
    },
    onLocationError,
    {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 10000
    }
  );
} else {
  alert("Geolocation is not supported by your browser.");
}
