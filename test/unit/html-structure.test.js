import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { loadApp } from "../helpers/app.js";

/* Static markup contract: every element the script wires up must exist with
   the attributes the script (and the user) relies on. */
let app;
beforeAll(() => { app = loadApp(); });
afterAll(() => app.close());

describe("document", () => {
  it("has the right title and language", () => {
    expect(app.document.title).toBe("Virtual PC");
    expect(app.document.documentElement.lang).toBe("en");
    expect(app.document.querySelector("meta[charset]").getAttribute("charset")).toBe("utf-8");
  });

  it("boots without JSDOM errors", () => {
    expect(app.jsdomErrors).toEqual([]);
  });
});

describe("app bar", () => {
  it("has the sidebar toggle with shortcut hint and aria label", () => {
    const b = app.$("btnNav");
    expect(b).not.toBeNull();
    expect(b.title).toContain("Ctrl+\\");
    expect(b.getAttribute("aria-label")).toBe("Toggle sidebar");
    expect(b.querySelector("svg")).not.toBeNull();
  });

  it("shows the brand", () => {
    expect(app.q(".brand b").textContent).toBe("Virtual PC");
  });

  it("has Import / Export buttons and a hidden JSON file input", () => {
    expect(app.$("btnImport").textContent).toBe("Import");
    expect(app.$("btnExport").textContent).toBe("Export");
    const f = app.$("file");
    expect(f.type).toBe("file");
    expect(f.hidden).toBe(true);
    expect(f.accept).toBe("application/json,.json");
  });
});

describe("sidebar", () => {
  it("has search, new page and new folder controls", () => {
    expect(app.$("search").placeholder).toBe("Search pages");
    expect(app.$("search").getAttribute("spellcheck")).toBe("false");
    expect(app.$("btnPage").title).toBe("New page");
    expect(app.$("btnFolder").title).toBe("New folder");
  });

  it("has the tree container, stats and the edit shortcut hint", () => {
    expect(app.$("tree")).not.toBeNull();
    expect(app.$("stats")).not.toBeNull();
    expect(app.q(".nav-foot").textContent).toContain("Ctrl+E edit");
  });

  it("has a resize grip right after the aside", () => {
    const grip = app.$("grip");
    expect(grip.previousElementSibling.tagName).toBe("ASIDE");
  });
});

describe("content area", () => {
  it("has the empty state with a create button", () => {
    expect(app.q("#empty h2").textContent).toBe("Nothing open");
    expect(app.$("btnFirst").textContent).toBe("Create a page");
    expect(app.$("btnFirst").classList.contains("primary")).toBe(true);
  });

  it("has the doc bar controls", () => {
    expect(app.$("crumbs")).not.toBeNull();
    expect(app.$("docTitle").getAttribute("spellcheck")).toBe("false");
    expect(app.$("status")).not.toBeNull();
    expect(app.$("btnSource").textContent).toBe("HTML");
    expect(app.$("btnSource").title).toBe("Edit raw HTML");
    expect(app.$("btnMode").textContent).toBe("Edit");
  });

  it("has viewer, editor (contenteditable), code-block layer and source textarea", () => {
    expect(app.$("viewer").classList.contains("body")).toBe(true);
    expect(app.$("editor").getAttribute("contenteditable")).toBe("true");
    expect(app.$("editor").getAttribute("spellcheck")).toBe("false");
    expect(app.$("blocks")).not.toBeNull();
    expect(app.$("source").tagName).toBe("TEXTAREA");
    expect(app.$("source").getAttribute("spellcheck")).toBe("false");
  });

  it("hides editor, source and toolbar by default", () => {
    expect(app.$("editor").style.display).toBe("none");
    expect(app.$("source").style.display).toBe("none");
    expect(app.$("toolbar").style.display).toBe("none");
  });
});

describe("toolbar", () => {
  const cmds = () => app.qa("#toolbar button[data-cmd]").map(b => [b.dataset.cmd, b.dataset.val ?? null]);

  it("exposes every formatting command", () => {
    expect(cmds()).toEqual([
      ["formatBlock", "h2"],
      ["formatBlock", "h3"],
      ["formatBlock", "p"],
      ["bold", null],
      ["italic", null],
      ["underline", null],
      ["strikeThrough", null],
      ["insertUnorderedList", null],
      ["insertOrderedList", null],
      ["formatBlock", "blockquote"],
      ["insertHorizontalRule", null]
    ]);
  });

  it("has the code block, link and table buttons", () => {
    expect(app.$("tbBlock").textContent).toBe("Code block");
    expect(app.$("tbLink").textContent).toBe("Link");
    expect(app.$("tbTable").textContent).toBe("Table");
  });

  it("documents shortcuts in titles and hint", () => {
    expect(app.q('[data-cmd="bold"]').title).toContain("Ctrl+B");
    expect(app.q('[data-cmd="italic"]').title).toContain("Ctrl+I");
    expect(app.q(".tb-hint").textContent).toBe("Ctrl+S saves & closes editing");
  });

  it("gives every toolbar button a title", () => {
    for (const b of app.qa("#toolbar button")) expect(b.title).not.toBe("");
  });
});

describe("overlays", () => {
  it("has a closed context menu, veil/dialog and toast", () => {
    expect(app.$("menu").classList.contains("open")).toBe(false);
    expect(app.$("veil").classList.contains("open")).toBe(false);
    expect(app.$("dialog").parentElement.id).toBe("veil");
    expect(app.$("toast").classList.contains("show")).toBe(false);
  });
});
