import type { Role } from '../../../types.js'

const ROLE_OPTIONS: Array<{ role: Role; label: string }> = [
  { role: 'current', label: '当前文档' },
  { role: 'direct', label: '直接影响' },
  { role: 'transitive', label: '传递影响' },
  { role: 'section', label: '章节' },
  { role: 'other', label: '其他' },
]

export function GraphRail({ roles, depth, operation, onChangeRole, onChangeDepth }: {
  roles: Set<Role>
  depth: number
  operation: string
  onChangeRole: (role: Role, checked: boolean) => void
  onChangeDepth: (depth: number) => void
}) {
  return (
    <aside className="dsh-docgraph-rail" aria-label="关系范围">
      <div className="dsh-docgraph-rail-group" role="group" aria-label="关系范围">
        {ROLE_OPTIONS.map(({ role, label }) => (
          <label key={role} className="dsh-docgraph-check">
            <input
              type="checkbox"
              checked={roles.has(role)}
              onChange={(e) => onChangeRole(role, e.target.checked)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {operation !== 'trace' ? (
        <div className="dsh-docgraph-rail-group" role="group" aria-label="影响深度">
          <span className="dsh-docgraph-rail-label">影响深度</span>
          {[1, 2, 3].map((d) => (
            <button
              key={d}
              type="button"
              className={`dsh-docgraph-depth${d === depth ? ' on' : ''}`}
              aria-pressed={d === depth}
              onClick={() => onChangeDepth(d)}
            >
              {d}
            </button>
          ))}
        </div>
      ) : null}
      <p className="dsh-docgraph-rail-foot">筛选控制传递节点的可见范围</p>
    </aside>
  )
}
