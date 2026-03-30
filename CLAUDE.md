# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rust/Tauri v2 desktop app for testing Alpha Plane elements (R87L-A/B/C) on SEL-311L line differential relays with Omicron CMC-356 test sets. Built by Power-Link Technologies. Vanilla JS frontend (no framework), ApexCharts for visualization.

## Build Prerequisites

- **Rust** (stable, `x86_64-pc-windows-gnu` target): `rustup default stable-x86_64-pc-windows-gnu`
- **MSYS2 MinGW64 toolchain**: `dlltool` and `gcc` must be in PATH
- **Node.js** 18+ and npm
- **PATH setup**: `export PATH="$HOME/.cargo/bin:/c/msys64/mingw64/bin:$PATH"`

## Build Commands

```bash
npm install                          # Install JS dependencies
npx tauri dev                        # Dev mode (hot reload, port 1420)
npx vite build && npx tauri build    # Production build
```

**IMPORTANT**: Cannot build from the shared drive — paths with spaces break `dlltool`. Copy source to a local path (e.g. `C:\Users\leema\sel-alpha-plane-tool`) before building.

## Binary Naming & Deployment

Every build gets a timestamped portable binary. **No installers** — only the exe + DLL.

```bash
TIMESTAMP=$(date +%Y%m%d_%H%M)
cp src-tauri/target/release/sel-alpha-plane-tool.exe "builds/${TIMESTAMP}_sel-alpha-plane-tool.exe"
cp src-tauri/target/release/WebView2Loader.dll "builds/WebView2Loader.dll"
```

- **Prefix**: `YYYYMMDD_HHMM_sel-alpha-plane-tool.exe`
- **Deploy to**: Project root on the shared drive (`G:\...\Alpha Plane Calculator\`) AND `./builds/` locally
- **WebView2Loader.dll** must sit in the same folder as the exe
- **Must run from a local drive** — network/shared drives cause DLL loading errors (0xc0000056)
- **After every build**: Launch the exe, verify it starts (check tasklist), then kill it

## Source Locations

- **Shared drive**: `G:\Shared drives\1.Powerlink\PLTech-Information\TechRef(Lee)\Relays\SEL\Alpha Plane Calculator\sel-alpha-plane-tool\` — canonical source, where edits are made
- **GitHub**: `https://github.com/lee-cyrille-maskell/SEL-Alpha-Plane-Calculator.git` — cloned at `C:\Users\leema\Projects\sel-alpha-plane-tool`
- **Build copy**: `C:\Users\leema\sel-alpha-plane-tool` — ephemeral copy for compilation only

Always sync edits back to both the shared drive and the GitHub repo.

## Architecture

### Data Flow

Frontend (vanilla JS) <-> Tauri IPC (`invoke()`) <-> Rust backend (`#[tauri::command]`)

The alpha plane math is **duplicated** in both `src/alpha-math.js` (instant UI feedback, no IPC latency) and `src-tauri/src/alpha_math.rs` (authoritative calculations for persistence). Keep both in sync when modifying math.

### Rust Backend (`src-tauri/src/`)

- **`models.rs`** — `AlphaPlaneProject` struct tree: report_info, relay_settings, test_parameters, test_points. Serde-derived for `.alpha` JSON files (MongoDB-compatible schema with `_id` fields).
- **`alpha_math.rs`** — Restraint region geometry. The region is an annular wedge: radii `[1/87LR, 87LR]` intersected with angular wedge `180 +/- 87LANG/2`. `determine_result()` uses percentage tolerance — each boundary's tolerance band is proportional to its radius, so the band narrows toward the origin.
- **`commands.rs`** — 16 Tauri IPC handlers. `AppState` holds current project + 50-entry undo/redo stacks behind a `Mutex`. Any mutation pushes pre-state to undo and clears redo. `recalculate_test_points()` re-derives all currents and expected results when settings change.
- **`lib.rs`** — Plugin registration (dialog, fs, clipboard-manager) and command handler wiring.

### Frontend (`src/`)

- **`main.js`** — App lifecycle, event wiring, auto-save on blur, keyboard shortcuts (Ctrl+Z undo, Ctrl+Y redo, Ctrl+S/O/N/C), clipboard paste parsing (TSV format). Keeps chart square via `sizeChartSquare()` on resize.
- **`alpha-chart.js`** — ApexCharts mixed chart. Series 0 = boundary (blue solid), 1-4 = tolerance bands (purple filled, scaling with radius), 5-6 = reference circles (gray dashed), 7-9 = test point scatter (red trip/blue restrain/amber limits), 10 = preview dot. Tolerance bands taper toward origin to reflect percentage-based tolerance. Click-to-coordinate conversion uses `chart.w.globals` for axis bounds.
- **`test-cards.js`** — Renders test point cards mimicking Omicron State Sequencer layout: IA/IB/IC with mag+angle for Local (left) and Remote (right), color-coded borders (TRIP=red, RESTRAIN=blue, INSIDE_LIMITS=yellow).
- **`alpha-math.js`** — JS mirror of Rust `alpha_math.rs`. Must stay in sync.

### Key Domain Concepts

**Alpha Plane**: Complex plane plotting `a = I_Remote / I_Local`. Through-fault point is at `1 at 180 deg` = `(-1, 0)`.

**Tolerance**: "Check Test Tol." as percentage. Each boundary's tolerance band = boundary_radius * tol%. The inner circle band (small radius) is much tighter than the outer circle band (large radius). Angular line bands also scale with r. This matches Omicron test tolerance behavior.

**Current Calculation**: Given `a = r at angle` and reference current, `I_Remote = r * I_Local_mag at (angle + I_Local_angle)`. Fault types (A/B/C) select which phase gets current; 3P populates all three at 120 deg offsets.

**File Format**: `.alpha` extension, JSON, designed for future MongoDB compatibility. Auto-opens if exactly one `.alpha` file exists in the working directory.

## Phase 2 (Future)

- Omicron CMEngine API integration for direct test equipment control
- PDF report generation via Rust `printpdf` crate
