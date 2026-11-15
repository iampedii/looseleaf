// A pane's header, for layouts that frame their panes:
//   { "tab": "active", "pane": { "header": { "content": { "mod": "looseleaf-pane" } } } }
// Shows the program's icon (the app's program table), the agent's name or
// the terminal's title, the folder, and the agent's status; buttons split, zoom and close
// this pane. Props from the app: { pane, terminal }. Click: focus the pane.

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, theme, home, layout } from "herdr";

// Match the first visible tab frame, including the active child of a stack.
function paneFrame(node) {
  if (!node || node.hidden) return null;
  if (node.content?.tab && node.content.pane) return node.content.pane;
  let children = node.children ?? [];
  if (node.type === "stack") {
    const visible = children.filter(child => !child.hidden);
    children = [visible.find(child => child.id === node.active) ?? visible[0]];
  }
  for (const child of children) {
    const frame = paneFrame(child);
    if (frame) return frame;
  }
  return null;
}

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

export default class Pane extends View {
  init() { this.hovered = false; }

  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  // Looseleaf's ghost icon button: soft ink, the highlighter swipe under the pointer.
  button(t, id, icon, command, args) {
    const on = this.over === id;
    return div()
      .id(id)
      .size(22).flex().items_center().justify_center()
      .text_color(on ? "#2a2420" : "#5a554e")
      .when(on, (el) => el.bg("#f8dc4c9e").rounded_tl(3).rounded_tr(8).rounded_br(4).rounded_bl(9))
      .on_hover((h, cx) => { this.over = h ? id : (this.over === id ? null : this.over); cx.notify(); })
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/looseleaf-pane/${icon}.svg`).size(16));
  }

  render(cx) {
    const t = theme();
    const p = this.me();
    if (!p) return div();
    const name = ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    const pic = icon(p.program, 16, t.dim);
    const st = p.status;
    const pane = p.pane;
    const bottom = paneFrame(layout())?.header?.position === "bottom";
    // The header is the top of the page: bold hand for the program, pencil for the folder, and a
    // drawn pencil rule (cropped from one long line) on the terminal-facing edge.
    const ruleLine = div().absolute().left(0).right(0).h(2).overflow_hidden()
      .child(image("mods/looseleaf-chrome/ink/rule-h.svg").absolute().left(-12).top(-12).w(3864).h(26));
    const needs = div().relative().h(20).w(76).flex_none().flex().items_center().justify_center().text_size(12).text_color("#fbf8f1")
      .child(image("mods/looseleaf-chrome/ink/badge-d-76.svg").absolute().left(-12).top(-12).w(100).h(44))
      .child(div().relative().pb(1).child("Needs you"));
    return h_flex()
      .id(`pane-head-${pane}`)
      .size_full()
      .relative()
      .px(10)
      .gap(8)
      .items_center()
      .bg(t.background)
      .text_size(13)
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      .child(bottom ? ruleLine.top(0) : ruleLine.bottom(0))
      .when(Boolean(pic), (el) => el.child(pic))
      .child(div().flex_none().truncate().max_w(260).font_weight(700).text_color(p.focused ? "#2a2420" : "#4a423b").child(name))
      .child(div().flex_1().truncate().text_color("#5a554e").child(folder(p.cwd)))
      .when(st === "working", el => el.child(svg("mods/looseleaf-chrome/spinner.svg").size(16).flex_none().text_color(t.working).spin(900)))
      .when(st === "blocked", el => el.child(needs))
      .when(st === "done", el => el.child(svg("mods/looseleaf-chrome/check.svg").size(16).flex_none().text_color(t.done)))
      .when(this.hovered, el => el
        .child(this.button(t, `ph-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
        .child(this.button(t, `ph-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
        .child(this.button(t, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
        .child(this.button(t, `ph-x-${pane}`, "close", "pane.close", { pane })));
  }
}
