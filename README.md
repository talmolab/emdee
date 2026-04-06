<p align="center">
  <img src="src-tauri/icons/icon.svg" alt="emdee icon" width="128" height="128">
</p>

<h1 align="center">emdee</h1>

<p align="center">A fast, minimal, cross-platform markdown viewer. Opens <code>.md</code> files natively on macOS, Windows, and Linux.</p>

<p align="center"><a href="https://emdee.tlab.sh">emdee.tlab.sh</a></p>

Built with [Tauri v2](https://tauri.app) + vanilla JS for a lightweight footprint and near-instant startup.

## Features

- **GitHub-flavored markdown** -- tables, task lists, strikethrough, footnotes, autolinks
- **Syntax highlighting** -- 25+ languages via Prism.js
- **KaTeX math** -- inline `$...$` and block `$$...$$` LaTeX
- **Mermaid diagrams** -- lazy-loaded, zero cost when not used
- **Inline SVG, images, video** -- relative paths resolved automatically
- **Dark / light theme** -- manual toggle, defaults to light
- **Table of contents** -- auto-generated sidebar from headings with scroll tracking
- **In-document search** -- Ctrl/Cmd+F with match highlighting and navigation
- **Source view** -- toggle raw markdown with syntax highlighting
- **Zoom** -- Cmd+=/Cmd+- and trackpad pinch
- **Print / PDF** -- native print dialog with clean output
- **File associations** -- registers as handler for `.md`, `.markdown`, `.mdown`, `.mkd`, `.mdx`
- **Multi-window** -- each file opens in its own window
- **Auto-update** -- checks for updates on launch, install from Help menu

## Install

### Quick install

**macOS / Linux:**
```bash
curl -fsSL https://emdee.tlab.sh/install.sh | sh
```

**Windows (PowerShell):**
```powershell
irm https://emdee.tlab.sh/install.ps1 | iex
```

### Manual download

Download the latest release for your platform from [GitHub Releases](https://github.com/talmolab/emdee/releases/latest):

| Platform | Format |
|----------|--------|
| macOS (Universal) | `.dmg` |
| Windows | `.exe` (NSIS), `.msi` |
| Linux | `.deb`, `.rpm`, `.AppImage` |

Or build from source (see below).

The app checks for updates automatically on launch and can be updated from **Help > Check for Updates**.

## Usage

**Open a file:**
```
emdee README.md
```

**Or:** double-click any `.md` file after installing (file association is registered automatically).

**Or:** use the Open button (Cmd/Ctrl+O) or drag and drop a file onto the window.

### Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl+O | Open file |
| Cmd/Ctrl+F | Search in document |
| Cmd/Ctrl+Shift+S | Toggle source view |
| Cmd/Ctrl+Shift+T | Toggle table of contents |
| Cmd/Ctrl+P | Print |
| Cmd/Ctrl+Shift+E | Export PDF (macOS) |
| Cmd/Ctrl+= | Zoom in |
| Cmd/Ctrl+- | Zoom out |
| Cmd/Ctrl+0 | Reset zoom |
| Cmd/Ctrl+A | Select all (content only) |

## Build from source

### Prerequisites

- [Rust](https://rustup.rs/) 1.77+
- [Node.js](https://nodejs.org/) 20+
- Platform dependencies for Tauri:
  - **macOS:** Xcode command line tools
  - **Linux:** `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev`
  - **Windows:** WebView2 (usually pre-installed on Windows 10/11)

### Development

```bash
npm install
npx tauri dev
```

To open a file directly:
```bash
npx tauri dev -- -- path/to/file.md
```

### Production build

```bash
npx tauri build
```

Installers are output to `src-tauri/target/release/bundle/`.

## Stack

| Layer | Choice | Size |
|-------|--------|------|
| Runtime | Tauri v2 | ~5 MB binary |
| Frontend | Vanilla JS + Vite | 0 KB framework |
| Renderer | markdown-it | ~43 KB |
| Styling | github-markdown-css | ~5 KB |
| Code highlighting | Prism.js | ~15 KB |
| Math | KaTeX | ~28 KB |
| Diagrams | Mermaid (lazy) | ~150 KB on demand |

## License

MIT
