// map.js
// Leaflet floating map + elevation fetch.
// Exposes global TargetMap with:
//   TargetMap.open({ onConfirm({lat, lon, elevation}) })
//   TargetMap.close()

(function (global) {
  'use strict';

  var map = null;
  var marker = null;

  var selectedLat = null;
  var selectedLon = null;
  var selectedElev = null;
  var elevationPending = false;
  var elevationError = null;

  var onConfirmCallback = null;

  function $(id) {
    return document.getElementById(id);
  }

  function getInitialCenter() {
    // Try to use current GPS position if available
    try {
      if (global.Sensors && typeof global.Sensors.getState === 'function') {
        var s = global.Sensors.getState();
        if (typeof s.gpsLat === 'number' && typeof s.gpsLon === 'number') {
          return { center: [s.gpsLat, s.gpsLon], zoom: 14 };
        }
      }
    } catch (e) {
      // ignore
    }
    // Fallback: somewhere reasonable
    return { center: [0, 0], zoom: 2 };
  }

  function updateOverlayDisplay() {
    var latSpan = $('overlayLat');
    var lonSpan = $('overlayLon');
    var elevSpan = $('overlayElev');
    var statusSpan = $('overlayStatus');

    if (latSpan) {
      latSpan.textContent =
        typeof selectedLat === 'number' ? selectedLat.toFixed(6) : '—';
    }
    if (lonSpan) {
      lonSpan.textContent =
        typeof selectedLon === 'number' ? selectedLon.toFixed(6) : '—';
    }

    if (elevSpan) {
      if (elevationPending) {
        elevSpan.textContent = 'Loading…';
      } else if (typeof selectedElev === 'number') {
        elevSpan.textContent = selectedElev.toFixed(1) + ' m';
      } else if (elevationError) {
        elevSpan.textContent = 'N/A';
      } else {
        elevSpan.textContent = '—';
      }
    }

    if (statusSpan) {
      if (!selectedLat || !selectedLon) {
        statusSpan.textContent = 'Tap on the map to place the pin.';
      } else if (elevationPending) {
        statusSpan.textContent = 'Fetching elevation for this point…';
      } else if (elevationError) {
        statusSpan.textContent = 'Elevation error: ' + elevationError;
      } else {
        statusSpan.textContent = 'Pin placed. Tap “Use this point” to confirm.';
      }
    }
  }

  function fetchElevation(lat, lon) {
    elevationPending = true;
    selectedElev = null;
    elevationError = null;
    updateOverlayDisplay();

    var url =
      'https://api.open-meteo.com/v1/elevation?latitude=' +
      encodeURIComponent(lat) +
      '&longitude=' +
      encodeURIComponent(lon);

    fetch(url)
      .then(function (res) {
        if (!res.ok) {
          throw new Error('HTTP ' + res.status);
        }
        return res.json();
      })
      .then(function (data) {
        if (data && Array.isArray(data.elevation) && data.elevation.length > 0) {
          selectedElev = data.elevation[0]; // meters
        } else {
          elevationError = 'No elevation data returned';
        }
      })
      .catch(function (err) {
        elevationError = err && err.message ? err.message : 'Unknown error';
      })
      .finally(function () {
        elevationPending = false;
        updateOverlayDisplay();
      });
  }

  function onMapClick(ev) {
    if (!ev || !ev.latlng) return;
    var latlng = ev.latlng;

    selectedLat = latlng.lat;
    selectedLon = latlng.lng;
    selectedElev = null;
    elevationError = null;

    if (marker) {
      marker.setLatLng(latlng);
    } else {
      marker = L.marker(latlng).addTo(map);
    }

    updateOverlayDisplay();
    fetchElevation(selectedLat, selectedLon);
  }

  function ensureMap() {
    if (map) {
      setTimeout(function () {
        map.invalidateSize();
      }, 50);
      return;
    }

    var mapDiv = $('mapDiv');
    if (!mapDiv) {
      console.warn('mapDiv not found');
      return;
    }

    var init = getInitialCenter();
    map = L.map(mapDiv).setView(init.center, init.zoom);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    map.on('click', onMapClick);

    setTimeout(function () {
      map.invalidateSize();
    }, 100);
  }

  function openOverlay(options) {
    onConfirmCallback =
      options && typeof options.onConfirm === 'function' ? options.onConfirm : null;

    var overlay = $('mapOverlay');
    if (!overlay) {
      console.warn('mapOverlay not found');
      return;
    }

    overlay.style.display = 'flex';

    // Reset selection state for new session (optional)
    selectedLat = null;
    selectedLon = null;
    selectedElev = null;
    elevationError = null;
    elevationPending = false;
    updateOverlayDisplay();

    ensureMap();
  }

  function closeOverlay() {
    var overlay = $('mapOverlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  function confirmSelection() {
    if (
      onConfirmCallback &&
      typeof selectedLat === 'number' &&
      typeof selectedLon === 'number'
    ) {
      onConfirmCallback({
        lat: selectedLat,
        lon: selectedLon,
        elevation:
          typeof selectedElev === 'number' ? selectedElev : null
      });
    }
    closeOverlay();
  }

  function wireButtons() {
    var cancelBtn = $('cancelTargetBtn');
    var confirmBtn = $('confirmTargetBtn');

    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        closeOverlay();
      });
    }
    if (confirmBtn) {
      confirmBtn.addEventListener('click', function () {
        confirmSelection();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireButtons);
  } else {
    wireButtons();
  }

  global.TargetMap = {
    open: openOverlay,
    close: closeOverlay
  };
})(window);
