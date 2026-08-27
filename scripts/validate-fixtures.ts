import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { validateFixturePair } from '../src/domain/terraform/fixture-contract.ts'

const planPath = resolve('src/fixtures/aws-risky-plan.json')
const policyPath = resolve('src/fixtures/aws-review-policy.json')
const [planRaw, policyRaw] = await Promise.all([
  readFile(planPath, 'utf8'),
  readFile(policyPath, 'utf8'),
])
const fixtures = validateFixturePair(planRaw, policyRaw)
const planHash = createHash('sha256').update(planRaw, 'utf8').digest('hex')

console.info(
  `Validated ${fixtures.plan.resource_changes.length} synthetic resource changes ` +
    `against policy ${fixtures.policy.policy_version} (SHA-256 ${planHash.slice(0, 12)}…)`,
)
