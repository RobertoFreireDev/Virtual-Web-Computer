import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadApp, sampleTree, tick } from "../helpers/app.js";
import { click, contextmenu, mousedown, key } from "../helpers/dom.js";

let app;
beforeEach(() => { app = loadApp({ stored: { tree: sampleTree(), selected: "p1" } }); });
afterEach(() => app.close());

const db = () => app.get("db");
const items = () => app.qa("#menu button").map(b => b.textContent);
const item = text => app.qa("#menu button").find(b => b.textContent === text);

describe("openMenu()", () => {
  it("opens on right-click and selects the row", () => {
    const ev = contextmenu(app.row("p3"));
    expect(ev.defaultPrevented).toBe(true);
    expect(app.$("menu").classList.contains("open")).toBe(true);
    expect(db().selected).toBe("p3");
    expect(app.row("p3").classList.contains("active")).toBe(true);
  });

  it("offers Rename / Duplicate / Delete for a page", () => {
    contextmenu(app.row("p3"));
    expect(items()).toEqual(["Rename", "Duplicate", "Delete"]);
    expect(app.qa("#menu .div")).toHaveLength(1);
    expect(item("Delete").classList.contains("danger")).toBe(true);
  });

  it("offers New page / New folder / Rename / Delete for a folder", () => {
    contextmenu(app.row("f1"));
    expect(items()).toEqual(["New page here", "New folder here", "Rename", "Delete"]);
    expect(app.qa("#menu .div")).toHaveLength(2);
  });

  it("is positioned at the pointer", () => {
    contextmenu(app.row("p3"), { clientX: 120, clientY: 240 });
    expect(app.$("menu").style.left).toBe("120px");
    expect(app.$("menu").style.top).toBe("240px");
  });

  it("is kept inside the viewport", () => {
    const menu = app.$("menu");
    menu.getBoundingClientRect = () => ({ width: 200, height: 100 });
    contextmenu(app.row("p3"), { clientX: 1000, clientY: 750 });
    // innerWidth 1024 / innerHeight 768 in JSDOM
    expect(menu.style.left).toBe(`${1024 - 200 - 8}px`);
    expect(menu.style.top).toBe(`${768 - 100 - 8}px`);
  });

  it("replaces the previous menu content", () => {
    contextmenu(app.row("f1"));
    contextmenu(app.row("p3"));
    expect(items()).toEqual(["Rename", "Duplicate", "Delete"]);
  });
});

describe("menu actions", () => {
  it("New page here adds inside the folder and closes the menu", () => {
    contextmenu(app.row("f3"));
    click(item("New page here"));
    expect(app.$("menu").classList.contains("open")).toBe(false);
    const kids = app.call("find", "f3").node.children;
    expect(kids).toHaveLength(1);
    expect(kids[0].type).toBe("page");
    expect(db().selected).toBe(kids[0].id);
  });

  it("New folder here adds inside the folder", () => {
    contextmenu(app.row("f3"));
    click(item("New folder here"));
    const kids = app.call("find", "f3").node.children;
    expect(kids[0].type).toBe("folder");
  });

  it("Rename starts inline rename", () => {
    contextmenu(app.row("p3"));
    click(item("Rename"));
    expect(app.row("p3").querySelector(".label").contentEditable).toBe("true");
  });

  it("Duplicate copies the page", () => {
    contextmenu(app.row("p3"));
    click(item("Duplicate"));
    expect(db().tree.map(n => n.name)).toEqual(["Work", "Gamma", "Gamma copy", "Empty"]);
  });

  it("Delete asks for confirmation then removes", async () => {
    contextmenu(app.row("p3"));
    click(item("Delete"));
    await tick();
    expect(app.dialogOpen()).toBe(true);
    click(app.q('#dialog [data-a="1"]'));
    await tick();
    expect(app.call("find", "p3")).toBeNull();
  });
});

describe("closeMenu()", () => {
  it("closes on mousedown outside the menu", () => {
    contextmenu(app.row("p3"));
    mousedown(app.document.body);
    expect(app.$("menu").classList.contains("open")).toBe(false);
  });

  it("stays open on mousedown inside the menu", () => {
    contextmenu(app.row("p3"));
    mousedown(item("Rename"));
    expect(app.$("menu").classList.contains("open")).toBe(true);
  });

  it("closes when the window loses focus", () => {
    contextmenu(app.row("p3"));
    app.window.dispatchEvent(new app.window.Event("blur"));
    expect(app.$("menu").classList.contains("open")).toBe(false);
  });

  it("closes on Escape without leaving edit mode", () => {
    app.call("setMode", "edit");
    contextmenu(app.row("p3"));
    key(app.document.body, "Escape");
    expect(app.$("menu").classList.contains("open")).toBe(false);
    expect(app.get("mode")).toBe("edit");
  });
});
