import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open as openDialog, save as saveDialog, ask, message } from "@tauri-apps/plugin-dialog";
import { Menu, Submenu } from "@tauri-apps/api/menu";
import { check } from "@tauri-apps/plugin-updater";
import { onOpenUrl, getCurrent as getDeepLinkUrls } from "@tauri-apps/plugin-deep-link";
import "github-markdown-css/github-markdown.css";
import "katex/dist/katex.min.css";
import "./style/prism-theme.css";

import { renderMarkdown } from "./renderer.js";
import { resolveMediaPaths } from "./media.js";
import { renderMermaidBlocks, reRenderMermaidBlocks } from "./mermaid-loader.js";
import { buildTOC } from "./toc.js";
import { initSearch } from "./search.js";
import { initTheme } from "./theme.js";
import { initSourceToggle, syncSourceSidebar } from "./source-toggle.js";
import { addCopyButtons } from "./copy-button.js";

let rawMarkdown = "";
let fileDir = "";
let currentFilename = "";
let search = null;
let theme = null;
let sourceToggle = null;
let unlistenFileChanged = null;
let isReloading = false;

// Zoom state — unified across keyboard/scroll and pinch-to-zoom
const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;
let zoomLevel = 1.0;
let pinchScale = 1.0;
let gestureStartScale = 1.0;
let isPinching = false;

function clearPinchTransform() {
  const el = document.getElementById("content-wrapper");
  if (el) {
    el.style.transform = "";
    el.style.transition = "";
    el.style.transformOrigin = "";
  }
}

function applyZoom() {
  clearPinchTransform();
  pinchScale = 1.0;
  getCurrentWebviewWindow().setZoom(zoomLevel);
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

const MD_EXTENSIONS = /\.(md|markdown|mdown|mkd|mdx)$/i;

function fileUrlToPath(urlStr) {
  try {
    const url = new URL(urlStr);
    if (url.protocol === "file:") return decodeURIComponent(url.pathname);
  } catch { /* not a valid URL */ }
  return null;
}

async function handleOpenUrls(urls) {
  for (const urlStr of urls) {
    const path = fileUrlToPath(urlStr);
    if (!path || !MD_EXTENSIONS.test(path)) continue;
    if (!rawMarkdown) {
      await loadFile(path);
    } else {
      const label = `viewer-url-${Date.now()}`;
      const encoded = encodeURIComponent(path);
      const filename = path.split(/[/\\]/).pop() || "file.md";
      new WebviewWindow(label, {
        url: `index.html?file=${encoded}`,
        title: `emdee \u2014 ${filename}`,
        width: 960, height: 720, minWidth: 480, minHeight: 360,
      });
    }
  }
}

async function loadFile(filePath) {
  try {
    rawMarkdown = await invoke("read_file", { path: filePath });
  } catch (err) {
    const content = document.getElementById("content");
    const errorDiv = document.createElement("div");
    errorDiv.className = "error";
    errorDiv.innerHTML = "<h2>Error</h2><p></p>";
    errorDiv.querySelector("p").textContent = String(err);
    content.innerHTML = "";
    content.appendChild(errorDiv);
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

  // Post-render: copy buttons on code blocks
  addCopyButtons(content);

  // Build TOC
  buildTOC(content, document.getElementById("toc-nav"));

  // Source toggle
  sourceToggle = initSourceToggle(rawMarkdown);

  // Update window title
  const filename = filePath.replace(/\\/g, "/").split("/").pop();
  currentFilename = filename;
  getCurrentWebviewWindow().setTitle(`${filename} — emdee`);

  // Hide welcome, show content
  document.getElementById("welcome").classList.add("hidden");
  document.getElementById("content-wrapper").classList.remove("hidden");

  // Transition toolbar: welcome → hint animation → proximity-reveal
  const tb = document.getElementById("toolbar");
  if (tb.classList.contains("toolbar-welcome")) {
    tb.classList.remove("toolbar-welcome");
    tb.classList.add("toolbar-hint");
    tb.addEventListener("animationend", () => {
      tb.classList.remove("toolbar-hint");
    }, { once: true });
  }

  // Start watching file for live reload
  await setupFileWatcher(filePath);
}

async function setupFileWatcher(filePath) {
  if (unlistenFileChanged) {
    unlistenFileChanged();
    unlistenFileChanged = null;
  }
  await invoke("watch_file", { path: filePath }).catch((err) => {
    console.warn("File watching not available:", err);
  });
  unlistenFileChanged = await listen("file-changed", async () => {
    if (isReloading) return;
    isReloading = true;
    try {
      const wrapper = document.getElementById("content-wrapper");
      const maxScroll = wrapper.scrollHeight - wrapper.clientHeight;
      const scrollFraction = maxScroll > 0 ? wrapper.scrollTop / maxScroll : 0;
      await loadFile(filePath);
      const newMaxScroll = wrapper.scrollHeight - wrapper.clientHeight;
      wrapper.scrollTop = scrollFraction * newMaxScroll;
    } finally {
      isReloading = false;
    }
  });
}

async function exportPDF() {
  if (!rawMarkdown) return;

  const defaultName = currentFilename ? currentFilename.replace(/\.\w+$/, ".pdf") : "document.pdf";
  const filePath = await saveDialog({
    filters: [{ name: "PDF", extensions: ["pdf"] }],
    defaultPath: defaultName,
  });
  if (!filePath) return;

  // Force light mode: switch data-theme, native window theme, and color-scheme meta
  const wasDark = document.documentElement.dataset.theme === "dark";
  document.documentElement.dataset.theme = "light";
  document.documentElement.classList.add("pdf-export");
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.content = "light";
  if (wasDark) await getCurrentWebviewWindow().setTheme("light");

  // Give the webview time to apply the theme change
  await new Promise((r) => setTimeout(r, 100));

  try {
    await invoke("export_pdf", { outputPath: filePath });
  } finally {
    document.documentElement.classList.remove("pdf-export");
    if (wasDark) {
      document.documentElement.dataset.theme = "dark";
      if (meta) meta.content = "dark";
      await getCurrentWebviewWindow().setTheme("dark");
    }
  }
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
      theme: theme?.isDark() ? "dark" : "light",
    });
  }
}

async function installCli() {
  try {
    const result = await invoke("install_cli");
    await message(result, { title: "Install CLI Command", kind: "info" });
  } catch (err) {
    await message(err, { title: "Install CLI Command", kind: "error" });
  }
}

async function setDefaultHandler() {
  try {
    await invoke("set_default_md_handler");
    await message("emdee is now the default app for Markdown files.", { title: "Default App", kind: "info" });
  } catch (err) {
    await message(err, { title: "Default App", kind: "error" });
  }
}

async function checkForUpdates(silent = false) {
  try {
    const update = await check();
    if (update) {
      const yes = await ask(
        `A new version of emdee is available!\n\n` +
        `Current: v${update.currentVersion}\n` +
        `Latest: v${update.version}\n\n` +
        `Would you like to download and install it?`,
        { title: "Update Available", kind: "info", okLabel: "Update", cancelLabel: "Later" }
      );
      if (yes) {
        await update.downloadAndInstall();
        await message(
          "Update installed. Please restart emdee to use the new version.",
          { title: "Update Complete", kind: "info" }
        );
      }
    } else if (!silent) {
      await message("You're running the latest version of emdee.", {
        title: "No Updates",
        kind: "info",
      });
    }
  } catch (e) {
    if (!silent) {
      await message(`Failed to check for updates: ${e}`, {
        title: "Update Error",
        kind: "error",
      });
    }
  }
}

async function init() {
  const platform = await invoke("get_platform");

  // Init theme first (affects mermaid rendering and native window appearance)
  theme = initTheme({
    onToggle: (isDark) => {
      reRenderMermaidBlocks(document.getElementById("content"), isDark);
    },
  });

  // Init search
  search = initSearch();

  // Listen for files opened via macOS "Open With" while app is running
  onOpenUrl((urls) => handleOpenUrls(urls));

  // Force light mode during print dialog (Cmd+P)
  let printWasDark = false;
  window.addEventListener("beforeprint", () => {
    printWasDark = document.documentElement.dataset.theme === "dark";
    document.documentElement.dataset.theme = "light";
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.content = "light";
  });
  window.addEventListener("afterprint", () => {
    if (printWasDark) {
      document.documentElement.dataset.theme = "dark";
      const meta = document.querySelector('meta[name="color-scheme"]');
      if (meta) meta.content = "dark";
      printWasDark = false;
    }
  });

  // Wire up toolbar buttons
  document.getElementById("btn-open").addEventListener("click", openFile);
  document.getElementById("btn-welcome-open").addEventListener("click", openFile);

  document.getElementById("btn-toc").addEventListener("click", toggleSidebar);

  document.getElementById("btn-source").addEventListener("click", () => {
    if (sourceToggle) sourceToggle.toggle();
  });

  document.getElementById("btn-theme").addEventListener("click", () => {
    theme.toggle();
  });

  if (platform === "macos" || platform === "windows") {
    document.getElementById("btn-pdf").addEventListener("click", exportPDF);
  } else {
    document.getElementById("btn-pdf").style.display = "none";
  }

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key === "o") {
      e.preventDefault();
      openFile();
    } else if (mod && e.key === "f") {
      e.preventDefault();
      toolbar.classList.remove("toolbar-visible");
      search.open();
    } else if (mod && e.shiftKey && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      if (sourceToggle) sourceToggle.toggle();
    } else if (mod && e.shiftKey && (e.key === "t" || e.key === "T")) {
      e.preventDefault();
      toggleSidebar();
    } else if ((platform === "macos" || platform === "windows") && mod && e.shiftKey && (e.key === "e" || e.key === "E")) {
      e.preventDefault();
      exportPDF();
    } else if (mod && e.shiftKey && (e.key === "d" || e.key === "D")) {
      e.preventDefault();
      theme.toggle();
    } else if (mod && e.key === "p") {
      e.preventDefault();
      window.print();
    } else if (mod && (e.key === "=" || e.key === "+")) {
      e.preventDefault();
      if (!isPinching) zoomIn();
    } else if (mod && e.key === "-") {
      e.preventDefault();
      if (!isPinching) zoomOut();
    } else if (mod && e.key === "0") {
      e.preventDefault();
      zoomReset();
    } else if (mod && e.key === "a" && document.activeElement?.id !== "search-input") {
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

  // Floating toolbar: show/hide based on mouse proximity to bottom
  const toolbar = document.getElementById("toolbar");
  const TOOLBAR_ZONE = 60; // px from bottom edge to trigger
  let toolbarHideTimeout = null;

  document.addEventListener("mousemove", (e) => {
    // Don't interfere with welcome or hint states
    if (toolbar.classList.contains("toolbar-welcome") || toolbar.classList.contains("toolbar-hint")) return;

    // Suppress toolbar while search bar is open
    const searchBar = document.getElementById("search-bar");
    if (searchBar && !searchBar.classList.contains("hidden")) return;

    if (e.clientY >= window.innerHeight - TOOLBAR_ZONE) {
      clearTimeout(toolbarHideTimeout);
      toolbar.classList.add("toolbar-visible");
    } else {
      // Check if mouse is still over the toolbar itself
      const rect = toolbar.getBoundingClientRect();
      const overToolbar = e.clientX >= rect.left && e.clientX <= rect.right
                       && e.clientY >= rect.top - 10 && e.clientY <= rect.bottom;
      if (!overToolbar) {
        clearTimeout(toolbarHideTimeout);
        toolbarHideTimeout = setTimeout(() => {
          toolbar.classList.remove("toolbar-visible");
        }, 300);
      }
    }
  });

  document.addEventListener("mouseleave", () => {
    if (toolbar.classList.contains("toolbar-welcome") || toolbar.classList.contains("toolbar-hint")) return;
    clearTimeout(toolbarHideTimeout);
    toolbarHideTimeout = setTimeout(() => {
      toolbar.classList.remove("toolbar-visible");
    }, 300);
  });

  // Ctrl+scroll zoom (discrete mouse wheel only)
  document.addEventListener("wheel", (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      if (isPinching) return;
      if (e.deltaY < 0) zoomIn(); else if (e.deltaY > 0) zoomOut();
    }
  }, { passive: false });

  // Trackpad pinch-to-zoom: smooth CSS transform preview, committed to setZoom on end
  function applyPinchZoom(animate) {
    const el = document.getElementById("content-wrapper");
    if (!el) return;
    el.style.transition = animate ? "transform 0.2s ease-out" : "";
    el.style.transform = pinchScale === 1.0 ? "" : `scale(${pinchScale})`;
    el.style.transformOrigin = "top center";
  }

  document.addEventListener("gesturestart", (e) => {
    e.preventDefault();
    isPinching = true;
    gestureStartScale = pinchScale;
    const el = document.getElementById("content-wrapper");
    if (el) el.style.transition = "";
  });

  document.addEventListener("gesturechange", (e) => {
    e.preventDefault();
    const raw = gestureStartScale * e.scale;
    pinchScale = Math.min(ZOOM_MAX / zoomLevel, Math.max(ZOOM_MIN / zoomLevel, raw));
    applyPinchZoom(false);
  });

  document.addEventListener("gestureend", (e) => {
    e.preventDefault();
    isPinching = false;
    // Commit pinch scale into the native zoom level
    zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomLevel * pinchScale));
    pinchScale = 1.0;
    clearPinchTransform();
    getCurrentWebviewWindow().setZoom(zoomLevel);
  });

  // Drag and drop — use Tauri's onDragDropEvent for actual file paths
  document.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  const appWindow = getCurrentWebviewWindow();
  appWindow.onDragDropEvent(async (event) => {
    if (event.payload.type === 'enter') {
      document.body.classList.add('drop-hover');
    } else if (event.payload.type === 'leave') {
      document.body.classList.remove('drop-hover');
    } else if (event.payload.type === 'drop') {
      document.body.classList.remove('drop-hover');

      for (const path of event.payload.paths) {
        const name = path.toLowerCase();
        if (
          name.endsWith(".md") ||
          name.endsWith(".markdown") ||
          name.endsWith(".mdx") ||
          name.endsWith(".mdown") ||
          name.endsWith(".mkd")
        ) {
          if (!rawMarkdown) {
            await loadFile(path);
          } else {
            const label = `viewer-drop-${Date.now()}`;
            const encoded = encodeURIComponent(path);
            const filename = path.split(/[/\\]/).pop() || "file.md";
            new WebviewWindow(label, {
              url: `index.html?file=${encoded}`,
              title: `emdee — ${filename}`,
              width: 960,
              height: 720,
              minWidth: 480,
              minHeight: 360,
              theme: theme?.isDark() ? "dark" : "light",
            });
          }
        }
      }
    }
  });

  // Build native menu bar
  const fileMenuItems = [
    { id: "menu-open", text: "Open...", accelerator: "CmdOrCtrl+O", action: () => openFile() },
    { item: "Separator" },
    { id: "menu-print", text: "Print...", accelerator: "CmdOrCtrl+P", action: () => window.print() },
  ];
  if (platform === "macos" || platform === "windows") {
    fileMenuItems.push({ id: "menu-export-pdf", text: "Export PDF...", accelerator: "CmdOrCtrl+Shift+E", action: () => exportPDF() });
  }
  fileMenuItems.push({ item: "Separator" }, { item: "Quit" });
  const fileMenu = await Submenu.new({ text: "File", items: fileMenuItems });

  const editMenu = await Submenu.new({
    text: "Edit",
    items: [
      { item: "Undo" },
      { item: "Redo" },
      { item: "Separator" },
      { item: "Cut" },
      { item: "Copy" },
      { item: "Paste" },
      { item: "SelectAll" },
    ],
  });

  const viewMenu = await Submenu.new({
    text: "View",
    items: [
      { id: "menu-toc", text: "Table of Contents", accelerator: "CmdOrCtrl+Shift+T", action: () => toggleSidebar() },
      { id: "menu-source", text: "View Source", accelerator: "CmdOrCtrl+Shift+S", action: () => sourceToggle?.toggle() },
      { item: "Separator" },
      { id: "menu-theme", text: "Toggle Theme", accelerator: "CmdOrCtrl+Shift+D", action: () => theme.toggle() },
    ],
  });

  const helpMenu = await Submenu.new({
    text: "Help",
    items: [
      { id: "menu-install-cli", text: "Install CLI Command...", action: () => installCli() },
      { id: "menu-set-default", text: "Set as Default Markdown App...", action: () => setDefaultHandler() },
      { item: "Separator" },
      { id: "menu-update", text: "Check for Updates...", action: () => checkForUpdates(false) },
    ],
  });

  const menu = await Menu.new({ items: [fileMenu, editMenu, viewMenu, helpMenu] });
  await menu.setAsAppMenu();

  // Determine which file to load:
  // 1. URL query param (used by new windows spawned from Rust)
  // 2. Initial file from CLI args (main window pulls from Rust state)
  // 3. Deep-link URL from macOS file association (Apple Events)
  const params = new URLSearchParams(window.location.search);
  const queryFile = params.get("file");

  if (queryFile) {
    await loadFile(decodeURIComponent(queryFile));
  } else {
    const initialFile = await invoke("get_initial_file");
    if (initialFile) {
      await loadFile(initialFile);
    } else {
      // Check if launched via macOS file association (deep-link plugin captures Apple Events)
      try {
        const deepLinkUrls = await getDeepLinkUrls();
        if (deepLinkUrls?.length) await handleOpenUrls(deepLinkUrls);
      } catch { /* deep-link plugin may not be available on all platforms */ }

      if (!rawMarkdown) {
        document.getElementById("welcome").classList.remove("hidden");
        document.getElementById("content-wrapper").classList.add("hidden");
        toolbar.classList.add("toolbar-welcome");
      }
    }
  }

  // Check for updates silently after startup
  setTimeout(() => checkForUpdates(true), 3000);
}

// Handle links: open external links in default browser, navigate relative markdown links
document.addEventListener("click", (e) => {
  const link = e.target.closest("a[href]");
  if (!link) return;

  const href = link.getAttribute("href");
  if (href.startsWith("#")) return;

  if (href.startsWith("http://") || href.startsWith("https://")) {
    e.preventDefault();
    import("@tauri-apps/plugin-shell").then(({ open }) => open(href)).catch(() => {});
    return;
  }

  // Relative markdown link: resolve against current file's directory and load in place
  const [relativePath, fragment] = href.split("#");
  if (fileDir && MD_EXTENSIONS.test(relativePath)) {
    e.preventDefault();
    invoke("resolve_path", { baseDir: fileDir, relative: decodeURIComponent(relativePath) })
      .then((resolvedPath) => loadFile(resolvedPath))
      .then(() => {
        if (fragment) {
          const target = document.getElementById(fragment);
          if (target) target.scrollIntoView({ behavior: "smooth" });
        }
      })
      .catch((err) => console.error("Failed to open relative link:", err));
  }
});

document.addEventListener("DOMContentLoaded", init);
