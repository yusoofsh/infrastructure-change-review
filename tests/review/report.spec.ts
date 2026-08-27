import { describe, expect, it } from 'vitest'
import { buildReviewReport } from '../../src/review/report'
import {
  createEmptySession,
  type DecisionStatus,
  loadBundledReview,
  recordDecision,
} from '../../src/review/session'

describe('review report', () => {
  it('serializes a deterministic simulation report without secrets or apply', () => {
    const loaded = loadBundledReview()
    const accepted = recordDecision(loaded, 'restrict-database-to-application-cidr', 'accepted')
    if (accepted.status !== 'loaded') {
      throw new Error('Expected a loaded session')
    }
    const report = buildReviewReport(accepted)
    expect(report.productLabel).toBe('Infrastructure Change Review')
    expect(report.simulation).toBe(true)
    expect(report.applyPath).toBe(false)
    expect(report.outcome).toBe('blocked')
    expect(report.originalFindings).toContain('AWS001_PUBLIC_DATABASE_PORT')
    expect(report.remainingFindings).not.toContain('AWS001_PUBLIC_DATABASE_PORT')
    expect(report.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          optionId: 'restrict-database-to-application-cidr',
          status: 'accepted',
        }),
      ]),
    )
    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain('SYNTHETIC_VALUE')
    expect(serialized).not.toContain('SYNTHETIC_BEFORE_VALUE')
    expect(serialized).not.toContain('<img')
    expect(serialized).not.toMatch(/ready to apply/i)
  })

  it('ignores injected decision ids and statuses', () => {
    const loaded = loadBundledReview()
    expect(recordDecision(loaded, '<img src=x onerror=alert(1)>', 'accepted')).toBe(loaded)
    expect(
      recordDecision(
        loaded,
        'restrict-database-to-application-cidr',
        'accepted<img onerror=alert(1)>' as DecisionStatus,
      ),
    ).toBe(loaded)
    expect(
      recordDecision(createEmptySession(), 'restrict-database-to-application-cidr', 'accepted'),
    ).toEqual(createEmptySession())
  })
})
