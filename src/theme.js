const STORAGE_KEY = "emdee-theme";

export function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = saved ? saved === "dark" : systemDark;

  applyTheme(isDark);

  // Follow system changes when no manual override
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      applyTheme(e.matches);
    }
  });

  return { toggle, isDark: () => document.documentElement.dataset.theme === "dark" };
}

function applyTheme(isDark) {
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
}

function toggle() {
  const current = document.documentElement.dataset.theme;
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next === "dark");
  localStorage.setItem(STORAGE_KEY, next);
}
