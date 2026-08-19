/**
 * §7.4 toolview router: register this one component under all nine
 * docgraph_* toolview keys. Routing is by exact `payload.kind` — never by
 * substring matching on `drift`.
 */
import { useEffect } from 'react'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { useDocGraphUI } from '../DocGraphUIContext.js'
import { isDocGraphPayload, type DocGraphPayload } from '../../types.js'
import { IndexStatusCard } from './IndexStatusCard.js'
import { DriftAuditCard } from './DriftAuditCard.js'
import { ContextCard } from './ContextCard.js'
import { GraphCard } from './GraphCard.js'

type CardProps = ToolCallViewProps & { sessionId?: string }

type LooseBlock = {
  kind?: unknown
  isError?: boolean
  content?: readonly { type: string; text?: string }[]
  meta?: unknown
}

function payloadFromBlock(block: unknown): DocGraphPayload | null {
  if (typeof block !== 'object' || block === null) return null
  const b = block as LooseBlock
  if (!('kind' in b) || b.isError) return null
  const meta = b.meta as { kind?: unknown; payload?: unknown } | undefined
  if (!meta || typeof meta !== 'object') return null
  return isDocGraphPayload(meta.payload) ? meta.payload : null
}

function firstResultLine(content: readonly { type: string; text?: string }[] | undefined): string {
  for (const block of content ?? []) {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
      const newline = block.text.indexOf('\n')
      return newline === -1 ? block.text : block.text.slice(0, newline)
    }
  }
  return 'docgraph'
}

export function ToolviewCard(props: CardProps) {
  const sessionId = props.sessionId ?? 'default'
  const ui = useDocGraphUI()
  const payload = payloadFromBlock(props.block)

  useEffect(() => {
    if (payload) ui.setPayload(sessionId, payload)
  }, [sessionId, payload, ui])

  if (!payload) {
    const b = props.block as LooseBlock
    if (b && 'kind' in b && b.isError) {
      return <div className="dsh-docgraph-card dsh-docgraph-error">{firstResultLine(b.content)}</div>
    }
    return <div className="dsh-docgraph-card dsh-docgraph-error">docgraph · rendering…</div>
  }

  switch (payload.kind) {
    case 'docgraph_index':
    case 'docgraph_status':
      return <IndexStatusCard payload={payload} />
    case 'docgraph_drift':
      return <DriftAuditCard payload={payload} />
    case 'docgraph_graph':
      return <GraphCard payload={payload} sessionId={sessionId} />
    case 'docgraph_context':
    case 'docgraph_files':
      return <ContextCard payload={payload} />
  }
}
