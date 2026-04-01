import assert from "node:assert/strict";
import { test } from "node:test";

import { DeterministicStructureBuilder } from "../src/infrastructure/adapters/section/deterministic-structure-builder";
import type { PageLayout } from "../src/domain/models/page";

test("deterministic structure builder recognizes roman, alpha, and references headings", () => {
  const pages: PageLayout[] = [
    {
      pageIndex: 1,
      width: 1000,
      height: 1400,
      renderAssetId: null,
      blocks: [
        {
          blockId: "p1-b1",
          type: "text",
          bbox: [100, 100, 400, 140],
          bboxNorm: [0.1, 0.1, 0.4, 0.14],
          content: "## I. INTRODUCTION",
          readingOrder: 1,
        },
        {
          blockId: "p1-b2",
          type: "text",
          bbox: [100, 170, 850, 260],
          bboxNorm: [0.1, 0.17, 0.85, 0.26],
          content: "Intro paragraph",
          readingOrder: 2,
        },
        {
          blockId: "p1-b3",
          type: "text",
          bbox: [100, 320, 420, 350],
          bboxNorm: [0.1, 0.32, 0.42, 0.35],
          content: "A. Setup",
          readingOrder: 3,
        },
      ],
    },
    {
      pageIndex: 2,
      width: 1000,
      height: 1400,
      renderAssetId: null,
      blocks: [
        {
          blockId: "p2-b1",
          type: "text",
          bbox: [100, 120, 390, 150],
          bboxNorm: [0.1, 0.12, 0.39, 0.15],
          content: "## II. METHODS",
          readingOrder: 1,
        },
        {
          blockId: "p2-b2",
          type: "text",
          bbox: [100, 180, 880, 260],
          bboxNorm: [0.1, 0.18, 0.88, 0.26],
          content: "5) Visual Comparison",
          readingOrder: 2,
        },
      ],
    },
    {
      pageIndex: 3,
      width: 1000,
      height: 1400,
      renderAssetId: null,
      blocks: [
        {
          blockId: "p3-b1",
          type: "text",
          bbox: [100, 120, 390, 150],
          bboxNorm: [0.1, 0.12, 0.39, 0.15],
          content: "## REFERENCES",
          readingOrder: 1,
        },
      ],
    },
  ];

  const result = new DeterministicStructureBuilder().build(pages);
  const topLevel = result.sections.filter((section) => section.level === 1);
  const titles = topLevel.map((section) => section.title);

  assert.deepEqual(titles, ["Front Matter", "Introduction", "Methods", "References"]);
  assert.equal(result.sections.some((section) => section.title === "Setup" && section.level === 2), true);
  assert.equal(
    result.sections.some(
      (section) => section.title === "Visual Comparison" && section.level === 2 && section.parentId,
    ),
    true,
  );
});

test("deterministic structure builder reorders two-column pages before assigning section parents", () => {
  const pages: PageLayout[] = [
    {
      pageIndex: 2,
      width: 1360,
      height: 1760,
      renderAssetId: null,
      blocks: [
        {
          blockId: "p2-b1",
          type: "text",
          bbox: [101, 120, 330, 145],
          bboxNorm: [0.07, 0.07, 0.24, 0.08],
          content: "## II. RELATED WORK",
          readingOrder: 1,
        },
        {
          blockId: "p2-b2",
          type: "text",
          bbox: [101, 170, 671, 360],
          bboxNorm: [0.07, 0.1, 0.49, 0.2],
          content: "Related work opening paragraph.",
          readingOrder: 2,
        },
      ],
    },
    {
      pageIndex: 3,
      width: 1360,
      height: 1760,
      renderAssetId: null,
      blocks: [
        {
          blockId: "p3-b1",
          type: "text",
          bbox: [101, 120, 671, 420],
          bboxNorm: [0.07, 0.07, 0.49, 0.24],
          content: "Left-column continuation of related work.",
          readingOrder: 1,
        },
        {
          blockId: "p3-b2",
          type: "text",
          bbox: [685, 120, 1257, 520],
          bboxNorm: [0.50, 0.07, 0.92, 0.3],
          content: "Right-column continuation of related work.",
          readingOrder: 2,
        },
        {
          blockId: "p3-b3",
          type: "text",
          bbox: [898, 1087, 1048, 1111],
          bboxNorm: [0.66, 0.61, 0.77, 0.63],
          content: "## III. METHODS",
          readingOrder: 3,
        },
        {
          blockId: "p3-b4",
          type: "text",
          bbox: [686, 1120, 1256, 1335],
          bboxNorm: [0.50, 0.63, 0.92, 0.76],
          content: "Methods opening paragraph.",
          readingOrder: 4,
        },
        {
          blockId: "p3-b5",
          type: "text",
          bbox: [104, 1161, 330, 1186],
          bboxNorm: [0.07, 0.66, 0.24, 0.67],
          content: "## B. Power Line Tracking",
          readingOrder: 5,
        },
        {
          blockId: "p3-b6",
          type: "text",
          bbox: [101, 1190, 671, 1534],
          bboxNorm: [0.07, 0.67, 0.49, 0.87],
          content: "Tracking subsection paragraph.",
          readingOrder: 6,
        },
        {
          blockId: "p3-b7",
          type: "text",
          bbox: [101, 1534, 672, 1669],
          bboxNorm: [0.07, 0.87, 0.49, 0.95],
          content: "Trailing left-column paragraph still belonging to tracking.",
          readingOrder: 7,
        },
        {
          blockId: "p3-b8",
          type: "text",
          bbox: [687, 1369, 999, 1394],
          bboxNorm: [0.50, 0.78, 0.73, 0.79],
          content: "## A. Power Line Detection Method",
          readingOrder: 8,
        },
        {
          blockId: "p3-b9",
          type: "text",
          bbox: [685, 1402, 1256, 1670],
          bboxNorm: [0.50, 0.80, 0.92, 0.95],
          content: "Detection subsection paragraph.",
          readingOrder: 9,
        },
      ],
    },
  ];

  const result = new DeterministicStructureBuilder().build(pages);
  const byTitle = new Map(result.sections.map((section) => [section.title, section] as const));

  assert.equal(byTitle.get("Power Line Tracking")?.parentId, byTitle.get("Related Work")?.sectionId);
  assert.equal(byTitle.get("Methods")?.parentId, null);
  assert.equal(byTitle.get("Power Line Detection Method")?.parentId, byTitle.get("Methods")?.sectionId);

  const trackingNodes = result.nodesBySection.get(byTitle.get("Power Line Tracking")!.sectionId) ?? [];
  const methodsNodes = result.nodesBySection.get(byTitle.get("Methods")!.sectionId) ?? [];

  assert.equal(trackingNodes.some((node) => node.text?.includes("Tracking subsection paragraph")), true);
  assert.equal(
    trackingNodes.some((node) => node.text?.includes("Trailing left-column paragraph still belonging to tracking")),
    true,
  );
  assert.equal(methodsNodes.some((node) => node.text?.includes("Methods opening paragraph")), true);
});

test("deterministic structure builder downgrades textbook math-heavy numbered steps to inline headings", () => {
  const pages: PageLayout[] = [
    {
      pageIndex: 1,
      width: 1200,
      height: 1700,
      renderAssetId: null,
      blocks: [
        {
          blockId: "p1-b1",
          type: "text",
          bbox: [120, 80, 900, 150],
          bboxNorm: [0.1, 0.05, 0.75, 0.09],
          content: "## PATTERN RECOGNITION",
          readingOrder: 1,
        },
      ],
    },
    {
      pageIndex: 48,
      width: 1200,
      height: 1700,
      renderAssetId: null,
      blocks: [
        {
          blockId: "p48-b1",
          type: "text",
          bbox: [120, 100, 980, 150],
          bboxNorm: [0.1, 0.06, 0.82, 0.09],
          content: "## 第一种情况： $ \\varSigma_{i}=\\sigma^{2} I,i=1,2,\\cdots,c $",
          readingOrder: 1,
        },
        {
          blockId: "p48-b2",
          type: "text",
          bbox: [120, 220, 1040, 320],
          bboxNorm: [0.1, 0.13, 0.86, 0.19],
          content: "本节正文。",
          readingOrder: 2,
        },
      ],
    },
    {
      pageIndex: 87,
      width: 1200,
      height: 1700,
      renderAssetId: null,
      blocks: [
        {
          blockId: "p87-b1",
          type: "text",
          bbox: [120, 140, 1120, 220],
          bboxNorm: [0.1, 0.08, 0.93, 0.13],
          content: "## 1. 定义初值： $ v_{1}(j) = e_{j}(o_{1})\\pi_{j}, p a_{1}(j) = 0,j = 1,2,\\dots,n $",
          readingOrder: 1,
        },
        {
          blockId: "p87-b2",
          type: "text",
          bbox: [120, 260, 1120, 360],
          bboxNorm: [0.1, 0.15, 0.93, 0.21],
          content: "算法正文段落。",
          readingOrder: 2,
        },
      ],
    },
  ];

  const result = new DeterministicStructureBuilder().build(pages);

  assert.equal(result.sections.some((section) => /定义初值/.test(section.title)), false);
  assert.equal(result.sections.some((section) => /第一种情况/.test(section.title)), false);

  const allNodes = Array.from(result.nodesBySection.values()).flat();
  assert.equal(allNodes.some((node) => node.type === "heading" && /定义初值/.test(node.text || "")), true);
  assert.equal(allNodes.some((node) => node.type === "heading" && /第一种情况/.test(node.text || "")), true);

  const uniqueSectionIds = new Set(result.sections.map((section) => section.sectionId));
  assert.equal(uniqueSectionIds.size, result.sections.length);
});
