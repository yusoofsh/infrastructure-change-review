import { domainNotImplemented } from '../errors'
import type { ReviewPolicy } from '../terraform/policy-schema'
import type { DependencyEdge } from '../terraform/references'

export type BlastRadiusBand = 'low' | 'medium' | 'high' | 'critical'

export interface BlastRadius {
  source: string
  directDependents: string[]
  indirectDependents: string[]
  criticalDependents: string[]
  score: number
  band: BlastRadiusBand
}

export function traceBlastRadius(
  _source: string,
  _edges: readonly DependencyEdge[],
  _policy: ReviewPolicy,
  _destructive: boolean,
): BlastRadius {
  return domainNotImplemented('graph.blast-radius')
}
