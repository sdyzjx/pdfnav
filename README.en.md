# pdfnav

[![中文](https://img.shields.io/badge/README-%E4%B8%AD%E6%96%87-24292f)](README.md)
[![English](https://img.shields.io/badge/README-English-1f6feb)](README.en.md)

`pdfnav` is a structured PDF reader for agents. It uses Zhipu BigModel `GLM-OCR` for page-image OCR, turns PDFs into agent-readable workspace artifacts, and provides both a CLI and a local Web UI.

## If You Are an Agent

If you are an agent that needs to parse, read, inspect, or retrieve content from PDFs on a local machine, install `pdfnav` and its companion skill by following:

- [Agent Installation and Usage Guide](docs/agent-installation.en.md)
- [Agent 安装与使用指南](docs/agent-installation.md)

This guide explains:

- how to install `pdfnav`
- how to configure the Zhipu BigModel `GLM-OCR` API key
- how to install the bundled `pdf` skill into `$CODEX_HOME/skills/pdf`
- how to use the CLI and the local `/book` and `/viewer` pages

`pdfnav` is not a black-box “chat with PDF” tool. Instead, it decomposes a document into:

- page layout artifacts in `pages/page-xxxx.json`
- document structure in `toc.json` and `sections.json`
- node-level reading units in `nodes/*.jsonl`
- extracted image assets in `assets/images/*`

Agents or frontends can then inspect, query, and render from those artifacts.

## Core Features

- Page-image OCR powered by Zhipu BigModel `GLM-OCR`
- End-to-end pipeline for page rendering, OCR, normalization, image extraction, and structure building
- Local Web UI:
  - `/viewer` for structural inspection
  - `/book` for GitBook-style reading
  - `/config` for API key editing
- Support for images, tables, formulas, captions, and chapter navigation
- Dark and light themes
- Agent-friendly inspection via `inspect-*` and `query`

## How It Works

The default `pdfnav` pipeline is:

1. `render-pages`
   Render each PDF page into PNG
2. `parse-pages`
   Run `GLM-OCR` on rendered page images
3. `normalize-pages`
   Produce canonical page JSON
4. `extract-images`
   Crop image assets from rendered pages
5. `build-structure`
   Build `toc / sections / nodes`
6. `view`
   Start a local site to browse the parsed workspace

Important notes:

- The OCR core is Zhipu BigModel `GLM-OCR`
- The default path is `rendered page images -> GLM-OCR`
- Whole-PDF base64 upload is not the primary OCR path

## Requirements

- Node.js `>= 24`
- macOS / Linux
- Recommended tools:
  - `pdftoppm`
  - `pdfinfo`
- A valid BigModel / `GLM-OCR` API key

## Installation

For agents or a fresh local environment, the recommended entrypoint is the helper script:

```bash
bash scripts/install-agent.sh
pdfnav --help
```

The script will:

- install local dependencies
- run `npm link` so the `pdfnav` CLI is linked into the current npm global prefix
- install the bundled `pdf` skill into `${CODEX_HOME:-$HOME/.codex}/skills/pdf`

For development inside the repo:

```bash
npm install
npm run build
```

For a local global command:

```bash
npm install
npm install -g .
```

Note: on a freshly cloned checkout, `npm install -g .` usually fails if you run it before `npm install`, because the package has to build TypeScript sources first and `tsc` lives in local devDependencies. In a new environment, prefer `scripts/install-agent.sh`, or at least run `npm install` once before the global install.

Check installation:

```bash
pdfnav --help
```

If you only want to test inside the repository:

```bash
npm install
npm link
pdfnav --help
```

## Configure the GLM-OCR API Key

CLI:

```bash
pdfnav config set-api-key <your-bigmodel-key>
pdfnav config get
```

Web UI:

```bash
pdfnav config web --port 3210
```

Then open:

```text
http://127.0.0.1:3210/config
```

Default config path:

```text
~/.config/pdf-reader-agent/config.json
```

## CLI Commands

Initialize a workspace:

```bash
pdfnav init ./paper.pdf --out ./output
```

Render pages:

```bash
pdfnav render-pages ./output/doc-xxxx --pages 1-10
```

Call `GLM-OCR`:

```bash
pdfnav parse-pages ./output/doc-xxxx --pages 1-10 --timeout-sec 60
```

Normalize OCR output:

```bash
pdfnav normalize-pages ./output/doc-xxxx \
  --batch ./output/doc-xxxx/raw/ocr/batch-0001-0010.json \
  --pages 1-10
```

Extract images:

```bash
pdfnav extract-images ./output/doc-xxxx --pages 1-10
```

Build TOC, sections, and nodes:

```bash
pdfnav build-structure ./output/doc-xxxx
```

Inspect TOC:

```bash
pdfnav inspect-toc ./output/doc-xxxx
```

Inspect a section:

```bash
pdfnav inspect-section ./output/doc-xxxx --section "2.5.2"
```

Inspect a page:

```bash
pdfnav inspect-page ./output/doc-xxxx --page 25
```

Query nodes:

```bash
pdfnav query ./output/doc-xxxx --keyword bayes
pdfnav query ./output/doc-xxxx --type figure --limit 10
pdfnav query ./output/doc-xxxx --type formula --limit 10
pdfnav query ./output/doc-xxxx --type table --limit 10
```

Start the local site:

```bash
pdfnav view ./output/doc-xxxx --host 127.0.0.1 --port 3211
```

## Recommended Workflow

```bash
pdfnav init ./paper.pdf --out ./output
pdfnav render-pages ./output/doc-xxxx --pages 1-10
pdfnav parse-pages ./output/doc-xxxx --pages 1-10 --timeout-sec 60
pdfnav normalize-pages ./output/doc-xxxx --batch ./output/doc-xxxx/raw/ocr/batch-0001-0010.json --pages 1-10
pdfnav extract-images ./output/doc-xxxx --pages 1-10
pdfnav build-structure ./output/doc-xxxx
pdfnav view ./output/doc-xxxx --host 127.0.0.1 --port 3211
```

## Web UI

Start:

```bash
pdfnav view ./output/doc-xxxx --host 127.0.0.1 --port 3211
```

Open:

- `http://127.0.0.1:3211/viewer`
- `http://127.0.0.1:3211/book`
- `http://127.0.0.1:3211/config`

### `/viewer`

Best for:

- checking TOC / sections / pages / assets
- viewing page-level bbox overlays
- debugging OCR structure and extracted images

### `/book`

Best for:

- continuous chapter reading
- browsing images, tables, formulas, and captions
- chapter jumps in long documents

### `/config`

Best for:

- updating the BigModel API key
- changing the BigModel base URL

## Output Workspace Layout

Typical output:

```text
output/
  doc-<id>/
    manifest.json
    document.json
    toc.json
    sections.json
    raw/ocr/
    pages/
      page-0001.json
    nodes/
      section-sec-1-1.jsonl
    assets/
      assets.json
      images/
      page_renders/
```

What each file does:

- `document.json`
  document metadata
- `manifest.json`
  workspace index and stage status
- `pages/page-xxxx.json`
  page layout and raw blocks
- `nodes/*.jsonl`
  section-local reading nodes
- `toc.json`
  TOC tree
- `sections.json`
  section index
- `assets/assets.json`
  image asset index

## Papers and Books

The current structure builder tries to distinguish:

- `paper`
- `book`
- `mixed`

Papers and books use different heading and section inference strategies. For math-heavy textbooks, numbered procedural items and case splits are usually downgraded to nodes instead of promoted into the TOC.

## Tests

Type check:

```bash
npm run check
```

Build:

```bash
npm run build
```

Tests:

```bash
npm test
```

Covered areas include:

- `init -> render-pages -> normalize-pages -> extract-images -> build-structure`
- mocked `parse-pages` flow
- local `view` server APIs and static assets
- two-column paper section ordering
- heading demotion for textbook-style math documents

## Bundled Skill

This repository includes a distributable Codex skill:

- [skills/pdfnav-pdf/SKILL.md](skills/pdfnav-pdf/SKILL.md)

Related docs:

- [docs/skill-build-guide.md](docs/skill-build-guide.md)
- [docs/agent-installation.md](docs/agent-installation.md)
- [docs/agent-installation.en.md](docs/agent-installation.en.md)
- [docs/implementation-plan.md](docs/implementation-plan.md)

Helper install script:

- [scripts/install-pdfnav-skill.sh](scripts/install-pdfnav-skill.sh)

## Publishing Notes

Before publishing to GitHub, do not commit:

- `node_modules/`
- `dist/`
- local sample PDFs
- raw OCR caches
- temporary workspace outputs
- local config files

The repository keeps only the `GLM-OCR` integration structure and never includes a real API key.
