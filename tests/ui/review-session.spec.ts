import { describe, expect, it } from 'vitest'
import { REDACTED_VALUE, UNKNOWN_VALUE } from '../../src/domain/terraform/redact'
import {
  createEmptySession,
  loadBundledReview,
  selectFinding,
  selectResource,
} from '../../src/review/session'

describe('review session', () => {
  it('starts empty with no snapshot', () => {
    expect(createEmptySession()).toEqual({
      status: 'empty',
      selectedResourceAddress: null,
      selectedFindingId: null,
      snapshot: null,
    })
  })

  it('loads the bundled fixture into a redacted review snapshot', () => {
    const session = loadBundledReview()
    expect(session.status).toBe('loaded')
    expect(session.snapshot.plan.counts).toEqual({
      create: 0,
      update: 7,
      replace: 2,
      delete: 0,
      noOp: 3,
      read: 0,
    })
    expect(session.snapshot.findings.map(({ ruleId }) => ruleId)).toEqual([
      'TF001_STATEFUL_REPLACEMENT',
      'TF002_UNSAFE_DB_DELETION',
      'AWS001_PUBLIC_DATABASE_PORT',
      'AWS002_PUBLIC_S3_ACCESS',
      'REL001_CAPACITY_REDUCTION',
      'COST001_SIZE_CLASS_JUMP',
      'BLAST001_CRITICAL_TRANSITIVE_IMPACT',
    ])
    expect(session.decisions).toEqual({
      'cancel-rds-replacement-and-stage-migration': 'pending',
      'enable-rds-deletion-safeguards': 'pending',
      'restrict-database-to-application-cidr': 'pending',
      'restore-s3-public-access-controls': 'pending',
      'preserve-api-minimum-capacity': 'pending',
      'use-approved-worker-size': 'pending',
      'remove-destructive-blast-radius-root': 'pending',
    })
    expect(session.resetPending).toBe(false)
    expect(session.snapshot.options.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        'cancel-rds-replacement-and-stage-migration',
        'enable-rds-deletion-safeguards',
        'restrict-database-to-application-cidr',
        'restore-s3-public-access-controls',
        'preserve-api-minimum-capacity',
        'use-approved-worker-size',
        'remove-destructive-blast-radius-root',
      ]),
    )
    const serialized = JSON.stringify(session.snapshot)
    expect(serialized).toContain(REDACTED_VALUE)
    expect(serialized).toContain(UNKNOWN_VALUE)
    expect(serialized).not.toContain('SYNTHETIC_BEFORE_VALUE')
    expect(serialized).not.toContain('SYNTHETIC_AFTER_VALUE')
    expect(serialized).not.toContain('SYNTHETIC_VALUE')
  })

  it('selects a finding and focuses its first resource', () => {
    const loaded = loadBundledReview()
    const publicDatabase = loaded.snapshot.findings.find(
      ({ ruleId }) => ruleId === 'AWS001_PUBLIC_DATABASE_PORT',
    )
    expect(publicDatabase).toBeDefined()
    if (!publicDatabase) {
      return
    }
    const next = selectFinding(loaded, publicDatabase.id)
    expect(next.status).toBe('loaded')
    if (next.status !== 'loaded') {
      return
    }
    expect(next.selectedFindingId).toBe(publicDatabase.id)
    expect(next.selectedResourceAddress).toBe('aws_security_group_rule.database_ingress')
  })

  it('ignores unknown resources and empty-session selections', () => {
    expect(selectResource(createEmptySession(), 'aws_db_instance.orders')).toEqual(
      createEmptySession(),
    )
    const loaded = loadBundledReview()
    expect(selectResource(loaded, 'aws_instance.missing')).toEqual(loaded)
    expect(selectFinding(loaded, 'finding-not-real')).toEqual(loaded)
  })
})
