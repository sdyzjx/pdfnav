export type AssetKind = "page_render" | "figure_image";

export interface AssetRecord {
  assetId: string;
  kind: AssetKind;
  pageIndex: number;
  path: string;
  source: "page_render" | "page_crop";
  width: number | null;
  height: number | null;
}

