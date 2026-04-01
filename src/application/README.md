# Application Layer

该层负责业务编排，不负责外部细节实现。

包含：

- ports
- pipeline
- use-cases
- 编排型 services

该层依赖 `domain`，并通过 `ports` 与外部交互。
