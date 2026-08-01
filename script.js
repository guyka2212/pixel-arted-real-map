(() => {
  'use strict';

  const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const OSM_SUBDOMAINS = 'abc';

  const q = (sel) => document.querySelector(sel);

  const els = {
    map: q('.map'),
    lat: q('.hud-lat'),
    lng: q('.hud-lng'),
    zoom: q('.hud-zoom'),
    body: document.body,
    toast: q('.toast'),
    btnLocate: q('.btn-locate'),
    btnSettings: q('.btn-settings'),
    btnCloseSettings: q('.btn-close-settings'),
    settings: q('.settings'),
    scaleEl: q('.pixel-scale'),
    scaleVal: q('.pixel-scale-val'),
    levelsEl: q('.pixel-levels'),
    levelsVal: q('.pixel-levels-val'),
    scanlines: q('.scanlines'),
    splash: q('.splash'),
  };

  const map = L.map(els.map, {
    zoomControl: false,
    attributionControl: false,
    minZoom: 2,
    maxZoom: 19,
    worldCopyJump: true,
  }).setView([20, 0], 2);

  const PixelTileLayer = L.TileLayer.extend({
    createTile(coords, done) {
      const size = this.getTileSize();
      const canvas = document.createElement('canvas');
      canvas.width = size.x;
      canvas.height = size.y;
      canvas.setAttribute('role', 'presentation');

      const img = document.createElement('img');
      img.crossOrigin = 'anonymous';
      img.alt = '';
      img.onload = () => {
        try {
          drawPixel(canvas, img, this.options.pixelScale, this.options.posterize);
          done(null, canvas);
        } catch (err) {
          done(err);
        }
      };
      img.onerror = () => done(new Error('tile load failed'));
      img.src = this.getTileUrl(coords);
      return canvas;
    },
  });

  const tiles = new PixelTileLayer(OSM_URL, {
    subdomains: OSM_SUBDOMAINS,
    minZoom: 2,
    maxZoom: 19,
    maxNativeZoom: 19,
    crossOrigin: true,
    pixelScale: 5,
    posterize: 32,
    attribution: '&copy; <a href=\'https://www.openstreetmap.org/copyright\'>OpenStreetMap</a> contributors',
  }).addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);

  function drawPixel(canvas, img, scale, posterize) {
    const w = canvas.width;
    const h = canvas.height;
    const pw = Math.max(2, Math.round(w / scale));
    const ph = Math.max(2, Math.round(h / scale));

    const mini = document.createElement('canvas');
    mini.width = pw;
    mini.height = ph;
    const mctx = mini.getContext('2d');
    mctx.imageSmoothingEnabled = false;
    mctx.drawImage(img, 0, 0, pw, ph);

    if (posterize && posterize < 256) {
      try {
        const data = mctx.getImageData(0, 0, pw, ph);
        const d = data.data;
        const step = 256 / posterize;
        for (let i = 0; i < d.length; i += 4) {
          d[i] = Math.floor(d[i] / step) * step;
          d[i + 1] = Math.floor(d[i + 1] / step) * step;
          d[i + 2] = Math.floor(d[i + 2] / step) * step;
        }
        mctx.putImageData(data, 0, 0);
      } catch (e) {}
    }

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mini, 0, 0, w, h);
  }

  function pinPath(ctx, cx, cy, r, tipY) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx, cy + r * 0.45);
    ctx.lineTo(cx - r * 0.95, tipY);
    ctx.lineTo(cx + r * 0.95, tipY);
    ctx.closePath();
    ctx.fill();
  }

  function makePinDataUrl(pixels, color) {
    const low = document.createElement('canvas');
    low.width = low.height = pixels;
    const lx = low.getContext('2d');
    lx.imageSmoothingEnabled = false;

    const cx = pixels / 2;
    const cy = pixels * 0.4;
    const r = pixels * 0.3;
    const tipY = pixels - 2;

    lx.fillStyle = 'rgb(17, 17, 17)';
    pinPath(lx, cx, cy, r + 0.9, tipY + 0.6);
    lx.fillStyle = color;
    pinPath(lx, cx, cy, r, tipY);
    lx.fillStyle = 'rgb(0, 0, 0)';
    lx.beginPath();
    lx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
    lx.closePath();
    lx.fill();
    lx.fillStyle = 'rgba(255, 255, 255, .6)';
    lx.fillRect(cx - r * 0.7, cy - r * 0.55, r * 0.45, r * 0.3);

    const out = document.createElement('canvas');
    const size = pixels * 4;
    out.width = out.height = size;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(low, 0, 0, size, size);
    return out.toDataURL();
  }

  const PIN = makePinDataUrl(16, 'rgb(255, 77, 90)');

  const playerIcon = L.divIcon({
    className: 'player-div',
    html: `<div class='player-ring'></div><div class='player-ring player-ring2'></div><div class='player-bounce'><img src='${PIN}' width='48' height='48' alt='you are here' /></div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 45],
    popupAnchor: [0, -42],
  });

  const player = L.marker([0, 0], { icon: playerIcon, zIndexOffset: 1000, interactive: false });
  const accuracy = L.circle([0, 0], {
    radius: 0,
    color: 'rgb(34, 197, 94)',
    weight: 2,
    fillColor: 'rgb(34, 197, 94)',
    fillOpacity: 0.08,
    interactive: false,
    className: 'accuracy-path',
  });
  const playerGroup = L.layerGroup([player, accuracy]).addTo(map);

  let firstFix = true;
  let hasPlayer = false;

  function placePlayer(latlng, acc, label, fly, open) {
    player.setLatLng(latlng);
    if (acc > 0) {
      accuracy.setLatLng(latlng).setRadius(acc);
    }
    player.bindPopup(
      `<div class='pixel-popup'>${label}<span class='dim'>${latlng.lat.toFixed(4)} , ${latlng.lng.toFixed(4)}</span></div>`,
      { closeButton: true, offset: [0, -6] }
    );
    if ((firstFix && fly) || open) {
      player.openPopup();
      firstFix = false;
      setTimeout(() => player.closePopup(), 4000);
    }
    hasPlayer = true;
    updateHud(latlng);
    hideToast();
    if (fly) {
      map.flyTo(latlng, Math.max(map.getZoom(), 16), { duration: 1.4 });
    }
  }

  function updateHud(latlng) {
    els.lat.textContent = latlng.lat.toFixed(4);
    els.lng.textContent = latlng.lng.toFixed(4);
  }

  function refreshHud() {
    els.zoom.textContent = map.getZoom();
    if (hasPlayer) {
      updateHud(player.getLatLng());
    } else {
      updateHud(map.getCenter());
    }
  }
  map.on('move', refreshHud);

  function locateMe() {
    if (!navigator.geolocation) {
      showToast('GEOLOCATION NOT SUPPORTED.\nCLICK THE MAP TO PLACE A MARKER.');
      return;
    }
    showToast('LOCATING...', 2500);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy: acc } = pos.coords;
        placePlayer(L.latLng(latitude, longitude), acc, 'YOU ARE HERE', true);
      },
      (err) => {
        let msg = 'CANNOT GET POSITION.';
        if (err.code === err.PERMISSION_DENIED) msg = 'LOCATION BLOCKED BY THE BROWSER.';
        else if (err.code === err.TIMEOUT) msg = 'LOCATION TIMED OUT.';
        showToast(msg + '\nCLICK THE MAP TO PLACE A MARKER.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }

  els.btnLocate.addEventListener('click', locateMe);

  let toastTimer;
  function showToast(msg, ms) {
    els.toast.textContent = msg;
    els.toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, ms || 4500);
  }
  function hideToast() {
    els.toast.classList.add('hidden');
  }

  let splashHidden = false;
  function hideSplash() {
    if (splashHidden) return;
    splashHidden = true;
    els.body.classList.add('map-ready');
    els.splash.classList.add('hidden');
  }
  tiles.once('load', hideSplash);
  setTimeout(hideSplash, 8000);

  function applyTileSettings() {
    tiles.options.pixelScale = Number(els.scaleEl.value);
    tiles.options.posterize = Number(els.levelsEl.value);
    els.scaleVal.textContent = els.scaleEl.value;
    els.levelsVal.textContent = els.levelsEl.value;
    tiles.redraw();
  }

  els.scaleEl.addEventListener('input', applyTileSettings);
  els.levelsEl.addEventListener('input', applyTileSettings);
  els.scanlines.addEventListener('change', () => {
    els.body.classList.toggle('scan', els.scanlines.checked);
  });
  els.btnSettings.addEventListener('click', () => els.settings.classList.toggle('hidden'));
  els.btnCloseSettings.addEventListener('click', () => els.settings.classList.add('hidden'));

  const PLACE_OK = ['city', 'town', 'municipality', 'village', 'borough', 'island', 'suburb', 'neighbourhood', 'quarter', 'square', 'locality', 'hamlet', 'farm', 'islet', 'isolated_dwelling'];
  const NATURAL_OK = ['peak', 'mountain', 'volcano', 'hill', 'cape', 'bay', 'island', 'islet'];

  function placeRankFor(value) {
    const n = { peak: 2, mountain: 2, volcano: 2, hill: 3, cape: 3, bay: 3, island: 2, islet: 4 };
    if (n[value] !== undefined) return n[value];
    const p = {
      city: 0,
      town: 1,
      municipality: 1,
      village: 2,
      borough: 2,
      island: 2,
      suburb: 3,
      neighbourhood: 3,
      quarter: 3,
      square: 3,
      locality: 4,
      hamlet: 4,
      farm: 4,
      islet: 4,
      isolated_dwelling: 4,
    };
    return p[value] === undefined ? 3 : p[value];
  }

  function placeRank(tags) {
    return placeRankFor(tags.natural || tags.place);
  }

  const OVERPASS_URLS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.osm.ch/api/interpreter',
    'https://overpass.kaart.com/api/interpreter',
    'https://overpass.nchc.org.tw/api/interpreter',
  ];

  let placesLayer = null;
  let placesTimer = null;
  let placesAbort = null;

  function fetchWithTimeout(url, opts, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), ms);
      fetch(url, opts)
        .then((res) => { clearTimeout(timer); resolve(res); })
        .catch((err) => { clearTimeout(timer); reject(err); });
    });
  }

  const RANK_COLORS = [
    'rgb(0, 0, 0)',
    'rgb(0, 0, 0)',
    'rgb(0, 0, 0)',
    'rgb(0, 0, 0)',
    'rgb(0, 0, 0)',
  ];
  const RANK_PX = [9, 9, 8, 8, 7];

  function placeIcon(color) {
    return L.divIcon({
      className: 'place-pixel-icon',
      html: `<div style='--pc:${color}'></div>`,
      iconSize: [5, 5],
      iconAnchor: [2, 2],
    });
  }

  function pixelLabelCanvas(name, rank) {
    const color = RANK_COLORS[rank] || RANK_COLORS[3];
    const fontSize = RANK_PX[rank] || 8;
    const probe = document.createElement('canvas');
    const pctx = probe.getContext('2d');
    const font = `${fontSize}px 'Press Start 2P', monospace`;
    pctx.font = font;
    const textW = Math.ceil(pctx.measureText(name).width);
    const padX = 4;
    const padY = 2;
    const boxH = fontSize + padY * 2;
    const lowW = textW + padX * 2;
    const lowH = boxH;
    const low = document.createElement('canvas');
    low.width = lowW;
    low.height = lowH;
    const lx = low.getContext('2d');
    lx.font = font;
    lx.textBaseline = 'top';
    const textX = Math.round((lowW - textW) / 2);
    lx.fillStyle = 'rgba(0, 0, 0, .85)';
    lx.fillText(name, textX + 1, padY + 1);
    lx.fillStyle = color;
    lx.fillText(name, textX, padY);
    const scale = 2;
    const out = document.createElement('canvas');
    out.width = lowW * scale;
    out.height = lowH * scale;
    out.className = 'pixel-label';
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(low, 0, 0, out.width, out.height);
    return out;
  }

  function addPlaceLabel(latlng, name, rank) {
    const label = pixelLabelCanvas(name, rank);
    const marker = L.marker(latlng, {
      interactive: false,
      keyboard: false,
      icon: placeIcon(RANK_COLORS[rank] || RANK_COLORS[3]),
    });
    marker.bindTooltip(label, {
      permanent: true,
      direction: 'top',
      className: 'place-tooltip pl-' + rank,
      offset: [1, Math.round(label.height / 2) + 6.5],
    });
    return marker;
  }

  let placesData = null;
  function redrawPlaces() {
    if (placesData) placesData.render();
  }

  function renderPlaceItems(items, maxCount) {
    items.sort((a, b) => (a.rank - b.rank) || (a.dist - b.dist));
    if (placesLayer) placesLayer.clearLayers();
    placesLayer = L.layerGroup().addTo(map);
    const seen = new Set();
    for (const item of items.slice(0, maxCount)) {
      const key = item.rank + ':' + item.name;
      if (seen.has(key)) continue;
      seen.add(key);
      placesLayer.addLayer(addPlaceLabel(item.latlng, item.name, item.rank));
    }
  }

  function renderPlaces(json, center) {
    placesData = { render: () => renderPlaces(json, center) };
    const items = [];
    for (const el of json.elements || []) {
      if (!el.tags) continue;
      const name = el.tags['name:en'] || el.tags.name;
      if (!name) continue;
      const hasPt = el.lat !== undefined && el.lat !== null;
      const hasCenter = el.center && el.center.lat !== undefined && el.center.lon !== undefined;
      if (!hasPt && !hasCenter) continue;
      const latlng = hasPt ? [el.lat, el.lon] : [el.center.lat, el.center.lon];
      const rank = placeRank(el.tags);
      items.push({ name: name, rank: rank, dist: map.distance(center, latlng), latlng: latlng });
    }
    renderPlaceItems(items, 40);
  }

  function renderPhotonPlaces(json, center) {
    placesData = { render: () => renderPhotonPlaces(json, center) };
    const items = [];
    for (const f of json.features || []) {
      const props = f.properties || {};
      const name = props.name;
      if (!name) continue;
      const value = props.osm_value;
      if (props.osm_key === 'place' && PLACE_OK.indexOf(value) < 0) continue;
      if (props.osm_key === 'natural' && NATURAL_OK.indexOf(value) < 0) continue;
      if (props.osm_key !== 'place' && props.osm_key !== 'natural') continue;
      const coords = f.geometry && f.geometry.coordinates;
      if (!coords || coords.length < 2) continue;
      const latlng = [coords[1], coords[0]];
      const rank = placeRankFor(value);
      items.push({ name: name, rank: rank, dist: map.distance(center, latlng), latlng: latlng });
    }
    renderPlaceItems(items, 40);
  }

  function loadPlaces(center, zoom) {
    if (zoom < 4) return;
    if (placesAbort) placesAbort.abort();
    placesAbort = new AbortController();
    const signal = placesAbort.signal;
    const radius = Math.round(Math.max(2000, Math.min(400000, 400000 / Math.pow(2, zoom - 4))));
    let resolved = false;
    const finish = (fn) => {
      if (!signal.aborted && !resolved) {
        resolved = true;
        fn();
      }
    };
    const query = `[out:json][timeout:20];(node['place'](around:${radius},${center.lat},${center.lng});way['place'](around:${radius},${center.lat},${center.lng});node['natural'~'(peak|mountain|hill|volcano|cape|bay|island|islet)'](around:${radius},${center.lat},${center.lng}););out center tags;`;
    const opts = { method: 'POST', body: 'data=' + encodeURIComponent(query), signal: signal };
    const targets = [OVERPASS_URLS[0], OVERPASS_URLS[0]].concat(OVERPASS_URLS.slice(1));
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
    const attempt = (i, tries) => {
      if (signal.aborted) return;
      if (i >= targets.length) {
        if (tries < 4 && !signal.aborted) {
          delay(8000).then(() => attempt(0, tries + 1));
        }
        return;
      }
      fetchWithTimeout(targets[i], opts, 12000)
        .then((res) => {
          if (!res.ok) throw new Error('bad status');
          return res.json();
        })
        .then((json) => {
          finish(() => renderPlaces(json, center));
        })
        .catch((err) => {
          if (!signal.aborted && err.name !== 'AbortError') {
            delay(2000).then(() => attempt(i + 1, tries));
          }
        });
    };
    attempt(0, 0);

    const url = `https://photon.komoot.io/reverse?lon=${center.lng}&lat=${center.lat}&limit=40&lang=en&layer=locality&layer=city&layer=district&layer=county&layer=state&layer=country&layer=other`;
    fetchWithTimeout(url, { signal: signal }, 15000)
      .then((res) => {
        if (!res.ok) throw new Error('bad status');
        return res.json();
      })
      .then((json) => {
        finish(() => renderPhotonPlaces(json, center));
      })
      .catch(() => {});
  }

  function schedulePlaces() {
    clearTimeout(placesTimer);
    if (map.getZoom() < 4) {
      if (placesLayer) placesLayer.clearLayers();
      return;
    }
    placesTimer = setTimeout(() => loadPlaces(map.getCenter(), map.getZoom()), 300);
  }
  map.on('moveend', schedulePlaces);

  refreshHud();
  schedulePlaces();
  locateMe();

  if (document.fonts && document.fonts.load) {
    document.fonts.load(`9px 'Press Start 2P'`).then(redrawPlaces).catch(() => {});
  }
})();
