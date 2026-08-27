import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { validateFixturePair } from '../../src/domain/terraform/fixture-contract'

export async function loadFixturePair() {
  const [planRaw, policyRaw] = await Promise.all([
    readFile(resolve('src/fixtures/aws-risky-plan.json'), 'utf8'),
    readFile(resolve('src/fixtures/aws-review-policy.json'), 'utf8'),
  ])

  return {
    ...validateFixturePair(planRaw, policyRaw),
    planRaw,
    policyRaw,
  }
}
