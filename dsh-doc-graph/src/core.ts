/**
 * §3/§5/§6 core bridge. This file owns: project-root resolution, relative
 * path validation, the newline-delimited JSON-RPC 2.0 stdio client for the
 * long-lived `docgraph serve` process, and (in the next task) the core
 * manager plus core-to-UI mapping.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { realpathSync } from 'node:fs'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'

/** Tool-facing error surfaced as a tool error text. */
export class ToolError extends Error {}

/** §5.1 projectRoot := sandboxPolicy.workspaceRoot || session.header.cwd. */
export function getProjectRoot(
  ctx: Context,
  exec?: { agent?: { session?: { header?: { cwd?: string } } } },
): string {
  const getter = (ctx as unknown as {
    get?: (name: string) => { resolve?: (opts: object) => { workspaceRoot?: string } } | undefined
  }).get
  const sandboxPolicy = getter?.('sandboxPolicy')
  const workspaceRoot = sandboxPolicy?.resolve?.({ ...(exec?.agent ? { session: exec.agent.session } : {}) })?.workspaceRoot
  return workspaceRoot ?? exec?.agent?.session?.header?.cwd ?? process.cwd()
}

function canonical(p: string): string {
  try {
    return realpathSync.native(p)
  } catch {
    return path.resolve(p)
  }
}

/** §5.2 shared path validation. */
export function resolveRelPath(projectRoot: string, input: string): string {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new ToolError('path must not be empty')
  }
  const rel = input.replaceAll('\\', '/')
  if (rel.startsWith('/') || /^[A-Za-z]:\//.test(rel)) {
    throw new ToolError('path must be relative')
  }
  if (rel.split('/').includes('..')) {
    throw new ToolError('path must not contain ..')
  }
  const root = canonical(projectRoot)
  const target = canonical(path.join(projectRoot, rel))
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new ToolError('path escapes project root')
  }
  return path.relative(root, target).split(path.sep).join('/') || '.'
}

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

export interface JsonRpcError {
  jsonrpc: '2.0'
  id: number
  error: { code: number; message: string }
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string }
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse

export function encodeJsonRpc(id: number, method: string, params?: unknown): string {
  const msg: JsonRpcRequest = { jsonrpc: '2.0', id, method }
  if (params !== undefined) msg.params = params
  return JSON.stringify(msg) + '\n'
}

export function parseJsonRpcLine(line: string): JsonRpcMessage | null {
  try {
    const parsed: unknown = JSON.parse(line)
    if (typeof parsed !== 'object' || parsed === null) return null
    const obj = parsed as Record<string, unknown>
    if (obj.jsonrpc !== '2.0') return null
    if (typeof obj.id === 'number' && typeof obj.method === 'string') return obj as unknown as JsonRpcRequest
    if (typeof obj.id === 'number' && ('result' in obj || 'error' in obj)) return obj as unknown as JsonRpcResponse
    return null
  } catch {
    return null
  }
}

interface Pending {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface JsonRpcClientOptions {
  bin: string
  args: string[]
  onStderr?: (chunk: string) => void
  onExit?: (code: number | null) => void
}

/**
 * Newline-delimited JSON-RPC 2.0 client over a child process stdio. One
 * request per line; responses are matched by id. stderr is isolated from
 * tool results via the onStderr callback.
 */
export class JsonRpcClient {
  private child: ChildProcessWithoutNullStreams | null = null
  private nextId = 1
  private buffer = ''
  private pending = new Map<number, Pending>()

  constructor(
    private readonly opts: JsonRpcClientOptions,
    inject?: { child?: ChildProcessWithoutNullStreams },
  ) {
    if (inject?.child) this.child = inject.child
  }

  get running(): boolean {
    return this.child !== null && this.child.exitCode === null && this.child.killed === false
  }

  start(): Promise<void> {
    if (this.running) return Promise.resolve()
    if (this.child) this.child = null
    return new Promise((resolve, reject) => {
      let child: ChildProcessWithoutNullStreams
      try {
        child = spawn(this.opts.bin, this.opts.args, { stdio: ['pipe', 'pipe', 'pipe'] })
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
        return
      }
      this.child = child
      child.stdout.setEncoding?.('utf8')
      child.stderr.setEncoding?.('utf8')
      child.stdout.on('data', (chunk: string) => this.onStdout(chunk))
      child.stderr.on('data', (chunk: string) => this.opts.onStderr?.(chunk))
      child.once('error', (err) => {
        this.failAll(err instanceof Error ? err : new Error(String(err)))
        reject(err instanceof Error ? err : new Error(String(err)))
      })
      child.once('spawn', () => resolve())
      child.once('exit', (code) => {
        this.failAll(new Error(`docgraph core exited (code ${code})`))
        this.child = null
        this.opts.onExit?.(code)
      })
    })
  }

  request(method: string, params?: unknown, timeoutMs = 15000, signal?: AbortSignal): Promise<unknown> {
    if (!this.running || !this.child) return Promise.reject(new Error('docgraph core not running'))
    if (signal?.aborted) return Promise.reject(new Error('docgraph core request cancelled'))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`docgraph core request timeout after ${timeoutMs}ms`))
      }, timeoutMs)
      const onAbort = () => {
        this.notify('notifications/cancelled', { requestId: id })
        this.pending.delete(id)
        reject(new Error('docgraph core request cancelled'))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer)
          signal?.removeEventListener('abort', onAbort)
          resolve(v)
        },
        reject: (e) => {
          clearTimeout(timer)
          signal?.removeEventListener('abort', onAbort)
          reject(e)
        },
        timer,
      })
      this.child!.stdin.write(encodeJsonRpc(id, method, params))
    })
  }

  notify(method: string, params?: unknown): void {
    if (!this.running || !this.child) return
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk
    let idx: number
    while ((idx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, idx).trim()
      this.buffer = this.buffer.slice(idx + 1)
      if (!line) continue
      const msg = parseJsonRpcLine(line)
      if (!msg || !('id' in msg)) continue
      const id = typeof msg.id === 'number' ? msg.id : Number(msg.id)
      const pending = this.pending.get(id)
      if (!pending) continue
      this.pending.delete(id)
      if ('error' in msg && msg.error) {
        pending.reject(new Error(msg.error.message))
      } else {
        pending.resolve('result' in msg ? msg.result : undefined)
      }
    }
  }

  private failAll(err: Error): void {
    for (const [, pending] of this.pending) pending.reject(err)
    this.pending.clear()
    this.buffer = ''
  }

  async stop(timeoutMs = 5000): Promise<void> {
    const child = this.child
    this.child = null
    if (!child || child.exitCode !== null) return
    child.kill('SIGTERM')
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        resolve()
      }, timeoutMs)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
}
// ---- core-to-UI mapping and process lifecycle (§3.2 / §6) ----

import type {
  ContextPayload, DocGraphPayload, DocRecord, DriftPayload, FilesPayload,
  GraphLink, GraphNode, GraphPayload, IndexPayload, IndexPhase, IndexState,
  Role, Summary,
} from './types.js'
import { isDocGraphPayload, isGraphPayload, nodeId } from './types.js'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

type Raw = Record<string, unknown>

function asNum(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
function asStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}
function asBool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function fmtOf(raw: Raw): string {
  const v = raw.fmt ?? raw.format ?? ''
  return asStr(v, 'md')
}
function statusOf(raw: Raw): DocRecord['status'] {
  const v = raw.status
  return v === 'changed' || v === 'err' ? v : 'ok'
}
function nameOf(raw: Raw, p: string): string {
  const n = asStr(raw.name ?? raw.title, '')
  if (n) return n
  const base = p.split('/').pop() ?? p
  return base.replace(/\.[^.]+$/, '')
}

function mapRawDoc(raw: Raw, project: string): DocRecord {
  const p = asStr(raw.path ?? raw.file_path ?? raw.rel_path ?? raw.relPath, '')
  return {
    id: nodeId(project, p),
    project,
    name: nameOf(raw, p),
    path: p,
    fmt: fmtOf(raw),
    status: statusOf(raw),
    inbound: asNum(raw.inbound),
    sizeBytes: asNum(raw.sizeBytes ?? raw.size ?? raw.size_bytes),
    updatedAt: asNum(raw.updatedAt ?? raw.updated_at ?? raw.mtime),
    indexedAt: asNum(raw.indexedAt ?? raw.indexed_at),
  }
}

function mapRawSummary(raw: Raw): Summary {
  const s = (raw.summary ?? raw) as Raw
  const formatsRaw = Array.isArray(s.formats) ? s.formats : []
  return {
    docs: asNum(s.docs),
    nodes: asNum(s.nodes),
    edges: asNum(s.edges),
    entities: asNum(s.entities),
    failed: asNum(s.failed),
    formats: formatsRaw.map((f) => ({
      fmt: asStr((f as Raw).fmt, '?'),
      pct: asNum((f as Raw).pct),
    })),
  }
}

function inferPhase(v: unknown): IndexPhase {
  if (typeof v === 'string') {
    if (v.includes('Indexing in progress') || v === 'indexing') return 'indexing'
    if (v === 'ready' || v === 'ok') return 'ready'
    if (v === 'starting') return 'starting'
    return 'error'
  }
  if (v === 'starting' || v === 'indexing' || v === 'ready' || v === 'error') return v
  return 'ready'
}

/** Normalize a raw core status response into an IndexPayload. */
export function mapStatusResult(
  raw: unknown,
  project: string,
  rootPath: string,
  kind: 'docgraph_index' | 'docgraph_status',
  revision: number,
): IndexPayload {
  const obj = (raw ?? {}) as Raw
  const phase = inferPhase(obj.phase ?? obj.state ?? obj.status ?? (raw === undefined ? 'starting' : 'ready'))
  const state: IndexState = { phase, revision }
  if (phase === 'ready') state.finishedAt = asNum(obj.finishedAt ?? obj.finished_at, Date.now())
  if (phase === 'indexing') state.startedAt = asNum(obj.startedAt ?? obj.started_at, Date.now())
  if (phase === 'error') state.lastError = asStr(obj.lastError ?? obj.error ?? obj.message, 'unknown error')
  const docs = Array.isArray(obj.docs) ? obj.docs.map((d) => mapRawDoc(d as Raw, project)) : []
  return assertPayload({ schemaVersion: 1, kind, project, rootPath, state, summary: mapRawSummary(obj), docs })
}

function roleOf(raw: Raw, seedNodeId: string): Role {
  const v = raw.role
  if (v === 'current' || v === 'direct' || v === 'transitive' || v === 'section' || v === 'other') return v
  if (asStr(raw.kind ?? raw.type, '') === 'heading') return 'section'
  return 'direct'
}

/** §6.1 node mapping: document→doc, heading→section, others dropped. */
export function mapGraphResult(
  raw: unknown,
  project: string,
  seedNodeId: string,
  operation: GraphPayload['operation'],
  depth?: number,
): GraphPayload {
  const obj = (raw ?? {}) as Raw
  const rawNodes = Array.isArray(obj.nodes) ? obj.nodes as Raw[] : []
  const rawEdges = Array.isArray(obj.edges) ? obj.edges as Raw[] : []
  const rawIdToNodeId = new Map<string, string>()
  const nodes: GraphNode[] = []
  let droppedNodes = 0

  for (const rn of rawNodes) {
    const kind = asStr(rn.kind ?? rn.type, 'document')
    const filePath = asStr(rn.file_path ?? rn.path ?? rn.relPath ?? rn.rel_path, '')
    let mapped: GraphNode | null = null
    if (kind === 'document' || kind === 'doc') {
      const id = nodeId(project, filePath)
      rawIdToNodeId.set(asStr(rn.id, id), id)
      mapped = {
        id,
        project,
        name: nameOf(rn, filePath),
        type: 'doc',
        role: id === seedNodeId ? 'current' : roleOf(rn, seedNodeId),
        relPath: filePath,
        val: asNum(rn.val ?? rn.weight, 1),
        inboundTotal: asNum(rn.inboundTotal ?? rn.inbound_total),
        outboundTotal: asNum(rn.outboundTotal ?? rn.outbound_total),
      }
    } else if (kind === 'heading' || kind === 'section') {
      const anchor = asStr(rn.anchor ?? rn.heading, '')
      const id = nodeId(project, filePath, anchor)
      rawIdToNodeId.set(asStr(rn.id, id), id)
      mapped = {
        id,
        project,
        name: anchor || nameOf(rn, filePath),
        type: 'section',
        role: 'section',
        relPath: filePath,
        anchor,
        val: asNum(rn.val ?? rn.weight, 1),
        inboundTotal: asNum(rn.inboundTotal ?? rn.inbound_total),
        outboundTotal: asNum(rn.outboundTotal ?? rn.outbound_total),
      }
    }
    if (mapped) nodes.push(mapped)
    else droppedNodes += 1
  }

  const links: GraphLink[] = []
  let droppedLinks = 0
  for (const re of rawEdges) {
    const kind = asStr(re.kind ?? re.type, '')
    const mappedKind = kind === 'contains' ? 'contains'
      : ['references', 'wikilinks_to', 'embeds', 'related_to'].includes(kind) ? 'references'
        : null
    if (mappedKind === null) {
      droppedLinks += 1
      continue
    }
    const source = rawIdToNodeId.get(asStr(re.source, ''))
    const target = rawIdToNodeId.get(asStr(re.target, ''))
    if (!source || !target) {
      droppedLinks += 1
      continue
    }
    links.push({ source, target, kind: mappedKind })
  }

  const mappedSeed = rawIdToNodeId.get(seedNodeId) ?? seedNodeId
  for (const n of nodes) {
    if (n.id === mappedSeed) n.role = 'current'
  }
  const payload: GraphPayload = {
    schemaVersion: 1,
    kind: 'docgraph_graph',
    project,
    seedNodeId: mappedSeed,
    operation,
    nodes,
    links,
    dropped: { nodes: droppedNodes, links: droppedLinks },
  }
  if (depth !== undefined) payload.depth = depth
  return assertPayload(payload)
}

function mapRawContextResult(raw: Raw, project: string): ContextPayload['results'][number] {
  const rawPath = asStr(raw.docPath ?? raw.doc_path ?? raw.path ?? raw.id, '')
  const hash = rawPath.indexOf('#')
  const p = hash === -1 ? rawPath : rawPath.slice(0, hash)
  const location = asStr(raw.location, rawPath)
  const result: ContextPayload['results'][number] = {
    id: nodeId(project, p),
    project,
    title: asStr(raw.title ?? raw.name, nameOf(raw, p)),
    location,
    docPath: p,
    inbound: asNum(raw.inbound),
    chips: Array.isArray(raw.chips) ? raw.chips.map((c) => asStr(c)) : [],
  }
  if (raw.score !== undefined) result.score = asNum(raw.score)
  const tag = (raw.statusTag ?? raw.status_tag) as Raw | undefined
  if (tag && typeof tag === 'object') {
    const kindRaw = asStr(tag.kind, 'active')
    const kind = (['active', 'stale', 'hot', 'superseded'].includes(kindRaw) ? kindRaw : 'active') as 'active' | 'stale' | 'hot' | 'superseded'
    result.statusTag = { label: asStr(tag.label, kind), kind }
  }
  if (raw.snippet !== undefined) result.snippet = asStr(raw.snippet)
  return result
}

/** Normalize search/node/similar/tags/context responses into ContextPayload. */
export function mapContextResult(raw: unknown, project: string): ContextPayload {
  const obj = (raw ?? {}) as Raw
  const results = Array.isArray(obj.results) ? obj.results.map((r) => mapRawContextResult(r as Raw, project)) : []
  return assertPayload({ schemaVersion: 1, kind: 'docgraph_context', project, results, truncated: asBool(obj.truncated, results.length === 0) })
}

/** Normalize docgraph_files responses into FilesPayload. */
export function mapFilesResult(raw: unknown, project: string): FilesPayload {
  const obj = (raw ?? {}) as Raw
  const files = Array.isArray(obj.files) ? obj.files.map((d) => mapRawDoc(d as Raw, project)) : []
  return assertPayload({ schemaVersion: 1, kind: 'docgraph_files', project, files, truncated: asBool(obj.truncated, files.length === 0) })
}

function mapRawFinding(raw: Raw): DriftPayload['findings'][number] {
  const severityRaw = asStr(raw.severity, 'ok')
  const severity = severityRaw === 'err' || severityRaw === 'error' ? 'err' : severityRaw === 'warn' || severityRaw === 'warning' ? 'warn' : 'ok'
  const docs = Array.isArray(raw.docs) ? raw.docs.map((d) => ({ id: asStr((d as Raw).id), name: asStr((d as Raw).name) })) : []
  const finding: DriftPayload['findings'][number] = {
    code: asStr(raw.code, 'D-UNKNOWN'),
    severity,
    title: asStr(raw.title, ''),
    detail: asStr(raw.detail, ''),
    actionable: asBool(raw.actionable),
    docs,
  }
  if (raw.actionLabel !== undefined || raw.action_label !== undefined) finding.actionLabel = asStr(raw.actionLabel ?? raw.action_label)
  return finding
}

/** Normalize docgraph_context format=drift_audit responses into DriftPayload. */
export function mapDriftResult(raw: unknown, project: string): DriftPayload {
  const obj = (raw ?? {}) as Raw
  const findings = Array.isArray(obj.findings) ? obj.findings.map((f) => mapRawFinding(f as Raw)) : []
  return assertPayload({ schemaVersion: 1, kind: 'docgraph_drift', project, findings })
}

/** Raw MCP tools/call result content. */
interface CoreToolResult {
  content?: Array<{ type: string; text?: string }>
  structuredContent?: unknown
}

/** Long-lived `docgraph serve` process owner (single-project mode). */
export class DocGraphCoreManager {
  private client: JsonRpcClient | null = null
  private indexingOp: Promise<unknown> = Promise.resolve()
  private revision = 0
  private lastStateKey = ''

  constructor(
    private readonly ctx: Context,
    private readonly projectRoot: string,
  ) {}

  /** §3.1 binary resolution order. */
  resolveBin(): string {
    const env = process.env.DSH_DOCGRAPH_BIN
    if (env && env.trim()) return env
    return 'docgraph'
  }

  private logStderr(chunk: string): void {
    // Forward core stderr to the plugin log only — never into tool result text.
    try {
      this.ctx.logger?.info('[docgraph-core] ' + chunk.trimEnd())
    } catch {
      /* logger optional */
    }
  }

  private nextRevision(key: string): number {
    if (key !== this.lastStateKey) {
      this.lastStateKey = key
      this.revision += 1
    }
    return this.revision
  }

  private emptyIndex(kind: 'docgraph_index' | 'docgraph_status', state: Partial<IndexState>): IndexPayload {
    const phase = state.phase ?? 'starting'
    const full: IndexState = { phase, revision: this.nextRevision(phase + (state.lastError ?? '')) }
    if (state.startedAt !== undefined) full.startedAt = state.startedAt
    if (state.finishedAt !== undefined) full.finishedAt = state.finishedAt
    if (state.lastError !== undefined) full.lastError = state.lastError
    return {
      schemaVersion: 1,
      kind,
      project: this.projectName(),
      rootPath: this.projectRoot,
      state: full,
      summary: { docs: 0, nodes: 0, edges: 0, entities: 0, failed: 0, formats: [] },
      docs: [],
    }
  }

  private projectName(): string {
    const base = this.projectRoot.split(/[\\/]/).filter(Boolean).pop()
    return base ?? this.projectRoot
  }

  private async callCoreTool<T>(name: string, args: unknown, timeoutMs: number, signal?: AbortSignal): Promise<T> {
    const raw = await this.client!.request('tools/call', { name, arguments: args }, timeoutMs, signal) as CoreToolResult | string
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) as T } catch { return raw as T }
    }
    if (raw && typeof raw === 'object' && raw.structuredContent !== undefined) return raw.structuredContent as T
    const content = Array.isArray(raw?.content) ? raw.content : []
    const text = content.filter((c) => typeof c === 'object' && c !== null && c.type === 'text').map((c) => c.text ?? '').join('\n')
    if (text.trim() === '') return undefined as T
    try { return JSON.parse(text) as T } catch { return text as T }
  }

  private async handshake(): Promise<void> {
    try {
      await this.client!.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'dsh-doc-graph', version: '0.1.0' },
      }, 15000)
      this.client!.notify('notifications/initialized', {})
    } catch {
      /* handshake is best-effort; tools/call may still work */
    }
  }

  private isExitError(err: unknown): boolean {
    return err instanceof Error && /core exited/.test(err.message)
  }

  private async startClient(): Promise<void> {
    const client = new JsonRpcClient({
      bin: this.resolveBin(),
      args: ['serve', '--path', this.projectRoot],
      onStderr: (chunk) => this.logStderr(chunk),
      onExit: () => { if (this.client === client) this.client = null },
    })
    try {
      await client.start()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/ENOENT/.test(msg) || /spawn/.test(msg)) throw new ToolError('docgraph core binary not found')
      throw err
    }
    this.client = client
    await this.handshake()
  }

  /** Start serve (if needed) and wait until docgraph_status is queryable. */
  async ensureServing(timeoutMs = 60000): Promise<void> {
    if (this.client?.running) return
    await this.startClient()
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        await this.callCoreTool('docgraph_status', {}, 15000)
        return
      } catch (err) {
        if (this.isExitError(err)) throw err
        await sleep(500)
      }
    }
  }

  /** Query one core tool with a single auto-restart on process exit. */
  async query<T>(name: string, args: unknown, timeoutMs = 15000, signal?: AbortSignal): Promise<T> {
    await this.ensureServing()
    try {
      return await this.callCoreTool<T>(name, args, timeoutMs, signal)
    } catch (err) {
      if (this.isExitError(err)) {
        this.client = null
        await this.startClient()
        return this.callCoreTool<T>(name, args, timeoutMs, signal)
      }
      throw err
    }
  }

  /** docgraph_status payload with §4.3 phase inference. */
  async status(timeoutMs = 15000): Promise<IndexPayload> {
    if (!this.client?.running) {
      return this.emptyIndex('docgraph_status', { phase: 'starting' })
    }
    try {
      const raw = await this.callCoreTool('docgraph_status', {}, timeoutMs)
      return mapStatusResult(raw, this.projectName(), this.projectRoot, 'docgraph_status', this.nextRevision(JSON.stringify(raw)))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const phase: IndexPhase = 'error'
      return this.emptyIndex('docgraph_status', { phase, lastError: msg })
    }
  }

  private async runCliIndex(): Promise<void> {
    const { spawn } = await import('node:child_process')
    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.resolveBin(), ['index', '--force', this.projectRoot], { stdio: ['ignore', 'ignore', 'pipe'] })
      let stderr = ''
      child.stderr.setEncoding?.('utf8')
      child.stderr.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-4000) })
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new ToolError('docgraph index --force timed out after 120s'))
      }, 120000)
      child.once('error', (err) => { clearTimeout(timer); reject(err) })
      child.once('exit', (code) => {
        clearTimeout(timer)
        if (code === 0) resolve()
        else reject(new ToolError(`docgraph index --force failed with code ${code}${stderr ? ': ' + stderr.trim() : ''}`))
      })
    })
  }
  private async stopClient(timeoutMs = 5000): Promise<void> {
    const client = this.client
    this.client = null
    if (client) await client.stop(timeoutMs)
  }

  /** §3.2 docgraph_index. force=false ensures serve and returns status; force=true runs the full reindex sequence. */
  async index(force: boolean): Promise<IndexPayload> {
    if (!force) {
      await this.ensureServing()
      return this.status()
    }
    const run = this.indexingOp.then(() => this.forceIndex())
    this.indexingOp = run.catch(() => undefined)
    return run
  }

  private async forceIndex(): Promise<IndexPayload> {
    // 1. record old status (best effort)
    try { await this.status(15000) } catch { /* ignore */ }
    // 2. stop serve (SIGTERM, 5s, then SIGKILL)
    await this.stopClient(5000)
    // 3. one-shot CLI full reindex (exit code only, 120s)
    await this.runCliIndex()
    // 4. restart serve
    await this.ensureServing()
    // 5. poll status every 500ms up to 60s
    const deadline = Date.now() + 60000
    let last: IndexPayload = this.emptyIndex('docgraph_index', { phase: 'starting' })
    while (Date.now() < deadline) {
      last = await this.status(15000)
      if (last.state.phase === 'ready' || last.state.phase === 'error') return { ...last, kind: 'docgraph_index' }
      await sleep(500)
    }
    return { ...last, kind: 'docgraph_index' }
  }

  async stop(): Promise<void> {
    await this.stopClient(5000)
  }
}

/** Validate a produced payload with the §4 type guard; used by tool.ts. */
export function assertPayload<T extends DocGraphPayload>(payload: T): T {
  if (!isDocGraphPayload(payload)) {
    throw new ToolError('core response validation failed: payload')
  }
  return payload
}

export { isDocGraphPayload, isGraphPayload }
