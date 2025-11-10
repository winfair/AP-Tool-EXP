/* Minimal comments; only the 'why' where it matters. */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const ui = {
  permBadge: $('#permBadge'),
  geoBadge: $('#geoBadge'),
  oriBadge: $('#oriBadge'),
  losBadge: $('#losBadge'),
  btnPermissions: $('#btnPermissions'),
  btnSetTarget: $('#btnSetTarget'),
  btnProfile: $('#btnProfile'),
  savedTargets: $('#savedTargets'),
  btnUseTarget: $('#btnUseTarget'),
  btnEditTarget: $('#btnEditTarget'),
  btnDeleteTarget: $('#btnDeleteTarget'),
  btnExport: $('#btnExport'),
  btnImport: $('#btnImport'),
  importFile: $('#importFile'),
  curLat: $('#curLat'),
  curLon: $('#curLon'),
  curAlt: $('#curAlt'),
  curAcc: $('#curAcc'),
  txAltOverride: $('#txAltOverride'),
  txAntenna: $('#txAntenna'),
  rxAntenna: $('#rxAntenna'),
  headingOffset: $('#headingOffset'),
  pitchOffset: $('#pitchOffset'),
  kFactor: $('#kFactor'),
  units: $('#units'),
  tgtName: $('#tgtName'),
  tgtLat: $('#tgtLat'),
  tgtLon: $('#tgtLon'),
  tgtAlt: $('#tgtAlt'),
  azErr: $('#azErr'),
  tiltErr: $('#tiltErr'),
  distLbl: $('#distLbl'),
  bearingLbl: $('#bearingLbl'),
  tiltLbl: $('#tiltLbl'),
  toast: $('#toast'),
  profileCanvas: $('#profileCanvas'),
  profileStatus: $('#profileStatus'),
  clearanceNote: $('#clearanceNote'),
  // Map dialog & controls
  dlg: $('#mapDialog'),
  mapDiv: $('#map'),
  mapClose: $('#mapClose'),
  mapRecenter: $('#mapRecenter'),
  mapSave: $('#mapSave'),
  tName: $('#tName'),
  tLat: $('#tLat'),
  tLon: $('#tLon'),
  tAlt: $('#tAlt'),
  tAntenna: $('#tAntenna'),
};

const state = {
  pos: null,                  // {lat, lon, alt, acc}
  headingDeg: null,           // compass heading (0..360, true/magnetic depends on browser)
  pitchDeg: 0,
  haveOrientation: false,
  haveGeo: false,
  targets: [],                // [{id,name,lat,lon,alt,rxAntenna}]
  activeTargetId: null,
  losCache: null,             // last profile result
  settings: {
    headingOffset: 0,
    pitchOffset: 0,
    kFactor: 1.33,
    units: 'metric',
    txAltOverride: null,
    txAntenna: 1.5,
    rxAntenna: 0,
  },
};

// ---- Storage
const LS_KEYS = {
  TARGETS: 'fa_targets_v1',
  SETTINGS: 'fa_settings_v1',
};
function loadStorage(){
  try{
    const ts = JSON.parse(localStorage.getItem(LS_KEYS.TARGETS) || '[]');
    state.targets = ts;
  }catch{}
  try{
    const st = JSON.parse(localStorage.getItem(LS_KEYS.SETTINGS) || '{}');
    Object.assign(state.settings, st);
  }catch{}
  // Apply settings to inputs
  ui.headingOffset.value = state.settings.headingOffset;
  ui.pitchOffset.value = state.settings.pitchOffset;
  ui.kFactor.value = state.settings.kFactor;
  ui.units.value = state.settings.units;
  ui.txAltOverride.value = state.settings.txAltOverride ?? '';
  ui.txAntenna.value = state.settings.txAntenna;
  ui.rxAntenna.value = state.settings.rxAntenna;
  refreshTargetsDropdown();
}
function saveStorage(){
  localStorage.setItem(LS_KEYS.TARGETS, JSON.stringify(state.targets));
  localStorage.setItem(LS_KEYS.SETTINGS, JSON.stringify(state.settings));
}

// ---- Utils
const toRad = (d)=> d * Math.PI/180;
const toDeg = (r)=> r * 180/Math.PI;
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function fmtDist(m){
  if(state.settings.units === 'imperial'){
    const ft = m * 3.28084;
    if(m >= 1609.344) return `${(m/1609.344).toFixed(2)} mi`;
    return `${Math.round(ft)} ft`;
  }
  if(m >= 1000) return `${(m/1000).toFixed(2)} km`;
  return `${Math.round(m)} m`;
}
function fmtAlt(m){
  if(state.settings.units === 'imperial'){
    return `${Math.round(m*3.28084)} ft`;
  }
  return `${Math.round(m)} m`;
}
function showToast(msg, ms=2800){
  ui.toast.textContent = msg;
  ui.toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=> ui.toast.hidden = true, ms);
}

// ---- Geodesy
function haversine(lat1, lon1, lat2, lon2){
  const R = 6371000;
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δφ = toRad(lat2-lat1);
  const Δλ = toRad(lon2-lon1);
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  const c = 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R*c; // meters
}
function initialBearing(lat1, lon1, lat2, lon2){
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δλ = toRad(lon2-lon1);
  const y = Math.sin(Δλ)*Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
  const θ = Math.atan2(y,x);
  return (toDeg(θ)+360)%360;
}
function tiltAngleMeters(d, hTx, hRx, k=1.33){
  const R = 6371000 * k;
  const drop = (d*d)/(2*R);
  return toDeg(Math.atan2((hRx - hTx) - drop, d));
}

// ---- Elevation APIs (Open-Elevation → USGS fallback)
async function fetchElevation(lat, lon){
  try{
    const r = await fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`);
    if(r.ok){
      const j = await r.json();
      if(j && j.results && j.results[0]) return j.results[0].elevation;
    }
  }catch(_) {}
  try{
    const r = await fetch(`https://nationalmap.gov/epqs/pqs.php?x=${lon}&y=${lat}&units=Meters&output=json`);
    if(r.ok){
      const j = await r.json();
      const v = j?.USGS_Elevation_Point_Query_Service?.Elevation_Query?.Elevation;
      if(typeof v === 'number') return v;
    }
  }catch(_) {}
  throw new Error('Elevation lookup failed');
}
async function fetchProfile(lat1, lon1, lat2, lon2, samples=64){
  try{
    const r = await fetch(`https://api.open-elevation.com/api/v1/profile?path=${lat1},${lon1}|${lat2},${lon2}&samples=${samples}`);
    if(r.ok){
      const j = await r.json();
      const arr = j?.results || [];
      return arr.map(p => ({ lat: p.location.lat, lon: p.location.lng ?? p.location.lon ?? p.location.lng, elev: p.elevation }));
    }
  }catch(_) {}
  // Fallback: stitch lookups
  const pts = [];
  for(let i=0;i<samples;i++){
    const f = i/(samples-1);
    const lat = lat1 + (lat2-lat1)*f;
    const lon = lon1 + (lon2-lon1)*f;
    try{
      const elev = await fetchElevation(lat, lon);
      pts.push({lat, lon, elev});
    }catch{
      pts.push({lat, lon, elev: NaN});
    }
  }
  return pts;
}

// ---- LOS analysis
function losAnalyze(profile, dTotal, hTx, hRx, k=1.33){
  const R = 6371000 * k;
  let minClear = Infinity;
  let blocked = false;
  for(let i=0;i<profile.length;i++){
    const f = i/(profile.length-1);
    const d = dTotal * f;
    const drop = (d*d)/(2*R);
    const ray = hTx + f*(hRx - hTx) - drop;
    const terr = profile[i].elev;
    const clear = ray - terr;
    if(clear < minClear) minClear = clear;
    if(terr >= ray) blocked = true;
  }
  return { blocked, minClear };
}

// ---- HUD (Three.js)
const hud = {
  renderer: null, scene: null, camera: null,
  compass: null, arrow: null, targetTick: null,
  canvas: $('#hud3d'),
  targetAz: 0, targetTilt: 0, azErr: null, tiltErr: null,
};
function hudInit(){
  const w = hud.canvas.clientWidth;
  const h = hud.canvas.clientHeight;
  hud.renderer = new THREE.WebGLRenderer({ canvas: hud.canvas, antialias:true, alpha:true });
  hud.renderer.setSize(w, h, false);
  hud.scene = new THREE.Scene();
  hud.camera = new THREE.PerspectiveCamera(45, w/h, 0.1, 100);
  hud.camera.position.set(0,0,6);

  const aColor = new THREE.Color(0x00e0ff);
  const gColor = new THREE.Color(0x66ff99);

  // Compass ring
  const ring = new THREE.RingGeometry(2.4, 2.5, 128);
  const ringMat = new THREE.MeshBasicMaterial({ color: aColor, transparent:true, opacity:0.25, side:THREE.DoubleSide });
  const ringMesh = new THREE.Mesh(ring, ringMat);
  hud.scene.add(ringMesh);

  // Tick marks
  const tickGeom = new THREE.BufferGeometry();
  const tickVerts = [];
  for(let d=0; d<360; d+=5){
    const rad = toRad(d);
    const r1 = (d%30===0)? 2.1 : 2.3;
    const r2 = 2.5;
    tickVerts.push(
      r1*Math.cos(rad), r1*Math.sin(rad), 0,
      r2*Math.cos(rad), r2*Math.sin(rad), 0
    );
  }
  tickGeom.setAttribute('position', new THREE.Float32BufferAttribute(tickVerts, 3));
  const tickLines = new THREE.LineSegments(tickGeom, new THREE.LineBasicMaterial({ color: aColor, transparent:true, opacity:0.6 }));
  hud.scene.add(tickLines);

  // Target tick
  const tgtGeom = new THREE.BufferGeometry().setFromPoints([ new THREE.Vector3(0,2.6,0), new THREE.Vector3(0,3.0,0) ]);
  hud.targetTick = new THREE.Line(tgtGeom, new THREE.LineBasicMaterial({ color: gColor }));
  hud.scene.add(hud.targetTick);

  // Arrow
  const arrowGeom = new THREE.ConeGeometry(0.16, 0.8, 24);
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  hud.arrow = new THREE.Mesh(arrowGeom, arrowMat);
  hud.arrow.position.set(0,0,0);
  hud.arrow.rotation.x = Math.PI; // point upward initially
  hud.scene.add(hud.arrow);

  // Inner reticle
  const inner = new THREE.RingGeometry(0.18, 0.2, 48);
  const innerMesh = new THREE.Mesh(inner, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent:true, opacity:0.7 }));
  hud.scene.add(innerMesh);

  window.addEventListener('resize', hudResize);
  hudResize();
  hudAnimate();
}
function hudResize(){
  const w = hud.canvas.clientWidth;
  const h = hud.canvas.clientHeight;
  hud.renderer.setSize(w, h, false);
  hud.camera.aspect = w/h;
  hud.camera.updateProjectionMatrix();
}
function hudAnimate(){
  requestAnimationFrame(hudAnimate);
  const az = hud.targetAz || 0;
  hud.targetTick.rotation.z = -toRad(az);
  const azErr = hud.azErr ?? 180;
  const tiltErr = hud.tiltErr ?? 90;
  const targetRotZ = -toRad(azErr);
  const targetRotX = Math.PI - toRad(tiltErr);
  hud.arrow.rotation.z += (targetRotZ - hud.arrow.rotation.z) * 0.15;
  hud.arrow.rotation.x += (targetRotX - hud.arrow.rotation.x) * 0.15;
  const errMag = Math.hypot(azErr, tiltErr);
  const col = (errMag < 2) ? 0x66ff99 : (errMag < 6 ? 0xffd166 : 0xff4d4d);
  hud.arrow.material.color.setHex(col);
  hud.renderer.render(hud.scene, hud.camera);
}

// ---- Profile drawing
function drawProfile(profile, dTotal, hTx, hRx, k, result){
  const canvas = ui.profileCanvas;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);
  const mL=50, mR=10, mT=16, mB=28;
  const w = W - mL - mR;
  const h = H - mT - mB;
  const R = 6371000 * k;
  const xs = [], terr = [], ray = [];
  let minElev = Infinity, maxElev = -Infinity;
  for(let i=0;i<profile.length;i++){
    const f = i/(profile.length-1);
    const d = dTotal*f;
    const drop = (d*d)/(2*R);
    const r = hTx + f*(hRx - hTx) - drop;
    const t = profile[i].elev;
    xs.push(d);
    terr.push(t);
    ray.push(r);
    minElev = Math.min(minElev, t, r);
    maxElev = Math.max(maxElev, t, r);
  }
  if(maxElev - minElev < 1) { maxElev += 1; minElev -= 1; }
  function xScale(d){ return mL + (d/dTotal)*w; }
  function yScale(z){ return mT + h - ((z - minElev)/(maxElev - minElev))*h; }
  ctx.strokeStyle = '#1e2b45'; ctx.lineWidth = 1;
  for(let g=0; g<=5; g++){
    const y = mT + g*(h/5);
    ctx.beginPath(); ctx.moveTo(mL, y); ctx.lineTo(mL+w, y); ctx.stroke();
  }
  ctx.strokeStyle = '#8ec3ff'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(xScale(xs[0]), yScale(terr[0]));
  for(let i=1;i<xs.length;i++) ctx.lineTo(xScale(xs[i]), yScale(terr[i]));
  ctx.stroke();
  ctx.strokeStyle = '#7cffb2'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(xScale(xs[0]), yScale(ray[0]));
  for(let i=1;i<xs.length;i++) ctx.lineTo(xScale(xs[i]), yScale(ray[i]));
  ctx.stroke();
  ctx.fillStyle = '#9cb2cd'; ctx.font = '12px system-ui';
  const ticks = 6;
  for(let t=0;t<=ticks;t++){
    const f = t/ticks;
    const d = dTotal*f;
    const x = mL + f*w, y = mT + h + 16;
    ctx.fillText(fmtDist(d), x-18, y);
  }
  ui.profileStatus.textContent = result.blocked ? 'Blocked' : 'Clear';
  ui.profileStatus.style.color = result.blocked ? '#ffb6b6' : '#b0ffcf';
  ui.clearanceNote.textContent = `Min clearance: ${fmtAlt(result.minClear)}`;
}

// ---- Orientation
function handleOrientation(ev){
  state.haveOrientation = true;
  let heading = null;
  if(typeof ev.webkitCompassHeading === 'number' && !isNaN(ev.webkitCompassHeading)){
    heading = ev.webkitCompassHeading;
  }else if(typeof ev.alpha === 'number'){
    heading = (360 - ev.alpha) % 360;
  }
  if(heading != null){
    const off = parseFloat(ui.headingOffset.value || '0');
    state.headingDeg = (heading + off + 360) % 360;
  }
  if(typeof ev.beta === 'number'){
    const pitch = clamp(ev.beta, -180, 180);
    const poff = parseFloat(ui.pitchOffset.value || '0');
    state.pitchDeg = clamp(pitch + poff, -90, 90);
  }
  ui.oriBadge.className = 'badge ok';
  updateSolution();
}

// ---- Geolocation
let geoWatchId = null;
function startGeo(){
  if(!navigator.geolocation){ showToast('Geolocation not supported'); return; }
  if(geoWatchId != null) return;
  geoWatchId = navigator.geolocation.watchPosition((pos)=>{
    const c = pos.coords;
    const altOverride = ui.txAltOverride.value.trim();
    const alt = altOverride !== '' ? parseFloat(altOverride) : (Number.isFinite(c.altitude) ? c.altitude : null);
    state.pos = {
      lat: c.latitude, lon: c.longitude,
      alt, acc: c.accuracy ?? null, t: pos.timestamp
    };
    state.haveGeo = true;
    ui.geoBadge.className = 'badge ok';
    ui.curLat.textContent = c.latitude.toFixed(6);
    ui.curLon.textContent = c.longitude.toFixed(6);
    ui.curAlt.textContent = alt != null ? Math.round(alt) : '–';
    ui.curAcc.textContent = c.accuracy ? `${Math.round(c.accuracy)} m` : '–';
    updateSolution();
  }, (err)=>{
    ui.geoBadge.className = 'badge warn';
    showToast(`GPS error: ${err.message}`);
  }, { enableHighAccuracy:true, maximumAge: 1000, timeout: 10000 });
}

// ---- Permissions orchestrator
async function requestPermissions(){
  let ok = true;
  startGeo();
  try{
    const needMotion = typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function';
    const needOri = typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
    if(needMotion){
      const res = await DeviceMotionEvent.requestPermission();
      ok = ok && (res === 'granted');
    }
    if(needOri){
      const res = await DeviceOrientationEvent.requestPermission();
      ok = ok && (res === 'granted');
    }
  }catch(e){
    // non-fatal
  }
  window.addEventListener('deviceorientation', handleOrientation, true);
  ui.permBadge.className = ok ? 'badge ok' : 'badge warn';
  if(!ok) showToast('Some permissions were denied. You can still use manual calibration.');
}

// ---- Targets
function refreshTargetsDropdown(){
  const sel = ui.savedTargets;
  sel.innerHTML = '';
  state.targets.forEach(t=>{
    const opt = document.createElement('option');
    opt.value = t.id; opt.textContent = t.name;
    sel.appendChild(opt);
  });
  if(state.activeTargetId && !state.targets.find(t=>t.id===state.activeTargetId)){
    state.activeTargetId = null;
  }
}
function setActiveTargetById(id){
  const t = state.targets.find(x=>x.id===id);
  if(!t) return;
  state.activeTargetId = id;
  ui.tgtName.textContent = t.name;
  ui.tgtLat.textContent = t.lat.toFixed(6);
  ui.tgtLon.textContent = t.lon.toFixed(6);
  ui.tgtAlt.textContent = Math.round(t.alt);
  ui.rxAntenna.value = t.rxAntenna ?? 0;
  updateSolution();
}
function genId(){ return Math.random().toString(36).slice(2,10); }

// ---- Map Modal (Leaflet)
let map, marker;
function mapInit(){
  if(map) return;
  map = L.map(ui.mapDiv, { zoomControl:true, attributionControl:true });
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  const hill = L.tileLayer('https://tile.opentopomap.org/{z}/{x}/{y}.png',{
    maxZoom: 17,
    attribution: 'Map data: &copy; OSM contributors, SRTM | Map style: &copy; OpenTopoMap'
  });
  const start = state.pos ? [state.pos.lat, state.pos.lon] : [39, -98];
  map.setView(start, 12);
  marker = L.marker(start, { draggable:true }).addTo(map);
  map.on('click', (e)=> setMarker(e.latlng));
  marker.on('dragend', ()=> {
    const ll = marker.getLatLng();
    fillTargetForm(ll.lat, ll.lng);
  });
}
function setMarker(latlng){
  marker.setLatLng(latlng);
  fillTargetForm(latlng.lat, latlng.lng);
}
async function fillTargetForm(lat, lon){
  ui.tLat.value = lat.toFixed(7);
  ui.tLon.value = lon.toFixed(7);
  try{
    const elev = await fetchElevation(lat, lon);
    ui.tAlt.value = elev.toFixed(2);
  }catch{
    showToast('Elevation lookup failed; enter altitude manually.');
  }
}
function openMapDialog(){
  mapInit();
  if(state.pos) map.setView([state.pos.lat, state.pos.lon], 13);
  ui.dlg.showModal();
  setTimeout(()=> map.invalidateSize(), 100);
}

// ---- Compute & update solution
function getActiveTarget(){
  return state.targets.find(t=> t.id === state.activeTargetId) || null;
}
function getTxAltMeters(){
  const override = ui.txAltOverride.value.trim();
  const base = (override!=='' ? parseFloat(override) : (state.pos?.alt ?? null));
  if(base == null || isNaN(base)) return null;
  const antenna = parseFloat(ui.txAntenna.value || '0');
  return base + antenna;
}
function getRxAltMeters(){
  const t = getActiveTarget();
  if(!t) return null;
  const ant = parseFloat(ui.rxAntenna.value || '0');
  return (t.alt ?? 0) + ant;
}
function updateSolution(){
  const t = getActiveTarget();
  if(!state.pos || !t) return;
  const d = haversine(state.pos.lat, state.pos.lon, t.lat, t.lon);
  const bearing = initialBearing(state.pos.lat, state.pos.lon, t.lat, t.lon);
  const hTx = getTxAltMeters();
  const hRx = getRxAltMeters();
  const k = parseFloat(ui.kFactor.value || '1.33');
  let tilt = null;
  if(hTx != null && hRx != null) tilt = tiltAngleMeters(d, hTx, hRx, k);
  const heading = state.headingDeg;
  const pitch = state.pitchDeg;
  const azErr = (heading!=null) ? ((((bearing - heading + 540) % 360) - 180)) : null;
  const tiltErr = (tilt!=null) ? (tilt - pitch) : null;
  hud.targetAz = bearing;
  hud.targetTilt = tilt ?? 0;
  hud.azErr = azErr ?? null;
  hud.tiltErr = tiltErr ?? null;
  ui.distLbl.textContent = fmtDist(d);
  ui.bearingLbl.textContent = bearing.toFixed(1);
  ui.tiltLbl.textContent = tilt!=null ? tilt.toFixed(1) : '–';
  ui.azErr.textContent = azErr!=null ? azErr.toFixed(1) : '–';
  ui.tiltErr.textContent = tiltErr!=null ? tiltErr.toFixed(1) : '–';
  if(state.losCache?.targetId === state.activeTargetId && state.losCache?.txKey === txKey()){
    ui.losBadge.className = state.losCache.blocked ? 'badge warn' : 'badge ok';
  }else{
    ui.losBadge.className = 'badge mute';
  }
}
function txKey(){
  return JSON.stringify({
    lat: state.pos?.lat?.toFixed(5),
    lon: state.pos?.lon?.toFixed(5),
    alt: getTxAltMeters()?.toFixed(1),
    k: parseFloat(ui.kFactor.value || '1.33'),
  });
}

// ---- Profile compute handler
async function computeProfile(){
  const t = getActiveTarget();
  if(!t || !state.pos){ showToast('Need current location and a target'); return; }
  const lat1 = state.pos.lat, lon1 = state.pos.lon;
  const lat2 = t.lat, lon2 = t.lon;
  const dTotal = haversine(lat1, lon1, lat2, lon2);
  const hTx = getTxAltMeters(); const hRx = getRxAltMeters(); const k = parseFloat(ui.kFactor.value || '1.33');
  if(hTx==null || hRx==null){ showToast('Missing altitude; set Tx override or wait for GPS, and ensure target has elevation.'); return; }
  showToast('Fetching terrain profile…');
  const prof = await fetchProfile(lat1, lon1, lat2, lon2, 64);
  const result = losAnalyze(prof, dTotal, hTx, hRx, k);
  drawProfile(prof, dTotal, hTx, hRx, k, result);
  state.losCache = { targetId: state.activeTargetId, tx: {lat1,lon1,hTx}, blocked: result.blocked, txKey: txKey() };
  ui.losBadge.className = result.blocked ? 'badge warn' : 'badge ok';
  showToast(result.blocked ? 'LOS blocked by terrain' : 'LOS clear');
}

// ---- Event bindings
function bindUI(){
  ui.btnPermissions.addEventListener('click', requestPermissions);
  ui.btnSetTarget.addEventListener('click', openMapDialog);
  ui.btnProfile.addEventListener('click', computeProfile);

  ui.btnUseTarget.addEventListener('click', ()=>{
    const id = ui.savedTargets.value;
    if(id) setActiveTargetById(id);
  });
  ui.btnEditTarget.addEventListener('click', ()=>{
    const id = ui.savedTargets.value;
    const t = state.targets.find(x=>x.id===id);
    if(!t){ showToast('Select a target to edit'); return; }
    openMapDialog();
    ui.tName.value = t.name;
    ui.tLat.value = t.lat;
    ui.tLon.value = t.lon;
    ui.tAlt.value = t.alt;
    ui.tAntenna.value = t.rxAntenna ?? 0;
    marker.setLatLng([t.lat, t.lon]);
    map.setView([t.lat,t.lon], 14);
    ui.mapSave.onclick = (e)=>{
      e.preventDefault();
      t.name = ui.tName.value.trim();
      t.lat = parseFloat(ui.tLat.value);
      t.lon = parseFloat(ui.tLon.value);
      t.alt = parseFloat(ui.tAlt.value);
      t.rxAntenna = parseFloat(ui.tAntenna.value || '0');
      saveStorage(); refreshTargetsDropdown(); setActiveTargetById(t.id);
      ui.dlg.close();
      ui.mapSave.onclick = null;
    };
  });
  ui.btnDeleteTarget.addEventListener('click', ()=>{
    const id = ui.savedTargets.value;
    if(!id) return;
    const idx = state.targets.findIndex(t=>t.id===id);
    if(idx>=0){
      state.targets.splice(idx,1);
      saveStorage(); refreshTargetsDropdown();
      if(state.activeTargetId===id){ state.activeTargetId = null; ui.tgtName.textContent = '–'; }
    }
  });

  ui.btnExport.addEventListener('click', ()=>{
    const blob = new Blob([JSON.stringify({ targets: state.targets }, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'field-align-targets.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  ui.btnImport.addEventListener('click', ()=> ui.importFile.click());
  ui.importFile.addEventListener('change', async ()=>{
    const f = ui.importFile.files[0];
    if(!f) return;
    try{
      const text = await f.text();
      const j = JSON.parse(text);
      const arr = Array.isArray(j) ? j : (j.targets || []);
      const normalized = arr.map(t=> ({ id: t.id || genId(), name: t.name || 'Imported', lat:+t.lat, lon:+t.lon, alt:+t.alt, rxAntenna:+(t.rxAntenna||0) }))
                             .filter(t=> Number.isFinite(t.lat) && Number.isFinite(t.lon) && Number.isFinite(t.alt));
      state.targets = normalized;
      saveStorage(); refreshTargetsDropdown();
      showToast('Import complete');
    }catch(e){
      showToast('Import failed');
    }
  });

  ui.units.addEventListener('change', ()=>{
    state.settings.units = ui.units.value; saveStorage(); updateSolution();
  });
  ui.headingOffset.addEventListener('change', ()=>{
    state.settings.headingOffset = parseFloat(ui.headingOffset.value||'0'); saveStorage();
  });
  ui.pitchOffset.addEventListener('change', ()=>{
    state.settings.pitchOffset = parseFloat(ui.pitchOffset.value||'0'); saveStorage();
  });
  ui.kFactor.addEventListener('change', ()=>{
    state.settings.kFactor = parseFloat(ui.kFactor.value||'1.33'); saveStorage(); updateSolution();
  });
  ui.txAltOverride.addEventListener('change', ()=>{
    state.settings.txAltOverride = ui.txAltOverride.value.trim()===''? null : parseFloat(ui.txAltOverride.value);
    saveStorage(); updateSolution();
  });
  ui.txAntenna.addEventListener('change', ()=>{
    state.settings.txAntenna = parseFloat(ui.txAntenna.value||'0'); saveStorage(); updateSolution();
  });
  ui.rxAntenna.addEventListener('change', ()=>{
    state.settings.rxAntenna = parseFloat(ui.rxAntenna.value||'0'); saveStorage(); updateSolution();
  });

  ui.mapClose.addEventListener('click', ()=> ui.dlg.close());
  ui.mapRecenter.addEventListener('click', ()=>{
    const center = state.pos ? [state.pos.lat, state.pos.lon] : marker.getLatLng();
    map.setView(center, 13);
  });
  ui.mapSave.addEventListener('click', (e)=>{
    e.preventDefault();
    const name = ui.tName.value.trim() || 'Target';
    const lat = parseFloat(ui.tLat.value);
    const lon = parseFloat(ui.tLon.value);
    const alt = parseFloat(ui.tAlt.value);
    const rxAntenna = parseFloat(ui.tAntenna.value||'0');
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||!Number.isFinite(alt)){
      showToast('Please provide valid lat/lon/alt.'); return;
    }
    const t = { id: genId(), name, lat, lon, alt, rxAntenna };
    state.targets.push(t);
    saveStorage(); refreshTargetsDropdown();
    ui.dlg.close();
    setActiveTargetById(t.id);
    showToast('Target saved');
  });
}

// ---- Init
function init(){
  loadStorage();
  bindUI();
  hudInit();
  if(state.targets[0]) setActiveTargetById(state.targets[0].id);
}
document.addEventListener('DOMContentLoaded', init);
