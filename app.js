(() => {
  'use strict';
  const data = window.TRANSIT_DATA;
  if (!data || !window.L) return;

  const map = L.map('map', { zoomControl:false, preferCanvas:true }).setView([18.995,-98.19],12);
  L.control.zoom({position:'bottomleft'}).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);

  const layers = {}, geometry = {};
  let activeRoute='all', activeDirection='all', watchId=null, userMarker=null, accuracyCircle=null, followUser=false, lastPosition=null, nearestPoint=null;

  const firstControls=document.querySelector('.controls');
  const directionControls=document.createElement('section');
  directionControls.className='controls';
  directionControls.setAttribute('aria-label','Sentido de ruta');
  directionControls.innerHTML='<button class="route-chip active" data-direction="all" type="button">Ambas</button><button class="route-chip" data-direction="ida" type="button">Ida</button><button class="route-chip" data-direction="vuelta" type="button">Vuelta</button>';
  firstControls.insertAdjacentElement('afterend',directionControls);

  const cards=document.querySelectorAll('.route-card .hours');
  if(cards[0]) cards[0].innerHTML='<strong>Continua:</strong> ida · <strong>Punteada:</strong> vuelta · 06:00–22:00 aprox.';
  if(cards[1]) cards[1].innerHTML='<strong>Continua:</strong> ida · <strong>Punteada:</strong> vuelta · 06:00–22:00 aprox.';

  function style(route,direction){
    return direction==='ida'
      ? {color:route.color,weight:8,opacity:.72,lineCap:'round',lineJoin:'round'}
      : {color:route.color,weight:5,opacity:1,dashArray:'12 10',lineCap:'round',lineJoin:'round'};
  }

  async function snapToRoads(path){
    const coords=path.map(([lat,lng])=>`${lng},${lat}`).join(';');
    const url=`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false&continue_straight=true`;
    const r=await fetch(url,{mode:'cors'});
    if(!r.ok) throw new Error(`OSRM ${r.status}`);
    const j=await r.json();
    if(j.code!=='Ok'||!j.routes?.[0]?.geometry?.coordinates) throw new Error('Sin geometría');
    return j.routes[0].geometry.coordinates.map(([lng,lat])=>[lat,lng]);
  }

  function visibleKeys(){
    const rs=activeRoute==='all'?Object.keys(data.routes):[activeRoute];
    const ds=activeDirection==='all'?['ida','vuelta']:[activeDirection];
    return rs.flatMap(r=>ds.map(d=>`${r}:${d}`));
  }

  function applyFilters(){
    document.querySelectorAll('[data-route]').forEach(b=>b.classList.toggle('active',b.dataset.route===activeRoute));
    document.querySelectorAll('[data-direction]').forEach(b=>b.classList.toggle('active',b.dataset.direction===activeDirection));
    const visible=new Set(visibleKeys());
    Object.entries(layers).forEach(([k,l])=>{
      if(visible.has(k)){if(!map.hasLayer(l))l.addTo(map);} else if(map.hasLayer(l))map.removeLayer(l);
    });
    if(lastPosition) updateNearest(lastPosition.lat,lastPosition.lng);
  }

  function fitVisible(){
    const pts=[];
    visibleKeys().forEach(k=>{if(geometry[k])pts.push(...geometry[k]);});
    if(pts.length) map.fitBounds(L.latLngBounds(pts),{padding:[22,22]});
  }

  async function buildRoutes(){
    const badge=document.getElementById('gpsBadge');
    badge.textContent='Ajustando rutas a calles…';
    const jobs=[];
    Object.values(data.routes).forEach(route=>{
      Object.entries(route.directions).forEach(([directionId,direction])=>{
        jobs.push((async()=>{
          const key=`${route.id}:${directionId}`;
          let path;
          try{ path=await snapToRoads(direction.path); }
          catch(e){ console.warn('No se pudo ajustar',key,e); path=direction.path; }
          geometry[key]=path;
          const layer=L.polyline(path,style(route,directionId)).addTo(map);
          layer.bindPopup(`<strong>${route.name}</strong><br>${direction.label}<br><small>${route.hours}</small>`);
          layers[key]=layer;
        })());
      });
    });
    await Promise.all(jobs);
    badge.textContent='GPS apagado';
    applyFilters();
    fitVisible();
  }

  data.landmarks.forEach(place=>{
    const icon=L.divIcon({className:'',html:`<div class="landmark-icon">${place.icon}</div>`,iconSize:[29,29],iconAnchor:[14,14]});
    L.marker([place.lat,place.lng],{icon}).addTo(map).bindTooltip(place.name,{direction:'top'});
  });

  document.querySelectorAll('[data-route]').forEach(b=>b.addEventListener('click',()=>{activeRoute=b.dataset.route;applyFilters();}));
  directionControls.querySelectorAll('[data-direction]').forEach(b=>b.addEventListener('click',()=>{activeDirection=b.dataset.direction;applyFilters();}));
  document.getElementById('fitBtn').addEventListener('click',fitVisible);

  function toXY(lat,lng,refLat){const R=6371000;return[lng*Math.PI/180*R*Math.cos(refLat*Math.PI/180),lat*Math.PI/180*R];}
  function nearestOnSegment(lat,lng,a,b){
    const p=toXY(lat,lng,lat),p1=toXY(a[0],a[1],lat),p2=toXY(b[0],b[1],lat);
    const vx=p2[0]-p1[0],vy=p2[1]-p1[1],wx=p[0]-p1[0],wy=p[1]-p1[1],len2=vx*vx+vy*vy;
    let t=len2?(wx*vx+wy*vy)/len2:0;t=Math.max(0,Math.min(1,t));
    const x=p1[0]+t*vx,y=p1[1]+t*vy,dx=p[0]-x,dy=p[1]-y;
    return{distance:Math.sqrt(dx*dx+dy*dy),lat:a[0]+t*(b[0]-a[0]),lng:a[1]+t*(b[1]-a[1])};
  }
  function nearestToPath(path,lat,lng){let best={distance:Infinity};for(let i=0;i<path.length-1;i++){const c=nearestOnSegment(lat,lng,path[i],path[i+1]);if(c.distance<best.distance)best=c;}return best;}
  function fmt(m){return Number.isFinite(m)?(m<1000?`${Math.round(m)} m`:`${(m/1000).toFixed(1)} km`):'—';}
  function updateNearest(lat,lng){
    let best=null;
    visibleKeys().forEach(k=>{
      const path=geometry[k]; if(!path)return;
      const r=nearestToPath(path,lat,lng); if(!best||r.distance<best.distance)best={...r,key:k};
    });
    if(!best)return;
    nearestPoint=best;
    const [rid,did]=best.key.split(':'),route=data.routes[rid],dir=route.directions[did];
    document.getElementById('nearestRoute').textContent=`${route.name} · ${did==='ida'?'Ida':'Vuelta'}`;
    document.getElementById('nearestDistance').textContent=fmt(best.distance);
    document.getElementById('googleBtn').disabled=false;
    document.getElementById('statusText').textContent=best.distance<100?`Estás prácticamente sobre ${route.name} (${dir.label.toLowerCase()}).`:`${route.name} (${dir.label.toLowerCase()}) es el trazado más cercano.`;
  }

  function setGpsUi(state,msg){document.getElementById('gpsBadge').textContent=msg;document.getElementById('gpsState').textContent=state;}
  function onPosition(pos){
    const{latitude:lat,longitude:lng,accuracy}=pos.coords;lastPosition={lat,lng,accuracy};const ll=[lat,lng];
    if(!userMarker){const icon=L.divIcon({className:'',html:'<div class="user-dot"></div>',iconSize:[20,20],iconAnchor:[10,10]});userMarker=L.marker(ll,{icon,zIndexOffset:1000}).addTo(map).bindPopup('Tu ubicación');accuracyCircle=L.circle(ll,{radius:accuracy,color:'#2563eb',weight:1,fillColor:'#2563eb',fillOpacity:.08}).addTo(map);}else{userMarker.setLatLng(ll);accuracyCircle.setLatLng(ll).setRadius(accuracy);}
    document.getElementById('statusTitle').textContent='Ubicación activa';document.getElementById('accuracyBadge').textContent=`±${Math.round(accuracy)} m`;setGpsUi('On','GPS activo');updateNearest(lat,lng);if(followUser)map.setView(ll,Math.max(map.getZoom(),16),{animate:true});
  }
  function onPositionError(err){const m={1:'Permiso de ubicación denegado',2:'No se pudo obtener la ubicación',3:'El GPS tardó demasiado'};document.getElementById('statusTitle').textContent='GPS no disponible';document.getElementById('statusText').textContent=m[err.code]||err.message||'Error de ubicación';setGpsUi('Error','GPS sin acceso');}
  function startGps(){if(!('geolocation'in navigator))return onPositionError({code:2,message:'Sin geolocalización'});if(watchId!==null)return;document.getElementById('statusTitle').textContent='Buscando ubicación…';setGpsUi('…','Buscando GPS…');watchId=navigator.geolocation.watchPosition(onPosition,onPositionError,{enableHighAccuracy:true,maximumAge:3000,timeout:15000});}
  document.getElementById('locateBtn').addEventListener('click',()=>{followUser=true;document.getElementById('followBtn').classList.add('tracking');startGps();if(lastPosition)map.setView([lastPosition.lat,lastPosition.lng],16);});
  document.getElementById('followBtn').addEventListener('click',()=>{followUser=!followUser;document.getElementById('followBtn').classList.toggle('tracking',followUser);if(followUser){startGps();if(lastPosition)map.setView([lastPosition.lat,lastPosition.lng],16);}});
  document.getElementById('googleBtn').addEventListener('click',()=>{if(!nearestPoint)return;const d=`${nearestPoint.lat.toFixed(6)},${nearestPoint.lng.toFixed(6)}`;window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(d)}&travelmode=walking`,'_blank','noopener,noreferrer');});

  const dialog=document.getElementById('infoDialog');document.getElementById('infoBtn').addEventListener('click',()=>dialog.showModal());document.getElementById('closeInfo').addEventListener('click',()=>dialog.close());
  buildRoutes();
  if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=3').catch(()=>{}));
})();
