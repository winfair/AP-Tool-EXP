window.addEventListener('DOMContentLoaded', () => {
  // --- PWA Install prompt handling ---
  let deferredPrompt;
  const installBtn = document.getElementById('installBtn');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.hidden = false;
  });
  installBtn?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    installBtn.hidden = true;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  });

  // --- Map init ---
  const map = new maplibregl.Map({
    container: 'map',
    style: 'https://demotiles.maplibre.org/style.json',
    center: [-119.168399, 34.851939],
    zoom: 12,
    pitch: 0,
    bearing: 0
  });
  map.addControl(new maplibregl.NavigationControl());

  // --- HUD (arrow + ray) canvas setup ---
  const hud = document.getElementById('hud');
  const targetInfo = document.getElementById('targetInfo');

  function sizeHud() {
    const cont = map.getContainer();
    const rect = cont.getBoundingClientRect();
    hud.width = Math.max(1, Math.floor(rect.width * devicePixelRatio));
    hud.height = Math.max(1, Math.floor(rect.height * devicePixelRatio));
    hud.style.width = rect.width + 'px';
    hud.style.height = rect.height + 'px';
  }

  // --- Waypoints storage & rendering ---
  const WP_KEY = 'waypoints_v1';
  const wpForm = document.getElementById('wpForm');
  const wpList = document.getElementById('wpList');
  const clearAllBtn = document.getElementById('clearAll');
  let markers = [];

  function loadWps(){ try { return JSON.parse(localStorage.getItem(WP_KEY)) || []; } catch { return []; } }
  function saveWps(arr){ localStorage.setItem(WP_KEY, JSON.stringify(arr)); }

  function escapeHtml(s){
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function renderWps(){
    // clear map markers
    markers.forEach(m => m.remove());
    markers = [];

    const wps = loadWps();
    wpList.innerHTML = '';
    wps.forEach((wp, idx) => {
      // list row
      const li = document.createElement('li');
      const left = document.createElement('div');
      left.innerHTML = `<strong>${escapeHtml(wp.name)}</strong> <span class="meta">${wp.lat.toFixed(6)}, ${wp.lon.toFixed(6)}</span>`;
      const right = document.createElement('div');

      const flyBtn = document.createElement('button');
      flyBtn.textContent = 'Fly';
      flyBtn.onclick = () => map.flyTo({ center: [wp.lon, wp.lat], zoom: 15, speed: 0.9 });

      const copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copy';
      copyBtn.onclick = async () => {
        const s = `${wp.lat} ${wp.lat >= 0 ? 'N' : 'S'}, ${wp.lon} ${wp.lon >= 0 ? 'E' : 'W'}`;
        await navigator.clipboard.writeText(s);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => (copyBtn.textContent = 'Copy'), 900);
      };

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.onclick = () => {
        const arr = loadWps();
        arr.splice(idx, 1);
        saveWps(arr);
        renderWps();
        drawHud();
      };

      right.append(flyBtn, copyBtn, delBtn);
      li.append(left, right);
      wpList.append(li);

      // map marker
      const marker = new maplibregl.Marker().setLngLat([wp.lon, wp.lat]).addTo(map);
      markers.push(marker);
    });

    drawHud();
  }

  function parseCoords(input){
    // Accepts "34.851939 N, -119.168399 W" OR "34.851939, -119.168399"
    const withDir = /([+-]?\d+(?:\.\d+)?)\s*([NS])?,?\s*([+-]?\d+(?:\.\d+)?)\s*([EW])?/i;
    const m = input.match(withDir);
    if (!m) return null;
    let lat = parseFloat(m[1]);
    let lon = parseFloat(m[3]);
    if (m[2]) lat = m[2].toUpperCase() === 'S' ? -Math.abs(lat) : Math.abs(lat);
    if (m[4]) lon = m[4].toUpperCase() === 'W' ? -Math.abs(lon) : Math.abs(lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
    return { lat, lon };
  }

  wpForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('wpName').value.trim();
    const raw = document.getElementById('wpCoords').value.trim();
    const coords = parseCoords(raw);
    if (!name || !coords) return;
    const arr = loadWps();
    arr.push({ name, lat: coords.lat, lon: coords.lon });
    saveWps(arr);
    wpForm.reset();
    renderWps();
  });

  clearAllBtn.addEventListener('click', () => {
    if (confirm('Clear all waypoints?')) {
      localStorage.removeItem(WP_KEY);
      renderWps();
    }
  });

  // --- GPS + Follow ---
  const btnGps = document.getElementById('btnGps');
  const btnFollow = document.getElementById('btnFollow');
  let watchId = null;
  let follow = false;
  let lastGps = null;

  btnGps.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      alert('Geolocation not supported on this device/browser.');
      return;
    }
    if (watchId !== null) { alert('GPS is already enabled.'); return; }

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        lastGps = { lat: latitude, lon: longitude };
        if (follow) {
          map.easeTo({ center: [longitude, latitude], duration: 500 });
        }
        drawHud();
      },
      (err) => { alert('GPS error: ' + err.message); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    btnFollow.disabled = false;
  });

  btnFollow.addEventListener('click', () => {
    follow = !follow;
    btnFollow.setAttribute('aria-pressed', String(follow));
    btnFollow.textContent = `🎯 Follow: ${follow ? 'ON' : 'OFF'}`;
    if (follow && lastGps) {
      map.easeTo({ center: [lastGps.lon, lastGps.lat], duration: 500 });
    }
  });

  // --- Compass (heading-up map + HUD redraw) ---
  const btnCompass = document.getElementById('btnCompass');
  let compassEnabled = false;
  let currentHeading = 0; // degrees

  btnCompass.addEventListener('click', async () => {
    if (compassEnabled) return;
    const needRequest = typeof DeviceOrientationEvent !== 'undefined'
      && typeof DeviceOrientationEvent.requestPermission === 'function';
    try {
      if (needRequest) {
        const state = await DeviceOrientationEvent.requestPermission();
        if (state !== 'granted') { alert('Compass permission was not granted.'); return; }
      }
      startCompass();
      compassEnabled = true;
      btnCompass.textContent = '🧭 Compass Enabled';
      btnCompass.disabled = true;
    } catch (e) {
      alert('Compass not available: ' + (e && e.message ? e.message : e));
    }
  });

  function startCompass(){
    const onOrient = (e) => {
      let heading;
      if (typeof e.webkitCompassHeading === 'number') {
        heading = e.webkitCompassHeading; // iOS Safari
      } else if (typeof e.alpha === 'number') {
        heading = 360 - e.alpha; // general
      }
      if (typeof heading === 'number' && isFinite(heading)) {
        currentHeading = (heading + 360) % 360;
        map.rotateTo(currentHeading, { duration: 0 });
        drawHud();
      }
    };
    if ('ondeviceorientationabsolute' in window) {
      window.addEventListener('deviceorientationabsolute', onOrient, true);
    } else {
      window.addEventListener('deviceorientation', onOrient, true);
    }
  }

  // --- Waypoints floating menu toggle ---
  const btnWaypoints = document.getElementById('btnWaypoints');
  const wpPanel = document.getElementById('wpPanel');
  const closeWp = document.getElementById('closeWp');

  btnWaypoints.addEventListener('click', () => {
    wpPanel.classList.toggle('hidden');
  });
  closeWp.addEventListener('click', () => wpPanel.classList.add('hidden'));

  // --- Draw HUD (center arrow + long ray + waypoint alignment) ---
  const ALIGN_TOLERANCE_PX = 8; // how close to center x to count as "crossing"

  function drawHud(){
    sizeHud();
    const ctx = hud.getContext('2d');
    const w = hud.width, h = hud.height;
    const px = w / devicePixelRatio, py = h / devicePixelRatio;
    const cx = px / 2, cy = py / 2;

    // Which waypoint(s) align with the center vertical?
    const wps = loadWps();
    let aligned = null;
    let alignedScreenY = Infinity;

    wps.forEach(wp => {
      const p = map.project([wp.lon, wp.lat]); // CSS pixel coords
      const dx = p.x - cx;
      const dy = p.y - cy;
      if (Math.abs(dx) <= ALIGN_TOLERANCE_PX) {
        const absY = Math.abs(dy);
        if (absY < alignedScreenY) {
          aligned = { name: wp.name, screen: p, offscreen: p.y < 0 || p.y > py };
          alignedScreenY = absY;
        }
      }
    });

    // clear & scale
    ctx.clearRect(0,0,w,h);
    ctx.save();
    ctx.scale(devicePixelRatio, devicePixelRatio);

    // color setup
    const baseColor = getComputedStyle(document.documentElement).getPropertyValue('--green').trim() || '#3ddc84';
    const rayColor = aligned ? '#ff4d4d' : baseColor;
    const glowColor = aligned ? '#ff2a2a' : baseColor;

    // arrow geometry
    const arrowLen = 38;
    const arrowWidth = 26;
    const tipX = cx;
    const tipY = cy - 18;

    // long ray towards top
    ctx.save();
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = rayColor;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = aligned ? 14 : 6;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(cx, -1000);
    ctx.stroke();
    ctx.restore();

    // arrow triangle
    ctx.save();
    ctx.fillStyle = rayColor;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = aligned ? 18 : 8;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY - arrowLen/2);
    ctx.lineTo(cx - arrowWidth/2, tipY + arrowLen/2);
    ctx.lineTo(cx + arrowWidth/2, tipY + arrowLen/2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // banner
    if (aligned) {
      targetInfo.hidden = false;
      targetInfo.textContent = `➡ ${aligned.name}`;
    } else {
      targetInfo.hidden = true;
      targetInfo.textContent = '';
    }

    ctx.restore();
  }

  // map/hud sync
  map.on('move', drawHud);
  map.on('zoom', drawHud);
  map.on('resize', drawHud);
  map.once('load', () => { sizeHud(); renderWps(); drawHud(); });

  // Redraw when window resizes (iOS rotates)
  window.addEventListener('resize', () => { sizeHud(); drawHud(); });
});
