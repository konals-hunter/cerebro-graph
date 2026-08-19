import { describe, expect, it } from 'vitest'
import { docGraphSkillProvider } from './skill.js'

describe('docGraphSkillProvider', () => {
  it('lists one bundled doc-graph candidate', async () => {
    const list = await docGraphSkillProvider.list()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('doc-graph')
    expect(list[0].invocation).toEqual({ modelInvocable: true, userInvocable: true })
  })
  it('loads the skill body with the tool selection table', async () => {
    const [candidate] = await docGraphSkillProvider.list()
    const skill = await docGraphSkillProvider.get(candidate)
    expect(skill.name).toBe('doc-graph')
    expect(skill.content).toContain('docgraph_')
    expect(skill.content).toContain('drift_audit')
  })
})
