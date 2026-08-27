import { domainNotImplemented } from '../errors'
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

export function normalizeTerraformPlan(_plan: TerraformPlan): NormalizedPlan {
  return domainNotImplemented('terraform.normalization')
}
