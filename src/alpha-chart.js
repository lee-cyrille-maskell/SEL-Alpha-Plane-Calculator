import ApexCharts from 'apexcharts';
import { polarToCartesian, cartesianToPolar, determineResult } from './alpha-math.js';

let chart = null;
let onChartClick = null;
let currentLR = 6.0;
let currentLANG = 195.0;
let currentTolerance = 0.1;

export function initChart(containerId, clickHandler) {
  onChartClick = clickHandler;
  const container = document.getElementById(containerId);
  container.style.cursor = 'crosshair';

  const options = buildChartOptions(currentLR, currentLANG, currentTolerance);
  chart = new ApexCharts(container, options);
  chart.render().then(() => {
    // Use mousedown on the parent wrapper - guaranteed to fire
    const wrapper = document.getElementById('alpha-chart-wrapper');
    if (wrapper) {
      wrapper.addEventListener('mousedown', handleMouseClick);
    }
  });
  return chart;
}

function handleMouseClick(event) {
  if (!onChartClick || !chart) return;
  const g = chart.w.globals;
  if (!g || g.minX === undefined || isNaN(g.minX)) return;

  // Find the plot area rect
  const gridEl = document.querySelector('#alpha-chart .apexcharts-grid');
  if (!gridEl) return;
  const rect = gridEl.getBoundingClientRect();
  const px = event.clientX - rect.left;
  const py = event.clientY - rect.top;
  if (px < 0 || py < 0 || px > rect.width || py > rect.height) return;

  const dataX = g.minX + (px / rect.width) * (g.maxX - g.minX);
  const dataY = g.maxY - (py / rect.height) * (g.maxY - g.minY);
  const { mag, angleDeg } = cartesianToPolar(dataX, dataY);
  onChartClick(mag, angleDeg);
}

function round4(v) { return parseFloat(v.toFixed(4)); }

// Closed band path between two radii across an angular range
function bandPath(outerR, innerR, startDeg, endDeg, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const deg = startDeg + (endDeg - startDeg) * (i / steps);
    const rad = deg * Math.PI / 180;
    pts.push({ x: round4(outerR * Math.cos(rad)), y: round4(outerR * Math.sin(rad)) });
  }
  for (let i = steps; i >= 0; i--) {
    const deg = startDeg + (endDeg - startDeg) * (i / steps);
    const rad = deg * Math.PI / 180;
    pts.push({ x: round4(innerR * Math.cos(rad)), y: round4(innerR * Math.sin(rad)) });
  }
  pts.push(pts[0]); // close
  return pts;
}

function circlePoints(radius, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const rad = (2 * Math.PI * i) / steps;
    pts.push({ x: round4(radius * Math.cos(rad)), y: round4(radius * Math.sin(rad)) });
  }
  return pts;
}

// Tolerance band around a radial line at angleDeg, from innerR to outerR
// Creates a closed shape ±(r * tolFrac) perpendicular to the line
// so the band narrows toward the origin
function radialTolBand(angleDeg, innerR, outerR, tolFrac, steps) {
  const pts = [];
  const perpRad = (angleDeg + 90) * Math.PI / 180;
  const cosPerp = Math.cos(perpRad);
  const sinPerp = Math.sin(perpRad);
  const lineRad = angleDeg * Math.PI / 180;

  // Forward side (+tolerance perpendicular, scales with r)
  for (let i = 0; i <= steps; i++) {
    const r = innerR + (outerR - innerR) * (i / steps);
    const offset = r * tolFrac;
    pts.push({ x: round4(r * Math.cos(lineRad) + offset * cosPerp), y: round4(r * Math.sin(lineRad) + offset * sinPerp) });
  }
  // Return side (-tolerance perpendicular)
  for (let i = steps; i >= 0; i--) {
    const r = innerR + (outerR - innerR) * (i / steps);
    const offset = r * tolFrac;
    pts.push({ x: round4(r * Math.cos(lineRad) - offset * cosPerp), y: round4(r * Math.sin(lineRad) - offset * sinPerp) });
  }
  pts.push(pts[0]); // close
  return pts;
}

function generateAllSeries(lr87, lang87, tolerance) {
  const outerR = lr87;
  const innerR = 1 / lr87;
  const halfAngle = lang87 / 2;
  const startDeg = 180 - halfAngle;
  const endDeg = 180 + halfAngle;
  const steps = 120;

  // tolerance is a percentage (e.g. 5 = 5%)
  const tolFrac = tolerance / 100;
  const outerTol = outerR * tolFrac;
  const innerTol = innerR * tolFrac;
  return {
    boundary: bandPath(outerR, innerR, startDeg, endDeg, steps),
    outerTolBand: bandPath(outerR + outerTol, Math.max(outerR - outerTol, 0.01), startDeg, endDeg, steps),
    innerTolBand: bandPath(innerR + innerTol, Math.max(innerR - innerTol, 0.001), startDeg, endDeg, steps),
    startLineTol: radialTolBand(startDeg, innerR, outerR, tolFrac, 30),
    endLineTol: radialTolBand(endDeg, innerR, outerR, tolFrac, 30),
    outerCircle: circlePoints(outerR, steps),
    innerCircle: circlePoints(innerR, steps),
  };
}

// Series layout:
// 0: Alpha Plane Boundary (dark blue solid, closed)
// 1: Outer Tolerance Band (purple solid, closed)
// 2: Inner Tolerance Band (purple solid, closed)
// 3: Start Line Tolerance (purple solid, closed)
// 4: End Line Tolerance (purple solid, closed)
// 5: 87LR Circle (gray dashed)
// 6: 1/87LR Circle (gray dashed)
// 7: Trip (red scatter)
// 8: Restrain (blue scatter)
// 9: Inside Limits (amber scatter)
// 10: Preview (gray scatter)

function buildChartOptions(lr87, lang87, tolerance) {
  const range = lr87 + 1.5;
  const bd = generateAllSeries(lr87, lang87, tolerance);

  return {
    chart: {
      type: 'line',
      height: '100%',
      animations: { enabled: false },
      toolbar: { show: false },
      zoom: { enabled: false },
      events: {},
    },
    series: [
      { name: 'Alpha Plane Boundary', data: bd.boundary, type: 'line' },
      { name: 'Outer Tolerance', data: bd.outerTolBand, type: 'line' },
      { name: 'Inner Tolerance', data: bd.innerTolBand, type: 'line' },
      { name: 'Start Angle Tol', data: bd.startLineTol, type: 'line' },
      { name: 'End Angle Tol', data: bd.endLineTol, type: 'line' },
      { name: '87LR Circle', data: bd.outerCircle, type: 'line' },
      { name: '1/87LR Circle', data: bd.innerCircle, type: 'line' },
      { name: 'Trip', data: [], type: 'scatter' },
      { name: 'Restrain', data: [], type: 'scatter' },
      { name: 'Inside Limits', data: [], type: 'scatter' },
      { name: 'Preview', data: [], type: 'scatter' },
    ],
    colors: [
      '#002171',  // 0 boundary
      '#7b1fa2',  // 1 outer tol
      '#7b1fa2',  // 2 inner tol
      '#7b1fa2',  // 3 start line tol
      '#7b1fa2',  // 4 end line tol
      '#bdbdbd',  // 5 outer circle
      '#bdbdbd',  // 6 inner circle
      '#ff1744',  // 7 trip
      '#2979ff',  // 8 restrain
      '#f59e0b',  // 9 inside limits
      '#888888',  // 10 preview
    ],
    stroke: {
      width:     [4, 2.5, 2.5, 2.5, 2.5, 1, 1, 0, 0, 0, 0],
      dashArray: [0, 0,   0,   0,   0,   6, 6, 0, 0, 0, 0],
      curve: 'straight',
    },
    fill: {
      opacity: [0.05, 0.15, 0.15, 0.15, 0.15, 0, 0, 1, 1, 1, 1],
    },
    markers: {
      size:        [0, 0, 0, 0, 0, 0, 0, 9, 9, 9, 11],
      strokeWidth: [0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 3],
      strokeColors: '#fff',
      hover: { sizeOffset: 3 },
    },
    dataLabels: {
      enabled: true,
      enabledOnSeries: [7, 8, 9],
      formatter: function (val, opts) {
        const point = opts.w.config.series[opts.seriesIndex]?.data[opts.dataPointIndex];
        return point?.meta?.pointNum || '';
      },
      style: { fontSize: '10px', fontWeight: 700, colors: ['#333'] },
      background: { enabled: true, foreColor: '#333', borderRadius: 2, padding: 2, opacity: 0.8, borderWidth: 0 },
      offsetY: -14,
    },
    xaxis: {
      type: 'numeric',
      title: { text: 'Re(IR/IL)', style: { fontSize: '12px', fontWeight: 600 } },
      min: -range,
      max: range,
      tickAmount: 10,
      decimalsInFloat: 1,
      labels: { style: { fontSize: '10px' } },
    },
    yaxis: {
      title: { text: 'Im(IR/IL)', style: { fontSize: '12px', fontWeight: 600 } },
      min: -range,
      max: range,
      tickAmount: 10,
      decimalsInFloat: 1,
      labels: { style: { fontSize: '10px' } },
    },
    grid: { show: true, borderColor: '#e0e0e0' },
    tooltip: {
      shared: false,
      intersect: true,
      custom: ({ seriesIndex, dataPointIndex, w }) => {
        if (seriesIndex < 7) return '';
        const point = w.config.series[seriesIndex].data[dataPointIndex];
        if (!point || !point.meta) return '';
        const m = point.meta;
        return `<div style="padding:8px 12px;font-size:12px;font-family:Consolas,monospace;line-height:1.5;">
          <b>\u03b1 = ${m.alphaMag?.toFixed(3)} \u2220 ${m.alphaAng?.toFixed(1)}\u00b0</b><br/>
          <b>Local IA:</b> ${m.localIAMag?.toFixed(3)} A \u2220 ${m.localIAAng?.toFixed(1)}\u00b0<br/>
          <b>Remote IA:</b> ${m.remoteIAMag?.toFixed(3)} A \u2220 ${m.remoteIAAng?.toFixed(1)}\u00b0
        </div>`;
      },
    },
    legend: {
      show: true,
      position: 'top',
      fontSize: '11px',
      customLegendItems: ['Trip', 'Restrain', 'Inside Limits', 'Boundary', 'Tolerance'],
      markers: { fillColors: ['#ff1744', '#2979ff', '#f59e0b', '#0d47a1', '#7b1fa2'] },
    },
    annotations: {
      xaxis: [{ x: 0, strokeDashArray: 0, borderColor: '#333', borderWidth: 1.5 }],
      yaxis: [{ y: 0, strokeDashArray: 0, borderColor: '#333', borderWidth: 1.5 }],
      points: [{
        x: -1, y: 0,
        marker: { size: 5, fillColor: '#333', shape: 'circle', strokeColor: '#fff', strokeWidth: 2 },
        label: { text: '1\u2220180\u00b0', offsetY: -10, style: { fontSize: '10px', background: 'transparent', color: '#333', fontWeight: 600 } },
      }],
    },
  };
}

export function setPreviewPoint(alphaMag, alphaAngle) {
  if (!chart) return;
  const { re, im } = polarToCartesian(alphaMag, alphaAngle);
  const s = chart.w.config.series;
  chart.updateSeries([
    s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], s[8], s[9],
    { name: 'Preview', data: [{ x: round4(re), y: round4(im) }], type: 'scatter' },
  ]);
}

export function clearPreviewPoint() {
  if (!chart) return;
  const s = chart.w.config.series;
  chart.updateSeries([
    s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], s[8], s[9],
    { name: 'Preview', data: [], type: 'scatter' },
  ]);
}

export function updateTestPoints(testPoints) {
  if (!chart) return;
  const tripData = [], restrainData = [], limitsData = [];
  for (const tp of testPoints) {
    const { re, im } = polarToCartesian(tp.alpha_magnitude, tp.alpha_angle_deg);
    const point = {
      x: round4(re), y: round4(im),
      meta: {
        alphaMag: tp.alpha_magnitude, alphaAng: tp.alpha_angle_deg,
        localIAMag: tp.local_ia_mag, localIAAng: tp.local_ia_ang,
        remoteIAMag: tp.remote_ia_mag, remoteIAAng: tp.remote_ia_ang,
        pointNum: tp.point_number,
      },
    };
    if (tp.expected_result === 'TRIP') tripData.push(point);
    else if (tp.expected_result === 'RESTRAIN') restrainData.push(point);
    else limitsData.push(point);
  }
  const s = chart.w.config.series;
  chart.updateSeries([
    s[0], s[1], s[2], s[3], s[4], s[5], s[6],
    { name: 'Trip', data: tripData, type: 'scatter' },
    { name: 'Restrain', data: restrainData, type: 'scatter' },
    { name: 'Inside Limits', data: limitsData, type: 'scatter' },
    s[10] || { name: 'Preview', data: [], type: 'scatter' },
  ]);
}

export function updateChartRange(lr87) {
  if (!chart) return;
  const range = lr87 + 1.5;
  chart.updateOptions({
    xaxis: { min: -range, max: range },
    yaxis: { min: -range, max: range },
  }, false, false);
}

export function drawRestraintOverlay(lr87, lang87, tolerance) {
  currentLR = lr87;
  currentLANG = lang87;
  if (tolerance !== undefined) currentTolerance = tolerance;
  if (!chart) return;

  const bd = generateAllSeries(lr87, lang87, currentTolerance);
  const range = lr87 + 1.5;
  const s = chart.w.config.series;
  chart.updateSeries([
    { name: 'Alpha Plane Boundary', data: bd.boundary, type: 'line' },
    { name: 'Outer Tolerance', data: bd.outerTolBand, type: 'line' },
    { name: 'Inner Tolerance', data: bd.innerTolBand, type: 'line' },
    { name: 'Start Angle Tol', data: bd.startLineTol, type: 'line' },
    { name: 'End Angle Tol', data: bd.endLineTol, type: 'line' },
    { name: '87LR Circle', data: bd.outerCircle, type: 'line' },
    { name: '1/87LR Circle', data: bd.innerCircle, type: 'line' },
    s[7] || { name: 'Trip', data: [], type: 'scatter' },
    s[8] || { name: 'Restrain', data: [], type: 'scatter' },
    s[9] || { name: 'Inside Limits', data: [], type: 'scatter' },
    s[10] || { name: 'Preview', data: [], type: 'scatter' },
  ]);
  chart.updateOptions({
    xaxis: { min: -range, max: range },
    yaxis: { min: -range, max: range },
  }, false, false);
}

export function getChartDataURI() {
  if (!chart) return Promise.resolve(null);
  return chart.dataURI({ scale: 2 });
}
