import { domainNotImplemented } from '../errors'
import type { NormalizedPlan } from '../terraform/normalize'
import type { ReviewPolicy } from '../terraform/policy-schema'
import type { DependencyEdge } from '../terraform/references'
import type { Finding } from './types'

export function analyzeRisks(
  _plan: NormalizedPlan,
  _policy: ReviewPolicy,
  _edges: readonly DependencyEdge[],
): Finding[] {
  return domainNotImplemented('risks.analysis')
}
