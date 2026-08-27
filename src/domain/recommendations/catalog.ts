import { domainNotImplemented } from '../errors'
import type { Finding } from '../risks/types'

export type PatchOperation =
  | {
      kind: 'set_attribute'
      address: string
      path: string[]
      value: unknown
    }
  | {
      kind: 'cancel_change'
      address: string
    }
  | {
      kind: 'add_review_control'
      controlId: string
      description: string
    }

export interface MitigationOption {
  id: string
  findingId: string
  title: string
  operations: PatchOperation[]
}

export function listMitigationOptions(_findings: readonly Finding[]): MitigationOption[] {
  return domainNotImplemented('recommendations.catalog')
}

export function resolveMitigationOption(_findingId: string, _optionId: string): MitigationOption {
  return domainNotImplemented('recommendations.option-resolution')
}
