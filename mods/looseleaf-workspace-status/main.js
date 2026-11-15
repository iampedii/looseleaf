import { View, div, image, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run, window, keys, layout } from "herdr";

// Looseleaf's ghost button, quiet for the bottom strip: no outline, pencil-grey hand text, a
// 14 px icon; hover lays the highlighter swipe (translucent highlighter, uneven corners).
const ghost = (view, id, content, action, lit = false) => {
  const on = lit || view.hover === id;
  return h_flex().id(id).h(24).px(7).gap(5).flex_none().items_center().cursor_pointer()
    .text_size(12.5).text_color(on ? "#2a2420" : "#5a554e")
    .when(on, (el) => el.bg("#f8dc4c9e").rounded_tl(3).rounded_tr(8).rounded_br(4).rounded_bl(9))
    .on_hover((h, cx) => { view.hover = h ? id : (view.hover === id ? null : view.hover); cx.notify(); })
    .on_click(action)
    .children(content);
};

// The status bar on the desk, its items Looseleaf's small outline buttons like the top bar's
// (looseleaf-tabs/ink/pb-<w>.svg, drawn by its button recipe every 4 px): paper slip in ink at
// rest, highlighter wash and a pen drop line when hovered.
const FRAME_MIN = 48, FRAME_MAX = 200;

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class WorkspaceStatus extends View {
  init() {
    this.widths = {};
    this.hover = null;
  }

  // The palette key as actually bound, not a hardcoded one; without a
  // binding the hint stays useful ("commands") instead of lying.
  hint() {
    const mac = window()?.platform === "macos";
    const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
    const b = keys().find((k) => k.section === "global" && k.action === "app.palette");
    const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
    const key = parts && parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
    return key ? `${key}  commands` : "commands";
  }


  render() {
    const t = theme();
    const space = spaces().find(s => s.active);
    const list = agents();
    const needs = list.filter(a => a.status === "blocked").length;
    const icon = (name) => svg(`mods/looseleaf-chrome/${name}.svg`).size(14).flex_none();
    const text = (s) => div().min_w(0).truncate().child(s);
    const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
    const changesOpen = panel && !panel.hidden && body?.active === "changes";
    return h_flex().size_full().px(8).gap(2).items_center()
      .child(ghost(this, "status-machine", [icon(space?.machine ? "server" : "monitor"), text(space?.machine ?? "This computer")],
        () => run("app.settings", { section: "machines" })))
      .when(Boolean(space?.branch), el => el.child(ghost(this, "status-branch", [icon("branch"), text(space.branch)], () => {
        if (changesOpen) run("layout.hide", { id: "panel" });
        else { run("layout.select", { stack: "panel-body", child: "changes" }); run("layout.show", { id: "panel" }); }
      }, changesOpen)))
      .child(ghost(this, "status-agents", [
        div().size(6).rounded(3).flex_none().bg(needs > 0 ? t.blocked : t.dim),
        text(needs > 0 ? `${list.length} agents · ${needs} needs you` : `${list.length} agents`),
      ], () => run("agent.next")))
      .child(div().flex_1())
      .child(ghost(this, "status-palette", [text(this.hint())], () => run("app.palette")));
  }
}
