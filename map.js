// map.js
(function (global) {
  "use strict";

  // Gradio-aware root resolver: works both in plain pages and HF/Gradio
  function root() {
    try {
      return global.gradioApp ? global.gradioApp() : document;
    } catch {
      return document;
    }
  }
  function qs(sel) {
    return root().querySelector(sel);
  }

  const AP = global.APTool = global.APTool || {};

  /**
   * Create a target map controller.
   * opts: {
   *   containerSelector: "#map-container",
   *   statusSelector: "#map-status",
   *   onSelect: (lat, lon) => {}
   * }
   */
  AP.createTargetMap = function (opts) {
    opts = opts || {};
    const containerSelector = opts.containerSelector || "#map-container";
    const statusSelector    = opts.statusSelector    || "#map-status";
    const onSelect          = typeof opts.onSelect === "function" ? opts.onSelect : null;

    let map    = null;
    let marker = null;

    function setStatus(msg) {
      if (!statusSelector) return;
      const el = qs(statusSelector);
      if (el) el.textContent = msg;
    }

    function ensureMap() {
      const el = qs(containerSelector);
      if (!el) {
        setStatus("Map container not found.");
        return;
      }
      if (map) return;

      if (typeof L === "undefined") {
        setStatus("Leaflet failed to load.");
        return;
      }

      map = L.map(el).setView([0, 0], 2);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
      }).addTo(map);

      // Try to center on user location if available
      if ("geolocation" in navigator) {
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
        setStatus("Point selected.");
        if (onSelect) onSelect(lat, lon);
      });

      setStatus("Tap on the map to set target.");
    }

    return {
      open() {
        ensureMap();
        // Fix hidden-sheet sizing: give the sheet a moment, then invalidate
        setTimeout(() => {
          if (map) {
            map.invalidateSize(false);
          }
        }, 250);
      }
    };
  };
})(window);
