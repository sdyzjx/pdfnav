export type BlockType = "text" | "formula" | "image" | "table";

export interface PageBlock {
  blockId: string;
  type: BlockType;
  bbox: [number, number, number, number];
  bboxNorm: [number, number, number, number];
  content: string | null;
  readingOrder: number;
  assetId?: string;
}

export interface PageLayout {
  pageIndex: number;
  width: number;
  height: number;
  renderAssetId: string | null;
  blocks: PageBlock[];
}

