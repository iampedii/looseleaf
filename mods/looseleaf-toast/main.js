// Notifications as Looseleaf alerts: a paper slip drawn in felt tip (ink/alert-<tone>.svg,
// drawn by Looseleaf's alert recipe at the toast's 338×70), each tone with its own margin mark
// and its icon circled in the tone's marker. Click to run its action and dismiss it.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, theme } from "herdr";

// Herdr's level -> Looseleaf's alert tone, its icon and its pen colour.
const TONE = {
  error: { tone: "destructive", icon: "circle-alert", pen: "#c2412d" },
  warning: { tone: "warning", icon: "triangle-alert", pen: "#2a2420" },
  success: { tone: "success", icon: "circle-check", pen: "#3b7a4b" },
  info: { tone: "info", icon: "info", pen: "#2c4f9e" },
};
const PLAIN = { tone: "default", icon: "bell", pen: "#2a2420" };

export default class Toast extends View {
  render() {
    const t = theme();
    const p = props() ?? {};
    const k = TONE[p.level] ?? PLAIN;
    const error = k.tone === "destructive";
    const login = /^([a-z0-9][a-z0-9_.-]{0,31}) needs login; run hc machine login \1$/.exec(p.body ?? "");
    const command = login ? `hc machine login ${login[1]}` : null;
    return h_flex()
      .id("toast")
      .relative()
      .size_full()
      .pl(16)
      .pr(18)
      .gap(14)
      .items_start()
      .pt(14)
      .bg("#fbf8f1")
      .cursor_pointer()
      .on_click(() => {
        if (p.action?.name) run(p.action.name, p.action.args ?? {});
        closeOverlay(p.overlay);
      })
      // The slip and its margin mark sit behind; the drawing overshoots 12 px on every side.
      .child(image(`mods/looseleaf-toast/ink/alert-${k.tone}.svg`).absolute().left(-12).top(-12).w(362).h(94))
      .child(p.icon
        ? image(p.icon).w(16).h(16).flex_none()
        : svg(`mods/looseleaf-toast/ink/${k.icon}.svg`).size(16).flex_none().text_color(k.pen))
      .child(
        v_flex()
          .flex_1()
          .overflow_hidden()
          .gap(2)
          .child(div().truncate().font_weight(700).text_size(14).text_color(error ? "#c2412d" : t.foreground).child(login ? `${login[1]} needs a login: run` : p.title ?? ""))
          // Looseleaf keeps destructive descriptions red, not dimmed.
          .when(!login && Boolean(p.body), (el) => el.child(div().truncate().text_size(12.5).text_color(error ? "#c2412d" : t.muted).child(p.body ?? "")))
          .when(Boolean(login), (el) => el.child(h_flex().gap(8).items_center()
            .child(div().flex_1().min_w(0).truncate().tooltip(command).text_size(12).text_color(t.muted).child(command))
            .child(div().id("toast-login-copy").flex_none().px(6).py(3).rounded(3).border(1).border_color("#2a2420").bg("#fbf8f1")
              .text_size(12).text_color(t.foreground).cursor_pointer().hover(s => s.bg("#f8ecb5"))
              .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(command); this.copied = true; cx.notify(); })
              .child(this.copied ? "Copied" : "Copy")))),
      );
  }
}
