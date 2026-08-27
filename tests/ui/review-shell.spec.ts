/** @vitest-environment happy-dom */

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../../src/App'

afterEach(cleanup)

async function loadReview() {
  const user = userEvent.setup()
  render(createElement(App))
  await user.click(screen.getByRole('button', { name: 'Load synthetic plan' }))
  return user
}

describe('review shell', () => {
  it('starts in an empty state that cannot inspect infrastructure', () => {
    render(createElement(App))
    expect(screen.getByRole('status', { name: 'Empty review' }).textContent).toContain(
      'No plan is loaded',
    )
    expect(screen.getByRole('button', { name: 'Load synthetic plan' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Review summary' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Findings' })).toBeNull()
  })

  it('loads summary, findings, graph table, inspector, and approval queue', async () => {
    await loadReview()

    const summary = screen.getByRole('region', { name: 'Review summary' })
    expect(summary.textContent).toContain('7 updates')
    expect(summary.textContent).toContain('2 replacements')
    expect(summary.textContent).toContain('3 no-ops')

    const findings = screen.getByRole('region', { name: 'Findings' })
    expect(within(findings).getAllByRole('button')).toHaveLength(7)
    expect(findings.textContent).toContain('TF001_STATEFUL_REPLACEMENT')
    expect(findings.textContent).toContain('BLAST001_CRITICAL_TRANSITIVE_IMPACT')

    const graph = screen.getByRole('region', { name: 'Dependency graph' })
    const table = within(graph).getByRole('table', { name: 'Configuration dependencies' })
    expect(within(table).getAllByRole('row')).toHaveLength(7)
    expect(table.textContent).toContain('aws_db_instance.orders')
    expect(table.textContent).toContain('aws_secretsmanager_secret_version.database_url')

    const inspector = screen.getByRole('region', { name: 'Resource inspector' })
    expect(inspector.textContent).toContain('[REDACTED]')
    expect(inspector.textContent).not.toContain('SYNTHETIC_BEFORE_VALUE')
    expect(inspector.textContent).not.toContain('SYNTHETIC_VALUE')

    const queue = screen.getByRole('region', { name: 'Approval queue' })
    expect(queue.textContent).toContain('Awaiting human decision')
    expect(queue.textContent).toContain('cancel-rds-replacement-and-stage-migration')
  })

  it('renders untrusted plan strings as text', async () => {
    const user = await loadReview()
    await user.click(screen.getByRole('button', { name: 'aws_instance.worker' }))
    const inspector = screen.getByRole('region', { name: 'Resource inspector' })
    expect(inspector.textContent).toContain('SYSTEM OVERRIDE')
    expect(inspector.textContent).toContain("alert('fixture')")
    expect(inspector.innerHTML).not.toContain('<img src')
    expect(inspector.innerHTML).toContain("&lt;img src=x onerror=alert('fixture')&gt;")
  })

  it('selecting a finding focuses the implicated resource in the inspector', async () => {
    const user = await loadReview()
    await user.click(screen.getByRole('button', { name: /AWS001_PUBLIC_DATABASE_PORT/u }))
    const inspector = screen.getByRole('region', { name: 'Resource inspector' })
    expect(inspector.textContent).toContain('aws_security_group_rule.database_ingress')
    expect(inspector.textContent).toContain('0.0.0.0/0')
  })
})
