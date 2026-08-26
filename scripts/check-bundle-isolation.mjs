/**
 * Fail if Effect reached a browser bundle.
 *
 * Effect is a server-side dependency here: core/server/mcp/auth may import it,
 * `@comp/admin` may not. Nothing enforces that at the type level — admin imports
 * from the `@comp/core` barrel, which re-exports modules that do use Effect, so
 * only tree-shaking keeps it out. Tree-shaking is a bundler's choice, not a
 * guarantee, which is why this runs in CI.
 *
 * Matching on the bare word "effect" would hit React's own `useEffect`; these
 * markers appear only in the library's emitted code.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const BUNDLES = [
  'examples/shop-d1/dist/client/assets',
  'examples/blog-d1/dist/client/assets',
]

const MARKERS = ['EffectTypeId', 'FiberRuntime', 'effect_internal', '@effect/']

let failed = false
let checked = 0

for (const dir of BUNDLES) {
  let entries
  try {
    entries = readdirSync(dir).filter((name) => name.endsWith('.js'))
  } catch {
    console.error(`no bundle at ${dir} — run the example's build:client first`)
    failed = true
    continue
  }
  for (const name of entries) {
    const path = join(dir, name)
    const source = readFileSync(path, 'utf8')
    const hits = MARKERS.filter((marker) => source.includes(marker))
    checked += 1
    if (hits.length > 0) {
      console.error(
        `${path}: Effect leaked into a browser bundle (${hits.join(', ')})`,
      )
      failed = true
    }
  }
}

if (failed) process.exit(1)
console.log(`bundle isolation OK — ${checked} bundle(s) carry no Effect`)
