---
name: "pdf"
description: "Use when tasks involve parsing, reading, viewing, inspecting, or structurally extracting PDF documents. Prefer the local `pdfnav` CLI to render pages, run GLM-OCR, normalize page JSON, extract images, build TOC/sections/nodes, host a local Web UI, and query document content."
---

# PDF Skill

## When to use

- Read a PDF paper, book, report, or scan.
- Parse a PDF into structured artifacts for downstream agent use.
- Inspect page structure, TOC, sections, figures, formulas, or tables.
- Extract images from a PDF and keep them linked to structured JSON.
- Open a parsed PDF in a local Web UI or GitBook-style reading page.

## Default approach

- Prefer the local `pdfnav` CLI over ad hoc Python or shell parsing.
- Treat `pdfnav` as the primary workflow for PDF reading and structural extraction.
- The OCR core is Zhipu BigModel `GLM-OCR`.
- Prefer the image-based OCR path already implemented by `pdfnav`; do not send whole-PDF base64 to GLM-OCR manually unless debugging the OCR service itself.
- For reading tasks, prefer `view` plus `/book` when the user benefits from a browsable local site.
- For factual extraction, prefer `nodes/*.jsonl` and `pages/page-xxxx.json` over trusting inferred section structure blindly.

## Prerequisites

- Work from the repository that contains `pdfnav`, or ensure `pdfnav` is installed and on `PATH`.
- If `pdfnav` is not available globally, use:

```bash
npx tsx src/cli/index.ts --help
```

- `GLM-OCR` requires a BigModel API key. Configure it with either:

```bash
pdfnav config web --port 3210
```

or

```bash
pdfnav config set-api-key <API_KEY>
```

## Primary workflow

1. Initialize the workspace:

```bash
pdfnav init <pdf> --out <output_root>
```

2. Render pages:

```bash
pdfnav render-pages <workspace> --pages 1-<N>
```

3. Run OCR on rendered page images:

```bash
pdfnav parse-pages <workspace> --pages 1-<N> --timeout-sec 60
```

4. Normalize OCR results into page JSON:

```bash
pdfnav normalize-pages <workspace> --batch <workspace>/raw/ocr/batch-0001-<NNNN>.json --pages 1-<N>
```

5. Extract figure images:

```bash
pdfnav extract-images <workspace> --pages 1-<N>
```

6. Build logical structure:

```bash
pdfnav build-structure <workspace>
```

7. Host the local viewer when needed:

```bash
pdfnav view <workspace> --host 127.0.0.1 --port 3211
```

Routes:

- `/viewer`
- `/book`
- `/config`

## Reading and inspection commands

Inspect TOC:

```bash
pdfnav inspect-toc <workspace>
```

Inspect one section:

```bash
pdfnav inspect-section <workspace> --section <section-id-or-title>
```

Inspect one page:

```bash
pdfnav inspect-page <workspace> --page <page-number>
```

Query nodes:

```bash
pdfnav query <workspace> --section <value> --keyword <term>
pdfnav query <workspace> --type figure --limit 10
pdfnav query <workspace> --type formula --limit 20
pdfnav query <workspace> --type table --limit 20
```

## Output model

The workspace contains:

- `document.json`
- `manifest.json`
- `pages/page-xxxx.json`
- `assets/images/`
- `assets/assets.json`
- `toc.json`
- `sections.json`
- `nodes/*.jsonl`

## Practical guidance

- If the user wants “read this PDF”, run the full pipeline first, then answer from `nodes/*.jsonl` and `pages/*.json`.
- If the user wants “show the structure”, use `inspect-toc`, `inspect-section`, and `inspect-page`.
- If the user wants “extract all figures”, run `extract-images` and summarize `assets/assets.json`.
- If the user wants “browse the parsed PDF locally”, run `pdfnav view` and provide the `/book` or `/viewer` URL.
- If the document is a math-heavy textbook, expect section inference to be noisier than for papers; confirm against `pages/*.json` and `nodes/*.jsonl`.

## Failure handling

- If `parse-pages` times out, retry with a smaller page range.
- If OCR succeeds but structure quality is weak, trust `pages/*.json` over `toc/sections`.
- If a section cannot be found by `inspect-section`, inspect `toc.json` first.
- If `view` appears to start but is unreachable, verify the port is free and that the process is still running in the foreground.
