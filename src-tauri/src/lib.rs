mod alpha_math;
mod commands;
mod models;

use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Mutex::new(commands::AppState::new()))
        .invoke_handler(tauri::generate_handler![
            commands::new_project,
            commands::get_project_state,
            commands::get_file_path,
            commands::open_project,
            commands::save_project,
            commands::auto_open_check,
            commands::update_relay_settings,
            commands::update_test_parameters,
            commands::update_report_info,
            commands::add_test_point,
            commands::delete_test_point,
            commands::clear_test_points,
            commands::undo,
            commands::calculate_currents_cmd,
            commands::export_csv,
        ])
        .run(tauri::generate_context!())
        .expect("error running tauri application");
}
