import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadApp, sampleTree, tick } from "../helpers/app.js";
import { click, change, chooseFile } from "../helpers/dom.js";

let app;
beforeEach(() => { app = loadApp({ stored: { tree: sampleTree(), selected: "p1" } }); });
afterEach(() => app.close());

const db = () => app.get("db");
const dlg = () => app.$("dialog");
const box = id => dlg().querySelector(`.pick-tree input[data-id="${id}"]`);
const confirmPick = () => click(dlg().querySelector('[data-a="1"]'));

describe("prune()", () => {
  const prune = (nodes, ids) => app.call("prune", nodes, new Set(ids));

  it("keeps pages whose id is in the set", () => {
    expect(prune(sampleTree(), ["p3"]).map(n => n.id)).toEqual(["p3"]);
  });
  it("keeps folders that hold something kept, dropping the rest", () => {
    const out = prune(sampleTree(), ["p2"]);
    expect(out.map(n => n.id)).toEqual(["f1"]);
    expect(out[0].children.map(n => n.id)).toEqual(["f2"]);
    expect(out[0].children[0].children.map(n => n.id)).toEqual(["p2"]);
  });
  it("keeps explicitly chosen empty folders", () => {
    expect(prune(sampleTree(), ["f3"]).map(n => n.id)).toEqual(["f3"]);
    expect(prune(sampleTree(), ["f3"])[0].children).toEqual([]);
  });
  it("returns copies, not the original objects", () => {
    const src = sampleTree();
    const out = prune(src, ["p3", "f1", "p1"]);
    expect(out[1]).not.toBe(src[1]);
    expect(out[1]).toEqual(src[1]);
    expect(out[0].children[0]).not.toBe(src[0].children[0]);
  });
  it("handles folders without a children array", () => {
    expect(prune([{ id: "f", type: "folder", name: "F" }], ["f"])).toEqual([{ id: "f", type: "folder", name: "F", children: [] }]);
  });
});

describe("normalize()", () => {
  const normalize = a => app.call("normalize", a);

  it("assigns fresh ids and coerces types", () => {
    const out = normalize([{ id: "p1", type: "page", name: "A", content: "<p>x</p>" }]);
    expect(out[0].id).not.toBe("p1");
    expect(out[0]).toMatchObject({ type: "page", name: "A", content: "<p>x</p>" });
  });
  it("treats anything with a children array as a folder", () => {
    const out = normalize([{ name: "F", children: [{ name: "P" }] }]);
    expect(out[0].type).toBe("folder");
    expect(out[0].open).toBe(true);
    expect(out[0].children[0]).toMatchObject({ type: "page", name: "P", content: "" });
  });
  it("respects open:false on folders", () => {
    expect(normalize([{ type: "folder", open: false }])[0].open).toBe(false);
  });
  it("fills default names and clamps their length", () => {
    const out = normalize([{ type: "folder" }, { type: "page" }, { name: "x".repeat(500) }]);
    expect(out[0].name).toBe("Folder");
    expect(out[1].name).toBe("Untitled page");
    expect(out[2].name).toHaveLength(200);
  });
  it("sanitises page content", () => {
    const out = normalize([{ name: "P", content: '<p onclick="x">a</p><script>b</script>' }]);
    expect(out[0].content).toBe("<p>a</p>");
  });
  it("skips non-objects and tolerates missing input", () => {
    expect(normalize([null, 1, "s", { name: "ok" }])).toHaveLength(1);
    expect(normalize(undefined)).toEqual([]);
    expect(normalize([{ type: "folder", name: "F", children: "nope" }])[0].children).toEqual([]);
  });
  it("coerces names and content to strings", () => {
    const out = normalize([{ name: 42, content: 7 }]);
    expect(out[0].name).toBe("42");
    expect(out[0].content).toBe("7");
  });
});

describe("Export button", () => {
  it("toasts when the library is empty", async () => {
    db().tree = [];
    click(app.$("btnExport"));
    await tick();
    expect(app.toastText()).toBe("Nothing to export yet");
    expect(app.dialogOpen()).toBe(false);
  });

  it("commits pending edits before exporting", async () => {
    app.call("setMode", "edit");
    app.$("editor").innerHTML = "<p>pending</p>";
    click(app.$("btnExport"));
    await tick();
    expect(app.call("find", "p1").node.content).toBe("<p>pending</p><p><br></p>");
  });

  it("opens the picker with the whole library", async () => {
    click(app.$("btnExport"));
    await tick();
    expect(app.dialogOpen()).toBe(true);
    expect(dlg().querySelector("h3").textContent).toBe("Export");
    expect(dlg().querySelector("p").textContent).toBe("Choose which folders and pages to include in the backup.");
    expect(dlg().querySelectorAll(".pick-tree input")).toHaveLength(6);
  });

  it("downloads a dated JSON backup of the chosen items and toasts the page count", async () => {
    click(app.$("btnExport"));
    await tick();
    box("p1").checked = false; change(box("p1"));
    confirmPick();
    await tick();
    expect(app.downloads).toHaveLength(1);
    const d = app.downloads[0];
    expect(d.download).toMatch(/^virtualpc-\d{4}-\d{2}-\d{2}\.json$/);
    expect(d.blob.opts.type).toBe("application/json");
    const payload = JSON.parse(d.text);
    expect(payload.app).toBe("virtualpc");
    expect(payload.version).toBe(1);
    expect(new Date(payload.exportedAt).toString()).not.toBe("Invalid Date");
    expect(payload.tree.map(n => n.id)).toEqual(["f1", "p3", "f3"]);
    expect(payload.tree[0].children.map(n => n.id)).toEqual(["f2"]);
    expect(d.text).toContain("\n  ");           // pretty printed
    expect(app.toastText()).toBe("Exported 2 pages");
  });

  it("uses the singular for a single page", async () => {
    click(app.$("btnExport"));
    await tick();
    click(dlg().querySelector('[data-sel="0"]'));
    box("p3").checked = true; change(box("p3"));
    confirmPick();
    await tick();
    expect(app.toastText()).toBe("Exported 1 page");
  });

  it("does nothing when the picker is cancelled", async () => {
    click(app.$("btnExport"));
    await tick();
    click(dlg().querySelector('[data-a="0"]'));
    await tick();
    expect(app.downloads).toHaveLength(0);
  });
});

describe("Import button", () => {
  const fileInput = () => app.$("file");
  const choiceBtn = v => dlg().querySelector(`[data-v="${v}"]`);

  it("opens the hidden file picker", () => {
    let clicked = false;
    fileInput().click = () => { clicked = true; };
    click(app.$("btnImport"));
    expect(clicked).toBe(true);
  });

  it("ignores an empty selection", async () => {
    Object.defineProperty(fileInput(), "files", { configurable: true, value: [] });
    change(fileInput());
    await tick();
    expect(app.dialogOpen()).toBe(false);
  });

  it("rejects invalid JSON", async () => {
    chooseFile(fileInput(), { text: "{oops" });
    await tick();
    expect(app.toastText()).toBe("That file isn't valid JSON");
  });

  it("rejects JSON without a tree", async () => {
    chooseFile(fileInput(), { text: JSON.stringify({ hello: 1 }) });
    await tick();
    expect(app.toastText()).toBe("No Virtual PC data found in that file");
  });

  it("rejects an empty backup", async () => {
    chooseFile(fileInput(), { text: JSON.stringify({ tree: [1, null] }) });
    await tick();
    expect(app.toastText()).toBe("That backup is empty");
  });

  it("accepts a bare array as well as {tree}", async () => {
    chooseFile(fileInput(), { text: JSON.stringify([{ name: "Bare", content: "<p>b</p>" }]) });
    await tick();
    expect(app.dialogOpen()).toBe(true);
    expect(dlg().querySelector(".pick-tree .label").textContent).toBe("Bare");
  });

  it("shows the picker naming the file", async () => {
    chooseFile(fileInput(), { name: "my.json", text: JSON.stringify({ tree: sampleTree() }) });
    await tick();
    expect(dlg().querySelector("h3").textContent).toBe("Import");
    expect(dlg().querySelector("p").textContent).toBe("Choose which folders and pages to bring in from my.json.");
    expect(dlg().querySelector('[data-a="1"]').textContent).toBe("Import");
  });

  it("asks Merge / Replace with the item count after picking", async () => {
    chooseFile(fileInput(), { text: JSON.stringify({ tree: sampleTree() }) });
    await tick();
    confirmPick();
    await tick();
    expect(dlg().querySelector("h3").textContent).toBe("Import 6 items");
    expect(dlg().querySelector("p").textContent).toBe("Replace everything currently stored, or add the imported items alongside it?");
    expect(choiceBtn("merge").textContent).toBe("Merge");
    expect(choiceBtn("replace").textContent).toBe("Replace");
  });

  it("uses the singular for one item", async () => {
    chooseFile(fileInput(), { text: JSON.stringify([{ name: "One" }]) });
    await tick();
    confirmPick();
    await tick();
    expect(dlg().querySelector("h3").textContent).toBe("Import 1 item");
  });

  it("Merge appends the imported nodes with new ids and keeps the selection", async () => {
    chooseFile(fileInput(), { text: JSON.stringify([{ name: "One", content: "<p>1</p>" }]) });
    await tick(); confirmPick(); await tick();
    click(choiceBtn("merge"));
    await tick();
    expect(db().tree).toHaveLength(4);
    expect(db().tree[3].name).toBe("One");
    expect(db().selected).toBe("p1");
    expect(app.toastText()).toBe("Items merged in");
    expect(app.labels()).toContain("One");
    app.flush();
    expect(app.stored().tree).toHaveLength(4);
  });

  it("Replace swaps the whole library and clears the selection", async () => {
    chooseFile(fileInput(), { text: JSON.stringify([{ name: "One", content: "<p>1</p>" }]) });
    await tick(); confirmPick(); await tick();
    click(choiceBtn("replace"));
    await tick();
    expect(db().tree).toHaveLength(1);
    expect(db().tree[0].name).toBe("One");
    expect(db().selected).toBeNull();
    expect(app.$("empty").style.display).toBe("flex");
    expect(app.toastText()).toBe("Library replaced");
  });

  it("only brings in the picked items", async () => {
    chooseFile(fileInput(), { text: JSON.stringify({ tree: sampleTree() }) });
    await tick();
    click(dlg().querySelector('[data-sel="0"]'));
    const gamma = [...dlg().querySelectorAll(".pick-row")].find(r => r.textContent.includes("Gamma")).querySelector("input");
    gamma.checked = true; change(gamma);
    confirmPick(); await tick();
    click(choiceBtn("merge")); await tick();
    expect(db().tree).toHaveLength(4);
    expect(db().tree[3].name).toBe("Gamma");
  });

  it("does nothing when the picker or the choice is cancelled", async () => {
    chooseFile(fileInput(), { text: JSON.stringify([{ name: "One" }]) });
    await tick();
    click(dlg().querySelector('[data-a="0"]'));
    await tick();
    expect(db().tree).toHaveLength(3);

    chooseFile(fileInput(), { text: JSON.stringify([{ name: "One" }]) });
    await tick(); confirmPick(); await tick();
    click(choiceBtn(""));
    await tick();
    expect(db().tree).toHaveLength(3);
  });

  it("sanitises imported content", async () => {
    chooseFile(fileInput(), { text: JSON.stringify([{ name: "Evil", content: "<p>ok</p><script>x</script>" }]) });
    await tick(); confirmPick(); await tick();
    click(choiceBtn("merge")); await tick();
    expect(db().tree[3].content).toBe("<p>ok</p>");
  });

  it("tolerates a file whose JSON is null", async () => {
    chooseFile(fileInput(), { text: "null" });
    await tick();
    expect(app.$("toast").textContent).toBe("No Virtual PC data found in that file");
  });

  it("resets the file input so the same file can be chosen again", async () => {
    chooseFile(fileInput(), { text: "{oops" });
    await tick();
    expect(fileInput().value).toBe("");
  });

  it("round-trips an export back through import", async () => {
    click(app.$("btnExport"));
    await tick(); confirmPick(); await tick();
    const exported = app.downloads[0].text;
    chooseFile(fileInput(), { text: exported });
    await tick(); confirmPick(); await tick();
    click(choiceBtn("replace")); await tick();
    const names = []; app.call("each", n => names.push(n.name));
    expect(names).toEqual(["Work", "Alpha", "Nested", "Beta", "Gamma", "Empty"]);
    expect(db().tree[1].content).toBe(sampleTree()[1].content);
  });
});
