import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadApp, sampleTree, tick } from "../helpers/app.js";
import { click } from "../helpers/dom.js";

let app;
beforeEach(() => { app = loadApp({ stored: { tree: sampleTree(), selected: "p1" } }); });
afterEach(() => app.close());

const db = () => app.get("db");

describe("find()", () => {
  it("finds a root node with null parent and the root array", () => {
    const r = app.call("find", "p3");
    expect(r.node.name).toBe("Gamma");
    expect(r.parent).toBeNull();
    expect(r.arr).toBe(db().tree);
  });

  it("finds a nested node with its parent and sibling array", () => {
    const r = app.call("find", "p2");
    expect(r.node.name).toBe("Beta");
    expect(r.parent.id).toBe("f2");
    expect(r.arr).toBe(app.call("find", "f2").node.children);
  });

  it("returns null for unknown ids", () => {
    expect(app.call("find", "nope")).toBeNull();
    expect(app.call("find", null)).toBeNull();
  });

  it("searches a custom node list", () => {
    const list = [{ id: "x", type: "page", name: "X" }];
    expect(app.call("find", "x", list).node.name).toBe("X");
    expect(app.call("find", "p1", list)).toBeNull();
  });
});

describe("each()", () => {
  it("visits every node depth-first with depth and ancestor chain", () => {
    const seen = [];
    app.call("each", (n, depth, chain) => seen.push([n.id, depth, chain.map(c => c.id)]));
    expect(seen).toEqual([
      ["f1", 0, []],
      ["p1", 1, ["f1"]],
      ["f2", 1, ["f1"]],
      ["p2", 2, ["f1", "f2"]],
      ["p3", 0, []],
      ["f3", 0, []]
    ]);
  });
});

describe("contains()", () => {
  it("is true for direct and deep descendants", () => {
    const f1 = app.call("find", "f1").node;
    expect(app.call("contains", f1, app.call("find", "p1").node)).toBe(true);
    expect(app.call("contains", f1, app.call("find", "p2").node)).toBe(true);
  });
  it("is false for unrelated nodes, itself, and pages", () => {
    const f1 = app.call("find", "f1").node;
    expect(app.call("contains", f1, app.call("find", "p3").node)).toBe(false);
    expect(app.call("contains", f1, f1)).toBe(false);
    expect(app.call("contains", app.call("find", "p1").node, f1)).toBe(false);
  });
});

describe("chainOf()", () => {
  it("returns ancestors from root to parent", () => {
    expect(app.call("chainOf", "p2").map(n => n.id)).toEqual(["f1", "f2"]);
    expect(app.call("chainOf", "p1").map(n => n.id)).toEqual(["f1"]);
  });
  it("returns an empty array for roots and unknown ids", () => {
    expect(app.call("chainOf", "p3")).toEqual([]);
    expect(app.call("chainOf", "zzz")).toEqual([]);
  });
});

describe("target()", () => {
  it("returns the root array when nothing is selected", () => {
    db().selected = null;
    expect(app.call("target")).toBe(db().tree);
  });
  it("returns the sibling array of a selected page", () => {
    db().selected = "p2";
    expect(app.call("target")).toBe(app.call("find", "f2").node.children);
  });
  it("returns (and opens) the children of a selected folder", () => {
    db().selected = "f2";
    const f2 = app.call("find", "f2").node;
    f2.open = false;
    expect(app.call("target")).toBe(f2.children);
    expect(f2.open).toBe(true);
  });
  it("creates the children array of a folder that has none", () => {
    const f3 = app.call("find", "f3").node;
    delete f3.children;
    db().selected = "f3";
    const arr = app.call("target");
    expect(arr).toEqual([]);
    expect(f3.children).toBe(arr);
  });
  it("falls back to the root when the selection no longer exists", () => {
    db().selected = "ghost";
    expect(app.call("target")).toBe(db().tree);
  });
});

describe("addPage()", () => {
  it("adds 'Untitled page' beside the selected page, selects and opens it", () => {
    app.call("addPage");
    const kids = app.call("find", "f1").node.children;
    const n = kids[kids.length - 1];
    expect(n.type).toBe("page");
    expect(n.name).toBe("Untitled page");
    expect(n.content).toBe("<p><br></p>");
    expect(db().selected).toBe(n.id);
    expect(app.get("mode")).toBe("view");
    expect(app.$("docTitle").value).toBe("Untitled page");
    expect(app.row(n.id).classList.contains("active")).toBe(true);
  });

  it("focuses and selects the title so the user can type a name immediately", () => {
    app.call("addPage");
    const t = app.$("docTitle");
    expect(app.document.activeElement).toBe(t);
    expect(t.selectionStart).toBe(0);
    expect(t.selectionEnd).toBe("Untitled page".length);
  });

  it("adds inside the selected folder", () => {
    db().selected = "f3";
    app.call("addPage");
    expect(app.call("find", "f3").node.children).toHaveLength(1);
  });

  it("persists the new page", () => {
    app.call("addPage");
    app.flush();
    expect(app.stored().tree[0].children).toHaveLength(3);
  });

  it("is wired to the sidebar button and the empty-state button", () => {
    click(app.$("btnPage"));
    click(app.$("btnFirst"));
    let pages = 0; app.call("each", n => { if (n.type === "page") pages++; });
    expect(pages).toBe(5);
  });
});

describe("addFolder()", () => {
  it("adds an open 'New folder' and enters rename mode", () => {
    app.call("addFolder");
    const kids = app.call("find", "f1").node.children;
    const n = kids[kids.length - 1];
    expect(n).toMatchObject({ type: "folder", name: "New folder", open: true, children: [] });
    const label = app.row(n.id).querySelector(".label");
    expect(label.contentEditable).toBe("true");
    expect(app.exec.calls.at(-1).cmd).toBe("selectAll");
  });

  it("does not change the selection", () => {
    app.call("addFolder");
    expect(db().selected).toBe("p1");
  });

  it("is wired to the sidebar button", () => {
    click(app.$("btnFolder"));
    let folders = 0; app.call("each", n => { if (n.type === "folder") folders++; });
    expect(folders).toBe(4);
  });
});

describe("remove()", () => {
  const confirm = async (yes = true) => {
    await tick();
    expect(app.dialogOpen()).toBe(true);
    click(app.q(`#dialog [data-a="${yes ? 1 : 0}"]`));
    await tick();
  };

  it("asks for confirmation naming the page", async () => {
    const p = app.call("remove", "p3");
    await tick();
    expect(app.q("#dialog h3").textContent).toBe("Delete page?");
    expect(app.q("#dialog p").textContent).toBe("“Gamma” will be removed.");
    expect(app.q('#dialog [data-a="1"]').textContent).toBe("Delete");
    expect(app.q('#dialog [data-a="1"]').classList.contains("danger")).toBe(true);
    click(app.q('#dialog [data-a="1"]'));
    await p;
  });

  it("counts the items inside a folder", async () => {
    const p = app.call("remove", "f1");
    await tick();
    expect(app.q("#dialog h3").textContent).toBe("Delete folder?");
    expect(app.q("#dialog p").textContent).toBe("“Work” and 3 items inside it will be removed.");
    click(app.q('#dialog [data-a="0"]'));
    await p;
  });

  it("uses the singular for one item", async () => {
    const p = app.call("remove", "f2");
    await tick();
    expect(app.q("#dialog p").textContent).toBe("“Nested” and 1 item inside it will be removed.");
    click(app.q('#dialog [data-a="0"]'));
    await p;
  });

  it("does nothing when cancelled", async () => {
    const p = app.call("remove", "p3");
    await confirm(false);
    await p;
    expect(app.call("find", "p3")).not.toBeNull();
    expect(app.dialogOpen()).toBe(false);
  });

  it("removes a page and toasts", async () => {
    const p = app.call("remove", "p3");
    await confirm();
    await p;
    expect(app.call("find", "p3")).toBeNull();
    expect(app.toastText()).toBe("Deleted");
    expect(app.row("p3")).toBeNull();
  });

  it("clears the selection when the open page is deleted", async () => {
    const p = app.call("remove", "p1");
    await confirm();
    await p;
    expect(db().selected).toBeNull();
    expect(app.$("empty").style.display).toBe("flex");
  });

  it("clears the selection when an ancestor folder of the open page is deleted", async () => {
    db().selected = "p2"; app.call("open", "p2");
    const p = app.call("remove", "f1");
    await confirm();
    await p;
    expect(db().selected).toBeNull();
    expect(db().tree.map(n => n.id)).toEqual(["p3", "f3"]);
  });

  it("keeps the selection when an unrelated node is deleted", async () => {
    const p = app.call("remove", "f3");
    await confirm();
    await p;
    expect(db().selected).toBe("p1");
    expect(app.$("doc").style.display).toBe("flex");
  });

  it("ignores unknown ids", async () => {
    await app.call("remove", "nope");
    expect(app.dialogOpen()).toBe(false);
  });

  it("persists the deletion", async () => {
    const p = app.call("remove", "p3");
    await confirm();
    await p;
    app.flush();
    expect(app.stored().tree.map(n => n.id)).toEqual(["f1", "f3"]);
  });
});

describe("move()", () => {
  it("moves a node into a folder and opens it", () => {
    const f3 = app.call("find", "f3").node; f3.open = false;
    app.call("move", "p3", "f3", "into");
    expect(db().tree.map(n => n.id)).toEqual(["f1", "f3"]);
    expect(f3.children.map(n => n.id)).toEqual(["p3"]);
    expect(f3.open).toBe(true);
  });

  it("creates the children array when moving into a folder without one", () => {
    const f3 = app.call("find", "f3").node; delete f3.children;
    app.call("move", "p3", "f3", "into");
    expect(f3.children.map(n => n.id)).toEqual(["p3"]);
  });

  it("moves before / after a sibling", () => {
    app.call("move", "f3", "f1", "before");
    expect(db().tree.map(n => n.id)).toEqual(["f3", "f1", "p3"]);
    app.call("move", "f3", "p3", "after");
    expect(db().tree.map(n => n.id)).toEqual(["f1", "p3", "f3"]);
  });

  it("moves across levels", () => {
    app.call("move", "p2", "p3", "before");
    expect(db().tree.map(n => n.id)).toEqual(["f1", "p2", "p3", "f3"]);
    expect(app.call("find", "f2").node.children).toEqual([]);
  });

  it("refuses to move a folder into its own descendant (no cycles)", () => {
    const before = JSON.stringify(db().tree);
    app.call("move", "f1", "f2", "into");
    app.call("move", "f1", "p2", "before");
    expect(JSON.stringify(db().tree)).toBe(before);
  });

  it("ignores self-drops and unknown ids", () => {
    const before = JSON.stringify(db().tree);
    app.call("move", "p3", "p3", "into");
    app.call("move", "zzz", "p3", "after");
    app.call("move", "p3", "zzz", "after");
    expect(JSON.stringify(db().tree)).toBe(before);
  });

  it("re-renders the tree and persists", () => {
    app.call("move", "p3", "f1", "before");
    expect(app.labels()[0]).toBe("Gamma");
    app.flush();
    expect(app.stored().tree[0].id).toBe("p3");
  });
});

describe("duplicate()", () => {
  it("inserts a deep copy with fresh ids right after the original, named '… copy'", () => {
    app.call("duplicate", "p1");
    const kids = app.call("find", "f1").node.children;
    expect(kids.map(n => n.name)).toEqual(["Alpha", "Alpha copy", "Nested"]);
    expect(kids[1].id).not.toBe("p1");
    expect(kids[1].content).toBe("<p>alpha text</p>");
  });

  it("selects and opens the copy", () => {
    app.call("duplicate", "p1");
    const copy = app.call("find", "f1").node.children[1];
    expect(db().selected).toBe(copy.id);
    expect(app.$("docTitle").value).toBe("Alpha copy");
  });

  it("re-stamps ids of nested children when duplicating a folder", () => {
    app.call("duplicate", "f1");
    const copy = db().tree[1];
    expect(copy.name).toBe("Work copy");
    const ids = []; app.call("each", n => ids.push(n.id), copy.children);
    expect(ids).not.toContain("p1");
    expect(ids).not.toContain("f2");
    expect(ids).not.toContain("p2");
    expect(ids).toHaveLength(3);
  });

  it("ignores unknown ids", () => {
    const before = JSON.stringify(db().tree);
    app.call("duplicate", "nope");
    expect(JSON.stringify(db().tree)).toBe(before);
  });
});
