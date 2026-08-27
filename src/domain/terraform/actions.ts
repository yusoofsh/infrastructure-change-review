import { domainNotImplemented } from '../errors'

export type TerraformAction = 'no-op' | 'create' | 'read' | 'update' | 'delete' | 'forget'
export type ChangeKind = 'no-op' | 'create' | 'read' | 'update' | 'replace' | 'delete'
export type ReplacementOrder = 'destroy-first' | 'create-first'

export interface ActionClassification {
  kind: ChangeKind
  destructive: boolean
  replacementOrder?: ReplacementOrder
}

export function classifyActions(_actions: readonly TerraformAction[]): ActionClassification {
  return domainNotImplemented('terraform.action-classification')
}
