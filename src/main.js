import { invoke } from '@tauri-apps/api/core';
import { open, save, message } from '@tauri-apps/plugin-dialog';
import { initChart, updateTestPoints, updateChartRange, drawRestraintOverlay, getChartDataURI, setPreviewPoint, clearPreviewPoint } from './alpha-chart.js';
import { renderTestCards, setDeleteHandler, testPointsToTSV } from './test-cards.js';
import { calculateCurrents, determineResult } from './alpha-math.js';

let project = null;

// ── Initialization ──────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
  // Set today's date
  document.getElementById('test-date').valueAsDate = new Date();

  // Init chart
  // Size chart square before initializing
  sizeChartSquare();
  window.addEventListener('resize', sizeChartSquare);

  initChart('alpha-chart', onChartClick);

  // Wire up event handlers
  wireToolbar();
  wireSettingsAutoSave();
  wireTestEntry();
  setDeleteHandler(onDeleteTestPoint);
  wireKeyboardShortcuts();
  wireLivePreview();

  // Auto-open: check if exactly one .alpha file exists
  try {
    const dir = await getAppDir();
    const files = await invoke('auto_open_check', { dir });
    if (files.length === 1) {
      await openProjectFile(files[0]);
    } else if (files.length > 1) {
      await promptOpen();
    } else {
      await newProject();
    }
  } catch {
    await newProject();
  }
});

async function getAppDir() {
  // Use the directory the executable was launched from
  // For dev, use a reasonable default
  try {
    const path = await invoke('get_file_path');
    if (path) {
      const dir = path.substring(0, path.lastIndexOf('\\'));
      return dir || '.';
    }
  } catch {}
  return '.';
}

// ── Project Operations ──────────────────────────────────────

async function newProject() {
  project = await invoke('new_project');
  refreshUI();
  updateStatus('New project', false);
}

async function openProjectFile(path) {
  try {
    project = await invoke('open_project', { path });
    refreshUI();
    updateStatus(path, true);
  } catch (e) {
    await message(`Failed to open file: ${e}`, { title: 'Error', kind: 'error' });
  }
}

async function promptOpen() {
  const file = await open({
    filters: [{ name: 'Alpha Plane Project', extensions: ['alpha'] }],
    multiple: false,
  });
  if (file) {
    await openProjectFile(file);
  }
}

async function saveProject() {
  if (!project) return;
  try {
    const path = await invoke('get_file_path');
    if (path) {
      const savedPath = await invoke('save_project', { path: null });
      updateStatus(savedPath, true);
    } else {
      await saveProjectAs();
    }
  } catch (e) {
    await message(`Failed to save: ${e}`, { title: 'Error', kind: 'error' });
  }
}

async function saveProjectAs() {
  const file = await save({
    filters: [{ name: 'Alpha Plane Project', extensions: ['alpha'] }],
    defaultPath: 'project.alpha',
  });
  if (file) {
    try {
      const savedPath = await invoke('save_project', { path: file });
      updateStatus(savedPath, true);
    } catch (e) {
      await message(`Failed to save: ${e}`, { title: 'Error', kind: 'error' });
    }
  }
}

async function autoSave() {
  try {
    const path = await invoke('get_file_path');
    if (path) {
      await invoke('save_project', { path: null });
      updateStatus(path, true);
    }
  } catch {}
}

// ── Toolbar ─────────────────────────────────────────────────

function wireToolbar() {
  document.getElementById('btn-new').addEventListener('click', newProject);
  document.getElementById('btn-open').addEventListener('click', promptOpen);
  document.getElementById('btn-save').addEventListener('click', saveProject);
  document.getElementById('btn-save-as').addEventListener('click', saveProjectAs);
  document.getElementById('btn-undo').addEventListener('click', onUndo);
  document.getElementById('btn-redo').addEventListener('click', onRedo);
  document.getElementById('btn-export-csv').addEventListener('click', onExportCSV);
  document.getElementById('btn-export-pdf').addEventListener('click', onExportPDF);
  document.getElementById('btn-clear-all').addEventListener('click', onClearAll);
}

// ── Settings Auto-Save (on blur) ────────────────────────────

function wireSettingsAutoSave() {
  // Relay settings
  const relayInputs = ['lr87', 'lang87', 'lpp87', 'ct-local', 'ct-remote'];
  for (const id of relayInputs) {
    document.getElementById(id).addEventListener('blur', onRelaySettingsChange);
    document.getElementById(id).addEventListener('change', onRelaySettingsChange);
  }

  // Test parameters
  const testInputs = ['ref-i-mag', 'ref-i-ang', 'frequency', 'prefault-time', 'max-fault-time', 'delay-time', 'fault-type', 'tolerance'];
  for (const id of testInputs) {
    const el = document.getElementById(id);
    el.addEventListener('blur', onTestParamsChange);
    el.addEventListener('change', onTestParamsChange);
  }

  // Report info
  const reportInputs = ['relay-type', 'manufacturer', 'serial-number', 'panel-designation', 'tester-name', 'test-date', 'station', 'comments'];
  for (const id of reportInputs) {
    document.getElementById(id).addEventListener('blur', onReportInfoChange);
  }
}

async function onRelaySettingsChange() {
  if (!project) return;
  const settings = {
    lr_87: parseFloat(document.getElementById('lr87').value) || 6.0,
    lang_87: parseFloat(document.getElementById('lang87').value) || 195.0,
    lpp_87: parseFloat(document.getElementById('lpp87').value) || 1.0,
    ct_ratio_local: parseFloat(document.getElementById('ct-local').value) || 1200,
    ct_ratio_remote: parseFloat(document.getElementById('ct-remote').value) || 1200,
  };
  try {
    project = await invoke('update_relay_settings', { settings });
    updateChartRange(settings.lr_87);
    drawRestraintOverlay(settings.lr_87, settings.lang_87, parseFloat(document.getElementById('tolerance').value) || 0.1);
    updateTestPoints(project.test_points);
    renderTestCards(project.test_points, document.getElementById('test-points-list'));
    autoSave();
  } catch (e) {
    console.error('Failed to update relay settings:', e);
  }
}

async function onTestParamsChange() {
  if (!project) return;
  const params = {
    reference_current_mag: parseFloat(document.getElementById('ref-i-mag').value) || 1.0,
    reference_current_angle: parseFloat(document.getElementById('ref-i-ang').value) || 0,
    frequency: parseFloat(document.getElementById('frequency').value) || 50,
    prefault_time_s: parseFloat(document.getElementById('prefault-time').value) || 1.0,
    max_fault_time_s: parseFloat(document.getElementById('max-fault-time').value) || 5.0,
    delay_time_s: parseFloat(document.getElementById('delay-time').value) || 0.5,
    fault_type: document.getElementById('fault-type').value || 'A',
    tolerance: parseFloat(document.getElementById('tolerance').value) || 0.1,
  };
  try {
    project = await invoke('update_test_parameters', { params });
    drawRestraintOverlay(project.relay_settings.lr_87, project.relay_settings.lang_87, params.tolerance);
    updateTestPoints(project.test_points);
    renderTestCards(project.test_points, document.getElementById('test-points-list'));
    autoSave();
  } catch (e) {
    console.error('Failed to update test parameters:', e);
  }
}

async function onReportInfoChange() {
  if (!project) return;
  const info = {
    relay_type: document.getElementById('relay-type').value,
    manufacturer: document.getElementById('manufacturer').value,
    serial_number: document.getElementById('serial-number').value,
    panel_designation: document.getElementById('panel-designation').value,
    tester_name: document.getElementById('tester-name').value,
    test_date: document.getElementById('test-date').value,
    station: document.getElementById('station').value,
    comments: document.getElementById('comments').value,
  };
  try {
    project = await invoke('update_report_info', { info });
    autoSave();
  } catch (e) {
    console.error('Failed to update report info:', e);
  }
}

// ── Test Point Entry ────────────────────────────────────────

function wireTestEntry() {
  document.getElementById('btn-add-point').addEventListener('click', onAddTestPoint);
  document.getElementById('entry-alpha-mag').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onAddTestPoint();
  });
  document.getElementById('entry-alpha-ang').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onAddTestPoint();
  });
}

function wireLivePreview() {
  const magInput = document.getElementById('entry-alpha-mag');
  const angInput = document.getElementById('entry-alpha-ang');
  const updatePreview = () => {
    const mag = parseFloat(magInput.value) || 0;
    const ang = parseFloat(angInput.value) || 0;
    const refMag = parseFloat(document.getElementById('ref-i-mag').value) || 1;
    const refAng = parseFloat(document.getElementById('ref-i-ang').value) || 0;
    const faultType = document.getElementById('fault-type').value;
    const lr87 = parseFloat(document.getElementById('lr87').value) || 6;
    const lang87 = parseFloat(document.getElementById('lang87').value) || 195;
    const tol = parseFloat(document.getElementById('tolerance').value) || 0.1;

    const currents = calculateCurrents(mag, ang, refMag, refAng, faultType);
    const result = determineResult(mag, ang, lr87, lang87, tol);
    const preview = document.getElementById('live-preview');
    preview.textContent = `Local IA: ${currents.localIA.mag.toFixed(3)}A \u2220${currents.localIA.ang.toFixed(1)}\u00b0  |  Remote IA: ${currents.remoteIA.mag.toFixed(3)}A \u2220${currents.remoteIA.ang.toFixed(1)}\u00b0  |  Expected: ${result}`;
    // Show preview dot on chart
    if (mag > 0) setPreviewPoint(mag, ang);
  };
  magInput.addEventListener('input', updatePreview);
  angInput.addEventListener('input', updatePreview);
  updatePreview();
}

async function onAddTestPoint() {
  if (!project) return;
  const mag = parseFloat(document.getElementById('entry-alpha-mag').value);
  const ang = parseFloat(document.getElementById('entry-alpha-ang').value);
  if (isNaN(mag) || isNaN(ang)) return;

  try {
    project = await invoke('add_test_point', { alphaMag: mag, alphaAngle: ang });
    clearPreviewPoint();
    updateTestPoints(project.test_points);
    renderTestCards(project.test_points, document.getElementById('test-points-list'));
    autoSave();
    const list = document.getElementById('test-points-list');
    list.scrollTop = list.scrollHeight;
  } catch (e) {
    console.error('Failed to add test point:', e);
  }
}

function onChartClick(mag, angleDeg) {
  document.getElementById('entry-alpha-mag').value = mag.toFixed(3);
  document.getElementById('entry-alpha-ang').value = angleDeg.toFixed(1);
  // Trigger live preview update
  document.getElementById('entry-alpha-mag').dispatchEvent(new Event('input'));
}

async function onDeleteTestPoint(id) {
  if (!project) return;
  try {
    project = await invoke('delete_test_point', { id });
    updateTestPoints(project.test_points);
    renderTestCards(project.test_points, document.getElementById('test-points-list'));
    autoSave();
  } catch (e) {
    console.error('Failed to delete test point:', e);
  }
}

async function onClearAll() {
  if (!project || project.test_points.length === 0) return;
  try {
    project = await invoke('clear_test_points');
    updateTestPoints(project.test_points);
    renderTestCards(project.test_points, document.getElementById('test-points-list'));
    autoSave();
  } catch (e) {
    console.error('Failed to clear test points:', e);
  }
}

// ── Undo ────────────────────────────────────────────────────

async function onUndo() {
  try {
    const result = await invoke('undo');
    if (result) {
      project = result;
      refreshUI();
      autoSave();
    }
  } catch (e) {
    console.error('Undo failed:', e);
  }
}

async function onRedo() {
  try {
    const result = await invoke('redo');
    if (result) {
      project = result;
      refreshUI();
      autoSave();
    }
  } catch (e) {
    console.error('Redo failed:', e);
  }
}

// ── Export ───────────────────────────────────────────────────

async function onExportCSV() {
  if (!project) return;
  const file = await save({
    filters: [{ name: 'CSV File', extensions: ['csv'] }],
    defaultPath: 'alpha-plane-results.csv',
  });
  if (file) {
    try {
      await invoke('export_csv', { path: file });
      await message('CSV exported successfully.', { title: 'Export CSV' });
    } catch (e) {
      await message(`CSV export failed: ${e}`, { title: 'Error', kind: 'error' });
    }
  }
}

async function onExportPDF() {
  // PDF export is Phase 2 - show placeholder message for now
  await message('PDF export will be available in a future update.', { title: 'Export PDF' });
}

// ── Keyboard Shortcuts ──────────────────────────────────────

function wireKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); onUndo(); }
    if (e.ctrlKey && e.key === 'y') { e.preventDefault(); onRedo(); }
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveProject(); }
    if (e.ctrlKey && e.key === 'o') { e.preventDefault(); promptOpen(); }
    if (e.ctrlKey && e.key === 'n') { e.preventDefault(); newProject(); }
    // Copy test points to clipboard
    if (e.ctrlKey && e.key === 'c' && project && project.test_points.length > 0) {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        e.preventDefault();
        const tsv = testPointsToTSV(project.test_points);
        navigator.clipboard.writeText(tsv).catch(() => {});
      }
    }
  });

  // Paste handler for test points
  document.addEventListener('paste', async (e) => {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;
    const text = e.clipboardData?.getData('text/plain');
    if (!text || !project) return;
    e.preventDefault();
    const lines = text.trim().split(/\r?\n/);
    for (const line of lines) {
      const cols = line.split('\t');
      if (cols.length >= 2) {
        const mag = parseFloat(cols[0]) || parseFloat(cols[1]);
        const ang = parseFloat(cols[1]) || parseFloat(cols[2]);
        if (!isNaN(mag) && !isNaN(ang) && mag > 0) {
          try {
            project = await invoke('add_test_point', { alphaMag: mag, alphaAngle: ang });
          } catch {}
        }
      }
    }
    updateTestPoints(project.test_points);
    renderTestCards(project.test_points, document.getElementById('test-points-list'));
    autoSave();
  });
}

// ── UI Refresh ──────────────────────────────────────────────

function refreshUI() {
  if (!project) return;

  // Relay settings
  document.getElementById('lr87').value = project.relay_settings.lr_87;
  document.getElementById('lang87').value = project.relay_settings.lang_87;
  document.getElementById('lpp87').value = project.relay_settings.lpp_87;
  document.getElementById('ct-local').value = project.relay_settings.ct_ratio_local;
  document.getElementById('ct-remote').value = project.relay_settings.ct_ratio_remote;

  // Test parameters
  document.getElementById('ref-i-mag').value = project.test_parameters.reference_current_mag;
  document.getElementById('ref-i-ang').value = project.test_parameters.reference_current_angle;
  document.getElementById('frequency').value = project.test_parameters.frequency;
  document.getElementById('prefault-time').value = project.test_parameters.prefault_time_s;
  document.getElementById('max-fault-time').value = project.test_parameters.max_fault_time_s;
  document.getElementById('delay-time').value = project.test_parameters.delay_time_s;
  document.getElementById('fault-type').value = project.test_parameters.fault_type;
  document.getElementById('tolerance').value = project.test_parameters.tolerance;

  // Report info
  document.getElementById('relay-type').value = project.report_info.relay_type;
  document.getElementById('manufacturer').value = project.report_info.manufacturer;
  document.getElementById('serial-number').value = project.report_info.serial_number;
  document.getElementById('panel-designation').value = project.report_info.panel_designation;
  document.getElementById('tester-name').value = project.report_info.tester_name;
  document.getElementById('test-date').value = project.report_info.test_date;
  document.getElementById('station').value = project.report_info.station;
  document.getElementById('comments').value = project.report_info.comments;

  // Chart
  updateChartRange(project.relay_settings.lr_87);
  setTimeout(() => {
    drawRestraintOverlay(project.relay_settings.lr_87, project.relay_settings.lang_87, project.test_parameters.tolerance);
    updateTestPoints(project.test_points);
  }, 150);

  // Test cards
  renderTestCards(project.test_points, document.getElementById('test-points-list'));

  // Live preview
  document.getElementById('entry-alpha-mag').dispatchEvent(new Event('input'));
}

function sizeChartSquare() {
  const container = document.querySelector('.chart-container');
  const wrapper = document.getElementById('alpha-chart-wrapper');
  if (!container || !wrapper) return;
  const availW = container.clientWidth;
  const availH = container.clientHeight;
  const size = Math.min(availW, availH);
  wrapper.style.width = size + 'px';
  wrapper.style.height = size + 'px';
}

function updateStatus(filePath, saved) {
  const el = document.getElementById('status-file');
  if (filePath && filePath !== 'New project') {
    const filename = filePath.split(/[\\/]/).pop();
    el.textContent = `${filename}${saved ? ' \u2713' : ' (unsaved)'}`;
  } else {
    el.textContent = 'New project (unsaved)';
  }
}
