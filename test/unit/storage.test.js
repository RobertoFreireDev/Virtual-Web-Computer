import { describe, it, expect, afterEach } from "vitest";
import { loadApp, sampleTree, KEY } from "../helpers/app.js";

let app;
afterEach(() => app && app.close());

describe("first run / seed", () => {
  it("seeds a 'Getting started' folder with one page when nothing is stored", () => {
    app = loadApp();
    const db = app.get("db");
    expect(db.tree).toHaveLength(1);
    expect(db.tree[0].type).toBe("folder");
    expect(db.tree[0].name).toBe("Getting started");
    expect(db.tree[0].children[0].name).toBe("How this wiki works");
    expect(db.selected).toBe(db.tree[0].children[0].id);
  });

  it("opens the seeded page in view mode", () => {
    app = loadApp();
    expect(app.get("mode")).toBe("view");
    expect(app.$("doc").style.display).toBe("flex");
    expect(app.$("empty").style.display).toBe("none");
    expect(app.$("docTitle").value).toBe("How this wiki works");
    expect(app.$("viewer").querySelector("h2").textContent).toBe("How this wiki works");
  });

  it("persists the seed after the save debounce", () => {
    app = loadApp();
    expect(app.stored()).toBeNull();
    app.flush();
    expect(app.stored().tree[0].name).toBe("Getting started");
  });

  it("uses the seed when the stored tree is not an array", () => {
    app = loadApp({ stored: { tree: "garbage", selected: null } });
    expect(app.get("db").tree[0].name).toBe("Getting started");
  });

  it("shows the empty state when the stored tree is empty", () => {
    app = loadApp({ stored: { tree: [], selected: null, navWidth: 270, navOpen: true } });
    expect(app.$("doc").style.display).toBe("none");
    expect(app.$("empty").style.display).toBe("flex");
    expect(app.$("tree").textContent).toContain("No pages yet");
  });
});

describe("load()", () => {
  it("restores tree, selection, sidebar width and open state", () => {
    app = loadApp({ stored: { tree: sampleTree(), selected: "p3", navWidth: 333, navOpen: false } });
    const db = app.get("db");
    expect(db.tree.map(n => n.id)).toEqual(["f1", "p3", "f3"]);
    expect(db.selected).toBe("p3");
    expect(db.navWidth).toBe(333);
    expect(app.document.documentElement.style.getPropertyValue("--sw")).toBe("333px");
    expect(app.document.body.classList.contains("nav-closed")).toBe(true);
    expect(app.$("docTitle").value).toBe("Gamma");
  });

  it("falls back to 270px when navWidth is missing", () => {
    app = loadApp({ stored: { tree: sampleTree(), selected: null } });
    expect(app.document.documentElement.style.getPropertyValue("--sw")).toBe("270px");
    expect(app.document.body.classList.contains("nav-closed")).toBe(false);
  });

  it("renders the empty state when the selection points to a folder", () => {
    app = loadApp({ stored: { tree: sampleTree(), selected: "f1" } });
    expect(app.$("doc").style.display).toBe("none");
    expect(app.$("empty").style.display).toBe("flex");
  });

  it("treats corrupt JSON as a first run and marks storage as memory-only", () => {
    app = loadApp({ stored: "{not json" });
    expect(app.get("memoryOnly")).toBe(true);
    expect(app.get("db").tree[0].name).toBe("Getting started");
    expect(app.toastText()).toMatch(/storage is blocked/i);
  });

  it("returns true when data exists and false otherwise", () => {
    app = loadApp({ stored: { tree: [] } });
    expect(app.call("load")).toBe(true);
    app.window.localStorage.removeItem(KEY);
    expect(app.call("load")).toBe(false);
  });
});

describe("save()", () => {
  it("debounces writes: nothing is stored before 250ms, one write after", () => {
    app = loadApp({ stored: { tree: [] } });
    app.window.localStorage.clear();
    app.call("save"); app.call("save"); app.call("save");
    expect(app.stored()).toBeNull();
    app.flush();
    expect(app.stored()).not.toBeNull();
  });

  it("stores the complete db object", () => {
    app = loadApp();
    app.get("db").navWidth = 400;
    app.call("save"); app.flush();
    const s = app.stored();
    expect(Object.keys(s).sort()).toEqual(["navOpen", "navWidth", "selected", "tree"]);
    expect(s.navWidth).toBe(400);
  });
});

describe("blocked storage", () => {
  it("runs in memory and warns the user with a toast", () => {
    app = loadApp({ storage: "blocked" });
    expect(app.get("memoryOnly")).toBe(true);
    expect(app.$("toast").classList.contains("show")).toBe(true);
    expect(app.toastText()).toBe("Browser storage is blocked here — changes won't persist after reload");
    // the app is still usable
    expect(app.get("db").tree[0].name).toBe("Getting started");
    expect(() => { app.call("save"); app.flush(); }).not.toThrow();
  });
});

describe("flag() / toast()", () => {
  it("flag shows the text with the accent class and clears it after 1.2s in view mode", () => {
    app = loadApp();
    const status = app.$("status");
    app.call("flag", "Saved");
    expect(status.textContent).toBe("Saved");
    expect(status.classList.contains("on")).toBe(true);
    app.flush();
    expect(status.classList.contains("on")).toBe(false);
    expect(status.textContent).toBe("");
  });

  it("flag falls back to 'Editing' when not in view mode", () => {
    app = loadApp();
    app.call("setMode", "edit");
    app.call("flag", "Saved");
    app.flush();
    expect(app.$("status").textContent).toBe("Editing");
  });

  it("toast shows the message and hides after 2.2s", () => {
    app = loadApp();
    app.call("toast", "Hello");
    const t = app.$("toast");
    expect(t.textContent).toBe("Hello");
    expect(t.classList.contains("show")).toBe(true);
    app.flush();
    expect(t.classList.contains("show")).toBe(false);
  });

  it("toast resets its timer when called again", () => {
    app = loadApp();
    app.call("toast", "One");
    app.window.setTimeout(() => {}, 0);
    app.call("toast", "Two");
    expect(app.toastText()).toBe("Two");
    expect(app.$("toast").classList.contains("show")).toBe(true);
  });
});

describe("uid()", () => {
  it("produces unique string ids", () => {
    app = loadApp();
    const ids = new Set(Array.from({ length: 200 }, () => app.call("uid")));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+$/);
  });
});
