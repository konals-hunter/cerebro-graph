import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { encodeJsonRpc, JsonRpcClient, parseJsonRpcLine, resolveRelPath, ToolError } from './core.js'

const tmpDirs: string[] = []
function tempRoot(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-doc-graph-'))
  tmpDirs.push(dir)
  return dir
}
afterEach(() => { for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

describe('resolveRelPath', () => {
  it('rejects empty string', () => {
    expect(() => resolveRelPath('/x', '')).toThrow(ToolError)
  })
  it('rejects absolute posix path', () => {
    expect(() => resolveRelPath('/x', '/etc/passwd')).toThrow(/relative/)
  })
  it('rejects drive-letter absolute path', () => {
    expect(() => resolveRelPath('/x', 'C:/Windows')).toThrow(/relative/)
  })
  it('rejects .. segments', () => {
    expect(() => resolveRelPath('/x', '../etc')).toThrow(/\.\./)
  })
  it('normalizes backslashes and returns /-relative path', () => {
    expect(resolveRelPath('/x', 'a\\b.md')).toBe('a/b.md')
  })
  it('allows the root itself', () => {
    expect(resolveRelPath('/x', '.')).toBe('.')
  })
  it('rejects symlink escape', () => {
    const root = tempRoot()
    const outside = tempRoot()
    writeFileSync(path.join(outside, 'secret.md'), 'x')
    try {
      symlinkSync(path.join(outside, 'secret.md'), path.join(root, 'link.md'))
    } catch {
      return // symlinks unavailable on this platform; containment still covered by .. tests
    }
    expect(() => resolveRelPath(root, 'link.md')).toThrow(/escapes/)
  })
})

describe('JSON-RPC framing', () => {
  it('encodes a request as one newline-terminated line', () => {
    expect(encodeJsonRpc(7, 'tools/call', { name: 'x' })).toBe('{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"x"}}\n')
  })
  it('parses a response line', () => {
    const msg = parseJsonRpcLine('{"jsonrpc":"2.0","id":7,"result":{"ok":true}}')
    expect(msg).toMatchObject({ id: 7, result: { ok: true } })
  })
  it('returns null for malformed lines', () => {
    expect(parseJsonRpcLine('not json')).toBeNull()
  })
})

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

function makeChild() {
  const stdout = new EventEmitter()
  const stderr = new EventEmitter()
  const child = new EventEmitter() as unknown as {
    stdin: { write: (s: string) => boolean }
    stdout: EventEmitter
    stderr: EventEmitter
    exitCode: number | null
    killed: boolean
    kill: (sig?: string) => void
  } & EventEmitter
  child.stdin = { write: (s: string) => {
    const id = JSON.parse(s).id
    queueMicrotask(() => stdout.emit('data', JSON.stringify({ jsonrpc: '2.0', id, result: { content: [] } }) + '\n'))
    return true
  } }
  child.stdout = stdout
  child.stderr = stderr
  child.exitCode = null
  child.killed = false
  child.kill = () => {
    child.killed = true
    child.exitCode = 0
    queueMicrotask(() => child.emit('exit', 0))
  }
  queueMicrotask(() => child.emit('spawn'))
  return child
}

describe('JsonRpcClient', () => {
  it('start resolves and reports running', async () => {
    const child = makeChild()
    ;(spawn as ReturnType<typeof vi.fn>).mockReturnValue(child)
    const client = new JsonRpcClient({ bin: 'docgraph', args: ['serve', '--path', '/x'] })
    await client.start()
    expect(client.running).toBe(true)
    await client.stop(100)
  })

  it('request writes JSON-RPC and resolves on matching id', async () => {
    const child = makeChild()
    ;(spawn as ReturnType<typeof vi.fn>).mockReturnValue(child)
    const client = new JsonRpcClient({ bin: 'docgraph', args: [] })
    await client.start()
    const result = await client.request('tools/call', { name: 'docgraph_status' }, 2000)
    expect(result).toEqual({ content: [] })
    await client.stop(100)
  })

  it('request rejects on timeout', async () => {
    const child = makeChild()
    child.stdin.write = () => true // never answer
    ;(spawn as ReturnType<typeof vi.fn>).mockReturnValue(child)
    const client = new JsonRpcClient({ bin: 'docgraph', args: [] })
    await client.start()
    await expect(client.request('tools/call', {}, 20)).rejects.toThrow(/timeout/)
    await client.stop(100)
  })
})
import { DocGraphCoreManager, mapContextResult, mapDriftResult, mapFilesResult, mapGraphResult, mapStatusResult } from './core.js'

describe('mapStatusResult', () => {
  it('maps raw status with defaults into IndexPayload', () => {
    const payload = mapStatusResult({
      project: 'demo', rootPath: '/x', phase: 'ready',
      summary: { docs: 2, nodes: 5, edges: 4, entities: 0, failed: 0, formats: [{ fmt: 'md', pct: 100 }] },
      docs: [{ id: 'demo::a.md', path: 'a.md', name: 'a', fmt: 'md', status: 'ok', inbound: 1, sizeBytes: 10 }],
    }, 'demo', '/x', 'docgraph_status', 1)
    expect(payload.kind).toBe('docgraph_status')
    expect(payload.state.phase).toBe('ready')
    expect(payload.summary.docs).toBe(2)
    expect(payload.docs[0].id).toBe('demo::a.md')
    expect(payload.docs[0].updatedAt).toBe(0)
  })

  it('infers indexing phase from core text', () => {
    const payload = mapStatusResult({ phase: 'Indexing in progress' }, 'demo', '/x', 'docgraph_status', 2)
    expect(payload.state.phase).toBe('indexing')
    expect(payload.summary.docs).toBe(0)
  })
})

describe('mapGraphResult', () => {
  const raw = {
    seedNodeId: 'n1',
    nodes: [
      { id: 'n1', kind: 'document', file_path: 'a.md', name: 'a', role: 'current', val: 4, inboundTotal: 1, outboundTotal: 2 },
      { id: 'n2', kind: 'heading', file_path: 'a.md', heading: 'Intro', val: 2, inboundTotal: 0, outboundTotal: 0 },
      { id: 'n3', kind: 'tag', file_path: 't.md', name: 'tag', val: 1, inboundTotal: 0, outboundTotal: 0 },
      { id: 'n4', kind: 'document', file_path: 'b.md', name: 'b', role: 'direct', val: 3, inboundTotal: 2, outboundTotal: 1 },
    ],
    edges: [
      { source: 'n1', target: 'n2', kind: 'contains' },
      { source: 'n1', target: 'n4', kind: 'references' },
      { source: 'n1', target: 'n3', kind: 'tagged' },
    ],
    dropped: { nodes: 1, links: 1 },
  }
  it('maps documents and sections, drops tag nodes and tagged edges', () => {
    const payload = mapGraphResult(raw, 'demo', 'demo::a.md', 'impact', 2)
    expect(payload.schemaVersion).toBe(1)
    expect(payload.nodes).toHaveLength(3)
    expect(payload.nodes.find(n => n.id === 'demo::a.md')?.role).toBe('current')
    expect(payload.nodes.find(n => n.id === 'demo::a.md::Intro')?.type).toBe('section')
    expect(payload.links).toHaveLength(2)
    expect(payload.dropped).toEqual({ nodes: 1, links: 1 })
  })
})

describe('mapContextResult / mapFilesResult / mapDriftResult', () => {
  it('maps context results and normalizes location', () => {
    const payload = mapContextResult({
      results: [{ id: 'demo::a.md', title: 'A', path: 'a.md#h1:10', score: 0.8, inbound: 3, chips: ['x'] }],
      truncated: true,
    }, 'demo')
    expect(payload.kind).toBe('docgraph_context')
    expect(payload.results[0].docPath).toBe('a.md')
    expect(payload.results[0].location).toBe('a.md#h1:10')
  })
  it('maps files and defaults truncated', () => {
    const payload = mapFilesResult({ files: [{ id: 'demo::a.md', path: 'a.md', name: 'a', fmt: 'md', status: 'ok', inbound: 1, sizeBytes: 2 }] }, 'demo')
    expect(payload.files).toHaveLength(1)
    expect(payload.truncated).toBe(false)
  })
  it('maps drift findings and severity aliases', () => {
    const payload = mapDriftResult({ findings: [{ code: 'D1', severity: 'warn', title: 'T', detail: 'D', actionable: true, actionLabel: 'Fix', docs: [] }] }, 'demo')
    expect(payload.kind).toBe('docgraph_drift')
    expect(payload.findings[0].severity).toBe('warn')
  })
})

describe('DocGraphCoreManager.resolveBin', () => {
  const ctx = {} as never
  it('uses DSH_DOCGRAPH_BIN when set', () => {
    process.env.DSH_DOCGRAPH_BIN = '/opt/docgraph'
    const mgr = new DocGraphCoreManager(ctx, '/x')
    expect(mgr.resolveBin()).toBe('/opt/docgraph')
    delete process.env.DSH_DOCGRAPH_BIN
  })
  it('falls back to PATH docgraph', () => {
    const mgr = new DocGraphCoreManager(ctx, '/x')
    expect(mgr.resolveBin()).toBe('docgraph')
  })
})
