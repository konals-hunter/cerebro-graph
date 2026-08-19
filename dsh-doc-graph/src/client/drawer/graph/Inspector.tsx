import { useState } from 'react'
import { ROLE_NAME } from '../../../types.js'
import type { GraphNode } from '../../../types.js'

export function Inspector({ node, activeDepth, onFocus }: {
  node: GraphNode | null
  activeDepth: number
  onFocus: () => void
}) {
  const [hint, setHint] = useState('')
  if (!node) {
    return (
      <div className="dsh-docgraph-inspector empty" aria-live="polite">
        <span className="dsh-docgraph-inspector-glyph">⌁</span>
        <b>选择一个节点</b>
        <p>节点详情会固定显示在这里，不会遮住图谱。</p>
      </div>
    )
  }
  return (
    <div className="dsh-docgraph-inspector" aria-live="polite">
      <span className="dsh-docgraph-inspector-kicker">{ROLE_NAME[node.role]}</span>
      <h3>{node.name}</h3>
      <code>{node.type === 'section' ? '章节节点 · 来自当前文档' : node.relPath}</code>
      <p>{ROLE_NAME[node.role]}关系 · 当前深度 {activeDepth}</p>
      <div className="dsh-docgraph-inspector-metrics">
        <div><b>{node.inboundTotal}</b><span>入引</span></div>
        <div><b>{node.outboundTotal}</b><span>出引</span></div>
      </div>
      <div className="dsh-docgraph-inspector-actions">
        <button type="button" onClick={() => setHint(`打开 ${node.name}（MVP 未接 docgraph_node 跳转）`)}>查看文档</button>
        <button type="button" onClick={onFocus}>聚焦节点</button>
      </div>
      {hint ? <span className="dsh-docgraph-toast">{hint}</span> : null}
    </div>
  )
}
