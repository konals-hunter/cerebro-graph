import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { GraphNode, Role } from '../types.js'
import { GraphRail } from './drawer/graph/GraphRail.js'
import { Inspector } from './drawer/graph/Inspector.js'

const node: GraphNode = {
  id: 'demo::a.md', project: 'demo', name: 'a', type: 'doc', role: 'current',
  relPath: 'a.md', val: 1, inboundTotal: 4, outboundTotal: 3,
}

describe('GraphRail', () => {
  it('renders five role checkboxes with other unchecked', () => {
    const html = renderToStaticMarkup(
      <GraphRail
        roles={new Set(['current', 'direct', 'transitive', 'section'])}
        depth={2}
        operation="impact"
        onChangeRole={() => undefined}
        onChangeDepth={() => undefined}
      />,
    )
    for (const label of ['当前文档', '直接影响', '传递影响', '章节', '其他']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('影响深度')
  })
  it('hides depth buttons in trace mode', () => {
    const html = renderToStaticMarkup(
      <GraphRail
        roles={new Set(['current'])}
        depth={2}
        operation="trace"
        onChangeRole={() => undefined}
        onChangeDepth={() => undefined}
      />,
    )
    expect(html).not.toContain('影响深度')
  })
})

describe('Inspector', () => {
  it('renders the empty state', () => {
    const html = renderToStaticMarkup(<Inspector node={null} activeDepth={2} onFocus={() => undefined} />)
    expect(html).toContain('选择一个节点')
  })
  it('renders node detail with total metrics', () => {
    const html = renderToStaticMarkup(<Inspector node={node} activeDepth={2} onFocus={() => undefined} />)
    expect(html).toContain('当前文档')
    expect(html).toContain('a.md')
    expect(html).toContain('4')
    expect(html).toContain('3')
  })
})
