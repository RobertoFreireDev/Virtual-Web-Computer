import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadApp, sampleTree, tick } from "../helpers/app.js";
import { click, key, mousedown, change } from "../helpers/dom.js";

let app, dialog, veil;
beforeEach(() => {
  app = loadApp({ stored: { tree: sampleTree(), selected: "p1" } });
  dialog = app.$("dialog"); veil = app.$("veil");
});
afterEach(() => app.close());

const btn = sel => dialog.querySelector(sel);

describe("openDialog() / closeDialog()", () => {
  it("shows the veil with the given html and focuses/selects the requested field", () => {
    app.call("openDialog", '<h3>T</h3><input value="abc">', "input");
    expect(veil.classList.contains("open")).toBe(true);
    expect(dialog.querySelector("h3").textContent).toBe("T");
    const inp = dialog.querySelector("input");
    expect(app.document.activeElement).toBe(inp);
    expect(inp.selectionStart).toBe(0);
    expect(inp.selectionEnd).toBe(3);
  });

  it("closeDialog hides, empties and drops the wide class", () => {
    dialog.classList.add("wide");
    app.call("openDialog", "<p>x</p>");
    app.call("closeDialog");
    expect(veil.classList.contains("open")).toBe(false);
    expect(dialog.innerHTML).toBe("");
    expect(dialog.classList.contains("wide")).toBe(false);
  });
});

describe("confirmBox()", () => {
  it("renders title/message escaped and a primary OK by default", async () => {
    const p = app.call("confirmBox", "<T>", "<M>");
    expect(dialog.querySelector("h3").textContent).toBe("<T>");
    expect(dialog.querySelector("p").textContent).toBe("<M>");
    const ok = btn('[data-a="1"]');
    expect(ok.textContent).toBe("OK");
    expect(ok.classList.contains("primary")).toBe(true);
    expect(app.document.activeElement).toBe(ok);
    click(ok);
    await expect(p).resolves.toBe(true);
    expect(app.dialogOpen()).toBe(false);
  });

  it("styles the button as danger when the label is Delete", () => {
    app.call("confirmBox", "t", "m", "Delete");
    expect(btn('[data-a="1"]').classList.contains("danger")).toBe(true);
    expect(btn('[data-a="1"]').textContent).toBe("Delete");
  });

  it("resolves false on Cancel, Escape and veil click", async () => {
    let p = app.call("confirmBox", "t", "m");
    click(btn('[data-a="0"]'));
    await expect(p).resolves.toBe(false);

    p = app.call("confirmBox", "t", "m");
    key(app.document.body, "Escape");
    await expect(p).resolves.toBe(false);
    expect(app.dialogOpen()).toBe(false);

    p = app.call("confirmBox", "t", "m");
    mousedown(veil);
    await expect(p).resolves.toBe(false);
  });

  it("a mousedown inside the dialog does not close it", () => {
    app.call("confirmBox", "t", "m");
    mousedown(dialog);
    expect(app.dialogOpen()).toBe(true);
  });
});

describe("promptBox()", () => {
  it("returns the trimmed value on Add or Enter", async () => {
    let p = app.call("promptBox", "Title", "Label", "init");
    expect(dialog.querySelector("input").value).toBe("init");
    expect(app.document.activeElement).toBe(dialog.querySelector("input"));
    dialog.querySelector("input").value = "  v  ";
    click(btn('[data-a="1"]'));
    await expect(p).resolves.toBe("v");

    p = app.call("promptBox", "Title", "Label");
    dialog.querySelector("input").value = "enter";
    key(dialog.querySelector("input"), "Enter");
    await expect(p).resolves.toBe("enter");
  });

  it("returns null on Cancel / Escape", async () => {
    let p = app.call("promptBox", "T", "L");
    click(btn('[data-a="0"]'));
    await expect(p).resolves.toBeNull();
    p = app.call("promptBox", "T", "L");
    key(app.document.body, "Escape");
    await expect(p).resolves.toBeNull();
  });

  it("escapes markup in the initial value", () => {
    app.call("promptBox", "T", "L", "<b>x</b>");
    expect(dialog.querySelector("input").value).toBe("<b>x</b>");
    expect(dialog.querySelector("b")).toBeNull();
  });

  /* KNOWN BUG — esc() does not escape double quotes, but its output is used
     inside value="…" attributes (promptBox, linkBox). A value containing a quote
     is cut off at the first quote. (promptBox itself is currently unused by the UI.) */
  it.fails("keeps double quotes in the initial value (BUG)", () => {
    app.call("promptBox", "T", "L", 'say "hi"');
    expect(dialog.querySelector("input").value).toBe('say "hi"');
  });
});

describe("linkBox()", () => {
  it("resolves with url and trimmed name", async () => {
    const p = app.call("linkBox", "n");
    dialog.querySelector("#lkName").value = " Name ";
    dialog.querySelector("#lkUrl").value = " https://a.b ";
    click(btn('[data-a="1"]'));
    await expect(p).resolves.toEqual({ url: "https://a.b", name: "Name" });
  });
  it("prefills the name with the selection", () => {
    app.call("linkBox", "selected words");
    expect(dialog.querySelector("#lkName").value).toBe("selected words");
  });

  /* KNOWN BUG — same quote-escaping issue as promptBox: selecting `say "hi"`
     and pressing Link prefills the name as `say ` */
  it.fails("keeps double quotes in the prefilled name (BUG)", () => {
    app.call("linkBox", 'say "hi"');
    expect(dialog.querySelector("#lkName").value).toBe('say "hi"');
  });

  it("resolves null when the address is empty or on cancel/escape", async () => {
    let p = app.call("linkBox");
    dialog.querySelector("#lkUrl").value = "";
    click(btn('[data-a="1"]'));
    await expect(p).resolves.toBeNull();
    p = app.call("linkBox");
    key(app.document.body, "Escape");
    await expect(p).resolves.toBeNull();
  });
});

describe("choiceBox()", () => {
  it("renders every choice, the last one primary, plus Cancel", () => {
    app.call("choiceBox", "T", "M", [["Merge", "merge"], ["Replace", "replace"]]);
    const bs = [...dialog.querySelectorAll("[data-v]")];
    expect(bs.map(b => [b.textContent, b.dataset.v])).toEqual([["Cancel", ""], ["Merge", "merge"], ["Replace", "replace"]]);
    expect(bs[2].classList.contains("primary")).toBe(true);
    expect(bs[1].classList.contains("primary")).toBe(false);
  });

  it("resolves the chosen value, or null for Cancel / Escape", async () => {
    let p = app.call("choiceBox", "T", "M", [["A", "a"], ["B", "b"]]);
    click(dialog.querySelector('[data-v="a"]'));
    await expect(p).resolves.toBe("a");
    p = app.call("choiceBox", "T", "M", [["A", "a"]]);
    click(dialog.querySelector('[data-v=""]'));
    await expect(p).resolves.toBeNull();
    p = app.call("choiceBox", "T", "M", [["A", "a"]]);
    key(app.document.body, "Escape");
    await expect(p).resolves.toBeNull();
  });
});

describe("pickBox()", () => {
  const boxes = () => [...dialog.querySelectorAll(".pick-tree input")];
  const box = id => dialog.querySelector(`.pick-tree input[data-id="${id}"]`);
  const count = () => dialog.querySelector("#pickCount").textContent;
  const open = () => app.call("pickBox", "Export", "Msg", app.get("db").tree, "Export");

  it("lists every node indented by depth, all checked, in a wide dialog", () => {
    open();
    expect(dialog.classList.contains("wide")).toBe(true);
    expect(boxes().map(b => b.dataset.id)).toEqual(["f1", "p1", "f2", "p2", "p3", "f3"]);
    expect(boxes().every(b => b.checked)).toBe(true);
    expect(box("p2").closest(".pick-row").style.paddingLeft).toBe(`${6 + 2 * 18}px`);
    expect(box("f1").closest(".pick-row").style.paddingLeft).toBe("6px");
    expect(box("p1").dataset.type).toBe("page");
    expect(dialog.querySelector('[data-a="1"]').textContent).toBe("Export");
    expect(app.document.activeElement).toBe(dialog.querySelector('[data-a="1"]'));
  });

  it("counts leaves only: 3 pages + the empty folder", () => {
    open();
    expect(count()).toBe("4 of 4 selected");
  });

  it("unchecking a page updates its ancestors: fully-empty folders uncheck, mixed ones go indeterminate", () => {
    open();
    box("p2").checked = false; change(box("p2"));
    // f2 only held p2 → plain unchecked
    expect(box("f2").checked).toBe(false);
    expect(box("f2").indeterminate).toBe(false);
    // f1 still holds p1 → indeterminate
    expect(box("f1").checked).toBe(false);
    expect(box("f1").indeterminate).toBe(true);
    expect(count()).toBe("3 of 4 selected");
  });

  it("a folder with one page checked out of two is indeterminate", () => {
    open();
    box("p1").checked = false; change(box("p1"));
    expect(box("f1").indeterminate).toBe(true);
    expect(box("f2").checked).toBe(true);
    expect(box("f2").indeterminate).toBe(false);
  });

  it("toggling a folder toggles all its descendants", () => {
    open();
    box("f1").checked = false; change(box("f1"));
    expect(box("p1").checked).toBe(false);
    expect(box("p2").checked).toBe(false);
    expect(box("f2").checked).toBe(false);
    expect(box("f1").indeterminate).toBe(false);
    expect(count()).toBe("2 of 4 selected");
    box("f1").checked = true; change(box("f1"));
    expect(box("p2").checked).toBe(true);
    expect(count()).toBe("4 of 4 selected");
  });

  it("Select none disables the confirm button; Select all re-enables it", () => {
    open();
    click(dialog.querySelector('[data-sel="0"]'));
    expect(boxes().every(b => !b.checked)).toBe(true);
    expect(count()).toBe("0 of 4 selected");
    expect(dialog.querySelector('[data-a="1"]').disabled).toBe(true);
    click(dialog.querySelector('[data-sel="1"]'));
    expect(boxes().every(b => b.checked)).toBe(true);
    expect(dialog.querySelector('[data-a="1"]').disabled).toBe(false);
  });

  it("resolves a Set of checked + indeterminate ids", async () => {
    const p = open();
    box("p1").checked = false; change(box("p1"));
    click(dialog.querySelector('[data-a="1"]'));
    const set = await p;
    expect([...set].sort()).toEqual(["f1", "f2", "f3", "p2", "p3"]);
  });

  it("resolves null on Cancel, Escape, veil click, or when nothing is selected", async () => {
    let p = open();
    click(dialog.querySelector('[data-a="0"]'));
    await expect(p).resolves.toBeNull();

    p = open();
    key(app.document.body, "Escape");
    await expect(p).resolves.toBeNull();

    p = open();
    mousedown(veil);
    await expect(p).resolves.toBeNull();

    p = open();
    click(dialog.querySelector('[data-sel="0"]'));
    dialog.querySelector('[data-a="1"]').disabled = false;   // simulate a forced click
    click(dialog.querySelector('[data-a="1"]'));
    await expect(p).resolves.toBeNull();
  });

  it("escapes names", () => {
    app.call("find", "p3").node.name = "<i>x</i>";
    open();
    expect(box("p3").closest(".pick-row").querySelector(".label").textContent).toBe("<i>x</i>");
    expect(dialog.querySelector(".pick-tree i")).toBeNull();
  });
});

describe("Escape priority", () => {
  it("closes an open dialog before touching the menu or the edit mode", async () => {
    app.call("setMode", "edit");
    const p = app.call("confirmBox", "t", "m");
    key(app.document.body, "Escape");
    await expect(p).resolves.toBe(false);
    expect(app.get("mode")).toBe("edit");
  });
});
