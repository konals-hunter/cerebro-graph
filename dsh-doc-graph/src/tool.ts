/**
 * §7 Node-side tools. All nine docgraph_* tools share one core manager per
 * project root (so IndexState.revision is monotonic per process), validate
 * every path through resolveRelPath, and project `{ kind, payload }` into
 * presentationMeta so the client toolview cards and replay stay stable.
 */
import { sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import {
  defineTool,
  type InferArgs,
  type ParameterSchemaSpec,
  type ToolDefinition,
  type ToolRunContext,
} from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import {
  DocGraphCoreManager, getProjectRoot, mapContextResult, mapDriftResult,
  mapFilesResult, mapGraphResult, resolveRelPath,
} from './core.js'
import type {
  DocGraphPayload, GraphOperation, GraphPayload,
} from './types.js'
import { nodeId } from './types.js'

export const DOCGRAPH_TOOL_NAMES = [
  'docgraph_index', 'docgraph_status', 'docgraph_context', 'docgraph_search',
  'docgraph_node', 'docgraph_files', 'docgraph_graph', 'docgraph_similar', 'docgraph_tags',
] as const

const managers = new Map<string, DocGraphCoreManager>()

function toCorePath(projectRoot: string, input: string): string {
  const rel = resolveRelPath(projectRoot, input)
  return rel.split('/').join(sep)
}

function managerFor(ctx: Context, projectRoot: string): DocGraphCoreManager {
  let manager = managers.get(projectRoot)
  if (!manager) {
    manager = new DocGraphCoreManager(ctx, projectRoot)
    managers.set(projectRoot, manager)
  }
  return manager
}

function projectNameOf(root: string): string {
  return root.split(/[\\/]/).filter(Boolean).pop() ?? root
}

function optString(args: Record<string, unknown>, key: string, fallback = ''): string {
  const v = args[key]
  if (v === undefined) return fallback
  return typeof v === 'string' ? v : String(v)
}

function reqString(args: Record<string, unknown>, key: string, tool: string): string {
  const v = optString(args, key, '')
  if (v.trim() === '') throw new Error(`${tool}: \`${key}\` is required`)
  return v
}

function intInRange(args: Record<string, unknown>, key: string, fallback: number, min: number, max: number, tool: string): number {
  const v = args[key]
  if (v === undefined) return fallback
  const n = typeof v === 'number' ? Math.trunc(v) : Number(v)
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${tool}: \`${key}\` must be ${min}..${max}`)
  }
  return n
}

function boolArg(args: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = args[key]
  return typeof v === 'boolean' ? v : fallback
}

const FILTER_PARAMS: ParameterSchemaSpec = {
  status: { type: 'string', description: '治理过滤：文档状态' },
  sensitivity: { type: 'string', description: '治理过滤：敏感级别' },
  canonical_source: { type: 'string', description: '治理过滤：canonical 来源' },
  allowed_audience: { type: 'string', description: '治理过滤：允许受众' },
  as_of_date: { type: 'string', description: '治理过滤：YYYY-MM-DD' },
  claim_id: { type: 'string', description: '研究过滤：claim id' },
  source_type: { type: 'string', description: '研究过滤：来源类型' },
  confidence: { type: 'string', description: '研究过滤：置信度' },
  analyst_status: { type: 'string', description: '研究过滤：分析状态' },
}

const ENTITY_PARAMS: ParameterSchemaSpec = {
  entity_type: { type: 'string', description: '实体过滤：实体类型（仅 search）' },
  entity_id: { type: 'string', description: '实体过滤：实体 id（仅 search）' },
}

const PROJECT_PARAM: ParameterSchemaSpec = {
  project: { type: 'string', description: 'MVP 单 project，透传但为 no-op' },
}

function pickFilters(args: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of Object.keys(FILTER_PARAMS)) {
    const v = args[key]
    if (typeof v === 'string' && v !== '') out[key] = v
  }
  return out
}

function renderText(name: string, value: DocGraphPayload): string {
  switch (value.kind) {
    case 'docgraph_index':
      return `索引完成：${value.summary.docs} 文档 / ${value.summary.nodes} 节点 / ${value.summary.edges} 边（${value.state.phase}）`
    case 'docgraph_status':
      return `图谱状态：${value.state.phase}`
    case 'docgraph_graph':
      return `图谱：${value.nodes.length} 节点 / ${value.links.length} 边（${value.operation}${value.depth ? ` depth=${value.depth}` : ''}）`
    case 'docgraph_drift':
      return `漂移审计：${value.findings.length} 项发现`
    case 'docgraph_context':
      return `图谱查询：${value.results.length} 条结果`
    case 'docgraph_files':
      return `文档列表：${value.files.length} 个文件`
  }
}

interface ToolSpec<S extends ParameterSchemaSpec> {
  name: string
  description: string
  parameters: S
  execute(args: InferArgs<S>, exec: ToolRunContext): Promise<DocGraphPayload>
}

function docGraphTool<const S extends ParameterSchemaSpec>(spec: ToolSpec<S>): ToolDefinition {
  return defineTool({
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: renderText(spec.name, value as unknown as DocGraphPayload) }],
      presentationMeta: (_args, value) => ({ kind: (value as unknown as DocGraphPayload).kind, payload: value }),
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      return spec.execute(args as InferArgs<S>, exec) as unknown as JsonValue
    },
  })
}

const DESCRIPTIONS: Record<string, string> = {
  docgraph_index: 'Ensure the doc graph index for the project root, or force a full reindex (stops/restarts the core serve process). Returns index status.',
  docgraph_status: 'Return the current doc graph index status (four-phase state, summary counts, doc records).',
  docgraph_context: 'Query the graph context for a task; format="drift_audit" returns a drift audit payload.',
  docgraph_search: 'Search indexed documents/sections/entities in the doc graph.',
  docgraph_node: 'Look up one node by project-relative path.',
  docgraph_files: 'List indexed document files.',
  docgraph_graph: 'Expand the graph around a document: incoming/outgoing/impact/trace.',
  docgraph_similar: 'Find documents similar to the given document.',
  docgraph_tags: 'List documents or sections by tag.',
}

export function docgraphTools(ctx: Context): ToolDefinition[] {
  const root = (exec: ToolRunContext) => getProjectRoot(ctx, exec)
  const project = (exec: ToolRunContext) => projectNameOf(root(exec))

  return [
    docGraphTool({
      name: 'docgraph_index',
      description: DESCRIPTIONS.docgraph_index,
      parameters: {
        path: { type: 'string', description: 'MVP 仅接受 "." 或省略' },
        force: { type: 'boolean', description: 'true=停 serve→一次性 CLI 全量索引→重启 serve（慢，谨慎用）' },
        ...PROJECT_PARAM,
      },
      async execute(args, exec) {
        const pathArg = optString(args, 'path', '.')
        if (pathArg !== '.' && pathArg !== '') {
          throw new Error('docgraph_index: MVP 仅支持索引项目根目录')
        }
        const payload = await managerFor(ctx, root(exec)).index(boolArg(args, 'force', false))
        return { ...payload, kind: 'docgraph_index' as const }
      },
    }),

    docGraphTool({
      name: 'docgraph_status',
      description: DESCRIPTIONS.docgraph_status,
      parameters: { path: { type: 'string', description: 'MVP 仅接受 "." 或省略' }, ...PROJECT_PARAM },
      async execute(args, exec) {
        const pathArg = optString(args, 'path', '.')
        if (pathArg !== '.' && pathArg !== '') {
          throw new Error('docgraph_status: MVP 仅支持索引项目根目录')
        }
        return managerFor(ctx, root(exec)).status()
      },
    }),

    docGraphTool({
      name: 'docgraph_context',
      description: DESCRIPTIONS.docgraph_context,
      parameters: {
        task: { type: 'string', required: true, description: '自然语言任务描述' },
        format: { type: 'string', description: "默认 'summary'；'drift_audit' 返回漂移审计" },
        maxNodes: { type: 'integer', description: '1..200，默认 10' },
        includeContent: { type: 'boolean', description: '默认 true' },
        maxContentBytes: { type: 'integer', description: '≤6000，默认 2000' },
        impactDepth: { type: 'integer', description: '1..3，默认 1' },
        referenceLimit: { type: 'integer', description: '1..20，默认 5' },
        ...FILTER_PARAMS,
        ...PROJECT_PARAM,
      },
      async execute(args, exec) {
        const task = reqString(args, 'task', 'docgraph_context')
        const format = optString(args, 'format', 'summary')
        const coreArgs = {
          task,
          format,
          maxNodes: intInRange(args, 'maxNodes', 10, 1, 200, 'docgraph_context'),
          includeContent: boolArg(args, 'includeContent', true),
          maxContentBytes: intInRange(args, 'maxContentBytes', 2000, 1, 6000, 'docgraph_context'),
          impactDepth: intInRange(args, 'impactDepth', 1, 1, 3, 'docgraph_context'),
          referenceLimit: intInRange(args, 'referenceLimit', 5, 1, 20, 'docgraph_context'),
          ...pickFilters(args),
        }
        const raw = await managerFor(ctx, root(exec)).query('docgraph_context', coreArgs, 15000, exec.signal)
        return format === 'drift_audit' ? mapDriftResult(raw, project(exec)) : mapContextResult(raw, project(exec))
      },
    }),

    docGraphTool({
      name: 'docgraph_search',
      description: DESCRIPTIONS.docgraph_search,
      parameters: {
        q: { type: 'string', required: true, description: '搜索查询' },
        limit: { type: 'integer', description: '1..200，默认 10' },
        include_code: { type: 'boolean', description: '默认 false' },
        kind: { type: 'string', description: "默认 'doc'" },
        ...ENTITY_PARAMS,
        ...FILTER_PARAMS,
        ...PROJECT_PARAM,
      },
      async execute(args, exec) {
        const coreArgs = {
          q: reqString(args, 'q', 'docgraph_search'),
          limit: intInRange(args, 'limit', 10, 1, 200, 'docgraph_search'),
          include_code: boolArg(args, 'include_code', false),
          kind: optString(args, 'kind', 'doc'),
          entity_type: optString(args, 'entity_type', ''),
          entity_id: optString(args, 'entity_id', ''),
          ...pickFilters(args),
        }
        const raw = await managerFor(ctx, root(exec)).query('docgraph_search', coreArgs, 15000, exec.signal)
        return mapContextResult(raw, project(exec))
      },
    }),

    docGraphTool({
      name: 'docgraph_node',
      description: DESCRIPTIONS.docgraph_node,
      parameters: {
        path: { type: 'string', required: true, description: '项目内相对路径（/ 分隔）' },
        section: { type: 'string', description: '章节锚点' },
        ...PROJECT_PARAM,
      },
      async execute(args, exec) {
        const projectRoot = root(exec)
        const rel = toCorePath(projectRoot, reqString(args, 'path', 'docgraph_node'))
        const raw = await managerFor(ctx, projectRoot).query('docgraph_node', { path: rel, section: optString(args, 'section', '') || undefined }, 15000, exec.signal)
        return mapContextResult(raw, project(exec))
      },
    }),

    docGraphTool({
      name: 'docgraph_files',
      description: DESCRIPTIONS.docgraph_files,
      parameters: {
        path: { type: 'string', description: '目录过滤（项目内相对路径）' },
        limit: { type: 'integer', description: '0..200，默认 50' },
        ...PROJECT_PARAM,
      },
      async execute(args, exec) {
        const projectRoot = root(exec)
        const pathArg = optString(args, 'path', '')
        const coreArgs: Record<string, unknown> = { limit: intInRange(args, 'limit', 50, 0, 200, 'docgraph_files') }
        if (pathArg !== '') coreArgs.path = toCorePath(projectRoot, pathArg)
        const raw = await managerFor(ctx, projectRoot).query('docgraph_files', coreArgs, 15000, exec.signal)
        return mapFilesResult(raw, project(exec))
      },
    }),
    docGraphTool({
      name: 'docgraph_graph',
      description: DESCRIPTIONS.docgraph_graph,
      parameters: {
        operation: { type: 'string', required: true, description: "'incoming' | 'outgoing' | 'impact' | 'trace'" },
        document: { type: 'string', description: 'incoming/outgoing/impact 必填；trace 禁用' },
        from: { type: 'string', description: 'trace 必填；其他操作禁用' },
        to: { type: 'string', description: 'trace 必填；其他操作禁用' },
        depth: { type: 'integer', description: 'impact 1..5，默认 2' },
        limit: { type: 'integer', description: '0..200，默认 10' },
        ...PROJECT_PARAM,
      },
      async execute(args, exec) {
        const operation = reqString(args, 'operation', 'docgraph_graph') as GraphOperation
        if (!['incoming', 'outgoing', 'impact', 'trace'].includes(operation)) {
          throw new Error('docgraph_graph: invalid operation')
        }
        let coreArgs: Record<string, unknown>
        let depth: number | undefined
        let seedFallback: string
        const projectRoot = root(exec)
        if (operation === 'trace') {
          if (args.document !== undefined) throw new Error('docgraph_graph: document not valid for trace')
          const from = toCorePath(projectRoot, reqString(args, 'from', 'docgraph_graph'))
          const to = toCorePath(projectRoot, reqString(args, 'to', 'docgraph_graph'))
          coreArgs = { operation, from, to }
          seedFallback = from.split(sep).join('/')
        } else {
          if (args.from !== undefined || args.to !== undefined) throw new Error('docgraph_graph: from/to only valid for trace')
          const document = toCorePath(projectRoot, reqString(args, 'document', 'docgraph_graph'))
          coreArgs = { operation, document, limit: intInRange(args, 'limit', 10, 0, 200, 'docgraph_graph') }
          if (operation === 'impact') {
            depth = intInRange(args, 'depth', 2, 1, 5, 'docgraph_graph')
            coreArgs.depth = depth
          }
          seedFallback = document.split(sep).join('/')
        }
        const projectName = project(exec)
        const raw = await managerFor(ctx, projectRoot).query<Record<string, unknown>>('docgraph_graph', coreArgs, 15000, exec.signal)
        const rawSeed = typeof raw?.seedNodeId === 'string' ? raw.seedNodeId : typeof raw?.seed === 'string' ? raw.seed : ''
        const seedNodeId = rawSeed || nodeId(projectName, seedFallback)
        return mapGraphResult(raw, projectName, seedNodeId, operation, depth) as GraphPayload
      },
    }),

    docGraphTool({
      name: 'docgraph_similar',
      description: DESCRIPTIONS.docgraph_similar,
      parameters: {
        document: { type: 'string', required: true, description: '项目内相对路径' },
        limit: { type: 'integer', description: '默认 10' },
        engine: { type: 'string', description: "默认 'auto'" },
        ...PROJECT_PARAM,
      },
      async execute(args, exec) {
        const projectRoot = root(exec)
        const coreArgs = {
          document: toCorePath(projectRoot, reqString(args, 'document', 'docgraph_similar')),
          limit: intInRange(args, 'limit', 10, 1, 200, 'docgraph_similar'),
          engine: optString(args, 'engine', 'auto'),
        }
        const raw = await managerFor(ctx, projectRoot).query('docgraph_similar', coreArgs, 15000, exec.signal)
        return mapContextResult(raw, project(exec))
      },
    }),

    docGraphTool({
      name: 'docgraph_tags',
      description: DESCRIPTIONS.docgraph_tags,
      parameters: {
        tag: { type: 'string', description: '按 tag 过滤' },
        ...PROJECT_PARAM,
      },
      async execute(args, exec) {
        const coreArgs: Record<string, unknown> = {}
        if (optString(args, 'tag', '') !== '') coreArgs.tag = optString(args, 'tag', '')
        const raw = await managerFor(ctx, root(exec)).query('docgraph_tags', coreArgs, 15000, exec.signal)
        return mapContextResult(raw, project(exec))
      },
    }),
  ]
}
