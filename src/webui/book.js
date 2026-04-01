const bookState = {
  meta: null,
  toc: [],
  flatToc: [],
  activeSectionId: null,
  loadedSectionIds: [],
  sectionCache: new Map(),
  loadingSectionIds: new Set(),
  sectionObserver: null,
  topSentinelObserver: null,
  sentinelObserver: null,
};

const bookEls = {
  bookMain: document.querySelector(".book-main"),
  bookTitle: document.getElementById("bookTitle"),
  bookSubtitle: document.getElementById("bookSubtitle"),
  bookToc: document.getElementById("bookToc"),
  chapterTitle: document.getElementById("chapterTitle"),
  chapterMeta: document.getElementById("chapterMeta"),
  bookContent: document.getElementById("bookContent"),
  prevSectionButton: document.getElementById("prevSectionButton"),
  nextSectionButton: document.getElementById("nextSectionButton"),
  bookThemeToggle: document.getElementById("bookThemeToggle"),
  sourcePdfBookLink: document.getElementById("sourcePdfBookLink"),
};

const renderUtils = window.pdfnavRenderUtils;
const SECTION_BUFFER_BEHIND = 2;
const SECTION_BUFFER_AHEAD = 3;

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function clearElement(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${url} failed with ${response.status}: ${text}`);
  }

  return response.json();
}

function flattenToc(items, acc = []) {
  for (const item of items) {
    acc.push(item);
    flattenToc(item.children || [], acc);
  }
  return acc;
}

function sectionLabel(item) {
  return `${item.ordinal ? `${item.ordinal} ` : ""}${item.title}`.trim();
}

function getTocItem(sectionId) {
  return bookState.flatToc.find((item) => item.sectionId === sectionId) || null;
}

function getSectionIndex(sectionId) {
  return bookState.flatToc.findIndex((item) => item.sectionId === sectionId);
}

function getAdjacentSection(sectionId, direction) {
  const index = getSectionIndex(sectionId);
  if (index < 0) {
    return null;
  }

  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= bookState.flatToc.length) {
    return null;
  }

  return bookState.flatToc[nextIndex];
}

function stripHtmlText(text) {
  const template = document.createElement("template");
  template.innerHTML = String(text || "");
  return template.content.textContent?.replace(/\s+/g, " ").trim() || "";
}

function classifyCaption(text) {
  const plain = stripHtmlText(text);
  if (/^(fig\.|figure)\s*/i.test(plain)) {
    return { kind: "figure", plain };
  }
  if (/^table(\s+[ivx\d]+|\b)/i.test(plain)) {
    return { kind: "table", plain };
  }
  return null;
}

function bboxRect(node) {
  const bbox = Array.isArray(node?.bbox) ? node.bbox : null;
  if (!bbox || bbox.length !== 4) {
    return null;
  }

  return {
    left: bbox[0],
    top: bbox[1],
    right: bbox[2],
    bottom: bbox[3],
    width: Math.max(1, bbox[2] - bbox[0]),
    height: Math.max(1, bbox[3] - bbox[1]),
  };
}

function widthRatioFromBboxNorm(node) {
  const bboxNorm = Array.isArray(node?.bboxNorm) ? node.bboxNorm : null;
  if (!bboxNorm || bboxNorm.length !== 4) {
    return 1;
  }

  return Math.max(0.18, Math.min(1, bboxNorm[2] - bboxNorm[0]));
}

function widthPercentFromRatio(ratio) {
  return Math.max(42, Math.min(100, ratio * 100));
}

function groupNodesForReading(nodes) {
  const normalized = nodes.map((node, index) => ({
    ...node,
    _index: index,
    _captions: [],
  }));
  const usedCaptionIds = new Set();
  const consumedFigureNodeIds = new Set();
  const compositeFigureGroups = new Map();

  const mediaNodes = normalized.filter((node) => node.type === "figure" || node.type === "table");
  const captionCandidates = normalized.filter((node) => node.type === "paragraph" && classifyCaption(node.text));

  for (const captionNode of captionCandidates) {
    const caption = classifyCaption(captionNode.text);
    if (caption.kind === "figure") {
      const group = [];
      for (let cursor = captionNode._index - 1; cursor >= 0; cursor -= 1) {
        const candidate = normalized[cursor];
        if (candidate.pageIndex !== captionNode.pageIndex) {
          break;
        }
        if (candidate.type === "figure" && !consumedFigureNodeIds.has(candidate.nodeId)) {
          group.unshift(candidate);
          continue;
        }
        if (candidate.type === "paragraph" && classifyCaption(candidate.text)) {
          break;
        }
        if (group.length > 0) {
          break;
        }
      }

      if (group.length > 1) {
        compositeFigureGroups.set(captionNode.nodeId, {
          pageIndex: captionNode.pageIndex,
          figures: group,
          captionHtml: renderUtils.textToHtml(captionNode.text),
          captionText: stripHtmlText(captionNode.text),
        });
        usedCaptionIds.add(captionNode.nodeId);
        for (const item of group) {
          consumedFigureNodeIds.add(item.nodeId);
        }
        continue;
      }
    }

    const candidates = mediaNodes.filter(
      (node) => node.type === caption.kind && node.pageIndex === captionNode.pageIndex,
    );
    if (!candidates.length) {
      continue;
    }

    candidates.sort((left, right) => {
      const distanceDiff =
        Math.abs(left.readingOrder - captionNode.readingOrder) -
        Math.abs(right.readingOrder - captionNode.readingOrder);
      if (distanceDiff !== 0) {
        return distanceDiff;
      }
      return left._index - right._index;
    });

    const target = candidates[0];
    target._captions.push(captionNode.text);
    usedCaptionIds.add(captionNode.nodeId);
  }

  const blocks = [];
  let lastPageIndex = null;

  for (const node of normalized) {
    if (node.pageIndex !== lastPageIndex) {
      lastPageIndex = node.pageIndex;
      blocks.push({
        kind: "page-break",
        pageIndex: node.pageIndex,
      });
    }

    const compositeGroup = compositeFigureGroups.get(node.nodeId);
    if (compositeGroup) {
      blocks.push({
        kind: "figure-composite",
        pageIndex: compositeGroup.pageIndex,
        figures: compositeGroup.figures,
        captionHtml: compositeGroup.captionHtml,
        captionText: compositeGroup.captionText,
      });
      continue;
    }

    if (usedCaptionIds.has(node.nodeId)) {
      continue;
    }

    if (node.type === "figure") {
      if (consumedFigureNodeIds.has(node.nodeId)) {
        continue;
      }
      const captionText = node._captions.length
        ? node._captions.map((text) => stripHtmlText(text)).join(" ")
        : stripHtmlText(node.text || "");
      blocks.push({
        kind: "figure",
        pageIndex: node.pageIndex,
        node,
        captionHtml: node._captions.map((text) => renderUtils.textToHtml(text)).join(""),
        captionText,
      });
      continue;
    }

    if (node.type === "table") {
      blocks.push({
        kind: "table",
        pageIndex: node.pageIndex,
        node,
        captionHtml: node._captions.map((text) => renderUtils.textToHtml(text)).join(""),
      });
      continue;
    }

    if (node.type === "formula") {
      blocks.push({
        kind: "formula",
        pageIndex: node.pageIndex,
        node,
      });
      continue;
    }

    const html = renderUtils.textToHtml(node.text);
    if (!html) {
      continue;
    }

    blocks.push({
      kind: "text",
      pageIndex: node.pageIndex,
      node,
      html,
      isCaption: renderUtils.isCaptionLike(node.text),
    });
  }

  return blocks;
}

function renderBookTocItems(items, container) {
  for (const item of items) {
    const group = document.createElement("div");
    group.className = "book-toc-group";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "book-link";
    if (bookState.activeSectionId === item.sectionId) {
      button.classList.add("active");
    }
    button.innerHTML = `
      <span class="book-link-title">${renderUtils.escapeHtml(sectionLabel(item))}</span>
      <span class="book-link-meta">第 ${item.pageStart}-${item.pageEnd} 页</span>
    `;
    button.addEventListener("click", () => {
      void navigateToSection(item.sectionId);
    });
    group.appendChild(button);

    if (Array.isArray(item.children) && item.children.length > 0) {
      const children = document.createElement("div");
      children.className = "book-toc-children";
      renderBookTocItems(item.children, children);
      group.appendChild(children);
    }

    container.appendChild(group);
  }
}

function renderBookToc() {
  bookEls.bookToc.innerHTML = "";
  renderBookTocItems(bookState.toc, bookEls.bookToc);
}

function updateHeader(sectionId) {
  const tocItem = getTocItem(sectionId);
  const cached = bookState.sectionCache.get(sectionId);
  if (!tocItem) {
    return;
  }

  bookEls.chapterTitle.textContent = sectionLabel(tocItem);
  const nodeCount = cached?.nodes?.length ?? 0;
  bookEls.chapterMeta.textContent = `第 ${tocItem.pageStart}-${tocItem.pageEnd} 页${nodeCount ? ` · 共 ${nodeCount} 个内容块` : ""}`;
}

function updateNavButtons() {
  const prev = getAdjacentSection(bookState.activeSectionId, -1);
  const next = getAdjacentSection(bookState.activeSectionId, 1);

  bookEls.prevSectionButton.disabled = !prev;
  bookEls.nextSectionButton.disabled = !next;
  bookEls.prevSectionButton.textContent = prev ? `上一章：${sectionLabel(prev)}` : "上一章";
  bookEls.nextSectionButton.textContent = next ? `下一章：${sectionLabel(next)}` : "下一章";
  bookEls.prevSectionButton.onclick = prev ? () => void navigateToSection(prev.sectionId) : null;
  bookEls.nextSectionButton.onclick = next ? () => void navigateToSection(next.sectionId) : null;
}

function setActiveSection(sectionId, options = {}) {
  const { scrollIntoView = false } = options;
  if (!sectionId) {
    return;
  }

  if (bookState.activeSectionId === sectionId) {
    updateHeader(sectionId);
    updateNavButtons();
    renderBookToc();
    void ensureBufferedSections();
    if (scrollIntoView) {
      const target = document.getElementById(`section-${sectionId}`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    return;
  }

  bookState.activeSectionId = sectionId;
  updateHeader(sectionId);
  updateNavButtons();
  renderBookToc();
  void ensureBufferedSections();

  const url = new URL(window.location.href);
  url.searchParams.set("section", sectionId);
  history.replaceState(null, "", url);

  if (scrollIntoView) {
    const target = document.getElementById(`section-${sectionId}`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function createPageMarker(pageIndex) {
  const marker = document.createElement("div");
  marker.className = "book-page-marker";
  marker.innerHTML = `<span>第 ${pageIndex} 页</span>`;
  return marker;
}

function appendReadingBlocks(container, blocks) {
  for (const block of blocks) {
    if (block.kind === "page-break") {
      container.appendChild(createPageMarker(block.pageIndex));
      continue;
    }

    if (block.kind === "text") {
      const section = document.createElement("section");
      section.className = `book-block book-text-block${block.isCaption ? " book-caption-text" : ""}`;
      section.innerHTML = block.html;
      container.appendChild(section);
      continue;
    }

    if (block.kind === "formula") {
      const section = document.createElement("section");
      section.className = "book-block book-formula-block";
      section.innerHTML = renderUtils.buildNodeBodyHtml(block.node);
      container.appendChild(section);
      continue;
    }

    if (block.kind === "figure") {
      const section = document.createElement("figure");
      section.className = "book-block book-figure-block";
      section.style.setProperty("--book-figure-width", `${widthPercentFromRatio(widthRatioFromBboxNorm(block.node))}%`);
      section.innerHTML = `
        ${block.node.assetUrl ? `<div class="book-figure-frame"><img class="figure-image" src="${renderUtils.escapeHtml(block.node.assetUrl)}" alt="${renderUtils.escapeHtml(block.node.title || block.node.nodeId || "figure")}" loading="lazy" data-caption="${renderUtils.escapeHtml(block.captionText || "")}" /></div>` : ""}
        ${block.captionHtml ? `<figcaption class="book-caption">${block.captionHtml}</figcaption>` : ""}
      `;
      container.appendChild(section);
      continue;
    }

    if (block.kind === "figure-composite") {
      const section = document.createElement("figure");
      section.className = "book-block book-figure-block book-composite-figure";

      const rects = block.figures
        .map((figure) => ({
          figure,
          rect: bboxRect(figure),
        }))
        .filter((item) => item.rect);

      const bounds = rects.reduce(
        (acc, item) => ({
          left: Math.min(acc.left, item.rect.left),
          top: Math.min(acc.top, item.rect.top),
          right: Math.max(acc.right, item.rect.right),
          bottom: Math.max(acc.bottom, item.rect.bottom),
        }),
        {
          left: Number.POSITIVE_INFINITY,
          top: Number.POSITIVE_INFINITY,
          right: Number.NEGATIVE_INFINITY,
          bottom: Number.NEGATIVE_INFINITY,
        },
      );

      const width = Math.max(1, bounds.right - bounds.left);
      const height = Math.max(1, bounds.bottom - bounds.top);
      const widthRatio = rects.reduce((maxRatio, { figure }) => {
        return Math.max(maxRatio, widthRatioFromBboxNorm(figure));
      }, Math.max(0.18, Math.min(1, width / 1664)));
      section.style.setProperty("--book-figure-width", `${widthPercentFromRatio(widthRatio)}%`);

      const panels = rects
        .map(({ figure, rect }) => {
          const left = ((rect.left - bounds.left) / width) * 100;
          const top = ((rect.top - bounds.top) / height) * 100;
          const panelWidth = (rect.width / width) * 100;
          const panelHeight = (rect.height / height) * 100;
          return `
            <div
              class="book-composite-panel"
              style="left:${left}%;top:${top}%;width:${panelWidth}%;height:${panelHeight}%;"
            >
              <img
                class="figure-image"
                src="${renderUtils.escapeHtml(figure.assetUrl || "")}"
                alt="${renderUtils.escapeHtml(block.captionText || figure.title || figure.nodeId || "figure")}"
                loading="lazy"
                data-caption="${renderUtils.escapeHtml(block.captionText || "")}"
              />
            </div>
          `;
        })
        .join("");

      section.innerHTML = `
        <div class="book-figure-frame">
          <div class="book-composite-stage" style="aspect-ratio:${width} / ${height};">
            ${panels}
          </div>
        </div>
        ${block.captionHtml ? `<figcaption class="book-caption">${block.captionHtml}</figcaption>` : ""}
      `;
      container.appendChild(section);
      continue;
    }

    if (block.kind === "table") {
      const section = document.createElement("section");
      section.className = "book-block book-table-block";
      section.innerHTML = `
        ${block.captionHtml ? `<div class="book-caption">${block.captionHtml}</div>` : ""}
        ${renderUtils.buildNodeBodyHtml(block.node)}
      `;
      container.appendChild(section);
    }
  }
}

function createSectionArticle(payload) {
  const article = document.createElement("article");
  article.className = "book-section";
  article.id = `section-${payload.section.sectionId}`;
  article.dataset.sectionId = payload.section.sectionId;

  const header = document.createElement("header");
  header.className = "book-section-header";
  header.innerHTML = `
    <p class="eyebrow">章节</p>
    <h3 class="book-section-title">${renderUtils.escapeHtml(sectionLabel(payload.section))}</h3>
    <p class="book-section-meta">第 ${payload.section.pageRange[0]}-${payload.section.pageRange[1]} 页 · 共 ${payload.nodes.length} 个内容块</p>
  `;
  article.appendChild(header);

  const content = document.createElement("div");
  content.className = "book-section-content";

  const blocks = groupNodesForReading(payload.nodes);
  const visibleBlocks = blocks.filter((block) => block.kind !== "page-break");
  if (!visibleBlocks.length) {
    content.innerHTML = '<div class="empty-state">当前章节没有可读内容。</div>';
  } else {
    appendReadingBlocks(content, blocks);
  }

  article.appendChild(content);
  return article;
}

function getLoadingSentinel(edge = "bottom") {
  let sentinel = bookEls.bookContent.querySelector(`.book-loading-sentinel[data-edge="${edge}"]`);
  if (sentinel) {
    return sentinel;
  }

  sentinel = document.createElement("div");
  sentinel.className = "book-loading-sentinel";
  sentinel.dataset.edge = edge;
  sentinel.setAttribute("aria-hidden", "true");
  if (edge === "top") {
    bookEls.bookContent.insertBefore(sentinel, bookEls.bookContent.firstChild);
  } else {
    bookEls.bookContent.appendChild(sentinel);
  }
  return sentinel;
}

function getTopSentinel() {
  return getLoadingSentinel("top");
}

function getBottomSentinel() {
  return getLoadingSentinel("bottom");
}

function updateSentinelState() {
  const topSentinel = getTopSentinel();
  const bottomSentinel = getBottomSentinel();
  const lastLoaded = bookState.loadedSectionIds[bookState.loadedSectionIds.length - 1];
  const firstLoaded = bookState.loadedSectionIds[0];
  const loading = bookState.loadingSectionIds.size > 0;

  topSentinel.dataset.state = loading ? "loading" : firstLoaded && !getAdjacentSection(firstLoaded, -1) ? "done" : "idle";
  bottomSentinel.dataset.state = loading ? "loading" : lastLoaded && !getAdjacentSection(lastLoaded, 1) ? "done" : "idle";
}

function isNearBottom() {
  const scrollEl = document.scrollingElement || document.documentElement;
  return window.scrollY + window.innerHeight + 720 >= scrollEl.scrollHeight;
}

function isNearTop() {
  return window.scrollY <= 720;
}

function maybeLoadMore() {
  if (bookState.loadingSectionIds.size > 0 || !bookState.loadedSectionIds.length) {
    return;
  }

  if (isNearTop() || isNearBottom()) {
    void ensureBufferedSections();
  }
}

async function loadSectionPayload(sectionId) {
  const cached = bookState.sectionCache.get(sectionId);
  if (cached) {
    return cached;
  }

  const payload = await fetchJson(`/api/viewer/section?section=${encodeURIComponent(sectionId)}`);
  bookState.sectionCache.set(sectionId, payload);
  return payload;
}

async function appendSectionById(sectionId) {
  if (!sectionId || bookState.loadedSectionIds.includes(sectionId) || bookState.loadingSectionIds.has(sectionId)) {
    return;
  }

  bookState.loadingSectionIds.add(sectionId);
  updateSentinelState();

  try {
    const payload = await loadSectionPayload(sectionId);
    if (bookState.loadedSectionIds.includes(sectionId)) {
      return;
    }

    const article = createSectionArticle(payload);
    const sentinel = getBottomSentinel();
    bookEls.bookContent.insertBefore(article, sentinel);
    bookState.loadedSectionIds.push(sectionId);
    bookState.sectionObserver?.observe(article);
    await renderUtils.typeset(article);
    renderUtils.bindZoomableImages(article);
    requestAnimationFrame(() => {
      maybeLoadMore();
    });

    if (!bookState.activeSectionId) {
      setActiveSection(sectionId);
    }
  } finally {
    bookState.loadingSectionIds.delete(sectionId);
    updateSentinelState();
  }
}

async function prependSectionById(sectionId) {
  if (!sectionId || bookState.loadedSectionIds.includes(sectionId) || bookState.loadingSectionIds.has(sectionId)) {
    return;
  }

  const scrollEl = document.scrollingElement || document.documentElement;
  const previousHeight = scrollEl.scrollHeight;
  const previousTop = window.scrollY;

  bookState.loadingSectionIds.add(sectionId);
  updateSentinelState();

  try {
    const payload = await loadSectionPayload(sectionId);
    if (bookState.loadedSectionIds.includes(sectionId)) {
      return;
    }

    const article = createSectionArticle(payload);
    const firstSection = bookEls.bookContent.querySelector(".book-section");
    bookEls.bookContent.insertBefore(article, firstSection || getBottomSentinel());
    bookState.loadedSectionIds.unshift(sectionId);
    bookState.sectionObserver?.observe(article);
    await renderUtils.typeset(article);
    renderUtils.bindZoomableImages(article);

    requestAnimationFrame(() => {
      const nextHeight = scrollEl.scrollHeight;
      window.scrollTo({
        top: previousTop + (nextHeight - previousHeight),
        behavior: "auto",
      });
      maybeLoadMore();
    });
  } finally {
    bookState.loadingSectionIds.delete(sectionId);
    updateSentinelState();
  }
}

async function loadNextSection() {
  const lastLoaded = bookState.loadedSectionIds[bookState.loadedSectionIds.length - 1];
  const next = getAdjacentSection(lastLoaded, 1);
  if (!next) {
    updateSentinelState();
    return;
  }

  await appendSectionById(next.sectionId);
}

async function loadPreviousSection() {
  const firstLoaded = bookState.loadedSectionIds[0];
  const previous = getAdjacentSection(firstLoaded, -1);
  if (!previous) {
    return;
  }

  await prependSectionById(previous.sectionId);
}

async function ensureBufferedSections() {
  if (!bookState.activeSectionId || bookState.loadingSectionIds.size > 0) {
    return;
  }

  const activeIndex = getSectionIndex(bookState.activeSectionId);
  if (activeIndex < 0) {
    return;
  }

  let firstLoaded = bookState.loadedSectionIds[0];
  let headIndex = firstLoaded ? getSectionIndex(firstLoaded) : -1;
  let lastLoaded = bookState.loadedSectionIds[bookState.loadedSectionIds.length - 1];
  let tailIndex = lastLoaded ? getSectionIndex(lastLoaded) : -1;
  const targetHeadIndex = Math.max(0, activeIndex - SECTION_BUFFER_BEHIND);
  const targetTailIndex = Math.min(bookState.flatToc.length - 1, activeIndex + SECTION_BUFFER_AHEAD);

  while (headIndex > targetHeadIndex) {
    await loadPreviousSection();
    firstLoaded = bookState.loadedSectionIds[0];
    headIndex = firstLoaded ? getSectionIndex(firstLoaded) : -1;
  }

  while (tailIndex >= 0 && tailIndex < targetTailIndex) {
    await loadNextSection();
    lastLoaded = bookState.loadedSectionIds[bookState.loadedSectionIds.length - 1];
    tailIndex = lastLoaded ? getSectionIndex(lastLoaded) : -1;
  }
}

function observeSectionVisibility() {
  bookState.sectionObserver?.disconnect();
  bookState.topSentinelObserver?.disconnect();
  bookState.sentinelObserver?.disconnect();

  bookState.sectionObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio);

      const top = visible[0];
      if (!(top?.target instanceof HTMLElement)) {
        return;
      }

      setActiveSection(top.target.dataset.sectionId || null);
    },
    {
      rootMargin: "-14% 0px -56% 0px",
      threshold: [0.2, 0.45, 0.7],
    },
  );

  bookState.topSentinelObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadPreviousSection();
      }
    },
    {
      rootMargin: "720px 0px 720px 0px",
      threshold: 0,
    },
  );

  bookState.sentinelObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadNextSection();
      }
    },
    {
      rootMargin: "720px 0px 720px 0px",
      threshold: 0,
    },
  );

  const topSentinel = getTopSentinel();
  const bottomSentinel = getBottomSentinel();
  bookState.topSentinelObserver.observe(topSentinel);
  bookState.sentinelObserver.observe(bottomSentinel);
  window.removeEventListener("scroll", maybeLoadMore);
  window.removeEventListener("resize", maybeLoadMore);
  window.addEventListener("scroll", maybeLoadMore, { passive: true });
  window.addEventListener("resize", maybeLoadMore);
}

async function resetBookFromSection(sectionId) {
  const bookMain = bookEls.bookMain;
  bookMain?.classList.add("section-transitioning");
  if (bookState.loadedSectionIds.length > 0) {
    await wait(110);
  }

  try {
    clearElement(bookEls.bookContent);
    bookState.sectionObserver?.disconnect();
    bookState.topSentinelObserver?.disconnect();
    bookState.sentinelObserver?.disconnect();
    bookState.loadedSectionIds = [];
    bookState.activeSectionId = null;

    getTopSentinel();
    getBottomSentinel();
    observeSectionVisibility();
    await appendSectionById(sectionId);
    setActiveSection(sectionId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  } finally {
    requestAnimationFrame(() => {
      bookMain?.classList.remove("section-transitioning");
    });
  }
}

async function navigateToSection(sectionId) {
  if (!sectionId) {
    return;
  }

  if (bookState.loadedSectionIds.includes(sectionId)) {
    setActiveSection(sectionId, { scrollIntoView: true });
    return;
  }

  await resetBookFromSection(sectionId);
}

async function bootstrapBook() {
  renderUtils.initThemeToggle(bookEls.bookThemeToggle, {
    dark: "夜间",
    light: "日间",
  });

  const [metaPayload, tocPayload] = await Promise.all([
    fetchJson("/api/viewer/meta"),
    fetchJson("/api/viewer/toc"),
  ]);

  bookState.meta = metaPayload;
  bookState.toc = tocPayload.toc || [];
  bookState.flatToc = flattenToc(bookState.toc);

  bookEls.bookTitle.textContent = metaPayload.document.title || metaPayload.document.sourceFilename;
  bookEls.bookSubtitle.textContent = `${metaPayload.summary.pageCount || 0} 页 · ${metaPayload.summary.sectionCount || 0} 个章节`;
  bookEls.sourcePdfBookLink.href = metaPayload.sourcePdfUrl || "/workspace/source.pdf";

  const targetSection =
    new URL(window.location.href).searchParams.get("section") || metaPayload.defaultSectionId;

  renderBookToc();

  if (targetSection) {
    await resetBookFromSection(targetSection);
    return;
  }

  bookEls.chapterTitle.textContent = "暂无章节";
  bookEls.chapterMeta.textContent = "请先执行 build-structure。";
  bookEls.bookContent.innerHTML = '<div class="empty-state">暂无章节内容。</div>';
}

bootstrapBook().catch((error) => {
  console.error(error);
  const message = error instanceof Error ? error.message : String(error);
  bookEls.chapterTitle.textContent = "阅读页加载失败";
  bookEls.chapterMeta.textContent = message;
  bookEls.bookContent.innerHTML = `<div class="empty-state">${renderUtils.escapeHtml(message)}</div>`;
});
