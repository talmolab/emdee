import MarkdownIt from "markdown-it";
import footnotePlugin from "markdown-it-footnote";
import taskListPlugin from "markdown-it-task-lists";
import anchorPlugin from "markdown-it-anchor";
import katexPluginModule from "@vscode/markdown-it-katex";
const katexPlugin = katexPluginModule.default || katexPluginModule;
import Prism from "prismjs";

// Import Prism languages (statically bundled for browser use)
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-css";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-java";
import "prismjs/components/prism-go";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-toml";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-diff";
import "prismjs/components/prism-docker";
import "prismjs/components/prism-lua";
import "prismjs/components/prism-r";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-swift";
import "prismjs/components/prism-kotlin";
import "prismjs/components/prism-scala";

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(str, lang) {
    const grammar = lang && Prism.languages[lang];
    if (grammar) {
      return `<pre class="language-${lang}"><code class="language-${lang}">${Prism.highlight(str, grammar, lang)}</code></pre>`;
    }
    // No highlighting — preserve original language class so post-processors
    // (e.g. mermaid-loader) can still find their blocks by class name
    const cls = lang ? `language-${lang}` : "language-plaintext";
    return `<pre class="${cls}"><code class="${cls}">${md.utils.escapeHtml(str)}</code></pre>`;
  },
});

md.enable(["table", "strikethrough"]);
md.use(anchorPlugin, { permalink: false });
md.use(footnotePlugin);
md.use(taskListPlugin, { enabled: false, label: true });
md.use(katexPlugin, { throwOnError: false });

export function renderMarkdown(source) {
  return md.render(source);
}
