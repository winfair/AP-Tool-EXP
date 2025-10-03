// Initialize map
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [0, 0],
  zoom: 2
});

// Heading overlay elements
const line = document.getElementById("headingLine");
const arrow = document.getElementById("headingArrow");

function updateHeading(angle) {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const len = 100;
  const rad = angle * Math.PI / 180;
  const x2 = cx + len * Math.sin(rad);
  const y2 = cy - len * Math.cos(rad);

  line.setAttribute("x1", cx);
  line.setAttribute("y1", cy);
  line.setAttribute("x2", x2);
  line.setAttribute("y2", y2);

  arrow.setAttribute("transform", `translate(${cx},${cy}) rotate(${angle})`);
  document.getElementById("bearingReadout").textContent = `${angle.toFixed(0)}°`;
}

// GPS
navigator.geolocation.watchPosition(pos => {
  const { latitude, longitude } = pos.coords;
  map.setCenter([longitude, latitude]);
  map.setZoom(16);
  document.getElementById("gpsStatus").textContent = "GPS: OK";
}, () => {
  document.getElementById("gpsStatus").textContent = "GPS: Failed";
});

// Compass
window.addEventListener("deviceorientationabsolute", e => {
  if (e.alpha != null) {
    updateHeading(e.alpha);
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
    new maplibregl.Marker().setLngLat(coords).addTo(map);
  }
};
