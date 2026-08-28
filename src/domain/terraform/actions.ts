export type TerraformAction = 'no-op' | 'create' | 'read' | 'update' | 'delete' | 'forget'
export type ChangeKind = 'no-op' | 'create' | 'read' | 'update' | 'replace' | 'delete'
export type ReplacementOrder = 'destroy-first' | 'create-first'

export interface ActionClassification {
  kind: ChangeKind
  destructive: boolean
  replacementOrder?: ReplacementOrder
}

const actionClassifications: Readonly<Record<string, ActionClassification>> = {
  'no-op': { kind: 'no-op', destructive: false },
  create: { kind: 'create', destructive: false },
  read: { kind: 'read', destructive: false },
  update: { kind: 'update', destructive: false },
  delete: { kind: 'delete', destructive: true },
  'delete,create': {
    kind: 'replace',
    destructive: true,
    replacementOrder: 'destroy-first',
  },
  'create,delete': {
    kind: 'replace',
    destructive: true,
    replacementOrder: 'create-first',
  },
}

export function classifyActions(actions: readonly TerraformAction[]): ActionClassification {
  const classification = actionClassifications[actions.join(',')]
  if (!classification) {
    throw new Error(`Unsupported Terraform action combination: ${actions.join(',')}`)
  }
  return classification
}
