import { View, div, svg, image } from "gpui-kit";
import { v_flex } from "gpui-base";
import { spaces, panes, knownAgents, run, openOverlay, closeOverlay, props, keys, shared, setShared } from "herdr";
import { paper, item, label, separator, shortcut, keycap, PENCIL } from "./kit.js";

// The + menu as Looseleaf's dropdown: a terminal, the agents people can start (1-9 start them),
// then new space and worktrees. The last agents each machine reported show at once while
// knownAgents() checks again.
const KNOWN = "new-menu.agents";
const ROW = 32;

const binding = (name) => keys().find((b) => b.section === "global" && b.action === name)?.keys ?? "";

export default class NewMenu extends View {
  init(_props, cx) {
    const machine = spaces().find((s) => s.active)?.machine;
    const where = machine ?? "";
    this.agents = shared(KNOWN)?.[where] ?? [];
    this.at = null;
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.spawn(async (cx) => {
      try {
        this.agents = await knownAgents({ on: machine });
        setShared(KNOWN, { ...shared(KNOWN), [where]: this.agents });
      } catch {
        this.failed = true;
      }
      cx.notify();
    });
  }

  row(id, icon, text, action, hint = null, enabled = true) {
    return v_flex().id(`g-${id}`)
      .on_hover((on, cx) => { if (on && this.at !== id) { this.at = id; cx.notify(); } })
      .child(item(id, {
        icon, text, hint, lit: this.at === id, disabled: !enabled,
        onClick: () => { closeOverlay(props().overlay); action(); },
      }));
  }

  render() {
    const space = spaces().find((s) => s.active);
    const installed = this.agents.filter((a) => a.installed);
    const choices = this.failed ? installed : [...installed, ...this.agents.filter((a) => !a.installed).slice(0, 2)];
    const focusedCwd = panes().find((p) => p.focused)?.cwd;
    return paper(this, v_flex().min_h(0).w_full().h(Math.min(500, 200 + Math.max(1, choices.length + (this.failed ? 1 : 0)) * ROW))
      .id("new-menu").track_focus(this.handle)
      .on_key_down((e) => {
        if (e.modifiers.control || e.modifiers.platform || e.modifiers.alt) return;
        const agent = /^[1-9]$/.test(e.key) ? installed[Number(e.key) - 1] : null;
        if (!agent) return;
        closeOverlay(props().overlay);
        run("tab.new", { name: agent.name, space: space?.id, argv: agent.run });
      })
      .child(this.row("terminal", "icons/shell.svg", "Terminal", () => run("tab.new", { space: space?.id }), shortcut(binding("tab.new"))))
      .child(separator())
      .child(label("Start an agent"))
      .child(v_flex().flex_1().min_h(0).overflow_y_scrollbar()
        .children(choices.map((a, i) => this.row(a.key,
          a.tint ? svg(a.icon).size(16).flex_none() : image(a.icon).size(16).flex_none(), a.name,
          () => run("tab.new", { name: a.name, space: space?.id, argv: a.run }),
          a.installed ? (i < 9 ? keycap(String(i + 1)) : null) : div().text_size(12).text_color(PENCIL).child("not installed"),
          a.installed)))
        .when(this.failed || this.agents.length === 0, (el) => el.child(div().px(10).py(6).text_size(14).text_color(PENCIL)
          .child(this.failed ? "Could not check installed agents" : "Checking installed agents…"))))
      .child(separator())
      .child(this.row("space", "mods/looseleaf-chrome/plus.svg", "New space", () => run("space.new"), shortcut(binding("space.new"))))
      .child(this.row("worktree", "mods/looseleaf-chrome/branch.svg", "New worktree…", () => openOverlay({ mod: "worktree", kind: "dialog", width: 460, height: 280, props: { space: space?.id, folder: focusedCwd, action: "new" } }), null, Boolean(space)))
      .child(this.row("worktree-open", "mods/looseleaf-chrome/folder.svg", "Open worktree…", () => openOverlay({ mod: "worktree", kind: "dialog", width: 560, height: 480, props: { space: space?.id, folder: focusedCwd, action: "open" } }), null, Boolean(space))));
  }
}
