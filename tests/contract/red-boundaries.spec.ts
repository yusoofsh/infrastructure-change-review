import { describe, expect, it } from 'vitest'
import { DomainNotImplementedError } from '../../src/domain/errors'
import { traceBlastRadius } from '../../src/domain/graph/blast-radius'
import { listMitigationOptions } from '../../src/domain/recommendations/catalog'
import { analyzeRisks } from '../../src/domain/risks/analyze'
import { classifyActions } from '../../src/domain/terraform/actions'
import type { NormalizedPlan } from '../../src/domain/terraform/normalize'
import { normalizeTerraformPlan } from '../../src/domain/terraform/normalize'
import type { ReviewPolicy } from '../../src/domain/terraform/policy-schema'
import { redactChangeValues } from '../../src/domain/terraform/redact'
import { extractDependencyEdges } from '../../src/domain/terraform/references'
import type { TerraformPlan, TerraformResourceChange } from '../../src/domain/terraform/schema'

const redBoundaries = [
  {
    capability: 'terraform.action-classification',
    invoke: () => classifyActions(['no-op']),
  },
  {
    capability: 'terraform.normalization',
    invoke: () => normalizeTerraformPlan({} as TerraformPlan),
  },
  {
    capability: 'terraform.redaction',
    invoke: () => redactChangeValues({} as TerraformResourceChange),
  },
  {
    capability: 'terraform.dependency-extraction',
    invoke: () => extractDependencyEdges({} as TerraformPlan),
  },
  {
    capability: 'graph.blast-radius',
    invoke: () => traceBlastRadius('', [], {} as ReviewPolicy, false),
  },
  {
    capability: 'risks.analysis',
    invoke: () => analyzeRisks({} as NormalizedPlan, {} as ReviewPolicy, []),
  },
  {
    capability: 'recommendations.catalog',
    invoke: () => listMitigationOptions([]),
  },
] as const

describe('foundation red boundaries', () => {
  it('keeps every downstream capability at an explicit typed boundary', () => {
    for (const boundary of redBoundaries) {
      let thrown: unknown
      try {
        boundary.invoke()
      } catch (error) {
        thrown = error
      }

      expect(thrown).toBeInstanceOf(DomainNotImplementedError)
      expect(thrown).toMatchObject({
        code: 'DOMAIN_NOT_IMPLEMENTED',
        capability: boundary.capability,
      })
    }
  })
})
