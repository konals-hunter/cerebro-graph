import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { GraphLink, GraphNode, GraphPayload, Role } from '../../../types.js'
import { EDGE_3D, ROLE_STYLE_3D, SELECTED_3D } from '../../../palette.js'
import { posFor3D } from '../../../layout.js'
import { ROLE_NAME } from '../../../types.js'

type ForceGraph3DModule = typeof import('3d-force-graph')

export function Graph3D({ forceGraphModule, payload, visibleNodes, visibleLinks, selectedNodeId, resetSignal }: {
  forceGraphModule: ForceGraph3DModule
  payload: GraphPayload
  visibleNodes: GraphNode[]
  visibleLinks: GraphLink[]
  selectedNodeId: string | null
  resetSignal: number
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<ReturnType<ReturnType<ForceGraph3DModule['default']>> | null>(null)

  useEffect(() => {
    if (!elRef.current) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const ForceGraph3D = forceGraphModule.default
    const graph = ForceGraph3D()(elRef.current)
    graphRef.current = graph

    const nodes = visibleNodes.map((n, index) => {
      const style = ROLE_STYLE_3D[n.role]
      const [x, y, z] = posFor3D(n, index)
      return { id: n.id, name: n.name, role: n.role, val: Math.pow(style.radius, 3), x, y, z, inboundTotal: n.inboundTotal, outboundTotal: n.outboundTotal }
    })
    const nodeById = new Map(nodes.map((n) => [n.id, n]))
    const links = visibleLinks.map((l) => ({ source: nodeById.get(l.source), target: nodeById.get(l.target), kind: l.kind })).filter((l) => l.source && l.target)

    graph.graphData({ nodes, links })
    graph.nodeVal((n: { val: number }) => n.val)
    graph.nodeRelSize(1)
    graph.nodeColor((n: { role: Role }) => ROLE_STYLE_3D[n.role].color)
    graph.nodeLabel((n: { name: string; role: Role }) => `${n.name} · ${ROLE_NAME[n.role]}`)
    graph.nodeThreeObject((node: { role: Role; id: string; val: number }) => {
      const style = ROLE_STYLE_3D[node.role]
      const selected = node.id === selectedNodeId
      const group = new THREE.Group()
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(style.radius, 16, 12),
        new THREE.MeshStandardMaterial({
          color: style.color,
          emissive: style.glow,
          emissiveIntensity: selected ? SELECTED_3D.emissiveIntensity : SELECTED_3D.emissiveIntensityRest,
        }),
      )
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(style.radius * 1.6, 16, 12),
        new THREE.MeshBasicMaterial({
          color: style.glow,
          transparent: true,
          opacity: selected ? SELECTED_3D.glowOpacity : style.glowOpacity,
        }),
      )
      group.add(glow)
      group.add(core)
      return group
    })
    graph.linkColor((l: { kind: string; source: { id: string }; target: { id: string } }) => {
      const selected = selectedNodeId !== null && (l.source.id === selectedNodeId || l.target.id === selectedNodeId)
      if (l.kind === 'contains') return EDGE_3D.contains.color
      return selected ? EDGE_3D.referencesSelected.color : EDGE_3D.references.color
    })
    graph.linkWidth((l: { kind: string; source: { id: string }; target: { id: string } }) => {
      const selected = selectedNodeId !== null && (l.source.id === selectedNodeId || l.target.id === selectedNodeId)
      if (l.kind === 'contains') return EDGE_3D.contains.width
      return selected ? EDGE_3D.referencesSelected.width : EDGE_3D.references.width
    })
    graph.linkOpacity((l: { kind: string }) => l.kind === 'contains' ? EDGE_3D.contains.opacity : EDGE_3D.references.opacity)
    graph.linkDirectionalArrowLength((l: { kind: string }) => l.kind === 'references' ? EDGE_3D.arrow.length : 0)
    graph.linkDirectionalArrowRelPos(EDGE_3D.arrow.relPos)
    graph.linkDirectionalArrowColor(() => EDGE_3D.arrow.color)
    graph.linkDirectionalParticles((l: { kind: string; source: { id: string }; target: { id: string } }) => {
      if (reduced) return 0
      const selected = selectedNodeId !== null && (l.source.id === selectedNodeId || l.target.id === selectedNodeId)
      return l.kind === 'references' && selected ? 1 : 0
    })
    graph.linkDirectionalParticleWidth(EDGE_3D.particleWidth)
    graph.d3Force('charge').strength(-120)
    graph.d3Force('link').distance(76)
    graph.cooldownTicks(120)
    graph.cameraPosition({ x: 0, y: 0, z: 250 }, { x: 0, y: 0, z: 0 }, 0)

    // ResizeObserver on the stage body (debounced 150ms).
    const el = elRef.current
    let resizeTimer: ReturnType<typeof setTimeout>
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        graph.width(el.clientWidth)
        graph.height(el.clientHeight)
        graph.zoomToFit(320, 64)
      }, 150)
    })
    ro.observe(el)

    return () => {
      clearTimeout(resizeTimer)
      ro.disconnect()
      graphRef.current = null
      // 3d-force-graph ships a private destructor used by its own examples.
      ;(graph as unknown as { _destructor?: () => void })._destructor?.()
    }
    // Rebuild on selection change so glow/particles update deterministically.
  }, [forceGraphModule, payload, visibleNodes, visibleLinks, selectedNodeId])

  useEffect(() => {
    const graph = graphRef.current
    if (!graph || resetSignal === 0) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    graph.d3ReheatSimulation()
    window.setTimeout(() => graph.zoomToFit(320, 64), reduced ? 250 : 550)
  }, [resetSignal])

  return <div className="dsh-docgraph-g3d" ref={elRef} />
}
