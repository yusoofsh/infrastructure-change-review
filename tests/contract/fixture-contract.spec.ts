import { describe, expect, it } from 'vitest'
import {
  FixtureValidationError,
  parseRawJsonFixture,
  validateFixturePair,
} from '../../src/domain/terraform/fixture-contract'
import { FIXTURE_LIMITS, FixtureLimitError } from '../../src/domain/terraform/limits'
import { loadFixturePair } from '../helpers/fixtures'

const expectedAddresses = [
  'aws_db_instance.orders',
  'aws_security_group_rule.database_ingress',
  'aws_s3_bucket_public_access_block.assets',
  'aws_s3_bucket_policy.assets',
  'aws_ecs_service.api',
  'aws_instance.worker',
  'aws_secretsmanager_secret_version.database_url',
  'aws_ecs_task_definition.api',
  'aws_ecs_service.checkout',
  'aws_lb_target_group.checkout',
  'aws_cloudwatch_metric_alarm.checkout_errors',
  'aws_route53_record.checkout',
] as const

const expectedActionsByAddress = {
  'aws_db_instance.orders': 'delete,create',
  'aws_security_group_rule.database_ingress': 'update',
  'aws_s3_bucket_public_access_block.assets': 'update',
  'aws_s3_bucket_policy.assets': 'update',
  'aws_ecs_service.api': 'update',
  'aws_instance.worker': 'update',
  'aws_secretsmanager_secret_version.database_url': 'update',
  'aws_ecs_task_definition.api': 'create,delete',
  'aws_ecs_service.checkout': 'update',
  'aws_lb_target_group.checkout': 'no-op',
  'aws_cloudwatch_metric_alarm.checkout_errors': 'no-op',
  'aws_route53_record.checkout': 'no-op',
} as const

const expectedDependencyEvidence = {
  'aws_secretsmanager_secret_version.database_url': {
    dependsOn: [],
    references: ['aws_db_instance.orders.address', 'aws_db_instance.orders'],
  },
  'aws_ecs_task_definition.api': {
    dependsOn: [],
    references: [
      'aws_secretsmanager_secret_version.database_url.version_id',
      'aws_secretsmanager_secret_version.database_url',
    ],
  },
  'aws_ecs_service.checkout': {
    dependsOn: [],
    references: ['aws_ecs_task_definition.api.arn', 'aws_ecs_task_definition.api'],
  },
  'aws_lb_target_group.checkout': {
    dependsOn: ['aws_ecs_service.checkout'],
    references: ['aws_ecs_service.checkout.name', 'aws_ecs_service.checkout'],
  },
  'aws_cloudwatch_metric_alarm.checkout_errors': {
    dependsOn: [],
    references: ['aws_ecs_service.checkout.name', 'aws_ecs_service.checkout'],
  },
  'aws_route53_record.checkout': {
    dependsOn: [],
    references: ['aws_ecs_service.checkout.name', 'aws_ecs_service.checkout'],
  },
} as const

describe('bundled fixture contract', () => {
  it('validates the synthetic Terraform plan and strict review policy', async () => {
    const fixtures = await loadFixturePair()

    expect(fixtures.plan.format_version).toBe('1.2')
    expect(fixtures.plan.terraform_version).toBe('1.14.3')
    expect(fixtures.plan.resource_changes).toHaveLength(12)
    expect(fixtures.policy).toMatchObject({
      policy_id: 'synthetic-commerce-production',
      policy_version: '1.0.0',
      environment: 'production',
    })
  })

  it('locks the exact resource addresses across changes and configuration', async () => {
    const fixtures = await loadFixturePair()
    const changeAddresses = fixtures.plan.resource_changes.map(({ address }) => address).sort()
    const configurationAddresses = fixtures.configurationResources
      .map(({ address }) => address)
      .sort()

    expect(changeAddresses).toEqual([...expectedAddresses].sort())
    expect(configurationAddresses).toEqual([...expectedAddresses].sort())
  })

  it('locks the exclusive action distribution', async () => {
    const { plan } = await loadFixturePair()
    const actionKeys = plan.resource_changes.map(({ change }) => change.actions.join(','))

    expect(
      Object.fromEntries(
        plan.resource_changes.map(({ address, change }) => [address, change.actions.join(',')]),
      ),
    ).toEqual(expectedActionsByAddress)

    expect(actionKeys.filter((key) => key === 'create')).toHaveLength(0)
    expect(actionKeys.filter((key) => key === 'update')).toHaveLength(7)
    expect(
      actionKeys.filter((key) => key === 'delete,create' || key === 'create,delete'),
    ).toHaveLength(2)
    expect(actionKeys.filter((key) => key === 'delete')).toHaveLength(0)
    expect(actionKeys.filter((key) => key === 'no-op')).toHaveLength(3)
  })

  it('locks the exact risk-trigger evidence by resource address', async () => {
    const { plan } = await loadFixturePair()
    const changes = new Map(plan.resource_changes.map((change) => [change.address, change]))

    expect(changes.get('aws_db_instance.orders')).toMatchObject({
      action_reason: 'replace_because_cannot_update',
      change: {
        replace_paths: [['identifier']],
        before: { deletion_protection: true, skip_final_snapshot: false },
        after: { deletion_protection: false, skip_final_snapshot: true },
      },
    })
    expect(changes.get('aws_security_group_rule.database_ingress')).toMatchObject({
      change: {
        before: {
          cidr_blocks: ['10.42.0.0/16'],
          from_port: 5432,
          protocol: 'tcp',
          to_port: 5432,
        },
        after: {
          cidr_blocks: ['0.0.0.0/0'],
          from_port: 5432,
          protocol: 'tcp',
          to_port: 5432,
        },
      },
    })
    expect(changes.get('aws_s3_bucket_public_access_block.assets')).toMatchObject({
      change: {
        before: {
          block_public_acls: true,
          block_public_policy: true,
          ignore_public_acls: true,
          restrict_public_buckets: true,
        },
        after: {
          block_public_acls: false,
          block_public_policy: false,
          ignore_public_acls: false,
          restrict_public_buckets: false,
        },
      },
    })
    const bucketPolicy = changes.get('aws_s3_bucket_policy.assets')
    expect(bucketPolicy).toBeDefined()
    if (!bucketPolicy) {
      throw new Error('Synthetic fixture must contain the S3 bucket policy change')
    }
    const beforePolicy = JSON.parse((bucketPolicy.change.before as { policy: string }).policy)
    const afterPolicy = JSON.parse((bucketPolicy.change.after as { policy: string }).policy)
    expect(beforePolicy).toEqual({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: {
            AWS: 'arn:aws:iam::111122223333:role/synthetic-assets-readonly',
          },
          Action: 's3:GetObject',
          Resource: 'arn:aws:s3:::commerce-assets-synthetic-prod/*',
        },
      ],
    })
    expect(afterPolicy).toEqual({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: '*',
          Action: 's3:GetObject',
          Resource: 'arn:aws:s3:::commerce-assets-synthetic-prod/*',
        },
      ],
    })
    expect(changes.get('aws_ecs_service.api')).toMatchObject({
      change: { before: { desired_count: 3 }, after: { desired_count: 1 } },
    })
    expect(changes.get('aws_instance.worker')).toMatchObject({
      change: {
        before: { instance_type: 't4g.medium', ami: 'ami-synthetic-arm64' },
        after: { instance_type: 'm7g.4xlarge', ami: 'ami-synthetic-arm64' },
      },
    })
    expect(changes.get('aws_secretsmanager_secret_version.database_url')).toMatchObject({
      change: {
        before: { secret_string: expect.stringContaining('SYNTHETIC_VALUE') },
        after_unknown: { secret_string: true, version_id: true },
        before_sensitive: { secret_string: true },
        after_sensitive: { secret_string: true },
      },
    })
    for (const change of plan.resource_changes.filter(
      ({ change }) => change.actions.join(',') === 'no-op',
    )) {
      expect(change.change.before).toEqual(change.change.after)
    }
  })

  it('locks the complete raw dependency evidence without extra sources', async () => {
    const fixtures = await loadFixturePair()
    const evidence = Object.fromEntries(
      fixtures.configurationResources
        .map((resource) => {
          const references = Object.values(resource.expressions ?? {}).flatMap(
            (expression) => expression.references ?? [],
          )
          return [resource.address, { dependsOn: resource.depends_on ?? [], references }] as const
        })
        .filter(([, item]) => item.dependsOn.length > 0 || item.references.length > 0),
    )

    expect(evidence).toEqual(expectedDependencyEvidence)
  })

  it('keeps all policy addresses inside the synthetic plan', async () => {
    const { plan, policy } = await loadFixturePair()
    const addresses = new Set(plan.resource_changes.map(({ address }) => address))
    const policyAddresses = [
      ...Object.keys(policy.resources),
      ...Object.keys(policy.capacity.minimum_desired_count_by_address),
      ...Object.keys(policy.relative_cost.approved_alternative_by_address),
    ]

    expect(policyAddresses.every((address) => addresses.has(address))).toBe(true)
    expect(policy.resources).toEqual({
      'aws_db_instance.orders': { critical: true, stateful: true },
      'aws_secretsmanager_secret_version.database_url': {
        critical: true,
        stateful: false,
      },
      'aws_ecs_service.api': { critical: true, stateful: false },
      'aws_ecs_service.checkout': { critical: true, stateful: false },
    })
    expect(policy.network).toEqual({
      database_ports: [5432],
      world_cidrs: ['0.0.0.0/0', '::/0'],
      approved_application_cidrs: ['10.42.16.0/20'],
    })
    expect(policy.capacity.minimum_desired_count_by_address).toEqual({
      'aws_ecs_service.api': 2,
      'aws_ecs_service.checkout': 2,
    })
    expect(policy.relative_cost).toEqual({
      instance_type_units: { 't4g.medium': 2, 'm7g.large': 4, 'm7g.4xlarge': 32 },
      trigger: { minimum_multiplier: 4, minimum_unit_delta: 8 },
      approved_alternative_by_address: { 'aws_instance.worker': 'm7g.large' },
    })
    expect(policy.blast_radius).toMatchObject({
      direct_dependent_weight: 2,
      indirect_dependent_weight: 1,
      critical_dependent_weight: 3,
      destructive_source_weight: 3,
      bands: {
        low: { minimum: 0, maximum: 3 },
        medium: { minimum: 4, maximum: 7 },
        high: { minimum: 8, maximum: 12 },
        critical: { minimum: 13 },
      },
    })
  })

  it('tolerates unknown properties in supported Terraform format major version 1', async () => {
    const { planRaw, policyRaw } = await loadFixturePair()
    const plan = JSON.parse(planRaw) as Record<string, unknown>
    plan.future_minor_property = { ignored: true }
    const resourceChanges = plan.resource_changes as Array<Record<string, unknown>>
    resourceChanges[0] = { ...resourceChanges[0], future_resource_property: true }

    expect(() => validateFixturePair(JSON.stringify(plan), policyRaw)).not.toThrow()
  })

  it('rejects unsupported format majors and missing resource_changes', async () => {
    const { planRaw, policyRaw } = await loadFixturePair()
    const plan = JSON.parse(planRaw) as Record<string, unknown>

    expect(() =>
      validateFixturePair(JSON.stringify({ ...plan, format_version: '2.0' }), policyRaw),
    ).toThrowError(FixtureValidationError)

    const { resource_changes: _removed, ...withoutChanges } = plan
    expect(() => validateFixturePair(JSON.stringify(withoutChanges), policyRaw)).toThrowError(
      FixtureValidationError,
    )
  })

  it('fails closed on forget actions and deposed objects in P0', async () => {
    const { planRaw, policyRaw } = await loadFixturePair()
    const planWithForget = JSON.parse(planRaw) as {
      resource_changes: Array<{ change: { actions: string[] }; deposed?: string }>
    }
    const firstForgetChange = planWithForget.resource_changes[0]
    expect(firstForgetChange).toBeDefined()
    if (!firstForgetChange) {
      throw new Error('Synthetic fixture must contain a resource change')
    }
    firstForgetChange.change.actions = ['forget']

    expect(() => validateFixturePair(JSON.stringify(planWithForget), policyRaw)).toThrowError(
      FixtureValidationError,
    )

    const planWithDeposed = JSON.parse(planRaw) as {
      resource_changes: Array<{ deposed?: string }>
    }
    const firstDeposedChange = planWithDeposed.resource_changes[0]
    expect(firstDeposedChange).toBeDefined()
    if (!firstDeposedChange) {
      throw new Error('Synthetic fixture must contain a resource change')
    }
    firstDeposedChange.deposed = 'synthetic-deposed-key'
    expect(() => validateFixturePair(JSON.stringify(planWithDeposed), policyRaw)).toThrowError(
      FixtureValidationError,
    )

    firstDeposedChange.deposed = ''
    expect(() => validateFixturePair(JSON.stringify(planWithDeposed), policyRaw)).toThrowError(
      FixtureValidationError,
    )
  })

  it('rejects configuration identity drift and malformed value masks', async () => {
    const { planRaw, policyRaw } = await loadFixturePair()
    const planWithIdentityDrift = JSON.parse(planRaw) as {
      configuration: { root_module: { resources: Array<{ type: string }> } }
    }
    const firstConfigurationResource = planWithIdentityDrift.configuration.root_module.resources[0]
    expect(firstConfigurationResource).toBeDefined()
    if (!firstConfigurationResource) {
      throw new Error('Synthetic fixture must contain a configuration resource')
    }
    firstConfigurationResource.type = 'aws_rds_cluster'
    expect(() =>
      validateFixturePair(JSON.stringify(planWithIdentityDrift), policyRaw),
    ).toThrowError(FixtureValidationError)

    const planWithMalformedMask = JSON.parse(planRaw) as {
      resource_changes: Array<{ change: { before_sensitive: unknown } }>
    }
    const firstMaskedChange = planWithMalformedMask.resource_changes[0]
    expect(firstMaskedChange).toBeDefined()
    if (!firstMaskedChange) {
      throw new Error('Synthetic fixture must contain a resource change')
    }
    firstMaskedChange.change.before_sensitive = { password: 'sensitive' }
    expect(() =>
      validateFixturePair(JSON.stringify(planWithMalformedMask), policyRaw),
    ).toThrowError(FixtureValidationError)
  })

  it('enforces raw-byte, nesting, string, and prototype-key budgets before domain work', () => {
    expect(() =>
      parseRawJsonFixture(' '.repeat(FIXTURE_LIMITS.planBytes + 1), 'plan'),
    ).toThrowError(FixtureLimitError)

    const deeplyNested = `${'{"child":'.repeat(FIXTURE_LIMITS.jsonDepth + 1)}null${'}'.repeat(FIXTURE_LIMITS.jsonDepth + 1)}`
    expect(() => parseRawJsonFixture(deeplyNested, 'plan')).toThrowError(FixtureLimitError)

    const overlongString = JSON.stringify({ value: 'x'.repeat(FIXTURE_LIMITS.stringLength + 1) })
    expect(() => parseRawJsonFixture(overlongString, 'plan')).toThrowError(FixtureLimitError)
    expect(() => parseRawJsonFixture('{"__proto__":{"polluted":true}}', 'plan')).toThrowError(
      FixtureLimitError,
    )
  })

  it('keeps the organization policy strict and rejects invalid CIDRs', async () => {
    const { planRaw, policyRaw } = await loadFixturePair()
    const policyWithUnknown = JSON.parse(policyRaw) as Record<string, unknown>
    policyWithUnknown.unknown_policy_control = true
    expect(() => validateFixturePair(planRaw, JSON.stringify(policyWithUnknown))).toThrowError(
      FixtureValidationError,
    )

    const policyWithInvalidCidr = JSON.parse(policyRaw) as {
      network: { approved_application_cidrs: string[] }
    }
    policyWithInvalidCidr.network.approved_application_cidrs = ['999.42.16.0/99']
    expect(() => validateFixturePair(planRaw, JSON.stringify(policyWithInvalidCidr))).toThrowError(
      FixtureValidationError,
    )
  })

  it('keeps the prompt-injection payload as inert synthetic fixture data', async () => {
    const { plan } = await loadFixturePair()
    const worker = plan.resource_changes.find(({ address }) => address === 'aws_instance.worker')

    expect(JSON.stringify(worker?.change.after)).toContain('SYSTEM OVERRIDE')
    expect(JSON.stringify(worker?.change.after)).toContain('attacker.invalid')
  })
})
