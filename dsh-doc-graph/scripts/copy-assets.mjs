/**
 * Keep lib/ self-contained for static package scans: copy the bundled skill
 * body into lib/assets/. Runtime resolution in skill.ts uses the package-root
 * assets/ (package.json `files` ships it), so this copy is a packaging aid,
 * not the runtime source.
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
mkdirSync(join(root, 'lib', 'assets'), { recursive: true })
copyFileSync(
  join(root, 'assets', 'doc-graph-skill.md'),
  join(root, 'lib', 'assets', 'doc-graph-skill.md'),
)
console.log('copied assets/doc-graph-skill.md -> lib/assets/doc-graph-skill.md')
