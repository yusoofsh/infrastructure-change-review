import { traceBlastRadius } from '../graph/blast-radius'
import { listMitigationOptions } from '../recommendations/catalog'
import type { NormalizedPlan } from '../terraform/normalize'
import type { ReviewPolicy } from '../terraform/policy-schema'
import type { DependencyEdge } from '../terraform/references'
import type { Finding, RiskCategory, Severity } from './types'

interface RiskContext {
  plan: NormalizedPlan
  policy: ReviewPolicy
  edges: readonly DependencyEdge[]
}

interface RiskRule {
  id: string
  category: RiskCategory
  severity: Severity
  detect: (context: RiskContext) => string[]
}

const publicAccessBlockAttributes = [
  'block_public_acls',
  'block_public_policy',
  'ignore_public_acls',
  'restrict_public_buckets',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function unique(addresses: string[]): string[] {
  return [...new Set(addresses)]
}

function detectStatefulReplacements({ plan, policy }: RiskContext): string[] {
  return plan.resources
    .filter(
      (resource) =>
        resource.kind === 'replace' && policy.resources[resource.address]?.stateful === true,
    )
    .map(({ address }) => address)
}

function detectUnsafeDatabaseDeletion({ plan, policy }: RiskContext): string[] {
  return plan.resources
    .filter((resource) => {
      if (
        !resource.destructive ||
        (resource.type !== 'aws_db_instance' &&
          policy.resources[resource.address]?.stateful !== true)
      ) {
        return false
      }
      const values = resource.kind === 'delete' ? resource.before : resource.after
      return (
        isRecord(values) &&
        (values.deletion_protection === false || values.skip_final_snapshot === true)
      )
    })
    .map(({ address }) => address)
}

function detectPublicDatabasePorts({ plan, policy }: RiskContext): string[] {
  return plan.resources
    .filter(({ after }) => {
      if (
        !isRecord(after) ||
        after.type !== 'ingress' ||
        typeof after.from_port !== 'number' ||
        typeof after.to_port !== 'number' ||
        !Array.isArray(after.cidr_blocks)
      ) {
        return false
      }
      const fromPort = after.from_port
      const toPort = after.to_port
      const cidrBlocks = after.cidr_blocks
      const exposesDatabasePort = policy.network.database_ports.some(
        (port) => fromPort <= port && port <= toPort,
      )
      const exposesWorld = cidrBlocks.some(
        (cidr) => typeof cidr === 'string' && policy.network.world_cidrs.includes(cidr),
      )
      return exposesDatabasePort && exposesWorld
    })
    .map(({ address }) => address)
}

function grantsEveryone(principal: unknown): boolean {
  if (principal === '*') {
    return true
  }
  if (Array.isArray(principal)) {
    return principal.some(grantsEveryone)
  }
  return isRecord(principal) && Object.values(principal).some(grantsEveryone)
}

function hasPublicPolicy(policyJson: unknown): boolean {
  if (typeof policyJson !== 'string') {
    return false
  }
  try {
    const policy: unknown = JSON.parse(policyJson)
    if (!isRecord(policy)) {
      return false
    }
    const statements = Array.isArray(policy.Statement) ? policy.Statement : [policy.Statement]
    return statements.some(
      (statement) =>
        isRecord(statement) && statement.Effect === 'Allow' && grantsEveryone(statement.Principal),
    )
  } catch {
    return false
  }
}

function detectPublicS3Access({ plan }: RiskContext): string[] {
  return plan.resources
    .filter((resource) => {
      if (!isRecord(resource.after)) {
        return false
      }
      const after = resource.after
      if (resource.type === 'aws_s3_bucket_public_access_block') {
        return publicAccessBlockAttributes.some((attribute) => after[attribute] === false)
      }
      return resource.type === 'aws_s3_bucket_policy' && hasPublicPolicy(after.policy)
    })
    .map(({ address }) => address)
}

function detectCapacityReduction({ plan, policy }: RiskContext): string[] {
  return plan.resources
    .filter((resource) => {
      if (!isRecord(resource.before) || !isRecord(resource.after)) {
        return false
      }
      const before = resource.before.desired_count
      const after = resource.after.desired_count
      const minimum = policy.capacity.minimum_desired_count_by_address[resource.address]
      return (
        typeof before === 'number' &&
        typeof after === 'number' &&
        minimum !== undefined &&
        after < before &&
        after < minimum
      )
    })
    .map(({ address }) => address)
}

function detectSizeClassJump({ plan, policy }: RiskContext): string[] {
  return plan.resources
    .filter((resource) => {
      if (!isRecord(resource.before) || !isRecord(resource.after)) {
        return false
      }
      const beforeType = resource.before.instance_type
      const afterType = resource.after.instance_type
      if (
        typeof beforeType !== 'string' ||
        typeof afterType !== 'string' ||
        beforeType === afterType
      ) {
        return false
      }
      const beforeUnits = policy.relative_cost.instance_type_units[beforeType]
      const afterUnits = policy.relative_cost.instance_type_units[afterType]
      return (
        beforeUnits !== undefined &&
        afterUnits !== undefined &&
        afterUnits / beforeUnits >= policy.relative_cost.trigger.minimum_multiplier &&
        afterUnits - beforeUnits >= policy.relative_cost.trigger.minimum_unit_delta
      )
    })
    .map(({ address }) => address)
}

function detectCriticalTransitiveImpact(context: RiskContext): string[] {
  return context.plan.resources
    .filter(
      (resource) =>
        resource.destructive &&
        traceBlastRadius(resource.address, context.edges, context.policy, true).band === 'critical',
    )
    .map(({ address }) => address)
}

const riskRules: readonly RiskRule[] = [
  {
    id: 'TF001_STATEFUL_REPLACEMENT',
    category: 'destructive',
    severity: 'blocker',
    detect: detectStatefulReplacements,
  },
  {
    id: 'TF002_UNSAFE_DB_DELETION',
    category: 'destructive',
    severity: 'high',
    detect: detectUnsafeDatabaseDeletion,
  },
  {
    id: 'AWS001_PUBLIC_DATABASE_PORT',
    category: 'security',
    severity: 'blocker',
    detect: detectPublicDatabasePorts,
  },
  {
    id: 'AWS002_PUBLIC_S3_ACCESS',
    category: 'security',
    severity: 'blocker',
    detect: detectPublicS3Access,
  },
  {
    id: 'REL001_CAPACITY_REDUCTION',
    category: 'reliability',
    severity: 'high',
    detect: detectCapacityReduction,
  },
  {
    id: 'COST001_SIZE_CLASS_JUMP',
    category: 'cost',
    severity: 'medium',
    detect: detectSizeClassJump,
  },
  {
    id: 'BLAST001_CRITICAL_TRANSITIVE_IMPACT',
    category: 'blast_radius',
    severity: 'high',
    detect: detectCriticalTransitiveImpact,
  },
]

const findingTitles: Readonly<Record<string, string>> = {
  TF001_STATEFUL_REPLACEMENT: 'Stateful resource replacement',
  TF002_UNSAFE_DB_DELETION: 'Database deletion safeguards disabled',
  AWS001_PUBLIC_DATABASE_PORT: 'Database port exposed publicly',
  AWS002_PUBLIC_S3_ACCESS: 'S3 resources allow public access',
  REL001_CAPACITY_REDUCTION: 'Service capacity reduced below policy',
  COST001_SIZE_CLASS_JUMP: 'Compute size exceeds the cost threshold',
  BLAST001_CRITICAL_TRANSITIVE_IMPACT: 'Destructive change has critical transitive impact',
}

export function analyzeRisks(
  plan: NormalizedPlan,
  policy: ReviewPolicy,
  edges: readonly DependencyEdge[],
): Finding[] {
  const context = { plan, policy, edges }
  return riskRules.flatMap((rule) => {
    const resourceAddresses = unique(rule.detect(context))
    if (resourceAddresses.length === 0) {
      return []
    }
    const finding: Finding = {
      id: `finding-${rule.id}`,
      ruleId: rule.id,
      category: rule.category,
      severity: rule.severity,
      title: findingTitles[rule.id] ?? 'Infrastructure change risk',
      resourceAddresses,
      mitigationOptionIds: [],
    }
    return [
      {
        ...finding,
        mitigationOptionIds: listMitigationOptions([finding]).map(({ id }) => id),
      },
    ]
  })
}
