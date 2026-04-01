import fs from "node:fs/promises";
import path from "node:path";

import type { RawOcrBatchResult } from "../../src/application/ports/ocr-provider";

export async function createSamplePdf(filePath: string): Promise<void> {
  const pdf = `%PDF-1.1
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 59 >>
stream
BT
/F1 24 Tf
72 220 Td
(1 Introduction) Tj
0 -100 Td
(Page One) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
6 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 7 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
7 0 obj
<< /Length 78 >>
stream
BT
/F1 24 Tf
72 220 Td
(2 Method) Tj
0 -70 Td
(Method paragraph) Tj
0 -70 Td
(Figure 1) Tj
ET
endstream
endobj
xref
0 8
0000000000 65535 f 
0000000010 00000 n 
0000000063 00000 n 
0000000128 00000 n 
0000000254 00000 n 
0000000361 00000 n 
0000000431 00000 n 
0000000557 00000 n 
trailer
<< /Root 1 0 R /Size 8 >>
startxref
685
%%EOF
`;

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, pdf, "binary");
}

export function createSampleRawBatch(): RawOcrBatchResult {
  return {
    id: "task_demo",
    created: 1774940000,
    model: "GLM-OCR",
    md_results: "# 1 Introduction\nBody\n# 2 Method\nBody",
    layout_details: [
      [
        {
          index: 1,
          label: "text",
          bbox_2d: [0.1, 0.08, 0.7, 0.16],
          content: "1 Introduction",
          width: 600,
          height: 600,
        },
        {
          index: 2,
          label: "text",
          bbox_2d: [0.1, 0.25, 0.8, 0.33],
          content: "Intro paragraph",
          width: 600,
          height: 600,
        },
      ],
      [
        {
          index: 1,
          label: "text",
          bbox_2d: [0.1, 0.08, 0.55, 0.16],
          content: "2 Method",
          width: 600,
          height: 600,
        },
        {
          index: 2,
          label: "text",
          bbox_2d: [0.1, 0.25, 0.8, 0.33],
          content: "Method paragraph",
          width: 600,
          height: 600,
        },
        {
          index: 3,
          label: "image",
          bbox_2d: [0.15, 0.45, 0.75, 0.8],
          width: 600,
          height: 600,
        },
      ],
    ],
    data_info: {
      num_pages: 2,
      pages: [
        { width: 600, height: 600 },
        { width: 600, height: 600 },
      ],
    },
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    },
    request_id: "req_demo",
  };
}

