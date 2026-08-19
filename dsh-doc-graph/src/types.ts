/**
 * §4 data contract. Every payload carries schemaVersion: 1 and a discriminant
 * `kind`. Core responses are checked by hand-written type guards (no `as`
 * casts to payload types, no third-party validator).
 */

export type Role = 'current' | 'direct' | 'transitive' | 'section' | 'other'
export type NodeType = 'doc' | 'section'
export type LinkKind = 'contains' | 'references'
export type GraphMode = '2d' | '3d'
export type DocStatus = 'ok' | 'changed' | 'err'
export type GraphOperation = 'incoming' | 'outgoing' | 'impact' | 'trace'
export type IndexPhase = 'starting' | 'indexing' | 'ready' | 'error'

export interface GraphNode {
  id: string
  project: string
  name: string
  type: NodeType
  role: Role
  relPath: string
  anchor?: string
  val: number
  inboundTotal: number
  outboundTotal: number
}

export interface GraphLink {
  source: string
  target: string
  kind: LinkKind
}

export interface DocRecord {
  id: string
  project: string
  name: string
  path: string
  fmt: 'md' | 'docx' | 'pdf' | 'html' | 'txt' | string
  status: DocStatus
  inbound: number
  sizeBytes: number
  updatedAt: number
  indexedAt: number
}

export interface IndexState {
  phase: IndexPhase
  startedAt?: number
  finishedAt?: number
  lastError?: string
  revision: number
}

export interface Summary {
  docs: number
  nodes: number
  edges: number
  entities: number
  failed: number
  formats: { fmt: string; pct: number }[]
}

export interface IndexPayload {
  schemaVersion: 1
  kind: 'docgraph_index' | 'docgraph_status'
  project: string
  rootPath: string
  state: IndexState
  summary: Summary
  docs: DocRecord[]
}

export interface GraphPayload {
  schemaVersion: 1
  kind: 'docgraph_graph'
  project: string
  seedNodeId: string
  operation: GraphOperation
  depth?: number
  nodes: GraphNode[]
  links: GraphLink[]
  dropped: { nodes: number; links: number }
}

export interface DriftFinding {
  code: string
  severity: 'err' | 'warn' | 'ok'
  title: string
  detail: string
  actionable: boolean
  actionLabel?: string
  docs: { id: string; name: string }[]
}

export interface DriftPayload {
  schemaVersion: 1
  kind: 'docgraph_drift'
  project: string
  findings: DriftFinding[]
}

export interface ContextResult {
  id: string
  project: string
  title: string
  location: string
  docPath: string
  score?: number
  inbound: number
  chips: string[]
  statusTag?: { label: string; kind: 'active' | 'stale' | 'hot' | 'superseded' }
  snippet?: string
}

export interface ContextPayload {
  schemaVersion: 1
  kind: 'docgraph_context'
  project: string
  results: ContextResult[]
  truncated: boolean
}

export interface FilesPayload {
  schemaVersion: 1
  kind: 'docgraph_files'
  project: string
  files: DocRecord[]
  truncated: boolean
}

export type DocGraphPayload =
  | IndexPayload
  | GraphPayload
  | DriftPayload
  | ContextPayload
  | FilesPayload

/** §10.1 role → depth for filtering. */
export const ROLE_DEPTH: Record<Role, number> = {
  current: 0,
  section: 1,
  direct: 1,
  transitive: 2,
  other: 3,
}

/** Chinese role display names used by Inspector kicker and 3D hover labels. */
export const ROLE_NAME: Record<Role, string> = {
  current: '当前文档',
  direct: '直接影响',
  transitive: '传递影响',
  section: '章节',
  other: '其他',
}

/** §4.4 stable namespaced id: project + relPath + optional anchor. */
export function nodeId(project: string, relPath: string, anchor?: string): string {
  return `${project}::${relPath}${anchor ? `::${anchor}` : ''}`
}

// ---- hand-written runtime structure guards ----

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'
const isArr = (v: unknown): v is unknown[] => Array.isArray(v)

const isRole = (v: unknown): v is Role => isStr(v) && ['current', 'direct', 'transitive', 'section', 'other'].includes(v)
const isNodeType = (v: unknown): v is NodeType => v === 'doc' || v === 'section'
const isLinkKind = (v: unknown): v is LinkKind => v === 'contains' || v === 'references'
const isDocStatus = (v: unknown): v is DocStatus => v === 'ok' || v === 'changed' || v === 'err'
const isIndexPhase = (v: unknown): v is IndexPhase => isStr(v) && ['starting', 'indexing', 'ready', 'error'].includes(v)

export function isIndexState(v: unknown): v is IndexState {
  if (!isObj(v)) return false
  if (!isIndexPhase(v.phase)) return false
  if (!isNum(v.revision)) return false
  if ('startedAt' in v && v.startedAt !== undefined && !isNum(v.startedAt)) return false
  if ('finishedAt' in v && v.finishedAt !== undefined && !isNum(v.finishedAt)) return false
  if ('lastError' in v && v.lastError !== undefined && !isStr(v.lastError)) return false
  return true
}

export function isSummary(v: unknown): v is Summary {
  if (!isObj(v)) return false
  if (!isNum(v.docs) || !isNum(v.nodes) || !isNum(v.edges) || !isNum(v.entities) || !isNum(v.failed)) return false
  if (!isArr(v.formats)) return false
  return v.formats.every(f => isObj(f) && isStr(f.fmt) && isNum(f.pct))
}

export function isDocRecord(v: unknown): v is DocRecord {
  if (!isObj(v)) return false
  return isStr(v.id) && isStr(v.project) && isStr(v.name) && isStr(v.path) && isStr(v.fmt)
    && isDocStatus(v.status) && isNum(v.inbound) && isNum(v.sizeBytes) && isNum(v.updatedAt) && isNum(v.indexedAt)
}

export function isGraphNode(v: unknown): v is GraphNode {
  if (!isObj(v)) return false
  return isStr(v.id) && isStr(v.project) && isStr(v.name) && isNodeType(v.type) && isRole(v.role)
    && isStr(v.relPath) && isNum(v.val) && isNum(v.inboundTotal) && isNum(v.outboundTotal)
    && ('anchor' in v ? v.anchor === undefined || isStr(v.anchor) : true)
}

export function isGraphLink(v: unknown): v is GraphLink {
  if (!isObj(v)) return false
  return isStr(v.source) && isStr(v.target) && isLinkKind(v.kind)
}

export function isContextResult(v: unknown): v is ContextResult {
  if (!isObj(v)) return false
  return isStr(v.id) && isStr(v.project) && isStr(v.title) && isStr(v.location) && isStr(v.docPath)
    && isNum(v.inbound) && isArr(v.chips) && v.chips.every(isStr)
    && ('score' in v ? v.score === undefined || isNum(v.score) : true)
    && ('statusTag' in v ? v.statusTag === undefined || (isObj(v.statusTag) && isStr(v.statusTag.label) && ['active', 'stale', 'hot', 'superseded'].includes(v.statusTag.kind as string)) : true)
    && ('snippet' in v ? v.snippet === undefined || isStr(v.snippet) : true)
}

export function isDriftFinding(v: unknown): v is DriftFinding {
  if (!isObj(v)) return false
  return isStr(v.code) && ['err', 'warn', 'ok'].includes(v.severity as string) && isStr(v.title) && isStr(v.detail)
    && isBool(v.actionable) && isArr(v.docs)
    && v.docs.every(d => isObj(d) && isStr(d.id) && isStr(d.name))
    && ('actionLabel' in v ? v.actionLabel === undefined || isStr(v.actionLabel) : true)
}

export function isIndexPayload(v: unknown): v is IndexPayload {
  if (!isObj(v)) return false
  return v.schemaVersion === 1 && (v.kind === 'docgraph_index' || v.kind === 'docgraph_status')
    && isStr(v.project) && isStr(v.rootPath) && isIndexState(v.state) && isSummary(v.summary)
    && isArr(v.docs) && v.docs.every(isDocRecord)
}

export function isGraphPayload(v: unknown): v is GraphPayload {
  if (!isObj(v)) return false
  return v.schemaVersion === 1 && v.kind === 'docgraph_graph' && isStr(v.project) && isStr(v.seedNodeId)
    && ['incoming', 'outgoing', 'impact', 'trace'].includes(v.operation as string)
    && isArr(v.nodes) && v.nodes.every(isGraphNode) && isArr(v.links) && v.links.every(isGraphLink)
    && isObj(v.dropped) && isNum(v.dropped.nodes) && isNum(v.dropped.links)
    && ('depth' in v ? v.depth === undefined || isNum(v.depth) : true)
}

export function isDriftPayload(v: unknown): v is DriftPayload {
  if (!isObj(v)) return false
  return v.schemaVersion === 1 && v.kind === 'docgraph_drift' && isStr(v.project)
    && isArr(v.findings) && v.findings.every(isDriftFinding)
}

export function isContextPayload(v: unknown): v is ContextPayload {
  if (!isObj(v)) return false
  return v.schemaVersion === 1 && v.kind === 'docgraph_context' && isStr(v.project)
    && isArr(v.results) && v.results.every(isContextResult) && isBool(v.truncated)
}

export function isFilesPayload(v: unknown): v is FilesPayload {
  if (!isObj(v)) return false
  return v.schemaVersion === 1 && v.kind === 'docgraph_files' && isStr(v.project)
    && isArr(v.files) && v.files.every(isDocRecord) && isBool(v.truncated)
}

export function isDocGraphPayload(v: unknown): v is DocGraphPayload {
  return isIndexPayload(v) || isGraphPayload(v) || isDriftPayload(v) || isContextPayload(v) || isFilesPayload(v)
}
