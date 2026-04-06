import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

const STORAGE_KEY = "emdee-theme";

export function initTheme({ onToggle } = {}) {
  const saved = localStorage.getItem(STORAGE_KEY);
  const isDark = saved
    ? saved === "dark"
    : window.matchMedia("(prefers-color-scheme: dark)").matches;

  applyTheme(isDark);
  updateIcons(isDark);

  return { toggle: () => toggle(onToggle), isDark: () => document.documentElement.dataset.theme === "dark" };
}

function applyTheme(isDark) {
  const scheme = isDark ? "dark" : "light";
  document.documentElement.dataset.theme = scheme;
  // Sync the color-scheme meta tag
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.content = scheme;
  // Set native window theme — ensures WKWebView's prefers-color-scheme matches
  getCurrentWebviewWindow().setTheme(scheme).catch(() => {});
}

function updateIcons(isDark) {
  const sun = document.getElementById("icon-sun");
  const moon = document.getElementById("icon-moon");
  if (sun && moon) {
    sun.style.display = isDark ? "none" : "block";
    moon.style.display = isDark ? "block" : "none";
  }
}

function toggle(onToggle) {
  const current = document.documentElement.dataset.theme;
  const next = current === "dark" ? "light" : "dark";
  const isDark = next === "dark";
  applyTheme(isDark);
  updateIcons(isDark);
  localStorage.setItem(STORAGE_KEY, next);
  if (onToggle) onToggle(isDark);
}
