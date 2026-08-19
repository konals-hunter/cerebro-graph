/**
 * §9.2 input dock: four-phase state + root/docs/nodes/edges stats + two
 * buttons. MVP has no follow-up channel for the status button, so the button
 * falls back to an inline hint (spec §10.2 toast degradation).
 */
import { useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useDocGraphUI, useSessionGraphState } from './DocGraphUIContext.js'
import type { IndexPayload } from '../types.js'

type DockProps = PropsRuntime<'conversation.input.dock'> & { sessionId?: string }

const PHASE_TEXT: Record<string, string> = {
  starting: '启动中',
  indexing: '索引中',
  ready: '就绪',
  error: '错误',
}

export function DocGraphDock({ sessionId: rawSessionId }: DockProps) {
  const sessionId = rawSessionId ?? 'default'
  const ui = useDocGraphUI()
  const state = useSessionGraphState(sessionId)
  const [hint, setHint] = useState('')

  const indexPayload: IndexPayload | null = state.activePayload?.kind === 'docgraph_status' || state.activePayload?.kind === 'docgraph_index'
    ? state.activePayload
    : null
  const phase = indexPayload?.state.phase ?? 'starting'
  const stats = indexPayload
    ? `${indexPayload.rootPath} · ${indexPayload.summary.docs} 文档 · ${indexPayload.summary.nodes} 节点 · ${indexPayload.summary.edges} 边`
    : '尚未索引'

  const onStatus = () => {
    setHint('请直接询问图谱状态')
    window.setTimeout(() => setHint(''), 2000)
  }

  const onPanel = () => ui.openDrawer(sessionId, state.activePayload ?? undefined)

  return (
    <div className="dsh-docgraph-dock" role="status">
      <span className={`dsh-docgraph-phase phase-${phase}`}>{PHASE_TEXT[phase] ?? phase}</span>
      <span className="dsh-docgraph-dock-stats">{stats}</span>
      <button type="button" className="dsh-docgraph-dock-btn" onClick={onStatus}>状态</button>
      <button type="button" className="dsh-docgraph-dock-btn" onClick={onPanel}>面板</button>
      {hint ? <span className="dsh-docgraph-dock-hint">{hint}</span> : null}
    </div>
  )
}
