import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.10.0/dist/maplibre-gl.mjs';

const target = { name: 'Ulm', country: 'Allemagne', countryCode: 'DEU', lat: 48.4011, lon: 9.9876 };
const COUNTRIES_URL = 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';

let guess = null;
let guessMarker = null;
let answerMarker = null;
let countriesData = null;
let revealAnimationFrame = null;

const validateButton = document.querySelector('#validate');
const resetButton = document.querySelector('#reset');
const result = document.querySelector('#result');
const distanceOutput = document.querySelector('#distance');
const scoreOutput = document.querySelector('#score');

const style = {
  version: 8,
  sources: {
    earth: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: 'Imagery © Esri and contributors'
    }
  },
  layers: [{ id: 'earth', type: 'raster', source: 'earth' }]
};

const map = new maplibregl.Map({
  container: 'map',
  style,
  center: [8, 25],
  zoom: 1.35,
  minZoom: 0.7,
  maxZoom: 8,
  attributionControl: false,
  maplibreLogo: true
});

map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

map.on('load', () => {
  map.setProjection({ type: 'globe' });
  addRevealLayers();
  loadCountries();
});

map.on('click', (event) => {
  if (!result.hidden || validateButton.hidden) return;
  guess = { lon: event.lngLat.lng, lat: event.lngLat.lat };
  guessMarker?.remove();
  const el = document.createElement('div');
  el.className = 'guess-marker';
  guessMarker = new maplibregl.Marker({ element: el }).setLngLat([guess.lon, guess.lat]).addTo(map);
  validateButton.disabled = false;
});

validateButton.addEventListener('click', () => {
  if (!guess) return;

  validateButton.disabled = true;
  validateButton.hidden = true;

  const distance = haversineKm(guess.lat, guess.lon, target.lat, target.lon);
  const score = scoreFromDistance(distance);
  const route = greatCircle(guess, target);

  // First frame the journey, then draw the geodesic progressively.
  const midpoint = greatCircle(guess, target, 2)[1];
  map.easeTo({
    center: [normalizeLon(midpoint[0]), midpoint[1]],
    zoom: zoomForDistance(distance),
    duration: 700,
    essential: true
  });

  window.setTimeout(() => {
    animateRoute(route, distance, () => {
      showAnswerMarker();
      revealCountry();
      showResult(distance, score);
      resetButton.hidden = false;
    });
  }, 450);
});

resetButton.addEventListener('click', () => {
  guess = null;
  if (revealAnimationFrame) {
    cancelAnimationFrame(revealAnimationFrame);
    revealAnimationFrame = null;
  }
  guessMarker?.remove();
  answerMarker?.remove();
  guessMarker = null;
  answerMarker = null;
  result.hidden = true;
  validateButton.hidden = false;
  validateButton.disabled = true;
  resetButton.hidden = true;
  const routeSource = map.getSource('answer-route');
  const countrySource = map.getSource('answer-country');
  routeSource?.setData(emptyCollection());
  countrySource?.setData(emptyCollection());
  map.flyTo({ center: [8, 25], zoom: 1.35, essential: true });
});

function showAnswerMarker() {
  answerMarker?.remove();
  const el = document.createElement('div');
  el.className = 'answer-marker';
  answerMarker = new maplibregl.Marker({ element: el })
    .setLngLat([target.lon, target.lat])
    .addTo(map);
}

function animateRoute(route, distanceKm, onComplete) {
  const source = map.getSource('answer-route');
  if (!source) {
    onComplete();
    return;
  }

  const coordinates = route.map(([lon, lat]) => [normalizeLon(lon), lat]);
  const duration = Math.min(1600, Math.max(900, 900 + distanceKm / 8));
  const startedAt = performance.now();

  const draw = now => {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 2);
    const lastIndex = Math.max(1, Math.floor(eased * (coordinates.length - 1)));
    const visible = coordinates.slice(0, lastIndex + 1);

    source.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: visible }
    });

    if (progress < 1) {
      revealAnimationFrame = requestAnimationFrame(draw);
    } else {
      revealAnimationFrame = null;
      onComplete();
    }
  };

  revealAnimationFrame = requestAnimationFrame(draw);
}

function showResult(distance, score) {
  distanceOutput.textContent = distance < 1
    ? `Votre choix se trouve à ${Math.round(distance * 1000).toLocaleString('fr-FR')} m de la bonne réponse.`
    : `Votre choix se trouve à ${Math.round(distance).toLocaleString('fr-FR')} km de la bonne réponse.`;
  scoreOutput.textContent = `${score} / 100 points`;
  result.hidden = false;
}

function addRevealLayers() {
  map.addSource('answer-route', { type: 'geojson', data: emptyCollection() });
  map.addLayer({
    id: 'answer-route-line',
    type: 'line',
    source: 'answer-route',
    paint: {
      'line-color': '#ffffff',
      'line-width': 3,
      'line-opacity': 0.95
    }
  });

  map.addSource('answer-country', { type: 'geojson', data: emptyCollection() });
  map.addLayer({
    id: 'answer-country-fill',
    type: 'fill',
    source: 'answer-country',
    paint: { 'fill-color': '#37d67a', 'fill-opacity': 0.12 }
  });
  map.addLayer({
    id: 'answer-country-outline',
    type: 'line',
    source: 'answer-country',
    paint: { 'line-color': '#37d67a', 'line-width': 3, 'line-opacity': 1 }
  });
}

async function loadCountries() {
  try {
    const response = await fetch(COUNTRIES_URL);
    if (!response.ok) return;
    countriesData = await response.json();
  } catch (error) {
    console.warn('Country outline unavailable:', error);
  }
}

function revealCountry() {
  if (!countriesData) return;
  const feature = countriesData.features.find(item => {
    const p = item.properties || {};
    return p['ISO3166-1-Alpha-3'] === target.countryCode || p.ISO_A3 === target.countryCode || p.ADM0_A3 === target.countryCode;
  });
  map.getSource('answer-country')?.setData(feature || emptyCollection());
}

function emptyCollection() {
  return { type: 'FeatureCollection', features: [] };
}

function zoomForDistance(distanceKm) {
  if (distanceKm < 50) return 7;
  if (distanceKm < 150) return 6;
  if (distanceKm < 400) return 5;
  if (distanceKm < 1000) return 4;
  if (distanceKm < 2500) return 3;
  if (distanceKm < 5000) return 2;
  return 1.15;
}

function greatCircle(start, end, steps = 128) {
  const toRad = d => d * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;
  const lat1 = toRad(start.lat), lon1 = toRad(start.lon);
  const lat2 = toRad(end.lat), lon2 = toRad(end.lon);
  const delta = 2 * Math.asin(Math.sqrt(
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
  ));
  if (delta < 1e-10) return [[start.lon, start.lat], [end.lon, end.lat]];
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const a = Math.sin((1 - f) * delta) / Math.sin(delta);
    const b = Math.sin(f * delta) / Math.sin(delta);
    const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);
    coords.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
  }
  return coords;
}

function normalizeLon(lon) {
  return ((lon + 180) % 360 + 360) % 360 - 180;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const radius = 6371.0088;
  const toRadians = degrees => degrees * Math.PI / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2))
    * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function scoreFromDistance(distanceKm) {
  return Math.max(0, Math.round(100 * Math.exp(-distanceKm / 1200)));
}
