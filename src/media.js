import { invoke, convertFileSrc } from "@tauri-apps/api/core";

export async function resolveMediaPaths(container, baseDir) {
  const selectors = [
    { sel: "img[src]", attr: "src" },
    { sel: "video[src]", attr: "src" },
    { sel: "source[src]", attr: "src" },
    { sel: "object[data]", attr: "data" },
  ];

  for (const { sel, attr } of selectors) {
    const elements = container.querySelectorAll(sel);
    for (const el of elements) {
      const value = el.getAttribute(attr);
      if (!value) continue;
      if (/^(https?:|data:|blob:|asset:)/.test(value)) continue;

      const resolved = await invoke("resolve_path", {
        baseDir,
        relative: value,
      });
      el.setAttribute(attr, convertFileSrc(resolved));
    }
  }
}
