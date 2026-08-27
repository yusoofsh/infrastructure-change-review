import { listMitigationOptions, type MitigationOption } from '../domain/recommendations/catalog'
import { analyzeRisks } from '../domain/risks/analyze'
import type { Finding } from '../domain/risks/types'
import { validateFixturePair } from '../domain/terraform/fixture-contract'
import { type NormalizedPlan, normalizeTerraformPlan } from '../domain/terraform/normalize'
import type { ReviewPolicy } from '../domain/terraform/policy-schema'
import { type DependencyEdge, extractDependencyEdges } from '../domain/terraform/references'
import policyFixture from '../fixtures/aws-review-policy.json'
import planFixture from '../fixtures/aws-risky-plan.json'

export type DecisionStatus = 'pending' | 'accepted' | 'rejected' | 'deferred'

const decisionStatuses = new Set<string>(['pending', 'accepted', 'rejected', 'deferred'])

export interface ReviewSnapshot {
  plan: NormalizedPlan
  policy: ReviewPolicy
  edges: DependencyEdge[]
  findings: Finding[]
  options: MitigationOption[]
}

export interface EmptyReviewSession {
  status: 'empty'
  selectedResourceAddress: null
  selectedFindingId: null
  snapshot: null
}

export interface LoadedReviewSession {
  status: 'loaded'
  selectedResourceAddress: string | null
  selectedFindingId: string | null
  snapshot: ReviewSnapshot
  decisions: Readonly<Record<string, DecisionStatus>>
  resetPending: boolean
}

export type ReviewSession = EmptyReviewSession | LoadedReviewSession

export function createEmptySession(): EmptyReviewSession {
  return {
    status: 'empty',
    selectedResourceAddress: null,
    selectedFindingId: null,
    snapshot: null,
  }
}

function pendingDecisions(options: readonly MitigationOption[]): Record<string, DecisionStatus> {
  return Object.fromEntries(options.map((option) => [option.id, 'pending']))
}

export function loadBundledReview(): LoadedReviewSession {
  const fixtures = validateFixturePair(JSON.stringify(planFixture), JSON.stringify(policyFixture))
  const plan = normalizeTerraformPlan(fixtures.plan)
  const edges = extractDependencyEdges(fixtures.plan)
  const findings = analyzeRisks(plan, fixtures.policy, edges)
  const options = listMitigationOptions(findings)
  return {
    status: 'loaded',
    selectedResourceAddress:
      findings[0]?.resourceAddresses[0] ?? plan.resources[0]?.address ?? null,
    selectedFindingId: findings[0]?.id ?? null,
    snapshot: {
      plan,
      policy: fixtures.policy,
      edges,
      findings,
      options,
    },
    decisions: pendingDecisions(options),
    resetPending: false,
  }
}

export function selectResource(session: EmptyReviewSession, address: string): EmptyReviewSession
export function selectResource(session: LoadedReviewSession, address: string): LoadedReviewSession
export function selectResource(session: ReviewSession, address: string): ReviewSession
export function selectResource(session: ReviewSession, address: string): ReviewSession {
  if (session.status !== 'loaded') {
    return session
  }
  const known = session.snapshot.plan.resources.some((resource) => resource.address === address)
  if (!known) {
    return session
  }
  return {
    ...session,
    selectedResourceAddress: address,
  }
}

export function selectFinding(session: EmptyReviewSession, findingId: string): EmptyReviewSession
export function selectFinding(session: LoadedReviewSession, findingId: string): LoadedReviewSession
export function selectFinding(session: ReviewSession, findingId: string): ReviewSession
export function selectFinding(session: ReviewSession, findingId: string): ReviewSession {
  if (session.status !== 'loaded') {
    return session
  }
  const finding = session.snapshot.findings.find((candidate) => candidate.id === findingId)
  if (!finding) {
    return session
  }
  return {
    ...session,
    selectedFindingId: findingId,
    selectedResourceAddress: finding.resourceAddresses[0] ?? session.selectedResourceAddress,
  }
}

export function recordDecision(
  session: EmptyReviewSession,
  optionId: string,
  status: DecisionStatus,
): EmptyReviewSession
export function recordDecision(
  session: LoadedReviewSession,
  optionId: string,
  status: DecisionStatus,
): LoadedReviewSession
export function recordDecision(
  session: ReviewSession,
  optionId: string,
  status: DecisionStatus,
): ReviewSession
export function recordDecision(
  session: ReviewSession,
  optionId: string,
  status: DecisionStatus,
): ReviewSession {
  if (session.status !== 'loaded') {
    return session
  }
  if (!decisionStatuses.has(status)) {
    return session
  }
  const known = session.snapshot.options.some((option) => option.id === optionId)
  if (!known) {
    return session
  }
  return {
    ...session,
    decisions: {
      ...session.decisions,
      [optionId]: status,
    },
  }
}

export function beginReset(session: EmptyReviewSession): EmptyReviewSession
export function beginReset(session: LoadedReviewSession): LoadedReviewSession
export function beginReset(session: ReviewSession): ReviewSession
export function beginReset(session: ReviewSession): ReviewSession {
  if (session.status !== 'loaded') {
    return session
  }
  return {
    ...session,
    resetPending: true,
  }
}

export function cancelReset(session: EmptyReviewSession): EmptyReviewSession
export function cancelReset(session: LoadedReviewSession): LoadedReviewSession
export function cancelReset(session: ReviewSession): ReviewSession
export function cancelReset(session: ReviewSession): ReviewSession {
  if (session.status !== 'loaded') {
    return session
  }
  return {
    ...session,
    resetPending: false,
  }
}

export function confirmReset(session: ReviewSession): ReviewSession {
  if (session.status !== 'loaded' || !session.resetPending) {
    return session
  }
  return createEmptySession()
}
