use std::f64::consts::PI;

/// Normalize angle to [0, 360) degrees
fn normalize_angle(deg: f64) -> f64 {
    ((deg % 360.0) + 360.0) % 360.0
}

/// Minimum angular distance between two angles in degrees
fn angular_distance(a: f64, b: f64) -> f64 {
    let diff = normalize_angle(a - b);
    if diff > 180.0 { 360.0 - diff } else { diff }
}

/// Check if a point (r, theta_deg) is inside the SEL-311L restraint region.
///
/// The restraint region is:
/// - Annular ring: 1/87LR <= r <= 87LR
/// - Angular wedge centered on 180deg, spanning 87LANG degrees
pub fn is_in_restraint_region(r: f64, theta_deg: f64, lr_87: f64, lang_87: f64) -> bool {
    if lr_87 <= 0.0 {
        return false;
    }

    let inner_r = 1.0 / lr_87;
    let outer_r = lr_87;

    // Check radial bounds
    if r < inner_r || r > outer_r {
        return false;
    }

    // Check angular bounds (wedge centered on 180deg)
    if lang_87 >= 360.0 {
        return true;
    }

    let half_angle = lang_87 / 2.0;
    let dist_from_180 = angular_distance(theta_deg, 180.0);

    dist_from_180 <= half_angle
}

/// Determine the expected result: TRIP, RESTRAIN, or INSIDE_LIMITS
///
/// tolerance_pct: percentage tolerance (e.g. 5.0 = 5%). Points within this
/// percentage of a boundary edge (relative to that boundary's radius) get
/// INSIDE_LIMITS. Per Omicron manual "Check Test Tol." specification.
pub fn determine_result(r: f64, theta_deg: f64, lr_87: f64, lang_87: f64, tolerance_pct: f64) -> String {
    if lr_87 <= 0.0 {
        return "TRIP".to_string();
    }

    let inner_r = 1.0 / lr_87;
    let outer_r = lr_87;
    let half_angle = lang_87 / 2.0;
    let tol_frac = tolerance_pct / 100.0;

    // Outer circle: tolerance band is ±(outerR * tol%)
    let outer_tol = outer_r * tol_frac;
    let near_outer = (r - outer_r).abs() < outer_tol;

    // Inner circle: tolerance band is ±(innerR * tol%)
    let inner_tol = inner_r * tol_frac;
    let near_inner = (r - inner_r).abs() < inner_tol;

    // Angular boundary: tolerance is tol% of the point's radius as perpendicular distance
    let ang_dist_deg = angular_distance(theta_deg, 180.0);
    let ang_from_edge = (ang_dist_deg - half_angle).abs();
    let ang_dist_linear = r * (ang_from_edge * PI / 180.0);
    let ang_tol = r * tol_frac;
    let near_angle = ang_dist_linear < ang_tol;

    // Only consider angular proximity if point is within the radial range
    let in_radial_range = r >= inner_r && r <= outer_r;
    // Only consider radial proximity if point is within the angular range
    let in_angular_range = angular_distance(theta_deg, 180.0) <= half_angle;

    let inside_limits = (near_outer && in_angular_range)
        || (near_inner && in_angular_range)
        || (near_angle && in_radial_range);

    if inside_limits {
        "INSIDE_LIMITS".to_string()
    } else if is_in_restraint_region(r, theta_deg, lr_87, lang_87) {
        "RESTRAIN".to_string()
    } else {
        "TRIP".to_string()
    }
}

/// Calculate local and remote currents for a given alpha plane point.
///
/// Returns: (local_ia, local_ib, local_ic, remote_ia, remote_ib, remote_ic)
/// Each current is (magnitude, angle_deg).
pub fn calculate_currents(
    alpha_mag: f64,
    alpha_angle_deg: f64,
    ref_mag: f64,
    ref_angle_deg: f64,
    fault_type: &str,
) -> [(f64, f64); 6] {
    let remote_mag = alpha_mag * ref_mag;
    let remote_angle = alpha_angle_deg + ref_angle_deg;

    match fault_type {
        "A" => [
            (ref_mag, ref_angle_deg),       // local IA
            (0.0, 0.0),                     // local IB
            (0.0, 0.0),                     // local IC
            (remote_mag, remote_angle),     // remote IA
            (0.0, 0.0),                     // remote IB
            (0.0, 0.0),                     // remote IC
        ],
        "B" => [
            (0.0, 0.0),                              // local IA
            (ref_mag, ref_angle_deg - 120.0),         // local IB
            (0.0, 0.0),                              // local IC
            (0.0, 0.0),                              // remote IA
            (remote_mag, remote_angle - 120.0),       // remote IB
            (0.0, 0.0),                              // remote IC
        ],
        "C" => [
            (0.0, 0.0),                              // local IA
            (0.0, 0.0),                              // local IB
            (ref_mag, ref_angle_deg + 120.0),         // local IC
            (0.0, 0.0),                              // remote IA
            (0.0, 0.0),                              // remote IB
            (remote_mag, remote_angle + 120.0),       // remote IC
        ],
        "3P" => [
            (ref_mag, ref_angle_deg),                 // local IA
            (ref_mag, ref_angle_deg - 120.0),         // local IB
            (ref_mag, ref_angle_deg + 120.0),         // local IC
            (remote_mag, remote_angle),               // remote IA
            (remote_mag, remote_angle - 120.0),       // remote IB
            (remote_mag, remote_angle + 120.0),       // remote IC
        ],
        _ => [
            (ref_mag, ref_angle_deg),
            (0.0, 0.0),
            (0.0, 0.0),
            (remote_mag, remote_angle),
            (0.0, 0.0),
            (0.0, 0.0),
        ],
    }
}

/// Convert polar alpha plane coordinates to Cartesian (Re, Im)
pub fn polar_to_cartesian(mag: f64, angle_deg: f64) -> (f64, f64) {
    let rad = angle_deg * PI / 180.0;
    (mag * rad.cos(), mag * rad.sin())
}

/// Convert Cartesian (Re, Im) to polar (magnitude, angle_deg)
pub fn cartesian_to_polar(re: f64, im: f64) -> (f64, f64) {
    let mag = (re * re + im * im).sqrt();
    let angle = im.atan2(re) * 180.0 / PI;
    (mag, angle)
}

/// Calculate differential current magnitude for the faulted phase(s).
/// I_diff = |I_local + I_remote| (phasor sum)
/// Returns (diff_mag, phase_label).
pub fn calculate_diff_current(currents: &[(f64, f64); 6], fault_type: &str) -> (f64, String) {
    let phasor_sum_mag = |local_idx: usize, remote_idx: usize| -> f64 {
        let (lm, la) = currents[local_idx];
        let (rm, ra) = currents[remote_idx];
        let (lx, ly) = polar_to_cartesian(lm, la);
        let (rx, ry) = polar_to_cartesian(rm, ra);
        ((lx + rx).powi(2) + (ly + ry).powi(2)).sqrt()
    };

    match fault_type {
        "A" => (phasor_sum_mag(0, 3), "A".to_string()),
        "B" => (phasor_sum_mag(1, 4), "B".to_string()),
        "C" => (phasor_sum_mag(2, 5), "C".to_string()),
        "3P" | _ => {
            let a = phasor_sum_mag(0, 3);
            let b = phasor_sum_mag(1, 4);
            let c = phasor_sum_mag(2, 5);
            let max = a.max(b).max(c);
            let phase = if max == a { "A" } else if max == b { "B" } else { "C" };
            (max, phase.to_string())
        }
    }
}

/// Determine diff result: ABOVE_PICKUP, BELOW_PICKUP, or INSIDE_LIMITS
pub fn determine_diff_result(
    diff_mag: f64,
    lpp_87: f64,
    diff_tol_pct: f64,
    diff_tol_abs_ma: f64,
) -> String {
    let effective_tol = (lpp_87 * diff_tol_pct / 100.0).max(diff_tol_abs_ma / 1000.0);
    if (diff_mag - lpp_87).abs() < effective_tol {
        "INSIDE_LIMITS".to_string()
    } else if diff_mag >= lpp_87 {
        "ABOVE_PICKUP".to_string()
    } else {
        "BELOW_PICKUP".to_string()
    }
}

/// Determine overall result from alpha and diff sub-results
pub fn determine_overall_result(alpha_result: &str, diff_result: &str) -> String {
    if alpha_result == "INSIDE_LIMITS" || diff_result == "INSIDE_LIMITS" {
        "INSIDE_LIMITS".to_string()
    } else if alpha_result == "TRIP" && diff_result == "ABOVE_PICKUP" {
        "TRIP".to_string()
    } else {
        "NO_TRIP".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_through_fault_point_restrains() {
        // Alpha = 1 at 180deg (through fault) should be inside restraint
        assert!(is_in_restraint_region(1.0, 180.0, 6.0, 195.0));
    }

    #[test]
    fn test_internal_fault_trips() {
        // Alpha = 1 at 0deg (internal fault, currents in same direction) -> trip
        assert!(!is_in_restraint_region(1.0, 0.0, 6.0, 195.0));
    }

    #[test]
    fn test_outside_radius_trips() {
        // Alpha = 10 at 180deg, beyond 87LR=6 -> trip
        assert!(!is_in_restraint_region(10.0, 180.0, 6.0, 195.0));
    }

    #[test]
    fn test_inside_limits() {
        // Point right at the outer radius boundary
        let result = determine_result(6.0, 180.0, 6.0, 195.0, 0.1);
        assert_eq!(result, "INSIDE_LIMITS");
    }

    #[test]
    fn test_diff_current_single_phase() {
        // Alpha = 1 at 0deg with ref 1A at 0deg -> local=1@0, remote=1@0 -> diff=2A
        let currents = calculate_currents(1.0, 0.0, 1.0, 0.0, "A");
        let (diff, phase) = calculate_diff_current(&currents, "A");
        assert!((diff - 2.0).abs() < 1e-6);
        assert_eq!(phase, "A");
    }

    #[test]
    fn test_diff_current_through_fault() {
        // Alpha = 1 at 180deg (through fault) -> local=1@0, remote=1@180 -> diff=0
        let currents = calculate_currents(1.0, 180.0, 1.0, 0.0, "A");
        let (diff, _) = calculate_diff_current(&currents, "A");
        assert!(diff < 1e-6);
    }

    #[test]
    fn test_diff_result_above_pickup() {
        assert_eq!(determine_diff_result(1.5, 1.0, 5.0, 20.0), "ABOVE_PICKUP");
    }

    #[test]
    fn test_diff_result_below_pickup() {
        assert_eq!(determine_diff_result(0.5, 1.0, 5.0, 20.0), "BELOW_PICKUP");
    }

    #[test]
    fn test_diff_result_inside_limits() {
        // 1.0 ± 5% = 0.95..1.05, so 1.03 is inside limits
        assert_eq!(determine_diff_result(1.03, 1.0, 5.0, 20.0), "INSIDE_LIMITS");
    }

    #[test]
    fn test_overall_trip() {
        assert_eq!(determine_overall_result("TRIP", "ABOVE_PICKUP"), "TRIP");
    }

    #[test]
    fn test_overall_no_trip_restrain() {
        assert_eq!(determine_overall_result("RESTRAIN", "ABOVE_PICKUP"), "NO_TRIP");
    }

    #[test]
    fn test_overall_no_trip_below_pickup() {
        assert_eq!(determine_overall_result("TRIP", "BELOW_PICKUP"), "NO_TRIP");
    }

    #[test]
    fn test_overall_inside_limits() {
        assert_eq!(determine_overall_result("INSIDE_LIMITS", "ABOVE_PICKUP"), "INSIDE_LIMITS");
        assert_eq!(determine_overall_result("TRIP", "INSIDE_LIMITS"), "INSIDE_LIMITS");
    }

    #[test]
    fn test_polar_cartesian_roundtrip() {
        let (re, im) = polar_to_cartesian(1.0, 180.0);
        assert!((re - (-1.0)).abs() < 1e-10);
        assert!(im.abs() < 1e-10);

        let (mag, ang) = cartesian_to_polar(-1.0, 0.0);
        assert!((mag - 1.0).abs() < 1e-10);
        assert!((ang - 180.0).abs() < 1e-10);
    }
}
