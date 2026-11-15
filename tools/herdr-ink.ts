// Draws Looseleaf component recipes as plain SVG files for Herdr mods.
// herdr-ink.ts <jobs.json>: [{ recipe, params, w, h, layers?, seed?, out }]
// CSS variables become the palette's hex values; grain masks (defs on Looseleaf's page) are dropped.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { runRecipe, DEFAULT_KNOBS } from '@/lib/ink/recipes'

const css = readFileSync('src/styles/looseleaf.css', 'utf8')
const vars: Record<string, string> = {}
for (const m of css.matchAll(/--(ll-[a-z0-9-]+):\s*(#[0-9a-f]{3,8}|rgb\([^)]*\))\s*;/gi)) vars[m[1]] ??= m[2]
const resolve = (svg: string): string =>
  svg.replace(/var\(--ll-blend\)/g, 'multiply')
    .replace(/ mask="url\(#[^)]*\)"/g, '')
    .replace(/ style="--mx:[^"]*"/g, '')
    .replace(/var\(--(ll-[a-z0-9-]+)\)/g, (all, k) => vars[k] ?? (console.error('unresolved', k), all))

interface Job { pick?: string; recipe: string; params: unknown; w: number; h: number; layers?: string[]; seed?: string; out: string }
const jobs: Job[] = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const mods: Record<string, any> = {}
for (const j of jobs) {
  mods[j.recipe] ??= await import(`@/lib/ink/recipes/${j.recipe}-ink`)
  const recipe = (j.pick ? mods[j.recipe][j.pick] : Object.values(mods[j.recipe]).find((v: any) => v?.isInkRecipe)) as any
  const f = runRecipe(recipe, { box: { w: j.w, h: j.h }, params: j.params, seed: j.seed ?? `herdr-${j.recipe}`, tier: 'lo', density: 'comfortable', dir: 'ltr', knobs: DEFAULT_KNOBS, lazy: j.layers as any })
  const all = f.parts as Record<string, string>
  const names = j.layers ?? f.layers
  const body = names.map((k) => all[k] ?? '').join('')
  const p = f.pad
  mkdirSync(dirname(j.out), { recursive: true })
  writeFileSync(j.out, resolve(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-p} ${-p} ${j.w + 2 * p} ${j.h + 2 * p}" width="${j.w + 2 * p}" height="${j.h + 2 * p}">${body}</svg>`))
}
console.log('wrote', jobs.length, 'pad', 12)
