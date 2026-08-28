import type { TerraformResourceChange } from './schema'

export const REDACTED_VALUE = '[REDACTED]'
export const UNKNOWN_VALUE = '(known after apply)'

export interface RedactedChangeValues {
  before: unknown
  after: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function walkMaskedValue(value: unknown, mask: unknown, replacement: string): unknown {
  if (mask === true) {
    return value === REDACTED_VALUE ? REDACTED_VALUE : replacement
  }
  if (Array.isArray(value) || Array.isArray(mask)) {
    const arrayValue = Array.isArray(value) ? value : []
    const arrayMask = Array.isArray(mask) ? mask : []
    return Array.from({ length: Math.max(arrayValue.length, arrayMask.length) }, (_, index) =>
      walkMaskedValue(arrayValue[index], arrayMask[index], replacement),
    )
  }
  if (isRecord(value) || isRecord(mask)) {
    const objectValue = isRecord(value) ? value : {}
    const objectMask = isRecord(mask) ? mask : {}
    const keys = new Set([...Object.keys(objectValue), ...Object.keys(objectMask)])
    return Object.fromEntries(
      [...keys].map((key) => [
        key,
        walkMaskedValue(
          objectValue[key],
          Object.hasOwn(objectMask, key) ? objectMask[key] : false,
          replacement,
        ),
      ]),
    )
  }
  return value
}

export function redactChangeValues(resource: TerraformResourceChange): RedactedChangeValues {
  const before = walkMaskedValue(
    resource.change.before,
    resource.change.before_sensitive,
    REDACTED_VALUE,
  )
  const sensitiveAfter = walkMaskedValue(
    resource.change.after,
    resource.change.after_sensitive,
    REDACTED_VALUE,
  )
  return {
    before,
    after: walkMaskedValue(sensitiveAfter, resource.change.after_unknown, UNKNOWN_VALUE),
  }
}
