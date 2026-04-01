import type { ContentNode } from "../../../domain/models/content-node";
import type { PageBlock, PageLayout } from "../../../domain/models/page";
import type { Section, TocItem } from "../../../domain/models/section";

interface HeadingCandidate {
  block: PageBlock;
  pageIndex: number;
  ordinal: string | null;
  level: number;
  title: string;
  scheme: "references" | "chapter" | "roman" | "alpha" | "numbered" | "case" | "titlelike";
}

interface BlockPosition {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  centerX: number;
}

interface OpenSection {
  sectionId: string;
  tocId: string;
  ordinal: string | null;
  title: string;
  level: number;
  parentId: string | null;
  pageStart: number;
  pageEnd: number;
  nodeFile: string;
  headingBlockId: string | null;
  nodeCount: number;
}

export interface StructureBuildResult {
  toc: TocItem[];
  sections: Section[];
  nodesBySection: Map<string, ContentNode[]>;
}

type DocumentProfile = "paper" | "book" | "mixed";

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toTitleCase(value: string): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    return normalized;
  }

  if (!/^[A-Z0-9 ()\-/:&]+$/.test(normalized)) {
    return normalized;
  }

  return normalized
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function countWords(value: string): number {
  const text = normalizeText(value);
  if (!text) return 0;

  return text.split(" ").filter(Boolean).length;
}

function countMathSignals(value: string): number {
  const text = String(value || "");
  const patterns = [
    /\$/g,
    /\\[A-Za-z]+/g,
    /[_^]/g,
    /[{}]/g,
    /∑|Σ|μ|ω|π|σ|η|λ|≤|≥|≈|∞/g,
  ];

  return patterns.reduce((total, pattern) => total + (text.match(pattern)?.length ?? 0), 0);
}

function hasHeavyMath(value: string): boolean {
  return countMathSignals(value) >= 4;
}

function hasStepCue(value: string): boolean {
  const text = normalizeText(value);
  return /(定义初值|初始化|迭代求解|终止结果|路径回溯|重复以下过程|其中|即|步骤|算法|step|initialize|iterate|repeat|terminate)/i.test(
    text,
  );
}

function isCaseHeading(value: string): boolean {
  const text = normalizeText(value);
  return /^(第[一二三四五六七八九十百零两\d]+种情况|情况[一二三四五六七八九十百零两\d]+)\s*[:：]?/.test(text);
}

function isTitleLike(text: string): boolean {
  const words = normalizeText(text).split(" ").filter(Boolean);
  if (words.length === 0) return false;

  return words.every((word) => {
    if (/^[A-Z0-9][A-Z0-9-]*$/.test(word)) return true;
    return /^[A-Z][a-z0-9()\-]*$/.test(word);
  });
}

function stripMarkdownHeadingPrefix(text: string): string {
  return text.replace(/^#{1,6}\s+/, "");
}

function inferHeadingFromText(
  text: string,
  pageIndex: number,
): Omit<HeadingCandidate, "block" | "pageIndex"> | null {
  const normalized = normalizeText(stripMarkdownHeadingPrefix(text));
  if (!normalized || normalized.length > 140) {
    return null;
  }

  if (/^REFERENCES?$/i.test(normalized)) {
    return {
      ordinal: null,
      level: 1,
      title: "References",
      scheme: "references",
    };
  }

  const chapterMatch = normalized.match(/^(第[一二三四五六七八九十百零两\d]+章)\s*(.+)?$/);
  if (chapterMatch) {
    return {
      ordinal: chapterMatch[1],
      level: 1,
      title: normalizeText(chapterMatch[2] || chapterMatch[1]),
      scheme: "chapter",
    };
  }

  const romanMatch = normalized.match(/^([IVXLCM]+)\.\s+(.+)$/i);
  if (romanMatch) {
    return {
      ordinal: romanMatch[1].toUpperCase(),
      level: 1,
      title: toTitleCase(romanMatch[2]),
      scheme: "roman",
    };
  }

  const alphaMatch = normalized.match(/^([A-Z])\.\s+(.+)$/);
  if (alphaMatch) {
    return {
      ordinal: alphaMatch[1],
      level: 2,
      title: toTitleCase(alphaMatch[2]),
      scheme: "alpha",
    };
  }

  const numberedMatch = normalized.match(/^(\d+(?:\.\d+)*)(?:[.)]|\s+)(.+)$/);
  if (numberedMatch) {
    const ordinal = numberedMatch[1];
    const title = normalizeText(numberedMatch[2]);
    const wordCount = countWords(title);
    if (wordCount > 14 || /[.!?]$/.test(title)) {
      return null;
    }
    return {
      ordinal,
      level: ordinal.includes(".") ? ordinal.split(".").length : 2,
      title: toTitleCase(title),
      scheme: "numbered",
    };
  }

  if (isCaseHeading(normalized)) {
    return {
      ordinal: null,
      level: 3,
      title: normalized,
      scheme: "case",
    };
  }

  const words = countWords(normalized);
  const likelyHeading =
    words <= 8 &&
    !/[.!?]$/.test(normalized) &&
    isTitleLike(normalized) &&
    (pageIndex <= 3 || words <= 5);

  if (likelyHeading) {
    return {
      ordinal: null,
      level: 1,
      title: toTitleCase(normalized),
      scheme: "titlelike",
    };
  }

  return null;
}

function inferHeading(block: PageBlock, pageIndex: number): HeadingCandidate | null {
  if (block.type !== "text" || !block.content) {
    return null;
  }

  const text = normalizeText(block.content);
  if (text.length === 0 || text.length > 160) {
    return null;
  }

  const inferred = inferHeadingFromText(text, pageIndex);
  if (!inferred) {
    return null;
  }

  return {
    block,
    pageIndex,
    ordinal: inferred.ordinal,
    level: inferred.level,
    title: inferred.title,
    scheme: inferred.scheme,
  };
}

function makeSectionId(ordinal: string | null, pageIndex: number, sequence: number): string {
  if (ordinal) {
    return `sec-${ordinal.replace(/\./g, "-")}`;
  }

  return `sec-${pageIndex}-${sequence}`;
}

function makeCollisionSectionId(baseSectionId: string, blockId: string, pageIndex: number): string {
  const blockSuffix = blockId.replace(/^p\d+-/, "").replace(/[^a-zA-Z0-9-]/g, "-");
  return `${baseSectionId}-p${String(pageIndex).padStart(4, "0")}-${blockSuffix}`;
}

function makeNodeId(sectionId: string, pageIndex: number, order: number, type: string): string {
  return `${sectionId}--p${String(pageIndex).padStart(4, "0")}--${String(order).padStart(4, "0")}--${type}`;
}

function blockToNodeType(block: PageBlock): ContentNode["type"] {
  if (block.type === "text") return "paragraph";
  if (block.type === "image") return "figure";
  return block.type;
}

function createNode(
  sectionId: string,
  pageIndex: number,
  block: PageBlock,
  readingOrder: number,
  type: ContentNode["type"],
  ordinal: string | null,
  title: string | null,
): ContentNode {
  return {
    nodeId: makeNodeId(sectionId, pageIndex, readingOrder, type),
    type,
    sectionId,
    pageIndex,
    blockId: block.blockId,
    readingOrder,
    text: block.content ? normalizeText(block.content) : null,
    assetId: block.assetId ?? null,
    bbox: block.bbox,
    bboxNorm: block.bboxNorm,
    ordinal,
    title,
  };
}

function getBlockPosition(block: PageBlock): BlockPosition | null {
  if (!Array.isArray(block.bbox) || block.bbox.length !== 4) {
    return null;
  }

  const [left, top, right, bottom] = block.bbox;
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(1, right - left),
    centerX: left + (right - left) / 2,
  };
}

function sortByTopThenLeft(left: { block: PageBlock; pos: BlockPosition }, right: { block: PageBlock; pos: BlockPosition }): number {
  if (left.pos.top !== right.pos.top) {
    return left.pos.top - right.pos.top;
  }

  if (left.pos.left !== right.pos.left) {
    return left.pos.left - right.pos.left;
  }

  return left.block.readingOrder - right.block.readingOrder;
}

function classifyDocumentProfile(pages: PageLayout[]): DocumentProfile {
  let paperScore = 0;
  let bookScore = 0;
  let formulaBlocks = 0;
  let romanHeadings = 0;
  let numberedSteps = 0;
  let chapterLike = 0;
  let titleLike = 0;

  for (const page of pages.slice(0, Math.min(pages.length, 80))) {
    if (looksLikeTwoColumnPage(page)) {
      paperScore += 2;
    }

    for (const block of page.blocks) {
      if (block.type === "formula") {
        formulaBlocks += 1;
        continue;
      }

      if (block.type !== "text" || !block.content) {
        continue;
      }

      const normalized = normalizeText(stripMarkdownHeadingPrefix(block.content));
      if (!normalized) {
        continue;
      }

      if (/^(abstract|keywords?|references?)$/i.test(normalized)) {
        paperScore += 2;
      }

      if (/^[IVXLCM]+\.\s+/i.test(normalized)) {
        romanHeadings += 1;
      }

      if (/^(第[一二三四五六七八九十百零两\d]+章)/.test(normalized)) {
        chapterLike += 1;
      }

      if (/^\d+\.\d+/.test(normalized)) {
        chapterLike += 1;
      }

      if (/^\d+[.)]\s+/.test(normalized) && (hasStepCue(normalized) || hasHeavyMath(normalized))) {
        numberedSteps += 1;
      }

      if (/^[A-Z0-9 ()\-/:&]{12,}$/.test(normalized)) {
        titleLike += 1;
      }
    }
  }

  if (pages.length >= 80) {
    bookScore += 3;
  }

  if (formulaBlocks >= 30) {
    bookScore += 2;
  }

  if (numberedSteps >= 3) {
    bookScore += 3;
  }

  if (chapterLike >= 3) {
    bookScore += 2;
  }

  if (romanHeadings >= 2) {
    paperScore += 3;
  }

  if (titleLike >= 1 && pages.length <= 20) {
    paperScore += 1;
  }

  if (paperScore >= bookScore + 2) {
    return "paper";
  }

  if (bookScore >= paperScore + 2) {
    return "book";
  }

  return "mixed";
}

function getBlockTopRatio(block: PageBlock, page: PageLayout): number {
  if (!Array.isArray(block.bbox) || block.bbox.length !== 4 || page.height <= 0) {
    return 1;
  }

  return Math.max(0, Math.min(1, block.bbox[1] / page.height));
}

function shouldPromoteHeading(
  candidate: HeadingCandidate,
  page: PageLayout,
  profile: DocumentProfile,
): boolean {
  const text = normalizeText(candidate.block.content || "");
  const topRatio = getBlockTopRatio(candidate.block, page);
  const mathHeavy = hasHeavyMath(text);
  const hasColon = /[:：]/.test(text);
  const singleOrdinal = Boolean(candidate.ordinal && /^\d+$/.test(candidate.ordinal));

  switch (candidate.scheme) {
    case "references":
    case "chapter":
    case "roman":
      return true;
    case "alpha":
      return profile !== "book";
    case "numbered":
      if (candidate.ordinal?.includes(".")) {
        return !mathHeavy;
      }
      if (profile === "book") {
        return false;
      }
      if (mathHeavy || hasStepCue(text) || hasColon) {
        return false;
      }
      if (singleOrdinal) {
        return topRatio <= 0.3 || profile === "paper";
      }
      return true;
    case "case":
      return false;
    case "titlelike":
      if (profile === "book") {
        return false;
      }
      return topRatio <= 0.25 && !mathHeavy && countWords(text) <= 8;
    default:
      return false;
  }
}

function looksLikeCatalogPage(
  page: PageLayout,
  profile: DocumentProfile,
  candidates: HeadingCandidate[],
  promotedCandidates: HeadingCandidate[],
): boolean {
  if (profile !== "book") {
    return false;
  }

  const topLevelPromoted = promotedCandidates.filter((candidate) => candidate.level === 1);
  if (topLevelPromoted.length < 3) {
    return false;
  }

  const chapterLike = topLevelPromoted.filter(
    (candidate) => candidate.scheme === "chapter" || candidate.scheme === "numbered" || candidate.scheme === "titlelike",
  );

  if (chapterLike.length < 3) {
    return false;
  }

  const avgTopRatio =
    topLevelPromoted.reduce((sum, candidate) => sum + getBlockTopRatio(candidate.block, page), 0) /
    topLevelPromoted.length;

  return page.pageIndex <= 40 || avgTopRatio <= 0.55 || candidates.length >= 5;
}

function looksLikeTwoColumnPage(page: PageLayout): boolean {
  const positioned = page.blocks
    .map((block) => ({ block, pos: getBlockPosition(block) }))
    .filter((item): item is { block: PageBlock; pos: BlockPosition } => Boolean(item.pos));

  const narrowTextBlocks = positioned.filter((item) => {
    if (item.block.type !== "text") {
      return false;
    }

    return item.pos.width / page.width <= 0.48;
  });

  if (narrowTextBlocks.length < 4) {
    return false;
  }

  const leftBlocks = narrowTextBlocks.filter((item) => item.pos.centerX < page.width * 0.45);
  const rightBlocks = narrowTextBlocks.filter((item) => item.pos.centerX > page.width * 0.55);

  return leftBlocks.length >= 2 && rightBlocks.length >= 2;
}

function sortBlocksForStructure(page: PageLayout): PageBlock[] {
  const positioned = page.blocks
    .map((block) => ({ block, pos: getBlockPosition(block) }))
    .filter((item): item is { block: PageBlock; pos: BlockPosition } => Boolean(item.pos));

  if (!looksLikeTwoColumnPage(page)) {
    return [...page.blocks].sort((left, right) => left.readingOrder - right.readingOrder);
  }

  const fullWidthThreshold = page.width * 0.7;
  const leftColumn = positioned.filter((item) => item.pos.width < fullWidthThreshold && item.pos.centerX < page.width / 2);
  const rightColumn = positioned.filter((item) => item.pos.width < fullWidthThreshold && item.pos.centerX >= page.width / 2);
  const spanning = positioned.filter((item) => item.pos.width >= fullWidthThreshold);

  const columnBlocks = [...leftColumn, ...rightColumn];
  const minColumnTop = columnBlocks.length > 0 ? Math.min(...columnBlocks.map((item) => item.pos.top)) : 0;
  const maxColumnBottom = columnBlocks.length > 0 ? Math.max(...columnBlocks.map((item) => item.pos.bottom)) : page.height;
  const beforeColumns = spanning.filter((item) => item.pos.bottom <= minColumnTop + 24).sort(sortByTopThenLeft);
  const afterColumns = spanning.filter((item) => item.pos.top >= maxColumnBottom - 24).sort(sortByTopThenLeft);
  const middleSpanning = spanning
    .filter((item) => !beforeColumns.includes(item) && !afterColumns.includes(item))
    .sort(sortByTopThenLeft);

  return [
    ...beforeColumns.map((item) => item.block),
    ...leftColumn.sort(sortByTopThenLeft).map((item) => item.block),
    ...middleSpanning.map((item) => item.block),
    ...rightColumn.sort(sortByTopThenLeft).map((item) => item.block),
    ...afterColumns.map((item) => item.block),
  ];
}

function buildTocTree(sections: OpenSection[]): TocItem[] {
  const root: TocItem[] = [];
  const stack: { level: number; item: TocItem }[] = [];

  for (const section of sections) {
    const item: TocItem = {
      tocId: section.tocId,
      sectionId: section.sectionId,
      ordinal: section.ordinal,
      title: section.title,
      level: section.level,
      pageStart: section.pageStart,
      pageEnd: section.pageEnd,
      children: [],
    };

    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(item);
    } else {
      stack[stack.length - 1].item.children.push(item);
    }

    stack.push({ level: item.level, item });
  }

  return root;
}

function looksLikeCatalogListSection(section: OpenSection, sections: OpenSection[]): boolean {
  if (section.level !== 1 || section.parentId !== null) {
    return false;
  }

  if (!section.ordinal || !/^第[一二三四五六七八九十百零两\d]+章$/.test(section.ordinal)) {
    return false;
  }

  if (section.pageStart !== section.pageEnd || section.nodeCount > 3) {
    return false;
  }

  const hasChildren = sections.some((candidate) => candidate.parentId === section.sectionId);
  if (hasChildren) {
    return false;
  }

  if (section.title === section.ordinal) {
    return false;
  }

  return section.title.length >= 8 || /[，。：；,.]/.test(section.title);
}

function pruneCatalogSections(
  profile: DocumentProfile,
  sections: OpenSection[],
  nodesBySection: Map<string, ContentNode[]>,
): OpenSection[] {
  if (profile !== "book") {
    return sections;
  }

  const kept: OpenSection[] = [];

  for (const section of sections) {
    if (!looksLikeCatalogListSection(section, sections)) {
      kept.push(section);
      continue;
    }

    const destination =
      [...kept]
        .reverse()
        .find((candidate) => candidate.pageEnd === section.pageStart && candidate.level >= 2) ??
      kept[kept.length - 1] ??
      null;

    const orphanNodes = nodesBySection.get(section.sectionId) ?? [];
    if (destination) {
      const destinationNodes = nodesBySection.get(destination.sectionId) ?? [];
      destinationNodes.push(...orphanNodes.map((node) => ({ ...node, sectionId: destination.sectionId })));
      nodesBySection.set(destination.sectionId, destinationNodes);
      destination.nodeCount = destinationNodes.length;
      destination.pageEnd = Math.max(destination.pageEnd, section.pageEnd);
    }

    nodesBySection.delete(section.sectionId);
  }

  return kept;
}

export class DeterministicStructureBuilder {
  build(pages: PageLayout[]): StructureBuildResult {
    const profile = classifyDocumentProfile(pages);
    const sections: OpenSection[] = [];
    const nodesBySection = new Map<string, ContentNode[]>();
    const sectionById = new Map<string, OpenSection>();
    const headingStack: OpenSection[] = [];
    let frontMatter: OpenSection | null = null;
    let activeSection: OpenSection | null = null;
    let headingSequence = 0;

    const registerSection = (section: OpenSection): OpenSection => {
      sections.push(section);
      sectionById.set(section.sectionId, section);
      nodesBySection.set(section.sectionId, []);
      return section;
    };

    const touchSection = (section: OpenSection, pageIndex: number): void => {
      section.pageEnd = Math.max(section.pageEnd, pageIndex);
    };

    const touchHeadingStack = (pageIndex: number): void => {
      for (const section of headingStack) {
        touchSection(section, pageIndex);
      }
    };

    const getFrontMatter = (pageIndex: number): OpenSection => {
      if (frontMatter) {
        return frontMatter;
      }

      frontMatter = registerSection({
        sectionId: "sec-frontmatter",
        tocId: "toc-frontmatter",
        ordinal: null,
        title: "Front Matter",
        level: 1,
        parentId: null,
        pageStart: pageIndex,
        pageEnd: pageIndex,
        nodeFile: "nodes/section-frontmatter.jsonl",
        headingBlockId: null,
        nodeCount: 0,
      });
      activeSection = frontMatter;
      return frontMatter;
    };

    for (const page of pages) {
      const sortedBlocks = sortBlocksForStructure(page);
      const headingCandidatesByBlockId = new Map<string, HeadingCandidate>();
      const promotedByBlockId = new Map<string, boolean>();

      for (const block of sortedBlocks) {
        const candidate = inferHeading(block, page.pageIndex);
        if (!candidate) {
          continue;
        }

        headingCandidatesByBlockId.set(block.blockId, candidate);
        promotedByBlockId.set(block.blockId, shouldPromoteHeading(candidate, page, profile));
      }

      const allCandidates = [...headingCandidatesByBlockId.values()];
      const promotedCandidates = allCandidates.filter((candidate) => promotedByBlockId.get(candidate.block.blockId));
      const suppressPageSections = looksLikeCatalogPage(page, profile, allCandidates, promotedCandidates);

      for (const block of sortedBlocks) {
        const candidate = headingCandidatesByBlockId.get(block.blockId) ?? null;

        if (candidate) {
          const promoteToSection =
            !suppressPageSections && (promotedByBlockId.get(block.blockId) ?? false);
          const targetSection = activeSection ?? getFrontMatter(page.pageIndex);

          if (!promoteToSection) {
            const sectionNodes = nodesBySection.get(targetSection.sectionId);
            if (!sectionNodes) {
              throw new Error(`Missing node bucket for section ${targetSection.sectionId}`);
            }

            sectionNodes.push(
              createNode(
                targetSection.sectionId,
                page.pageIndex,
                block,
                sectionNodes.length + 1,
                "heading",
                targetSection.ordinal,
                targetSection.title,
              ),
            );
            targetSection.nodeCount += 1;
            if (targetSection.sectionId === "sec-frontmatter") {
              touchSection(targetSection, page.pageIndex);
            } else {
              touchHeadingStack(page.pageIndex);
            }
            continue;
          }

          while (
            headingStack.length > 0 &&
            headingStack[headingStack.length - 1].level >= candidate.level
          ) {
            headingStack.pop();
          }

          const parentId = headingStack.length > 0 ? headingStack[headingStack.length - 1].sectionId : null;
          const baseSectionId = makeSectionId(candidate.ordinal, candidate.pageIndex, ++headingSequence);
          const sectionId = sectionById.has(baseSectionId)
            ? makeCollisionSectionId(baseSectionId, candidate.block.blockId, candidate.pageIndex)
            : baseSectionId;
          const section = registerSection({
            sectionId,
            tocId: `toc-${sectionId}`,
            ordinal: candidate.ordinal,
            title: candidate.title,
            level: candidate.level,
            parentId,
            pageStart: candidate.pageIndex,
            pageEnd: candidate.pageIndex,
            nodeFile: `nodes/section-${sectionId}.jsonl`,
            headingBlockId: candidate.block.blockId,
            nodeCount: 0,
          });

          headingStack.push(section);
          activeSection = section;

          const sectionNodes = nodesBySection.get(section.sectionId);
          if (!sectionNodes) {
            throw new Error(`Missing node bucket for section ${section.sectionId}`);
          }

          sectionNodes.push(
            createNode(
              section.sectionId,
              page.pageIndex,
              block,
              sectionNodes.length + 1,
              "heading",
              section.ordinal,
              section.title,
            ),
          );
          section.nodeCount += 1;
          touchHeadingStack(page.pageIndex);
          continue;
        }

        const section = activeSection ?? getFrontMatter(page.pageIndex);
        const sectionNodes = nodesBySection.get(section.sectionId);
        if (!sectionNodes) {
          throw new Error(`Missing node bucket for section ${section.sectionId}`);
        }

        const node = createNode(
          section.sectionId,
          page.pageIndex,
          block,
          sectionNodes.length + 1,
          blockToNodeType(block),
          section.ordinal,
          section.title,
        );

        sectionNodes.push(node);
        section.nodeCount += 1;
        if (section.sectionId === "sec-frontmatter") {
          touchSection(section, page.pageIndex);
        } else {
          touchHeadingStack(page.pageIndex);
        }
      }
    }

    const finalSections = pruneCatalogSections(profile, sections, nodesBySection);

    if (finalSections.length === 0) {
      const fallback = registerSection({
        sectionId: "sec-document",
        tocId: "toc-document",
        ordinal: "1",
        title: "Document",
        level: 1,
        parentId: null,
        pageStart: pages[0]?.pageIndex ?? 1,
        pageEnd: pages[pages.length - 1]?.pageIndex ?? 1,
        nodeFile: "nodes/section-sec-document.jsonl",
        headingBlockId: null,
        nodeCount: 0,
      });

      return {
        toc: buildTocTree([fallback]),
        sections: [
          {
            sectionId: fallback.sectionId,
            tocId: fallback.tocId,
            ordinal: fallback.ordinal,
            title: fallback.title,
            level: fallback.level,
            parentId: fallback.parentId,
            pageRange: [fallback.pageStart, fallback.pageEnd],
            nodeFile: fallback.nodeFile,
            headingBlockId: fallback.headingBlockId,
            nodeCount: fallback.nodeCount,
          },
        ],
        nodesBySection,
      };
    }

    return {
      toc: buildTocTree(finalSections),
      sections: finalSections.map((section) => ({
        sectionId: section.sectionId,
        tocId: section.tocId,
        ordinal: section.ordinal,
        title: section.title,
        level: section.level,
        parentId: section.parentId,
        pageRange: [section.pageStart, section.pageEnd],
        nodeFile: section.nodeFile,
        headingBlockId: section.headingBlockId,
        nodeCount: section.nodeCount,
      })),
      nodesBySection,
    };
  }
}
