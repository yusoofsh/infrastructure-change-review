import { z } from 'zod'
import { FIXTURE_LIMITS } from './limits.ts'

const addressSchema = z.string().min(1).max(FIXTURE_LIMITS.addressLength)

function isValidIpv4Cidr(value: string): boolean {
  const [address, prefix, ...rest] = value.split('/')
  if (!address || !prefix || rest.length > 0) {
    return false
  }
  const octets = address.split('.')
  const prefixNumber = Number(prefix)
  return (
    octets.length === 4 &&
    octets.every((octet) => {
      if (!/^\d{1,3}$/u.test(octet)) {
        return false
      }
      const numericOctet = Number(octet)
      return numericOctet >= 0 && numericOctet <= 255 && String(numericOctet) === octet
    }) &&
    Number.isInteger(prefixNumber) &&
    prefixNumber >= 0 &&
    prefixNumber <= 32
  )
}

function isValidIpv6Cidr(value: string): boolean {
  const [address, prefix, ...rest] = value.split('/')
  if (!address || !prefix || rest.length > 0 || !/^[0-9a-f:]+$/iu.test(address)) {
    return false
  }
  const prefixNumber = Number(prefix)
  if (!Number.isInteger(prefixNumber) || prefixNumber < 0 || prefixNumber > 128) {
    return false
  }
  if ((address.match(/::/gu) ?? []).length > 1) {
    return false
  }
  const segments = address.split(':').filter(Boolean)
  if (segments.some((segment) => segment.length > 4)) {
    return false
  }
  return address.includes('::') ? segments.length < 8 : segments.length === 8
}

const cidrSchema = z
  .string()
  .max(64)
  .refine((value) => isValidIpv4Cidr(value) || isValidIpv6Cidr(value), 'Invalid CIDR')

const resourcePolicySchema = z
  .object({
    critical: z.boolean(),
    stateful: z.boolean(),
  })
  .strict()

const blastBandSchema = z
  .object({
    minimum: z.number().int().nonnegative().max(10_000),
    maximum: z.number().int().nonnegative().max(10_000).optional(),
  })
  .strict()

export const ReviewPolicySchema = z
  .object({
    policy_version: z.string().min(1).max(64),
    policy_id: z.string().min(1).max(128),
    environment: z.string().min(1).max(64),
    network: z
      .object({
        database_ports: z.array(z.number().int().min(1).max(65_535)).min(1).max(64),
        world_cidrs: z.array(cidrSchema).min(1).max(16),
        approved_application_cidrs: z.array(cidrSchema).min(1).max(64),
      })
      .strict(),
    resources: z.record(addressSchema, resourcePolicySchema),
    capacity: z
      .object({
        minimum_desired_count_by_address: z.record(
          addressSchema,
          z.number().int().nonnegative().max(10_000),
        ),
      })
      .strict(),
    relative_cost: z
      .object({
        instance_type_units: z.record(
          z.string().min(1).max(128),
          z.number().finite().positive().max(1_000_000),
        ),
        trigger: z
          .object({
            minimum_multiplier: z.number().finite().positive().max(1_000),
            minimum_unit_delta: z.number().finite().nonnegative().max(1_000_000),
          })
          .strict(),
        approved_alternative_by_address: z.record(addressSchema, z.string().min(1).max(128)),
      })
      .strict(),
    blast_radius: z
      .object({
        direct_dependent_weight: z.number().finite().nonnegative().max(1_000),
        indirect_dependent_weight: z.number().finite().nonnegative().max(1_000),
        critical_dependent_weight: z.number().finite().nonnegative().max(1_000),
        destructive_source_weight: z.number().finite().nonnegative().max(1_000),
        bands: z
          .object({
            low: blastBandSchema,
            medium: blastBandSchema,
            high: blastBandSchema,
            critical: blastBandSchema,
          })
          .strict(),
      })
      .strict(),
  })
  .strict()

export type ReviewPolicy = z.infer<typeof ReviewPolicySchema>
