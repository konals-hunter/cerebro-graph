/**
 * §5.3/§9.3 drawer controller and per-session store. Cards and the dock link
 * through this context — never through direct DOM queries. Session state is a
 * Map<sessionId, SessionGraphState> with LRU 20 eviction.
 */
import {
  createContext, useContext, useMemo, useState, useSyncExternalStore,
  type ReactNode,
} from 'react'
import type { DocGraphPayload, GraphMode, Role } from '../types.js'
import { ROLE_DEPTH } from '../types.js'

export interface SessionGraphState {
  sessionId: string
  activePayload: DocGraphPayload | null
  activeRoles: Set<Role>
  activeDepth: number
  selectedNodeId: string | null
  mode: GraphMode
  drawerOpen: boolean
}

const DEFAULT_ROLES: readonly Role[] = ['current', 'direct', 'transitive', 'section']
const MAX_SESSIONS = 20

export function createDefaultSessionState(sessionId: string): SessionGraphState {
  return {
    sessionId,
    activePayload: null,
    activeRoles: new Set(DEFAULT_ROLES),
    activeDepth: 2,
    selectedNodeId: null,
    mode: '2d',
    drawerOpen: false,
  }
}

export class DocGraphStore {
  private sessions = new Map<string, SessionGraphState>()
  private listeners = new Set<() => void>()
  private version = 0

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  getState = (sessionId: string): SessionGraphState => {
    const existing = this.sessions.get(sessionId)
    if (existing) {
      // LRU touch: re-insert so Map iteration order reflects recency.
      this.sessions.delete(sessionId)
      this.sessions.set(sessionId, existing)
      return existing
    }
    const state = createDefaultSessionState(sessionId)
    if (this.sessions.size >= MAX_SESSIONS) {
      const oldest = this.sessions.keys().next().value
      if (oldest !== undefined) this.sessions.delete(oldest)
    }
    this.sessions.set(sessionId, state)
    return state
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = (): number => this.version

  private bump(): void {
    this.version += 1
    for (const listener of this.listeners) listener()
  }

  private patch(sessionId: string, patch: Partial<Omit<SessionGraphState, 'sessionId'>>): void {
    const state = this.getState(sessionId)
    this.sessions.set(sessionId, { ...state, ...patch })
    this.bump()
  }

  setPayload(sessionId: string, payload: DocGraphPayload): void {
    this.patch(sessionId, { activePayload: payload })
  }

  openDrawer(sessionId: string, payload?: DocGraphPayload): void {
    const state = this.getState(sessionId)
    this.patch(sessionId, { drawerOpen: true, activePayload: payload ?? state.activePayload })
  }

  closeDrawer(sessionId: string): void {
    this.patch(sessionId, { drawerOpen: false })
  }

  /** §10.4 focusNode: enable role + depth if needed, then select the node. */
  focusNode(sessionId: string, nodeId: string): void {
    const state = this.getState(sessionId)
    const nodes = state.activePayload?.kind === 'docgraph_graph' ? state.activePayload.nodes : []
    const node = nodes.find((n) => n.id === nodeId)
    if (!node) return
    const activeRoles = new Set(state.activeRoles)
    if (!activeRoles.has(node.role)) activeRoles.add(node.role)
    const activeDepth = ROLE_DEPTH[node.role] > state.activeDepth ? ROLE_DEPTH[node.role] : state.activeDepth
    this.patch(sessionId, { activeRoles, activeDepth, selectedNodeId: nodeId })
  }

  updateState(sessionId: string, patch: Partial<Omit<SessionGraphState, 'sessionId'>>): void {
    this.patch(sessionId, patch)
  }

  clear(): void {
    this.sessions.clear()
    this.bump()
  }
}

export interface DocGraphUIContextValue {
  openDrawer(sessionId: string, payload?: DocGraphPayload): void
  closeDrawer(sessionId: string): void
  focusNode(sessionId: string, nodeId: string): void
  setPayload(sessionId: string, payload: DocGraphPayload): void
  getState(sessionId: string): SessionGraphState
  updateState(sessionId: string, patch: Partial<Omit<SessionGraphState, 'sessionId'>>): void
  subscribe: (listener: () => void) => () => void
  getVersion: () => number
}

export const DocGraphUIContext = createContext<DocGraphUIContextValue | null>(null)

/** Module-level singleton store: slot components render outside any provider. */
export const docGraphStore = new DocGraphStore()

const fallbackUI: DocGraphUIContextValue = {
  openDrawer: (sessionId, payload) => docGraphStore.openDrawer(sessionId, payload),
  closeDrawer: (sessionId) => docGraphStore.closeDrawer(sessionId),
  focusNode: (sessionId, nodeId) => docGraphStore.focusNode(sessionId, nodeId),
  setPayload: (sessionId, payload) => docGraphStore.setPayload(sessionId, payload),
  getState: (sessionId) => docGraphStore.getState(sessionId),
  updateState: (sessionId, patch) => docGraphStore.updateState(sessionId, patch),
  subscribe: docGraphStore.subscribe,
  getVersion: docGraphStore.getVersion,
}

export function DocGraphUIProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => docGraphStore)
  const value = useMemo<DocGraphUIContextValue>(() => ({
    openDrawer: (sessionId, payload) => store.openDrawer(sessionId, payload),
    closeDrawer: (sessionId) => store.closeDrawer(sessionId),
    focusNode: (sessionId, nodeId) => store.focusNode(sessionId, nodeId),
    setPayload: (sessionId, payload) => store.setPayload(sessionId, payload),
    getState: (sessionId) => store.getState(sessionId),
    updateState: (sessionId, patch) => store.updateState(sessionId, patch),
    subscribe: store.subscribe,
    getVersion: store.getVersion,
  }), [store])
  return <DocGraphUIContext.Provider value={value}>{children}</DocGraphUIContext.Provider>
}

export function useDocGraphUI(): DocGraphUIContextValue {
  const ctx = useContext(DocGraphUIContext)
  return ctx ?? fallbackUI
}

/** Reactive per-session snapshot for cards, dock, and drawer. */
export function useSessionGraphState(sessionId: string): SessionGraphState {
  const ui = useDocGraphUI()
  return useSyncExternalStore(
    ui.subscribe,
    () => ui.getState(sessionId),
    () => ui.getState(sessionId),
  )
}
