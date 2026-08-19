import { describe, expect, it } from 'vitest'
import { DocGraphStore, createDefaultSessionState } from './DocGraphUIContext.js'
import type { IndexPayload } from '../types.js'

const sampleIndex: IndexPayload = {
  schemaVersion: 1, kind: 'docgraph_status', project: 'demo', rootPath: '/x',
  state: { phase: 'ready', revision: 1 },
  summary: { docs: 1, nodes: 1, edges: 0, entities: 0, failed: 0, formats: [] },
  docs: [],
}

describe('DocGraphStore', () => {
  it('creates default session state with §10.1 defaults', () => {
    const store = new DocGraphStore()
    const state = store.getState('s1')
    expect(state.sessionId).toBe('s1')
    expect(state.activeRoles).toEqual(new Set(['current', 'direct', 'transitive', 'section']))
    expect(state.activeDepth).toBe(2)
    expect(state.selectedNodeId).toBeNull()
    expect(state.mode).toBe('2d')
    expect(state.drawerOpen).toBe(false)
  })

  it('setPayload keeps per-session isolation', () => {
    const store = new DocGraphStore()
    store.setPayload('s1', sampleIndex)
    store.setPayload('s2', { ...sampleIndex, project: 'other' })
    expect(store.getState('s1').activePayload?.project).toBe('demo')
    expect(store.getState('s2').activePayload?.project).toBe('other')
  })

  it('openDrawer merges payload and opens drawer', () => {
    const store = new DocGraphStore()
    store.openDrawer('s1', sampleIndex)
    const state = store.getState('s1')
    expect(state.drawerOpen).toBe(true)
    expect(state.activePayload).toEqual(sampleIndex)
    store.closeDrawer('s1')
    expect(store.getState('s1').drawerOpen).toBe(false)
  })

  it('evicts the oldest session beyond LRU 20', () => {
    const store = new DocGraphStore()
    for (let i = 0; i < 21; i++) store.getState(`s${i}`)
    expect(store.getState('s0')).toEqual(createDefaultSessionState('s0'))
    expect(store.has('s1')).toBe(false)
    expect(store.has('s0')).toBe(true)
  })
})
