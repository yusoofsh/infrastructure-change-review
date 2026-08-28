import { collectConfigurationResources, type TerraformPlan } from './schema'

export interface DependencyEdge {
  dependency: string
  dependent: string
  evidence: 'expression_reference' | 'explicit_depends_on'
}

export function extractDependencyEdges(plan: TerraformPlan): DependencyEdge[] {
  const planAddresses = [...plan.resource_changes.map(({ address }) => address)].sort(
    (left, right) => right.length - left.length,
  )
  const planAddressSet = new Set(planAddresses)
  const edges = new Map<string, DependencyEdge>()
  const addEdge = (edge: DependencyEdge) => {
    if (edge.dependency !== edge.dependent) {
      edges.set(`${edge.dependency}\u0000${edge.dependent}`, edge)
    }
  }

  for (const resource of collectConfigurationResources(plan.configuration.root_module)) {
    for (const dependency of resource.depends_on ?? []) {
      if (planAddressSet.has(dependency)) {
        addEdge({
          dependency,
          dependent: resource.address,
          evidence: 'explicit_depends_on',
        })
      }
    }

    for (const expression of Object.values(resource.expressions ?? {})) {
      for (const reference of expression.references ?? []) {
        const dependency = planAddresses.find(
          (address) => reference === address || reference.startsWith(`${address}.`),
        )
        if (dependency) {
          addEdge({
            dependency,
            dependent: resource.address,
            evidence: 'expression_reference',
          })
        }
      }
    }
  }

  return [...edges.values()]
}
