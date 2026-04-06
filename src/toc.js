let cleanupScrollTracker = null;

export function buildTOC(container, tocNav) {
  // Clean up previous scroll tracker
  if (cleanupScrollTracker) {
    cleanupScrollTracker();
    cleanupScrollTracker = null;
  }

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
  const OFFSET_THRESHOLD = 100;
  const headingElements = Array.from(headings).filter((h) => h.id);
  const scrollContainer = document.getElementById("content-wrapper");
  let ticking = false;

  function updateActiveHeading() {
    let activeHeading = null;
    for (const heading of headingElements) {
      if (heading.getBoundingClientRect().top <= OFFSET_THRESHOLD) {
        activeHeading = heading;
      } else {
        break;
      }
    }
    if (!activeHeading && headingElements.length > 0) {
      activeHeading = headingElements[0];
    }
    const links = tocNav.querySelectorAll("a");
    for (const l of links) {
      l.classList.toggle(
        "active",
        activeHeading && l.getAttribute("href") === `#${activeHeading.id}`
      );
    }
    ticking = false;
  }

  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(updateActiveHeading);
      ticking = true;
    }
  }

  scrollContainer.addEventListener("scroll", onScroll);
  updateActiveHeading();

  cleanupScrollTracker = () => {
    scrollContainer.removeEventListener("scroll", onScroll);
  };
}
