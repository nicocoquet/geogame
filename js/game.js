import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.10.0/dist/maplibre-gl.mjs';

const target = { name: 'Ulm', lat: 48.4011, lon: 9.9876 };
let guess = null;
let guessMarker = null;
let answerMarker = null;

const validateButton = document.querySelector('#validate');
const resetButton = document.querySelector('#reset');
const status = document.querySelector('#status');
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
  attributionControl: true,
  maplibreLogo: true
});

map.on('load', () => {
  map.setProjection({ type: 'globe' });
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

map.on('click', (event) => {
  if (!validateButton.hidden && !result.hidden) return;
  if (!result.hidden) return;

  guess = { lon: event.lngLat.lng, lat: event.lngLat.lat };

  if (guessMarker) guessMarker.remove();
  const markerElement = document.createElement('div');
  markerElement.className = 'guess-marker';
  guessMarker = new maplibregl.Marker({ element: markerElement })
    .setLngLat([guess.lon, guess.lat])
    .addTo(map);

  validateButton.disabled = false;
  status.textContent = 'Repère posé. Tu peux encore le déplacer ou valider.';
});

validateButton.addEventListener('click', () => {
  if (!guess) return;

  const distance = haversineKm(guess.lat, guess.lon, target.lat, target.lon);
  const score = scoreFromDistance(distance);

  const markerElement = document.createElement('div');
  markerElement.className = 'answer-marker';
  answerMarker = new maplibregl.Marker({ element: markerElement })
    .setLngLat([target.lon, target.lat])
    .addTo(map);

  distanceOutput.textContent = `${Math.round(distance).toLocaleString('fr-FR')} km d’écart`;
  scoreOutput.textContent = `${score} / 100 points`;
  result.hidden = false;
  validateButton.hidden = true;
  resetButton.hidden = false;
  status.textContent = 'Orange : ton choix. Vert : la réponse.';
});

resetButton.addEventListener('click', () => {
  guess = null;
  guessMarker?.remove();
  answerMarker?.remove();
  guessMarker = null;
  answerMarker = null;
  result.hidden = true;
  validateButton.hidden = false;
  validateButton.disabled = true;
  resetButton.hidden = true;
  status.textContent = 'Fais tourner et zoome le globe, puis touche l’endroit choisi.';
  map.flyTo({ center: [8, 25], zoom: 1.35, essential: true });
});

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
