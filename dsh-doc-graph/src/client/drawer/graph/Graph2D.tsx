import { useEffect, useRef } from 'react'
import type { GraphLink, GraphNode, GraphPayload, Role } from '../../../types.js'
import {
  COLORS, CURRENT_2D, EDGE_ARROW_2D, EDGE_2D, FILLS, FONT_2D, NODE_TEXT_2D,
  RING_INNER, RING_LABEL_INNER, RING_LABEL_OUTER, RING_OUTER, SELECTED_2D,
} from '../../../palette.js'
import { docSymbolPath, nodeSize2D, posFor2D, sectionSymbolPath } from '../../../layout.js'

type EchartsModule = typeof import('echarts')

export function Graph2D({ echartsModule, payload, visibleNodes, visibleLinks, selectedNodeId, onSelect, resetSignal }: {
  echartsModule: EchartsModule
  payload: GraphPayload
  visibleNodes: GraphNode[]
  visibleLinks: GraphLink[]
  selectedNodeId: string | null
  onSelect: (id: string) => void
  resetSignal: number
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<EchartsModule['init']> | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    if (!elRef.current) return
    const chart = echartsModule.init(elRef.current)
    chartRef.current = chart
    chart.on('click', (raw: unknown) => {
      const params = raw as { dataType?: string; data?: { id?: string } | null }
      if (params.dataType === 'node' && params.data?.id) onSelectRef.current(params.data.id)
    })
    return () => {
      chart.dispose()
      chartRef.current = null
    }
  }, [echartsModule])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const width = elRef.current?.clientWidth ?? 600
    const height = elRef.current?.clientHeight ?? 400
    const minWH = Math.min(width, height)
    const data = visibleNodes.map((n, index) => {
      const [w, h] = nodeSize2D(n)
      const [x, y] = posFor2D(n, index, width, height)
      const selected = n.id === selectedNodeId
      const border = selected ? SELECTED_2D : n.role === 'current' ? CURRENT_2D : null
      return {
        id: n.id,
        name: n.name,
        x,
        y,
        symbol: n.type === 'section' ? `path://${sectionSymbolPath(17)}` : `path://${docSymbolPath(w, h, 6)}`,
        symbolSize: n.type === 'section' ? [17, 17] : [w, h],
        itemStyle: {
          color: FILLS[n.role],
          borderColor: selected ? SELECTED_2D.borderColor : COLORS[n.role],
          borderWidth: selected ? SELECTED_2D.borderWidth : border ? border.borderWidth : 1,
          shadowBlur: selected ? SELECTED_2D.shadowBlur : border ? border.shadowBlur : 0,
          shadowOffsetY: selected ? SELECTED_2D.shadowOffsetY : border ? border.shadowOffsetY : 0,
          shadowColor: selected ? SELECTED_2D.shadowColor : border ? border.shadowColor : 'transparent',
        },
        label: {
          show: true,
          color: NODE_TEXT_2D[n.role],
          fontSize: n.role === 'current' ? FONT_2D.current : n.type === 'section' ? FONT_2D.section : FONT_2D.other,
          fontWeight: n.role === 'current' || selected ? 650 : 500,
        },
        role: n.role,
      }
    })
    const linkData = visibleLinks.map((l) => {
      const selected = selectedNodeId !== null && (l.source === selectedNodeId || l.target === selectedNodeId)
      const style = l.kind === 'contains'
        ? EDGE_2D.contains
        : selected ? EDGE_2D.referencesSelected : EDGE_2D.references
      return {
        source: l.source,
        target: l.target,
        lineStyle: { color: style.color, width: style.width, type: style.type, opacity: style.opacity },
      }
    })
    chart.setOption({
      animation: false,
      graphic: [
        { type: 'circle', shape: { cx: width / 2, cy: height / 2, r: minWH * 0.23 }, style: { stroke: RING_INNER.stroke, fill: 'none', lineDash: RING_INNER.dash } },
        { type: 'circle', shape: { cx: width / 2, cy: height / 2, r: minWH * 0.43 }, style: { stroke: RING_OUTER.stroke, fill: 'none', lineDash: RING_OUTER.dash } },
        { type: 'text', left: width / 2 + minWH * 0.23 + 6, top: height / 2, style: { text: RING_LABEL_INNER.text, fill: RING_LABEL_INNER.color, font: '10px sans-serif' } },
        { type: 'text', left: width / 2 + minWH * 0.43 + 6, top: height / 2, style: { text: RING_LABEL_OUTER.text, fill: RING_LABEL_OUTER.color, font: '10px sans-serif' } },
      ],
      series: [{
        type: 'graph',
        layout: 'none',
        data,
        links: linkData,
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: EDGE_ARROW_2D.size,
        roam: false,
        draggable: false,
        emphasis: { focus: 'none' },
      }],
    }, true)
  }, [echartsModule, payload, visibleNodes, visibleLinks, selectedNodeId])

  useEffect(() => {
    if (resetSignal > 0) chartRef.current?.dispatchAction({ type: 'restore' })
  }, [resetSignal])

  return <div className="dsh-docgraph-g2d" ref={elRef} />
}
