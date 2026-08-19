// @vitest-environment jsdom
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseMode } from './drawer/graph/GraphCanvas.js'
import type { GraphPayload } from '../types.js'

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
