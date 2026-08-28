import type { PatchOperation } from '../domain/recommendations/catalog'
import { analyzeRisks } from '../domain/risks/analyze'
import type { Finding } from '../domain/risks/types'
import type {
  ChangeCounts,
  NormalizedPlan,
  NormalizedResourceChange,
} from '../domain/terraform/normalize'
import type { LoadedReviewSession } from './session'

export type OverlayOutcome = 'blocked' | 'needs_review' | 'ready_for_new_plan'

export interface OverlayControl {
  controlId: string
  description: string
}

export interface OverlayResult {
  plan: NormalizedPlan
  remainingFindings: Finding[]
  outcome: OverlayOutcome
  applyPath: false
  controls: OverlayControl[]
}

const countKeys: Record<NormalizedResourceChange['kind'], keyof ChangeCounts> = {
  create: 'create',
  update: 'update',
  replace: 'replace',
  delete: 'delete',
  'no-op': 'noOp',
  read: 'read',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function setAtPath(target: unknown, path: readonly string[], value: unknown): unknown {
  const [head, ...rest] = path
  if (head === undefined) {
    return value
  }
  const record = isRecord(target) ? { ...target } : {}
  record[head] = rest.length === 0 ? value : setAtPath(record[head], rest, value)
  return record
}

function recount(resources: readonly NormalizedResourceChange[]): ChangeCounts {
  const counts: ChangeCounts = {
    create: 0,
    update: 0,
    replace: 0,
    delete: 0,
    noOp: 0,
    read: 0,
  }
  for (const resource of resources) {
    counts[countKeys[resource.kind]] += 1
  }
  return counts
}

function clonePlan(plan: NormalizedPlan): NormalizedPlan {
  return {
    formatVersion: plan.formatVersion,
    terraformVersion: plan.terraformVersion,
    counts: { ...plan.counts },
    resources: plan.resources.map((resource) => ({
      ...resource,
      before: structuredClone(resource.before),
      after: structuredClone(resource.after),
    })),
  }
}

function applyOperation(
  resources: NormalizedResourceChange[],
  operation: PatchOperation,
  controls: OverlayControl[],
): void {
  if (operation.kind === 'add_review_control') {
    controls.push({
      controlId: operation.controlId,
      description: operation.description,
    })
    return
  }
  const index = resources.findIndex((resource) => resource.address === operation.address)
  const resource = index >= 0 ? resources[index] : undefined
  if (index < 0 || !resource) {
    return
  }
  if (operation.kind === 'cancel_change') {
    resources[index] = {
      ...resource,
      kind: 'no-op',
      destructive: false,
      after: structuredClone(resource.before),
    }
    return
  }
  resources[index] = {
    ...resource,
    after: setAtPath(resource.after, operation.path, operation.value),
  }
}

export function simulateOverlay(session: LoadedReviewSession): OverlayResult {
  const plan = clonePlan(session.snapshot.plan)
  const controls: OverlayControl[] = []
  for (const option of session.snapshot.options) {
    if (session.decisions[option.id] !== 'accepted') {
      continue
    }
    for (const operation of option.operations) {
      applyOperation(plan.resources, operation, controls)
    }
  }
  plan.counts = recount(plan.resources)
  const remainingFindings = analyzeRisks(plan, session.snapshot.policy, session.snapshot.edges)
  const hasBlocker = remainingFindings.some((finding) => finding.severity === 'blocker')
  const outcome: OverlayOutcome =
    remainingFindings.length === 0 ? 'ready_for_new_plan' : hasBlocker ? 'blocked' : 'needs_review'
  return {
    plan,
    remainingFindings,
    outcome,
    applyPath: false,
    controls,
  }
}
