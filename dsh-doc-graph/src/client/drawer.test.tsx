import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DocRecord } from '../types.js'
import { DocListSection } from './drawer/DocListSection.js'
import { OverviewSection } from './drawer/OverviewSection.js'

const docs: DocRecord[] = [
  { id: 'demo::a.md', project: 'demo', name: 'a', path: 'a.md', fmt: 'md', status: 'ok', inbound: 2, sizeBytes: 10, updatedAt: 0, indexedAt: 0 },
  { id: 'demo::b.md', project: 'demo', name: 'b', path: 'b.md', fmt: 'mdx', status: 'changed', inbound: 1, sizeBytes: 20, updatedAt: 0, indexedAt: 0 },
]

describe('OverviewSection', () => {
  it('renders the five overview stats', () => {
    const html = renderToStaticMarkup(<OverviewSection summary={{ docs: 2, nodes: 3, edges: 4, entities: 5, failed: 1, formats: [{ fmt: 'md', pct: 100 }] }} />)
    for (const label of ['文档', '节点', '引用边', '实体', '解析失败']) expect(html).toContain(label)
  })
})

describe('DocListSection', () => {
  it('renders accessible document rows with disabled actions', () => {
    const html = renderToStaticMarkup(<DocListSection docs={docs} onFocus={() => undefined} />)
    expect(html).toContain('a.md')
    expect(html).toContain('role="button"')
    expect(html).toContain('aria-label')
    expect(html).toContain('disabled')
    expect(html).toContain('即将支持')
  })
})
