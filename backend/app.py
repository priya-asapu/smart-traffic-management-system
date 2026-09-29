import os, math, sqlite3, secrets, hashlib, datetime
from dotenv import load_dotenv
from functools import wraps
from flask import Flask, request, jsonify, g, send_from_directory
from flask_cors import CORS
import requests

BASE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE)
FRONTEND_DIST = os.path.join(PROJECT_ROOT, 'frontend', 'dist')
load_dotenv(os.path.join(BASE, '.env'))
DB = os.path.join(BASE, 'traffic.db')
app = Flask(__name__, static_folder=FRONTEND_DIST, static_url_path='')
CORS(app, resources={r'/api/*': {'origins': '*'}})

PHOTON_SEARCH = 'https://photon.komoot.io/api/'
PHOTON_REVERSE = 'https://photon.komoot.io/reverse'
OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
]
OSRM = 'https://router.project-osrm.org/route/v1/driving'
VALHALLA = 'https://valhalla1.openstreetmap.de/route'
HEADERS = {'User-Agent': 'SmartTrafficManagementSystem/1.0 student-project'}
GOOGLE_MAPS_API_KEY = os.environ.get('GOOGLE_MAPS_API_KEY', '').strip()
GOOGLE_AUTOCOMPLETE = 'https://places.googleapis.com/v1/places:autocomplete'
GOOGLE_DETAILS = 'https://places.googleapis.com/v1/{name}'
GOOGLE_NEARBY = 'https://places.googleapis.com/v1/places:searchNearby'
GOOGLE_ROUTES = 'https://routes.googleapis.com/directions/v2:computeRoutes'
GOOGLE_GEOCODE = 'https://maps.googleapis.com/maps/api/geocode/json'

GOOGLE_NEARBY_TYPES = {
    'food': ['restaurant','fast_food_restaurant','cafe','bakery','meal_takeaway','ice_cream_shop'],
    'transport': ['bus_station','transit_station','train_station','subway_station','light_rail_station'],
    'fuel': ['gas_station','electric_vehicle_charging_station'],
    'atm': ['atm'],
    'lodge': ['hotel','motel','resort_hotel','extended_stay_hotel','bed_and_breakfast','hostel'],
    'hospital': ['hospital','medical_clinic'],
}

SERVICE_FILTERS = {
    'food': '''(node[amenity~"restaurant|fast_food|cafe|bakery|food_court|ice_cream|pub|bar"](around:{r},{lat},{lon});way[amenity~"restaurant|fast_food|cafe|bakery|food_court|ice_cream|pub|bar"](around:{r},{lat},{lon});relation[amenity~"restaurant|fast_food|cafe|bakery|food_court|ice_cream|pub|bar"](around:{r},{lat},{lon}););''',
    'transport': '''(node[public_transport](around:{r},{lat},{lon});way[public_transport](around:{r},{lat},{lon});node[railway~"station|halt|tram_stop|subway_entrance"](around:{r},{lat},{lon});way[railway~"station|halt"](around:{r},{lat},{lon}););''',
    'fuel': '''(node[amenity~"fuel|charging_station"](around:{r},{lat},{lon});way[amenity~"fuel|charging_station"](around:{r},{lat},{lon}););''',
    'atm': '''(node[amenity=atm](around:{r},{lat},{lon});way[amenity=atm](around:{r},{lat},{lon}););''',
    'lodge': '''(node[tourism~"hotel|motel|hostel|guest_house|resort"](around:{r},{lat},{lon});way[tourism~"hotel|motel|hostel|guest_house|resort"](around:{r},{lat},{lon});relation[tourism~"hotel|motel|hostel|guest_house|resort"](around:{r},{lat},{lon}););''',
    'hospital': '''(node[amenity~"hospital|clinic"](around:{r},{lat},{lon});way[amenity~"hospital|clinic"](around:{r},{lat},{lon});relation[amenity~"hospital|clinic"](around:{r},{lat},{lon}););'''
}


def db():
    if 'db' not in g:
        g.db = sqlite3.connect(DB)
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(_):
    c = g.pop('db', None)
    if c: c.close()

def init_db():
    con = sqlite3.connect(DB)
    con.execute('''CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, address TEXT DEFAULT '', phone TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP)''')
    con.execute('''CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)''')
    cols={r[1] for r in con.execute('PRAGMA table_info(users)').fetchall()}
    if 'address' not in cols: con.execute("ALTER TABLE users ADD COLUMN address TEXT DEFAULT ''")
    if 'phone' not in cols: con.execute("ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''")
    con.commit(); con.close()

# Initialize/migrate the database when Flask is imported (Gunicorn/Render).
init_db()

def hash_pw(p): return hashlib.sha256(p.encode()).hexdigest()
def token_for(uid): return secrets.token_urlsafe(32)
SESSIONS = {}  # kept only for backward compatibility with older running processes

def auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        t = request.headers.get('Authorization','').replace('Bearer ','').strip()
        if not t: return jsonify({'error':'Unauthorized'}), 401
        # Sessions are stored in SQLite so logout/login works reliably across
        # refreshes, Render restarts and different devices.
        row = db().execute('SELECT user_id FROM sessions WHERE token=?',(t,)).fetchone()
        if not row:
            return jsonify({'error':'Unauthorized'}), 401
        user = db().execute('SELECT id FROM users WHERE id=?',(row['user_id'],)).fetchone()
        if not user:
            db().execute('DELETE FROM sessions WHERE token=?',(t,)); db().commit()
            return jsonify({'error':'Unauthorized'}), 401
        request.user_id = row['user_id']
        request.auth_token = t
        return f(*args, **kwargs)
    return wrapper

@app.get('/api/map-config')
def map_config():
    # The Maps JavaScript API key is a browser key by design. Restrict it in
    # Google Cloud by HTTP referrers and only the APIs this app needs.
    return jsonify({'google_maps_api_key': GOOGLE_MAPS_API_KEY})

@app.get('/api/health')
def health(): return jsonify({'ok':True})

@app.post('/api/auth/register')
def register():
    d=request.json or {}; u=(d.get('username') or '').strip(); p=d.get('password') or ''; cp=d.get('confirmPassword') or ''; address=(d.get('address') or '').strip(); phone=(d.get('phone') or '').strip()
    if len(u)<3 or len(p)<6: return jsonify({'error':'Username must be 3+ characters and password 6+ characters.'}),400
    if p!=cp: return jsonify({'error':'Passwords do not match.'}),400
    try:
        cur=db().execute('INSERT INTO users(username,password_hash,address,phone) VALUES(?,?,?,?)',(u,hash_pw(p),address,phone)); db().commit()
        return jsonify({'message':'Account created successfully.'}),201
    except sqlite3.IntegrityError: return jsonify({'error':'Username already exists.'}),409

@app.post('/api/auth/login')
def login():
    d=request.json or {}; u=(d.get('username') or '').strip(); p=d.get('password') or ''
    row=db().execute('SELECT * FROM users WHERE username=?',(u,)).fetchone()
    if not row or row['password_hash']!=hash_pw(p): return jsonify({'error':'Invalid username or password.'}),401
    t=token_for(row['id'])
    db().execute('INSERT INTO sessions(token,user_id) VALUES(?,?)',(t,row['id']))
    db().commit()
    SESSIONS[t]=row['id']
    return jsonify({'token':t,'username':row['username']})

@app.post('/api/auth/reset')
def reset():
    d=request.json or {}; u=(d.get('username') or '').strip(); p=d.get('password') or ''; cp=d.get('confirmPassword') or ''
    if p!=cp: return jsonify({'error':'Passwords do not match.'}),400
    cur=db().execute('UPDATE users SET password_hash=? WHERE username=?',(hash_pw(p),u)); db().commit()
    if cur.rowcount==0: return jsonify({'error':'Username not found.'}),404
    return jsonify({'message':'Password updated successfully.'})

@app.get('/api/profile')
@auth
def profile():
    r=db().execute('SELECT id,username,address,phone,created_at FROM users WHERE id=?',(request.user_id,)).fetchone()
    return jsonify(dict(r))

@app.put('/api/profile')
@auth
def update_profile():
    d=request.json or {}
    address=(d.get('address') or '').strip()
    phone=(d.get('phone') or '').strip()
    db().execute('UPDATE users SET address=?, phone=? WHERE id=?',(address,phone,request.user_id)); db().commit()
    return jsonify({'message':'Profile updated successfully.','address':address,'phone':phone})

@app.post('/api/profile/password')
@auth
def change_profile_password():
    d=request.json or {}
    current=d.get('currentPassword') or ''
    new=d.get('newPassword') or ''
    cp=d.get('confirmPassword') or ''
    if len(new)<6: return jsonify({'error':'New password must be at least 6 characters.'}),400
    if new!=cp: return jsonify({'error':'New passwords do not match.'}),400
    row=db().execute('SELECT password_hash FROM users WHERE id=?',(request.user_id,)).fetchone()
    if not row or row['password_hash']!=hash_pw(current): return jsonify({'error':'Current password is incorrect.'}),401
    db().execute('UPDATE users SET password_hash=? WHERE id=?',(hash_pw(new),request.user_id)); db().commit()
    return jsonify({'message':'Password changed successfully.'})

@app.post('/api/profile/delete')
@auth
def delete_profile():
    d=request.json or {}; p=d.get('password') or ''; cp=d.get('confirmPassword') or ''
    if p!=cp: return jsonify({'error':'Passwords do not match.'}),400
    r=db().execute('SELECT password_hash FROM users WHERE id=?',(request.user_id,)).fetchone()
    if not r or r['password_hash']!=hash_pw(p): return jsonify({'error':'Current password is incorrect.'}),401
    db().execute('DELETE FROM users WHERE id=?',(request.user_id,)); db().commit()
    db().execute('DELETE FROM sessions WHERE user_id=?',(request.user_id,)); db().commit()
    for k,v in list(SESSIONS.items()):
        if v==request.user_id: del SESSIONS[k]
    return jsonify({'message':'Account deleted.'})

@app.post('/api/google/autocomplete')
def google_autocomplete():
    if not GOOGLE_MAPS_API_KEY:
        return jsonify({'error':'Google Maps API key is not configured. Set GOOGLE_MAPS_API_KEY in the backend environment.'}), 503
    text=(request.json or {}).get('input','').strip()
    if len(text)<2: return jsonify({'suggestions':[]})
    body={'input':text,'includedRegionCodes':['in'],'languageCode':'en'}
    try:
        r=requests.post(GOOGLE_AUTOCOMPLETE,json=body,headers={'Content-Type':'application/json','X-Goog-Api-Key':GOOGLE_MAPS_API_KEY,'X-Goog-FieldMask':'suggestions.placePrediction'},timeout=5)
        r.raise_for_status(); data=r.json(); out=[]
        for s in data.get('suggestions',[]):
            p=s.get('placePrediction')
            if not p: continue
            out.append({'place':p.get('place'),'name':p.get('text',{}).get('text',''),'main':p.get('structuredFormat',{}).get('mainText',{}).get('text',''),'secondary':p.get('structuredFormat',{}).get('secondaryText',{}).get('text','')})
        return jsonify({'suggestions':out})
    except Exception as e:
        return jsonify({'error':'Google location suggestions are unavailable right now.','details':str(e)}),502

@app.post('/api/google/place-details')
def google_place_details():
    if not GOOGLE_MAPS_API_KEY: return jsonify({'error':'Google Maps API key is not configured.'}),503
    name=(request.json or {}).get('place','').strip()
    if not name.startswith('places/'):
        return jsonify({'error':'Invalid Google place reference.'}),400
    try:
        r=requests.get(GOOGLE_DETAILS.format(name=name),headers={'X-Goog-Api-Key':GOOGLE_MAPS_API_KEY,'X-Goog-FieldMask':'id,displayName,formattedAddress,location,primaryType,types,nationalPhoneNumber,regularOpeningHours'},timeout=5)
        r.raise_for_status(); d=r.json(); loc=d.get('location',{})
        return jsonify({'name':d.get('formattedAddress') or d.get('displayName',{}).get('text',''),'lat':loc.get('latitude'),'lon':loc.get('longitude'),'place_id':d.get('id'),'category':d.get('primaryType'),'types':d.get('types',[]),'phone':d.get('nationalPhoneNumber'),'open_now':(d.get('regularOpeningHours') or {}).get('openNow')})
    except Exception as e:
        return jsonify({'error':'Unable to load the selected Google place.','details':str(e)}),502

@app.post('/api/reverse-geocode')
def reverse_geocode():
    d=request.json or {}; lat=d.get('lat'); lon=d.get('lon')
    if lat is None or lon is None: return jsonify({'error':'Coordinates are required.'}),400
    lat=float(lat); lon=float(lon)

    # Prefer Google Geocoding when the configured key/project supports it.
    if GOOGLE_MAPS_API_KEY:
        try:
            r=requests.get(GOOGLE_GEOCODE,params={'latlng':f'{lat},{lon}','key':GOOGLE_MAPS_API_KEY,'language':'en'},timeout=5)
            r.raise_for_status(); data=r.json()
            if data.get('status') == 'OK' and data.get('results'):
                result=data['results'][0]
                return jsonify({'name':result.get('formatted_address') or 'Detected Location','lat':lat,'lon':lon,'provider':'google'})
        except Exception:
            pass

    # Fallback for demo keys/projects where Google Geocoding is not enabled.
    # This only supplies the human-readable name; the coordinates still come from the browser.
    try:
        r=requests.get('https://nominatim.openstreetmap.org/reverse',params={'lat':lat,'lon':lon,'format':'jsonv2','zoom':18,'addressdetails':1},headers={'User-Agent':'SmartTrafficManagementSystem/1.0'},timeout=5)
        r.raise_for_status(); data=r.json(); address=data.get('address') or {}
        name=(address.get('road') or address.get('neighbourhood') or address.get('suburb') or address.get('village') or address.get('town') or address.get('city') or address.get('county'))
        parts=[name, address.get('city') or address.get('town') or address.get('village'), address.get('state'), address.get('country')]
        label=', '.join(dict.fromkeys([x for x in parts if x]))
        if label:
            return jsonify({'name':label,'lat':lat,'lon':lon,'provider':'openstreetmap-fallback'})
    except Exception:
        pass

    return jsonify({'error':'Could not identify your current location. Please enable location services and try again.'}),502

@app.post('/api/geocode')
def geocode():
    # Kept for compatibility; normal location search uses Google Autocomplete.
    q=(request.json or {}).get('query','').strip()
    if not q: return jsonify({'results':[]})
    if not GOOGLE_MAPS_API_KEY: return jsonify({'error':'Google Maps API key is not configured.'}),503
    try:
        r=requests.post(GOOGLE_AUTOCOMPLETE,json={'input':q,'includedRegionCodes':['in'],'languageCode':'en'},headers={'Content-Type':'application/json','X-Goog-Api-Key':GOOGLE_MAPS_API_KEY,'X-Goog-FieldMask':'suggestions.placePrediction'},timeout=5)
        r.raise_for_status(); data=r.json(); out=[]
        for s in data.get('suggestions',[]):
            pp=s.get('placePrediction') or {}
            text=(pp.get('text') or {}).get('text','')
            if text: out.append({'name':text,'place':pp.get('place')})
        return jsonify({'results':out})
    except Exception as e:
        return jsonify({'error':'Google location search is temporarily unavailable.','details':str(e)}),502

NEARBY_CACHE = {}

def _nearby_query(kind, lat, lon):
    # One bounded 10-km query is used for speed; results are then assigned to the
    # first successful 1..10 km radius. The user-visible behavior remains progressive.
    q='[out:json][timeout:10];'+SERVICE_FILTERS[kind].format(r=10000,lat=lat,lon=lon)+'out center tags;'
    last=None
    for endpoint in OVERPASS_ENDPOINTS[:2]:
        try:
            resp=requests.post(endpoint,data=q,headers=HEADERS,timeout=11)
            resp.raise_for_status()
            return resp.json().get('elements',[])
        except Exception as e:
            last=e
    raise last or RuntimeError('No nearby provider responded')

@app.post('/api/nearby')
def nearby():
    d=request.json or {}; kind=d.get('kind'); lat=d.get('lat'); lon=d.get('lon')
    if kind not in GOOGLE_NEARBY_TYPES or lat is None or lon is None: return jsonify({'error':'Invalid search.'}),400
    if not GOOGLE_MAPS_API_KEY:
        return jsonify({'error':'Google Maps API key is not configured. Set GOOGLE_MAPS_API_KEY in the backend environment.'}),503
    lat=float(lat); lon=float(lon)
    # All nearby cards use the same 0-3 km result window. We fetch all
    # suitable provider results in that window and do not stop at the first
    # successful 1 km radius. This keeps Food, Transport, Fuel/EV, ATM, Lodge
    # and Hospital behavior consistent.
    search_radius_m = 3000.0
    body={'includedTypes':GOOGLE_NEARBY_TYPES[kind],'maxResultCount':20,'rankPreference':'DISTANCE','locationRestriction':{'circle':{'center':{'latitude':lat,'longitude':lon},'radius':search_radius_m}},'languageCode':'en','regionCode':'IN'}
    fields='places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.types,places.nationalPhoneNumber,places.regularOpeningHours,places.rating,places.userRatingCount,places.priceLevel,places.websiteUri,places.servesBreakfast,places.servesBrunch,places.servesLunch,places.servesDinner,places.servesVegetarianFood,places.servesCoffee,places.servesDessert,places.takeout,places.delivery,places.dineIn'
    try:
        r=requests.post(GOOGLE_NEARBY,json=body,headers={'Content-Type':'application/json','X-Goog-Api-Key':GOOGLE_MAPS_API_KEY,'X-Goog-FieldMask':fields},timeout=8)
        r.raise_for_status(); data=r.json()
    except Exception as e:
        return jsonify({'error':'Google nearby search is temporarily unavailable.','details':str(e)}),502
    candidates=[]; seen=set()
    for p in data.get('places',[]):
        loc=p.get('location') or {}; la=loc.get('latitude'); lo=loc.get('longitude'); name=(p.get('displayName') or {}).get('text')
        if la is None or lo is None or not name: continue
        key=(p.get('id'),round(float(la),5),round(float(lo),5))
        if key in seen: continue
        seen.add(key)
        dist=haversine(lat,lon,float(la),float(lo))
        if dist>10.0: continue
        candidates.append({
            'name':name,'lat':float(la),'lon':float(lo),'distance_km':round(dist,2),
            'category':p.get('primaryType') or kind,'address':p.get('formattedAddress',''),
            'phone':p.get('nationalPhoneNumber'),'open_now':(p.get('regularOpeningHours') or {}).get('openNow'),
            'place_id':p.get('id'),'rating':p.get('rating'),'user_rating_count':p.get('userRatingCount'),
            'price_level':p.get('priceLevel'),'website':p.get('websiteUri'),
            'serves_breakfast':p.get('servesBreakfast'),'serves_brunch':p.get('servesBrunch'),
            'serves_lunch':p.get('servesLunch'),'serves_dinner':p.get('servesDinner'),
            'serves_vegetarian':p.get('servesVegetarianFood'),'serves_coffee':p.get('servesCoffee'),
            'serves_dessert':p.get('servesDessert'),'takeout':p.get('takeout'),
            'delivery':p.get('delivery'),'dine_in':p.get('dineIn')
        })
    candidates.sort(key=lambda x:x['distance_km'])
    # Nearby rule: first show ALL suitable results in the 0–3 km range.
    # If there are no suitable results within 3 km, expand to 10 km and show
    # all suitable results available there. This keeps the first search fast
    # while still giving the user a 10-km fallback instead of a false no-results.
    results_3km=[x for x in candidates if x['distance_km']<=3.0]
    if results_3km:
        return jsonify({'results':results_3km,'radius_km':3,'source':'Google Places API (New)','message':f'Found {len(results_3km)} {kind} place(s) within 3 km. Showing all suitable results in the 0–3 km range.'})
    results_10km=[x for x in candidates if x['distance_km']<=10.0]
    if results_10km:
        return jsonify({'results':results_10km,'radius_km':10,'source':'Google Places API (New)','message':f'No suitable {kind} places were found within 3 km. Expanded search to 10 km and found {len(results_10km)} place(s).'})
    return jsonify({'results':[],'radius_km':10,'source':'Google Places API (New)','message':f'No suitable {kind} places found within 10 km.'})

@app.post('/api/nearby-route')
def nearby_route():
    d=request.json or {}; origin=d.get('origin'); destination=d.get('destination')
    if not origin or not destination:
        return jsonify({'error':'Origin and destination are required.'}),400
    if not GOOGLE_MAPS_API_KEY:
        return jsonify({'error':'Google Maps API key is not configured.'}),503
    try:
        body={
            'origin':{'location':{'latLng':{'latitude':float(origin['lat']),'longitude':float(origin['lon'])}}},
            'destination':{'location':{'latLng':{'latitude':float(destination['lat']),'longitude':float(destination['lon'])}}},
            'travelMode':'DRIVE',
            'routingPreference':'TRAFFIC_AWARE',
            'computeAlternativeRoutes':False,
            'languageCode':'en-US',
            'units':'METRIC'
        }
        fieldmask='routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.encodedPolyline'
        r=requests.post(GOOGLE_ROUTES,json=body,headers={
            'Content-Type':'application/json',
            'X-Goog-Api-Key':GOOGLE_MAPS_API_KEY,
            'X-Goog-FieldMask':fieldmask
        },timeout=10)
        if r.ok:
            routes_data=r.json().get('routes') or []
            if routes_data:
                route=routes_data[0]
                return jsonify({
                    'polyline':((route.get('polyline') or {}).get('encodedPolyline')),
                    'distance_km':round(float(route.get('distanceMeters',0))/1000,2),
                    'duration_min':round(parse_duration(route.get('duration','0s'))/60,1),
                    'traffic':_traffic_label(parse_duration(route.get('duration','0s')),parse_duration(route.get('staticDuration','0s'))),
                    'source':'Google Routes API (New)'
                })
        # Demo/restricted keys may not have Routes API access. Use a real road
        # routing fallback so the in-app Google map still gets an actual path.
        coords=f"{float(origin['lon'])},{float(origin['lat'])};{float(destination['lon'])},{float(destination['lat'])}"
        rr=requests.get(OSRM+'/'+coords,params={'overview':'full','alternatives':'false','steps':'false','geometries':'geojson'},headers=HEADERS,timeout=12)
        rr.raise_for_status(); od=rr.json(); ors=od.get('routes') or []
        if not ors: return jsonify({'error':'No road route was returned for this place.'}),404
        route=ors[0]; geometry=(route.get('geometry') or {}).get('coordinates') or []
        path=[{'lat':float(x[1]),'lng':float(x[0])} for x in geometry if len(x)>=2]
        return jsonify({
            'path':path,
            'distance_km':round(float(route.get('distance',0))/1000,2),
            'duration_min':round(float(route.get('duration',0))/60,1),
            'traffic':'Live traffic unavailable (OSRM fallback)',
            'source':'OSRM / OpenStreetMap fallback'
        })
    except Exception as e:
        return jsonify({'error':'Nearby route calculation is temporarily unavailable.','details':str(e)}),502

def haversine(a,b,c,d):
    R=6371; p1=math.radians(a); p2=math.radians(c); dp=math.radians(c-a); dl=math.radians(d-b)
    x=math.sin(dp/2)**2+math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*R*math.asin(math.sqrt(x))

def _traffic_label(duration_s, static_s):
    if not static_s or static_s <= 0: return 'Traffic data unavailable'
    delay=max(0.0,float(duration_s)-float(static_s)) / 60.0
    if delay < 1: return 'Low / no traffic delay'
    if delay < 5: return f'Moderate traffic (+{delay:.1f} min)'
    return f'Heavy traffic (+{delay:.1f} min)'

def _route_score(route):
    # Relative score using only actual returned route metrics. Accident data is not
    # fabricated; when no verified accident feed exists, the score redistributes
    # that weight across distance, time and traffic delay.
    metrics=route['_metrics']
    dist=metrics['distance']; dur=metrics['duration']; delay=max(0.0,dur-metrics.get('static',dur))
    dist_score=1/(1+dist/10000)
    time_score=1/(1+dur/900)
    traffic_score=1/(1+delay/300)
    raw=(0.40*dist_score)+(0.40*time_score)+(0.20*traffic_score)
    return round(max(0,min(100,raw*100)),1)

@app.post('/api/routes')
def routes():
    d=request.json or {}; a=d.get('from'); b=d.get('to')
    if not a or not b:
        return jsonify({'error':'Source and destination are required.'}),400

    google_error=None
    candidates=[]

    # Collect genuine candidates from every available routing source instead of
    # returning immediately after the first provider. The frontend can then
    # combine these with Google Maps JS routes and display up to 15 DISTINCT
    # actual road paths. No artificial geometry is generated.
    if GOOGLE_MAPS_API_KEY:
        try:
            now=datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z')
            body={
                'origin':{'location':{'latLng':{'latitude':float(a['lat']),'longitude':float(a['lon'])}}},
                'destination':{'location':{'latLng':{'latitude':float(b['lat']),'longitude':float(b['lon'])}}},
                'travelMode':'DRIVE','routingPreference':'TRAFFIC_AWARE',
                'computeAlternativeRoutes':True,'departureTime':now,
                'languageCode':'en-US','units':'METRIC'
            }
            fieldmask=','.join([
                'routes.distanceMeters','routes.duration','routes.staticDuration',
                'routes.routeLabels','routes.polyline.encodedPolyline','routes.description'
            ])
            r=requests.post(GOOGLE_ROUTES,json=body,headers={
                'Content-Type':'application/json','X-Goog-Api-Key':GOOGLE_MAPS_API_KEY,
                'X-Goog-FieldMask':fieldmask
            },timeout=15)
            if r.ok:
                for i,x in enumerate(r.json().get('routes',[]) or []):
                    dist=float(x.get('distanceMeters',0)); dur=parse_duration(x.get('duration','0s')); static=parse_duration(x.get('staticDuration','0s'))
                    poly=((x.get('polyline') or {}).get('encodedPolyline'))
                    if not poly or dist<=0 or dur<=0: continue
                    path=decode_polyline_backend(poly,5)
                    if not path: continue
                    delay=max(0.0,dur-static)
                    candidates.append({
                        'distance_km':round(dist/1000,2),'duration_min':round(dur/60,1),
                        'static_duration_min':round(static/60,1),'traffic_delay_min':round(delay/60,1),
                        'traffic':_traffic_label(dur,static),'traffic_aware':True,
                        'accidents':'No verified accident feed connected',
                        'route_label':(x.get('routeLabels') or ['Google traffic-aware route'])[0],
                        'description':x.get('description') or '',
                        'polyline':poly,'polyline_precision':5,'path':path,
                        'provider':'google_traffic_aware','source_provider':'Google Routes API',
                        '_metrics':{'distance':dist,'duration':dur,'static':static}
                    })
            else:
                try: google_error=r.json().get('error',{}).get('message') or r.text[:500]
                except Exception: google_error=r.text[:500]
        except Exception as e:
            google_error=str(e)
    else:
        google_error='Google Maps API key is not configured.'

    # Valhalla: primary route + genuine alternatives.
    try:
        vbody={
            'locations':[{'lat':float(a['lat']),'lon':float(a['lon'])},{'lat':float(b['lat']),'lon':float(b['lon'])}],
            'costing':'auto','alternates':3,'units':'kilometers','language':'en-US','directions_type':'instructions'
        }
        vr=requests.post(VALHALLA,json=vbody,headers={**HEADERS,'X-Client-Id':'smart-traffic-management-system'},timeout=18)
        if vr.ok:
            vd=vr.json(); trips=[]
            if vd.get('trip'): trips.append(vd['trip'])
            for alt in (vd.get('alternates') or []):
                trip=alt.get('trip') if isinstance(alt,dict) and alt.get('trip') else alt
                if isinstance(trip,dict): trips.append(trip)
            for trip in trips:
                summary=trip.get('summary') or {}; legs=trip.get('legs') or []
                shape=''.join((leg.get('shape') or '') for leg in legs)
                if not shape or not summary.get('length'): continue
                path=decode_polyline_backend(shape,6)
                if not path: continue
                dist=float(summary.get('length',0))*1000; dur=float(summary.get('time',0))
                candidates.append({
                    'distance_km':round(dist/1000,2),'duration_min':round(dur/60,1),
                    'traffic':'Traffic unavailable — Valhalla road routing','traffic_aware':False,
                    'traffic_delay_min':None,'accidents':'No verified accident feed connected',
                    'route_label':'Valhalla road route','polyline':shape,'polyline_precision':6,
                    'path':path,'provider':'valhalla_fallback','source_provider':'Valhalla',
                    '_metrics':{'distance':dist,'duration':dur,'static':dur}
                })
    except Exception:
        pass

    # OSRM: request alternatives in three legitimate routing modes. OSRM itself
    # does not promise an alternative, so every returned geometry is still
    # validated and deduplicated before it reaches the UI.
    coords=f"{float(a['lon'])},{float(a['lat'])};{float(b['lon'])},{float(b['lat'])}"
    for continue_straight in ('default','true','false'):
        try:
            params={'overview':'full','alternatives':3,'steps':'false','geometries':'polyline'}
            if continue_straight!='default': params['continue_straight']=continue_straight
            rr=requests.get(OSRM+'/'+coords,params=params,headers=HEADERS,timeout=15)
            rr.raise_for_status()
            for x in rr.json().get('routes',[]) or []:
                dist=float(x.get('distance',0)); dur=float(x.get('duration',0)); poly=x.get('geometry')
                if not poly or dist<=0: continue
                path=decode_polyline_backend(poly,5)
                if not path: continue
                label='OSRM road route'
                if continue_straight=='true': label+=' (straight-preference search)'
                elif continue_straight=='false': label+=' (turn-flexible search)'
                candidates.append({
                    'distance_km':round(dist/1000,2),'duration_min':round(dur/60,1),
                    'traffic':'Traffic unavailable — OSRM road routing','traffic_aware':False,
                    'traffic_delay_min':None,'accidents':'No verified accident feed connected',
                    'route_label':label,'polyline':poly,'polyline_precision':5,'path':path,
                    'provider':'osrm_fallback','source_provider':'OSRM','_metrics':{'distance':dist,'duration':dur,'static':dur}
                })
        except Exception:
            continue

    if not candidates:
        return jsonify({'error':'No road route was returned by the available routing providers.','details':google_error}),502

    # Geometry-aware de-duplication. Exact encoded strings are not enough because
    # two providers can describe the same road with different polyline sampling.
    unique=[]
    for c in candidates:
        if any(paths_are_same(c.get('path'),u.get('path')) for u in unique):
            continue
        unique.append(c)

    for c in unique:
        c['score']=_route_score({'_metrics':c['_metrics']})
        c.pop('_metrics',None)
        c['recommended']=False
        c['recommendation']='Alternative actual road route.'

    # Traffic-aware routes are ranked using the real traffic-aware metrics.
    # Fallback routes remain clearly marked as non-traffic-aware.
    unique.sort(key=lambda x:(-float(x.get('score',0)),float(x.get('duration_min',999999)),float(x.get('distance_km',999999))))
    for idx,c in enumerate(unique,1):
        c['id']=idx
        c['recommended']=idx==1
        if c.get('traffic_aware'):
            c['recommendation']='Recommended using traffic-aware ETA, traffic delay and actual road distance.' if idx==1 else 'Alternative traffic-aware road route returned by Google.'
        else:
            c['recommendation']='Alternative actual road route. Live traffic is unavailable for this provider.'

    return jsonify({
        'routes':unique[:15],
        'source':'Combined genuine routing providers',
        'provider':'multi_provider',
        'traffic_aware':any(x.get('traffic_aware') for x in unique),
        'available_route_count':len(unique),
        'requested_route_count':15,
        'note':'Up to 15 distinct actual road paths are collected when the providers return enough genuinely different alternatives. Routes are never fabricated; every displayed route contains its own returned road geometry.'
    })


def _path_points(path, count=24):
    if not path: return []
    step=max(1,len(path)//count)
    out=[]
    for p in path[::step][:count]:
        try:
            if isinstance(p,(list,tuple)): out.append((float(p[0]),float(p[1])))
            else: out.append((float(p.get('lat')),float(p.get('lng'))))
        except Exception: pass
    return out


def _point_distance_km(a,b):
    return haversine(a[0],a[1],b[0],b[1])


def paths_are_same(a,b):
    """Return True when two route geometries are effectively the same road path."""
    pa=_path_points(a); pb=_path_points(b)
    if not pa or not pb: return True
    # Compare sampled points in both directions. Shared start/end roads are common;
    # require most of the geometry to overlap before calling routes duplicates.
    def directed_similarity(src,dst):
        close=0
        max_d=0
        for p in src:
            d=min(_point_distance_km(p,q) for q in dst)
            max_d=max(max_d,d)
            if d<=0.08: close+=1  # 80 metres
        return close/max(1,len(src)),max_d
    s1,m1=directed_similarity(pa,pb); s2,m2=directed_similarity(pb,pa)
    # Exact/sampling-equivalent paths are duplicates. Routes that diverge by a
    # meaningful road segment remain separate even if they share the same ends.
    return (s1>=0.92 and s2>=0.92) or (m1<0.12 and m2<0.12)

def decode_polyline_backend(encoded, precision=5):
    if not encoded: return []
    factor=10**int(precision or 5); index=0; lat=0; lng=0; points=[]
    try:
        while index < len(encoded):
            shift=0; result=0
            while True:
                b=ord(encoded[index])-63; index+=1; result |= (b & 31) << shift; shift += 5
                if b < 32: break
            lat += (~(result >> 1) if result & 1 else (result >> 1))
            shift=0; result=0
            while True:
                b=ord(encoded[index])-63; index+=1; result |= (b & 31) << shift; shift += 5
                if b < 32: break
            lng += (~(result >> 1) if result & 1 else (result >> 1))
            points.append({'lat':lat/factor,'lng':lng/factor})
    except (IndexError,ValueError):
        return []
    return points


def path_signature_backend(path):
    if not path: return ''
    step=max(1,len(path)//24); out=[]
    for p in path[::step][:24]:
        try:
            if isinstance(p,(list,tuple)):
                lat,lng=float(p[0]),float(p[1])
            else:
                lat,lng=float(p.get('lat')),float(p.get('lng'))
            out.append(f'{lat:.4f},{lng:.4f}')
        except Exception:
            continue
    return '|'.join(out)

def parse_duration(value):
    try:
        if isinstance(value,(int,float)): return float(value)
        s=str(value)
        return float(s[:-1]) if s.endswith('s') else float(s)
    except Exception:
        return 0.0


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def frontend(path):
    # Serve the built React/PWA app from the same Flask origin so the
    # phone can use the app without a laptop or separate frontend server.
    if path.startswith('api/'):
        return jsonify({'error': 'API endpoint not found.'}), 404
    target = os.path.join(FRONTEND_DIST, path) if path else os.path.join(FRONTEND_DIST, 'index.html')
    if os.path.isfile(target):
        return send_from_directory(FRONTEND_DIST, path or 'index.html')
    index = os.path.join(FRONTEND_DIST, 'index.html')
    if os.path.isfile(index):
        return send_from_directory(FRONTEND_DIST, 'index.html')
    return jsonify({'error': 'Frontend build not found. Run npm run build in frontend.'}), 503


@app.post('/api/logout')
@auth
def logout():
    t=request.headers.get('Authorization','').replace('Bearer ','').strip()
    if t:
        db().execute('DELETE FROM sessions WHERE token=?',(t,)); db().commit()
        SESSIONS.pop(t,None)
    return jsonify({'message':'Logged out'})

if __name__=='__main__':
    init_db(); app.run(host='0.0.0.0',port=int(os.environ.get('PORT',10000)),debug=False)
