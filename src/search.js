let matches = [];
let currentIndex = -1;

export function initSearch() {
  const bar = document.getElementById("search-bar");
  const input = document.getElementById("search-input");
  const count = document.getElementById("search-count");
  const prevBtn = document.getElementById("search-prev");
  const nextBtn = document.getElementById("search-next");
  const closeBtn = document.getElementById("search-close");

  function open() {
    bar.classList.remove("hidden");
    input.focus();
    input.select();
  }

  function close() {
    bar.classList.add("hidden");
    clearHighlights();
    input.value = "";
    count.textContent = "";
  }

  function clearHighlights() {
    const marks = document.querySelectorAll("mark.search-highlight");
    for (const mark of marks) {
      const parent = mark.parentNode;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    }
    matches = [];
    currentIndex = -1;
  }

  function doSearch() {
    clearHighlights();
    const query = input.value.trim();
    if (!query) {
      count.textContent = "";
      return;
    }

    const content = document.getElementById("content");
    highlightText(content, query);
    matches = Array.from(document.querySelectorAll("mark.search-highlight"));

    if (matches.length > 0) {
      currentIndex = 0;
      scrollToMatch();
    }
    updateCount();
  }

  function highlightText(node, query) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    const lowerQuery = query.toLowerCase();
    for (const textNode of textNodes) {
      const text = textNode.textContent;
      const lowerText = text.toLowerCase();
      const idx = lowerText.indexOf(lowerQuery);
      if (idx === -1) continue;

      const before = text.slice(0, idx);
      const match = text.slice(idx, idx + query.length);
      const after = text.slice(idx + query.length);

      const mark = document.createElement("mark");
      mark.className = "search-highlight";
      mark.textContent = match;

      const frag = document.createDocumentFragment();
      if (before) frag.appendChild(document.createTextNode(before));
      frag.appendChild(mark);
      if (after) frag.appendChild(document.createTextNode(after));

      textNode.parentNode.replaceChild(frag, textNode);
    }
  }

  function scrollToMatch() {
    for (const m of matches) m.classList.remove("current");
    if (currentIndex >= 0 && currentIndex < matches.length) {
      matches[currentIndex].classList.add("current");
      matches[currentIndex].scrollIntoView({ behavior: "smooth", block: "center" });
    }
    updateCount();
  }

  function updateCount() {
    if (matches.length === 0) {
      count.textContent = input.value.trim() ? "0 matches" : "";
    } else {
      count.textContent = `${currentIndex + 1}/${matches.length}`;
    }
  }

  function next() {
    if (matches.length === 0) return;
    currentIndex = (currentIndex + 1) % matches.length;
    scrollToMatch();
  }

  function prev() {
    if (matches.length === 0) return;
    currentIndex = (currentIndex - 1 + matches.length) % matches.length;
    scrollToMatch();
  }

  input.addEventListener("input", doSearch);
  nextBtn.addEventListener("click", next);
  prevBtn.addEventListener("click", prev);
  closeBtn.addEventListener("click", close);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.shiftKey ? prev() : next();
    } else if (e.key === "Escape") {
      close();
    }
  });

  return { open, close };
}
