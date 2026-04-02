import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import "github-markdown-css/github-markdown.css";
import "katex/dist/katex.min.css";
import "prismjs/themes/prism.css";

import { renderMarkdown } from "./renderer.js";
import { resolveMediaPaths } from "./media.js";
import { renderMermaidBlocks } from "./mermaid-loader.js";
import { buildTOC } from "./toc.js";
import { initSearch } from "./search.js";
import { initTheme } from "./theme.js";
import { initSourceToggle, syncSourceSidebar } from "./source-toggle.js";

let rawMarkdown = "";
let fileDir = "";
let search = null;
let theme = null;
let sourceToggle = null;

// Zoom state
const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;
let zoomLevel = 1.0;

function applyZoom() {
  document.documentElement.style.fontSize = `${zoomLevel * 100}%`;
}

function zoomIn() {
  zoomLevel = Math.min(ZOOM_MAX, zoomLevel + ZOOM_STEP);
  applyZoom();
}

function zoomOut() {
  zoomLevel = Math.max(ZOOM_MIN, zoomLevel - ZOOM_STEP);
  applyZoom();
}

function zoomReset() {
  zoomLevel = 1.0;
  applyZoom();
}

function toggleSidebar() {
  document.getElementById("toc-sidebar").classList.toggle("hidden");
  document.getElementById("content-wrapper").classList.toggle("sidebar-open");
  syncSourceSidebar();
}

async function loadFile(filePath) {
  try {
    rawMarkdown = await invoke("read_file", { path: filePath });
  } catch (err) {
    document.getElementById("content").innerHTML = `<div class="error"><h2>Error</h2><p>${err}</p></div>`;
    return;
  }

  // Compute base directory
  const parts = filePath.replace(/\\/g, "/").split("/");
  parts.pop();
  fileDir = parts.join("/");

  // Render
  const html = renderMarkdown(rawMarkdown);
  const content = document.getElementById("content");
  content.innerHTML = html;

  // Post-render: resolve media paths
  await resolveMediaPaths(content, fileDir);

  // Post-render: mermaid
  await renderMermaidBlocks(content, theme.isDark());

  // Build TOC
  buildTOC(content, document.getElementById("toc-nav"));

  // Source toggle
  sourceToggle = initSourceToggle(rawMarkdown);

  // Hide welcome, show content
  document.getElementById("welcome").classList.add("hidden");
  document.getElementById("content-wrapper").classList.remove("hidden");
}

async function openFile() {
  const selected = await openDialog({
    multiple: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd", "mdx"] }],
  });
  if (!selected) return;

  const filePath = typeof selected === "string" ? selected : selected.path;
  if (!filePath) return;

  if (!rawMarkdown) {
    await loadFile(filePath);
  } else {
    const label = `viewer-open-${Date.now()}`;
    const encoded = encodeURIComponent(filePath);
    const filename = filePath.replace(/\\/g, "/").split("/").pop();
    new WebviewWindow(label, {
      url: `index.html?file=${encoded}`,
      title: `emdee — ${filename}`,
      width: 960,
      height: 720,
      minWidth: 480,
      minHeight: 360,
    });
  }
}

async function init() {
  // Init theme first (affects mermaid rendering)
  theme = initTheme();

  // Init search
  search = initSearch();

  // Wire up toolbar buttons
  document.getElementById("btn-open").addEventListener("click", openFile);

  document.getElementById("btn-toc").addEventListener("click", toggleSidebar);

  document.getElementById("btn-source").addEventListener("click", () => {
    if (sourceToggle) sourceToggle.toggle();
  });

  document.getElementById("btn-theme").addEventListener("click", () => {
    theme.toggle();
  });

  document.getElementById("btn-print").addEventListener("click", () => {
    window.print();
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key === "o") {
      e.preventDefault();
      openFile();
    } else if (mod && e.key === "f") {
      e.preventDefault();
      search.open();
    } else if (mod && e.shiftKey && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      if (sourceToggle) sourceToggle.toggle();
    } else if (mod && e.shiftKey && (e.key === "t" || e.key === "T")) {
      e.preventDefault();
      toggleSidebar();
    } else if (mod && e.key === "p") {
      e.preventDefault();
      window.print();
    } else if (mod && (e.key === "=" || e.key === "+")) {
      e.preventDefault();
      zoomIn();
    } else if (mod && e.key === "-") {
      e.preventDefault();
      zoomOut();
    } else if (mod && e.key === "0") {
      e.preventDefault();
      zoomReset();
    } else if (mod && e.key === "a") {
      // Select only document content, not toolbar/sidebar
      e.preventDefault();
      const sel = window.getSelection();
      const range = document.createRange();
      const sourceOverlay = document.getElementById("source-overlay");
      const target = sourceOverlay && !sourceOverlay.classList.contains("hidden")
        ? document.getElementById("source-code")
        : document.getElementById("content");
      if (target) {
        range.selectNodeContents(target);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  });

  // Floating toolbar: show/hide based on mouse proximity to top
  const toolbar = document.getElementById("toolbar");
  const TOOLBAR_ZONE = 60; // px from top edge to trigger
  let toolbarHideTimeout = null;

  document.addEventListener("mousemove", (e) => {
    if (e.clientY <= TOOLBAR_ZONE) {
      clearTimeout(toolbarHideTimeout);
      toolbar.classList.add("toolbar-visible");
    } else {
      // Check if mouse is still over the toolbar itself
      const rect = toolbar.getBoundingClientRect();
      const overToolbar = e.clientX >= rect.left && e.clientX <= rect.right
                       && e.clientY >= rect.top && e.clientY <= rect.bottom + 10;
      if (!overToolbar) {
        clearTimeout(toolbarHideTimeout);
        toolbarHideTimeout = setTimeout(() => {
          toolbar.classList.remove("toolbar-visible");
        }, 300);
      }
    }
  });

  document.addEventListener("mouseleave", () => {
    clearTimeout(toolbarHideTimeout);
    toolbarHideTimeout = setTimeout(() => {
      toolbar.classList.remove("toolbar-visible");
    }, 300);
  });

  // Pinch-to-zoom (touchpad gesture)
  document.addEventListener("wheel", (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      if (e.deltaY < 0) {
        zoomIn();
      } else if (e.deltaY > 0) {
        zoomOut();
      }
    }
  }, { passive: false });

  // Drag and drop
  document.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
      const name = file.name.toLowerCase();
      if (name.endsWith(".md") || name.endsWith(".markdown") || name.endsWith(".mdx")) {
        if (!rawMarkdown) {
          await loadFile(file.path);
        } else {
          const label = `viewer-drop-${Date.now()}`;
          const encoded = encodeURIComponent(file.path);
          new WebviewWindow(label, {
            url: `index.html?file=${encoded}`,
            title: `emdee — ${file.name}`,
            width: 960,
            height: 720,
            minWidth: 480,
            minHeight: 360,
          });
        }
        break;
      }
    }
  });

  // Determine which file to load:
  // 1. URL query param (used by new windows spawned from Rust)
  // 2. Initial file from CLI args (main window pulls from Rust state)
  const params = new URLSearchParams(window.location.search);
  const queryFile = params.get("file");

  if (queryFile) {
    await loadFile(decodeURIComponent(queryFile));
  } else {
    const initialFile = await invoke("get_initial_file");
    if (initialFile) {
      await loadFile(initialFile);
    } else {
      document.getElementById("welcome").classList.remove("hidden");
      document.getElementById("content-wrapper").classList.add("hidden");
    }
  }
}

// Handle links: open external links in default browser
document.addEventListener("click", (e) => {
  const link = e.target.closest("a[href]");
  if (!link) return;

  const href = link.getAttribute("href");
  if (href.startsWith("#")) return;

  if (href.startsWith("http://") || href.startsWith("https://")) {
    e.preventDefault();
    import("@tauri-apps/plugin-shell").then(({ open }) => open(href)).catch(() => {});
  }
});

document.addEventListener("DOMContentLoaded", init);
