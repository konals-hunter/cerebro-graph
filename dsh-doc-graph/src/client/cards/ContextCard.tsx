import { useState } from 'react'
import type { ContextPayload, FilesPayload } from '../../types.js'

export function ContextCard({ payload }: { payload: ContextPayload | FilesPayload }) {
  if (payload.kind === 'docgraph_files') return <FilesList payload={payload} />
  return (
    <div className="dsh-docgraph-card dsh-docgraph-context-card">
      {payload.results.map((r) => (
        <ResultRow key={r.id} id={r.id} title={r.title} location={r.location} inbound={r.inbound} chips={r.chips} statusTag={r.statusTag} snippet={r.snippet} />
      ))}
      {payload.truncated ? <p className="dsh-docgraph-foot">结果已截断</p> : null}
    </div>
  )
}

function ResultRow({ id, title, location, inbound, chips, statusTag, snippet }: {
  id: string; title: string; location: string; inbound: number; chips: string[]
  statusTag?: { label: string; kind: 'active' | 'stale' | 'hot' | 'superseded' }
  snippet?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="dsh-docgraph-result">
      <div className="dsh-docgraph-result-hd" onClick={() => setOpen((v) => !v)}>
        <b>{title}</b>
        <code>{location}</code>
        <span className="dsh-docgraph-inbound">入引 {inbound}</span>
        {statusTag ? <span className={`dsh-docgraph-status-tag tag-${statusTag.kind}`}>{statusTag.label}</span> : null}
      </div>
      {chips.length > 0 ? <div className="dsh-docgraph-chips">{chips.map((c) => <span key={c}>{c}</span>)}</div> : null}
      {open && snippet ? <pre className="dsh-docgraph-snippet">{snippet}</pre> : null}
    </div>
  )
}

function FilesList({ payload }: { payload: FilesPayload }) {
  return (
    <div className="dsh-docgraph-card dsh-docgraph-context-card">
      {payload.files.map((f) => (
        <div key={f.id} className="dsh-docgraph-file-row">
          <span className={`dsh-docgraph-fmt fmt-${f.fmt}`}>{f.fmt}</span>
          <b>{f.name}</b>
          <code>{f.path}</code>
          <span className={`dsh-docgraph-file-status st-${f.status}`}>{f.status}</span>
          <span className="dsh-docgraph-inbound">入引 {f.inbound}</span>
        </div>
      ))}
      {payload.truncated ? <p className="dsh-docgraph-foot">文件列表已截断</p> : null}
    </div>
  )
}
