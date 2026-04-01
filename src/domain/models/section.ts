export interface TocItem {
  tocId: string;
  sectionId: string;
  ordinal: string | null;
  title: string;
  level: number;
  pageStart: number;
  pageEnd: number;
  children: TocItem[];
}

export interface Section {
  sectionId: string;
  tocId: string;
  ordinal: string | null;
  title: string;
  level: number;
  parentId: string | null;
  pageRange: [number, number];
  nodeFile: string;
  headingBlockId: string | null;
  nodeCount: number;
}

