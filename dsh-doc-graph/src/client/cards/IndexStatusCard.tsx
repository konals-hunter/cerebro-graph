import type { IndexPayload } from '../../types.js'

const PHASE_TEXT: Record<string, string> = {
  starting: '启动中', indexing: '索引中', ready: '就绪', error: '错误',
}

export function IndexStatusCard({ payload }: { payload: IndexPayload }) {
  const { summary, state } = payload
  return (
    <div className="dsh-docgraph-card dsh-docgraph-index-card">
      <div className="dsh-docgraph-card-hd">
        <span className={`dsh-docgraph-phase phase-${state.phase}`}>{PHASE_TEXT[state.phase] ?? state.phase}</span>
        <span className="dsh-docgraph-card-sub">{state.phase === 'ready' && state.finishedAt ? relTime(state.finishedAt) : ''}</span>
      </div>
      <div className="dsh-docgraph-stat-grid">
        <div className="dsh-docgraph-stat"><b>{summary.docs}</b><span>文档</span></div>
        <div className="dsh-docgraph-stat"><b>{summary.nodes}</b><span>节点</span></div>
        <div className="dsh-docgraph-stat"><b>{summary.edges}</b><span>引用边</span></div>
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
      <p className="dsh-docgraph-foot">文件变更会自动增量同步</p>
    </div>
  )
}

function relTime(epochMs: number): string {
  const diff = Date.now() - epochMs
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return `${Math.floor(diff / 86_400_000)} 天前`
}
