import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'

const productSourceRoot = 'src'
const codeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx'])
const prohibitedSourcePatterns = [
  { label: 'process execution', pattern: /(?:node:)?child_process|Bun\.spawn|Deno\.Command/u },
  {
    label: 'dynamic code execution',
    pattern: /\beval\s*\(|\b(?:new\s+)?Function\s*\(/u,
  },
  {
    label: 'unsafe HTML rendering',
    pattern:
      /\.innerHTML\b|\.outerHTML\b|\bdangerouslySetInnerHTML\b|\binsertAdjacentHTML\s*\(|document\.write\s*\(/u,
  },
  {
    label: 'application network call',
    pattern: /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|sendBeacon\s*\(/u,
  },
  { label: 'cloud SDK', pattern: /@aws-sdk\/|\baws-sdk\b/u },
] as const
const prohibitedDependencyPattern = /(?:^|[/_-])(?:aws-sdk|terraform|execa|shelljs)(?:$|[/_-])/u

async function collectCodeFiles(directory: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectCodeFiles(path)))
      continue
    }
    if (codeExtensions.has(extname(entry.name))) {
      files.push(path)
    }
  }
  return files
}

const violations: string[] = []
for (const path of await collectCodeFiles(productSourceRoot)) {
  const source = await readFile(path, 'utf8')
  for (const check of prohibitedSourcePatterns) {
    if (check.pattern.test(source)) {
      violations.push(`${relative('.', path)}: ${check.label}`)
    }
  }
}

const packageManifest = JSON.parse(await readFile('package.json', 'utf8')) as {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}
for (const dependency of Object.keys({
  ...packageManifest.dependencies,
  ...packageManifest.devDependencies,
})) {
  if (prohibitedDependencyPattern.test(dependency)) {
    violations.push(`package.json: prohibited dependency ${dependency}`)
  }
}

if (violations.length > 0) {
  throw new Error(`Safety boundary check failed:\n${violations.join('\n')}`)
}

console.info('Safety boundary check passed (no execution, network, unsafe HTML, or cloud SDK path)')
