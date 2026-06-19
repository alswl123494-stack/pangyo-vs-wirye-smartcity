const REGION_COLOR = { pangyo: '#0f6e56', cheongna: '#993c1d' };
const REGION_FILL = { pangyo: '#9fe1cb', cheongna: '#f0997b' };
const REGION_LABEL = { pangyo: '판교', cheongna: '청라국제도시' };

let currentMinute = 30;
let currentMode = 'split';
let isoLayers = { pangyo: {}, cheongna: {} };
let stationLayers = {};
let statsData = [];
let curveData = [];
let mapPangyo, mapCheongna;

function makeMap(elId, center) {
  const map = L.map(elId, { zoomControl: true, attributionControl: false }).setView(center, 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
  return map;
}

function syncMaps(a, b) {
  let syncing = false;
  a.on('moveend', () => {
    if (syncing) return;
    syncing = true;
    b.setView(a.getCenter(), a.getZoom(), { animate: false });
    syncing = false;
  });
  b.on('moveend', () => {
    if (syncing) return;
    syncing = true;
    a.setView(b.getCenter(), b.getZoom(), { animate: false });
    syncing = false;
  });
}

async function loadGeojson(path) {
  const res = await fetch(path);
  return res.json();
}

function addIsochrone(map, region, minute, geojson) {
  const layer = L.geoJSON(geojson, {
    style: { color: REGION_COLOR[region], weight: 1.5, fillColor: REGION_FILL[region], fillOpacity: 0.35 },
  });
  isoLayers[region][minute] = layer;
}

function addStation(map, region, geojson) {
  stationLayers[region] = L.geoJSON(geojson, {
    pointToLayer: (feature, latlng) =>
      L.circleMarker(latlng, {
        radius: 7,
        color: '#fff',
        weight: 2,
        fillColor: REGION_COLOR[region],
        fillOpacity: 1,
      }).bindPopup(`<b>${feature.properties.name}</b><br>핵심역`),
  });
}

function renderIsochrone() {
  [mapPangyo, mapCheongna].forEach((map) => {
    if (!map) return;
    Object.values(isoLayers.pangyo).forEach((l) => map.removeLayer(l));
    Object.values(isoLayers.cheongna).forEach((l) => map.removeLayer(l));
  });

  isoLayers.pangyo[currentMinute].addTo(mapPangyo);
  stationLayers.pangyo.addTo(mapPangyo);

  if (currentMode === 'split') {
    isoLayers.cheongna[currentMinute].addTo(mapCheongna);
    stationLayers.cheongna.addTo(mapCheongna);
  } else {
    isoLayers.cheongna[currentMinute].addTo(mapPangyo);
    stationLayers.cheongna.addTo(mapPangyo);
  }
}

function renderStats() {
  const get = (region) => statsData.find((d) => d.region === region && d.threshold_min === currentMinute);
  const p = get('pangyo');
  const c = get('cheongna');
  if (!p || !c) return;

  document.getElementById('stat-pangyo').textContent = p.oa_count.toLocaleString();
  document.getElementById('stat-cheongna').textContent = c.oa_count.toLocaleString();

  const ratio = (p.reachable_employment / c.reachable_employment).toFixed(1);
  document.getElementById('compare-text').innerHTML =
    `${currentMinute}분 기준<br><b style="font-size:18px;color:#1c1f24">${ratio}배</b><br>도달가능 종사자`;
}

let chart;
function renderCurve() {
  const ctx = document.getElementById('curve-chart').getContext('2d');
  const minutes = [...new Set(curveData.map((d) => d.minute))].sort((a, b) => a - b);
  const series = (region) =>
    minutes.map((m) => curveData.find((d) => d.region === region && d.minute === m)?.reachable_employment ?? 0);

  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: minutes,
      datasets: [
        {
          label: '판교 — 도달가능 종사자',
          data: series('pangyo'),
          borderColor: REGION_COLOR.pangyo,
          backgroundColor: REGION_COLOR.pangyo + '22',
          fill: true,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: '청라 — 도달가능 종사자',
          data: series('cheongna'),
          borderColor: REGION_COLOR.cheongna,
          backgroundColor: REGION_COLOR.cheongna + '22',
          fill: true,
          tension: 0.25,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 12 } } } },
      scales: {
        x: { title: { display: true, text: '소요시간(분)' } },
        y: { title: { display: true, text: '도달가능 종사자수' }, ticks: { callback: (v) => v.toLocaleString() } },
      },
    },
  });
}

async function init() {
  mapPangyo = makeMap('map-pangyo', [37.3948, 127.1112]);
  mapCheongna = makeMap('map-cheongna', [37.5565, 126.6246]);
  syncMaps(mapPangyo, mapCheongna);

  const [iso30p, iso60p, iso30c, iso60c, stationsP, stationsC, stats, curve] = await Promise.all([
    loadGeojson('data/isochrone_pangyo_30.geojson'),
    loadGeojson('data/isochrone_pangyo_60.geojson'),
    loadGeojson('data/isochrone_cheongna_30.geojson'),
    loadGeojson('data/isochrone_cheongna_60.geojson'),
    loadGeojson('data/core_stations.geojson'),
    loadGeojson('data/core_stations.geojson'),
    loadGeojson('data/stats.json'),
    loadGeojson('data/curve.json'),
  ]);

  addIsochrone(null, 'pangyo', 30, iso30p);
  addIsochrone(null, 'pangyo', 60, iso60p);
  addIsochrone(null, 'cheongna', 30, iso30c);
  addIsochrone(null, 'cheongna', 60, iso60c);

  const onlyRegion = (geojson, region) => ({
    type: 'FeatureCollection',
    features: geojson.features.filter((f) => f.properties.region === region),
  });
  addStation(mapPangyo, 'pangyo', onlyRegion(stationsP, 'pangyo'));
  addStation(mapCheongna, 'cheongna', onlyRegion(stationsC, 'cheongna'));

  statsData = stats;
  curveData = curve;

  renderIsochrone();
  renderStats();
  renderCurve();

  document.getElementById('time-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-btn');
    if (!btn) return;
    document.querySelectorAll('#time-toggle .toggle-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentMinute = Number(btn.dataset.min);
    renderIsochrone();
    renderStats();
  });

  document.getElementById('view-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-btn');
    if (!btn) return;
    document.querySelectorAll('#view-toggle .toggle-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
    document.getElementById('map-stage').classList.toggle('overlay-mode', currentMode === 'overlay');
    setTimeout(() => {
      mapPangyo.invalidateSize();
      mapCheongna.invalidateSize();
    }, 50);
    renderIsochrone();
  });
}

init();
