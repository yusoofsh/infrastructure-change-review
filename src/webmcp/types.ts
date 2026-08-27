import type { ReviewSession } from '../review/session'

export type WebMcpErrorCode =
  | 'PLAN_NOT_LOADED'
  | 'FINDING_NOT_FOUND'
  | 'RESOURCE_NOT_FOUND'
  | 'INVALID_TOOL_INPUT'

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { readonly [key: string]: JsonValue }

export interface ToolAnnotations {
  readOnlyHint: boolean
  untrustedContentHint: boolean
}

export interface JsonSchemaProperty {
  type: 'string'
  description: string
}

export interface JsonSchemaObject {
  type: 'object'
  properties: Record<string, JsonSchemaProperty>
  additionalProperties: false
  required?: string[]
}

export interface ReviewToolMetadata {
  name: ReviewToolName
  title: string
  description: string
  inputSchema: JsonSchemaObject
  annotations: ToolAnnotations
}

export const REVIEW_TOOL_NAMES = [
  'load_synthetic_plan',
  'get_review_summary',
  'list_findings',
  'select_finding',
  'inspect_resource',
  'list_dependencies',
  'list_mitigation_options',
] as const

export type ReviewToolName = (typeof REVIEW_TOOL_NAMES)[number]

export type ToolResult =
  | { ok: true; data: JsonValue }
  | { ok: false; error: { code: WebMcpErrorCode; message: string } }

export interface ToolExecution {
  session: ReviewSession
  result: ToolResult
  summary: string
}

export interface ModelContextTool {
  name: string
  title: string
  description: string
  inputSchema: JsonSchemaObject
  annotations: ToolAnnotations
  execute: (input: unknown) => Promise<ToolResult> | ToolResult
}

export interface ModelContext {
  registerTool(tool: ModelContextTool, options?: { signal?: AbortSignal }): Promise<void> | void
}
