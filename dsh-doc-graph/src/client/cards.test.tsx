import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DocGraphPayload, IndexPayload, DriftPayload, ContextPayload, GraphPayload } from '../types.js'
import { ToolviewCard } from './cards/CardDispatcher.js'

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
