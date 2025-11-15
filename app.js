// app.js
(function () {
  "use strict";

  // Show JS errors in the Live pill for debugging
  window.addEventListener("error", (e) => {
    try {
      const el = document.querySelector("#live-status");
      if (el) el.textContent = "JS error: " + e.message;
    } catch {}
  });

  // In this static version we always just use document as root
  const root = () => document;
  const q = (sel) => root().querySelector(sel);

  const setLiveStatus = (msg) => {
    const el = q("#live-status");
    if (el) el.textContent = msg;
  };
  const setSensorStatus = (msg) => {
    const el = q("#sensor-status");
    if (el) el.textContent = msg;
  };
  const setMapStatus = (msg) => {
    const el = q("#map-status");
    if (el) el.textContent = msg;
  };

  // --- App state ---
  const AP = (window.APTool = window.APTool || {});
  AP.currentGPS = null;
  AP.currentTarget = null;
  AP.currentOrientation = null;

  AP.headingOffset = 0; // calibration offset for heading (deg)
  AP.pitchZeroOffset = 0; // offset so "quick level" makes current pitch = 0
  AP.calibration = {
    version: 2,
    pitchSign: 1, // flip if a device reports pitch inverted
  };

  AP.settings = {
    applyDeclination: true,
    manualDeclination: 0,
    multiElev: true,
    elevAgg: "mean",
    lockManualElev: false,
    altMode: "dem", // "dem", "gps", "manual"
    manualObserverElev: 0,
    instrumentHeight: 1.5,
    gpsGeoidOffset: 0,
  };

  AP.elevationSources = {
    openMeteo: null,
    openElevation: null,
    openTopoSRTM: null,
    aggregate: null,
    method: "mean",
    disagree: false,
    errors: [],
  };
  AP.observerSources = {
    openMeteo: null,
    openElevation: null,
    openTopoSRTM: null,
    aggregate: null,
    method: "mean",
    disagree: false,
    errors: [],
    lastLat: null,
    lastLon: null,
  };

  // Caches for DEM lookups (rounded ~11m)
  AP._elevCache = new Map();
  AP._obsCache = new Map();

  AP._rafPending = false;
  AP._gpsWatchId = null;
  AP.lastHeadingRaw = null;
  AP.lastPitchRaw = null;
  AP.lastAlpha = null;

  const css =
    typeof window !== "undefined"
      ? getComputedStyle(document.documentElement)
      : null;

  const COLORS = {
    bg: css ? (css.getPropertyValue("--bg") || "#020617").trim() : "#020617",
    card: css ? (css.getPropertyValue("--card") || "#0b1220").trim() : "#0b1220",
    ink: css ? (css.getPropertyValue("--ink") || "#e5e7eb").trim() : "#e5e7eb",
    muted: css ? (css.getPropertyValue("--muted") || "#94a3b8").trim() : "#94a3b8",
    accent: css ? (css.getPropertyValue("--accent") || "#38bdf8").trim() : "#38bdf8",
    ok: css ? (css.getPropertyValue("--ok") || "#22c55e").trim() : "#22c55e",
    warn: css ? (css.getPropertyValue("--warn") || "#f59e0b").trim() : "#f59e0b",
    vio: css ? (css.getPropertyValue("--vio") || "#a855f7").trim() : "#a855f7",
    line: css
      ? (css.getPropertyValue("--line") || "rgba(148,163,184,.2)").trim()
      : "rgba(148,163,184,.2)",
  };

  // --- Math helpers ---
  const deg2rad = (d) => (d * Math.PI) / 180;
  const rad2deg = (r) => (r * 180) / Math.PI;
  const norm360 = (d) => ((d % 360) + 360) % 360;
  const wrap180 = (d) => {
    let x = ((d + 180) % 360) - 180;
    return x < -180 ? x + 360 : x;
  };
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const ema = (prev, next, alpha = 0.25) =>
    prev == null ? next : alpha * next + (1 - alpha) * prev;

  const round90 = (a) => Math.round(norm360(a) / 90) * 90;
  const screenAngle = () => {
    const so = screen.orientation;
    if (so && typeof so.angle === "number") return so.angle;
    if (typeof window.orientation === "number") return window.orientation || 0;
    return 0;
  };

  const cacheKey = (lat, lon) => `${lat.toFixed(4)},${lon.toFixed(4)}`;

  // Vincenty with fallback (patched to avoid ** operator)
  function vincentyInverse(lat1, lon1, lat2, lon2) {
    const a = 6378137.0,
      f = 1 / 298.257223563,
      b = a * (1 - f);
    const φ1 = deg2rad(lat1),
      φ2 = deg2rad(lat2),
      L = deg2rad(lon2 - lon1);
    const U1 = Math.atan((1 - f) * Math.tan(φ1));
    const U2 = Math.atan((1 - f) * Math.tan(φ2));
    const sinU1 = Math.sin(U1),
      cosU1 = Math.cos(U1);
    const sinU2 = Math.sin(U2),
      cosU2 = Math.cos(U2);

    let λ = L,
      λP,
      iter = 0;
    let sinλ, cosλ, sinσ, cosσ, σ, sinα, cos2α, cos2σm, C;

    do {
      sinλ = Math.sin(λ);
      cosλ = Math.cos(λ);

      const term1 = cosU2 * sinλ;
      const term2 = cosU1 * sinU2 - sinU1 * cosU2 * cosλ;
      sinσ = Math.sqrt(term1 * term1 + term2 * term2);

      if (sinσ === 0) return { distance: 0, initialBearing: 0 };
      cosσ = sinU1 * sinU2 + cosU1 * cosU2 * cosλ;
      σ = Math.atan2(sinσ, cosσ);
      sinα = (cosU1 * cosU2 * sinλ) / sinσ;
      cos2α = 1 - sinα * sinα;
      cos2σm = cos2α === 0 ? 0 : cosσ - (2 * sinU1 * sinU2) / cos2α;
      C = (f / 16) * cos2α * (4 + f * (4 - 3 * cos2α));
      λP = λ;
      λ =
        L +
        (1 - C) *
          f *
          sinα *
          (σ +
            C *
              sinσ *
              (cos2σm +
                C * cosσ * (-1 + 2 * cos2σm * cos2σm)));
    } while (Math.abs(λ - λP) > 1e-12 && ++iter < 200);

    if (iter >= 200 || !isFinite(λ)) return null;

    const uSq = (cos2α * (a * a - b * b)) / (b * b);
    const A =
      1 +
      (uSq / 16384) *
        (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
    const B =
      (uSq / 1024) *
      (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
    const Δσ =
      B *
      sinσ *
      (cos2σm +
        (B / 4) *
          (cosσ * (-1 + 2 * cos2σm * cos2σm) -
            (B / 6) *
              cos2σm *
              (-3 + 4 * sinσ * sinσ) *
              (-3 + 4 * cos2σm * cos2σm)));

    const s = b * A * (σ - Δσ);
    let α1 = Math.atan2(
      cosU2 * sinλ,
      cosU1 * sinU2 - sinU1 * cosU2 * cosλ
    );
    return { distance: s, initialBearing: norm360(rad2deg(α1)) };
  }

  function fallbackBearing(lat1, lon1, lat2, lon2) {
    const φ1 = deg2rad(lat1),
      φ2 = deg2rad(lat2);
    const dφ = deg2rad(lat2 - lat1);
    const dλ = deg2rad(lon2 - lon1);

    const y = Math.sin(dλ) * Math.cos(φ2);
    const x =
      Math.cos(φ1) * Math.sin(φ2) -
      Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
    const θ = Math.atan2(y, x);
    const R = 6371000;
    const sinHalfDφ = Math.sin(dφ / 2);
    const sinHalfDλ = Math.sin(dλ / 2);
    const a =
      sinHalfDφ * sinHalfDφ +
      Math.cos(φ1) *
        Math.cos(φ2) *
        sinHalfDλ *
        sinHalfDλ;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const dist = R * c;
    return { distance: dist, initialBearing: norm360(rad2deg(θ)) };
  }

  // --- Simple declination model (just needs to be roughly right) ---
  function declinationDeg(lat, lon) {
    if (lat == null || lon == null) return 0;
    const g10 = -29404.8,
      g11 = -1450.9,
      h11 = 4652.5;
    const θ = deg2rad(90 - lat);
    const φ = deg2rad(lon);
    const cosθ = Math.cos(θ),
      sinθ = Math.sin(θ);
    const cosφ = Math.cos(φ),
      sinφ = Math.sin(φ);

    const Br =
      -2 *
      (g10 * cosθ +
        g11 * sinθ * cosφ +
        h11 * sinθ * sinφ);
    const Bθ =
      -(-g10 * sinθ +
        g11 * cosθ * cosφ +
        h11 * cosθ * sinφ);
    const Bφ = -(-g11 * sinφ + h11 * cosφ);

    const X = -Bθ;
    const Y = Bφ;
    return rad2deg(Math.atan2(Y, X));
  }

  // --- Drawing helpers ---
  const Compass = {
    el: null,
    ctx: null,
    w: 0,
    h: 0,
    lastState: null,
    init() {
      this.el = q("#compass");
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
      this.draw(this.lastState || {});
    },
    draw(state) {
      this.lastState = state || {};
      if (!this.ctx || !this.el) return;
      const ctx = this.ctx;
      const w = this.el.width;
      const h = this.el.height;
      ctx.clearRect(0, 0, w, h);
      if (!w || !h) return;

      const cx = w / 2;
      const cy = h / 2;
      const r = Math.min(w, h) / 2 - 14;

      // Background circle
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.card;
      ctx.fill();
      ctx.strokeStyle = COLORS.line;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Tick marks
      for (let d = 0; d < 360; d += 30) {
        const inner = r - 10;
        const outer = r;
        const ang = deg2rad(d);
        const sx = cx + inner * Math.sin(ang);
        const sy = cy - inner * Math.cos(ang);
        const ex = cx + outer * Math.sin(ang);
        const ey = cy - outer * Math.cos(ang);
        ctx.strokeStyle = COLORS.line;
        ctx.lineWidth = d % 90 === 0 ? 2.2 : 1;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }

      // Cardinal labels
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const labels = [
        ["N", 0],
        ["E", 90],
        ["S", 180],
        ["W", 270],
      ];
      for (const [txt, deg] of labels) {
        const ang = deg2rad(deg);
        const rr = r - 22;
        const x = cx + rr * Math.sin(ang);
        const y = cy - rr * Math.cos(ang);
        ctx.fillText(txt, x, y);
      }

      if (state.bearing == null || state.heading == null) {
        ctx.fillStyle = COLORS.muted;
        ctx.font = "12px system-ui, -apple-system, sans-serif";
        ctx.fillText("Need heading + target", cx, cy);
        return;
      }

      const bearing = state.bearing;
      const heading = state.heading;
      const azOk = !!state.azOk;
      const delta = state.deltaAz || 0;

      const drawArrow = (deg, color, lengthOffset) => {
        const ang = deg2rad(deg);
        const rr = r - 28;
        const x2 = cx + rr * Math.sin(ang);
        const y2 = cy - rr * Math.cos(ang);
        const x1 = cx + (rr - lengthOffset) * Math.sin(ang);
        const y1 = cy - (rr - lengthOffset) * Math.cos(ang);

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        const headLen = 7;
        const leftAng = ang + deg2rad(150);
        const rightAng = ang - deg2rad(150);
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

      const targetColor = azOk ? COLORS.ok : COLORS.warn;
      const headingColor = azOk ? COLORS.ok : COLORS.accent;

      // target = bearing
      drawArrow(bearing, targetColor, 16);
      // phone heading
      drawArrow(heading, headingColor, 26);

      // Center label
      ctx.fillStyle = azOk ? COLORS.ok : COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const centerText = azOk
        ? "On azimuth"
        : delta > 0
        ? "Turn right"
        : "Turn left";
      ctx.fillText(centerText, cx, cy + r * 0.55);
    },
  };

  const ElevGauge = {
    el: null,
    ctx: null,
    w: 0,
    h: 0,
    lastState: null,
    init() {
      this.el = q("#compass-elev");
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
      this.draw(this.lastState || {});
    },
    draw(state) {
      this.lastState = state || {};
      if (!this.ctx || !this.el) return;
      const ctx = this.ctx;
      const w = this.el.width;
      const h = this.el.height;
      ctx.clearRect(0, 0, w, h);
      if (!w || !h) return;

      const padX = 18;
      const midY = h / 2;
      const minDeg = -60;
      const maxDeg = 60;

      const xFor = (a) => {
        const v = clamp(a, minDeg, maxDeg);
        const t = (v - minDeg) / (maxDeg - minDeg);
        return padX + t * (w - 2 * padX);
      };

      // Background
      ctx.fillStyle = COLORS.card;
      ctx.fillRect(0, 0, w, h);

      // Axis line
      ctx.strokeStyle = COLORS.line;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(padX, midY);
      ctx.lineTo(w - padX, midY);
      ctx.stroke();

      // Ticks at -60, -30, 0, 30, 60
      ctx.fillStyle = COLORS.muted;
      ctx.font = "10px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      for (let d = -60; d <= 60; d += 30) {
        const x = xFor(d);
        const tickH = d === 0 ? 10 : 6;
        ctx.beginPath();
        ctx.moveTo(x, midY - tickH / 2);
        ctx.lineTo(x, midY + tickH / 2);
        ctx.stroke();

        ctx.fillText(`${d}°`, x, midY + tickH / 2 + 3);
      }

      if (state.required == null || state.pitch == null) {
        ctx.fillStyle = COLORS.muted;
        ctx.font = "12px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(
          "Need target elevation + pitch",
          w / 2,
          midY - 4
        );
        return;
      }

      const req = state.required;
      const pitch = state.pitch;
      const elOk = !!state.elOk;

      const xReq = xFor(req);
      const xPitch = xFor(pitch);

      // Required elevation marker
      ctx.strokeStyle = elOk ? COLORS.ok : COLORS.warn;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(xReq, midY - 18);
      ctx.lineTo(xReq, midY + 18);
      ctx.stroke();

      // Pitch marker
      ctx.strokeStyle = elOk ? COLORS.ok : COLORS.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xPitch, midY - 14);
      ctx.lineTo(xPitch, midY + 14);
      ctx.stroke();

      // Center label
      ctx.fillStyle = elOk ? COLORS.ok : COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      const delta = state.delta || 0;
      const txt = elOk
        ? "On elevation"
        : delta > 0
        ? "Tilt up"
        : "Tilt down";
      ctx.fillText(txt, w / 2, midY - 20);
    },
  };

  // --- Elevation helpers (multi-source) ---
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function fetchJSON(url, abortCtl, timeoutMs = 7000) {
    const to = setTimeout(() => abortCtl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { signal: abortCtl.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally {
      clearTimeout(to);
    }
  }

  async function tryProvider(name, fn, attempts = 2) {
    const errors = [];
    for (let i = 1; i <= attempts; i++) {
      try {
        const value = await fn();
        if (typeof value === "number" && isFinite(value)) {
          return { value, errors };
        }
      } catch (e) {
        errors.push(name + "#" + i + ": " + (e.message || e));
      }
      await sleep(200 * i * i);
    }
    return { value: null, errors };
  }

  async function fetchOpenElevation(lat, lon, slot) {
    const ctl = new AbortController();
    AP[slot] = ctl;
    const j = await fetchJSON(
      "https://api.open-elevation.com/api/v1/lookup?locations=" +
        lat +
        "," +
        lon,
      ctl
    );
    let h = null;
    try {
      if (j && j.results && j.results.length > 0) {
        h = j.results[0].elevation;
      }
    } catch {}
    return typeof h === "number" ? h : null;
  }

  async function fetchOpenTopoSRTM(lat, lon, slot) {
    const ctl = new AbortController();
    AP[slot] = ctl;
    const j = await fetchJSON(
      "https://api.opentopodata.org/v1/srtm90m?locations=" +
        lat +
        "," +
        lon,
      ctl
    );
    let h = null;
    try {
      if (j && j.results && j.results.length > 0) {
        h = j.results[0].elevation;
      }
    } catch {}
    return typeof h === "number" ? h : null;
  }

  async function fetchOpenMeteoElevation(lat, lon, slot) {
    const ctl = new AbortController();
    AP[slot] = ctl;
    const j = await fetchJSON(
      "https://api.open-meteo.com/v1/elevation?latitude=" +
        lat +
        "&longitude=" +
        lon,
      ctl
    );
    let h = null;
    try {
      if (j && Array.isArray(j.elevation) && j.elevation.length > 0) {
        h = j.elevation[0];
      }
    } catch {}
    return typeof h === "number" ? h : null;
  }

  function aggregateElev(vals, method) {
    const xs = vals.filter(function (v) {
      return typeof v === "number" && isFinite(v);
    });
    if (!xs.length) return null;
    if (method === "median") {
      const s = xs.slice().sort(function (a, b) {
        return a - b;
      });
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }
    const sum = xs.reduce(function (a, b) {
      return a + b;
    }, 0);
    return sum / xs.length;
  }

  function updateTargetJSON() {
    const el = q("#target-json");
    if (el) {
      el.value = AP.currentTarget
        ? JSON.stringify(AP.currentTarget)
        : "";
    }
  }

  function applyTargetElevation(lat, lon, pack) {
    if (!AP.currentTarget) AP.currentTarget = { lat: lat, lon: lon, elev: null };
    AP.currentTarget.lat = lat;
    AP.currentTarget.lon = lon;

    const agg = pack.agg;
    const values = pack.values || [null, null, null];
    const method = pack.method || AP.settings.elevAgg || "mean";
    const disagree = !!pack.disagree;
    const errs = pack.errs || [];
    const om = values[0];
    const oe = values[1];
    const ot = values[2];

    AP.elevationSources = {
      openMeteo: om,
      openElevation: oe,
      openTopoSRTM: ot,
      aggregate: agg,
      method: method,
      disagree: disagree,
      errors: errs,
    };

    // Only auto-apply DEM elevation if not locked
    if (!AP.settings.lockManualElev) {
      const firstNonNull =
        om != null
          ? om
          : oe != null
          ? oe
          : ot != null
          ? ot
          : null;
      AP.currentTarget.elev = agg != null ? agg : firstNonNull;
    }

    const latEl = q("#target-lat");
    const lonEl = q("#target-lon");
    const elevEl = q("#target-elev");
    const srcEl = q("#target-elev-src");
    const status = q("#target-status");

    if (latEl) latEl.textContent = lat.toFixed(6);
    if (lonEl) lonEl.textContent = lon.toFixed(6);
    if (elevEl)
      elevEl.textContent =
        AP.currentTarget.elev != null
          ? AP.currentTarget.elev.toFixed(1)
          : "–";

    const srcLabel = (function () {
      if (AP.settings.lockManualElev) return "manual (locked)";
      if (agg != null)
        return disagree ? "avg (" + method + ", ⚠︎)" : "avg (" + method + ")";
      if (om != null || oe != null || ot != null)
        return "single source";
      return "–";
    })();
    if (srcEl) srcEl.textContent = srcLabel;
    if (status) status.textContent = "Target set";

    // Target elevation panel
    const srcBox = q("#elev-sources");
    const errBox = q("#elev-errors");

    const parts = [];
    if (om != null) parts.push("Open-Meteo " + om.toFixed(1) + " m");
    if (oe != null) parts.push("Open-Elevation " + oe.toFixed(1) + " m");
    if (ot != null) parts.push("OpenTopo " + ot.toFixed(1) + " m");
    if (agg != null)
      parts.push(
        "→ " +
          method +
          " " +
          agg.toFixed(1) +
          " m" +
          (disagree ? " (⚠︎)" : "")
      );

    if (srcBox) {
      srcBox.textContent = parts.length
        ? parts.join(" · ")
        : "No elevation from providers.";
      srcBox.classList.toggle("warn", disagree);
    }
    if (errBox) {
      if (parts.length === 0) {
        errBox.style.display = "";
        errBox.textContent =
          "All providers failed. Enter manual elevation. Details: " +
          errs.slice(-3).join(" · ");
      } else {
        errBox.style.display = "none";
      }
    }

    setMapStatus(
      parts.length ? parts.join(" · ") : "Elevation unavailable."
    );
    updateTargetJSON();
    scheduleUpdate();
  }

  async function fetchElevationMulti(lat, lon) {
    const key = cacheKey(lat, lon);
    if (AP._elevCache.has(key)) {
      const cached = AP._elevCache.get(key);
      applyTargetElevation(lat, lon, cached);
      return;
    }

    setMapStatus("Getting elevation…");
    const errs = [];
    const useMulti = AP.settings.multiElev;

    const r1 = await tryProvider("Open-Meteo", function () {
      return fetchOpenMeteoElevation(lat, lon, "_elevAbortOM");
    });
    errs.push.apply(errs, r1.errors);

    let r2 = { value: null, errors: [] },
      r3 = { value: null, errors: [] };
    if (useMulti) {
      r2 = await tryProvider("Open-Elevation", function () {
        return fetchOpenElevation(lat, lon, "_elevAbortOE");
      });
      errs.push.apply(errs, r2.errors);
      r3 = await tryProvider("OpenTopo SRTM", function () {
        return fetchOpenTopoSRTM(lat, lon, "_elevAbortOT");
      });
      errs.push.apply(errs, r3.errors);
    }

    const method = AP.settings.elevAgg || "mean";
    const values = [r1.value, r2.value, r3.value];
    const agg = aggregateElev(values, method);

    const nonNull = values.filter(function (v) {
      return v != null;
    });
    const disagree =
      nonNull.length >= 2 &&
      Math.max.apply(null, nonNull) -
        Math.min.apply(null, nonNull) >
        20;

    const pack = {
      agg: agg,
      values: values,
      method: method,
      disagree: disagree,
      errs: errs,
      sources: {
        openMeteo: r1.value,
        openElevation: r2.value,
        openTopoSRTM: r3.value,
      },
    };

    AP._elevCache.set(key, pack);
    applyTargetElevation(lat, lon, pack);
  }

  async function fetchObserverDEM(lat, lon) {
    const key = cacheKey(lat, lon);
    if (AP._obsCache.has(key)) {
      AP.observerSources = AP._obsCache.get(key);
      scheduleUpdate();
      return;
    }

    const errs = [];
    const useMulti = AP.settings.multiElev;

    const r1 = await tryProvider("Open-Meteo", function () {
      return fetchOpenMeteoElevation(lat, lon, "_obsAbortOM");
    });
    errs.push.apply(errs, r1.errors);

    let r2 = { value: null, errors: [] },
      r3 = { value: null, errors: [] };
    if (useMulti) {
      r2 = await tryProvider("Open-Elevation", function () {
        return fetchOpenElevation(lat, lon, "_obsAbortOE");
      });
      errs.push.apply(errs, r2.errors);
      r3 = await tryProvider("OpenTopo SRTM", function () {
        return fetchOpenTopoSRTM(lat, lon, "_obsAbortOT");
      });
      errs.push.apply(errs, r3.errors);
    }

    const method = AP.settings.elevAgg || "mean";
    const values = [r1.value, r2.value, r3.value];
    const agg = aggregateElev(values, method);
    const nonNull = values.filter(function (v) {
      return v != null;
    });
    const disagree =
      nonNull.length >= 2 &&
      Math.max.apply(null, nonNull) -
        Math.min.apply(null, nonNull) >
        20;

    const pack = {
      openMeteo: r1.value,
      openElevation: r2.value,
      openTopoSRTM: r3.value,
      aggregate: agg,
      method: method,
      disagree: disagree,
      errors: errs,
      lastLat: lat,
      lastLon: lon,
    };

    AP._obsCache.set(key, pack);
    AP.observerSources = pack;
    scheduleUpdate();
  }

  function needObserverRefetch(lat, lon) {
    const L = AP.observerSources;
    if (L.lastLat == null || L.lastLon == null) return true;
    const dLat = Math.abs(lat - L.lastLat);
    const dLon = Math.abs(lon - L.lastLon);
    return dLat > 0.0005 || dLon > 0.0005; // ~55 m threshold
  }

  // --- Orientation helpers ---
  function compassFromEvent(ev) {
    if (!ev) return { heading: null, source: null };
    if (
      typeof ev.webkitCompassHeading === "number" &&
      !Number.isNaN(ev.webkitCompassHeading)
    ) {
      // iOS Safari gives degrees clockwise from magnetic north
      return {
        heading: norm360(ev.webkitCompassHeading),
        source: "iOS compass",
      };
    }
    if (
      ev.absolute === true &&
      typeof ev.alpha === "number" &&
      !Number.isNaN(ev.alpha)
    ) {
      // Absolute orientation
      return {
        heading: norm360(ev.alpha + screenAngle()),
        source: "absolute orientation",
      };
    }
    if (typeof ev.alpha === "number") {
      return { heading: null, source: "relative orientation" };
    }
    return { heading: null, source: null };
  }

  // Pitch: TOP of phone up toward the sky = positive
  const estimatePitchRaw = (beta, gamma) => {
    const s = round90(screenAngle());
    if (beta == null && gamma == null) return null;

    if (s === 0) {
      // Portrait
      return clamp(beta || 0, -90, 90);
    } else if (s === 180) {
      // Upside-down portrait
      return clamp(-(beta || 0), -90, 90);
    } else if (s === 90) {
      // Landscape (buttons on left)
      return clamp(gamma || 0, -90, 90);
    } else if (s === 270) {
      // Landscape (buttons on right)
      return clamp(-(gamma || 0), -90, 90);
    }
    // Fallback treat as portrait
    return clamp(beta || 0, -90, 90);
  };

  // --- Main update loop ---
  function update() {
    AP._rafPending = false;

    const gps = AP.currentGPS;
    const tgt = AP.currentTarget;

    const azEl = q("#live-azimuth");
    const headEl = q("#live-heading");
    const turnEl = q("#live-turn");
    const distEl = q("#live-distance");
    const elevEl = q("#live-elev-angle");
    const pitchEl = q("#live-pitch");
    const tiltEl = q("#live-tilt");
    const declEl = q("#live-decl");
    const obsEl = q("#live-obs-elev");
    const dzEl = q("#live-dz");
    const declPrev = q("#settings-decl-preview");
    const altPrev = q("#settings-alt-preview");

    // Declination model + manual offset
    let Dmodel = null,
      Dman = AP.settings.manualDeclination || 0,
      Dtot = null;
    if (gps && typeof gps.lat === "number" && typeof gps.lon === "number") {
      Dmodel = declinationDeg(gps.lat, gps.lon);
      Dtot = (Dmodel || 0) + Dman;
      if (declEl) {
        declEl.textContent = Dtot.toFixed(1) + "° " +
          (AP.settings.applyDeclination ? "(applied)" : "(off)");
      }
      if (declPrev) {
        declPrev.textContent =
          "Decl: model " +
          Dmodel.toFixed(1) +
          "° + manual " +
          Dman.toFixed(1) +
          "° = " +
          Dtot.toFixed(1) +
          "°";
      }
    } else {
      if (declEl) declEl.textContent = "–";
      if (declPrev)
        declPrev.textContent = "Declination: waiting for GPS…";
    }

    if (!gps || !tgt) {
      setLiveStatus("Need GPS fix + target point.");
      const allEls = [
        azEl,
        headEl,
        turnEl,
        distEl,
        elevEl,
        pitchEl,
        tiltEl,
        obsEl,
        dzEl,
      ];
      for (let i = 0; i < allEls.length; i++) {
        const el = allEls[i];
        if (el) el.textContent = "–";
      }
      Compass.draw({});
      ElevGauge.draw({});
      const compassCanvas = q("#compass");
      const elevCanvas = q("#compass-elev");
      if (compassCanvas)
        compassCanvas.classList.remove("on-target");
      if (elevCanvas) elevCanvas.classList.remove("on-target");
      return;
    }

    // DEM for observer if needed
    if (
      AP.settings.altMode === "dem" &&
      typeof gps.lat === "number" &&
      typeof gps.lon === "number" &&
      needObserverRefetch(gps.lat, gps.lon)
    ) {
      fetchObserverDEM(gps.lat, gps.lon);
    }

    // Distance & bearing to target
    const inv =
      vincentyInverse(gps.lat, gps.lon, tgt.lat, tgt.lon) ||
      fallbackBearing(gps.lat, gps.lon, tgt.lat, tgt.lon);

    const bearing = inv.initialBearing;
    const dist = inv.distance;

    if (azEl) azEl.textContent = bearing.toFixed(1);
    if (distEl)
      distEl.textContent =
        dist >= 1000
          ? (dist / 1000).toFixed(3) + " km"
          : dist.toFixed(1) + " m";

    // Heading from GPS and/or orientation
    let heading = null;
    let headingSrc = "";

    if (
      typeof gps.heading === "number" &&
      !Number.isNaN(gps.heading)
    ) {
      // Only trust GPS heading when actually moving
      if (gps.speed != null && gps.speed > 0.5) {
        heading = norm360(gps.heading);
        headingSrc = "GPS";
      }
    }

    if (AP.lastHeadingRaw != null) {
      let h = AP.lastHeadingRaw;
      if (AP.settings.applyDeclination && Dtot != null) {
        h = norm360(h + Dtot);
      }
      h = norm360(h + AP.headingOffset);
      heading = h;
      headingSrc = "orientation" +
        (AP.settings.applyDeclination ? "+decl" : "");
    }

    let azOk = false;
    let deltaAz = 0;

    if (heading == null) {
      if (headEl) headEl.textContent = "–";
      if (turnEl) turnEl.textContent = "Move a bit or calibrate.";
      setLiveStatus("No heading yet (move or calibrate).");
    } else {
      if (headEl)
        headEl.textContent =
          heading.toFixed(1) + "° (" + headingSrc + ")";
      deltaAz = wrap180(bearing - heading);
      const dead = 5;
      azOk = Math.abs(deltaAz) < dead;
      if (turnEl) {
        if (azOk) {
          turnEl.textContent = "On target (±" + dead + "°)";
        } else {
          turnEl.textContent =
            "Turn " +
            (deltaAz > 0 ? "right" : "left") +
            " " +
            Math.abs(deltaAz).toFixed(1) +
            "°";
        }
      }
      setLiveStatus(
        azOk ? "Azimuth on target." : "Align azimuth to target."
      );
    }

    // Observer elevation
    let obsElev = null;
    let obsSrc = "–";
    if (AP.settings.altMode === "dem") {
      const agg = AP.observerSources.aggregate;
      if (agg != null) {
        obsElev = agg;
        obsSrc = AP.observerSources.disagree
          ? "DEM avg (" + AP.observerSources.method + ", ⚠︎)"
          : "DEM avg (" + AP.observerSources.method + ")";
      }
    } else if (AP.settings.altMode === "gps") {
      if (typeof gps.alt === "number" && isFinite(gps.alt)) {
        obsElev = gps.alt + (AP.settings.gpsGeoidOffset || 0);
        obsSrc = "GPS alt + offset";
      }
    } else if (AP.settings.altMode === "manual") {
      obsElev = AP.settings.manualObserverElev;
      obsSrc = "manual obs elev";
    }

    if (obsElev != null) {
      obsElev += AP.settings.instrumentHeight || 0;
    }

    if (obsEl) {
      obsEl.textContent =
        obsElev != null ? obsElev.toFixed(1) + " m" : "–";
    }
    if (altPrev) {
      altPrev.textContent =
        "Alt mode: " +
        AP.settings.altMode.toUpperCase() +
        " · Obs=" +
        (obsElev != null ? obsElev.toFixed(1) + " m" : "–") +
        " (" +
        obsSrc +
        ") · Hinst=" +
        (AP.settings.instrumentHeight || 0).toFixed(1) +
        " m";
    }

    // Required elevation angle between observer and target
    const te = tgt.elev;
    let requiredElev = null;
    let dz = null;

    if (te != null && obsElev != null && dist > 1) {
      dz = te - obsElev; // positive if target higher
      requiredElev = rad2deg(Math.atan2(dz, dist)); // deg, positive = up
    }

    if (dzEl) {
      dzEl.textContent =
        dz != null ? dz.toFixed(1) + " m" : "–";
    }
    if (elevEl) {
      if (requiredElev == null) {
        elevEl.textContent = "–";
      } else {
        const dir =
          requiredElev > 0
            ? "up"
            : requiredElev < 0
            ? "down"
            : "level";
        elevEl.textContent =
          Math.abs(requiredElev).toFixed(1) + "° " + dir;
      }
    }

    // Pitch
    const pitchMapped =
      AP.lastPitchRaw == null
        ? null
        : clamp(
            AP.calibration.pitchSign * AP.lastPitchRaw +
              AP.pitchZeroOffset,
            -90,
            90
          );

    if (pitchEl) {
      pitchEl.textContent =
        pitchMapped != null
          ? pitchMapped.toFixed(1) + "°"
          : "–";
    }

    // Tilt guidance
    let elOk = false;
    let dp = 0;
    if (requiredElev == null || pitchMapped == null) {
      if (tiltEl) tiltEl.textContent = "–";
    } else {
      dp = requiredElev - pitchMapped;
      const deadEl = 2;
      elOk = Math.abs(dp) <= deadEl;
      if (tiltEl) {
        if (elOk) {
          tiltEl.textContent = "On angle (±" + deadEl + "°)";
        } else {
          tiltEl.textContent =
            "Tilt " +
            (dp > 0 ? "up" : "down") +
            " " +
            Math.abs(dp).toFixed(1) +
            "°";
        }
      }
    }

    // Canvas highlight on-target
    const compassCanvas = q("#compass");
    const elevCanvas = q("#compass-elev");
    if (compassCanvas)
      compassCanvas.classList.toggle("on-target", azOk);
    if (elevCanvas)
      elevCanvas.classList.toggle("on-target", elOk);

    // Draw gauges
    Compass.draw({
      bearing: bearing,
      heading: heading,
      azOk: azOk,
      deltaAz: deltaAz,
    });
    ElevGauge.draw({
      required: requiredElev,
      pitch: pitchMapped,
      elOk: elOk,
      delta: dp,
    });
  }

  function scheduleUpdate() {
    if (AP._rafPending) return;
    AP._rafPending = true;
    requestAnimationFrame(update);
  }

  // --- Sensors ---
  function initSensors() {
    // GPS
    if (!("geolocation" in navigator)) {
      setSensorStatus("No geolocation support.");
    } else {
      try {
        if (AP._gpsWatchId != null) {
          navigator.geolocation.clearWatch(AP._gpsWatchId);
        }
        AP._gpsWatchId =
          navigator.geolocation.watchPosition(
            function (pos) {
              const c = pos.coords || {};
              const lat = c.latitude;
              const lon = c.longitude;
              const acc = c.accuracy;
              const spd = c.speed;
              const hdg = c.heading;
              const alt = c.altitude;

              AP.currentGPS = {
                lat: lat,
                lon: lon,
                acc: acc,
                speed: spd,
                heading: hdg,
                alt: alt,
              };

              const latEl = q("#gps-lat"),
                lonEl = q("#gps-lon"),
                accEl = q("#gps-acc");
              const spdEl = q("#gps-speed"),
                hdgEl = q("#gps-heading"),
                altEl = q("#gps-alt");
              const jsonEl = q("#gps-json");

              if (latEl)
                latEl.textContent =
                  lat != null ? lat.toFixed(6) : "–";
              if (lonEl)
                lonEl.textContent =
                  lon != null ? lon.toFixed(6) : "–";
              if (accEl)
                accEl.textContent =
                  acc != null ? acc.toFixed(1) : "–";
              if (spdEl)
                spdEl.textContent =
                  spd != null ? spd.toFixed(2) : "–";
              if (hdgEl)
                hdgEl.textContent =
                  typeof hdg === "number" && !Number.isNaN(hdg)
                    ? hdg.toFixed(1)
                    : "–";
              if (altEl)
                altEl.textContent =
                  alt != null ? alt.toFixed(1) : "–";
              if (jsonEl)
                jsonEl.value = JSON.stringify(AP.currentGPS);

              if (
                AP.settings.altMode === "dem" &&
                typeof lat === "number" &&
                typeof lon === "number"
              ) {
                if (needObserverRefetch(lat, lon)) {
                  fetchObserverDEM(lat, lon);
                }
              }

              setSensorStatus("GPS ok");
              scheduleUpdate();
            },
            function (err) {
              setSensorStatus("GPS error: " + err.message);
            },
            {
              enableHighAccuracy: true,
              maximumAge: 1000,
              timeout: 10000,
            }
          );
      } catch (e) {
        setSensorStatus("GPS init error: " + e.message);
      }
    }

    // Orientation
    const handleOrientation = function (ev) {
      const res = compassFromEvent(ev);
      const heading = res.heading;
      AP.currentOrientation = {
        alpha: ev.alpha != null ? ev.alpha : null,
        beta: ev.beta != null ? ev.beta : null,
        gamma: ev.gamma != null ? ev.gamma : null,
        absolute: ev.absolute != null ? ev.absolute : null,
      };
      AP.lastAlpha =
        typeof ev.alpha === "number" ? ev.alpha : null;

      if (heading != null) {
        AP.lastHeadingRaw = ema(AP.lastHeadingRaw, heading);
      }

      const estPitch = estimatePitchRaw(
        ev.beta != null ? ev.beta : null,
        ev.gamma != null ? ev.gamma : null
      );
      if (estPitch != null) {
        AP.lastPitchRaw = ema(AP.lastPitchRaw, estPitch);
      }

      const aEl = q("#ori-alpha"),
        bEl = q("#ori-beta"),
        gEl = q("#ori-gamma");
      const absEl = q("#ori-abs"),
        jsonEl = q("#ori-json");
      if (aEl)
        aEl.textContent =
          ev.alpha != null ? ev.alpha.toFixed(1) : "–";
      if (bEl)
        bEl.textContent =
          ev.beta != null ? ev.beta.toFixed(1) : "–";
      if (gEl)
        gEl.textContent =
          ev.gamma != null ? ev.gamma.toFixed(1) : "–";
      if (absEl)
        absEl.textContent =
          ev.absolute === true
            ? "true"
            : ev.absolute === false
            ? "false"
            : "unknown";
      if (jsonEl)
        jsonEl.value = JSON.stringify(AP.currentOrientation);

      setSensorStatus("Sensors running.");
      scheduleUpdate();
    };

    try {
      const DEV = window.DeviceOrientationEvent;
      if (DEV && typeof DEV.requestPermission === "function") {
        // iOS
        DEV.requestPermission()
          .then(function (state) {
            if (state === "granted") {
              window.addEventListener(
                "deviceorientation",
                handleOrientation,
                { passive: true }
              );
              setSensorStatus("Sensors running (iOS).");
            } else {
              setSensorStatus("Orientation denied on iOS.");
            }
          })
          .catch(function (err) {
            setSensorStatus(
              "Orientation error: " + err.message
            );
          });
      } else if (DEV) {
        window.addEventListener(
          "deviceorientation",
          handleOrientation,
          { passive: true }
        );
        setSensorStatus("Sensors running.");
      } else {
        setSensorStatus("No DeviceOrientation support.");
      }
    } catch (e) {
      setSensorStatus("Orientation init error: " + e.message);
    }
  }

  // --- Sheet helpers (map/settings/target) ---
  function openSheet(id) {
    const sh = q(id);
    if (sh) sh.classList.add("open");
  }
  function closeSheet(id) {
    const sh = q(id);
    if (sh) sh.classList.remove("open");
  }

  // --- Calibration helpers ---
  function calibrateToTarget() {
    const gps = AP.currentGPS;
    const tgt = AP.currentTarget;

    if (!gps || !tgt) {
      setLiveStatus(
        "Need GPS + target to calibrate to target."
      );
      return;
    }
    if (AP.lastHeadingRaw == null) {
      setLiveStatus(
        "No orientation heading yet; move/rotate phone first."
      );
      return;
    }

    let Dmodel = declinationDeg(gps.lat, gps.lon);
    let Dtot =
      (Dmodel || 0) + (AP.settings.manualDeclination || 0);

    const inv =
      vincentyInverse(gps.lat, gps.lon, tgt.lat, tgt.lon) ||
      fallbackBearing(gps.lat, gps.lon, tgt.lat, tgt.lon);
    const bearing = inv.initialBearing;

    // Base heading from raw sensor
    let h = AP.lastHeadingRaw;
    if (AP.settings.applyDeclination) {
      h = norm360(h + Dtot);
    }
    // Choose headingOffset so heading == bearing
    AP.headingOffset = wrap180(bearing - h);

    setLiveStatus("Calibrated heading to current target.");
    scheduleUpdate();
  }

  function quickLevel() {
    if (AP.lastPitchRaw == null) {
      setLiveStatus(
        "Move/tilt phone to get pitch before quick level."
      );
      return;
    }
    AP.pitchZeroOffset = -(
      AP.calibration.pitchSign * AP.lastPitchRaw
    );
    setLiveStatus(
      "Pitch zero set to current orientation."
    );
    scheduleUpdate();
  }

  function resetAxes() {
    AP.headingOffset = 0;
    AP.pitchZeroOffset = 0;
    AP.calibration.pitchSign = 1;
    setLiveStatus("Axes reset.");
    scheduleUpdate();
  }

  function axesFlipPitch() {
    AP.calibration.pitchSign *= -1;
    setLiveStatus(
      "Pitch axis " +
        (AP.calibration.pitchSign === 1 ? "normal" : "inverted") +
        "."
    );
    scheduleUpdate();
  }

  // --- Settings wiring ---
  function wireSettings() {
    const btnSettings = q("#btn-settings");
    const btnCloseSettings = q("#btn-close-settings");
    const toggleDecl = q("#toggle-decl");
    const manualDeclRange = q("#manual-decl-range");
    const manualDeclNumber = q("#manual-decl-number");
    const selectAltMode = q("#select-alt-mode");
    const inputInstH = q("#input-instrument-h");
    const inputManualObs = q("#input-manual-obs");
    const inputGeoidOffset = q("#input-geoid-offset");
    const toggleMultiElev = q("#toggle-multi-elev");
    const selectElevAgg = q("#select-elev-agg");

    if (btnSettings) {
      btnSettings.addEventListener("click", function () {
        // Sync toggles with state
        if (toggleDecl)
          toggleDecl.checked =
            !!AP.settings.applyDeclination;
        if (manualDeclRange)
          manualDeclRange.value = String(
            AP.settings.manualDeclination || 0
          );
        if (manualDeclNumber)
          manualDeclNumber.value = String(
            AP.settings.manualDeclination || 0
          );
        if (selectAltMode)
          selectAltMode.value = AP.settings.altMode;
        if (inputInstH)
          inputInstH.value = String(
            AP.settings.instrumentHeight || 1.5
          );
        if (inputManualObs)
          inputManualObs.value = String(
            AP.settings.manualObserverElev || 0
          );
        if (inputGeoidOffset)
          inputGeoidOffset.value = String(
            AP.settings.gpsGeoidOffset || 0
          );
        if (toggleMultiElev)
          toggleMultiElev.checked =
            !!AP.settings.multiElev;
        if (selectElevAgg)
          selectElevAgg.value =
            AP.settings.elevAgg || "mean";

        openSheet("#sheet-settings");
      });
    }
    if (btnCloseSettings) {
      btnCloseSettings.addEventListener("click", function () {
        closeSheet("#sheet-settings");
      });
    }

    if (toggleDecl) {
      toggleDecl.checked = true; // default on
      AP.settings.applyDeclination = true;
      toggleDecl.addEventListener("change", function () {
        AP.settings.applyDeclination = toggleDecl.checked;
        scheduleUpdate();
      });
    }

    function syncManualDecl(val) {
      const v = clamp(val, -30, 30);
      AP.settings.manualDeclination = v;
      if (manualDeclRange)
        manualDeclRange.value = String(v);
      if (manualDeclNumber)
        manualDeclNumber.value = String(v);
      scheduleUpdate();
    }

    if (manualDeclRange) {
      manualDeclRange.addEventListener("input", function (e) {
        syncManualDecl(parseFloat(e.target.value) || 0);
      });
    }
    if (manualDeclNumber) {
      manualDeclNumber.addEventListener("input", function (e) {
        syncManualDecl(parseFloat(e.target.value) || 0);
      });
    }

    if (selectAltMode) {
      selectAltMode.addEventListener("change", function () {
        AP.settings.altMode = selectAltMode.value;
        scheduleUpdate();
      });
    }

    if (inputInstH) {
      inputInstH.addEventListener("change", function () {
        const v = parseFloat(inputInstH.value);
        AP.settings.instrumentHeight = isFinite(v) ? v : 1.5;
        scheduleUpdate();
      });
    }
    if (inputManualObs) {
      inputManualObs.addEventListener("change", function () {
        const v = parseFloat(inputManualObs.value);
        AP.settings.manualObserverElev = isFinite(v)
          ? v
          : 0;
        scheduleUpdate();
      });
    }
    if (inputGeoidOffset) {
      inputGeoidOffset.addEventListener("change", function () {
        const v = parseFloat(inputGeoidOffset.value);
        AP.settings.gpsGeoidOffset = isFinite(v) ? v : 0;
        scheduleUpdate();
      });
    }

    function reconfigureElevCache() {
      AP._elevCache.clear();
      AP._obsCache.clear();
      // Re-fetch current target & observer if present
      if (
        AP.currentTarget &&
        typeof AP.currentTarget.lat === "number" &&
        typeof AP.currentTarget.lon === "number"
      ) {
        fetchElevationMulti(
          AP.currentTarget.lat,
          AP.currentTarget.lon
        );
      }
      const gps = AP.currentGPS;
      if (
        gps &&
        typeof gps.lat === "number" &&
        typeof gps.lon === "number" &&
        AP.settings.altMode === "dem"
      ) {
        fetchObserverDEM(gps.lat, gps.lon);
      }
    }

    if (toggleMultiElev) {
      toggleMultiElev.addEventListener("change", function () {
        AP.settings.multiElev = toggleMultiElev.checked;
        reconfigureElevCache();
      });
    }

    if (selectElevAgg) {
      selectElevAgg.addEventListener("change", function () {
        AP.settings.elevAgg = selectElevAgg.value;
        reconfigureElevCache();
      });
    }
  }

  // --- Target elevation panel wiring ---
  function wireTargetElevationPanel() {
    const btnEditTargetElev = q("#btn-edit-target-elev");
    const btnCloseTarget = q("#btn-close-target-elev");
    const btnElevSave = q("#btn-elev-save");
    const btnUseAvg = q("#btn-elev-use-avg");
    const btnUseGPS = q("#btn-elev-use-gps");
    const toggleLockElev = q("#toggle-lock-elev");
    const editInput = q("#edit-target-elev");
    const retryBtn = q("#btn-retry-elev");

    if (btnEditTargetElev) {
      btnEditTargetElev.addEventListener("click", function () {
        if (editInput) {
          const val =
            AP.currentTarget && AP.currentTarget.elev != null
              ? AP.currentTarget.elev
              : 0;
          editInput.value = String(
            val.toFixed ? val.toFixed(1) : val
          );
        }
        openSheet("#sheet-target-elev");
      });
    }
    if (btnCloseTarget) {
      btnCloseTarget.addEventListener("click", function () {
        closeSheet("#sheet-target-elev");
      });
    }

    if (btnElevSave && editInput) {
      btnElevSave.addEventListener("click", function () {
        const v = parseFloat(editInput.value);
        if (!AP.currentTarget)
          AP.currentTarget = {
            lat: null,
            lon: null,
            elev: null,
          };
        if (!isFinite(v)) {
          setLiveStatus("Invalid manual elevation.");
          return;
        }
        AP.currentTarget.elev = v;
        AP.settings.lockManualElev = !!(
          toggleLockElev && toggleLockElev.checked
        );

        const elevEl = q("#target-elev");
        const srcEl = q("#target-elev-src");
        if (elevEl) elevEl.textContent = v.toFixed(1);
        if (srcEl) {
          srcEl.textContent = AP.settings.lockManualElev
            ? "manual (locked)"
            : "manual";
        }
        updateTargetJSON();
        scheduleUpdate();
      });
    }

    if (btnUseAvg) {
      btnUseAvg.addEventListener("click", function () {
        const agg = AP.elevationSources.aggregate;
        if (agg == null) {
          const errBox = q("#elev-errors");
          if (errBox) {
            errBox.style.display = "";
            errBox.textContent =
              "No averaged elevation available yet.";
          }
          return;
        }
        if (!AP.currentTarget)
          AP.currentTarget = {
            lat: null,
            lon: null,
            elev: null,
          };
        AP.currentTarget.elev = agg;
        const elevEl = q("#target-elev");
        const srcEl = q("#target-elev-src");
        if (elevEl) elevEl.textContent = agg.toFixed(1);
        if (srcEl)
          srcEl.textContent = "avg (manual override)";
        updateTargetJSON();
        scheduleUpdate();
      });
    }

    if (btnUseGPS) {
      btnUseGPS.addEventListener("click", function () {
        const gps = AP.currentGPS;
        if (!gps || typeof gps.alt !== "number") {
          const errBox = q("#elev-errors");
          if (errBox) {
            errBox.style.display = "";
            errBox.textContent =
              "No GPS altitude available yet.";
          }
          return;
        }
        if (!AP.currentTarget)
          AP.currentTarget = {
            lat: null,
            lon: null,
            elev: null,
          };
        const val = gps.alt + (AP.settings.gpsGeoidOffset || 0);
        AP.currentTarget.elev = val;
        const elevEl = q("#target-elev");
        const srcEl = q("#target-elev-src");
        if (elevEl) elevEl.textContent = val.toFixed(1);
        if (srcEl) srcEl.textContent = "GPS alt";
        updateTargetJSON();
        scheduleUpdate();
      });
    }

    if (toggleLockElev) {
      toggleLockElev.addEventListener("change", function () {
        AP.settings.lockManualElev = toggleLockElev.checked;
        const srcEl = q("#target-elev-src");
        if (
          srcEl &&
          AP.currentTarget &&
          AP.currentTarget.elev != null
        ) {
          srcEl.textContent = AP.settings.lockManualElev
            ? "manual (locked)"
            : "manual";
        }
      });
    }

    if (retryBtn) {
      retryBtn.addEventListener("click", function () {
        if (
          AP.currentTarget &&
          typeof AP.currentTarget.lat === "number" &&
          typeof AP.currentTarget.lon === "number"
        ) {
          setMapStatus("Retrying elevation…");
          fetchElevationMulti(
            AP.currentTarget.lat,
            AP.currentTarget.lon
          );
        }
      });
    }
  }

  // --- Main UI setup ---
  function setup(retry) {
    retry = retry || 0;

    Compass.init();
    ElevGauge.init();

    const btnSensors = q("#btn-sensors");
    const btnMap = q("#btn-map");
    const btnCalibTarget = q("#btn-calib-target");
    const btnCalibAxes = q("#btn-calib-axes");
    const btnQuickLevel = q("#btn-quick-level");
    const btnResetAxes = q("#btn-reset-axes");
    const btnCloseMap = q("#btn-close-map");

    if (
      !btnSensors ||
      !btnMap ||
      !btnCalibTarget ||
      !btnCalibAxes
    ) {
      if (retry < 30) {
        setTimeout(function () {
          setup(retry + 1);
        }, 150);
      }
      return;
    }

    btnSensors.addEventListener("click", function () {
      btnSensors.disabled = true;
      btnSensors.textContent = "Sensors running";
      initSensors();
    });

    btnMap.addEventListener("click", function () {
      openSheet("#sheet-map");
      const container = q("#map-container");
      const statusEl = q("#map-status");
      if (statusEl) statusEl.textContent = "Loading map…";

      const getInitial = function () {
        const gps = AP.currentGPS;
        if (
          gps &&
          typeof gps.lat === "number" &&
          typeof gps.lon === "number"
        ) {
          return { lat: gps.lat, lon: gps.lon };
        }
        return null;
      };

      if (
        window.APTool &&
        typeof window.APTool.initMapOnce === "function" &&
        container &&
        statusEl
      ) {
        window.APTool.initMapOnce(
          container,
          statusEl,
          getInitial,
          function (lat, lon) {
            setMapStatus("Fetching elevation for target…");
            fetchElevationMulti(lat, lon);
          }
        );
      } else if (statusEl) {
        statusEl.textContent = "Map module not loaded.";
      }
    });

    if (btnCloseMap) {
      btnCloseMap.addEventListener("click", function () {
        closeSheet("#sheet-map");
      });
    }

    if (btnCalibTarget) {
      btnCalibTarget.addEventListener("click", function () {
        calibrateToTarget();
      });
    }

    if (btnCalibAxes) {
      btnCalibAxes.addEventListener("click", function () {
        axesFlipPitch();
      });
    }

    if (btnQuickLevel) {
      btnQuickLevel.addEventListener("click", function () {
        quickLevel();
      });
    }

    if (btnResetAxes) {
      btnResetAxes.addEventListener("click", function () {
        resetAxes();
      });
    }

    wireSettings();
    wireTargetElevationPanel();

    // Initial render
    scheduleUpdate();
  }

  // Ensure we only run setup after DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setup(0);
    });
  } else {
    setup(0);
  }
})();
