use std::sync::Mutex;
use tauri::State;

use crate::alpha_math;
use crate::models::*;

pub struct AppState {
    pub current_project: Option<AlphaPlaneProject>,
    pub current_file_path: Option<String>,
    pub undo_stack: Vec<AlphaPlaneProject>,
    pub redo_stack: Vec<AlphaPlaneProject>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            current_project: None,
            current_file_path: None,
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
        }
    }

    fn push_undo(&mut self) {
        if let Some(ref proj) = self.current_project {
            self.undo_stack.push(proj.clone());
            if self.undo_stack.len() > 50 {
                self.undo_stack.remove(0);
            }
            self.redo_stack.clear();
        }
    }
}

#[tauri::command]
pub fn new_project(state: State<'_, Mutex<AppState>>) -> Result<AlphaPlaneProject, String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    let project = AlphaPlaneProject::new_default();
    s.current_project = Some(project.clone());
    s.current_file_path = None;
    s.undo_stack.clear();
    Ok(project)
}

#[tauri::command]
pub fn get_project_state(state: State<'_, Mutex<AppState>>) -> Result<Option<AlphaPlaneProject>, String> {
    let s = state.lock().map_err(|e| e.to_string())?;
    Ok(s.current_project.clone())
}

#[tauri::command]
pub fn get_file_path(state: State<'_, Mutex<AppState>>) -> Result<Option<String>, String> {
    let s = state.lock().map_err(|e| e.to_string())?;
    Ok(s.current_file_path.clone())
}

#[tauri::command]
pub fn open_project(state: State<'_, Mutex<AppState>>, path: String) -> Result<AlphaPlaneProject, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    let project: AlphaPlaneProject = serde_json::from_str(&content).map_err(|e| format!("Failed to parse file: {}", e))?;
    let mut s = state.lock().map_err(|e| e.to_string())?;
    s.current_project = Some(project.clone());
    s.current_file_path = Some(path);
    s.undo_stack.clear();
    Ok(project)
}

#[tauri::command]
pub fn save_project(state: State<'_, Mutex<AppState>>, path: Option<String>) -> Result<String, String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    let save_path = path.or_else(|| s.current_file_path.clone())
        .ok_or_else(|| "No file path specified".to_string())?;

    let project = s.current_project.as_mut()
        .ok_or_else(|| "No project open".to_string())?;

    project.updated_at = chrono::Utc::now().to_rfc3339();

    let json = serde_json::to_string_pretty(project)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    std::fs::write(&save_path, json)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    s.current_file_path = Some(save_path.clone());
    Ok(save_path)
}

#[tauri::command]
pub fn auto_open_check(dir: String) -> Result<Vec<String>, String> {
    let entries = std::fs::read_dir(&dir).map_err(|e| format!("Failed to read directory: {}", e))?;
    let alpha_files: Vec<String> = entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path().extension()
                .map(|ext| ext.to_string_lossy().to_lowercase() == "alpha")
                .unwrap_or(false)
        })
        .map(|e| e.path().to_string_lossy().to_string())
        .collect();
    Ok(alpha_files)
}

#[tauri::command]
pub fn update_relay_settings(state: State<'_, Mutex<AppState>>, settings: RelaySettings) -> Result<AlphaPlaneProject, String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    s.push_undo();
    let project = s.current_project.as_mut().ok_or("No project open")?;
    project.relay_settings = settings;
    // Recalculate all test point expected results
    recalculate_test_points(project);
    Ok(project.clone())
}

#[tauri::command]
pub fn update_test_parameters(state: State<'_, Mutex<AppState>>, params: TestParameters) -> Result<AlphaPlaneProject, String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    s.push_undo();
    let project = s.current_project.as_mut().ok_or("No project open")?;
    project.test_parameters = params;
    // Recalculate all test points with new parameters
    recalculate_test_points(project);
    Ok(project.clone())
}

#[tauri::command]
pub fn update_report_info(state: State<'_, Mutex<AppState>>, info: ReportInfo) -> Result<AlphaPlaneProject, String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    s.push_undo();
    let project = s.current_project.as_mut().ok_or("No project open")?;
    project.report_info = info;
    Ok(project.clone())
}

#[tauri::command]
pub fn add_test_point(
    state: State<'_, Mutex<AppState>>,
    alpha_mag: f64,
    alpha_angle: f64,
) -> Result<AlphaPlaneProject, String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    s.push_undo();
    let project = s.current_project.as_mut().ok_or("No project open")?;

    let point_number = project.test_points.len() as u32 + 1;
    let currents = alpha_math::calculate_currents(
        alpha_mag,
        alpha_angle,
        project.test_parameters.reference_current_mag,
        project.test_parameters.reference_current_angle,
        &project.test_parameters.fault_type,
    );
    let expected = alpha_math::determine_result(
        alpha_mag,
        alpha_angle,
        project.relay_settings.lr_87,
        project.relay_settings.lang_87,
        project.test_parameters.tolerance,
    );

    let test_point = TestPoint {
        _id: uuid::Uuid::new_v4().to_string(),
        point_number,
        alpha_magnitude: alpha_mag,
        alpha_angle_deg: alpha_angle,
        local_ia_mag: currents[0].0,
        local_ia_ang: currents[0].1,
        local_ib_mag: currents[1].0,
        local_ib_ang: currents[1].1,
        local_ic_mag: currents[2].0,
        local_ic_ang: currents[2].1,
        remote_ia_mag: currents[3].0,
        remote_ia_ang: currents[3].1,
        remote_ib_mag: currents[4].0,
        remote_ib_ang: currents[4].1,
        remote_ic_mag: currents[5].0,
        remote_ic_ang: currents[5].1,
        expected_result: expected,
        actual_result: None,
        notes: String::new(),
    };

    project.test_points.push(test_point);
    Ok(project.clone())
}

#[tauri::command]
pub fn delete_test_point(state: State<'_, Mutex<AppState>>, id: String) -> Result<AlphaPlaneProject, String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    s.push_undo();
    let project = s.current_project.as_mut().ok_or("No project open")?;
    project.test_points.retain(|p| p._id != id);
    // Renumber
    for (i, p) in project.test_points.iter_mut().enumerate() {
        p.point_number = i as u32 + 1;
    }
    Ok(project.clone())
}

#[tauri::command]
pub fn clear_test_points(state: State<'_, Mutex<AppState>>) -> Result<AlphaPlaneProject, String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    s.push_undo();
    let project = s.current_project.as_mut().ok_or("No project open")?;
    project.test_points.clear();
    Ok(project.clone())
}

#[tauri::command]
pub fn undo(state: State<'_, Mutex<AppState>>) -> Result<Option<AlphaPlaneProject>, String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    if let Some(prev) = s.undo_stack.pop() {
        let old = s.current_project.take();
        if let Some(current) = old {
            s.redo_stack.push(current);
            if s.redo_stack.len() > 50 {
                s.redo_stack.remove(0);
            }
        }
        s.current_project = Some(prev.clone());
        Ok(Some(prev))
    } else {
        Ok(s.current_project.clone())
    }
}

#[tauri::command]
pub fn redo(state: State<'_, Mutex<AppState>>) -> Result<Option<AlphaPlaneProject>, String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    if let Some(next) = s.redo_stack.pop() {
        let old = s.current_project.take();
        if let Some(current) = old {
            s.undo_stack.push(current);
        }
        s.current_project = Some(next.clone());
        Ok(Some(next))
    } else {
        Ok(s.current_project.clone())
    }
}

#[tauri::command]
pub fn calculate_currents_cmd(
    alpha_mag: f64,
    alpha_angle: f64,
    ref_mag: f64,
    ref_angle: f64,
    fault_type: String,
    lr_87: f64,
    lang_87: f64,
    tolerance: f64,
) -> Result<serde_json::Value, String> {
    let currents = alpha_math::calculate_currents(alpha_mag, alpha_angle, ref_mag, ref_angle, &fault_type);
    let result = alpha_math::determine_result(alpha_mag, alpha_angle, lr_87, lang_87, tolerance);
    let (re, im) = alpha_math::polar_to_cartesian(alpha_mag, alpha_angle);

    Ok(serde_json::json!({
        "local_ia": { "mag": currents[0].0, "ang": currents[0].1 },
        "local_ib": { "mag": currents[1].0, "ang": currents[1].1 },
        "local_ic": { "mag": currents[2].0, "ang": currents[2].1 },
        "remote_ia": { "mag": currents[3].0, "ang": currents[3].1 },
        "remote_ib": { "mag": currents[4].0, "ang": currents[4].1 },
        "remote_ic": { "mag": currents[5].0, "ang": currents[5].1 },
        "expected_result": result,
        "cartesian": { "re": re, "im": im },
    }))
}

#[tauri::command]
pub fn export_csv(state: State<'_, Mutex<AppState>>, path: String) -> Result<(), String> {
    let s = state.lock().map_err(|e| e.to_string())?;
    let project = s.current_project.as_ref().ok_or("No project open")?;

    let mut wtr = csv::Writer::from_path(&path).map_err(|e| format!("CSV error: {}", e))?;
    wtr.write_record(&[
        "Test #", "Alpha Mag", "Alpha Angle",
        "Local IA Mag", "Local IA Ang", "Local IB Mag", "Local IB Ang", "Local IC Mag", "Local IC Ang",
        "Remote IA Mag", "Remote IA Ang", "Remote IB Mag", "Remote IB Ang", "Remote IC Mag", "Remote IC Ang",
        "Expected Result",
    ]).map_err(|e| format!("CSV error: {}", e))?;

    for p in &project.test_points {
        wtr.write_record(&[
            p.point_number.to_string(),
            format!("{:.4}", p.alpha_magnitude),
            format!("{:.2}", p.alpha_angle_deg),
            format!("{:.3}", p.local_ia_mag), format!("{:.2}", p.local_ia_ang),
            format!("{:.3}", p.local_ib_mag), format!("{:.2}", p.local_ib_ang),
            format!("{:.3}", p.local_ic_mag), format!("{:.2}", p.local_ic_ang),
            format!("{:.3}", p.remote_ia_mag), format!("{:.2}", p.remote_ia_ang),
            format!("{:.3}", p.remote_ib_mag), format!("{:.2}", p.remote_ib_ang),
            format!("{:.3}", p.remote_ic_mag), format!("{:.2}", p.remote_ic_ang),
            p.expected_result.clone(),
        ]).map_err(|e| format!("CSV error: {}", e))?;
    }

    wtr.flush().map_err(|e| format!("CSV error: {}", e))?;
    Ok(())
}

fn recalculate_test_points(project: &mut AlphaPlaneProject) {
    for point in &mut project.test_points {
        let currents = alpha_math::calculate_currents(
            point.alpha_magnitude,
            point.alpha_angle_deg,
            project.test_parameters.reference_current_mag,
            project.test_parameters.reference_current_angle,
            &project.test_parameters.fault_type,
        );
        point.local_ia_mag = currents[0].0;
        point.local_ia_ang = currents[0].1;
        point.local_ib_mag = currents[1].0;
        point.local_ib_ang = currents[1].1;
        point.local_ic_mag = currents[2].0;
        point.local_ic_ang = currents[2].1;
        point.remote_ia_mag = currents[3].0;
        point.remote_ia_ang = currents[3].1;
        point.remote_ib_mag = currents[4].0;
        point.remote_ib_ang = currents[4].1;
        point.remote_ic_mag = currents[5].0;
        point.remote_ic_ang = currents[5].1;
        point.expected_result = alpha_math::determine_result(
            point.alpha_magnitude,
            point.alpha_angle_deg,
            project.relay_settings.lr_87,
            project.relay_settings.lang_87,
            project.test_parameters.tolerance,
        );
    }
}
