// Looseleaf parts for the side panels (copied into each mod that uses them): the Paper sheet,
// pencil rules, the highlighter swipe, badges, the input frame and the small outline button,
// all drawn by Looseleaf's own recipes (looseleaf-chrome/ink/, looseleaf-tabs/ink/).

import { div, image } from "gpui-kit";
import { h_flex } from "gpui-base";

export const INK = "#2a2420", SOFT = "#4a423b", PENCIL = "#5a554e", MARK = "#8e887f", RED = "#c2412d", GREEN = "#3b7a4b", BLUE = "#2c4f9e", SHADE = "#ece6da";
const SWIPE = "#f8dc4c9e", SWIPE_SOFT = "#f8dc4c4d";

// The page: plain Paper. Its torn edges are drawn around the panel by the layout's
// looseleaf-edge blocks, the same ones that frame the terminals.
export const sheet = (_view, _id, content) => div().size_full().bg("#f8f5ee").child(content);

// A pencil rule across the sheet, cropped from one long drawn line.
export const rule = () => div().relative().h(2).mx(8).flex_none().overflow_hidden()
  .child(image("mods/looseleaf-chrome/ink/rule-h.svg").absolute().left(-12).top(-12).w(3864).h(26));

export const swipe = (el, soft = false) => el.bg(soft ? SWIPE_SOFT : SWIPE).rounded_tl(3).rounded_tr(8).rounded_br(4).rounded_bl(9);

// A badge sized to its text (about 6.6 px a character at 12 px): "o" outline, "d" destructive, "s" secondary.
export function badge(text, kind = "o") {
  const W = Math.min(120, Math.max(28, Math.ceil((text.length * 6.6 + 16) / 4) * 4));
  return div().relative().h(20).w(W).flex_none().flex().items_center().justify_center().text_size(12).text_color(kind === "d" ? "#fbf8f1" : SOFT)
    .child(image(`mods/looseleaf-chrome/ink/badge-${kind}-${W}.svg`).absolute().left(-12).top(-12).w(W + 24).h(44))
    .child(div().relative().pb(1).child(text));
}

// The drawn input frame behind a field, at the field's measured width; blue ink while typing.
export function field(view, key, focused) {
  const w = view[key] ?? 200, W = Math.min(780, Math.max(120, Math.floor(w / 4) * 4));
  return {
    measure: (size, cx) => { if (Math.abs((view[key] ?? 0) - size.width) >= 1) { view[key] = size.width; cx.notify(); } },
    art: image(`mods/looseleaf-chrome/ink/field-${W}${focused ? "-on" : ""}.svg`).absolute().left(-12).top(-12).w(W + 24).h(56),
  };
}

// Looseleaf's small outline button: paper slip in ink; the highlighter wash when lit.
export function button(view, id, label, { enabled = true, onClick }) {
  const W = Math.min(200, Math.max(48, Math.ceil((label.length * 7.4 + 22) / 4) * 4));
  const lit = enabled && view.hover === id;
  return h_flex().id(id).relative().h(26).w(W).flex_none().items_center().justify_center()
    .text_size(13.2).font_weight(700).text_color(enabled ? INK : MARK)
    .when(enabled, (el) => el.cursor_pointer())
    .on_hover((h, cx) => { view.hover = h ? id : (view.hover === id ? null : view.hover); cx.notify(); })
    .on_click(onClick)
    .child(image(`mods/looseleaf-tabs/ink/pb-${W}${lit ? "-on" : ""}.svg`).absolute().left(-12).top(-12).w(W + 24).h(50))
    .child(div().relative().child(label));
}
