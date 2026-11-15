import { View, div, svg, image } from "gpui-kit";
import { h_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, run, openOverlay, theme, window, shared, layout, settings } from "herdr";

// Looseleaf's pencil rules, drawn once long (looseleaf-chrome/ink/rule-*.svg) and cropped to fit.
const ruleH = (edge) => image("mods/looseleaf-chrome/ink/rule-h.svg").absolute().left(-12).w(3864).h(26)[edge](edge === "top" ? -12 : -11);
const ruleV = () => image("mods/looseleaf-chrome/ink/rule-v.svg").absolute().right(-12).top(-12).w(26).h(2424);

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class Tabs extends View {
  init() {
    this.pressed = null;
    this.scroll = ScrollHandle.new();
    this.widths = {};
    this.hover = null;
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  render() {
    const t = theme();
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const active = shown.findIndex(tab => tab.active);
    const selected = shown[active]?.id;
    if (selected !== this.selected || active !== this.selectedIndex) {
      this.selected = selected;
      this.selectedIndex = active;
      if (active >= 0) this.scroll.scroll_to_item(active);
    }
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const item = (c, i) => {
      const program = panes().find(p => p.tab === c.id && p.program?.agent)?.program ?? panes().find(p => p.tab === c.id)?.program;
      const name = /^tb\d+$/.test(c.name) ? program?.name ?? "Terminal" : c.name;
      // Looseleaf's outline button, drawn by its own recipe (ink/tab-<w>.svg, every 4 px):
      // paper slip in ink at rest; highlighter wash and a pen drop line when active or hovered.
      const lit = c.active || this.hover === c.id;
      const W = Math.min(320, Math.max(40, Math.ceil((this.widths[c.id] ?? 80) / 4) * 4));
      return h_flex().id(`tab-${c.id}`).relative().h(30).min_w(W).px(12).gap(7).items_center().flex_none().text_size(13.5).font_weight(700)
        .text_color(c.active ? t.foreground : t.muted)
        .on_size_change((size, cx) => {
          if (Math.abs((this.widths[c.id] ?? 0) - size.width) >= 1) { this.widths[c.id] = size.width; cx.notify(); }
          // A rename or status dot on this or an earlier tab can push the active one out.
          if (i <= active) { this.scroll.scroll_to_item(active); cx.notify(); }
        })
        .on_hover((on, cx) => { this.hover = on ? c.id : (this.hover === c.id ? null : this.hover); cx.notify(); })
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "looseleaf-menu", kind: "popup", frame: "none", width: 268, height: 226, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .child(image(`mods/looseleaf-tabs/ink/tab-${W}${lit ? "-on" : ""}.svg`).absolute().left(-12).top(-12).w(W + 24).h(54))
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(16).text_color(t.muted) : image(program.icon).size(16)))
        .child(div().max_w(170).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(c.status === "working", el => el.child(svg("mods/looseleaf-chrome/spinner.svg").size(16).flex_none().text_color(t.working).spin(900)))
        .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(6).rounded(3).bg(t[c.status])))
        .when(c.active, el => el.child(div().id(`close-${c.id}`).text_color(t.dim).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/looseleaf-pane/close.svg").size(16))));
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    this.syncPanel(space, panel, body, enabled);
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      // Looseleaf's small outline button (ink/pb-<w>.svg); the highlighter version when open or hovered.
      const lit = on || this.hover === `panel-${id}`;
      const W = Math.min(128, Math.max(48, Math.ceil((this.widths[`panel-${id}`] ?? 70) / 4) * 4));
      return h_flex().id(`panel-${id}`).relative().h(26).min_w(W).px(10).gap(5).flex_none().items_center()
        .text_size(13.2).font_weight(700).text_color(on ? t.foreground : t.muted).on_mouse_down("left", stop)
        .on_size_change((size, cx) => { const k = `panel-${id}`; if (Math.abs((this.widths[k] ?? 0) - size.width) >= 1) { this.widths[k] = size.width; cx.notify(); } })
        .on_hover((h, cx) => { const k = `panel-${id}`; this.hover = h ? k : (this.hover === k ? null : this.hover); cx.notify(); })
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        })
        .child(image(`mods/looseleaf-tabs/ink/pb-${W}${lit ? "-on" : ""}.svg`).absolute().left(-12).top(-12).w(W + 24).h(50))
        .child(svg(icon).size(16)).child(label);
    };
    return h_flex().size_full().min_w(0).px(10).pl(lightsPadding).gap(8).items_center().relative()
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(8).px(4).overflow_x_scrollbar().track_scroll(this.scroll)
        .on_size_change((_size, cx) => { if (active >= 0) { this.scroll.scroll_to_item(active); cx.notify(); } })
        .children(shown.map(item)))
      .child(div().w(4)).child(button("tab-new", "+", () => openOverlay({ mod: "looseleaf-new-menu", kind: "popup", frame: "none", width: 318, height: 546 })))
      .when(enabled.includes("files"), el => el.child(panelButton("files", "Files", "mods/looseleaf-files/file.svg")))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/looseleaf-chrome/git-compare.svg")))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/looseleaf-tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/looseleaf-tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/looseleaf-tabs/win-close.svg").size(16) : svg("mods/looseleaf-pane/close.svg").size(16), () => run("window.close"))));
  }
}
