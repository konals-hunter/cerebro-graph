# DSH Doc Graph v2 Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a versioned standalone mock demo that improves the 2D/3D document graph workspace UX and aesthetics without modifying `docs/dsh-mock-demo.html`.

**Architecture:** Copy the existing single-file HTML demo into `docs/dsh-mock-demo-v2.html`, then evolve the copied file in place. Keep the existing vanilla HTML/CSS/JavaScript and CDN-backed ECharts/Three.js/3d-force-graph dependencies, but reorganize the graph drawer into a workspace: a compact control rail, a graph canvas, and a stable inspector panel. Preserve the original chat-flow context, mock data, and direct-open behavior.

**Tech Stack:** Standalone HTML, CSS custom properties, vanilla JavaScript, ECharts 5.5, Three.js 0.160, 3d-force-graph 1.73.

## Global Constraints

- Never modify `docs/dsh-mock-demo.html`.
- Create the new deliverable at `docs/dsh-mock-demo-v2.html`.
- Keep the demo dependency-light and directly openable as a local HTML file.
- Preserve the existing DSH warm-minimal visual language: warm neutral base, ink text, restrained blue accent, hairline borders.
- Make 2D the default graph mode because it communicates graph topology more clearly; retain 3D as an exploratory mode.
- Move selected-node details out of the canvas and into a dedicated inspector on desktop; use a bottom sheet/info strip on narrow screens.
- Add accessible focus-visible states, Escape-to-close for the drawer/inspector, and reduced-motion fallbacks for CSS motion.
- Do not add decorative looping animation; every motion must support hierarchy, feedback, or spatial continuity.

---

### Task 1: Create the versioned source and preserve the baseline

**Files:**
- Create: `docs/dsh-mock-demo-v2.html` from the current `docs/dsh-mock-demo.html`.
- Modify: `TASKS.md` to mark this task complete and the next task in progress.

**Interfaces:**
- Consumes: existing standalone HTML demo, `DOCS`, `GRAPH`, `COLORS`, and graph initialization functions.
- Produces: a separate versioned HTML file that can be opened independently while the original remains byte-for-byte unchanged.

- [ ] **Step 1: Copy the original demo into the versioned path.**

Run:
```powershell
Copy-Item docs/dsh-mock-demo.html docs/dsh-mock-demo-v2.html
```

Expected: `docs/dsh-mock-demo-v2.html` exists and `docs/dsh-mock-demo.html` is unchanged.

- [ ] **Step 2: Verify the copy before editing.**

Run:
```powershell
(Get-FileHash docs/dsh-mock-demo.html).Hash
(Get-FileHash docs/dsh-mock-demo-v2.html).Hash
```

Expected: both hashes match before v2 edits begin.

- [ ] **Step 3: Change only the v2 document title and version marker.**

In the copied file, use:
```html
<title>dsh-doc-graph · Mock Demo v2</title>
```

and add a non-prominent version marker in the graph drawer header:
```html
<span class="version-mark">v2 · graph workspace</span>
```

- [ ] **Step 4: Mark the task tracker.**

Update `TASKS.md` so Task 1 is checked and Task 2 is the only in-progress task.

---

### Task 2: Recompose the graph workspace structure

**Files:**
- Modify: `docs/dsh-mock-demo-v2.html` around the drawer graph section and its CSS.
- Modify: `TASKS.md` to mark this task complete and the next task in progress.

**Interfaces:**
- Consumes: existing `drawer`, `stage`, `stage-tools`, `stage-body`, `nodeTip`, and `showTip()` behavior.
- Produces: `.graph-workspace`, `.graph-rail`, `.graph-canvas`, `.inspector`, and `.inspector-empty/.inspector-content` regions.

- [ ] **Step 1: Replace the single-row graph toolbar with a two-level control layout.**

Use this structure inside the graph section:
```html
<div class="graph-workspace" id="graphWorkspace">
  <aside class="graph-rail" aria-label="图谱筛选">
    <div class="rail-label">关系范围</div>
    <label class="filter-check"><input type="checkbox" data-role="current" checked><span class="swatch current"></span>当前文档</label>
    <label class="filter-check"><input type="checkbox" data-role="direct" checked><span class="swatch direct"></span>直接影响</label>
    <label class="filter-check"><input type="checkbox" data-role="transitive" checked><span class="swatch transitive"></span>传递影响</label>
    <label class="filter-check"><input type="checkbox" data-role="section" checked><span class="swatch section"></span>章节</label>
    <label class="filter-check"><input type="checkbox" data-role="other"><span class="swatch other"></span>其他文档</label>
    <div class="rail-divider"></div>
    <div class="rail-label">影响深度</div>
    <div class="depth-control" role="group" aria-label="影响深度">
      <button class="depth-btn on" data-depth="1">1</button>
      <button class="depth-btn" data-depth="2">2</button>
      <button class="depth-btn" data-depth="3">3</button>
    </div>
    <p class="rail-note">隐藏低相关节点可让路径更容易阅读。</p>
  </aside>
  <section class="graph-canvas" aria-label="文档关系图">
    <div class="canvas-toolbar">
      <div class="seg" role="tablist" aria-label="图谱视图">
        <button id="seg2d" class="on" role="tab" aria-selected="true" onclick="switchMode('2d')">2D 分析</button>
        <button id="seg3d" role="tab" aria-selected="false" onclick="switchMode('3d')">3D 探索</button>
      </div>
      <span class="canvas-status" id="canvasStatus">已选中 · security-policy.md</span>
      <span class="toolbar-spacer"></span>
      <button class="btn sm" id="btnFit">重置视图</button>
    </div>
    <div class="stage-body" id="stageBody">
      <div class="canvas-hint">拖拽节点移动 · 滚轮缩放 · 点击查看详情</div>
      <div id="g3d"></div>
      <div id="g2d"></div>
    </div>
  </section>
  <aside class="inspector" id="inspector" aria-live="polite">
    <div class="inspector-empty" id="inspectorEmpty">
      <div class="inspector-glyph">⌁</div>
      <strong>选择一个节点</strong>
      <span>节点详情会固定显示在这里，不会遮住图谱。</span>
    </div>
    <div class="inspector-content" id="inspectorContent" hidden>
      <div class="inspector-kicker" id="inspectorRole"></div>
      <h3 id="tipName"></h3>
      <code id="tipPath"></code>
      <p id="tipRel"></p>
      <div class="inspector-metrics">
        <div><b id="tipInbound">0</b><span>入引</span></div>
        <div><b id="tipOutbound">0</b><span>出引</span></div>
      </div>
      <div class="inspector-actions">
        <button class="btn primary sm" id="btnViewDoc">查看文档</button>
        <button class="btn sm" id="btnFocusNode">聚焦节点</button>
      </div>
    </div>
  </aside>
</div>
```

- [ ] **Step 2: Add an explicit graph workspace grid.**

Add CSS with a clear desktop-to-mobile layout:
```css
.graph-workspace{display:grid;grid-template-columns:154px minmax(0,1fr) 226px;gap:12px;align-items:stretch}
.graph-rail,.inspector{background:var(--bg-layer-3);border:1px solid var(--border-l2);border-radius:12px;padding:12px}
.graph-canvas{min-width:0}
.inspector{min-height:480px}
@media(max-width:1120px){.graph-workspace{grid-template-columns:138px minmax(0,1fr)}.inspector{grid-column:1/-1;min-height:0}}
@media(max-width:720px){.graph-workspace{display:block}.graph-rail{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:10px}.rail-note,.rail-divider{display:none}.inspector{margin-top:10px}.stage-body{height:420px}}
```

- [ ] **Step 3: Replace the canvas overlay tip with inspector styling.**

Remove the `.node-tip` visual overlay styles and add:
```css
.inspector-empty{height:100%;min-height:430px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;gap:7px;color:var(--label-secondary)}
.inspector-glyph{font-size:24px;color:var(--business);line-height:1}
.inspector-empty strong{font-size:12.5px;color:var(--label-primary)}
.inspector-empty span{font-size:11px;line-height:1.55}
.inspector-kicker{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--business);font-weight:700;margin-bottom:7px}
.inspector h3{font-size:15px;line-height:1.25;margin-bottom:4px;overflow-wrap:anywhere}
.inspector code{display:block;font:10.5px/1.45 ui-monospace,Consolas,monospace;color:var(--label-secondary);overflow-wrap:anywhere;margin-bottom:12px}
.inspector p{font-size:11px;color:var(--label-secondary);margin-bottom:14px}
.inspector-metrics{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--border-l2);border-bottom:1px solid var(--border-l2);padding:12px 0;margin-bottom:14px}
.inspector-metrics div{display:flex;flex-direction:column;gap:2px}.inspector-metrics div+div{border-left:1px solid var(--border-l2);padding-left:12px}.inspector-metrics b{font-size:20px;font-variant-numeric:tabular-nums}.inspector-metrics span{font-size:10px;color:var(--label-caption)}
.inspector-actions{display:flex;gap:6px;flex-wrap:wrap}
```

- [ ] **Step 4: Add visible canvas orientation and status cues.**

Add:
```css
.canvas-toolbar{display:flex;align-items:center;gap:9px;margin-bottom:9px}.canvas-status{font-size:10.5px;color:var(--label-secondary)}.toolbar-spacer{flex:1}.canvas-hint{position:absolute;right:12px;bottom:12px;z-index:4;font-size:10px;color:var(--label-caption);background:rgba(255,255,255,.82);border:1px solid var(--border-l1);border-radius:6px;padding:4px 7px;pointer-events:none}
```

- [ ] **Step 5: Mark the task tracker.**

Update `TASKS.md` so Task 2 is checked and Task 3 is the only in-progress task.

---

### Task 3: Implement filtering, depth, and inspector state

**Files:**
- Modify: `docs/dsh-mock-demo-v2.html` JavaScript graph state and event handlers.
- Modify: `TASKS.md` to mark this task complete and the next task in progress.

**Interfaces:**
- Consumes: `GRAPH`, `COLORS`, `ROLE_NAME`, `render2D()`, `render3D()`, `switchMode()`, and document lookup data.
- Produces: `activeRoles`, `activeDepth`, `selectedNodeId`, `setSelectedNode(id)`, `renderGraphFilters()`, and `updateInspector(id)`.

- [ ] **Step 1: Add explicit graph state.**

Insert before graph rendering:
```js
let activeRoles=new Set(['current','direct','transitive','section']);
let activeDepth=1;
let selectedNodeId='security-policy';
function visibleNodes(){
  return GRAPH.nodes.filter(n=>activeRoles.has(n.role));
}
function visibleLinks(){
  const ids=new Set(visibleNodes().map(n=>n.id));
  return GRAPH.links.filter(l=>ids.has(typeof l.source==='string'?l.source:l.source.id)&&ids.has(typeof l.target==='string'?l.target:l.target.id));
}
```

- [ ] **Step 2: Update both renderers to use filtered data.**

In `render2D()` and `render3D()`, replace `GRAPH.nodes` and `GRAPH.links` as graph data sources with `visibleNodes()` and `visibleLinks()`. Keep the original full graph data available for inspector counts.

- [ ] **Step 3: Implement inspector updates without overlaying the canvas.**

Replace `showTip(id)` with:
```js
function updateInspector(id){
  const n=GRAPH.nodes.find(x=>x.id===id); if(!n)return;
  selectedNodeId=id;
  const doc=DOCS.find(d=>d.id===id);
  const inbound=GRAPH.links.filter(l=>(typeof l.target==='string'?l.target:l.target.id)===id).length;
  const outbound=GRAPH.links.filter(l=>(typeof l.source==='string'?l.source:l.source.id)===id).length;
  document.getElementById('inspectorEmpty').hidden=false;
  document.getElementById('inspectorContent').hidden=false;
  document.getElementById('inspectorEmpty').hidden=true;
  document.getElementById('inspectorRole').textContent=ROLE_NAME[n.role];
  document.getElementById('tipName').textContent=n.name;
  document.getElementById('tipPath').textContent=doc?.path||'章节节点 · 来自当前文档';
  document.getElementById('tipRel').textContent=`${ROLE_NAME[n.role]}关系 · 当前深度 ${activeDepth}`;
  document.getElementById('tipInbound').textContent=inbound;
  document.getElementById('tipOutbound').textContent=outbound;
  document.getElementById('canvasStatus').textContent=`已选中 · ${n.name}`;
}
function showTip(id){updateInspector(id)}
function clearInspector(){selectedNodeId=null;document.getElementById('inspectorEmpty').hidden=false;document.getElementById('inspectorContent').hidden=true;document.getElementById('canvasStatus').textContent='未选择节点'}
```

- [ ] **Step 4: Wire filter and depth controls.**

Add:
```js
document.querySelectorAll('.filter-check input').forEach(input=>input.addEventListener('change',()=>{
  if(input.checked)activeRoles.add(input.dataset.role);else activeRoles.delete(input.dataset.role);
  render2D();render3D();
  if(selectedNodeId&&!activeRoles.has(GRAPH.nodes.find(n=>n.id===selectedNodeId)?.role))clearInspector();
}));
document.querySelectorAll('.depth-btn').forEach(button=>button.addEventListener('click',()=>{
  activeDepth=Number(button.dataset.depth);
  document.querySelectorAll('.depth-btn').forEach(item=>item.classList.toggle('on',item===button));
  document.getElementById('tipRel').textContent=selectedNodeId?`${ROLE_NAME[GRAPH.nodes.find(n=>n.id===selectedNodeId).role]}关系 · 当前深度 ${activeDepth}`:'选择一个节点查看关系';
  toast(`影响深度已切换为 ${activeDepth}`);
}));
```

- [ ] **Step 5: Wire inspector actions and keyboard behavior.**

Add:
```js
document.getElementById('btnViewDoc').onclick=()=>selectedNodeId&&toast(`打开 ${GRAPH.nodes.find(n=>n.id===selectedNodeId).name}（mock）`);
document.getElementById('btnFocusNode').onclick=()=>selectedNodeId&&focusNode(selectedNodeId);
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){
    if(drawer.classList.contains('on'))closeDrawer();
    else clearInspector();
  }
});
```

- [ ] **Step 6: Mark the task tracker.**

Update `TASKS.md` so Task 3 is checked and Task 4 is the only in-progress task.

---

### Task 4: Tune 2D/3D visual behavior and responsive states

**Files:**
- Modify: `docs/dsh-mock-demo-v2.html` renderer styling, mode state, responsive CSS, and labels.
- Modify: `TASKS.md` to mark this task complete and the next task in progress.

**Interfaces:**
- Consumes: filtered graph state and inspector state from Task 3.
- Produces: 2D-first initial mode, accessible mode tabs, graph-specific responsive layout, and restrained interaction feedback.

- [ ] **Step 1: Default the graph to 2D and expose accurate tab state.**

Change the initial `mode` and startup logic:
```js
let mode='2d';
window.addEventListener('load',()=>{
  if(threeReady){render3D();render2D();switchMode('2d');}
  else {switchMode('2d');document.getElementById('seg3d').style.display='none';}
  updateInspector('security-policy');
});
```

Update `switchMode(m)` to set `aria-selected` on both tab buttons and to preserve the selected node in the inspector.

- [ ] **Step 2: Make 2D emphasize topology and 3D emphasize exploration.**

Use these renderer decisions:
- 2D: stronger arrow contrast, larger labels for documents, adjacency emphasis, no automatic animation.
- 3D: slightly more subdued non-selected nodes, current node emissive highlight, explicit copy in the toolbar “拖拽旋转 · 滚轮缩放”.
- Both: keep the one-accent palette and avoid saturated rainbow node coloring.

- [ ] **Step 3: Add hover, focus, pressed, and reduced-motion states.**

Add:
```css
button:focus-visible,.filter-check:focus-within{outline:2px solid var(--business);outline-offset:2px}
.btn,.seg button,.depth-btn,.filter-check{transition:background-color 160ms ease-out,border-color 160ms ease-out,color 160ms ease-out,transform 160ms ease-out}
.btn:active,.seg button:active,.depth-btn:active{transform:scale(.97)}
.filter-check:hover{color:var(--label-primary)}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition-duration:0.01ms!important;animation-duration:0.01ms!important}}
```

- [ ] **Step 4: Add a narrow-screen inspector treatment.**

Use:
```css
@media(max-width:720px){
  .drawer{width:100vw}.dr-bd{padding:10px}.graph-rail{padding:10px}.filter-check{font-size:10.5px}.inspector{padding:11px}.inspector-empty{min-height:88px}.inspector-content{display:grid;grid-template-columns:1fr auto;gap:5px 10px}.inspector-metrics{grid-column:1/-1;margin:4px 0 8px}.inspector-actions{grid-column:1/-1}.inspector h3{font-size:14px}.canvas-hint{left:8px;right:auto;bottom:8px;max-width:calc(100% - 16px)}
}
```

- [ ] **Step 5: Mark the task tracker.**

Update `TASKS.md` so Task 4 is checked and Task 5 is the only in-progress task.

---

### Task 5: Verify the versioned artifact and original-file integrity

**Files:**
- Verify: `docs/dsh-mock-demo.html` remains unchanged.
- Verify: `docs/dsh-mock-demo-v2.html` renders and contains the new graph workspace.
- Modify: `TASKS.md` to mark all tasks complete.

**Interfaces:**
- Consumes: completed v2 HTML demo.
- Produces: fresh visual screenshots and command evidence for file integrity and script validity.

- [ ] **Step 1: Check the original file has no diff.**

Run:
```powershell
git diff -- docs/dsh-mock-demo.html
```

Expected: no output. If the directory is not a Git worktree, compare the original against its pre-edit SHA256 captured before implementation.

- [ ] **Step 2: Validate the new file has required UI hooks.**

Run:
```powershell
Select-String -Path docs/dsh-mock-demo-v2.html -Pattern 'graph-workspace','graph-rail','inspector','activeRoles','switchMode' | Measure-Object
```

Expected: count is at least 5.

- [ ] **Step 3: Render desktop and narrow screenshots.**

Run:
```powershell
```

Use the available HTML screenshot renderer at 1440x900 and 720x900. Confirm the drawer opens, 2D is selected by default, inspector content is visible, and the narrow layout does not clip the graph workspace.

- [ ] **Step 4: Exercise key interactions in the browser preview.**

Verify manually:
1. Open “文档图谱” from the top bar.
2. Confirm 2D is the initial mode.
3. Click a graph node and confirm the inspector updates without covering the canvas.
4. Toggle “其他文档” and confirm graph layers update.
5. Change impact depth and confirm the status updates.
6. Switch to 3D, use reset view, and switch back to 2D.
7. Press Escape once to close the drawer; reopen and press Escape after selection to clear the inspector state.

- [ ] **Step 5: Update `TASKS.md` to all complete.**

Expected final tracker:
```markdown
# Tasks
- [x] Step 1: Explore the current HTML demo, its assets, and recent project context
- [x] Step 2: Audit the 2D/3D graph UI and identify the highest-impact UX changes
- [x] Step 3: Ask one focused question and propose versioned redesign directions
- [x] Step 4: Create a versioned graph workspace demo without modifying the original
- [x] Step 5: Verify the new file visually and functionally, then summarize outputs
```
