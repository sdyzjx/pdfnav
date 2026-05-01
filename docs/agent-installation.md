# Agent 安装与使用指南

这份文档是给 agent 或 agent 维护者看的，目标是让一个新环境可以安装 `pdfnav` 并启用配套 skill。

## 1. 安装仓库

```bash
git clone <repo-url>
cd pdfnav
bash scripts/install-agent.sh
```

如果你想手动安装：

```bash
npm install
npm link
pdfnav --help
```

如果要全局安装命令：

```bash
npm install
npm install -g .
pdfnav --help
```

注意：

- 仓库目录应为 `pdfnav`，不是 `pdf-reader`
- 在干净仓库里直接执行 `npm install -g .` 会因为缺少本地 `tsc` 而失败，所以要先 `npm install`，或者直接使用上面的安装脚本

## 2. 配置依赖

推荐确保系统里有：

- `pdftoppm`
- `pdfinfo`

它们用于页面渲染和 PDF 元信息读取。

## 3. 配置 GLM-OCR

本项目基于智谱 BigModel `GLM-OCR`。

配置方式一：

```bash
pdfnav config set-api-key <YOUR_KEY>
```

配置方式二：

```bash
pdfnav config web --port 3210
```

然后打开：

```text
http://127.0.0.1:3210/config
```

默认配置路径：

```text
~/.config/pdf-reader-agent/config.json
```

## 4. 安装 skill

如果目标 agent 使用本地 Codex skills 目录，可以把仓库中的 skill 安装到：

```text
$CODEX_HOME/skills/pdf
```

最简单的方式：

```bash
mkdir -p "$CODEX_HOME/skills/pdf"
cp skills/pdfnav-pdf/SKILL.md "$CODEX_HOME/skills/pdf/SKILL.md"
```

如果原来已经有旧的 `pdf` skill，这一步会完成替换。

也可以直接用仓库脚本：

```bash
bash scripts/install-pdfnav-skill.sh
```

## 5. agent 推荐工作流

解析 PDF：

```bash
pdfnav init ./paper.pdf --out ./output
pdfnav render-pages ./output/doc-xxxx --pages 1-10
pdfnav parse-pages ./output/doc-xxxx --pages 1-10 --timeout-sec 60
pdfnav normalize-pages ./output/doc-xxxx --batch ./output/doc-xxxx/raw/ocr/batch-0001-0010.json --pages 1-10
pdfnav extract-images ./output/doc-xxxx --pages 1-10
pdfnav build-structure ./output/doc-xxxx
```

本地查看：

```bash
pdfnav view ./output/doc-xxxx --host 127.0.0.1 --port 3211
```

## 6. agent 如何读取结果

优先级建议：

1. `nodes/*.jsonl`
2. `pages/page-xxxx.json`
3. `toc.json`
4. `sections.json`
5. `assets/assets.json`

其中：

- 想看完整页内文字和坐标：读 `pages`
- 想按章节和内容节点读：读 `nodes`
- 想看图片：读 `assets`
- 想浏览：开 `/book` 或 `/viewer`

## 7. 常见问题

### OCR 超时

缩小范围重试：

```bash
pdfnav parse-pages <workspace> --pages 1-1 --timeout-sec 90
```

### 章节结构不理想

对数学教材或结构复杂的书籍，不要只信 TOC。优先交叉验证：

- `pages/*.json`
- `nodes/*.jsonl`

### 图片看起来丢了

先确认：

- `assets/assets.json` 里是否存在图片
- 对应 `page-xxxx.json` 的 `image` block 是否带 `assetId`

## 8. 发布前注意事项

不要把这些内容一起分发：

- 真实 API key
- 本地 sample PDF
- OCR 原始缓存
- 临时输出工作区
- 浏览器调试缓存
