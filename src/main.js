import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";
import "github-markdown-css/github-markdown.css";
import "katex/dist/katex.min.css";
import "prismjs/themes/prism.css";

import { renderMarkdown } from "./renderer.js";
import { resolveMediaPaths } from "./media.js";
import { renderMermaidBlocks } from "./mermaid-loader.js";
import { buildTOC } from "./toc.js";
import { initSearch } from "./search.js";
import { initTheme } from "./theme.js";
import { initSourceToggle } from "./source-toggle.js";

let rawMarkdown = "";
let fileDir = "";
let search = null;
let theme = null;
let sourceToggle = null;

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

async function init() {
  // Init theme first (affects mermaid rendering)
  theme = initTheme();

  // Init search
  search = initSearch();

  // Wire up toolbar buttons
  document.getElementById("btn-toc").addEventListener("click", () => {
    document.getElementById("toc-sidebar").classList.toggle("hidden");
    document.getElementById("content-wrapper").classList.toggle("sidebar-open");
  });

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

    if (mod && e.key === "f") {
      e.preventDefault();
      search.open();
    } else if (mod && e.shiftKey && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      if (sourceToggle) sourceToggle.toggle();
    } else if (mod && e.shiftKey && (e.key === "t" || e.key === "T")) {
      e.preventDefault();
      document.getElementById("toc-sidebar").classList.toggle("hidden");
      document.getElementById("content-wrapper").classList.toggle("sidebar-open");
    } else if (mod && e.key === "p") {
      e.preventDefault();
      window.print();
    }
  });

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
        // If no file loaded, load in current window
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

  // Listen for file-open events from Rust backend
  const currentWindow = getCurrentWebviewWindow();
  currentWindow.listen("open-file", async (event) => {
    if (event.payload) {
      await loadFile(event.payload);
    }
  });

  // Check for file in URL query params (used by new windows)
  const params = new URLSearchParams(window.location.search);
  const filePath = params.get("file");

  if (filePath) {
    const decoded = decodeURIComponent(filePath);
    await loadFile(decoded);
  } else {
    // Show welcome screen
    document.getElementById("welcome").classList.remove("hidden");
    document.getElementById("content-wrapper").classList.add("hidden");
  }
}

// Handle links: open external links in default browser
document.addEventListener("click", (e) => {
  const link = e.target.closest("a[href]");
  if (!link) return;

  const href = link.getAttribute("href");
  if (href.startsWith("#")) return; // anchor links are fine

  if (href.startsWith("http://") || href.startsWith("https://")) {
    e.preventDefault();
    import("@tauri-apps/plugin-shell").then(({ open }) => open(href)).catch(() => {});
  }
});

document.addEventListener("DOMContentLoaded", init);
