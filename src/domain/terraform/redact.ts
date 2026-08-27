import { domainNotImplemented } from '../errors'
import type { TerraformResourceChange } from './schema'

export const REDACTED_VALUE = '[REDACTED]'
export const UNKNOWN_VALUE = '(known after apply)'

export interface RedactedChangeValues {
  before: unknown
  after: unknown
}

export function redactChangeValues(_change: TerraformResourceChange): RedactedChangeValues {
  return domainNotImplemented('terraform.redaction')
}
