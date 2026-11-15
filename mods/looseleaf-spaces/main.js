// Workspace spaces: stable colored avatars, worktrees under their checkout,
// grouped by machine when more than one is known. After a space's name, the repo
// its first terminal is in now, only where unusual: branch, ahead/behind. Agent state lives in the agents list, not here. Click to
// switch, right-click for its menu, drag to reorder.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex, HoverCard } from "gpui-base";
import { spaces, machines, panes, agents, run, openOverlay, exec, hc, theme, shared, setShared, watchFolder, window, layout } from "herdr";

// Looseleaf parchment on the desk: the sidebar's lists are sheets of parchment (paper tinted
// with kraft, deckled on all four sides), drawn by Looseleaf's paper recipe one tall sheet per
// width (looseleaf-chrome/ink/parchment-<w>.svg, 1600 px). Two crops of it make any height:
// the top and sides from its top, the bottom edge from its bottom.
const DESK = "#dad1bf";
const PAD = 5, TALL = 1600;
// One sheet runs down the whole sidebar, Looseleaf's way: this block draws its `part` of it
// ("top": the top edge and sides, "mid": sides only, "foot": sides and the bottom edge), all
// cropped from the same tall drawing so the three blocks read as a single page.
function sheet(view, part, content, extra = null) {
  const w = view.sheetW ?? 240, h = view.sheetH ?? 400;
  const W = Math.min(480, Math.max(100, Math.floor(w / 4) * 4));
  const art = () => image(`mods/looseleaf-chrome/ink/parchment-${W}.svg`).absolute().left(-PAD).w(W + 2 * PAD).h(TALL + 2 * PAD);
  const crop = part === "top" ? div().absolute().left(0).top(-PAD).w(W).h(h + PAD).overflow_hidden().child(art().top(0))
    : part === "foot" ? div().absolute().left(0).bottom(-PAD).w(W).h(h + PAD).overflow_hidden().child(art().bottom(0))
    : div().absolute().left(0).top(0).w(W).h(h).overflow_hidden().child(art().top(-520));
  return div().size_full().px(8).when(part === "top", el => el.pt(6)).when(part === "foot", el => el.pb(8)).child(
    div().id(`${part}-sheet`).relative().size_full()
      .on_size_change((size, cx) => {
        if (Math.abs((view.sheetW ?? 0) - size.width) >= 1 || Math.abs((view.sheetH ?? 0) - size.height) >= 1) { view.sheetW = size.width; view.sheetH = size.height; cx.notify(); }
      })
      .child(crop)
      .child(div().relative().size_full().child(content))
      .when(Boolean(extra), el => el.child(extra(w))));
}

// Looseleaf's sidebar rows: a faint ruled line under each, the highlighter laid softly under
// the pointer (uneven corners, like a real swipe).
const softSwipe = (el) => el.rounded_tl(3).rounded_tr(8).rounded_br(4).rounded_bl(9).hover((s) => s.bg("#f8dc4c4d"));
const ruled = () => div().absolute().left(6).right(6).bottom(-2).h(1).bg("#b2c3dcb8");

// Looseleaf's pencil rules, drawn once long (looseleaf-chrome/ink/rule-*.svg) and cropped to fit.
const ruleH = (edge) => image("mods/looseleaf-chrome/ink/rule-h.svg").absolute().left(-12).w(3864).h(26)[edge](edge === "top" ? -12 : -11);
const ruleV = () => image("mods/looseleaf-chrome/ink/rule-v.svg").absolute().right(-12).top(-12).w(26).h(2424);

// Looseleaf's sidebar mark for the selected row: a highlighter swipe and a blue pencil
// bracket, drawn by its sidebar recipe (looseleaf-chrome/ink/row-<w>-<h>.svg, every 4 px).
const inkRow = (w, h) => {
  const W = Math.min(480, Math.max(100, Math.floor((w ?? 236) / 4) * 4));
  return image(`mods/looseleaf-chrome/ink/row-${W}-${h}.svg`).absolute().left(-10).top(-10).w(W + 20).h(h + 20);
};
const measure = (view) => (size, cx) => { if (Math.abs((view.rowW ?? 0) - size.width) >= 1) { view.rowW = size.width; cx.notify(); } };

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// Where a space is now: its first terminal's live folder, else where it was made.
// `ps`: panes(), read once by the caller (each read copies every pane).
function place(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}
const rowHeight = ({ tree }) => (tree ? 28 : 30);
const RAIL_CELL = 32;
const railCell = (el) => h_flex().flex_none().justify_center().child(el);
const where = (s, ps) => JSON.stringify([s.machine ?? null, place(s, ps)]);
const base = (path) => path.replace(/\/+$/, "").split("/").pop();
// Changes made outside Herdr (an editor's save, a commit in another app): looked
// for this often, in repos the list shows, while the window is in front.
const FALLBACK = 60000;

// What a stored color name looks like on an avatar (the same in every mod
// that draws space avatars): one strong color per hue, light and dark alike.
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };

// Looseleaf's avatar: a marker-filled disc in one of its tones with an ink ring and the
// initial; a drawn status dot when the space needs you (red) or has finished work (green).
const TONE = { ansi6: "teal", ansi3: "tangerine", ansi4: "sky", ansi5: "grape", ansi2: "grass", ansi1: "bubblegum" };
function avatar(color, fill, letter, status) {
  const tone = TONE[color], dot = status === "blocked" ? "busy" : status === "done" ? "online" : null;
  return div().relative().size(22).flex_none().flex().items_center().justify_center().text_size(12).font_weight(700).text_color("#2a2420")
    .child(tone ? image(`mods/looseleaf-chrome/ink/av-${tone}.svg`).absolute().left(-6).top(-6).size(34) : div().absolute().inset_0().rounded_full().bg(fill))
    .child(image("mods/looseleaf-chrome/ink/av-ring.svg").absolute().left(-8).top(-8).size(38))
    .child(div().relative().child(letter))
    .when(Boolean(dot), (el) => el.child(image(`mods/looseleaf-chrome/ink/av-dot-${dot}.svg`).absolute().right(-7).bottom(-7).size(17)));
}

// A space speaks up only when something in it needs you.
export function glyph(status) {
  return status === "blocked" || status === "done" ? "●" : "·";
}

export function tone(t, status) {
  return t[status] ?? t.unknown;
}

// Looseleaf's tooltip: a small slip of Paper with the lifted shadow, holding the full text of
// something the row cut short. The slip is four corner crops of one drawn sheet
// (looseleaf-chrome/ink/pop-640.svg), so it fits any text; its width goes by the text's length.
const TIP_PAD = 16, TIP_H = 28;
function slip(text) {
  const W = Math.min(620, Math.ceil(text.length * 7.9 + 22)), R = 20, B = 12;
  const art = () => image("mods/looseleaf-chrome/ink/pop-640.svg").absolute().w(640 + 2 * TIP_PAD).h(1600 + 2 * TIP_PAD);
  const crop = (x, y, w, h) => div().absolute()[x](-TIP_PAD)[y](-TIP_PAD).w(w + TIP_PAD).h(h + TIP_PAD).overflow_hidden().child(art()[x](0)[y](0));
  return div().px(14).pt(6).pb(16).child(div().relative().w(W).h(TIP_H)
    .child(crop("left", "top", W - R, TIP_H - B)).child(crop("right", "top", R, TIP_H - B))
    .child(crop("left", "bottom", W - R, B)).child(crop("right", "bottom", R, B))
    .child(div().relative().size_full().px(10).flex().items_center().text_size(13.5).text_color("#2a2420").child(text)));
}
// `el` with the slip on hover, when `text` is given.
const tip = (id, el, text) => !text ? el
  : HoverCard.new(id).anchor("bottom_left").open_delay(350).close_delay(80).trigger(el).content(slip(text));

export default class Spaces extends View {
  init(_props, cx) {
    this.git = {}; // where() -> { name, branch, ahead, behind, repo, linked }, null: not a repo
    this.checked = {}; // where() -> when it was last looked at
    this.unsure = new Set(); // where()s git couldn't answer for (a machine away)
    this.pending = new Set(); // where()s to look at next
    this.busy = {}; // pane -> an agent working or a program in front of its shell
    this.ready = {}; // machine -> its layout was readable at the last look
    this.at = {}; // space -> its where() at the last look
    this.watching = new Set(); // local repos' git folders
    // Spaces made while this runs wait (at most a moment) for their git, so a
    // worktree appears under its repo instead of jumping there.
    this.shown = new Set(spaces().map((s) => s.id));
    this.born = {};
    this.pressed = null;
    this.over = null;
    this.machines = [];
    this.reconnecting = JSON.parse(localStorage.getItem("machines.reconnecting") ?? "{}");
    for (const state of Object.values(this.reconnecting)) state.busy = false;
    this.folded = new Set(JSON.parse(localStorage.getItem("machines.folded") ?? "[]"));
    this.refreshMachines(cx);
    cx.timer.every(15000, cx => this.refreshMachines(cx));
    // Refresh only when the refs could have changed (see `due`).
    cx.timer.every(250, (cx) => this.checkNew(cx));
  }

  checkNew(cx) {
    const now = Date.now();
    const sp = spaces();
    for (const s of sp) if (!this.shown.has(s.id)) this.born[s.id] ??= now;
    const due = this.due(now, sp, panes());
    if (due.size) this.refreshGit(due, cx);
    if (sp.some((s) => !this.shown.has(s.id)) || this.orderingDue(now)) cx.notify();
  }

  // Places whose git could have changed: new ones (a new space, a cd), where a
  // command or an agent's turn just ended (a checkout, a commit, edits), those on
  // a machine that is back, and repos in view whose fallback is due.
  due(now, sp, ps) {
    // Moved there: what it knew of that place may be old.
    const at = {};
    for (const s of sp) at[s.id] = where(s, ps);
    const keys = new Set(Object.values(at).filter((k) => JSON.parse(k)[1]));
    const due = new Set([...keys].filter((k) => !(k in this.git)));
    for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
    this.at = at;
    const spaceOf = {};
    for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
    const busy = {};
    for (const p of ps) {
      if (!p.terminal || !spaceOf[p.tab]) continue;
      busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
      if (this.busy[p.pane] && !busy[p.pane]) this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
    }
    this.busy = busy;
    for (const m of machines()) {
      const ready = m.layout === "ready";
      if (ready && this.ready[m.name] === false) for (const k of keys) if (JSON.parse(k)[0] === m.name) due.add(k);
      this.ready[m.name] = ready;
    }
    if (window().active) {
      for (const k of keys) {
        const asks = this.git[k] || this.unsure.has(k);
        if (asks && !this.folded.has(JSON.parse(k)[0]) && now - (this.checked[k] ?? 0) > FALLBACK) due.add(k);
      }
    }
    return due;
  }

  // `key` and the other places in its repo (a commit there moves their ahead/behind).
  sameRepo(key, keys) {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  refreshMachines(cx) {
    cx.spawn(async cx => {
      try { const r = await hc(["machine", "ls", "--json"]); if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary); } catch {}
      cx.notify();
    });
  }

  rebuilt(machine) {
    return machine?.state === "unreachable" && /^a different core answers there \("[^"]+"\)$/.test(machine.why ?? "");
  }

  reconnect(machine, cx) {
    const name = machine.name;
    if (this.reconnecting[name]?.busy) return;
    const state = this.reconnecting[name] ??= { machine, removed: false };
    state.busy = true;
    state.error = null;
    localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
    cx.notify();
    cx.spawn(async cx => {
      try {
        const ask = async args => {
          const r = await hc([...args, "--json"]);
          if (r.code !== 0) {
            let error;
            try { error = JSON.parse(r.stdout || r.stderr).error?.message; } catch {}
            throw new Error(error || r.stderr || r.stdout || "Couldn't connect.");
          }
        };
        if (!state.removed) {
          await ask(["machine", "rm", name]);
          state.removed = true;
          localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
        }
        const args = ["machine", "add"];
        if (machine.via) args.push("--via", machine.target);
        else args.push(machine.target);
        args.push("--name", name);
        if (machine.session) args.push("--session", machine.session);
        if (machine.temporary) args.push("--temp");
        await ask(args);
        this.folded.delete(name);
        localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
        delete this.reconnecting[name];
      } catch (e) {
        state.error = String(e.message ?? e);
        state.busy = false;
      }
      localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
      this.refreshMachines(cx);
      cx.notify();
    });
  }

  // One look at a time, each place once however often it was asked for meanwhile.
  refreshGit(keys, cx) {
    for (const k of keys) this.pending.add(k);
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      while (this.pending.size) {
        const keys = [...this.pending];
        this.pending.clear();
        await Promise.all(keys.map((key) => this.check(key, cx)));
      }
      const used = new Set(Object.values(this.git).filter(Boolean).map((g) => JSON.parse(g.repo)).filter(([on]) => !on).map(([, repo]) => repo));
      for (const repo of this.watching) if (!used.has(repo)) this.watching.delete(repo);
      this.refreshing = false;
      cx.notify();
    });
  }

  // One place's git: branch, ahead/behind, its repo.
  async check(key, cx) {
    const [on, cwd] = JSON.parse(key);
    this.checked[key] = Date.now();
    this.unsure.delete(key);
    try {
      // Ref-only reads avoid scanning the worktree or waking its index watch.
      // Two reads: a folder name may itself contain a newline.
      const [r, common] = await Promise.all([
        exec("git", ["rev-parse", "--path-format=absolute", "--show-toplevel"], { cwd, on }),
        exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on }),
      ]);
      if (r.code !== 0 || common.code !== 0) {
        // Only git's own "no" is remembered as no repo; anything else is asked again.
        if (!/not a git repository/i.test(r.code !== 0 ? r.stderr : common.stderr)) this.unsure.add(key);
        this.git[key] = null;
        return;
      }
      // The repo's own .git folder names it; a worktree's top differs from it.
      const top = r.stdout.replace(/\n$/, ""), repo = common.stdout.replace(/\n$/, "");
      const [branch, counts] = await Promise.all([
        exec("git", ["symbolic-ref", "-q", "HEAD"], { cwd, on }),
        exec("git", ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], { cwd, on }),
      ]);
      const name = repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
      const [ahead, behind] = counts.code === 0 ? counts.stdout.trim().split(/\s+/).map(Number) : [0, 0];
      const info = { name, branch: branch.code === 0 ? branch.stdout.trim().replace(/^refs\/heads\//, "") : "(detached)", ahead, behind, repo: JSON.stringify([on, repo]), linked: repo !== `${top}/.git` };
      this.git[key] = info;
      if (!on) this.watch(repo, cx);
    } catch {
      // Couldn't ask (the machine is away): keep what it showed, look again later.
      this.git[key] ??= null;
      this.unsure.add(key);
    }
  }

  watch(repo, cx) {
    if (this.watching.has(repo)) return;
    this.watching.add(repo);
    cx.spawn(async (cx) => {
      try {
        while (this.watching.has(repo)) {
          await watchFolder(repo);
          const mine = JSON.stringify([null, repo]);
          if (this.watching.has(repo)) this.refreshGit(Object.keys(this.git).filter((k) => this.git[k]?.repo === mine), cx);
        }
      } catch { this.watching.delete(repo); }
    });
  }

  menu(w) {
    // A popup is as tall as its items; height is only the most.
    openOverlay({ mod: "looseleaf-menu", kind: "popup", frame: "none", width: 278, height: 326, props: { tab: "space", target: { id: w.id } } });
  }

  orderingDue(now) {
    return this.ordering && now - this.ordering.at >= 1000
      && this.ordering.machines.every(name => machines().some(m => m.name === name && m.layout === "ready"));
  }

  // Spaces in order, each worktree space moved under its main checkout's.
  ordered() {
    const sp = spaces(), ps = panes();
    const ready = (w) => this.shown.has(w.id) || where(w, ps) in this.git || Date.now() - (this.born[w.id] ??= Date.now()) > 1500;
    for (const w of sp) if (!this.shown.has(w.id) && ready(w)) this.shown.add(w.id);
    const list = sp.map((w, i) => ({ w, i, g: this.git[where(w, ps)] ?? null }));
    const mains = new Set(list.filter((r) => r.g && !r.g.linked).map((r) => r.g.repo));
    const nested = (r) => r.g?.linked && mains.has(r.g.repo);
    const out = [];
    const placed = new Set(); // repos whose worktrees are listed (under the first of its spaces)
    for (const r of list) {
      if (nested(r)) continue;
      out.push({ ...r, tree: null });
      if (!r.g || r.g.linked || placed.has(r.g.repo)) continue;
      placed.add(r.g.repo);
      const kids = list.filter((k) => nested(k) && k.g.repo === r.g.repo);
      kids.forEach((k, n) => out.push({ ...k, tree: n === kids.length - 1 ? "└─" : "├─", n }));
    }
    // Simulate the batch so later indexes include earlier moves. An attempted
    // write can lose a sync conflict: allow the echo to settle before retrying.
    const order = sp.map(w => w.id);
    const target = out.map(r => r.w.id);
    const key = JSON.stringify([order, target, machines()]);
    if (order.every((id, i) => id === target[i])) {
      this.ordering = null;
    } else if (this.ordering?.key !== key || this.orderingDue(Date.now())) {
      const moved = new Set();
      this.ordering = { key, at: Date.now(), machines: [] };
      for (let i = 0; i < out.length; i++) {
        const from = order.indexOf(out[i].w.id);
        if (from === i) continue;
        run("space.move", { id: out[i].w.id, index: i + 1 });
        moved.add(out[i].w.machine ?? null);
        order.splice(i, 0, order.splice(from, 1)[0]);
      }
      this.ordering.machines = [...moved];
    }
    return out.filter(r => this.shown.has(r.w.id));
  }

  // The rows, under a header per machine once one isn't this computer.
  grouped(t, collapsed) {
    const rows = this.ordered();
    const draw = (r) => (collapsed ? this.compact(r, t) : this.row(r, t));
    const remote = [...new Set([...rows.map(r => r.w.machine).filter(Boolean), ...this.machines.map(m => m.name), ...Object.keys(this.reconnecting)])].sort();
    const loading = m => {
      const layout = machines().find(k => k.name === m)?.layout;
      return layout === "loading" || (!layout && this.machines.some(k => k.name === m && k.state === "connected"))
        || spaces().some(s => (s.machine ?? null) === m && !this.shown.has(s.id));
    };
    const loadingRow = m => h_flex().id(`machine-loading-${m ?? "local"}`).h(28).flex_none().px(collapsed ? 0 : 8).items_center().when(collapsed, el => el.justify_center()).text_size(12).text_color(t.dim).child(collapsed ? "…" : "Loading…");
    if (!remote.length) return loading(null) && !rows.length ? [loadingRow(null)] : rows.map(draw);
    const machineNames = [null, ...remote];
    return machineNames.flatMap((m) => {
      const mine = rows.filter((r) => (r.w.machine ?? null) === m);
      const repair = this.reconnecting[m];
      const machine = this.machines.find(k => k.name === m) ?? repair?.machine;
      const connected = !m || machine?.state === "connected";
      const rebuilt = this.rebuilt(machine) || !!repair;
      const login = machine?.state === "needs_login" ? `hc machine login ${m}` : null;
      const folded = this.folded.has(m);
      const icon = svg(`mods/looseleaf-chrome/${m ? "server" : "monitor"}.svg`).size(16).flex_none();
      const badge = div().absolute().right(-3).bottom(-2).size(6).rounded(3).border_1().border_color(t.chrome).bg(connected ? t.ansi2 : t.dim);
      const head = h_flex().id(`machine-${m ?? "local"}`).h(26).flex_none().px(collapsed ? 0 : 8).gap(7).items_center().text_size(11).text_color(t.dim)
        .when(collapsed, el => el.mt(4).w(RAIL_CELL).justify_center().rounded(6).tooltip(login ? `${m} needs a login: run ${login}. Click for Copy.` : m ? `${m} · ${connected ? "connected" : (machine?.state ?? "asleep").replace(/_/g, " ")}` : "This computer"))
        .cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((_e, cx) => {
          if (collapsed && login) { run("app.settings", { section: "machines" }); return; }
          folded ? this.folded.delete(m) : this.folded.add(m);
          localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
          cx.notify();
        })
        .when(!collapsed, el => el.child(icon))
        .when(collapsed, el => el.child(div().relative().flex_none().child(icon).when(Boolean(m), el => el.child(badge))))
        .when(!collapsed, el => el.child(div().flex_1().truncate().child(m ?? "This computer"))
          .when(!connected && !rebuilt && !login, el => el.child(div().flex_none().child((machine?.state ?? "asleep").replace(/_/g, " "))))
          .when(rebuilt, el => el.child(h_flex().flex_none().gap(3).items_center()
            .child(div().max_w(140).truncate().child(repair?.error || "rebuilt ·"))
            .child(div().id(`machine-connect-${m}`).text_color(repair?.error ? t.blocked : t.muted)
              .hover(s => s.text_color(t.foreground))
              .tooltip(repair?.error || "This machine was rebuilt or replaced. Click to connect to the new one.")
              .on_click((_e, cx) => { cx.stop_propagation(); this.reconnect(machine, cx); })
              .child(repair?.busy ? "Connecting…" : "Connect"))))
          .when(connected, el => el.child(div().id(`machine-add-${m ?? "local"}`).flex_none().px(4).rounded(4).hover(s => s.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => { cx.stop_propagation(); run("space.new", { machine: m ?? "" }); }).child("+")))
          .child(div().size(6).rounded(3).flex_none().bg(connected ? t.ansi2 : t.dim))
          .child(svg(`mods/looseleaf-chrome/chevron-${folded ? "right" : "down"}.svg`).size(16).flex_none()));
      const empty = h_flex().id(`machine-new-${m ?? "local"}`).h(28).flex_none().px(collapsed ? 0 : 8).gap(7).items_center().rounded(7)
        .text_size(12).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => run("space.new", { machine: m ?? "" }))
        .when(collapsed, el => el.w(RAIL_CELL).rounded(6).justify_center().tooltip(`New space on ${m ?? "this computer"}`)
          .child(h_flex().size(18).rounded(5).border_1().border_color(t.dim).items_center().justify_center()
            .child(svg("mods/looseleaf-chrome/plus.svg").size(10))))
        .when(!collapsed, el => el.child(svg("mods/looseleaf-chrome/plus.svg").size(16)).child("New space there"));
      if (!collapsed && rebuilt) return [head];
      const cell = collapsed ? railCell : (el) => el;
      const guidance = !collapsed && login ? [v_flex().px(8).pb(6).gap(3).flex_none()
        .child(div().text_size(11).text_color(t.blocked).child("needs a login: run"))
        .child(h_flex().gap(5).items_center()
          .child(div().flex_1().min_w(0).truncate().tooltip(login).text_size(11).text_color(t.muted).child(login))
          .child(div().id(`machine-login-copy-${m}`).flex_none().px(5).py(2).rounded(4)
            .text_size(11).text_color(t.foreground).bg(t.raised).cursor_pointer().hover(s => s.bg(t.hover))
            .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(login); this.copiedLogin = login; cx.notify(); })
            .child(this.copiedLogin === login ? "Copied" : "Copy")))] : [];
      return [cell(head), ...guidance, ...(folded ? [] : mine.length ? mine.map(draw) : [loading(m) ? loadingRow(m) : cell(empty)])];
    });
  }

  // Only what's unusual, after the name: "herdr \u00b7 spike \u21912 \u21931". The repo or
  // branch goes when the name already says it (a worktree is named after its branch),
  // and master/main go: nearly every space is on one.
  gitTail(g, tree, name, t) {
    const raw = g.branch ?? "detached";
    const same = (a) => a.toLowerCase() === name.toLowerCase();
    const branch = same(raw) || raw === "master" || raw === "main" ? "" : raw;
    const repo = tree || same(g.name) ? "" : g.name;
    const where = [repo, branch].filter(Boolean).join(" \u00b7 ");
    return h_flex()
      .flex_1()
      .min_w(0)
      .gap(5)
      .justify_end()
      .items_center()
      .text_size(12)
      .text_color("#5a554e")
      .when(Boolean(where), (el) => el.child(div().min_w(0).child(tip(`tip-git-${name}`, div().truncate().child(where), [g.name, raw].filter(Boolean).join(" \u00b7 ")))))
      .when(g.ahead > 0, (el) => el.child(div().flex_none().text_size(13.5).font_semibold().text_color("#3b7a4b").child(`\u2191${g.ahead}`)))
      .when(g.behind > 0, (el) => el.child(div().flex_none().text_size(13.5).font_semibold().text_color("#c2412d").child(`\u2193${g.behind}`)));
  }

  row({ w, i, g, tree, n = 0 }, t) {
    const on = w.active;
    const fromIndex = this.pressed === null ? -1 : spaces().findIndex(s => s.id === this.pressed);
    const colors = shared("space.colors") ?? {};
    const color = colors[w.id] ?? "ansi6";
    const fill = color.startsWith("#") ? color : (MARK[color] ?? t[color]);
    const H = rowHeight({ tree });
    // Which agents run here (Claude, Codex, Kimi...): one icon per program, from the app's
    // program table, with a count when a program runs more than once.
    const running = new Map();
    for (const a of agents()) if (a.space === w.id && a.program?.icon) {
      const k = a.program.key ?? a.program.name;
      running.set(k, { p: a.program, n: (running.get(k)?.n ?? 0) + 1 });
    }
    const models = running.size === 0 ? null : h_flex().id(`models-${w.id}`).flex_none().gap(5).items_center()
      .tooltip([...running.values()].map(({ p, n }) => n > 1 ? `${p.name} ×${n}` : p.name).join(", "))
      .children([...running.values()].slice(0, 4).map(({ p, n }) => h_flex().flex_none().gap(1).items_center()
        .child(p.tint ? svg(p.icon).size(14).flex_none().text_color("#4a423b") : image(p.icon).w(14).h(14).flex_none())
        .when(n > 1, (el) => el.child(div().text_size(11).text_color("#5a554e").child(String(n))))));
    return v_flex()
      .relative()
      .id(`space-${w.id}`)
      .px(8)
      .h(H)
      .flex_none()
      .justify_center()
      .on_size_change(measure(this))
      // A space: the ruled line, and the sidebar mark (swipe and blue bracket) when it's the open one.
      .when(!tree && !on, (el) => softSwipe(el).child(ruled()))
      .when(!tree && on, (el) => el.child(inkRow(this.rowW, H)))
      // A worktree hangs off its space on a pencil rule, cropped from one long drawn line.
      .when(Boolean(tree), (el) => el.child(div().absolute().left(18).top(-2).w(2).h(H).overflow_hidden()
        .child(image("mods/looseleaf-chrome/ink/rule-v.svg").absolute().left(-12).top(-12 - n * (H + 3)).w(26).h(2424))))
      .when(this.pressed === w.id && this.over !== w.id, (el) => el.opacity(0.5))
      .when(this.pressed !== null && this.over === w.id && this.pressed !== w.id, (el) => el.child(
        div().absolute().left(0).right(0).h(2).bg(t.accent)
          .when(fromIndex < i, line => line.bottom(0))
          .when(fromIndex > i, line => line.top(0)),
      ))
      .on_mouse_down("left", () => {
        this.pressed = w.id;
        this.over = w.id;
      })
      .on_mouse_move((_e, cx) => {
        const source = spaces().find(s => s.id === this.pressed);
        const over = source && (source.machine ?? null) === (w.machine ?? null) ? w.id : null;
        if (this.pressed !== null && this.over !== over) {
          this.over = over;
          cx.notify();
        }
      })
      .on_mouse_up("left", (_e, cx) => {
        const from = this.pressed;
        const over = this.over;
        this.pressed = null;
        this.over = null;
        if (from !== null && over === w.id && from !== w.id) {
          const index = spaces().findIndex(s => s.id === w.id);
          if (index !== -1) run("space.move", { id: from, index: index + 1 });
        } else if (from === w.id) run("space.select", { id: w.id });
        cx.notify();
      })
      .on_mouse_down("right", () => this.menu(w))
      .child(tree
        ? h_flex().ml(20).pl(6).pr(4).h(24).gap(7).items_center()
          .when(on, (el) => el.bg("#f8dc4c9e").rounded_tl(3).rounded_tr(8).rounded_br(4).rounded_bl(9))
          .when(!on, (el) => softSwipe(el))
          .child(svg("mods/looseleaf-chrome/branch.svg").size(16).flex_none().text_color("#4a423b"))
          .when(Boolean(models), (el) => el.child(models))
          .child(div().flex_shrink(0).max_w(140).min_w(0).child(tip(`tip-${w.id}`, div().truncate().text_size(14).text_color("#2a2420").when(on, (el) => el.font_weight(700)).child(w.name), w.name.length > 15 ? w.name : null)))
          .child(g ? this.gitTail(g, tree, w.name, t) : div().flex_1())
        : h_flex().gap(9).items_center()
          .child(avatar(color, fill, [...w.name][0]?.toUpperCase() ?? "?", w.status))
          .when(Boolean(models), (el) => el.child(models))
          .child(div().flex_shrink(0).max_w(168).min_w(0).child(tip(`tip-${w.id}`, div().truncate().text_size(14.5).text_color("#2a2420").when(on, (el) => el.font_weight(700)).child(w.name), w.name.length > 17 ? w.name : null)))
          .child(g ? this.gitTail(g, tree, w.name, t) : div().flex_1()),
      );
  }

  compact({ w, i }, t) {
    return railCell(h_flex()
      .id(`space-${w.id}`)
      .relative()
      .w(RAIL_CELL)
      .h(26)
      .rounded(6)
      .justify_center()
      .items_center()
      .when(w.active, (el) => el.bg(t.selected))
      .when(!w.active, (el) => el.hover((s) => s.bg(t.hover)))
      .on_click(() => run("space.select", { id: w.id }))
      .child(div().text_color(w.active ? t.foreground : t.muted).child(String(i + 1)))
      .child(div().absolute().right(5).text_color(tone(t, w.status)).child(glyph(w.status))));
  }

  render() {
    return sheet(this, "top", this.paper());
  }

  paper() {
    const t = theme();
    const collapsed = narrow();
    const palette = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
    const sp = spaces();
    const ids = new Set(sp.map(p => p.id));
    const kept = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)));
    let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
    for (const p of sp) {
      if (kept[p.id] || p.name === "~") continue;
      const uses = c => Object.values(kept).filter(v => v === c).length;
      kept[p.id] = palette.reduce((best, c) => uses(c) < uses(best) ? c : best);
      changed = true;
    }
    if (changed) setShared("space.colors", kept);
    return v_flex().size_full().min_h(0).text_size(14)
      .child(h_flex().h(34).mt(6).pl(16).pr(10).flex_none().items_center().justify_between().text_size(13.5).text_color("#4a433c")
        .when(collapsed, el => el.pl(0).pr(0).justify_center())
        .when(!collapsed, el => el.child("Spaces"))
        .child(div().id("space-new").relative().size(28).flex_none().flex().items_center().justify_center().cursor_pointer().text_color("#4a423b")
          .on_hover((h, cx) => { this.newLit = h; cx.notify(); })
          .on_click(() => run("space.new"))
          .child(image(`mods/looseleaf-chrome/ink/ib-c${this.newLit ? "-on" : ""}.svg`).absolute().left(-12).top(-12).w(52).h(52))
          .child(svg("mods/looseleaf-chrome/plus.svg").size(16).relative())))
      .child(v_flex().flex_1().min_h(0).px(collapsed ? 0 : 8).pb(8).gap(3).overflow_y_scrollbar().mode("always")
        .on_mouse_up("left", (_e, cx) => { this.pressed = null; cx.notify(); })
        .children(this.grouped(t, collapsed)));
  }
}
