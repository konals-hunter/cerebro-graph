/**
 * §9.2 message-flow mini 2D graph. Deliberately a SEPARATE simplified
 * renderer (force layout) from the drawer Graph2D — it never reuses Graph2D.
 */
import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import { useDocGraphUI } from '../DocGraphUIContext.js'
import { COLORS, EDGE_2D, FILLS, FONT_MINI, NODE_TEXT_2D } from '../../palette.js'
import { docSymbolPath, nodeSizeMini, sectionSymbolPath } from '../../layout.js'
import type { GraphPayload } from '../../types.js'

export function GraphCard({ payload, sessionId }: { payload: GraphPayload; sessionId: string }) {
  const ui = useDocGraphUI()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current)
    const nodes = payload.nodes.map((n) => {
      const [w, h] = nodeSizeMini(n)
      return {
        id: n.id,
        name: n.name,
        symbol: n.type === 'section' ? `path://${sectionSymbolPath(13)}` : `path://${docSymbolPath(w, h, 4)}`,
        symbolSize: n.type === 'section' ? [13, 13] : [w, h],
        itemStyle: { color: n.role === 'current' ? FILLS.current : FILLS[n.role], borderColor: COLORS[n.role], borderWidth: 1 },
        label: { show: true, color: NODE_TEXT_2D[n.role], fontSize: n.role === 'current' ? FONT_MINI.current : FONT_MINI.other, fontWeight: n.role === 'current' ? 650 : 500 },
        role: n.role,
      }
    })
    const links = payload.links.map((l) => ({
      source: l.source,
      target: l.target,
      lineStyle: { color: l.kind === 'contains' ? EDGE_2D.contains.color : EDGE_2D.references.color, width: l.kind === 'contains' ? EDGE_2D.contains.width : EDGE_2D.references.width, type: l.kind === 'contains' ? 'dashed' : 'solid', opacity: l.kind === 'contains' ? EDGE_2D.contains.opacity : EDGE_2D.references.opacity },
    }))
    chart.setOption({
      animation: false,
      series: [{
        type: 'graph',
        layout: 'force',
        force: { repulsion: 140, edgeLength: 64 },
        roam: false,
        draggable: false,
        data: nodes,
        links,
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: 7,
      }],
    })
    chart.on('click', (raw: unknown) => {
      const params = raw as { dataType?: string; data?: { id?: string } | null }
      const id = params.data?.id
      if (params.dataType === 'node' && id) {
        ui.openDrawer(sessionId, payload)
        ui.focusNode(sessionId, id)
      }
    })
    return () => chart.dispose()
  }, [payload, sessionId, ui])

  return (
    <div className="dsh-docgraph-card dsh-docgraph-graph-card">
      <div className="dsh-docgraph-mini" ref={ref} />
      <button type="button" className="dsh-docgraph-open-btn" onClick={() => ui.openDrawer(sessionId, payload)}>
        在面板中打开（3D/2D）
      </button>
    </div>
  )
}
