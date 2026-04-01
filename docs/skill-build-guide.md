# pdfnav Skill 构建指南

这个仓库自带一个可分发的 Codex skill：

- `skills/pdfnav-pdf/SKILL.md`

它的目标是让 agent 在面对 PDF 解析、阅读、结构化抽取任务时，优先调用本仓库提供的 `pdfnav` CLI，而不是临时拼 Python 脚本或手写 OCR 流程。

## 设计原则

- skill 只描述使用时机、工作流和失败处理，不复制源码实现细节。
- skill 优先指向稳定接口：
  - `pdfnav init`
  - `pdfnav render-pages`
  - `pdfnav parse-pages`
  - `pdfnav normalize-pages`
  - `pdfnav extract-images`
  - `pdfnav build-structure`
  - `pdfnav view`
- skill 里明确说明本项目基于智谱 BigModel `GLM-OCR`，并且默认走“逐页图片 -> GLM-OCR”路径。
- skill 要告诉 agent：当 `toc/sections` 质量不稳时，优先相信 `pages/*.json` 和 `nodes/*.jsonl`。

## skill 文件结构

建议保持最小结构：

```text
skills/
  pdfnav-pdf/
    SKILL.md
```

## 建议写法

一个可维护的 `SKILL.md` 应至少包含：

1. `name` 和 `description`
2. 何时使用
3. 默认工作流
4. 前置条件
5. 输出结构说明
6. 常见失败处理
7. 验证命令

## 推荐内容骨架

```md
---
name: "pdf"
description: "Use when tasks involve parsing, reading, viewing, inspecting, or structurally extracting PDF documents. Prefer the local `pdfnav` CLI ..."
---

# PDF Skill

## When to use
...

## Default approach
...

## Primary workflow
...

## Failure handling
...
```

## 为什么不要把 skill 写成实现说明书

skill 的职责是：

- 帮 agent 选对工具
- 给出稳定命令顺序
- 指出优先级和 fallback

skill 不应该：

- 复制大量源码
- 记录一次性调试过程
- 写死本地私人路径
- 暴露真实 API key

## 如何更新 skill

当 `pdfnav` 新增功能时，优先更新以下几类内容：

- 新 CLI 命令
- 新 Web UI 页面
- 新的输出结构
- 新的排障建议

如果只是前端样式微调、内部算法优化、测试覆盖增加，通常不需要改 skill。

## 分发建议

如果你要把这个 skill 发给其他 agent 使用：

1. 复制 `skills/pdfnav-pdf/`
2. 确保对方机器上可以运行 `pdfnav`
3. 确保对方知道如何配置 BigModel / `GLM-OCR` API key
4. 确保 README 中也说明这是基于 `GLM-OCR`

## 与 README 的关系

- `README.md` 面向人类使用者
- `SKILL.md` 面向 agent

二者应保持一致，但不要完全复制。README 说明“能做什么”，skill 说明“agent 该怎么做”。
