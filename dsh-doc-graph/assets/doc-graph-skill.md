# doc-graph 使用指南

文档知识图谱插件（dsh-doc-graph）。先索引，再查询；图谱卡片可在右侧面板中打开。

## 工具选择

| 想做什么 | 用哪个工具 |
|---------|-----------|
| 首次索引 / 确保已索引 | `docgraph_index`（默认 force=false） |
| 强制全量重建索引 | `docgraph_index(force=true)`（会重启 core 进程，慢，谨慎用） |
| 查看索引状态 | `docgraph_status` |
| 按任务取上下文 | `docgraph_context` |
| 漂移审计 | `docgraph_context(format='drift_audit')` |
| 搜索 | `docgraph_search` |
| 查单个节点 | `docgraph_node` |
| 列出文档 | `docgraph_files` |
| 展开图谱 | `docgraph_graph` |
| 相似文档 | `docgraph_similar` |
| 按标签查 | `docgraph_tags` |

## 路径格式

- 路径参数一律写**项目内相对路径**，`/` 分隔，例如 `docs/spec.md`。
- 不要带 `[project/]` 前缀，不要带 `:line` 后缀（行号不属于路径）。
- `docgraph_graph` 的 `trace` 操作用 `from` + `to`，不要用 `document`。

## 卡片与 Drawer

- 工具结果会以卡片呈现；`docgraph_context(format='drift_audit')` 落在漂移审计卡片。
- 点卡片上的「在面板中打开」可打开右侧 Graph Drawer 查看 2D/3D 图谱。
- Drawer 数据来自当前 session 最近一次 `docgraph_graph` / `docgraph_status` 结果。

## 注意

- `docgraph_index(force=true)` 会停止并重启长驻 core 进程，期间其它图谱查询可能返回 "Indexing in progress"。
- 路径越界（绝对路径、`..`、symlink escape）会被工具直接拒绝。
