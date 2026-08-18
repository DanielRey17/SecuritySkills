(() => {
  'use strict';

  const data = window.TRANSIT_DATA;
  if (!data || !window.L) {
    document.body.innerHTML = '<p style="padding:24px;font-family:sans-serif">No se pudo cargar el mapa. Revisa tu conexión a internet.</p>';
    return;
  }

  const map = L.map('map', { zoomControl: false, preferCanvas: true }).setView([18.995, -98.19], 12);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const routeLayers = {};
  const anchorLayers = {};
  let activeRoute = 'all';
  let watchId = null;
  let userMarker = null;
  let accuracyCircle = null;
  let followUser = false;
  let lastPosition = null;
  let nearestPoint = null;

  function routeStyle(route) {
    return { color: route.color, weight: 6, opacity: 0.88, lineCap: 'round', lineJoin: 'round' };
  }

  Object.values(data.routes).forEach(route => {
    routeLayers[route.id] = L.polyline(route.path, routeStyle(route)).addTo(map);
    routeLayers[route.id].bindPopup(`<strong>${route.name}</strong><br>${route.description}<br><small>${route.hours} · trazado v0 provisional</small>`);

    anchorLayers[route.id] = L.layerGroup(route.anchors.map(a => L.circleMarker([a.lat, a.lng], {
      radius: 4.5,
      color: route.color,
      fillColor: '#ffffff',
      fillOpacity: 1,
      weight: 2
    }).bindTooltip(`${route.name} · ${a.name}`, { direction: 'top' }))).addTo(map);
  });

  data.landmarks.forEach(place => {
    const icon = L.divIcon({
      className: '',
      html: `<div class="landmark-icon">${place.icon}</div>`,
      iconSize: [29, 29], iconAnchor: [14, 14]
    });
    L.marker([place.lat, place.lng], { icon }).addTo(map).bindTooltip(place.name, { direction: 'top' });
  });

  function allRouteBounds() {
    const points = Object.values(data.routes).flatMap(r => r.path);
    points.push([18.93519, -98.14750]);
    return L.latLngBounds(points);
  }

  map.fitBounds(allRouteBounds(), { padding: [22, 22] });

  function setRouteFilter(routeId) {
    activeRoute = routeId;
    document.querySelectorAll('.route-chip[data-route]').forEach(btn => btn.classList.toggle('active', btn.dataset.route === routeId));
    Object.keys(data.routes).forEach(id => {
      const show = routeId === 'all' || routeId === id;
      if (show) {
        if (!map.hasLayer(routeLayers[id])) routeLayers[id].addTo(map);
        if (!map.hasLayer(anchorLayers[id])) anchorLayers[id].addTo(map);
      } else {
        map.removeLayer(routeLayers[id]);
        map.removeLayer(anchorLayers[id]);
      }
    });
    if (lastPosition) updateNearest(lastPosition.lat, lastPosition.lng);
  }

  document.querySelectorAll('.route-chip[data-route]').forEach(btn => {
    btn.addEventListener('click', () => setRouteFilter(btn.dataset.route));
  });

  document.getElementById('fitBtn').addEventListener('click', () => {
    const points = activeRoute === 'all'
      ? Object.values(data.routes).flatMap(r => r.path)
      : data.routes[activeRoute].path;
    map.fitBounds(L.latLngBounds(points), { padding: [24, 24] });
  });

  function toXY(lat, lng, refLat) {
    const R = 6371000;
    const x = lng * Math.PI / 180 * R * Math.cos(refLat * Math.PI / 180);
    const y = lat * Math.PI / 180 * R;
    return [x, y];
  }

  function nearestOnSegment(lat, lng, a, b) {
    const refLat = lat;
    const p = toXY(lat, lng, refLat);
    const p1 = toXY(a[0], a[1], refLat);
    const p2 = toXY(b[0], b[1], refLat);
    const vx = p2[0] - p1[0], vy = p2[1] - p1[1];
    const wx = p[0] - p1[0], wy = p[1] - p1[1];
    const len2 = vx * vx + vy * vy;
    let t = len2 ? (wx * vx + wy * vy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const x = p1[0] + t * vx, y = p1[1] + t * vy;
    const dx = p[0] - x, dy = p[1] - y;
    const nearestLat = a[0] + t * (b[0] - a[0]);
    const nearestLng = a[1] + t * (b[1] - a[1]);
    return { distance: Math.sqrt(dx * dx + dy * dy), lat: nearestLat, lng: nearestLng };
  }

  function nearestToRoute(route, lat, lng) {
    let best = { distance: Infinity, lat: null, lng: null };
    for (let i = 0; i < route.path.length - 1; i++) {
      const candidate = nearestOnSegment(lat, lng, route.path[i], route.path[i + 1]);
      if (candidate.distance < best.distance) best = candidate;
    }
    return best;
  }

  function formatDistance(m) {
    if (!Number.isFinite(m)) return '—';
    return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
  }

  function updateNearest(lat, lng) {
    const routeIds = activeRoute === 'all' ? Object.keys(data.routes) : [activeRoute];
    let best = null;
    routeIds.forEach(id => {
      const result = nearestToRoute(data.routes[id], lat, lng);
      if (!best || result.distance < best.distance) best = { ...result, routeId: id };
    });
    if (!best) return;
    nearestPoint = best;
    const route = data.routes[best.routeId];
    document.getElementById('nearestRoute').textContent = route.name;
    document.getElementById('nearestDistance').textContent = formatDistance(best.distance);
    document.getElementById('googleBtn').disabled = false;
    document.getElementById('statusText').textContent = best.distance < 120
      ? `Estás prácticamente sobre el trazado provisional de ${route.name}.`
      : `El trazado provisional de ${route.name} es el más cercano a tu ubicación.`;
  }

  function setGpsUi(state, message) {
    const badge = document.getElementById('gpsBadge');
    const gpsState = document.getElementById('gpsState');
    badge.textContent = message;
    gpsState.textContent = state;
  }

  function onPosition(pos) {
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    lastPosition = { lat, lng, accuracy };
    const latlng = [lat, lng];

    if (!userMarker) {
      const icon = L.divIcon({ className: '', html: '<div class="user-dot"></div>', iconSize: [20, 20], iconAnchor: [10, 10] });
      userMarker = L.marker(latlng, { icon, zIndexOffset: 1000 }).addTo(map).bindPopup('Tu ubicación');
      accuracyCircle = L.circle(latlng, { radius: accuracy, color: '#2563eb', weight: 1, fillColor: '#2563eb', fillOpacity: .08 }).addTo(map);
    } else {
      userMarker.setLatLng(latlng);
      accuracyCircle.setLatLng(latlng).setRadius(accuracy);
    }

    document.getElementById('statusTitle').textContent = 'Ubicación activa';
    document.getElementById('accuracyBadge').textContent = `±${Math.round(accuracy)} m`;
    setGpsUi('On', 'GPS activo');
    updateNearest(lat, lng);
    if (followUser) map.setView(latlng, Math.max(map.getZoom(), 16), { animate: true });
  }

  function onPositionError(err) {
    const messages = {
      1: 'Permiso de ubicación denegado',
      2: 'No se pudo obtener la ubicación',
      3: 'El GPS tardó demasiado'
    };
    document.getElementById('statusTitle').textContent = 'GPS no disponible';
    document.getElementById('statusText').textContent = messages[err.code] || err.message || 'Error de ubicación';
    setGpsUi('Error', 'GPS sin acceso');
  }

  function startGps() {
    if (!('geolocation' in navigator)) {
      onPositionError({ code: 2, message: 'Tu navegador no ofrece geolocalización.' });
      return;
    }
    if (watchId !== null) {
      if (lastPosition) map.setView([lastPosition.lat, lastPosition.lng], 16);
      return;
    }
    document.getElementById('statusTitle').textContent = 'Buscando ubicación…';
    setGpsUi('…', 'Buscando GPS…');
    watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 15000
    });
  }

  document.getElementById('locateBtn').addEventListener('click', () => {
    followUser = true;
    document.getElementById('followBtn').classList.add('tracking');
    startGps();
    if (lastPosition) map.setView([lastPosition.lat, lastPosition.lng], 16);
  });

  document.getElementById('followBtn').addEventListener('click', () => {
    followUser = !followUser;
    document.getElementById('followBtn').classList.toggle('tracking', followUser);
    if (followUser) {
      startGps();
      if (lastPosition) map.setView([lastPosition.lat, lastPosition.lng], 16);
    }
  });

  document.getElementById('googleBtn').addEventListener('click', () => {
    if (!nearestPoint) return;
    const destination = `${nearestPoint.lat.toFixed(6)},${nearestPoint.lng.toFixed(6)}`;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=walking`;
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  const dialog = document.getElementById('infoDialog');
  document.getElementById('infoBtn').addEventListener('click', () => dialog.showModal());
  document.getElementById('closeInfo').addEventListener('click', () => dialog.close());

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
