import type { WebMcpErrorCode } from './types'

const auditSummaries: Record<WebMcpErrorCode, string> = {
  PLAN_NOT_LOADED: 'Plan is not loaded',
  FINDING_NOT_FOUND: 'Finding was not found',
  RESOURCE_NOT_FOUND: 'Resource was not found',
  INVALID_TOOL_INPUT: 'Tool input is invalid',
}

export class WebMcpError extends Error {
  readonly code: WebMcpErrorCode
  readonly auditSummary: string

  constructor(code: WebMcpErrorCode, message: string) {
    super(message)
    this.name = 'WebMcpError'
    this.code = code
    this.auditSummary = auditSummaries[code]
  }
}
