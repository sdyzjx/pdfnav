# PDF Reader for Agent 施工文档

## 1. 项目目标

本项目是一个基于 Node.js/TypeScript 的 PDF 结构化解析器与 CLI，目标不是直接做问答，而是把 PDF 转成适合 agent 消费的结构化文档包。

系统需要满足以下要求：

- 使用 GLM-OCR / BigModel 文档解析接口识别文档内容、公式、表格、图片区域
- 单独保存论文插图图片，并在结构化结果中保留引用
- 明确表达目录结构、章节结构、页面结构、正文内容
- 结果对 agent 友好，支持按目录快速定位章节，再按章节读取内容
- 支持 100+ 页 PDF，支持断点续跑和阶段性重建
- 保持模块解耦，允许替换 OCR、PDF 渲染、提图实现

当前阶段暂不建设 relation graph，不以知识图谱为目标。

## 2. 总体架构

采用以下组合架构：

- `Hexagonal Architecture`
- `Pipeline`
- `Strategy`
- `Artifact Store`
- `Command`
- `Chain of Responsibility`

核心原则：

- 领域模型稳定，供应商接口不直接泄漏到内部对象
- 所有处理阶段都能单独执行、缓存和重跑
- 所有中间产物可落盘并可追踪
- CLI 输出优先机器可读 JSON，便于 agent 串联调用
- 页面物理结构和文档逻辑结构分离

## 3. 模块拆分

### 3.1 分层目录

```text
src/
  domain/
    models/
    schemas/
    errors/
  application/
    ports/
    pipeline/
    services/
    use-cases/
  infrastructure/
    adapters/
      ocr/
      pdf/
      storage/
      section/
      logger/
  cli/
    commands/
    presenters/
  shared/
    types/
    utils/
```

### 3.2 模块职责

#### `src/domain`

只定义稳定的领域对象、schema 和领域错误。

包含：

- `Document`
- `TocItem`
- `Section`
- `Page`
- `Block`
- `ContentNode`
- `Asset`
- `Manifest`
- `StageStatus`

约束：

- 不依赖 BigModel SDK
- 不依赖文件系统
- 不依赖 CLI
- 不包含 HTTP 调用逻辑

#### `src/application`

负责业务编排和阶段流程。

包含：

- `ports`: 外部能力抽象接口
- `pipeline`: 阶段接口、运行器、阶段上下文
- `services`: 纯编排型服务
- `use-cases`: 面向 CLI 的用例入口

约束：

- 不直接 import 具体 OCR 或 PDF 实现
- 只依赖 domain 和 ports

#### `src/infrastructure`

负责具体适配器。

包含：

- `ocr/bigmodel-ocr-adapter`
- `pdf/pdf-renderer-adapter`
- `pdf/pdf-image-extractor-adapter`
- `storage/local-fs-artifact-store`
- `section/rule-based-toc-builder`
- `logger/pino-logger-adapter`

约束：

- 只在这里处理 HTTP、文件系统、第三方库

#### `src/cli`

负责参数解析、命令注册、输出呈现。

命令示例：

- `init`
- `parse-pages`
- `extract-images`
- `build-structure`
- `inspect-toc`
- `inspect-section`
- `inspect-page`
- `query`

#### `src/shared`

放跨层共用的类型和纯工具函数。

注意：

- 不在这里堆业务逻辑
- 只放通用且无领域语义歧义的工具

## 4. 核心设计模式

### 4.1 Pipeline

主流程按阶段执行：

```text
ingest
  -> render-pages
  -> ocr-pages
  -> normalize-pages
  -> extract-images
  -> build-toc
  -> build-sections
  -> build-content-nodes
  -> finalize
```

统一阶段接口：

```ts
interface PipelineStage<I, O> {
  name: string;
  run(input: I, ctx: StageContext): Promise<O>;
}
```

### 4.2 Strategy

以下能力都要允许替换：

- OCR 策略
- 图片提取策略
- TOC/章节识别策略
- content node 构建策略

### 4.3 Chain of Responsibility

用于兜底逻辑。

图片提取链建议：

1. 尝试从 PDF embedded image 提取
2. 依据 OCR bbox 与 PDF 图片对象做位置匹配
3. 匹配失败则从页面渲染图裁切
4. 再失败则记录 unresolved asset

### 4.4 Artifact Store

系统所有阶段统一通过 `ArtifactStore` 读写产物，不直接手写路径散落在业务代码里。

### 4.5 Command

CLI 每个命令一个独立 command，避免单个入口函数膨胀。

## 5. 文档包输出结构

针对 100+ 页 PDF，不使用单大 JSON。采用索引文件 + 分片文件。

```text
output/
  doc-<docId>/
    manifest.json
    document.json
    toc.json
    sections.json
    raw/
      ocr/
        batch-0001.json
    pages/
      page-0001.json
      page-0002.json
    nodes/
      section-sec-1.jsonl
      section-sec-2.jsonl
    assets/
      images/
      page_renders/
    logs/
```

说明：

- `manifest.json`: 入口文件，保存索引和阶段状态
- `document.json`: 文档级元信息
- `toc.json`: 目录树
- `sections.json`: 扁平 section 索引
- `pages/*.json`: 每页原子版面结果
- `nodes/*.jsonl`: 按章节拆分的内容节点
- `assets/images/`: 提取出的插图
- `assets/page_renders/`: 页面渲染图
- `raw/ocr/`: 缓存 BigModel 原始响应，便于调试与重建

## 6. 数据结构设计

### 6.1 `document.json`

```json
{
  "doc_id": "sha256:...",
  "source_pdf": "source.pdf",
  "title": "Example Paper",
  "num_pages": 12,
  "language": "en",
  "created_at": "2026-03-31T00:00:00Z",
  "version": "1.0.0"
}
```

### 6.2 `toc.json`

`toc` 是给 agent 看目录结构用的一级对象。

```json
[
  {
    "toc_id": "toc-2",
    "section_id": "sec-2",
    "ordinal": "2",
    "title": "Method",
    "level": 1,
    "page_start": 3,
    "page_end": 6,
    "children": [
      {
        "toc_id": "toc-2-1",
        "section_id": "sec-2-1",
        "ordinal": "2.1",
        "title": "Problem Formulation",
        "level": 2,
        "page_start": 3,
        "page_end": 4,
        "children": []
      }
    ]
  }
]
```

### 6.3 `sections.json`

`sections` 是程序检索章节和读取节点清单的索引层。

```json
[
  {
    "section_id": "sec-2-1",
    "ordinal": "2.1",
    "title": "Problem Formulation",
    "level": 2,
    "parent_id": "sec-2",
    "page_range": [3, 4],
    "node_file": "nodes/section-sec-2-1.jsonl"
  }
]
```

### 6.4 `pages/page-0001.json`

`pages` 表达页面物理结构和原子 block。

```json
{
  "page_index": 1,
  "width": 1654,
  "height": 2339,
  "render_asset_id": "page-render-1",
  "blocks": [
    {
      "block_id": "p1-b1",
      "type": "text",
      "bbox": [100, 120, 800, 220],
      "content": "1 Introduction",
      "reading_order": 1
    },
    {
      "block_id": "p1-b2",
      "type": "formula",
      "bbox": [210, 510, 1150, 690],
      "content": "E = mc^2",
      "reading_order": 4
    },
    {
      "block_id": "p1-b3",
      "type": "image",
      "bbox": [180, 760, 1200, 1450],
      "asset_id": "asset-img-001",
      "reading_order": 5
    }
  ]
}
```

块类型第一版固定为：

- `text`
- `formula`
- `image`
- `table`

这与 BigModel `layout_details.label` 对齐，避免过早设计额外标签体系。

### 6.5 `nodes/section-*.jsonl`

`content_nodes` 是 agent 的主读取对象。

第一版支持：

- `heading`
- `paragraph`
- `formula`
- `figure`
- `table`
- `caption`
- `reference_item`

示例：

```json
{
  "node_id": "node-104",
  "type": "paragraph",
  "section_id": "sec-2-1",
  "page_refs": [3],
  "block_refs": ["p3-b4", "p3-b5"],
  "order": 4,
  "text": "We define the objective ..."
}
```

```json
{
  "node_id": "node-122",
  "type": "figure",
  "section_id": "sec-2-1",
  "page_refs": [4],
  "block_refs": ["p4-b8", "p4-b9"],
  "order": 9,
  "caption": "Figure 2. Overall pipeline.",
  "asset_id": "asset-img-004"
}
```

### 6.6 `assets`

```json
{
  "asset_id": "asset-img-004",
  "kind": "figure_image",
  "page_index": 4,
  "path": "assets/images/p0004-fig-01.png",
  "source": "pdf_embedded"
}
```

### 6.7 `manifest.json`

`manifest` 是整个文档包的统一入口。

```json
{
  "doc_id": "sha256:...",
  "document_file": "document.json",
  "toc_file": "toc.json",
  "sections_file": "sections.json",
  "pages_dir": "pages",
  "nodes_dir": "nodes",
  "assets_dir": "assets",
  "stages": {
    "ingest": "done",
    "render_pages": "done",
    "ocr_pages": "done",
    "normalize_pages": "done",
    "extract_images": "done",
    "build_toc": "done",
    "build_sections": "done",
    "build_content_nodes": "done",
    "finalize": "done"
  }
}
```

## 7. 核心端口设计

### 7.1 OCR Provider

```ts
export interface OcrProvider {
  parsePdfPages(input: ParsePagesInput): Promise<RawOcrBatchResult>;
}
```

职责：

- 调用 BigModel 文档解析 API
- 管理分页批处理
- 返回原始解析结果

不负责：

- 直接写文件
- 构建 section
- 导出图片

### 7.2 PDF Renderer

```ts
export interface PdfRenderer {
  renderPage(input: RenderPageInput): Promise<RenderPageResult>;
}
```

职责：

- 把 PDF 页面渲染成 PNG
- 返回页面尺寸和输出路径

### 7.3 PDF Image Extractor

```ts
export interface PdfImageExtractor {
  extractPageImages(input: ExtractPageImagesInput): Promise<ExtractedImage[]>;
}
```

职责：

- 尝试从 PDF 内嵌图片对象直接提取图片
- 返回图片位置、尺寸和二进制内容

### 7.4 Artifact Store

```ts
export interface ArtifactStore {
  putJson(path: string, data: unknown): Promise<void>;
  readJson<T>(path: string): Promise<T>;
  putBuffer(path: string, data: Buffer): Promise<void>;
  exists(path: string): Promise<boolean>;
}
```

职责：

- 统一保存 JSON、图片和原始响应
- 隔离业务代码和真实路径布局

### 7.5 TOC Builder

```ts
export interface TocBuilder {
  build(input: TocBuildInput): Promise<TocItem[]>;
}
```

职责：

- 基于 PDF outline 和页内标题块生成 TOC
- 构建目录树

### 7.6 Content Node Builder

```ts
export interface ContentNodeBuilder {
  build(input: ContentNodeBuildInput): Promise<ContentNodeBuildResult>;
}
```

职责：

- 将 page blocks 合并为 paragraph、figure、formula 等可读对象
- 将节点按章节归档

## 8. 具体识别流程

### 8.1 `ingest`

输入：

- 源 PDF 路径

输出：

- `document.json`
- 初始 `manifest.json`

步骤：

1. 计算 PDF hash 作为 `doc_id`
2. 建立输出目录
3. 提取总页数、基础 metadata、outline
4. 写入文档级元数据

### 8.2 `render-pages`

输入：

- PDF 文件
- 页范围

输出：

- `assets/page_renders/*.png`
- 页面尺寸清单

步骤：

1. 逐页渲染 PNG
2. 记录宽高
3. 更新 manifest 阶段状态

### 8.3 `ocr-pages`

输入：

- 页范围
- OCR 配置

输出：

- `raw/ocr/batch-*.json`

步骤：

1. 按页批处理调用 BigModel API
2. 缓存原始响应
3. 记录 usage 和错误信息

建议：

- 每批 10 到 20 页
- 支持重试
- 支持 resume

### 8.4 `normalize-pages`

输入：

- OCR 原始响应

输出：

- `pages/page-*.json`

步骤：

1. 读取 `layout_details`
2. 统一生成 block id
3. 统一 bbox 坐标
4. 计算 reading order
5. 输出页级 JSON

### 8.5 `extract-images`

输入：

- `pages/page-*.json`
- 页面渲染图
- PDF 原始图片对象

输出：

- `assets/images/*.png`
- 更新 page block 中的 `asset_id`

执行顺序：

1. 尝试提取 PDF embedded images
2. 按 bbox 与 OCR image block 匹配
3. 失败则从页面渲染图裁切
4. 写入 asset 记录

### 8.6 `build-toc`

输入：

- PDF outline
- 标题类文本块

输出：

- `toc.json`

策略顺序：

1. 优先 PDF outline
2. 不足时用标题编号规则补齐
3. 最后按块样式和位置补充

### 8.7 `build-sections`

输入：

- `toc.json`
- `pages/*.json`

输出：

- `sections.json`

步骤：

1. 为每个 toc item 分配 `section_id`
2. 计算 `page_range`
3. 生成 `node_file` 映射

### 8.8 `build-content-nodes`

输入：

- `pages/*.json`
- `sections.json`

输出：

- `nodes/section-*.jsonl`

步骤：

1. 归并相邻 text block 为段落
2. 将独立公式块生成 `formula` node
3. 将图片块与相邻 caption 归并为 `figure` node
4. 将表格块生成 `table` node
5. 按章节写入 JSONL

### 8.9 `finalize`

输出：

- 更新 `manifest.json`
- 生成统计信息

## 9. CLI 设计

### 9.1 命令列表

```bash
pdf-reader init <pdf> --out <dir>
pdf-reader render-pages <dir> [--pages 1-20]
pdf-reader parse-pages <dir> [--pages 1-20]
pdf-reader normalize-pages <dir> [--pages 1-20]
pdf-reader extract-images <dir> [--pages 1-20]
pdf-reader build-structure <dir>
pdf-reader inspect-toc <dir>
pdf-reader inspect-section <dir> --section <sectionId>
pdf-reader inspect-page <dir> --page <pageNumber>
pdf-reader query <dir> [--section <title>] [--type <nodeType>] [--keyword <term>]
```

### 9.2 CLI 输出规范

默认输出机器可读 JSON：

```json
{
  "ok": true,
  "command": "build-structure",
  "doc_id": "sha256:...",
  "stats": {
    "pages": 168,
    "sections": 24,
    "nodes": 942,
    "figures": 81
  }
}
```

必要时加 `--pretty` 输出人类友好格式。

### 9.3 Agent 调用路径

标准消费流程：

1. 读取 `manifest.json`
2. 读取 `toc.json`
3. 选择目标章节
4. 读取 `sections.json`
5. 读取对应 `nodes/section-*.jsonl`
6. 必要时回查 `pages/page-*.json`
7. 必要时读取 `assets/images/*`

## 10. 实现顺序

### 阶段 1：工程骨架

- 初始化 `package.json`
- 初始化 TypeScript
- 建立 `src` 分层目录
- 定义基础 domain types
- 定义 ports
- 搭建 CLI 框架

### 阶段 2：基础产物链路

- 实现 `LocalFsArtifactStore`
- 实现 `init`
- 实现 `manifest` 读写
- 实现 `render-pages`

### 阶段 3：OCR 链路

- 实现 `BigModelOcrAdapter`
- 实现分页批处理
- 实现原始响应缓存
- 实现 `normalize-pages`

### 阶段 4：结构构建

- 实现 `build-toc`
- 实现 `build-sections`
- 实现 `build-content-nodes`

### 阶段 5：插图导出

- 实现 PDF 内嵌图提取
- 实现 bbox 匹配
- 实现页面裁图兜底

### 阶段 6：查询与检查

- 实现 `inspect-*`
- 实现 `query`
- 增加错误恢复和日志

## 11. 测试策略

### 11.1 单元测试

覆盖：

- schema 校验
- id 生成
- bbox 转换
- reading order 排序
- section/page 映射
- content node 合并规则

### 11.2 集成测试

覆盖：

- OCR 适配器 mock
- 输出目录结构
- manifest 更新
- CLI JSON 输出

### 11.3 样本测试集

至少准备 4 类 PDF：

- born-digital 学术论文
- 扫描版论文
- 有目录的长书籍
- 公式和图表密集型文档

## 12. 技术栈建议

- `TypeScript`
- `zod`
- `commander`
- `pino`
- `p-limit`
- `fs/promises`

PDF 处理建议：

- 优先采用 Node 方案
- 若页面渲染或原生提图质量不稳定，允许挂 `PyMuPDF` sidecar 适配器

这里不要求“全 Node”，要求的是“架构上可替换”。

## 13. 当前版本的明确边界

当前版本只解决：

- PDF 的结构化表达
- 目录导航
- 章节定位
- 正文、公式、图片、表格识别与导出
- 面向 agent 的结构化读取

当前版本不解决：

- 跨节点 relation graph
- 自动学术问答
- 向量检索服务
- 在线协同编辑

## 14. 第一版交付标准

满足以下条件即可视为第一版完成：

- 能处理 100+ 页 PDF
- 有清晰 TOC
- 能按章节读取内容节点
- 每页有稳定 block 结构
- 公式可独立读取
- 插图可单独导出
- 所有节点都能回溯到页和块
- 支持断点续跑
- CLI 可被 agent 稳定调用
