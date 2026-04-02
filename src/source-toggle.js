import Prism from "prismjs";
import "prismjs/components/prism-markdown";

let isSourceVisible = false;

export function initSourceToggle(rawMarkdown) {
  const overlay = document.getElementById("source-overlay");
  const codeEl = overlay.querySelector("code");

  // Set the raw markdown content
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
}
