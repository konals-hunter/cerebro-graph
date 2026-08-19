# dsh-doc-graph

DSH 文档图谱插件：把「文档 → 图谱 → 分析」跑进 DSH 对话流。

- **core**：桥接 `cerebro-graph-doc-core`（fork 自 Detective-XH/DocGraph 的 Go binary）
- **形态**：对话内 toolview 卡片 + 输入框 dock（与 dsh-visualize 同一范式）
- **最终生效规格**：[docs/superpowers/specs/dsh-doc-graph-spec.md](docs/superpowers/specs/dsh-doc-graph-spec.md)（实现据此编码）
- **审阅记录**：[docs/spec-design-review.md](docs/spec-design-review.md)（R-001~R-018 已全部复核采纳）
- **最终原型**：`docs/dsh-mock-demo-v5.html`（用户定稿配色与交互）
- **历史参考**：`docs/spec-design.md`、`docs/ui-design.md`、`docs/ui-design.html`、`docs/dsh-mock-demo.html`

## 状态

实现计划见 [docs/superpowers/plans/2026-08-19-dsh-doc-graph-implementation.md](docs/superpowers/plans/2026-08-19-dsh-doc-graph-implementation.md)。

> ⚠️ lib/client.js 超过 1.5 MB，需将 three + 3d-force-graph 改 external + 动态 import 并修订 spec。
