import { domainNotImplemented } from '../errors'
import type { TerraformPlan } from './schema'

export interface DependencyEdge {
  dependency: string
  dependent: string
  evidence: 'expression_reference' | 'explicit_depends_on'
}

export function extractDependencyEdges(_plan: TerraformPlan): DependencyEdge[] {
  return domainNotImplemented('terraform.dependency-extraction')
}
