use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlphaPlaneProject {
    pub _id: String,
    pub version: String,
    pub created_at: String,
    pub updated_at: String,
    pub report_info: ReportInfo,
    pub relay_settings: RelaySettings,
    pub test_parameters: TestParameters,
    pub test_points: Vec<TestPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportInfo {
    pub relay_type: String,
    pub manufacturer: String,
    pub serial_number: String,
    pub panel_designation: String,
    pub tester_name: String,
    pub test_date: String,
    pub station: String,
    pub comments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelaySettings {
    pub lr_87: f64,
    pub lang_87: f64,
    pub lpp_87: f64,
    pub ct_ratio_local: f64,
    pub ct_ratio_remote: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestParameters {
    pub reference_current_mag: f64,
    pub reference_current_angle: f64,
    pub frequency: f64,
    pub prefault_time_s: f64,
    pub max_fault_time_s: f64,
    pub delay_time_s: f64,
    pub fault_type: String,
    pub tolerance: f64,
    #[serde(default)]
    pub diff_tolerance_pct: f64,
    #[serde(default)]
    pub diff_tolerance_abs_ma: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestPoint {
    pub _id: String,
    pub point_number: u32,
    pub alpha_magnitude: f64,
    pub alpha_angle_deg: f64,
    pub local_ia_mag: f64,
    pub local_ia_ang: f64,
    pub local_ib_mag: f64,
    pub local_ib_ang: f64,
    pub local_ic_mag: f64,
    pub local_ic_ang: f64,
    pub remote_ia_mag: f64,
    pub remote_ia_ang: f64,
    pub remote_ib_mag: f64,
    pub remote_ib_ang: f64,
    pub remote_ic_mag: f64,
    pub remote_ic_ang: f64,
    pub expected_result: String,
    pub actual_result: Option<String>,
    pub notes: String,
    // Per-test overrides (None = use global)
    #[serde(default)]
    pub custom_ref_current_mag: Option<f64>,
    #[serde(default)]
    pub custom_fault_type: Option<String>,
    // Differential current results (calculated)
    #[serde(default)]
    pub diff_current_mag: f64,
    #[serde(default)]
    pub diff_current_phase: String,
    // Three-line result breakdown
    #[serde(default)]
    pub alpha_result: String,
    #[serde(default)]
    pub diff_result: String,
    #[serde(default)]
    pub overall_result: String,
}

impl AlphaPlaneProject {
    pub fn new_default() -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            _id: uuid::Uuid::new_v4().to_string(),
            version: "2.0.0".to_string(),
            created_at: now.clone(),
            updated_at: now,
            report_info: ReportInfo {
                relay_type: "SEL-311L".to_string(),
                manufacturer: "Schweitzer Engineering Laboratories".to_string(),
                serial_number: String::new(),
                panel_designation: String::new(),
                tester_name: String::new(),
                test_date: chrono::Utc::now().format("%Y-%m-%d").to_string(),
                station: String::new(),
                comments: String::new(),
            },
            relay_settings: RelaySettings {
                lr_87: 6.0,
                lang_87: 195.0,
                lpp_87: 1.0,
                ct_ratio_local: 1200.0,
                ct_ratio_remote: 1200.0,
            },
            test_parameters: TestParameters {
                reference_current_mag: 1.0,
                reference_current_angle: 0.0,
                frequency: 60.0,
                prefault_time_s: 1.0,
                max_fault_time_s: 5.0,
                delay_time_s: 0.5,
                fault_type: "3P".to_string(),
                tolerance: 5.0,
                diff_tolerance_pct: 5.0,
                diff_tolerance_abs_ma: 20.0,
            },
            test_points: Vec::new(),
        }
    }
}
