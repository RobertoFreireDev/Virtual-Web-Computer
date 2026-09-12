import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadApp, sampleTree, tick } from "../helpers/app.js";
import { click, key, paste, caret, mousedown, input } from "../helpers/dom.js";

let app, editor;
beforeEach(() => {
  app = loadApp({ stored: { tree: sampleTree(), selected: "p1" } });
  app.call("setMode", "edit");
  editor = app.$("editor");
});
afterEach(() => app.close());

const content = () => app.call("find", "p1").node.content;
const lastExec = () => app.exec.calls.at(-1);

describe("toolbar formatting buttons", () => {
  it("run their execCommand with the value and commit", () => {
    for (const b of app.qa("#toolbar button[data-cmd]")) {
      click(b);
      expect(lastExec()).toEqual({ cmd: b.dataset.cmd, val: b.dataset.val || null });
    }
    expect(app.$("status").textContent).toBe("Saved");
  });

  it("prevent mousedown so the editor keeps its selection", () => {
    for (const b of app.qa("#toolbar button[data-cmd], #tbBlock, #tbImage, #tbLink, #tbTable")) {
      expect(mousedown(b).defaultPrevented).toBe(true);
    }
  });

  it("H2 / H3 / P / quote use formatBlock", () => {
    const vals = app.qa('#toolbar button[data-cmd="formatBlock"]').map(b => b.dataset.val);
    expect(vals).toEqual(["h2", "h3", "p", "blockquote"]);
  });
});

describe("Code block button", () => {
  it("inserts an empty plain code block followed by a paragraph and saves", () => {
    click(app.$("tbBlock"));
    const pre = editor.querySelector("pre.code");
    expect(pre).not.toBeNull();
    expect(pre.dataset.lang).toBe("plain");
    expect(pre.textContent).toBe("// code\n");
    expect(pre.nextElementSibling.outerHTML).toBe("<p><br></p>");
    expect(content()).toContain('<pre class="code" data-lang="plain">');
  });

  it("wraps the selected text, escaped", () => {
    const p = editor.querySelector("p");
    p.textContent = "<b>sel</b>";
    caret(p);
    click(app.$("tbBlock"));
    expect(editor.querySelector("pre.code").textContent).toBe("<b>sel</b>\n");
    expect(editor.querySelector("pre.code").innerHTML).toContain("&lt;b&gt;");
  });

  it("keeps the paragraph the caret was in above the block", () => {
    click(app.$("tbBlock"));
    const pre = editor.querySelector("pre.code");
    expect(pre.previousElementSibling.tagName).toBe("P");
    expect(editor.querySelectorAll("p")).toHaveLength(2);   // no extra one added
  });

  it("does nothing when the caret is already inside a block", () => {
    click(app.$("tbBlock"));
    const pre = editor.querySelector("pre.code");
    caret(pre.firstChild, 1);
    const n = app.exec.calls.length;
    click(app.$("tbBlock"));
    expect(app.exec.calls.length).toBe(n);
    expect(editor.querySelectorAll("pre.code")).toHaveLength(1);
  });
});

/* Regression: a code block as the first thing on the page, or two code blocks
   back to back, left no line the caret could be moved into — there was no way
   to get "above" the block or "between" the blocks to keep writing. */
describe("Code block button — room to navigate around blocks", () => {
  const sel = () => app.window.getSelection().getRangeAt(0);
  /* the caret can be put in `el` and it is a real paragraph a person can type in */
  const canStandIn = el => {
    expect(el.tagName).toBe("P");
    expect(el.outerHTML).toBe("<p><br></p>");
    app.call("caretTo", el, false);
    expect(sel().collapsed).toBe(true);
    expect(el.contains(sel().startContainer)).toBe(true);
    expect(app.call("currentPre")).toBeNull();          // not inside any block
  };

  it("a block inserted on an empty page gets an empty line above it", () => {
    editor.innerHTML = "";
    caret(editor, 0);
    click(app.$("tbBlock"));
    const pre = editor.querySelector("pre.code");
    expect(editor.firstElementChild).not.toBe(pre);
    canStandIn(pre.previousElementSibling);
    expect(editor.firstElementChild).toBe(pre.previousElementSibling);
    expect(pre.nextElementSibling.outerHTML).toBe("<p><br></p>");
    expect(content().startsWith("<p><br></p><pre")).toBe(true);
  });

  it("a block inserted right after another block gets an empty line between them", () => {
    editor.innerHTML = '<pre class="code" data-lang="plain">first\n</pre>';
    caret(editor, 1);                                     // where a browser leaves the caret once the trailing <p> was consumed
    click(app.$("tbBlock"));
    const [a, b] = editor.querySelectorAll("pre.code");
    expect(b).toBeDefined();
    expect(a.nextElementSibling).not.toBe(b);
    canStandIn(b.previousElementSibling);
    expect(b.previousElementSibling.previousElementSibling).toBe(a);
    expect(a.textContent).toBe("first\n");                // the existing block is untouched
    expect(content()).toMatch(/<\/pre><p><br><\/p><pre/);
  });

  it("three blocks in a row are each separated by a line", () => {
    editor.innerHTML = "";
    caret(editor, 0);
    for (let i = 0; i < 3; i++) {
      click(app.$("tbBlock"));
      const last = [...editor.querySelectorAll("pre.code")].at(-1);
      caret(editor, [...editor.childNodes].indexOf(last) + 1);   // caret directly after the block, its trailing <p> dropped
      last.nextElementSibling.remove();
    }
    const pres = editor.querySelectorAll("pre.code");
    expect(pres).toHaveLength(3);
    for (const pre of pres) canStandIn(pre.previousElementSibling);
  });

  it("a block inserted after a table or a divider also gets a line above it", () => {
    for (const before of ["<table><tbody><tr><td>x</td></tr></tbody></table>", "<hr>"]) {
      editor.innerHTML = before;
      caret(editor, 1);
      click(app.$("tbBlock"));
      const pre = editor.querySelector("pre.code");
      canStandIn(pre.previousElementSibling);
      expect(pre.previousElementSibling.previousElementSibling).toBe(editor.firstElementChild);
    }
  });

  it("does not add a line when there already is one above", () => {
    click(app.$("tbBlock"));                              // caret was in the page's own paragraph
    const pre = editor.querySelector("pre.code");
    expect(pre.previousElementSibling.textContent).not.toBe("");
    expect(editor.querySelectorAll("p")).toHaveLength(2); // the original + the trailing one
  });
});

describe("Table button", () => {
  it("inserts a 3-column table with a header row, two body rows and a trailing paragraph", () => {
    click(app.$("tbTable"));
    const t = editor.querySelector("table");
    expect(t.querySelectorAll("thead th")).toHaveLength(3);
    expect(t.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(t.querySelectorAll("tbody td")).toHaveLength(6);
    expect(t.querySelector("th").textContent).toBe("Column");
    expect(t.nextElementSibling.outerHTML).toBe("<p><br></p>");
    expect(content()).toContain("<table>");
  });
});

describe("Link button", () => {
  const dlg = () => app.$("dialog");

  it("opens the link dialog prefilled with the selection", async () => {
    const p = editor.querySelector("p");
    caret(p);   // "alpha text" selected
    click(app.$("tbLink"));
    await tick();
    expect(app.dialogOpen()).toBe(true);
    expect(dlg().querySelector("h3").textContent).toBe("Add link");
    expect(dlg().querySelector("#lkName").value).toBe("alpha text");
    expect(dlg().querySelector("#lkUrl").value).toBe("https://");
    expect(app.document.activeElement).toBe(dlg().querySelector("#lkUrl"));
  });

  it("focuses the name field when nothing is selected", async () => {
    click(app.$("tbLink"));
    await tick();
    expect(app.document.activeElement).toBe(dlg().querySelector("#lkName"));
  });

  it("inserts an escaped anchor and commits", async () => {
    click(app.$("tbLink"));
    await tick();
    dlg().querySelector("#lkName").value = "Docs <x>";
    dlg().querySelector("#lkUrl").value = "https://e.com/?a=1&b=<2>";
    click(dlg().querySelector('[data-a="1"]'));
    await tick();
    const a = editor.querySelector("a");
    expect(a.getAttribute("href")).toBe("https://e.com/?a=1&b=<2>");
    expect(a.textContent).toBe("Docs <x>");
    expect(editor.querySelector("x")).toBeNull();
    expect(content()).toContain("<a href=");
    expect(app.dialogOpen()).toBe(false);
  });

  it("uses the url as text when the name is empty", async () => {
    click(app.$("tbLink"));
    await tick();
    dlg().querySelector("#lkName").value = "";
    dlg().querySelector("#lkUrl").value = "https://x.y";
    click(dlg().querySelector('[data-a="1"]'));
    await tick();
    expect(editor.querySelector("a").textContent).toBe("https://x.y");
  });

  it("does nothing on cancel, an empty address or the untouched https:// placeholder", async () => {
    click(app.$("tbLink"));
    await tick();
    click(dlg().querySelector('[data-a="0"]'));
    await tick();
    expect(editor.querySelector("a")).toBeNull();

    for (const v of ["   ", "https://"]) {
      click(app.$("tbLink"));
      await tick();
      dlg().querySelector("#lkUrl").value = v;
      click(dlg().querySelector('[data-a="1"]'));
      await tick();
      expect(editor.querySelector("a")).toBeNull();
    }
  });

  it("Enter in the name field jumps to the address, Enter there submits", async () => {
    click(app.$("tbLink"));
    await tick();
    const name = dlg().querySelector("#lkName"), url = dlg().querySelector("#lkUrl");
    expect(key(name, "Enter").defaultPrevented).toBe(true);
    expect(app.document.activeElement).toBe(url);
    url.value = "https://enter.dev";
    key(url, "Enter");
    await tick();
    expect(editor.querySelector("a").getAttribute("href")).toBe("https://enter.dev");
  });
});

describe("paste", () => {
  it("inserts sanitised HTML when the clipboard has HTML", () => {
    const ev = paste(editor, { html: '<p onclick="x">hi <b>b</b></p><script>1</script>', text: "hi b" });
    expect(ev.defaultPrevented).toBe(true);
    expect(lastExec()).toEqual({ cmd: "insertHTML", val: "<p>hi <b>b</b></p>" });
  });

  it("commits plain-text pastes (they do not fire an input event)", () => {
    caret(editor.querySelector("p").firstChild, 0);
    paste(editor, { text: "typed" });
    expect(content()).toContain("typed");
  });

  it("inserts plain text when there is no HTML", () => {
    caret(editor.querySelector("p").firstChild, 0);
    paste(editor, { text: "plain <x>" });
    expect(editor.textContent.startsWith("plain <x>")).toBe(true);
    expect(editor.querySelector("x")).toBeNull();
  });

  it("inserts plain text inside code blocks even when HTML is available", () => {
    click(app.$("tbBlock"));
    const pre = editor.querySelector("pre.code");
    caret(pre.firstChild, 0);
    paste(editor, { html: "<b>bold</b>", text: "bold" });
    expect(pre.querySelector("b")).toBeNull();
    expect(pre.textContent.startsWith("bold")).toBe(true);
  });
});

/* a 1×1 PNG as the browser would hand it over from a screenshot */
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), c => c.charCodeAt(0));
const png = () => new app.window.File([PNG], "shot.png", { type: "image/png" });
/* FileReader finishes on the real event loop; wait until the <img> lands (or give up) */
async function untilImg() {
  for (let i = 0; i < 50 && !editor.querySelector("img"); i++) await new Promise(r => setImmediate(r));
  return editor.querySelector("img");
}
const DATA = "data:image/png;base64,iVBORw0KGgo";

describe("images", () => {
  it("Ctrl+V with a copied image embeds it as a base64 <img> and commits", async () => {
    caret(editor.querySelector("p").firstChild, 0);
    const ev = paste(editor, { files: [png()], text: "" });
    expect(ev.defaultPrevented).toBe(true);
    const img = await untilImg();
    expect(img.getAttribute("src").startsWith(DATA)).toBe(true);
    expect(content()).toContain(DATA);
    expect(app.$("status").textContent).toBe("Saved");
  });

  it("prefers the image file over any HTML on the clipboard, except inside code blocks", async () => {
    caret(editor.querySelector("p").firstChild, 0);
    paste(editor, { files: [png()], html: "<b>x</b>", text: "x" });
    expect(await untilImg()).not.toBeNull();
    expect(editor.querySelector("b")).toBeNull();

    click(app.$("tbBlock"));
    const pre = editor.querySelector("pre.code");
    caret(pre.firstChild, 0);
    paste(editor, { files: [png()], text: "shot" });
    expect(pre.querySelector("img")).toBeNull();
    expect(pre.textContent.startsWith("shot")).toBe(true);
  });

  it("Image button reads the clipboard and inserts the image at the caret", async () => {
    app.clipboard.image = png();
    caret(editor.querySelector("p").firstChild, 0);
    click(app.$("tbImage"));
    const img = await untilImg();
    expect(img.getAttribute("src").startsWith(DATA)).toBe(true);
    expect(img.getAttribute("alt")).toBe("");
    expect(content()).toContain(DATA);
    expect(app.clipboard.calls).toBe(1);
  });

  it("Image button toasts when the clipboard has no image", async () => {
    click(app.$("tbImage"));
    await tick(); await tick();
    expect(app.toastText()).toBe("No image on the clipboard");
    expect(editor.querySelector("img")).toBeNull();
  });

  it("Image button toasts when clipboard access is denied or unavailable", async () => {
    app.clipboard.mode = "blocked";
    click(app.$("tbImage"));
    await tick(); await tick();
    expect(app.toastText()).toBe("Clipboard access denied — paste with Ctrl+V instead");

    app.close();
    app = loadApp({ stored: { tree: sampleTree(), selected: "p1" }, clipboardMode: "noread" });
    app.call("setMode", "edit");
    click(app.$("tbImage"));
    expect(app.toastText()).toBe("Clipboard blocked by the browser — paste with Ctrl+V instead");
  });

  it("base64 images survive the sanitiser and the source view round trip", async () => {
    caret(editor.querySelector("p").firstChild, 0);
    paste(editor, { files: [png()] });
    await untilImg();
    app.call("setMode", "source");
    app.call("setMode", "view");
    expect(app.$("viewer").querySelector("img").getAttribute("src").startsWith(DATA)).toBe(true);
  });
});

describe("currentPre() / insertText()", () => {
  it("currentPre finds the enclosing code block or null", () => {
    expect(app.call("currentPre")).toBeNull();
    click(app.$("tbBlock"));
    const pre = editor.querySelector("pre.code");
    caret(pre.firstChild, 2);
    expect(app.call("currentPre")).toBe(pre);
    caret(pre, 0);
    expect(app.call("currentPre")).toBe(pre);
    app.window.getSelection().removeAllRanges();
    expect(app.call("currentPre")).toBeNull();
  });

  it("insertText replaces the selection and moves the caret after the text", () => {
    const p = editor.querySelector("p");
    caret(p);                              // select "alpha text"
    app.call("insertText", "X");
    expect(p.textContent).toBe("X");
    const r = app.window.getSelection().getRangeAt(0);
    expect(r.collapsed).toBe(true);
    expect(r.startContainer).toBe(p);
    expect(r.startOffset).toBe(1);
  });

  it("insertText is a no-op without a selection", () => {
    app.window.getSelection().removeAllRanges();
    expect(() => app.call("insertText", "X")).not.toThrow();
  });
});

describe("keyboard inside a code block", () => {
  let pre;
  beforeEach(() => {
    click(app.$("tbBlock"));
    pre = editor.querySelector("pre.code");
    pre.textContent = "abc";
    caret(pre.firstChild, 3);
  });

  it("Enter inserts a newline instead of a paragraph and keeps the caret in the block", () => {
    const ev = key(editor, "Enter");
    expect(ev.defaultPrevented).toBe(true);
    expect(pre.textContent).toBe("abc\n");
    expect(editor.querySelectorAll("pre.code")).toHaveLength(1);
    const r = app.window.getSelection().getRangeAt(0);
    expect(r.collapsed).toBe(true);
    expect(pre.contains(r.startContainer)).toBe(true);
    expect(app.get("raw")).toBe(editor.innerHTML);
  });

  it("Enter in the middle of a line splits it", () => {
    caret(pre.firstChild, 1);
    key(editor, "Enter");
    expect(pre.textContent).toBe("a\nbc");
  });

  it("Enter with the caret directly in the <pre> (nothing after it) adds a zero-width space so the caret has a place to sit", () => {
    caret(pre, pre.childNodes.length);
    key(editor, "Enter");
    expect(pre.textContent).toBe("abc\n​");
  });

  it("the zero-width space is stripped again when the page is viewed", () => {
    caret(pre, pre.childNodes.length);
    key(editor, "Enter");
    app.call("setMode", "view");
    expect(app.q("#viewer pre.code").textContent).toBe("abc\n");
  });

  it("Tab inserts two spaces", () => {
    const ev = key(editor, "Tab");
    expect(ev.defaultPrevented).toBe(true);
    expect(pre.textContent).toBe("abc  ");
    expect(app.exec.calls.filter(c => c.cmd === "indent")).toHaveLength(0);
  });

  it("Enter, Tab and Shift+Enter are committed (they change the DOM without an input event)", () => {
    key(editor, "Enter");
    expect(content()).toContain("abc\n");
    key(editor, "Tab");
    expect(content()).toContain("abc\n  ");
    key(editor, "Enter", { shiftKey: true });
    expect(content()).toContain("</pre><p><br></p>");
  });

  it("Shift+Enter / Ctrl+Enter leave the block into a new paragraph after it", () => {
    for (const mod of [{ shiftKey: true }, { ctrlKey: true }]) {
      caret(pre.firstChild, 3);
      const before = editor.children.length;
      const ev = key(editor, "Enter", mod);
      expect(ev.defaultPrevented).toBe(true);
      expect(editor.children.length).toBe(before + 1);
      expect(pre.nextElementSibling.outerHTML).toBe("<p><br></p>");
      const r = app.window.getSelection().getRangeAt(0);
      expect(r.startContainer).toBe(pre.nextElementSibling);
      expect(r.startOffset).toBe(0);
    }
  });
});

describe("keyboard outside code blocks", () => {
  it("Tab in text inserts a tab character instead of indenting into a quote", () => {
    const p = editor.querySelector("p");
    caret(p.firstChild, 5);
    const n = app.exec.calls.length;
    expect(key(editor, "Tab").defaultPrevented).toBe(true);
    expect(app.exec.calls.length).toBe(n);                 // no indent/outdent command
    expect(editor.querySelector("blockquote")).toBeNull();
    expect(p.textContent).toBe("alpha\t text");
    const r = app.window.getSelection().getRangeAt(0);
    expect(r.collapsed).toBe(true);
    expect(p.contains(r.startContainer)).toBe(true);
    expect(content()).toContain("alpha\t text");
  });

  it("Shift+Tab removes the tab before the caret and does nothing otherwise", () => {
    const p = editor.querySelector("p");
    caret(p.firstChild, 5);
    key(editor, "Tab");
    expect(p.textContent).toBe("alpha\t text");
    expect(key(editor, "Tab", { shiftKey: true }).defaultPrevented).toBe(true);
    expect(p.textContent).toBe("alpha text");
    expect(editor.querySelector("blockquote")).toBeNull();
    key(editor, "Tab", { shiftKey: true });
    expect(p.textContent).toBe("alpha text");
  });

  it("tabs are shown: text containers keep whitespace", () => {
    const css = app.q("style").textContent;
    expect(css).toMatch(/\.body p[,{][^{]*\{[^}]*white-space:pre-wrap/);
  });

  it("Tab / Shift+Tab in a list item still nest and un-nest it", () => {
    editor.innerHTML = "<ul><li>one</li><li>two</li></ul>";
    caret(editor.querySelectorAll("li")[1].firstChild, 0);
    expect(key(editor, "Tab").defaultPrevented).toBe(true);
    expect(lastExec().cmd).toBe("indent");
    key(editor, "Tab", { shiftKey: true });
    expect(lastExec().cmd).toBe("outdent");
  });

  it("Enter is left to the browser", () => {
    caret(editor.querySelector("p").firstChild, 0);
    expect(key(editor, "Enter").defaultPrevented).toBe(false);
  });
});

describe("Enter inside a quote", () => {
  const sel = () => app.window.getSelection().getRangeAt(0);

  it("ends the quote and continues in a new paragraph instead of a new quote line", () => {
    editor.innerHTML = "<blockquote>quoted</blockquote>";
    const q = editor.querySelector("blockquote");
    caret(q.firstChild, 6);
    const ev = key(editor, "Enter");
    expect(ev.defaultPrevented).toBe(true);
    expect(editor.innerHTML).toBe("<blockquote>quoted</blockquote><p><br></p>");
    expect(editor.querySelectorAll("blockquote")).toHaveLength(1);
    expect(sel().collapsed).toBe(true);
    expect(sel().startContainer).toBe(q.nextElementSibling);
    expect(content()).toBe("<blockquote>quoted</blockquote><p><br></p>");
  });

  it("moves the text after the caret into the new paragraph", () => {
    editor.innerHTML = "<blockquote>quo<em>ted</em> end</blockquote>";
    caret(editor.querySelector("em").firstChild, 1);
    key(editor, "Enter");
    expect(editor.innerHTML).toBe("<blockquote>quo<em>t</em></blockquote><p><em>ed</em> end</p>");
    expect(editor.querySelector("blockquote").nextElementSibling.contains(sel().startContainer)).toBe(true);
  });

  it("Shift+Enter is left to the browser so a quote can still have several lines", () => {
    editor.innerHTML = "<blockquote>quoted</blockquote>";
    caret(editor.querySelector("blockquote").firstChild, 6);
    expect(key(editor, "Enter", { shiftKey: true }).defaultPrevented).toBe(false);
    expect(editor.innerHTML).toBe("<blockquote>quoted</blockquote>");
  });

  it("is left to the browser inside a list item within the quote (new item, not end of quote)", () => {
    editor.innerHTML = "<blockquote><ul><li>one</li></ul></blockquote>";
    caret(editor.querySelector("li").firstChild, 3);
    expect(key(editor, "Enter").defaultPrevented).toBe(false);
    expect(editor.innerHTML).toBe("<blockquote><ul><li>one</li></ul></blockquote>");
  });
});

describe("Backspace at the start of a quote", () => {
  const sel = () => app.window.getSelection().getRangeAt(0);

  it("turns a quote on the first line back into a paragraph", () => {
    editor.innerHTML = "<blockquote>quoted</blockquote><p>after</p>";
    const q = editor.querySelector("blockquote");
    caret(q.firstChild, 0);
    const ev = key(editor, "Backspace");
    expect(ev.defaultPrevented).toBe(true);
    expect(editor.querySelector("blockquote")).toBeNull();
    expect(editor.innerHTML).toBe("<p>quoted</p><p>after</p>");
    expect(sel().collapsed).toBe(true);
    expect(editor.firstElementChild.contains(sel().startContainer)).toBe(true);
    expect(content()).toBe("<p>quoted</p><p>after</p>");
  });

  it("removes an empty quote that is the only content", () => {
    editor.innerHTML = "<blockquote><br></blockquote>";
    caret(editor.querySelector("blockquote"), 0);
    key(editor, "Backspace");
    expect(editor.innerHTML).toBe("<p><br></p>");
    expect(sel().startContainer).toBe(editor.firstElementChild);
  });

  it("keeps paragraphs already inside the quote", () => {
    editor.innerHTML = "<blockquote><p>one</p><p>two</p></blockquote>";
    caret(editor.querySelector("blockquote p").firstChild, 0);
    key(editor, "Backspace");
    expect(editor.innerHTML).toBe("<p>one</p><p>two</p>");
  });

  it("is left to the browser when the caret is not at the very start of the quote", () => {
    editor.innerHTML = "<blockquote>quoted</blockquote>";
    caret(editor.querySelector("blockquote").firstChild, 2);
    expect(key(editor, "Backspace").defaultPrevented).toBe(false);
    expect(editor.querySelector("blockquote")).not.toBeNull();

    editor.innerHTML = "<blockquote><p>one</p><p>two</p></blockquote>";
    caret(editor.querySelectorAll("blockquote p")[1].firstChild, 0);
    expect(key(editor, "Backspace").defaultPrevented).toBe(false);
    expect(editor.querySelector("blockquote")).not.toBeNull();
  });

  it("is left to the browser when text is selected", () => {
    editor.innerHTML = "<blockquote>quoted</blockquote>";
    caret(editor.querySelector("blockquote"));   // selects the whole content
    expect(key(editor, "Backspace").defaultPrevented).toBe(false);
  });
});

describe("editing end to end", () => {
  it("typing, then Done, persists the new content", () => {
    editor.innerHTML = "<p>final</p>";
    input(editor);
    click(app.$("btnMode"));
    app.flush();
    expect(app.stored().tree[0].children[0].content).toBe("<p>final</p>");
    expect(app.$("viewer").innerHTML).toBe("<p>final</p>");
  });
});
