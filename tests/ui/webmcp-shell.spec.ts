/** @vitest-environment happy-dom */

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../../src/App'
import { REVIEW_TOOL_NAMES } from '../../src/webmcp/catalog'

type CapturedTool = {
  name: string
  description: string
  title?: string
  inputSchema: unknown
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }
  execute: (input?: unknown) => Promise<unknown> | unknown
}

function installDocumentHost() {
  const tools: CapturedTool[] = []
  const host = {
    registerTool: async (tool: CapturedTool) => {
      tools.push(tool)
    },
  }
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    value: host,
  })
  return tools
}

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(document, 'modelContext')
  Reflect.deleteProperty(navigator, 'modelContext')
})

describe('webmcp shell', () => {
  it('shows a visible fallback and keeps the manual workflow when WebMCP is absent', async () => {
    const user = userEvent.setup()
    render(createElement(App))
    expect(screen.getByRole('status', { name: 'WebMCP status' }).textContent).toContain(
      'This browser does not expose WebMCP. Use the review panels.',
    )
    await user.click(screen.getByRole('button', { name: 'Load synthetic plan' }))
    expect(screen.getByRole('region', { name: 'Review summary' }).textContent).toContain(
      '7 updates',
    )
    expect(screen.getByRole('region', { name: 'Agent audit' }).textContent).toContain(
      'No agent tool calls yet.',
    )
  })

  it('registers tools, syncs the workspace, and keeps annotations free of plan text', async () => {
    const tools = installDocumentHost()
    render(createElement(App))

    await waitFor(() => {
      expect(tools.map(({ name }) => name)).toEqual(REVIEW_TOOL_NAMES)
    })
    expect(screen.getByRole('status', { name: 'WebMCP status' }).textContent).toContain(
      'Agent tools are registered in this browser.',
    )

    const metadata = JSON.stringify(
      tools.map(({ name, description, title, inputSchema, annotations }) => ({
        name,
        description,
        title,
        inputSchema,
        annotations,
      })),
    )
    expect(metadata).not.toContain('SYSTEM OVERRIDE')
    expect(metadata).not.toContain('attacker.invalid')

    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]))
    const load = byName.load_synthetic_plan
    const inspect = byName.inspect_resource
    const select = byName.select_finding
    if (!load || !inspect || !select) {
      throw new Error('Expected load, inspect, and select tools')
    }

    await load.execute({})
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Review summary' }).textContent).toContain(
        '7 updates',
      )
    })

    await select.execute({ findingId: 'finding-AWS001_PUBLIC_DATABASE_PORT' })
    await waitFor(() => {
      const inspector = screen.getByRole('region', { name: 'Resource inspector' })
      expect(inspector.textContent).toContain('aws_security_group_rule.database_ingress')
    })

    await inspect.execute({ address: 'aws_instance.worker' })
    await waitFor(() => {
      const inspector = screen.getByRole('region', { name: 'Resource inspector' })
      expect(inspector.textContent).toContain('SYSTEM OVERRIDE')
      expect(inspector.innerHTML).not.toContain('<img src')
    })

    await inspect.execute({ address: 'attacker.invalid' })
    const audit = screen.getByRole('region', { name: 'Agent audit' })
    expect(audit.textContent).toContain('load_synthetic_plan')
    expect(audit.textContent).toContain('inspect_resource')
    expect(audit.textContent).not.toContain('attacker.invalid')
    expect(within(audit).queryByText(/SYNTHETIC_VALUE/u)).toBeNull()
  })
})
