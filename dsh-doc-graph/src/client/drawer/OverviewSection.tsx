import type { Summary } from '../../types.js'

export function OverviewSection({ summary }: { summary: Summary }) {
  return (
    <section className="dsh-docgraph-section dsh-docgraph-overview" aria-label="总览">
      <h2>总览</h2>
      <div className="dsh-docgraph-overview-grid">
        <div className="dsh-docgraph-stat"><b>{summary.docs}</b><span>文档</span></div>
        <div className="dsh-docgraph-stat"><b>{summary.nodes}</b><span>节点</span></div>
        <div className="dsh-docgraph-stat"><b>{summary.edges}</b><span>引用边</span></div>
        <div className="dsh-docgraph-stat"><b>{summary.entities}</b><span>实体</span></div>
        <div className="dsh-docgraph-stat"><b>{summary.failed}</b><span>解析失败</span></div>
      </div>
      <div className="dsh-docgraph-formats">
        {summary.formats.map((f) => (
          <span key={f.fmt} className="dsh-docgraph-format" style={{ width: `${f.pct}%` }} title={`${f.fmt} ${f.pct}%`} />
        ))}
      </div>
      <div className="dsh-docgraph-legend">
        {summary.formats.map((f) => <span key={f.fmt}>{f.fmt} {f.pct}%</span>)}
      </div>
    </section>
  )
}
