import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadApp, sampleTree } from "../helpers/app.js";
import { click, dblclick, input, key, focusEvent, drag, dragEvent, dataTransfer, rect } from "../helpers/dom.js";

let app;
beforeEach(() => { app = loadApp({ stored: { tree: sampleTree(), selected: "p1" } }); });
afterEach(() => app.close());

const db = () => app.get("db");

describe("renderTree()", () => {
  it("renders rows for every visible node, respecting folder open state", () => {
    // f2 is closed, so p2 is hidden
    expect(app.labels()).toEqual(["Work", "Alpha", "Nested", "Gamma", "Empty"]);
  });

  it("marks the selected row active", () => {
    const active = app.qa("#tree .row.active");
    expect(active).toHaveLength(1);
    expect(active[0].dataset.id).toBe("p1");
  });

  it("uses the right glyphs and twisties", () => {
    const folder = app.row("f1"), page = app.row("p1"), closed = app.row("f2");
    expect(folder.querySelector(".tw").classList.contains("open")).toBe(true);
    expect(closed.querySelector(".tw").classList.contains("open")).toBe(false);
    expect(page.querySelector(".tw").classList.contains("leaf")).toBe(true);
    expect(folder.querySelector(".gl svg")).not.toBeNull();
  });

  it("nests children in a .children container", () => {
    const kids = app.row("f1").parentElement.querySelector(".children");
    expect(kids).not.toBeNull();
    expect([...kids.querySelectorAll(".row")].map(r => r.dataset.id)).toEqual(["p1", "f2"]);
  });

  it("does not render a children container for empty folders", () => {
    expect(app.row("f3").parentElement.querySelector(".children")).toBeNull();
  });

  it("escapes names", () => {
    app.call("find", "p3").node.name = "<b>x</b> & y";
    app.call("renderTree");
    const label = app.row("p3").querySelector(".label");
    expect(label.textContent).toBe("<b>x</b> & y");
    expect(label.querySelector("b")).toBeNull();
  });

  it("shows the pages/folders count with plurals", () => {
    expect(app.$("stats").textContent).toBe("3 pages · 3 folders");
    db().tree = [{ id: "a", type: "page", name: "A" }, { id: "b", type: "folder", name: "B", children: [] }];
    app.call("renderTree");
    expect(app.$("stats").textContent).toBe("1 page · 1 folder");
    db().tree = [];
    app.call("renderTree");
    expect(app.$("stats").textContent).toBe("0 pages · 0 folders");
  });

  it("shows the empty hint when there are no nodes", () => {
    db().tree = [];
    app.call("renderTree");
    expect(app.q("#tree .nav-empty").textContent).toContain("No pages yet");
    expect(app.rows()).toHaveLength(0);
  });

  it("makes rows draggable", () => {
    for (const r of app.rows()) expect(r.getAttribute("draggable")).toBe("true");
  });
});

describe("search / matches()", () => {
  it("returns null when there is no filter", () => {
    expect(app.call("matches")).toBeNull();
  });

  it("matches by page title and keeps the ancestor chain", () => {
    input(app.$("search"), "beta");
    expect(app.get("filter")).toBe("beta");
    expect(app.labels()).toEqual(["Work", "Nested", "Beta"]);
  });

  it("matches inside page text, ignoring tags", () => {
    input(app.$("search"), "cats");
    expect(app.labels()).toEqual(["Work", "Nested", "Beta"]);
    input(app.$("search"), "<p>");   // tag markup is stripped from the haystack
    expect(app.q("#tree .nav-empty")).not.toBeNull();
  });

  it("is case-insensitive and trims whitespace", () => {
    input(app.$("search"), "  GAMMA ");
    expect(app.labels()).toEqual(["Gamma"]);
  });

  it("matches folder names", () => {
    input(app.$("search"), "empty");
    expect(app.labels()).toEqual(["Empty"]);
  });

  it("force-opens folders while filtering, without changing their stored state", () => {
    input(app.$("search"), "beta");
    expect(app.row("f2").querySelector(".tw").classList.contains("open")).toBe(true);
    expect(app.call("find", "f2").node.open).toBe(false);
  });

  it("shows a 'nothing matches' hint that escapes the query", () => {
    input(app.$("search"), "<zzz>");
    const hint = app.q("#tree .nav-empty");
    expect(hint.textContent).toBe("Nothing matches “<zzz>”.");
    expect(hint.innerHTML).toContain("&lt;zzz&gt;");
  });

  it("restores the full tree when the search is cleared", () => {
    input(app.$("search"), "beta");
    input(app.$("search"), "");
    expect(app.labels()).toEqual(["Work", "Alpha", "Nested", "Gamma", "Empty"]);
  });

  it("keeps the stats for the whole library, not the filtered view", () => {
    input(app.$("search"), "beta");
    expect(app.$("stats").textContent).toBe("3 pages · 3 folders");
  });
});

describe("row interactions", () => {
  it("clicking a page selects and opens it", () => {
    click(app.row("p3"));
    expect(db().selected).toBe("p3");
    expect(app.$("docTitle").value).toBe("Gamma");
    expect(app.row("p3").classList.contains("active")).toBe(true);
    expect(app.get("mode")).toBe("view");
  });

  it("clicking a page while editing another commits nothing but switches to view mode", () => {
    app.call("setMode", "edit");
    click(app.row("p3"));
    expect(app.get("mode")).toBe("view");
    expect(app.$("toolbar").style.display).toBe("none");
  });

  it("clicking a folder toggles it and selects it", () => {
    click(app.row("f2"));
    expect(db().selected).toBe("f2");
    expect(app.call("find", "f2").node.open).toBe(true);
    expect(app.row("p2")).not.toBeNull();
    click(app.row("f2"));
    expect(app.call("find", "f2").node.open).toBe(false);
    expect(app.row("p2")).toBeNull();
  });

  it("selecting a folder keeps the current page visible in the content area", () => {
    click(app.row("f3"));
    // render() is not called on folder click, so the document stays as it was
    expect(app.$("doc").style.display).toBe("flex");
  });

  it("clicking the twisty only toggles, without selecting", () => {
    click(app.row("f2").querySelector(".tw"));
    expect(app.call("find", "f2").node.open).toBe(true);
    expect(db().selected).toBe("p1");
  });

  it("double-clicking a label starts inline rename", () => {
    dblclick(app.row("p3").querySelector(".label"));
    expect(app.row("p3").querySelector(".label").contentEditable).toBe("true");
  });

  it("double-clicking the twisty does not start a rename", () => {
    dblclick(app.row("f1").querySelector(".tw"));
    expect(app.row("f1").querySelector(".label").contentEditable).not.toBe("true");
  });

  it("persists the folder open state", () => {
    click(app.row("f2").querySelector(".tw"));
    app.flush();
    expect(app.stored().tree[0].children[1].open).toBe(true);
  });
});

describe("clicking outside the rows", () => {
  it("clears the highlight so new items go to the root", () => {
    click(app.$("tree"));
    expect(db().selected).toBeNull();
    expect(app.qa("#tree .row.active")).toHaveLength(0);
    expect(app.call("target")).toBe(db().tree);
    click(app.$("btnPage"));
    expect(db().tree.at(-1).type).toBe("page");
    expect(app.call("find", "f1").node.children.map(n => n.id)).toEqual(["p1", "f2"]);
  });

  it("also clears it from the gutter of a nested list, and persists", () => {
    db().selected = "f1"; app.call("renderTree");       // highlight the (open) folder
    click(app.$("tree").querySelector(".children"));    // the indented strip beside its children
    expect(db().selected).toBeNull();
    app.flush();
    expect(app.stored().selected).toBeNull();
    click(app.$("btnFolder"));
    expect(db().tree.at(-1).name).toBe("New folder");
  });

  it("keeps the open page in the panel", () => {
    click(app.$("tree"));
    expect(app.get("openId")).toBe("p1");
    expect(app.$("doc").style.display).toBe("flex");
  });

  it("does not interfere with clicks on rows", () => {
    click(app.row("p3"));
    expect(db().selected).toBe("p3");
  });
});

describe("renameInTree()", () => {
  it("makes the label editable, focuses it and selects all", () => {
    app.call("renameInTree", "p3");
    const label = app.row("p3").querySelector(".label");
    expect(label.contentEditable).toBe("true");
    expect(app.document.activeElement).toBe(label);
    expect(app.exec.calls.at(-1)).toEqual({ cmd: "selectAll", val: null });
  });

  it("Enter commits the new name and re-renders", () => {
    app.call("renameInTree", "p3");
    const label = app.row("p3").querySelector(".label");
    label.textContent = "  Delta  ";
    const ev = key(label, "Enter");
    expect(ev.defaultPrevented).toBe(true);
    expect(app.call("find", "p3").node.name).toBe("Delta");
    expect(app.row("p3").querySelector(".label").contentEditable).not.toBe("true");
    expect(app.labels()).toContain("Delta");
  });

  it("blur commits too", () => {
    app.call("renameInTree", "p3");
    const label = app.row("p3").querySelector(".label");
    label.textContent = "Blurred";
    focusEvent(label, "blur");
    expect(app.call("find", "p3").node.name).toBe("Blurred");
  });

  it("Escape restores the old name", () => {
    app.call("renameInTree", "p3");
    const label = app.row("p3").querySelector(".label");
    label.textContent = "Nope";
    key(label, "Escape");
    expect(app.call("find", "p3").node.name).toBe("Gamma");
  });

  it("ignores an empty name", () => {
    app.call("renameInTree", "p3");
    const label = app.row("p3").querySelector(".label");
    label.textContent = "   ";
    key(label, "Enter");
    expect(app.call("find", "p3").node.name).toBe("Gamma");
  });

  it("updates the document title and crumbs when renaming the open page or its folder", () => {
    app.call("renameInTree", "p1");
    let label = app.row("p1").querySelector(".label");
    label.textContent = "Alpha 2";
    key(label, "Enter");
    expect(app.$("docTitle").value).toBe("Alpha 2");

    db().selected = "f1";
    app.call("renameInTree", "f1");
    label = app.row("f1").querySelector(".label");
    label.textContent = "Job";
    key(label, "Enter");
    expect(app.$("docTitle").value).toBe("Job");
  });

  it("does nothing for hidden or unknown rows", () => {
    expect(() => app.call("renameInTree", "p2")).not.toThrow();   // p2 is inside a closed folder
    expect(() => app.call("renameInTree", "nope")).not.toThrow();
  });

  it("persists the rename", () => {
    app.call("renameInTree", "p3");
    const label = app.row("p3").querySelector(".label");
    label.textContent = "Saved name";
    key(label, "Enter");
    app.flush();
    expect(app.stored().tree[1].name).toBe("Saved name");
  });
});

describe("drag & drop", () => {
  it("dragstart stores the id and marks the row", () => {
    const dt = dataTransfer();
    dragEvent(app.row("p3"), "dragstart", { dt });
    expect(dt.getData("text/plain")).toBe("p3");
    expect(dt.effectAllowed).toBe("move");
    expect(app.row("p3").classList.contains("dragging")).toBe(true);
  });

  it("dragend clears the marker and any drop hints", () => {
    const dt = dataTransfer();
    dragEvent(app.row("p3"), "dragstart", { dt });
    rect(app.row("f3"));
    dragEvent(app.row("f3"), "dragover", { dt, clientY: 50 });
    expect(app.row("f3").classList.contains("into")).toBe(true);
    dragEvent(app.row("p3"), "dragend", { dt });
    expect(app.row("p3").classList.contains("dragging")).toBe(false);
    expect(app.qa("#tree .into,#tree .before,#tree .after")).toHaveLength(0);
  });

  it("dragover a folder picks before / into / after by pointer position", () => {
    const f = app.row("f3"); rect(f);
    dragEvent(f, "dragover", { clientY: 10 });
    expect(f.dataset.where).toBe("before"); expect(f.classList.contains("before")).toBe(true);
    dragEvent(f, "dragover", { clientY: 50 });
    expect(f.dataset.where).toBe("into"); expect(f.classList.contains("into")).toBe(true);
    expect(f.classList.contains("before")).toBe(false);
    dragEvent(f, "dragover", { clientY: 90 });
    expect(f.dataset.where).toBe("after"); expect(f.classList.contains("after")).toBe(true);
  });

  it("dragover a page only offers before / after", () => {
    const p = app.row("p3"); rect(p);
    dragEvent(p, "dragover", { clientY: 40 });
    expect(p.dataset.where).toBe("before");
    dragEvent(p, "dragover", { clientY: 60 });
    expect(p.dataset.where).toBe("after");
  });

  it("dragover is prevented so the row accepts drops", () => {
    const p = app.row("p3"); rect(p);
    const ev = dragEvent(p, "dragover", { clientY: 40 });
    expect(ev.defaultPrevented).toBe(true);
  });

  it("dropping a page into a folder moves it there", () => {
    drag(app.row("p3"), app.row("f3"), 0.5);
    expect(app.call("find", "f3").node.children.map(n => n.id)).toEqual(["p3"]);
    expect(db().tree.map(n => n.id)).toEqual(["f1", "f3"]);
  });

  it("dropping before / after reorders", () => {
    drag(app.row("f3"), app.row("f1"), 0.1);
    expect(db().tree.map(n => n.id)).toEqual(["f3", "f1", "p3"]);
    drag(app.row("p3"), app.row("f3"), 0.9);
    expect(db().tree.map(n => n.id)).toEqual(["f3", "p3", "f1"]);
  });

  it("dropping without a stored id is ignored", () => {
    const before = JSON.stringify(db().tree);
    dragEvent(app.row("f3"), "drop", {});
    expect(JSON.stringify(db().tree)).toBe(before);
  });

  it("defaults to 'after' when no dragover happened", () => {
    const dt = dataTransfer();
    dragEvent(app.row("f3"), "dragstart", { dt });
    dragEvent(app.row("f1"), "drop", { dt });
    expect(db().tree.map(n => n.id)).toEqual(["f1", "f3", "p3"]);
  });

  it("refuses to drop a folder into itself or a descendant", () => {
    const before = JSON.stringify(db().tree);
    drag(app.row("f1"), app.row("p1"), 0.2);
    expect(JSON.stringify(db().tree)).toBe(before);
  });

  it("dragging over the empty tree area highlights it and dropping moves to the root", () => {
    const tree = app.$("tree");
    const dt = dataTransfer();
    dragEvent(app.row("p1"), "dragstart", { dt });
    dragEvent(tree, "dragover", { dt });
    expect(tree.classList.contains("rootdrop")).toBe(true);
    dragEvent(tree, "drop", { dt });
    expect(tree.classList.contains("rootdrop")).toBe(false);
    expect(db().tree.map(n => n.id)).toEqual(["f1", "p3", "f3", "p1"]);
    expect(app.call("find", "f1").node.children.map(n => n.id)).toEqual(["f2"]);
  });

  it("row drops do not bubble to the root drop handler", () => {
    drag(app.row("p1"), app.row("f3"), 0.5);
    expect(app.call("find", "f3").node.children.map(n => n.id)).toEqual(["p1"]);
    expect(db().tree.at(-1).id).toBe("f3");
  });

  it("root drop ignores unknown ids", () => {
    const dt = dataTransfer(); dt.setData("text/plain", "ghost");
    const before = JSON.stringify(db().tree);
    dragEvent(app.$("tree"), "drop", { dt });
    expect(JSON.stringify(db().tree)).toBe(before);
  });
});
