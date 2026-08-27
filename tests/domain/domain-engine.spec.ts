import { describe, expect, it } from 'vitest'
import { traceBlastRadius } from '../../src/domain/graph/blast-radius'
import {
  listMitigationOptions,
  resolveMitigationOption,
} from '../../src/domain/recommendations/catalog'
import { analyzeRisks } from '../../src/domain/risks/analyze'
import type { Finding } from '../../src/domain/risks/types'
import { classifyActions } from '../../src/domain/terraform/actions'
import {
  type ChangeCounts,
  type NormalizedPlan,
  normalizeTerraformPlan,
} from '../../src/domain/terraform/normalize'
import {
  REDACTED_VALUE,
  redactChangeValues,
  UNKNOWN_VALUE,
} from '../../src/domain/terraform/redact'
import { type DependencyEdge, extractDependencyEdges } from '../../src/domain/terraform/references'
import type { TerraformPlan } from '../../src/domain/terraform/schema'
import { loadFixturePair } from '../helpers/fixtures'

const expectedEdges: DependencyEdge[] = [
  {
    dependency: 'aws_db_instance.orders',
    dependent: 'aws_secretsmanager_secret_version.database_url',
    evidence: 'expression_reference',
  },
  {
    dependency: 'aws_secretsmanager_secret_version.database_url',
    dependent: 'aws_ecs_task_definition.api',
    evidence: 'expression_reference',
  },
  {
    dependency: 'aws_ecs_task_definition.api',
    dependent: 'aws_ecs_service.checkout',
    evidence: 'expression_reference',
  },
  {
    dependency: 'aws_ecs_service.checkout',
    dependent: 'aws_lb_target_group.checkout',
    evidence: 'expression_reference',
  },
  {
    dependency: 'aws_ecs_service.checkout',
    dependent: 'aws_cloudwatch_metric_alarm.checkout_errors',
    evidence: 'expression_reference',
  },
  {
    dependency: 'aws_ecs_service.checkout',
    dependent: 'aws_route53_record.checkout',
    evidence: 'expression_reference',
  },
]

const fixtureKinds = {
  'no-op': { kind: 'no-op', destructive: false },
  create: { kind: 'create', destructive: false },
  read: { kind: 'read', destructive: false },
  update: { kind: 'update', destructive: false },
  delete: { kind: 'delete', destructive: true },
  'delete,create': { kind: 'replace', destructive: true },
  'create,delete': { kind: 'replace', destructive: true },
} as const

const lockedCounts: ChangeCounts = {
  create: 0,
  update: 7,
  replace: 2,
  delete: 0,
  noOp: 3,
  read: 0,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function seedSafeRiskValues(resource: TerraformPlan['resource_changes'][number]) {
  const before = structuredClone(resource.change.before)
  const after = structuredClone(resource.change.after)

  if (resource.address === 'aws_db_instance.orders') {
    if (isRecord(before)) {
      before.password = REDACTED_VALUE
    }
    if (isRecord(after)) {
      after.password = REDACTED_VALUE
    }
  }
  if (resource.address === 'aws_secretsmanager_secret_version.database_url') {
    if (isRecord(before)) {
      before.secret_string = REDACTED_VALUE
    }
    if (isRecord(after)) {
      after.secret_string = REDACTED_VALUE
      after.version_id = UNKNOWN_VALUE
    }
  }

  return { before, after }
}

function buildRiskInput(plan: TerraformPlan): NormalizedPlan {
  return {
    formatVersion: plan.format_version,
    terraformVersion: plan.terraform_version,
    counts: lockedCounts,
    resources: plan.resource_changes.map((resource) => {
      const actionKey = resource.change.actions.join(',') as keyof typeof fixtureKinds
      const classification = fixtureKinds[actionKey]
      if (!classification) {
        throw new Error('Synthetic fixture contains an unsupported action combination')
      }
      // This seeds the risk-rule boundary with already-sanitized domain data so
      // the risk specification remains independent from the redaction boundary.
      const values = seedSafeRiskValues(resource)
      return {
        address: resource.address,
        type: resource.type,
        name: resource.name,
        ...classification,
        before: values.before,
        after: values.after,
      }
    }),
  }
}

const findingSeeds = [
  ['TF001_STATEFUL_REPLACEMENT', 'destructive', 'blocker'],
  ['TF002_UNSAFE_DB_DELETION', 'destructive', 'high'],
  ['AWS001_PUBLIC_DATABASE_PORT', 'security', 'blocker'],
  ['AWS002_PUBLIC_S3_ACCESS', 'security', 'blocker'],
  ['REL001_CAPACITY_REDUCTION', 'reliability', 'high'],
  ['COST001_SIZE_CLASS_JUMP', 'cost', 'medium'],
  ['BLAST001_CRITICAL_TRANSITIVE_IMPACT', 'blast_radius', 'high'],
].map(([ruleId, category, severity]) => ({
  id: `finding-${ruleId}`,
  ruleId,
  category,
  severity,
  title: ruleId,
  resourceAddresses: [],
  mitigationOptionIds: [],
})) as Finding[]

describe('domain engine red specifications', () => {
  it('classifies every P0 action combination without double-counting replacements', () => {
    expect(classifyActions(['no-op'])).toEqual({ kind: 'no-op', destructive: false })
    expect(classifyActions(['create'])).toEqual({ kind: 'create', destructive: false })
    expect(classifyActions(['read'])).toEqual({ kind: 'read', destructive: false })
    expect(classifyActions(['update'])).toEqual({ kind: 'update', destructive: false })
    expect(classifyActions(['delete'])).toEqual({ kind: 'delete', destructive: true })
    expect(classifyActions(['delete', 'create'])).toEqual({
      kind: 'replace',
      destructive: true,
      replacementOrder: 'destroy-first',
    })
    expect(classifyActions(['create', 'delete'])).toEqual({
      kind: 'replace',
      destructive: true,
      replacementOrder: 'create-first',
    })
  })

  it('normalizes the fixture to the locked exclusive change counts', async () => {
    const { plan } = await loadFixturePair()
    const normalized = normalizeTerraformPlan(plan)

    expect(normalized.counts).toEqual(lockedCounts)
    const serialized = JSON.stringify(normalized)
    expect(serialized).not.toContain('SYNTHETIC_BEFORE_VALUE')
    expect(serialized).not.toContain('SYNTHETIC_AFTER_VALUE')
    expect(serialized).not.toContain('SYNTHETIC_VALUE')
    expect(serialized).toContain(REDACTED_VALUE)
    expect(serialized).toContain(UNKNOWN_VALUE)
  })

  it('redacts sensitive values before rendering unknown values', async () => {
    const { plan } = await loadFixturePair()
    const secret = plan.resource_changes.find(
      ({ address }) => address === 'aws_secretsmanager_secret_version.database_url',
    )
    expect(secret).toBeDefined()
    if (!secret) {
      return
    }

    const original = structuredClone(secret)
    const redacted = redactChangeValues(secret)
    expect(redacted).toMatchObject({
      before: { secret_string: REDACTED_VALUE },
      after: { secret_string: REDACTED_VALUE, version_id: UNKNOWN_VALUE },
    })
    expect(JSON.stringify(redacted)).not.toContain('SYNTHETIC_VALUE')
    expect(secret).toEqual(original)

    const nested = structuredClone(secret)
    nested.change.before = {
      credentials: { password: 'SYNTHETIC_NESTED_BEFORE' },
      tokens: ['SYNTHETIC_ARRAY_SECRET', 'visible-before'],
    }
    nested.change.after = {
      credentials: { password: 'SYNTHETIC_NESTED_AFTER' },
      tokens: ['SYNTHETIC_ARRAY_SECRET', 'unknown-after'],
    }
    nested.change.before_sensitive = {
      credentials: true,
      tokens: [true, false],
    }
    nested.change.after_sensitive = {
      credentials: { password: true },
      tokens: [true, false],
    }
    nested.change.after_unknown = {
      credentials: { password: true },
      tokens: [true, true],
    }
    const nestedOriginal = structuredClone(nested)

    expect(redactChangeValues(nested)).toEqual({
      before: {
        credentials: REDACTED_VALUE,
        tokens: [REDACTED_VALUE, 'visible-before'],
      },
      after: {
        credentials: { password: REDACTED_VALUE },
        tokens: [REDACTED_VALUE, UNKNOWN_VALUE],
      },
    })
    expect(nested).toEqual(nestedOriginal)
  })

  it('extracts exactly six dependency-to-dependent edges without duplicates', async () => {
    const { plan } = await loadFixturePair()
    const edges = extractDependencyEdges(plan)

    expect(edges.map(({ dependency, dependent }) => `${dependency}->${dependent}`).sort()).toEqual(
      expectedEdges.map(({ dependency, dependent }) => `${dependency}->${dependent}`).sort(),
    )
  })

  it('traces the RDS replacement to one direct and five indirect dependents', async () => {
    const { policy } = await loadFixturePair()
    const blastRadius = traceBlastRadius('aws_db_instance.orders', expectedEdges, policy, true)

    expect(blastRadius.directDependents).toEqual(['aws_secretsmanager_secret_version.database_url'])
    expect(blastRadius.indirectDependents).toHaveLength(5)
    expect(blastRadius.criticalDependents).toEqual(
      expect.arrayContaining([
        'aws_secretsmanager_secret_version.database_url',
        'aws_ecs_service.checkout',
      ]),
    )
    expect(blastRadius).toMatchObject({ score: 16, band: 'critical' })
  })

  it('emits the locked seven deterministic findings and severities', async () => {
    const { plan, policy } = await loadFixturePair()
    const findings = analyzeRisks(buildRiskInput(plan), policy, expectedEdges)

    expect(findings.map(({ ruleId, severity }) => [ruleId, severity])).toEqual([
      ['TF001_STATEFUL_REPLACEMENT', 'blocker'],
      ['TF002_UNSAFE_DB_DELETION', 'high'],
      ['AWS001_PUBLIC_DATABASE_PORT', 'blocker'],
      ['AWS002_PUBLIC_S3_ACCESS', 'blocker'],
      ['REL001_CAPACITY_REDUCTION', 'high'],
      ['COST001_SIZE_CLASS_JUMP', 'medium'],
      ['BLAST001_CRITICAL_TRANSITIVE_IMPACT', 'high'],
    ])
    const serialized = JSON.stringify(findings)
    expect(serialized).not.toContain('SYNTHETIC_BEFORE_VALUE')
    expect(serialized).not.toContain('SYNTHETIC_AFTER_VALUE')
    expect(serialized).not.toContain('SYNTHETIC_VALUE')
    expect(serialized).not.toContain('SYSTEM OVERRIDE')
    expect(serialized).not.toContain('attacker.invalid')
  })

  it('exposes only deterministic mitigation IDs and rejects arbitrary options', () => {
    const options = listMitigationOptions(findingSeeds)

    expect(options.map(({ id }) => id)).toEqual(
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
    expect(() =>
      resolveMitigationOption(findingSeeds[0]?.id ?? '', 'run-arbitrary-patch'),
    ).toThrow()
  })
})
