import Prism from "prismjs";
import "prismjs/components/prism-markdown";

let isSourceVisible = false;

export function initSourceToggle(rawMarkdown) {
  const overlay = document.getElementById("source-overlay");
  const codeEl = overlay.querySelector("code");

  codeEl.textContent = rawMarkdown;
  Prism.highlightElement(codeEl);

  return { toggle, isVisible: () => isSourceVisible };
}

function toggle() {
  const overlay = document.getElementById("source-overlay");
  const contentWrapper = document.getElementById("content-wrapper");
  isSourceVisible = !isSourceVisible;
  overlay.classList.toggle("hidden", !isSourceVisible);
  contentWrapper.classList.toggle("hidden", isSourceVisible);

  // Sync sidebar-open state to source overlay
  const sidebarOpen = !document.getElementById("toc-sidebar").classList.contains("hidden");
  overlay.classList.toggle("sidebar-open", isSourceVisible && sidebarOpen);
}

// Called when TOC sidebar is toggled to keep source overlay in sync
export function syncSourceSidebar() {
  const overlay = document.getElementById("source-overlay");
  if (!overlay.classList.contains("hidden")) {
    const sidebarOpen = !document.getElementById("toc-sidebar").classList.contains("hidden");
    overlay.classList.toggle("sidebar-open", sidebarOpen);
  }
}
