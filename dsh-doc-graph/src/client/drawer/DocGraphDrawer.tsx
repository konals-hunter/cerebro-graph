import { useEffect, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useDocGraphUI, useSessionGraphState } from '../DocGraphUIContext.js'
import { isDocGraphPayload } from '../../types.js'
import { GraphWorkspace } from './graph/GraphWorkspace.js'
import { OverviewSection } from './OverviewSection.js'
import { DocListSection } from './DocListSection.js'

type DrawerProps = PropsRuntime<'conversation.input.dock'> & { sessionId?: string }

export function DocGraphDrawer({ sessionId: rawSessionId, useSessions }: DrawerProps) {
  const sessionId = rawSessionId ?? 'default'
  const ui = useDocGraphUI()
  const state = useSessionGraphState(sessionId)
  const sessionList = useSessions((s) => s)
  const cwd = sessionList?.current ? sessionList.byId[sessionList.current]?.cwd : undefined
  const [busy, setBusy] = useState(false)

  const applyPayload = (payload: unknown) => {
    if (isDocGraphPayload(payload)) ui.setPayload(sessionId, payload)
  }

  const refresh = async () => {
    if (!cwd) return
    setBusy(true)
    try {
      const statusResp = await fetch('/api/dsh-doc-graph/status?cwd=' + encodeURIComponent(cwd))
      if (!statusResp.ok) return
      const statusData = await statusResp.json() as { payload?: unknown }
      const statusPayload = statusData.payload
      applyPayload(statusPayload)

      const filesResp = await fetch('/api/dsh-doc-graph/files?cwd=' + encodeURIComponent(cwd))
      if (filesResp.ok) {
        const filesData = await filesResp.json() as { payload?: unknown }
        if (isDocGraphPayload(filesData.payload) && filesData.payload.kind === 'docgraph_files') {
          const indexPayload = isDocGraphPayload(statusPayload) && (statusPayload.kind === 'docgraph_index' || statusPayload.kind === 'docgraph_status')
            ? { ...statusPayload, docs: filesData.payload.files }
            : statusPayload
          applyPayload(indexPayload)
          const firstDoc = filesData.payload.files[0]?.path
          if (firstDoc) {
            const graphResp = await fetch('/api/dsh-doc-graph/graph?cwd=' + encodeURIComponent(cwd), {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ operation: 'impact', document: firstDoc, depth: 1, limit: 10 }),
            })
            if (graphResp.ok) {
              const graphData = await graphResp.json() as { payload?: unknown }
              applyPayload(graphData.payload)
            }
          }
        }
      }
    } catch {
      /* direct API unavailable; keep any existing store payload */
    } finally {
      setBusy(false)
    }
  }

  const loadGraph = async (document: string) => {
    if (!cwd || !document) return
    setBusy(true)
    try {
      const resp = await fetch('/api/dsh-doc-graph/graph?cwd=' + encodeURIComponent(cwd), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operation: 'impact', document, depth: 1, limit: 10 }),
      })
      if (resp.ok) {
        const data = await resp.json() as { payload?: unknown }
        applyPayload(data.payload)
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(false)
    }
  }

  const loadGraphByDocId = (id: string) => {
    const doc = indexPayload?.docs.find((d) => d.id === id)
    if (doc) void loadGraph(doc.path)
  }

  const initIndex = async () => {
    if (!cwd) return
    setBusy(true)
    try {
      const resp = await fetch('/api/dsh-doc-graph/index?cwd=' + encodeURIComponent(cwd), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ force: false }),
      })
      if (resp.ok) {
        const data = await resp.json() as { payload?: unknown }
        applyPayload(data.payload)
      }
      await refresh()
    } catch {
      /* ignore */
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!state.drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ui.closeDrawer(sessionId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.drawerOpen, sessionId, ui])

  useEffect(() => {
    if (state.drawerOpen && !state.activePayload && cwd) {
      void refresh()
    }
  }, [state.drawerOpen, cwd, state.activePayload])

  if (!state.drawerOpen) return null

  const payload = state.activePayload
  const indexPayload = payload?.kind === 'docgraph_index' || payload?.kind === 'docgraph_status' ? payload : null
  const graphPayload = payload?.kind === 'docgraph_graph' ? payload : null
  const firstDoc = indexPayload?.docs[0]?.path

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
          {busy ? <p className="dsh-docgraph-foot">正在读取本地图谱…</p> : null}
          {graphPayload
            ? <GraphWorkspace sessionId={sessionId} />
            : indexPayload
              ? (
                  <>
                    <div className="dsh-docgraph-view-actions">
                      <button type="button" className="dsh-docgraph-primary-btn" disabled={!firstDoc} onClick={() => firstDoc && void loadGraph(firstDoc)}>
                        加载图谱
                      </button>
                      <span className="dsh-docgraph-view-hint">从项目文档列表选择一个文档展开图谱</span>
                    </div>
                    <OverviewSection summary={indexPayload.summary} />
                    <DocListSection docs={indexPayload.docs} onFocus={loadGraphByDocId} />
                  </>
                )
              : (
                  <div className="dsh-docgraph-view-empty">
                    <b>文档图谱</b>
                    <p>还没有索引。初始化当前项目索引后即可浏览文档并展开图谱。</p>
                    <button type="button" className="dsh-docgraph-primary-btn" onClick={() => void initIndex()}>
                      初始化文档图谱
                    </button>
                  </div>
                )}
        </div>
      </div>
    </div>
  )
}