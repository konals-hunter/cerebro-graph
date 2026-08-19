# dsh-doc-graph 3D v4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create an isolated compact 3D graph demo where enlarged glowing spheres dominate low-saturation, shorter relation lines.

**Architecture:** Create one standalone HTML file with inline CSS and JavaScript. Reuse the graph data shape from v3, but use a compact force-directed `3d-force-graph` scene, custom sphere-plus-glow node objects, subdued link styling, compact legend, and selected-node inspector. Do not modify existing demos.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Three.js `0.160.0`, `3d-force-graph` `1.73.4`, `MeshPhongMaterial`, `SphereGeometry`, `SpriteMaterial`.

## Global Constraints

- Create only `docs/dsh-mock-demo-3d-v4.html` for implementation.
- Preserve `dsh-mock-demo.html`, `dsh-mock-demo-v2.html`, and `dsh-mock-demo-v3.html` byte-for-byte.
- Use compact force-directed behavior with target link distance `70–80` and charge approximately `-120`.
- Use role-specific sphere radii: current `9`, direct `7`, transitive `5.8`, section `5`, other `4.8`.
- Keep ordinary edge colors low-saturation and edge widths below node visual weight.
- Use explicit ternaries; do not use ambiguous `?.16` syntax.
- Include a visible fallback if Three.js or 3D Force Graph cannot initialize.
- Verify desktop and narrow screenshots, JavaScript syntax, and original/v2/v3 hashes.
- Remove temporary preview files and vendored libraries after verification.

---

### Task 1: Create standalone v4 shell and graph data

**Files:**
- Create: `D:\workstuff\agent-swarm\dsh-workshop\cerebro-graph\dsh-doc-graph\docs\dsh-mock-demo-3d-v4.html`

**Interfaces:**
- Produces global graph state: `GRAPH`, `COLORS`, `ROLE_NAME`, `ROLE_STYLE`, `selectedNodeId`.
- Produces DOM hooks: `#graph`, `#fallback`, `#legend`, `#inspector`, `#btnFit`, `#canvasStatus`.

- [ ] **Step 1: Write the standalone document skeleton**

Create a warm neutral page with a header, graph workspace, left legend, center `#graph` canvas, right inspector, and narrow-screen media rules. The center graph must have a stable minimum height of `640px` on desktop and `440px` on narrow screens. Include CDN scripts for ECharts-free 3D dependencies:

```html
<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/3d-force-graph@1.73.4/dist/3d-force-graph.min.js"></script>
```

Use CSS colors: canvas `#f7f6f3`, ink `#17232b`, navy `#173e59`, steel `#5f8294`, mist `#a9bbc2`, amber `#bc8750`, muted line `#82949b`.

- [ ] **Step 2: Add the reused graph dataset and role style map**

Use the 12-node/13-link `GRAPH` data from v3. Define role styles with explicit radius, core color, glow color, glow opacity, and label visibility:

```js
const ROLE_STYLE={
  current:{name:'当前文档',radius:9,color:'#173e59',glow:'#6d9bb0',glowOpacity:.25,label:true},
  direct:{name:'直接影响',radius:7,color:'#5f8294',glow:'#91b3bf',glowOpacity:.16,label:true},
  transitive:{name:'传递影响',radius:5.8,color:'#a9bbc2',glow:'#c2d1d5',glowOpacity:.10,label:false},
  section:{name:'章节',radius:5,color:'#bc8750',glow:'#d8aa76',glowOpacity:.12,label:false},
  other:{name:'其他文档',radius:4.8,color:'#9ca6a6',glow:'#c0c8c5',glowOpacity:.08,label:false}
};
```

- [ ] **Step 3: Run syntax validation before renderer code**

Run:

```powershell
$text=Get-Content -Raw docs/dsh-mock-demo-3d-v4.html
$script=[regex]::Match($text,'(?s)<script>(.*)</script>').Groups[1].Value
Set-Content -Path "$env:TEMP\dsh-mock-demo-3d-v4-script.js" -Value $script -Encoding utf8
node --check "$env:TEMP\dsh-mock-demo-3d-v4-script.js"
```

Expected: `node --check` exits `0`.

---

### Task 2: Implement compact node-led 3D renderer

**Files:**
- Modify: `D:\workstuff\agent-swarm\dsh-workshop\cerebro-graph\dsh-doc-graph\docs\dsh-mock-demo-3d-v4.html` inline script

**Interfaces:**
- Consumes `GRAPH`, `ROLE_STYLE`, and DOM hooks from Task 1.
- Produces `g3d`, `renderGraph()`, `makeSphereNode()`, `makeLabelSprite()`, `selectNode()`, `fitGraph()`.

- [ ] **Step 1: Add explicit visual helper functions**

Implement `makeLabelSprite(text,color,scale)` using a canvas texture with measured width and a manual rounded rectangle path; do not call `ctx.roundRect`. Implement `makeSphereNode(node)` with:

```js
const style=ROLE_STYLE[node.role];
const group=new THREE.Group();
const core=new THREE.Mesh(
  new THREE.SphereGeometry(style.radius,48,48),
  new THREE.MeshPhongMaterial({
    color:style.color,
    emissive:style.glow,
    emissiveIntensity:node.id===selectedNodeId?.32:.14,
    shininess:48,
    specular:'#c9d9dd'
  })
);
const glow=new THREE.Mesh(
  new THREE.SphereGeometry(style.radius*1.22,32,32),
  new THREE.MeshBasicMaterial({color:style.glow,transparent:true,opacity:node.id===selectedNodeId?.34:style.glowOpacity,depthWrite:false})
);
group.add(core,glow);
```

Rewrite the two ambiguous ternaries as explicit expressions in the actual implementation:

```js
const selectedEmissive=node.id===selectedNodeId?0.32:0.14;
const selectedGlow=node.id===selectedNodeId?0.34:style.glowOpacity;
```

Add a thin `TorusGeometry` selection ring around the selected sphere, rotated to a stable angled plane and rendered with a low-saturation blue.

- [ ] **Step 2: Configure compact force-directed graph**

Use `ForceGraph3D()(graphEl)` and set:

```js
g3d.d3Force('charge').strength(-120);
g3d.d3Force('link').distance(76);
g3d.d3ReheatSimulation();
```

Set `nodeVal` to the role radius multiplier, not the old raw `val`; use `nodeThreeObject` to own actual sphere size. Set `nodeLabel(()=> '')` so labels are controlled by the custom sprite. Configure `warm` camera/background, `d3AlphaDecay(.045)`, `d3VelocityDecay(.32)`, and `cooldownTicks(120)` so the scene settles without continuous wandering.

- [ ] **Step 3: De-emphasize edges**

Use explicit low-saturation edge styles:

```js
.linkColor(link=>isSelectedLink(link)?'#587d8b':link.kind==='contains'?'#b6aa9d':'#84979d')
.linkWidth(link=>isSelectedLink(link)?1.2:link.kind==='contains'?.42:.58)
.linkOpacity(link=>isSelectedLink(link)?.82:link.kind==='contains'?.28:.42)
.linkDirectionalArrowLength(link=>link.kind==='contains'?0:2.1)
.linkDirectionalArrowRelPos(.62)
.linkDirectionalArrowColor(()=> '#788d94')
.linkDirectionalParticles(link=>prefersReducedMotion?0:(isSelectedLink(link)?1:0))
.linkDirectionalParticleWidth(link=>isSelectedLink(link)?.9:0)
```

Selected links must be determined from `selectedNodeId` by checking source or target ids. Keep node colors materially stronger than all link colors.

- [ ] **Step 4: Add selection, drag, fit, and fallback behavior**

Clicking a node updates `selectedNodeId`, inspector content, canvas status, and rerenders node objects so the ring/glow and adjacent link treatment update. Hover changes cursor only and shows labels for non-default roles by swapping a label sprite into the hovered node group. `fitGraph()` calls `zoomToFit(550,64)` and `d3ReheatSimulation()`. If dependencies fail, hide the graph and show `#fallback` with a clear message.

---

### Task 3: Verify visuals and preserve existing versions

**Files:**
- Verify: `docs/dsh-mock-demo-3d-v4.html`
- Verify unchanged: `docs/dsh-mock-demo.html`, `docs/dsh-mock-demo-v2.html`, `docs/dsh-mock-demo-v3.html`

- [ ] **Step 1: Run syntax and source-hook checks**

Run `node --check` as in Task 1 and assert the file contains `SphereGeometry`, `MeshPhongMaterial`, `linkWidth`, `linkDirectionalParticles`, `d3Force('link')`, `strength(-120)`, and `distance(76)`. Assert it does not contain `ExtrudeGeometry`, `OctahedronGeometry`, `?.32`, `?.14`, or `ctx.roundRect`.

- [ ] **Step 2: Build temporary local preview dependencies**

Download only into temporary preview assets outside the final output:

```powershell
New-Item -ItemType Directory -Force docs\.v4-preview-vendor | Out-Null
Invoke-WebRequest -UseBasicParsing 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js' -OutFile docs\.v4-preview-vendor\three.min.js
Invoke-WebRequest -UseBasicParsing 'https://cdn.jsdelivr.net/npm/3d-force-graph@1.73.4/dist/3d-force-graph.min.js' -OutFile docs\.v4-preview-vendor\3d-force-graph.min.js
```

Create `.dsh-mock-demo-3d-v4-preview.html` by replacing CDN URLs with local relative vendor paths.

- [ ] **Step 3: Render desktop and narrow screenshots**

Run `vision_html_screenshot` at `1440x900` and `720x900`. Confirm desktop shows large spheres, shorter average links, low-saturation edges, readable current/direct labels, and a compact force layout. Confirm narrow layout keeps the graph and inspector inside the viewport.

- [ ] **Step 4: Verify original/v2/v3 hashes**

Run:

```powershell
(Get-FileHash docs/dsh-mock-demo.html -Algorithm SHA256).Hash
(Get-FileHash docs/dsh-mock-demo-v2.html -Algorithm SHA256).Hash
(Get-FileHash docs/dsh-mock-demo-v3.html -Algorithm SHA256).Hash
```

Expected hashes:

- Original: `34841C465ADA7DBB2BDFBD5EDAE39CEBF651B303193C4E78A59B8CB1E36E7578`
- v2: `F0C4B4C353F96B4FCC1FD2BEB03A2583BBC75A88D45EA702FEE7360F01F689E7`
- v3: `7CFA6ED9588C79DF8CE7ABCF133C9E3D0DE5A32CE61C15684503767C505E4C60`

- [ ] **Step 5: Clean temporary assets and complete checklist**

Remove `.dsh-mock-demo-3d-v4-preview.html` and `.v4-preview-vendor`. Re-run the source and hash checks after cleanup. Mark the implementation complete only after the final screenshot and cleanup checks pass.
