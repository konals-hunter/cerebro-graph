/**
 * dsh-doc-graph, browser half: nine toolview keys, the input dock, and the
 * graph drawer overlay. The sidebar entrance is mounted at the sidebar entry
 * row (replacing the deprecated dsh-data-agent-x "预览" entry position), and
 * the composer dock only renders once an index/graph payload exists.
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
export const inject = ['slots', 'sessions']

const TOOL_NAMES = [
  'docgraph_index', 'docgraph_status', 'docgraph_context', 'docgraph_search',
  'docgraph_node', 'docgraph_files', 'docgraph_graph', 'docgraph_similar', 'docgraph_tags',
]

const SIDEBAR_ICON = "<svg viewBox=\"0 0 16 16\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"5.5\" cy=\"5\" r=\"2.2\"/><circle cx=\"10.5\" cy=\"4\" r=\"1.7\"/><circle cx=\"11\" cy=\"10\" r=\"2.2\"/><path d=\"M7.4 6.4 9 4.9M7.6 6.8l2 2.1M5.5 7.2v2.4\"/></svg>"

function sidebarRoot(): Element | null {
  const column = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]')
  if (!(column instanceof HTMLElement)) return null
  return column.querySelector('[class*="logoRow"]')?.parentElement ?? column.firstElementChild as Element ?? null
}

function cloneEntryClasses(button: HTMLButtonElement): void {
  const preview = document.querySelector('[data-dsh-dataagent-preview]')
  if (!(preview instanceof HTMLElement)) return
  button.className = preview.className
  const spans = preview.querySelectorAll('span')
  const iconClass = spans[0]?.className ?? 'dsh-docgraph-sidebar-icon'
  const labelClass = spans[1]?.className ?? 'dsh-docgraph-sidebar-label'
  button.innerHTML = '<span class="' + iconClass + '">' + SIDEBAR_ICON + '</span><span class="' + labelClass + '">文档图谱</span>'
}

function placeSidebarButton(root: Element, button: HTMLButtonElement): boolean {
  if (!root.isConnected) return false
  const dataAgentRow = root.querySelector('[data-dsh-dataagent-entry]')
  if (dataAgentRow instanceof HTMLElement) {
    const preview = dataAgentRow.querySelector('[data-dsh-dataagent-preview]')
    dataAgentRow.insertBefore(button, preview ?? null)
    if (preview instanceof HTMLElement) preview.remove()
    return true
  }
  const newSession = root.querySelector('button[class*="newSession"]')
  const logoRow = newSession?.closest('[class*="logoRow"]')
  const anchor = logoRow ?? newSession ?? root.firstElementChild
  root.insertBefore(button, anchor?.nextElementSibling ?? null)
  return true
}

function mountSidebarEntry(ctx: ClientContext): () => void {
  document.querySelectorAll('[data-dsh-docgraph-sidebar]').forEach((el) => el.remove())
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.dshDocgraphSidebar = ''
  button.setAttribute('aria-label', '文档图谱')
  button.setAttribute('title', '文档图谱：索引状态与 2D/3D 图谱面板')
  cloneEntryClasses(button)
  if (button.className === '') {
    button.className = 'dsh-docgraph-sidebar-btn'
    button.innerHTML = '<span class="dsh-docgraph-sidebar-icon">' + SIDEBAR_ICON + '</span><span class="dsh-docgraph-sidebar-label">文档图谱</span>'
  }
  button.addEventListener('click', () => {
    const current = ctx.sessions.list.getSnapshot().current
    docGraphStore.openDrawer(current ?? 'default')
  })

  let root: Element | null = null
  let placed = false
  const tryPlace = () => {
    if (root !== null && !root.isConnected) {
      root = null
      placed = false
    }
    if (placed) {
      if (document.body.contains(button)) return
      root = null
      placed = false
    }
    root ??= sidebarRoot()
    if (root === null) return
    placed = placeSidebarButton(root, button)
    if (placed) rootObserver.observe(root, { childList: true, subtree: true })
  }
  const waitObserver = new MutationObserver(tryPlace)
  const rootObserver = new MutationObserver(() => {
    if (root === null || !root.isConnected) {
      placed = false
      tryPlace()
    } else if (!document.body.contains(button)) {
      placed = false
      tryPlace()
    }
  })
  waitObserver.observe(document.body, { childList: true, subtree: true })
  tryPlace()
  return () => {
    waitObserver.disconnect()
    rootObserver.disconnect()
    button.remove()
  }
}

export function apply(ctx: ClientContext): () => void {
  for (const toolName of TOOL_NAMES) {
    ctx.slots.inject('tool.call.toolview', () =>
      ctx.slots.register({ name: 'tool.call.toolview', key: toolName }, ToolviewCard),
    )
  }

  ctx.slots.inject('conversation.view', () =>
    ctx.slots.register({ name: 'conversation.view', id: 'docgraph', label: '文档图谱', order: 20 }, DocGraphView),
  )

  ctx.slots.inject('conversation.input.dock', () => {
    const disposeDock = ctx.slots.register({ name: 'conversation.input.dock', id: 'docgraph-dock', order: 40 }, DocGraphDock)
    const disposeDrawer = ctx.slots.register({ name: 'conversation.input.dock', id: 'docgraph-drawer', order: 50 }, DocGraphDrawer)
    return () => {
      disposeDock()
      disposeDrawer()
    }
  })

  const disposeSidebar = mountSidebarEntry(ctx)

  return () => {
    disposeSidebar()
    docGraphStore.clear()
  }
}