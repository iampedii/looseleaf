// Herdr's prompt mark: ">_" in ink on a highlighter marker blob, drawn by Looseleaf's art
// engine as a doodle: herdr-mark.ts <out.svg> <size> [seed]
import { readFileSync, writeFileSync } from 'node:fs'
import { drawSkeleton } from '@/lib/ink/art-draw'
import { inkViewBox } from '@/lib/ink/builder'
import type { ArtDef } from '@/lib/ink/art/types'

const mark: ArtDef = {
  grid: 64,
  nibK: 0.06,
  kind: 'doodle',
  parts: [
    // The marker blob: an uneven rounded patch, a little wider than tall.
    ['f', 'hi', 'M10 14 C18 7 40 6 52 11 C60 15 61 30 58 42 C55 54 42 58 28 57 C14 56 6 50 5 36 C4 26 5 19 10 14 Z'],
    // The prompt.
    ['s', 'M18 21 L32 32 L18 43', 1],
    ['s', 'M35 45 L49 45', 1],
  ],
}

const css = readFileSync('src/styles/looseleaf.css', 'utf8')
const vars: Record<string, string> = {}
for (const m of css.matchAll(/--(ll-[a-z0-9-]+):\s*([^;]+);/gi)) vars[m[1]] ??= m[2].trim()
const resolve = (svg: string): string => {
  let out = svg.replace(/ mask="url\(#ll-(?:felt|graphite|marker|waxy)[^)]*\)"/g, '').replace(/var\(--ll-blend\)/g, 'multiply')
  for (let i = 0; i < 4; i++) out = out.replace(/var\(--(ll-[a-z0-9-]+)(?:,\s*([^)]*))?\)/g, (all, k, fb) => vars[k] ?? fb ?? (console.error('unresolved', k), all))
  return out.replace(/rgb\((\d+) (\d+) (\d+)\)/g, 'rgb($1,$2,$3)')
}

const [out, size, seed] = [process.argv[2], Number(process.argv[3] ?? 64), process.argv[4] ?? 'herdr-mark']
const r = drawSkeleton(mark, size, seed) as unknown as { svg: string; w: number; h: number; pad: number }
writeFileSync(out, resolve(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${inkViewBox(r)}" width="${r.w + 2 * r.pad}" height="${r.h + 2 * r.pad}">${r.svg}</svg>`))
console.log('wrote', out, r.w, r.h, r.pad)
