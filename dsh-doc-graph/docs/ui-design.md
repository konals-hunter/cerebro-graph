# dsh-doc-graph · DSH UI 设计文档（初版）

> 状态：设计稿阶段（未编码）
> 设计稿：`docs/ui-design.html`（在 DSH 预览面板打开）
> 目标：把「文档 → 图谱 → 分析」的流程在 DSH 对话中跑通，UI 形态为对话内卡片（toolview）+ 输入框 dock。

---

## 1. 设计原则

1. **对话内完成一切**：不跳出 DSH，不单独开一个 Web App。所有结果以 toolview 卡片渲染在对话流里，和 `dsh-visualize` 一个范式。
2. **卡片即状态**：索引状态、图谱探索、审计报告都是卡片。会话重放时卡片从持久化 meta 恢复，不依赖临时文件。
3. **遵循 DSH token**：颜色/边框/字号全部走 `--dsw-alias-*` 设计 token，亮暗双主题自动跟随（参考 `cerebro-skin` 的 Minimal Warm 与官方鲸鱼蓝）。
4. **渐进披露**：卡片默认给「一屏能看完」的摘要；大图、全文、引用链按需展开。
5. **模型优先，人可干预**：模型自动决定调用哪个 docgraph 工具；用户在卡片上可以点选节点/展开详情来复核，不用自己写查询。

---

## 2. 用户流程（Doc → Graph in DSH）

```
用户把文档放进工作区目录（docs/、policies/、reports/…）
        │
        ▼
用户在对话中说：「帮我把 docs/ 建个文档图谱」
        │
        ▼
模型调用 docgraph_index(path=docs)          ← 插件 tool（node 端）
        │
        ▼
对话中渲染 IndexStatusCard                    ← 客户端 toolview
（索引进度 → 完成统计：N 文档 / M 节点 / K 边 / E 实体）
        │
        ├── 用户问：「有哪些过期政策？」 → docgraph_context format=drift_audit → DriftAuditCard
        ├── 用户问：「谁引用了 security-policy？」 → docgraph_graph operation=impact → GraphCard
        ├── 用户问：「关于 API 设计的讨论都在哪？」 → docgraph_context → ContextCard
        └── 用户问：「和这份文档相似的还有哪些？」 → docgraph_similar → ContextCard（相似列表）
```

**核心闭环**：一次索引 → 多次查询 → 卡片持久在会话里可回看。

---

## 3. 客户端 UI 组件清单

| 组件 | 渲染位置 | 触发工具 | 核心内容 |
|------|---------|---------|---------|
| **DocGraphDock** | 输入框 dock | 常驻（有图时） | 当前项目图谱状态、索引进度、重建按钮 |
| **IndexStatusCard** | toolview | `docgraph_index` / `docgraph_status` | 索引进度 + 统计（文档/节点/边/实体/格式分布） |
| **GraphCard** | toolview | `docgraph_graph` | ECharts 力导向图：文档/标题/实体节点 + 引用/包含/冲突边；点击节点看详情 |
| **ContextCard** | toolview | `docgraph_context` / `docgraph_search` / `docgraph_similar` | 文档结果列表：标题、路径、相关章节、引用数、治理标签；展开显示带行号的源片段 |
| **DriftAuditCard** | toolview | `docgraph_context format=drift_audit` | 按严重度分组的 finding 列表：代码、标题、相关文档、建议 |

---

## 4. 组件规格

### 4.1 DocGraphDock（输入框上方状态条）

- 常驻 dock，只有当前工作区存在 `.docgraph` 索引时出现。
- 左侧：神经节点图标 + 「文档图谱」文案。
- 中间：状态文案——`已索引 128 文档 · 950 节点 · 670 边`；索引中显示进度条。
- 右侧：`重建索引` 与 `状态` 两个小按钮（点击后以 follow-up 消息驱动模型调用工具）。
- 高度 36px，与 DSH 输入框风格一致。

### 4.2 IndexStatusCard

- 头部：`docgraph_index` 标题 + 项目路径 + 用时。
- 进度区：索引中显示 spinner + 进度条；完成后收起。
- 统计区：4 个数字块（文档、节点、边、实体）。
- 格式分布：横向小条（md / docx / pdf / html / txt …）。
- 底部：提示「文件变更会自动增量同步」。

### 4.3 GraphCard

- 头部：标题（如 `影响分析 · security-policy.md`）+ 统计（N 节点 / M 边）+ 图例。
- 主体：ECharts graph 力导向布局。
  - 节点形状：文档=圆角矩形；标题/章节=圆形；实体=菱形。
  - 节点颜色：当前文档=品牌色描边；受影响文档=警告色；过期文档=错误色；其他=中性。
  - 边：`references`=灰实线；`contains`=浅灰虚线；`conflicting`=红色虚线；`similar_to`=蓝色点线。
- 交互：拖拽/缩放；点击节点 → 卡片内右侧滑出详情面板（标题、路径、入边/出边列表、一键跳转 docgraph_node）。
- 底部：`depth=1` 时只显示直接引用；`depth≥2` 显示传递影响并标注层级。

### 4.4 ContextCard

- 头部：查询词 + 「Found N documents」。
- 列表项（每条）：
  - 第一行：文档标题（可点） + 治理状态标签（`active` / `stale` / `superseded`）+ 敏感级标签。
  - 第二行：`[project/]path#heading` + 相关章节 chips。
  - 第三行：引用数（入/出）+ 元数据摘要（owner / review_due / confidence）。
- 展开后：显示源内容片段（等宽字体，带行号，默认 2000 字节，可加）。
- 底部：`includeContent=false` 时只显示结构；`context_pack` 格式加 hash + citation + impact。

### 4.5 DriftAuditCard

- 头部：`漂移审计` + 严重度汇总（错误 N / 警告 M / 提示 K）。
- 分组：治理漂移 / 研究漂移 / 文档漂移（+ 可选 code-doc 漂移）。
- 每条 finding：
  - 左侧：finding code（如 `policy.stale_review`）+ 严重度色点。
  - 中间：标题 + 相关文档路径 + 一句话说明。
  - 右侧：建议动作（`heal` 可修复的显示修复按钮）。
- 可点击 finding → 展开受影响文档列表和原文片段。

---

## 5. 工具集（模型侧，初版）

与 DocGraph core 对齐，DSH 插件以 tool 形式注册（非 MCP server 进程，直接进程内调用 core 的 Go binary / SQLite）：

| 工具名 | 用途 | 对应卡片 |
|--------|------|---------|
| `docgraph_index` | 建图/重建索引 | IndexStatusCard |
| `docgraph_status` | 索引状态 | IndexStatusCard |
| `docgraph_context` | 任务上下文（summary / context_pack / drift_audit） | ContextCard / DriftAuditCard |
| `docgraph_search` | 精确/全文检索 | ContextCard |
| `docgraph_node` | 单文档详情 | ContextCard（单条展开） |
| `docgraph_files` | 列出索引文件 | ContextCard（纯列表） |
| `docgraph_graph` | 图遍历 incoming/outgoing/impact/trace | GraphCard |
| `docgraph_similar` | 相似文档 | ContextCard |
| `docgraph_tags` | 标签 | ContextCard |

MVP 暂不注册 LLM callout 类工具（`embeddings` / `enrichment`），后续按场景再加。

---

## 6. MVP 格式扩展（对齐用户要求）

DocGraph core 原生支持 `.md/.docx/.html/.pdf`。MVP 需增强：

| 格式 | 优先级 | 说明 |
|------|--------|------|
| `.txt` | P0 | 纯文本，直接解析，几乎零成本 |
| 文本型 `.pdf` | P0 | 现有 PDF 提取已覆盖大部分，需补 CJK 文本层检测 |
| `.rst` | P1 | 标题/引用语法规则解析 |
| `.tex` | P1 | LaTeX 章节/`\ref`/`\cite` 解析 |
| `.odt` | P2 | ODT = zip + content.xml，可复用 docx 解析思路 |
| `.epub` | P2 | zip + xhtml，章节即标题节点 |
| 扫描型 `.pdf`（OCR） | P2 | 引入 OCR 引擎（tesseract 等），先生成文本层再走普通 PDF 管道 |

设计影响：IndexStatusCard 的格式分布条需要能显示这些新格式；解析失败的文档在卡片中标记 `errors`。

---

## 7. 场景预留（待用户预设）

初版 UI 跑通后，用户会预设若干场景来校验 MVP 缺口。当前预留的扩展点：

1. **卡片扩展槽**：GraphCard 可切换「引用图 / 实体图 / 相似度图」三种模式。
2. **审计卡片分组可配置**：按 domain pack 启用/禁用 finding 组。
3. **Dock 多项目**：workspace 模式下 dock 显示当前项目名 + 切换。
4. **follow-up 按钮**：卡片内按钮向主对话发送追问消息（依赖 DSH client runtime 能力，`dsh-visualize` 目前无此能力，需评估）。

---

## 8. 目录规划

```text
cerebro-graph/
├── dsh-doc-graph/                 # DSH 插件（TypeScript，Cordis）
│   ├── docs/
│   │   ├── ui-design.md           # 本文档
│   │   └── ui-design.html         # 高保真设计稿
│   ├── src/
│   │   ├── index.ts               # 插件入口：注册 tools + skills
│   │   ├── tool.ts                # docgraph_* 工具定义
│   │   ├── skill.ts               # bundled skill（模型使用指南）
│   │   ├── core.ts                # 调用 core binary 的桥接层
│   │   └── client/
│   │       ├── index.tsx          # 客户端入口：toolview + dock
│   │       ├── GraphCard.tsx
│   │       ├── ContextCard.tsx
│   │       ├── DriftAuditCard.tsx
│   │       ├── IndexStatusCard.tsx
│   │       └── DocGraphDock.tsx
│   ├── assets/
│   ├── package.json
│   ├── cordis.patch.yml
│   └── README.md
└── cerebro-graph-doc-core/        # fork 自 Detective-XH/DocGraph（Go）
    └── …（上游源码，后续在其上扩展格式）
```
