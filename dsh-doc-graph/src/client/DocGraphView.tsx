/**
 * Inline conversation view tab ("文档图谱"): renders the active graph
 * workspace, the latest index status, or a short onboarding hint. The tab
 * prefers direct /api/dsh-doc-graph calls for index/status/graph; if those
 * are unavailable it falls back to submitting a natural-language instruction
 * to the agent.
 */
import { useEffect, useMemo, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useDocGraphUI, useSessionGraphState } from './DocGraphUIContext.js'
import { isDocGraphPayload, type DocGraphPayload } from '../types.js'
import { GraphWorkspace } from './drawer/graph/GraphWorkspace.js'
import { OverviewSection } from './drawer/OverviewSection.js'
import { DocListSection } from './drawer/DocListSection.js'

type ToolResultLike = {
  kind?: unknown
  call?: { name?: string } | null
  meta?: unknown
}

function latestDocGraphPayload(nodes: readonly unknown[]): DocGraphPayload | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i] as ToolResultLike
    if (node?.kind !== 'tool-result') continue
    const toolName = node.call?.name ?? ''
    if (!toolName.startsWith('docgraph_')) continue
    const meta = node.meta as { kind?: unknown; payload?: unknown } | undefined
    if (meta && isDocGraphPayload(meta.payload)) return meta.payload
  }
  return null
}

export function DocGraphView({ sessionId, inputActions, useSession, useSessions }: PropsRuntime<'conversation.view'>) {
  const ui = useDocGraphUI()
  const state = useSessionGraphState(sessionId)
  const snapshot = useSession((s) => s)
  const sessionList = useSessions((s) => s)
  const cwd = sessionList?.current ? sessionList.byId[sessionList.current]?.cwd : undefined

  const latestPayload = useMemo(
    () => latestDocGraphPayload(snapshot?.nodes ?? []),
    [snapshot],
  )

  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (latestPayload) ui.setPayload(sessionId, latestPayload)
  }, [latestPayload, sessionId, ui])

  const applyPayload = (payload: unknown): boolean => {
    if (!isDocGraphPayload(payload)) return false
    ui.setPayload(sessionId, payload)
    return true
  }

  const askAgent = (text: string) => {
    if (!inputActions) return
    inputActions.setDraft(text)
    inputActions.submit()
  }

  const fetchStatus = async () => {
    if (!cwd) return
    setBusy(true)
    try {
      const resp = await fetch('/api/dsh-doc-graph/status?cwd=' + encodeURIComponent(cwd))
      if (!resp.ok) return
      const data = await resp.json() as { payload?: unknown }
      applyPayload(data.payload)
    } catch {
      /* route unavailable; keep agent fallback */
    } finally {
      setBusy(false)
    }
  }

  const initIndex = async () => {
    if (!cwd) {
      askAgent('请初始化当前项目的文档图谱索引（docgraph_index），索引完成后运行 docgraph_graph 并展示图谱。')
      return
    }
    setBusy(true)
    try {
      const resp = await fetch('/api/dsh-doc-graph/index?cwd=' + encodeURIComponent(cwd), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ force: false }),
      })
      if (!resp.ok) return
      const data = await resp.json() as { payload?: unknown }
      applyPayload(data.payload)
    } catch {
      askAgent('请初始化当前项目的文档图谱索引（docgraph_index），索引完成后运行 docgraph_graph 并展示图谱。')
    } finally {
      setBusy(false)
    }
  }

  const loadGraph = async (document: string) => {
    if (!cwd) {
      askAgent(`请对文档 ${document} 运行 docgraph_graph(operation='impact', depth=1) 并在文档图谱面板中展示结果。`)
      return
    }
    setBusy(true)
    try {
      const resp = await fetch('/api/dsh-doc-graph/graph?cwd=' + encodeURIComponent(cwd), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operation: 'impact', document, depth: 1, limit: 10 }),
      })
      if (!resp.ok) return
      const data = await resp.json() as { payload?: unknown }
      applyPayload(data.payload)
    } catch {
      askAgent(`请对文档 ${document} 运行 docgraph_graph(operation='impact', depth=1) 并在文档图谱面板中展示结果。`)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!state.activePayload && !latestPayload && cwd) {
      void fetchStatus()
    }
  }, [cwd, state.activePayload, latestPayload])

  const payload = state.activePayload ?? latestPayload

  if (payload?.kind === 'docgraph_graph') {
    return <GraphWorkspace sessionId={sessionId} />
  }

  if (payload?.kind === 'docgraph_index' || payload?.kind === 'docgraph_status') {
    const firstDoc = payload.docs[0]?.path
    return (
      <div className="dsh-docgraph-view-stack">
        <div className="dsh-docgraph-view-actions">
          <button
            type="button"
            className="dsh-docgraph-primary-btn"
            disabled={busy}
            onClick={() => firstDoc ? void loadGraph(firstDoc) : undefined}
          >
            {busy ? '处理中…' : '加载图谱'}
          </button>
          <span className="dsh-docgraph-view-hint">直接调用本地 docgraph core，不用手输命令</span>
        </div>
        <OverviewSection summary={payload.summary} />
        <DocListSection docs={payload.docs} onFocus={() => undefined} />
      </div>
    )
  }

  return (
    <div className="dsh-docgraph-view-empty">
      <b>文档图谱</b>
      <p>当前项目还没有图谱数据。先初始化索引，索引完成后即可加载图谱。</p>
      <button
        type="button"
        className="dsh-docgraph-primary-btn"
        disabled={busy}
        onClick={() => void initIndex()}
      >
        {busy ? '处理中…' : '初始化文档图谱'}
      </button>
    </div>
  )
}