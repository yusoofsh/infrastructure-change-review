import { describe, expect, it } from 'vitest'
import { createEmptySession, type ReviewSession } from '../../src/review/session'
import { REVIEW_TOOL_NAMES } from '../../src/webmcp/catalog'
import { registerReviewTools } from '../../src/webmcp/register'
import type { AuditEvent, ReviewStore } from '../../src/webmcp/store'

function createStore(): ReviewStore {
  let session: ReviewSession = createEmptySession()
  const events: AuditEvent[] = []
  return {
    getSession: () => session,
    setSession: (next) => {
      session = next
    },
    recordAudit: (event) => {
      events.push({ ...event, id: `audit-${events.length + 1}` })
    },
  }
}

type CapturedTool = {
  name: string
  description: string
  title?: string
  inputSchema: unknown
  annotations?: unknown
  execute: (input?: unknown) => Promise<unknown> | unknown
}

function createHost() {
  const tools: CapturedTool[] = []
  const host = {
    registerTool: async (tool: CapturedTool, options?: { signal?: AbortSignal }) => {
      tools.push(tool)
      options?.signal?.addEventListener('abort', () => {
        const index = tools.indexOf(tool)
        if (index >= 0) {
          tools.splice(index, 1)
        }
      })
    },
  }
  return { host, tools }
}

describe('webmcp registration', () => {
  it('registers the catalog on document.modelContext when present', async () => {
    const { host, tools } = createHost()
    const result = await registerReviewTools(createStore(), {
      document: { modelContext: host },
    })
    expect(result.status).toBe('registered')
    if (result.status !== 'registered') {
      return
    }
    expect(result.host).toBe('document')
    expect(tools.map(({ name }) => name)).toEqual(REVIEW_TOOL_NAMES)
  })

  it('falls back to navigator.modelContext when document has none', async () => {
    const { host, tools } = createHost()
    const result = await registerReviewTools(createStore(), {
      navigator: { modelContext: host },
    })
    expect(result.status).toBe('registered')
    if (result.status !== 'registered') {
      return
    }
    expect(result.host).toBe('navigator')
    expect(tools).toHaveLength(10)
  })

  it('prefers document.modelContext over navigator.modelContext', async () => {
    const documentHost = createHost()
    const navigatorHost = createHost()
    const result = await registerReviewTools(createStore(), {
      document: { modelContext: documentHost.host },
      navigator: { modelContext: navigatorHost.host },
    })
    expect(result.status).toBe('registered')
    if (result.status !== 'registered') {
      return
    }
    expect(result.host).toBe('document')
    expect(documentHost.tools).toHaveLength(10)
    expect(navigatorHost.tools).toHaveLength(0)
  })

  it('returns unavailable without throwing when no host exists', async () => {
    await expect(registerReviewTools(createStore(), {})).resolves.toEqual({
      status: 'unavailable',
    })
  })

  it('unregisters tools when the returned abort runs', async () => {
    const { host, tools } = createHost()
    const result = await registerReviewTools(createStore(), {
      document: { modelContext: host },
    })
    expect(result.status).toBe('registered')
    if (result.status !== 'registered') {
      return
    }
    result.abort()
    expect(tools).toHaveLength(0)
  })
})
