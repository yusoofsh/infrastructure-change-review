import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

const findingRuleIds = [
  'TF001_STATEFUL_REPLACEMENT',
  'TF002_UNSAFE_DB_DELETION',
  'AWS001_PUBLIC_DATABASE_PORT',
  'AWS002_PUBLIC_S3_ACCESS',
  'REL001_CAPACITY_REDUCTION',
  'COST001_SIZE_CLASS_JUMP',
  'BLAST001_CRITICAL_TRANSITIVE_IMPACT',
] as const

test('reviewer can load, decide, simulate, and download a report', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Infrastructure Change Review' })).toBeVisible()
  await expect(page.getByRole('status', { name: 'Empty review' })).toContainText(
    'No plan is loaded',
  )

  await page.getByRole('button', { name: 'Load synthetic plan' }).click()
  await expect(page.getByRole('region', { name: 'Review summary' })).toContainText('7 updates')
  await expect(page.getByRole('region', { name: 'Simulation overlay' })).toContainText('Blocked')

  for (const ruleId of findingRuleIds) {
    await page.getByRole('button', { name: new RegExp(ruleId, 'u') }).click()
    await page
      .getByRole('region', { name: 'Approval queue' })
      .getByRole('button', { name: 'Accept' })
      .click()
  }

  const overlay = page.getByRole('region', { name: 'Simulation overlay' })
  await expect(overlay).toContainText('Ready for a new plan')
  await expect(overlay).not.toContainText('ready to apply')

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download review report' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('infrastructure-change-review.json')
  const downloadPath = await download.path()
  expect(downloadPath).toBeTruthy()
  if (!downloadPath) {
    throw new Error('Expected a downloaded report path')
  }
  const report = JSON.parse(await readFile(downloadPath, 'utf8')) as {
    outcome: string
    applyPath: boolean
    remainingFindings: string[]
  }
  expect(report.outcome).toBe('ready_for_new_plan')
  expect(report.applyPath).toBe(false)
  expect(report.remainingFindings).toEqual([])
  expect(JSON.stringify(report)).not.toContain('SYNTHETIC_VALUE')
  expect(JSON.stringify(report)).not.toContain('<img')
})
