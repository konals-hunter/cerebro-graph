/**
 * dsh-doc-graph, browser half: nine toolview keys, the input dock, and the
 * graph drawer overlay (mounted as a second dock-list entry with fixed
 * positioning). Optional topbar / sidebar entrances degrade to the dock.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { ToolviewCard } from './cards/CardDispatcher.js'
import { DocGraphDock } from './DocGraphDock.js'
import { DocGraphDrawer } from './drawer/DocGraphDrawer.js'
import { docGraphStore, useDocGraphUI } from './DocGraphUIContext.js'
import './docgraph.css'

export const name = 'dsh-doc-graph'
export const inject = ['slots']

const TOOL_NAMES = [
  'docgraph_index', 'docgraph_status', 'docgraph_context', 'docgraph_search',
  'docgraph_node', 'docgraph_files', 'docgraph_graph', 'docgraph_similar', 'docgraph_tags',
]

type SessionSlotProps = { sessionId?: string }

function TopbarButton({ sessionId: rawSessionId }: PropsRuntime<'conversation.session.header.actions'> & SessionSlotProps) {
  const ui = useDocGraphUI()
  const sessionId = rawSessionId ?? 'default'
  return <button type="button" className="dsh-docgraph-topbar-btn" onClick={() => ui.openDrawer(sessionId)}>图谱</button>
}

function SidebarButton({ sessionId: rawSessionId }: SessionSlotProps) {
  const ui = useDocGraphUI()
  const sessionId = rawSessionId ?? 'default'
  return <button type="button" className="dsh-docgraph-sidebar-btn" onClick={() => ui.openDrawer(sessionId)}>文档图谱</button>
}

export function apply(ctx: ClientContext): () => void {
  for (const toolName of TOOL_NAMES) {
    ctx.slots.inject('tool.call.toolview', () =>
      ctx.slots.register({ name: 'tool.call.toolview', key: toolName }, ToolviewCard),
    )
  }

  ctx.slots.inject('conversation.input.dock', () => {
    const disposeDock = ctx.slots.register({ name: 'conversation.input.dock', id: 'docgraph-dock', order: 40 }, DocGraphDock)
    const disposeDrawer = ctx.slots.register({ name: 'conversation.input.dock', id: 'docgraph-drawer', order: 50 }, DocGraphDrawer)
    return () => {
      disposeDock()
      disposeDrawer()
    }
  })

  // Optional host entrances (R-015): skip silently when the slot is undeclared.
  try {
    ctx.slots.inject('conversation.session.header.actions', () =>
      ctx.slots.register({ name: 'conversation.session.header.actions', id: 'docgraph-topbar', order: 60 }, TopbarButton),
    )
  } catch { /* topbar slot not declared */ }
  try {
    ;(ctx.slots as unknown as { inject: (name: string, cb: () => () => void) => void }).inject('sidebar.footer.action', () => {
      return (ctx.slots as unknown as { register: (spec: object, comp: unknown) => () => void }).register(
        { name: 'sidebar.footer.action', id: 'docgraph-sidebar' },
        SidebarButton,
      )
    })
  } catch { /* sidebar slot not declared */ }

  return () => {
    docGraphStore.clear()
  }
}
