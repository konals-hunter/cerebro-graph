/**
 * §8.4 coordinate fixture and 2D/3D layout mapping. Real-data layout
 * algorithms are a later iteration (BACKLOG T5); MVP pins the 12 mock
 * positions and falls back to a deterministic grid for unknown nodes.
 */
import type { GraphNode } from './types.js'

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
    n.name.length * 5.2 + 30,
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
