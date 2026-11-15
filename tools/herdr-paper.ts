// Draws Looseleaf paper sheets as plain SVG for Herdr: herdr-paper.ts <jobs.json>
// jobs: [{ stock, edge?, w, h, seed?, out }]. Palette variables become hex; page-only masks are dropped.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { paperSheet } from '@/lib/ink/recipes/paper-ink'
import { stockOf } from '@/lib/ink/paper/stocks'

const css = readFileSync('src/styles/looseleaf.css', 'utf8')
const vars: Record<string, string> = {}
for (const m of css.matchAll(/--(ll-[a-z0-9-]+):\s*([^;]+);/gi)) vars[m[1]] ??= m[2].trim()
const resolve = (svg: string): string => {
  let out = svg.replace(/ mask="url\(#[^)]*\)"/g, '')
  for (let i = 0; i < 4; i++) out = out.replace(/var\(--(ll-[a-z0-9-]+)(?:,\s*([^)]*))?\)/g, (all, k, fb) => vars[k] ?? fb ?? (console.error('unresolved', k), all))
  return out
}

interface Job { stock: string; edge?: unknown; w: number; h: number; seed?: string; out: string }
for (const j of JSON.parse(readFileSync(process.argv[2], 'utf8')) as Job[]) {
  const S = stockOf(j.stock as never)
  const r = paperSheet(j.seed ?? `herdr-${j.stock}`, j.w, j.h, { stock: j.stock as never, edge: (j.edge ?? S.edge) as never }, { tier: 'lo' })
  const p = r.pad
  mkdirSync(dirname(j.out), { recursive: true })
  writeFileSync(j.out, resolve(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-p} ${-p} ${j.w + 2 * p} ${j.h + 2 * p}" width="${j.w + 2 * p}" height="${j.h + 2 * p}">${r.svg}</svg>`))
  console.log(j.out.split('/').pop(), 'pad', p)
}
