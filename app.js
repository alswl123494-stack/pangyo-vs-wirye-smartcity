const REGION_COLOR = { pangyo: '#0f6e56', cheongna: '#993c1d' };
const REGION_FILL = { pangyo: '#9fe1cb', cheongna: '#f0997b' };

const LANDUSE_COLORS = {
  '주거지역': '#4a7fb5',
  '상업지역': '#d9853b',
  '공업지역': '#8a6bbf',
  '녹지지역': '#6fae57',
  '기타': '#999999'
};

const LANDUSE_CATEGORY = {
  '제1종전용주거지역': '주거지역',
  '제1종일반주거지역': '주거지역',
  '제2종일반주거지역': '주거지역',
  '제3종일반주거지역': '주거지역',
  '준주거지역': '주거지역',
  '중심상업지역': '상업지역',
  '근린상업지역': '상업지역',
  '일반상업지역': '상업지역',
  '유통상업지역': '상업지역',
  '준공업지역': '공업지역',
  '일반공업지역': '공업지역',
  '자연녹지지역': '녹지지역',
  '보전녹지지역': '녹지지역',
};

let currentMinute = 30;
let currentMode = 'split';
let currentLayer = 'isochrone';
let isoLayers = { pangyo: {}, cheongna: {} };
let stationLayers = {};
let landuseLayers = {};
let statsData = [];
let curveData = [];
let mapPangyo, mapCheongna;
let landuseGeomData = {};

function makeMap(elId, center) {
  const map = L.map(elId, { zoomControl: true, attributionControl: false }).setView(center, 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
  return map;
}

function syncMaps(a, b) {
  let syncing = false;
  a.on('zoomend', () => {
    if (syncing) return;
    syncing = true;
    if (b.getZoom() !== a.getZoom()) b.setZoom(a.getZoom(), { animate: false });
    syncing = false;
  });
  b.on('zoomend', () => {
    if (syncing) return;
    syncing = true;
    if (a.getZoom() !== b.getZoom()) a.setZoom(b.getZoom(), { animate: false });
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

function addLanduse(region, geojson) {
  landuseLayers[region] = L.geoJSON(geojson, {
    style: (feature) => {
      const uname = feature.properties.uname;
      const cat = LANDUSE_CATEGORY[uname] || '기타';
      return { color: LANDUSE_COLORS[cat], weight: 0.5, fillColor: LANDUSE_COLORS[cat], fillOpacity: 0.6 };
    },
    onEachFeature: (f, l) => {
      const uname = f.properties.uname;
      l.bindPopup(`<b>${uname}</b>`);
    },
  });
}

function updateLegend() {
  const legend = document.getElementById('landuse-legend');
  if (currentLayer !== 'landuse') {
    legend.style.display = 'none';
    return;
  }
  legend.style.display = 'flex';
  legend.innerHTML = Object.entries(LANDUSE_COLORS)
    .map(([cat, color]) => `<span class="legend-item"><i style="background:${color}"></i>${cat}</span>`)
    .join('');
}

function renderIsochrone() {
  [mapPangyo, mapCheongna].forEach((map) => {
    if (!map) return;
    Object.values(isoLayers.pangyo).forEach((l) => map.removeLayer(l));
    Object.values(isoLayers.cheongna).forEach((l) => map.removeLayer(l));
    if (landuseLayers.pangyo) map.removeLayer(landuseLayers.pangyo);
    if (landuseLayers.cheongna) map.removeLayer(landuseLayers.cheongna);
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

function renderLanduse() {
  [mapPangyo, mapCheongna].forEach((map) => {
    if (!map) return;
    Object.values(isoLayers.pangyo).forEach((l) => map.removeLayer(l));
    Object.values(isoLayers.cheongna).forEach((l) => map.removeLayer(l));
    if (landuseLayers.pangyo) map.removeLayer(landuseLayers.pangyo);
    if (landuseLayers.cheongna) map.removeLayer(landuseLayers.cheongna);
  });

  landuseLayers.pangyo.addTo(mapPangyo);
  stationLayers.pangyo.addTo(mapPangyo);

  if (currentMode === 'split') {
    landuseLayers.cheongna.addTo(mapCheongna);
    stationLayers.cheongna.addTo(mapCheongna);
  } else {
    landuseLayers.cheongna.addTo(mapPangyo);
    stationLayers.cheongna.addTo(mapPangyo);
  }
}

function renderStats() {
  const get = (region) => statsData.find((d) => d.region === region && d.threshold_min === currentMinute);
  const p = get('pangyo');
  const c = get('cheongna');
  if (!p || !c) return;

  document.getElementById('stat-pangyo').textContent = p.reachable_employment.toLocaleString() + '명';
  document.getElementById('stat-cheongna').textContent = c.reachable_employment.toLocaleString() + '명';
  document.getElementById('stat-pangyo-sub').textContent =
    `도달가능 인구 ${p.reachable_population.toLocaleString()}명 · 역 인근 집계구 ${p.oa_count.toLocaleString()}개`;
  document.getElementById('stat-cheongna-sub').textContent =
    `도달가능 인구 ${c.reachable_population.toLocaleString()}명 · 역 인근 집계구 ${c.oa_count.toLocaleString()}개`;

  const ratio = (p.reachable_employment / c.reachable_employment).toFixed(1);
  document.getElementById('compare-text').innerHTML =
    `${currentMinute}분 기준<br><b style="font-size:18px;color:#1c1f24">${ratio}배</b><br>도달가능 종사자`;
}

let chart, landuseChart, landuseCompositionChart;
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

function renderLanduseChart() {
  const ctx = document.getElementById('landuse-chart')?.getContext('2d');
  if (!ctx) return;
  
  const categories = ['주거지역', '상업지역', '공업지역', '녹지지역'];
  const countByCategory = (geojson) => {
    const counts = {};
    categories.forEach(c => counts[c] = 0);
    geojson.features.forEach(f => {
      const cat = LANDUSE_CATEGORY[f.properties.uname] || '기타';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return categories.map(c => counts[c]);
  };

  if (landuseChart) landuseChart.destroy();
  landuseChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: categories,
      datasets: [
        {
          label: '판교',
          data: countByCategory(landuseGeomData.pangyo),
          backgroundColor: REGION_COLOR.pangyo + 'cc',
          borderColor: REGION_COLOR.pangyo,
          borderWidth: 1,
        },
        {
          label: '청라',
          data: countByCategory(landuseGeomData.cheongna),
          backgroundColor: REGION_COLOR.cheongna + 'cc',
          borderColor: REGION_COLOR.cheongna,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 12 } } } },
      scales: { y: { title: { display: true, text: '필지 개수' } } },
    },
  });
}

function renderLanduseCompositionChart() {
  const ctx = document.getElementById('landuse-composition-chart')?.getContext('2d');
  if (!ctx) return;

  // 용도지역별 면적 구성비 (%)
  const compositionData = {
    pangyo: { '주거지역': 55.7, '상업지역': 10.0, '공업지역': 0, '녹지지역': 34.4 },
    cheongna: { '주거지역': 2.3, '상업지역': 11.2, '공업지역': 9.4, '녹지지역': 71.2 }
  };

  const categories = ['주거지역', '상업지역', '공업지역', '녹지지역'];
  const pangyo = categories.map(c => compositionData.pangyo[c]);
  const cheongna = categories.map(c => compositionData.cheongna[c]);

  if (landuseCompositionChart) landuseCompositionChart.destroy();
  landuseCompositionChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: categories,
      datasets: [
        {
          label: '판교 (%)',
          data: pangyo,
          backgroundColor: '#9fe1cb',
          borderColor: REGION_COLOR.pangyo,
          borderWidth: 2,
        },
        {
          label: '청라 (%)',
          data: cheongna,
          backgroundColor: '#f0997b',
          borderColor: REGION_COLOR.cheongna,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { 
        legend: { position: 'bottom', labels: { font: { size: 12 } } },
        title: { display: true, text: '용도지역 필지 구성비 (면적 기준, %)' }
      },
      scales: { 
        y: { 
          title: { display: true, text: '비율 (%)' },
          max: 100
        } 
      },
    },
  });
}

async function init() {
  mapPangyo = makeMap('map-pangyo', [37.3948, 127.1112]);
  mapCheongna = makeMap('map-cheongna', [37.5565, 126.6246]);
  syncMaps(mapPangyo, mapCheongna);

  const [iso30p, iso60p, iso30c, iso60c, stationsP, stationsC, stats, curve, landuseP, landuseC] = await Promise.all([
    loadGeojson('data/isochrone_pangyo_30.geojson'),
    loadGeojson('data/isochrone_pangyo_60.geojson'),
    loadGeojson('data/isochrone_cheongna_30.geojson'),
    loadGeojson('data/isochrone_cheongna_60.geojson'),
    loadGeojson('data/core_stations.geojson'),
    loadGeojson('data/core_stations.geojson'),
    loadGeojson('data/stats.json'),
    loadGeojson('data/curve.json'),
    loadGeojson('data/landuse_pangyo.geojson'),
    loadGeojson('data/landuse_cheongna.geojson'),
  ]);

  landuseGeomData = { pangyo: landuseP, cheongna: landuseC };

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

  addLanduse('pangyo', landuseP);
  addLanduse('cheongna', landuseC);

  statsData = stats;
  curveData = curve;

  renderIsochrone();
  renderStats();
  renderCurve();
  renderLanduseChart();
  renderLanduseCompositionChart();

  mapPangyo.fitBounds(isoLayers.pangyo[60].getBounds(), { padding: [20, 20] });
  mapCheongna.fitBounds(isoLayers.cheongna[60].getBounds(), { padding: [20, 20] });

  document.getElementById('time-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-btn');
    if (!btn) return;
    document.querySelectorAll('#time-toggle .toggle-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentMinute = Number(btn.dataset.min);
    if (currentLayer === 'isochrone') renderIsochrone();
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
    if (currentLayer === 'isochrone') renderIsochrone();
    else renderLanduse();
  });

  document.getElementById('layer-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-btn');
    if (!btn) return;
    document.querySelectorAll('#layer-toggle .toggle-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentLayer = btn.dataset.layer;
    updateLegend();
    if (currentLayer === 'isochrone') renderIsochrone();
    else renderLanduse();
  });
}

init();
