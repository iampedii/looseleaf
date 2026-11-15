#!/bin/sh
# Builds the sample projects the screenshots were taken in: paperboat (a small notes app with
# uncommitted changes), a worktree of it on feature/offline-sync, and field-notes (docs only).
# Run from anywhere; it writes beside itself and replaces what is there.
set -e
cd "$(dirname "$0")"
rm -rf paperboat paperboat-offline-sync field-notes
g() { git -c user.name="Sample" -c user.email="sample@example.com" "$@"; }

mkdir -p paperboat/src paperboat/test paperboat/docs
cd paperboat
g init -q -b main
cat > package.json <<'J'
{
  "name": "paperboat",
  "version": "0.4.0",
  "description": "Notes that fold: a tiny local-first notebook",
  "type": "module",
  "scripts": { "dev": "vite", "test": "vitest run", "lint": "eslint src" },
  "dependencies": { "nanoid": "^5.0.7" },
  "devDependencies": { "typescript": "^5.6.0", "vite": "^5.4.0", "vitest": "^2.1.0" }
}
J
cat > README.md <<'J'
# Paperboat

Notes that fold. A tiny local-first notebook: pages, tags, and a search that
stays out of the way.

    npm install
    npm run dev

## Layout

- `src/notebook.ts`  pages and their order
- `src/search.ts`    the index and the query parser
- `src/store.ts`     saving to disk
J
cat > src/notebook.ts <<'J'
import { nanoid } from "nanoid";

export interface Page {
  id: string;
  title: string;
  body: string;
  tags: string[];
  updated: number;
}

export class Notebook {
  private pages = new Map<string, Page>();

  add(title: string, body = "", tags: string[] = []): Page {
    const page = { id: nanoid(8), title, body, tags, updated: Date.now() };
    this.pages.set(page.id, page);
    return page;
  }

  get(id: string): Page | undefined {
    return this.pages.get(id);
  }

  remove(id: string): boolean {
    return this.pages.delete(id);
  }

  list(): Page[] {
    return [...this.pages.values()].sort((a, b) => b.updated - a.updated);
  }
}
J
cat > src/search.ts <<'J'
import type { Page } from "./notebook";

export interface Hit {
  page: Page;
  score: number;
}

const words = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

export function search(pages: Page[], query: string): Hit[] {
  const terms = words(query);
  if (terms.length === 0) return [];
  return pages
    .map((page) => {
      const title = words(page.title);
      const body = words(page.body);
      const score = terms.reduce(
        (sum, t) => sum + title.filter((w) => w === t).length * 3 + body.filter((w) => w === t).length,
        0,
      );
      return { page, score };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score);
}
J
cat > src/store.ts <<'J'
import { readFile, writeFile } from "node:fs/promises";
import type { Page } from "./notebook";

export async function load(path: string): Promise<Page[]> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return [];
  }
}

export async function save(path: string, pages: Page[]): Promise<void> {
  await writeFile(path, JSON.stringify(pages, null, 2));
}
J
cat > test/search.test.ts <<'J'
import { expect, test } from "vitest";
import { Notebook } from "../src/notebook";
import { search } from "../src/search";

test("title matches outrank body matches", () => {
  const book = new Notebook();
  book.add("Folding guide", "start with a square sheet");
  book.add("Shopping", "paper, glue, a folding bone");
  const hits = search(book.list(), "folding");
  expect(hits[0].page.title).toBe("Folding guide");
});
J
cat > docs/roadmap.md <<'J'
# Roadmap

- [x] Pages and tags
- [x] Search
- [ ] Offline sync
- [ ] Export to Markdown
J
printf 'node_modules\ndist\n*.log\n' > .gitignore
g add -A && g commit -q -m "Start the notebook: pages, search, store"
cat >> docs/roadmap.md <<'J'
- [ ] Pinned pages
J
g commit -q -am "Roadmap: pinned pages"
g branch feature/offline-sync
g worktree add -q ../paperboat-offline-sync feature/offline-sync

# Uncommitted work on main: tag filters in search, a pin on pages, a new test.
python3 - <<'P'
import re
p="src/search.ts"; s=open(p).read()
s=s.replace('''const words = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
''','''const words = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

// "tag:ideas folding" keeps only pages tagged ideas, then ranks by the rest.
function parse(query: string) {
  const tags = [...query.matchAll(/tag:(\\S+)/g)].map((m) => m[1].toLowerCase());
  return { tags, terms: words(query.replace(/tag:\\S+/g, "")) };
}
''')
s=s.replace('''  const terms = words(query);
  if (terms.length === 0) return [];
  return pages
''','''  const { tags, terms } = parse(query);
  if (terms.length === 0 && tags.length === 0) return [];
  return pages
    .filter((page) => tags.every((t) => page.tags.includes(t)))
''')
open(p,"w").write(s)
p="src/notebook.ts"; s=open(p).read()
s=s.replace("  tags: string[];\n  updated","  tags: string[];\n  pinned: boolean;\n  updated")
s=s.replace("{ id: nanoid(8), title, body, tags, updated","{ id: nanoid(8), title, body, tags, pinned: false, updated")
s=s.replace("    return [...this.pages.values()].sort((a, b) => b.updated - a.updated);","    return [...this.pages.values()].sort(\n      (a, b) => Number(b.pinned) - Number(a.pinned) || b.updated - a.updated,\n    );")
open(p,"w").write(s)
P
cat > test/tags.test.ts <<'J'
import { expect, test } from "vitest";
import { Notebook } from "../src/notebook";
import { search } from "../src/search";

test("tag: filters before ranking", () => {
  const book = new Notebook();
  book.add("Crane", "a classic fold", ["ideas"]);
  book.add("Boat", "a classic fold", ["done"]);
  expect(search(book.list(), "tag:ideas fold")).toHaveLength(1);
});
J

cd ../paperboat-offline-sync
cat > src/sync.ts <<'J'
import type { Page } from "./notebook";

// Last write wins, page by page.
export function merge(local: Page[], remote: Page[]): Page[] {
  const byId = new Map(local.map((p) => [p.id, p]));
  for (const page of remote) {
    const mine = byId.get(page.id);
    if (!mine || mine.updated < page.updated) byId.set(page.id, page);
  }
  return [...byId.values()];
}
J
g add -A && g commit -q -m "Sync: merge pages, last write wins"
g commit -q --allow-empty -m "Sync: queue writes while offline"

cd ..
mkdir -p field-notes/trips && cd field-notes
g init -q -b main
printf '# Field notes\n\nSketches, lists and half-ideas.\n' > README.md
printf '# Kyoto\n\n- paper shops on Teramachi\n- washi museum\n' > trips/kyoto.md
g add -A && g commit -q -m "First notes"
echo "sample projects are in $(pwd)/.."
