export interface RenderPageInput {
  filePath: string;
  pageNumber: number;
  outputPath: string;
  dpi: number;
}

export interface RenderPageResult {
  pageNumber: number;
  outputPath: string;
  width: number | null;
  height: number | null;
}

export interface PdfRenderer {
  renderPage(input: RenderPageInput): Promise<RenderPageResult>;
  getPageCount(filePath: string): Promise<number>;
}

