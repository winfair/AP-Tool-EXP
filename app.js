// app.js — MapLibre setup (safe-area layout, no height JS)

(() => {
  if (typeof maplibregl === "undefined") {
    console.error("MapLibre GL JS failed to load.");
    return;
  }

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

  // Controls
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

  map.on("error", (e) => {
    if (!e?.error?.message?.includes("Failed to load tile")) {
      console.warn("[map] error:", e);
    }
  });

  // If the safe-area insets change (URL bar show/hide), MapLibre will resize on its own
  // but we add a light nudge on viewport changes for reliability.
  const nudge = () => map.resize();
  window.addEventListener("orientationchange", () => setTimeout(nudge, 250));
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", nudge);
  }

  // Tiny debug API
  window.APMap = {
    map,
    geolocate: () => geolocate.trigger(),
    rotateTo: (deg = 0, opts = { duration: 300 }) => map.rotateTo(deg, opts),
  };
})();
