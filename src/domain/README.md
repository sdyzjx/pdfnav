# Domain Layer

该层只定义稳定的领域模型、schema 和错误类型。

包含：

- 文档对象
- 页面对象
- 章节对象
- 内容节点对象
- 资产对象
- manifest 与阶段状态

不允许：

- 直接调用 BigModel API
- 直接读写文件
- 直接处理 CLI 参数
