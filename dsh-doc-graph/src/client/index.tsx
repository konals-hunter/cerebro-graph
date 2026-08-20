/**
 * dsh-doc-graph, browser half: nine toolview keys, the input dock, the
 * inline conversation view tab ("文档图谱"), and the graph drawer overlay.
 * The single user entrance is the conversation view tab; the sidebar no longer
 * duplicates it (the deprecated data-agent preview entry stays hidden via CSS).
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ToolviewCard } from './cards/CardDispatcher.js'
import { DocGraphDock } from './DocGraphDock.js'
import { DocGraphDrawer } from './drawer/DocGraphDrawer.js'
import { DocGraphView } from './DocGraphView.js'
import { docGraphStore } from './DocGraphUIContext.js'
import './docgraph.css'

export const name = 'dsh-doc-graph'
export const inject = ['slots']

const TOOL_NAMES = [
  'docgraph_index', 'docgraph_status', 'docgraph_context', 'docgraph_search',
  'docgraph_node', 'docgraph_files', 'docgraph_graph', 'docgraph_similar', 'docgraph_tags',
]

export function apply(ctx: ClientContext): () => void {
  for (const toolName of TOOL_NAMES) {
    ctx.slots.inject('tool.call.toolview', () =>
      ctx.slots.register({ name: 'tool.call.toolview', key: toolName }, ToolviewCard),
    )
  }

  ctx.slots.inject('conversation.view', () =>
    ctx.slots.register({ name: 'conversation.view', id: 'docgraph', order: 20, label: () => '文档图谱' }, DocGraphView),
  )

  ctx.slots.inject('conversation.input.dock', () => {
    const disposeDock = ctx.slots.register({ name: 'conversation.input.dock', id: 'docgraph-dock', order: 40 }, DocGraphDock)
    const disposeDrawer = ctx.slots.register({ name: 'conversation.input.dock', id: 'docgraph-drawer', order: 50 }, DocGraphDrawer)
    return () => {
      disposeDock()
      disposeDrawer()
    }
  })

  return () => {
    docGraphStore.clear()
  }
}