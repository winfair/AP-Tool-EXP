// app.js — MapLibre setup + robust mobile fullscreen fix

(() => {
  if (typeof maplibregl === "undefined") {
    console.error("MapLibre GL JS failed to load.");
    return;
  }

  // --- Style: keyless OSM raster tiles ---
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
    layers: [{ id: "osm-tiles", type: "raster", source: "osm" }],
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  };

  // --- Map init ---
  const map = new maplibregl.Map({
    container: "map",
    style: OSM_RASTER_STYLE,
    center: [-119.168399, 34.851939],
    zoom: 13,
    pitch: 0,
    bearing: 0,
    hash: true,
    dragRotate: true,
    touchZoomRotate: true,
    scrollZoom: true,
    doubleClickZoom: true,
    boxZoom: true,
    fadeDuration: 200,
    renderWorldCopies: true,
    cooperativeGestures: true,
  });

  // --- Controls ---
  const nav = new maplibregl.NavigationControl({
    showCompass: true,
    showZoom: true,
    visualizePitch: true,
  });
  map.addControl(nav, "top-right");

  map.addControl(
    new maplibregl.ScaleControl({ unit: "imperial", maxWidth: 120 }),
    "bottom-left"
  );
  const geolocate = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true, timeout: 10_000 },
    trackUserLocation: false,
    showUserLocation: true,
    showAccuracyCircle: false,
    fitBoundsOptions: { maxZoom: 16 },
  });
  map.addControl(geolocate, "top-left");
  map.addControl(
    new maplibregl.ScaleControl({ unit: "metric", maxWidth: 120 }),
    "bottom-right"
  );

  // --- Map lifecycle ---
  map.on("load", () => {
    console.log("[map] loaded");
    fixMapHeight(); // ensure first render uses visual viewport
  });

  map.on("error", (e) => {
    if (!e?.error?.message?.includes("Failed to load tile")) {
      console.warn("[map] error:", e);
    }
  });

  // --- Robust fullscreen fix for mobile browsers ---
  function fixMapHeight() {
    const mapEl = document.getElementById("map");
    if (!mapEl) return;

    // Prefer visual viewport height when available
    const h = window.visualViewport
      ? Math.round(window.visualViewport.height)
      : Math.round(window.innerHeight);

    mapEl.style.height = h + "px";
    map.resize();
  }

  // Resize/rotation/URL-bar show-hide handling
  window.addEventListener("resize", fixMapHeight);
  window.addEventListener("orientationchange", () =>
    setTimeout(fixMapHeight, 250)
  );
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", fixMapHeight);
    window.visualViewport.addEventListener("scroll", fixMapHeight);
  }

  // Extra safety: observe container size changes
  const mapEl = document.getElementById("map");
  if (mapEl && "ResizeObserver" in window) {
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(mapEl);
  }

  // Expose a tiny debug API
  window.APMap = {
    map,
    rotateTo: (deg = 0, opts = { duration: 300 }) => map.rotateTo(deg, opts),
    setCenter: (lng, lat, z = 16) =>
      map.flyTo({ center: [lng, lat], zoom: z }),
    geolocate: () => geolocate.trigger(),
    setPitch: (p = 45) => map.easeTo({ pitch: p, duration: 300 }),
    setZoom: (z = 14) => map.easeTo({ zoom: z, duration: 300 }),
    fixMapHeight,
  };

  // Run once ASAP
  fixMapHeight();
})();
