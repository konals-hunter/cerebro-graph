import type { DriftPayload } from '../../types.js'

const SEVERITY_TEXT = { err: '错误', warn: '警告', ok: '提示' } as const

export function DriftAuditCard({ payload }: { payload: DriftPayload }) {
  const counts = { err: 0, warn: 0, ok: 0 }
  for (const f of payload.findings) counts[f.severity] += 1
  return (
    <div className="dsh-docgraph-card dsh-docgraph-drift-card">
      <div className="dsh-docgraph-card-hd">
        <b>漂移审计</b>
        <span className="dsh-docgraph-card-sub">{counts.err} 错误 / {counts.warn} 警告 / {counts.ok} 提示</span>
      </div>
      {payload.findings.map((f) => (
        <div key={f.code} className={`dsh-docgraph-finding sev-${f.severity}`}>
          <div className="dsh-docgraph-finding-hd">
            <code>{f.code}</code>
            <b>{f.title}</b>
            <span className={`dsh-docgraph-sev sev-${f.severity}`}>{SEVERITY_TEXT[f.severity]}</span>
          </div>
          <p>{f.detail}</p>
          {f.actionable && f.actionLabel ? <button type="button" className="dsh-docgraph-action">{f.actionLabel}</button> : <span className="dsh-docgraph-action-off">无需动作</span>}
          {f.docs.length > 0 ? (
            <div className="dsh-docgraph-finding-docs">{f.docs.map((d) => <span key={d.id}>{d.name}</span>)}</div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
