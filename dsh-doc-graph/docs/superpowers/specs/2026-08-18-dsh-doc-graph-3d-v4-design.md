# dsh-doc-graph 3D v4 Visual Study Design

## Goal

Create an isolated 3D-only demo that tests a denser, node-led graph visual system without modifying the original demo, v2, or the current v3 workspace demo.

## Scope and output

- New file: `docs/dsh-mock-demo-3d-v4.html`
- Source reference: current graph data and 3D interaction patterns from `docs/dsh-mock-demo-v3.html`
- Preserve all existing files byte-for-byte.
- Keep the demo standalone and runnable from a local HTML file with the same CDN dependency pattern as the existing mock.
- Include only the 3D graph study plus a compact legend, mode/status strip, reset view control, and selected-node detail area; do not reproduce the full document inventory workspace.

## Visual direction: A — soft solid spheres with subdued relation lines

### Node hierarchy

- Current document: large deep navy sphere, target radius approximately 9.
- Direct impact documents: steel-blue spheres, target radius approximately 7.
- Transitive impact documents: mist-blue spheres, target radius approximately 5.8.
- Section nodes: warm amber low-poly spheres, target radius approximately 5.
- Other/background documents: warm gray-blue spheres, target radius approximately 4.8.
- Each node uses a solid `MeshPhongMaterial` core with controlled emissive color, soft specular response, and a weak transparent outer glow sphere.
- The current node receives a restrained thin selection ring and slightly stronger glow; selection must not turn edges into the dominant visual element.

### Relation hierarchy

- Ordinary reference edges use a low-saturation blue-gray, thin width approximately `0.45–0.7`.
- Contains edges use a still lighter warm-gray/amber-gray dashed treatment, approximately `0.35–0.5`.
- Selected-path edges use a muted blue, approximately `1.2px`, with restrained directional particles only on the selected path.
- Edge color must remain subordinate to node color and material contrast.
- Directional arrows remain present for reference relations but are small and low contrast.

### Spatial density and motion

- Use compact force-directed behavior rather than frozen coordinates.
- Target link distance approximately `70–80` and charge approximately `-120`, tuned to avoid spider-leg proportions while retaining readable separation.
- Nodes remain draggable and may settle into a slightly different arrangement after interaction.
- Reset view restores camera framing and restarts a short, controlled settling period.
- No decorative continuous animation beyond subtle glow/material response and selected-path particles.
- Respect `prefers-reduced-motion` by disabling selected-path particles and reducing camera transition duration.

### Labels and selection

- Current and direct-impact node labels remain visible by default.
- Transitive, section, and background labels appear on hover or selection to avoid distant text noise.
- Labels use small, high-contrast neutral capsules or text sprites that do not cover the sphere core.
- Clicking a node updates the detail panel and highlights only its adjacent relations.
- The selected node receives a thin ring and stronger local glow; non-selected edges remain subdued.

## UI structure

- Warm neutral canvas with a small grid or radial lighting field, no heavy panel stack.
- Top strip: title, `3D · compact node study` marker, short interaction hint, reset button.
- Left compact legend: role colors, node size meaning, relation line meaning.
- Center: graph canvas taking visual priority.
- Right compact inspector: selected node name, role, inbound/outbound counts, and one short description.
- Bottom note: “节点体积表示重要度 · 关系线仅用于连接拓扑”.
- Responsive behavior: at narrow widths, inspector moves below the graph and legend becomes a horizontal wrap.

## Technical design

- Reuse the existing graph dataset shape: `nodes` with `id`, `name`, `type`, `role`, `val`; `links` with `source`, `target`, and `kind`.
- Use `3d-force-graph` and Three.js as in the existing standalone mock.
- Configure custom `nodeThreeObject` with a sphere core plus transparent glow shell.
- Use role-specific radius and material configuration rather than relying only on `nodeVal`.
- Use `linkWidth`, `linkColor`, `linkOpacity`, `linkDirectionalArrowLength`, and selected-path particle settings for relation hierarchy.
- Include defensive initialization and an explicit fallback message when Three.js or 3D Force Graph is unavailable.
- Avoid deprecated or ambiguous syntax such as `?.16` ternaries; use explicit ternaries.
- Keep the implementation in one new HTML file for easy visual comparison.

## Verification criteria

1. Original `dsh-mock-demo.html`, v2, and v3 remain unchanged.
2. New v4 file passes `node --check` for its inline JavaScript.
3. A desktop screenshot shows spheres visually larger relative to links than the earlier v3 3D view.
4. Average relation lines are visibly thinner, lower saturation, and subordinate to node colors.
5. The compact force layout does not produce long spider-leg edges or a tiny central cluster.
6. Current/direct labels are readable without every distant node producing text noise.
7. Click selection updates inspector, local edge emphasis, and restrained particles.
8. Narrow screenshot keeps graph, legend, and inspector usable without clipping.
9. Temporary local preview assets are removed after verification.

## Self-review

- No placeholder sections or unresolved decisions remain.
- The output is isolated to one new HTML file, matching the user-approved scope.
- The design explicitly prioritizes node volume and material over edge saturation and length.
- Force-directed motion, drag behavior, labels, fallback handling, and responsive layout are specified consistently.
- Verification criteria directly test the user’s complaints: sphere-to-edge ratio, shorter distances, and edge de-emphasis.
