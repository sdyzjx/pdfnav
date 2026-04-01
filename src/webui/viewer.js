const state = {
  meta: null,
  toc: [],
  sections: [],
  activeSectionId: null,
  activePage: null,
  queryMode: false,
};

const els = {
  documentTitle: document.getElementById("documentTitle"),
  documentSubtitle: document.getElementById("documentSubtitle"),
  summaryPages: document.getElementById("summaryPages"),
  summarySections: document.getElementById("summarySections"),
  summaryAssets: document.getElementById("summaryAssets"),
  workspacePath: document.getElementById("workspacePath"),
  workspaceStatus: document.getElementById("workspaceStatus"),
  sourcePdfLink: document.getElementById("sourcePdfLink"),
  tocTree: document.getElementById("tocTree"),
  viewerMain: document.querySelector(".viewer-main"),
  contentTitle: document.getElementById("contentTitle"),
  contentMeta: document.getElementById("contentMeta"),
  contentNotice: document.getElementById("contentNotice"),
  sectionBody: document.getElementById("sectionBody"),
  pageGallery: document.getElementById("pageGallery"),
  pageInspector: document.getElementById("pageInspector"),
  pageMeta: document.getElementById("pageMeta"),
  queryForm: document.getElementById("queryForm"),
  keywordInput: document.getElementById("keywordInput"),
  typeSelect: document.getElementById("typeSelect"),
  resetQueryButton: document.getElementById("resetQueryButton"),
  themeToggleButton: document.getElementById("themeToggleButton"),
  toastTemplate: document.getElementById("toastTemplate"),
};

const renderUtils = window.pdfnavRenderUtils;

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function showToast(message, variant = "success") {
  const toast = els.toastTemplate.content.firstElementChild.cloneNode(true);
  toast.textContent = message;
  toast.classList.add(variant);
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  window.setTimeout(() => {
    toast.classList.remove("visible");
    window.setTimeout(() => toast.remove(), 220);
  }, 2600);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const payload = await response.json();
      if (payload?.error) {
        message = payload.error;
      }
    } catch {
      // Ignore JSON parse errors and fall back to status text.
    }
    throw new Error(message);
  }

  return response.json();
}

function clearElement(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function createTextElement(tagName, text, className) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  element.textContent = text;
  return element;
}

function renderMeta(meta) {
  state.meta = meta;
  els.documentTitle.textContent = meta.document.title || meta.document.sourceFilename;
  els.documentSubtitle.textContent = meta.document.sourceFilename;
  els.summaryPages.textContent = String(meta.summary.pageCount || 0);
  els.summarySections.textContent = String(meta.summary.sectionCount || 0);
  els.summaryAssets.textContent = String(meta.summary.assetCount || 0);
  els.workspacePath.textContent = meta.workspaceDir;
  els.workspaceStatus.textContent = `Stages: ${Object.entries(meta.manifest.stages)
    .map(([name, status]) => `${name}=${status}`)
    .join(" | ")}`;
  els.sourcePdfLink.href = meta.sourcePdfUrl;
}

function renderTocItems(items, container) {
  for (const item of items) {
    const group = document.createElement("div");
    group.className = "toc-group";

    const button = document.createElement("button");
    button.className = "toc-button";
    button.dataset.sectionId = item.sectionId;
    if (state.activeSectionId === item.sectionId) {
      button.classList.add("active");
    }
    const title = document.createElement("span");
    title.className = "toc-title";
    title.textContent = `${item.ordinal ? `${item.ordinal} ` : ""}${item.title}`;
    const meta = document.createElement("span");
    meta.className = "toc-meta";
    meta.textContent = `pp. ${item.pageStart}-${item.pageEnd}`;
    button.appendChild(title);
    button.appendChild(meta);
    button.addEventListener("click", () => {
      loadSection(item.sectionId).catch(reportError);
    });
    group.appendChild(button);

    if (Array.isArray(item.children) && item.children.length > 0) {
      const children = document.createElement("div");
      children.className = "toc-children";
      renderTocItems(item.children, children);
      group.appendChild(children);
    }

    container.appendChild(group);
  }
}

function renderToc() {
  clearElement(els.tocTree);
  if (!state.toc.length) {
    els.tocTree.appendChild(createTextElement("div", "No TOC available yet.", "empty-state"));
    return;
  }

  renderTocItems(state.toc, els.tocTree);
}

function createBadge(text) {
  const badge = document.createElement("span");
  badge.className = "pill";
  badge.textContent = text;
  return badge;
}

function createPageChip(pageIndex) {
  const button = document.createElement("button");
  button.className = "page-chip";
  button.type = "button";
  button.textContent = `Page ${pageIndex}`;
  button.addEventListener("click", () => {
    loadPage(pageIndex).catch(reportError);
  });
  return button;
}

function renderNode(node) {
  const card = document.createElement("article");
  card.className = "node-card";

  const head = document.createElement("div");
  head.className = "node-head";

  const badges = document.createElement("div");
  badges.className = "node-badges";
  badges.appendChild(createBadge(node.type));
  if (node.ordinal) {
    badges.appendChild(createBadge(node.ordinal));
  }
  head.appendChild(badges);
  head.appendChild(createPageChip(node.pageIndex));
  card.appendChild(head);

  if (node.title) {
    card.appendChild(createTextElement("h3", node.title, "node-title"));
  }

  const body = document.createElement("div");
  body.className = "node-body";
  body.innerHTML = renderUtils.buildNodeBodyHtml(node);
  card.appendChild(body);

  if (node.assetUrl) {
    const actions = document.createElement("div");
    actions.className = "node-actions";
    const imageLink = document.createElement("a");
    imageLink.className = "ghost-button link-button";
    imageLink.href = node.assetUrl;
    imageLink.target = "_blank";
    imageLink.rel = "noreferrer";
    imageLink.textContent = "Open asset";
    actions.appendChild(imageLink);
    card.appendChild(actions);
  }

  return card;
}

function renderNodes(nodes, title, metaText) {
  clearElement(els.sectionBody);
  els.contentTitle.textContent = title;
  els.contentMeta.textContent = metaText || "";
  els.contentNotice.textContent = "";

  if (!nodes.length) {
    els.sectionBody.appendChild(createTextElement("div", "No nodes available.", "empty-state"));
    return;
  }

  for (const node of nodes) {
    els.sectionBody.appendChild(renderNode(node));
  }

  renderUtils.typeset(els.sectionBody);
  renderUtils.bindZoomableImages(els.sectionBody);
}

function renderPageGallery(pages) {
  clearElement(els.pageGallery);
  if (!pages || pages.length === 0) {
    els.pageGallery.appendChild(createTextElement("div", "No pages available.", "empty-state"));
    return;
  }

  for (const page of pages) {
    const card = document.createElement("div");
    card.className = "page-card";
    if (state.activePage === page.pageIndex) {
      card.classList.add("active");
    }

    const button = document.createElement("button");
    button.type = "button";
    button.addEventListener("click", () => {
      loadPage(page.pageIndex).catch(reportError);
    });

    const image = document.createElement("img");
    image.className = "page-preview-image";
    image.loading = "lazy";
    image.src = page.renderUrl;
    image.alt = `Page ${page.pageIndex}`;
    image.dataset.caption = `Page ${page.pageIndex}`;
    button.appendChild(image);
    button.appendChild(createTextElement("span", `Page ${page.pageIndex}`, "page-caption"));

    card.appendChild(button);
    els.pageGallery.appendChild(card);
  }

  renderUtils.bindZoomableImages(els.pageGallery);
}

function renderPageInspector(payload) {
  state.activePage = payload.page.pageIndex;
  els.pageMeta.textContent = `${payload.page.width} x ${payload.page.height} px`;
  clearElement(els.pageInspector);

  const image = document.createElement("img");
  image.className = "page-preview-image";
  image.src = payload.page.renderUrl;
  image.alt = `Page ${payload.page.pageIndex}`;
  image.dataset.caption = `Page ${payload.page.pageIndex}`;
  els.pageInspector.appendChild(image);

  const blocks = document.createElement("div");
  blocks.className = "block-list";

  for (const block of payload.page.blocks) {
    const item = document.createElement("article");
    item.className = "block-item";
    const heading = document.createElement("div");
    heading.className = "node-head";
    const badges = document.createElement("div");
    badges.className = "node-badges";
    badges.appendChild(createBadge(block.type));
    badges.appendChild(createBadge(block.blockId));
    heading.appendChild(badges);
    heading.appendChild(createTextElement("span", block.bbox.join(", "), "node-meta"));
    item.appendChild(heading);

    if (block.type === "formula" && block.content) {
      const body = document.createElement("div");
      body.className = "node-body";
      body.innerHTML = renderUtils.buildBlockBodyHtml(block);
      item.appendChild(body);
    } else {
      const body = document.createElement("div");
      body.className = "node-body";
      body.innerHTML = renderUtils.buildBlockBodyHtml(block);
      item.appendChild(body);
    }
    blocks.appendChild(item);
  }

  els.pageInspector.appendChild(blocks);
  renderUtils.typeset(els.pageInspector);
  renderUtils.bindZoomableImages(els.pageInspector);

  renderToc();
}

async function loadSection(sectionId) {
  els.viewerMain?.classList.add("section-transitioning");
  if (state.activeSectionId) {
    await wait(100);
  }

  try {
    const payload = await fetchJson(`/api/viewer/section?section=${encodeURIComponent(sectionId)}`);
    state.activeSectionId = payload.section.sectionId;
    state.queryMode = false;
    renderToc();
    renderNodes(
      payload.nodes,
      `${payload.section.ordinal ? `${payload.section.ordinal} ` : ""}${payload.section.title}`,
      `Level ${payload.section.level} | Pages ${payload.section.pageRange[0]}-${payload.section.pageRange[1]} | ${payload.nodes.length} nodes`,
    );
    renderPageGallery(payload.pages);

    const firstPage = payload.pages[0]?.pageIndex;
    if (firstPage) {
      await loadPage(firstPage);
    } else {
      clearElement(els.pageInspector);
      els.pageInspector.appendChild(createTextElement("div", "No page previews for this section.", "empty-state"));
    }
  } finally {
    requestAnimationFrame(() => {
      els.viewerMain?.classList.remove("section-transitioning");
    });
  }
}

async function loadPage(pageIndex) {
  const payload = await fetchJson(`/api/viewer/page?page=${encodeURIComponent(pageIndex)}`);
  renderPageInspector(payload);
}

async function runQuery(event) {
  event.preventDefault();

  const keyword = els.keywordInput.value.trim();
  const type = els.typeSelect.value;
  if (!keyword && !type) {
    if (state.activeSectionId) {
      await loadSection(state.activeSectionId);
      return;
    }

    showToast("Enter a keyword or choose a node type.", "error");
    return;
  }

  const params = new URLSearchParams();
  if (keyword) params.set("keyword", keyword);
  if (type) params.set("type", type);
  if (state.activeSectionId) params.set("section", state.activeSectionId);
  params.set("limit", "50");

  const payload = await fetchJson(`/api/viewer/query?${params.toString()}`);
  state.queryMode = true;
  renderNodes(
    payload.matches.map((match) => match.node),
    "Query results",
    `${payload.matches.length} matches${state.activeSectionId ? ` in ${state.activeSectionId}` : ""}`,
  );
}

async function resetQuery() {
  els.keywordInput.value = "";
  els.typeSelect.value = "";
  if (state.activeSectionId) {
    await loadSection(state.activeSectionId);
  }
}

function reportError(error) {
  console.error(error);
  showToast(error instanceof Error ? error.message : String(error), "error");
}

async function bootstrap() {
  try {
    renderUtils.initThemeToggle(els.themeToggleButton, {
      dark: "Dark Mode",
      light: "Light Mode",
    });

    const [metaPayload, tocPayload, sectionsPayload] = await Promise.all([
      fetchJson("/api/viewer/meta"),
      fetchJson("/api/viewer/toc"),
      fetchJson("/api/viewer/sections"),
    ]);

    renderMeta(metaPayload);
    state.toc = tocPayload.toc || [];
    state.sections = sectionsPayload.sections || [];
    renderToc();

    const targetSection =
      new URLSearchParams(window.location.search).get("section") || metaPayload.defaultSectionId;

    if (targetSection) {
      await loadSection(targetSection);
    } else {
      els.contentTitle.textContent = "No sections";
      els.contentNotice.textContent = "Build structure first so the viewer can navigate sections.";
    }
  } catch (error) {
    reportError(error);
    els.contentTitle.textContent = "Viewer error";
    els.contentNotice.textContent = error instanceof Error ? error.message : String(error);
  }
}

els.queryForm.addEventListener("submit", (event) => {
  runQuery(event).catch(reportError);
});
els.resetQueryButton.addEventListener("click", () => {
  resetQuery().catch(reportError);
});

bootstrap();
