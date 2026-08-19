# dsh-doc-graph 实现计划（Implementation Plan）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `docs/superpowers/specs/dsh-doc-graph-spec.md` 在 `cerebro-graph/dsh-doc-graph` 中实现 DSH 文档图谱插件（Node 端 9 个 `docgraph_*` 工具 + 长驻 MCP core 桥接；Client 端 toolview 卡片、dock、Graph Drawer）。

**Architecture:** Node 端（Cordis）注册 9 个 `docgraph_*` 工具与 bundled skill；工具经 `core.ts` 的 `JsonRpcClient`/`DocGraphCoreManager` 与长驻 `docgraph serve` 进程以 MCP stdio（JSON-RPC 2.0，行分隔）通信。Client 端以 `DocGraphUIContext`（按 sessionId 隔离的 store）联动 9 个 toolview key、`conversation.input.dock` 的 dock、以及覆盖层 Graph Drawer（ECharts 2D + 3d-force-graph 3D）。

**Tech Stack:** TypeScript 5.9 / Cordis 4.0.1 / dsh-tools（defineTool）/ React 18 / ECharts 5.5 / 3d-force-graph 1.73 / three 0.160 / Vitest 4 / tsdown。

## Global Constraints

- 唯一生效 spec：`docs/superpowers/specs/dsh-doc-graph-spec.md`；冲突时以 spec 为准，其次 `docs/dsh-mock-demo-v5.html` 仅作视觉参照。
- 所有 payload 带 `schemaVersion: 1` 与判别字段 `kind`；禁止 `as GraphPayload` 强转，`core.ts` 对每个 core 响应做手写 type guard 校验。
- 通信协议唯一方案：长驻 MCP stdio client，不 spawn 一次性 CLI，不直接读 SQLite。
- 索引 owner 是长驻 serve 进程；`docgraph_index force=true` 按 spec §3.2 串行执行；插件不暴露百分比，`IndexState.phase` 四态 `starting|indexing|ready|error`。
- 路径安全：所有工具路径参数经 `resolveRelPath`（拒绝空串、绝对路径、`..`、symlink escape）。
- 客户端 toolview 按 `payload.kind` 精确匹配路由，不按字符串包含 `drift` 猜测。
- MVP 文档列表 mutations 全部 disabled 占位；多 workspace、follow-up 发消息、embeddings 不做。
- 打包策略：ECharts、3d-force-graph、three 全部 bundle 进 `lib/client.js`；若产物 > 1.5 MB 再改 external + 动态 import（本计划按内联执行）。
- 降级测试用 `vi.mock` 模拟模块 import 抛错断言 fallback UI，不以「屏蔽 CDN」为测试条件。
- 每完成一个 Task 立即 `git add` + `git commit`；提交信息按 Task 给出的命令。

---

## File Structure

```
cerebro-graph/dsh-doc-graph/
├── package.json                     # §12 完整字段
├── cordis.patch.yml                 # insert id: dsh-doc-graph
├── tsconfig.json                    # Node 端：target ES2022, module NodeNext
├── tsconfig.client.json             # Client 端：jsx react-jsx
├── vitest.config.ts                 # esbuild jsx automatic（.tsx 测试用）
├── scripts/copy-assets.mjs          # 复制 assets/doc-graph-skill.md → lib/assets/
├── assets/doc-graph-skill.md        # bundled skill 正文
├── src/
│   ├── index.ts                     # Node 入口：注册 9 工具 + skill provider
│   ├── types.ts                     # §4 全部类型 + nodeId + ROLE 常量 + 手写 type guard
│   ├── palette.ts                   # §8.2 色板常量
│   ├── layout.ts                    # §8.4 坐标 fixture + 映射函数 + SVG symbol 路径
│   ├── core.ts                      # §3/§5/§6：JsonRpcClient + DocGraphCoreManager + 路径 + 映射
│   ├── tool.ts                      # §7 九个 docgraph_* 工具定义
│   ├── skill.ts                     # bundled skill provider
│   ├── types.test.ts                # types.ts 单测
│   ├── layout.test.ts               # layout.ts 单测
│   ├── core.test.ts                 # core.ts 路径/JSON-RPC/映射 单测
│   ├── tool.test.ts                 # tool.ts 参数校验/presentationMeta 单测
│   ├── skill.test.ts                # skill provider 单测
│   └── client/
│       ├── index.tsx                # 客户端入口：toolview + dock + UIContext
│       ├── theme.ts                 # --dsw-alias-* token 桥接
│       ├── DocGraphUIContext.tsx    # Drawer controller + session 隔离 store + hooks
│       ├── DocGraphDock.tsx         # 输入框 dock
│       ├── docgraph.css             # §8/§9/§10 全部样式
│       ├── store.test.ts            # store 单测（纯 TS）
│       ├── cards.test.tsx           # 卡片路由 SSR 测试
│       ├── drawer.test.tsx          # Overview/DocList SSR 测试
│       ├── workspace.test.tsx       # Rail/Inspector SSR 测试
│       ├── graph.test.tsx           # 引擎降级 + chooseMode 测试
│       ├── cards/
│       │   ├── CardDispatcher.tsx   # 按 payload.kind 路由到 4 类卡片（9 个 toolview key 共用）
│       │   ├── IndexStatusCard.tsx
│       │   ├── DriftAuditCard.tsx
│       │   ├── GraphCard.tsx
│       │   └── ContextCard.tsx
│       └── drawer/
│           ├── DocGraphDrawer.tsx
│           ├── OverviewSection.tsx
│           ├── DocListSection.tsx
│           └── graph/
│               ├── GraphWorkspace.tsx
│               ├── GraphRail.tsx
│               ├── GraphCanvas.tsx
│               ├── Graph2D.tsx
│               ├── Graph3D.tsx
│               └── Inspector.tsx
```

**Interfaces（全局约定，后续任务引用）**

- `src/types.ts` 导出：`Role, NodeType, LinkKind, GraphMode, DocStatus, GraphOperation, IndexPhase, GraphNode, GraphLink, DocRecord, IndexState, IndexPayload, GraphPayload, DriftPayload, ContextPayload, FilesPayload, DocGraphPayload, ContextResult, DriftFinding, Summary, ROLE_DEPTH, ROLE_NAME, nodeId, isDocGraphPayload` 及各 payload guard。
- `src/palette.ts` 导出：`COLORS, FILLS, NODE_TEXT_2D, EDGE_2D, EDGE_ARROW_2D, ROLE_STYLE_3D, EDGE_3D, SELECTED_2D, CURRENT_2D, SELECTED_3D, STAGE_BACKGROUND, RING_INNER, RING_OUTER, RING_LABEL_INNER, RING_LABEL_OUTER, FONT_2D, FONT_MINI`。
- `src/layout.ts` 导出：`GRAPH_POS_2D, GRAPH_POS_3D, graphPoint2D, nodeSize2D, nodeSizeMini, layoutKeyFor, posFor2D, posFor3D, docSymbolPath, sectionSymbolPath`。
- `src/core.ts` 导出：`ToolError, getProjectRoot, resolveRelPath, encodeJsonRpc, parseJsonRpcLine, JsonRpcClient, DocGraphCoreManager, mapGraphResult, mapStatusResult, mapContextResult, mapFilesResult, mapDriftResult, assertPayload`。
- `src/tool.ts` 导出：`DOCGRAPH_TOOL_NAMES`（9 个名字的数组）与 `docgraphTools(ctx)`（返回 9 个 ToolDefinition 数组）。
- `src/skill.ts` 导出：`docGraphSkillProvider`。
- `src/client/DocGraphUIContext.tsx` 导出：`DocGraphUIContext, DocGraphUIProvider, useDocGraphUI, useSessionGraphState, SessionGraphState`。
- `src/client/cards/CardDispatcher.tsx` 导出：`ToolviewCard`（注册为 9 个 toolview key 的组件）。

---

### Task 1: 项目脚手架 + types.ts（类型与 guard）

**Files:**
- Create: `package.json`, `cordis.patch.yml`, `tsconfig.json`, `tsconfig.client.json`, `vitest.config.ts`, `scripts/copy-assets.mjs`
- Create: `src/types.ts`
- Test: `src/types.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `src/types.ts` 的全部类型与 guard，后续所有任务引用；`package.json` 的 `check/test/build` 脚本为后续任务验证入口。

- [ ] **Step 1: 写 package.json**

`package.json`（spec §12 关键内容 + description/license）：

```json
{
  "name": "@dsh-external/dsh-doc-graph",
  "description": "DSH document knowledge-graph plugin: docgraph_* tools, a long-lived MCP core bridge, and a graph drawer UI.",
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
  },
  "license": "BSD-3-Clause"
}
```

> tsdown 默认会按 `exports` 同时构建 `lib/index.js`（Node 入口）与 `lib/client.js`（`src/client/index.tsx`），与 `dsh-visualize` 同策略，无需 `tsdown.config.ts`。

- [ ] **Step 2: 写 cordis.patch.yml**

```yaml
# dsh bundle patch: inserts this plugin into a profile's layer stack.
- insert:
    - id: dsh-doc-graph
      name: '@dsh-external/dsh-doc-graph'
```

- [ ] **Step 3: 写 tsconfig.json（Node 端）**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "lib",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/client", "src/**/*.test.ts"]
}
```

- [ ] **Step 4: 写 tsconfig.client.json（Client 端）**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"]
  },
  "include": ["src/types.ts", "src/palette.ts", "src/layout.ts", "src/client/**/*.ts", "src/client/**/*.tsx"],
  "exclude": ["src/**/*.test.ts", "src/client/**/*.test.ts"]
}
```

- [ ] **Step 5: 写 vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: { jsx: 'automatic' },
})
```

- [ ] **Step 6: 写 scripts/copy-assets.mjs**

```js
/**
 * Keep lib/ self-contained for static package scans: copy the bundled skill
 * body into lib/assets/. Runtime resolution in skill.ts uses the package-root
 * assets/ (package.json `files` ships it), so this copy is a packaging aid,
 * not the runtime source.
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
mkdirSync(join(root, 'lib', 'assets'), { recursive: true })
copyFileSync(
  join(root, 'assets', 'doc-graph-skill.md'),
  join(root, 'lib', 'assets', 'doc-graph-skill.md'),
)
console.log('copied assets/doc-graph-skill.md -> lib/assets/doc-graph-skill.md')
```

- [ ] **Step 7: 写 src/types.ts（spec §4 全部类型 + nodeId + ROLE 常量 + 手写 guard）**

```ts
/**
 * §4 data contract. Every payload carries schemaVersion: 1 and a discriminant
 * `kind`. Core responses are checked by hand-written type guards (no `as`
 * casts to payload types, no third-party validator).
 */

export type Role = 'current' | 'direct' | 'transitive' | 'section' | 'other'
export type NodeType = 'doc' | 'section'
export type LinkKind = 'contains' | 'references'
export type GraphMode = '2d' | '3d'
export type DocStatus = 'ok' | 'changed' | 'err'
export type GraphOperation = 'incoming' | 'outgoing' | 'impact' | 'trace'
export type IndexPhase = 'starting' | 'indexing' | 'ready' | 'error'

export interface GraphNode {
  id: string
  project: string
  name: string
  type: NodeType
  role: Role
  relPath: string
  anchor?: string
  val: number
  inboundTotal: number
  outboundTotal: number
}

export interface GraphLink {
  source: string
  target: string
  kind: LinkKind
}

export interface DocRecord {
  id: string
  project: string
  name: string
  path: string
  fmt: 'md' | 'docx' | 'pdf' | 'html' | 'txt' | string
  status: DocStatus
  inbound: number
  sizeBytes: number
  updatedAt: number
  indexedAt: number
}

export interface IndexState {
  phase: IndexPhase
  startedAt?: number
  finishedAt?: number
  lastError?: string
  revision: number
}

export interface Summary {
  docs: number
  nodes: number
  edges: number
  entities: number
  failed: number
  formats: { fmt: string; pct: number }[]
}

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
  operation: GraphOperation
  depth?: number
  nodes: GraphNode[]
  links: GraphLink[]
  dropped: { nodes: number; links: number }
}

export interface DriftFinding {
  code: string
  severity: 'err' | 'warn' | 'ok'
  title: string
  detail: string
  actionable: boolean
  actionLabel?: string
  docs: { id: string; name: string }[]
}

export interface DriftPayload {
  schemaVersion: 1
  kind: 'docgraph_drift'
  project: string
  findings: DriftFinding[]
}

export interface ContextResult {
  id: string
  project: string
  title: string
  location: string
  docPath: string
  score?: number
  inbound: number
  chips: string[]
  statusTag?: { label: string; kind: 'active' | 'stale' | 'hot' | 'superseded' }
  snippet?: string
}

export interface ContextPayload {
  schemaVersion: 1
  kind: 'docgraph_context'
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

export type DocGraphPayload =
  | IndexPayload
  | GraphPayload
  | DriftPayload
  | ContextPayload
  | FilesPayload

/** §10.1 role → depth for filtering. */
export const ROLE_DEPTH: Record<Role, number> = {
  current: 0,
  section: 1,
  direct: 1,
  transitive: 2,
  other: 3,
}

/** Chinese role display names used by Inspector kicker and 3D hover labels. */
export const ROLE_NAME: Record<Role, string> = {
  current: '当前文档',
  direct: '直接影响',
  transitive: '传递影响',
  section: '章节',
  other: '其他',
}

/** §4.4 stable namespaced id: project + relPath + optional anchor. */
export function nodeId(project: string, relPath: string, anchor?: string): string {
  return `${project}::${relPath}${anchor ? `::${anchor}` : ''}`
}

// ---- hand-written runtime structure guards ----

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'
const isArr = (v: unknown): v is unknown[] => Array.isArray(v)

const isRole = (v: unknown): v is Role => isStr(v) && ['current', 'direct', 'transitive', 'section', 'other'].includes(v)
const isNodeType = (v: unknown): v is NodeType => v === 'doc' || v === 'section'
const isLinkKind = (v: unknown): v is LinkKind => v === 'contains' || v === 'references'
const isDocStatus = (v: unknown): v is DocStatus => v === 'ok' || v === 'changed' || v === 'err'
const isIndexPhase = (v: unknown): v is IndexPhase => isStr(v) && ['starting', 'indexing', 'ready', 'error'].includes(v)

export function isIndexState(v: unknown): v is IndexState {
  if (!isObj(v)) return false
  if (!isIndexPhase(v.phase)) return false
  if (!isNum(v.revision)) return false
  if ('startedAt' in v && v.startedAt !== undefined && !isNum(v.startedAt)) return false
  if ('finishedAt' in v && v.finishedAt !== undefined && !isNum(v.finishedAt)) return false
  if ('lastError' in v && v.lastError !== undefined && !isStr(v.lastError)) return false
  return true
}

export function isSummary(v: unknown): v is Summary {
  if (!isObj(v)) return false
  if (!isNum(v.docs) || !isNum(v.nodes) || !isNum(v.edges) || !isNum(v.entities) || !isNum(v.failed)) return false
  if (!isArr(v.formats)) return false
  return v.formats.every(f => isObj(f) && isStr(f.fmt) && isNum(f.pct))
}

export function isDocRecord(v: unknown): v is DocRecord {
  if (!isObj(v)) return false
  return isStr(v.id) && isStr(v.project) && isStr(v.name) && isStr(v.path) && isStr(v.fmt)
    && isDocStatus(v.status) && isNum(v.inbound) && isNum(v.sizeBytes) && isNum(v.updatedAt) && isNum(v.indexedAt)
}

export function isGraphNode(v: unknown): v is GraphNode {
  if (!isObj(v)) return false
  return isStr(v.id) && isStr(v.project) && isStr(v.name) && isNodeType(v.type) && isRole(v.role)
    && isStr(v.relPath) && isNum(v.val) && isNum(v.inboundTotal) && isNum(v.outboundTotal)
    && ('anchor' in v ? v.anchor === undefined || isStr(v.anchor) : true)
}

export function isGraphLink(v: unknown): v is GraphLink {
  if (!isObj(v)) return false
  return isStr(v.source) && isStr(v.target) && isLinkKind(v.kind)
}

export function isContextResult(v: unknown): v is ContextResult {
  if (!isObj(v)) return false
  return isStr(v.id) && isStr(v.project) && isStr(v.title) && isStr(v.location) && isStr(v.docPath)
    && isNum(v.inbound) && isArr(v.chips) && v.chips.every(isStr)
    && ('score' in v ? v.score === undefined || isNum(v.score) : true)
    && ('statusTag' in v ? v.statusTag === undefined || (isObj(v.statusTag) && isStr(v.statusTag.label) && ['active', 'stale', 'hot', 'superseded'].includes(v.statusTag.kind as string)) : true)
    && ('snippet' in v ? v.snippet === undefined || isStr(v.snippet) : true)
}

export function isDriftFinding(v: unknown): v is DriftFinding {
  if (!isObj(v)) return false
  return isStr(v.code) && ['err', 'warn', 'ok'].includes(v.severity as string) && isStr(v.title) && isStr(v.detail)
    && isBool(v.actionable) && isArr(v.docs)
    && v.docs.every(d => isObj(d) && isStr(d.id) && isStr(d.name))
    && ('actionLabel' in v ? v.actionLabel === undefined || isStr(v.actionLabel) : true)
}

export function isIndexPayload(v: unknown): v is IndexPayload {
  if (!isObj(v)) return false
  return v.schemaVersion === 1 && (v.kind === 'docgraph_index' || v.kind === 'docgraph_status')
    && isStr(v.project) && isStr(v.rootPath) && isIndexState(v.state) && isSummary(v.summary)
    && isArr(v.docs) && v.docs.every(isDocRecord)
}

export function isGraphPayload(v: unknown): v is GraphPayload {
  if (!isObj(v)) return false
  return v.schemaVersion === 1 && v.kind === 'docgraph_graph' && isStr(v.project) && isStr(v.seedNodeId)
    && ['incoming', 'outgoing', 'impact', 'trace'].includes(v.operation as string)
    && isArr(v.nodes) && v.nodes.every(isGraphNode) && isArr(v.links) && v.links.every(isGraphLink)
    && isObj(v.dropped) && isNum(v.dropped.nodes) && isNum(v.dropped.links)
    && ('depth' in v ? v.depth === undefined || isNum(v.depth) : true)
}

export function isDriftPayload(v: unknown): v is DriftPayload {
  if (!isObj(v)) return false
  return v.schemaVersion === 1 && v.kind === 'docgraph_drift' && isStr(v.project)
    && isArr(v.findings) && v.findings.every(isDriftFinding)
}

export function isContextPayload(v: unknown): v is ContextPayload {
  if (!isObj(v)) return false
  return v.schemaVersion === 1 && v.kind === 'docgraph_context' && isStr(v.project)
    && isArr(v.results) && v.results.every(isContextResult) && isBool(v.truncated)
}

export function isFilesPayload(v: unknown): v is FilesPayload {
  if (!isObj(v)) return false
  return v.schemaVersion === 1 && v.kind === 'docgraph_files' && isStr(v.project)
    && isArr(v.files) && v.files.every(isDocRecord) && isBool(v.truncated)
}

export function isDocGraphPayload(v: unknown): v is DocGraphPayload {
  return isIndexPayload(v) || isGraphPayload(v) || isDriftPayload(v) || isContextPayload(v) || isFilesPayload(v)
}
```


- [ ] **Step 8: 写失败测试 src/types.test.ts**

```ts
import { describe, expect, it } from 'vitest'
import {
  isDocGraphPayload, isGraphNode, isGraphPayload, isIndexPayload, nodeId, ROLE_DEPTH,
} from './types.ts'

describe('nodeId', () => {
  it('namespaces project + relPath', () => {
    expect(nodeId('demo', 'a/b.md')).toBe('demo::a/b.md')
  })
  it('appends anchor with :: separator', () => {
    expect(nodeId('demo', 'a/b.md', 'intro')).toBe('demo::a/b.md::intro')
  })
  it('omits anchor when undefined', () => {
    expect(nodeId('demo', 'a/b.md', undefined)).toBe('demo::a/b.md')
  })
})

describe('ROLE_DEPTH', () => {
  it('maps current=0 section/direct=1 transitive=2 other=3', () => {
    expect(ROLE_DEPTH).toEqual({ current: 0, section: 1, direct: 1, transitive: 2, other: 3 })
  })
})

describe('type guards', () => {
  const node = {
    id: 'demo::a.md', project: 'demo', name: 'a', type: 'doc', role: 'direct',
    relPath: 'a.md', val: 2, inboundTotal: 3, outboundTotal: 1,
  }
  it('accepts a valid GraphNode', () => {
    expect(isGraphNode(node)).toBe(true)
  })
  it('rejects a node missing role', () => {
    const { role: _drop, ...rest } = node
    expect(isGraphNode(rest)).toBe(false)
  })

  it('accepts a valid IndexPayload', () => {
    const payload = {
      schemaVersion: 1, kind: 'docgraph_status', project: 'demo', rootPath: '/x',
      state: { phase: 'ready', revision: 2, finishedAt: 1 },
      summary: { docs: 1, nodes: 2, edges: 3, entities: 4, failed: 0, formats: [{ fmt: 'md', pct: 100 }] },
      docs: [{ id: 'demo::a.md', project: 'demo', name: 'a', path: 'a.md', fmt: 'md', status: 'ok', inbound: 1, sizeBytes: 10, updatedAt: 0, indexedAt: 0 }],
    }
    expect(isIndexPayload(payload)).toBe(true)
    expect(isDocGraphPayload(payload)).toBe(true)
  })

  it('rejects GraphPayload with bad dropped shape', () => {
    const payload = {
      schemaVersion: 1, kind: 'docgraph_graph', project: 'demo', seedNodeId: 'demo::a.md',
      operation: 'impact', depth: 2, nodes: [node], links: [],
      dropped: { nodes: 0 },
    }
    expect(isGraphPayload(payload)).toBe(false)
  })
})
```

- [ ] **Step 9: 运行测试确认失败**

Run: `pnpm test -- src/types.test.ts`
Expected: FAIL —— `Cannot find module './types.ts'`（types.ts 尚未创建；若步骤 7 已创建则该命令应为 PASS，本步骤保留为「先跑测试」的 TDD 仪式：在实际操作时先写测试后写实现，顺序可在执行时把 Step 8 提到 Step 7 之前）。

- [ ] **Step 10: 运行测试确认通过**

Run: `pnpm test -- src/types.test.ts`
Expected: PASS（3 个 describe 全绿）

- [ ] **Step 11: 安装依赖并提交**

```bash
pnpm install
git add package.json cordis.patch.yml tsconfig.json tsconfig.client.json vitest.config.ts scripts/copy-assets.mjs src/types.ts src/types.test.ts
git commit -m "feat(doc-graph): scaffold package and data contract types"
```

---

### Task 2: palette.ts + layout.ts（色板、坐标 fixture 与映射）

**Files:**
- Create: `src/palette.ts`, `src/layout.ts`
- Test: `src/layout.test.ts`

**Interfaces:**
- Consumes: `src/types.ts` 的 `GraphNode, Role`
- Produces: `COLORS, FILLS, NODE_TEXT_2D, EDGE_2D, ROLE_STYLE_3D, EDGE_3D, SELECTED_2D, CURRENT_2D, STAGE_BACKGROUND, RING_*`；`GRAPH_POS_2D, GRAPH_POS_3D, graphPoint2D, nodeSize2D, nodeSizeMini, layoutKeyFor, posFor2D, posFor3D, docSymbolPath, sectionSymbolPath`

- [ ] **Step 1: 写失败测试 src/layout.test.ts**

```ts
import { describe, expect, it } from 'vitest'
import type { GraphNode } from './types.ts'
import {
  GRAPH_POS_2D, GRAPH_POS_3D, docSymbolPath, graphPoint2D, layoutKeyFor,
  nodeSize2D, nodeSizeMini, posFor2D, posFor3D, sectionSymbolPath,
} from './layout.ts'

function docNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 'demo::security-policy.md', project: 'demo', name: 'security-policy', type: 'doc',
    role: 'current', relPath: 'security-policy.md', val: 5, inboundTotal: 3, outboundTotal: 2,
    ...overrides,
  }
}

describe('graphPoint2D', () => {
  it('scales fixture point to canvas and clamps to padding', () => {
    expect(graphPoint2D([500, 300], 1000, 600, [40, 20])).toEqual([500, 300])
    expect(graphPoint2D([0, 0], 1000, 600, [40, 20])[0]).toBe(104)
    expect(graphPoint2D([0, 0], 1000, 600, [40, 20])[1]).toBe(56)
    expect(graphPoint2D([2000, 2000], 1000, 600, [40, 20])[0]).toBe(1000 - 104)
  })
})

describe('nodeSize2D', () => {
  it('section nodes are 17x17 diamonds', () => {
    expect(nodeSize2D(docNode({ type: 'section' }))).toEqual([17, 17])
  })
  it('current doc nodes are at least 142x44', () => {
    expect(nodeSize2D(docNode({ role: 'current' }))).toEqual([142, 44])
  })
  it('direct doc nodes are at least 108x36', () => {
    expect(nodeSize2D(docNode({ role: 'direct' }))).toEqual([108, 36])
  })
  it('width grows with long names', () => {
    const [w] = nodeSize2D(docNode({ role: 'direct', name: 'a-very-long-document-name' }))
    expect(w).toBeGreaterThan(108)
  })
})

describe('nodeSizeMini', () => {
  it('sizes section and current per §8.4', () => {
    expect(nodeSizeMini(docNode({ type: 'section' }))).toEqual([13, 13])
    expect(nodeSizeMini(docNode({ role: 'current' }))).toEqual([104, 32])
    expect(nodeSizeMini(docNode({ role: 'direct' }))).toEqual([84, 27])
    expect(nodeSizeMini(docNode({ role: 'other' }))).toEqual([72, 24])
  })
})

describe('layout fixture', () => {
  it('has the 12 spec fixture keys', () => {
    const keys = ['security-policy', 's-auth', 's-audit', 'api-access', 'data-retention', 'onboarding',
      'incident-runbook', 'q1-risk', 'compliance', 'vendor-review', 'audit-log', 'glossary']
    for (const key of keys) {
      expect(GRAPH_POS_2D[key], key).toBeDefined()
      expect(GRAPH_POS_3D[key], key).toBeDefined()
    }
  })
  it('resolves fixture key by node name', () => {
    expect(layoutKeyFor(docNode({ name: 's-auth' }))).toBe('s-auth')
  })
  it('returns null for unknown nodes', () => {
    expect(layoutKeyFor(docNode({ name: 'unknown-doc' }))).toBeNull()
  })
})

describe('posFor2D / posFor3D fallbacks', () => {
  it('returns mapped fixture coordinates for known nodes', () => {
    expect(posFor2D(docNode({ name: 'security-policy' }), 0, 1000, 600)).toEqual([500, 300])
  })
  it('returns deterministic fallback for unknown nodes inside the canvas', () => {
    const [x, y] = posFor2D(docNode({ name: 'unknown' }), 0, 1000, 600)
    expect(x).toBeGreaterThanOrEqual(104)
    expect(x).toBeLessThanOrEqual(896)
    expect(y).toBeGreaterThanOrEqual(56)
    expect(y).toBeLessThanOrEqual(544)
  })
  it('returns 3D fixture or fallback', () => {
    expect(posFor3D(docNode({ name: 'security-policy' }), 0)).toEqual([0, 0, 0])
    expect(posFor3D(docNode({ name: 'unknown' }), 0)).toHaveLength(3)
  })
})

describe('symbol paths', () => {
  it('doc symbol is an SVG path with rounded corners', () => {
    const p = docSymbolPath(100, 40, 6)
    expect(p.startsWith('M')).toBe(true)
    expect(p).toContain('Q')
    expect(p).toContain('Z')
  })
  it('section symbol is a diamond path', () => {
    const p = sectionSymbolPath(17)
    expect(p.startsWith('M')).toBe(true)
    expect(p).toContain('Z')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- src/layout.test.ts`
Expected: FAIL —— `Cannot find module './layout.ts'`

- [ ] **Step 3: 写 src/palette.ts（§8.2 全部常量）**

```ts
/**
 * §8.2 graph-only palette. Graph colors are plugin-owned and do not flip with
 * the host dark/light theme.
 */
import type { Role } from './types.ts'

/** 2D node border / main color by role. */
export const COLORS: Record<Role, string> = {
  current: '#163b5c',
  direct: '#4b7b97',
  transitive: '#9cb3c1',
  section: '#c18a3d',
  other: '#c9c7c2',
}

/** 2D node fill by role. */
export const FILLS: Record<Role, string> = {
  current: '#163b5c',
  direct: '#edf4f7',
  transitive: '#f3f6f7',
  section: '#c18a3d',
  other: '#f4f3f0',
}

/** 2D node label color by role. */
export const NODE_TEXT_2D: Record<Role, string> = {
  current: '#ffffff',
  section: '#7b5120',
  direct: '#18384b',
  transitive: '#526b79',
  other: '#817d76',
}

/** 2D edge styles. */
export const EDGE_2D = {
  contains: { color: 'rgba(193,138,61,.70)', width: 1.2, type: 'dashed', opacity: 1 },
  references: { color: 'rgba(82,112,126,.34)', width: 1.25, type: 'solid', opacity: 0.78 },
  referencesSelected: { color: 'rgba(20,78,109,.96)', width: 3, type: 'solid', opacity: 1 },
} as const

/** 2D edge arrow: only references edges get an arrow. */
export const EDGE_ARROW_2D = { none: ['none', 'arrow'] as const, size: 9 }

/** 3D node style by role: radius / color / glow color / glow opacity. */
export const ROLE_STYLE_3D: Record<Role, { radius: number; color: string; glow: string; glowOpacity: number }> = {
  current: { radius: 9, color: '#173e59', glow: '#6d9bb0', glowOpacity: 0.25 },
  direct: { radius: 7, color: '#5f8294', glow: '#91b3bf', glowOpacity: 0.16 },
  transitive: { radius: 5.8, color: '#a9bbc2', glow: '#c2d1d5', glowOpacity: 0.1 },
  section: { radius: 5, color: '#bc8750', glow: '#d8aa76', glowOpacity: 0.12 },
  other: { radius: 4.8, color: '#9ca6a6', glow: '#c0c8c5', glowOpacity: 0.08 },
}

/** 3D edge styles. */
export const EDGE_3D = {
  contains: { color: '#b6aa9d', width: 0.42, opacity: 0.28 },
  references: { color: '#84979d', width: 0.58, opacity: 0.42 },
  referencesSelected: { color: '#587d8b', width: 1.2, opacity: 0.82 },
  arrow: { length: 1.7, relPos: 0.62, color: '#7b8d92' },
  particleWidth: 0.8,
} as const

/** 2D selected node style. */
export const SELECTED_2D = {
  borderColor: '#0d2638',
  borderWidth: 3,
  shadowBlur: 18,
  shadowOffsetY: 4,
  shadowColor: 'rgba(22,59,92,.28)',
} as const

/** 2D current-but-not-selected node style. */
export const CURRENT_2D = {
  borderWidth: 2.4,
  shadowBlur: 12,
  shadowOffsetY: 2,
  shadowColor: 'rgba(22,59,92,.16)',
} as const

/** 3D selected node adjustments. */
export const SELECTED_3D = {
  emissiveIntensity: 0.42,
  emissiveIntensityRest: 0.24,
  glowOpacity: 0.3,
} as const

/** §8.2 canvas background (.stage-body). */
export const STAGE_BACKGROUND =
  'radial-gradient(900px 460px at 50% -10%, #ffffff 0%, #fbfaf8 56%, #f1efe9 100%)'

/** §8.2 concentric rings (2D ECharts graphic). */
export const RING_INNER = { stroke: 'rgba(75,123,151,.18)', dash: [4, 5] } as const
export const RING_OUTER = { stroke: 'rgba(156,179,193,.20)', dash: [4, 6] } as const
export const RING_LABEL_INNER = { text: '直接影响', color: 'rgba(75,123,151,.55)' } as const
export const RING_LABEL_OUTER = { text: '传递影响', color: 'rgba(112,135,147,.46)' } as const

/** 2D label font sizes. */
export const FONT_2D = {
  current: 11.5,
  other: 10.2,
  section: 10,
  ring: 10,
} as const

/** Mini graph label font sizes (§8.3). */
export const FONT_MINI = { current: 9.7, other: 9 } as const
```

- [ ] **Step 4: 写 src/layout.ts（§8.4 + symbol 路径 + 兜底布局）**

```ts
/**
 * §8.4 coordinate fixture and 2D/3D layout mapping. Real-data layout
 * algorithms are a later iteration (BACKLOG T5); MVP pins the 12 mock
 * positions and falls back to a deterministic grid for unknown nodes.
 */
import type { GraphNode } from './types.ts'

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

/** §8.4 2D fixture-point mapping with padding clamps. */
export function graphPoint2D(point: [number, number], width: number, height: number, size: [number, number]): [number, number] {
  const padX = Math.max(104, size[0] / 2 + 24)
  const padY = Math.max(56, size[1] / 2 + 24)
  return [
    Math.max(padX, Math.min(width - padX, point[0] * (width / 1000))),
    Math.max(padY, Math.min(height - padY, point[1] * (height / 600))),
  ]
}

/** §8.4 2D node sizes. */
export function nodeSize2D(n: GraphNode): [number, number] {
  if (n.type === 'section') return [17, 17]
  const width = Math.max(
    n.role === 'current' ? 142 : n.role === 'direct' ? 108 : n.role === 'transitive' ? 96 : 84,
    n.name.length * 6.2 + 26,
  )
  const height = n.role === 'current' ? 44 : n.role === 'direct' ? 36 : n.role === 'transitive' ? 31 : 28
  return [width, height]
}

/** §8.4 mini graph node sizes. */
export function nodeSizeMini(n: GraphNode): [number, number] {
  if (n.type === 'section') return [13, 13]
  if (n.role === 'current') return [104, 32]
  if (n.role === 'direct') return [84, 27]
  return [72, 24]
}

/**
 * Fixture key for a node: the 12 mock positions are keyed by short names;
 * match by node.name first, then by the basename of relPath.
 */
export function layoutKeyFor(n: GraphNode): string | null {
  const name = n.name
  if (name in GRAPH_POS_2D) return name
  const base = n.relPath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? ''
  if (base in GRAPH_POS_2D) return base
  return null
}

function fallbackGrid(index: number): [number, number] {
  // Deterministic spiral so unknown nodes stay near the center but never overlap.
  const angle = index * 2.399963229728653 // golden angle in radians
  const radius = 90 + Math.sqrt(index) * 58
  return [500 + Math.cos(angle) * radius, 300 + Math.sin(angle) * radius]
}

function fallbackGrid3D(index: number): [number, number, number] {
  const angle = index * 2.399963229728653
  const radius = 60 + Math.sqrt(index) * 34
  return [Math.cos(angle) * radius, Math.sin(angle) * radius, (index % 5 - 2) * 26]
}

/** Canvas position for a node: fixture coordinate when known, grid fallback otherwise. */
export function posFor2D(node: GraphNode, index: number, width: number, height: number): [number, number] {
  const key = layoutKeyFor(node)
  const size = nodeSize2D(node)
  const point = key ? GRAPH_POS_2D[key] : fallbackGrid(index)
  return graphPoint2D(point, width, height, size)
}

/** 3D position for a node. */
export function posFor3D(node: GraphNode, index: number): [number, number, number] {
  const key = layoutKeyFor(node)
  return key ? GRAPH_POS_3D[key] : fallbackGrid3D(index)
}

/**
 * Rounded-rectangle SVG path used as the ECharts `symbol` for doc nodes.
 * ECharts accepts `'path://M ... Z'`; the path is generated per node size.
 */
export function docSymbolPath(w: number, h: number, r = 6): string {
  const rr = Math.min(r, w / 2, h / 2)
  return [
    `M ${rr} 0`,
    `L ${w - rr} 0`,
    `Q ${w} 0 ${w} ${rr}`,
    `L ${w} ${h - rr}`,
    `Q ${w} ${h} ${w - rr} ${h}`,
    `L ${rr} ${h}`,
    `Q 0 ${h} 0 ${h - rr}`,
    `L 0 ${rr}`,
    `Q 0 0 ${rr} 0`,
    'Z',
  ].join(' ')
}

/** Diamond SVG path used as the ECharts `symbol` for section nodes. */
export function sectionSymbolPath(s: number): string {
  const half = s / 2
  return `M ${half} 0 L ${s} ${half} L ${half} ${s} L 0 ${half} Z`
}
```
- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm test -- src/layout.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/palette.ts src/layout.ts src/layout.test.ts
git commit -m "feat(doc-graph): add graph palette and layout fixture"
```

---

### Task 3: core.ts（路径安全 + JSON-RPC 2.0 stdio 客户端）

**Files:**
- Create: `src/core.ts`
- Test: `src/core.test.ts`

**Interfaces:**
- Consumes: `src/types.ts`（无，本任务只用 Node 内置模块）
- Produces: `ToolError, getProjectRoot, resolveRelPath, encodeJsonRpc, parseJsonRpcLine, JsonRpcClient`（Task 4 在其上叠加 DocGraphCoreManager 与 core-to-UI 映射）

- [ ] **Step 1: 写失败测试 src/core.test.ts**

```ts
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { encodeJsonRpc, JsonRpcClient, parseJsonRpcLine, resolveRelPath, ToolError } from './core.ts'

const tmpDirs: string[] = []
function tempRoot(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-doc-graph-'))
  tmpDirs.push(dir)
  return dir
}
afterEach(() => { for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

describe('resolveRelPath', () => {
  it('rejects empty string', () => {
    expect(() => resolveRelPath('/x', '')).toThrow(ToolError)
  })
  it('rejects absolute posix path', () => {
    expect(() => resolveRelPath('/x', '/etc/passwd')).toThrow(/relative/)
  })
  it('rejects drive-letter absolute path', () => {
    expect(() => resolveRelPath('/x', 'C:/Windows')).toThrow(/relative/)
  })
  it('rejects .. segments', () => {
    expect(() => resolveRelPath('/x', '../etc')).toThrow(/\.\./)
  })
  it('normalizes backslashes and returns /-relative path', () => {
    expect(resolveRelPath('/x', 'a\\b.md')).toBe('a/b.md')
  })
  it('allows the root itself', () => {
    expect(resolveRelPath('/x', '.')).toBe('.')
  })
  it('rejects symlink escape', () => {
    const root = tempRoot()
    const outside = tempRoot()
    writeFileSync(path.join(outside, 'secret.md'), 'x')
    try {
      symlinkSync(path.join(outside, 'secret.md'), path.join(root, 'link.md'))
    } catch {
      return // symlinks unavailable on this platform; containment still covered by .. tests
    }
    expect(() => resolveRelPath(root, 'link.md')).toThrow(/escapes/)
  })
})

describe('JSON-RPC framing', () => {
  it('encodes a request as one newline-terminated line', () => {
    expect(encodeJsonRpc(7, 'tools/call', { name: 'x' })).toBe('{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"x"}}\n')
  })
  it('parses a response line', () => {
    const msg = parseJsonRpcLine('{"jsonrpc":"2.0","id":7,"result":{"ok":true}}')
    expect(msg).toMatchObject({ id: 7, result: { ok: true } })
  })
  it('returns null for malformed lines', () => {
    expect(parseJsonRpcLine('not json')).toBeNull()
  })
})

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

function makeChild() {
  const stdout = new EventEmitter()
  const stderr = new EventEmitter()
  const child = new EventEmitter() as unknown as {
    stdin: { write: (s: string) => boolean }
    stdout: EventEmitter
    stderr: EventEmitter
    exitCode: number | null
    killed: boolean
    kill: (sig?: string) => void
  } & EventEmitter
  child.stdin = { write: (s: string) => {
    const id = JSON.parse(s).id
    queueMicrotask(() => stdout.emit('data', JSON.stringify({ jsonrpc: '2.0', id, result: { content: [] } }) + '\n'))
    return true
  } }
  child.stdout = stdout
  child.stderr = stderr
  child.exitCode = null
  child.killed = false
  child.kill = () => {
    child.killed = true
    child.exitCode = 0
    queueMicrotask(() => child.emit('exit', 0))
  }
  queueMicrotask(() => child.emit('spawn'))
  return child
}

describe('JsonRpcClient', () => {
  it('start resolves and reports running', async () => {
    const child = makeChild()
    ;(spawn as ReturnType<typeof vi.fn>).mockReturnValue(child)
    const client = new JsonRpcClient({ bin: 'docgraph', args: ['serve', '--path', '/x'] })
    await client.start()
    expect(client.running).toBe(true)
    await client.stop(100)
  })

  it('request writes JSON-RPC and resolves on matching id', async () => {
    const child = makeChild()
    ;(spawn as ReturnType<typeof vi.fn>).mockReturnValue(child)
    const client = new JsonRpcClient({ bin: 'docgraph', args: [] })
    await client.start()
    const result = await client.request('tools/call', { name: 'docgraph_status' }, 2000)
    expect(result).toEqual({ content: [] })
    await client.stop(100)
  })

  it('request rejects on timeout', async () => {
    const child = makeChild()
    child.stdin.write = () => true // never answer
    ;(spawn as ReturnType<typeof vi.fn>).mockReturnValue(child)
    const client = new JsonRpcClient({ bin: 'docgraph', args: [] })
    await client.start()
    await expect(client.request('tools/call', {}, 20)).rejects.toThrow(/timeout/)
    await client.stop(100)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- src/core.test.ts`
Expected: FAIL —— `Cannot find module './core.ts'`

- [ ] **Step 3: 写 src/core.ts（本任务部分：路径 + JSON-RPC）**

```ts
/**
 * §3/§5/§6 core bridge. This file owns: project-root resolution, relative
 * path validation, the newline-delimited JSON-RPC 2.0 stdio client for the
 * long-lived `docgraph serve` process, and (in the next task) the core
 * manager plus core-to-UI mapping.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { realpathSync } from 'node:fs'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'

/** Tool-facing error surfaced as a tool error text. */
export class ToolError extends Error {}

/** §5.1 projectRoot := sandboxPolicy.workspaceRoot || session.header.cwd. */
export function getProjectRoot(
  ctx: Context,
  exec?: { agent?: { session?: { header?: { cwd?: string } } } },
): string {
  const getter = (ctx as unknown as {
    get?: (name: string) => { resolve?: (opts: object) => { workspaceRoot?: string } } | undefined
  }).get
  const sandboxPolicy = getter?.('sandboxPolicy')
  const workspaceRoot = sandboxPolicy?.resolve?.({ ...(exec?.agent ? { session: exec.agent.session } : {}) })?.workspaceRoot
  return workspaceRoot ?? exec?.agent?.session?.header?.cwd ?? process.cwd()
}

function canonical(p: string): string {
  try {
    return realpathSync.native(p)
  } catch {
    return path.resolve(p)
  }
}

/** §5.2 shared path validation. */
export function resolveRelPath(projectRoot: string, input: string): string {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new ToolError('path must not be empty')
  }
  const rel = input.replaceAll('\\', '/')
  if (rel.startsWith('/') || /^[A-Za-z]:\//.test(rel)) {
    throw new ToolError('path must be relative')
  }
  if (rel.split('/').includes('..')) {
    throw new ToolError('path must not contain ..')
  }
  const root = canonical(projectRoot)
  const target = canonical(path.join(projectRoot, rel))
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new ToolError('path escapes project root')
  }
  return path.relative(root, target).split(path.sep).join('/') || '.'
}

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

export interface JsonRpcError {
  jsonrpc: '2.0'
  id: number
  error: { code: number; message: string }
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string }
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse

export function encodeJsonRpc(id: number, method: string, params?: unknown): string {
  const msg: JsonRpcRequest = { jsonrpc: '2.0', id, method }
  if (params !== undefined) msg.params = params
  return JSON.stringify(msg) + '\n'
}

export function parseJsonRpcLine(line: string): JsonRpcMessage | null {
  try {
    const parsed: unknown = JSON.parse(line)
    if (typeof parsed !== 'object' || parsed === null) return null
    const obj = parsed as Record<string, unknown>
    if (obj.jsonrpc !== '2.0') return null
    if (typeof obj.id === 'number' && typeof obj.method === 'string') return obj as unknown as JsonRpcRequest
    if (typeof obj.id === 'number' && ('result' in obj || 'error' in obj)) return obj as unknown as JsonRpcResponse
    return null
  } catch {
    return null
  }
}

interface Pending {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface JsonRpcClientOptions {
  bin: string
  args: string[]
  onStderr?: (chunk: string) => void
  onExit?: (code: number | null) => void
}

/**
 * Newline-delimited JSON-RPC 2.0 client over a child process stdio. One
 * request per line; responses are matched by id. stderr is isolated from
 * tool results via the onStderr callback.
 */
export class JsonRpcClient {
  private child: ChildProcessWithoutNullStreams | null = null
  private nextId = 1
  private buffer = ''
  private pending = new Map<number, Pending>()

  constructor(
    private readonly opts: JsonRpcClientOptions,
    inject?: { child?: ChildProcessWithoutNullStreams },
  ) {
    if (inject?.child) this.child = inject.child
  }

  get running(): boolean {
    return this.child !== null && this.child.exitCode === null && this.child.killed === false
  }

  start(): Promise<void> {
    if (this.running) return Promise.resolve()
    if (this.child) this.child = null
    return new Promise((resolve, reject) => {
      let child: ChildProcessWithoutNullStreams
      try {
        child = spawn(this.opts.bin, this.opts.args, { stdio: ['pipe', 'pipe', 'pipe'] })
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
        return
      }
      this.child = child
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => this.onStdout(chunk))
      child.stderr.on('data', (chunk: string) => this.opts.onStderr?.(chunk))
      child.once('error', (err) => {
        this.failAll(err instanceof Error ? err : new Error(String(err)))
        reject(err instanceof Error ? err : new Error(String(err)))
      })
      child.once('spawn', () => resolve())
      child.once('exit', (code) => {
        this.failAll(new Error(`docgraph core exited (code ${code})`))
        this.child = null
        this.opts.onExit?.(code)
      })
    })
  }

  request(method: string, params?: unknown, timeoutMs = 15000, signal?: AbortSignal): Promise<unknown> {
    if (!this.running || !this.child) return Promise.reject(new Error('docgraph core not running'))
    if (signal?.aborted) return Promise.reject(new Error('docgraph core request cancelled'))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`docgraph core request timeout after ${timeoutMs}ms`))
      }, timeoutMs)
      const onAbort = () => {
        this.notify('notifications/cancelled', { requestId: id })
        this.pending.delete(id)
        reject(new Error('docgraph core request cancelled'))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer)
          signal?.removeEventListener('abort', onAbort)
          resolve(v)
        },
        reject: (e) => {
          clearTimeout(timer)
          signal?.removeEventListener('abort', onAbort)
          reject(e)
        },
        timer,
      })
      this.child!.stdin.write(encodeJsonRpc(id, method, params))
    })
  }

  notify(method: string, params?: unknown): void {
    if (!this.running || !this.child) return
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk
    let idx: number
    while ((idx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, idx).trim()
      this.buffer = this.buffer.slice(idx + 1)
      if (!line) continue
      const msg = parseJsonRpcLine(line)
      if (!msg || !('id' in msg)) continue
      const id = typeof msg.id === 'number' ? msg.id : Number(msg.id)
      const pending = this.pending.get(id)
      if (!pending) continue
      this.pending.delete(id)
      if ('error' in msg && msg.error) {
        pending.reject(new Error(msg.error.message))
      } else {
        pending.resolve('result' in msg ? msg.result : undefined)
      }
    }
  }

  private failAll(err: Error): void {
    for (const [, pending] of this.pending) pending.reject(err)
    this.pending.clear()
    this.buffer = ''
  }

  async stop(timeoutMs = 5000): Promise<void> {
    const child = this.child
    this.child = null
    if (!child || child.exitCode !== null) return
    child.kill('SIGTERM')
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        resolve()
      }, timeoutMs)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
}
```
- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- src/core.test.ts`
Expected: PASS（含 spawn mock 驱动的 JsonRpcClient 三个用例）

- [ ] **Step 5: 提交**

```bash
git add src/core.ts src/core.test.ts
git commit -m "feat(doc-graph): add path validation and JSON-RPC stdio client"
```

---

### Task 4: core.ts（DocGraphCoreManager + core-to-UI 映射 + MCP tools/call 解析）

**Files:**
- Modify: `src/core.ts`（在 JsonRpcClient 类之后追加）
- Test: `src/core.test.ts`（追加）

**Interfaces:**
- Consumes: Task 3 的 `JsonRpcClient, ToolError, resolveRelPath, encodeJsonRpc`
- Produces: `DocGraphCoreManager`（`ensureServing / status / query / index / stop`）、`mapGraphResult, mapStatusResult, mapContextResult, mapFilesResult, mapDriftResult`（Task 5 的 9 个工具全部经这些函数产出 payload）

**core 原始响应契约（本插件对 fork 的防御性读取假设，字段缺失时按默认值处理）：**

```ts
RawStatus = { project?, rootPath?, phase?, summary?: { docs?, nodes?, edges?, entities?, failed?, formats?: {fmt,pct}[] }, docs?: RawDoc[] }
RawDoc = { id?, name?, path?, file_path?, fmt?, format?, status?, inbound?, sizeBytes?, size?, updatedAt?, updated_at?, indexedAt?, indexed_at? }
RawGraph = { seedNodeId?, seed?, nodes?: RawNode[], edges?: RawEdge[], dropped?: { nodes?, links? } }
RawNode = { id?, kind?, type?, file_path?, path?, relPath?, name?, title?, anchor?, heading?, val?, weight?, role?, inboundTotal?, inbound_total?, outboundTotal?, outbound_total? }
RawEdge = { source?, target?, kind?, type? }
RawContext = { results?: RawContextResult[], truncated? }
RawContextResult = { id?, path?, docPath?, doc_path?, title?, name?, location?, score?, inbound?, chips?, statusTag?, status_tag?, snippet? }
RawDrift = { findings?: RawFinding[] }
RawFinding = { code?, severity?, title?, detail?, actionable?, actionLabel?, action_label?, docs? }
RawFiles = { files?: RawDoc[], truncated? }
```

- [ ] **Step 1: 追加失败测试（core.test.ts 末尾追加以下内容）**

```ts
import { DocGraphCoreManager, mapContextResult, mapDriftResult, mapFilesResult, mapGraphResult, mapStatusResult } from './core.ts'

describe('mapStatusResult', () => {
  it('maps raw status with defaults into IndexPayload', () => {
    const payload = mapStatusResult({
      project: 'demo', rootPath: '/x', phase: 'ready',
      summary: { docs: 2, nodes: 5, edges: 4, entities: 0, failed: 0, formats: [{ fmt: 'md', pct: 100 }] },
      docs: [{ id: 'demo::a.md', path: 'a.md', name: 'a', fmt: 'md', status: 'ok', inbound: 1, sizeBytes: 10 }],
    }, 'demo', '/x', 'docgraph_status', 1)
    expect(payload.kind).toBe('docgraph_status')
    expect(payload.state.phase).toBe('ready')
    expect(payload.summary.docs).toBe(2)
    expect(payload.docs[0].id).toBe('demo::a.md')
    expect(payload.docs[0].updatedAt).toBe(0)
  })

  it('infers indexing phase from core text', () => {
    const payload = mapStatusResult({ phase: 'Indexing in progress' }, 'demo', '/x', 'docgraph_status', 2)
    expect(payload.state.phase).toBe('indexing')
    expect(payload.summary.docs).toBe(0)
  })
})

describe('mapGraphResult', () => {
  const raw = {
    seedNodeId: 'n1',
    nodes: [
      { id: 'n1', kind: 'document', file_path: 'a.md', name: 'a', role: 'current', val: 4, inboundTotal: 1, outboundTotal: 2 },
      { id: 'n2', kind: 'heading', file_path: 'a.md', heading: 'Intro', val: 2, inboundTotal: 0, outboundTotal: 0 },
      { id: 'n3', kind: 'tag', file_path: 't.md', name: 'tag', val: 1, inboundTotal: 0, outboundTotal: 0 },
      { id: 'n4', kind: 'document', file_path: 'b.md', name: 'b', role: 'direct', val: 3, inboundTotal: 2, outboundTotal: 1 },
    ],
    edges: [
      { source: 'n1', target: 'n2', kind: 'contains' },
      { source: 'n1', target: 'n4', kind: 'references' },
      { source: 'n1', target: 'n3', kind: 'tagged' },
    ],
    dropped: { nodes: 1, links: 1 },
  }
  it('maps documents and sections, drops tag nodes and tagged edges', () => {
    const payload = mapGraphResult(raw, 'demo', 'demo::a.md', 'impact', 2)
    expect(payload.schemaVersion).toBe(1)
    expect(payload.nodes).toHaveLength(3)
    expect(payload.nodes.find(n => n.id === 'demo::a.md')?.role).toBe('current')
    expect(payload.nodes.find(n => n.id === 'demo::a.md::Intro')?.type).toBe('section')
    expect(payload.links).toHaveLength(2)
    expect(payload.dropped).toEqual({ nodes: 1, links: 1 })
  })
})

describe('mapContextResult / mapFilesResult / mapDriftResult', () => {
  it('maps context results and normalizes location', () => {
    const payload = mapContextResult({
      results: [{ id: 'demo::a.md', title: 'A', path: 'a.md#h1:10', score: 0.8, inbound: 3, chips: ['x'] }],
      truncated: true,
    }, 'demo')
    expect(payload.kind).toBe('docgraph_context')
    expect(payload.results[0].docPath).toBe('a.md')
    expect(payload.results[0].location).toBe('a.md#h1:10')
  })
  it('maps files and defaults truncated', () => {
    const payload = mapFilesResult({ files: [{ id: 'demo::a.md', path: 'a.md', name: 'a', fmt: 'md', status: 'ok', inbound: 1, sizeBytes: 2 }] }, 'demo')
    expect(payload.files).toHaveLength(1)
    expect(payload.truncated).toBe(false)
  })
  it('maps drift findings and severity aliases', () => {
    const payload = mapDriftResult({ findings: [{ code: 'D1', severity: 'warn', title: 'T', detail: 'D', actionable: true, actionLabel: 'Fix', docs: [] }] }, 'demo')
    expect(payload.kind).toBe('docgraph_drift')
    expect(payload.findings[0].severity).toBe('warn')
  })
})

describe('DocGraphCoreManager.resolveBin', () => {
  const ctx = {} as never
  it('uses DSH_DOCGRAPH_BIN when set', () => {
    process.env.DSH_DOCGRAPH_BIN = '/opt/docgraph'
    const mgr = new DocGraphCoreManager(ctx, '/x')
    expect(mgr.resolveBin()).toBe('/opt/docgraph')
    delete process.env.DSH_DOCGRAPH_BIN
  })
  it('falls back to PATH docgraph', () => {
    const mgr = new DocGraphCoreManager(ctx, '/x')
    expect(mgr.resolveBin()).toBe('docgraph')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- src/core.test.ts`
Expected: FAIL —— `Cannot find name 'mapStatusResult'` / `DocGraphCoreManager` 等导出不存在。

- [ ] **Step 3: 在 src/core.ts 末尾追加映射与生命周期管理代码**

```ts
// ---- core-to-UI mapping and process lifecycle (§3.2 / §6) ----

import type {
  ContextPayload, DocGraphPayload, DocRecord, DriftPayload, FilesPayload,
  GraphLink, GraphNode, GraphPayload, IndexPayload, IndexPhase, IndexState,
  Role, Summary,
} from './types.ts'
import { isDocGraphPayload, isGraphPayload, nodeId } from './types.ts'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

type Raw = Record<string, unknown>

function asNum(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
function asStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}
function asBool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function fmtOf(raw: Raw): string {
  const v = raw.fmt ?? raw.format ?? ''
  return asStr(v, 'md')
}
function statusOf(raw: Raw): DocRecord['status'] {
  const v = raw.status
  return v === 'changed' || v === 'err' ? v : 'ok'
}
function nameOf(raw: Raw, p: string): string {
  const n = asStr(raw.name ?? raw.title, '')
  if (n) return n
  const base = p.split('/').pop() ?? p
  return base.replace(/\.[^.]+$/, '')
}

function mapRawDoc(raw: Raw, project: string): DocRecord {
  const p = asStr(raw.path ?? raw.file_path ?? raw.rel_path ?? raw.relPath, '')
  return {
    id: nodeId(project, p),
    project,
    name: nameOf(raw, p),
    path: p,
    fmt: fmtOf(raw),
    status: statusOf(raw),
    inbound: asNum(raw.inbound),
    sizeBytes: asNum(raw.sizeBytes ?? raw.size ?? raw.size_bytes),
    updatedAt: asNum(raw.updatedAt ?? raw.updated_at ?? raw.mtime),
    indexedAt: asNum(raw.indexedAt ?? raw.indexed_at),
  }
}

function mapRawSummary(raw: Raw): Summary {
  const s = (raw.summary ?? raw) as Raw
  const formatsRaw = Array.isArray(s.formats) ? s.formats : []
  return {
    docs: asNum(s.docs),
    nodes: asNum(s.nodes),
    edges: asNum(s.edges),
    entities: asNum(s.entities),
    failed: asNum(s.failed),
    formats: formatsRaw.map((f) => ({
      fmt: asStr((f as Raw).fmt, '?'),
      pct: asNum((f as Raw).pct),
    })),
  }
}

function inferPhase(v: unknown): IndexPhase {
  if (typeof v === 'string') {
    if (v.includes('Indexing in progress') || v === 'indexing') return 'indexing'
    if (v === 'ready' || v === 'ok') return 'ready'
    if (v === 'starting') return 'starting'
    return 'error'
  }
  if (v === 'starting' || v === 'indexing' || v === 'ready' || v === 'error') return v
  return 'ready'
}

/** Normalize a raw core status response into an IndexPayload. */
export function mapStatusResult(
  raw: unknown,
  project: string,
  rootPath: string,
  kind: 'docgraph_index' | 'docgraph_status',
  revision: number,
): IndexPayload {
  const obj = (raw ?? {}) as Raw
  const phase = inferPhase(obj.phase ?? obj.state ?? obj.status ?? (raw === undefined ? 'starting' : 'ready'))
  const state: IndexState = { phase, revision }
  if (phase === 'ready') state.finishedAt = asNum(obj.finishedAt ?? obj.finished_at, Date.now())
  if (phase === 'indexing') state.startedAt = asNum(obj.startedAt ?? obj.started_at, Date.now())
  if (phase === 'error') state.lastError = asStr(obj.lastError ?? obj.error ?? obj.message, 'unknown error')
  const docs = Array.isArray(obj.docs) ? obj.docs.map((d) => mapRawDoc(d as Raw, project)) : []
  return assertPayload({ schemaVersion: 1, kind, project, rootPath, state, summary: mapRawSummary(obj), docs })
}

function roleOf(raw: Raw, seedNodeId: string): Role {
  const v = raw.role
  if (v === 'current' || v === 'direct' || v === 'transitive' || v === 'section' || v === 'other') return v
  if (asStr(raw.kind ?? raw.type, '') === 'heading') return 'section'
  return 'direct'
}

/** §6.1 node mapping: document→doc, heading→section, others dropped. */
export function mapGraphResult(
  raw: unknown,
  project: string,
  seedNodeId: string,
  operation: GraphPayload['operation'],
  depth?: number,
): GraphPayload {
  const obj = (raw ?? {}) as Raw
  const rawNodes = Array.isArray(obj.nodes) ? obj.nodes as Raw[] : []
  const rawEdges = Array.isArray(obj.edges) ? obj.edges as Raw[] : []
  const rawIdToNodeId = new Map<string, string>()
  const nodes: GraphNode[] = []
  let droppedNodes = 0

  for (const rn of rawNodes) {
    const kind = asStr(rn.kind ?? rn.type, 'document')
    const filePath = asStr(rn.file_path ?? rn.path ?? rn.relPath ?? rn.rel_path, '')
    let mapped: GraphNode | null = null
    if (kind === 'document' || kind === 'doc') {
      const id = nodeId(project, filePath)
      rawIdToNodeId.set(asStr(rn.id, id), id)
      mapped = {
        id,
        project,
        name: nameOf(rn, filePath),
        type: 'doc',
        role: id === seedNodeId ? 'current' : roleOf(rn, seedNodeId),
        relPath: filePath,
        val: asNum(rn.val ?? rn.weight, 1),
        inboundTotal: asNum(rn.inboundTotal ?? rn.inbound_total),
        outboundTotal: asNum(rn.outboundTotal ?? rn.outbound_total),
      }
    } else if (kind === 'heading' || kind === 'section') {
      const anchor = asStr(rn.anchor ?? rn.heading, '')
      const id = nodeId(project, filePath, anchor)
      rawIdToNodeId.set(asStr(rn.id, id), id)
      mapped = {
        id,
        project,
        name: anchor || nameOf(rn, filePath),
        type: 'section',
        role: 'section',
        relPath: filePath,
        anchor,
        val: asNum(rn.val ?? rn.weight, 1),
        inboundTotal: asNum(rn.inboundTotal ?? rn.inbound_total),
        outboundTotal: asNum(rn.outboundTotal ?? rn.outbound_total),
      }
    }
    if (mapped) nodes.push(mapped)
    else droppedNodes += 1
  }

  const links: GraphLink[] = []
  let droppedLinks = 0
  for (const re of rawEdges) {
    const kind = asStr(re.kind ?? re.type, '')
    const mappedKind = kind === 'contains' ? 'contains'
      : ['references', 'wikilinks_to', 'embeds', 'related_to'].includes(kind) ? 'references'
        : null
    if (mappedKind === null) {
      droppedLinks += 1
      continue
    }
    const source = rawIdToNodeId.get(asStr(re.source, ''))
    const target = rawIdToNodeId.get(asStr(re.target, ''))
    if (!source || !target) {
      droppedLinks += 1
      continue
    }
    links.push({ source, target, kind: mappedKind })
  }

  const mappedSeed = rawIdToNodeId.get(seedNodeId) ?? seedNodeId
  for (const n of nodes) {
    if (n.id === mappedSeed) n.role = 'current'
  }
  const payload: GraphPayload = {
    schemaVersion: 1,
    kind: 'docgraph_graph',
    project,
    seedNodeId: mappedSeed,
    operation,
    nodes,
    links,
    dropped: { nodes: droppedNodes, links: droppedLinks },
  }
  if (depth !== undefined) payload.depth = depth
  return assertPayload(payload)
}

function mapRawContextResult(raw: Raw, project: string): ContextPayload['results'][number] {
  const rawPath = asStr(raw.docPath ?? raw.doc_path ?? raw.path ?? raw.id, '')
  const hash = rawPath.indexOf('#')
  const p = hash === -1 ? rawPath : rawPath.slice(0, hash)
  const location = asStr(raw.location, rawPath)
  const result: ContextPayload['results'][number] = {
    id: nodeId(project, p),
    project,
    title: asStr(raw.title ?? raw.name, nameOf(raw, p)),
    location,
    docPath: p,
    inbound: asNum(raw.inbound),
    chips: Array.isArray(raw.chips) ? raw.chips.map((c) => asStr(c)) : [],
  }
  if (raw.score !== undefined) result.score = asNum(raw.score)
  const tag = (raw.statusTag ?? raw.status_tag) as Raw | undefined
  if (tag && typeof tag === 'object') {
    const kindRaw = asStr(tag.kind, 'active')
    const kind = (['active', 'stale', 'hot', 'superseded'].includes(kindRaw) ? kindRaw : 'active') as 'active' | 'stale' | 'hot' | 'superseded'
    result.statusTag = { label: asStr(tag.label, kind), kind }
  }
  if (raw.snippet !== undefined) result.snippet = asStr(raw.snippet)
  return result
}

/** Normalize search/node/similar/tags/context responses into ContextPayload. */
export function mapContextResult(raw: unknown, project: string): ContextPayload {
  const obj = (raw ?? {}) as Raw
  const results = Array.isArray(obj.results) ? obj.results.map((r) => mapRawContextResult(r as Raw, project)) : []
  return assertPayload({ schemaVersion: 1, kind: 'docgraph_context', project, results, truncated: asBool(obj.truncated, results.length === 0) })
}

/** Normalize docgraph_files responses into FilesPayload. */
export function mapFilesResult(raw: unknown, project: string): FilesPayload {
  const obj = (raw ?? {}) as Raw
  const files = Array.isArray(obj.files) ? obj.files.map((d) => mapRawDoc(d as Raw, project)) : []
  return assertPayload({ schemaVersion: 1, kind: 'docgraph_files', project, files, truncated: asBool(obj.truncated, files.length === 0) })
}

function mapRawFinding(raw: Raw): DriftPayload['findings'][number] {
  const severityRaw = asStr(raw.severity, 'ok')
  const severity = severityRaw === 'err' || severityRaw === 'error' ? 'err' : severityRaw === 'warn' || severityRaw === 'warning' ? 'warn' : 'ok'
  const docs = Array.isArray(raw.docs) ? raw.docs.map((d) => ({ id: asStr((d as Raw).id), name: asStr((d as Raw).name) })) : []
  const finding: DriftPayload['findings'][number] = {
    code: asStr(raw.code, 'D-UNKNOWN'),
    severity,
    title: asStr(raw.title, ''),
    detail: asStr(raw.detail, ''),
    actionable: asBool(raw.actionable),
    docs,
  }
  if (raw.actionLabel !== undefined || raw.action_label !== undefined) finding.actionLabel = asStr(raw.actionLabel ?? raw.action_label)
  return finding
}

/** Normalize docgraph_context format=drift_audit responses into DriftPayload. */
export function mapDriftResult(raw: unknown, project: string): DriftPayload {
  const obj = (raw ?? {}) as Raw
  const findings = Array.isArray(obj.findings) ? obj.findings.map((f) => mapRawFinding(f as Raw)) : []
  return assertPayload({ schemaVersion: 1, kind: 'docgraph_drift', project, findings })
}

/** Raw MCP tools/call result content. */
interface CoreToolResult {
  content?: Array<{ type: string; text?: string }>
  structuredContent?: unknown
}

/** Long-lived `docgraph serve` process owner (single-project mode). */
export class DocGraphCoreManager {
  private client: JsonRpcClient | null = null
  private indexingOp: Promise<unknown> = Promise.resolve()
  private revision = 0
  private lastStateKey = ''

  constructor(
    private readonly ctx: Context,
    private readonly projectRoot: string,
  ) {}

  /** §3.1 binary resolution order. */
  resolveBin(): string {
    const env = process.env.DSH_DOCGRAPH_BIN
    if (env && env.trim()) return env
    return 'docgraph'
  }

  private logStderr(chunk: string): void {
    // Forward core stderr to the plugin log only — never into tool result text.
    try {
      this.ctx.logger?.info('[docgraph-core] ' + chunk.trimEnd())
    } catch {
      /* logger optional */
    }
  }

  private nextRevision(key: string): number {
    if (key !== this.lastStateKey) {
      this.lastStateKey = key
      this.revision += 1
    }
    return this.revision
  }

  private emptyIndex(kind: 'docgraph_index' | 'docgraph_status', state: Partial<IndexState>): IndexPayload {
    const phase = state.phase ?? 'starting'
    const full: IndexState = { phase, revision: this.nextRevision(phase + (state.lastError ?? '')) }
    if (state.startedAt !== undefined) full.startedAt = state.startedAt
    if (state.finishedAt !== undefined) full.finishedAt = state.finishedAt
    if (state.lastError !== undefined) full.lastError = state.lastError
    return {
      schemaVersion: 1,
      kind,
      project: this.projectName(),
      rootPath: this.projectRoot,
      state: full,
      summary: { docs: 0, nodes: 0, edges: 0, entities: 0, failed: 0, formats: [] },
      docs: [],
    }
  }

  private projectName(): string {
    const base = this.projectRoot.split(/[\\/]/).filter(Boolean).pop()
    return base ?? this.projectRoot
  }

  private async callCoreTool<T>(name: string, args: unknown, timeoutMs: number, signal?: AbortSignal): Promise<T> {
    const raw = await this.client!.request('tools/call', { name, arguments: args }, timeoutMs, signal) as CoreToolResult | string
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) as T } catch { return raw as T }
    }
    if (raw && typeof raw === 'object' && raw.structuredContent !== undefined) return raw.structuredContent as T
    const content = Array.isArray(raw?.content) ? raw.content : []
    const text = content.filter((c) => typeof c === 'object' && c !== null && c.type === 'text').map((c) => c.text ?? '').join('\n')
    if (text.trim() === '') return undefined as T
    try { return JSON.parse(text) as T } catch { return text as T }
  }

  private async handshake(): Promise<void> {
    try {
      await this.client!.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'dsh-doc-graph', version: '0.1.0' },
      }, 15000)
      this.client!.notify('notifications/initialized', {})
    } catch {
      /* handshake is best-effort; tools/call may still work */
    }
  }

  private isExitError(err: unknown): boolean {
    return err instanceof Error && /core exited/.test(err.message)
  }

  private async startClient(): Promise<void> {
    const client = new JsonRpcClient({
      bin: this.resolveBin(),
      args: ['serve', '--path', this.projectRoot],
      onStderr: (chunk) => this.logStderr(chunk),
      onExit: () => { if (this.client === client) this.client = null },
    })
    try {
      await client.start()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/ENOENT/.test(msg) || /spawn/.test(msg)) throw new ToolError('docgraph core binary not found')
      throw err
    }
    this.client = client
    await this.handshake()
  }

  /** Start serve (if needed) and wait until docgraph_status is queryable. */
  async ensureServing(timeoutMs = 60000): Promise<void> {
    if (this.client?.running) return
    await this.startClient()
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        await this.callCoreTool('docgraph_status', {}, 15000)
        return
      } catch (err) {
        if (this.isExitError(err)) throw err
        await sleep(500)
      }
    }
  }

  /** Query one core tool with a single auto-restart on process exit. */
  async query<T>(name: string, args: unknown, timeoutMs = 15000, signal?: AbortSignal): Promise<T> {
    await this.ensureServing()
    try {
      return await this.callCoreTool<T>(name, args, timeoutMs, signal)
    } catch (err) {
      if (this.isExitError(err)) {
        this.client = null
        await this.startClient()
        return this.callCoreTool<T>(name, args, timeoutMs, signal)
      }
      throw err
    }
  }

  /** docgraph_status payload with §4.3 phase inference. */
  async status(timeoutMs = 15000): Promise<IndexPayload> {
    if (!this.client?.running) {
      return this.emptyIndex('docgraph_status', { phase: 'starting' })
    }
    try {
      const raw = await this.callCoreTool('docgraph_status', {}, timeoutMs)
      return mapStatusResult(raw, this.projectName(), this.projectRoot, 'docgraph_status', this.nextRevision(JSON.stringify(raw)))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const phase: IndexPhase = 'error'
      return this.emptyIndex('docgraph_status', { phase, lastError: msg })
    }
  }

  private async runCliIndex(): Promise<void> {
    const { spawn } = await import('node:child_process')
    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.resolveBin(), ['index', '--force', this.projectRoot], { stdio: ['ignore', 'ignore', 'pipe'] })
      let stderr = ''
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-4000) })
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new ToolError('docgraph index --force timed out after 120s'))
      }, 120000)
      child.once('error', (err) => { clearTimeout(timer); reject(err) })
      child.once('exit', (code) => {
        clearTimeout(timer)
        if (code === 0) resolve()
        else reject(new ToolError(`docgraph index --force failed with code ${code}${stderr ? ': ' + stderr.trim() : ''}`))
      })
    })
  }
  private async stopClient(timeoutMs = 5000): Promise<void> {
    const client = this.client
    this.client = null
    if (client) await client.stop(timeoutMs)
  }

  /** §3.2 docgraph_index. force=false ensures serve and returns status; force=true runs the full reindex sequence. */
  async index(force: boolean): Promise<IndexPayload> {
    if (!force) {
      await this.ensureServing()
      return this.status()
    }
    const run = this.indexingOp.then(() => this.forceIndex())
    this.indexingOp = run.catch(() => undefined)
    return run
  }

  private async forceIndex(): Promise<IndexPayload> {
    // 1. record old status (best effort)
    try { await this.status(15000) } catch { /* ignore */ }
    // 2. stop serve (SIGTERM, 5s, then SIGKILL)
    await this.stopClient(5000)
    // 3. one-shot CLI full reindex (exit code only, 120s)
    await this.runCliIndex()
    // 4. restart serve
    await this.ensureServing()
    // 5. poll status every 500ms up to 60s
    const deadline = Date.now() + 60000
    let last: IndexPayload = this.emptyIndex('docgraph_index', { phase: 'starting' })
    while (Date.now() < deadline) {
      last = await this.status(15000)
      if (last.state.phase === 'ready' || last.state.phase === 'error') return { ...last, kind: 'docgraph_index' }
      await sleep(500)
    }
    return { ...last, kind: 'docgraph_index' }
  }

  async stop(): Promise<void> {
    await this.stopClient(5000)
  }
}

/** Validate a produced payload with the §4 type guard; used by tool.ts. */
export function assertPayload(payload: DocGraphPayload): DocGraphPayload {
  if (!isDocGraphPayload(payload)) {
    throw new ToolError('core response validation failed: payload')
  }
  return payload
}

export { isDocGraphPayload, isGraphPayload }
```
- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- src/core.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/core.ts src/core.test.ts
git commit -m "feat(doc-graph): add core manager and core-to-UI mapping"
```

---

### Task 5: tool.ts（9 个 docgraph_* 工具定义）

**Files:**
- Create: `src/tool.ts`
- Test: `src/tool.test.ts`

**Interfaces:**
- Consumes: `src/core.ts` 的 `DocGraphCoreManager, getProjectRoot, mapContextResult, mapDriftResult, mapFilesResult, mapGraphResult, mapStatusResult, resolveRelPath, ToolError`；`src/types.ts` 的 `DocGraphPayload`
- Produces: `DOCGRAPH_TOOL_NAMES`（9 个名字）、`docgraphTools(ctx)`（返回 9 个 ToolDefinition）

- [ ] **Step 1: 写失败测试 src/tool.test.ts**

```ts
import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { DOCGRAPH_TOOL_NAMES, docgraphTools } from './tool.ts'
import type { IndexPayload } from './types.ts'

const fakeExec = { signal: new AbortController().signal, agent: {} } as never

const sampleIndex: IndexPayload = {
  schemaVersion: 1, kind: 'docgraph_status', project: 'demo', rootPath: '/x',
  state: { phase: 'ready', revision: 1 },
  summary: { docs: 1, nodes: 2, edges: 3, entities: 0, failed: 0, formats: [] },
  docs: [],
}

describe('docgraphTools', () => {
  const tools = docgraphTools({} as Context)

  it('registers exactly the 9 spec tools', () => {
    expect(DOCGRAPH_TOOL_NAMES).toEqual([
      'docgraph_index', 'docgraph_status', 'docgraph_context', 'docgraph_search',
      'docgraph_node', 'docgraph_files', 'docgraph_graph', 'docgraph_similar', 'docgraph_tags',
    ])
    for (const name of DOCGRAPH_TOOL_NAMES) {
      expect(tools.find((t) => t.name === name), name).toBeDefined()
    }
  })

  it('presentationMeta projects { kind, payload }', () => {
    const status = tools.find((t) => t.name === 'docgraph_status')!
    const meta = status.output.presentationMeta?.({}, sampleIndex)
    expect(meta).toEqual({ kind: 'docgraph_status', payload: sampleIndex })
  })

  it('docgraph_index rejects a subdirectory path (MVP root only)', async () => {
    const index = tools.find((t) => t.name === 'docgraph_index')!
    await expect(index.execute({ path: 'sub' }, fakeExec)).rejects.toThrow('MVP 仅支持索引项目根目录')
  })

  it('docgraph_graph rejects from/to outside trace', async () => {
    const graph = tools.find((t) => t.name === 'docgraph_graph')!
    await expect(graph.execute({ operation: 'impact', from: 'a.md' }, fakeExec)).rejects.toThrow('from/to only valid for trace')
  })

  it('docgraph_graph rejects document on trace', async () => {
    const graph = tools.find((t) => t.name === 'docgraph_graph')!
    await expect(graph.execute({ operation: 'trace', document: 'a.md', from: 'a.md', to: 'b.md' }, fakeExec)).rejects.toThrow('document not valid for trace')
  })

  it('docgraph_context rejects out-of-range maxNodes', async () => {
    const context = tools.find((t) => t.name === 'docgraph_context')!
    await expect(context.execute({ task: 'x', maxNodes: 500 }, fakeExec)).rejects.toThrow('maxNodes')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- src/tool.test.ts`
Expected: FAIL —— `Cannot find module './tool.ts'`

- [ ] **Step 3: 写 src/tool.ts**

```ts
/**
 * §7 Node-side tools. All nine docgraph_* tools share one core manager per
 * project root (so IndexState.revision is monotonic per process), validate
 * every path through resolveRelPath, and project `{ kind, payload }` into
 * presentationMeta so the client toolview cards and replay stay stable.
 */
import type { Context } from '@deepseek-ai/cordis'
import {
  defineTool,
  type InferArgs,
  type ParameterSchemaSpec,
  type ToolDefinition,
  type ToolRunContext,
} from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import {
  DocGraphCoreManager, getProjectRoot, mapContextResult, mapDriftResult,
  mapFilesResult, mapGraphResult, resolveRelPath,
} from './core.ts'
import type {
  DocGraphPayload, GraphOperation, GraphPayload,
} from './types.ts'
import { nodeId } from './types.ts'

export const DOCGRAPH_TOOL_NAMES = [
  'docgraph_index', 'docgraph_status', 'docgraph_context', 'docgraph_search',
  'docgraph_node', 'docgraph_files', 'docgraph_graph', 'docgraph_similar', 'docgraph_tags',
] as const

const managers = new Map<string, DocGraphCoreManager>()

function managerFor(ctx: Context, projectRoot: string): DocGraphCoreManager {
  let manager = managers.get(projectRoot)
  if (!manager) {
    manager = new DocGraphCoreManager(ctx, projectRoot)
    managers.set(projectRoot, manager)
  }
  return manager
}

function projectNameOf(root: string): string {
  return root.split(/[\\/]/).filter(Boolean).pop() ?? root
}

function optString(args: Record<string, unknown>, key: string, fallback = ''): string {
  const v = args[key]
  if (v === undefined) return fallback
  return typeof v === 'string' ? v : String(v)
}

function reqString(args: Record<string, unknown>, key: string, tool: string): string {
  const v = optString(args, key, '')
  if (v.trim() === '') throw new Error(`${tool}: \`${key}\` is required`)
  return v
}

function intInRange(args: Record<string, unknown>, key: string, fallback: number, min: number, max: number, tool: string): number {
  const v = args[key]
  if (v === undefined) return fallback
  const n = typeof v === 'number' ? Math.trunc(v) : Number(v)
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${tool}: \`${key}\` must be ${min}..${max}`)
  }
  return n
}

function boolArg(args: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = args[key]
  return typeof v === 'boolean' ? v : fallback
}

const FILTER_PARAMS: ParameterSchemaSpec = {
  status: { type: 'string', description: '治理过滤：文档状态' },
  sensitivity: { type: 'string', description: '治理过滤：敏感级别' },
  canonical_source: { type: 'string', description: '治理过滤：canonical 来源' },
  allowed_audience: { type: 'string', description: '治理过滤：允许受众' },
  as_of_date: { type: 'string', description: '治理过滤：YYYY-MM-DD' },
  claim_id: { type: 'string', description: '研究过滤：claim id' },
  source_type: { type: 'string', description: '研究过滤：来源类型' },
  confidence: { type: 'string', description: '研究过滤：置信度' },
  analyst_status: { type: 'string', description: '研究过滤：分析状态' },
}

const ENTITY_PARAMS: ParameterSchemaSpec = {
  entity_type: { type: 'string', description: '实体过滤：实体类型（仅 search）' },
  entity_id: { type: 'string', description: '实体过滤：实体 id（仅 search）' },
}

const PROJECT_PARAM: ParameterSchemaSpec = {
  project: { type: 'string', description: 'MVP 单 project，透传但为 no-op' },
}

function pickFilters(args: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of Object.keys(FILTER_PARAMS)) {
    const v = args[key]
    if (typeof v === 'string' && v !== '') out[key] = v
  }
  return out
}

function renderText(name: string, value: DocGraphPayload): string {
  switch (value.kind) {
    case 'docgraph_index':
      return `索引完成：${value.summary.docs} 文档 / ${value.summary.nodes} 节点 / ${value.summary.edges} 边（${value.state.phase}）`
    case 'docgraph_status':
      return `图谱状态：${value.state.phase}`
    case 'docgraph_graph':
      return `图谱：${value.nodes.length} 节点 / ${value.links.length} 边（${value.operation}${value.depth ? ` depth=${value.depth}` : ''}）`
    case 'docgraph_drift':
      return `漂移审计：${value.findings.length} 项发现`
    case 'docgraph_context':
      return `图谱查询：${value.results.length} 条结果`
    case 'docgraph_files':
      return `文档列表：${value.files.length} 个文件`
  }
}

interface ToolSpec<S extends ParameterSchemaSpec> {
  name: string
  description: string
  parameters: S
  execute(args: InferArgs<S>, exec: ToolRunContext): Promise<DocGraphPayload>
}

function docGraphTool<const S extends ParameterSchemaSpec>(spec: ToolSpec<S>): ToolDefinition {
  return defineTool({
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: renderText(spec.name, value as DocGraphPayload) }],
      presentationMeta: (_args, value) => ({ kind: (value as DocGraphPayload).kind, payload: value }),
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      return spec.execute(args as InferArgs<S>, exec) as unknown as JsonValue
    },
  })
}

const DESCRIPTIONS: Record<string, string> = {
  docgraph_index: 'Ensure the doc graph index for the project root, or force a full reindex (stops/restarts the core serve process). Returns index status.',
  docgraph_status: 'Return the current doc graph index status (four-phase state, summary counts, doc records).',
  docgraph_context: 'Query the graph context for a task; format="drift_audit" returns a drift audit payload.',
  docgraph_search: 'Search indexed documents/sections/entities in the doc graph.',
  docgraph_node: 'Look up one node by project-relative path.',
  docgraph_files: 'List indexed document files.',
  docgraph_graph: 'Expand the graph around a document: incoming/outgoing/impact/trace.',
  docgraph_similar: 'Find documents similar to the given document.',
  docgraph_tags: 'List documents or sections by tag.',
}

export function docgraphTools(ctx: Context): ToolDefinition[] {
  const root = (exec: ToolRunContext) => getProjectRoot(ctx, exec)
  const project = (exec: ToolRunContext) => projectNameOf(root(exec))

  return [
    docGraphTool({
      name: 'docgraph_index',
      description: DESCRIPTIONS.docgraph_index,
      parameters: {
        path: { type: 'string', description: 'MVP 仅接受 "." 或省略' },
        force: { type: 'boolean', description: 'true=停 serve→一次性 CLI 全量索引→重启 serve（慢，谨慎用）' },
        ...PROJECT_PARAM,
      },
      async execute(args, exec) {
        const pathArg = optString(args, 'path', '.')
        if (pathArg !== '.' && pathArg !== '') {
          throw new Error('docgraph_index: MVP 仅支持索引项目根目录')
        }
        const payload = await managerFor(ctx, root(exec)).index(boolArg(args, 'force', false))
        return { ...payload, kind: 'docgraph_index' as const }
      },
    }),

    docGraphTool({
      name: 'docgraph_status',
      description: DESCRIPTIONS.docgraph_status,
      parameters: { path: { type: 'string', description: 'MVP 仅接受 "." 或省略' }, ...PROJECT_PARAM },
      async execute(args, exec) {
        const pathArg = optString(args, 'path', '.')
        if (pathArg !== '.' && pathArg !== '') {
          throw new Error('docgraph_status: MVP 仅支持索引项目根目录')
        }
        return managerFor(ctx, root(exec)).status()
      },
    }),

    docGraphTool({
      name: 'docgraph_context',
      description: DESCRIPTIONS.docgraph_context,
      parameters: {
        task: { type: 'string', required: true, description: '自然语言任务描述' },
        format: { type: 'string', description: "默认 'summary'；'drift_audit' 返回漂移审计" },
        maxNodes: { type: 'integer', description: '1..200，默认 10' },
        includeContent: { type: 'boolean', description: '默认 true' },
        maxContentBytes: { type: 'integer', description: '≤6000，默认 2000' },
        impactDepth: { type: 'integer', description: '1..3，默认 1' },
        referenceLimit: { type: 'integer', description: '1..20，默认 5' },
        ...FILTER_PARAMS,
        ...PROJECT_PARAM,
      },
      async execute(args, exec) {
        const task = reqString(args, 'task', 'docgraph_context')
        const format = optString(args, 'format', 'summary')
        const coreArgs = {
          task,
          format,
          maxNodes: intInRange(args, 'maxNodes', 10, 1, 200, 'docgraph_context'),
          includeContent: boolArg(args, 'includeContent', true),
          maxContentBytes: intInRange(args, 'maxContentBytes', 2000, 1, 6000, 'docgraph_context'),
          impactDepth: intInRange(args, 'impactDepth', 1, 1, 3, 'docgraph_context'),
          referenceLimit: intInRange(args, 'referenceLimit', 5, 1, 20, 'docgraph_context'),
          ...pickFilters(args),
        }
        const raw = await managerFor(ctx, root(exec)).query('docgraph_context', coreArgs, 15000, exec.signal)
        return format === 'drift_audit' ? mapDriftResult(raw, project(exec)) : mapContextResult(raw, project(exec))
      },
    }),

    docGraphTool({
      name: 'docgraph_search',
      description: DESCRIPTIONS.docgraph_search,
      parameters: {
        q: { type: 'string', required: true, description: '搜索查询' },
        limit: { type: 'integer', description: '1..200，默认 10' },
        include_code: { type: 'boolean', description: '默认 false' },
        kind: { type: 'string', description: "默认 'doc'" },
        ...ENTITY_PARAMS,
        ...FILTER_PARAMS,
        ...PROJECT_PARAM,
      },
      async execute(args, exec) {
        const coreArgs = {
          q: reqString(args, 'q', 'docgraph_search'),
          limit: intInRange(args, 'limit', 10, 1, 200, 'docgraph_search'),
          include_code: boolArg(args, 'include_code', false),
          kind: optString(args, 'kind', 'doc'),
          entity_type: optString(args, 'entity_type', ''),
          entity_id: optString(args, 'entity_id', ''),
          ...pickFilters(args),
        }
        const raw = await managerFor(ctx, root(exec)).query('docgraph_search', coreArgs, 15000, exec.signal)
        return mapContextResult(raw, project(exec))
      },
    }),

    docGraphTool({
      name: 'docgraph_node',
      description: DESCRIPTIONS.docgraph_node,
      parameters: {
        path: { type: 'string', required: true, description: '项目内相对路径（/ 分隔）' },
        section: { type: 'string', description: '章节锚点' },
        ...PROJECT_PARAM,
      },
      async execute(args, exec) {
        const projectRoot = root(exec)
        const rel = resolveRelPath(projectRoot, reqString(args, 'path', 'docgraph_node'))
        const raw = await managerFor(ctx, projectRoot).query('docgraph_node', { path: rel, section: optString(args, 'section', '') || undefined }, 15000, exec.signal)
        return mapContextResult(raw, project(exec))
      },
    }),

    docGraphTool({
      name: 'docgraph_files',
      description: DESCRIPTIONS.docgraph_files,
      parameters: {
        path: { type: 'string', description: '目录过滤（项目内相对路径）' },
        limit: { type: 'integer', description: '0..200，默认 50' },
        ...PROJECT_PARAM,
      },
      async execute(args, exec) {
        const projectRoot = root(exec)
        const pathArg = optString(args, 'path', '')
        const coreArgs: Record<string, unknown> = { limit: intInRange(args, 'limit', 50, 0, 200, 'docgraph_files') }
        if (pathArg !== '') coreArgs.path = resolveRelPath(projectRoot, pathArg)
        const raw = await managerFor(ctx, projectRoot).query('docgraph_files', coreArgs, 15000, exec.signal)
        return mapFilesResult(raw, project(exec))
      },
    }),
    docGraphTool({
      name: 'docgraph_graph',
      description: DESCRIPTIONS.docgraph_graph,
      parameters: {
        operation: { type: 'string', required: true, description: "'incoming' | 'outgoing' | 'impact' | 'trace'" },
        document: { type: 'string', description: 'incoming/outgoing/impact 必填；trace 禁用' },
        from: { type: 'string', description: 'trace 必填；其他操作禁用' },
        to: { type: 'string', description: 'trace 必填；其他操作禁用' },
        depth: { type: 'integer', description: 'impact 1..5，默认 2' },
        limit: { type: 'integer', description: '0..200，默认 10' },
        ...PROJECT_PARAM,
      },
      async execute(args, exec) {
        const operation = reqString(args, 'operation', 'docgraph_graph') as GraphOperation
        if (!['incoming', 'outgoing', 'impact', 'trace'].includes(operation)) {
          throw new Error('docgraph_graph: invalid operation')
        }
        let coreArgs: Record<string, unknown>
        let depth: number | undefined
        let seedFallback: string
        if (operation === 'trace') {
          if (args.document !== undefined) throw new Error('docgraph_graph: document not valid for trace')
          coreArgs = { operation, from: reqString(args, 'from', 'docgraph_graph'), to: reqString(args, 'to', 'docgraph_graph') }
          seedFallback = coreArgs.from as string
        } else {
          if (args.from !== undefined || args.to !== undefined) throw new Error('docgraph_graph: from/to only valid for trace')
          const document = reqString(args, 'document', 'docgraph_graph')
          coreArgs = { operation, document, limit: intInRange(args, 'limit', 10, 0, 200, 'docgraph_graph') }
          if (operation === 'impact') {
            depth = intInRange(args, 'depth', 2, 1, 5, 'docgraph_graph')
            coreArgs.depth = depth
          }
          seedFallback = document
        }
        const projectRoot = root(exec)
        const projectName = project(exec)
        const raw = await managerFor(ctx, projectRoot).query<Record<string, unknown>>('docgraph_graph', coreArgs, 15000, exec.signal)
        const rawSeed = typeof raw?.seedNodeId === 'string' ? raw.seedNodeId : typeof raw?.seed === 'string' ? raw.seed : ''
        const seedNodeId = rawSeed || nodeId(projectName, seedFallback)
        return mapGraphResult(raw, projectName, seedNodeId, operation, depth) as GraphPayload
      },
    }),

    docGraphTool({
      name: 'docgraph_similar',
      description: DESCRIPTIONS.docgraph_similar,
      parameters: {
        document: { type: 'string', required: true, description: '项目内相对路径' },
        limit: { type: 'integer', description: '默认 10' },
        engine: { type: 'string', description: "默认 'auto'" },
        ...PROJECT_PARAM,
      },
      async execute(args, exec) {
        const projectRoot = root(exec)
        const coreArgs = {
          document: resolveRelPath(projectRoot, reqString(args, 'document', 'docgraph_similar')),
          limit: intInRange(args, 'limit', 10, 1, 200, 'docgraph_similar'),
          engine: optString(args, 'engine', 'auto'),
        }
        const raw = await managerFor(ctx, projectRoot).query('docgraph_similar', coreArgs, 15000, exec.signal)
        return mapContextResult(raw, project(exec))
      },
    }),

    docGraphTool({
      name: 'docgraph_tags',
      description: DESCRIPTIONS.docgraph_tags,
      parameters: {
        tag: { type: 'string', description: '按 tag 过滤' },
        ...PROJECT_PARAM,
      },
      async execute(args, exec) {
        const coreArgs: Record<string, unknown> = {}
        if (optString(args, 'tag', '') !== '') coreArgs.tag = optString(args, 'tag', '')
        const raw = await managerFor(ctx, root(exec)).query('docgraph_tags', coreArgs, 15000, exec.signal)
        return mapContextResult(raw, project(exec))
      },
    }),
  ]
}
```
- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- src/tool.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/tool.ts src/tool.test.ts
git commit -m "feat(doc-graph): register nine docgraph tools"
```

---

### Task 6: skill.ts + assets/doc-graph-skill.md + index.ts（Node 入口完整）

**Files:**
- Create: `src/skill.ts`, `assets/doc-graph-skill.md`, `src/index.ts`, `src/skill.test.ts`
- Modify: `README.md`（更新状态）

**Interfaces:**
- Consumes: `src/tool.ts` 的 `docgraphTools`；`src/types.ts`
- Produces: `docGraphSkillProvider`、插件入口 `apply(ctx)`（Task 12 只做 client 端，Node 端到此完成）

- [ ] **Step 1: 写失败测试 src/skill.test.ts**

```ts
import { describe, expect, it } from 'vitest'
import { docGraphSkillProvider } from './skill.ts'

describe('docGraphSkillProvider', () => {
  it('lists one bundled doc-graph candidate', async () => {
    const list = await docGraphSkillProvider.list()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('doc-graph')
    expect(list[0].invocation).toEqual({ modelInvocable: true, userInvocable: true })
  })
  it('loads the skill body with the tool selection table', async () => {
    const [candidate] = await docGraphSkillProvider.list()
    const skill = await docGraphSkillProvider.get(candidate)
    expect(skill.name).toBe('doc-graph')
    expect(skill.content).toContain('docgraph_')
    expect(skill.content).toContain('drift_audit')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- src/skill.test.ts`
Expected: FAIL —— `Cannot find module './skill.ts'`

- [ ] **Step 3: 写 src/skill.ts**

```ts
/**
 * Bundled `doc-graph` skill provider. Mirrors the official dsh-skill-badge
 * provider shape — one bundled candidate whose body ships in `assets/`.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  BUNDLED_SKILL_RANK,
  type SkillCandidate,
  type SkillDefinition,
  type SkillProvider,
} from '@deepseek-ai/dsh-skill'

const PROVIDER_NAME = 'dsh-doc-graph'
const SKILL_BODY_URL = new URL('../assets/doc-graph-skill.md', import.meta.url)
const RESOURCE_BASE = {
  kind: 'directory',
  path: fileURLToPath(new URL('../assets/', import.meta.url)),
} as const
const INVOCATION = { modelInvocable: true, userInvocable: true } as const
const DESCRIPTION =
  'Document knowledge-graph plugin usage: index docs, query impact/references, '
  + 'run drift audits. Load before the first docgraph_* call in a session.'

const CANDIDATE: SkillCandidate = {
  name: 'doc-graph',
  description: DESCRIPTION,
  invocation: INVOCATION,
  provider: PROVIDER_NAME,
  source: 'bundled',
  resourceBase: RESOURCE_BASE,
  rank: BUNDLED_SKILL_RANK,
  locator: SKILL_BODY_URL,
}

/** The bundled provider registered on `ctx.skills`. */
export const docGraphSkillProvider: SkillProvider = {
  name: PROVIDER_NAME,
  list: () => Promise.resolve([CANDIDATE]),
  async get(_candidate): Promise<SkillDefinition> {
    return {
      name: CANDIDATE.name,
      description: CANDIDATE.description,
      invocation: CANDIDATE.invocation,
      provider: CANDIDATE.provider,
      source: CANDIDATE.source,
      resourceBase: RESOURCE_BASE,
      content: await readFile(SKILL_BODY_URL, 'utf8'),
    }
  },
}
```

- [ ] **Step 4: 写 assets/doc-graph-skill.md**

```markdown
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
```

- [ ] **Step 5: 写 src/index.ts**

```ts
/**
 * dsh-doc-graph, node half: registers the nine `docgraph_*` tools and the
 * bundled `doc-graph` skill. The browser half (`src/client/`) registers the
 * toolview cards, the input dock, and the graph drawer.
 */
import type { Context } from '@deepseek-ai/cordis'
import { docgraphTools } from './tool.ts'
import { docGraphSkillProvider } from './skill.ts'

export const name = 'dsh-doc-graph'
export const inject = ['tools', 'skills']

export function apply(ctx: Context): void {
  for (const tool of docgraphTools(ctx)) ctx.tools.register(tool)
  ctx.skills.registerProvider(() => docGraphSkillProvider)
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm test -- src/skill.test.ts`
Expected: PASS

- [ ] **Step 7: 更新 README.md 状态段**

把 `## 状态` 一段替换为：


```markdown
## 状态

实现计划见 [docs/superpowers/plans/2026-08-19-dsh-doc-graph-implementation.md](docs/superpowers/plans/2026-08-19-dsh-doc-graph-implementation.md)。
```
- [ ] **Step 8: 提交**

```bash
git add src/skill.ts src/skill.test.ts src/index.ts assets/doc-graph-skill.md README.md
git commit -m "feat(doc-graph): add bundled skill and node plugin entry"
```

---

### Task 7: client/theme.ts + DocGraphUIContext.tsx（session 隔离 store）

**Files:**
- Create: `src/client/theme.ts`, `src/client/DocGraphUIContext.tsx`
- Test: `src/client/store.test.ts`

**Interfaces:**
- Consumes: `src/types.ts` 的 `DocGraphPayload, GraphMode, Role, ROLE_DEPTH`
- Produces: `resolveTheme`；`DocGraphUIContext, DocGraphUIProvider, useDocGraphUI, useSessionGraphState, SessionGraphState, DocGraphStore, createDefaultSessionState`

- [ ] **Step 1: 写失败测试 src/client/store.test.ts**

```ts
import { describe, expect, it } from 'vitest'
import { DocGraphStore, createDefaultSessionState } from './DocGraphUIContext.tsx'
import type { IndexPayload } from '../types.ts'

const sampleIndex: IndexPayload = {
  schemaVersion: 1, kind: 'docgraph_status', project: 'demo', rootPath: '/x',
  state: { phase: 'ready', revision: 1 },
  summary: { docs: 1, nodes: 1, edges: 0, entities: 0, failed: 0, formats: [] },
  docs: [],
}

describe('DocGraphStore', () => {
  it('creates default session state with §10.1 defaults', () => {
    const store = new DocGraphStore()
    const state = store.getState('s1')
    expect(state.sessionId).toBe('s1')
    expect(state.activeRoles).toEqual(new Set(['current', 'direct', 'transitive', 'section']))
    expect(state.activeDepth).toBe(2)
    expect(state.selectedNodeId).toBeNull()
    expect(state.mode).toBe('2d')
    expect(state.drawerOpen).toBe(false)
  })

  it('setPayload keeps per-session isolation', () => {
    const store = new DocGraphStore()
    store.setPayload('s1', sampleIndex)
    store.setPayload('s2', { ...sampleIndex, project: 'other' })
    expect(store.getState('s1').activePayload?.project).toBe('demo')
    expect(store.getState('s2').activePayload?.project).toBe('other')
  })

  it('openDrawer merges payload and opens drawer', () => {
    const store = new DocGraphStore()
    store.openDrawer('s1', sampleIndex)
    const state = store.getState('s1')
    expect(state.drawerOpen).toBe(true)
    expect(state.activePayload).toEqual(sampleIndex)
    store.closeDrawer('s1')
    expect(store.getState('s1').drawerOpen).toBe(false)
  })

  it('evicts the oldest session beyond LRU 20', () => {
    const store = new DocGraphStore()
    for (let i = 0; i < 21; i++) store.getState(`s${i}`)
    expect(store.getState('s0')).toEqual(createDefaultSessionState('s0'))
    expect(store.has('s1')).toBe(true)
    expect(store.has('s0')).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- src/client/store.test.ts`
Expected: FAIL —— `Cannot find module './DocGraphUIContext.tsx'`

- [ ] **Step 3: 写 src/client/theme.ts（§8.1 token 桥接）**

```ts
/**
 * §8.1 host-theme bridge: read the six DSH `--dsw-alias-*` design tokens off
 * `document.body` and expose them as CSS custom properties for the drawer and
 * cards. Graph-only colors are plugin-owned (palette.ts) and never flip.
 */
const TOKEN_BRIDGE: readonly (readonly [string, string])[] = [
  ['label-primary', '--dsw-alias-label-primary'],
  ['bg-layer-1', '--dsw-alias-bg-layer-1'],
  ['label-caption', '--dsw-alias-label-caption'],
  ['border-l2', '--dsw-alias-border-l2'],
  ['brand-primary', '--dsw-alias-brand-primary-new-colorprimary-new-color'],
  ['label-primary-inverted', '--dsw-alias-label-primary-inverted'],
]

export interface ResolvedTheme {
  themeVars: Record<string, string>
  colorScheme: 'light' | 'dark'
}

export function resolveTheme(): ResolvedTheme {
  const computed = getComputedStyle(document.body)
  const themeVars: Record<string, string> = {}
  for (const [frameName, hostToken] of TOKEN_BRIDGE) {
    themeVars[frameName] = computed.getPropertyValue(hostToken)
  }
  const scheme = computed.colorScheme
  const colorScheme = scheme.includes('dark') && !scheme.includes('light')
    ? 'dark'
    : scheme.includes('light') && !scheme.includes('dark')
      ? 'light'
      : document.body.hasAttribute('data-ds-dark-theme')
        ? 'dark'
        : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  return { themeVars, colorScheme }
}
```

- [ ] **Step 4: 写 src/client/DocGraphUIContext.tsx**

```tsx
/**
 * §5.3/§9.3 drawer controller and per-session store. Cards and the dock link
 * through this context — never through direct DOM queries. Session state is a
 * Map<sessionId, SessionGraphState> with LRU 20 eviction.
 */
import {
  createContext, useContext, useMemo, useState, useSyncExternalStore,
  type ReactNode,
} from 'react'
import type { DocGraphPayload, GraphMode, Role } from '../types.ts'
import { ROLE_DEPTH } from '../types.ts'

export interface SessionGraphState {
  sessionId: string
  activePayload: DocGraphPayload | null
  activeRoles: Set<Role>
  activeDepth: number
  selectedNodeId: string | null
  mode: GraphMode
  drawerOpen: boolean
}

const DEFAULT_ROLES: readonly Role[] = ['current', 'direct', 'transitive', 'section']
const MAX_SESSIONS = 20

export function createDefaultSessionState(sessionId: string): SessionGraphState {
  return {
    sessionId,
    activePayload: null,
    activeRoles: new Set(DEFAULT_ROLES),
    activeDepth: 2,
    selectedNodeId: null,
    mode: '2d',
    drawerOpen: false,
  }
}

export class DocGraphStore {
  private sessions = new Map<string, SessionGraphState>()
  private listeners = new Set<() => void>()
  private version = 0

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  getState = (sessionId: string): SessionGraphState => {
    const existing = this.sessions.get(sessionId)
    if (existing) {
      // LRU touch: re-insert so Map iteration order reflects recency.
      this.sessions.delete(sessionId)
      this.sessions.set(sessionId, existing)
      return existing
    }
    const state = createDefaultSessionState(sessionId)
    if (this.sessions.size >= MAX_SESSIONS) {
      const oldest = this.sessions.keys().next().value
      if (oldest !== undefined) this.sessions.delete(oldest)
    }
    this.sessions.set(sessionId, state)
    return state
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = (): number => this.version

  private bump(): void {
    this.version += 1
    for (const listener of this.listeners) listener()
  }

  private patch(sessionId: string, patch: Partial<Omit<SessionGraphState, 'sessionId'>>): void {
    const state = this.getState(sessionId)
    this.sessions.set(sessionId, { ...state, ...patch })
    this.bump()
  }

  setPayload(sessionId: string, payload: DocGraphPayload): void {
    this.patch(sessionId, { activePayload: payload })
  }

  openDrawer(sessionId: string, payload?: DocGraphPayload): void {
    const state = this.getState(sessionId)
    this.patch(sessionId, { drawerOpen: true, activePayload: payload ?? state.activePayload })
  }

  closeDrawer(sessionId: string): void {
    this.patch(sessionId, { drawerOpen: false })
  }

  /** §10.4 focusNode: enable role + depth if needed, then select the node. */
  focusNode(sessionId: string, nodeId: string): void {
    const state = this.getState(sessionId)
    const nodes = state.activePayload?.kind === 'docgraph_graph' ? state.activePayload.nodes : []
    const node = nodes.find((n) => n.id === nodeId)
    if (!node) return
    const activeRoles = new Set(state.activeRoles)
    if (!activeRoles.has(node.role)) activeRoles.add(node.role)
    const activeDepth = ROLE_DEPTH[node.role] > state.activeDepth ? ROLE_DEPTH[node.role] : state.activeDepth
    this.patch(sessionId, { activeRoles, activeDepth, selectedNodeId: nodeId })
  }

  updateState(sessionId: string, patch: Partial<Omit<SessionGraphState, 'sessionId'>>): void {
    this.patch(sessionId, patch)
  }

  clear(): void {
    this.sessions.clear()
    this.bump()
  }
}

export interface DocGraphUIContextValue {
  openDrawer(sessionId: string, payload?: DocGraphPayload): void
  closeDrawer(sessionId: string): void
  focusNode(sessionId: string, nodeId: string): void
  setPayload(sessionId: string, payload: DocGraphPayload): void
  getState(sessionId: string): SessionGraphState
  updateState(sessionId: string, patch: Partial<Omit<SessionGraphState, 'sessionId'>>): void
  subscribe: (listener: () => void) => () => void
  getVersion: () => number
}

export const DocGraphUIContext = createContext<DocGraphUIContextValue | null>(null)

/** Module-level singleton store: slot components render outside any provider. */
export const docGraphStore = new DocGraphStore()

const fallbackUI: DocGraphUIContextValue = {
  openDrawer: (sessionId, payload) => docGraphStore.openDrawer(sessionId, payload),
  closeDrawer: (sessionId) => docGraphStore.closeDrawer(sessionId),
  focusNode: (sessionId, nodeId) => docGraphStore.focusNode(sessionId, nodeId),
  setPayload: (sessionId, payload) => docGraphStore.setPayload(sessionId, payload),
  getState: (sessionId) => docGraphStore.getState(sessionId),
  updateState: (sessionId, patch) => docGraphStore.updateState(sessionId, patch),
  subscribe: docGraphStore.subscribe,
  getVersion: docGraphStore.getVersion,
}

export function DocGraphUIProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => docGraphStore)
  const value = useMemo<DocGraphUIContextValue>(() => ({
    openDrawer: (sessionId, payload) => store.openDrawer(sessionId, payload),
    closeDrawer: (sessionId) => store.closeDrawer(sessionId),
    focusNode: (sessionId, nodeId) => store.focusNode(sessionId, nodeId),
    setPayload: (sessionId, payload) => store.setPayload(sessionId, payload),
    getState: (sessionId) => store.getState(sessionId),
    updateState: (sessionId, patch) => store.updateState(sessionId, patch),
    subscribe: store.subscribe,
    getVersion: store.getVersion,
  }), [store])
  return <DocGraphUIContext.Provider value={value}>{children}</DocGraphUIContext.Provider>
}

export function useDocGraphUI(): DocGraphUIContextValue {
  const ctx = useContext(DocGraphUIContext)
  return ctx ?? fallbackUI
}

/** Reactive per-session snapshot for cards, dock, and drawer. */
export function useSessionGraphState(sessionId: string): SessionGraphState {
  const ui = useDocGraphUI()
  return useSyncExternalStore(
    ui.subscribe,
    () => ui.getState(sessionId),
    () => ui.getState(sessionId),
  )
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm test -- src/client/store.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/client/theme.ts src/client/DocGraphUIContext.tsx src/client/store.test.ts
git commit -m "feat(doc-graph): add client theme bridge and per-session drawer store"

---

### Task 8: DocGraphDock + 4 类卡片 + CardDispatcher

**Files:**
- Create: `src/client/DocGraphDock.tsx`
- Create: `src/client/cards/CardDispatcher.tsx`, `IndexStatusCard.tsx`, `DriftAuditCard.tsx`, `ContextCard.tsx`, `GraphCard.tsx`

**Interfaces:**
- Consumes: `useDocGraphUI, useSessionGraphState`（Task 7）；`src/types.ts` 的 payload 类型与 guard；`src/palette.ts`、`src/layout.ts`
- Produces: `DocGraphDock`（注册到 `conversation.input.dock`）、`ToolviewCard`（注册为 9 个 toolview key 的组件）

- [ ] **Step 1: 写失败测试（组件 SSR 渲染测试）**

为保持依赖最小，用 `react-dom/server` 的 `renderToStaticMarkup` 在 node 环境断言卡片路由结果。`GraphCard` 依赖 ECharts 初始化，SSR 下只渲染容器与按钮（useEffect 不执行），因此可安全断言其按钮文案。创建 `src/client/cards.test.tsx`：

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DocGraphPayload, IndexPayload, DriftPayload, ContextPayload, GraphPayload } from '../types.ts'
import { ToolviewCard } from './cards/CardDispatcher.tsx'

function BlockWith(meta: unknown) {
  return { kind: 'tool', isError: false, content: [{ type: 'text', text: 'ok' }], meta } as never
}

const indexPayload: IndexPayload = {
  schemaVersion: 1, kind: 'docgraph_status', project: 'demo', rootPath: '/x',
  state: { phase: 'ready', revision: 1 },
  summary: { docs: 2, nodes: 3, edges: 4, entities: 0, failed: 0, formats: [{ fmt: 'md', pct: 100 }] },
  docs: [],
}

const driftPayload: DriftPayload = {
  schemaVersion: 1, kind: 'docgraph_drift', project: 'demo',
  findings: [{ code: 'D1', severity: 'warn', title: 'T', detail: 'D', actionable: true, actionLabel: 'Fix', docs: [] }],
}

const contextPayload: ContextPayload = {
  schemaVersion: 1, kind: 'docgraph_context', project: 'demo', truncated: false,
  results: [{ id: 'demo::a.md', project: 'demo', title: 'A', location: 'a.md', docPath: 'a.md', inbound: 1, chips: [] }],
}

const graphPayload: GraphPayload = {
  schemaVersion: 1, kind: 'docgraph_graph', project: 'demo', seedNodeId: 'demo::a.md', operation: 'impact', depth: 2,
  nodes: [{ id: 'demo::a.md', project: 'demo', name: 'a', type: 'doc', role: 'current', relPath: 'a.md', val: 1, inboundTotal: 0, outboundTotal: 0 }],
  links: [], dropped: { nodes: 0, links: 0 },
}

describe('ToolviewCard routing', () => {
  it('routes index payload to IndexStatusCard', () => {
    const html = renderToStaticMarkup(<ToolviewCard callId="c1" toolName="docgraph_status" block={BlockWith({ kind: 'docgraph_status', payload: indexPayload })} sessionId="s1" />)
    expect(html).toContain('文档')
    expect(html).toContain('节点')
  })
  it('routes drift payload to DriftAuditCard', () => {
    const html = renderToStaticMarkup(<ToolviewCard callId="c1" toolName="docgraph_context" block={BlockWith({ kind: 'docgraph_drift', payload: driftPayload })} sessionId="s1" />)
    expect(html).toContain('漂移')
    expect(html).toContain('T')
  })
  it('routes context payload to ContextCard', () => {
    const html = renderToStaticMarkup(<ToolviewCard callId="c1" toolName="docgraph_search" block={BlockWith({ kind: 'docgraph_context', payload: contextPayload })} sessionId="s1" />)
    expect(html).toContain('A')
  })
  it('routes graph payload to GraphCard with open button', () => {
    const html = renderToStaticMarkup(<ToolviewCard callId="c1" toolName="docgraph_graph" block={BlockWith({ kind: 'docgraph_graph', payload: graphPayload })} sessionId="s1" />)
    expect(html).toContain('在面板中打开')
  })
})
```

注意：`ToolviewCard` 的 props 类型若与测试传入不符，执行时把测试 props 断言为 `never` 即可（仅测试数据驱动渲染）。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- src/client/cards.test.tsx`
Expected: FAIL —— `Cannot find module './cards/CardDispatcher.tsx'`

- [ ] **Step 3: 写 src/client/DocGraphDock.tsx**

```tsx
/**
 * §9.2 input dock: four-phase state + root/docs/nodes/edges stats + two
 * buttons. MVP has no follow-up channel for the status button, so the button
 * falls back to an inline hint (spec §10.2 toast degradation).
 */
import { useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useDocGraphUI, useSessionGraphState } from './DocGraphUIContext.tsx'
import type { IndexPayload } from '../types.ts'

type DockProps = PropsRuntime<'conversation.input.dock'> & { sessionId?: string }

const PHASE_TEXT: Record<string, string> = {
  starting: '启动中',
  indexing: '索引中',
  ready: '就绪',
  error: '错误',
}

export function DocGraphDock({ sessionId: rawSessionId }: DockProps) {
  const sessionId = rawSessionId ?? 'default'
  const ui = useDocGraphUI()
  const state = useSessionGraphState(sessionId)
  const [hint, setHint] = useState('')

  const indexPayload: IndexPayload | null = state.activePayload?.kind === 'docgraph_status' || state.activePayload?.kind === 'docgraph_index'
    ? state.activePayload
    : null
  const phase = indexPayload?.state.phase ?? 'starting'
  const stats = indexPayload
    ? `${indexPayload.rootPath} · ${indexPayload.summary.docs} 文档 · ${indexPayload.summary.nodes} 节点 · ${indexPayload.summary.edges} 边`
    : '尚未索引'

  const onStatus = () => {
    setHint('请直接询问图谱状态')
    window.setTimeout(() => setHint(''), 2000)
  }

  const onPanel = () => ui.openDrawer(sessionId, state.activePayload ?? undefined)

  return (
    <div className="dsh-docgraph-dock" role="status">
      <span className={`dsh-docgraph-phase phase-${phase}`}>{PHASE_TEXT[phase] ?? phase}</span>
      <span className="dsh-docgraph-dock-stats">{stats}</span>
      <button type="button" className="dsh-docgraph-dock-btn" onClick={onStatus}>状态</button>
      <button type="button" className="dsh-docgraph-dock-btn" onClick={onPanel}>面板</button>
      {hint ? <span className="dsh-docgraph-dock-hint">{hint}</span> : null}
    </div>
  )
}
```

- [ ] **Step 4: 写 src/client/cards/IndexStatusCard.tsx**

```tsx
import type { IndexPayload } from '../../types.ts'

const PHASE_TEXT: Record<string, string> = {
  starting: '启动中', indexing: '索引中', ready: '就绪', error: '错误',
}

export function IndexStatusCard({ payload }: { payload: IndexPayload }) {
  const { summary, state } = payload
  return (
    <div className="dsh-docgraph-card dsh-docgraph-index-card">
      <div className="dsh-docgraph-card-hd">
        <span className={`dsh-docgraph-phase phase-${state.phase}`}>{PHASE_TEXT[state.phase] ?? state.phase}</span>
        <span className="dsh-docgraph-card-sub">{state.phase === 'ready' && state.finishedAt ? relTime(state.finishedAt) : ''}</span>
      </div>
      <div className="dsh-docgraph-stat-grid">
        <div className="dsh-docgraph-stat"><b>{summary.docs}</b><span>文档</span></div>
        <div className="dsh-docgraph-stat"><b>{summary.nodes}</b><span>节点</span></div>
        <div className="dsh-docgraph-stat"><b>{summary.edges}</b><span>引用边</span></div>
        <div className="dsh-docgraph-stat"><b>{summary.failed}</b><span>解析失败</span></div>
      </div>
      <div className="dsh-docgraph-formats">
        {summary.formats.map((f) => (
          <span key={f.fmt} className="dsh-docgraph-format" style={{ width: `${f.pct}%` }} title={`${f.fmt} ${f.pct}%`} />
        ))}
      </div>
      <div className="dsh-docgraph-legend">
        {summary.formats.map((f) => <span key={f.fmt}>{f.fmt} {f.pct}%</span>)}
      </div>
      <p className="dsh-docgraph-foot">文件变更会自动增量同步</p>
    </div>
  )
}

function relTime(epochMs: number): string {
  const diff = Date.now() - epochMs
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return `${Math.floor(diff / 86_400_000)} 天前`
}
```

- [ ] **Step 5: 写 src/client/cards/DriftAuditCard.tsx**

```tsx
import type { DriftPayload } from '../../types.ts'

const SEVERITY_TEXT = { err: '错误', warn: '警告', ok: '提示' } as const

export function DriftAuditCard({ payload }: { payload: DriftPayload }) {
  const counts = { err: 0, warn: 0, ok: 0 }
  for (const f of payload.findings) counts[f.severity] += 1
  return (
    <div className="dsh-docgraph-card dsh-docgraph-drift-card">
      <div className="dsh-docgraph-card-hd">
        <b>漂移审计</b>
        <span className="dsh-docgraph-card-sub">{counts.err} 错误 / {counts.warn} 警告 / {counts.ok} 提示</span>
      </div>
      {payload.findings.map((f) => (
        <div key={f.code} className={`dsh-docgraph-finding sev-${f.severity}`}>
          <div className="dsh-docgraph-finding-hd">
            <code>{f.code}</code>
            <b>{f.title}</b>
            <span className={`dsh-docgraph-sev sev-${f.severity}`}>{SEVERITY_TEXT[f.severity]}</span>
          </div>
          <p>{f.detail}</p>
          {f.actionable && f.actionLabel ? <button type="button" className="dsh-docgraph-action">{f.actionLabel}</button> : <span className="dsh-docgraph-action-off">无需动作</span>}
          {f.docs.length > 0 ? (
            <div className="dsh-docgraph-finding-docs">{f.docs.map((d) => <span key={d.id}>{d.name}</span>)}</div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 6: 写 src/client/cards/ContextCard.tsx**

```tsx
import { useState } from 'react'
import type { ContextPayload, FilesPayload } from '../../types.ts'

export function ContextCard({ payload }: { payload: ContextPayload | FilesPayload }) {
  if (payload.kind === 'docgraph_files') return <FilesList payload={payload} />
  return (
    <div className="dsh-docgraph-card dsh-docgraph-context-card">
      {payload.results.map((r) => (
        <ResultRow key={r.id} id={r.id} title={r.title} location={r.location} inbound={r.inbound} chips={r.chips} statusTag={r.statusTag} snippet={r.snippet} />
      ))}
      {payload.truncated ? <p className="dsh-docgraph-foot">结果已截断</p> : null}
    </div>
  )
}

function ResultRow({ id, title, location, inbound, chips, statusTag, snippet }: {
  id: string; title: string; location: string; inbound: number; chips: string[]
  statusTag?: { label: string; kind: 'active' | 'stale' | 'hot' | 'superseded' }
  snippet?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="dsh-docgraph-result">
      <div className="dsh-docgraph-result-hd" onClick={() => setOpen((v) => !v)}>
        <b>{title}</b>
        <code>{location}</code>
        <span className="dsh-docgraph-inbound">入引 {inbound}</span>
        {statusTag ? <span className={`dsh-docgraph-status-tag tag-${statusTag.kind}`}>{statusTag.label}</span> : null}
      </div>
      {chips.length > 0 ? <div className="dsh-docgraph-chips">{chips.map((c) => <span key={c}>{c}</span>)}</div> : null}
      {open && snippet ? <pre className="dsh-docgraph-snippet">{snippet}</pre> : null}
    </div>
  )
}

function FilesList({ payload }: { payload: FilesPayload }) {
  return (
    <div className="dsh-docgraph-card dsh-docgraph-context-card">
      {payload.files.map((f) => (
        <div key={f.id} className="dsh-docgraph-file-row">
          <span className={`dsh-docgraph-fmt fmt-${f.fmt}`}>{f.fmt}</span>
          <b>{f.name}</b>
          <code>{f.path}</code>
          <span className={`dsh-docgraph-file-status st-${f.status}`}>{f.status}</span>
          <span className="dsh-docgraph-inbound">入引 {f.inbound}</span>
        </div>
      ))}
      {payload.truncated ? <p className="dsh-docgraph-foot">文件列表已截断</p> : null}
    </div>
  )
}
```

- [ ] **Step 7: 写 src/client/cards/GraphCard.tsx**

```tsx
/**
 * §9.2 message-flow mini 2D graph. Deliberately a SEPARATE simplified
 * renderer (force layout) from the drawer Graph2D — it never reuses Graph2D.
 */
import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import { useDocGraphUI } from '../DocGraphUIContext.tsx'
import { COLORS, EDGE_2D, FILLS, FONT_MINI, NODE_TEXT_2D } from '../../palette.ts'
import { docSymbolPath, nodeSizeMini, sectionSymbolPath } from '../../layout.ts'
import type { GraphPayload } from '../../types.ts'

export function GraphCard({ payload, sessionId }: { payload: GraphPayload; sessionId: string }) {
  const ui = useDocGraphUI()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current)
    const nodes = payload.nodes.map((n) => {
      const [w, h] = nodeSizeMini(n)
      return {
        id: n.id,
        name: n.name,
        symbol: n.type === 'section' ? `path://${sectionSymbolPath(13)}` : `path://${docSymbolPath(w, h, 4)}`,
        symbolSize: n.type === 'section' ? [13, 13] : [w, h],
        itemStyle: { color: n.role === 'current' ? FILLS.current : FILLS[n.role], borderColor: COLORS[n.role], borderWidth: 1 },
        label: { show: true, color: NODE_TEXT_2D[n.role], fontSize: n.role === 'current' ? FONT_MINI.current : FONT_MINI.other, fontWeight: n.role === 'current' ? 650 : 500 },
        role: n.role,
      }
    })
    const links = payload.links.map((l) => ({
      source: l.source,
      target: l.target,
      lineStyle: { color: l.kind === 'contains' ? EDGE_2D.contains.color : EDGE_2D.references.color, width: l.kind === 'contains' ? EDGE_2D.contains.width : EDGE_2D.references.width, type: l.kind === 'contains' ? 'dashed' : 'solid', opacity: l.kind === 'contains' ? EDGE_2D.contains.opacity : EDGE_2D.references.opacity },
    }))
    chart.setOption({
      animation: false,
      series: [{
        type: 'graph',
        layout: 'force',
        force: { repulsion: 140, edgeLength: 64 },
        roam: false,
        draggable: false,
        data: nodes,
        links,
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: 7,
      }],
    })
    chart.on('click', (params: { dataType?: string; data?: { id?: string } }) => {
      const id = params.data?.id
      if (params.dataType === 'node' && id) {
        ui.openDrawer(sessionId, payload)
        ui.focusNode(sessionId, id)
      }
    })
    return () => chart.dispose()
  }, [payload, sessionId, ui])

  return (
    <div className="dsh-docgraph-card dsh-docgraph-graph-card">
      <div className="dsh-docgraph-mini" ref={ref} />
      <button type="button" className="dsh-docgraph-open-btn" onClick={() => ui.openDrawer(sessionId, payload)}>
        在面板中打开（3D/2D）
      </button>
    </div>
  )
}
```
- [ ] **Step 8: 写 src/client/cards/CardDispatcher.tsx**

```tsx
/**
 * §7.4 toolview router: register this one component under all nine
 * docgraph_* toolview keys. Routing is by exact `payload.kind` — never by
 * substring matching on `drift`.
 */
import { useEffect } from 'react'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { useDocGraphUI } from '../DocGraphUIContext.tsx'
import { isDocGraphPayload, type DocGraphPayload } from '../../types.ts'
import { IndexStatusCard } from './IndexStatusCard.tsx'
import { DriftAuditCard } from './DriftAuditCard.tsx'
import { ContextCard } from './ContextCard.tsx'
import { GraphCard } from './GraphCard.tsx'

type CardProps = ToolCallViewProps & { sessionId?: string }

type LooseBlock = {
  kind?: unknown
  isError?: boolean
  content?: readonly { type: string; text?: string }[]
  meta?: unknown
}

function payloadFromBlock(block: unknown): DocGraphPayload | null {
  if (typeof block !== 'object' || block === null) return null
  const b = block as LooseBlock
  if (!('kind' in b) || b.isError) return null
  const meta = b.meta as { kind?: unknown; payload?: unknown } | undefined
  if (!meta || typeof meta !== 'object') return null
  return isDocGraphPayload(meta.payload) ? meta.payload : null
}

function firstResultLine(content: readonly { type: string; text?: string }[] | undefined): string {
  for (const block of content ?? []) {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
      const newline = block.text.indexOf('\n')
      return newline === -1 ? block.text : block.text.slice(0, newline)
    }
  }
  return 'docgraph'
}

export function ToolviewCard(props: CardProps) {
  const sessionId = props.sessionId ?? 'default'
  const ui = useDocGraphUI()
  const payload = payloadFromBlock(props.block)

  useEffect(() => {
    if (payload) ui.setPayload(sessionId, payload)
  }, [sessionId, payload, ui])

  if (!payload) {
    const b = props.block as LooseBlock
    if (b && 'kind' in b && b.isError) {
      return <div className="dsh-docgraph-card dsh-docgraph-error">{firstResultLine(b.content)}</div>
    }
    return <div className="dsh-docgraph-card dsh-docgraph-error">docgraph · rendering…</div>
  }

  switch (payload.kind) {
    case 'docgraph_index':
    case 'docgraph_status':
      return <IndexStatusCard payload={payload} />
    case 'docgraph_drift':
      return <DriftAuditCard payload={payload} />
    case 'docgraph_graph':
      return <GraphCard payload={payload} sessionId={sessionId} />
    case 'docgraph_context':
    case 'docgraph_files':
      return <ContextCard payload={payload} />
  }
}
```

- [ ] **Step 9: 运行测试确认通过**

Run: `pnpm test -- src/client/cards.test.tsx`
Expected: PASS

- [ ] **Step 10: 提交**

```bash
git add src/client/DocGraphDock.tsx src/client/cards/CardDispatcher.tsx src/client/cards/IndexStatusCard.tsx src/client/cards/DriftAuditCard.tsx src/client/cards/ContextCard.tsx src/client/cards/GraphCard.tsx src/client/cards.test.tsx
git commit -m "feat(doc-graph): add dock and toolview cards"
```

---

### Task 9: Drawer 外壳 + OverviewSection + DocListSection

**Files:**
- Create: `src/client/drawer/DocGraphDrawer.tsx`, `OverviewSection.tsx`, `DocListSection.tsx`
- Test: `src/client/drawer.test.tsx`

**Interfaces:**
- Consumes: `useDocGraphUI, useSessionGraphState`；`GraphWorkspace`（Task 10 提供，本任务先以受控占位 import 并在 Task 10 落盘——执行时 Task 10 完成前 drawer.test 不 import DocGraphDrawer 的完整路径，见步骤说明）
- Produces: `DocGraphDrawer, OverviewSection, DocListSection`

> 执行说明：本任务与 Task 10 有文件依赖。实际执行时，先按本任务创建三个文件；`DocGraphDrawer` 中 import 的 `GraphWorkspace` 在 Task 10 创建。为避免中间态编译失败，Task 9 的验证只跑 drawer.test.tsx（只 import Overview/DocList），完整 typecheck 在 Task 10 后执行。

- [ ] **Step 1: 写失败测试 src/client/drawer.test.tsx**

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DocRecord } from '../types.ts'
import { DocListSection } from './drawer/DocListSection.tsx'
import { OverviewSection } from './drawer/OverviewSection.tsx'

const docs: DocRecord[] = [
  { id: 'demo::a.md', project: 'demo', name: 'a', path: 'a.md', fmt: 'md', status: 'ok', inbound: 2, sizeBytes: 10, updatedAt: 0, indexedAt: 0 },
  { id: 'demo::b.md', project: 'demo', name: 'b', path: 'b.md', fmt: 'mdx', status: 'changed', inbound: 1, sizeBytes: 20, updatedAt: 0, indexedAt: 0 },
]

describe('OverviewSection', () => {
  it('renders the five overview stats', () => {
    const html = renderToStaticMarkup(<OverviewSection summary={{ docs: 2, nodes: 3, edges: 4, entities: 5, failed: 1, formats: [{ fmt: 'md', pct: 100 }] }} />)
    for (const label of ['文档', '节点', '引用边', '实体', '解析失败']) expect(html).toContain(label)
  })
})

describe('DocListSection', () => {
  it('renders accessible document rows with disabled actions', () => {
    const html = renderToStaticMarkup(<DocListSection docs={docs} onFocus={() => undefined} />)
    expect(html).toContain('a.md')
    expect(html).toContain('role="button"')
    expect(html).toContain('aria-label')
    expect(html).toContain('disabled')
    expect(html).toContain('即将支持')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- src/client/drawer.test.tsx`
Expected: FAIL —— `Cannot find module './drawer/DocListSection.tsx'`

- [ ] **Step 3: 写 src/client/drawer/OverviewSection.tsx**

```tsx
import type { Summary } from '../../types.ts'

export function OverviewSection({ summary }: { summary: Summary }) {
  return (
    <section className="dsh-docgraph-section dsh-docgraph-overview" aria-label="总览">
      <h2>总览</h2>
      <div className="dsh-docgraph-overview-grid">
        <div className="dsh-docgraph-stat"><b>{summary.docs}</b><span>文档</span></div>
        <div className="dsh-docgraph-stat"><b>{summary.nodes}</b><span>节点</span></div>
        <div className="dsh-docgraph-stat"><b>{summary.edges}</b><span>引用边</span></div>
        <div className="dsh-docgraph-stat"><b>{summary.entities}</b><span>实体</span></div>
        <div className="dsh-docgraph-stat"><b>{summary.failed}</b><span>解析失败</span></div>
      </div>
      <div className="dsh-docgraph-formats">
        {summary.formats.map((f) => (
          <span key={f.fmt} className="dsh-docgraph-format" style={{ width: `${f.pct}%` }} title={`${f.fmt} ${f.pct}%`} />
        ))}
      </div>
      <div className="dsh-docgraph-legend">
        {summary.formats.map((f) => <span key={f.fmt}>{f.fmt} {f.pct}%</span>)}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: 写 src/client/drawer/DocListSection.tsx**

```tsx
import type { DocRecord } from '../../types.ts'

export function DocListSection({ docs, onFocus }: { docs: DocRecord[]; onFocus: (id: string) => void }) {
  return (
    <section className="dsh-docgraph-section dsh-docgraph-doclist" aria-label="项目文档列表">
      <h2>项目文档</h2>
      <div className="dsh-docgraph-doclist-actions">
        <button type="button" disabled title="即将支持">＋ 添加文件</button>
        <button type="button" disabled title="请让模型执行 docgraph_index force">重建全部</button>
      </div>
      <div className="dsh-docgraph-doclist-rows">
        {docs.map((doc) => (
          <div
            key={doc.id}
            className="dsh-docgraph-doc-row"
            role="button"
            tabIndex={0}
            aria-label={`${doc.name} ${doc.path} 入引 ${doc.inbound}`}
            onClick={() => onFocus(doc.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onFocus(doc.id)
              }
            }}
          >
            <span className={`dsh-docgraph-fmt fmt-${doc.fmt}`}>{doc.fmt}</span>
            <b>{doc.name}</b>
            <code>{doc.path}</code>
            <span className={`dsh-docgraph-file-status st-${doc.status}`}>{doc.status}</span>
            <span className="dsh-docgraph-inbound">入引 {doc.inbound}</span>
            <span className="dsh-docgraph-doc-actions">
              <button type="button" disabled title="即将支持">重建</button>
              <button type="button" disabled title="即将支持">替换</button>
              <button type="button" disabled title="即将支持">重解析</button>
              <button type="button" disabled title="即将支持">移除</button>
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 5: 写 src/client/drawer/DocGraphDrawer.tsx**

```tsx
import { useEffect } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useDocGraphUI, useSessionGraphState } from '../DocGraphUIContext.tsx'
import { GraphWorkspace } from './graph/GraphWorkspace.tsx'
import { OverviewSection } from './OverviewSection.tsx'
import { DocListSection } from './DocListSection.tsx'
import type { DocGraphPayload } from '../../types.ts'

type DrawerProps = PropsRuntime<'conversation.input.dock'> & { sessionId?: string }

export function DocGraphDrawer({ sessionId: rawSessionId }: DrawerProps) {
  const sessionId = rawSessionId ?? 'default'
  const ui = useDocGraphUI()
  const state = useSessionGraphState(sessionId)

  useEffect(() => {
    if (!state.drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ui.closeDrawer(sessionId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.drawerOpen, sessionId, ui])

  if (!state.drawerOpen) return null

  const indexPayload: Extract<DocGraphPayload, { kind: 'docgraph_index' | 'docgraph_status' }> | null =
    state.activePayload?.kind === 'docgraph_index' || state.activePayload?.kind === 'docgraph_status'
      ? state.activePayload
      : null

  return (
    <div className="dsh-docgraph-drawer-mask" onClick={() => ui.closeDrawer(sessionId)}>
      <div
        className="dsh-docgraph-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="文档图谱"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dr-hd">
          <div className="dr-hd-title">
            <b>文档图谱</b>
            <span className="scope">{indexPayload?.project ?? ''}</span>
            <span className="version-mark">spec v1</span>
            <span className="sync">文件变更会自动增量同步</span>
          </div>
          <button type="button" className="dsh-docgraph-close" aria-label="关闭" onClick={() => ui.closeDrawer(sessionId)}>✕</button>
        </div>
        <div className="dr-bd">
          <GraphWorkspace sessionId={sessionId} />
          {indexPayload
            ? <OverviewSection summary={indexPayload.summary} />
            : <section className="dsh-docgraph-section"><h2>总览</h2><p className="dsh-docgraph-foot">尚无索引状态</p></section>}
          <DocListSection docs={indexPayload?.docs ?? []} onFocus={(id) => ui.focusNode(sessionId, id)} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: 运行测试确认通过（本任务范围）**

Run: `pnpm test -- src/client/drawer.test.tsx`
Expected: PASS

- [ ] **Step 7: 暂不提交**

`DocGraphDrawer` 依赖 `GraphWorkspace`（Task 10）与 `GraphCanvas`（Task 11），本任务不提交；Task 11 Step 8 统一提交 Task 9/10/11 文件。

---

### Task 10: GraphWorkspace + GraphRail + Inspector

**Files:**
- Create: `src/client/drawer/graph/GraphWorkspace.tsx`, `GraphRail.tsx`, `Inspector.tsx`
- Test: `src/client/workspace.test.tsx`

**Interfaces:**
- Consumes: `useDocGraphUI, useSessionGraphState`；`ROLE_DEPTH, ROLE_NAME`；`GraphNode, GraphLink, Role, GraphPayload`
- Produces: `GraphWorkspace`（被 DocGraphDrawer 引用）、`GraphRail`、`Inspector`；`GraphWorkspace` 计算出的 `visibleNodes/visibleLinks/selectedNode` 作为 props 传给 `GraphCanvas`（Task 11 实现）

- [ ] **Step 1: 写失败测试 src/client/workspace.test.tsx**

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { GraphNode, Role } from '../types.ts'
import { GraphRail } from './drawer/graph/GraphRail.tsx'
import { Inspector } from './drawer/graph/Inspector.tsx'

const node: GraphNode = {
  id: 'demo::a.md', project: 'demo', name: 'a', type: 'doc', role: 'current',
  relPath: 'a.md', val: 1, inboundTotal: 4, outboundTotal: 3,
}

describe('GraphRail', () => {
  it('renders five role checkboxes with other unchecked', () => {
    const html = renderToStaticMarkup(
      <GraphRail
        roles={new Set(['current', 'direct', 'transitive', 'section'])}
        depth={2}
        operation="impact"
        onChangeRole={() => undefined}
        onChangeDepth={() => undefined}
      />,
    )
    for (const label of ['当前文档', '直接影响', '传递影响', '章节', '其他']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('影响深度')
  })
  it('hides depth buttons in trace mode', () => {
    const html = renderToStaticMarkup(
      <GraphRail
        roles={new Set(['current'])}
        depth={2}
        operation="trace"
        onChangeRole={() => undefined}
        onChangeDepth={() => undefined}
      />,
    )
    expect(html).not.toContain('影响深度')
  })
})

describe('Inspector', () => {
  it('renders the empty state', () => {
    const html = renderToStaticMarkup(<Inspector node={null} activeDepth={2} onFocus={() => undefined} />)
    expect(html).toContain('选择一个节点')
  })
  it('renders node detail with total metrics', () => {
    const html = renderToStaticMarkup(<Inspector node={node} activeDepth={2} onFocus={() => undefined} />)
    expect(html).toContain('当前文档')
    expect(html).toContain('a.md')
    expect(html).toContain('4')
    expect(html).toContain('3')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- src/client/workspace.test.tsx`
Expected: FAIL —— `Cannot find module './drawer/graph/GraphRail.tsx'`

- [ ] **Step 3: 写 src/client/drawer/graph/GraphRail.tsx**

```tsx
import type { Role } from '../../../types.ts'

const ROLE_OPTIONS: Array<{ role: Role; label: string }> = [
  { role: 'current', label: '当前文档' },
  { role: 'direct', label: '直接影响' },
  { role: 'transitive', label: '传递影响' },
  { role: 'section', label: '章节' },
  { role: 'other', label: '其他' },
]

export function GraphRail({ roles, depth, operation, onChangeRole, onChangeDepth }: {
  roles: Set<Role>
  depth: number
  operation: string
  onChangeRole: (role: Role, checked: boolean) => void
  onChangeDepth: (depth: number) => void
}) {
  return (
    <aside className="dsh-docgraph-rail" aria-label="关系范围">
      <div className="dsh-docgraph-rail-group" role="group" aria-label="关系范围">
        {ROLE_OPTIONS.map(({ role, label }) => (
          <label key={role} className="dsh-docgraph-check">
            <input
              type="checkbox"
              checked={roles.has(role)}
              onChange={(e) => onChangeRole(role, e.target.checked)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {operation !== 'trace' ? (
        <div className="dsh-docgraph-rail-group" role="group" aria-label="影响深度">
          <span className="dsh-docgraph-rail-label">影响深度</span>
          {[1, 2, 3].map((d) => (
            <button
              key={d}
              type="button"
              className={`dsh-docgraph-depth${d === depth ? ' on' : ''}`}
              aria-pressed={d === depth}
              onClick={() => onChangeDepth(d)}
            >
              {d}
            </button>
          ))}
        </div>
      ) : null}
      <p className="dsh-docgraph-rail-foot">筛选控制传递节点的可见范围</p>
    </aside>
  )
}
```

- [ ] **Step 4: 写 src/client/drawer/graph/Inspector.tsx**

```tsx
import { useState } from 'react'
import { ROLE_NAME } from '../../../types.ts'
import type { GraphNode } from '../../../types.ts'

export function Inspector({ node, activeDepth, onFocus }: {
  node: GraphNode | null
  activeDepth: number
  onFocus: () => void
}) {
  const [hint, setHint] = useState('')
  if (!node) {
    return (
      <div className="dsh-docgraph-inspector empty" aria-live="polite">
        <span className="dsh-docgraph-inspector-glyph">⌁</span>
        <b>选择一个节点</b>
        <p>节点详情会固定显示在这里，不会遮住图谱。</p>
      </div>
    )
  }
  return (
    <div className="dsh-docgraph-inspector" aria-live="polite">
      <span className="dsh-docgraph-inspector-kicker">{ROLE_NAME[node.role]}</span>
      <h3>{node.name}</h3>
      <code>{node.type === 'section' ? '章节节点 · 来自当前文档' : node.relPath}</code>
      <p>{ROLE_NAME[node.role]}关系 · 当前深度 {activeDepth}</p>
      <div className="dsh-docgraph-inspector-metrics">
        <div><b>{node.inboundTotal}</b><span>入引</span></div>
        <div><b>{node.outboundTotal}</b><span>出引</span></div>
      </div>
      <div className="dsh-docgraph-inspector-actions">
        <button type="button" onClick={() => setHint(`打开 ${node.name}（MVP 未接 docgraph_node 跳转）`)}>查看文档</button>
        <button type="button" onClick={onFocus}>聚焦节点</button>
      </div>
      {hint ? <span className="dsh-docgraph-toast">{hint}</span> : null}
    </div>
  )
}
```

- [ ] **Step 5: 写 src/client/drawer/graph/GraphWorkspace.tsx**

```tsx
import { useEffect, useMemo } from 'react'
import { useDocGraphUI, useSessionGraphState } from '../../DocGraphUIContext.tsx'
import { ROLE_DEPTH } from '../../../types.ts'
import type { GraphLink, GraphNode } from '../../../types.ts'
import { GraphRail } from './GraphRail.tsx'
import { GraphCanvas } from './GraphCanvas.tsx'
import { Inspector } from './Inspector.tsx'

export function GraphWorkspace({ sessionId }: { sessionId: string }) {
  const ui = useDocGraphUI()
  const state = useSessionGraphState(sessionId)
  const payload = state.activePayload?.kind === 'docgraph_graph' ? state.activePayload : null

  const visibleNodes = useMemo<GraphNode[]>(() => {
    if (!payload) return []
    return payload.nodes.filter((n) => state.activeRoles.has(n.role) && ROLE_DEPTH[n.role] <= state.activeDepth)
  }, [payload, state.activeRoles, state.activeDepth])

  const visibleLinks = useMemo<GraphLink[]>(() => {
    if (!payload) return []
    const ids = new Set(visibleNodes.map((n) => n.id))
    return payload.links.filter((l) => ids.has(l.source) && ids.has(l.target))
  }, [payload, visibleNodes])

  const selectedNode = useMemo<GraphNode | null>(
    () => visibleNodes.find((n) => n.id === state.selectedNodeId) ?? null,
    [visibleNodes, state.selectedNodeId],
  )

  useEffect(() => {
    if (!payload) return
    if (state.selectedNodeId && visibleNodes.some((n) => n.id === state.selectedNodeId)) return
    const seed = payload.seedNodeId || visibleNodes[0]?.id || null
    if (seed !== state.selectedNodeId) ui.updateState(sessionId, { selectedNodeId: seed })
  }, [payload, visibleNodes, state.selectedNodeId, sessionId, ui])

  if (!payload) {
    return (
      <section className="dsh-docgraph-workspace-empty" style={{ order: -1 }}>
        <b>图谱探索区</b>
        <p>暂无图谱数据：请先运行 docgraph_graph。</p>
      </section>
    )
  }

  return (
    <section className="dsh-docgraph-workspace" style={{ order: -1 }} aria-label="图谱工作区">
      <GraphRail
        roles={state.activeRoles}
        depth={state.activeDepth}
        operation={payload.operation}
        onChangeRole={(role, checked) => {
          const roles = new Set(state.activeRoles)
          if (checked) roles.add(role)
          else roles.delete(role)
          const selected = selectedNode
          const selectedHidden = selected && (!roles.has(selected.role) || ROLE_DEPTH[selected.role] > state.activeDepth)
          ui.updateState(sessionId, { activeRoles: roles, selectedNodeId: selectedHidden ? null : state.selectedNodeId })
        }}
        onChangeDepth={(depth) => {
          const selected = selectedNode
          const selectedHidden = selected && ROLE_DEPTH[selected.role] > depth
          ui.updateState(sessionId, { activeDepth: depth, selectedNodeId: selectedHidden ? null : state.selectedNodeId })
        }}
      />
      <GraphCanvas
        sessionId={sessionId}
        payload={payload}
        visibleNodes={visibleNodes}
        visibleLinks={visibleLinks}
        selectedNodeId={state.selectedNodeId}
        mode={state.mode}
        onSelect={(id) => ui.updateState(sessionId, { selectedNodeId: id })}
        onMode={(mode) => ui.updateState(sessionId, { mode })}
      />
      <Inspector
        node={selectedNode}
        activeDepth={state.activeDepth}
        onFocus={() => state.selectedNodeId ? ui.focusNode(sessionId, state.selectedNodeId) : undefined}
      />
    </section>
  )
}
```
- [ ] **Step 6: 运行测试确认通过（本任务范围）**

Run: `pnpm test -- src/client/workspace.test.tsx`
Expected: PASS

- [ ] **Step 7: 暂不提交**

`GraphWorkspace` 依赖 `GraphCanvas`（Task 11），本任务不提交；Task 11 Step 8 统一提交 Task 9/10/11 文件。

---

### Task 11: GraphCanvas + Graph2D + Graph3D（含引擎降级）

**Files:**
- Create: `src/client/drawer/graph/GraphCanvas.tsx`, `Graph2D.tsx`, `Graph3D.tsx`
- Modify: `package.json`（devDependencies 增加 `"jsdom": "^24.0.0"`，用于 §11.1 vi.mock 降级组件测试）
- Test: `src/client/graph.test.tsx`

**Interfaces:**
- Consumes: Task 10 的 `GraphWorkspace` 会传入 `payload, visibleNodes, visibleLinks, selectedNodeId, mode, onSelect, onMode`
- Produces: `GraphCanvas`；内部 `useGraphEngines`、`chooseMode`（纯函数，便于测试）、`EngineFallback`

- [ ] **Step 1: package.json 增加 jsdom 并安装**

在 `devDependencies` 中追加一行：

```json
    "jsdom": "^24.0.0",
```

Run: `pnpm install`

- [ ] **Step 2: 写失败测试 src/client/graph.test.tsx**

```tsx
// @vitest-environment jsdom
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseMode } from './drawer/graph/GraphCanvas.tsx'
import type { GraphPayload } from '../types.ts'

vi.mock('echarts', () => { throw new Error('echarts load failed') })

const chain: unknown = new Proxy(function () {}, {
  get(_t, prop) {
    if (prop === 'd3Force') return () => ({ strength: () => undefined, distance: () => undefined })
    if (prop === 'then') return undefined
    return () => chain
  },
})
vi.mock('3d-force-graph', () => ({ default: () => (_el: HTMLElement) => chain }))

describe('chooseMode', () => {
  it('keeps 2D mode with fallback when 2D failed and 3D available', () => {
    expect(chooseMode(false, true, true, false, '2d')).toBe('2d')
  })
  it('falls back 3D→2D when 3D failed', () => {
    expect(chooseMode(true, false, false, true, '3d')).toBe('2d')
  })
  it('returns none when both fail', () => {
    expect(chooseMode(false, false, true, true, '2d')).toBe('none')
  })
})

describe('GraphCanvas degradation', () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('renders 2D fallback when echarts import throws', async () => {
    const payload: GraphPayload = {
      schemaVersion: 1, kind: 'docgraph_graph', project: 'demo', seedNodeId: 'demo::a.md', operation: 'impact', depth: 2,
      nodes: [{ id: 'demo::a.md', project: 'demo', name: 'a', type: 'doc', role: 'current', relPath: 'a.md', val: 1, inboundTotal: 0, outboundTotal: 0 }],
      links: [], dropped: { nodes: 0, links: 0 },
    }
    const { GraphCanvas } = await import('./drawer/graph/GraphCanvas.tsx')
    await act(async () => {
      root.render(
        <GraphCanvas
          sessionId="s1"
          payload={payload}
          visibleNodes={payload.nodes}
          visibleLinks={[]}
          selectedNodeId="demo::a.md"
          mode="2d"
          onSelect={() => undefined}
          onMode={() => undefined}
        />,
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(container.innerHTML).toContain('2D 分析暂时不可用')
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm test -- src/client/graph.test.tsx`
Expected: FAIL —— `Cannot find module './drawer/graph/GraphCanvas.tsx'`

- [ ] **Step 4: 写 src/client/drawer/graph/Graph2D.tsx**

```tsx
import { useEffect, useRef } from 'react'
import type { GraphLink, GraphNode, GraphPayload, Role } from '../../../types.ts'
import {
  COLORS, CURRENT_2D, EDGE_ARROW_2D, EDGE_2D, FILLS, FONT_2D, NODE_TEXT_2D,
  RING_INNER, RING_LABEL_INNER, RING_LABEL_OUTER, RING_OUTER, SELECTED_2D,
} from '../../../palette.ts'
import { docSymbolPath, nodeSize2D, posFor2D, sectionSymbolPath } from '../../../layout.ts'

type EchartsModule = typeof import('echarts')

export function Graph2D({ echartsModule, payload, visibleNodes, visibleLinks, selectedNodeId, onSelect, resetSignal }: {
  echartsModule: EchartsModule
  payload: GraphPayload
  visibleNodes: GraphNode[]
  visibleLinks: GraphLink[]
  selectedNodeId: string | null
  onSelect: (id: string) => void
  resetSignal: number
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<EchartsModule['init']> | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    if (!elRef.current) return
    const chart = echartsModule.init(elRef.current)
    chartRef.current = chart
    chart.on('click', (params: { dataType?: string; data?: { id?: string } }) => {
      if (params.dataType === 'node' && params.data?.id) onSelectRef.current(params.data.id)
    })
    return () => {
      chart.dispose()
      chartRef.current = null
    }
  }, [echartsModule])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const width = elRef.current?.clientWidth ?? 600
    const height = elRef.current?.clientHeight ?? 400
    const minWH = Math.min(width, height)
    const data = visibleNodes.map((n, index) => {
      const [w, h] = nodeSize2D(n)
      const [x, y] = posFor2D(n, index, width, height)
      const selected = n.id === selectedNodeId
      const border = selected ? SELECTED_2D : n.role === 'current' ? CURRENT_2D : null
      return {
        id: n.id,
        name: n.name,
        x,
        y,
        symbol: n.type === 'section' ? `path://${sectionSymbolPath(17)}` : `path://${docSymbolPath(w, h, 6)}`,
        symbolSize: n.type === 'section' ? [17, 17] : [w, h],
        itemStyle: {
          color: FILLS[n.role],
          borderColor: selected ? SELECTED_2D.borderColor : COLORS[n.role],
          borderWidth: selected ? SELECTED_2D.borderWidth : border ? border.borderWidth : 1,
          shadowBlur: selected ? SELECTED_2D.shadowBlur : border ? border.shadowBlur : 0,
          shadowOffsetY: selected ? SELECTED_2D.shadowOffsetY : border ? border.shadowOffsetY : 0,
          shadowColor: selected ? SELECTED_2D.shadowColor : border ? border.shadowColor : 'transparent',
        },
        label: {
          show: true,
          color: NODE_TEXT_2D[n.role],
          fontSize: n.role === 'current' ? FONT_2D.current : n.type === 'section' ? FONT_2D.section : FONT_2D.other,
          fontWeight: n.role === 'current' || selected ? 650 : 500,
        },
        role: n.role,
      }
    })
    const linkData = visibleLinks.map((l) => {
      const selected = selectedNodeId !== null && (l.source === selectedNodeId || l.target === selectedNodeId)
      const style = l.kind === 'contains'
        ? EDGE_2D.contains
        : selected ? EDGE_2D.referencesSelected : EDGE_2D.references
      return {
        source: l.source,
        target: l.target,
        lineStyle: { color: style.color, width: style.width, type: style.type, opacity: style.opacity },
      }
    })
    chart.setOption({
      animation: false,
      graphic: [
        { type: 'circle', shape: { cx: width / 2, cy: height / 2, r: minWH * 0.23 }, style: { stroke: RING_INNER.stroke, fill: 'none', lineDash: RING_INNER.dash } },
        { type: 'circle', shape: { cx: width / 2, cy: height / 2, r: minWH * 0.43 }, style: { stroke: RING_OUTER.stroke, fill: 'none', lineDash: RING_OUTER.dash } },
        { type: 'text', left: width / 2 + minWH * 0.23 + 6, top: height / 2, style: { text: RING_LABEL_INNER.text, fill: RING_LABEL_INNER.color, font: '10px sans-serif' } },
        { type: 'text', left: width / 2 + minWH * 0.43 + 6, top: height / 2, style: { text: RING_LABEL_OUTER.text, fill: RING_LABEL_OUTER.color, font: '10px sans-serif' } },
      ],
      series: [{
        type: 'graph',
        layout: 'none',
        data,
        links: linkData,
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: EDGE_ARROW_2D.size,
        roam: false,
        draggable: false,
        emphasis: { focus: 'none' },
      }],
    }, true)
  }, [echartsModule, payload, visibleNodes, visibleLinks, selectedNodeId])

  useEffect(() => {
    if (resetSignal > 0) chartRef.current?.dispatchAction({ type: 'restore' })
  }, [resetSignal])

  return <div className="dsh-docgraph-g2d" ref={elRef} />
}
```

- [ ] **Step 5: 写 src/client/drawer/graph/Graph3D.tsx**

```tsx
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { GraphLink, GraphNode, GraphPayload, Role } from '../../../types.ts'
import { EDGE_3D, ROLE_STYLE_3D, SELECTED_3D } from '../../../palette.ts'
import { posFor3D } from '../../../layout.ts'
import { ROLE_NAME } from '../../../types.ts'

type ForceGraph3DModule = typeof import('3d-force-graph')

export function Graph3D({ forceGraphModule, payload, visibleNodes, visibleLinks, selectedNodeId, resetSignal }: {
  forceGraphModule: ForceGraph3DModule
  payload: GraphPayload
  visibleNodes: GraphNode[]
  visibleLinks: GraphLink[]
  selectedNodeId: string | null
  resetSignal: number
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<ReturnType<ReturnType<ForceGraph3DModule['default']>> | null>(null)

  useEffect(() => {
    if (!elRef.current) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const ForceGraph3D = forceGraphModule.default
    const graph = ForceGraph3D()(elRef.current)
    graphRef.current = graph

    const nodes = visibleNodes.map((n, index) => {
      const style = ROLE_STYLE_3D[n.role]
      const [x, y, z] = posFor3D(n, index)
      return { id: n.id, name: n.name, role: n.role, val: Math.pow(style.radius, 3), x, y, z, inboundTotal: n.inboundTotal, outboundTotal: n.outboundTotal }
    })
    const nodeById = new Map(nodes.map((n) => [n.id, n]))
    const links = visibleLinks.map((l) => ({ source: nodeById.get(l.source), target: nodeById.get(l.target), kind: l.kind })).filter((l) => l.source && l.target)

    graph.graphData({ nodes, links })
    graph.nodeVal((n: { val: number }) => n.val)
    graph.nodeRelSize(1)
    graph.nodeColor((n: { role: Role }) => ROLE_STYLE_3D[n.role].color)
    graph.nodeLabel((n: { name: string; role: Role }) => `${n.name} · ${ROLE_NAME[n.role]}`)
    graph.nodeThreeObject((node: { role: Role; id: string; val: number }) => {
      const style = ROLE_STYLE_3D[node.role]
      const selected = node.id === selectedNodeId
      const group = new THREE.Group()
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(style.radius, 16, 12),
        new THREE.MeshStandardMaterial({
          color: style.color,
          emissive: style.glow,
          emissiveIntensity: selected ? SELECTED_3D.emissiveIntensity : SELECTED_3D.emissiveIntensityRest,
        }),
      )
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(style.radius * 1.6, 16, 12),
        new THREE.MeshBasicMaterial({
          color: style.glow,
          transparent: true,
          opacity: selected ? SELECTED_3D.glowOpacity : style.glowOpacity,
        }),
      )
      group.add(glow)
      group.add(core)
      return group
    })
    graph.linkColor((l: { kind: string; source: { id: string }; target: { id: string } }) => {
      const selected = selectedNodeId !== null && (l.source.id === selectedNodeId || l.target.id === selectedNodeId)
      if (l.kind === 'contains') return EDGE_3D.contains.color
      return selected ? EDGE_3D.referencesSelected.color : EDGE_3D.references.color
    })
    graph.linkWidth((l: { kind: string; source: { id: string }; target: { id: string } }) => {
      const selected = selectedNodeId !== null && (l.source.id === selectedNodeId || l.target.id === selectedNodeId)
      if (l.kind === 'contains') return EDGE_3D.contains.width
      return selected ? EDGE_3D.referencesSelected.width : EDGE_3D.references.width
    })
    graph.linkOpacity((l: { kind: string }) => l.kind === 'contains' ? EDGE_3D.contains.opacity : EDGE_3D.references.opacity)
    graph.linkDirectionalArrowLength((l: { kind: string }) => l.kind === 'references' ? EDGE_3D.arrow.length : 0)
    graph.linkDirectionalArrowRelPos(EDGE_3D.arrow.relPos)
    graph.linkDirectionalArrowColor(() => EDGE_3D.arrow.color)
    graph.linkDirectionalParticles((l: { kind: string; source: { id: string }; target: { id: string } }) => {
      if (reduced) return 0
      const selected = selectedNodeId !== null && (l.source.id === selectedNodeId || l.target.id === selectedNodeId)
      return l.kind === 'references' && selected ? 1 : 0
    })
    graph.linkDirectionalParticleWidth(EDGE_3D.particleWidth)
    graph.d3Force('charge').strength(-120)
    graph.d3Force('link').distance(76)
    graph.cooldownTicks(120)
    graph.cameraPosition({ x: 0, y: 0, z: 250 }, { x: 0, y: 0, z: 0 }, 0)

    // ResizeObserver on the stage body (debounced 150ms).
    const el = elRef.current
    let resizeTimer: ReturnType<typeof setTimeout>
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        graph.width(el.clientWidth)
        graph.height(el.clientHeight)
        graph.zoomToFit(320, 64)
      }, 150)
    })
    ro.observe(el)

    return () => {
      clearTimeout(resizeTimer)
      ro.disconnect()
      graphRef.current = null
      // 3d-force-graph ships a private destructor used by its own examples.
      ;(graph as unknown as { _destructor?: () => void })._destructor?.()
    }
    // Rebuild on selection change so glow/particles update deterministically.
  }, [forceGraphModule, payload, visibleNodes, visibleLinks, selectedNodeId])

  useEffect(() => {
    const graph = graphRef.current
    if (!graph || resetSignal === 0) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    graph.d3ReheatSimulation()
    window.setTimeout(() => graph.zoomToFit(320, 64), reduced ? 250 : 550)
  }, [resetSignal])

  return <div className="dsh-docgraph-g3d" ref={elRef} />
}
```
- [ ] **Step 6: 写 src/client/drawer/graph/GraphCanvas.tsx**

```tsx
import { useEffect, useState } from 'react'
import type { GraphLink, GraphNode, GraphMode, GraphPayload } from '../../../types.ts'
import { Graph2D } from './Graph2D.tsx'
import { Graph3D } from './Graph3D.tsx'

type EchartsModule = typeof import('echarts')
type ForceGraph3DModule = typeof import('3d-force-graph')

export interface EngineState {
  g2d: EchartsModule | null
  g3d: ForceGraph3DModule | null
  g2dFailed: boolean
  g3dFailed: boolean
}

/** Pure mode fallback per §11.1. */
export function chooseMode(g2dOk: boolean, g3dOk: boolean, g2dFailed: boolean, g3dFailed: boolean, requested: GraphMode | 'none'): GraphMode | 'none' {
  if (g2dFailed && g3dFailed) return 'none'
  if (requested === '3d' && !g3dOk) {
    return g2dOk ? '2d' : '3d'
  }
  if (requested === '2d' && !g2dOk) {
    return '2d'
  }
  return requested
}

export function useGraphEngines(): EngineState {
  const [g2d, setG2d] = useState<EchartsModule | null>(null)
  const [g3d, setG3d] = useState<ForceGraph3DModule | null>(null)
  const [g2dFailed, setG2dFailed] = useState(false)
  const [g3dFailed, setG3dFailed] = useState(false)

  useEffect(() => {
    let alive = true
    import('echarts').then((m) => { if (alive) setG2d(m) }).catch(() => { if (alive) setG2dFailed(true) })
    import('3d-force-graph').then((m) => { if (alive) setG3d(m) }).catch(() => { if (alive) setG3dFailed(true) })
    return () => { alive = false }
  }, [])

  return { g2d, g3d, g2dFailed, g3dFailed }
}

export function GraphCanvas({ sessionId: _sessionId, payload, visibleNodes, visibleLinks, selectedNodeId, mode, onSelect, onMode }: {
  sessionId: string
  payload: GraphPayload
  visibleNodes: GraphNode[]
  visibleLinks: GraphLink[]

  selectedNodeId: string | null
  mode: GraphMode
  onSelect: (id: string) => void
  onMode: (mode: GraphMode) => void
}) {
  const engines = useGraphEngines()
  const [resetSignal, setResetSignal] = useState(0)
  const [hint, setHint] = useState('')

  const g2dOk = engines.g2d !== null && !engines.g2dFailed
  const g3dOk = engines.g3d !== null && !engines.g3dFailed
  const effectiveMode = chooseMode(g2dOk, g3dOk, engines.g2dFailed, engines.g3dFailed, mode)
  const bothFailed = engines.g2dFailed && engines.g3dFailed
  const visibleCount = visibleNodes.length
  const status = selectedNodeId ? `${visibleCount} 可见节点 · ${visibleLinks.length} 可见边` : '未选择节点'

  const onReset = () => {
    if (effectiveMode === '3d' && engines.g3d) {
      setResetSignal((v) => v + 1)
    } else if (effectiveMode === '2d' && engines.g2d) {
      setResetSignal((v) => v + 1)
      setHint('已重置 2D 视图')
      window.setTimeout(() => setHint(''), 2000)
    }
  }

  const onStageKeyDown = (e: { key: string; preventDefault: () => void }) => {
    if (e.key === 'Enter' && !selectedNodeId && visibleNodes.length > 0) {
      e.preventDefault()
      onSelect(visibleNodes[0].id)
      return
    }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
    e.preventDefault()
    const idx = visibleNodes.findIndex((n) => n.id === selectedNodeId)
    const nextIdx = idx === -1
      ? 0
      : e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? Math.min(visibleNodes.length - 1, idx + 1)
        : Math.max(0, idx - 1)
    if (visibleNodes[nextIdx]) onSelect(visibleNodes[nextIdx].id)
  }

  return (
    <div className="dsh-docgraph-canvas">
      <div className="dsh-docgraph-toolbar">
        {!(engines.g2dFailed && engines.g3dFailed) ? (
          <div className="dsh-docgraph-seg" role="tablist" aria-label="图谱模式">
            {!engines.g2dFailed ? (
              <button type="button" role="tab" aria-selected={effectiveMode === '2d'} className={effectiveMode === '2d' ? 'on' : ''} onClick={() => onMode('2d')}>2D</button>
            ) : null}
            {!engines.g3dFailed ? (
              <button type="button" role="tab" aria-selected={effectiveMode === '3d'} className={effectiveMode === '3d' ? 'on' : ''} onClick={() => onMode('3d')}>3D</button>
            ) : null}
          </div>
        ) : null}
        <span className="dsh-docgraph-canvas-status">{status}</span>
        <button type="button" className="dsh-docgraph-reset" onClick={onReset}>重置视图</button>
      </div>

      {bothFailed ? (
        <div className="dsh-docgraph-fallback">图谱引擎暂时不可用，请检查本地网络或依赖加载。</div>
      ) : effectiveMode === '2d' && engines.g2d ? (
        <div className="stage-body" tabIndex={0} onKeyDown={onStageKeyDown}>
          <Graph2D echartsModule={engines.g2d} payload={payload} visibleNodes={visibleNodes} visibleLinks={visibleLinks} selectedNodeId={selectedNodeId} onSelect={onSelect} resetSignal={resetSignal} />
        </div>
      ) : effectiveMode === '2d' ? (
        engines.g2dFailed
          ? <div className="dsh-docgraph-fallback" id="g2dFallback">2D 分析暂时不可用，请切换到 3D 探索。</div>
          : <div className="dsh-docgraph-fallback">2D 图谱加载中…</div>
      ) : effectiveMode === '3d' && engines.g3d ? (
        <div className="stage-body" tabIndex={0} onKeyDown={onStageKeyDown}>
          <Graph3D forceGraphModule={engines.g3d} payload={payload} visibleNodes={visibleNodes} visibleLinks={visibleLinks} selectedNodeId={selectedNodeId} resetSignal={resetSignal} />
        </div>
      ) : effectiveMode === '3d' ? (
        engines.g3dFailed
          ? <div className="dsh-docgraph-fallback" id="g3dFallback">3D 探索暂时不可用，请切换到 2D 图谱。</div>
          : <div className="dsh-docgraph-fallback">3D 图谱加载中…</div>
      ) : (
        <div className="dsh-docgraph-fallback">图谱引擎加载中…</div>
      )}

      {payload.dropped.links > 0 ? (
        <p className="dsh-docgraph-canvas-hint">另有 {payload.dropped.links} 条相似/外链等边未显示</p>
      ) : null}
      <p className="dsh-docgraph-canvas-hint">↑↓←→ 在可见节点间移动选择，Enter 选择第一个</p>
      {hint ? <span className="dsh-docgraph-toast">{hint}</span> : null}
    </div>
  )
}
```
- [ ] **Step 7: 运行测试确认通过**

Run: `pnpm test -- src/client/graph.test.tsx`
Expected: PASS

- [ ] **Step 8: 提交（Task 9/10/11 一起）**

```bash
git add package.json pnpm-lock.yaml src/client/drawer/DocGraphDrawer.tsx src/client/drawer/OverviewSection.tsx src/client/drawer/DocListSection.tsx src/client/drawer.test.tsx src/client/drawer/graph/GraphWorkspace.tsx src/client/drawer/graph/GraphRail.tsx src/client/drawer/graph/Inspector.tsx src/client/workspace.test.tsx src/client/drawer/graph/GraphCanvas.tsx src/client/drawer/graph/Graph2D.tsx src/client/drawer/graph/Graph3D.tsx src/client/graph.test.tsx
git commit -m "feat(doc-graph): add graph drawer workspace with 2D/3D engines"
```

---

### Task 12: client/index.tsx 入口 + docgraph.css + 全局收尾验证

**Files:**
- Create: `src/client/index.tsx`, `src/client/docgraph.css`
- Modify: `src/client/DocGraphUIContext.tsx`（模块级单例 store + 无 Provider 时的 fallback，保证宿主渲染我们的 slot 组件不抛错）

**Interfaces:**
- Consumes: Task 7-11 的全部客户端组件
- Produces: 客户端入口 `apply(ctx)`（注册 9 个 toolview key + dock + 可选 topbar/sidebar 入口 + 卸载清理）

- [ ] **Step 1: 确认 DocGraphUIContext 单例与 fallback 已就绪**

Task 7 已导出 `docGraphStore`、`fallbackUI` 并在 `useDocGraphUI` 中返回 `ctx ?? fallbackUI`，且 `DocGraphStore` 已带 `clear()`。本步骤无需改动，检查 `src/client/DocGraphUIContext.tsx` 包含上述内容即可。

- [ ] **Step 2: 写 src/client/index.tsx**

```tsx
/**
 * dsh-doc-graph, browser half: nine toolview keys, the input dock, and the
 * graph drawer overlay (mounted as a second dock-list entry with fixed
 * positioning). Optional topbar / sidebar entrances degrade to the dock.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { ToolviewCard } from './cards/CardDispatcher.tsx'
import { DocGraphDock } from './DocGraphDock.tsx'
import { DocGraphDrawer } from './drawer/DocGraphDrawer.tsx'
import { docGraphStore, useDocGraphUI } from './DocGraphUIContext.tsx'
import './docgraph.css'

export const name = 'dsh-doc-graph'
export const inject = ['slots']

const TOOL_NAMES = [
  'docgraph_index', 'docgraph_status', 'docgraph_context', 'docgraph_search',
  'docgraph_node', 'docgraph_files', 'docgraph_graph', 'docgraph_similar', 'docgraph_tags',
]

type SessionSlotProps = { sessionId?: string }

function TopbarButton({ sessionId: rawSessionId }: PropsRuntime<'conversation.session.header.actions'> & SessionSlotProps) {
  const ui = useDocGraphUI()
  const sessionId = rawSessionId ?? 'default'
  return <button type="button" className="dsh-docgraph-topbar-btn" onClick={() => ui.openDrawer(sessionId)}>图谱</button>
}

function SidebarButton({ sessionId: rawSessionId }: SessionSlotProps) {
  const ui = useDocGraphUI()
  const sessionId = rawSessionId ?? 'default'
  return <button type="button" className="dsh-docgraph-sidebar-btn" onClick={() => ui.openDrawer(sessionId)}>文档图谱</button>
}

export function apply(ctx: ClientContext): () => void {
  const disposers: Array<() => void> = []

  for (const toolName of TOOL_NAMES) {
    ctx.slots.inject('tool.call.toolview', () => {
      disposers.push(ctx.slots.register({ name: 'tool.call.toolview', key: toolName }, ToolviewCard))
    })
  }

  ctx.slots.inject('conversation.input.dock', () => {
    disposers.push(ctx.slots.register({ name: 'conversation.input.dock', id: 'docgraph-dock', order: 40 }, DocGraphDock))
    disposers.push(ctx.slots.register({ name: 'conversation.input.dock', id: 'docgraph-drawer', order: 50 }, DocGraphDrawer))
  })

  // Optional host entrances (R-015): skip silently when the slot is undeclared.
  try {
    ctx.slots.inject('conversation.session.header.actions', () => {
      disposers.push(ctx.slots.register({ name: 'conversation.session.header.actions', id: 'docgraph-topbar', order: 60 }, TopbarButton))
    })
  } catch { /* topbar slot not declared */ }
  try {
    ;(ctx.slots as unknown as { inject: (name: string, cb: () => void) => void }).inject('sidebar.footer.action', () => {
      disposers.push((ctx.slots as unknown as { register: (spec: object, comp: unknown) => () => void }).register(
        { name: 'sidebar.footer.action', id: 'docgraph-sidebar' },
        SidebarButton,
      ))
    })
  } catch { /* sidebar slot not declared */ }

  return () => {
    for (const dispose of disposers) dispose()
    docGraphStore.clear()
  }
}
```

- [ ] **Step 3: 写 src/client/docgraph.css（§8/§9/§10 全部样式）**

```css
/* §8.1 host tokens are available on the page; graph colors are plugin-owned. */
:root {
  --business: #163b5c;
  --border-l1: var(--dsw-alias-border-l2, #e5e2da);
}

/* ---- dock ---- */
.dsh-docgraph-dock {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
  padding: 6px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
}
.dsh-docgraph-dock-stats { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-caption); }
.dsh-docgraph-dock-btn {
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 12px;
  cursor: pointer;
}
.dsh-docgraph-dock-hint { font-size: 12px; color: var(--dsw-alias-brand-primary-new-colorprimary-new-color); }
.dsh-docgraph-phase { border-radius: 999px; padding: 1px 8px; font-size: 11px; font-weight: 600; }
.dsh-docgraph-phase.phase-ready { background: #e8f3ea; color: #2e7d43; }
.dsh-docgraph-phase.phase-indexing { background: #fff3df; color: #9a6b1f; }
.dsh-docgraph-phase.phase-starting { background: #eef4f7; color: #3d6a85; }
.dsh-docgraph-phase.phase-error { background: #fdecec; color: #b34040; }

/* ---- cards ---- */
.dsh-docgraph-card {
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dsh-docgraph-card-hd { display: flex; align-items: baseline; gap: 8px; }
.dsh-docgraph-card-sub { font-size: 12px; color: var(--dsw-alias-label-caption); }
.dsh-docgraph-stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.dsh-docgraph-stat { display: flex; flex-direction: column; gap: 2px; }
.dsh-docgraph-stat b { font-size: 20px; font-variant-numeric: tabular-nums; }
.dsh-docgraph-stat span { font-size: 12px; color: var(--dsw-alias-label-caption); }
.dsh-docgraph-formats { display: flex; height: 6px; border-radius: 3px; overflow: hidden; background: var(--dsw-alias-border-l2); }
.dsh-docgraph-format { display: block; height: 100%; background: var(--dsw-alias-brand-primary-new-colorprimary-new-color); }
.dsh-docgraph-legend { display: flex; flex-wrap: wrap; gap: 8px; font-size: 11px; color: var(--dsw-alias-label-caption); }
.dsh-docgraph-foot { margin: 0; font-size: 11px; color: var(--dsw-alias-label-caption); }

.dsh-docgraph-finding { border-left: 3px solid; padding: 6px 8px; display: flex; flex-direction: column; gap: 4px; }
.dsh-docgraph-finding.sev-err { border-color: #c94f4f; }
.dsh-docgraph-finding.sev-warn { border-color: #c18a3d; }
.dsh-docgraph-finding.sev-ok { border-color: #7fa58f; }
.dsh-docgraph-finding-hd { display: flex; align-items: baseline; gap: 8px; }
.dsh-docgraph-finding code { font-size: 11px; color: var(--dsw-alias-label-caption); }
.dsh-docgraph-sev { font-size: 11px; border-radius: 999px; padding: 0 6px; }
.dsh-docgraph-sev.sev-err { background: #fdecec; color: #b34040; }
.dsh-docgraph-sev.sev-warn { background: #fff3df; color: #9a6b1f; }
.dsh-docgraph-sev.sev-ok { background: #e8f3ea; color: #2e7d43; }
.dsh-docgraph-action { align-self: flex-start; border: 1px solid var(--dsw-alias-border-l2); background: transparent; border-radius: 6px; padding: 2px 8px; font-size: 12px; cursor: pointer; }
.dsh-docgraph-action-off { font-size: 11px; color: var(--dsw-alias-label-caption); }
.dsh-docgraph-finding-docs { display: flex; gap: 6px; font-size: 11px; color: var(--dsw-alias-label-caption); }

.dsh-docgraph-result { border-bottom: 1px solid var(--dsw-alias-border-l2); padding: 4px 0; }
.dsh-docgraph-result-hd { display: flex; align-items: baseline; gap: 8px; cursor: pointer; flex-wrap: wrap; }
.dsh-docgraph-result code { font-size: 11px; color: var(--dsw-alias-label-caption); }
.dsh-docgraph-inbound { font-size: 11px; color: var(--dsw-alias-label-caption); }
.dsh-docgraph-status-tag { font-size: 11px; border-radius: 999px; padding: 0 6px; }
.dsh-docgraph-status-tag.tag-active { background: #e8f3ea; color: #2e7d43; }
.dsh-docgraph-status-tag.tag-stale { background: #f4f3f0; color: #817d76; }
.dsh-docgraph-status-tag.tag-hot { background: #fdecec; color: #b34040; }
.dsh-docgraph-status-tag.tag-superseded { background: #eef4f7; color: #3d6a85; }
.dsh-docgraph-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.dsh-docgraph-chips span { font-size: 11px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; padding: 0 6px; }
.dsh-docgraph-snippet { margin: 4px 0 0; padding: 6px; background: rgba(0,0,0,.03); border-radius: 6px; font-size: 11px; white-space: pre-wrap; }

.dsh-docgraph-file-row { display: flex; align-items: baseline; gap: 8px; }
.dsh-docgraph-fmt { font-size: 10px; text-transform: uppercase; border-radius: 4px; padding: 0 4px; background: #f4f3f0; color: #817d76; }
.dsh-docgraph-file-status { font-size: 11px; }
.dsh-docgraph-file-status.st-ok { color: #2e7d43; }
.dsh-docgraph-file-status.st-changed { color: #9a6b1f; }
.dsh-docgraph-file-status.st-err { color: #b34040; }

.dsh-docgraph-mini { width: 100%; height: 180px; }
.dsh-docgraph-open-btn { align-self: flex-start; border: 1px solid var(--dsw-alias-border-l2); background: transparent; border-radius: 6px; padding: 3px 10px; font-size: 12px; cursor: pointer; }
.dsh-docgraph-error { font-size: 12px; color: var(--dsw-alias-label-caption); }

/* ---- drawer ---- */
.dsh-docgraph-drawer-mask {
  position: fixed;
  inset: 0;
  background: rgba(20, 24, 28, 0.32);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}
.dsh-docgraph-drawer {
  width: min(860px, 94vw);
  height: 100vh;
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--dsw-alias-label-primary);
  display: flex;
  flex-direction: column;
  box-shadow: -12px 0 40px rgba(0,0,0,.12);
}
@media (max-width: 1080px) { .dsh-docgraph-drawer { width: 96vw; } }
@media (max-width: 720px) { .dsh-docgraph-drawer { width: 100vw; } }

.dr-hd {
  height: 52px;
  flex: 0 0 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.dr-hd-title { display: flex; align-items: baseline; gap: 10px; font-size: 14px; }
.dr-hd .scope, .dr-hd .version-mark, .dr-hd .sync { font-size: 11px; color: var(--dsw-alias-label-caption); }
.dsh-docgraph-close { border: none; background: transparent; cursor: pointer; font-size: 14px; color: var(--dsw-alias-label-caption); }

.dr-bd {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.dsh-docgraph-section { display: flex; flex-direction: column; gap: 8px; }
.dsh-docgraph-section h2 { margin: 0; font-size: 13px; }
.dsh-docgraph-overview-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }

.dsh-docgraph-doclist-actions { display: flex; gap: 8px; }
.dsh-docgraph-doclist-actions button { border: 1px solid var(--dsw-alias-border-l2); background: transparent; border-radius: 6px; padding: 2px 8px; font-size: 12px; cursor: not-allowed; opacity: .55; }
.dsh-docgraph-doclist-rows { display: flex; flex-direction: column; }
.dsh-docgraph-doc-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 4px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  cursor: pointer;
  font-size: 13px;
}
.dsh-docgraph-doc-row:hover, .dsh-docgraph-doc-row:focus-visible { background: rgba(22,59,92,.05); }
.dsh-docgraph-doc-row code { font-size: 11px; color: var(--dsw-alias-label-caption); }
.dsh-docgraph-doc-actions { margin-left: auto; display: flex; gap: 4px; }
.dsh-docgraph-doc-actions button { border: 1px solid var(--dsw-alias-border-l2); background: transparent; border-radius: 4px; font-size: 11px; padding: 0 6px; cursor: not-allowed; opacity: .5; }

/* ---- graph workspace ---- */
.dsh-docgraph-workspace {
  display: grid;
  grid-template-columns: 156px minmax(0, 1fr) 226px;
  gap: 12px;
}
.dsh-docgraph-workspace-empty { border: 1px dashed var(--dsw-alias-border-l2); border-radius: 12px; padding: 24px; text-align: center; color: var(--dsw-alias-label-caption); }
.dsh-docgraph-rail { display: flex; flex-direction: column; gap: 12px; }
.dsh-docgraph-rail-group { display: flex; flex-direction: column; gap: 6px; }
.dsh-docgraph-check { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.dsh-docgraph-rail-label { font-size: 11px; color: var(--dsw-alias-label-caption); }
.dsh-docgraph-depth { border: 1px solid var(--dsw-alias-border-l2); background: transparent; border-radius: 6px; width: 28px; height: 24px; cursor: pointer; }
.dsh-docgraph-depth.on { border-color: var(--business); background: #163b5c; color: #fff; }
.dsh-docgraph-rail-foot { margin: 0; font-size: 11px; color: var(--dsw-alias-label-caption); }

.dsh-docgraph-canvas { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.dsh-docgraph-toolbar { display: flex; align-items: center; gap: 8px; }
.dsh-docgraph-seg { display: inline-flex; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; overflow: hidden; }
.dsh-docgraph-seg button { border: none; background: transparent; padding: 3px 10px; font-size: 12px; cursor: pointer; }
.dsh-docgraph-seg button.on { background: #163b5c; color: #fff; }
.dsh-docgraph-canvas-status { flex: 1; font-size: 11px; color: var(--dsw-alias-label-caption); text-align: right; }
.dsh-docgraph-reset { border: 1px solid var(--dsw-alias-border-l2); background: transparent; border-radius: 6px; padding: 2px 8px; font-size: 12px; cursor: pointer; }

.stage-body {
  position: relative;
  height: 520px;
  border: 1px solid var(--border-l1);
  border-radius: 12px;
  background: radial-gradient(900px 460px at 50% -10%, #ffffff 0%, #fbfaf8 56%, #f1efe9 100%);
  overflow: hidden;
}
.stage-body::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, rgba(17,17,17,.035) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(17,17,17,.035) 1px, transparent 1px);
  background-size: 32px 32px;
  -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,.65), transparent 86%);
  mask-image: linear-gradient(to bottom, rgba(0,0,0,.65), transparent 86%);
  pointer-events: none;
}
.dsh-docgraph-g2d, .dsh-docgraph-g3d { width: 100%; height: 100%; }
.dsh-docgraph-fallback { display: flex; align-items: center; justify-content: center; height: 200px; font-size: 12px; color: var(--dsw-alias-label-caption); border: 1px dashed var(--dsw-alias-border-l2); border-radius: 12px; }
.dsh-docgraph-canvas-hint { margin: 0; font-size: 11px; color: var(--dsw-alias-label-caption); }

/* ---- inspector ---- */
.dsh-docgraph-inspector { display: flex; flex-direction: column; gap: 6px; border-left: 1px solid var(--dsw-alias-border-l2); padding-left: 12px; }
.dsh-docgraph-inspector.empty { align-items: center; justify-content: center; text-align: center; color: var(--dsw-alias-label-caption); border-left: none; }
.dsh-docgraph-inspector-glyph { font-size: 32px; }
.dsh-docgraph-inspector-kicker { font-size: 10px; text-transform: uppercase; color: var(--business); letter-spacing: .06em; }
.dsh-docgraph-inspector h3 { margin: 0; font-size: 15px; }
.dsh-docgraph-inspector code { font-size: 11px; color: var(--dsw-alias-label-caption); }
.dsh-docgraph-inspector p { margin: 0; font-size: 12px; color: var(--dsw-alias-label-caption); }
.dsh-docgraph-inspector-metrics { display: flex; gap: 16px; }
.dsh-docgraph-inspector-metrics b { font-size: 20px; font-variant-numeric: tabular-nums; }
.dsh-docgraph-inspector-metrics span { font-size: 11px; color: var(--dsw-alias-label-caption); display: block; }
.dsh-docgraph-inspector-actions { display: flex; gap: 8px; }
.dsh-docgraph-inspector-actions button { border: 1px solid var(--dsw-alias-border-l2); background: transparent; border-radius: 6px; padding: 3px 10px; font-size: 12px; cursor: pointer; }

.dsh-docgraph-toast { position: fixed; right: 20px; bottom: 20px; background: #163b5c; color: #fff; font-size: 12px; padding: 6px 12px; border-radius: 8px; z-index: 1100; }

/* ---- responsive §9.1 ---- */
@media (max-width: 1120px) {
  .dsh-docgraph-workspace { grid-template-columns: 138px minmax(0, 1fr); }
  .dsh-docgraph-inspector {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    min-height: 0;
    border-left: none;
    border-top: 1px solid var(--dsw-alias-border-l2);
    padding-left: 0;
    padding-top: 10px;
  }
  .dsh-docgraph-inspector-metrics, .dsh-docgraph-inspector-actions { grid-column: 1 / -1; }
}
@media (max-width: 720px) {
  .dsh-docgraph-workspace { display: block; }
  .dsh-docgraph-rail { display: grid; grid-template-columns: 1fr 1fr; }
  .stage-body { height: 400px; }
  .dr-hd .scope, .dr-hd .version-mark, .dr-hd .sync { display: none; }
}

/* ---- reduced motion §11.3 ---- */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: .01ms !important; animation-duration: .01ms !important; }
}

/* ---- a11y §10.6 ---- */
:focus-visible { outline: 2px solid var(--business, #163b5c); outline-offset: 2px; }
```

- [ ] **Step 4: 运行完整验证**

```bash
pnpm run typecheck
pnpm test
pnpm run build
```

Expected:
- `typecheck`：两个 tsconfig 均通过。若 `3d-force-graph` / `three` 类型报错，在 `tsconfig.client.json` 的 `compilerOptions` 增加 `"skipLibCheck": true`（已包含）。
- `test`：全部通过（types/layout/core/tool/skill/store/cards/drawer/workspace/graph）。
- `build`：生成 `lib/index.js` 与 `lib/client.js`，且 `node scripts/copy-assets.mjs` 复制 skill 到 `lib/assets/`。

- [ ] **Step 5: 检查体积门槛（§12）**

Run: `node --input-type=module -e "import { statSync } from 'node:fs'; const b = statSync('lib/client.js').size; console.log(b, b > 1572864 ? 'OVER_1.5MB' : 'OK')"`
Expected 判定：输出 `OVER_1.5MB` 时，在 README 记录「lib/client.js 超过 1.5 MB，需将 three + 3d-force-graph 改 external + 动态 import 并修订 spec」；输出 `OK` 则无需处理。

- [ ] **Step 6: 提交**

```bash
git add src/client/index.tsx src/client/docgraph.css src/client/DocGraphUIContext.tsx README.md lib 2>/dev/null || true
git add -A
git commit -m "feat(doc-graph): wire client entry, styles, and finish build"
```

---

## Self-Review（写作后自查，执行者不必操作）

**1. Spec coverage 逐节核对**

| Spec 章节 | 覆盖 Task |
|-----------|-----------|
| §3 Core 桥接（MCP stdio、索引生命周期、超时/取消、binary 解析） | Task 3/4 |
| §4 数据契约（全部类型、guard、nodeId、IndexState） | Task 1/4 |
| §5 路径与身份（projectRoot、resolveRelPath、session 隔离 LRU 20） | Task 3/7 |
| §6 Core-to-UI 映射（节点/边丢弃、seed 顺序） | Task 4 |
| §7 工具规格（9 工具、filters、graph 参数、presentationMeta、skill） | Task 5/6 |
| §8 视觉规范（token、色板、字体、坐标 fixture） | Task 2/12 |
| §9 UI 组件规格（布局、组件清单、Drawer 控制器） | Task 7-12 |
| §10 交互规格（workspace 状态、事件流、disabled actions、focusNode、Inspector、a11y） | Task 7/10/11/12 |
| §11 降级与错误（引擎降级、core 错误、reduced motion、ResizeObserver） | Task 11/12 |
| §12 构建与依赖（package.json、cordis.patch、tsconfig、体积门槛） | Task 1/12 |
| §13 验收清单 | 下方验收 Runbook 逐条映射 |
| §14 废弃清单 | 已全部按最终决策编码（无百分比、精确 kind 路由、trace from/to 等） |

**2. Placeholder scan**：计划内无 TBD/TODO；每个代码步骤给出完整文件内容或完整替换块。

**3. Type consistency**：
- `DocGraphStore` 方法名与 `DocGraphUIContextValue` 一致（openDrawer/closeDrawer/focusNode/setPayload/getState/updateState/subscribe/getVersion）。
- `GraphWorkspace` 传给 `GraphCanvas` 的 props 与 Task 11 `GraphCanvas` 签名一致（sessionId/payload/visibleNodes/visibleLinks/selectedNodeId/mode/onSelect/onMode）。
- `GraphCanvas` 传给 `Graph2D`/`Graph3D` 的 props 与两个组件签名一致。
- `mapGraphResult` 在 Task 4 返回 `GraphPayload`；Task 5 `docgraph_graph` 使用 `as GraphPayload` 仅用于收窄 `mapGraphResult` 返回的联合类型（非 core 响应强转，符合 §4 禁令）。

---

## Acceptance Runbook（对应 spec §13）

在真实 DSH 会话中逐条执行：

1. `docgraph_index` → IndexStatusCard 四态（无百分比）+ dock 出现。
2. `docgraph_graph(operation='impact', document='<doc>')` → 2D 图：文档圆角矩形、章节菱形、current 深蓝实底白字、同心环、默认选中 seed。
3. 切 3D：球体 + 光晕；contains 无箭头、references 有箭头；选中边 1 个粒子（系统 reduced motion 时 0）。
4. 取消 direct → 对应节点/边消失；深度 1 → transitive 消失；选中节点被过滤 → inspector 空态。
5. 点击 2D/3D 节点 → inspector 显示 role/名称/路径/入引 total/出引 total；两视图同步高亮。
6. 文档列表点击行 → 行高亮 + 图定位（自动启用 role 筛选与深度）；actions disabled（title 即将支持）。
7. `docgraph_context(format='drift_audit')` → DriftAuditCard；其余 context 落 ContextCard；GraphCard mini 图点击节点打开 drawer 并定位。
8. 降级：`vi.mock` 测试已覆盖（`graph.test.tsx`）。
9. 响应式：DevTools 拉 1120px/720px/1080px 核对 §9.1。
10. 键盘：Tab 到 dock「面板」→ Enter 打开 → 文档行 Enter → 方向键移动选中 → 2D/3D 切换 → Escape 关闭。
11. 会话重放：卡片从 presentationMeta 恢复；drawer 默认关闭；旧 session 状态不串。
12. 路径安全：`docgraph_node(path='../etc')`、绝对路径、symlink escape 均返回工具错误。
13. core 进程：`kill` core 后下次调用自动重启一次；`docgraph_index(force=true)` 串行执行且期间查询返回 "Indexing in progress" 不崩溃。

---

## Execution Handoff

**计划已保存到 `docs/superpowers/plans/2026-08-19-dsh-doc-graph-implementation.md`。两种执行方式：**

1. **Subagent-Driven（推荐）**：每个 Task 派发一个全新 subagent，任务间进行两阶段 review，迭代快。
2. **Inline Execution**：在本会话中使用 executing-plans 批量执行，带检查点 review。

选哪种？
