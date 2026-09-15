import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadApp, sampleTree } from "../helpers/app.js";
import { click, key, mousedown, mousemove, mouseup } from "../helpers/dom.js";

let app;
beforeEach(() => { app = loadApp({ stored: { tree: sampleTree(), selected: "p1", navWidth: 270, navOpen: true } }); });
afterEach(() => app.close());

const db = () => app.get("db");
const body = () => app.document.body;
const sw = () => app.document.documentElement.style.getPropertyValue("--sw");
const W = () => app.window;

describe("sidebar resize grip", () => {
  const grip = () => app.$("grip");

  it("mousedown activates the grip and prevents text selection", () => {
    const ev = mousedown(grip(), { clientX: 270 });
    expect(ev.defaultPrevented).toBe(true);
    expect(grip().classList.contains("active")).toBe(true);
    mouseup(W());
  });

  it("dragging changes the width live", () => {
    mousedown(grip(), { clientX: 270 });
    mousemove(W(), { clientX: 330 });
    expect(db().navWidth).toBe(330);
    expect(sw()).toBe("330px");
    mousemove(W(), { clientX: 250 });
    expect(db().navWidth).toBe(250);
    mouseup(W());
  });

  it("clamps between 190 and 520", () => {
    mousedown(grip(), { clientX: 270 });
    mousemove(W(), { clientX: -1000 });
    expect(db().navWidth).toBe(190);
    mousemove(W(), { clientX: 5000 });
    expect(db().navWidth).toBe(520);
    mouseup(W());
  });

  it("mouseup deactivates, saves and stops tracking", () => {
    mousedown(grip(), { clientX: 270 });
    mousemove(W(), { clientX: 300 });
    mouseup(W());
    expect(grip().classList.contains("active")).toBe(false);
    mousemove(W(), { clientX: 400 });
    expect(db().navWidth).toBe(300);
    app.flush();
    expect(app.stored().navWidth).toBe(300);
  });

  it("schedules a code-block header re-sync while dragging", () => {
    app.call("setMode", "edit");
    app.flush();
    mousedown(grip(), { clientX: 270 });
    mousemove(W(), { clientX: 300 });
    expect(app.get("syncQueued")).toBe(true);
    mouseup(W());
  });
});

describe("toggleNav()", () => {
  it("hides and shows the sidebar, persisting the state", () => {
    app.call("toggleNav");
    expect(db().navOpen).toBe(false);
    expect(body().classList.contains("nav-closed")).toBe(true);
    app.flush();
    expect(app.stored().navOpen).toBe(false);
    app.call("toggleNav");
    expect(db().navOpen).toBe(true);
    expect(body().classList.contains("nav-closed")).toBe(false);
  });

  it("is wired to the app-bar button", () => {
    click(app.$("btnNav"));
    expect(body().classList.contains("nav-closed")).toBe(true);
  });
});

describe("keyboard shortcuts", () => {
  it("Ctrl+S commits and returns to view mode", () => {
    app.call("setMode", "edit");
    app.$("editor").innerHTML = "<p>ctrl s</p>";
    const ev = key(body(), "s", { ctrlKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(app.get("mode")).toBe("view");
    expect(app.call("find", "p1").node.content).toBe("<p>ctrl s</p>");
  });

  it("Ctrl+S in view mode just re-saves", () => {
    const ev = key(body(), "S", { ctrlKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(app.$("status").textContent).toBe("Saved");
    expect(app.get("mode")).toBe("view");
  });

  it("Cmd (meta) works like Ctrl", () => {
    key(body(), "e", { metaKey: true });
    expect(app.get("mode")).toBe("edit");
  });

  it("Ctrl+E toggles between view and edit", () => {
    key(body(), "e", { ctrlKey: true });
    expect(app.get("mode")).toBe("edit");
    key(body(), "e", { ctrlKey: true });
    expect(app.get("mode")).toBe("view");
  });

  it("Ctrl+E from source mode goes to view", () => {
    app.call("setMode", "source");
    key(body(), "e", { ctrlKey: true });
    expect(app.get("mode")).toBe("view");
  });

  it("Ctrl+E does nothing when no page is open", () => {
    app.set("openId", null);
    key(body(), "e", { ctrlKey: true });
    expect(app.get("mode")).toBe("view");
  });

  it("Ctrl+E still edits the open page when the highlighted row is a folder", () => {
    db().selected = "f1";
    key(body(), "e", { ctrlKey: true });
    expect(app.get("mode")).toBe("edit");
    app.$("editor").innerHTML = "<p>folder highlighted</p>";
    key(body(), "e", { ctrlKey: true });
    expect(app.call("find", "p1").node.content).toBe("<p>folder highlighted</p>");
    expect(app.call("find", "f1").node.content).toBeUndefined();
  });

  it("Ctrl+E leaving edit mode commits, even for changes that fired no input event", () => {
    key(body(), "e", { ctrlKey: true });
    app.$("editor").innerHTML = "<p>via ctrl+e</p>";
    key(body(), "e", { ctrlKey: true });
    expect(app.get("mode")).toBe("view");
    expect(app.call("find", "p1").node.content).toBe("<p>via ctrl+e</p>");
  });

  it("Ctrl+\\ toggles the sidebar", () => {
    const ev = key(body(), "\\", { ctrlKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(db().navOpen).toBe(false);
  });

  it("Ctrl+F is left to the browser (find in page), even with the sidebar closed", () => {
    app.call("toggleNav");
    const ev = key(body(), "f", { ctrlKey: true });
    expect(ev.defaultPrevented).toBe(false);
    expect(db().navOpen).toBe(false);
    expect(app.document.activeElement).not.toBe(app.$("search"));
  });

  it("Ctrl+F does nothing while editing either", () => {
    app.call("setMode", "edit");
    const ev = key(app.$("editor"), "f", { ctrlKey: true });
    expect(ev.defaultPrevented).toBe(false);
    expect(app.get("mode")).toBe("edit");
    expect(app.document.activeElement).not.toBe(app.$("search"));
  });

  it("Ctrl+Shift+F is left to the browser", () => {
    const ev = key(body(), "F", { ctrlKey: true, shiftKey: true });
    expect(ev.defaultPrevented).toBe(false);
    expect(app.document.activeElement).not.toBe(app.$("search"));
  });

  it("plain keys and other Ctrl combos are ignored", () => {
    expect(key(body(), "s").defaultPrevented).toBe(false);
    expect(key(body(), "q", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(app.get("mode")).toBe("view");
  });

  it("Escape saves and leaves edit / source mode", () => {
    app.call("setMode", "edit");
    app.$("editor").innerHTML = "<p>esc</p>";
    key(body(), "Escape");
    expect(app.get("mode")).toBe("view");
    expect(app.call("find", "p1").node.content).toBe("<p>esc</p>");

    app.call("setMode", "source");
    key(body(), "Escape");
    expect(app.get("mode")).toBe("view");
  });

  it("Escape in view mode is a no-op", () => {
    expect(() => key(body(), "Escape")).not.toThrow();
    expect(app.get("mode")).toBe("view");
  });
});

describe("beforeunload", () => {
  it("commits unsaved edits", () => {
    app.call("setMode", "edit");
    app.$("editor").innerHTML = "<p>bye</p>";
    W().dispatchEvent(new (W().Event)("beforeunload"));
    expect(app.call("find", "p1").node.content).toBe("<p>bye</p>");
  });

  it("writes to localStorage synchronously (the save debounce cannot fire after unload)", () => {
    app.call("setMode", "edit");
    app.$("editor").innerHTML = "<p>bye</p>";
    W().dispatchEvent(new (W().Event)("beforeunload"));
    expect(app.stored().tree[0].children[0].content).toBe("<p>bye</p>");   // no app.flush()
  });

  it("flushes a pending debounced save in view mode", () => {
    app.call("find", "p1").node.name = "Renamed";
    app.call("save");
    W().dispatchEvent(new (W().Event)("beforeunload"));
    expect(app.$("status").textContent).toBe("");
    expect(app.stored().tree[0].children[0].name).toBe("Renamed");
  });
});
