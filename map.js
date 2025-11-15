// map.js
(function () {
  "use strict";

  const AP = (window.APTool = window.APTool || {});
  const s = AP.state;

  let map = null;
  let marker = null;

  function openBackdrop(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add("open");
  }
  function closeBackdrop(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove("open");
  }

  function initMap() {
    if (map) return;
    const container = document.getElementById("map-container");
    if (!container || typeof L === "undefined") {
      console.warn("Map container or Leaflet not ready yet.");
      return;
    }
    map = L.map(container).setView([0, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    // If we already have GPS, center there
    if (s.gps && typeof s.gps.lat === "number" && typeof s.gps.lon === "number") {
      map.setView([s.gps.lat, s.gps.lon], 15);
    } else if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c = pos.coords || {};
          if (c.latitude != null && c.longitude != null) {
            map.setView([c.latitude, c.longitude], 15);
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }

    map.on("click", (e) => {
      const lat = e.latlng.lat;
      const lon = e.latlng.lng;

      if (!marker) {
        marker = L.marker([lat, lon]).addTo(map);
      } else {
        marker.setLatLng([lat, lon]);
      }

      if (!s.target) s.target = { lat: null, lon: null, elev: null, src: "–" };
      s.target.lat = lat;
      s.target.lon = lon;
      s.target.src = "manual (no DEM)";

      const latEl = document.getElementById("target-lat");
      const lonEl = document.getElementById("target-lon");
      const srcEl = document.getElementById("target-elev-src");
      const statEl = document.getElementById("target-status");

      if (latEl) latEl.textContent = lat.toFixed(6);
      if (lonEl) lonEl.textContent = lon.toFixed(6);
      if (srcEl) srcEl.textContent = s.target.src;
      if (statEl) statEl.textContent = "Target set (enter elevation)";

      AP.setMapStatus("Target set. Use 'Edit elevation' to add height.");
      AP.scheduleUpdate();
    });
  }

  AP.openMapSheet = function () {
    openBackdrop("sheet-map-backdrop");
    AP.setMapStatus("Tap on the map near your AP / target.");
    // Give Leaflet a moment if container was hidden
    setTimeout(initMap, 100);
  };

  AP.closeMapSheet = function () {
    closeBackdrop("sheet-map-backdrop");
  };
})();
