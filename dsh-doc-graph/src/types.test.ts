import { describe, expect, it } from 'vitest'
import {
  isDocGraphPayload, isGraphNode, isGraphPayload, isIndexPayload, nodeId, ROLE_DEPTH,
} from './types.js'

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
