// Draws Looseleaf's alert slip once per tone as plain SVG for Herdr's toast:
// herdr-alerts.ts <out dir> <w> <h>. CSS variables are swapped for the palette's hex values.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { alertRecipe, type AlertTone } from '@/lib/ink/recipes/alert-ink'
import { runRecipe, DEFAULT_KNOBS } from '@/lib/ink/recipes'

const [out, w, h] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4])]
mkdirSync(out, { recursive: true })

// The palette: the first :root block's --ll-* hex colours.
const css = readFileSync('src/styles/looseleaf.css', 'utf8')
const vars: Record<string, string> = {}
for (const m of css.matchAll(/--(ll-[a-z0-9-]+):\s*(#[0-9a-f]{3,8}|rgb\([^)]*\))\s*;/gi)) vars[m[1]] ??= m[2]
const resolve = (svg: string): string =>
  svg.replace(/var\(--ll-blend\)/g, 'multiply')
    .replace(/var\(--(ll-[a-z0-9-]+)\)/g, (all, k) => vars[k] ?? (console.error('unresolved', k), all))

for (const tone of ['default', 'destructive', 'info', 'success', 'warning'] as AlertTone[]) {
  const f = runRecipe(alertRecipe, { box: { w, h }, params: { tone }, seed: `herdr-${tone}`, tier: 'lo', density: 'comfortable', dir: 'ltr', knobs: DEFAULT_KNOBS })
  const body = f.layers.map((k) => f.parts[k] ?? '').join('')
  const p = f.pad
  writeFileSync(`${out}/alert-${tone}.svg`, resolve(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-p} ${-p} ${w + 2 * p} ${h + 2 * p}" width="${w + 2 * p}" height="${h + 2 * p}">${body}</svg>`))
}
console.log('pad', runRecipe(alertRecipe, { box: { w, h }, params: { tone: 'default' }, seed: 'x', tier: 'lo', density: 'comfortable', dir: 'ltr', knobs: DEFAULT_KNOBS }).pad)
