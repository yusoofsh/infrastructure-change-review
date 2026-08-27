import { assertJsonBudget, FIXTURE_LIMITS, FixtureLimitError } from './limits.ts'
import { type ReviewPolicy, ReviewPolicySchema } from './policy-schema.ts'
import {
  collectConfigurationResources,
  type TerraformConfigurationResource,
  type TerraformPlan,
  TerraformPlanSchema,
} from './schema.ts'

export type FixtureKind = 'plan' | 'policy'

export interface ValidatedFixturePair {
  plan: TerraformPlan
  policy: ReviewPolicy
  configurationResources: TerraformConfigurationResource[]
}

export class FixtureValidationError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'FixtureValidationError'
    this.code = code
  }
}

export function parseRawJsonFixture(raw: string, kind: FixtureKind): unknown {
  const bytes = new TextEncoder().encode(raw).byteLength
  const byteLimit = kind === 'plan' ? FIXTURE_LIMITS.planBytes : FIXTURE_LIMITS.policyBytes
  if (bytes > byteLimit) {
    throw new FixtureLimitError(`${kind} byte`)
  }

  let value: unknown
  try {
    value = JSON.parse(raw) as unknown
  } catch {
    throw new FixtureValidationError('INVALID_JSON', `The ${kind} fixture is not valid JSON`)
  }

  assertJsonBudget(value)
  return value
}

export function validateFixturePair(planRaw: string, policyRaw: string): ValidatedFixturePair {
  const parsedPlan = parseRawJsonFixture(planRaw, 'plan')
  const parsedPolicy = parseRawJsonFixture(policyRaw, 'policy')
  const planResult = TerraformPlanSchema.safeParse(parsedPlan)
  const policyResult = ReviewPolicySchema.safeParse(parsedPolicy)

  if (!planResult.success) {
    throw new FixtureValidationError(
      'INVALID_TERRAFORM_PLAN',
      `Terraform plan fixture failed ${planResult.error.issues.length} contract checks`,
    )
  }
  if (!policyResult.success) {
    throw new FixtureValidationError(
      'INVALID_REVIEW_POLICY',
      `Review policy fixture failed ${policyResult.error.issues.length} contract checks`,
    )
  }

  const configurationResources = collectConfigurationResources(
    planResult.data.configuration.root_module,
  )
  if (configurationResources.length > FIXTURE_LIMITS.configurationResources) {
    throw new FixtureLimitError('configuration resource')
  }

  const changeAddresses = new Set(planResult.data.resource_changes.map(({ address }) => address))
  const changesByAddress = new Map(
    planResult.data.resource_changes.map((change) => [change.address, change]),
  )
  const configurationAddresses = new Set<string>()
  let totalReferences = 0

  for (const resource of configurationResources) {
    if (configurationAddresses.has(resource.address)) {
      throw new FixtureValidationError(
        'DUPLICATE_CONFIGURATION_ADDRESS',
        'Configuration resource addresses must be unique',
      )
    }
    configurationAddresses.add(resource.address)
    totalReferences += resource.depends_on?.length ?? 0
    const matchingChange = changesByAddress.get(resource.address)
    if (
      !matchingChange ||
      matchingChange.mode !== resource.mode ||
      matchingChange.type !== resource.type ||
      matchingChange.name !== resource.name
    ) {
      throw new FixtureValidationError(
        'RESOURCE_CONFIGURATION_IDENTITY_MISMATCH',
        'Configuration and change resource identity must match exactly',
      )
    }
    for (const dependency of resource.depends_on ?? []) {
      if (!changeAddresses.has(dependency)) {
        throw new FixtureValidationError(
          'UNKNOWN_EXPLICIT_DEPENDENCY',
          'Explicit dependencies must reference fixture resources',
        )
      }
    }
    for (const expression of Object.values(resource.expressions ?? {})) {
      totalReferences += expression.references?.length ?? 0
    }
  }

  if (totalReferences > FIXTURE_LIMITS.totalReferences) {
    throw new FixtureLimitError('total configuration reference')
  }
  if (
    changeAddresses.size !== configurationAddresses.size ||
    [...changeAddresses].some((address) => !configurationAddresses.has(address))
  ) {
    throw new FixtureValidationError(
      'RESOURCE_CONFIGURATION_MISMATCH',
      'P0 fixture changes and configuration resources must use the same addresses',
    )
  }

  const policyAddresses = new Set([
    ...Object.keys(policyResult.data.resources),
    ...Object.keys(policyResult.data.capacity.minimum_desired_count_by_address),
    ...Object.keys(policyResult.data.relative_cost.approved_alternative_by_address),
  ])
  if ([...policyAddresses].some((address) => !changeAddresses.has(address))) {
    throw new FixtureValidationError(
      'UNKNOWN_POLICY_RESOURCE',
      'Review policy references must resolve to fixture resources',
    )
  }

  return {
    plan: planResult.data,
    policy: policyResult.data,
    configurationResources,
  }
}
