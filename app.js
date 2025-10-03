// app.js — minimal MapLibre setup (no keys), good defaults for UX

(() => {
  // Ensure MapLibre is loaded
  if (typeof maplibregl === "undefined") {
    console.error("MapLibre GL JS failed to load.");
    return;
  }

  // --- Style: keyless OSM raster tiles (safe for GitHub Pages) ---
  // We start with raster. Vector styles can be added later without changing this scaffold.
  const OSM_RASTER_STYLE = {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 19,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      },
    },
    layers: [
      {
        id: "osm-tiles",
        type: "raster",
        source: "osm",
      },
    ],
    glyphs:
      "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf", // harmless placeholder; not strictly needed yet
  };

  // --- Map init ---
  const map = new maplibregl.Map({
    container: "map",
    style: OSM_RASTER_STYLE,
    center: [-119.168399, 34.851939], // Pine Mountain Club-ish (your usual test area)
    zoom: 13,
    pitch: 0,
    bearing: 0,
    hash: true, // allow sharing the current view via URL
    dragRotate: true,
    touchZoomRotate: true,
    scrollZoom: true,
    doubleClickZoom: true,
    boxZoom: true,
    fadeDuration: 200,
    renderWorldCopies: true,
    cooperativeGestures: true, // nicer scroll behavior on desktop trackpads
  });

  // --- Controls ---
  // Zoom + compass (reset to north) — built-in
  const nav = new maplibregl.NavigationControl({
    showCompass: true,
    showZoom: true,
    visualizePitch: true,
  });
  map.addControl(nav, "top-right");

  // Scale control (imperial for SoCal; we can add a toggle later)
  map.addControl(new maplibregl.ScaleControl({ unit: "imperial", maxWidth: 120 }), "bottom-left");

  // Geolocate control (good UX defaults; doesn’t auto-track yet)
  const geolocate = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true, timeout: 10_000 },
    trackUserLocation: false,
    showUserLocation: true,
    showAccuracyCircle: false,
    fitBoundsOptions: { maxZoom: 16 },
  });
  map.addControl(geolocate, "top-left");

  // Optional: Add metric scale as well (opposite corner)
  map.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 120 }), "bottom-right");

  // --- Map lifecycle + resilience ---
  map.on("load", () => {
    console.log("[map] loaded");
    // Keep attribution element in sync with our custom footer (index.html)
    syncAttribution();
  });

  map.on("error", (e) => {
    // Suppress noisy tile errors but log others for debugging
    if (!e?.error?.message?.includes("Failed to load tile")) {
      console.warn("[map] error:", e);
    }
  });

  // Keep the canvas snug to its container on resize
  const mapEl = document.getElementById("map");
  const ro = new ResizeObserver(() => map.resize());
  ro.observe(mapEl);

  // If the WebGL context is lost, try to restore gracefully
  map.getCanvas().addEventListener(
    "webglcontextlost",
    (e) => {
      e.preventDefault();
      console.warn("[map] WebGL context lost; attempting to restore…");
    },
    false
  );
  map.getCanvas().addEventListener(
    "webglcontextrestored",
    () => console.info("[map] WebGL context restored"),
    false
  );

  // --- Helpers ---
  function syncAttribution() {
    const el = document.querySelector("#attribution");
    if (!el) return;
    el.style.display = "block";
  }

  // Expose a tiny debug API in the console for manual testing
  // e.g., window.APMap.rotateTo(45)
  window.APMap = {
    map,
    rotateTo: (deg = 0, opts = { duration: 300 }) => map.rotateTo(deg, opts),
    setCenter: (lng, lat, z = 16) => map.flyTo({ center: [lng, lat], zoom: z }),
    geolocate: () => geolocate.trigger(),
    setPitch: (p = 45) => map.easeTo({ pitch: p, duration: 300 }),
    setZoom: (z = 14) => map.easeTo({ zoom: z, duration: 300 }),
  };
})();
