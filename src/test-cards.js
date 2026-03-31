// Test Point Card rendering (Omicron State Sequencer style)

let onDeletePoint = null;
let onSelectPoint = null;
let onEditPoint = null;
let onDuplicatePoint = null;
let onMovePoint = null;
let selectedId = null;

export function setDeleteHandler(handler) { onDeletePoint = handler; }
export function setSelectHandler(handler) { onSelectPoint = handler; }
export function setEditHandler(handler) { onEditPoint = handler; }
export function setDuplicateHandler(handler) { onDuplicatePoint = handler; }
export function setMoveHandler(handler) { onMovePoint = handler; }

function formatMag(val) { return val.toFixed(3); }
function formatAng(val) { return val.toFixed(2) + '\u00b0'; }

function overallCssClass(result) {
  switch (result) {
    case 'TRIP': return 'trip';
    case 'NO_TRIP': return 'no-trip';
    case 'INSIDE_LIMITS': return 'inside-limits';
    // Legacy fallback
    case 'RESTRAIN': return 'no-trip';
    default: return '';
  }
}

const ALPHA_LABELS = { TRIP: 'Operate Region', RESTRAIN: 'Restrain Region', INSIDE_LIMITS: 'Inside Tolerance' };
const ALPHA_COLORS = { TRIP: '#ff1744', RESTRAIN: '#2979ff', INSIDE_LIMITS: '#f59e0b' };
const DIFF_LABELS = { ABOVE_PICKUP: 'Above Pickup', BELOW_PICKUP: 'Below Pickup', INSIDE_LIMITS: 'Inside Tolerance' };
const DIFF_COLORS = { ABOVE_PICKUP: '#ff1744', BELOW_PICKUP: '#2979ff', INSIDE_LIMITS: '#f59e0b' };
const OVERALL_LABELS = { TRIP: 'TRIP', NO_TRIP: 'NO TRIP', INSIDE_LIMITS: 'INSIDE LIMITS' };
const OVERALL_COLORS = { TRIP: '#ff1744', NO_TRIP: '#2979ff', INSIDE_LIMITS: '#f59e0b' };

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
    const cssClass = overallCssClass(tp.overall_result || tp.expected_result);
    card.className = `test-card ${cssClass}`;
    card.dataset.id = tp._id;

    const hasCustomRef = tp.custom_ref_current_mag != null;
    const hasCustomFault = tp.custom_fault_type != null;
    const customBadge = (hasCustomRef || hasCustomFault) ? '<span class="custom-badge">custom</span>' : '';

    card.innerHTML = `
      <div class="test-card-header">
        <span class="test-num">Test ${tp.point_number} ${customBadge}</span>
        <span class="alpha-info">\u03b1 = ${tp.alpha_magnitude.toFixed(3)} \u2220 ${tp.alpha_angle_deg.toFixed(1)}\u00b0</span>
        <span class="test-card-actions">
          <button class="card-btn btn-move-up" title="Move up">\u25b2</button>
          <button class="card-btn btn-move-down" title="Move down">\u25bc</button>
          <button class="card-btn btn-duplicate" title="Duplicate">\u29c9</button>
          <button class="card-btn btn-edit" title="Edit">\u270e</button>
          <button class="card-btn btn-delete" title="Delete">\u00d7</button>
        </span>
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
      <div class="test-card-results">
        <div class="result-row">
          <span class="result-label">Alpha:</span>
          <span class="result-value" style="color:${ALPHA_COLORS[tp.alpha_result] || '#666'}">${ALPHA_LABELS[tp.alpha_result] || tp.alpha_result || '—'}</span>
        </div>
        <div class="result-row">
          <span class="result-label">Diff:</span>
          <span class="result-value" style="color:${DIFF_COLORS[tp.diff_result] || '#666'}">${DIFF_LABELS[tp.diff_result] || tp.diff_result || '—'} ${tp.diff_current_mag != null ? '(' + tp.diff_current_mag.toFixed(3) + 'A)' : ''}</span>
        </div>
        <div class="result-row result-overall">
          <span class="result-label">Result:</span>
          <span class="result-value" style="color:${OVERALL_COLORS[tp.overall_result] || OVERALL_COLORS[tp.expected_result] || '#666'}">${OVERALL_LABELS[tp.overall_result] || OVERALL_LABELS[tp.expected_result] || tp.expected_result}</span>
        </div>
      </div>
    `;

    // Edit panel (hidden by default)
    const editPanel = document.createElement('div');
    editPanel.className = 'test-card-edit-panel';
    editPanel.style.display = 'none';
    editPanel.innerHTML = `
      <div class="edit-row">
        <label>Alpha Mag:</label>
        <input type="number" class="edit-alpha-mag" step="0.001" value="${tp.alpha_magnitude}" />
        <label>Angle:</label>
        <input type="number" class="edit-alpha-ang" step="0.1" value="${tp.alpha_angle_deg}" />
      </div>
      <div class="edit-row">
        <label>Ref I:</label>
        <select class="edit-ref-mode">
          <option value="global" ${!hasCustomRef ? 'selected' : ''}>Global</option>
          <option value="custom" ${hasCustomRef ? 'selected' : ''}>Custom</option>
        </select>
        <input type="number" class="edit-ref-mag" step="0.001" value="${hasCustomRef ? tp.custom_ref_current_mag : ''}" placeholder="A" ${!hasCustomRef ? 'disabled' : ''} />
      </div>
      <div class="edit-row">
        <label>Fault:</label>
        <select class="edit-fault-type">
          <option value="" ${!hasCustomFault ? 'selected' : ''}>Global</option>
          <option value="A" ${tp.custom_fault_type === 'A' ? 'selected' : ''}>Phase A</option>
          <option value="B" ${tp.custom_fault_type === 'B' ? 'selected' : ''}>Phase B</option>
          <option value="C" ${tp.custom_fault_type === 'C' ? 'selected' : ''}>Phase C</option>
          <option value="3P" ${tp.custom_fault_type === '3P' ? 'selected' : ''}>3-Phase</option>
        </select>
        <button class="btn-save-edit btn-primary">Save</button>
      </div>
    `;
    card.appendChild(editPanel);

    // Wire ref mode toggle
    const refModeSelect = editPanel.querySelector('.edit-ref-mode');
    const refMagInput = editPanel.querySelector('.edit-ref-mag');
    refModeSelect.addEventListener('change', () => {
      refMagInput.disabled = refModeSelect.value === 'global';
      if (refModeSelect.value === 'global') refMagInput.value = '';
    });

    // Wire save edit button
    editPanel.querySelector('.btn-save-edit').addEventListener('click', (e) => {
      e.stopPropagation();
      const alphaMag = parseFloat(editPanel.querySelector('.edit-alpha-mag').value);
      const alphaAngle = parseFloat(editPanel.querySelector('.edit-alpha-ang').value);
      const refMode = editPanel.querySelector('.edit-ref-mode').value;
      const customRefMag = refMode === 'custom' ? parseFloat(editPanel.querySelector('.edit-ref-mag').value) || null : null;
      const faultVal = editPanel.querySelector('.edit-fault-type').value;
      const customFault = faultVal || null;
      if (onEditPoint) onEditPoint(tp._id, alphaMag, alphaAngle, customRefMag, customFault);
    });

    // Wire action buttons
    card.querySelector('.btn-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      if (onDeletePoint) onDeletePoint(tp._id);
    });
    card.querySelector('.btn-edit').addEventListener('click', (e) => {
      e.stopPropagation();
      editPanel.style.display = editPanel.style.display === 'none' ? 'block' : 'none';
    });
    card.querySelector('.btn-duplicate').addEventListener('click', (e) => {
      e.stopPropagation();
      if (onDuplicatePoint) onDuplicatePoint(tp._id);
    });
    card.querySelector('.btn-move-up').addEventListener('click', (e) => {
      e.stopPropagation();
      if (onMovePoint) onMovePoint(tp._id, 'up');
    });
    card.querySelector('.btn-move-down').addEventListener('click', (e) => {
      e.stopPropagation();
      if (onMovePoint) onMovePoint(tp._id, 'down');
    });

    // Select on card click
    card.addEventListener('click', () => {
      if (selectedId === tp._id) {
        selectedId = null;
        if (onSelectPoint) onSelectPoint(null);
      } else {
        selectedId = tp._id;
        if (onSelectPoint) onSelectPoint(tp);
      }
      container.querySelectorAll('.test-card').forEach(c => c.classList.remove('selected'));
      if (selectedId) {
        const sel = container.querySelector(`.test-card[data-id="${selectedId}"]`);
        if (sel) sel.classList.add('selected');
      }
    });

    if (tp._id === selectedId) card.classList.add('selected');

    container.appendChild(card);
  }
}

export function testPointsToTSV(testPoints) {
  const headers = [
    'Test #', 'Alpha Mag', 'Alpha Angle',
    'Local IA Mag', 'Local IA Ang', 'Local IB Mag', 'Local IB Ang', 'Local IC Mag', 'Local IC Ang',
    'Remote IA Mag', 'Remote IA Ang', 'Remote IB Mag', 'Remote IB Ang', 'Remote IC Mag', 'Remote IC Ang',
    'Alpha Result', 'Diff Current', 'Diff Result', 'Overall Result'
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
      tp.alpha_result || tp.expected_result,
      (tp.diff_current_mag || 0).toFixed(4),
      tp.diff_result || '',
      tp.overall_result || tp.expected_result,
    ].join('\t') + '\n';
  }
  return tsv;
}
