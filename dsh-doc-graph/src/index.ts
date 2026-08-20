/**
 * dsh-doc-graph, node half: registers the nine `docgraph_*` tools, the
 * bundled `doc-graph` skill, and the browser-facing /api/dsh-doc-graph routes
 * (index/status/graph). The browser half (`src/client/`) registers the
 * toolview cards, the input dock, and the conversation view tab.
 */
import type { Context } from '@deepseek-ai/cordis'
import { docgraphTools } from './tool.js'
import { docGraphSkillProvider } from './skill.js'
import { docGraphRoutes } from './routes.js'

export const name = 'dsh-doc-graph'
export const inject = ['tools', 'skills', 'webServer']

export function apply(ctx: Context): void {
  for (const tool of docgraphTools(ctx)) ctx.tools.register(tool)
  ctx.skills.registerProvider(() => docGraphSkillProvider)

  ctx.effect(() => {
    const disposers = docGraphRoutes(ctx).map((route) => ctx.webServer.register(route))
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'dsh-doc-graph: routes')
}