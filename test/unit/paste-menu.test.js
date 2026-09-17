/*
 * The "Paste" dropdown in the editing toolbar (next to Image, so only
 * visible in edit mode). Its only entry so far, "From table", turns the
 * tab-separated text Excel puts on the clipboard into a table at the caret.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadApp, sampleTree, tick } from "../helpers/app.js";
import { click, mousedown, caret } from "../helpers/dom.js";

/* exactly what Ctrl+C on a 3×3 range in Excel for Windows puts in text/plain:
   one line per row (CRLF), cells separated by a tab, a trailing CRLF */
const EXCEL = "Name\tQty\tPrice\r\nApple\t3\t1.5\r\nBanana\t12\t0.25\r\n";

let app;
beforeEach(() => { app = loadApp({ stored: { tree: sampleTree(), selected: "p1" } }); });
afterEach(() => app.close());

const content = () => app.call("find", "p1").node.content;
const menuItems = () => app.qa("#menu button").map(b => b.textContent);
const settle = async () => { for (let i = 0; i < 4; i++) await tick(); };

async function fromExcel() {
  if (app.get("mode") !== "edit") app.call("setMode", "edit");
  click(app.$("tbPaste"));
  click(app.qa("#menu button").find(b => b.textContent === "From table"));
  await settle();
}

describe("Paste button", () => {
  it("lives in the editing toolbar right after Image, so it is only shown in edit mode", () => {
    const btn = app.$("tbPaste");
    expect(btn.closest("#toolbar")).not.toBeNull();
    expect(btn.closest(".doc-bar")).toBeNull();
    expect(app.$("tbImage").nextElementSibling).toBe(btn);
    expect(app.$("toolbar").style.display).toBe("none");       // view mode: no toolbar, no button
    app.call("setMode", "edit");
    expect(app.$("toolbar").style.display).not.toBe("none");
    app.call("setMode", "source");
    expect(app.$("toolbar").style.display).toBe("none");
  });

  it("opens a dropdown with only 'From table'", () => {
    app.call("setMode", "edit");
    expect(app.$("menu").classList.contains("open")).toBe(false);
    click(app.$("tbPaste"));
    expect(app.$("menu").classList.contains("open")).toBe(true);
    expect(menuItems()).toEqual(["From table"]);
  });

  it("keeps the editor selection (mousedown is prevented) and closes on outside click", () => {
    app.call("setMode", "edit");
    expect(mousedown(app.$("tbPaste")).defaultPrevented).toBe(true);
    click(app.$("tbPaste"));
    mousedown(app.document.body);
    expect(app.$("menu").classList.contains("open")).toBe(false);
  });
});

describe("From table", () => {
  it("turns a real Excel copy into a table with a header row and saves", async () => {
    app.clipboard.text = EXCEL;
    await fromExcel();

    expect(app.get("mode")).toBe("edit");
    const table = app.$("editor").querySelector("table");
    expect(table).not.toBeNull();
    expect([...table.querySelectorAll("thead th")].map(c => c.textContent)).toEqual(["Name", "Qty", "Price"]);
    const rows = [...table.querySelectorAll("tbody tr")].map(tr => [...tr.children].map(c => c.textContent));
    expect(rows).toEqual([["Apple", "3", "1.5"], ["Banana", "12", "0.25"]]);
    expect(table.querySelectorAll("tr").length).toBe(3);   // the trailing CRLF is not an empty row
    expect(table.nextElementSibling.tagName).toBe("P");    // somewhere to keep typing
    expect(app.$("editor").querySelector("p").textContent).toBe("alpha text");   // existing text kept
    expect(content()).toContain("<th>Name</th>");
    expect(app.$("status").textContent).toBe("Saved");
    app.flush();
    expect(JSON.stringify(app.stored())).toContain("<td>Banana</td>");
  });

  it("inserts at the caret while editing and escapes cell text", async () => {
    app.call("setMode", "edit");
    const editor = app.$("editor");
    caret(editor.querySelector("p").firstChild, 5);
    app.clipboard.text = "a<b>\t1\n";
    await fromExcel();
    expect(editor.querySelector("table")).not.toBeNull();
    expect(editor.querySelector("b")).toBeNull();
    expect(editor.querySelector("th").textContent).toBe("a<b>");
    expect(app.get("mode")).toBe("edit");
  });

  it("handles the quoted cells Excel emits for text with line breaks or tabs", async () => {
    app.clipboard.text = "Note\tQty\r\n\"first line\nsecond line\"\t2\r\n\"has\ttab\"\t3\r\n";
    await fromExcel();
    const cells = [...app.$("editor").querySelectorAll("tbody td")].map(c => c.textContent);
    expect(cells).toEqual(["first line\nsecond line", "2", "has\ttab", "3"]);
  });

  it("pads ragged rows so every row has the same number of cells", async () => {
    app.clipboard.text = "A\tB\tC\r\n1\r\n";
    await fromExcel();
    expect(app.$("editor").querySelectorAll("tbody td").length).toBe(3);
  });

  it("toasts and changes nothing when the clipboard is empty", async () => {
    app.clipboard.text = "";
    await fromExcel();
    expect(app.toastText()).toBe("Nothing to paste on the clipboard");
    expect(app.$("editor").querySelector("table")).toBeNull();
    expect(content()).toBe("<p>alpha text</p>");
  });

  it("toasts when clipboard access is denied or unavailable", async () => {
    app.clipboard.mode = "blocked";
    await fromExcel();
    expect(app.toastText()).toBe("Clipboard access denied — paste with Ctrl+V instead");

    app.close();
    app = loadApp({ stored: { tree: sampleTree(), selected: "p1" }, clipboardMode: "noread" });
    await fromExcel();
    expect(app.toastText()).toBe("Clipboard blocked by the browser — paste with Ctrl+V instead");
  });

  it("the pasted table survives the sanitiser and the source view round trip", async () => {
    app.clipboard.text = EXCEL;
    await fromExcel();
    app.call("setMode", "source");
    app.call("setMode", "view");
    const table = app.$("viewer").querySelector("table");
    expect(table.querySelectorAll("th").length).toBe(3);
    expect(table.querySelectorAll("td").length).toBe(6);
  });
});
