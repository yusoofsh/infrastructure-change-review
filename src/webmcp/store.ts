import type { ReviewSession } from '../review/session'

export interface AuditEvent {
  id: string
  tool: string
  outcome: 'ok' | 'error'
  summary: string
  at: string
  code?: string
}

export interface ReviewStore {
  getSession(): ReviewSession
  setSession(session: ReviewSession): void
  recordAudit(event: Omit<AuditEvent, 'id'>): void
}
