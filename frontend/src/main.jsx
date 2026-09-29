import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents, useMap} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import './styles.css';

const API = import.meta.env.VITE_API_URL || ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:5000/api' : '/api');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
const icons={food:'🍴',transport:'🚌',fuel:'⛽',atm:'🏧',lodge:'🏨',hospital:'🏥'};
const services=[
 ['food','Nearby Food','Restaurants, tiffin centres, cafes, bakeries and food places'],
 ['transport','Nearby Transport','Bus stops, bus stations, railway stations and mapped public transport'],
 ['fuel','Nearby Fuel / EV','Petrol, diesel, CNG and EV charging stations'],
 ['atm','Nearby ATMs','Actual mapped ATM locations'],
 ['lodge','Nearby Lodge','Hotels, lodges, guest houses, hostels and resorts'],
 ['hospital','Emergency Hospital','Hospitals, clinics and emergency medical facilities']
];
const emergencies=[
 ['Medical Emergency','108','Immediate medical ambulance assistance','🚑'],['Pregnancy Emergency','102','Pregnancy and maternal ambulance assistance','🤰'],['Road Accident','1073','Road accident emergency assistance','🚗'],['Highway Emergency','1033','National highway emergency assistance','🛣️'],['Any Emergency','112','Integrated emergency response','🚨'],['Fire Emergency','101','Fire and rescue emergency','🔥'],['Women in Distress','181','Women support helpline','👩'],['Child Emergency','1098','Child emergency helpline','🧒'],['Natural Disaster / Rescue','1078','Disaster and rescue assistance','🌪️'],['Cyber Crime / Online Fraud','1930','Cybercrime and online financial fraud reporting','💻'],['LPG Gas Leak','1906','LPG emergency assistance','🧯'],['Senior Citizen Emergency','14567','Senior citizen helpline','👴']
];

function App(){
 const hasToken=!!localStorage.token;
 const savedPage=localStorage.appPage||'dashboard';
 const [page,setPage]=useState(hasToken?(savedPage||'dashboard'):'login');
 const [user,setUser]=useState(localStorage.username||'');
 const nav=p=>{setPage(p); if(!['login','register','forgot'].includes(p)) localStorage.appPage=p;};
 useEffect(()=>{
  if(!localStorage.token){setPage('login');return;}
  let cancelled=false;
  fetch(API+'/profile',{headers:{Authorization:'Bearer '+localStorage.token}})
   .then(async r=>{
    if(r.status===401){localStorage.removeItem('token');localStorage.removeItem('username');localStorage.removeItem('appPage');if(!cancelled)setPage('login');return null;}
    if(!r.ok) throw new Error('Session check failed');
    return r.json();
   })
   .then(d=>{if(!cancelled&&d?.username){localStorage.username=d.username;setUser(d.username);}})
   .catch(()=>{});
  return()=>{cancelled=true;};
 },[]);
 const logout=async()=>{const token=localStorage.token;try{if(token) await fetch(API+'/logout',{method:'POST',headers:{Authorization:'Bearer '+token}})}catch{} localStorage.removeItem('token');localStorage.removeItem('username');localStorage.removeItem('appPage');setUser('');setPage('login')};
 return <div className="app">{!['login','register','forgot'].includes(page)&&<Header user={user} nav={nav} logout={logout}/>}<main>
  {page==='login'?<Auth mode="login" nav={nav} setUser={setUser}/>:page==='register'?<Auth mode="register" nav={nav}/>:page==='forgot'?<Auth mode="forgot" nav={nav}/>:page==='dashboard'?<Dashboard nav={nav}/>:page==='route'?<SmartRoute nav={nav}/>:page.startsWith('nearby:')?<Nearby kind={page.split(':')[1]} nav={nav}/>:page==='emergency'?<Emergency nav={nav}/>:page==='profile'?<Profile nav={nav} logout={logout}/>:null}
 </main></div>
}
function Header({user,nav,logout}){
 const [open,setOpen]=useState(false);
 const [profile,setProfile]=useState(null);
 useEffect(()=>{let live=true;fetch(API+'/profile',{headers:{Authorization:'Bearer '+localStorage.token}}).then(r=>r.ok?r.json():null).then(d=>{if(live&&d)setProfile(d)}).catch(()=>{});return()=>{live=false}},[user]);
 return <header><button className="brand" onClick={()=>{setOpen(false);nav('dashboard')}}>🚦 <span>Smart Traffic</span></button><div className="top-actions"><div className="profile-menu-wrap"><button className="profile-menu-trigger" onClick={()=>setOpen(x=>!x)}><span className="profile-avatar">👤</span><span>Profile</span><span className="profile-chevron">⌄</span></button>{open&&<div className="profile-dropdown"><div className="profile-dropdown-title">Account</div><div className="profile-detail"><b>Username</b><span>{profile?.username||user||'—'}</span></div><div className="profile-detail"><b>Address</b><span>{profile?.address||'Not added'}</span></div><div className="profile-detail"><b>Phone Number</b><span>{profile?.phone||'Not added'}</span></div><button className="edit-profile-btn" onClick={()=>{setOpen(false);nav('profile')}}>✏️ Edit Profile</button></div>}</div><button className="ghost" onClick={logout}>Logout</button></div></header>}
function Auth({mode,nav,setUser}){const [form,setForm]=useState({username:'',password:'',confirmPassword:'',address:'',phone:''});const [msg,setMsg]=useState('');const submit=async e=>{e.preventDefault();setMsg('');let ep=mode==='login'?'/auth/login':mode==='register'?'/auth/register':'/auth/reset';try{let r=await fetch(API+ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});let d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');if(mode==='login'){localStorage.token=d.token;localStorage.username=d.username;localStorage.appPage='dashboard';setUser?.(d.username);nav('dashboard')}else{setMsg(d.message);setTimeout(()=>nav('login'),700)}}catch(e){setMsg(e.message)}};return <div className="auth-wrap"><div className="auth-card"><div className="logo">🚦</div><h1>Smart Traffic Management</h1><p className="muted center">Safer, smarter journeys from one place.</p><form onSubmit={submit}><input required placeholder="Username" value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/>{mode!=='forgot'&&<input required type="password" placeholder="Password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/>} {mode==='register'&&<input required type="password" placeholder="Retype password" value={form.confirmPassword} onChange={e=>setForm({...form,confirmPassword:e.target.value})}/>} {mode==='forgot'&&<input required type="password" placeholder="New password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/>} {mode==='forgot'&&<input required type="password" placeholder="Retype new password" value={form.confirmPassword} onChange={e=>setForm({...form,confirmPassword:e.target.value})}/>}<button className="primary full">{mode==='login'?'Login':mode==='register'?'Create Account':'Reset Password'}</button></form>{msg&&<div className={mode==='login'?'error':'notice'}>{msg}</div>}<div className="auth-links">{mode==='login'?<><button onClick={()=>nav('register')}>Create Account</button><button onClick={()=>nav('forgot')}>Forgot Password?</button></>:<button onClick={()=>nav('login')}>Back to Login</button>}</div></div></div>}
function Dashboard({nav}){return <section className="page visual-page visual-dashboard"><div className="dashboard-welcome"><p className="eyebrow">SMART MOBILITY</p><h2>Welcome back, {localStorage.username||'User'} 👋</h2></div><div className="grid"><Feature tone="route" icon="🛣️" image="/images/smart route.png" title="Smart Route" click={()=>nav('route')}/>{services.map(([k,t])=><Feature key={k} tone={k} icon={icons[k]} image={{food:'/images/food.png',transport:'/images/public transport.png',fuel:'/images/fuel.png',atm:'/images/atm.png',lodge:'/images/hotel.jpg',hospital:'/images/emergency.png'}[k]} title={t} click={()=>nav('nearby:'+k)}/>)}<Feature tone="emergency" icon="🚨" image="/images/emergency services.png" title="Emergency Services" click={()=>nav('emergency')}/></div></section>}
function Feature({icon,image,title,click,tone}){return <button className={`feature feature-${tone||'default'}`} onClick={click}>{image?<img className="feature-image" src={image} alt="" />:<div className="feature-icon">{icon}</div>}<div><h3>{title}</h3></div><span>→</span></button>}

function LocationPicker({label,value,onSelect,placeholder='Type a place...',allowCurrent=false}){
 const [q,setQ]=useState(value?.name||''); const [results,setResults]=useState([]); const [loading,setLoading]=useState(false); const [gpsLoading,setGpsLoading]=useState(false); const [error,setError]=useState(''); const [accuracy,setAccuracy]=useState(null); const timer=useRef(null); const sessionRef=useRef(null);
 useEffect(()=>setQ(value?.name||''),[value?.name]);
 const ensurePlaces=async()=>{await loadGoogleMapsScript(); const places=await window.google.maps.importLibrary('places'); return places;};
 const search=async text=>{
   const query=(text??q).trim();
   if(query.length<2){setResults([]);return;}
   setLoading(true);setError('');
   try{
     const {AutocompleteSessionToken,AutocompleteSuggestion}=await ensurePlaces();
     if(!sessionRef.current) sessionRef.current=new AutocompleteSessionToken();
     const request={input:query,sessionToken:sessionRef.current,language:'en',region:'IN',includedRegionCodes:['in']};
     const {suggestions=[]}=await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
     const out=suggestions.map(s=>s.placePrediction).filter(Boolean).map(p=>({
       prediction:p,
       place:p.place,
       placeId:p.placeId,
       name:p.text?.text||'',
       main:p.structuredFormat?.mainText?.text||p.text?.text||'',
       secondary:p.structuredFormat?.secondaryText?.text||''
     }));
     setResults(out);
   }catch(e){
     console.error('Google Places Autocomplete error:',e);
     setResults([]);
     setError('Google suggestions could not be loaded. Please make sure Places API (New) is enabled for the same Google Maps key.');
   }finally{setLoading(false)}
 };
 const onChange=e=>{const text=e.target.value;setQ(text);onSelect(null);setAccuracy(null);setResults([]);clearTimeout(timer.current);timer.current=setTimeout(()=>search(text),300)};
 const choose=async x=>{
   setLoading(true);setError('');
   try{
     const place=x.prediction?.toPlace();
     if(!place) throw new Error('Google did not return a place prediction.');
     await place.fetchFields({fields:['displayName','formattedAddress','location','id','primaryType','types']});
     if(!place.location) throw new Error('Google did not return the selected place location.');
     const d={
       name:place.displayName||x.name||'Selected Place',
       display_name:place.displayName||x.name||'Selected Place',
       address:place.formattedAddress||'',
       lat:Number(place.location.lat()),
       lon:Number(place.location.lng()),
       place_id:place.id||x.placeId,
       category:place.primaryType||'',
       types:place.types||[]
     };
     setQ(d.name);setResults([]);setAccuracy(null);onSelect(d);
     sessionRef.current=null;
   }catch(e){console.error('Google place selection error:',e);setError(e.message||'Could not load the selected Google place.')}finally{setLoading(false)}
 };
 const gps=()=>{setGpsLoading(true);setError('');setAccuracy(null);if(!navigator.geolocation){setError('Your browser does not support location.');setGpsLoading(false);return;}let best=null;let watchId=null;let finished=false;const finish=async()=>{if(finished)return;finished=true;if(watchId!==null)navigator.geolocation.clearWatch(watchId);if(!best){setError('Unable to get a fresh GPS position. Turn on Windows Location Services and allow Chrome to access your location, then try again.');setGpsLoading(false);return;}const accuracy_m=Math.round(best.coords.accuracy);const x={name:'Detecting your exact current location...',lat:best.coords.latitude,lon:best.coords.longitude,accuracy_m};setAccuracy(accuracy_m);try{const r=await fetch(API+'/reverse-geocode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lat:x.lat,lon:x.lon})});const d=await r.json();if(!r.ok)throw Error(d.error||'Could not identify your location');x.name=d.name||'Current Location';setQ(x.name);setResults([]);onSelect(x)}catch(e){setError(e.message||'Could not identify your current location.');onSelect(null)}finally{setGpsLoading(false)}};const onPos=p=>{if(!best||p.coords.accuracy<best.coords.accuracy)best=p;setAccuracy(Math.round(p.coords.accuracy));if(best.coords.accuracy<=30)finish();};watchId=navigator.geolocation.watchPosition(onPos,e=>{if(e.code===1)setError('Location permission was blocked. Click Chrome location icon and allow access.');else setError('Unable to detect your current GPS location. Check Windows Location Services and Chrome location permission.');}, {enableHighAccuracy:true,timeout:20000,maximumAge:0});setTimeout(finish,6000)};
 return <div className={`loc ${results.length>0 ? 'loc-open' : ''}`}><label>{label}</label><div className="searchrow"><input value={q} onChange={onChange} onKeyDown={e=>e.key==='Enter'&&search()} placeholder={placeholder}/><button type="button" className="secondary" onClick={()=>search()} disabled={loading}>{loading?'Searching...':'Search'}</button>{allowCurrent&&<button type="button" className="secondary" onClick={gps} disabled={gpsLoading}>{gpsLoading?'Detecting...':'📍 Use Current Location'}</button>}</div>{results.length>0&&<div className="suggestions"><div className="google-attribution"><img src="https://www.gstatic.com/images/branding/googlelogo/1x/googlelogo_color_74x24dp.png" alt="Google"/></div>{results.map((x,i)=><button type="button" key={i} onClick={()=>choose(x)}><span>📍</span><span><b>{x.main||shortName(x.name)}</b><small>{x.secondary||x.name}</small></span></button>)}</div>}{value&&<div className="selected">✓ Location selected{value.accuracy_m?` · GPS accuracy ±${value.accuracy_m} m`:''}</div>}{error&&<div className="error">{error}</div>}</div>
}
function shortName(s){return (s||'').split(',')[0]||s}
function decodePolyline(encoded,precision=5){let index=0,lat=0,lng=0,points=[];const factor=10**precision;while(index<encoded.length){let b,shift=0,result=0;do{b=encoded.charCodeAt(index++)-63;result|=(b&31)<<shift;shift+=5}while(b>=32);lat+=result&1?~(result>>1):(result>>1);shift=0;result=0;do{b=encoded.charCodeAt(index++)-63;result|=(b&31)<<shift;shift+=5}while(b>=32);lng+=result&1?~(result>>1):(result>>1);points.push([lat/factor,lng/factor])}return points}

async function loadGoogleMapsScript(){
 const cfg=await fetch(API+'/map-config').then(r=>r.json());
 if(!cfg.google_maps_api_key) throw new Error('Google Maps JavaScript API key is not configured.');
 if(window.google?.maps) return;
 await new Promise((resolve,reject)=>{
  const existing=document.querySelector('script[data-smart-traffic-google-maps]');
  if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',()=>reject(new Error('Google Maps failed to load.')),{once:true});return;}
  const script=document.createElement('script');
  script.dataset.smartTrafficGoogleMaps='true';
  script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(cfg.google_maps_api_key)}&v=weekly&libraries=routes,places`;
  script.async=true;script.defer=true;script.onload=resolve;script.onerror=()=>reject(new Error('Google Maps failed to load. Check that Maps JavaScript API is enabled for this key.'));
  document.head.appendChild(script);
 });
}

function routeTraffic(route){
 const legTraffic=(route.legs||[]).reduce((n,l)=>n+Number(l.duration_in_traffic?.value||0),0);
 const legNormal=(route.legs||[]).reduce((n,l)=>n+Number(l.duration?.value||0),0);
 const delay=Math.max(0,legTraffic-legNormal)/60;
 if(!legTraffic) return 'Live traffic unavailable';
 if(delay<1) return 'Low / no traffic delay';
 if(delay<5) return `Moderate traffic (+${delay.toFixed(1)} min)`;
 return `Heavy traffic (+${delay.toFixed(1)} min)`;
}
function routeScore(distanceM,durationS,trafficDelayS=0){
 const d=1/(1+distanceM/10000), t=1/(1+durationS/900), tr=1/(1+trafficDelayS/300);
 return Math.round(Math.max(0,Math.min(100,(0.40*d+0.40*t+0.20*tr)*100))*10)/10;
}
function pathSignature(path){return (path||[]).filter((_,i)=>i%Math.max(1,Math.floor((path||[]).length/24))===0).map(p=>`${Number(p.lat||p[0]).toFixed(4)},${Number(p.lng||p[1]).toFixed(4)}`).join('|')}

function geoDistanceKm(a,b){
 const R=6371, p1=Number(a.lat)*Math.PI/180, p2=Number(b.lat)*Math.PI/180;
 const dp=(Number(b.lat)-Number(a.lat))*Math.PI/180, dl=(Number(b.lng)-Number(a.lng))*Math.PI/180;
 const x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
 return 2*R*Math.asin(Math.sqrt(x));
}
function pathPoints(path,count=24){
 if(!path?.length)return [];
 const step=Math.max(1,Math.floor(path.length/count));
 return path.filter((_,i)=>i%step===0).slice(0,count).map(p=>({lat:Number(p.lat??p[0]),lng:Number(p.lng??p[1])})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng));
}
function pathsAreSame(a,b){
 const pa=pathPoints(a),pb=pathPoints(b); if(!pa.length||!pb.length)return true;
 const directed=(src,dst)=>{
  let close=0,max=0;
  src.forEach(p=>{let d=Infinity;dst.forEach(q=>{d=Math.min(d,geoDistanceKm(p,q))});close+=d<=0.08?1:0;max=Math.max(max,d)});
  return {similar:close/src.length,max};
 };
 const x=directed(pa,pb),y=directed(pb,pa);
 return (x.similar>=0.92&&y.similar>=0.92)||(x.max<0.12&&y.max<0.12);
}

async function getGoogleBrowserRoutes(from,to){
 await loadGoogleMapsScript();
 const {Route,RouteLabel}=await window.google.maps.importLibrary('routes');
 const request={
  origin:{lat:Number(from.lat),lng:Number(from.lon)},
  destination:{lat:Number(to.lat),lng:Number(to.lon)},
  travelMode:'DRIVING',
  routingPreference:'TRAFFIC_AWARE',
  computeAlternativeRoutes:true,
  departureTime:new Date(),
  fields:['path','distanceMeters','duration','staticDuration','routeLabels','viewport']
 };
 const result=await Route.computeRoutes(request);
 if(!result?.routes?.length) throw new Error('Google Maps Routes Library returned no routes.');
 const routes=[];
 for(let i=0;i<result.routes.length;i++){
  const r=result.routes[i];
  const path=(r.path||[]).map(p=>({lat:typeof p.lat==='function'?p.lat():Number(p.lat),lng:typeof p.lng==='function'?p.lng():Number(p.lng)})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng));
  const distanceM=Number(r.distanceMeters||0);
  const durationS=Number(String(r.duration||'0s').replace('s',''))||0;
  const staticS=Number(String(r.staticDuration||'0s').replace('s',''))||durationS;
  if(!path.length||!distanceM) continue;
  routes.push({
   id:i+1,
   route_index:i,
   distance_km:Number((distanceM/1000).toFixed(2)),
   duration_min:Number((durationS/60).toFixed(1)),
   traffic:staticS<durationS?routeTraffic({legs:[{duration:{value:staticS},duration_in_traffic:{value:durationS}}]}):'Live traffic unavailable',
   accidents:'No verified accident feed connected',
   route_label:(r.routeLabels||[]).includes(RouteLabel.DEFAULT_ROUTE)?'Google default route':`Google alternative route ${i}`,
   path,
   provider:'google_js_routes',
   score:routeScore(distanceM,durationS,Math.max(0,durationS-staticS)),
   recommended:false,
   recommendation:'Alternative route.'
  });
 }
 const seen=new Set();
 const unique=routes.filter(r=>{const sig=pathSignature(r.path);if(!sig||seen.has(sig))return false;seen.add(sig);return true;});
 unique.sort((a,b)=>b.score-a.score).forEach((r,i)=>{r.id=i+1;r.recommended=i===0;r.recommendation=i===0?'Recommended based on actual distance, travel time and available traffic data.':'Alternative route returned by Google Maps.';});
 return {routes:unique,result};
}

function GoogleNavigationMap({route,from,to,onClose}){
 const ref=useRef(null), mapRef=useRef(null), userMarkerRef=useRef(null), routeLineRef=useRef(null), rendererRef=useRef(null), watchRef=useRef(null);
 const [status,setStatus]=useState('Loading Google Maps...');
 const [follow,setFollow]=useState(true);
 const [live,setLive]=useState(null);
 const [navigationStarted,setNavigationStarted]=useState(false);
 useEffect(()=>{
  let cancelled=false;
  const load=async()=>{
   try{
    await loadGoogleMapsScript();
    if(cancelled)return;
    const map=new window.google.maps.Map(ref.current,{center:{lat:Number(from.lat),lng:Number(from.lon)},zoom:14,mapTypeControl:true,streetViewControl:false,fullscreenControl:true,zoomControl:true});
    mapRef.current=map;
    const bounds=new window.google.maps.LatLngBounds();
    bounds.extend({lat:Number(from.lat),lng:Number(from.lon)});bounds.extend({lat:Number(to.lat),lng:Number(to.lon)});
    if(route.provider==='google_js_routes' && route.path?.length){
      routeLineRef.current=new window.google.maps.Polyline({map,path:route.path,strokeOpacity:0.95,strokeWeight:7});
      route.path.forEach(p=>bounds.extend(p));
      new window.google.maps.Marker({position:{lat:Number(from.lat),lng:Number(from.lon)},map,label:'A',title:'Start'});
      new window.google.maps.Marker({position:{lat:Number(to.lat),lng:Number(to.lon)},map,label:'B',title:'Destination'});
      map.fitBounds(bounds,50);setStatus(route.traffic_aware ? 'Selected traffic-aware route loaded. Live location is being tracked.' : 'Selected fallback road route loaded. Live location is being tracked.');
    }else{
      const pts=route?.polyline?decodePolyline(route.polyline,route.polyline_precision||5):[];
      if(!pts.length)throw new Error('This route has no map path to display.');
      const path=pts.map(([lat,lng])=>({lat,lng}));path.forEach(p=>bounds.extend(p));
      routeLineRef.current=new window.google.maps.Polyline({path,geodesic:true,strokeColor:'#1769e0',strokeOpacity:0.95,strokeWeight:7,map});
      new window.google.maps.Marker({position:{lat:Number(from.lat),lng:Number(from.lon)},map,label:'A',title:'Start'});
      new window.google.maps.Marker({position:{lat:Number(to.lat),lng:Number(to.lon)},map,label:'B',title:'Destination'});
      map.fitBounds(bounds,50);setStatus(route.traffic_aware ? 'Traffic-aware route loaded on Google Maps. Live location is being tracked.' : 'Fallback road route loaded on Google Maps. Live location is being tracked.');
    }
    const update=pos=>{const p={lat:pos.coords.latitude,lng:pos.coords.longitude};setLive({lat:p.lat,lon:p.lng,accuracy:Math.round(pos.coords.accuracy)});if(!userMarkerRef.current){userMarkerRef.current=new window.google.maps.Marker({position:p,map,label:'●',title:'Your live location'});}else userMarkerRef.current.setPosition(p);if(follow)map.panTo(p);};
    if(navigator.geolocation)watchRef.current=navigator.geolocation.watchPosition(update,()=>setStatus('Google Map loaded. Live location permission is unavailable.'),{enableHighAccuracy:true,maximumAge:3000,timeout:15000});
   }catch(e){if(!cancelled)setStatus(e.message||'Could not load Google Maps.');}
  };
  load();
  return ()=>{cancelled=true;if(watchRef.current!==null)navigator.geolocation?.clearWatch(watchRef.current);if(rendererRef.current)rendererRef.current.setMap(null);if(routeLineRef.current)routeLineRef.current.setMap(null);if(userMarkerRef.current)userMarkerRef.current.setMap(null);mapRef.current=null;};
 },[route?.id,route?.route_index,route?.provider,route?.polyline,route?.polyline_precision,from?.lat,from?.lon,to?.lat,to?.lon,follow]);
 return <div className="google-nav-panel"><div className="google-nav-top"><div><b>Route {route.id} — Google Maps</b><span>{status}</span></div><div className="google-nav-actions">{!navigationStarted?<button className="primary nav-start-btn" onClick={()=>{setNavigationStarted(true);setFollow(true);setStatus('Navigation started. Live location is being tracked.')}}>▶ Start Navigation</button>:<button className="secondary nav-start-btn" onClick={()=>{setNavigationStarted(false);setFollow(false);setStatus('Navigation paused. Live location tracking remains available.')}}>⏸ Stop Navigation</button>}<button className="secondary" onClick={()=>setFollow(x=>!x)}>{follow?'Stop Following':'Follow Live Location'}</button><button className="secondary" onClick={onClose}>Close Map</button></div></div><div ref={ref} className="google-nav-map"></div>{navigationStarted&&<div className="navigation-active">🧭 Navigation active · Follow the highlighted route · Live GPS is updating</div>}<div className="google-nav-info"><span>📍 Start: {shortName(from.name)}</span><span>🏁 Destination: {shortName(to.name)}</span>{live&&<span>🛰️ Live location ±{live.accuracy} m</span>}<span>🛣️ {route.distance_km} km · ⏱️ {route.duration_min} min</span></div><p className="route-map-caption">The selected route is rendered on Google Maps inside this app. Live GPS follows your current position; the route itself is the specific alternative selected from the list.</p></div>
}

function SmartRoute({nav}){
 const [from,setFrom]=useState(null),[to,setTo]=useState(null),[routes,setRoutes]=useState([]),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false),[activeRoute,setActiveRoute]=useState(null);
 const calculate=async()=>{
  if(!from||!to){setMsg('Please select both source and destination from Google suggestions, or use Current Location for the source.');return}
  setBusy(true);setRoutes([]);setActiveRoute(null);setMsg('Collecting distinct road alternatives from available routing providers...');
  try{
   let backendRoutes=[];let backendMeta=null;let backendError='';
   let browserRoutes=[];let browserError='';

   // Run server-side multi-provider routing and Google Maps JS routing together.
   const [backendResult,browserResult]=await Promise.allSettled([
    fetch(API+'/routes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({from,to})}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'Routing failed');return d;}),
    getGoogleBrowserRoutes(from,to)
   ]);

   if(backendResult.status==='fulfilled'){
    backendMeta=backendResult.value;
    backendRoutes=(backendMeta.routes||[]).map(r=>{
      const path=r.path?.length?r.path:(r.polyline?decodePolyline(r.polyline,r.polyline_precision||5).map(([lat,lng])=>({lat,lng})):[]);
      return {...r,path,provider:r.provider||backendMeta.provider||'routing-provider'};
    });
   }else backendError=backendResult.reason?.message||'Multi-provider routing unavailable.';

   if(browserResult.status==='fulfilled'){
    browserRoutes=(browserResult.value.routes||[]).map((r,i)=>({...r,id:i+1,recommended:false,traffic_aware:true,source_provider:'Google Maps JavaScript Routes'}));
   }else browserError=browserResult.reason?.message||'Google Maps route alternatives unavailable.';

   // Merge candidates while keeping only genuinely different road geometries.
   // Browser Google routes and server Google Routes API often describe the same
   // paths, so geometry comparison prevents duplicate cards with the same map.
   const merged=[];
   [...backendRoutes,...browserRoutes].forEach(r=>{
    const path=r.path||[];
    if(!path.length)return;
    if(merged.some(x=>pathsAreSame(path,x.path||[])))return;
    merged.push({...r,path});
   });

   // Rank by our application score. Traffic-aware routes use actual traffic ETA;
   // fallback routes retain their provider's actual distance/time score.
   merged.sort((a,b)=>Number(b.score||0)-Number(a.score||0));
   const finalRoutes=merged.slice(0,15).map((r,i)=>({
    ...r,id:i+1,recommended:i===0,
    recommendation:i===0
      ?(r.traffic_aware?'Recommended using traffic-aware ETA, traffic delay and actual road distance.':'Recommended based on actual road distance and travel time; live traffic unavailable.')
      :(r.traffic_aware?'Alternative traffic-aware road route.':'Alternative actual road route; live traffic unavailable.')
   }));

   setRoutes(finalRoutes);
   if(finalRoutes.length){
    const target=15;
    if(finalRoutes.length>=target) setMsg(`15 distinct actual road routes found. The recommended route is at the top; every route has its own road geometry.`);
    else setMsg(`${finalRoutes.length} distinct actual road route(s) found. The system displays every genuinely different route returned by the available providers; no duplicate or artificial paths are added.`);
   }else{
    setMsg(backendError||browserError||'No distinct road routes were returned. Check the routing provider configuration.');
   }
  }catch(e){setMsg(e.message||'Routing failed.')}finally{setBusy(false)}
 };
 return <section className="page visual-page visual-route"><Back nav={nav}/><div className="section-head"><p className="eyebrow">SMART ROUTE</p><h2>Plan your route</h2></div><LocationPicker label="From Location" value={from} onSelect={x=>{setFrom(x);setRoutes([]);setActiveRoute(null)}} placeholder="Search source location..." allowCurrent/><LocationPicker label="To Location" value={to} onSelect={x=>{setTo(x);setRoutes([]);setActiveRoute(null)}} placeholder="Search destination..."/><div className="action-row"><button className="primary" onClick={calculate} disabled={busy}>{busy?'Finding routes...':'Calculate Available Routes'}</button></div>{msg&&<div className="notice">{msg}</div>}{routes.length>0&&<div className="routes-heading"><h3>Available Routes ({routes.length})</h3><span>Distinct actual road paths · up to 15</span></div>}<div className="route-list">{routes.map(r=><div className={`route-card ${r.recommended?'recommended':''} ${activeRoute?.id===r.id?'selected-route':''}`} key={`${r.provider}-${r.id}`}><div className="route-title"><div><b>Route {r.id}</b>{r.recommended&&<span className="recommended-badge">⭐ RECOMMENDED</span>}</div><span>{r.score}/100</span></div><div className="stats"><span>📏 {r.distance_km} km</span><span>⏱️ {r.duration_min} min</span><span>🚦 {r.traffic}</span><span>⚠️ {r.accidents}</span></div>{r.route_label&&<p className="small">Road: {r.route_label}</p>}<p className="recommendation">{r.recommendation}</p>{r.traffic_aware&&<p className="small traffic-source">🚦 Traffic-aware ETA: {r.duration_min} min · Normal ETA: {r.static_duration_min ?? r.duration_min} min{r.traffic_delay_min!=null?` · Delay: +${r.traffic_delay_min} min`:''}</p>}<button type="button" className="secondary view-route-btn" onClick={()=>setActiveRoute(r)}>View Route</button>{activeRoute?.id===r.id&&from&&to&&<GoogleNavigationMap route={r} from={from} to={to} onClose={()=>setActiveRoute(null)}/>}</div>)}</div></section>
}

function NearbyRouteMap({loc,focus,title,onClose}){
 const ref=useRef(null),mapRef=useRef(null),routeLineRef=useRef(null),liveMarkerRef=useRef(null),destMarkerRef=useRef(null),watchRef=useRef(null);
 const [status,setStatus]=useState('Loading Google Maps and live location...');
 const [live,setLive]=useState(null);
 const [navigationStarted,setNavigationStarted]=useState(false);
 const [follow,setFollow]=useState(true);

 useEffect(()=>{
  let cancelled=false;
  let latestLive=null;
  const setup=async()=>{
   try{
    await loadGoogleMapsScript();
    if(cancelled||!ref.current)return;
    const fallbackStart={lat:Number(loc.lat),lng:Number(loc.lon)};
    const map=new window.google.maps.Map(ref.current,{center:fallbackStart,zoom:14,mapTypeControl:true,streetViewControl:false,fullscreenControl:true});
    mapRef.current=map;

    const destination={lat:Number(focus.lat),lng:Number(focus.lon)};
    destMarkerRef.current=new window.google.maps.Marker({position:destination,map,label:'D',title:focus.name});

    const routeFromOrigin=async(origin,sourceLabel)=>{
     if(cancelled)return;
     setStatus(`Calculating road path from ${sourceLabel} to ${shortName(focus.name)}...`);
     const rr=await fetch(API+'/nearby-route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({origin:{lat:origin.lat,lon:origin.lng},destination:{lat:destination.lat,lon:destination.lng}})});
     const rd=await rr.json();
     if(!rr.ok)throw new Error(rd.error||'Could not calculate the road path.');
     const pts=rd.polyline?decodePolyline(rd.polyline,5):(rd.path||[]).map(x=>[Number(x.lat),Number(x.lng)]);
     if(!pts.length)throw new Error('No road path was returned for this place.');
     if(routeLineRef.current)routeLineRef.current.setMap(null);
     const path=pts.map(([lat,lng])=>({lat,lng}));
     routeLineRef.current=new window.google.maps.Polyline({map,path,geodesic:true,strokeColor:'#1769e0',strokeOpacity:.95,strokeWeight:7});
     const originMarkerPosition={lat:Number(origin.lat),lng:Number(origin.lng)};
     if(!liveMarkerRef.current){
      liveMarkerRef.current=new window.google.maps.Marker({position:originMarkerPosition,map,label:'●',title:'Your live location'});
     }else liveMarkerRef.current.setPosition(originMarkerPosition);
     const bounds=new window.google.maps.LatLngBounds();
     path.forEach(pt=>bounds.extend(pt));
     bounds.extend(originMarkerPosition); bounds.extend(destination);
     map.fitBounds(bounds,60);
     if(!cancelled)setStatus(`Live location → ${shortName(focus.name)} · ${rd.distance_km} km · ${rd.duration_min} min · ${rd.traffic}`);
    };

    const update=pos=>{
     latestLive={lat:pos.coords.latitude,lng:pos.coords.longitude};
     setLive({lat:latestLive.lat,lon:latestLive.lng,accuracy:Math.round(pos.coords.accuracy)});
     if(!liveMarkerRef.current){
      liveMarkerRef.current=new window.google.maps.Marker({position:latestLive,map,label:'●',title:'Your live location'});
     }else liveMarkerRef.current.setPosition(latestLive);
     if(navigationStarted&&follow)map.panTo(latestLive);
    };

    if(navigator.geolocation){
     watchRef.current=navigator.geolocation.watchPosition(update,()=>{
      if(!cancelled)setStatus('Live GPS permission unavailable. Using the selected search location as route start.');
     },{enableHighAccuracy:true,maximumAge:3000,timeout:15000});
    }

    // Wait for a fresh GPS reading. The route must start from the user's live position, never from the searched place.
    await new Promise((resolve,reject)=>{
     const started=Date.now();
     const poll=()=>{
      if(cancelled)return reject(new Error('Map closed.'));
      if(latestLive)return resolve();
      if(Date.now()-started>10000)return reject(new Error('Fresh live location was not available. Turn on Windows Location Services and allow Chrome location access, then reopen this route.'));
      setTimeout(poll,250);
     };
     poll();
    });
    await routeFromOrigin(latestLive,'your live location');
   }catch(e){if(!cancelled)setStatus(e.message||'Could not load the Google Map route.');}
  };
  setup();
  return()=>{
   cancelled=true;
   if(watchRef.current!==null)navigator.geolocation?.clearWatch(watchRef.current);
   if(routeLineRef.current)routeLineRef.current.setMap(null);
   if(liveMarkerRef.current)liveMarkerRef.current.setMap(null);
   if(destMarkerRef.current)destMarkerRef.current.setMap(null);
   mapRef.current=null;
  };
 },[loc?.lat,loc?.lon,focus?.place_id,navigationStarted,follow]);

 return <div className="nearby-map-panel">
  <div className="google-nav-top">
   <div><b>{title} — Selected Route</b><span>{status}</span></div>
   <div className="google-nav-actions">
    {!navigationStarted
      ?<button className="primary nav-start-btn" onClick={()=>{setNavigationStarted(true);setFollow(true);setStatus('Navigation started. Live location is being tracked.')}}>▶ Start Navigation</button>
      :<button className="secondary nav-start-btn" onClick={()=>{setNavigationStarted(false);setStatus('Navigation paused. Live location tracking remains available.')}}>⏸ Stop Navigation</button>}
    <button className="secondary" onClick={()=>setFollow(x=>!x)}>{follow?'Stop Following':'Follow Live Location'}</button>
    <button className="secondary" onClick={onClose}>Close Map</button>
   </div>
  </div>
  <div ref={ref} className="google-nav-map"></div>
  <div className="google-nav-info">
   <span>📍 Start: Live Location</span>
   <span>🏁 Destination: {shortName(focus.name)}</span>
   {live&&<span>🛰️ Live GPS ±{live.accuracy} m</span>}
  </div>
  {navigationStarted&&<div className="navigation-active">🧭 Navigation active · Live GPS is updating</div>}
  <p className="route-map-caption">The blue line is the actual road route from your live location to this selected place. The map appears only inside the selected result, just like Smart Route.</p>
 </div>
}

function Nearby({kind,nav}){
 const [loc,setLoc]=useState(null),[results,setResults]=useState([]),[radius,setRadius]=useState(null),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false),[focus,setFocus]=useState(null);
 const service=services.find(x=>x[0]===kind);const title=service?.[1]||kind;
 const search=async()=>{if(!loc){setMsg('Please select a location first.');return}setBusy(true);setMsg('Searching Google Places...');setResults([]);setRadius(null);setFocus(null);try{const r=await fetch(API+'/nearby',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,lat:loc.lat,lon:loc.lon})});const d=await r.json();if(!r.ok)throw Error(d.error||'Nearby search failed');const items=d.results||[];setResults(items);setRadius(d.radius_km);setFocus(null);setMsg(d.message|| (items.length?`Found ${items.length} ${title.toLowerCase()} result(s).`:`No suitable ${title.toLowerCase()} found.`))}catch(e){setMsg(e.message)}finally{setBusy(false)}};
 const infoLabel=kind==='food'?'Food Info':kind==='transport'?'Transport Info':kind==='fuel'?'Fuel / EV Info':kind==='atm'?'ATM Info':kind==='lodge'?'Lodge Info':'Hospital Info';
 const mealInfo=x=>{if(kind!=='food')return null;const meals=[];if(x.serves_breakfast===true)meals.push('Breakfast');if(x.serves_brunch===true)meals.push('Brunch');if(x.serves_lunch===true)meals.push('Lunch');if(x.serves_dinner===true)meals.push('Dinner');if(x.serves_vegetarian===true)meals.push('Vegetarian');if(x.serves_coffee===true)meals.push('Coffee');if(x.serves_dessert===true)meals.push('Desserts');return meals.length?meals.join(' · '):'Meal service details not provided by Google';};
 return <section className={`page visual-page visual-nearby visual-nearby-${kind}`}><Back nav={nav}/><p className="eyebrow">NEARBY</p><h2>{icons[kind]} {title}</h2><LocationPicker label="Search Location" value={loc} onSelect={x=>{setLoc(x);setResults([]);setRadius(null);setFocus(null)}} placeholder="Search a place..." allowCurrent/><button className="primary" onClick={search} disabled={busy}>{busy?'Searching Google Places...':`Find ${title}`}</button>{msg&&<div className="notice">{msg}</div>}{radius&&results.length>0&&<p className="muted"><b>Search range: 0–{radius} km</b> · {radius===3?'3 km results found, so the search stopped here.':'No suitable result within 3 km, so the search expanded to 10 km.'} · nearest first</p>}<div className="results">{results.map((x,i)=><div className={`result ${focus?.place_id===x.place_id?'result-focused':''}`} key={x.place_id||i} onClick={()=>setFocus(x)}><div><h3>{x.name}</h3><p>{x.category} · {x.distance_km} km</p>{x.address&&<p className="muted">{x.address}</p>}{x.phone&&<p>☎ {x.phone}</p>}{x.rating&&<p>⭐ {x.rating}{x.user_rating_count?` (${x.user_rating_count} reviews)`:''}{x.price_level?` · ${x.price_level.replace('PRICE_LEVEL_','').toLowerCase()}`:''}</p>}{x.open_now!==undefined&&<p className="muted">{x.open_now?'Open now':'Closed now'}</p>}<div className="nearby-info-title">{infoLabel}</div>{kind==='food'&&<div className="food-info-box"><p><b>🍽️ Meals & Food Information</b></p><p>{mealInfo(x)}</p><p className="muted">{x.takeout===true?'Takeaway available · ':''}{x.delivery===true?'Delivery available · ':''}{x.dine_in===true?'Dine-in available':''}</p><p className="food-info-note">Meal attributes are shown only when Google provides them; the app does not invent a menu.</p></div>}{kind!=='food'&&<p className="muted">{icons[kind]} {x.category||title} · {x.distance_km} km</p>}</div><button className="secondary" onClick={e=>{e.stopPropagation();setFocus(x)}}>{focus?.place_id===x.place_id?'Route Selected':'View Route'}</button>{focus?.place_id===x.place_id&&<NearbyRouteMap loc={loc} focus={x} title={title} onClose={()=>setFocus(null)}/>}</div>)}</div></section>
}
const emergencyImages={'108':'/images/108.png','102':'/images/102.png','1073':'/images/1073.png','1033':'/images/1033.png','112':'/images/112.png','101':'/images/101.png','181':'/images/181.png','1098':'/images/1098.png','1078':'/images/1078.png','1930':'/images/1930.png','1906':'/images/1906.png','14567':'/images/14567.png'};
function Emergency({nav}){return <section className="page visual-page visual-emergency"><Back nav={nav}/><p className="eyebrow">EMERGENCY ASSISTANCE</p><h2>Choose the emergency type</h2><div className="emergency-grid">{emergencies.map(([t,n,d,i])=><div className="emergency-card" key={n}>{emergencyImages[n]?<img className="emergency-image" src={emergencyImages[n]} alt="" />:<div className="eicon">{i}</div>}<div><h3>{t}</h3><p>{d}</p><b>{n}</b></div><a className="call" href={'tel:'+n}>CALL</a></div>)}</div></section>}
function Profile({nav,logout}){
 const [p,setP]=useState(null);
 const [address,setAddress]=useState('');
 const [phone,setPhone]=useState('');
 const [showPass,setShowPass]=useState(false);
 const [showDelete,setShowDelete]=useState(false);
 const [current,setCurrent]=useState('');
 const [newPass,setNewPass]=useState('');
 const [passConfirm,setPassConfirm]=useState('');
 const [deletePass,setDeletePass]=useState('');
 const [deleteConfirm,setDeleteConfirm]=useState('');
 const [msg,setMsg]=useState('');
 const [msgType,setMsgType]=useState('notice');
 useEffect(()=>{fetch(API+'/profile',{headers:{Authorization:'Bearer '+localStorage.token}}).then(r=>r.json()).then(d=>{setP(d);setAddress(d.address||'');setPhone(d.phone||'')})},[]);
 const saveProfile=async()=>{setMsg('');const r=await fetch(API+'/profile',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+localStorage.token},body:JSON.stringify({address,phone})});const d=await r.json();if(!r.ok){setMsgType('error');return setMsg(d.error||'Could not update profile.')}setP({...p,address:d.address,phone:d.phone});setMsgType('notice');setMsg('Profile updated successfully.');};
 const changePassword=async()=>{setMsg('');if(newPass!==passConfirm){setMsgType('error');return setMsg('New passwords do not match.')}const r=await fetch(API+'/profile/password',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+localStorage.token},body:JSON.stringify({username:p?.username,currentPassword:current,newPassword:newPass,confirmPassword:passConfirm})});const d=await r.json();if(!r.ok){setMsgType('error');return setMsg(d.error||'Could not change password.')}setCurrent('');setNewPass('');setPassConfirm('');setShowPass(false);setMsgType('notice');setMsg('Login password changed successfully.');};
 const del=async()=>{setMsg('');if(deletePass!==deleteConfirm){setMsgType('error');return setMsg('Passwords do not match.')}const r=await fetch(API+'/profile/delete',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+localStorage.token},body:JSON.stringify({password:deletePass,confirmPassword:deleteConfirm})});const d=await r.json();if(!r.ok){setMsgType('error');return setMsg(d.error||'Could not delete account.')}localStorage.clear();logout()};
 return <section className="page"><Back nav={nav}/><p className="eyebrow">ACCOUNT</p><h2>Profile</h2><div className="profile-card profile-modern">{p&&<><div className="profile-row"><b>Username</b><span>{p.username}</span></div><div className="profile-row"><b>Address</b><input value={address} placeholder="Enter your address" onChange={e=>setAddress(e.target.value)}/></div><div className="profile-row"><b>Phone Number</b><input value={phone} placeholder="Enter your phone number" onChange={e=>setPhone(e.target.value)}/></div><button className="primary" onClick={saveProfile}>Save Profile</button><p className="small">Account created: {new Date(p.created_at).toLocaleString()}</p></>}
 <hr/>
 <button className="profile-action" onClick={()=>{setShowPass(x=>!x);setShowDelete(false)}}>🔐 Change Login Password <span>{showPass?'−':'+'}</span></button>
 {showPass&&<div className="profile-section"><input type="text" placeholder="Username" value={p?.username||''} readOnly/><input type="password" placeholder="Current password" value={current} onChange={e=>setCurrent(e.target.value)}/><input type="password" placeholder="New password" value={newPass} onChange={e=>setNewPass(e.target.value)}/><input type="password" placeholder="Retype new password" value={passConfirm} onChange={e=>setPassConfirm(e.target.value)}/><button className="primary" onClick={changePassword}>Change Password</button></div>}
 <button className="profile-action danger-outline" onClick={()=>{setShowDelete(x=>!x);setShowPass(false)}}>🗑️ Delete Account <span>{showDelete?'−':'+'}</span></button>
 {showDelete&&<div className="profile-section delete-section"><p className="muted">Enter your password twice before confirming permanent deletion.</p><input type="password" placeholder="Password" value={deletePass} onChange={e=>setDeletePass(e.target.value)}/><input type="password" placeholder="Retype password" value={deleteConfirm} onChange={e=>setDeleteConfirm(e.target.value)}/><button className="danger" onClick={del}>Confirm Delete Account</button></div>}
 {msg&&<div className={msgType==='error'?'error':'notice'}>{msg}</div>}
 </div></section>}
function Back({nav}){return <button className="back dashboard-back" onClick={()=>nav('dashboard')}>← Dashboard</button>}
delete L.Icon.Default.prototype._getIconUrl;L.Icon.Default.mergeOptions({iconRetinaUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',iconUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',shadowUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'});
createRoot(document.getElementById('root')).render(<App/>);
