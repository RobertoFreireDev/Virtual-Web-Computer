import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadApp, tick } from "../helpers/app.js";
import { click, key, caret, mousedown, rect } from "../helpers/dom.js";

/* The floating row/column bar above the table the caret is in, plus Tab
   navigation between cells. Every op goes through the real button. */
const TABLE =
  "<p>before</p>" +
  "<table><thead><tr><th>A</th><th>B</th><th>C</th></tr></thead>" +
  "<tbody><tr><td>a1</td><td>b1</td><td>c1</td></tr><tr><td>a2</td><td>b2</td><td>c2</td></tr></tbody></table>" +
  "<p>after</p>";

let app, editor, tbl;
beforeEach(() => {
  app = loadApp({ stored: { tree: [{ id: "t", type: "page", name: "T", content: TABLE }], selected: "t" } });
  app.call("setMode", "edit");
  editor = app.$("editor"); tbl = app.$("tbl");
});
afterEach(() => app.close());

const table = () => editor.querySelector("table");
const cell = text => [...editor.querySelectorAll("td,th")].find(c => c.textContent === text);
const rows = () => [...table().rows].map(r => [...r.cells].map(c => c.textContent));
const content = () => app.call("find", "t").node.content;
const btn = op => tbl.querySelector(`[data-t="${op}"]`);
const caretCell = () => {
  const r = app.window.getSelection().getRangeAt(0);
  const n = r.startContainer.nodeType === 3 ? r.startContainer.parentNode : r.startContainer;
  return n.closest("td,th");
};
/* put the caret in a cell and run the sync the browser would trigger on selectionchange */
const focusCell = text => { caret(cell(text).firstChild, 0); app.call("syncBlocks"); };

describe("markup", () => {
  it("has a hidden table bar with every row/column button, each titled", () => {
    expect(tbl.style.display).toBe("none");
    expect(app.qa("#tbl button").map(b => b.dataset.t)).toEqual(
      ["rowAbove", "rowBelow", "rowUp", "rowDown", "delRow", "colLeft", "colRight", "colPrev", "colNext", "delCol", "delTable"]);
    for (const b of app.qa("#tbl button")) expect(b.title).not.toBe("");
    expect(btn("delTable").querySelector("svg")).not.toBeNull();
  });

  it("buttons prevent mousedown so the editor keeps its selection", () => {
    for (const b of app.qa("#tbl button")) expect(mousedown(b).defaultPrevented).toBe(true);
  });
});

describe("currentCell()", () => {
  it("returns the td/th around the caret, or null outside a table", () => {
    caret(cell("b1").firstChild, 1);
    expect(app.call("currentCell")).toBe(cell("b1"));
    caret(cell("B"), 0);
    expect(app.call("currentCell")).toBe(cell("B"));
    caret(editor.querySelector("p").firstChild, 0);
    expect(app.call("currentCell")).toBeNull();
  });

  it("ignores cells outside the editor", () => {
    app.call("setMode", "view");
    caret(app.q("#viewer td").firstChild, 0);
    expect(app.call("currentCell")).toBeNull();
  });
});

describe("syncTable()", () => {
  it("shows the bar above the active table and binds the cell", () => {
    rect(app.$("page"), { top: 100, left: 50 });
    rect(table(), { top: 300, left: 90, width: 500 });
    focusCell("b1");
    expect(tbl.style.display).toBe("");
    expect(tbl._cell).toBe(cell("b1"));
    expect(tbl.style.left).toBe("40px");   // 90 - 50
    expect(tbl.style.top).toBe("164px");   // 300 - 100 - 36
  });

  it("hides the bar when the caret leaves the table or editing ends", () => {
    focusCell("b1");
    expect(tbl.style.display).toBe("");
    caret(editor.querySelector("p").firstChild, 0); app.call("syncBlocks");
    expect(tbl.style.display).toBe("none");
    expect(tbl._cell).toBeNull();
    focusCell("b1");
    app.call("setMode", "view");
    expect(tbl.style.display).toBe("none");
  });

  it("is scheduled on selectionchange, click and keyup while editing", () => {
    app.document.dispatchEvent(new app.window.Event("selectionchange"));
    expect(app.get("syncQueued")).toBe(true);
    app.flush();
    click(editor);
    expect(app.get("syncQueued")).toBe(true);
    app.flush();
    editor.dispatchEvent(new app.window.KeyboardEvent("keyup", { key: "ArrowDown", bubbles: true }));
    expect(app.get("syncQueued")).toBe(true);
    app.flush();
    app.call("setMode", "view");
    app.document.dispatchEvent(new app.window.Event("selectionchange"));
    expect(app.get("syncQueued")).toBe(false);
  });
});

describe("row buttons", () => {
  it("+ Row ↑ inserts an empty row above the current one and moves the caret into it", () => {
    focusCell("b2");
    click(btn("rowAbove"));
    expect(rows()).toEqual([["A", "B", "C"], ["a1", "b1", "c1"], ["", "", ""], ["a2", "b2", "c2"]]);
    expect(table().rows[2].parentNode.tagName).toBe("TBODY");
    expect(table().rows[2].innerHTML).toBe("<td><br></td><td><br></td><td><br></td>");
    expect(caretCell()).toBe(table().rows[2].cells[1]);
    expect(content()).toContain("<td><br></td><td><br></td><td><br></td>");
    expect(app.$("status").textContent).toBe("Saved");
  });

  it("+ Row ↓ inserts below the current row", () => {
    focusCell("a1");
    click(btn("rowBelow"));
    expect(rows()).toEqual([["A", "B", "C"], ["a1", "b1", "c1"], ["", "", ""], ["a2", "b2", "c2"]]);
    expect(caretCell()).toBe(table().rows[2].cells[0]);
  });

  it("+ Row ↑ and + Row ↓ on the header row never add a header: both insert the first <td> body row", () => {
    for (const op of ["rowAbove", "rowBelow"]) {
      focusCell("B");
      click(btn(op));
      expect(table().tHead.rows).toHaveLength(1);
      expect(table().querySelectorAll("th")).toHaveLength(3);
      expect(table().rows[1].parentNode.tagName).toBe("TBODY");
      expect(table().rows[1].innerHTML).toBe("<td><br></td><td><br></td><td><br></td>");
      expect(caretCell()).toBe(table().rows[1].cells[1]);
    }
    expect(table().tBodies[0].rows).toHaveLength(4);
  });

  it("treats a first row of <th> without <thead> as the header too", () => {
    editor.innerHTML = "<table><tbody><tr><th>H</th></tr><tr><td>v</td></tr></tbody></table>";
    focusCell("H");
    click(btn("rowAbove"));
    expect(rows()).toEqual([["H"], [""], ["v"]]);
    expect(table().rows[1].innerHTML).toBe("<td><br></td>");
    expect(app.call("isHeader", table().rows[0])).toBe(true);
    expect(app.call("isHeader", table().rows[1])).toBe(false);
  });

  it("adds a body row after a header-only table", () => {
    editor.innerHTML = "<table><thead><tr><th>H</th></tr></thead></table>";
    focusCell("H");
    click(btn("rowBelow"));
    expect(rows()).toEqual([["H"], [""]]);
    expect(table().rows[1].parentNode.tagName).toBe("TBODY");
    expect(table().rows[1].innerHTML).toBe("<td><br></td>");
  });

  it("− Row removes the current row and keeps the caret in the same column", () => {
    focusCell("b1");
    click(btn("delRow"));
    expect(rows()).toEqual([["A", "B", "C"], ["a2", "b2", "c2"]]);
    expect(caretCell()).toBe(cell("b2"));
    expect(content()).not.toContain("b1");
  });

  it("− Row on the last row moves the caret up", () => {
    focusCell("c2");
    click(btn("delRow"));
    expect(caretCell()).toBe(cell("c1"));
  });

  it("− Row on the header keeps the header and removes the first body row instead", () => {
    focusCell("B");
    click(btn("delRow"));
    expect(rows()).toEqual([["A", "B", "C"], ["a2", "b2", "c2"]]);
    expect(table().tHead.rows).toHaveLength(1);
    expect(caretCell()).toBe(cell("b2"));
    click(btn("delRow"));
    expect(rows()).toEqual([["A", "B", "C"]]);
    expect(caretCell()).toBe(cell("B"));
  });

  it("− Row on a header-only table does nothing but explain", () => {
    editor.innerHTML = "<table><thead><tr><th>H</th></tr></thead></table>";
    focusCell("H");
    click(btn("delRow"));
    expect(rows()).toEqual([["H"]]);
    expect(app.toastText()).toBe("The header row stays — delete the table to remove it");
    expect(caretCell()).toBe(cell("H"));
  });

  it("− Row on the only row replaces the table with a paragraph", () => {
    editor.innerHTML = "<table><tbody><tr><td>solo</td></tr></tbody></table>";
    focusCell("solo");
    click(btn("delRow"));
    expect(editor.innerHTML).toBe("<p><br></p>");
    expect(tbl.style.display).toBe("none");
  });
});

describe("column buttons", () => {
  it("+ Col ← inserts a column before the current one in every row (th in the header)", () => {
    focusCell("b1");
    click(btn("colLeft"));
    expect(rows()).toEqual([["A", "", "B", "C"], ["a1", "", "b1", "c1"], ["a2", "", "b2", "c2"]]);
    expect(table().rows[0].cells[1].outerHTML).toBe("<th><br></th>");
    expect(table().rows[1].cells[1].outerHTML).toBe("<td><br></td>");
    expect(caretCell()).toBe(table().rows[1].cells[1]);
    expect(app.$("status").textContent).toBe("Saved");
  });

  it("+ Col → inserts after the current column", () => {
    focusCell("c2");
    click(btn("colRight"));
    expect(rows()).toEqual([["A", "B", "C", ""], ["a1", "b1", "c1", ""], ["a2", "b2", "c2", ""]]);
    expect(caretCell()).toBe(table().rows[2].cells[3]);
  });

  it("appends to rows that are shorter than the current one", () => {
    editor.innerHTML = "<table><tbody><tr><td>x</td><td>y</td><td>z</td></tr><tr><td>1</td></tr></tbody></table>";
    focusCell("z");
    click(btn("colLeft"));
    expect(rows()).toEqual([["x", "y", "", "z"], ["1", ""]]);
  });

  it("− Col removes the current column from every row", () => {
    focusCell("b1");
    click(btn("delCol"));
    expect(rows()).toEqual([["A", "C"], ["a1", "c1"], ["a2", "c2"]]);
    expect(caretCell()).toBe(cell("c1"));
    expect(content()).not.toContain("b1");
  });

  it("− Col on the last column moves the caret left", () => {
    focusCell("c1");
    click(btn("delCol"));
    expect(caretCell()).toBe(cell("b1"));
  });

  it("− Col on the only column replaces the table with a paragraph", () => {
    editor.innerHTML = "<table><tbody><tr><td>one</td></tr><tr><td>two</td></tr></tbody></table>";
    focusCell("two");
    click(btn("delCol"));
    expect(editor.innerHTML).toBe("<p><br></p>");
  });
});

describe("move row buttons", () => {
  it("↑ Row swaps the current row with the one above and keeps the caret in the moved cell", () => {
    focusCell("b2");
    click(btn("rowUp"));
    expect(rows()).toEqual([["A", "B", "C"], ["a2", "b2", "c2"], ["a1", "b1", "c1"]]);
    expect(caretCell()).toBe(cell("b2"));
    expect(content()).toMatch(/<td>a2<\/td>.*<td>a1<\/td>/s);
    expect(app.$("status").textContent).toBe("Saved");
  });

  it("↓ Row swaps the current row with the one below", () => {
    focusCell("a1");
    click(btn("rowDown"));
    expect(rows()).toEqual([["A", "B", "C"], ["a2", "b2", "c2"], ["a1", "b1", "c1"]]);
    expect(caretCell()).toBe(cell("a1"));
  });

  it("does nothing (and says so) when there is no row to swap with: first/last body row, or the header", () => {
    focusCell("b1"); click(btn("rowUp"));            // first body row: the header stays on top
    expect(rows()).toEqual([["A", "B", "C"], ["a1", "b1", "c1"], ["a2", "b2", "c2"]]);
    expect(app.toastText()).toBe("No row above to swap with");
    expect(caretCell()).toBe(cell("b1"));

    focusCell("c2"); click(btn("rowDown"));          // last row
    expect(rows()).toEqual([["A", "B", "C"], ["a1", "b1", "c1"], ["a2", "b2", "c2"]]);
    expect(app.toastText()).toBe("No row below to swap with");

    for (const op of ["rowUp", "rowDown"]) {         // header rows never move
      focusCell("B"); click(btn(op));
      expect(rows()).toEqual([["A", "B", "C"], ["a1", "b1", "c1"], ["a2", "b2", "c2"]]);
      expect(app.toastText()).toBe("The header row stays on top");
    }
  });

  it("moves plain <td> rows in a table without a header", () => {
    editor.innerHTML = "<table><tbody><tr><td>one</td></tr><tr><td>two</td></tr><tr><td>three</td></tr></tbody></table>";
    focusCell("one"); click(btn("rowDown"));
    expect(rows()).toEqual([["two"], ["one"], ["three"]]);
    focusCell("three"); click(btn("rowUp"));
    expect(rows()).toEqual([["two"], ["three"], ["one"]]);
  });
});

describe("move column buttons", () => {
  it("← Col swaps the current column with the one on its left in every row, header included", () => {
    focusCell("b1");
    click(btn("colPrev"));
    expect(rows()).toEqual([["B", "A", "C"], ["b1", "a1", "c1"], ["b2", "a2", "c2"]]);
    expect(caretCell()).toBe(cell("b1"));
    expect(content()).toMatch(/<th>B<\/th><th>A<\/th><th>C<\/th>/);
  });

  it("→ Col swaps with the column on its right", () => {
    focusCell("B");
    click(btn("colNext"));
    expect(rows()).toEqual([["A", "C", "B"], ["a1", "c1", "b1"], ["a2", "c2", "b2"]]);
    expect(caretCell()).toBe(cell("B"));
  });

  it("does nothing (and says so) on the first / last column", () => {
    focusCell("a2"); click(btn("colPrev"));
    expect(rows()).toEqual([["A", "B", "C"], ["a1", "b1", "c1"], ["a2", "b2", "c2"]]);
    expect(app.toastText()).toBe("No column to the left to swap with");
    focusCell("c1"); click(btn("colNext"));
    expect(rows()).toEqual([["A", "B", "C"], ["a1", "b1", "c1"], ["a2", "b2", "c2"]]);
    expect(app.toastText()).toBe("No column to the right to swap with");
  });

  it("leaves ragged rows that lack the neighbouring cell untouched", () => {
    editor.innerHTML = "<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>x</td></tr></tbody></table>";
    focusCell("b"); click(btn("colPrev"));
    expect(rows()).toEqual([["b", "a"], ["x"]]);
  });
});

describe("delete table button", () => {
  it("asks for confirmation and replaces the table with a paragraph on Delete", async () => {
    focusCell("b1");
    click(btn("delTable"));
    await tick();
    expect(app.dialogOpen()).toBe(true);
    expect(app.q("#dialog h3").textContent).toBe("Delete table?");
    expect(app.q("#dialog p").textContent).toBe("Everything in it will be removed from this page.");
    click(app.q('#dialog [data-a="1"]'));
    await tick();
    expect(table()).toBeNull();
    expect(editor.innerHTML).toBe("<p>before</p><p><br></p><p>after</p><p><br></p>");
    expect(caretCell()).toBeNull();
    expect(app.window.getSelection().getRangeAt(0).startContainer).toBe(editor.children[1]);
    expect(content()).not.toContain("<table>");
    expect(tbl.style.display).toBe("none");
  });

  it("keeps the table when cancelled", async () => {
    focusCell("b1");
    click(btn("delTable"));
    await tick();
    click(app.q('#dialog [data-a="0"]'));
    await tick();
    expect(table()).not.toBeNull();
    expect(rows()).toHaveLength(3);
  });
});

describe("bar without a bound cell", () => {
  it("buttons do nothing when the bar is stale", async () => {
    tbl._cell = null;
    for (const b of app.qa("#tbl button")) { click(b); await tick(); }
    expect(rows()).toHaveLength(3);
    expect(app.dialogOpen()).toBe(false);
  });

  it("buttons do nothing when the bound cell was removed from the page", async () => {
    focusCell("b1");
    const c = cell("b1");
    c.remove();
    tbl._cell = c;
    click(btn("rowBelow")); await tick();
    expect(rows()).toHaveLength(3);
  });
});

describe("Tab inside a table", () => {
  it("moves to the next cell (across rows) and Shift+Tab moves back", () => {
    caret(cell("c1").firstChild, 0);
    expect(key(editor, "Tab").defaultPrevented).toBe(true);
    expect(caretCell()).toBe(cell("a2"));
    expect(app.exec.calls.filter(c => c.cmd === "indent")).toHaveLength(0);
    key(editor, "Tab", { shiftKey: true });
    expect(caretCell()).toBe(cell("c1"));
    expect(app.get("syncQueued")).toBe(true);
  });

  it("Tab in the last cell appends a new row, lands in its first cell and saves", () => {
    caret(cell("c2").firstChild, 2);
    key(editor, "Tab");
    expect(rows()).toEqual([["A", "B", "C"], ["a1", "b1", "c1"], ["a2", "b2", "c2"], ["", "", ""]]);
    expect(caretCell() === table().rows[3].cells[0]).toBe(true);
    expect(app.$("status").textContent).toBe("Saved");
    expect(content()).toContain('<tr><td><br></td><td><br></td><td><br></td></tr>');
  });

  it("Shift+Tab in the first cell stays put", () => {
    caret(cell("A").firstChild, 0);
    key(editor, "Tab", { shiftKey: true });
    expect(caretCell()).toBe(cell("A"));
    expect(rows()).toHaveLength(3);
  });

  it("Enter in a cell is left to the browser", () => {
    caret(cell("a1").firstChild, 0);
    expect(key(editor, "Enter").defaultPrevented).toBe(false);
  });
});

describe("view mode", () => {
  it("renders the edited table without leaving the tools behind", () => {
    focusCell("b1");
    click(btn("rowBelow"));
    app.call("setMode", "view");
    expect(app.qa("#viewer table tr")).toHaveLength(4);
    expect(app.q("#viewer .tbl")).toBeNull();
    expect(tbl.style.display).toBe("none");
  });
});
