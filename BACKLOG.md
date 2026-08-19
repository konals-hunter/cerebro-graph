# cerebro-graph · 决策记录与待办（Backlog）

> 本文件记录所有「已经讨论、但当前阶段尚未进入实施」的事项，防止遗忘。
> 更新规则：进入实施后从对应小节移到「已进入实施」并注明 PR/commit；新讨论的未决事项随时追加。

---

## 1. 核心决策记录

| # | 决策 | 状态 | 说明 |
|---|------|------|------|
| D1 | **dsh-doc-graph 基于 cerebro-graph-doc-core 做** | 定案 | DSH 插件层桥接 core（fork 自 Detective-XH/DocGraph），不重写图谱引擎 |
| D2 | **MVP 沿用 doc-core 现有接口** | 定案 | 插件只做「DSH tool ↔ core CLI/JSON 输出」的适配；core 的 CLI 命令与 MCP 工具语义不变 |
| D3 | **DSH 插件形态** | 定案 | Cordis 插件：Node 端注册 9 个 `docgraph_*` 工具 + bundled skill；Client 端 toolview 卡片 + 输入框 dock + Graph Drawer |
| D4 | **2D 用 ECharts，3D 用 3d-force-graph（vasturiano，6.3k★）** | 定案 | 版本锁定见 spec §11；client 端打包内联，不依赖运行时 CDN |
| D5 | **最终交互原型 = docs/dsh-mock-demo-v5.html** | 定案 | 配色、三栏 workspace、inspector、筛选/深度、3D 发光球体均以 v5 与 spec-design.md 为准 |
| D6 | **图可视化专用色不随 DSH 明暗主题翻转** | 定案 | 2D 画布浅色网格 + 3D 透明底，专用色板在明暗主题下均可读（spec §5.1） |
| D7 | **每个工作区 doc graph 隔离** | 定案 | core 的 per-project SQLite；UI 单项目展示（多项目切换见 T9） |

---

## 2. 待办（未进入实施）

### T1 · GitHub fork 配置 — P0
- 本机无 `gh` CLI，`cerebro-graph-doc-core` 目前只有 `upstream` remote。
- 需用户：在 GitHub 网页 fork `Detective-XH/DocGraph` → 本地 `git remote add origin <fork地址>` → push。
- 未完成前，core 侧改动只能本地 commit，无法推远端。

### T2 · 场景预设与 MVP 缺口校对 — P0
- 用户会预设若干使用场景，用来校验 MVP 还缺什么。
- 场景到来时：对照 `dsh-doc-graph/docs/spec-design.md` §13 验收清单逐条过，缺口补进 spec 与本文件。

### T3 · 实现计划（writing-plans 格式） — P0
- spec-design.md 完成后，下一步写 TDD 实现计划（`docs/superpowers/plans/YYYY-MM-DD-dsh-doc-graph.md` 或用户指定路径）。
- 执行方式待定：subagent-driven / inline。

### T4 · core 格式扩展（MVP 增强项，用户指定） — P1/P2/P3
在 `cerebro-graph-doc-core`（Go）侧做，DSH UI 侧只需 IndexStatusCard 格式分布条支持新格式展示。

| 格式 | 优先级 | 状态 | 备注 |
|------|--------|------|------|
| `.txt` | P1 | 未开始 | 纯文本直解析，几乎零成本 |
| 文本型 `.pdf` | P1 | 未开始 | 现有提取已覆盖大部分，需补 CJK 文本层检测与编码处理 |
| `.rst` | P2 | 未开始 | 标题/引用语法规则解析 |
| `.tex` | P2 | 未开始 | 章节 + `\ref` + `\cite` 解析 |
| `.odt` | P3 | 未开始 | zip + content.xml，可复用 docx 思路 |
| `.epub` | P3 | 未开始 | zip + xhtml，章节即标题节点 |
| 扫描型 `.pdf` OCR | P3 | 未开始 | 引入 OCR 引擎（tesseract 等），先文本层化再走普通 PDF 管道 |

### T5 · 真实数据布局算法 — P2
- v5 原型用固定坐标表 `GRAPH_POS` / `GRAPH_POS_3D`（12 个 mock 节点）。
- 真实数据接入后需要确定性布局算法（2D 按 role 分层 + 扇区；3D 按深度螺旋/环形分布），保证同数据重渲结果稳定。
- 位置：`dsh-doc-graph/src/layout.ts`，当前可先实现「坐标表 fallback + 简单环形分配」。

### T6 · core 桥接 EPERM 降级分支 — 按需
- 首选 `child_process.execFile('docgraph', args)` 捕获 stdout JSON。
- 若 DSH 沙箱对 pipe 捕获报 EPERM：改为 `stdio:'inherit'` + 临时 JSON 文件交换。
- **只在实测 EPERM 时启用，不预写绕过。**（spec §10）

### T7 · GitHub fork 后与上游同步策略 — P1
- DocGraph 上游在快速迭代（star 少但活跃）；fork 后需定同步节奏（rebase / merge upstream）。
- 建议：每次对 core 动手前先 `git fetch upstream` 看 diff；改动尽量独立成 commit，便于 rebase。

---

## 3. 后续迭代（spec 明确 Out，UI 已预留扩展点）

### T8 · 多 workspace 切换 UI
- 现状：drawer header 只有单项目下拉占位（`docs-workspace`）。
- 目标：workspace 模式下列出全部 project，切换后重载 GraphPayload 与文档列表。

### T9 · 卡片内 follow-up 按钮
- 现状：卡片内按钮只能 toast；`dsh-visualize` 也暂无此能力。
- 目标：GraphCard/Inspector 按钮向主对话发送追问消息。依赖 DSH client runtime 能力，需先做技术验证。

### T10 · LLM callout 类工具（embeddings / enrichment）
- core 有 opt-in 的 `docgraph_embeddings` / `docgraph_enrichment`（带确认 token 流程）。
- 插件 MVP 不注册；后续接入时沿用 core 的两步确认语义（action=pending → 用户确认 → action=process/store）。

### T11 · GraphCard 三模式切换
- 当前 GraphDrawer 只展示「引用/影响图」。
- 预留：引用图 / 实体图 / 相似度图三种模式（ui-design.md §7 预留扩展点）。

### T12 · 审计分组可配置
- DriftAuditCard 按 domain pack 启用/禁用 finding 组（governance / research_provenance / entity / policy_process / assessment_drift / code_doc）。
- 依赖 core `docgraph pack enable|disable`，UI 侧加开关。

### T13 · entity 节点类型
- spec §4 当前 `NodeType = 'doc' | 'section'`，预留 `'entity'`。
- core 已有实体图（entities / entity_mentions 表）；UI 需加实体菱形节点与筛选 role。

### T14 · 文档 diff / 历史版本对比视图
- core 有 git 历史（file_history）；可做「文档某时间点 vs 现在」的引用变化对比。未设计。

### T15 · code_doc pack 接入
- core 的 code_doc pack（文档-代码漂移审计）默认关闭；启用后 DriftAuditCard 多一类 finding（code.undocumented_export 等）。
- 接入前提：场景确实需要文档-代码联合审计。

---

## 4. 已进入实施 / 已完成

| # | 事项 | 状态 |
|---|------|------|
| C1 | 目录结构（cerebro-graph / dsh-doc-graph / cerebro-graph-doc-core） | 完成 |
| C2 | DocGraph clone 到 cerebro-graph-doc-core（upstream remote） | 完成 |
| C3 | UI 设计文档 ui-design.md | 完成（需求可视化，保留） |
| C4 | 使用态 mock demo dsh-mock-demo.html | 完成（早期版，被 v5 取代） |
| C5 | 最终交互原型 dsh-mock-demo-v5.html | 完成（配色与交互定稿） |
| C6 | spec-design.md | 完成（历史版本，已被最终 spec 取代） |
| C7 | spec-design-review.md 审阅复核 | 完成（R-001~R-018 全部采纳；R-009 行号修正为 store/schema.go） |
| C8 | **最终生效 spec** | 完成：`dsh-doc-graph/docs/superpowers/specs/dsh-doc-graph-spec.md`（实现据此编码） |

---

## 5. 附：doc-core 现有接口（MVP 沿用的桥接对象）

core = `cerebro-graph-doc-core`（fork 自 Detective-XH/DocGraph，Go，单二进制，SQLite 存储）。

### CLI 命令（插件桥接用）
```
docgraph init [--force] [path]       # 建索引
docgraph sync [path]                 # 增量更新（hash）
docgraph status <path>               # 索引统计
docgraph serve --path <path>         # MCP stdio（单项目）
docgraph serve --workspace <dir>     # MCP stdio（多项目）
docgraph pack list|enable|disable    # domain pack 管理
docgraph heal [--fix] [path]         # frontmatter 治理字段修复
```

### MCP 工具语义（插件 docgraph_* 工具与之对齐）
| core MCP tool | DSH tool | 说明 |
|---------------|----------|------|
| `docgraph_context` | `docgraph_context` | 任务上下文（summary / context_pack / drift_audit） |
| `docgraph_search` | `docgraph_search` | FTS5 全文/过滤检索 |
| `docgraph_node` | `docgraph_node` | 单文档详情 |
| `docgraph_files` | `docgraph_files` | 文件列表 |
| `docgraph_graph` | `docgraph_graph` | incoming/outgoing/impact/trace |
| `docgraph_similar` | `docgraph_similar` | TF-IDF/neural 相似文档 |
| `docgraph_tags` | `docgraph_tags` | 标签 |
| `docgraph_status` | `docgraph_status` | 索引状态 |
| `docgraph_embeddings` | （MVP 不注册） | opt-in LLM callout |
| `docgraph_enrichment` | （MVP 不注册） | opt-in LLM callout |
