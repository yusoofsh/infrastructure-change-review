import { executeReviewTool, isReviewToolName } from './catalog'
import type { ReviewStore } from './store'
import type { ReviewToolName, ToolResult } from './types'

export function invokeReviewTool(
  store: ReviewStore,
  name: ReviewToolName,
  input: unknown = {},
): ToolResult {
  if (!isReviewToolName(name)) {
    throw new Error('Unknown review tool')
  }
  const execution = executeReviewTool(name, input, store.getSession())
  store.setSession(execution.session)
  const event = {
    tool: name,
    outcome: execution.result.ok ? ('ok' as const) : ('error' as const),
    summary: execution.summary,
    at: new Date().toISOString(),
  }
  if (execution.result.ok) {
    store.recordAudit(event)
  } else {
    store.recordAudit({
      ...event,
      code: execution.result.error.code,
    })
  }
  return execution.result
}
