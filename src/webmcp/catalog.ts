import { z } from 'zod'
import type { MitigationOption } from '../domain/recommendations/catalog'
import type { Finding } from '../domain/risks/types'
import type { NormalizedResourceChange } from '../domain/terraform/normalize'
import type { DependencyEdge } from '../domain/terraform/references'
import {
  type LoadedReviewSession,
  loadBundledReview,
  type ReviewSession,
  selectFinding,
  selectResource,
} from '../review/session'
import { WebMcpError } from './errors'
import {
  type JsonValue,
  REVIEW_TOOL_NAMES,
  type ReviewToolMetadata,
  type ReviewToolName,
  type ToolExecution,
} from './types'

export { REVIEW_TOOL_NAMES, type ReviewToolName } from './types'

const emptyInputSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const satisfies ReviewToolMetadata['inputSchema']

const EmptyInput = z.object({}).strict()
const SelectFindingInput = z.object({ findingId: z.string().min(1) }).strict()
const InspectResourceInput = z.object({ address: z.string().min(1) }).strict()

const untrusted = {
  readOnlyHint: true,
  untrustedContentHint: true,
} as const

const mutating = {
  readOnlyHint: false,
  untrustedContentHint: true,
} as const

export const reviewToolMetadata: readonly ReviewToolMetadata[] = [
  {
    name: 'load_synthetic_plan',
    title: 'Load synthetic plan',
    description:
      'Load the bundled synthetic Terraform plan into the shared review session. This is a simulation and does not apply infrastructure.',
    inputSchema: emptyInputSchema,
    annotations: mutating,
  },
  {
    name: 'get_review_summary',
    title: 'Get review summary',
    description: 'Return exclusive change counts and the current selection from the loaded review.',
    inputSchema: emptyInputSchema,
    annotations: untrusted,
  },
  {
    name: 'list_findings',
    title: 'List findings',
    description: 'List deterministic risk findings for the loaded synthetic plan.',
    inputSchema: emptyInputSchema,
    annotations: untrusted,
  },
  {
    name: 'select_finding',
    title: 'Select finding',
    description: 'Select a finding in the shared review session using its id from list_findings.',
    inputSchema: {
      type: 'object',
      properties: {
        findingId: {
          type: 'string',
          description: 'Finding id returned by list_findings',
        },
      },
      required: ['findingId'],
      additionalProperties: false,
    },
    annotations: mutating,
  },
  {
    name: 'inspect_resource',
    title: 'Inspect resource',
    description:
      'Inspect a known plan resource and focus it in the inspector. The address must match a resource in the loaded plan.',
    inputSchema: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Exact Terraform address of a resource in the loaded plan',
        },
      },
      required: ['address'],
      additionalProperties: false,
    },
    annotations: mutating,
  },
  {
    name: 'list_dependencies',
    title: 'List dependencies',
    description: 'List configuration dependency edges for the loaded synthetic plan.',
    inputSchema: emptyInputSchema,
    annotations: untrusted,
  },
  {
    name: 'list_mitigation_options',
    title: 'List mitigation options',
    description: 'List recommended mitigation options. None are applied; a human must decide.',
    inputSchema: emptyInputSchema,
    annotations: untrusted,
  },
]

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input ?? {})
  if (!parsed.success) {
    throw new WebMcpError('INVALID_TOOL_INPUT', 'The tool input did not match the schema')
  }
  return parsed.data
}

function requireLoaded(session: ReviewSession): LoadedReviewSession {
  if (session.status !== 'loaded') {
    throw new WebMcpError('PLAN_NOT_LOADED', 'Load the synthetic plan before using this tool')
  }
  return session
}

function asJson(value: unknown): JsonValue {
  return value as JsonValue
}

function findingPayload(finding: Finding): JsonValue {
  return {
    id: finding.id,
    ruleId: finding.ruleId,
    category: finding.category,
    severity: finding.severity,
    title: finding.title,
    resourceAddresses: finding.resourceAddresses,
    mitigationOptionIds: finding.mitigationOptionIds,
  }
}

function optionPayload(option: MitigationOption): JsonValue {
  return {
    id: option.id,
    findingId: option.findingId,
    title: option.title,
    operations: asJson(option.operations),
  }
}

function edgePayload(edge: DependencyEdge): JsonValue {
  return {
    dependency: edge.dependency,
    dependent: edge.dependent,
    evidence: edge.evidence,
  }
}

function resourcePayload(resource: NormalizedResourceChange): JsonValue {
  return {
    address: resource.address,
    type: resource.type,
    name: resource.name,
    kind: resource.kind,
    destructive: resource.destructive,
    before: asJson(resource.before),
    after: asJson(resource.after),
  }
}

function loadPlan(input: unknown, _session: ReviewSession): ToolExecution {
  parseInput(EmptyInput, input)
  const session = loadBundledReview()
  return {
    session,
    summary: 'Loaded the bundled synthetic plan',
    result: {
      ok: true,
      data: {
        status: 'loaded',
        counts: asJson(session.snapshot.plan.counts),
        findingCount: session.snapshot.findings.length,
        selectedFindingId: session.selectedFindingId,
        selectedResourceAddress: session.selectedResourceAddress,
      },
    },
  }
}

function getSummary(input: unknown, session: ReviewSession): ToolExecution {
  parseInput(EmptyInput, input)
  const loaded = requireLoaded(session)
  return {
    session: loaded,
    summary: 'Returned the review summary',
    result: {
      ok: true,
      data: {
        terraformVersion: loaded.snapshot.plan.terraformVersion,
        formatVersion: loaded.snapshot.plan.formatVersion,
        counts: asJson(loaded.snapshot.plan.counts),
        resourceCount: loaded.snapshot.plan.resources.length,
        findingCount: loaded.snapshot.findings.length,
        edgeCount: loaded.snapshot.edges.length,
        selectedFindingId: loaded.selectedFindingId,
        selectedResourceAddress: loaded.selectedResourceAddress,
      },
    },
  }
}

function listFindings(input: unknown, session: ReviewSession): ToolExecution {
  parseInput(EmptyInput, input)
  const loaded = requireLoaded(session)
  return {
    session: loaded,
    summary: 'Listed findings',
    result: {
      ok: true,
      data: { findings: loaded.snapshot.findings.map(findingPayload) },
    },
  }
}

function selectFindingTool(input: unknown, session: ReviewSession): ToolExecution {
  const { findingId } = parseInput(SelectFindingInput, input)
  const loaded = requireLoaded(session)
  const next = selectFinding(loaded, findingId)
  if (next === loaded) {
    throw new WebMcpError('FINDING_NOT_FOUND', 'The requested finding is not in the current review')
  }
  return {
    session: next,
    summary: 'Selected a finding',
    result: {
      ok: true,
      data: {
        selectedFindingId: next.selectedFindingId,
        selectedResourceAddress: next.selectedResourceAddress,
      },
    },
  }
}

function inspectResource(input: unknown, session: ReviewSession): ToolExecution {
  const { address } = parseInput(InspectResourceInput, input)
  const loaded = requireLoaded(session)
  const resource = loaded.snapshot.plan.resources.find((candidate) => candidate.address === address)
  if (!resource) {
    throw new WebMcpError(
      'RESOURCE_NOT_FOUND',
      'The requested resource is not in the current review',
    )
  }
  const next = selectResource(loaded, address)
  return {
    session: next,
    summary: 'Inspected a resource',
    result: {
      ok: true,
      data: resourcePayload(resource),
    },
  }
}

function listDependencies(input: unknown, session: ReviewSession): ToolExecution {
  parseInput(EmptyInput, input)
  const loaded = requireLoaded(session)
  return {
    session: loaded,
    summary: 'Listed configuration dependencies',
    result: {
      ok: true,
      data: { edges: loaded.snapshot.edges.map(edgePayload) },
    },
  }
}

function listMitigations(input: unknown, session: ReviewSession): ToolExecution {
  parseInput(EmptyInput, input)
  const loaded = requireLoaded(session)
  return {
    session: loaded,
    summary: 'Listed mitigation options',
    result: {
      ok: true,
      data: { options: loaded.snapshot.options.map(optionPayload) },
    },
  }
}

const executors: Record<ReviewToolName, (input: unknown, session: ReviewSession) => ToolExecution> =
  {
    load_synthetic_plan: loadPlan,
    get_review_summary: getSummary,
    list_findings: listFindings,
    select_finding: selectFindingTool,
    inspect_resource: inspectResource,
    list_dependencies: listDependencies,
    list_mitigation_options: listMitigations,
  }

export function executeReviewTool(
  name: ReviewToolName,
  input: unknown,
  session: ReviewSession,
): ToolExecution {
  try {
    return executors[name](input, session)
  } catch (error) {
    if (error instanceof WebMcpError) {
      return {
        session,
        summary: error.auditSummary,
        result: {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
      }
    }
    throw error
  }
}

export function isReviewToolName(value: string): value is ReviewToolName {
  return (REVIEW_TOOL_NAMES as readonly string[]).includes(value)
}
