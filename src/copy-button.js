/**
 * Injects a "Copy" button into each <pre> code block.
 */
export function addCopyButtons(container) {
  const blocks = container.querySelectorAll("pre");
  for (const pre of blocks) {
    // Skip blocks that already have a copy button or aren't code
    if (pre.querySelector(".copy-btn") || !pre.querySelector("code")) continue;

    // Skip mermaid blocks (they get replaced by SVGs)
    if (pre.querySelector("code.language-mermaid")) continue;

    pre.style.position = "relative";

    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.textContent = "Copy";
    btn.addEventListener("click", () => {
      const code = pre.querySelector("code");
      navigator.clipboard.writeText(code.textContent).then(() => {
        btn.textContent = "Copied!";
        setTimeout(() => { btn.textContent = "Copy"; }, 1500);
      });
    });
    pre.appendChild(btn);
  }
}
