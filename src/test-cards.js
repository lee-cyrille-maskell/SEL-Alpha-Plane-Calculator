// Test Point Card rendering (Omicron State Sequencer style)

let onDeletePoint = null;

export function setDeleteHandler(handler) {
  onDeletePoint = handler;
}

function formatMag(val) {
  return val.toFixed(3);
}

function formatAng(val) {
  return val.toFixed(2) + '\u00b0';
}

function resultCssClass(result) {
  switch (result) {
    case 'TRIP': return 'trip';
    case 'RESTRAIN': return 'restrain';
    case 'INSIDE_LIMITS': return 'inside-limits';
    default: return '';
  }
}

function resultLabel(result) {
  switch (result) {
    case 'TRIP': return 'TRIP';
    case 'RESTRAIN': return 'RESTRAIN';
    case 'INSIDE_LIMITS': return 'INSIDE LIMITS';
    default: return result;
  }
}

function createCurrentRow(phase, mag, ang) {
  return `<div class="test-card-row">
    <span class="phase-label">${phase}</span>
    <span class="mag-val">${formatMag(mag)} A</span>
    <span class="ang-val">${formatAng(ang)}</span>
  </div>`;
}

export function renderTestCards(testPoints, container) {
  container.innerHTML = '';
  if (!testPoints || testPoints.length === 0) {
    container.innerHTML = '<div style="padding:20px;color:#999;font-style:italic;width:100%;text-align:center;">No test points. Click the chart or enter values above to add test points.</div>';
    return;
  }

  for (const tp of testPoints) {
    const card = document.createElement('div');
    card.className = `test-card ${resultCssClass(tp.expected_result)}`;
    card.dataset.id = tp._id;

    card.innerHTML = `
      <div class="test-card-header">
        <span class="test-num">Test ${tp.point_number}</span>
        <span class="alpha-info">\u03b1 = ${tp.alpha_magnitude.toFixed(3)} \u2220 ${tp.alpha_angle_deg.toFixed(1)}\u00b0</span>
        <button class="test-card-delete" title="Delete test point">\u00d7</button>
      </div>
      <div class="test-card-body">
        <div class="test-card-side">
          <div class="test-card-side-label">Local</div>
          ${createCurrentRow('IA', tp.local_ia_mag, tp.local_ia_ang)}
          ${createCurrentRow('IB', tp.local_ib_mag, tp.local_ib_ang)}
          ${createCurrentRow('IC', tp.local_ic_mag, tp.local_ic_ang)}
        </div>
        <div class="test-card-side">
          <div class="test-card-side-label">Remote</div>
          ${createCurrentRow('IA', tp.remote_ia_mag, tp.remote_ia_ang)}
          ${createCurrentRow('IB', tp.remote_ib_mag, tp.remote_ib_ang)}
          ${createCurrentRow('IC', tp.remote_ic_mag, tp.remote_ic_ang)}
        </div>
      </div>
      <div class="test-card-result">${resultLabel(tp.expected_result)}</div>
    `;

    card.querySelector('.test-card-delete').addEventListener('click', () => {
      if (onDeletePoint) onDeletePoint(tp._id);
    });

    container.appendChild(card);
  }
}

export function testPointsToTSV(testPoints) {
  const headers = [
    'Test #', 'Alpha Mag', 'Alpha Angle',
    'Local IA Mag', 'Local IA Ang', 'Local IB Mag', 'Local IB Ang', 'Local IC Mag', 'Local IC Ang',
    'Remote IA Mag', 'Remote IA Ang', 'Remote IB Mag', 'Remote IB Ang', 'Remote IC Mag', 'Remote IC Ang',
    'Result'
  ];
  let tsv = headers.join('\t') + '\n';
  for (const tp of testPoints) {
    tsv += [
      tp.point_number,
      tp.alpha_magnitude.toFixed(4),
      tp.alpha_angle_deg.toFixed(2),
      tp.local_ia_mag.toFixed(3), tp.local_ia_ang.toFixed(2),
      tp.local_ib_mag.toFixed(3), tp.local_ib_ang.toFixed(2),
      tp.local_ic_mag.toFixed(3), tp.local_ic_ang.toFixed(2),
      tp.remote_ia_mag.toFixed(3), tp.remote_ia_ang.toFixed(2),
      tp.remote_ib_mag.toFixed(3), tp.remote_ib_ang.toFixed(2),
      tp.remote_ic_mag.toFixed(3), tp.remote_ic_ang.toFixed(2),
      tp.expected_result,
    ].join('\t') + '\n';
  }
  return tsv;
}
