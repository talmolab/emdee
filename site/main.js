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
    const label = btn.querySelector(".copy-label");
    const prev = label.textContent;

    const showCopied = () => {
      label.textContent = "Copied!";
      btn.classList.add("copied");
      setTimeout(() => {
        label.textContent = prev;
        btn.classList.remove("copied");
      }, 2000);
    };

    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(showCopied);
    } else {
      // Fallback for non-HTTPS or older browsers
      const textarea = document.createElement("textarea");
      textarea.value = code;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      showCopied();
    }
  });
});

// Auto-select platform tab
const ua = navigator.userAgent;
if (ua.includes("Windows")) {
  document.querySelector('[data-tab="windows"]')?.click();
}
