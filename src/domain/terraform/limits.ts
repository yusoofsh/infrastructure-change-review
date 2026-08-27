export const FIXTURE_LIMITS = {
  planBytes: 2 * 1024 * 1024,
  policyBytes: 64 * 1024,
  jsonDepth: 32,
  jsonNodes: 100_000,
  objectKeys: 512,
  arrayItems: 1_000,
  stringLength: 16 * 1024,
  resourceChanges: 500,
  configurationResources: 500,
  addressLength: 512,
  referenceLength: 1_024,
  referencesPerExpression: 64,
  totalReferences: 10_000,
  replacePaths: 128,
  replacePathDepth: 32,
} as const

const prohibitedObjectKeys = new Set(['__proto__', 'constructor', 'prototype'])

export class FixtureLimitError extends Error {
  readonly code = 'FIXTURE_LIMIT_EXCEEDED'

  constructor(limitName: string) {
    super(`Fixture exceeds the ${limitName} safety limit`)
    this.name = 'FixtureLimitError'
  }
}

export function assertJsonBudget(value: unknown): void {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }]
  let nodes = 0

  while (pending.length > 0) {
    const current = pending.pop()
    if (!current) {
      break
    }

    nodes += 1
    if (nodes > FIXTURE_LIMITS.jsonNodes) {
      throw new FixtureLimitError('total JSON node')
    }
    if (current.depth > FIXTURE_LIMITS.jsonDepth) {
      throw new FixtureLimitError('JSON nesting depth')
    }
    if (typeof current.value === 'string') {
      if (current.value.length > FIXTURE_LIMITS.stringLength) {
        throw new FixtureLimitError('string length')
      }
      continue
    }
    if (Array.isArray(current.value)) {
      if (current.value.length > FIXTURE_LIMITS.arrayItems) {
        throw new FixtureLimitError('array item')
      }
      for (const item of current.value) {
        pending.push({ value: item, depth: current.depth + 1 })
      }
      continue
    }
    if (current.value !== null && typeof current.value === 'object') {
      const entries = Object.entries(current.value)
      if (entries.length > FIXTURE_LIMITS.objectKeys) {
        throw new FixtureLimitError('object key')
      }
      for (const [key, child] of entries) {
        if (prohibitedObjectKeys.has(key)) {
          throw new FixtureLimitError('prohibited object key')
        }
        pending.push({ value: child, depth: current.depth + 1 })
      }
    }
  }
}
