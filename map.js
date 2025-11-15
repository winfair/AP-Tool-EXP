// map.js
(function () {
  "use strict";

  const AP = (window.APTool = window.APTool || {});

  let map = null;
  let marker = null;
  let hasSetInitialView = false;

  /**
   * Initialize the Leaflet map once, and reuse it.
   *
   * @param {HTMLElement} containerEl  The #map-container element.
   * @param {HTMLElement} statusEl     The #map-status pill element.
   * @param {Function} getInitialPos   () => { lat, lon } | null
   * @param {Function} onClickLatLon   (lat, lon) => void
   */
  AP.initMapOnce = function (containerEl, statusEl, getInitialPos, onClickLatLon) {
    if (!containerEl) {
      if (statusEl) statusEl.textContent = "Map container missing.";
      return;
    }

    // If already created, just update view and status
    if (map) {
      if (statusEl) statusEl.textContent = "Tap on the map to set target.";
      const pos = getInitialPos && getInitialPos();
      if (pos && typeof pos.lat === "number" && typeof pos.lon === "number") {
        map.setView([pos.lat, pos.lon], 15);
      }
      setTimeout(() => {
        map.invalidateSize();
      }, 200);
      return;
    }

    try {
      map = L.map(containerEl).setView([0, 0], 2);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      const pos = getInitialPos && getInitialPos();
      if (pos && typeof pos.lat === "number" && typeof pos.lon === "number") {
        map.setView([pos.lat, pos.lon], 15);
        hasSetInitialView = true;
      } else if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (p) => {
            const c = p.coords || {};
            if (c.latitude != null && c.longitude != null) {
              map.setView([c.latitude, c.longitude], 15);
              hasSetInitialView = true;
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

        if (statusEl) statusEl.textContent = "Target selected. Fetching elevation…";

        if (typeof onClickLatLon === "function") {
          onClickLatLon(lat, lon);
        }
      });

      if (statusEl) statusEl.textContent = "Tap on the map to set target.";

      // Resize after sheet animation
      setTimeout(() => {
        map.invalidateSize();
      }, 200);
    } catch (e) {
      if (statusEl) statusEl.textContent = "Map init error: " + (e.message || e);
    }
  };
})();
