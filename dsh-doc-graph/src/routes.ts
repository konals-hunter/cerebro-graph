/**
 * Browser-facing loopback routes. The client tab calls these directly so the
 * user never has to type commands, and the agent is not required for simple
 * index/status/graph operations.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { DocGraphCoreManager, mapFilesResult, mapGraphResult } from './core.js'
import { nodeId } from './types.js'

const managers = new Map<string, DocGraphCoreManager>()

function managerFor(ctx: Context, cwd: string): DocGraphCoreManager {
  let manager = managers.get(cwd)
  if (!manager) {
    manager = new DocGraphCoreManager(ctx, cwd)
    managers.set(cwd, manager)
  }
  return manager
}

function projectNameOf(cwd: string): string {
  return cwd.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean).pop() ?? cwd
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(JSON.stringify(body))
}

function cwdOf(req: IncomingMessage): string | null {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const cwd = url.searchParams.get('cwd')
  if (!cwd || cwd.trim() === '') return null
  return cwd.trim()
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > 64 * 1024) return null
    chunks.push(buffer)
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

export function docGraphRoutes(ctx: Context): WebRoute[] {
  return [
    {
      kind: 'exact',
      path: '/api/dsh-doc-graph/files',
      handler: async (req, res) => {
        if (req.method !== 'GET') { writeJson(res, 405, { error: 'method not allowed' }); return }
        const cwd = cwdOf(req)
        if (cwd === null) { writeJson(res, 400, { error: 'cwd query parameter is required' }); return }
        try {
          const manager = managerFor(ctx, cwd)
          await manager.ensureServing(30000)
          const raw = await manager.query<Record<string, unknown>>('docgraph_files', { limit: 200 }, 30000)
          const payload = mapFilesResult(raw, projectNameOf(cwd))
          writeJson(res, 200, { payload })
        } catch (error) {
          writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-doc-graph/status',
      handler: async (req, res) => {
        if (req.method !== 'GET') { writeJson(res, 405, { error: 'method not allowed' }); return }
        const cwd = cwdOf(req)
        if (cwd === null) { writeJson(res, 400, { error: 'cwd query parameter is required' }); return }
        try {
          const manager = managerFor(ctx, cwd)
          await manager.ensureServing(30000)
          const payload = await manager.status(15000)
          writeJson(res, 200, { payload })
        } catch (error) {
          writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-doc-graph/index',
      handler: async (req, res) => {
        if (req.method !== 'POST') { writeJson(res, 405, { error: 'method not allowed' }); return }
        const cwd = cwdOf(req)
        if (cwd === null) { writeJson(res, 400, { error: 'cwd query parameter is required' }); return }
        const body = await readJsonBody(req)
        const force = body?.force === true
        try {
          const manager = managerFor(ctx, cwd)
          const payload = await manager.index(force)
          writeJson(res, 200, { payload })
        } catch (error) {
          writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-doc-graph/graph',
      handler: async (req, res) => {
        if (req.method !== 'POST') { writeJson(res, 405, { error: 'method not allowed' }); return }
        const cwd = cwdOf(req)
        if (cwd === null) { writeJson(res, 400, { error: 'cwd query parameter is required' }); return }
        const body = await readJsonBody(req)
        const operation = typeof body?.operation === 'string' ? body.operation : 'impact'
        if (!['incoming', 'outgoing', 'impact', 'trace'].includes(operation)) {
          writeJson(res, 400, { error: 'invalid operation' }); return
        }
        try {
          const manager = managerFor(ctx, cwd)
          await manager.ensureServing(30000)
          const coreArgs: Record<string, unknown> = { operation }
          let seedFallback = ''
          if (operation === 'trace') {
            const from = typeof body?.from === 'string' ? body.from : ''
            const to = typeof body?.to === 'string' ? body.to : ''
            if (!from || !to) { writeJson(res, 400, { error: 'from and to are required for trace' }); return }
            coreArgs.from = from
            coreArgs.to = to
            seedFallback = from
          } else {
            const document = typeof body?.document === 'string' ? body.document : ''
            if (!document) { writeJson(res, 400, { error: 'document is required' }); return }
            coreArgs.document = document
            coreArgs.limit = typeof body?.limit === 'number' ? Math.trunc(body.limit) : 10
            if (operation === 'impact') {
              const depth = typeof body?.depth === 'number' ? Math.trunc(body.depth) : 2
              coreArgs.depth = Math.max(1, Math.min(5, depth))
            }
            seedFallback = document
          }
          const raw = await manager.query<Record<string, unknown>>('docgraph_graph', coreArgs, 30000)
          const rawSeed = typeof raw?.seedNodeId === 'string' ? raw.seedNodeId : typeof raw?.seed === 'string' ? raw.seed : ''
          const projectName = projectNameOf(cwd)
          const seedNodeId = rawSeed || nodeId(projectName, seedFallback.split(/[\\/]/).join('/'))
          const payload = mapGraphResult(raw, projectName, seedNodeId, operation as 'impact', typeof coreArgs.depth === 'number' ? coreArgs.depth as number : undefined)
          writeJson(res, 200, { payload })
        } catch (error) {
          writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    },
  ]
}