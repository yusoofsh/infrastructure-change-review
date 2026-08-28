import { describe, expect, it } from 'vitest'
import { simulateOverlay } from '../../src/review/overlay'
import {
  type LoadedReviewSession,
  loadBundledReview,
  recordDecision,
} from '../../src/review/session'

function accept(session: LoadedReviewSession, optionId: string): LoadedReviewSession {
  const next = recordDecision(session, optionId, 'accepted')
  if (next.status !== 'loaded') {
    throw new Error('Expected a loaded session')
  }
  return next
}

function acceptAll(session: LoadedReviewSession): LoadedReviewSession {
  return session.snapshot.options.reduce((current, option) => accept(current, option.id), session)
}

describe('simulation overlay', () => {
  it('stays blocked when no mitigations are accepted', () => {
    const overlay = simulateOverlay(loadBundledReview())
    expect(overlay.outcome).toBe('blocked')
    expect(overlay.applyPath).toBe(false)
    expect(overlay.remainingFindings.map(({ ruleId }) => ruleId)).toEqual([
      'TF001_STATEFUL_REPLACEMENT',
      'TF002_UNSAFE_DB_DELETION',
      'AWS001_PUBLIC_DATABASE_PORT',
      'AWS002_PUBLIC_S3_ACCESS',
      'REL001_CAPACITY_REDUCTION',
      'COST001_SIZE_CLASS_JUMP',
      'BLAST001_CRITICAL_TRANSITIVE_IMPACT',
    ])
  })

  it('clears the public-database finding when that mitigation is accepted', () => {
    const overlay = simulateOverlay(
      accept(loadBundledReview(), 'restrict-database-to-application-cidr'),
    )
    expect(overlay.remainingFindings.map(({ ruleId }) => ruleId)).not.toContain(
      'AWS001_PUBLIC_DATABASE_PORT',
    )
    expect(overlay.outcome).toBe('blocked')
    expect(overlay.applyPath).toBe(false)
  })

  it('needs review when only non-blocker findings remain', () => {
    let session = loadBundledReview()
    for (const optionId of [
      'cancel-rds-replacement-and-stage-migration',
      'enable-rds-deletion-safeguards',
      'restrict-database-to-application-cidr',
      'restore-s3-public-access-controls',
      'preserve-api-minimum-capacity',
      'remove-destructive-blast-radius-root',
    ]) {
      session = accept(session, optionId)
    }
    const overlay = simulateOverlay(session)
    expect(overlay.remainingFindings.map(({ ruleId }) => ruleId)).toEqual([
      'COST001_SIZE_CLASS_JUMP',
    ])
    expect(overlay.outcome).toBe('needs_review')
    expect(overlay.applyPath).toBe(false)
  })

  it('can conclude ready for a new plan and never ready to apply', () => {
    const overlay = simulateOverlay(acceptAll(loadBundledReview()))
    expect(overlay.remainingFindings).toEqual([])
    expect(overlay.outcome).toBe('ready_for_new_plan')
    expect(overlay.applyPath).toBe(false)
    expect(
      overlay.plan.resources.find((resource) => resource.address === 'aws_db_instance.orders'),
    ).toMatchObject({ kind: 'no-op', destructive: false })
  })
})
