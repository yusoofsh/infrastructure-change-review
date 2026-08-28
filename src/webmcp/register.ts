import { reviewToolMetadata } from './catalog'
import { invokeReviewTool } from './invoke'
import type { ReviewStore } from './store'
import type { ModelContext } from './types'

export interface RegisterHosts {
  document?: object
  navigator?: object
}

export type WebMcpRegistration =
  | { status: 'unavailable' }
  | { status: 'registered'; host: 'document' | 'navigator'; abort: () => void }

function readModelContext(container: object | undefined): ModelContext | undefined {
  if (container === undefined || !('modelContext' in container)) {
    return undefined
  }
  const candidate = container.modelContext
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    !('registerTool' in candidate) ||
    typeof candidate.registerTool !== 'function'
  ) {
    return undefined
  }
  return candidate as ModelContext
}

export function defaultHosts(): RegisterHosts {
  const hosts: RegisterHosts = {}
  if (typeof document !== 'undefined') {
    hosts.document = document
  }
  if (typeof navigator !== 'undefined') {
    hosts.navigator = navigator
  }
  return hosts
}

function resolveHost(
  hosts: RegisterHosts,
): { host: 'document' | 'navigator'; context: ModelContext } | undefined {
  const documentContext = readModelContext(hosts.document)
  if (documentContext) {
    return { host: 'document', context: documentContext }
  }
  const navigatorContext = readModelContext(hosts.navigator)
  if (navigatorContext) {
    return { host: 'navigator', context: navigatorContext }
  }
  return undefined
}

export async function registerReviewTools(
  store: ReviewStore,
  hosts: RegisterHosts = defaultHosts(),
): Promise<WebMcpRegistration> {
  const resolved = resolveHost(hosts)
  if (!resolved) {
    return { status: 'unavailable' }
  }

  const controller = new AbortController()
  try {
    for (const tool of reviewToolMetadata) {
      const name = tool.name
      await resolved.context.registerTool(
        {
          name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
          execute: (input: unknown) => invokeReviewTool(store, name, input),
        },
        { signal: controller.signal },
      )
    }
  } catch {
    controller.abort()
    return { status: 'unavailable' }
  }

  return {
    status: 'registered',
    host: resolved.host,
    abort: () => {
      controller.abort()
    },
  }
}
