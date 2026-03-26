import ApexCharts from 'apexcharts';
import { polarToCartesian, cartesianToPolar } from './alpha-math.js';

let chart = null;
let onChartClick = null;

const RESTRAINT_FILL = 'rgba(41, 121, 255, 0.08)';
const RESTRAINT_STROKE = 'rgba(41, 121, 255, 0.5)';

export function initChart(containerId, clickHandler) {
  onChartClick = clickHandler;
  const options = buildChartOptions(6.0);
  chart = new ApexCharts(document.querySelector(`#${containerId}`), options);
  chart.render().then(() => {
    drawRestraintOverlay(6.0, 195.0);
    setupResizeObserver(containerId);
  });
  return chart;
}

function buildChartOptions(lr87) {
  const range = lr87 + 1.5;
  return {
    chart: {
      type: 'scatter',
      height: '100%',
      animations: { enabled: false },
      toolbar: { show: true, tools: { download: false, zoom: true, zoomin: true, zoomout: true, pan: true, reset: true } },
      zoom: { enabled: true, type: 'xy' },
      events: {
        click: handleChartClick,
        updated: () => {},
      },
    },
    series: [
      { name: 'Trip', data: [], color: '#ff1744' },
      { name: 'Restrain', data: [], color: '#2979ff' },
      { name: 'Inside Limits', data: [], color: '#f59e0b' },
    ],
    xaxis: {
      type: 'numeric',
      title: { text: 'Re(\u03b1)', style: { fontSize: '12px' } },
      min: -range,
      max: range,
      tickAmount: 10,
      decimalsInFloat: 1,
      labels: { style: { fontSize: '10px' } },
    },
    yaxis: {
      title: { text: 'Im(\u03b1)', style: { fontSize: '12px' } },
      min: -range,
      max: range,
      tickAmount: 10,
      decimalsInFloat: 1,
      labels: { style: { fontSize: '10px' } },
    },
    grid: { show: true, borderColor: '#e0e0e0' },
    markers: { size: 7, shape: 'circle', strokeWidth: 1, strokeColors: '#fff' },
    tooltip: {
      custom: ({ seriesIndex, dataPointIndex, w }) => {
        const point = w.config.series[seriesIndex].data[dataPointIndex];
        if (!point) return '';
        const meta = point.meta || {};
        return `<div style="padding:6px 10px;font-size:12px;font-family:Consolas,monospace;">
          <b>\u03b1 = ${meta.alphaMag?.toFixed(3) || '?'} \u2220 ${meta.alphaAng?.toFixed(1) || '?'}\u00b0</b><br/>
          Re: ${point.x.toFixed(3)}, Im: ${point.y.toFixed(3)}<br/>
          <span style="color:#666">Local IA: ${meta.localIAMag?.toFixed(3) || '0'} A \u2220 ${meta.localIAAng?.toFixed(1) || '0'}\u00b0</span><br/>
          <span style="color:#666">Remote IA: ${meta.remoteIAMag?.toFixed(3) || '0'} A \u2220 ${meta.remoteIAAng?.toFixed(1) || '0'}\u00b0</span>
        </div>`;
      },
    },
    legend: { position: 'top', fontSize: '11px' },
    annotations: {
      xaxis: [{ x: 0, strokeDashArray: 3, borderColor: '#999', borderWidth: 1 }],
      yaxis: [{ y: 0, strokeDashArray: 3, borderColor: '#999', borderWidth: 1 }],
      points: [
        {
          x: -1, y: 0,
          marker: { size: 5, fillColor: '#333', shape: 'circle', strokeColor: '#333' },
          label: { text: '(-1,0)', offsetY: -10, style: { fontSize: '10px', background: 'transparent', color: '#333' } },
        },
      ],
    },
  };
}

function handleChartClick(event, chartContext, config) {
  if (!onChartClick || !chart) return;
  // Get plot area bounds
  const g = chart.w.globals;
  const rect = g.dom.baseEl.querySelector('.apexcharts-plot-area')?.getBoundingClientRect();
  if (!rect) return;
  const px = event.clientX - rect.left;
  const py = event.clientY - rect.top;
  if (px < 0 || py < 0 || px > rect.width || py > rect.height) return;

  const minX = g.minX, maxX = g.maxX, minY = g.minY, maxY = g.maxY;
  const dataX = minX + (px / rect.width) * (maxX - minX);
  const dataY = maxY - (py / rect.height) * (maxY - minY);
  const { mag, angleDeg } = cartesianToPolar(dataX, dataY);
  onChartClick(mag, angleDeg);
}

export function updateTestPoints(testPoints) {
  if (!chart) return;
  const tripData = [], restrainData = [], limitsData = [];
  for (const tp of testPoints) {
    const { re, im } = polarToCartesian(tp.alpha_magnitude, tp.alpha_angle_deg);
    const point = {
      x: parseFloat(re.toFixed(4)),
      y: parseFloat(im.toFixed(4)),
      meta: {
        alphaMag: tp.alpha_magnitude,
        alphaAng: tp.alpha_angle_deg,
        localIAMag: tp.local_ia_mag,
        localIAAng: tp.local_ia_ang,
        remoteIAMag: tp.remote_ia_mag,
        remoteIAAng: tp.remote_ia_ang,
        pointNum: tp.point_number,
      },
    };
    if (tp.expected_result === 'TRIP') tripData.push(point);
    else if (tp.expected_result === 'RESTRAIN') restrainData.push(point);
    else limitsData.push(point);
  }
  chart.updateSeries([
    { name: 'Trip', data: tripData, color: '#ff1744' },
    { name: 'Restrain', data: restrainData, color: '#2979ff' },
    { name: 'Inside Limits', data: limitsData, color: '#f59e0b' },
  ]);
}

export function updateChartRange(lr87) {
  if (!chart) return;
  const range = lr87 + 1.5;
  chart.updateOptions({
    xaxis: { min: -range, max: range },
    yaxis: { min: -range, max: range },
  });
}

export function drawRestraintOverlay(lr87, lang87) {
  if (!chart) return;
  // Remove existing overlay
  const existing = document.querySelector('.restraint-overlay');
  if (existing) existing.remove();

  const g = chart.w.globals;
  const plotArea = g.dom.baseEl.querySelector('.apexcharts-plot-area');
  if (!plotArea) return;

  const gridRect = g.dom.baseEl.querySelector('.apexcharts-grid')?.getBoundingClientRect();
  const svgRect = g.dom.baseEl.querySelector('svg')?.getBoundingClientRect();
  if (!gridRect || !svgRect) return;

  const gx = gridRect.left - svgRect.left;
  const gy = gridRect.top - svgRect.top;
  const gw = gridRect.width;
  const gh = gridRect.height;

  const minX = g.minX, maxX = g.maxX, minY = g.minY, maxY = g.maxY;

  function toPixel(dataX, dataY) {
    const px = gx + ((dataX - minX) / (maxX - minX)) * gw;
    const py = gy + ((maxY - dataY) / (maxY - minY)) * gh;
    return { x: px, y: py };
  }

  const outerR = lr87;
  const innerR = 1 / lr87;
  const halfAngle = lang87 / 2;
  const startAngleDeg = 180 - halfAngle;
  const endAngleDeg = 180 + halfAngle;

  // Generate arc path points
  const svg = g.dom.baseEl.querySelector('svg');
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('class', 'restraint-overlay');

  // Draw arcs as polylines for reliability
  const steps = 100;
  let pathD = '';

  // Outer arc: from startAngle to endAngle
  for (let i = 0; i <= steps; i++) {
    const angle = startAngleDeg + (endAngleDeg - startAngleDeg) * (i / steps);
    const rad = angle * Math.PI / 180;
    const dx = outerR * Math.cos(rad);
    const dy = outerR * Math.sin(rad);
    const p = toPixel(dx, dy);
    pathD += (i === 0 ? 'M' : 'L') + `${p.x},${p.y} `;
  }

  // Line to inner arc end
  {
    const rad = endAngleDeg * Math.PI / 180;
    const dx = innerR * Math.cos(rad);
    const dy = innerR * Math.sin(rad);
    const p = toPixel(dx, dy);
    pathD += `L${p.x},${p.y} `;
  }

  // Inner arc: from endAngle back to startAngle
  for (let i = steps; i >= 0; i--) {
    const angle = startAngleDeg + (endAngleDeg - startAngleDeg) * (i / steps);
    const rad = angle * Math.PI / 180;
    const dx = innerR * Math.cos(rad);
    const dy = innerR * Math.sin(rad);
    const p = toPixel(dx, dy);
    pathD += `L${p.x},${p.y} `;
  }

  // Close path back to outer arc start
  pathD += 'Z';

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathD);
  path.setAttribute('fill', RESTRAINT_FILL);
  path.setAttribute('stroke', RESTRAINT_STROKE);
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('stroke-dasharray', '6,3');
  path.setAttribute('pointer-events', 'none');
  group.appendChild(path);

  // Add label
  const center = toPixel(-1, 0);
  const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  label.setAttribute('x', center.x);
  label.setAttribute('y', center.y - 15);
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('font-size', '10');
  label.setAttribute('fill', 'rgba(41,121,255,0.6)');
  label.setAttribute('pointer-events', 'none');
  label.textContent = 'Restraint Region';
  group.appendChild(label);

  svg.appendChild(group);
}

function setupResizeObserver(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const observer = new ResizeObserver(() => {
    if (chart) {
      // Redraw will be triggered by the chart update event
      setTimeout(() => {
        const lr87 = parseFloat(document.getElementById('lr87')?.value || '6');
        const lang87 = parseFloat(document.getElementById('lang87')?.value || '195');
        drawRestraintOverlay(lr87, lang87);
      }, 100);
    }
  });
  observer.observe(container);
}

export function getChartDataURI() {
  if (!chart) return Promise.resolve(null);
  return chart.dataURI({ scale: 2 });
}
