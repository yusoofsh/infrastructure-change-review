import { describe, expect, it } from 'vitest'
import { REDACTED_VALUE } from '../../src/domain/terraform/redact'
import { createEmptySession, loadBundledReview, type ReviewSession } from '../../src/review/session'
import { executeReviewTool, REVIEW_TOOL_NAMES, reviewToolMetadata } from '../../src/webmcp/catalog'
import { invokeReviewTool } from '../../src/webmcp/invoke'
import type { AuditEvent, ReviewStore } from '../../src/webmcp/store'

function createStore(): {
  store: ReviewStore
  events: AuditEvent[]
} {
  let session: ReviewSession = createEmptySession()
  const events: AuditEvent[] = []
  return {
    events,
    store: {
      getSession: () => session,
      setSession: (next) => {
        session = next
      },
      recordAudit: (event) => {
        events.push({ ...event, id: `audit-${events.length + 1}` })
      },
    },
  }
}

function expectOk<T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T {
  expect(result.ok).toBe(true)
  if (!result.ok) {
    throw new Error('Expected a successful tool result')
  }
  return result.data
}

function expectError(
  result: { ok: true; data: unknown } | { ok: false; error: { code: string; message: string } },
  code: string,
) {
  expect(result.ok).toBe(false)
  if (result.ok) {
    throw new Error('Expected a failed tool result')
  }
  expect(result.error.code).toBe(code)
  expect(result.error.message.length).toBeGreaterThan(0)
}

describe('review tool catalog', () => {
  it('exposes a focused catalog with static schemas and annotations', () => {
    expect(REVIEW_TOOL_NAMES).toEqual([
      'load_synthetic_plan',
      'get_review_summary',
      'list_findings',
      'select_finding',
      'inspect_resource',
      'list_dependencies',
      'list_mitigation_options',
    ])
    expect(reviewToolMetadata.map(({ name }) => name)).toEqual(REVIEW_TOOL_NAMES)

    for (const tool of reviewToolMetadata) {
      expect(tool.description.length).toBeGreaterThan(12)
      expect(tool.title.length).toBeGreaterThan(4)
      expect(tool.inputSchema.type).toBe('object')
      expect(tool.annotations.readOnlyHint).toBeTypeOf('boolean')
      expect(tool.annotations.untrustedContentHint).toBeTypeOf('boolean')
    }

    const serialized = JSON.stringify(reviewToolMetadata)
    expect(serialized).not.toContain('SYSTEM OVERRIDE')
    expect(serialized).not.toContain('attacker.invalid')
    expect(serialized).not.toContain('SYNTHETIC_VALUE')
  })

  it('marks read tools as read-only and mutation tools as not', () => {
    const hints = Object.fromEntries(
      reviewToolMetadata.map((tool) => [tool.name, tool.annotations.readOnlyHint]),
    )
    expect(hints).toEqual({
      load_synthetic_plan: false,
      get_review_summary: true,
      list_findings: true,
      select_finding: false,
      inspect_resource: false,
      list_dependencies: true,
      list_mitigation_options: true,
    })
  })

  it('requires a loaded plan before read or inspect tools run', () => {
    const empty = createEmptySession()
    for (const name of [
      'get_review_summary',
      'list_findings',
      'select_finding',
      'inspect_resource',
      'list_dependencies',
      'list_mitigation_options',
    ] as const) {
      const input =
        name === 'select_finding'
          ? { findingId: 'finding-TF001_STATEFUL_REPLACEMENT' }
          : name === 'inspect_resource'
            ? { address: 'aws_db_instance.orders' }
            : {}
      const execution = executeReviewTool(name, input, empty)
      expectError(execution.result, 'PLAN_NOT_LOADED')
      expect(execution.session).toBe(empty)
    }
  })

  it('loads the bundled plan with the same snapshot the manual workspace uses', () => {
    const execution = executeReviewTool('load_synthetic_plan', {}, createEmptySession())
    const data = expectOk(execution.result) as {
      counts: { update: number; replace: number; noOp: number }
      findingCount: number
      selectedFindingId: string | null
    }
    const manual = loadBundledReview()
    expect(execution.session.status).toBe('loaded')
    expect(data.counts).toEqual(manual.snapshot.plan.counts)
    expect(data.findingCount).toBe(7)
    expect(data.selectedFindingId).toBe(manual.selectedFindingId)
    expect(execution.session).toEqual(manual)
  })

  it('lists findings, dependencies, and mitigation options from the loaded session', () => {
    const loaded = loadBundledReview()
    const findings = expectOk(executeReviewTool('list_findings', {}, loaded).result) as {
      findings: Array<{ id: string; ruleId: string }>
    }
    expect(findings.findings.map(({ ruleId }) => ruleId)).toEqual([
      'TF001_STATEFUL_REPLACEMENT',
      'TF002_UNSAFE_DB_DELETION',
      'AWS001_PUBLIC_DATABASE_PORT',
      'AWS002_PUBLIC_S3_ACCESS',
      'REL001_CAPACITY_REDUCTION',
      'COST001_SIZE_CLASS_JUMP',
      'BLAST001_CRITICAL_TRANSITIVE_IMPACT',
    ])

    const dependencies = expectOk(executeReviewTool('list_dependencies', {}, loaded).result) as {
      edges: unknown[]
    }
    expect(dependencies.edges).toHaveLength(6)

    const options = expectOk(executeReviewTool('list_mitigation_options', {}, loaded).result) as {
      options: Array<{ id: string }>
    }
    expect(options.options.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        'cancel-rds-replacement-and-stage-migration',
        'restrict-database-to-application-cidr',
        'use-approved-worker-size',
      ]),
    )
  })

  it('selects a finding and inspects a redacted resource for UI synchronization', () => {
    const loaded = loadBundledReview()
    const selected = executeReviewTool(
      'select_finding',
      { findingId: 'finding-AWS001_PUBLIC_DATABASE_PORT' },
      loaded,
    )
    const selectedData = expectOk(selected.result) as {
      selectedFindingId: string
      selectedResourceAddress: string | null
    }
    expect(selectedData.selectedFindingId).toBe('finding-AWS001_PUBLIC_DATABASE_PORT')
    expect(selectedData.selectedResourceAddress).toBe('aws_security_group_rule.database_ingress')
    expect(selected.session.status).toBe('loaded')
    if (selected.session.status !== 'loaded') {
      return
    }
    expect(selected.session.selectedFindingId).toBe('finding-AWS001_PUBLIC_DATABASE_PORT')

    const inspected = executeReviewTool(
      'inspect_resource',
      { address: 'aws_secretsmanager_secret_version.database_url' },
      selected.session,
    )
    const resource = expectOk(inspected.result) as { address: string; after: unknown }
    expect(resource.address).toBe('aws_secretsmanager_secret_version.database_url')
    expect(JSON.stringify(resource)).toContain(REDACTED_VALUE)
    expect(JSON.stringify(resource)).not.toContain('SYNTHETIC_BEFORE_VALUE')
    expect(JSON.stringify(resource)).not.toContain('SYNTHETIC_VALUE')
    expect(inspected.session.status).toBe('loaded')
    if (inspected.session.status !== 'loaded') {
      return
    }
    expect(inspected.session.selectedResourceAddress).toBe(
      'aws_secretsmanager_secret_version.database_url',
    )
  })

  it('rejects unknown findings, unknown resources, and invalid input without echoing untrusted text', () => {
    const loaded = loadBundledReview()
    const missingFinding = executeReviewTool(
      'select_finding',
      { findingId: 'finding-not-real' },
      loaded,
    )
    expectError(missingFinding.result, 'FINDING_NOT_FOUND')
    expect(missingFinding.session).toBe(loaded)
    expect(JSON.stringify(missingFinding.result)).not.toContain('finding-not-real')

    const attacker = executeReviewTool('inspect_resource', { address: 'attacker.invalid' }, loaded)
    expectError(attacker.result, 'RESOURCE_NOT_FOUND')
    expect(attacker.session).toBe(loaded)
    expect(JSON.stringify(attacker.result)).not.toContain('attacker.invalid')
    expect(JSON.stringify(attacker.result)).not.toContain('SYSTEM OVERRIDE')

    const invalid = executeReviewTool('select_finding', { findingId: 12 }, loaded)
    expectError(invalid.result, 'INVALID_TOOL_INPUT')
  })

  it('records audit events without secrets or injection payloads', () => {
    const { store, events } = createStore()
    invokeReviewTool(store, 'load_synthetic_plan', {})
    invokeReviewTool(store, 'inspect_resource', {
      address: 'aws_secretsmanager_secret_version.database_url',
    })
    invokeReviewTool(store, 'inspect_resource', { address: 'attacker.invalid' })
    invokeReviewTool(store, 'inspect_resource', { address: 'aws_instance.worker' })

    expect(events.map(({ tool, outcome }) => `${tool}:${outcome}`)).toEqual([
      'load_synthetic_plan:ok',
      'inspect_resource:ok',
      'inspect_resource:error',
      'inspect_resource:ok',
    ])
    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain('SYNTHETIC_VALUE')
    expect(serialized).not.toContain('SYNTHETIC_BEFORE_VALUE')
    expect(serialized).not.toContain('attacker.invalid')
    expect(serialized).not.toContain('SYSTEM OVERRIDE')
    expect(events[2]?.code).toBe('RESOURCE_NOT_FOUND')
  })
})
