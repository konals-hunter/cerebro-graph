# Review：`2026-08-19-dsh-doc-graph-implementation.md`

> 本文件为 review 记录，不修改原 plan 文档。
> 审查对象：`docs/superpowers/plans/2026-08-19-dsh-doc-graph-implementation.md`（共 4764 行）
> 审查日期：2026-08-19
> 审查结论：**计划设计覆盖度合格，但作为可执行文档当前不合格——存在严重文档结构错乱 + 多处测试/实现不一致，不能按现状直接执行。**

---

## 总结论

计划本身覆盖度很高（9 工具、core 桥接、store、卡片、Drawer、降级、验收 runbook 都有），但当前版本有两类硬伤：

1. **文档结构严重错乱**：多个代码块被从中间切断，后半段散落在文档末尾或完全不相关章节里；Task 1/2/3/4/5/6/8/10/11 的步骤顺序都不完整。
2. **多处测试与实现不一致**：照抄代码后，若干测试会失败。

建议先修复文档结构（把散落片段归位），再修正下面列出的测试/实现问题，然后重新执行 Self-Review 的 spec 覆盖表（原 4034-4049 行）。

---

## P0-1 文档结构错乱（必须先修）

代码块被切断、步骤错位的具体位置：

| 应出现位置 | 缺失内容 | 实际散落在 |
|---|---|---|
| Task 2 Step 4（原 756-757 行，`GRAPH_POS_2D` 刚开头就断开） | layout.ts 全部实现（fixture、`graphPoint2D`、`nodeSize2D`、`posFor2D/3D`、symbol path） | 原 4563-4669 行；Step 5/6 在原 4671-4681 行 |
| Task 3 Step 3（原 1108-1115 行，`JsonRpcClient.stop` 半截） | `stop()` 后半段 | 原 4538-4548 行；Step 4/5 在原 4550-4559 行 |
| Task 4 Step 3（原 1672 行断开） | `DocGraphCoreManager` 剩余部分：`stopClient/index/forceIndex/stop/assertPayload` | 原 4472-4523 行；Step 4/5 在原 4525-4535 行 |
| Task 5 Step 3（原 2033 行断开） | `docgraph_graph / docgraph_similar / docgraph_tags` 三个工具定义 | 原 4377-4457 行；Step 4/5 在原 4459-4469 行 |
| Task 6 Step 7（原 2202-2205 行为空） | README `## 状态` 替换内容 | 疑似片段在原 4362-4367 行；Step 8 在原 4369-4374 行 |
| Task 8 Step 7 GraphCard（原 2799 行 `data: nodes,` 断开） | setOption 中段（`links, edgeSymbol...`）与尾部 | 中段原 3008-3011 行；尾部原 4249-4270 行；CardDispatcher Step 8 在原 4272-4347 行 |
| Task 10 Step 5 GraphWorkspace（原 3261 行断开） | `GraphCanvas` props、`Inspector` 等尾部 | 原 4222-4234 行；Step 6/7 在原 4236-4246 行 |
| Task 11 Step 6 GraphCanvas（原 3620 行刚 import 完就断开） | GraphCanvas 全部实现 | 原 4080-4207 行（出现在 Acceptance Runbook 段落内部）；Step 7/8 在原 4209-4219 行 |
| Task 1 Step 8-11（types.test.ts TDD 步骤） | types.test.ts 及 Step 8-11 | 原 4685-4762 行（文档最末尾） |

另外：

- **Execution Handoff（原 4124-4131 行）被 GraphCanvas 代码拦腰截断**，之后再未接回，文档实际没有完整收尾。
- **Self-Review 原 4051 行**声称“每个代码步骤给出完整文件内容或完整替换块”，与上述事实不符。

执行者如果按行号顺序照抄，Task 2/3/4/5/8/10/11 都会抄到不完整代码。

---

## P0-2 测试与实现不一致（照做会测试失败）

1. **Task 3 `core.test.ts` 的 `FakeChild` 测试（原 833-840、848-863 行）**
   - `FakeChild` 里用了 `require('node:events')`，但项目是 ESM（`"type": "module"`），`require` 未定义。
   - `new JsonRpcClient({ bin: 'docgraph', args: [] })`（原 857 行）根本没有把 `fake` 注入，`client.start()` 会去 spawn 真实的 `docgraph`，直接失败。
   - 即使注入，按当前 `start()` 实现（原 1016-1017 行 `if (this.running) return Promise.resolve()`），注入的 child 不会被挂上 `stdout/stderr/exit` 监听，`request` 会超时。原 874 行和原 4553 行的备注承认需要 inject，但测试代码本身没有改。

2. **Task 4 `mapContextResult` 测试（原 1197-1206 行）与实现（原 1437-1442 行）冲突**
   - 测试传入 `path: 'a.md#h1:10'`，期望 `docPath === 'a.md'`、`location === 'a.md#h1:10'`。
   - 实现里 `p = raw.path` 直接等于 `'a.md#h1:10'`，没有拆分锚点，`docPath` 会是 `'a.md#h1:10'`，测试失败。

3. **Task 4 `mapGraphResult` 测试（原 1193 行）与实现（原 1362、1399-1400 行）冲突**
   - 测试期望 `dropped === { nodes: 1, links: 2 }`。
   - 实现把 core 返回的 `dropped.nodes=1` 作为基数，又对本地丢弃的 tag 节点 `droppedNodes += 1`，实际输出 `{ nodes: 2, links: 2 }`，测试失败。

4. **Task 8 `cards.test.tsx`（原 2532-2550 行）缺少 `DocGraphUIProvider` 包裹**
   - `ToolviewCard` 内部调用 `useDocGraphUI()`（原 4319 行），而 Task 7 版本的 `useDocGraphUI` 在没有 Provider 时会 `throw new Error('DocGraphUIProvider is required')`（原 2454-2457 行）。
   - 测试直接用 `renderToStaticMarkup(<ToolviewCard ... />)` 渲染，会抛错。Task 12 才把 `useDocGraphUI` 改成 fallback，Task 8 阶段测试无法通过。

5. **Task 10 `workspace.test.tsx` 的 GraphRail 断言（原 3040-3066 行）与实现（原 3094-3139 行）冲突**
   - 测试 `expect(html).toContain('current')` 等 role 字符串，但组件只渲染中文 label（`当前文档` 等），HTML 里没有 `'current'`。
   - 测试 `operation="trace"` 时 `expect(html).not.toContain('影响深度')`，但 `GraphRail` 底部 footer（原 3139 行）始终渲染“影响深度控制传递节点的可见范围”，trace 模式下也包含该文案，测试失败。

---

## P1 代码级问题 / 风险

1. **键盘导航未实现**：GraphCanvas 提示文案“↑↓←→ 在可见节点间移动选择，Enter 选择第一个”（原 4202 行），Acceptance Runbook 第 10 条也要求方向键移动选中，但全文没有对应的 `keydown`/`Arrow*` 处理（只搜到 Escape 和文档行的 Enter）。属于功能缺失。
2. **`docgraph_status` 的 `path` 参数未校验**（原 1934-1937 行）：全局约束要求所有路径参数经 `resolveRelPath`，`docgraph_index` 校验了，`docgraph_status` 的 `path` 参数被直接忽略。要么校验，要么从 schema 中去掉。
3. **`DocGraphCoreManager.status()` 里的无意义三元**（原 1649 行）：`/timeout/.test(msg) ? 'error' : 'error'`，两分支相同，应简化。
4. **`docgraph_graph` 的 raw seed id 未映射**（原 4414-4416 行）：core 若返回原始 `seedNodeId: "n1"`（raw 契约允许），而节点已被映射成 `demo::a.md`，则 `mapGraphResult` 里 `id === seedNodeId` 的 current 判定会失败，`payload.seedNodeId` 也会指向不存在的节点，Drawer 默认选中会落空。应先把 raw seed 映射为 namespaced id。
5. **`skill.ts` 的资源路径与 `copy-assets.mjs` 意图不一致**（原 2092-2095 行 vs 原 227-233 行）：skill 用 `new URL('../assets/...', import.meta.url)`，编译到 `lib/skill.js` 后指向包根 `assets/`，而不是 `lib/assets/`；`copy-assets.mjs` 复制到 `lib/assets/` 实际没有被使用。`package.json` 的 `files` 包含 `assets`，所以当前能用，但“仅 lib/ 可发布”的注释不成立。
6. **`Graph2D` 可能因 `onSelect` 每次渲染都变化而反复重建 ECharts**（GraphWorkspace 原 4222-4224 行传入新箭头函数；Graph2D effect 依赖 `onSelect`，原 3405 行）。每次选中状态变化都会 dispose + init 图表，可能闪烁或丢状态。建议 `useCallback` 或从 deps 中移除。
7. **`tsconfig.client.json` 没有 `noEmit`**（原 189-203 行）：`tsc -p tsconfig.client.json` 会就地输出 `.js/.jsx`，污染 `src/client`。typecheck 配置应加 `"noEmit": true`。
8. **`tsdown` 无配置文件**：File Structure 和 Task 1 都没有 `tsdown.config.ts`，需要确认 tsdown 默认能从 `exports` 构建出 `lib/index.js` 和 `lib/client.js` 两个入口，否则 `exports["./client"]` 会断。
9. **Task 9/10 会提交带未解析 import 的中间态**：Task 9 Step 7 提交的 `DocGraphDrawer` import 不存在的 `GraphWorkspace`；Task 10 Step 7 提交的 `GraphWorkspace` import 不存在的 `GraphCanvas`。Task 9 有说明，Task 10 没有，且两者都会产生“测试过但模块实际 broken”的 commit。
10. **`JsonRpcClient.request` 对已提前 abort 的 signal 没有处理**（原 1045-1058 行）：如果传入的 `AbortSignal` 已经 aborted，`addEventListener` 不会再触发，请求不会被取消。

---

## P2 小问题

- **File Structure 树不完整**：`src/tool.ts`（Task 5 的核心文件）没有出现在树里，`skill.test.ts`、`store.test.ts`、`cards.test.tsx`、`drawer.test.tsx`、`workspace.test.tsx`、`graph.test.tsx` 等测试文件也未列出。
- **Task 6 Interfaces 提到“Task 13”**（原 2045 行），但全文只有 12 个 Task。
- **`DocGraphStore` 的“LRU”实际是 FIFO**：`getState` 命中已有 session 时不重新插入 Map，淘汰按插入顺序而非最近使用顺序。
- **CSS 中 `.dsh-docgraph-inspector-metrics/.actions` 设 `grid-column`**（原 3986 行），但父容器是 flex，不生效。
- **`palette.ts` 中 `EDGE_ARROW_2D`、`STAGE_GRID` 定义后从未使用**（原 672、720 行），Graph2D/CSS 里都是硬编码的 9 和 32px。
- **`types.ts` 的 `has` helper 未使用**（原 408 行）。
- **Task 12 Step 5 体积检查用 `Get-Item ... | Select-Object Length`**（原 4019 行），是 PowerShell 语法，与其它 bash 风格 run 命令不一致（Windows 环境可能没问题，但应统一）。
- **Task 6 Step 7 的 README 替换块在正确位置是空的**，执行者不知道要写什么。

---

## 建议的修复顺序

1. 先把散落片段归位（P0-1 表），恢复 Task 1→12 的正常顺序和完整代码块。
2. 修 P0-2 的 5 个测试/实现不一致（或改测试，或改实现，二选一，但要明确）。
3. 处理 P1 中的键盘导航、seed id 映射、`noEmit`、`onSelect` 稳定性这几项会直接影响验收的功能点。
4. 重新跑一遍 Self-Review 的 spec 覆盖表（原 4034-4049 行），因为结构错乱后该表已不可信。

---

## 审查结论

**计划的设计和 spec 覆盖是及格的，但作为可执行文档目前不合格，需要一次结构性整理后再进入执行。**
