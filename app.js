const $ = (s)=>document.querySelector(s);

const ui = {
  permBadge: $('#permBadge'), geoBadge: $('#geoBadge'), oriBadge: $('#oriBadge'), losBadge: $('#losBadge'),
  btnPermissions: $('#btnPermissions'), btnSetTarget: $('#btnSetTarget'), btnProfile: $('#btnProfile'),
  savedTargets: $('#savedTargets'), btnUseTarget: $('#btnUseTarget'), btnEditTarget: $('#btnEditTarget'), btnDeleteTarget: $('#btnDeleteTarget'),
  btnExport: $('#btnExport'), btnImport: $('#btnImport'), importFile: $('#importFile'),
  curLat: $('#curLat'), curLon: $('#curLon'), curAlt: $('#curAlt'), curAcc: $('#curAcc'),
  txAltOverride: $('#txAltOverride'), txAntenna: $('#txAntenna'), rxAntenna: $('#rxAntenna'),
  headingOffset: $('#headingOffset'), pitchOffset: $('#pitchOffset'), kFactor: $('#kFactor'), units: $('#units'),
  tgtName: $('#tgtName'), tgtLat: $('#tgtLat'), tgtLon: $('#tgtLon'), tgtAlt: $('#tgtAlt'),
  azErr: $('#azErr'), tiltErr: $('#tiltErr'), distLbl: $('#distLbl'), bearingLbl: $('#bearingLbl'), tiltLbl: $('#tiltLbl'),
  toast: $('#toast'), profileCanvas: $('#profileCanvas'), profileStatus: $('#profileStatus'), clearanceNote: $('#clearanceNote'),
  dlg: $('#mapDialog'), mapDiv: $('#map'), mapClose: $('#mapClose'), mapRecenter: $('#mapRecenter'), mapSave: $('#mapSave'),
  tName: $('#tName'), tLat: $('#tLat'), tLon: $('#tLon'), tAlt: $('#tAlt'), tAntenna: $('#tAntenna'),
  debug: $('#debugLog'),
  permWizard: $('#permWizard'), permTryAgain: $('#permTryAgain'), permCancel: $('#permCancel'),
};

const state = {
  pos: null, headingDeg: null, pitchDeg: null,
  haveOrientation: false, haveGeo: false,
  targets: [], activeTargetId: null,
  settings: { headingOffset: 0, pitchOffset: 0, kFactor: 1.33, units: 'metric', txAltOverride: null, txAntenna: 1.5, rxAntenna: 0 },
  _rafPending: false,
};

const LS = { TARGETS: 'fa_targets_v1', SETTINGS: 'fa_settings_v1' };

function logd(msg){ ui.debug.textContent = `${new Date().toLocaleTimeString()}  ${msg}\n` + ui.debug.textContent.slice(0, 4000); }
function showToast(msg, ms=2500){ ui.toast.textContent = msg; ui.toast.hidden = false; clearTimeout(showToast._t); showToast._t = setTimeout(()=> ui.toast.hidden = true, ms); }
window.onerror = (m)=> showToast(`Error: ${m}`);
window.onunhandledrejection = (e)=> showToast(`Promise: ${e.reason || e}`);

function loadStorage(){
  try{ state.targets = JSON.parse(localStorage.getItem(LS.TARGETS) || '[]'); }catch{}
  try{ Object.assign(state.settings, JSON.parse(localStorage.getItem(LS.SETTINGS) || '{}')); }catch{}
  ui.headingOffset.value = state.settings.headingOffset;
  ui.pitchOffset.value = state.settings.pitchOffset;
  ui.kFactor.value = state.settings.kFactor;
  ui.units.value = state.settings.units;
  ui.txAltOverride.value = state.settings.txAltOverride ?? '';
  ui.txAntenna.value = state.settings.txAntenna;
  ui.rxAntenna.value = state.settings.rxAntenna;
  refreshTargetsDropdown();
}
function saveStorage(){ localStorage.setItem(LS.TARGETS, JSON.stringify(state.targets)); localStorage.setItem(LS.SETTINGS, JSON.stringify(state.settings)); }
function refreshTargetsDropdown(){
  const sel = ui.savedTargets; sel.innerHTML = '';
  state.targets.forEach(t=>{ const o = document.createElement('option'); o.value = t.id; o.textContent = t.name; sel.appendChild(o); });
  if(state.activeTargetId && !state.targets.find(t=>t.id===state.activeTargetId)) state.activeTargetId = null;
}
function setActiveTargetById(id){
  const t = state.targets.find(x=>x.id===id); if(!t) return; state.activeTargetId = id;
  ui.tgtName.textContent = t.name; ui.tgtLat.textContent = t.lat.toFixed(6); ui.tgtLon.textContent = t.lon.toFixed(6); ui.tgtAlt.textContent = Math.round(t.alt);
  ui.rxAntenna.value = t.rxAntenna ?? 0; requestUpdate();
}
function getActiveTarget(){ return state.targets.find(t=> t.id === state.activeTargetId) || null; }
function getTxAltMeters(){
  const override = ui.txAltOverride.value.trim();
  const base = (override!=='' ? parseFloat(override) : (state.pos?.alt ?? null));
  if(base == null || isNaN(base)) return null;
  return base + parseFloat(ui.txAntenna.value || '0');
}
function getRxAltMeters(){ const t = getActiveTarget(); if(!t) return null; return (t.alt ?? 0) + parseFloat(ui.rxAntenna.value || '0'); }

function openWizard(){ ui.permWizard?.showModal?.(); }
function closeWizard(){ ui.permWizard?.close?.(); }

async function requestPermissions(){
  if(!window.isSecureContext){ showToast('Use HTTPS (GitHub Pages).'); logd('Insecure context'); }
  let motionGranted = true, oriGranted = true;

  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(
      (pos)=>{ handlePosition(pos); ui.geoBadge.className = 'badge ok'; logd('Geolocation GRANTED (one-shot)'); startGeoWatch(); },
      (err)=>{ ui.geoBadge.className = 'badge warn'; showToast(`GPS denied: ${err.message}`); logd('Geolocation DENIED'); openWizard(); },
      { enableHighAccuracy:true, timeout:12000, maximumAge:0 }
    );
  }else{ showToast('Geolocation unsupported'); logd('No geolocation API'); openWizard(); }

  try{
    if(typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function'){
      motionGranted = (await DeviceMotionEvent.requestPermission()) === 'granted';
      logd(`DeviceMotion permission: ${motionGranted}`);
    }
    if(typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'){
      oriGranted = (await DeviceOrientationEvent.requestPermission()) === 'granted';
      logd(`DeviceOrientation permission: ${oriGranted}`);
    }
  }catch(e){ logd('iOS permission call threw'); }

  attachOrientationListeners();

  const ok = motionGranted && oriGranted;
  ui.permBadge.className = ok ? 'badge ok' : 'badge warn';
  if(!ok){ openWizard(); showToast('Motion/orientation not allowed'); }
}

function startGeoWatch(){
  if(state._geoId) return;
  state._geoId = navigator.geolocation.watchPosition(
    handlePosition,
    (err)=>{ ui.geoBadge.className='badge warn'; showToast(`GPS error: ${err.message}`); logd(`watchPosition error: ${err.message}`); },
    { enableHighAccuracy:true, maximumAge:1000, timeout:12000 }
  );
}
function handlePosition(pos){
  const c = pos.coords;
  const altOverride = ui.txAltOverride.value.trim();
  const alt = altOverride !== '' ? parseFloat(altOverride) : (Number.isFinite(c.altitude) ? c.altitude : null);
  state.pos = { lat: c.latitude, lon: c.longitude, alt, acc: c.accuracy ?? null, t: pos.timestamp };
  state.haveGeo = true;
  ui.geoBadge.className='badge ok';
  ui.curLat.textContent = c.latitude.toFixed(6);
  ui.curLon.textContent = c.longitude.toFixed(6);
  ui.curAlt.textContent = alt!=null ? Math.round(alt) : '–';
  ui.curAcc.textContent = c.accuracy ? `${Math.round(c.accuracy)} m` : '–';
  logd(`GPS fix lat=${c.latitude.toFixed(6)} lon=${c.longitude.toFixed(6)} alt=${alt ?? 'n/a'}`);
  requestUpdate();
}

function attachOrientationListeners(){
  const handler = (ev)=>{
    state.haveOrientation = true;
    let heading = null;
    if(typeof ev.webkitCompassHeading === 'number' && !isNaN(ev.webkitCompassHeading)){ heading = ev.webkitCompassHeading; }
    else if(typeof ev.alpha === 'number'){ heading = (360 - ev.alpha) % 360; }
    const hoff = parseFloat(ui.headingOffset.value || '0');
    state.headingDeg = (heading == null) ? null : ((heading + hoff + 360) % 360);
    const poff = parseFloat(ui.pitchOffset.value || '0');
    if(typeof ev.beta === 'number'){ state.pitchDeg = Math.max(-90, Math.min(90, ev.beta + poff)); }
    ui.oriBadge.className = 'badge ok';
    requestUpdate();
  };
  window.addEventListener('deviceorientation', handler, { capture:true, passive:true });
  window.addEventListener('deviceorientationabsolute', handler, { capture:true, passive:true });
  window.addEventListener('devicemotion', ()=>{}, { passive:true });
  logd('Orientation listeners attached');
}

async function fetchElevation(lat, lon){
  try{
    const r = await fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`); if(r.ok){ const j=await r.json(); if(j?.results?.[0]) return j.results[0].elevation; }
  }catch(_){}
  try{
    const r = await fetch(`https://nationalmap.gov/epqs/pqs.php?x=${lon}&y=${lat}&units=Meters&output=json`); if(r.ok){ const j=await r.json(); const v=j?.USGS_Elevation_Point_Query_Service?.Elevation_Query?.Elevation; if(typeof v==='number') return v; }
  }catch(_){ }
  throw new Error('Elevation lookup failed');
}
async function fetchProfile(lat1, lon1, lat2, lon2, samples=64){
  try{
    const r = await fetch(`https://api.open-elevation.com/api/v1/profile?path=${lat1},${lon1}|${lat2},${lon2}&samples=${samples}`);
    if(r.ok){ const j=await r.json(); const arr=j?.results||[]; return arr.map(p=>({ lat:p.location.lat, lon:p.location.lng ?? p.location.lon ?? p.location.lng, elev:p.elevation }));}
  }catch(_){ }
  const pts=[]; for(let i=0;i<samples;i++){ const f=i/(samples-1); const lat=lat1+(lat2-lat1)*f; const lon=lon1+(lon2-lon1)*f; try{ pts.push({lat,lon,elev:await fetchElevation(lat,lon)});}catch{ pts.push({lat,lon,elev:NaN}); } }
  return pts;
}

let py=null, pyReady=false;
async function initPy(){
  try{
    if(typeof loadPyodide!=='function'){ logd('Pyodide not available'); return; }
    py = await loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/" });
    const code = await (await fetch('fa.py')).text(); await py.runPythonAsync(code);
    pyReady = true; showToast('Python ready'); logd('Pyodide loaded & fa.py executed');
  }catch(e){ logd('Pyodide init failed: '+(e?.message||e)); showToast('Python unavailable; using JS only'); }
}

const hud = { renderer:null, scene:null, camera:null, targetTick:null, arrow:null, canvas: $('#hud3d'), azErr:null, tiltErr:null, targetAz:0 };
function hudInit(){
  if(typeof THREE==='undefined'){ showToast('Three.js not loaded'); return; }
  const w=hud.canvas.clientWidth||600, h=hud.canvas.clientHeight||300;
  hud.renderer = new THREE.WebGLRenderer({ canvas:hud.canvas, antialias:true, alpha:true }); hud.renderer.setSize(w,h,false);
  hud.scene = new THREE.Scene(); hud.camera = new THREE.PerspectiveCamera(45, w/h, .1, 100); hud.camera.position.set(0,0,6);
  const a = new THREE.Color(0x00e0ff), g = new THREE.Color(0x66ff99);
  const ring = new THREE.RingGeometry(2.4,2.5,128);
  const ringMat = new THREE.MeshBasicMaterial({ color:a, transparent:true, opacity:.25, side:THREE.DoubleSide });
  hud.scene.add(new THREE.Mesh(ring, ringMat));
  const tickGeom=new THREE.BufferGeometry(), verts=[];
  for(let d=0; d<360; d+=5){ const r=d*Math.PI/180; const r1=(d%30===0)?2.1:2.3, r2=2.5; verts.push(r1*Math.cos(r),r1*Math.sin(r),0,r2*Math.cos(r),r2*Math.sin(r),0); }
  tickGeom.setAttribute('position', new THREE.Float32BufferAttribute(verts,3));
  hud.scene.add(new THREE.LineSegments(tickGeom, new THREE.LineBasicMaterial({ color:a, transparent:true, opacity:.6 })));
  const tgtGeom = new THREE.BufferGeometry().setFromPoints([ new THREE.Vector3(0,2.6,0), new THREE.Vector3(0,3.0,0) ]);
  hud.targetTick = new THREE.Line(tgtGeom, new THREE.LineBasicMaterial({ color:g })); hud.scene.add(hud.targetTick);
  const arrowGeom=new THREE.ConeGeometry(.16,.8,24); const arrowMat=new THREE.MeshBasicMaterial({ color:0xffffff });
  hud.arrow = new THREE.Mesh(arrowGeom, arrowMat); hud.arrow.rotation.x=Math.PI; hud.scene.add(hud.arrow);
  const inner=new THREE.RingGeometry(.18,.2,48); hud.scene.add(new THREE.Mesh(inner,new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:.7 })));
  window.addEventListener('resize', ()=>{ const w=hud.canvas.clientWidth||600, h=hud.canvas.clientHeight||300; hud.renderer.setSize(w,h,false); hud.camera.aspect=w/h; hud.camera.updateProjectionMatrix();});
  (function anim(){ requestAnimationFrame(anim);
    hud.targetTick.rotation.z = -(hud.targetAz||0)*Math.PI/180;
    const azErr = hud.azErr ?? 180, tiltErr = hud.tiltErr ?? 90;
    const rz = -azErr*Math.PI/180, rx = Math.PI - tiltErr*Math.PI/180;
    hud.arrow.rotation.z += (rz - hud.arrow.rotation.z) * .15;
    hud.arrow.rotation.x += (rx - hud.arrow.rotation.x) * .15;
    const errMag = Math.hypot(azErr, tiltErr); const col = (errMag<2)?0x66ff99:(errMag<6?0xffd166:0xff4d4d);
    hud.arrow.material.color.setHex(col); hud.renderer.render(hud.scene,hud.camera);
  })();
}

function requestUpdate(){ if(state._rafPending) return; state._rafPending = true; requestAnimationFrame(()=>{ state._rafPending = false; updateSolution(); }); }
function updateSolution(){
  const t = getActiveTarget(); if(!state.pos || !t){ return; }
  const k = parseFloat(ui.kFactor.value || '1.33'); const units = ui.units.value;
  const hTx = getTxAltMeters(); const hRx = getRxAltMeters();
  if(!pyReady){ return; }
  try{
    py.globals.set('lat_tx', state.pos.lat); py.globals.set('lon_tx', state.pos.lon); py.globals.set('h_tx', hTx);
    py.globals.set('heading', state.headingDeg); py.globals.set('pitch', state.pitchDeg);
    py.globals.set('lat_rx', t.lat); py.globals.set('lon_rx', t.lon); py.globals.set('h_rx', hRx);
    py.globals.set('k_factor', k); py.globals.set('units', units);
    const out = py.runPython(`res = update_solution_py(lat_tx, lon_tx, h_tx, heading, pitch, lat_rx, lon_rx, h_rx, k_factor, units)\nres`);
    const r = JSON.parse(out); if(!r.ready) return;
    hud.targetAz = r.bearing; hud.azErr = r.azErr; hud.tiltErr = r.tiltErr;
    ui.distLbl.textContent = r.distStr; ui.bearingLbl.textContent = r.bearingStr; ui.tiltLbl.textContent = r.tiltStr;
    ui.azErr.textContent = r.azErrStr; ui.tiltErr.textContent = r.tiltErrStr;
  }catch(e){ logd('updateSolution Python error: '+(e?.message||e)); }
}

async function computeProfile(){
  const t=getActiveTarget(); if(!t || !state.pos){ showToast('Need current location and a target'); return; }
  const hTx = getTxAltMeters(), hRx = getRxAltMeters(); const k = parseFloat(ui.kFactor.value||'1.33');
  if(hTx==null || hRx==null){ showToast('Missing altitude (Tx/Rx)'); return; }
  showToast('Fetching terrain…'); const prof = await fetchProfile(state.pos.lat, state.pos.lon, t.lat, t.lon, 64);

  let dTotal;
  if(pyReady){ py.globals.set('a1', state.pos.lat); py.globals.set('o1', state.pos.lon); py.globals.set('a2', t.lat); py.globals.set('o2', t.lon); dTotal = Number(py.runPython(`haversine(a1,o1,a2,o2)`)); }
  else { const R=6371000,toRad=(d)=>d*Math.PI/180,φ1=toRad(state.pos.lat),φ2=toRad(t.lat),dφ=toRad(t.lat-state.pos.lat),dλ=toRad(t.lon-state.pos.lon); const a=Math.sin(dφ/2)**2+Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2; dTotal=R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)); }

  let result={blocked:false,minClear:Infinity};
  if(pyReady){
    try{
      py.globals.set('elevs_js', prof.map(p=>p.elev)); py.globals.set('d_total_js', dTotal);
      py.globals.set('h_tx_js', hTx); py.globals.set('h_rx_js', hRx); py.globals.set('k_js', k);
      const out = py.runPython(`from js import elevs_js,d_total_js,h_tx_js,h_rx_js,k_js\nlos_analyze_py(list(elevs_js), float(d_total_js), float(h_tx_js), float(h_rx_js), float(k_js))`);
      result = JSON.parse(out);
    }catch(e){ logd('Python LOS failed, fallback'); result = losAnalyzeJS(prof, dTotal, hTx, hRx, k); }
  }else{ result = losAnalyzeJS(prof, dTotal, hTx, hRx, k); }

  drawProfile(prof, dTotal, hTx, hRx, k, result);
  ui.losBadge.className = result.blocked ? 'badge warn' : 'badge ok';
  ui.profileStatus.textContent = result.blocked ? 'Blocked' : 'Clear';
  ui.clearanceNote.textContent = pyReady ? py.runPython(`fmt_altitude(${result.minClear}, "${ui.units.value}")`) : `${Math.round(result.minClear)} m`;
  showToast(result.blocked ? 'LOS blocked' : 'LOS clear');
}
function losAnalyzeJS(profile, dTotal, hTx, hRx, k){
  const R = 6371000*k; let minClear=Infinity, blocked=false;
  for(let i=0;i<profile.length;i++){ const f=i/(profile.length-1), d=dTotal*f; const drop=(d*d)/(2*R);
    const ray=hTx+f*(hRx-hTx)-drop, terr=profile[i].elev, clear=ray-terr; if(clear<minClear) minClear=clear; if(terr>=ray) blocked=true; }
  return {blocked, minClear};
}
function drawProfile(profile, dTotal, hTx, hRx, k, result){
  const ctx = ui.profileCanvas.getContext('2d'), W=ui.profileCanvas.width, H=ui.profileCanvas.height;
  ctx.clearRect(0,0,W,H); const mL=50,mR=10,mT=16,mB=28, w=W-mL-mR, h=H-mT-mB, R=6371000*k;
  const xs=[], terr=[], ray=[]; let minElev=Infinity, maxElev=-Infinity;
  for(let i=0;i<profile.length;i++){ const f=i/(profile.length-1), d=dTotal*f, drop=(d*d)/(2*R), r=hTx+f*(hRx-hTx)-drop, t=profile[i].elev; xs.push(d); terr.push(t); ray.push(r); minElev=Math.min(minElev,t,r); maxElev=Math.max(maxElev,t,r); }
  if(maxElev-minElev<1){ maxElev+=1; minElev-=1; }
  const xS=(d)=>mL+(d/dTotal)*w, yS=(z)=>mT+h-((z-minElev)/(maxElev-minElev))*h;
  ctx.strokeStyle='#1e2b45'; ctx.lineWidth=1; for(let g=0;g<=5;g++){ const y=mT+g*(h/5); ctx.beginPath(); ctx.moveTo(mL,y); ctx.lineTo(mL+w,y); ctx.stroke(); }
  ctx.strokeStyle='#8ec3ff'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(xS(xs[0]), yS(terr[0])); for(let i=1;i<xs.length;i++) ctx.lineTo(xS(xs[i]), yS(terr[i])); ctx.stroke();
  ctx.strokeStyle='#7cffb2'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(xS(xs[0]), yS(ray[0])); for(let i=1;i<xs.length;i++) ctx.lineTo(xS(xs[i]), yS(ray[i])); ctx.stroke();
  ctx.fillStyle = '#9cb2cd'; ctx.font='12px system-ui'; const ticks=6; for(let t=0;t<=ticks;t++){ const f=t/ticks, d=dTotal*f, x=mL+f*w, y=mT+h+16; ctx.fillText(d>=1000?`${(d/1000).toFixed(2)} km`:`${Math.round(d)} m`, x-18,y); }
}

let map, marker;
function mapInit(){
  if(map) return; if(typeof L === 'undefined'){ showToast('Map lib not loaded'); return; }
  map = L.map(ui.mapDiv, { zoomControl:true, attributionControl:true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ maxZoom:19, attribution:'&copy; OpenStreetMap contributors' }).addTo(map);
  const start = state.pos ? [state.pos.lat, state.pos.lon] : [39,-98]; map.setView(start, 12);
  marker = L.marker(start, { draggable:true }).addTo(map);
  map.on('click', (e)=> setMarker(e.latlng));
  marker.on('dragend', ()=>{ const ll=marker.getLatLng(); fillTargetForm(ll.lat, ll.lng); });
}
function setMarker(latlng){ marker.setLatLng(latlng); fillTargetForm(latlng.lat, latlng.lng); }
async function fillTargetForm(lat, lon){ ui.tLat.value = lat.toFixed(7); ui.tLon.value = lon.toFixed(7); try{ ui.tAlt.value = (await fetchElevation(lat, lon)).toFixed(2); }catch{ showToast('Elevation failed; enter alt manually.'); } }
function openMapDialog(){ mapInit(); if(state.pos) map.setView([state.pos.lat,state.pos.lon], 13); if(ui.dlg?.showModal) ui.dlg.showModal(); setTimeout(()=> map && map.invalidateSize(), 120); }

function bindUI(){
  ui.btnPermissions.addEventListener('click', requestPermissions);
  ui.btnSetTarget.addEventListener('click', openMapDialog);
  ui.btnProfile.addEventListener('click', computeProfile);
  ui.btnUseTarget.addEventListener('click', ()=>{ const id = ui.savedTargets.value; if(id) setActiveTargetById(id); });
  ui.btnEditTarget.addEventListener('click', ()=>{
    const id = ui.savedTargets.value; const t = state.targets.find(x=>x.id===id); if(!t){ showToast('Select a target'); return; }
    openMapDialog(); ui.tName.value=t.name; ui.tLat.value=t.lat; ui.tLon.value=t.lon; ui.tAlt.value=t.alt; ui.tAntenna.value=t.rxAntenna ?? 0;
    marker.setLatLng([t.lat,t.lon]); map.setView([t.lat,t.lon], 14);
    ui.mapSave.onclick = (e)=>{ e.preventDefault(); t.name=ui.tName.value.trim(); t.lat=parseFloat(ui.tLat.value); t.lon=parseFloat(ui.tLon.value); t.alt=parseFloat(ui.tAlt.value); t.rxAntenna=parseFloat(ui.tAntenna.value||'0'); saveStorage(); refreshTargetsDropdown(); setActiveTargetById(t.id); ui.dlg.close(); ui.mapSave.onclick=null; };
  });
  ui.btnDeleteTarget.addEventListener('click', ()=>{ const id=ui.savedTargets.value; if(!id) return; const i=state.targets.findIndex(t=>t.id===id); if(i>=0){ state.targets.splice(i,1); saveStorage(); refreshTargetsDropdown(); if(state.activeTargetId===id){ state.activeTargetId=null; ui.tgtName.textContent='–'; } } });
  ui.btnExport.addEventListener('click', ()=>{ const blob=new Blob([JSON.stringify({targets:state.targets},null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='field-align-targets.json'; a.click(); URL.revokeObjectURL(a.href); });
  ui.btnImport.addEventListener('click', ()=> ui.importFile.click());
  ui.importFile.addEventListener('change', async ()=>{ const f=ui.importFile.files[0]; if(!f) return; try{ const j=JSON.parse(await f.text()); const arr=Array.isArray(j)?j:(j.targets||[]); const norm=arr.map(t=>({id:t.id||Math.random().toString(36).slice(2,10),name:t.name||'Imported',lat:+t.lat,lon:+t.lon,alt:+t.alt,rxAntenna:+(t.rxAntenna||0)})).filter(t=>Number.isFinite(t.lat)&&Number.isFinite(t.lon)&&Number.isFinite(t.alt)); state.targets=norm; saveStorage(); refreshTargetsDropdown(); showToast('Import complete'); }catch{ showToast('Import failed'); } });
  ui.units.addEventListener('change', ()=>{ state.settings.units=ui.units.value; saveStorage(); requestUpdate(); });
  ui.headingOffset.addEventListener('change', ()=>{ state.settings.headingOffset=parseFloat(ui.headingOffset.value||'0'); saveStorage(); });
  ui.pitchOffset.addEventListener('change', ()=>{ state.settings.pitchOffset=parseFloat(ui.pitchOffset.value||'0'); saveStorage(); });
  ui.kFactor.addEventListener('change', ()=>{ state.settings.kFactor=parseFloat(ui.kFactor.value||'1.33'); saveStorage(); requestUpdate(); });
  ui.txAltOverride.addEventListener('change', ()=>{ state.settings.txAltOverride=ui.txAltOverride.value.trim()===''? null : parseFloat(ui.txAltOverride.value); saveStorage(); requestUpdate(); });
  ui.txAntenna.addEventListener('change', ()=>{ state.settings.txAntenna=parseFloat(ui.txAntenna.value||'0'); saveStorage(); requestUpdate(); });
  ui.rxAntenna.addEventListener('change', ()=>{ state.settings.rxAntenna=parseFloat(ui.rxAntenna.value||'0'); saveStorage(); requestUpdate(); });

  ui.mapClose.addEventListener('click', ()=> ui.dlg.close());
  ui.mapRecenter.addEventListener('click', ()=>{ const c = state.pos? [state.pos.lat,state.pos.lon] : marker.getLatLng(); map.setView(c, 13); });
  ui.mapSave.addEventListener('click', (e)=>{ e.preventDefault(); const name=ui.tName.value.trim()||'Target', lat=parseFloat(ui.tLat.value), lon=parseFloat(ui.tLon.value), alt=parseFloat(ui.tAlt.value), rxAntenna=parseFloat(ui.tAntenna.value||'0'); if(!Number.isFinite(lat)||!Number.isFinite(lon)||!Number.isFinite(alt)){ showToast('Provide valid lat/lon/alt.'); return; } const t={id:Math.random().toString(36).slice(2,10), name, lat, lon, alt, rxAntenna}; state.targets.push(t); saveStorage(); refreshTargetsDropdown(); ui.dlg.close(); setActiveTargetById(t.id); showToast('Target saved'); });

  ui.permTryAgain.addEventListener('click', (e)=>{ e.preventDefault(); closeWizard(); requestPermissions(); });
  ui.permCancel.addEventListener('click', (e)=>{ e.preventDefault(); closeWizard(); });
}

function init(){ loadStorage(); bindUI(); hudInit(); initPy(); if(state.targets[0]) setActiveTargetById(state.targets[0].id); }
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
