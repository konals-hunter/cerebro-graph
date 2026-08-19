# dsh-doc-graph · Specification

> 状态：最终生效规格（吸收 `spec-design-review.md` R-001~R-018 全部复核结论）
> 审阅记录：`../../spec-design-review.md`（只读，不复改）
> 被取代文档：`../../spec-design.md`（历史版本，以本文档为准）、`../../ui-design.md`（需求可视化，历史参考）
> 读者：实现工程师（零上下文可据此编码）

---

## 0. 规范优先级

发生冲突时按以下顺序取唯一来源：

1. **本文档**（`docs/superpowers/specs/dsh-doc-graph-spec.md`）
2. `docs/dsh-mock-demo-v5.html`（交互与视觉原型，仅作视觉参照）
3. `docs/ui-design.md` / `docs/ui-design.html` / `docs/dsh-mock-demo.html`（历史参考，已废弃行为不生效）

历史文档与本文档冲突项已收敛（见 §13 废弃清单）。

---

## 1. 目标与范围

### 1.1 目标

在 DSH 中提供「文档 → 图谱 → 分析」能力：Node 端注册 `docgraph_*` 工具，桥接 `cerebro-graph-doc-core`（fork 自 Detective-XH/DocGraph，下称 core）；Client 端以对话内 toolview 卡片 + 输入框 dock + 右侧 Graph Drawer 呈现文档图谱。

### 1.2 MVP 范围

**In**
- 消息流卡片：IndexStatusCard、DriftAuditCard、GraphCard（消息内 mini 2D 图）、ContextCard
- DocGraphDock 状态条
- Graph Drawer：总览区、项目文档列表、图谱工作区（筛选 rail / 画布 / inspector）、2D/3D 切换
- 交互：节点选择联动、角色筛选、影响深度切换、文档列表定位、Escape、reduced-motion、响应式

**Out（明确不做，UI 保留 disabled 占位或后续迭代）**
- 多 workspace 切换 UI（drawer 仅单 project 展示）
- 卡片内 follow-up 按钮向主对话发消息
- embeddings / enrichment 工具（LLM callout）
- 文档列表 mutations（添加/替换/重解析/移除）——MVP 全部 **disabled 占位**
- 文档 diff / 历史版本对比

---

## 2. 架构

### 2.1 仓库布局

```text
cerebro-graph/
├── dsh-doc-graph/                       # DSH 插件（TypeScript / Cordis）
│   ├── docs/
│   │   ├── superpowers/specs/
│   │   │   └── dsh-doc-graph-spec.md    # 本文档（唯一生效 spec）
│   │   ├── spec-design-review.md        # 审阅记录（只读）
│   │   ├── spec-design.md               # 历史 spec
│   │   ├── ui-design.md / ui-design.html / dsh-mock-demo*.html  # 历史参考
│   ├── src/
│   │   ├── index.ts                     # 插件入口：apply(ctx, config)
│   │   ├── types.ts                     # §4 全部类型
│   │   ├── palette.ts                   # §8 色板常量
│   │   ├── layout.ts                    # §8.4 坐标表与映射
│   │   ├── tool.ts                      # §7 工具定义
│   │   ├── core.ts                      # §3 core 桥接（MCP stdio client + 进程生命周期）
│   │   ├── skill.ts                     # bundled skill provider
│   │   └── client/
│   │       ├── index.tsx                # 客户端入口：toolview + dock + UIContext
│   │       ├── theme.ts                 # --dsw-alias-* token 桥接
│   │       ├── DocGraphUIContext.tsx    # Drawer controller + session 隔离 store
│   │       ├── DocGraphDock.tsx
│   │       ├── cards/                   # IndexStatusCard / DriftAuditCard / GraphCard / ContextCard
│   │       └── drawer/                  # DocGraphDrawer / OverviewSection / DocListSection / graph/*
│   ├── assets/doc-graph-skill.md
│   ├── package.json                     # §12
│   ├── cordis.patch.yml
│   └── README.md
└── cerebro-graph-doc-core/             # Go core（fork，不修改接口）
```

### 2.2 运行时拓扑

```
DSH Web UI
├─ Node 端（Cordis）
│    ctx.tools.register(9 个 docgraph_* tools)
│    ctx.skills.registerProvider(doc-graph skill)
│    tool.execute → core.ts → 长驻 core 进程（MCP stdio）→ 结构化结果
│    tool.presentationMeta → 持久化 meta（toolview 恢复依据）
├─ Client 端
│    DocGraphUIContext（按 sessionId 隔离）提供 openDrawer/focusNode/activePayload
│    tool.call.toolview 注册 9 个 key
│    conversation.input.dock 注册 id: docgraph-dock
└─ Graph Drawer（client overlay，非独立路由）
     数据来源：当前 session 最近一次 docgraph_graph/status payload（经 UIContext）
     状态：activeRoles / activeDepth / selectedNodeId / mode（useState）
     渲染：Graph2D（ECharts）| Graph3D（3d-force-graph）
```

---

## 3. Core 桥接协议（R-001 / R-002 决策）

### 3.1 选定协议：长驻 MCP stdio client（不改 core）

- 插件 Node 端 **不** 使用「每次调用 spawn 一次性 CLI」、**不** 直接读 SQLite。
- 插件启动并持有 **一个长驻 core 进程**：`docgraph serve --path <root>`（单项目模式；workspace 模式为后续迭代）。
- 通信：JSON-RPC 2.0 over stdio（MCP 协议）。core 的查询工具（context/search/node/files/graph/similar/tags/status）全部通过 `tools/call` 调用。
- stderr 隔离：core 的日志/进度写 stderr，插件转发到自身日志系统，**不得** 进入工具结果文本。
- 请求超时：查询类默认 15s；`docgraph_status` 15s；无索引类 MCP 请求（索引生命周期见 §3.2）。超时返回错误 payload（§11）。
- 取消：DSH 工具 `exec.signal` 触发时，插件向 core 发送 `notifications/cancelled`（MCP 标准通知）；core 若忽略，插件不等待结果直接返回错误。
- core binary 解析顺序：`process.env.DSH_DOCGRAPH_BIN` → `PATH` 中的 `docgraph` → 返回错误「docgraph core binary not found」。

### 3.2 索引生命周期（单一 owner = serve 进程）

- **索引 owner 是长驻 serve 进程**：cold start 自动全量索引（`setIndexing(true)`），warm start 自动增量 sync + reconcile；运行期 watcher 自动增量。插件不实现任何跨进程文件锁。
- **`docgraph_index` DSH 工具（force=false）**：确保 serve 进程已启动（未启动则启动并等待首次 status 可查询），随后返回 `docgraph_status` 等价 payload（`IndexState.phase` 由 core 状态推断，见 §4.3）。
- **`docgraph_index` DSH 工具（force=true）**：按序执行
  1. 向 serve 进程发 MCP `tools/call docgraph_status` 记录旧状态（失败可忽略）
  2. 停止 serve 进程（SIGTERM，等待退出，上限 5s，超时 SIGKILL）
  3. 一次性执行 `docgraph index --force <root>`（CLI，无 JSON，只看 exit code；超时 120s）
  4. 重启 `docgraph serve --path <root>`
  5. 轮询 `docgraph_status`（每 500ms，上限 60s）直到可查询，返回 payload
- **插件不暴露索引进度百分比**。`IndexState.phase` 四态：`starting | indexing | ready | error`（§4.3）。dock/IndexStatusCard 只渲染四态 + 绝对时间；**不显示 62% 这类伪精确值**。
- 并发保护：core.ts 内部 `indexingOp` 互斥（Node 进程内 Promise 锁）；`force=true` 执行期间其他工具调用若收到 core 的 "Indexing in progress" 错误，直接透出为工具错误文本。

---

## 4. 数据契约（R-003 / R-005 / R-010 / R-013 决策）

文件：`src/types.ts`。所有 payload 带 `schemaVersion: 1` 与判别字段 `kind`。**禁止 `as GraphPayload` 强转**：`core.ts` 对每个响应做运行时结构校验（手写 type guard，不引第三方校验库），失败返回错误 payload。

### 4.1 判别联合

```ts
export type DocGraphPayload =
  | IndexPayload       // docgraph_index / docgraph_status
  | GraphPayload       // docgraph_graph
  | DriftPayload       // docgraph_context format=drift_audit
  | ContextPayload     // docgraph_context(format≠drift_audit) / search / node / similar / tags
  | FilesPayload       // docgraph_files

export interface IndexPayload {
  schemaVersion: 1
  kind: 'docgraph_index' | 'docgraph_status'
  project: string
  rootPath: string
  state: IndexState
  summary: Summary
  docs: DocRecord[]
}

export interface GraphPayload {
  schemaVersion: 1
  kind: 'docgraph_graph'
  project: string
  seedNodeId: string
  operation: GraphOperation          // 'incoming'|'outgoing'|'impact'|'trace'
  depth?: number                     // 仅 impact 存在，1..5
  nodes: GraphNode[]
  links: GraphLink[]
  dropped: { nodes: number; links: number }   // core 返回但被 MVP 映射丢弃的计数
}

export interface DriftPayload {
  schemaVersion: 1
  kind: 'docgraph_drift'
  project: string
  findings: DriftFinding[]
}

export interface ContextPayload {
  schemaVersion: 1
  kind: 'docgraph_context'           // search/node/similar/tags 也复用此 kind
  project: string
  results: ContextResult[]
  truncated: boolean
}

export interface FilesPayload {
  schemaVersion: 1
  kind: 'docgraph_files'
  project: string
  files: DocRecord[]
  truncated: boolean
}
```

### 4.2 节点 / 边 / 文档

```ts
export type Role = 'current' | 'direct' | 'transitive' | 'section' | 'other'
export type NodeType = 'doc' | 'section'
export type LinkKind = 'contains' | 'references'
export type GraphMode = '2d' | '3d'
export type DocStatus = 'ok' | 'changed' | 'err'

export interface GraphNode {
  id: string                     // namespaced ID（§4.4）
  project: string
  name: string
  type: NodeType
  role: Role
  relPath: string                // 项目内相对路径，'/' 分隔
  anchor?: string                // section 节点的 heading 锚点
  val: number                    // 重要性/入引强度
  inboundTotal: number           // 全量入引（不受筛选/截断影响）
  outboundTotal: number          // 全量出引
}

export interface GraphLink {
  source: string                 // namespaced ID
  target: string                 // namespaced ID
  kind: LinkKind
}

export interface DocRecord {
  id: string                     // namespaced ID
  project: string
  name: string
  path: string                   // 显示路径（项目内相对）
  fmt: 'md' | 'docx' | 'pdf' | 'html' | 'txt' | string
  status: DocStatus
  inbound: number
  sizeBytes: number              // 机器值
  updatedAt: number              // epoch ms（core file mtime；无则 0）
  indexedAt: number              // epoch ms（进入索引时间；无则 0）
}
```

### 4.3 IndexState（R-007 决策）

```ts
export type IndexPhase = 'starting' | 'indexing' | 'ready' | 'error'

export interface IndexState {
  phase: IndexPhase
  startedAt?: number             // epoch ms；未知则缺省
  finishedAt?: number            // phase='ready' 时存在
  lastError?: string             // phase='error' 时存在
  revision: number               // 每次 status 变化 +1；core 无此概念时由插件单调递增
}
```

- 推断规则：serve 进程未启动 → `starting`；`docgraph_status` 返回 "Indexing in progress"（或 core 状态标记）→ `indexing`；status 正常返回 → `ready`；status 调用异常 → `error`。
- 刷新机制（MVP）：不推送。Dock/Drawer 在以下时机拉取 `docgraph_status` 刷新 payload：打开 Drawer、用户点击 dock「状态」按钮、`docgraph_index` 返回后。每次刷新产生新 `revision`。
- 相对时间（"2 分钟前"）由客户端根据 `indexedAt/finishedAt` 与当前时间渲染，**不落盘展示字符串**。

### 4.4 Namespaced ID（R-005 决策）

```ts
// 稳定可交互 ID：project + relPath + anchor（nodeKind 作后缀仅用于无路径节点，MVP 无此情况）
export function nodeId(project: string, relPath: string, anchor?: string): string {
  return `${project}::${relPath}${anchor ? `::${anchor}` : ''}`
}
```

- GraphNode.id / GraphLink.source/target / DocRecord.id 全部使用该 ID。
- 客户端所有交互（focusNode/选中/筛选）以该 ID 为唯一键。
- core 的 SQLite node id 不得泄露到 payload。

### 4.5 ContextResult / DriftFinding / Summary

```ts
export interface ContextResult {
  id: string                     // namespaced ID（nodeId）
  project: string
  title: string
  location: string               // 'path#heading:line' 或 'path'
  docPath: string                // 纯文档路径（不带 # 后缀）
  score?: number                 // 相似度/相关度 0..1，无则缺省
  inbound: number
  chips: string[]
  statusTag?: { label: string; kind: 'active' | 'stale' | 'hot' | 'superseded' }
  snippet?: string               // 带行号源片段（多行文本，展示层直接渲染）
}

export interface DriftFinding {
  code: string
  severity: 'err' | 'warn' | 'ok'          // UI 文案：错误/警告/提示
  title: string
  detail: string
  actionable: boolean
  actionLabel?: string
  docs: { id: string; name: string }[]     // 受影响文档（可为空数组）
}

export interface Summary {
  docs: number
  nodes: number
  edges: number
  entities: number
  failed: number
  formats: { fmt: string; pct: number }[]  // pct 0-100 整数
}
```

---

## 5. 路径与身份（R-006 决策）

### 5.1 Project root 解析

```
projectRoot := DSH sandboxPolicy.workspaceRoot（参考 dsh-visualize 的 resolve 方式）
            || session.header.cwd
```

### 5.2 路径校验（所有工具共用一个 `resolveRelPath`）

```ts
function resolveRelPath(input: string): string {
  // 1. 拒绝空串
  // 2. 统一分隔符 '\' -> '/'
  // 3. 拒绝绝对路径（/ 开头、盘符 C:/）
  // 4. 拒绝含 '..' 的片段
  // 5. canonicalize(path.join(projectRoot, rel)) 后必须 within canonicalize(projectRoot)；
  //    否则抛 ToolError('path escapes project root')
  // 6. 返回规范后的 '/' 相对路径
}
```

- symlink escape：canonicalize 后 containment check 即可拦截。
- `docgraph_index path=`：MVP 仅接受 `'.'` 或省略（索引整个 projectRoot）；传入子目录返回错误「MVP 仅支持索引项目根目录」。
- 显示路径统一 `/` 分隔；Windows 下不显示盘符。

### 5.3 Session 隔离（R-005 决策）

- Client 端 `DocGraphUIContext` 内 `Map<sessionId, SessionGraphState>`；每个 session 独立保存 `activePayload/activeRoles/activeDepth/selectedNodeId/mode/drawerOpen`。
- 卡片渲染时从 toolview props 取当前 sessionId；Drawer 只读取当前会话状态。
- session 切换：drawer 状态随 sessionId 切换读取；旧 session 状态保留在 Map 中（LRU 上限 20，超出丢最旧）。
- replay：卡片由持久化 presentationMeta 恢复；drawer 不跨 replay 保留打开态（刷新后 drawer 默认关闭）。

---

## 6. Core-to-UI 映射（R-009 决策）

### 6.1 节点映射

| core node kind | MVP NodeType | 说明 |
|----------------|--------------|------|
| `document` | `doc` | relPath=file_path |
| `heading` | `section` | relPath=所属文档 file_path，anchor=heading name |
| `tag` / `definition` / `code_file` / `entity` | **丢弃** | 计入 `dropped.nodes` |

### 6.2 边映射

| core edge kind | MVP LinkKind | 说明 |
|----------------|--------------|------|
| `contains` | `contains` | 文档→章节 |
| `references` | `references` | 直接保留 |
| `wikilinks_to` | `references` | 映射 |
| `embeds` | `references` | 映射 |
| `related_to` | `references` | 映射 |
| `similar_to` / `tagged` / `links_external` | **丢弃** | 计入 `dropped.links` |

- impact 遍历只走 `references`（含映射后）+ `contains`（用于章节归属），不展开相似/标签/外链。
- `summary.edges` 与画布边数可能不一致：Drawer 总览显示 core 总数，画布显示 MVP 可见数；`dropped.links > 0` 时画布工具栏提示「另有 N 条相似/外链等边未显示」。
- 同文档内部 heading→heading 引用不提升为文档节点（保持 section 节点，画布内呈现）。

### 6.3 seed 选择顺序（R-010 决策）

1. `GraphPayload.seedNodeId`
2. `visibleNodes[0]`（筛选默认态下为 current 文档）
3. `null` → Inspector 空态 + canvas-status「未选择节点」

---

## 7. 工具规格（Node 端，R-011 / R-012 决策）

文件：`src/tool.ts`。所有工具 `presentationMeta` 返回 `{ kind, payload }`，`payload` 为 §4 判别联合之一；`render` 返回 1-2 行文本确认，不回显大 payload。所有路径参数经过 §5.2 校验。所有工具支持透传 `project`（MVP 单 project，默认 `projectRoot` 的目录名；core 单项目模式下 project 参数为 no-op）。

### 7.1 工具表

| name | 必填参数 | 可选参数 | payload kind |
|------|---------|---------|--------------|
| `docgraph_index` | — | `path='.'`、`force=false` | `docgraph_index` |
| `docgraph_status` | — | `path='.'` | `docgraph_status` |
| `docgraph_context` | `task` | `format='summary'`、`maxNodes=10(1..200)`、`includeContent=true`、`maxContentBytes=2000(≤6000)`、`impactDepth=1(1..3)`、`referenceLimit=5(1..20)`、治理/研究过滤（§7.2）、`project` | `docgraph_context`；`format='drift_audit'` → `docgraph_drift` |
| `docgraph_search` | `q` | `limit=10(1..200)`、§7.2 过滤、`include_code=false`、`kind='doc'`、`entity_type`、`entity_id`、`project` | `docgraph_context` |
| `docgraph_node` | `path` | `section`、`project` | `docgraph_context`（单结果） |
| `docgraph_files` | — | `path`（目录过滤）、`limit=50(0..200)`、`project` | `docgraph_files` |
| `docgraph_graph` | `operation` | 见 §7.3 | `docgraph_graph` |
| `docgraph_similar` | `document` | `limit`、`engine='auto'`、`project` | `docgraph_context` |
| `docgraph_tags` | — | `tag`、`project` | `docgraph_context` |

### 7.2 治理/研究过滤参数（显式 schema，全部 `type:string` 可选）

治理：`status`、`sensitivity`、`canonical_source`、`allowed_audience`、`as_of_date`（YYYY-MM-DD）
研究：`claim_id`、`source_type`、`confidence`、`analyst_status`
实体：`entity_type`、`entity_id`（仅 search）

### 7.3 docgraph_graph 参数（R-011 决策：trace 独立 schema）

| operation | 必填 | 可选 | 说明 |
|-----------|------|------|------|
| `incoming` | `document` | `limit=10(0..200)` | depth 不适用 |
| `outgoing` | `document` | `limit=10(0..200)` | depth 不适用 |
| `impact` | `document` | `depth=2(1..5)`、`limit` | **默认/上限对齐 core：默认 2，上限 5**；UI 深度按钮 1/2/3 原样映射 core 1/2/3 |
| `trace` | `from`、`to` | — | **不使用 `document`；无 depth**（最短路径语义） |

- 校验：`incoming/outgoing/impact` 带 `from`/`to` → 工具错误「from/to only valid for trace」；`trace` 带 `document` → 工具错误（与 core 行为一致）。
- GraphPayload.depth 仅 impact 存在。
- 返回值含 `dropped`（§6）。

### 7.4 presentationMeta 与路由（R-004 决策）

| 工具调用 | kind | 渲染卡片 |
|---------|------|---------|
| `docgraph_index` | `docgraph_index` | IndexStatusCard |
| `docgraph_status` | `docgraph_status` | IndexStatusCard |
| `docgraph_graph` | `docgraph_graph` | GraphCard |
| `docgraph_context format='drift_audit'` | **`docgraph_drift`** | DriftAuditCard |
| `docgraph_context`（其余 format） | `docgraph_context` | ContextCard |
| `docgraph_search/node/similar/tags` | `docgraph_context` | ContextCard |
| `docgraph_files` | `docgraph_files` | ContextCard（纯列表模式） |

路由规则：client 按 `payload.kind` 精确匹配，**不按字符串包含 `drift` 猜测**。

### 7.5 bundled skill

文件：`src/skill.ts` + `assets/doc-graph-skill.md`。
- name：`doc-graph`
- description：`Document knowledge-graph plugin usage: index docs, query impact/references, run drift audits. Load before the first docgraph_* call in a session.`
- invocation：`{ modelInvocable: true, userInvocable: true }`
- 正文要点：工具选择表、路径格式（去 `[project/]` 前缀与 `:line` 后缀）、`format='drift_audit'` → 漂移审计卡片、drawer 与卡片关系、`docgraph_index force` 会重启 core 进程（慢，谨慎用）。

---

## 8. 视觉规范

### 8.1 DSH token 桥接

`src/client/theme.ts` 桥接 6 个宿主 token（同 dsh-visualize `TOKEN_BRIDGE`）：
`--dsw-alias-label-primary`、`--dsw-alias-bg-layer-1`、`--dsw-alias-label-caption`、`--dsw-alias-border-l2`、`--dsw-alias-brand-primary-new-colorprimary-new-color`、`--dsw-alias-label-primary-inverted`。
图专用色为插件自有，不随明暗主题翻转。

### 8.2 图专用色板（v5 定稿）

2D 节点描边/主色 `COLORS`：

| Role | 色值 |
|------|------|
| current | `#163b5c` |
| direct | `#4b7b97` |
| transitive | `#9cb3c1` |
| section | `#c18a3d` |
| other | `#c9c7c2` |

2D 节点填充 `FILLS`：

| Role | 色值 |
|------|------|
| current | `#163b5c` |
| direct | `#edf4f7` |
| transitive | `#f3f6f7` |
| section | `#c18a3d` |
| other | `#f4f3f0` |

2D 节点文字色：

| Role | 色值 |
|------|------|
| current | `#ffffff` |
| section | `#7b5120` |
| direct | `#18384b` |
| transitive | `#526b79` |
| other | `#817d76` |

2D 边线：

| 场景 | 色值 / 宽度 / 样式 |
|------|--------------------|
| contains | `rgba(193,138,61,.70)` / 1.2 / dashed / opacity 1 |
| references 默认 | `rgba(82,112,126,.34)` / 1.25 / solid / opacity .78 |
| references 选中 | `rgba(20,78,109,.96)` / 3 / solid / opacity 1 |
| 箭头 | `['none','arrow']`，size 9 |

3D 节点 `ROLE_STYLE_3D`：

| Role | radius | color | glow | glowOpacity |
|------|--------|-------|------|-------------|
| current | 9 | `#173e59` | `#6d9bb0` | .25 |
| direct | 7 | `#5f8294` | `#91b3bf` | .16 |
| transitive | 5.8 | `#a9bbc2` | `#c2d1d5` | .10 |
| section | 5 | `#bc8750` | `#d8aa76` | .12 |
| other | 4.8 | `#9ca6a6` | `#c0c8c5` | .08 |

3D 边线：

| 场景 | 色值 / 宽度 / opacity |
|------|----------------------|
| contains | `#b6aa9d` / 0.42 / 0.28 |
| references 默认 | `#84979d` / 0.58 / 0.42 |
| references 选中 | `#587d8b` / 1.2 / 0.82 |
| 方向箭头 | 长度 1.7，relPos .62，色 `#7b8d92`；contains 无箭头 |
| 选中边粒子 | 仅选中 references 边 1 个，宽 0.8；`prefersReducedMotion` 时 0 |

选中态：
- 2D 节点选中：`borderColor '#0d2638'`、`borderWidth 3`、`shadowBlur 18`、`shadowOffsetY 4`、`shadowColor 'rgba(22,59,92,.28)'`
- 2D 节点 current 非选中：`borderWidth 2.4`、`shadowBlur 12`、`shadowOffsetY 2`、`shadowColor 'rgba(22,59,92,.16)'`
- 3D 节点选中：核心球 `emissiveIntensity 0.42`（非选中 0.24），光晕 `opacity 0.30`（非选中取 glowOpacity）

画布背景（`.stage-body`）：
- `radial-gradient(900px 460px at 50% -10%, #ffffff 0%, #fbfaf8 56%, #f1efe9 100%)`（仅图专用画布，UI 其余部分无渐变）
- `::before` 网格：32px 方格，线色 `rgba(17,17,17,.035)`，`mask-image: linear-gradient(to bottom, rgba(0,0,0,.65), transparent 86%)`
- 边框 `1px solid var(--border-l1)`，圆角 12px

2D 同心环（ECharts graphic）：
- 内环 r = `min(w,h)*.23`，stroke `rgba(75,123,151,.18)`，dash `[4,5]`
- 外环 r = `min(w,h)*.43`，stroke `rgba(156,179,193,.20)`，dash `[4,6]`
- 标签：'直接影响'（内环右，`rgba(75,123,151,.55)`）、'传递影响'（外环右，`rgba(112,135,147,.46)`），font `10px sans-serif`

### 8.3 字体字号

- UI 根字号 13px，字体继承 DSH
- 2D 节点内文字：current 11.5px / 其他 10.2px / section 10px；current 与选中 fontWeight 650，否则 500
- 3D hover label：`${name} · ${ROLE_NAME[role]}`
- 消息流 mini 图节点文字：current 9.7px，其他 9px

### 8.4 坐标 fixture（R-014 决策：写入 spec）

12 个 mock 节点的固定坐标（`src/layout.ts` 默认导出；真实数据布局算法为后续迭代 T5，见 BACKLOG）：

```ts
export const GRAPH_POS_2D: Record<string, [number, number]> = {
  'security-policy': [500, 300], 's-auth': [408, 252], 's-audit': [408, 348],
  'api-access': [520, 112], 'data-retention': [690, 300], 'onboarding': [520, 488],
  'incident-runbook': [240, 82], 'q1-risk': [875, 170], 'compliance': [875, 430],
  'vendor-review': [905, 105], 'audit-log': [245, 430], 'glossary': [105, 505],
}
export const GRAPH_POS_3D: Record<string, [number, number, number]> = {
  'security-policy': [0, 0, 0], 's-auth': [-42, -24, 12], 's-audit': [-42, 24, -12],
  'api-access': [52, -54, 44], 'data-retention': [72, 0, -38], 'onboarding': [52, 54, 34],
  'incident-runbook': [124, -78, -54], 'q1-risk': [144, -24, 66], 'compliance': [138, 54, -58],
  'vendor-review': [176, -54, 58], 'audit-log': [-102, 52, 48], 'glossary': [-158, 68, -44],
}
```

2D 映射函数：

```ts
function graphPoint2D(point: [number, number], width: number, height: number, size: [number, number]): [number, number] {
  const padX = Math.max(104, size[0] / 2 + 24)
  const padY = Math.max(56, size[1] / 2 + 24)
  return [
    Math.max(padX, Math.min(width - padX, point[0] * (width / 1000))),
    Math.max(padY, Math.min(height - padY, point[1] * (height / 600))),
  ]
}
```

2D 节点尺寸：

```ts
function nodeSize2D(n: GraphNode): [number, number] {
  if (n.type === 'section') return [17, 17]
  const width = Math.max(
    n.role === 'current' ? 142 : n.role === 'direct' ? 108 : n.role === 'transitive' ? 96 : 84,
    n.name.length * 6.2 + 26,
  )
  const height = n.role === 'current' ? 44 : n.role === 'direct' ? 36 : n.role === 'transitive' ? 31 : 28
  return [width, height]
}
```

3D 参数：初始相机 `{x:0,y:0,z:250} → {0,0,0}`；`charge.strength(-120)`；`link.distance(76)`；`cooldownTicks(120)`；`nodeRelSize(1)`；`nodeVal = radius^3`。
消息流 mini 图节点尺寸：section `[13,13]`；current `[104,32]`；direct `[84,27]`；其他 `[72,24]`。

---

## 9. UI 组件规格

### 9.1 布局

- Drawer 宽 `min(860px, 94vw)`；`≤1080px` 时 `96vw`；`≤720px` 时 `100vw`。头部高 52px。
- `.dr-bd`：padding 14px 16px 20px，纵向 flex，gap 14px。
- **图谱探索区 `order:-1` 置顶**（图优先，总览与文档列表在下方滚动可见）。
- Graph Workspace grid：`156px minmax(0,1fr) 226px`，gap 12px。
- 响应式：
  - `≤1120px`：`138px minmax(0,1fr)`；inspector 跨列到下方（min-height 0；content 两列 grid；metrics/actions 跨列）
  - `≤720px`：block；rail 两列 grid；stage-body 高 400px；隐藏 `.dr-hd .scope/.version-mark/.sync`

### 9.2 组件清单

| 组件 | 文件 | 说明 |
|------|------|------|
| DocGraphDock | `client/DocGraphDock.tsx` | 输入框上方；显示四态 + `{rootPath} · {docs} 文档 · {nodes} 节点 · {edges} 边` + 「状态」「面板」按钮 |
| IndexStatusCard | `client/cards/IndexStatusCard.tsx` | 统计 4 格 + 格式分布条 + 图例 + 尾注「文件变更会自动增量同步」；索引中显示四态标记（无百分比） |
| DriftAuditCard | `client/cards/DriftAuditCard.tsx` | 严重度汇总 + finding 列表（code/标题/详情/动作）；`actionable:false` 显示 off 态 |
| GraphCard | `client/cards/GraphCard.tsx` | 消息内 mini 2D 图（**独立简化 renderer**，`layout:'force'`，不复用 Graph2D）+「在面板中打开（3D/2D）」按钮；点击节点 → openDrawer + focusNode |
| ContextCard | `client/cards/ContextCard.tsx` | 列表项（标题/路径/入引/章节 chips/状态 chip）+ 展开源片段；files 模式为纯文件列表 |
| DocGraphDrawer | `client/drawer/DocGraphDrawer.tsx` | mask + drawer 容器；4 个打开入口（dock 按钮、GraphCard 按钮、topbar 按钮、侧栏 nav）；Escape/遮罩/✕ 关闭 |
| OverviewSection | `client/drawer/OverviewSection.tsx` | 5 统计（文档/节点/引用边/实体/解析失败）+ 格式分布 |
| DocListSection | `client/drawer/DocListSection.tsx` | 文档行（格式图标/名称/路径/badge/入引）；**actions 全部 disabled**（§10.3）；行点击 → focusNode |
| GraphWorkspace | `client/drawer/graph/GraphWorkspace.tsx` | 三栏容器 + 状态（§10.1） |
| GraphRail | `client/drawer/graph/GraphRail.tsx` | 关系范围 5 checkbox（other 默认不勾）+ 影响深度 1/2/3（trace 模式隐藏）+ 尾注 |
| GraphCanvas | `client/drawer/graph/GraphCanvas.tsx` | toolbar（seg 2D/3D + canvas-status + 重置视图）+ stage-body + canvas-hint + fallback |
| Graph2D | `client/drawer/graph/Graph2D.tsx` | ECharts，`layout:'none'`，§8 全部样式 |
| Graph3D | `client/drawer/graph/Graph3D.tsx` | 3d-force-graph，§8 全部样式 |
| Inspector | `client/drawer/graph/Inspector.tsx` | 空态/内容态；kicker/h3/code/p/metrics（入引/出引）/actions |

### 9.3 Drawer 控制器（R-015 决策）

- `client/DocGraphUIContext.tsx` 导出 `DocGraphUIContext`，提供：
  ```ts
  {
    openDrawer(sessionId: string, payload?: DocGraphPayload): void
    closeDrawer(sessionId: string): void
    focusNode(sessionId: string, nodeId: string): void
    setPayload(sessionId: string, payload: DocGraphPayload): void
    getState(sessionId: string): SessionGraphState | undefined
  }
  ```
- 卡片与 dock 通过 `useContext(DocGraphUIContext)` 联动，**禁止直接操作 DOM / 跨组件查询**。
- 宿主入口（R-015）：必选 `conversation.input.dock`（id: `docgraph-dock`）；可选 `conversation.session.header.actions`（topbar 按钮）与 `sidebar.footer.action`（侧栏 nav）——以宿主运行时声明的 slot 为准，未声明则跳过并降级为 dock 入口，不报错。
- 卸载清理：插件 client `apply` 返回的 disposer 中注销全部 slot 注册并清空 session Map。

---

## 10. 交互规格

### 10.1 GraphWorkspace 状态

```ts
const [activeRoles, setActiveRoles] = useState<Set<Role>>(new Set(['current','direct','transitive','section']))
const [activeDepth, setActiveDepth] = useState(2)
const [selectedNodeId, setSelectedNodeId] = useState<string | null>(payload.seedNodeId ?? firstVisible ?? null)
const [mode, setMode] = useState<GraphMode>('2d')
```

派生：

```ts
const visibleNodes = nodes.filter(n => activeRoles.has(n.role) && ROLE_DEPTH[n.role] <= activeDepth)
const visibleLinks = links.filter(l => idSet.has(l.source) && idSet.has(l.target))
const isSelectedLink = (l) => selectedNodeId !== null && (l.source === selectedNodeId || l.target === selectedNodeId)
// ROLE_DEPTH = { current:0, section:1, direct:1, transitive:2, other:3 }
```

### 10.2 事件流

| 事件 | 行为 |
|------|------|
| 点击 2D 节点 | `showTip(id)` = updateInspector + render2D + render3D |
| 点击 3D 节点 | updateInspector + refresh3DSelection |
| 点击文档列表行 | 行 `.sel` + `focusNode(id)` |
| 角色 checkbox 变化 | 更新 activeRoles；选中节点被过滤 → clearInspector；重渲 2D/3D |
| 深度按钮点击 | 更新 activeDepth（1/2/3）；选中节点深度超限 → clearInspector，否则 updateInspector；重渲 2D/3D；toast「影响深度已切换为 N」 |
| 2D/3D 切换 | 更新 mode/aria-selected/display/modeHint/canvasHint；3D 时 80ms 后 resize3D |
| 重置视图 | 3D：d3ReheatSimulation 后 550ms（reduced 250ms）zoomToFit；2D：dispatchAction restore + toast |
| Inspector「查看文档」 | toast「打开 {name}（MVP 未接 docgraph_node 跳转）」 |
| Inspector「聚焦节点」 | focusNode(selectedNodeId) |
| Escape | drawer 开 → 关闭；否则 clearInspector |
| dock「状态」 | 触发 docgraph_status 刷新（通过 DSH follow-up 机制，MVP 若不可用则 toast「请直接询问图谱状态」） |
| dock「面板」/ GraphCard「在面板中打开」 | openDrawer(sessionId, payload) |

### 10.3 文档列表 actions（R-008 决策）

- 「重建/替换/重解析/移除」按钮 MVP 全部 **disabled**，`title="即将支持"`，不触发 toast。
- 「＋ 添加文件」按钮 disabled 同上。
- Drawer header「重建全部」映射为模型调用 `docgraph_index(force=true)` 的 follow-up 意图；MVP 客户端只渲染按钮并置灰 + `title="请让模型执行 docgraph_index force"`。

### 10.4 focusNode / seed 回退

```ts
function focusNode(id: string): void {
  const node = nodes.find(n => n.id === id); if (!node) return
  if (!activeRoles.has(node.role)) { setActiveRoles(prev => new Set(prev).add(node.role)); 勾选对应 checkbox }
  if (ROLE_DEPTH[node.role] > activeDepth) { setActiveDepth(ROLE_DEPTH[node.role]); 同步深度按钮 on 态 }
  setSelectedNodeId(id)
  updateInspector(id)
  render2D(); render3D()
  mode === '3d' ? focusNode3D(id) : focusNode2D(id)
}
```

- `focusNode2D`：downplay 全部 → highlight 目标 dataIndex（从 visibleNodes 查找；找不到则直接 return 不报错）。
- `focusNode3D`：`cameraPosition({x,y,z+120}, {x,y,z}, 900)`（坐标取 GRAPH_POS_3D）。
- seed 回退顺序见 §6.3；seed 不存在时 Drawer 初始为空态（canvas-status「未选择节点」），不显示错误。

### 10.5 Inspector

- 空态：glyph `⌁` + 「选择一个节点」+「节点详情会固定显示在这里，不会遮住图谱。」
- 内容态：kicker（ROLE_NAME[role]，10px business 色大写）+ h3（15px）+ code（relPath 或「章节节点 · 来自当前文档」）+ p（`{ROLE_NAME[role]}关系 · 当前深度 {activeDepth}`）+ metrics（入引 `inboundTotal` / 出引 `outboundTotal`，20px tabular-nums）+ actions。
- 指标用 **total**（§4.2 全量字段），与画布 visible 数可不同；画布工具栏显示可见数。

### 10.6 无障碍（R-017 决策）

- 文档列表是**可访问的节点列表**：每行 `role="button"`、`tabindex=0`、`aria-label="{name} {path} 入引 {inbound}"`、Enter/Space 触发 focusNode。
- 图 canvas 为增强层；`.stage-body` 上监听方向键：↑↓←→ 在 `visibleNodes` 序列中前后移动选择并 updateInspector（顺序 = 数组顺序；无选中时按 Enter 选第一个）。
- 键盘验收：仅键盘可完成「打开 drawer → 选中文档行 → 在图中定位 → 查看 inspector → 切换 2D/3D → 关闭 drawer」。
- focus-visible 轮廓 `2px solid var(--business)`，offset 2px；inspector `aria-live="polite"`；seg `role="tablist"/"tab"` + `aria-selected`；深度按钮 `role="group"` + `aria-label="影响深度"`。

---

## 11. 降级与错误处理（R-016 决策）

### 11.1 引擎降级

- ECharts 模块加载/初始化失败：`g2d=null`，`#g2dFallback` 显示「2D 分析暂时不可用，请切换到 3D 探索。」；seg2d 隐藏。
- 3d-force-graph/THREE 加载/初始化失败：`g3d=null`，seg3d 隐藏，默认 2D。
- 两引擎均不可用：mode='none'，fallback「图谱引擎暂时不可用，请检查本地网络或依赖加载。」，seg 全隐藏。
- **降级验证方式（改）**：单元测试用 `vi.mock` 模拟模块 import 抛错，断言 fallback UI 渲染；**不再以「屏蔽 CDN」为测试条件**（MVP 依赖全部 bundle，无运行时 CDN）。

### 11.2 Core 错误

- core 进程退出：后续工具调用返回错误「docgraph core exited (code N)」；下次调用自动重启一次。
- MCP 请求超时：返回错误 payload `{ kind:'docgraph_status', state:{ phase:'error', lastError:'timeout' }, ... }` 的等价错误文本。
- core 返回 "Indexing in progress"：透出为工具错误文本，不构造假 payload。
- payload 结构校验失败：返回错误「core response validation failed: {path}」，并记日志。

### 11.3 reduced motion / ResizeObserver

- `prefers-reduced-motion: reduce`：全局 transition/animation `.01ms`；3D 粒子 0；fit3D 动画 250ms。
- ResizeObserver 监听 `.stage-body`，150ms debounce 后 `resize3D()`（设 width/height + `zoomToFit(320,64)`）。

---

## 12. 构建与依赖（R-016 决策）

`package.json` 关键内容（完整字段以实现时 `pnpm init` 为基础）：

```json
{
  "name": "@dsh-external/dsh-doc-graph",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/index.d.ts",
  "exports": {
    ".": { "types": "./lib/index.d.ts", "default": "./lib/index.js" },
    "./client": "./lib/client.js",
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "files": ["lib", "src", "assets", "cordis.patch.yml"],
  "scripts": {
    "build": "tsdown && node scripts/copy-assets.mjs",
    "typecheck": "tsc -p tsconfig.json && tsc -p tsconfig.client.json",
    "test": "vitest run",
    "check": "pnpm run typecheck && pnpm run test && pnpm run build"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "inject": ["@deepseek-ai/dsh-client-runtime"], "platform": "web" }
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-fs": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-session": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-skill": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-tools": "^0.1.0-rc.6",
    "@deepseek-ai/schemastery": "^3.18.1",
    "react": "^18.2.0"
  },
  "devDependencies": {
    "@deepseek-ai/cordis": "4.0.1",
    "@deepseek-ai/dsh-client-runtime": "0.1.0-rc.6",
    "@deepseek-ai/dsh-client-ui-conversation": "0.1.0-rc.6",
    "@deepseek-ai/dsh-client-ui-slots": "0.1.0-rc.6",
    "@deepseek-ai/dsh-client-ui-tool": "0.1.0-rc.6",
    "@types/node": "^22.0.0",
    "@types/react": "~18.3.1",
    "@types/react-dom": "^18.3.1",
    "echarts": "^5.5.0",
    "3d-force-graph": "^1.73.4",
    "three": "^0.160.0",
    "react-dom": "^18.2.0",
    "tsdown": "^0.22.2",
    "typescript": "^5.9.3",
    "vitest": "^4.1.1"
  }
}
```

- 打包策略：ECharts、3d-force-graph、three 全部 bundle 进 `lib/client.js`（dsh-visualize 内联 chart 同策略）。**体积门槛**：若 `lib/client.js` 构建产物 > 1.5 MB，则 three + 3d-force-graph 改 external + 动态 `import()`（带 loading/error 边界），并在本 spec 修订时记录该决策。
- `cordis.patch.yml`：
  ```yaml
  - insert:
      - id: dsh-doc-graph
        name: '@dsh-external/dsh-doc-graph'
  ```
- `tsconfig.json`（Node）与 `tsconfig.client.json`（React client）分开；Node 端 target ES2022、module NodeNext；client 端 jsx react-jsx。

---

## 13. 验收清单

- [ ] 会话中首次索引：`docgraph_index` 返回 IndexPayload，IndexStatusCard 显示四态（无百分比）与统计；dock 出现
- [ ] 2D 图：文档=圆角矩形（自定义 SVG path）、章节=菱形；current 深蓝实底白字、direct 浅蓝底；同心环与标签渲染；默认选中 seed（描边加粗+阴影）
- [ ] 3D 图：全部球体（核心球+光晕）；role 半径/颜色符合 §8.2；contains 无箭头、references 有箭头；选中边 1 个粒子（reduced motion 为 0）
- [ ] 筛选：取消 direct → 对应节点/边消失；深度 1 → transitive 消失；选中节点被过滤 → inspector 空态
- [ ] 点击节点（2D/3D）：inspector 显示 role/名称/路径/入引 total/出引 total；canvas-status 更新；两视图同步高亮
- [ ] 文档列表：点击行 → 行高亮 + 图定位（自动启用 role 筛选与所需深度）；actions 按钮全部 disabled（title 即将支持）
- [ ] 消息流：4 类卡片正确路由（`docgraph_context format=drift_audit` 必须落在 DriftAuditCard）；GraphCard mini 图点击节点打开 drawer 并定位
- [ ] 降级：vi.mock 模拟 ECharts 加载失败 → 2D fallback；模拟 3d-force-graph 失败 → seg3d 隐藏；双失败 → fallback 文案
- [ ] 响应式：1120px 两栏、720px 单栏、1080px drawer 96vw
- [ ] 键盘：仅键盘完成「打开 drawer → 文档行 Enter 定位 → 方向键切换节点 → 2D/3D 切换 → Escape 关闭」
- [ ] 会话重放：卡片从 presentationMeta 恢复；drawer 默认关闭；旧 session 状态不串到新 session
- [ ] 路径安全：`path="../etc"`、绝对路径、symlink escape 均返回工具错误
- [ ] core 进程：退出后下次调用自动重启一次；`docgraph_index force` 按 §3.2 串行执行且期间查询返回 "Indexing in progress" 不崩溃

---

## 14. 附录：废弃清单（R-018 收敛）

| 历史描述 | 最终决策 |
|---------|---------|
| ui-design.md 状态标签 `superseded` 未纳入类型 | `ContextResult.statusTag.kind` 扩展 `'superseded'` |
| 漂移严重度多处写法（err/warn/ok、错误/警告/提示） | 统一 `'err'|'warn'|'ok'`，UI 文案 错误/警告/提示 |
| spec-design §9.3 按 kind 含 `drift` 路由 | 废弃；按 `payload.kind === 'docgraph_drift'` 精确匹配 |
| spec-design §10 三种 core 调用方案并列 | 废弃；唯一方案 = 长驻 MCP stdio client（§3.1） |
| spec-design §10 EPERM 临时 JSON 文件交换 | 废弃；不预写绕过方案 |
| spec-design 中 dock 显示 62% 进度 | 废弃；四态显示，无伪精确百分比 |
| spec-design 中「最近索引 2 分钟前」硬编码 | 废弃；由 `indexedAt/finishedAt` 客户端渲染相对时间 |
| spec-design 中 docgraph_graph depth 默认 1 上限 3 | 废弃；impact 默认 2 上限 5（对齐 core），UI 按钮 1/2/3 |
| spec-design 中 trace 使用 `document` 参数 | 废弃；trace 独立 `from`/`to` schema |
| spec-design 中「屏蔽 CDN」降级测试 | 废弃；vi.mock 模拟模块失败 |
| dsh-mock-demo-v5 中 actions 按钮可点击 toast | 废弃；MVP disabled 占位 |
