import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { DOCGRAPH_TOOL_NAMES, docgraphTools } from './tool.js'
import type { IndexPayload } from './types.js'

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
