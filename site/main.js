// Tab switching
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".install-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add("active");
  });
});

// Copy to clipboard
document.querySelectorAll(".copy-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const code = btn.closest(".code-block").querySelector("code").textContent;
    navigator.clipboard.writeText(code).then(() => {
      const label = btn.querySelector(".copy-label");
      const prev = label.textContent;
      label.textContent = "Copied!";
      btn.classList.add("copied");
      setTimeout(() => {
        label.textContent = prev;
        btn.classList.remove("copied");
      }, 2000);
    });
  });
});

// Auto-select platform tab
const isWindows = navigator.userAgent.includes("Windows");
if (isWindows) {
  document.querySelector('[data-tab="windows"]')?.click();
}
