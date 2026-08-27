import { z } from 'zod'
import { FIXTURE_LIMITS } from './limits.ts'

const boundedString = z.string().max(FIXTURE_LIMITS.stringLength)
const hasControlCharacter = (value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index)
    if (codePoint <= 31 || codePoint === 127) {
      return true
    }
  }
  return false
}
const addressSchema = z
  .string()
  .min(1)
  .max(FIXTURE_LIMITS.addressLength)
  .refine((value) => !hasControlCharacter(value), 'Invalid resource address')
const referenceSchema = z.string().min(1).max(FIXTURE_LIMITS.referenceLength)

const supportedActionKeys = new Set([
  'no-op',
  'create',
  'read',
  'update',
  'delete',
  'create,delete',
  'delete,create',
])

export const TerraformActionsSchema = z
  .array(z.enum(['no-op', 'create', 'read', 'update', 'delete', 'forget']))
  .min(1)
  .max(2)
  .superRefine((actions, context) => {
    if (!supportedActionKeys.has(actions.join(','))) {
      context.addIssue({
        code: 'custom',
        message: 'Unsupported Terraform action combination for the P0 fixture contract',
      })
    }
  })

const pathStepSchema = z.union([
  z.string().max(FIXTURE_LIMITS.addressLength),
  z.number().int().nonnegative(),
])

type ValueMask = boolean | ValueMask[] | { [key: string]: ValueMask }

const valueMaskSchema: z.ZodType<ValueMask> = z.lazy(() =>
  z.union([
    z.boolean(),
    z.array(valueMaskSchema).max(FIXTURE_LIMITS.arrayItems),
    z.record(z.string().max(512), valueMaskSchema),
  ]),
)

const changeSchema = z.object({
  actions: TerraformActionsSchema,
  before: z.unknown(),
  after: z.unknown(),
  after_unknown: valueMaskSchema,
  before_sensitive: valueMaskSchema,
  after_sensitive: valueMaskSchema,
  replace_paths: z
    .array(z.array(pathStepSchema).min(1).max(FIXTURE_LIMITS.replacePathDepth))
    .max(FIXTURE_LIMITS.replacePaths)
    .optional(),
})

const resourceChangeSchema = z
  .object({
    address: addressSchema,
    module_address: addressSchema.optional(),
    mode: z.enum(['managed', 'data', 'ephemeral']),
    type: boundedString.min(1),
    name: boundedString.min(1),
    index: z.union([z.string(), z.number().int()]).optional(),
    provider_name: boundedString.min(1),
    deposed: boundedString.optional(),
    change: changeSchema,
    action_reason: boundedString.optional(),
  })
  .superRefine((change, context) => {
    if (change.deposed !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Deposed objects are unsupported by the P0 fixture contract',
      })
    }
  })

const expressionSchema = z
  .object({
    constant_value: z.unknown().optional(),
    references: z.array(referenceSchema).max(FIXTURE_LIMITS.referencesPerExpression).optional(),
  })
  .superRefine((expression, context) => {
    if (expression.constant_value !== undefined && expression.references !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'A configuration expression cannot mix constant_value and references',
      })
    }
  })

const configurationResourceSchema = z.object({
  address: addressSchema,
  mode: z.enum(['managed', 'data', 'ephemeral']),
  type: boundedString.min(1),
  name: boundedString.min(1),
  provider_config_key: boundedString.optional(),
  schema_version: z.number().int().nonnegative(),
  expressions: z.record(z.string().max(512), expressionSchema).optional(),
  depends_on: z.array(addressSchema).max(FIXTURE_LIMITS.referencesPerExpression).optional(),
})

type ConfigurationModule = {
  resources?: Array<z.infer<typeof configurationResourceSchema>> | undefined
  module_calls?: Record<string, { module: ConfigurationModule }> | undefined
}

const configurationModuleSchema: z.ZodType<ConfigurationModule> = z.lazy(() =>
  z.object({
    resources: z
      .array(configurationResourceSchema)
      .max(FIXTURE_LIMITS.configurationResources)
      .optional(),
    module_calls: z
      .record(
        z.string().max(512),
        z.object({
          module: configurationModuleSchema,
        }),
      )
      .optional(),
  }),
)

export const TerraformPlanSchema = z
  .object({
    format_version: z
      .string()
      .regex(/^1\.\d+$/u, 'Only Terraform JSON format major version 1 is supported'),
    terraform_version: boundedString.min(1),
    resource_changes: z.array(resourceChangeSchema).max(FIXTURE_LIMITS.resourceChanges),
    configuration: z.object({
      root_module: configurationModuleSchema,
    }),
  })
  .superRefine((plan, context) => {
    const addresses = new Set<string>()
    for (const change of plan.resource_changes) {
      if (addresses.has(change.address)) {
        context.addIssue({
          code: 'custom',
          message: 'Duplicate resource change address',
        })
      }
      addresses.add(change.address)
    }
  })

export type TerraformPlan = z.infer<typeof TerraformPlanSchema>
export type TerraformResourceChange = TerraformPlan['resource_changes'][number]
export type TerraformConfigurationResource = z.infer<typeof configurationResourceSchema>

export function collectConfigurationResources(
  module: ConfigurationModule,
): TerraformConfigurationResource[] {
  const resources: TerraformConfigurationResource[] = []
  const pending = [module]

  while (pending.length > 0) {
    const current = pending.pop()
    if (!current) {
      break
    }
    resources.push(...(current.resources ?? []))
    for (const moduleCall of Object.values(current.module_calls ?? {})) {
      pending.push(moduleCall.module)
    }
  }

  return resources
}
