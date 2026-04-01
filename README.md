# pdfnav

[![中文](https://img.shields.io/badge/README-%E4%B8%AD%E6%96%87-1f6feb)](README.md)
[![English](https://img.shields.io/badge/README-English-24292f)](README.en.md)

`pdfnav` 是一个面向 agent 的结构化 PDF 读取器。它基于智谱 BigModel 的 `GLM-OCR` 做逐页图像 OCR，把 PDF 转成适合程序和智能体消费的工作区产物，同时提供 CLI 和本地 Web UI。

## 如果你是 Agent

如果你是一个需要在本地环境中解析、阅读、检索 PDF 的 agent，可以直接按这份教程安装 `pdfnav` 和配套 skill：

- [Agent 安装与使用指南](docs/agent-installation.md)

这份教程会说明：

- 如何安装 `pdfnav`
- 如何配置基于智谱 BigModel `GLM-OCR` 的 API key
- 如何把仓库里的 `pdf` skill 安装到 `$CODEX_HOME/skills/pdf`
- 如何用 CLI 和本地 `/book`、`/viewer` 页面读取解析结果

它不是一个“直接问答 PDF”的黑盒，而是把文档拆成：
- 页级布局 `pages/page-xxxx.json`
- 章节结构 `toc.json` / `sections.json`
- 节点级内容 `nodes/*.jsonl`
- 图片资产 `assets/images/*`

然后再让 agent 或前端从这些产物中读取、检索和展示。

## 核心特性

- 基于智谱 BigModel `GLM-OCR` 的逐页图片 OCR 流程
- PDF 渲染、结构化解析、提图、目录构建一条链完成
- 本地 Web UI：
  - `/viewer` 结构查看器
  - `/book` GitBook 风格阅读页
  - `/config` API key 配置页
- 支持图片、表格、公式、caption、章节跳转
- 支持深色/浅色主题
- 支持 agent 通过 `inspect-*` 和 `query` 命令读取产物

## 工作原理

`pdfnav` 当前默认采用这条链路：

1. `render-pages`
   把 PDF 每页渲染成 PNG
2. `parse-pages`
   调用 `GLM-OCR` 对渲染页逐页识别
3. `normalize-pages`
   产出统一的页级 JSON
4. `extract-images`
   从页面图中裁出图片资产
5. `build-structure`
   构建 `toc / sections / nodes`
6. `view`
   本地起站点查看解析结果

这里明确说明一点：

- 本项目的 OCR 核心是智谱 BigModel `GLM-OCR`
- 默认是“逐页图片 -> GLM-OCR”的调用模式
- 不依赖整份 PDF base64 直传作为主路径

## 环境要求

- Node.js `>= 24`
- macOS / Linux
- 推荐安装：
  - `pdftoppm`
  - `pdfinfo`
- 有效的 BigModel / GLM-OCR API key

## 安装

仓库内开发使用：

```bash
npm install
npm run build
```

本地全局安装命令：

```bash
npm install -g .
```

安装后检查：

```bash
pdfnav --help
```

如果你只想在当前仓库下调试：

```bash
npm link
pdfnav --help
```

## 配置 GLM-OCR API key

命令行方式：

```bash
pdfnav config set-api-key <your-bigmodel-key>
pdfnav config get
```

本地配置页方式：

```bash
pdfnav config web --port 3210
```

然后打开：

```text
http://127.0.0.1:3210/config
```

默认配置文件路径：

```text
~/.config/pdf-reader-agent/config.json
```

## CLI 命令

初始化工作区：

```bash
pdfnav init ./paper.pdf --out ./output
```

渲染页面：

```bash
pdfnav render-pages ./output/doc-xxxx --pages 1-10
```

调用 GLM-OCR：

```bash
pdfnav parse-pages ./output/doc-xxxx --pages 1-10 --timeout-sec 60
```

规范化 OCR 结果：

```bash
pdfnav normalize-pages ./output/doc-xxxx \
  --batch ./output/doc-xxxx/raw/ocr/batch-0001-0010.json \
  --pages 1-10
```

提取图片：

```bash
pdfnav extract-images ./output/doc-xxxx --pages 1-10
```

构建目录、章节、节点：

```bash
pdfnav build-structure ./output/doc-xxxx
```

查看目录：

```bash
pdfnav inspect-toc ./output/doc-xxxx
```

查看章节：

```bash
pdfnav inspect-section ./output/doc-xxxx --section "2.5.2"
```

查看页面：

```bash
pdfnav inspect-page ./output/doc-xxxx --page 25
```

查询节点：

```bash
pdfnav query ./output/doc-xxxx --keyword 贝叶斯
pdfnav query ./output/doc-xxxx --type figure --limit 10
pdfnav query ./output/doc-xxxx --type formula --limit 10
pdfnav query ./output/doc-xxxx --type table --limit 10
```

本地起站点：

```bash
pdfnav view ./output/doc-xxxx --host 127.0.0.1 --port 3211
```

## 推荐工作流

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

启动：

```bash
pdfnav view ./output/doc-xxxx --host 127.0.0.1 --port 3211
```

访问：

- `http://127.0.0.1:3211/viewer`
- `http://127.0.0.1:3211/book`
- `http://127.0.0.1:3211/config`

### `/viewer`

适合：
- 检查 TOC / sections / pages / assets
- 看页内 bbox
- 调试提图和 OCR 结构

### `/book`

适合：
- 按章节连续阅读
- 看图片、表格、公式、caption
- 在长文档里做章节跳转

### `/config`

适合：
- 修改 BigModel API key
- 修改 BigModel base URL

## 产物目录结构

典型输出：

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

这些文件的职责：

- `document.json`
  文档元信息
- `manifest.json`
  工作区索引和阶段状态
- `pages/page-xxxx.json`
  页级布局和块
- `nodes/*.jsonl`
  章节内节点流
- `toc.json`
  TOC 树
- `sections.json`
  章节索引
- `assets/assets.json`
  图片资产索引

## 论文与书籍

当前结构构建器会尝试区分：

- `paper`
- `book`
- `mixed`

论文和书籍会走不同的 heading / section 推断策略。  
对数学教材这类文档，正文中的编号步骤和情况分类会尽量降级成节点，而不是直接进 TOC。

## 测试

类型检查：

```bash
npm run check
```

构建：

```bash
npm run build
```

测试：

```bash
npm test
```

覆盖范围包括：

- `init -> render-pages -> normalize-pages -> extract-images -> build-structure`
- `parse-pages` 的 mock 调用链路
- `view` 本地站点 API 和静态资源
- 双栏论文 section 排序
- 书籍型数学文档的 heading 降级

## 仓库内 skill

仓库内自带一个可分发的 Codex skill：

- [skills/pdfnav-pdf/SKILL.md](skills/pdfnav-pdf/SKILL.md)

相关文档：

- [docs/skill-build-guide.md](docs/skill-build-guide.md)
- [docs/agent-installation.md](docs/agent-installation.md)
- [docs/implementation-plan.md](docs/implementation-plan.md)

安装 skill 的辅助脚本：

- [scripts/install-pdfnav-skill.sh](scripts/install-pdfnav-skill.sh)

## 发布说明

发布到 GitHub 前，建议不要提交：

- `node_modules/`
- `dist/`
- 本地 sample PDF
- OCR 原始缓存
- 临时工作区输出
- 本地配置文件

仓库中的 `GLM-OCR` 配置仅保留接口结构，不包含真实 API key。
