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

describe('human decisions shell', () => {
  it('records an accept decision and keeps the overlay blocked', async () => {
    const user = await loadReview()
    const overlay = screen.getByRole('region', { name: 'Simulation overlay' })
    expect(overlay.textContent).toContain('Blocked')
    expect(overlay.textContent).toContain('Nothing is applied')
    expect(overlay.textContent).not.toMatch(/ready to apply/i)

    await user.click(screen.getByRole('button', { name: /AWS001_PUBLIC_DATABASE_PORT/u }))
    const queue = screen.getByRole('region', { name: 'Approval queue' })
    await user.click(within(queue).getByRole('button', { name: 'Accept' }))
    expect(within(queue).getByRole('button', { name: 'Accept' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(overlay.textContent).toContain('Blocked')
    expect(overlay.textContent).not.toContain('AWS001_PUBLIC_DATABASE_PORT')
  })

  it('reaches ready for a new plan after every recommended option is accepted', async () => {
    const user = await loadReview()
    const findings = [
      'TF001_STATEFUL_REPLACEMENT',
      'TF002_UNSAFE_DB_DELETION',
      'AWS001_PUBLIC_DATABASE_PORT',
      'AWS002_PUBLIC_S3_ACCESS',
      'REL001_CAPACITY_REDUCTION',
      'COST001_SIZE_CLASS_JUMP',
      'BLAST001_CRITICAL_TRANSITIVE_IMPACT',
    ]
    for (const ruleId of findings) {
      await user.click(screen.getByRole('button', { name: new RegExp(ruleId, 'u') }))
      await user.click(
        within(screen.getByRole('region', { name: 'Approval queue' })).getByRole('button', {
          name: 'Accept',
        }),
      )
    }
    const overlay = screen.getByRole('region', { name: 'Simulation overlay' })
    expect(overlay.textContent).toContain('Ready for a new plan')
    expect(overlay.textContent).toContain('No remaining findings')
    expect(overlay.textContent).not.toMatch(/ready to apply/i)
    expect(screen.getByRole('button', { name: 'Download review report' })).toBeTruthy()
  })

  it('requires confirmation before resetting the review', async () => {
    const user = await loadReview()
    await user.click(screen.getByRole('button', { name: 'Reset review' }))
    expect(screen.getByRole('region', { name: 'Review summary' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Confirm reset' }))
    expect(screen.getByRole('status', { name: 'Empty review' }).textContent).toContain(
      'No plan is loaded',
    )
    expect(screen.queryByRole('region', { name: 'Review summary' })).toBeNull()
  })
})
