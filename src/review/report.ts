import type { ChangeCounts } from '../domain/terraform/normalize'
import type { OverlayOutcome } from './overlay'
import { simulateOverlay } from './overlay'
import type { DecisionStatus, LoadedReviewSession } from './session'

export const REPORT_FILENAME = 'infrastructure-change-review.json'

export interface ReviewReportDecision {
  optionId: string
  findingId: string
  title: string
  status: DecisionStatus
}

export interface ReviewReport {
  productLabel: 'Infrastructure Change Review'
  simulation: true
  applyPath: false
  outcome: OverlayOutcome
  originalCounts: ChangeCounts
  overlayCounts: ChangeCounts
  originalFindings: string[]
  remainingFindings: string[]
  decisions: ReviewReportDecision[]
}

export function buildReviewReport(session: LoadedReviewSession): ReviewReport {
  const overlay = simulateOverlay(session)
  return {
    productLabel: 'Infrastructure Change Review',
    simulation: true,
    applyPath: false,
    outcome: overlay.outcome,
    originalCounts: session.snapshot.plan.counts,
    overlayCounts: overlay.plan.counts,
    originalFindings: session.snapshot.findings.map(({ ruleId }) => ruleId),
    remainingFindings: overlay.remainingFindings.map(({ ruleId }) => ruleId),
    decisions: session.snapshot.options.map((option) => ({
      optionId: option.id,
      findingId: option.findingId,
      title: option.title,
      status: session.decisions[option.id] ?? 'pending',
    })),
  }
}

export function downloadReviewReport(session: LoadedReviewSession): void {
  const blob = new Blob([JSON.stringify(buildReviewReport(session), null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = REPORT_FILENAME
  anchor.rel = 'noopener'
  anchor.click()
  URL.revokeObjectURL(url)
}
