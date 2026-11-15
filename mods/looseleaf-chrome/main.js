import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, window, shared, setShared, updates, layout } from "herdr";

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

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

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
  return div().size_full().px(8).when(part === "top", el => el.pt(20)).when(part === "foot", el => el.pb(8)).child(
    div().id(`${part}-sheet`).relative().size_full()
      .on_size_change((size, cx) => {
        if (Math.abs((view.sheetW ?? 0) - size.width) >= 1 || Math.abs((view.sheetH ?? 0) - size.height) >= 1) { view.sheetW = size.width; view.sheetH = size.height; cx.notify(); }
      })
      .child(crop)
      .child(div().relative().size_full().child(content))
      .when(Boolean(extra), el => el.child(extra(w))));
}


export default class WorkspaceChrome extends View {
  // Looseleaf's outline icon button (ink/ib-<a|b|c>.svg, its button recipe at icon-sm): a paper
  // slip edged in ink, the highlighter wash and pen drop line when hovered.
  button(id, label, action, art = "a") {
    const lit = this.hover === id;
    return div().id(id).relative().size(28).flex_none().flex().items_center().justify_center().cursor_pointer()
      .text_color(lit ? "#2a2420" : "#4a423b")
      .on_hover((h, cx) => { this.hover = h ? id : (this.hover === id ? null : this.hover); cx.notify(); })
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action)
      .child(image(`mods/looseleaf-chrome/ink/ib-${art}${lit ? "-on" : ""}.svg`).absolute().left(-12).top(-12).w(52).h(52))
      .child(div().relative().child(label));
  }
  render() {
    const t = theme();
    const collapsed = narrow();
    if (props()?.footer) {
      const ready = div().size(6).rounded_full().bg(t.accent);
      // The rail keeps its icon column.
      if (collapsed) {
        const cell = (id, icon, label, action) => h_flex().id(id).relative().h(19).w(32).justify_center().items_center().rounded(8).tooltip(label)
          .text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer().on_click(action)
          .child(svg(`mods/looseleaf-chrome/${icon}.svg`).size(16));
        return sheet(this, "foot", v_flex().size_full().items_center()
          .child(cell("settings", "settings", "Settings", () => run("app.settings")).when(Boolean(updates().app.ready), el => el.child(ready.absolute().top(5).right(6))))
          .child(cell("machine", "plus", "Add machine", () => run("mod.open", { name: "machine-add" }))));
      }
      // Quiet, like the status bar beside it: two ghost buttons on one line.
      // The foot of the page: a pencil rule, then two ghost buttons on one line.
      return sheet(this, "foot", v_flex().size_full()
        .child(div().relative().h(2).mx(12).flex_none().overflow_hidden()
          .child(image("mods/looseleaf-chrome/ink/rule-h.svg").absolute().left(-12).top(-12).w(3864).h(26)))
        .child(h_flex().flex_1().px(8).gap(2).items_center()
          .child(ghost(this, "settings", [svg("mods/looseleaf-chrome/settings.svg").size(14).flex_none(), div().child("Settings")]
            .concat(updates().app.ready ? [ready] : []), () => run("app.settings")))
          .child(ghost(this, "machine", [svg("mods/looseleaf-chrome/plus.svg").size(14).flex_none(), div().child("Add machine")],
            () => run("mod.open", { name: "machine-add" })))));
    }
    return h_flex().size_full().pl(collapsed ? 6 : 14).pr(10).gap(8).items_center().text_size(13.5)
      .when(window()?.platform === "macos" && !window()?.fullscreen && !collapsed, el => el.pl(76))
      .when(!collapsed, el => el.child(h_flex().flex_1().gap(8).items_center().child(image("mods/looseleaf-chrome/mark.svg").size(32).ml(-2))
        .child(v_flex().gap(0).child(div().font_weight(700).text_size(20).text_color(t.foreground).child("Herdr"))
          .child(image("mods/looseleaf-chrome/squiggle.svg").w(46).h(6).ml(1)))))
      .when(!collapsed, el => el.child(this.button("search", svg("mods/looseleaf-chrome/search.svg").size(16), () => run("mod.open", { name: "looseleaf-picker" }))))
      // On the macOS rail the traffic lights fill the row; the agents list's » unfolds it.
      .when(!(collapsed && window()?.platform === "macos"), el => el.child(this.button("sidebar-toggle", svg("mods/looseleaf-chrome/sidebar.svg").size(16), toggleSidebar, "b")));
  }
}
