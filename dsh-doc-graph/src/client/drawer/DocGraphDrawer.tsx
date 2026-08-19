import { useEffect } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useDocGraphUI, useSessionGraphState } from '../DocGraphUIContext.js'
import { GraphWorkspace } from './graph/GraphWorkspace.js'
import { OverviewSection } from './OverviewSection.js'
import { DocListSection } from './DocListSection.js'
import type { DocGraphPayload } from '../../types.js'

type DrawerProps = PropsRuntime<'conversation.input.dock'> & { sessionId?: string }

export function DocGraphDrawer({ sessionId: rawSessionId }: DrawerProps) {
  const sessionId = rawSessionId ?? 'default'
  const ui = useDocGraphUI()
  const state = useSessionGraphState(sessionId)

  useEffect(() => {
    if (!state.drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ui.closeDrawer(sessionId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.drawerOpen, sessionId, ui])

  if (!state.drawerOpen) return null

  const indexPayload: Extract<DocGraphPayload, { kind: 'docgraph_index' | 'docgraph_status' }> | null =
    state.activePayload?.kind === 'docgraph_index' || state.activePayload?.kind === 'docgraph_status'
      ? state.activePayload
      : null

  return (
    <div className="dsh-docgraph-drawer-mask" onClick={() => ui.closeDrawer(sessionId)}>
      <div
        className="dsh-docgraph-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="文档图谱"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dr-hd">
          <div className="dr-hd-title">
            <b>文档图谱</b>
            <span className="scope">{indexPayload?.project ?? ''}</span>
            <span className="version-mark">spec v1</span>
            <span className="sync">文件变更会自动增量同步</span>
          </div>
          <button type="button" className="dsh-docgraph-close" aria-label="关闭" onClick={() => ui.closeDrawer(sessionId)}>✕</button>
        </div>
        <div className="dr-bd">
          <GraphWorkspace sessionId={sessionId} />
          {indexPayload
            ? <OverviewSection summary={indexPayload.summary} />
            : <section className="dsh-docgraph-section"><h2>总览</h2><p className="dsh-docgraph-foot">尚无索引状态</p></section>}
          <DocListSection docs={indexPayload?.docs ?? []} onFocus={(id) => ui.focusNode(sessionId, id)} />
        </div>
      </div>
    </div>
  )
}
