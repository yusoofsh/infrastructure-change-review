import { access, readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'

const pagesFileLimit = 20_000
const pagesFileSizeLimit = 25 * 1024 * 1024

const pagesConfigurationSchema = z
  .object({
    $schema: z.literal('./node_modules/wrangler/config-schema.json'),
    name: z.literal('infrastructure-change-review'),
    pages_build_output_dir: z.literal('./dist'),
    compatibility_date: z.literal('2026-08-27'),
  })
  .strict()

async function collectFiles(directory: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)))
      continue
    }
    files.push(path)
  }
  return files
}

async function assertPathAbsent(path: string, capability: string): Promise<void> {
  try {
    await access(path)
  } catch {
    return
  }
  throw new Error(`Cloudflare artifact must not contain ${capability}: ${path}`)
}

const configurationRaw = await readFile('wrangler.jsonc', 'utf8')
let configuration: unknown
try {
  configuration = JSON.parse(configurationRaw) as unknown
} catch {
  throw new Error('wrangler.jsonc must remain valid JSONC-compatible JSON')
}
pagesConfigurationSchema.parse(configuration)

await Promise.all([
  assertPathAbsent('functions', 'Pages Functions'),
  assertPathAbsent('dist/_worker.js', 'a Pages Worker'),
])

const files = await collectFiles('dist')
if (files.length === 0 || files.length > pagesFileLimit) {
  throw new Error(`Cloudflare Pages build contains an invalid file count: ${files.length}`)
}
for (const file of files) {
  const metadata = await stat(file)
  if (metadata.size > pagesFileSizeLimit) {
    throw new Error(`Cloudflare Pages asset exceeds 25 MiB: ${file}`)
  }
}

const [document, headers] = await Promise.all([
  readFile('dist/index.html', 'utf8'),
  readFile('dist/_headers', 'utf8'),
])
if (!document.includes('<title>Infrastructure Change Review</title>')) {
  throw new Error('Cloudflare Pages build is missing the expected project title')
}
for (const requiredDirective of [
  "connect-src 'none'",
  "frame-ancestors 'none'",
  'Referrer-Policy: no-referrer',
  'X-Content-Type-Options: nosniff',
  'Permissions-Policy: tools=(self)',
]) {
  if (!headers.includes(requiredDirective)) {
    throw new Error(`Cloudflare Pages headers are missing: ${requiredDirective}`)
  }
}

console.info(
  `Cloudflare Pages artifact validated (${files.length} files, restrictive headers, no runtime bindings)`,
)
