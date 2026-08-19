import { useEffect, useState } from 'react'
import type { GraphLink, GraphNode, GraphMode, GraphPayload } from '../../../types.js'
import { Graph2D } from './Graph2D.js'
import { Graph3D } from './Graph3D.js'

type EchartsModule = typeof import('echarts')
type ForceGraph3DModule = typeof import('3d-force-graph')

export interface EngineState {
  g2d: EchartsModule | null
  g3d: ForceGraph3DModule | null
  g2dFailed: boolean
  g3dFailed: boolean
}

/** Pure mode fallback per §11.1. */
export function chooseMode(g2dOk: boolean, g3dOk: boolean, g2dFailed: boolean, g3dFailed: boolean, requested: GraphMode | 'none'): GraphMode | 'none' {
  if (g2dFailed && g3dFailed) return 'none'
  if (requested === '3d' && !g3dOk) {
    return g2dOk ? '2d' : '3d'
  }
  if (requested === '2d' && !g2dOk) {
    return '2d'
  }
  return requested
}

export function useGraphEngines(): EngineState {
  const [g2d, setG2d] = useState<EchartsModule | null>(null)
  const [g3d, setG3d] = useState<ForceGraph3DModule | null>(null)
  const [g2dFailed, setG2dFailed] = useState(false)
  const [g3dFailed, setG3dFailed] = useState(false)

  useEffect(() => {
    let alive = true
    import('echarts').then((m) => { if (alive) setG2d(m) }).catch(() => { if (alive) setG2dFailed(true) })
    import('3d-force-graph').then((m) => { if (alive) setG3d(m) }).catch(() => { if (alive) setG3dFailed(true) })
    return () => { alive = false }
  }, [])

  return { g2d, g3d, g2dFailed, g3dFailed }
}

export function GraphCanvas({ sessionId: _sessionId, payload, visibleNodes, visibleLinks, selectedNodeId, mode, onSelect, onMode }: {
  sessionId: string
  payload: GraphPayload
  visibleNodes: GraphNode[]
  visibleLinks: GraphLink[]

  selectedNodeId: string | null
  mode: GraphMode
  onSelect: (id: string) => void
  onMode: (mode: GraphMode) => void
}) {
  const engines = useGraphEngines()
  const [resetSignal, setResetSignal] = useState(0)
  const [hint, setHint] = useState('')

  const g2dOk = engines.g2d !== null && !engines.g2dFailed
  const g3dOk = engines.g3d !== null && !engines.g3dFailed
  const effectiveMode = chooseMode(g2dOk, g3dOk, engines.g2dFailed, engines.g3dFailed, mode)
  const bothFailed = engines.g2dFailed && engines.g3dFailed
  const visibleCount = visibleNodes.length
  const status = selectedNodeId ? `${visibleCount} 可见节点 · ${visibleLinks.length} 可见边` : '未选择节点'

  const onReset = () => {
    if (effectiveMode === '3d' && engines.g3d) {
      setResetSignal((v) => v + 1)
    } else if (effectiveMode === '2d' && engines.g2d) {
      setResetSignal((v) => v + 1)
      setHint('已重置 2D 视图')
      window.setTimeout(() => setHint(''), 2000)
    }
  }

  const onStageKeyDown = (e: { key: string; preventDefault: () => void }) => {
    if (e.key === 'Enter' && !selectedNodeId && visibleNodes.length > 0) {
      e.preventDefault()
      onSelect(visibleNodes[0].id)
      return
    }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
    e.preventDefault()
    const idx = visibleNodes.findIndex((n) => n.id === selectedNodeId)
    const nextIdx = idx === -1
      ? 0
      : e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? Math.min(visibleNodes.length - 1, idx + 1)
        : Math.max(0, idx - 1)
    if (visibleNodes[nextIdx]) onSelect(visibleNodes[nextIdx].id)
  }

  return (
    <div className="dsh-docgraph-canvas">
      <div className="dsh-docgraph-toolbar">
        {!(engines.g2dFailed && engines.g3dFailed) ? (
          <div className="dsh-docgraph-seg" role="tablist" aria-label="图谱模式">
            {!engines.g2dFailed ? (
              <button type="button" role="tab" aria-selected={effectiveMode === '2d'} className={effectiveMode === '2d' ? 'on' : ''} onClick={() => onMode('2d')}>2D</button>
            ) : null}
            {!engines.g3dFailed ? (
              <button type="button" role="tab" aria-selected={effectiveMode === '3d'} className={effectiveMode === '3d' ? 'on' : ''} onClick={() => onMode('3d')}>3D</button>
            ) : null}
          </div>
        ) : null}
        <span className="dsh-docgraph-canvas-status">{status}</span>
        <button type="button" className="dsh-docgraph-reset" onClick={onReset}>重置视图</button>
      </div>

      {bothFailed ? (
        <div className="dsh-docgraph-fallback">图谱引擎暂时不可用，请检查本地网络或依赖加载。</div>
      ) : effectiveMode === '2d' && engines.g2d ? (
        <div className="stage-body" tabIndex={0} onKeyDown={onStageKeyDown}>
          <Graph2D echartsModule={engines.g2d} payload={payload} visibleNodes={visibleNodes} visibleLinks={visibleLinks} selectedNodeId={selectedNodeId} onSelect={onSelect} resetSignal={resetSignal} />
        </div>
      ) : effectiveMode === '2d' ? (
        engines.g2dFailed
          ? <div className="dsh-docgraph-fallback" id="g2dFallback">2D 分析暂时不可用，请切换到 3D 探索。</div>
          : <div className="dsh-docgraph-fallback">2D 图谱加载中…</div>
      ) : effectiveMode === '3d' && engines.g3d ? (
        <div className="stage-body" tabIndex={0} onKeyDown={onStageKeyDown}>
          <Graph3D forceGraphModule={engines.g3d} payload={payload} visibleNodes={visibleNodes} visibleLinks={visibleLinks} selectedNodeId={selectedNodeId} resetSignal={resetSignal} />
        </div>
      ) : effectiveMode === '3d' ? (
        engines.g3dFailed
          ? <div className="dsh-docgraph-fallback" id="g3dFallback">3D 探索暂时不可用，请切换到 2D 图谱。</div>
          : <div className="dsh-docgraph-fallback">3D 图谱加载中…</div>
      ) : (
        <div className="dsh-docgraph-fallback">图谱引擎加载中…</div>
      )}

      {payload.dropped.links > 0 ? (
        <p className="dsh-docgraph-canvas-hint">另有 {payload.dropped.links} 条相似/外链等边未显示</p>
      ) : null}
      <p className="dsh-docgraph-canvas-hint">↑↓←→ 在可见节点间移动选择，Enter 选择第一个</p>
      {hint ? <span className="dsh-docgraph-toast">{hint}</span> : null}
    </div>
  )
}
