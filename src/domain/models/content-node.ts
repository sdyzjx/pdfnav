export type ContentNodeType = "heading" | "paragraph" | "formula" | "figure" | "table";

export interface ContentNode {
  nodeId: string;
  type: ContentNodeType;
  sectionId: string;
  pageIndex: number;
  blockId: string;
  readingOrder: number;
  text: string | null;
  assetId: string | null;
  bbox: [number, number, number, number] | null;
  bboxNorm: [number, number, number, number] | null;
  ordinal: string | null;
  title: string | null;
}

