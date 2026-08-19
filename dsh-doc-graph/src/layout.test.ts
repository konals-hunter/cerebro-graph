import { describe, expect, it } from 'vitest'
import type { GraphNode } from './types.js'
import {
  GRAPH_POS_2D, GRAPH_POS_3D, docSymbolPath, graphPoint2D, layoutKeyFor,
  nodeSize2D, nodeSizeMini, posFor2D, posFor3D, sectionSymbolPath,
} from './layout.js'

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
