// Looseleaf's dropdown menu, the parts every Looseleaf menu here shares (copied into each mod
// that draws one). From Looseleaf's menu-styles: a paper slip; rows 32 px of hand text with
// 16 px icons in soft ink; the highlighted row gets the highlighter swipe (translucent
// highlighter, uneven corners); labels in the type role; pencil separators; shortcuts as
// keycaps drawn by its kbd recipe (looseleaf-chrome/ink/key-<w>.svg, every 2 px).

import { div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { window } from "herdr";

export const INK = "#2a2420", SOFT = "#4a423b", MUTED = "#4a433c", PENCIL = "#5a554e", RED = "#c2412d", SLIP = "#fbf8f1";
const SWIPE = "#f8dc4c9e";

// The menu's sheet: Looseleaf's Paper stock (cream, cut edges with a hand wobble, a short warm
// shadow), drawn by its paper recipe one tall sheet per menu width (looseleaf-chrome/ink/
// paper-<w>.svg, 1200 px). Two crops of it make any height: top and sides from its top, the
// bottom edge from its bottom. `view` keeps the measured size.
const SHEETS = [220, 230, 240, 250, 290], PAD = 16, TALL = 1200, FOOT = 30;
export function paper(view, el) {
  const w = view.paperW ?? 240, h = view.paperH ?? 200;
  const W = SHEETS.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
  // pop-<w>.svg: the sheet with a firmer pencil edge and a soft lifted shadow; the overlay is
  // 28 px wider and 26 px taller than the sheet to leave the shadow room.
  const art = () => image(`mods/looseleaf-chrome/ink/pop-${W}.svg`).absolute().left(0).w(W + 2 * PAD).h(TALL + 2 * PAD);
  return div().px(14).pt(8).pb(18).child(div().id("paper").relative().w_full()
    .on_size_change((size, cx) => {
      if (Math.abs((view.paperW ?? 0) - size.width) >= 1 || Math.abs((view.paperH ?? 0) - size.height) >= 1) { view.paperW = size.width; view.paperH = size.height; cx.notify(); }
    })
    .child(div().absolute().left(-PAD).top(-PAD).w(w + 2 * PAD).h(Math.max(0, h - FOOT) + PAD).overflow_hidden().child(art().top(0)))
    .child(div().absolute().left(-PAD).bottom(-PAD).w(w + 2 * PAD).h(Math.min(h, FOOT) + PAD).overflow_hidden().child(art().bottom(0)))
    .child(el.relative().p(4)));
}

export const swipe = (el) => el.bg(SWIPE).rounded_tl(3).rounded_tr(8).rounded_br(4).rounded_bl(9);

export const label = (text) => div().px(10).pt(6).pb(4).text_size(11.5).text_color(MUTED).child(text);

export const separator = () => div().relative().h(2).mx(2).my(5).overflow_hidden()
  .child(image("mods/looseleaf-chrome/ink/rule-h.svg").absolute().left(-12).top(-12).w(3864).h(26));

// One keycap, sized to its label (about 7.6 px a character in Kevin Sans at 12.3 px).
export function keycap(text) {
  const W = Math.min(64, Math.max(20, Math.ceil((text.length * 7.6 + 10) / 2) * 2));
  return div().relative().h(20).min_w(W).px(5).flex().items_center().justify_center().text_size(12.3).text_color(SOFT)
    .child(image(`mods/looseleaf-chrome/ink/key-${W}.svg`).absolute().left(-12).top(-12).w(W + 24).h(44))
    .child(div().relative().pb(2).child(text));
}

// "cmd-shift-p" -> ["Shift", "⌘", "P"], in Looseleaf's order; other keyboards spell modifiers out.
export function caps(binding) {
  if (!binding?.trim()) return [];
  const mac = window()?.platform === "macos";
  const parts = binding.trim().split(/\s+/)[0].split("-");
  let key = parts.pop();
  if (key === "") { key = "-"; parts.pop(); }
  const held = new Set(parts.map((m) => m.toLowerCase()));
  const names = mac ? { shift: "Shift", ctrl: "⌃", alt: "⌥", cmd: "⌘" } : { shift: "Shift", ctrl: "Ctrl", alt: "Alt", cmd: "Super" };
  const label = key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1).toLowerCase();
  return [...["shift", "ctrl", "alt", "cmd"].filter((m) => held.has(m)).map((m) => names[m]), label];
}

export const shortcut = (binding) => h_flex().flex_none().gap(4).pl(16).items_center().children(caps(binding).map(keycap));

// A row: icon, label, then a hint (keycaps or text) on the right.
export function item(id, { icon, text, hint, lit, disabled, danger, onClick }) {
  const color = disabled ? PENCIL : danger ? RED : INK;
  return h_flex().id(id).min_h(32).py(4).px(10).gap(10).items_center().flex_none().text_size(14).text_color(color)
    .when(Boolean(lit) && !disabled, swipe)
    .when(!disabled, (el) => el.cursor_pointer().on_click(onClick))
    .child(icon ? (typeof icon === "string" ? svg(icon).size(16).flex_none().text_color(disabled ? PENCIL : danger ? RED : SOFT) : icon) : div().w(16).flex_none())
    .child(div().flex_1().min_w(0).truncate().child(text))
    .when(Boolean(hint), (el) => el.child(hint));
}

export const list = (el) => v_flex().w_full().child(el);
