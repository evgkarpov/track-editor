
(() => {
  "use strict";

  let TURN_IDS = Array.from({length: 12}, (_, i) => `T${i + 1}`);
  const CORNER_PRESETS = {
    pir: Array.from({length: 12}, (_, i) => `T${i + 1}`),
    pacific: ["T1","T2","T3A","T3B","T4","T5A","T5B","T6","T7","T8","T9","T10"],
  };
  const R_EARTH = 6371000;

  const el = id => document.getElementById(id);
  const i18n = window.TrackEditorI18n;
  const t = (key, vars = {}) => i18n ? i18n.t(key, vars) : key;
  const currentLocale = () => i18n ? i18n.locale() : "en-US";
  const svg = el("plot");
  const plotWrap = el("plotWrap");

  const state = {
    trackName: "",
    trackId: "",
    layout: "",
    source: "",
    projection: null,
    session: null,
    rawSession: null,
    rawLaps: [],
    lapCandidates: [],
    crossings: [],
    sfGate: null,
    sfTangent: null,
    timing: {
      startFinish: null,
      sectorCount: 3,
      splits: [null, null],
      lineWidth: 55,
    },
    timingSetMode: null,
    reference: [],
    referenceLength: 0,
    corners: Object.fromEntries(TURN_IDS.map(id => [id, {start: null, apex: null, end: null}])),
    selectedTurn: "T1",
    setField: null,
    showSatellite: true,
    satelliteOpacity: 0.88,
    arcgisToken: localStorage.getItem("gnss-corner-editor:arcgis-token") || "",
    satelliteGeneration: 0,
    showRaw: true,
    showDerived: true,
    gateWidth: 50,
    bufferWidth: 24,
    camera: {cx: 0, cy: 0, spanX: 1000},
    hoverRefIndex: null,
    pointer: {mode: null, lastX: 0, lastY: 0, handle: null},
    importedProject: false,
    statusKey: "status.ready",
    statusVars: {},
  };

  const SATELLITE_PUBLIC_URLS = [
    "https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile",
    "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile"
  ];
  const SATELLITE_TOKEN_URL = "https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile";
  const TILE_SIZE = 256;
  const satelliteLayer = el("satelliteLayer");

  // ---------------------------------------------------------------------------
  // Geometry / projection
  // ---------------------------------------------------------------------------

  function projectionFor(lat0, lon0) {
    const cos0 = Math.cos(lat0 * Math.PI / 180);
    return {
      lat0, lon0, cos0,
      toXY(lat, lon) {
        return {
          x: (lon - lon0) * Math.PI / 180 * R_EARTH * cos0,
          y: (lat - lat0) * Math.PI / 180 * R_EARTH,
        };
      },
      toLL(x, y) {
        return {
          lat: lat0 + (y / R_EARTH) * 180 / Math.PI,
          lon: lon0 + (x / (R_EARTH * cos0)) * 180 / Math.PI,
        };
      }
    };
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function median(values) {
    const a = [...values].sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function cross2(ax, ay, bx, by) {
    return ax * by - ay * bx;
  }

  function segmentIntersection(p1, p2, q1, q2) {
    const rx = p2.x - p1.x, ry = p2.y - p1.y;
    const sx = q2.x - q1.x, sy = q2.y - q1.y;
    const den = cross2(rx, ry, sx, sy);
    if (Math.abs(den) < 1e-9) return null;
    const qpx = q1.x - p1.x, qpy = q1.y - p1.y;
    const t = cross2(qpx, qpy, sx, sy) / den;
    const u = cross2(qpx, qpy, rx, ry) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return {t, u};
    return null;
  }

  function interpolatePoint(a, b, t) {
    return {
      x: a.x + t * (b.x - a.x),
      y: a.y + t * (b.y - a.y),
      time: a.time + t * (b.time - a.time),
      speed: (a.speed ?? 0) + t * ((b.speed ?? 0) - (a.speed ?? 0)),
    };
  }

  function nearestIndex(points, world, predicate = null) {
    let best = -1, bestD2 = Infinity;
    for (let i = 0; i < points.length; i++) {
      if (predicate && !predicate(points[i], i)) continue;
      const dx = points[i].x - world.x;
      const dy = points[i].y - world.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    return best;
  }

  function tangentAt(index, step = 4) {
    const n = state.reference.length;
    if (!n) return {x: 1, y: 0};
    const a = state.reference[(index - step + n) % n];
    const b = state.reference[(index + step) % n];
    let x = b.x - a.x, y = b.y - a.y;
    const l = Math.hypot(x, y) || 1;
    return {x: x / l, y: y / l};
  }

  function gateAt(index, width = state.gateWidth) {
    const p = state.reference[index];
    const t = tangentAt(index);
    const nx = -t.y, ny = t.x;
    const h = width / 2;
    return [
      {x: p.x + nx * h, y: p.y + ny * h},
      {x: p.x - nx * h, y: p.y - ny * h}
    ];
  }

  function arcIndices(start, end) {
    const n = state.reference.length;
    if (!n || start == null || end == null) return [];
    const out = [start];
    let i = start;
    let guard = 0;
    while (i !== end && guard < n + 2) {
      i = (i + 1) % n;
      out.push(i);
      guard++;
    }
    return out;
  }

  function forwardS(fromIndex, toIndex) {
    if (!state.reference.length) return NaN;
    const a = state.reference[fromIndex].s;
    const b = state.reference[toIndex].s;
    const direct = b - a;
    return direct >= 0 ? direct : direct + state.referenceLength;
  }

  function cornerIsOrdered(corner) {
    if (corner.start == null || corner.apex == null || corner.end == null) return true;
    return forwardS(corner.start, corner.apex) <= forwardS(corner.start, corner.end);
  }

  function analysisPolygon(corner) {
    if (corner.start == null || corner.end == null || !state.reference.length) return [];
    const indices = arcIndices(corner.start, corner.end);
    if (indices.length < 2) return [];
    const left = [], right = [];
    for (const idx of indices) {
      const p = state.reference[idx];
      const t = tangentAt(idx, 3);
      const nx = -t.y, ny = t.x;
      left.push({x: p.x + nx * state.bufferWidth, y: p.y + ny * state.bufferWidth});
      right.push({x: p.x - nx * state.bufferWidth, y: p.y - ny * state.bufferWidth});
    }
    return [...left, ...right.reverse()];
  }

  // ---------------------------------------------------------------------------
  // Satellite imagery (Esri World Imagery, Web Mercator tiles)
  // ---------------------------------------------------------------------------

  function tileX(lon, z) {
    return (lon + 180) / 360 * Math.pow(2, z);
  }

  function tileY(lat, z) {
    const rad = lat * Math.PI / 180;
    return (1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2 * Math.pow(2, z);
  }

  function tileLon(x, z) {
    return x / Math.pow(2, z) * 360 - 180;
  }

  function tileLat(y, z) {
    const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
    return Math.atan(Math.sinh(n)) * 180 / Math.PI;
  }

  function chooseSatelliteZoom() {
    if (!state.projection) return 16;
    const {w} = plotSize();
    const targetMpp = state.camera.spanX / Math.max(w, 1);
    const lat = state.projection.lat0 * Math.PI / 180;
    const z = Math.round(Math.log2(156543.03392804097 * Math.cos(lat) / Math.max(targetMpp, 0.02)));
    return clamp(z, 13, 19);
  }

  function visibleWorldBounds() {
    const {w, h} = plotSize();
    const nw = screenToWorld(0, 0);
    const se = screenToWorld(w, h);
    return {
      west: Math.min(nw.x, se.x),
      east: Math.max(nw.x, se.x),
      south: Math.min(nw.y, se.y),
      north: Math.max(nw.y, se.y),
    };
  }

  function tileUrl(z, y, x, sourceIndex = 0) {
    if (state.arcgisToken) {
      return `${SATELLITE_TOKEN_URL}/${z}/${y}/${x}?token=${encodeURIComponent(state.arcgisToken)}`;
    }
    return `${SATELLITE_PUBLIC_URLS[sourceIndex % SATELLITE_PUBLIC_URLS.length]}/${z}/${y}/${x}`;
  }

  function positionSatelliteTile(img, z, tx, ty) {
    const westLon = tileLon(tx, z);
    const eastLon = tileLon(tx + 1, z);
    const northLat = tileLat(ty, z);
    const southLat = tileLat(ty + 1, z);

    const nwWorld = state.projection.toXY(northLat, westLon);
    const seWorld = state.projection.toXY(southLat, eastLon);
    const nwScreen = worldToScreen(nwWorld);
    const seScreen = worldToScreen(seWorld);

    // Keep the same camera transform as the GNSS SVG.
    // A small overlap avoids 1 px seams caused by sub-pixel rounding.
    const left = Math.min(nwScreen.x, seScreen.x);
    const top = Math.min(nwScreen.y, seScreen.y);
    const width = Math.abs(seScreen.x - nwScreen.x) + 1.5;
    const height = Math.abs(seScreen.y - nwScreen.y) + 1.5;

    img.style.left = `${left}px`;
    img.style.top = `${top}px`;
    img.style.width = `${width}px`;
    img.style.height = `${height}px`;
  }

  function repositionAllSatelliteTiles() {
    for (const img of satelliteLayer.querySelectorAll("img[data-z][data-x][data-y]")) {
      const z = Number(img.dataset.z);
      const x = Number(img.dataset.x);
      const y = Number(img.dataset.y);
      if (Number.isFinite(z) && Number.isFinite(x) && Number.isFinite(y)) {
        positionSatelliteTile(img, z, x, y);
      }
    }
  }

  function renderSatellite() {
    const attribution = el("satelliteAttribution");
    if (!state.showSatellite || !state.projection || !(state.reference.length || state.session?.length)) {
      satelliteLayer.style.display = "none";
      attribution.style.display = "none";
      return;
    }

    satelliteLayer.style.display = "block";
    attribution.style.display = "block";
    satelliteLayer.style.opacity = String(state.satelliteOpacity);

    // Critical: all already loaded tiles follow the camera immediately.
    // This removes the apparent GNSS-vs-map drift while a new zoom level
    // is still downloading.
    repositionAllSatelliteTiles();

    const b = visibleWorldBounds();
    const nwLL = state.projection.toLL(b.west, b.north);
    const seLL = state.projection.toLL(b.east, b.south);
    const z = chooseSatelliteZoom();
    const n = Math.pow(2, z);

    let x0 = Math.floor(tileX(nwLL.lon, z)) - 1;
    let x1 = Math.floor(tileX(seLL.lon, z)) + 1;
    let y0 = Math.floor(tileY(nwLL.lat, z)) - 1;
    let y1 = Math.floor(tileY(seLL.lat, z)) + 1;

    x0 = clamp(x0, 0, n - 1);
    x1 = clamp(x1, 0, n - 1);
    y0 = clamp(y0, 0, n - 1);
    y1 = clamp(y1, 0, n - 1);

    // If viewport would need too many tiles, back off one zoom level instead
    // of clearing the layer and showing black.
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 64 && z > 13) {
      const savedSpan = state.camera.spanX;
      state.camera.spanX *= 1.000001; // avoid recursive camera mutation; just keep current tiles
      state.camera.spanX = savedSpan;
      return;
    }

    const generation = ++state.satelliteGeneration;
    const wanted = new Set();
    const newTiles = [];

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const key = `${z}/${tx}/${ty}`;
        wanted.add(key);

        let img = satelliteLayer.querySelector(`img[data-key="${key}"]`);
        if (!img) {
          img = document.createElement("img");
          img.dataset.key = key;
          img.dataset.z = String(z);
          img.dataset.x = String(tx);
          img.dataset.y = String(ty);
          img.dataset.retry = "0";
          img.alt = "";
          img.draggable = false;
          img.referrerPolicy = "no-referrer";
          img.className = "tile pending";

          img.onload = () => {
            img.classList.remove("pending");
            img.classList.add("loaded");

            // Old tiles are removed only after at least one current-generation
            // tile has successfully loaded. This prevents black flashes.
            if (generation === state.satelliteGeneration) {
              setTimeout(() => {
                for (const old of [...satelliteLayer.querySelectorAll("img")]) {
                  if (!wanted.has(old.dataset.key) && old.classList.contains("loaded")) old.remove();
                }
              }, 250);
            }
          };

          img.onerror = () => {
            const retry = Number(img.dataset.retry || "0");
            if (!state.arcgisToken && retry < SATELLITE_PUBLIC_URLS.length - 1) {
              img.dataset.retry = String(retry + 1);
              img.src = tileUrl(z, ty, tx, retry + 1);
              return;
            }

            // Do not stretch a parent tile into a child tile footprint:
            // that creates a false geographic shift. The previous zoom-level
            // tiles remain underneath and stay camera-locked until valid
            // replacement tiles arrive.
            img.remove();
          };

          img.src = tileUrl(z, ty, tx, 0);
          satelliteLayer.appendChild(img);
          newTiles.push(img);
        }

        positionSatelliteTile(img, z, tx, ty);
      }
    }

    // Do NOT immediately remove old tiles. Their delayed removal happens in
    // the current generation's onload handler.
    // Prevent unbounded buildup if the network is offline.
    const all = [...satelliteLayer.querySelectorAll("img")];
    if (all.length > 140) {
      for (const old of all.slice(0, all.length - 100)) {
        if (!wanted.has(old.dataset.key)) old.remove();
      }
    }
  }


  // ---------------------------------------------------------------------------
  // Timing: Start/Finish + sectors
  // ---------------------------------------------------------------------------

  function defaultTiming() {
    return {
      startFinish: null,
      sectorCount: 3,
      splits: [null, null],
      lineWidth: 55,
    };
  }

  function normalizeTiming() {
    if (!state.timing) state.timing = defaultTiming();
    state.timing.sectorCount = clamp(Math.round(Number(state.timing.sectorCount) || 3), 1, 20);
    state.timing.lineWidth = clamp(Number(state.timing.lineWidth) || 55, 20, 150);

    const needed = Math.max(0, state.timing.sectorCount - 1);
    const old = Array.isArray(state.timing.splits) ? state.timing.splits : [];
    state.timing.splits = Array.from({length: needed}, (_, i) => old[i] ?? null);

    if (state.timing.startFinish != null && !state.reference[state.timing.startFinish]) {
      state.timing.startFinish = null;
    }
    state.timing.splits = state.timing.splits.map(idx =>
      idx != null && state.reference[idx] ? idx : null
    );
  }

  function timingLineAt(index) {
    if (index == null || !state.reference[index]) return null;
    return gateAt(index, state.timing.lineWidth);
  }

  function headingAt(index) {
    const t = tangentAt(index);
    let deg = Math.atan2(t.x, t.y) * 180 / Math.PI;
    if (deg < 0) deg += 360;
    return deg;
  }

  function setSectorCount(count) {
    const next = clamp(Math.round(Number(count) || 1), 1, 20);
    const oldNeeded = Math.max(0, state.timing.sectorCount - 1);
    const newNeeded = Math.max(0, next - 1);

    if (newNeeded < oldNeeded) {
      const removed = state.timing.splits.slice(newNeeded).filter(v => v != null);
      if (removed.length && !confirm(t("timing.confirmReduce", {count: next, removed: removed.length}))) {
        el("sectorCountInput").value = state.timing.sectorCount;
        return;
      }
    }

    state.timing.sectorCount = next;
    normalizeTiming();
    state.timingSetMode = null;
    saveLocalMarkup();
    updateAllUi();
  }

  function setTimingPoint(kind, value) {
    if (kind === "sf") {
      state.timing.startFinish = value;
    } else if (kind.startsWith("split:")) {
      const i = Number(kind.split(":")[1]);
      if (Number.isInteger(i) && i >= 0 && i < state.timing.splits.length) {
        state.timing.splits[i] = value;
      }
    }
    saveLocalMarkup();
    updateAllUi();
  }

  function clearTiming(confirmFirst = false) {
    if (confirmFirst && !confirm(t("timing.confirmClear"))) return;
    state.timing.startFinish = null;
    state.timing.splits = Array(Math.max(0, state.timing.sectorCount - 1)).fill(null);
    state.timingSetMode = null;
    saveLocalMarkup();
    updateAllUi();
  }

  function timingCompleteness() {
    const required = state.timing.sectorCount;
    let set = state.timing.startFinish != null ? 1 : 0;
    set += state.timing.splits.filter(v => v != null).length;
    return {set, required};
  }

  function timingValidation() {
    const issues = [];
    if (state.timing.startFinish == null) issues.push(t("timing.validation.sfMissing"));

    state.timing.splits.forEach((idx, i) => {
      if (idx == null) issues.push(t("timing.validation.splitMissing", {sector: i + 1}));
    });

    if (!issues.length && state.timing.startFinish != null) {
      let prev = 0;
      for (let i = 0; i < state.timing.splits.length; i++) {
        const d = forwardS(state.timing.startFinish, state.timing.splits[i]);
        if (d <= 5) {
          issues.push(t("timing.validation.splitTooCloseSf", {sector: i + 1}));
          break;
        }
        if (d - prev <= 5) {
          issues.push(t("timing.validation.splitOrder", {sector: i + 1}));
          break;
        }
        prev = d;
      }

      if (state.timing.splits.length && state.referenceLength - prev <= 5) {
        issues.push(t("timing.validation.lastTooCloseSf"));
      }
    }

    return issues;
  }

  function timingMarkerSvg(kind, index, label) {
    if (index == null || !state.reference[index]) return "";
    const p = worldToScreen(state.reference[index]);
    const isSf = kind === "sf";
    const marker = isSf
      ? `<circle class="timing-marker sf" data-timing-handle="${kind}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7"></circle>`
      : `<rect class="timing-marker sector" data-timing-handle="${kind}" x="${(p.x - 6).toFixed(1)}" y="${(p.y - 6).toFixed(1)}" width="12" height="12" rx="2"></rect>`;
    return marker + `<text class="timing-label ${isSf ? "sf" : "sector"}" x="${(p.x + 10).toFixed(1)}" y="${(p.y - 10).toFixed(1)}">${label}</text>`;
  }

  function renderTimingUi() {
    normalizeTiming();

    const sf = state.timing.startFinish;
    el("timingSfValue").textContent = sf == null ? t("common.notSet") : pointDisplay(sf);

    const {set, required} = timingCompleteness();
    const progress = el("timingProgress");
    progress.textContent = t("common.lines", {set, required});
    progress.className = `badge ${set === required ? "good" : set ? "warn" : ""}`;

    el("sectorCountInput").value = state.timing.sectorCount;
    el("timingLineWidthInput").value = state.timing.lineWidth;

    const rows = [];
    for (let i = 0; i < state.timing.sectorCount - 1; i++) {
      const idx = state.timing.splits[i];
      rows.push(`
        <div class="sector-row">
          <div class="sector-id">${t("timing.sectorEnd", {sector: i + 1})}</div>
          <div class="sector-pos">${idx == null ? t("common.notSet") : pointDisplay(idx)}</div>
          <button class="btn secondary compact-btn" data-set-timing="split:${i}">${t("common.set")}</button>
          <button class="clear-point" data-clear-timing="split:${i}" title="${t("actions.clear")}">×</button>
        </div>
      `);
    }
    rows.push(`
      <div class="sector-row closing">
        <div class="sector-id">${t("timing.lastSectorEnd", {sector: state.timing.sectorCount})}</div>
        <div class="sector-pos">${t("timing.lastSectorValue")}</div>
        <span></span><span></span>
      </div>
    `);
    el("sectorList").innerHTML = rows.join("");

    const hint = el("timingModeHint");
    if (state.timingSetMode === "sf") {
      hint.textContent = t("timing.setSfHint");
      hint.classList.add("active");
    } else if (state.timingSetMode?.startsWith("split:")) {
      const i = Number(state.timingSetMode.split(":")[1]);
      hint.textContent = t("timing.setSplitHint", {sector: i + 1});
      hint.classList.add("active");
    } else {
      hint.textContent = t("timing.snapHint");
      hint.classList.remove("active");
    }

    const issues = timingValidation();
    const warning = el("timingWarning");
    if (issues.length) {
      warning.textContent = issues.join(" ");
      warning.classList.remove("hidden");
    } else {
      warning.textContent = t("timing.ready", {count: state.timing.sectorCount, splits: state.timing.sectorCount - 1});
      warning.classList.remove("hidden");
      warning.classList.add("timing-ok");
    }
    if (issues.length) warning.classList.remove("timing-ok");
  }

  // ---------------------------------------------------------------------------
  // Camera / SVG
  // ---------------------------------------------------------------------------

  function plotSize() {
    return {w: Math.max(1, svg.clientWidth), h: Math.max(1, svg.clientHeight)};
  }

  function worldToScreen(p) {
    const {w, h} = plotSize();
    const scale = w / state.camera.spanX;
    return {
      x: (p.x - state.camera.cx) * scale + w / 2,
      y: h / 2 - (p.y - state.camera.cy) * scale
    };
  }

  function screenToWorld(x, y) {
    const {w, h} = plotSize();
    const scale = w / state.camera.spanX;
    return {
      x: (x - w / 2) / scale + state.camera.cx,
      y: (h / 2 - y) / scale + state.camera.cy
    };
  }

  function pointsExtent(points) {
    if (!points?.length) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    return {minX, maxX, minY, maxY};
  }

  function fitView() {
    let pts = state.reference;
    if (!pts.length && state.session?.length) pts = state.session;
    if (!pts?.length && state.rawLaps.length) pts = state.rawLaps.flatMap(l => l.points);
    const ext = pointsExtent(pts);
    if (!ext) return;
    const {w, h} = plotSize();
    state.camera.cx = (ext.minX + ext.maxX) / 2;
    state.camera.cy = (ext.minY + ext.maxY) / 2;
    const spanX = Math.max(50, ext.maxX - ext.minX);
    const spanY = Math.max(50, ext.maxY - ext.minY);
    state.camera.spanX = Math.max(spanX, spanY * (w / Math.max(h, 1))) * 1.12;
    render();
  }

  function svgPath(points, close = false) {
    if (!points?.length) return "";
    const first = worldToScreen(points[0]);
    let d = `M${first.x.toFixed(1)},${first.y.toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      const p = worldToScreen(points[i]);
      d += `L${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    }
    if (close) d += "Z";
    return d;
  }

  function markerSvg(turnId, field, idx, selected) {
    if (idx == null || !state.reference[idx]) return "";
    const p = worldToScreen(state.reference[idx]);
    const cls = field === "start" ? "start" : field === "apex" ? "apex" : "end";
    return `<circle class="marker ${cls}${selected ? " selected" : ""}" data-handle="${turnId}:${field}"
      cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${selected ? 7 : 6}"></circle>`;
  }

  function render() {
    const {w, h} = plotSize();
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    renderSatellite();

    const parts = [];

    if (state.showRaw) {
      if (state.rawLaps.length) {
        for (const lap of state.rawLaps) {
          parts.push(`<path class="raw-lap" d="${svgPath(lap.points)}"></path>`);
        }
      } else if (state.session?.length) {
        const dec = [];
        const step = Math.max(1, Math.floor(state.session.length / 3500));
        for (let i = 0; i < state.session.length; i += step) dec.push(state.session[i]);
        parts.push(`<path class="raw-session" d="${svgPath(dec)}"></path>`);
      }
    }

    if (state.sfGate && state.session?.length) {
      const a = worldToScreen(state.sfGate.a), b = worldToScreen(state.sfGate.b);
      parts.push(`<line class="detection-gate" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`);
      const c = {x: (state.sfGate.a.x + state.sfGate.b.x) / 2, y: (state.sfGate.a.y + state.sfGate.b.y) / 2};
      const cs = worldToScreen(c);
      parts.push(`<text class="detection-label" x="${(cs.x + 7).toFixed(1)}" y="${(cs.y - 7).toFixed(1)}">detection S/F</text>`);
    }

    if (state.reference.length) {
      parts.push(`<path class="track-ref-halo" d="${svgPath(state.reference, true)}"></path>`);
      parts.push(`<path class="track-ref" d="${svgPath(state.reference, true)}"></path>`);

      // Final timing lines: Start/Finish and sector splits.
      if (state.timing.startFinish != null) {
        const line = timingLineAt(state.timing.startFinish);
        const ps = line.map(worldToScreen);
        parts.push(`<line class="timing-sf-line" x1="${ps[0].x}" y1="${ps[0].y}" x2="${ps[1].x}" y2="${ps[1].y}"></line>`);
        parts.push(timingMarkerSvg("sf", state.timing.startFinish, "S/F"));
      }
      state.timing.splits.forEach((idx, i) => {
        if (idx == null) return;
        const line = timingLineAt(idx);
        const ps = line.map(worldToScreen);
        parts.push(`<line class="sector-split-line" x1="${ps[0].x}" y1="${ps[0].y}" x2="${ps[1].x}" y2="${ps[1].y}"></line>`);
        parts.push(timingMarkerSvg(`split:${i}`, idx, `S${i + 1}`));
      });

      // Derived zones first so markers stay visible.
      if (state.showDerived) {
        for (const turnId of TURN_IDS) {
          const c = state.corners[turnId];
          if (c.start != null && c.end != null) {
            const poly = analysisPolygon(c);
            if (poly.length) parts.push(`<path class="corner-zone" d="${svgPath(poly, true)}"></path>`);
            const arc = arcIndices(c.start, c.end).map(i => state.reference[i]);
            if (arc.length) parts.push(`<path class="corner-arc" d="${svgPath(arc)}"></path>`);
            const eg = gateAt(c.start);
            const xg = gateAt(c.end);
            const egs = eg.map(worldToScreen), xgs = xg.map(worldToScreen);
            parts.push(`<line class="entry-gate" x1="${egs[0].x}" y1="${egs[0].y}" x2="${egs[1].x}" y2="${egs[1].y}"></line>`);
            parts.push(`<line class="exit-gate" x1="${xgs[0].x}" y1="${xgs[0].y}" x2="${xgs[1].x}" y2="${xgs[1].y}"></line>`);
          }
        }
      }

      for (const turnId of TURN_IDS) {
        const c = state.corners[turnId];
        const selected = turnId === state.selectedTurn;
        parts.push(markerSvg(turnId, "start", c.start, selected && state.setField === "start"));
        parts.push(markerSvg(turnId, "apex", c.apex, selected && state.setField === "apex"));
        parts.push(markerSvg(turnId, "end", c.end, selected && state.setField === "end"));
        if (c.apex != null) {
          const p = worldToScreen(state.reference[c.apex]);
          parts.push(`<text class="turn-label" x="${(p.x + 10).toFixed(1)}" y="${(p.y - 9).toFixed(1)}">${turnId}</text>`);
        }
      }

      if (state.hoverRefIndex != null && state.reference[state.hoverRefIndex]) {
        const p = worldToScreen(state.reference[state.hoverRefIndex]);
        parts.push(`<circle class="hover-dot" cx="${p.x}" cy="${p.y}" r="4"></circle>`);
      }
    }

    svg.innerHTML = parts.join("");
    el("emptyState").classList.toggle("hidden", !!(state.reference.length || state.session?.length));
    updateReferenceSummary();
  }

  // ---------------------------------------------------------------------------
  // CSV / session processing
  // ---------------------------------------------------------------------------

  function parseCsvLine(line) {
    const out = [];
    let cur = "", quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (ch === "," && !quoted) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  function parseGnssCsv(text, fileName) {
    const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
    if (lines.length < 2) throw new Error(t("errors.csvNoRows"));
    const headers = parseCsvLine(lines[0]).map(x => x.trim());
    const idx = name => headers.indexOf(name);
    const latI = idx("lat"), lonI = idx("lon");
    if (latI < 0 || lonI < 0) throw new Error(t("errors.csvMissingLatLon"));

    const millisI = idx("millis");
    const utcI = idx("utc");
    const speedI = idx("speed_kmh");
    const fixI = idx("fix");

    const raw = [];
    for (let r = 1; r < lines.length; r++) {
      const row = parseCsvLine(lines[r]);
      const lat = Number(row[latI]), lon = Number(row[lonI]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      let time;
      if (millisI >= 0 && Number.isFinite(Number(row[millisI]))) {
        time = Number(row[millisI]) / 1000;
      } else if (utcI >= 0 && row[utcI]) {
        time = Date.parse(row[utcI]) / 1000;
      } else {
        time = r * 0.1;
      }

      raw.push({
        lat, lon, time,
        speed: speedI >= 0 ? Number(row[speedI]) || 0 : 0,
        fix: fixI >= 0 ? Number(row[fixI]) : null,
      });
    }
    if (raw.length < 20) throw new Error(t("errors.csvTooFewRows"));

    const lat0 = median(raw.map(p => p.lat));
    const lon0 = median(raw.map(p => p.lon));
    const proj = projectionFor(lat0, lon0);
    for (const p of raw) Object.assign(p, proj.toXY(p.lat, p.lon));

    state.trackName = fileName.replace(/\.csv$/i, "");
    state.trackId = "custom-track";
    state.layout = "GNSS session";
    state.source = fileName;
    state.projection = proj;
    state.session = raw;
    state.rawSession = raw;
    state.rawLaps = [];
    state.lapCandidates = [];
    state.crossings = [];
    state.sfGate = null;
    state.sfTangent = null;
    state.timing = defaultTiming();
    state.timingSetMode = null;
    state.reference = [];
    state.referenceLength = 0;
    resetCorners(false);
    state.importedProject = false;

    el("sessionWorkflow").classList.remove("hidden");
    el("setSfBtn").disabled = false;
    el("detectLapsBtn").disabled = true;
    el("buildRefBtn").disabled = true;
    renderLapList();
    updateDataUi("badges.csvLoaded", "warn");
    setStatus("status.csvLoaded", {count: raw.length.toLocaleString(currentLocale())});
    fitView();
  }

  function setStartFinishAt(world) {
    if (!state.session?.length) return;
    const idx = nearestIndex(state.session, world, p => (p.speed ?? 0) > 20 && (p.fix == null || p.fix >= 3));
    if (idx < 0) return;
    const a = state.session[Math.max(0, idx - 8)];
    const b = state.session[Math.min(state.session.length - 1, idx + 8)];
    let tx = b.x - a.x, ty = b.y - a.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const nx = -ty, ny = tx;
    const center = state.session[idx];
    const half = Math.max(30, state.gateWidth / 2);
    state.sfGate = {
      a: {x: center.x + nx * half, y: center.y + ny * half},
      b: {x: center.x - nx * half, y: center.y - ny * half},
    };
    state.sfTangent = {x: tx, y: ty};
    state.setField = null;
    state.pointer.mode = null;
    el("detectLapsBtn").disabled = false;
    setStatus("status.sfSet");
    updateModeHint();
    render();
  }

  function detectLaps() {
    if (!state.session?.length || !state.sfGate || !state.sfTangent) return;
    const crossings = [];
    let lastTime = -Infinity;

    for (let i = 0; i < state.session.length - 1; i++) {
      const p1 = state.session[i], p2 = state.session[i + 1];
      const hit = segmentIntersection(p1, p2, state.sfGate.a, state.sfGate.b);
      if (!hit) continue;
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const dot = dx * state.sfTangent.x + dy * state.sfTangent.y;
      if (dot <= 0) continue;
      const p = interpolatePoint(p1, p2, hit.t);
      if (p.time - lastTime < 20) continue;
      crossings.push({index: i, t: hit.t, ...p});
      lastTime = p.time;
    }

    if (crossings.length < 3) {
      setStatus("status.crossingsFailed");
      return;
    }

    state.crossings = crossings;
    const candidates = [];
    for (let k = 0; k < crossings.length - 1; k++) {
      candidates.push({
        k,
        lap: k + 1,
        time: crossings[k + 1].time - crossings[k].time,
        selected: true,
      });
    }
    const med = median(candidates.map(x => x.time));
    for (const c of candidates) {
      c.selected = c.time >= med * 0.85 && c.time <= med * 1.08;
      c.outlier = !c.selected;
    }
    state.lapCandidates = candidates;
    renderLapList();
    el("buildRefBtn").disabled = !candidates.some(c => c.selected);
    setStatus("status.lapsDetected", {count: candidates.length});
    updateDataUi("badges.lapsDetected", "warn");
  }

  function lapPointsFromCrossings(k) {
    const c0 = state.crossings[k], c1 = state.crossings[k + 1];
    const out = [{x: c0.x, y: c0.y}];
    for (let i = c0.index + 1; i <= c1.index; i++) {
      out.push({x: state.session[i].x, y: state.session[i].y});
    }
    out.push({x: c1.x, y: c1.y});
    return out;
  }

  function cumulativeDistance(points) {
    const s = [0];
    for (let i = 1; i < points.length; i++) s.push(s[i - 1] + dist(points[i - 1], points[i]));
    return s;
  }

  function interpByDistance(points, cumulative, q) {
    let hi = 1;
    while (hi < cumulative.length && cumulative[hi] < q) hi++;
    if (hi >= cumulative.length) return {...points[points.length - 1]};
    const lo = hi - 1;
    const den = cumulative[hi] - cumulative[lo] || 1;
    const t = (q - cumulative[lo]) / den;
    return {
      x: points[lo].x + t * (points[hi].x - points[lo].x),
      y: points[lo].y + t * (points[hi].y - points[lo].y),
    };
  }

  function buildMedianReference() {
    const chosen = state.lapCandidates.filter(c => c.selected);
    if (!chosen.length) return;

    const N = 1000;
    const resampled = [];
    const rawLaps = [];

    for (const c of chosen) {
      const pts = lapPointsFromCrossings(c.k);
      const cumulative = cumulativeDistance(pts);
      const total = cumulative[cumulative.length - 1];
      const row = [];
      for (let i = 0; i < N; i++) {
        row.push(interpByDistance(pts, cumulative, total * i / N));
      }
      resampled.push(row);

      const dec = [];
      for (let i = 0; i < 350; i++) dec.push(row[Math.floor(i * row.length / 350)]);
      rawLaps.push({lap: c.lap, time: c.time, points: dec});
    }

    const med = [];
    for (let i = 0; i < N; i++) {
      med.push({
        x: median(resampled.map(r => r[i].x)),
        y: median(resampled.map(r => r[i].y)),
      });
    }

    // Circular 5-sample moving average.
    const smooth = [];
    for (let i = 0; i < N; i++) {
      let x = 0, y = 0;
      for (let j = -2; j <= 2; j++) {
        const p = med[(i + j + N) % N];
        x += p.x; y += p.y;
      }
      smooth.push({x: x / 5, y: y / 5});
    }

    let s = 0;
    const ref = [];
    for (let i = 0; i < N; i++) {
      if (i > 0) s += dist(smooth[i - 1], smooth[i]);
      const ll = state.projection.toLL(smooth[i].x, smooth[i].y);
      ref.push({...smooth[i], ...ll, s});
    }
    const length = s + dist(smooth[N - 1], smooth[0]);

    state.reference = ref;
    state.referenceLength = length;
    state.rawLaps = rawLaps;

    // Convenient initial final S/F from the detection gate. It remains fully editable.
    state.timing = defaultTiming();
    if (state.sfGate) {
      const c = {
        x: (state.sfGate.a.x + state.sfGate.b.x) / 2,
        y: (state.sfGate.a.y + state.sfGate.b.y) / 2
      };
      state.timing.startFinish = nearestIndex(state.reference, c);
    }

    resetCorners(false);
    state.trackName = state.trackName || "GNSS Track";
    updateDataUi("badges.referenceReady", "good");
    setStatus("status.referenceBuilt", {points: N, laps: chosen.length});
    fitView();
    updateAllUi();
  }

  // ---------------------------------------------------------------------------
  // Corner editing
  // ---------------------------------------------------------------------------

  function setCornerPoint(turnId, field, index) {
    if (!state.reference.length || index == null) return;
    state.corners[turnId][field] = index;
    state.selectedTurn = turnId;
    saveLocalMarkup();
    updateAllUi();
  }

  function clearPoint(turnId, field) {
    state.corners[turnId][field] = null;
    saveLocalMarkup();
    updateAllUi();
  }

  function normalizeCornerId(raw) {
    return String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
  }

  function rebuildCornerSet(ids, preserve = true) {
    const clean = [];
    const seen = new Set();
    for (const raw of ids) {
      const id = normalizeCornerId(raw);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      clean.push(id);
    }
    if (!clean.length) return;

    const next = {};
    for (const id of clean) {
      next[id] = preserve && state.corners[id]
        ? state.corners[id]
        : {start:null, apex:null, end:null};
    }
    TURN_IDS = clean;
    state.corners = next;
    if (!TURN_IDS.includes(state.selectedTurn)) state.selectedTurn = TURN_IDS[0];
    state.setField = null;
    saveLocalMarkup();
    updateAllUi();
  }

  function addCornerId(raw) {
    const id = normalizeCornerId(raw);
    if (!id) return;
    if (TURN_IDS.includes(id)) {
      selectTurn(id);
      return;
    }
    rebuildCornerSet([...TURN_IDS, id], true);
    selectTurn(id);
  }

  function renameSelectedTurn() {
    const oldId = state.selectedTurn;
    const input = prompt(t("corners.newIdPrompt"), oldId);
    if (input == null) return;
    const newId = normalizeCornerId(input);
    if (!newId || newId === oldId) return;
    if (TURN_IDS.includes(newId)) return alert(t("corners.idExists", {id: newId}));

    const nextIds = TURN_IDS.map(id => id === oldId ? newId : id);
    const nextCorners = {};
    for (const id of nextIds) {
      nextCorners[id] = id === newId ? state.corners[oldId] : state.corners[id];
    }
    TURN_IDS = nextIds;
    state.corners = nextCorners;
    state.selectedTurn = newId;
    saveLocalMarkup();
    updateAllUi();
  }

  function deleteSelectedTurn() {
    if (TURN_IDS.length <= 1) return alert(t("corners.minOne"));
    const id = state.selectedTurn;
    if (!confirm(t("corners.deleteConfirm", {id}))) return;
    const idx = TURN_IDS.indexOf(id);
    TURN_IDS = TURN_IDS.filter(x => x !== id);
    delete state.corners[id];
    state.selectedTurn = TURN_IDS[Math.min(idx, TURN_IDS.length - 1)];
    state.setField = null;
    saveLocalMarkup();
    updateAllUi();
  }

  function resetCorners(confirmFirst = true) {
    if (confirmFirst && !confirm(t("corners.clearAllConfirm"))) return;
    state.corners = Object.fromEntries(TURN_IDS.map(id => [id, {start: null, apex: null, end: null}]));
    state.setField = null;
    saveLocalMarkup();
    updateAllUi();
  }

  function cornerStatus(c) {
    const count = ["start", "apex", "end"].filter(k => c[k] != null).length;
    return count === 3 ? "complete" : count > 0 ? "partial" : "empty";
  }

  function selectTurn(id) {
    state.selectedTurn = id;
    state.setField = null;
    updateAllUi();
  }

  function turnIndex(id) {
    return TURN_IDS.indexOf(id);
  }

  function changeTurn(delta) {
    const i = turnIndex(state.selectedTurn);
    selectTurn(TURN_IDS[(i + delta + TURN_IDS.length) % TURN_IDS.length]);
  }

  function pointDisplay(idx) {
    if (idx == null || !state.reference[idx]) return t("common.notSet");
    const p = state.reference[idx];
    return `s ${p.s.toFixed(1)} m · ${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`;
  }

  function renderTurnList() {
    el("turnList").innerHTML = TURN_IDS.map(id => {
      const s = cornerStatus(state.corners[id]);
      return `<button class="turn-chip ${s} ${id === state.selectedTurn ? "selected" : ""}" data-turn="${id}">${id}</button>`;
    }).join("");

    const complete = TURN_IDS.filter(id => cornerStatus(state.corners[id]) === "complete").length;
    el("cornerProgress").textContent = `${complete} / ${TURN_IDS.length}`;
    el("cornerProgress").className = `badge ${complete === TURN_IDS.length ? "good" : complete ? "warn" : ""}`;
  }

  function renderPointRows() {
    const c = state.corners[state.selectedTurn];
    el("selectedTurnTitle").textContent = state.selectedTurn;
    el("pointRows").innerHTML = ["start", "apex", "end"].map(field => `
      <div class="point-row">
        <div class="point-name">${field}</div>
        <div class="point-value">${pointDisplay(c[field])}</div>
        <button class="clear-point" data-clear-field="${field}" title="${t("actions.clear")}">×</button>
      </div>
    `).join("");

    const warning = el("cornerWarning");
    if (c.start != null && c.apex != null && c.end != null && !cornerIsOrdered(c)) {
      warning.textContent = t("corners.apexOrderWarning");
      warning.classList.remove("hidden");
    } else if (c.start != null && c.end != null && forwardS(c.start, c.end) > state.referenceLength * 0.22) {
      warning.textContent = t("corners.longZoneWarning");
      warning.classList.remove("hidden");
    } else {
      warning.classList.add("hidden");
    }
  }

  function updateModeHint() {
    document.querySelectorAll(".point-mode").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.field === state.setField);
    });
    const hint = el("modeHint");
    if (state.pointer.mode === "sf") {
      hint.textContent = t("corners.detectionSfHint");
      hint.classList.add("active");
    } else if (state.setField) {
      hint.textContent = t("corners.setPointHint", {corner: state.selectedTurn, field: state.setField.toUpperCase()});
      hint.classList.add("active");
    } else {
      hint.textContent = t("corners.dragHint");
      hint.classList.remove("active");
    }
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  function stat(label, value) {
    return `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div>`;
  }

  function updateDataUi(labelKey = null, kind = null) {
    if (labelKey) {
      el("dataBadge").dataset.badgeKey = labelKey;
      el("dataBadge").textContent = t(labelKey);
      el("dataBadge").className = `badge ${kind || ""}`;
    } else if (el("dataBadge").dataset.badgeKey) {
      el("dataBadge").textContent = t(el("dataBadge").dataset.badgeKey);
    }

    const stats = [];
    if (state.reference.length) {
      stats.push(stat(t("stats.reference"), `${state.referenceLength.toFixed(0)} m`));
      stats.push(stat(t("stats.points"), state.reference.length.toLocaleString(currentLocale())));
    }
    if (state.rawLaps.length) {
      stats.push(stat(t("stats.lapsUsed"), state.rawLaps.length.toLocaleString(currentLocale())));
      const best = Math.min(...state.rawLaps.map(l => l.time));
      stats.push(stat(t("stats.best"), formatLap(best)));
    } else if (state.session?.length) {
      stats.push(stat(t("stats.samples"), state.session.length.toLocaleString(currentLocale())));
      stats.push(stat(t("stats.sf"), state.sfGate ? t("stats.set") : t("stats.notSet")));
    }
    el("sessionStats").innerHTML = stats.join("");
    el("trackSubtitle").textContent = [state.trackName, state.layout].filter(Boolean).join(" · ");
  }

  function renderLapList() {
    if (!state.lapCandidates.length) {
      el("lapList").innerHTML = "";
      return;
    }
    el("lapList").innerHTML = state.lapCandidates.map(c => `
      <label class="lap-row ${c.outlier ? "outlier" : ""}">
        <input type="checkbox" data-lap-k="${c.k}" ${c.selected ? "checked" : ""}>
        <span>${t("laps.lap")} ${c.lap}</span>
        <span class="lap-time">${formatLap(c.time)}</span>
      </label>
    `).join("");
  }

  function formatLap(seconds) {
    if (!Number.isFinite(seconds)) return "—";
    const m = Math.floor(seconds / 60);
    const s = seconds - m * 60;
    return `${m}:${s.toFixed(3).padStart(6, "0")}`;
  }

  function updateReferenceSummary() {
    el("referenceSummary").textContent = state.reference.length
      ? t("status.reference", {
          length: state.referenceLength.toFixed(1),
          points: state.reference.length.toLocaleString(currentLocale())
        })
      : t("status.referenceEmpty");
  }

  function status(text) {
    state.statusKey = null;
    state.statusVars = {};
    el("statusText").textContent = text;
  }

  function setStatus(key, vars = {}) {
    state.statusKey = key;
    state.statusVars = vars;
    el("statusText").textContent = t(key, vars);
  }

  function refreshStatus() {
    if (state.statusKey) {
      el("statusText").textContent = t(state.statusKey, state.statusVars);
    }
  }

  function updateAllUi() {
    renderTimingUi();
    renderTurnList();
    renderPointRows();
    updateModeHint();
    updateDataUi();
    render();
  }

  // ---------------------------------------------------------------------------
  // Export / import / persistence
  // ---------------------------------------------------------------------------

  function pointForIndex(idx) {
    if (idx == null) return null;
    const p = state.reference[idx];
    return {
      s_m: Number(p.s.toFixed(3)),
      lat: Number(p.lat.toFixed(8)),
      lon: Number(p.lon.toFixed(8)),
    };
  }

  function gateExport(idx) {
    if (idx == null) return null;
    return gateAt(idx).map(p => {
      const ll = state.projection.toLL(p.x, p.y);
      return {lat: Number(ll.lat.toFixed(8)), lon: Number(ll.lon.toFixed(8))};
    });
  }

  function polygonExport(c) {
    return analysisPolygon(c).map(p => {
      const ll = state.projection.toLL(p.x, p.y);
      return {lat: Number(ll.lat.toFixed(8)), lon: Number(ll.lon.toFixed(8))};
    });
  }


  function timingLineExport(index) {
    if (index == null) return null;
    return timingLineAt(index).map(p => {
      const ll = state.projection.toLL(p.x, p.y);
      return {
        lat: Number(ll.lat.toFixed(8)),
        lon: Number(ll.lon.toFixed(8)),
      };
    });
  }

  function buildSectorExport() {
    if (state.timing.startFinish == null) return [];

    const boundaries = [state.timing.startFinish, ...state.timing.splits];
    if (boundaries.some(v => v == null)) return [];

    const sectors = [];
    for (let i = 0; i < state.timing.sectorCount; i++) {
      const startIdx = boundaries[i];
      const endIdx = i < state.timing.sectorCount - 1
        ? boundaries[i + 1]
        : state.timing.startFinish;

      const sectorLength = startIdx === endIdx && state.timing.sectorCount === 1
        ? state.referenceLength
        : forwardS(startIdx, endIdx);

      sectors.push({
        id: `S${i + 1}`,
        order: i + 1,
        startS_m: Number(state.reference[startIdx].s.toFixed(3)),
        endS_m: Number(state.reference[endIdx].s.toFixed(3)),
        length_m: Number(sectorLength.toFixed(3)),
        wrapsReferenceOrigin: startIdx === endIdx || state.reference[endIdx].s <= state.reference[startIdx].s,
      });
    }
    return sectors;
  }

  function buildTimingExport() {
    normalizeTiming();
    const issues = timingValidation();

    return {
      complete: issues.length === 0,
      validationIssues: issues,
      timingLineWidth_m: state.timing.lineWidth,
      startFinish: state.timing.startFinish == null ? null : {
        s_m: Number(state.reference[state.timing.startFinish].s.toFixed(3)),
        point: pointForIndex(state.timing.startFinish),
        line: timingLineExport(state.timing.startFinish),
        expectedHeading_deg: Number(headingAt(state.timing.startFinish).toFixed(2)),
      },
      sectorCount: state.timing.sectorCount,
      sectorSplits: state.timing.splits.map((idx, i) => ({
        id: `S${i + 1}_END`,
        afterSector: i + 1,
        s_m: idx == null ? null : Number(state.reference[idx].s.toFixed(3)),
        point: idx == null ? null : pointForIndex(idx),
        line: idx == null ? null : timingLineExport(idx),
        expectedHeading_deg: idx == null ? null : Number(headingAt(idx).toFixed(2)),
      })),
      sectors: buildSectorExport(),
    };
  }

  function makeTrackDefinition() {
    const corners = [];
    const incomplete = [];

    for (const id of TURN_IDS) {
      const c = state.corners[id];
      if (c.start == null || c.apex == null || c.end == null) {
        incomplete.push(id);
        continue;
      }
      corners.push({
        id,
        startS_m: Number(state.reference[c.start].s.toFixed(3)),
        referenceApexS_m: Number(state.reference[c.apex].s.toFixed(3)),
        endS_m: Number(state.reference[c.end].s.toFixed(3)),
        start: pointForIndex(c.start),
        referenceApex: {...pointForIndex(c.apex), kind: "manual_reference_apex"},
        end: pointForIndex(c.end),
        entryGate: gateExport(c.start),
        exitGate: gateExport(c.end),
        analysisPolygon: polygonExport(c),
      });
    }

    return {
      schemaVersion: "1.0.0",
      generatedAt: new Date().toISOString(),
      track: {
        id: state.trackId || "custom-track",
        name: state.trackName || "GNSS Track",
        layout: state.layout || "custom",
        source: {
          geometry: "GNSS median reference + manual timing + corner markup",
          session: state.source || null,
          selectedLaps: state.rawLaps.map(l => ({lap: l.lap, time_s: Number(l.time.toFixed(3))})),
        },
        referencePath: {
          kind: "gnss_median_reference",
          length_m: Number(state.referenceLength.toFixed(3)),
          points: state.reference.map(p => ({
            s_m: Number(p.s.toFixed(3)),
            lat: Number(p.lat.toFixed(8)),
            lon: Number(p.lon.toFixed(8)),
          })),
        },
        timing: buildTimingExport(),
        cornerSettings: {
          gateWidth_m: state.gateWidth,
          analysisBuffer_m: state.bufferWidth,
        },
        cornerOrder: [...TURN_IDS],
        corners,
        incompleteCorners: incomplete,
      }
    };
  }

  function makeProject() {
    return {
      app: t("project.appName"),
      version: 2,
      trackName: state.trackName,
      trackId: state.trackId,
      layout: state.layout,
      source: state.source,
      projection: state.projection ? {lat0: state.projection.lat0, lon0: state.projection.lon0} : null,
      referenceLength: state.referenceLength,
      reference: state.reference.map(p => ({x:p.x,y:p.y,lat:p.lat,lon:p.lon,s:p.s})),
      rawLaps: state.rawLaps,
      timing: state.timing,
      turnIds: TURN_IDS,
      corners: state.corners,
      settings: {gateWidth: state.gateWidth, bufferWidth: state.bufferWidth},
    };
  }

  function downloadJson(obj, fileName) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function saveLocalMarkup() {
    if (!state.trackId || !state.reference.length) return;
    try {
      localStorage.setItem(`corner-editor:${state.trackId}`, JSON.stringify({
        turnIds: TURN_IDS,
        timing: state.timing,
        corners: state.corners,
        settings: {gateWidth: state.gateWidth, bufferWidth: state.bufferWidth}
      }));
    } catch {}
  }

  function loadLocalMarkup() {
    if (!state.trackId) return;
    try {
      const raw = localStorage.getItem(`corner-editor:${state.trackId}`);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (Array.isArray(saved.turnIds) && saved.turnIds.length) TURN_IDS = saved.turnIds;
      if (saved.timing) state.timing = saved.timing;
      normalizeTiming();
      if (saved.corners) state.corners = saved.corners;
      if (saved.settings) {
        state.gateWidth = saved.settings.gateWidth ?? state.gateWidth;
        state.bufferWidth = saved.settings.bufferWidth ?? state.bufferWidth;
      }
    } catch {}
  }

  function importProject(obj) {
    if (!obj.reference?.length || !obj.projection) throw new Error(t("errors.invalidProject"));
    state.trackName = obj.trackName || "GNSS Track";
    state.trackId = obj.trackId || "custom-track";
    state.layout = obj.layout || "custom";
    state.source = obj.source || "project";
    state.projection = projectionFor(obj.projection.lat0, obj.projection.lon0);
    state.reference = obj.reference;
    state.referenceLength = obj.referenceLength;
    state.rawLaps = obj.rawLaps || [];
    state.session = null;
    state.sfGate = null;
    state.timing = obj.timing || defaultTiming();
    normalizeTiming();
    state.timingSetMode = null;
    if (Array.isArray(obj.turnIds) && obj.turnIds.length) TURN_IDS = obj.turnIds.map(normalizeCornerId);
    state.corners = obj.corners || Object.fromEntries(TURN_IDS.map(id => [id, {start:null,apex:null,end:null}]));
    state.gateWidth = obj.settings?.gateWidth ?? 50;
    state.bufferWidth = obj.settings?.bufferWidth ?? 24;
    state.importedProject = true;
    el("sessionWorkflow").classList.add("hidden");
    syncSettingInputs();
    updateDataUi("badges.project", "good");
    fitView();
    updateAllUi();
    setStatus("status.projectImported");
  }

  // ---------------------------------------------------------------------------
  // PIR sample
  // ---------------------------------------------------------------------------

  function loadPirSample() {
    const s = window.PIR_SAMPLE;
    state.trackName = s.trackName;
    state.trackId = s.trackId;
    state.layout = s.layout;
    state.source = s.source;
    state.projection = projectionFor(s.projection.lat0, s.projection.lon0);
    state.session = null;
    state.rawSession = null;
    state.rawLaps = s.rawLaps.map(l => ({
      lap: l.lap,
      time: l.time,
      points: l.points.map(([x,y]) => ({x,y}))
    }));
    state.reference = s.reference.map(p => ({...p}));
    state.referenceLength = s.referenceLengthM;
    state.sfGate = {a: {x:s.sfGate.a[0], y:s.sfGate.a[1]}, b:{x:s.sfGate.b[0], y:s.sfGate.b[1]}};
    state.timing = defaultTiming();
    const sampleSfCenter = {
      x: (state.sfGate.a.x + state.sfGate.b.x) / 2,
      y: (state.sfGate.a.y + state.sfGate.b.y) / 2
    };
    state.timing.startFinish = nearestIndex(state.reference, sampleSfCenter);
    state.lapCandidates = s.lapTimes.map((t, i) => ({
      k: i, lap: i + 1, time: t, selected: s.selectedLapNumbers.includes(i + 1),
      outlier: !s.selectedLapNumbers.includes(i + 1)
    }));
    state.crossings = [];
    TURN_IDS = [...CORNER_PRESETS.pir];
    state.selectedTurn = "T1";
    state.setField = null;
    state.timingSetMode = null;
    state.pointer.mode = null;
    state.corners = Object.fromEntries(TURN_IDS.map(id => [id, {start:null,apex:null,end:null}]));
    loadLocalMarkup();
    syncSettingInputs();
    el("sessionWorkflow").classList.add("hidden");
    updateDataUi("badges.pirSample", "good");
    setStatus("status.pirReady", {laps: state.rawLaps.length});
    fitView();
    updateAllUi();
  }

  function syncSettingInputs() {
    normalizeTiming();
    el("gateWidthInput").value = state.gateWidth;
    el("bufferWidthInput").value = state.bufferWidth;
    el("sectorCountInput").value = state.timing.sectorCount;
    el("timingLineWidthInput").value = state.timing.lineWidth;
  }

  // ---------------------------------------------------------------------------
  // Pointer interactions
  // ---------------------------------------------------------------------------

  function eventLocal(ev) {
    const rect = svg.getBoundingClientRect();
    return {x: ev.clientX - rect.left, y: ev.clientY - rect.top};
  }

  svg.addEventListener("wheel", ev => {
    ev.preventDefault();
    const pt = eventLocal(ev);
    const before = screenToWorld(pt.x, pt.y);
    const factor = ev.deltaY > 0 ? 1.14 : 0.88;
    state.camera.spanX = clamp(state.camera.spanX * factor, 80, 15000);
    const after = screenToWorld(pt.x, pt.y);
    state.camera.cx += before.x - after.x;
    state.camera.cy += before.y - after.y;
    render();
  }, {passive: false});

  svg.addEventListener("pointerdown", ev => {
    const pt = eventLocal(ev);
    const timingHandle = ev.target?.dataset?.timingHandle;
    if (timingHandle && state.reference.length) {
      state.pointer.mode = "drag-timing";
      state.pointer.handle = {timingKind: timingHandle};
      state.setField = null;
      state.timingSetMode = null;
      svg.setPointerCapture(ev.pointerId);
      return;
    }

    const handle = ev.target?.dataset?.handle;
    if (handle && state.reference.length) {
      const [turnId, field] = handle.split(":");
      state.pointer.mode = "drag-handle";
      state.pointer.handle = {turnId, field};
      svg.setPointerCapture(ev.pointerId);
      return;
    }

    if (state.pointer.mode === "sf" || state.timingSetMode || state.setField) {
      return; // pointerup will place.
    }

    state.pointer.mode = "pan";
    state.pointer.lastX = pt.x;
    state.pointer.lastY = pt.y;
    svg.setPointerCapture(ev.pointerId);
  });

  svg.addEventListener("pointermove", ev => {
    const pt = eventLocal(ev);
    const world = screenToWorld(pt.x, pt.y);

    if (state.pointer.mode === "pan") {
      const dx = pt.x - state.pointer.lastX;
      const dy = pt.y - state.pointer.lastY;
      const {w} = plotSize();
      const scale = w / state.camera.spanX;
      state.camera.cx -= dx / scale;
      state.camera.cy += dy / scale;
      state.pointer.lastX = pt.x;
      state.pointer.lastY = pt.y;
      render();
      return;
    }

    if (state.pointer.mode === "drag-timing" && state.reference.length) {
      const idx = nearestIndex(state.reference, world);
      const kind = state.pointer.handle.timingKind;
      if (kind === "sf") state.timing.startFinish = idx;
      else if (kind.startsWith("split:")) {
        const i = Number(kind.split(":")[1]);
        if (i >= 0 && i < state.timing.splits.length) state.timing.splits[i] = idx;
      }
      state.hoverRefIndex = idx;
      render();
      renderTimingUi();
      return;
    }

    if (state.pointer.mode === "drag-handle" && state.reference.length) {
      const idx = nearestIndex(state.reference, world);
      const {turnId, field} = state.pointer.handle;
      state.corners[turnId][field] = idx;
      state.hoverRefIndex = idx;
      render();
      renderPointRows();
      return;
    }

    if (state.reference.length) {
      const idx = nearestIndex(state.reference, world);
      state.hoverRefIndex = idx;
      const p = state.reference[idx];
      el("cursorReadout").textContent = `s ${p.s.toFixed(1)} m · lat ${p.lat.toFixed(6)} · lon ${p.lon.toFixed(6)}`;
      render();
    }
  });

  svg.addEventListener("pointerup", ev => {
    const pt = eventLocal(ev);
    const world = screenToWorld(pt.x, pt.y);

    if (state.pointer.mode === "drag-timing") {
      saveLocalMarkup();
      state.pointer.mode = null;
      state.pointer.handle = null;
      updateAllUi();
      return;
    }

    if (state.pointer.mode === "drag-handle") {
      saveLocalMarkup();
      state.pointer.mode = null;
      state.pointer.handle = null;
      updateAllUi();
      return;
    }

    if (state.pointer.mode === "pan") {
      state.pointer.mode = null;
      return;
    }

    if (state.pointer.mode === "sf") {
      setStartFinishAt(world);
      state.pointer.mode = null;
      return;
    }

    if (state.timingSetMode && state.reference.length) {
      const idx = nearestIndex(state.reference, world);
      const kind = state.timingSetMode;
      setTimingPoint(kind, idx);
      state.timingSetMode = null;
      updateAllUi();
      return;
    }

    if (state.setField && state.reference.length) {
      const idx = nearestIndex(state.reference, world);
      const field = state.setField;
      setCornerPoint(state.selectedTurn, field, idx);

      // Workflow convenience: advance Start -> Apex -> End, then stop.
      if (field === "start") state.setField = "apex";
      else if (field === "apex") state.setField = "end";
      else state.setField = null;

      updateModeHint();
      render();
    }
  });

  svg.addEventListener("pointerleave", () => {
    if (!state.pointer.mode) {
      state.hoverRefIndex = null;
      el("cursorReadout").textContent = "s — · lat — · lon —";
      render();
    }
  });

  // ---------------------------------------------------------------------------
  // DOM events
  // ---------------------------------------------------------------------------

  el("fitBtn").addEventListener("click", fitView);
  el("sampleBtn").addEventListener("click", loadPirSample);
  el("exportBtn").addEventListener("click", () => {
    if (!state.reference.length) return setStatus("status.needReference");
    const incomplete = TURN_IDS.filter(id => cornerStatus(state.corners[id]) !== "complete");
    const timingIssues = timingValidation();
    const warnings = [];
    if (timingIssues.length) warnings.push(t("export.timingIncomplete", {issues: timingIssues.join(" ")}));
    if (incomplete.length) warnings.push(t("export.cornersIncomplete", {corners: incomplete.join(", ")}));
    if (warnings.length && !confirm(t("export.confirmAnyway", {warnings: warnings.join("\n")}))) return;
    downloadJson(makeTrackDefinition(), `${state.trackId || "track"}_track_definition.json`);
  });

  el("csvInput").addEventListener("change", async ev => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      parseGnssCsv(await file.text(), file.name);
      syncSettingInputs();
      updateAllUi();
    } catch (e) {
      alert(e.message);
    } finally {
      ev.target.value = "";
    }
  });

  el("setSfBtn").addEventListener("click", () => {
    if (!state.session?.length) return;
    state.pointer.mode = "sf";
    state.setField = null;
    state.timingSetMode = null;
    updateModeHint();
    setStatus("status.detectionMode");
  });

  el("detectLapsBtn").addEventListener("click", detectLaps);
  el("buildRefBtn").addEventListener("click", buildMedianReference);

  el("lapList").addEventListener("change", ev => {
    const k = Number(ev.target.dataset.lapK);
    const c = state.lapCandidates.find(x => x.k === k);
    if (c) {
      c.selected = ev.target.checked;
      el("buildRefBtn").disabled = !state.lapCandidates.some(x => x.selected);
    }
  });

  el("setTimingSfBtn").addEventListener("click", () => {
    if (!state.reference.length) return setStatus("status.needReference");
    state.setField = null;
    state.pointer.mode = null;
    state.timingSetMode = state.timingSetMode === "sf" ? null : "sf";
    updateAllUi();
  });

  el("clearTimingSfBtn").addEventListener("click", () => {
    state.timing.startFinish = null;
    state.timingSetMode = null;
    saveLocalMarkup();
    updateAllUi();
  });

  el("sectorCountInput").addEventListener("change", ev => {
    setSectorCount(ev.target.value);
  });

  el("timingLineWidthInput").addEventListener("change", ev => {
    state.timing.lineWidth = clamp(Number(ev.target.value) || 55, 20, 150);
    ev.target.value = state.timing.lineWidth;
    saveLocalMarkup();
    updateAllUi();
  });

  el("sectorList").addEventListener("click", ev => {
    const setKind = ev.target.dataset.setTiming;
    if (setKind) {
      state.setField = null;
      state.pointer.mode = null;
      state.timingSetMode = state.timingSetMode === setKind ? null : setKind;
      updateAllUi();
      return;
    }

    const clearKind = ev.target.dataset.clearTiming;
    if (clearKind?.startsWith("split:")) {
      const i = Number(clearKind.split(":")[1]);
      if (i >= 0 && i < state.timing.splits.length) {
        state.timing.splits[i] = null;
        state.timingSetMode = null;
        saveLocalMarkup();
        updateAllUi();
      }
    }
  });

  el("clearTimingBtn").addEventListener("click", () => clearTiming(true));

  el("turnList").addEventListener("click", ev => {
    const id = ev.target.dataset.turn;
    if (id) selectTurn(id);
  });

  document.querySelectorAll(".point-mode").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!state.reference.length) return;
      state.pointer.mode = null;
      state.timingSetMode = null;
      state.setField = state.setField === btn.dataset.field ? null : btn.dataset.field;
      updateModeHint();
      render();
    });
  });

  el("pointRows").addEventListener("click", ev => {
    const field = ev.target.dataset.clearField;
    if (field) clearPoint(state.selectedTurn, field);
  });

  el("prevTurnBtn").addEventListener("click", () => changeTurn(-1));
  el("nextTurnBtn").addEventListener("click", () => changeTurn(1));
  el("clearTurnBtn").addEventListener("click", () => {
    state.corners[state.selectedTurn] = {start:null,apex:null,end:null};
    state.setField = null;
    saveLocalMarkup();
    updateAllUi();
  });

  el("gateWidthInput").addEventListener("change", ev => {
    state.gateWidth = clamp(Number(ev.target.value) || 50, 20, 120);
    ev.target.value = state.gateWidth;
    saveLocalMarkup();
    render();
  });

  el("bufferWidthInput").addEventListener("change", ev => {
    state.bufferWidth = clamp(Number(ev.target.value) || 24, 8, 80);
    ev.target.value = state.bufferWidth;
    saveLocalMarkup();
    render();
  });

  el("showSatelliteToggle").addEventListener("change", ev => {
    state.showSatellite = ev.target.checked;
    render();
  });

  el("satelliteOpacity").addEventListener("input", ev => {
    state.satelliteOpacity = clamp(Number(ev.target.value) / 100, 0.25, 1);
    renderSatellite();
  });

  el("showRawToggle").addEventListener("change", ev => {
    state.showRaw = ev.target.checked;
    render();
  });

  el("showDerivedToggle").addEventListener("change", ev => {
    state.showDerived = ev.target.checked;
    render();
  });

  el("saveProjectBtn").addEventListener("click", () => {
    if (!state.reference.length) return setStatus("status.nothingToSave");
    downloadJson(makeProject(), `${state.trackId || "track"}_track_editor_project.json`);
  });

  el("projectInput").addEventListener("change", async ev => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      importProject(JSON.parse(await file.text()));
    } catch (e) {
      alert(e.message);
    } finally {
      ev.target.value = "";
    }
  });

  el("applyCornerPresetBtn").addEventListener("click", () => {
    const preset = el("cornerPresetSelect").value;
    if (preset === "custom") return;
    if (!confirm(t("corners.presetConfirm"))) return;
    rebuildCornerSet(CORNER_PRESETS[preset], true);
  });

  el("addCornerBtn").addEventListener("click", () => {
    const input = el("newCornerIdInput");
    addCornerId(input.value);
    input.value = "";
  });

  el("newCornerIdInput").addEventListener("keydown", ev => {
    if (ev.key === "Enter") {
      addCornerId(ev.target.value);
      ev.target.value = "";
    }
  });

  el("renameTurnBtn").addEventListener("click", renameSelectedTurn);
  el("deleteTurnBtn").addEventListener("click", deleteSelectedTurn);

  el("arcgisTokenInput").addEventListener("change", ev => {
    state.arcgisToken = ev.target.value.trim();
    if (state.arcgisToken) localStorage.setItem("gnss-corner-editor:arcgis-token", state.arcgisToken);
    else localStorage.removeItem("gnss-corner-editor:arcgis-token");
    satelliteLayer.innerHTML = "";
    renderSatellite();
  });

  el("resetMarkupBtn").addEventListener("click", () => resetCorners(true));

  window.addEventListener("resize", render);
  new ResizeObserver(() => render()).observe(plotWrap);

  // Keyboard shortcuts: 1/2/3 = Start/Apex/End, Esc cancels.
  window.addEventListener("keydown", ev => {
    if (ev.key === "Escape") {
      state.setField = null;
      state.timingSetMode = null;
      if (state.pointer.mode === "sf") state.pointer.mode = null;
      updateModeHint();
      render();
      return;
    }
    if (["1","2","3"].includes(ev.key) && state.reference.length) {
      state.setField = ev.key === "1" ? "start" : ev.key === "2" ? "apex" : "end";
      state.pointer.mode = null;
      updateModeHint();
      render();
    }
  });

  window.addEventListener("track-editor-language-change", () => {
    updateAllUi();
    refreshStatus();
  });

  // Initialize.
  el("arcgisTokenInput").value = state.arcgisToken;
  loadPirSample();
})();
