/**
 * Cross-platform test entrypoint.
 *
 * Exists to remove two portability variables that bit the CI runner:
 *
 *   1. `node --test` only learned to expand glob patterns in Node 22, so a
 *      quoted "tests/ **\/*.test.ts" is taken literally and reported as a
 *      missing file on any older runner.
 *   2. cmd.exe does not expand globs at all, so leaving the pattern unquoted
 *      would fix CI and break Windows.
 *
 * Enumerating the files here settles both and decouples the test command from
 * the pinned Node version — which matters, because that version is not chosen
 * freely: better-sqlite3 is compiled during `npm ci` on the runner and then
 * rsynced, so its ABI has to match the Node running on the Droplet.
 *
 * tsx is invoked through its .mjs entry with the current node binary rather
 * than via node_modules/.bin, because Node refuses to spawn a .cmd shim
 * without a shell on Windows (EINVAL).
 */
import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const testsDir = path.join(projectRoot, 'tests')

const testFiles = readdirSync(testsDir, { recursive: true })
  .map(String)
  .filter((entry) => entry.endsWith('.test.ts'))
  .map((entry) => path.join('tests', entry))
  .sort()

if (testFiles.length === 0) {
  console.error('No test files found under tests/ — expected files ending in .test.ts')
  process.exit(1)
}

const tsxCli = path.join(projectRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const passthroughArgs = process.argv.slice(2)

const result = spawnSync(
  process.execPath,
  [tsxCli, '--test', ...passthroughArgs, ...testFiles],
  { stdio: 'inherit', cwd: projectRoot }
)

if (result.error) {
  console.error('Failed to launch the test runner:', result.error)
  process.exit(1)
}

process.exit(result.status ?? 1)
