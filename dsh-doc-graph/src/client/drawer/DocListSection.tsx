import type { DocRecord } from '../../types.js'

export function DocListSection({ docs, onFocus }: { docs: DocRecord[]; onFocus: (id: string) => void }) {
  return (
    <section className="dsh-docgraph-section dsh-docgraph-doclist" aria-label="项目文档列表">
      <h2>项目文档</h2>
      <div className="dsh-docgraph-doclist-actions">
        <button type="button" disabled title="即将支持">＋ 添加文件</button>
        <button type="button" disabled title="请让模型执行 docgraph_index force">重建全部</button>
      </div>
      <div className="dsh-docgraph-doclist-rows">
        {docs.map((doc) => (
          <div
            key={doc.id}
            className="dsh-docgraph-doc-row"
            role="button"
            tabIndex={0}
            aria-label={`${doc.name} ${doc.path} 入引 ${doc.inbound}`}
            onClick={() => onFocus(doc.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onFocus(doc.id)
              }
            }}
          >
            <span className={`dsh-docgraph-fmt fmt-${doc.fmt}`}>{doc.fmt}</span>
            <b>{doc.name}</b>
            <code>{doc.path}</code>
            <span className={`dsh-docgraph-file-status st-${doc.status}`}>{doc.status}</span>
            <span className="dsh-docgraph-inbound">入引 {doc.inbound}</span>
            <span className="dsh-docgraph-doc-actions">
              <button type="button" disabled title="即将支持">重建</button>
              <button type="button" disabled title="即将支持">替换</button>
              <button type="button" disabled title="即将支持">重解析</button>
              <button type="button" disabled title="即将支持">移除</button>
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
