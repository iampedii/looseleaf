// One edge of the terminals' page. Herdr draws the terminals itself, so the page's torn
// (deckled) paper edge is drawn around them by four thin blocks of this mod, one per side:
//   { "content": { "mod": "looseleaf-edge", "props": { "side": "top" | "bottom" | "left" | "right" } } }
// Every strip is a slice of the same sheet, drawn once by Looseleaf's paper recipe (Paper
// stock, deckle edge, 4000 x 2400; ink/<side>-*.svg): the long slice gives the edge, a short
// slice from the sheet's far end gives the far corner, so any size closes cleanly.

import { View, div, image } from "gpui-kit";
import { props } from "herdr";

const T = 12, LONG = 3206, TALL = 1794, CORNER = 46, FOOT = 40;

export default class Edge extends View {
  render() {
    const side = props()?.side ?? "top";
    const w = this.w ?? 800, h = this.h ?? 600;
    const art = (name, iw, ih) => image(`mods/looseleaf-edge/ink/${name}.svg`).absolute().w(iw).h(ih);
    const root = div().id(`edge-${side}`).relative().size_full().overflow_hidden()
      .on_size_change((size, cx) => {
        if (Math.abs((this.w ?? 0) - size.width) >= 1 || Math.abs((this.h ?? 0) - size.height) >= 1) { this.w = size.width; this.h = size.height; cx.notify(); }
      });
    if (side === "top" || side === "bottom") {
      return root
        .child(div().absolute().left(0).top(0).w(Math.max(0, w - CORNER)).h(T).overflow_hidden().child(art(`${side}-l`, LONG, T).left(0).top(0)))
        .child(div().absolute().right(0).top(0).w(Math.min(w, CORNER)).h(T).overflow_hidden().child(art(`${side}-r`, CORNER, T).right(0).top(0)));
    }
    return root
      .child(div().absolute().left(0).top(0).w(T).h(Math.max(0, h - FOOT)).overflow_hidden().child(art(`${side}-t`, T, TALL).left(0).top(0)))
      .child(div().absolute().left(0).bottom(0).w(T).h(Math.min(h, FOOT)).overflow_hidden().child(art(`${side}-b`, T, FOOT).left(0).bottom(0)));
  }
}
