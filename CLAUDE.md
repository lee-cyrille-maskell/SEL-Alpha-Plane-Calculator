# SEL Alpha Plane Test Tool

## Project Overview
Rust/Tauri desktop app for testing Alpha Plane elements (R87L-A/B/C) on SEL-311L line differential relays with Omicron CMC-356 test sets. Built by Power-Link Technologies.

## Build Prerequisites
- **Rust** (stable, `x86_64-pc-windows-gnu` target): `rustup default stable-x86_64-pc-windows-gnu`
- **MSYS2 MinGW64 toolchain**: dlltool and gcc must be in PATH
- **Node.js** 18+ and npm
- **PATH setup**: `export PATH="$HOME/.cargo/bin:/c/msys64/mingw64/bin:$PATH"`

## Build Commands
```bash
# Install JS dependencies
npm install

# Dev mode (hot reload)
npx tauri dev

# Production build (creates .exe, .msi, .nsis installer)
npx vite build && npx tauri build
```

## Binary Naming Convention
Compile a binary with prefix `YYYYMMDD_HHMM` every time a change is made:
```bash
TIMESTAMP=$(date +%Y%m%d_%H%M)
cp src-tauri/target/release/sel-alpha-plane-tool.exe "builds/${TIMESTAMP}_sel-alpha-plane-tool.exe"
```

## Project Structure
- `src/` - Frontend (vanilla JS + ApexCharts + Vite)
- `src-tauri/src/` - Rust backend
  - `models.rs` - Data model structs (`.alpha` JSON schema)
  - `alpha_math.rs` - Restraint region geometry + current calculations
  - `commands.rs` - Tauri IPC command handlers
  - `lib.rs` - App builder and plugin registration
- `builds/` - Timestamped compiled binaries

## Key Technical Details
- **File format**: `.alpha` (JSON, MongoDB-compatible)
- **Visualization**: ApexCharts scatter plot with custom SVG restraint region overlay
- **Test cards**: Omicron State Sequencer style (IA/IB/IC mag+angle, Local vs Remote)
- **Color coding**: TRIP=red, RESTRAIN=blue, INSIDE LIMITS=yellow
- **Auto-save**: On blur of any settings field
- **Undo**: Ctrl+Z, 50-state stack

## Phase 2 (Future)
- Omicron CMEngine API integration for direct test equipment control
- PDF report generation via Rust `printpdf` crate
