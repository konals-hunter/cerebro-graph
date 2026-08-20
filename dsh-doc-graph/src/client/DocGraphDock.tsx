/**
 * §9.2 input dock, compact edition: only rendered once an index or graph
 * payload exists in the session store. The whole pill is one button that
 * opens the graph drawer — no bare "状态"/"面板" controls in the composer.
 */
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useDocGraphUI, useSessionGraphState } from './DocGraphUIContext.js'

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
  const payload = state.activePayload

  const indexPayload = payload?.kind === 'docgraph_index' || payload?.kind === 'docgraph_status' ? payload : null
  const graphPayload = payload?.kind === 'docgraph_graph' ? payload : null
  if (!indexPayload && !graphPayload) return null

  const phase = indexPayload?.state.phase ?? 'ready'
  const stats = indexPayload
    ? `${indexPayload.summary.docs} 文档 · ${indexPayload.summary.nodes} 节点 · ${indexPayload.summary.edges} 边`
    : `${graphPayload?.nodes.length ?? 0} 节点 · ${graphPayload?.links.length ?? 0} 边`

  return (
    <div className="dsh-docgraph-dock" role="status">
      <button type="button" className="dsh-docgraph-dock-main" onClick={() => ui.openDrawer(sessionId, payload ?? undefined)}>
        <span className={`dsh-docgraph-phase-dot phase-${phase}`} aria-hidden="true" />
        <span className={`dsh-docgraph-phase phase-${phase}`}>{PHASE_TEXT[phase] ?? phase}</span>
        <span className="dsh-docgraph-dock-stats">{stats}</span>
        <span className="dsh-docgraph-dock-open">打开图谱</span>
      </button>
    </div>
  )
}