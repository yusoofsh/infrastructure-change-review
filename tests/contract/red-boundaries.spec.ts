import { describe, expect, it } from 'vitest'
import { traceBlastRadius } from '../../src/domain/graph/blast-radius'
import { listMitigationOptions } from '../../src/domain/recommendations/catalog'
import { analyzeRisks } from '../../src/domain/risks/analyze'
import { classifyActions } from '../../src/domain/terraform/actions'
import { normalizeTerraformPlan } from '../../src/domain/terraform/normalize'
import { redactChangeValues } from '../../src/domain/terraform/redact'
import { extractDependencyEdges } from '../../src/domain/terraform/references'
import { loadFixturePair } from '../helpers/fixtures'

describe('domain capability gate', () => {
  it('runs every domain capability against the locked fixture', async () => {
    const { plan, policy } = await loadFixturePair()
    const resource = plan.resource_changes[0]
    if (!resource) {
      throw new Error('Fixture must contain a resource change')
    }

    expect(() => {
      classifyActions(resource.change.actions)
      redactChangeValues(resource)
      const normalized = normalizeTerraformPlan(plan)
      const edges = extractDependencyEdges(plan)
      traceBlastRadius(resource.address, edges, policy, resource.change.actions.includes('delete'))
      const findings = analyzeRisks(normalized, policy, edges)
      listMitigationOptions(findings)
    }).not.toThrow()
  })
})
