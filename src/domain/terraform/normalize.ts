import { type ChangeKind, classifyActions } from './actions'
import { redactChangeValues } from './redact'
import type { TerraformPlan } from './schema'

export interface ChangeCounts {
  create: number
  update: number
  replace: number
  delete: number
  noOp: number
  read: number
}

export interface NormalizedResourceChange {
  address: string
  type: string
  name: string
  kind: 'no-op' | 'create' | 'read' | 'update' | 'replace' | 'delete'
  destructive: boolean
  before: unknown
  after: unknown
}

export interface NormalizedPlan {
  formatVersion: string
  terraformVersion: string
  resources: NormalizedResourceChange[]
  counts: ChangeCounts
}

const countKeys: Record<ChangeKind, keyof ChangeCounts> = {
  create: 'create',
  update: 'update',
  replace: 'replace',
  delete: 'delete',
  'no-op': 'noOp',
  read: 'read',
}

export function normalizeTerraformPlan(plan: TerraformPlan): NormalizedPlan {
  const counts: ChangeCounts = {
    create: 0,
    update: 0,
    replace: 0,
    delete: 0,
    noOp: 0,
    read: 0,
  }
  const resources = plan.resource_changes.map((resource) => {
    const classification = classifyActions(resource.change.actions)
    const values = redactChangeValues(resource)
    counts[countKeys[classification.kind]] += 1
    return {
      address: resource.address,
      type: resource.type,
      name: resource.name,
      kind: classification.kind,
      destructive: classification.destructive,
      before: values.before,
      after: values.after,
    }
  })

  return {
    formatVersion: plan.format_version,
    terraformVersion: plan.terraform_version,
    resources,
    counts,
  }
}
