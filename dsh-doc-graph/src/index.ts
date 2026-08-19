/**
 * dsh-doc-graph, node half: registers the nine `docgraph_*` tools and the
 * bundled `doc-graph` skill. The browser half (`src/client/`) registers the
 * toolview cards, the input dock, and the graph drawer.
 */
import type { Context } from '@deepseek-ai/cordis'
import { docgraphTools } from './tool.js'
import { docGraphSkillProvider } from './skill.js'

export const name = 'dsh-doc-graph'
export const inject = ['tools', 'skills']

export function apply(ctx: Context): void {
  for (const tool of docgraphTools(ctx)) ctx.tools.register(tool)
  ctx.skills.registerProvider(() => docGraphSkillProvider)
}
