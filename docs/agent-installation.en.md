# Agent Installation and Usage Guide

This document is written for agents and agent maintainers. Its purpose is to help a fresh environment install `pdfnav` and enable the bundled skill.

## 1. Clone and install the repository

```bash
git clone <repo-url>
cd pdf-reader
npm install
npm run build
```

If you only want to use it inside the repository:

```bash
npm link
pdfnav --help
```

If you want a globally available command:

```bash
npm install -g .
pdfnav --help
```

## 2. Install system dependencies

Recommended tools:

- `pdftoppm`
- `pdfinfo`

These are used for page rendering and PDF metadata inspection.

## 3. Configure GLM-OCR

This project is built on Zhipu BigModel `GLM-OCR`.

Option 1:

```bash
pdfnav config set-api-key <YOUR_KEY>
```

Option 2:

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

## 4. Install the skill

If the target agent uses a local Codex skills directory, install the bundled skill into:

```text
$CODEX_HOME/skills/pdf
```

The simplest manual way:

```bash
mkdir -p "$CODEX_HOME/skills/pdf"
cp skills/pdfnav-pdf/SKILL.md "$CODEX_HOME/skills/pdf/SKILL.md"
```

If an older `pdf` skill already exists, this replaces it.

You can also use the helper script:

```bash
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
bash scripts/install-pdfnav-skill.sh
```

## 5. Recommended agent workflow

Parse a PDF:

```bash
pdfnav init ./paper.pdf --out ./output
pdfnav render-pages ./output/doc-xxxx --pages 1-10
pdfnav parse-pages ./output/doc-xxxx --pages 1-10 --timeout-sec 60
pdfnav normalize-pages ./output/doc-xxxx --batch ./output/doc-xxxx/raw/ocr/batch-0001-0010.json --pages 1-10
pdfnav extract-images ./output/doc-xxxx --pages 1-10
pdfnav build-structure ./output/doc-xxxx
```

Open the local site:

```bash
pdfnav view ./output/doc-xxxx --host 127.0.0.1 --port 3211
```

## 6. How an agent should read the outputs

Recommended priority:

1. `nodes/*.jsonl`
2. `pages/page-xxxx.json`
3. `toc.json`
4. `sections.json`
5. `assets/assets.json`

Practical meaning:

- Read `pages` when you need raw text plus coordinates
- Read `nodes` when you need section-aware, agent-friendly reading units
- Read `assets` when you need extracted figures
- Open `/book` or `/viewer` when browsing is more useful than raw JSON

## 7. Common issues

### OCR timeout

Retry with a smaller page range:

```bash
pdfnav parse-pages <workspace> --pages 1-1 --timeout-sec 90
```

### Weak section quality

For math-heavy textbooks or structurally noisy books, do not trust TOC alone. Cross-check:

- `pages/*.json`
- `nodes/*.jsonl`

### Images appear missing

Verify:

- whether `assets/assets.json` contains the image
- whether the matching `page-xxxx.json` image block has an `assetId`

## 8. Before sharing or publishing

Do not distribute these:

- real API keys
- local sample PDFs
- raw OCR caches
- temporary output workspaces
- browser debugging leftovers
