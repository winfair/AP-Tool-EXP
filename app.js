// file: /app.js
'use strict';

document.addEventListener('DOMContentLoaded', () => {

/* ===========================
 * Utils / Math (why: precision & reuse)
 * =========================== */
const $=id=>document.getElementById(id);
const R=d=>d*Math.PI/180, Dg=r=>r*180/Math.PI;
const N=d=>((d%360)+360)%360;
const Δ=(a,b)=>{let d=N(b)-N(a);return d>180?d-360:d<-180?d+360:d};
const blend=(p,n,a)=>p==null?n:N(p+a*Δ(p,n));
const fix=v=>Number(v).toFixed(6);
const fmtDist=m=>m<1000?`${Math.round(m)} m`:`${(m/1000).toFixed(2)} km`;
const haversine=(a,b)=>{const Rm=6371000,φ1=R(a.lat),φ2=R(b.lat),dφ=R(b.lat-a.lat),dλ=R(b.lng-a.lng),s=Math.sin(dφ/2)**2+Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;return 2*Rm*Math.asin(Math.min(1,Math.sqrt(s)))}
const bearing=(a,b)=>{const φ1=R(a.lat),φ2=R(b.lat),λ1=R(a.lng),λ2=R(b.lng),y=Math.sin(λ2-λ1)*Math.cos(φ2),x=Math.cos(φ1)*Math.sin(φ2)-Math.sin(φ1)*Math.cos(φ2)*Math.cos(λ2-λ1);return N(Dg(Math.atan2(y,x)))}
const dest=(ll,b,dm)=>{const br=R(b),dr=dm/6371000,lat1=R(ll.lat),lon1=R(ll.lng),lat2=Math.asin(Math.sin(lat1)*Math.cos(dr)+Math.cos(lat1)*Math.sin(dr)*Math.cos(br)),lon2=lon1+Math.atan2(Math.sin(br)*Math.sin(dr)*Math.cos(lat1),Math.cos(dr)-Math.sin(lat1)*Math.sin(lat2));return L.latLng(Dg(lat2),Dg(lon2))}
const DotIcon=s=>L.divIcon({className:'dot-pin',iconSize:[s,s],iconAnchor:[s/2,s/2]});
const makeDot=(lat,lng,size=12)=>L.marker([lat,lng],{icon:DotIcon(size),riseOnHover:true});
const parseCoords=t=>{
  const s=t.trim().replace(/\s+/g,' ').replace(/[,;]+/g,',');
  const m=s.match(/^\s*([+-]?\d+(\.\d+)?)\s*,\s*([+-]?\d+(\.\d+)?)\s*$/i);
  if(m){const lat=+m[1],lng=+m[3];if(isFinite(lat)&&isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180)return{lat,lng}}
  const parts=s.split(',');if(parts.length===2){
    const one=q=>{const x=q.trim().match(/^([NSEW])?\s*([+-]?\d+(\.\d+)?)\s*([NSEW])?$/i);if(!x)return null;
      const h=(x[1]||x[4]||'').toUpperCase();let v=parseFloat(x[2]);
      if(h==='S'||h==='W')v=-Math.abs(v); if(h==='N'||h==='E')v=Math.abs(v); return{v,h}};
    const a=one(parts[0]),b=one(parts[1]); if(a&&b){
      const lat=(a.h==='N'||a.h==='S')?a.v:b.v, lng=(a.h==='E'||a.h==='W')?a.v:b.v;
      if(Math.abs(lat)<=90&&Math.abs(lng)<=180)return{lat,lng}
    }
  }
  return null;
};

/* ===========================
 * Haptics (why: tactile feedback cross-platform)
 * =========================== */
const AudioHaptics=(()=>{let ctx=null;const ensure=()=>{if(!ctx){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;ctx=new AC()} if(ctx.state==='suspended')ctx.resume();return ctx};const prime=()=>{ensure()};addEventListener('pointerdown',prime,{passive:true});addEventListener('keydown',prime);const click=()=>{const c=ensure();if(!c||c.state!=='running')return;const t=c.currentTime,osc=c.createOscillator(),g=c.createGain();osc.type='square';osc.frequency.setValueAtTime(120,t);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.25,t+0.001);g.gain.exponentialRampToValueAtTime(0.0009,t+0.03);osc.connect(g).connect(c.destination);osc.start(t);osc.stop(t+0.035)};return{click}})();
const Haptics=(()=>{let last=0;return{hit(){const n=performance.now();if(n-last<260)return;last=n;try{if('vibrate'in navigator){navigator.vibrate(10);return}}catch{}AudioHaptics.click();}}})();

/* ===========================
 * App State & Storage
 * =========================== */
const Store={
  stateKey:'mapapp.state.v2',
  wpKey:'mapapp.waypoints.v2',
  loadState(){try{return JSON.parse(localStorage.getItem(this.stateKey)||'{}')}catch{return{}}},
  saveState(s){try{localStorage.setItem(this.stateKey,JSON.stringify(s))}catch{}},
  loadWPs(){try{return JSON.parse(localStorage.getItem(this.wpKey)||'[]')}catch{return[]}},
  saveWPs(a){try{localStorage.setItem(this.wpKey,JSON.stringify(a))}catch{}}
};

/* ===========================
 * App Controller
 * =========================== */
const App={
  S:{follow:true,heading:null,bearing:0,rotate:true,press:false,fAngle:null,fPivot:null,
     dest:null,compass:false,decl:0,omega:0,mag:null},
  DEF:{lat:34.9,lng:-119.17,z:16},
  map:null,last:null,ray:null,originDot:null,navLine:null,accCircle:null,
  _navState:null,_lastOverlayAngle:null,_compassBound:false,watchId:null,_lastAbsTs:0,
  _tHUD:0,_tNav:0,_tAlign:0,_lastAlignLL:null,_lastAlignHead:null,
  _aligned:null,_pending:null,
  ALIGN:{ENTER:0.35,EXIT:0.60,DWELL_BASE:60}, SCAN:{FLASH:500,COOLDOWN:600}, RAY:{ACTIVE:0.15},
  _flashName:null,_flashUntil:0,_flashCooldown:new Map(),_flashTarget:null,

  init(){
    const s=Store.loadState();
    if(typeof s.follow==='boolean')this.S.follow=s.follow;
    if(typeof s.rotate==='boolean')this.S.rotate=s.rotate;
    if(typeof s.bearing==='number')this.S.bearing=N(s.bearing);
    if(typeof s.decl==='number')this.S.decl=+s.decl||0;

    this.map=L.map('map',{zoomControl:true,attributionControl:true});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:20,minZoom:2,attribution:'© OpenStreetMap'}).addTo(this.map);
    this.map.setView([this.DEF.lat,this.DEF.lng],this.DEF.z);
    this.accCircle=L.circle([this.DEF.lat,this.DEF.lng],{radius:0,color:'#4db6ff',weight:1,opacity:.6,fillOpacity:.08}).addTo(this.map);

    UI.bind(); this.bindMap(); this.bindKeys();
    Waypoints.init(); Pins.init();
    this.applyBearing(this.S.bearing);
    UI.syncToggles(this.S);
    UI.declInit(this.S.decl);

    this.loop();
    addEventListener('beforeunload',()=>{this.persist(); this.stopGPS();},{once:true});
  },
  persist(){Store.saveState({follow:this.S.follow,rotate:this.S.rotate,bearing:this.S.bearing,decl:this.S.decl})},

  setRotate(v){
    this.S.rotate=!!v;
    if(this.S.rotate) this.setFollow(true);
    UI.syncToggles(this.S);
    this.applyBearing(this.S.bearing);
    this.persist();
  },

  uprightOverlays(deg){
    if(this._lastOverlayAngle!=null && Math.abs(Δ(this._lastOverlayAngle,deg))<0.12) return;
    this._lastOverlayAngle=deg;
    const rot=` rotate(${deg}deg)`, fixEl=el=>{
      const base=(el.style.transform||'').replace(/rotate\([^)]*\)/g,'').trim();
      el.style.transformOrigin=el.classList.contains('leaflet-popup')?'bottom center':'left center';
      el.style.transform=base+rot;
    };
    (this.map.getPanes().popupPane?.querySelectorAll('.leaflet-popup')||[]).forEach(fixEl);
    (this.map.getPanes().tooltipPane?.querySelectorAll('.leaflet-tooltip')||[]).forEach(fixEl);
  },

  mpp(){const s=this.map.getSize(),a=this.map.containerPointToLatLng(L.point(s.x/2,s.y/2)),b=this.map.containerPointToLatLng(L.point(s.x/2+1,s.y/2));return this.map.distance(a,b)||1},
  rayLen(){const s=this.map.getSize();return Math.max(Math.hypot(s.x,s.y)*this.mpp()*1.35+200,3000)},
  pivotLL(){return this.last?L.latLng(this.last.coords.latitude,this.last.coords.longitude):this.map.getCenter()},

  applyBearing(d){
    const pane=this.map.getPane('mapPane'); if(!pane)return;
    let o='50% 50%';
    if(this.last){const p=this.map.latLngToContainerPoint([this.last.coords.latitude,this.last.coords.longitude]);o=`${p.x}px ${p.y}px`;}
    pane.style.transformOrigin=o;
    pane.style.transform=(pane.style.transform||'').replace(/rotate\([^)]*\)/g,'')+` rotate(${-d}deg)`;
    this.uprightOverlays(d);
  },

  refreshRay(){
    if(!this.last){this.ray?.setLatLngs([]);return}
    const o=L.latLng(this.last.coords.latitude,this.last.coords.longitude);
    if(!this.originDot){this.originDot=L.circleMarker(o,{radius:3,color:'#2aff2a',weight:2,fillColor:'#2aff2a',fillOpacity:1,interactive:false}).addTo(this.map)}
    else this.originDot.setLatLng(o).bringToFront();
    if(this.S.heading==null)return;
    if(!this.ray)this.ray=L.polyline([],{color:'#2aff2a',weight:3,opacity:1,interactive:false}).addTo(this.map);
    this.ray.setLatLngs([o,dest(o,this.S.heading,this.rayLen())]).bringToFront();
  },
  _setRay(red){
    if(!this.ray)return;
    if(red){this.ray.setStyle({color:'#ff4444',weight:4,opacity:1});this.ray.getElement?.().classList.add('guide-hit')}
    else{this.ray.setStyle({color:'#2aff2a',weight:3,opacity:1});this.ray.getElement?.().classList.remove('guide-hit')}
  },

  refreshNav(){
    if(!this.S.dest||!this.last){this.navLine?.setLatLngs([]);UI.resetBtn('Reset');this._navState=null;return}
    UI.resetBtn('Clear Nav');
    const from=L.latLng(this.last.coords.latitude,this.last.coords.longitude),to=L.latLng(this.S.dest.lat,this.S.dest.lng);
    if(!this.navLine)this.navLine=L.polyline([], {color:'#29a36a',weight:3,opacity:.9,interactive:false,dashArray:'6 6'}).addTo(this.map);
    this.navLine.setLatLngs([from,to]).bringToFront();
    const b=bearing(from,to), d=haversine(from,to), err=this.S.heading==null?null:Δ(this.S.heading,b);
    this._navState={b,d,err};
    if(this.S.heading!=null){
      const on=Math.abs(err)<.5;
      if(on){this.navLine.setStyle({color:'#ff4444',weight:4,opacity:1});this.navLine.getElement?.().classList.add('guide-hit')}
      else{this.navLine.setStyle({color:'#29a36a',weight:3,opacity:.9});this.navLine.getElement?.().classList.remove('guide-hit')}
    }
  },

  candidates(){
    const list=[]; Waypoints.markers.forEach((m,name)=>list.push({name,ll:m.getLatLng()}));
    if(Pins.pin){const ll=Pins.pin.getLatLng(); list.push({name:(Pins._nm||`Pin ${fix(ll.lat)},${fix(ll.lng)}`),ll});}
    return list;
  },
  between(a,b,x){const ab=Δ(a,b),ax=Δ(a,x);return Math.sign(ab)===Math.sign(ax)&&Math.abs(ax)<=Math.abs(ab)},

  checkAnyAlignment(){
    const now=performance.now();
    if(!this.last||this.S.heading==null){
      this._pending=null;
      if(!(this._flashName && now<(this._flashUntil||0))){
        this._aligned=null; this._flashName=null; this._flashUntil=0; this._flashTarget=null; this._setRay(false); UI.bannerUnset();
      }
      return;
    }
    if(now-this._tAlign<30)return; this._tAlign=now;

    const from=L.latLng(this.last.coords.latitude,this.last.coords.longitude);
    const head=this.S.heading, prevHead=this._lastAlignHead??head;
    const movedLL=!this._lastAlignLL||this.map.distance(this._lastAlignLL,from)>1.8;
    const movedHead=this._lastAlignHead==null||Math.abs(Δ(this._lastAlignHead,head))>0.06;
    if(!movedLL&&!movedHead)return;
    this._lastAlignLL=from; this._lastAlignHead=head;

    const cand=this.candidates(); if(cand.length===0){this._setRay(false); UI.bannerUnset(); return}

    let instBest=null,instErr=999,instDist=Infinity;
    for(const c of cand){
      const brg=bearing(from,c.ll),err=Math.abs(Δ(head,brg)),dist=haversine(from,c.ll);
      if(err<instErr-1e-6||(Math.abs(err-instErr)<1e-6&&dist<instDist)){instBest={...c,brg};instErr=err;instDist=dist;}
    }

    const rayTarget=this._aligned||this._flashTarget||instBest;
    const rayErr=rayTarget?Math.abs(Δ(head,bearing(from,rayTarget.ll))):999;
    this._setRay(rayErr<=this.RAY.ACTIVE);

    const step=Math.abs(Δ(prevHead,head));
    const dwell=Math.max(0,this.ALIGN.DWELL_BASE-0.6*(this.S.omega||0));
    const enter=this.ALIGN.ENTER, exit=this.ALIGN.EXIT;

    if(this._aligned){
      const e=Math.abs(Δ(head,bearing(from,this._aligned.ll)));
      if(e<=exit){ UI.bannerLock(this._aligned.name,false); return; }
      this._aligned=null;
    }

    if(instBest && instErr<=enter){
      if(this._pending && this._pending.name===instBest.name){
        if(now-this._pending.since>=dwell){
          this._aligned={name:instBest.name,ll:instBest.ll,err:instErr,dist:instDist};
          this._pending=null; this._flashName=null; this._flashUntil=0; this._flashTarget=null;
          UI.bannerLock(this._aligned.name,true); Haptics.hit(); return;
        }
      }else this._pending={name:instBest.name,since:now};
    }else this._pending=null;

    let flashPick=null,flashErr=999;
    if(step<=35){
      for(const c of cand){
        const brg=bearing(from,c.ll);
        if(this.between(prevHead,head,brg)){
          const e=Math.abs(Δ(head,brg)); if(e<flashErr){flashErr=e; flashPick=c;}
        }
      }
    }
    if(flashPick){
      const lastFire=this._flashCooldown.get(flashPick.name)||0;
      if(now-lastFire>this.SCAN.COOLDOWN){
        this._flashCooldown.set(flashPick.name,now);
        this._flashName=flashPick.name; this._flashUntil=now+this.SCAN.FLASH;
        this._flashTarget={name:flashPick.name,ll:flashPick.ll};
        UI.bannerFlash(this._flashName,true); Haptics.hit();
      }
    }
    if(this._flashName && now>this._flashUntil){ this._flashName=null; this._flashUntil=0; this._flashTarget=null; UI.bannerUnset(); }
  },

  updateHUD(){
    const now=performance.now(); if(now-this._tHUD<120) return; this._tHUD=now;
    const lat=this.last?.coords?.latitude?.toFixed(6)??'—',
          lng=this.last?.coords?.longitude?.toFixed(6)??'—',
          acc=this.last?.coords?.accuracy?Math.round(this.last.coords.accuracy):'—',
          hd=this.S.heading!=null?(this.S.heading).toFixed(2):'—',
          mb=(N(-this.S.bearing)).toFixed(2),
          align=this._aligned?.name || (this._flashName??'none');
    let nav=''; if(this.S.dest&&this.last){
      const b=this._navState?.b, d=this._navState?.d, steer=(this._navState?.err!=null)?this._navState.err.toFixed(2):'—';
      nav=`<div class="metric"><span>To</span><b class="value">${this.S.dest.name||'Dest'}</b></div>
           <div class="metric"><span>Dist</span><b class="value">${fmtDist(d??0)}</b></div>
           <div class="metric"><span>Brg</span><b class="value">${(b??0).toFixed(2)}&deg;</b></div>
           <div class="metric"><span>Δ</span><b class="value">${steer}&deg;</b></div>`;
    }
    $('readout').innerHTML=`<div class="metrics">
      <div class="metric"><span>Lat</span><b class="value">${lat}</b></div>
      <div class="metric"><span>Lng</span><b class="value">${lng}</b></div>
      <div class="metric"><span>Acc</span><b class="value">${acc} m</b></div>
      <div class="metric"><span>Head</span><b class="value">${hd}&deg;</b></div>
      <div class="metric"><span>Map</span><b class="value">${mb}&deg;</b></div>
      <div class="metric"><span>Alignment</span><b class="value">${align}</b></div>${nav}</div>`;
  },

  loop(){
    const tgt=(this.S.rotate??true)?(this.S.heading??0):0;
    const err=Math.abs(Δ(this.S.bearing,tgt));
    const aRot=0.12 + 0.38 * Math.min(1,(this.S.omega||0)/240);
    this.S.bearing = err<0.08 ? this.S.bearing : blend(this.S.bearing,tgt,aRot);

    this.applyBearing(this.S.bearing);
    this.refreshRay();

    const now=performance.now();
    if(now-this._tNav>60){this._tNav=now; this.refreshNav();}
    this.checkAnyAlignment();
    this.updateHUD();

    requestAnimationFrame(()=>this.loop());
  },

  _lastHeadTs:null,_prevHead:null,
  _setHeadingRaw(magRaw){
    const mag=N(magRaw), adj=N(mag+(this.S.decl||0)), t=performance.now(), p=this.S.heading;
    if(p==null || Math.abs(Δ(p,adj))>0.02){
      if(this._lastHeadTs!=null && this._prevHead!=null){
        const dt=(t-this._lastHeadTs)/1000; if(dt>0) this.S.omega=Math.min(720,Math.abs(Δ(this._prevHead,adj))/dt);
      }
      this._prevHead=adj; this._lastHeadTs=t; this.S.mag=mag; this.S.heading=adj;
      if(this.S.rotate && p==null) this.S.bearing=adj;
    }else this.S.mag=mag;
  },
  onOrient(e){
    const now=performance.now();
    const hasWCH=typeof e.webkitCompassHeading==='number';
    const hasAlpha=typeof e.alpha==='number';
    const isAbs=(e.absolute===true)||hasWCH;
    if(isAbs){ this._lastAbsTs=now; if(hasWCH) this._setHeadingRaw(e.webkitCompassHeading); else if(hasAlpha) this._setHeadingRaw(e.alpha); return; }
    if(now-this._lastAbsTs<120) return;
    if(hasAlpha) this._setHeadingRaw(e.alpha);
  },

  async enableCompass(){
    if(this.S.compass) return true;
    try{
      if(location.protocol!=='https:' && location.hostname!=='localhost'){ alert('Compass requires HTTPS.'); return false; }
      if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function'){
        const g=await DeviceOrientationEvent.requestPermission(); if(g!=='granted'){alert('Compass permission denied.');return false;}
      }
      if(!this._compassBound){
        const h=e=>this.onOrient(e);
        addEventListener('deviceorientationabsolute',h,true);
        addEventListener('deviceorientation',h,true);
        this._compassBound=true;
      }
      this.S.compass=true; return true;
    }catch{alert('Compass access failed.'); return false}
  },

  startGPS(){
    if(!('geolocation'in navigator))return alert('Geolocation not supported.');
    if(this.watchId!=null) return;
    this.watchId = navigator.geolocation.watchPosition(p=>{
      this.last=p; const {latitude,longitude,accuracy:acc,heading}=p.coords, ll=[latitude,longitude];
      this.accCircle.setLatLng(ll).setRadius(Math.max(acc||0,0));
      if(this.S.follow&&!this.S.press)this.map.setView(ll,Math.max(this.map.getZoom(),16),{animate:false});
      if(Number.isFinite(heading)) this._setHeadingRaw(heading);
    },e=>alert('Unable to get location: '+e.message),{enableHighAccuracy:true,maximumAge:2000,timeout:15000});
  },
  stopGPS(){ if(this.watchId!=null && 'geolocation'in navigator){ navigator.geolocation.clearWatch(this.watchId); this.watchId=null; } },

  resetView(){
    if(this.S.dest){this.S.dest=null; this.refreshNav(); this.updateHUD(); return}
    if(this.last){const{latitude,longitude}=this.last.coords; this.map.setView([latitude,longitude],Math.max(this.map.getZoom(),16))}
    else this.map.setView([this.DEF.lat,this.DEF.lng],this.DEF.z);
    this.applyBearing(this.S.bearing);
  },

  setFollow(v){
    this.S.follow=!!v; UI.syncToggles(this.S);
    if(this.S.follow&&this.last){const{latitude,longitude}=this.last.coords; this.map.setView([latitude,longitude],Math.max(this.map.getZoom(),16),{animate:false}); this.applyBearing(this.S.bearing)}
  },

  // pointer inverse-transform under rotation (why: accurate pin-drop while rotated)
  latLngFromPt(pt){
    const ang=(this.S.press&&this.S.fAngle!=null)?this.S.fAngle:this.S.bearing;
    const layer=this.map.containerPointToLayerPoint(pt), pivot=(this.S.press&&this.S.fPivot)?this.S.fPivot:this.map.latLngToLayerPoint(this.pivotLL());
    const th=R(ang),c=Math.cos(th),s=Math.sin(th),dx=layer.x-pivot.x,dy=layer.y-pivot.y;
    const un=L.point(pivot.x+dx*c+dy*s, pivot.y+(-dx*s)+dy*c);
    return this.map.layerPointToLatLng(un);
  },

  bindMap(){
    const container=this.map.getContainer(); let timer=null,start=null,last=null; const LONG=420,MOVE=6;
    const pt=e=>{const r=container.getBoundingClientRect(); return L.point(e.clientX-r.left, e.clientY-r.top)};
    const freezeS=()=>{this.S.press=true; this.S.fAngle=this.S.bearing; this.S.fPivot=this.map.latLngToLayerPoint(this.pivotLL())};
    const freezeE=()=>{this.S.press=false; this.S.fAngle=null; this.S.fPivot=null};
    const dropAt=ll=>Pins.drop(ll.lat,ll.lng);

    container.addEventListener('pointerdown',e=>{if(e.button!==0&&e.pointerType==='mouse')return;e.preventDefault(); freezeS(); start=last=pt(e); clearTimeout(timer);
      timer=setTimeout(()=>{timer=null; dropAt(this.latLngFromPt(last)); freezeE()},LONG)},{passive:false});
    container.addEventListener('pointermove',e=>{if(!timer)return;e.preventDefault(); last=pt(e); if(Math.hypot(last.x-start.x,last.y-start.y)>MOVE){clearTimeout(timer); freezeE()}},{passive:false});
    ['pointerup','pointercancel','pointerleave'].forEach(ev=>container.addEventListener(ev,()=>{clearTimeout(timer); freezeE()},{passive:true}));

    this.map.on('contextmenu',e=>{e.originalEvent?.preventDefault(); freezeS(); const p=e.containerPoint??pt(e.originalEvent); dropAt(this.latLngFromPt(p)); freezeE()});
    this.map.on('move moveend zoom zoomend zoomanim',()=>{this.applyBearing(this.S.bearing); this.refreshRay();});
    addEventListener('resize',()=>{this.map.invalidateSize(); this.applyBearing(this.S.bearing); this.refreshRay();},{passive:true});
  },

  bindKeys(){
    addEventListener('keydown',(e)=>{
      const tag=(e.target&&e.target.tagName)||''; if(tag==='INPUT'||tag==='TEXTAREA'||e.metaKey||e.ctrlKey||e.altKey) return;
      const k=(e.key||'').toLowerCase();
      if(k==='l'){ e.preventDefault(); this.startGPS(); }
      else if(k==='f'){ e.preventDefault(); this.setFollow(!this.S.follow); }
      else if(k==='r'){ e.preventDefault(); (async()=>{ if(!this.S.rotate){ if(!await this.enableCompass()) return; this.setRotate(true);} else this.setRotate(false); })(); }
      else if(k==='c'){ e.preventDefault(); this.resetView(); }
    });
  }
};

/* ===========================
 * UI Wiring (why: decouple DOM from logic)
 * =========================== */
const UI={
  syncToggles(S){
    $('followState').textContent=S.follow?'on':'off';
    $('btnFollow').classList.toggle('toggled',S.follow);
    $('btnFollow').setAttribute('aria-pressed',String(S.follow));
    $('compassState').textContent=S.rotate?'on':'off';
    $('btnCompass').classList.toggle('toggled',S.rotate);
    $('btnCompass').setAttribute('aria-pressed',String(S.rotate));
  },
  resetBtn(t){$('btnReset').textContent=t},
  declInit(v){$('declSlider').value=String(v); $('declVal').textContent=`${(+v).toFixed(1)}°`},
  bannerLock(name,pulse){$('alignName').textContent=name||'—'; $('alignName').classList.remove('unstable'); this._pulse(pulse)},
  bannerFlash(name,pulse){$('alignName').textContent=name||'—'; $('alignName').classList.add('unstable'); this._pulse(pulse)},
  bannerUnset(){ $('alignName').textContent='—'; $('alignName').classList.add('unstable') },
  _pulse(go){ if(!go)return; const b=$('alignBanner'); b.classList.add('pulse'); setTimeout(()=>b.classList.remove('pulse'),600); },

  bind(){
    $('btnLocate').onclick=()=>App.startGPS();
    $('btnCompass').onclick=async()=>{ if(!App.S.rotate){ if(!await App.enableCompass()) return; App.setRotate(true);} else App.setRotate(false); };
    $('btnReset').onclick=()=>App.resetView();
    $('btnFollow').onclick=()=>App.setFollow(!App.S.follow);

    const btnWP=$('btnWaypoints'), wpPanel=$('wpPanel');
    btnWP.onclick=()=>{const open=!wpPanel.classList.contains('open'); wpPanel.classList.toggle('open',open); wpPanel.setAttribute('aria-hidden',open?'false':'true'); btnWP.setAttribute('aria-expanded',String(open))};
    $('wpAdd').onclick=()=>{const p=parseCoords($('wpCoords').value); if(!p)return alert('Could not parse coordinates.'); Waypoints.upsert(($('wpName').value||'').trim(),p.lat,p.lng); $('wpName').value=''; $('wpCoords').value=''};

    $('wpList').onclick=e=>{
      const t=e.target; const idx=t.getAttribute('data-idx'); if(idx==null) return; const i=+idx;
      if(t.hasAttribute('data-go')){ const w=Waypoints.load()[i]; if(w){ App.setFollow(false); App.setRotate(false); App.map.setView([w.lat,w.lng],16); Waypoints.ensureMarker(w.name)?.openPopup(); } }
      else if(t.hasAttribute('data-guide')){ const w=Waypoints.load()[i]; if(w){ App.S.dest={lat:w.lat,lng:w.lng,name:w.name}; App.refreshNav(); App.updateHUD(); } }
      else if(t.hasAttribute('data-edit')){ Waypoints.edit(i); }
      else if(t.hasAttribute('data-save-edit')){ Waypoints.saveEdit(i); }
      else if(t.hasAttribute('data-cancel')){ Waypoints.render(); }
      else if(t.hasAttribute('data-del')){ Waypoints.del(i); }
    };

    const btnSettings=$('btnSettings'), settings=$('settingsPanel');
    btnSettings.onclick=()=>{const open=!settings.classList.contains('open'); settings.classList.toggle('open',open); settings.setAttribute('aria-hidden',open?'false':'true'); btnSettings.setAttribute('aria-expanded',String(open))};

    const slider=$('declSlider'), val=$('declVal');
    const showVal=()=>{ const v=parseFloat(slider.value); if(Number.isFinite(v)) val.textContent=`${v.toFixed(1)}°`; };
    slider.addEventListener('input',()=>{ const v=parseFloat(slider.value); if(Number.isFinite(v)) { App.S.decl=v; showVal(); } },{passive:true});
    $('declSave').onclick=()=>{
      const v=parseFloat(slider.value);
      if(Number.isFinite(v)){ App.S.decl=v; if(App.S.mag!=null){ App.S.heading=N(App.S.mag + App.S.decl); } App.persist(); App.updateHUD(); }
      const btn=$('declSave'); const old=btn.textContent; btn.textContent='Saved ✓'; setTimeout(()=>btn.textContent=old,900);
    };
    showVal();
  }
};

/* ===========================
 * Waypoints
 * =========================== */
const Waypoints={
  markers:new Map(),
  init(){ this.render(); this.syncMarkers(); },
  load(){ return Store.loadWPs() },
  save(a){ Store.saveWPs(a) },
  ensureMarker(name){return this.markers.get(name)||null},
  render(){
    const list=$('wpList'); list.innerHTML='';
    const a=this.load();
    a.forEach((w,i)=>{
      const d=document.createElement('div'); d.className='item';
      d.innerHTML=`<div><strong>${w.name}</strong><small>${w.lat.toFixed(6)}, ${w.lng.toFixed(6)}</small></div>
       <button class="btn" data-idx="${i}" data-go>Go</button>
       <button class="btn" data-idx="${i}" data-guide>Guide</button>
       <button class="btn" data-idx="${i}" data-edit>Edit</button>
       <button class="btn danger" data-idx="${i}" data-del>Del</button>`;
      list.appendChild(d);
    });
  },
  edit(i){
    const list=$('wpList'); const a=this.load(); const w=a[i]; if(!w) return;
    const d=list.children[i]; if(!d) return;
    d.className='item item-edit';
    d.innerHTML=`<div class="grid-6">
        <input data-e-name placeholder="Name" value="${w.name}"/>
        <div class="grid-2col">
          <input data-e-lat placeholder="Lat" value="${w.lat.toFixed(6)}"/>
          <input data-e-lng placeholder="Lng" value="${w.lng.toFixed(6)}"/>
        </div></div>
      <button class="btn primary" data-idx="${i}" data-save-edit>Save</button>
      <button class="btn" data-idx="${i}" data-cancel>Cancel</button>`;
  },
  saveEdit(i){
    const a=this.load(); const w=a[i]; if(!w) return;
    const list=$('wpList'); const d=list.children[i]; if(!d) return;
    const nm=(d.querySelector('[data-e-name]')?.value||'').trim()||w.name;
    const lat=parseFloat((d.querySelector('[data-e-lat]')?.value||'').trim());
    const lng=parseFloat((d.querySelector('[data-e-lng]')?.value||'').trim());
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180){ alert('Invalid coordinates.'); return; }
    a[i]={name:nm,lat,lng};
    this.save(a); this.render(); this.syncMarkers();
  },
  upsert(name,lat,lng){
    const a=this.load(),nm=(name?.trim())||`WP ${Date.now().toString().slice(-5)}`,i=a.findIndex(w=>w.name.toLowerCase()===nm.toLowerCase()),e={name:nm,lat,lng};
    if(i>=0)a[i]=e; else a.push(e); this.save(a); this.render(); this.syncMarkers();
  },
  del(i){
    const a=this.load(); const[rm]=a.splice(i,1); this.save(a); this.render();
    if(rm&&this.markers.has(rm.name)){App.map.removeLayer(this.markers.get(rm.name)); this.markers.delete(rm.name)}
  },
  syncMarkers(){
    const a=this.load();
    a.forEach(w=>{
      if(!this.markers.has(w.name)){
        const m=makeDot(w.lat,w.lng,12).addTo(App.map); bindMarker(m,{name:w.name,lat:w.lat,lng:w.lng}); this.markers.set(w.name,m);
      }else{
        const m=this.markers.get(w.name); m.setLatLng([w.lat,w.lng]).setIcon(DotIcon(12)); bindMarker(m,{name:w.name,lat:w.lat,lng:w.lng});
      }
    });
    [...this.markers.keys()].forEach(n=>{if(!a.some(w=>w.name===n)){App.map.removeLayer(this.markers.get(n)); this.markers.delete(n)}});
  }
};

/* ===========================
 * Pins
 * =========================== */
const Pins={
  pin:null,_nm:null,
  init(){},
  drop(lat,lng){
    if(this.pin)App.map.removeLayer(this.pin);
    this.pin=makeDot(lat,lng,14).addTo(App.map);
    this._nm=`Pin ${fix(lat)},${fix(lng)}`;
    bindMarker(this.pin,{name:this._nm,lat,lng});
    this.pin.openPopup();
    App.uprightOverlays(App.S.bearing);
  }
};

/* ===========================
 * Marker Popup binding (why: consistent actions)
 * =========================== */
function bindMarker(m,{name,lat,lng}){
  const html=nm=>`<div class="popup-grid">
    <input class="popup-input" type="text" placeholder="Name" value="${nm||`Pin ${fix(lat)},${fix(lng)}`}" data-name/>
    <div class="popup-coords">${fix(lat)}, ${fix(lng)}</div>
    <div class="popup-actions">
      <button class="btn" data-copy>Copy</button>
      <button class="btn" data-min>Minimize</button>
      <button class="btn" data-guide>Guide</button>
      <button class="btn primary" data-save>Save</button>
    </div></div>`;
  m.unbindPopup();
  m.bindPopup(html(name),{className:'floating-popup',autoClose:true,closeButton:true,offset:[0,-10]})
   .off('popupopen').on('popupopen',()=>{
     const el=m.getPopup().getElement(),I=el.querySelector('[data-name]'),C=el.querySelector('[data-copy]'),
           SAV=el.querySelector('[data-save]'),MIN=el.querySelector('[data-min]'),G=el.querySelector('[data-guide]');
     C?.addEventListener('click',async()=>{const txt=`${fix(lat)}, ${fix(lng)}`;try{await navigator.clipboard.writeText(txt);C.textContent='Copied';setTimeout(()=>C.textContent='Copy',900)}catch{prompt('Copy to clipboard:',txt)}});
     SAV?.addEventListener('click',()=>{const nm=(I?.value||'').trim()||`WP ${Date.now().toString().slice(-5)}`; Waypoints.upsert(nm,lat,lng); m.closePopup(); m._nm=nm});
     MIN?.addEventListener('click',()=>{const nm=(I?.value||m._nm||'Pin')||'Pin'; m.bindTooltip(nm,{permanent:true,direction:'right',offset:[8,0],className:'mini-label'}).openTooltip(); m.closePopup(); m._nm=nm; App.uprightOverlays(App.S.bearing);});
     G?.addEventListener('click',()=>{App.S.dest={lat,lng,name:(I?.value||m._nm||'Dest')}; App.refreshNav(); App.updateHUD(); m.closePopup();});
     App.uprightOverlays(App.S.bearing);
   });
  m.on('tooltipopen',()=>App.uprightOverlays(App.S.bearing));
}

/* ===========================
 * Boot
 * =========================== */
App.init();

});
