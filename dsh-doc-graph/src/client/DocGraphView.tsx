/**
 * Inline conversation view tab ("文档图谱"): renders the active graph
 * workspace, the latest index status, or a short onboarding hint. This is the
 * tab-level entrance registered under `conversation.view`.
 */
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useSessionGraphState } from './DocGraphUIContext.js'
import { GraphWorkspace } from './drawer/graph/GraphWorkspace.js'
import { OverviewSection } from './drawer/OverviewSection.js'
import { DocListSection } from './drawer/DocListSection.js'

export function DocGraphView({ sessionId }: PropsRuntime<'conversation.view'>) {
  const state = useSessionGraphState(sessionId)
  const payload = state.activePayload

  if (payload?.kind === 'docgraph_graph') {
    return <GraphWorkspace sessionId={sessionId} />
  }
  if (payload?.kind === 'docgraph_index' || payload?.kind === 'docgraph_status') {
    return (
      <div className="dsh-docgraph-view-stack">
        <OverviewSection summary={payload.summary} />
        <DocListSection docs={payload.docs} onFocus={() => undefined} />
      </div>
    )
  }
  return (
    <div className="dsh-docgraph-view-empty">
      <b>文档图谱</b>
      <p>还没有图谱数据。先在对话中调用 <code>docgraph_index</code> 建立索引，再调用 <code>docgraph_graph</code> 展开图谱。</p>
    </div>
  )
}