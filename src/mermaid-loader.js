let mermaidLoaded = false;
let mermaidModule = null;

export async function renderMermaidBlocks(container, isDark) {
  const blocks = container.querySelectorAll("code.language-mermaid");
  if (blocks.length === 0) return;

  if (!mermaidLoaded) {
    mermaidModule = await import("mermaid");
    mermaidModule.default.initialize({
      startOnLoad: false,
      theme: isDark ? "dark" : "default",
      securityLevel: "loose",
    });
    mermaidLoaded = true;
  } else {
    mermaidModule.default.initialize({
      theme: isDark ? "dark" : "default",
    });
  }

  for (let i = 0; i < blocks.length; i++) {
    const code = blocks[i];
    const pre = code.parentElement;
    const source = code.textContent;

    const id = `mermaid-${Date.now()}-${i}`;
    const div = document.createElement("div");
    div.className = "mermaid-diagram";
    div.dataset.mermaidSource = source;

    try {
      const { svg } = await mermaidModule.default.render(id, source);
      div.innerHTML = svg;
    } catch (err) {
      div.className = "mermaid-error";
      div.textContent = `Mermaid error: ${err.message}`;
    }

    pre.replaceWith(div);
  }
}

export async function reRenderMermaidBlocks(container, isDark) {
  const diagrams = container.querySelectorAll(".mermaid-diagram[data-mermaid-source]");
  if (diagrams.length === 0) return;

  if (!mermaidModule) {
    mermaidModule = await import("mermaid");
    mermaidLoaded = true;
  }
  mermaidModule.default.initialize({
    theme: isDark ? "dark" : "default",
  });

  for (let i = 0; i < diagrams.length; i++) {
    const div = diagrams[i];
    const source = div.dataset.mermaidSource;
    const id = `mermaid-rerender-${Date.now()}-${i}`;

    try {
      const { svg } = await mermaidModule.default.render(id, source);
      div.innerHTML = svg;
    } catch (err) {
      div.className = "mermaid-error";
      div.textContent = `Mermaid error: ${err.message}`;
    }
  }
}

export function resetMermaid() {
  mermaidLoaded = false;
  mermaidModule = null;
}
