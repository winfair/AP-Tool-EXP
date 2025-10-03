// app.js — minimal MapLibre setup with viewport fix

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
    glyphs:
      "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
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

  map.addControl(new maplibregl.ScaleControl({ unit: "imperial", maxWidth: 120 }), "bottom-left");

  const geolocate = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true, timeout: 10_000 },
    trackUserLocation: false,
    showUserLocation: true,
    showAccuracyCircle: false,
    fitBoundsOptions: { maxZoom: 16 },
  });
  map.addControl(geolocate, "top-left");

  map.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 120 }), "bottom-right");

  map.on("load", () => {
    console.log("[map] loaded");
  });

  map.on("error", (e) => {
    if (!e?.error?.message?.includes("Failed to load tile")) {
      console.warn("[map] error:", e);
    }
  });

  // Resize handling
  const forceResize = () => map.resize();
  window.addEventListener("resize", forceResize);
  window.addEventListener("orientationchange", () => setTimeout(forceResize, 250));
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", forceResize);
  }

  window.APMap = {
    map,
    rotateTo: (deg = 0, opts = { duration: 300 }) => map.rotateTo(deg, opts),
    setCenter: (lng, lat, z = 16) => map.flyTo({ center: [lng, lat], zoom: z }),
    geolocate: () => geolocate.trigger(),
    setPitch: (p = 45) => map.easeTo({ pitch: p, duration: 300 }),
    setZoom: (z = 14) => map.easeTo({ zoom: z, duration: 300 }),
  };
})();
