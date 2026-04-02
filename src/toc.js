export function buildTOC(container, tocNav) {
  const headings = container.querySelectorAll("h1, h2, h3, h4, h5, h6");
  if (headings.length === 0) {
    tocNav.innerHTML = "<p class='toc-empty'>No headings found</p>";
    return;
  }

  const list = document.createElement("ul");
  list.className = "toc-list";

  for (const heading of headings) {
    const level = parseInt(heading.tagName[1]);
    const li = document.createElement("li");
    li.className = `toc-item toc-level-${level}`;

    const link = document.createElement("a");
    link.href = `#${heading.id}`;
    link.textContent = heading.textContent;
    link.addEventListener("click", (e) => {
      e.preventDefault();
      heading.scrollIntoView({ behavior: "smooth" });
    });

    li.appendChild(link);
    list.appendChild(li);
  }

  tocNav.innerHTML = "";
  tocNav.appendChild(list);

  // Scroll tracking: highlight current heading in TOC
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          const links = tocNav.querySelectorAll("a");
          for (const l of links) {
            l.classList.toggle("active", l.getAttribute("href") === `#${id}`);
          }
        }
      }
    },
    { rootMargin: "-80px 0px -80% 0px" }
  );

  for (const heading of headings) {
    if (heading.id) observer.observe(heading);
  }
}
