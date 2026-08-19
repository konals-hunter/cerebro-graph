import { useEffect, useMemo } from 'react'
import { useDocGraphUI, useSessionGraphState } from '../../DocGraphUIContext.js'
import { ROLE_DEPTH } from '../../../types.js'
import type { GraphLink, GraphNode } from '../../../types.js'
import { GraphRail } from './GraphRail.js'
import { GraphCanvas } from './GraphCanvas.js'
import { Inspector } from './Inspector.js'

export function GraphWorkspace({ sessionId }: { sessionId: string }) {
  const ui = useDocGraphUI()
  const state = useSessionGraphState(sessionId)
  const payload = state.activePayload?.kind === 'docgraph_graph' ? state.activePayload : null

  const visibleNodes = useMemo<GraphNode[]>(() => {
    if (!payload) return []
    return payload.nodes.filter((n) => state.activeRoles.has(n.role) && ROLE_DEPTH[n.role] <= state.activeDepth)
  }, [payload, state.activeRoles, state.activeDepth])

  const visibleLinks = useMemo<GraphLink[]>(() => {
    if (!payload) return []
    const ids = new Set(visibleNodes.map((n) => n.id))
    return payload.links.filter((l) => ids.has(l.source) && ids.has(l.target))
  }, [payload, visibleNodes])

  const selectedNode = useMemo<GraphNode | null>(
    () => visibleNodes.find((n) => n.id === state.selectedNodeId) ?? null,
    [visibleNodes, state.selectedNodeId],
  )

  useEffect(() => {
    if (!payload) return
    if (state.selectedNodeId && visibleNodes.some((n) => n.id === state.selectedNodeId)) return
    const seed = payload.seedNodeId || visibleNodes[0]?.id || null
    if (seed !== state.selectedNodeId) ui.updateState(sessionId, { selectedNodeId: seed })
  }, [payload, visibleNodes, state.selectedNodeId, sessionId, ui])

  if (!payload) {
    return (
      <section className="dsh-docgraph-workspace-empty" style={{ order: -1 }}>
        <b>图谱探索区</b>
        <p>暂无图谱数据：请先运行 docgraph_graph。</p>
      </section>
    )
  }

  return (
    <section className="dsh-docgraph-workspace" style={{ order: -1 }} aria-label="图谱工作区">
      <GraphRail
        roles={state.activeRoles}
        depth={state.activeDepth}
        operation={payload.operation}
        onChangeRole={(role, checked) => {
          const roles = new Set(state.activeRoles)
          if (checked) roles.add(role)
          else roles.delete(role)
          const selected = selectedNode
          const selectedHidden = selected && (!roles.has(selected.role) || ROLE_DEPTH[selected.role] > state.activeDepth)
          ui.updateState(sessionId, { activeRoles: roles, selectedNodeId: selectedHidden ? null : state.selectedNodeId })
        }}
        onChangeDepth={(depth) => {
          const selected = selectedNode
          const selectedHidden = selected && ROLE_DEPTH[selected.role] > depth
          ui.updateState(sessionId, { activeDepth: depth, selectedNodeId: selectedHidden ? null : state.selectedNodeId })
        }}
      />
      <GraphCanvas
        sessionId={sessionId}
        payload={payload}
        visibleNodes={visibleNodes}
        visibleLinks={visibleLinks}
        selectedNodeId={state.selectedNodeId}
        mode={state.mode}
        onSelect={(id) => ui.updateState(sessionId, { selectedNodeId: id })}
        onMode={(mode) => ui.updateState(sessionId, { mode })}
      />
      <Inspector
        node={selectedNode}
        activeDepth={state.activeDepth}
        onFocus={() => state.selectedNodeId ? ui.focusNode(sessionId, state.selectedNodeId) : undefined}
      />
    </section>
  )
}
