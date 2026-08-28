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

const blastRadiusBands: readonly BlastRadiusBand[] = ['low', 'medium', 'high', 'critical']

export function traceBlastRadius(
  source: string,
  edges: readonly DependencyEdge[],
  policy: ReviewPolicy,
  destructive: boolean,
): BlastRadius {
  const adjacency = new Map<string, Set<string>>()
  for (const { dependency, dependent } of edges) {
    const dependents = adjacency.get(dependency) ?? new Set<string>()
    dependents.add(dependent)
    adjacency.set(dependency, dependents)
  }

  const directDependents = [...(adjacency.get(source) ?? [])]
    .filter((address) => address !== source)
    .sort()
  const reachable = new Set<string>([source, ...directDependents])
  const pending = [...directDependents]
  while (pending.length > 0) {
    const current = pending.shift()
    if (!current) {
      continue
    }
    for (const dependent of adjacency.get(current) ?? []) {
      if (!reachable.has(dependent)) {
        reachable.add(dependent)
        pending.push(dependent)
      }
    }
  }

  reachable.delete(source)
  const directSet = new Set(directDependents)
  const indirectDependents = [...reachable].filter((address) => !directSet.has(address)).sort()
  const criticalDependents = [...reachable]
    .filter((address) => policy.resources[address]?.critical === true)
    .sort()
  const weights = policy.blast_radius
  const score =
    directDependents.length * weights.direct_dependent_weight +
    indirectDependents.length * weights.indirect_dependent_weight +
    criticalDependents.length * weights.critical_dependent_weight +
    (destructive ? weights.destructive_source_weight : 0)
  const band = blastRadiusBands.find((candidate) => {
    const range = weights.bands[candidate]
    return score >= range.minimum && (range.maximum === undefined || score <= range.maximum)
  })
  if (!band) {
    throw new Error(`Blast-radius score ${score} does not match a policy band`)
  }

  return {
    source,
    directDependents,
    indirectDependents,
    criticalDependents,
    score,
    band,
  }
}
