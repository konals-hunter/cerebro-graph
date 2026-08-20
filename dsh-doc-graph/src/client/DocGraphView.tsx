/**
 * Inline conversation view tab ("文档图谱"): renders the active graph
 * workspace, the latest index status, or a short onboarding hint. The tab
 * never asks the user to type commands: its buttons submit a natural-language
 * instruction to the current session, and the agent runs the matching
 * docgraph_* tool.
 */
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useSessionGraphState } from './DocGraphUIContext.js'
import { GraphWorkspace } from './drawer/graph/GraphWorkspace.js'
import { OverviewSection } from './drawer/OverviewSection.js'
import { DocListSection } from './drawer/DocListSection.js'

export function DocGraphView({ sessionId, inputActions }: PropsRuntime<'conversation.view'>) {
  const state = useSessionGraphState(sessionId)
  const payload = state.activePayload

  const askAgent = (text: string) => {
    if (!inputActions) return
    inputActions.setDraft(text)
    inputActions.submit()
  }

  if (payload?.kind === 'docgraph_graph') {
    return <GraphWorkspace sessionId={sessionId} />
  }

  if (payload?.kind === 'docgraph_index' || payload?.kind === 'docgraph_status') {
    const firstDoc = payload.docs[0]?.path
    return (
      <div className="dsh-docgraph-view-stack">
        <div className="dsh-docgraph-view-actions">
          <button
            type="button"
            className="dsh-docgraph-primary-btn"
            onClick={() => askAgent(
              firstDoc
                ? `请对文档 ${firstDoc} 运行 docgraph_graph(operation='impact', depth=1) 并在文档图谱面板中展示结果。`
                : '请运行 docgraph_graph 展开当前项目的文档图谱。',
            )}
          >
            加载图谱
          </button>
          <span className="dsh-docgraph-view-hint">按钮会替你把指令发给 agent，不用手输命令</span>
        </div>
        <OverviewSection summary={payload.summary} />
        <DocListSection docs={payload.docs} onFocus={() => undefined} />
      </div>
    )
  }

  return (
    <div className="dsh-docgraph-view-empty">
      <b>文档图谱</b>
      <p>当前项目还没有图谱数据。先初始化索引，索引完成后 agent 会自动展开图谱。</p>
      <button
        type="button"
        className="dsh-docgraph-primary-btn"
        onClick={() => askAgent('请初始化当前项目的文档图谱索引（docgraph_index），索引完成后运行 docgraph_graph 并展示图谱。')}
      >
        初始化文档图谱
      </button>
    </div>
  )
}