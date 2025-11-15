// state.js
(function () {
  "use strict";

  const AP = (window.APTool = window.APTool || {});

  // ------------- STATE -------------

  AP.state = {
    gps: null,            // {lat,lon,acc,speed,heading,alt}
    orientation: null,    // {alpha,beta,gamma,absolute}
    target: null,         // {lat,lon,elev,src}
    headingOffset: 0,
    pitchZeroOffset: 0,
    pitchSign: 1,
    lastHeadingRaw: null,
    lastPitchRaw: null,

    // settings
    applyDeclination: true,
    manualDeclination: 0,
    altMode: "gps",      // "gps" or "manual"
    manualObserverElev: 0,
    instrumentHeight: 1.5,
    gpsGeoidOffset: 0,

    // derived
    declModel: null,
    declTotal: null,
    observerElev: null,
    observerSrc: "–",
  };

  AP._rafPending = false;

  // ------------- DOM HELPERS -------------

  function setText(id, txt) {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  }

  AP.setLiveStatus = function (msg) {
    setText("live-status", msg);
  };

  AP.setSensorStatus = function (msg) {
    setText("sensor-status", msg);
  };

  AP.setMapStatus = function (msg) {
    setText("map-status", msg);
  };

  // ------------- MATH HELPERS -------------

  AP.deg2rad = function (d) {
    return (d * Math.PI) / 180;
  };
  AP.rad2deg = function (r) {
    return (r * 180) / Math.PI;
  };
  AP.norm360 = function (d) {
    return ((d % 360) + 360) % 360;
  };
  AP.wrap180 = function (d) {
    let x = ((d + 180) % 360) - 180;
    return x < -180 ? x + 360 : x;
  };
  AP.clamp = function (v, min, max) {
    return Math.max(min, Math.min(max, v));
  };
  AP.ema = function (prev, next, alpha = 0.25) {
    return prev == null ? next : alpha * next + (1 - alpha) * prev;
  };

  function screenAngle() {
    const so = screen.orientation;
    if (so && typeof so.angle === "number") return so.angle;
    if (typeof window.orientation === "number") return window.orientation || 0;
    return 0;
  }

  AP.estimatePitch = function (beta, gamma) {
    const sAng = Math.round(AP.norm360(screenAngle()) / 90) * 90;
    if (beta == null && gamma == null) return null;

    const b = beta != null ? beta : 0;
    const g = gamma != null ? gamma : 0;

    let raw;
    if (sAng === 0) {
      raw = b; // portrait
    } else if (sAng === 180) {
      raw = -b;
    } else if (sAng === 90) {
      raw = g;
    } else if (sAng === 270) {
      raw = -g;
    } else {
      raw = b;
    }
    return AP.clamp(raw, -90, 90);
  };

  AP.compassFromEvent = function (ev) {
    if (!ev) return { heading: null, source: null };

    if (
      typeof ev.webkitCompassHeading === "number" &&
      !Number.isNaN(ev.webkitCompassHeading)
    ) {
      return { heading: AP.norm360(ev.webkitCompassHeading), source: "iOS" };
    }

    if (ev.absolute === true && typeof ev.alpha === "number") {
      const h = AP.norm360(ev.alpha + screenAngle());
      return { heading: h, source: "absolute" };
    }

    if (typeof ev.alpha === "number") {
      return { heading: null, source: "relative" };
    }

    return { heading: null, source: null };
  };

  // Simple Haversine + bearing
  AP.bearingDistance = function (lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const φ1 = AP.deg2rad(lat1);
    const φ2 = AP.deg2rad(lat2);
    const dφ = AP.deg2rad(lat2 - lat1);
    const dλ = AP.deg2rad(lon2 - lon1);

    const a =
      Math.sin(dφ / 2) * Math.sin(dφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) * Math.sin(dλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const dist = R * c;

    const y = Math.sin(dλ) * Math.cos(φ2);
    const x =
      Math.cos(φ1) * Math.sin(φ2) -
      Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
    const θ = Math.atan2(y, x);
    const bearing = AP.norm360(AP.rad2deg(θ));

    return { distance: dist, bearing };
  };

  // Very rough declination model – good enough for guidance
  AP.declinationDeg = function (lat, lon) {
    if (lat == null || lon == null) return 0;
    // Super-simple: depends on latitude + longitude sign
    // (we removed the full spherical harmonic model for brevity)
    const base = (lon / 12) * Math.cos(AP.deg2rad(lat));
    return AP.clamp(base, -25, 25);
  };

  // ------------- DRAWING -------------

  const Compass = {
    el: null,
    ctx: null,
    w: 0,
    h: 0,
    init() {
      this.el = document.getElementById("compass");
      if (!this.el) return;
      this.ctx = this.el.getContext("2d");
      this.resize();
      window.addEventListener("resize", () => this.resize());
    },
    resize() {
      if (!this.el || !this.ctx) return;
      const rect = this.el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      this.el.width = rect.width;
      this.el.height = rect.height;
      this.w = rect.width;
      this.h = rect.height;
      this.draw(null);
    },
    draw(state) {
      const ctx = this.ctx;
      if (!ctx || !this.el) return;
      const w = this.el.width;
      const h = this.el.height;
      ctx.clearRect(0, 0, w, h);
      if (!state) {
        ctx.fillStyle = "#64748b";
        ctx.font = "12px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Need GPS + target", w / 2, h / 2);
        return;
      }

      const cx = w / 2;
      const cy = h / 2;
      const r = Math.min(w, h) / 2 - 12;

      // background circle
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "#020617";
      ctx.fill();
      ctx.strokeStyle = "rgba(148,163,184,.5)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // ticks
      for (let d = 0; d < 360; d += 30) {
        const ang = AP.deg2rad(d);
        const inner = r - 10;
        const outer = r;
        const sx = cx + inner * Math.sin(ang);
        const sy = cy - inner * Math.cos(ang);
        const ex = cx + outer * Math.sin(ang);
        const ey = cy - outer * Math.cos(ang);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle =
          d % 90 === 0 ? "rgba(148,163,184,.8)" : "rgba(148,163,184,.35)";
        ctx.lineWidth = d % 90 === 0 ? 2 : 1;
        ctx.stroke();
      }

      // labels
      ctx.fillStyle = "#cbd5f5";
      ctx.font = "11px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      [["N", 0], ["E", 90], ["S", 180], ["W", 270]].forEach(([txt, deg]) => {
        const ang = AP.deg2rad(deg);
        const rr = r - 20;
        const x = cx + rr * Math.sin(ang);
        const y = cy - rr * Math.cos(ang);
        ctx.fillText(txt, x, y);
      });

      const bearing = state.bearing;
      const heading = state.heading;
      const azOk = !!state.azOk;

      const drawArrow = (deg, color, innerOffset) => {
        const ang = AP.deg2rad(deg);
        const rr = r - 18;
        const x2 = cx + rr * Math.sin(ang);
        const y2 = cy - rr * Math.cos(ang);
        const x1 = cx + (rr - innerOffset) * Math.sin(ang);
        const y1 = cy - (rr - innerOffset) * Math.cos(ang);

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        const headLen = 7;
        const leftAng = ang + AP.deg2rad(150);
        const rightAng = ang - AP.deg2rad(150);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 + headLen * Math.sin(leftAng),
          y2 - headLen * Math.cos(leftAng)
        );
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 + headLen * Math.sin(rightAng),
          y2 - headLen * Math.cos(rightAng)
        );
        ctx.stroke();
      };

      // target bearing arrow
      drawArrow(
        bearing,
        azOk ? "#22c55e" : "#f59e0b",
        16 /* innerOffset */
      );

      // heading arrow
      drawArrow(heading, azOk ? "#22c55e" : "#38bdf8", 26);

      ctx.fillStyle = azOk ? "#22c55e" : "#9ca3af";
      ctx.font = "11px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        azOk ? "On azimuth" : state.deltaAz > 0 ? "Turn right" : "Turn left",
        cx,
        cy + r * 0.55
      );
    },
  };

  const ElevGauge = {
    el: null,
    ctx: null,
    init() {
      this.el = document.getElementById("compass-elev");
      if (!this.el) return;
      this.ctx = this.el.getContext("2d");
      this.resize();
      window.addEventListener("resize", () => this.resize());
    },
    resize() {
      if (!this.el || !this.ctx) return;
      const rect = this.el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      this.el.width = rect.width;
      this.el.height = rect.height;
      this.draw(null);
    },
    draw(state) {
      const ctx = this.ctx;
      if (!ctx || !this.el) return;
      const w = this.el.width;
      const h = this.el.height;
      ctx.clearRect(0, 0, w, h);

      if (!state) {
        ctx.fillStyle = "#64748b";
        ctx.font = "12px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Need target elevation + pitch", w / 2, h / 2);
        return;
      }

      const padX = 18;
      const midY = h / 2;
      const minDeg = -60;
      const maxDeg = 60;

      const xFor = (a) => {
        const v = AP.clamp(a, minDeg, maxDeg);
        const t = (v - minDeg) / (maxDeg - minDeg);
        return padX + t * (w - 2 * padX);
      };

      // axis
      ctx.fillStyle = "#020617";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(148,163,184,.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(padX, midY);
      ctx.lineTo(w - padX, midY);
      ctx.stroke();

      ctx.fillStyle = "#9ca3af";
      ctx.font = "10px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (let d = -60; d <= 60; d += 30) {
        const x = xFor(d);
        const tickH = d === 0 ? 10 : 6;
        ctx.beginPath();
        ctx.moveTo(x, midY - tickH / 2);
        ctx.lineTo(x, midY + tickH / 2);
        ctx.stroke();
        ctx.fillText(d + "°", x, midY + tickH / 2 + 3);
      }

      const req = state.required;
      const pitch = state.pitch;
      const xReq = xFor(req);
      const xPitch = xFor(pitch);

      // required
      ctx.strokeStyle = state.elOk ? "#22c55e" : "#f59e0b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(xReq, midY - 18);
      ctx.lineTo(xReq, midY + 18);
      ctx.stroke();

      // pitch
      ctx.strokeStyle = state.elOk ? "#22c55e" : "#38bdf8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xPitch, midY - 14);
      ctx.lineTo(xPitch, midY + 14);
      ctx.stroke();

      ctx.fillStyle = state.elOk ? "#22c55e" : "#9ca3af";
      ctx.font = "11px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      const txt =
        state.delta > 2
          ? "Tilt up"
          : state.delta < -2
          ? "Tilt down"
          : "On elevation";
      ctx.fillText(txt, w / 2, midY - 20);
    },
  };

  // ------------- MAIN UPDATE -------------

  AP.scheduleUpdate = function () {
    if (AP._rafPending) return;
    AP._rafPending = true;
    requestAnimationFrame(() => {
      AP._rafPending = false;
      AP.update();
    });
  };

  AP.update = function () {
    const s = AP.state;
    const gps = s.gps;
    const tgt = s.target;

    // Declination
    if (gps && typeof gps.lat === "number" && typeof gps.lon === "number") {
      s.declModel = AP.declinationDeg(gps.lat, gps.lon);
      s.declTotal =
        (s.declModel || 0) + (s.manualDeclination ? s.manualDeclination : 0);
      setText(
        "live-decl",
        `${s.declTotal.toFixed(1)}° ${
          s.applyDeclination ? "(applied)" : "(off)"
        }`
      );
      setText(
        "settings-decl-preview",
        `Decl model ${s.declModel.toFixed(1)}° + manual ${
          s.manualDeclination.toFixed(1)
        }° = ${s.declTotal.toFixed(1)}°`
      );
    } else {
      setText("live-decl", "–");
      setText("settings-decl-preview", "Declination: waiting for GPS…");
      s.declModel = null;
      s.declTotal = null;
    }

    // Basic sensor displays (GPS/orientation fields are filled in sensors.js)

    // If no gps or target, clear outputs and canvases
    if (!gps || !tgt || typeof tgt.lat !== "number" || typeof tgt.lon !== "number") {
      AP.setLiveStatus("Need GPS fix + target.");
      [
        "live-azimuth",
        "live-heading",
        "live-turn",
        "live-distance",
        "live-elev-angle",
        "live-pitch",
        "live-tilt",
        "live-obs-elev",
        "live-dz",
      ].forEach((id) => setText(id, "–"));

      Compass.draw(null);
      ElevGauge.draw(null);

      const c1 = document.getElementById("compass");
      const c2 = document.getElementById("compass-elev");
      if (c1) c1.classList.remove("on-target");
      if (c2) c2.classList.remove("on-target");
      return;
    }

    // Distance + bearing
    const inv = AP.bearingDistance(gps.lat, gps.lon, tgt.lat, tgt.lon);
    const bearing = inv.bearing;
    const dist = inv.distance;

    setText("live-azimuth", bearing.toFixed(1));
    setText(
      "live-distance",
      dist >= 1000 ? (dist / 1000).toFixed(3) + " km" : dist.toFixed(1) + " m"
    );

    // Heading (orientation preferred, GPS fallback when moving)
    let heading = null;
    let headingSrc = "";

    if (typeof gps.heading === "number" && gps.speed && gps.speed > 0.5) {
      heading = AP.norm360(gps.heading);
      headingSrc = "GPS";
    }

    if (s.lastHeadingRaw != null) {
      let h = s.lastHeadingRaw;
      if (s.applyDeclination && s.declTotal != null) {
        h = AP.norm360(h + s.declTotal);
      }
      h = AP.norm360(h + s.headingOffset);
      heading = h;
      headingSrc = "orientation" + (s.applyDeclination ? "+decl" : "");
    }

    let azOk = false;
    let deltaAz = 0;

    if (heading == null) {
      setText("live-heading", "–");
      setText("live-turn", "Move or rotate phone to get heading.");
      AP.setLiveStatus("No heading yet.");
    } else {
      setText(
        "live-heading",
        `${heading.toFixed(1)}° ${headingSrc ? "(" + headingSrc + ")" : ""}`
      );
      deltaAz = AP.wrap180(bearing - heading);
      const dead = 5;
      azOk = Math.abs(deltaAz) < dead;
      if (azOk) {
        setText("live-turn", `On target (±${dead}°)`);
        AP.setLiveStatus("Azimuth on target.");
      } else {
        setText(
          "live-turn",
          `Turn ${deltaAz > 0 ? "right" : "left"} ${Math.abs(deltaAz).toFixed(
            1
          )}°`
        );
        AP.setLiveStatus("Align azimuth to target.");
      }
    }

    // Observer elevation
    let obsElev = null;
    let obsSrc = "–";
    if (s.altMode === "manual") {
      obsElev = s.manualObserverElev;
      obsSrc = "manual";
    } else {
      if (typeof gps.alt === "number") {
        obsElev = gps.alt + (s.gpsGeoidOffset || 0);
        obsSrc = "GPS+offset";
      }
    }

    if (obsElev != null) {
      obsElev += s.instrumentHeight || 0;
    }

    s.observerElev = obsElev;
    s.observerSrc = obsSrc;

    setText(
      "live-obs-elev",
      obsElev != null ? obsElev.toFixed(1) + " m" : "–"
    );
    setText(
      "settings-alt-preview",
      `Alt mode: ${s.altMode.toUpperCase()} · Obs=${
        obsElev != null ? obsElev.toFixed(1) + " m" : "–"
      } (${obsSrc}) · Hinst=${(s.instrumentHeight || 0).toFixed(1)} m`
    );

    // Required elevation angle
    let dz = null;
    let requiredElev = null;
    if (tgt.elev != null && obsElev != null && dist > 1) {
      dz = tgt.elev - obsElev;
      requiredElev = AP.rad2deg(Math.atan2(dz, dist));
    }

    if (dz != null) setText("live-dz", dz.toFixed(1) + " m");
    else setText("live-dz", "–");

    if (requiredElev == null) {
      setText("live-elev-angle", "–");
    } else {
      const dir = requiredElev > 0 ? "up" : requiredElev < 0 ? "down" : "level";
      setText(
        "live-elev-angle",
        `${Math.abs(requiredElev).toFixed(1)}° ${dir}`
      );
    }

    // Pitch
    let pitchMapped = null;
    if (s.lastPitchRaw != null) {
      pitchMapped = AP.clamp(
        s.pitchSign * s.lastPitchRaw + s.pitchZeroOffset,
        -90,
        90
      );
    }

    setText(
      "live-pitch",
      pitchMapped != null ? pitchMapped.toFixed(1) + "°" : "–"
    );

    // Tilt guidance
    let elOk = false;
    let deltaEl = 0;
    if (requiredElev == null || pitchMapped == null) {
      setText("live-tilt", "–");
    } else {
      deltaEl = requiredElev - pitchMapped;
      const deadEl = 2;
      elOk = Math.abs(deltaEl) <= deadEl;
      if (elOk) {
        setText("live-tilt", `On angle (±${deadEl}°)`);
      } else {
        setText(
          "live-tilt",
          `Tilt ${deltaEl > 0 ? "up" : "down"} ${Math.abs(deltaEl).toFixed(
            1
          )}°`
        );
      }
    }

    // Canvas CSS
    const c1 = document.getElementById("compass");
    const c2 = document.getElementById("compass-elev");
    if (c1) c1.classList.toggle("on-target", azOk);
    if (c2) c2.classList.toggle("on-target", elOk);

    // Draw canvases
    if (heading != null) {
      Compass.draw({
        bearing,
        heading,
        azOk,
        deltaAz,
      });
    } else {
      Compass.draw(null);
    }

    if (requiredElev != null && pitchMapped != null) {
      ElevGauge.draw({
        required: requiredElev,
        pitch: pitchMapped,
        elOk,
        delta: deltaEl,
      });
    } else {
      ElevGauge.draw(null);
    }
  };

  // ------------- INIT -------------

  window.addEventListener("DOMContentLoaded", () => {
    Compass.init();
    ElevGauge.init();
    AP.scheduleUpdate();
  });
})();
