(() => {
  'use strict';

  const TILE_SIZE = 256;
  const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const OSM_SUBDOMAINS = 'abc';

  const els = {
    map: document.getElementById('map'),
    lat: document.getElementById('hud-lat'),
    lng: document.getElementById('hud-lng'),
    zoom: document.getElementById('hud-zoom'),
    progressBar: document.getElementById('hud-progress-bar'),
    body: document.body,
    toast: document.getElementById('toast'),
    btnLocate: document.getElementById('btn-locate'),
    btnSettings: document.getElementById('btn-settings'),
    btnCloseSettings: document.getElementById('btn-close-settings'),
    settings: document.getElementById('settings'),
    scaleEl: document.getElementById('pixel-scale'),
    scaleVal: document.getElementById('pixel-scale-val'),
    levelsEl: document.getElementById('pixel-levels'),
    levelsVal: document.getElementById('pixel-levels-val'),
    scanlines: document.getElementById('scanlines'),
    splash: document.getElementById('splash'),
  };

  /* ---------------- map ---------------- */
  const map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
    minZoom: 2,
    maxZoom: 19,
    worldCopyJump: true,
  }).setView([20, 0], 2);

  /* ---------------- pixel tile layer ---------------- */
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
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map);

  /* downsample + posterize an image into the tile canvas */
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
      } catch (e) {
        /* canvas tainted - skip posterize */
      }
    }

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mini, 0, 0, w, h);
  }

  /* ---------------- pixel pin icon ---------------- */
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

    lx.fillStyle = '#111';
    pinPath(lx, cx, cy, r + 0.9, tipY + 0.6);
    lx.fillStyle = color;
    pinPath(lx, cx, cy, r, tipY);
    lx.fillStyle = '#000';
    lx.beginPath();
    lx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
    lx.closePath();
    lx.fill();
    lx.fillStyle = 'rgba(255,255,255,.6)';
    lx.fillRect(cx - r * 0.7, cy - r * 0.55, r * 0.45, r * 0.3);

    const out = document.createElement('canvas');
    const size = pixels * 4;
    out.width = out.height = size;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(low, 0, 0, size, size);
    return out.toDataURL();
  }

  const PIN = makePinDataUrl(16, '#ff4d5a');

  const playerIcon = L.divIcon({
    className: 'player-div',
    html:
      '<div class="player-ring"></div>' +
      '<div class="player-ring player-ring2"></div>' +
      '<div class="player-bounce"><img src="' + PIN + '" width="48" height="48" alt="you are here" /></div>',
    iconSize: [48, 48],
    iconAnchor: [24, 45],
    popupAnchor: [0, -42],
  });

  const player = L.marker([0, 0], { icon: playerIcon, zIndexOffset: 1000 });
  const accuracy = L.circle([0, 0], {
    radius: 0,
    color: '#22c55e',
    weight: 2,
    fillColor: '#22c55e',
    fillOpacity: 0.08,
    interactive: false,
    className: 'accuracy-path',
  });
  const playerGroup = L.layerGroup([player, accuracy]).addTo(map);

  /* ---------------- player placement ---------------- */
  let firstFix = true;
  let hasPlayer = false;

  function placePlayer(latlng, acc, label, fly, open) {
    player.setLatLng(latlng);
    if (acc > 0) {
      accuracy.setLatLng(latlng).setRadius(acc);
    }
    player.bindPopup(
      '<div class="pixel-popup">' + label +
      '<span class="dim">' + latlng.lat.toFixed(4) + ' , ' + latlng.lng.toFixed(4) + '</span></div>',
      { closeButton: true, offset: [0, -6] }
    );
    if (firstFix || open) {
      player.openPopup();
      firstFix = false;
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

  /* ---------------- geolocation ---------------- */
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

  /* click anywhere to drop a marker (great for testing) */
  map.on('click', (e) => {
    placePlayer(e.latlng, 0, 'MARKER', false, true);
    showToast(
      'MARKER @ ' + e.latlng.lat.toFixed(4) + ' , ' + e.latlng.lng.toFixed(4),
      3200
    );
  });

  /* ---------------- toast ---------------- */
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

  /* ---------------- splash / ready ---------------- */
  let splashHidden = false;
  function hideSplash() {
    if (splashHidden) return;
    splashHidden = true;
    els.body.classList.add('map-ready');
    els.splash.classList.add('hidden');
  }
  tiles.once('load', hideSplash);
  setTimeout(hideSplash, 8000);

  /* ---------------- settings ---------------- */
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

  /* ---------------- boot ---------------- */
  refreshHud();
  locateMe();
})();
