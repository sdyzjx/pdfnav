export interface ParsePageImageInput {
  filePath: string;
  pageNumber: number;
  requestId?: string;
  timeoutMs?: number;
}

export interface RawOcrLayoutBlock {
  index: number;
  label: "image" | "text" | "formula" | "table";
  bbox_2d: [number, number, number, number];
  content?: string;
  width: number;
  height: number;
}

export interface RawOcrPageInfo {
  width: number;
  height: number;
}

export interface RawOcrBatchResult {
  id: string;
  created: number;
  model: string;
  md_results: string;
  layout_details: RawOcrLayoutBlock[][];
  layout_visualization?: string[];
  data_info: {
    num_pages: number;
    pages: RawOcrPageInfo[];
  };
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  };
  request_id?: string;
}

export interface OcrProvider {
  parsePageImage(input: ParsePageImageInput): Promise<RawOcrBatchResult>;
}
