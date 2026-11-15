// Go to a tab. Drops from the Terminals layout's space chip (popup, at: "top"). Spaces with
// something that needs you come first, quiet spaces (no agent running)
// fold into "earlier". Type to filter, ↑/↓ and Enter to go, ctrl+d to close
// a tab, Esc to leave. Last rows: new work (a tab here, a space on this
// computer or on each connected machine).

import { View, div, svg, image } from "gpui-kit";
import { keycap, swipe, separator, INK, SOFT, MUTED, PENCIL, RED } from "./kit.js";

// Looseleaf's command palette on a Paper sheet (looseleaf-chrome/ink/sheet-640.svg, 1600 px
// tall): two crops make any height. The input sits on its drawn rule, blue ink while typing.
const SWIPE_SOFT = "#f8dc4c4d";
// Looseleaf's avatar, as in the sidebar: a marker-filled disc, an ink ring, the initial.
const TONE = { ansi6: "teal", ansi3: "tangerine", ansi4: "sky", ansi5: "grape", ansi2: "grass", ansi1: "bubblegum" };
function avatar(color, fill, letter) {
  const tone = TONE[color];
  return div().relative().size(22).flex_none().flex().items_center().justify_center().text_size(12).font_weight(700).text_color("#2a2420")
    .child(tone ? image(`mods/looseleaf-chrome/ink/av-${tone}.svg`).absolute().left(-6).top(-6).size(34) : div().absolute().inset_0().rounded_full().bg(fill))
    .child(image("mods/looseleaf-chrome/ink/av-ring.svg").absolute().left(-8).top(-8).size(38))
    .child(div().relative().child(letter));
}
function paper(view, el) {
  const W = 640, PAD = 16, TALL = 1600, FOOT = 40, h = view.paperH ?? 300;
  const art = () => image(`mods/looseleaf-chrome/ink/pop-${W}.svg`).absolute().left(0).w(W + 2 * PAD).h(TALL + 2 * PAD);
  return div().px(16).pt(12).pb(20).child(div().id("picker-paper").relative().w(W)
    .on_size_change((size, cx) => { if (Math.abs((view.paperH ?? 0) - size.height) >= 1) { view.paperH = size.height; cx.notify(); } })
    .child(div().absolute().left(-PAD).top(-PAD).w(W + 2 * PAD).h(Math.max(0, h - FOOT) + PAD).overflow_hidden().child(art().top(0)))
    .child(div().absolute().left(-PAD).bottom(-PAD).w(W + 2 * PAD).h(Math.min(h, FOOT) + PAD).overflow_hidden().child(art().bottom(0)))
    .child(el.relative()));
}
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { agents, spaces, terminals, run, hc, theme, settings, props, closeOverlay, openOverlay, shared, setShared } from "herdr";

const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };

// Space colors, kept by space id in shared "space.colors": a theme
// color name ("ansi6") or a picked #rrggbb. A space seen without one gets
// the theme color fewest spaces use, once; every mod does the same in the
// same order, so they agree, and adding or renaming spaces moves nothing.
const PROJECT_COLORS = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
function spaceColors() {
  const ids = new Set(spaces().map((p) => p.id));
  const kept = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)));
  let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
  for (const p of spaces()) {
    if (kept[p.id] || p.name === "~") continue;
    const uses = (c) => Object.values(kept).filter((v) => v === c).length;
    kept[p.id] = PROJECT_COLORS.reduce((best, c) => (uses(c) < uses(best) ? c : best));
    changed = true;
  }
  if (changed) setShared("space.colors", kept);
  return kept;
}
function spaceColor(t, p) {
  if (p.name === "~") return t.dim;
  const c = spaceColors()[p.id] ?? PROJECT_COLORS[0];
  return c.startsWith("#") ? c : (MARK[c] ?? t[c]);
}

export default class Picker extends View {
  init(_props, cx) {
    this.filter = "";
    this.input = InputState.new({ placeholder: "Go to a tab, space or agent…" });
    this.input.on("change", (_e, cx) => {
      this.filter = this.input.value();
      this.at = this.filter ? Math.max(0, this.rows().filter(r => r.kind !== "head").findIndex(r => r.kind === "ctx")) : 0;
      cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.go(this.rows().filter(r => r.kind !== "head")[this.at], cx));
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.at = null;
    this.scroll = 0;
    this.showEarlier = false;
    this.machines = [];
    this.handle = cx.focus_handle();
    cx.spawn(async (cx) => {
      try {
        const r = await hc(["machine", "ls", "--json"]);
        if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => m.state === "connected" && !m.temporary).map((m) => m.name);
      } catch {}
      cx.notify();
    });
  }

  close() {
    closeOverlay(props().overlay);
  }

  rows() {
    const f = this.filter.toLowerCase();
    const all = agents();
    const live = terminals().filter((x) => x.state === "live");
    const teamOf = (addrs) => {
      let n = 0;
      const walk = (a) => live.filter((x) => x.parent === a).forEach((k) => (n++, walk(k.address)));
      addrs.forEach(walk);
      return n;
    };
    const groups = spaces().map((w) => {
      const ctxs = w.tabs
        .map((ctx) => {
          const mine = all.filter((a) => a.tab === ctx.id);
          return { w, ctx, mine, team: teamOf(mine.map((a) => a.address)) };
        })
        .filter((c) => !f || [w.name, c.ctx.name, ...c.mine.map((a) => a.program?.name ?? "")].join(" ").toLowerCase().includes(f));
      return { w, ctxs };
    });
    const busy = groups.filter((p) => p.w.status && p.ctxs.length);
    const quiet = groups.filter((p) => !p.w.status && p.ctxs.length);
    busy.sort((a, b) => (b.w.status === "blocked") - (a.w.status === "blocked"));
    const out = [];
    const add = (p) => {
      out.push({ kind: "head", w: p.w });
      for (const c of p.ctxs) out.push({ kind: "ctx", ...c });
    };
    busy.forEach(add);
    if (quiet.length) {
      out.push({ kind: "earlier", count: quiet.length });
      if (this.showEarlier || f) quiet.forEach(add);
    }
    out.push({ kind: "new" });
    out.push({ kind: "space", machine: null });
    for (const m of this.machines) out.push({ kind: "space", machine: m });
    return out;
  }

  go(r, cx) {
    if (!r) return;
    if (r.kind === "earlier") {
      this.at = this.rows().filter(r => r.kind !== "head").findIndex(r => r.kind === "earlier");
      this.showEarlier = !this.showEarlier;
      this.input.focus();
      cx.notify();
      return;
    }
    this.close();
    if (r.kind === "ctx") run("tab.select", { id: r.ctx.id });
    else if (r.kind === "new") run("tab.new");
    else if (r.kind === "space") run("space.new", { machine: r.machine ?? "" });
  }

  glyph(t, st) {
    if (st === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900);
    return div().w(12).flex_none().text_color(t[st] ?? t.dim).child(st === "idle" ? "○" : st ? "●" : "·");
  }

  render() {
    const t = theme();
    const rows = this.rows();
    const pickable = rows.filter((r) => r.kind !== "head");
    // Opens on where you are.
    if (this.at === null) this.at = Math.max(0, pickable.findIndex((r) => r.kind === "ctx" && r.w.active && r.ctx.active));
    this.at = Math.min(this.at, pickable.length - 1);
    const sel = pickable[this.at];
    // One continuous strip: each row (and the group title before it) at a fixed
    // y. Scrolling moves the strip only as far as it takes to keep the selected
    // row in view, so the arrows can't run the selection off the list.
    const H = { head: 35, earlier: 44, new: 36, ctx: 32, space: 32 };
    const tops = [];
    let y = 0;
    rows.forEach((r) => { tops.push(y); y += H[r.kind] ?? 32; });
    const total = y;
    const height = Math.min(320, this.listHeight ?? 320);
    const fixed = total > height;
    const maxScroll = Math.max(0, total - height);
    this.scroll = Math.max(0, Math.min(this.scroll, maxScroll));
    const si = rows.indexOf(sel);
    if (si >= 0) {
      if (tops[si] < this.scroll) this.scroll = tops[si];
      if (tops[si] + (H[sel.kind] ?? 32) > this.scroll + height) this.scroll = tops[si] + (H[sel.kind] ?? 32) - height;
    }
    const place = (el, i) =>
      fixed
        ? el.absolute().left(0).right(0).top(tops[i] - this.scroll).bottom(height - (tops[i] + (H[rows[i].kind] ?? 32) - this.scroll))
        : el;
    const visible = (i) => !fixed || (tops[i] + (H[rows[i].kind] ?? 32) > this.scroll && tops[i] < this.scroll + height);

    const lit = (el, on, id) => el
      .when(on, (e) => swipe(e))
      .when(!on && this.hover === id, (e) => e.bg(SWIPE_SOFT).rounded_tl(3).rounded_tr(8).rounded_br(4).rounded_bl(9))
      .on_hover((h, cx) => { this.hover = h ? id : (this.hover === id ? null : this.hover); cx.notify(); });
    const row = (r) => {
      if (r.kind === "head") {
        return h_flex().px(10).pt(10).pb(3).gap(8).items_center().text_size(12).text_color(MUTED)
          .child(avatar((shared("space.colors") ?? {})[r.w.id], spaceColor(t, r.w), [...r.w.name][0]?.toUpperCase() ?? "?"))
          .child(r.w.name);
      }
      if (r.kind === "earlier") {
        return v_flex().id("pk-earlier-wrap").mt(4)
          .child(separator())
          .child(lit(h_flex().id("pk-earlier").mx(4).px(10).h(28).items_center().text_size(13).text_color(r === sel ? INK : PENCIL).cursor_pointer(), r === sel, "pk-earlier")
            .on_click((_e, cx) => this.go(r, cx))
            .child(`earlier: ${r.count} quiet space${r.count > 1 ? "s" : ""} ${this.showEarlier ? "▴" : "▾"}`));
      }
      const on = r === sel;
      if (r.kind === "new" || r.kind === "space") {
        const label = r.kind === "new" ? "New tab" : r.machine ? `New space on ${r.machine}` : "New space";
        const id = r.kind === "new" ? "pk-new" : `pk-space-${r.machine ?? "here"}`;
        return lit(h_flex().id(id).mx(4).when(r.kind === "new", (el) => el.mt(4)).px(10).h(32).items_center().gap(10).text_color(on ? INK : SOFT).cursor_pointer(), on, id)
          .on_click(() => this.go(r))
          .child(svg("mods/looseleaf-chrome/plus.svg").size(16).flex_none())
          .child(label);
      }
      const who = r.mine.map((a) => a.program?.name ?? "agent").join(" · ");
      const here = r.w.active && r.ctx.active;
      const id = `pk-${r.ctx.id}`;
      return lit(h_flex().id(id).mx(4).px(10).h(32).gap(10).items_center().cursor_pointer(), on, id)
        .on_click(() => this.go(r))
        .child(this.glyph(t, r.ctx.status))
        .child(div().flex_1().truncate().text_color(INK).when(here, (d) => d.font_weight(700)).child(r.ctx.name))
        .when(r.ctx.status === "blocked", (el) => el.child(div().text_size(12.5).font_weight(700).text_color(RED).child("needs you")))
        .when(r.ctx.status === "done", (el) => el.child(div().text_size(12.5).text_color(t.done).child("finished")))
        .child(div().text_size(12.5).text_color(PENCIL).child(who + (r.team ? `  +${r.team}` : "")));
    };

    return paper(this, v_flex()
      .id("picker")
      .track_focus(this.handle)
      .w_full()
      .min_h(0)
      .px(12)
      .pt(14)
      .pb(10)
      .gap(8)
      .text_size(14)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") return this.close();
        if (k === "down") this.at = (this.at + 1) % pickable.length;
        else if (k === "up") this.at = (this.at + pickable.length - 1) % pickable.length;
        else if (k === "d" && e.modifiers.control) {
          if (sel?.kind === "ctx") {
            this.close();
            run("tab.close", { id: sel.ctx.id });
          }
        } else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().px(6).items_center().child(div().flex_1().text_size(17).font_weight(700).text_color(INK).child("Go to…"))
        .child(div().id("picker-esc").cursor_pointer().on_click(() => this.close()).child(keycap("Esc"))))
      .child(
        h_flex().relative().h(40).flex_none().px(10).gap(10).items_center()
          .child(image("mods/looseleaf-chrome/ink/cmd-616-on.svg").absolute().left(-12).top(-12).w(640).h(64))
          .child(svg("mods/looseleaf-chrome/search.svg").size(18).flex_none().text_color(PENCIL))
          .child(Input.new(this.input).relative().flex_1().h_full().text_size(15).text_color(INK)),
      )
      .child(
        v_flex()
          .id("pk-list")
          .on_size_change((size, cx) => {
            this.listHeight = size.height / settings().zoom;
            cx.notify();
          })
          .h(Math.min(320, total))
          .min_h(0)
          .mb(6)
          .when(fixed, (el) =>
            el.overflow_hidden().on_scroll_wheel((e, cx) => {
              this.scroll = Math.max(0, Math.min(this.scroll - e.delta.y, maxScroll));
              // The selection follows the wheel, so the next frame doesn't scroll back to it.
              while (this.at < pickable.length - 1 && tops[rows.indexOf(pickable[this.at])] < this.scroll) this.at++;
              while (this.at > 0 && tops[rows.indexOf(pickable[this.at])] + (H[pickable[this.at].kind] ?? 32) > this.scroll + height) this.at--;
              cx.notify();
            }))
          .children(rows.map((r, i) => (visible(i) ? place(row(r), i) : null)).filter(Boolean)),
      ));
  }
}
