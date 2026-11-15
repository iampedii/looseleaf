// Draws Looseleaf icons once as SVG files for Herdr: herdr-icons.ts <out dir> <name...>
import { writeFileSync, mkdirSync } from 'node:fs'
import { icons } from '@/lib/ink/art/icons'
import { drawSkeleton } from '@/lib/ink/art-draw'
import { inkViewBox } from '@/lib/ink/builder'

const out = process.argv[2]
mkdirSync(out, { recursive: true })
for (const name of process.argv.slice(3)) {
  const def = (icons as Record<string, unknown>)[name]
  if (!def) { console.error('missing', name); continue }
  const r = drawSkeleton(def as never, 24, name, { kind: 'icon', pad: 1 } as never)
  // toSvg gives the inner markup; Herdr's svg() wants a whole file (tinted by text colour).
  writeFileSync(`${out}/${name}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${inkViewBox(r)}" width="24" height="24">${r.svg}</svg>`)
}
