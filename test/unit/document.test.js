import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadApp, sampleTree, tick } from "../helpers/app.js";
import { click, input, key, mousedown } from "../helpers/dom.js";

let app;
beforeEach(() => { app = loadApp({ stored: { tree: sampleTree(), selected: "p1" } }); });
afterEach(() => app.close());

const db = () => app.get("db");

describe("open()", () => {
  it("loads the page content, title and switches to view mode", () => {
    app.call("open", "p3");
    expect(app.get("raw")).toBe(app.call("find", "p3").node.content);
    expect(app.$("docTitle").value).toBe("Gamma");
    expect(app.get("mode")).toBe("view");
    expect(app.$("viewer").querySelector("h2").textContent).toBe("Gamma");
  });

  it("shows the new page's content when opened while editing another page", () => {
    app.call("setMode", "edit");
    app.$("editor").innerHTML = "<p>unsaved alpha edit</p>";
    click(app.row("p3"));
    expect(app.get("mode")).toBe("view");
    expect(app.$("viewer").innerHTML).toContain("Gamma");
    expect(app.get("raw")).toBe(app.call("find", "p3").node.content);
    // the unsaved text lands on the page it was typed into, not the new one
    expect(app.call("find", "p1").node.content).toBe("<p>unsaved alpha edit</p>");
    expect(app.call("find", "p3").node.content).not.toContain("unsaved");
  });

  it("ignores folders and unknown ids", () => {
    const rawBefore = app.get("raw");
    app.call("open", "f1");
    app.call("open", "zzz");
    expect(app.get("raw")).toBe(rawBefore);
    expect(app.$("docTitle").value).toBe("Alpha");
  });

  it("treats missing content as an empty page", () => {
    delete app.call("find", "p3").node.content;
    db().selected = "p3";
    app.call("open", "p3");
    expect(app.get("raw")).toBe("");
    expect(app.$("viewer").innerHTML).toBe("");
  });
});

describe("crumbs()", () => {
  it("shows the folder path of the open page", () => {
    expect(app.$("crumbs").textContent).toBe("Work  /");
    db().selected = "p2"; app.call("open", "p2");
    expect(app.$("crumbs").textContent).toBe("Work  /  Nested  /");
  });
  it("is empty for root pages and when nothing is selected", () => {
    db().selected = "p3"; app.call("open", "p3");
    expect(app.$("crumbs").textContent).toBe("");
    app.set("openId", null); app.call("crumbs");
    expect(app.$("crumbs").textContent).toBe("");
  });
});

describe("render()", () => {
  it("shows the document while a page is open and the empty state otherwise", () => {
    expect(app.$("doc").style.display).toBe("flex");
    db().selected = "f1"; app.call("render");             // highlighting a folder keeps the open page visible
    expect(app.$("doc").style.display).toBe("flex");
    app.set("openId", null); app.call("render");
    expect(app.$("doc").style.display).toBe("none");
    expect(app.$("empty").style.display).toBe("flex");
  });

  it("leaves edit mode when the open page disappears", () => {
    app.call("setMode", "edit");
    app.set("openId", "gone"); app.call("render");
    expect(app.get("mode")).toBe("view");
    expect(app.$("toolbar").style.display).toBe("none");
  });

  it("sanitises the content before showing it", () => {
    app.set("raw", '<p onclick="x">a</p><script>b</script>');
    app.call("render");
    expect(app.$("viewer").innerHTML).toBe("<p>a</p>");
  });

  it("decorates code blocks with a language bar and copy button", () => {
    db().selected = "p3"; app.call("open", "p3");
    const wrap = app.q("#viewer .code-wrap");
    expect(wrap).not.toBeNull();
    expect(wrap.querySelector(".code-bar span").textContent).toBe("JavaScript");
    expect(wrap.querySelector(".code-bar button.copy").textContent).toBe("Copy");
    expect(wrap.querySelector("pre.code .t-keyword").textContent).toBe("const");
  });
});

describe("collapsible code blocks (view mode)", () => {
  const openGamma = () => { db().selected = "p3"; app.call("open", "p3"); return app.q("#viewer .code-wrap"); };

  it("starts collapsed with a toggle in the bar", () => {
    const wrap = openGamma(), tog = wrap.querySelector(".code-bar button.tog");
    expect(tog).not.toBeNull();
    expect(wrap.classList.contains("collapsed")).toBe(true);
    expect(tog.getAttribute("aria-expanded")).toBe("false");
    expect(tog.title).toBe("Expand");
    expect(wrap.querySelector("pre.code")).not.toBeNull();          // the code is still there, just hidden
  });

  it("shows the line count while collapsed", () => {
    app.set("raw", '<pre class="code" data-lang="plain">a\nb\nc\n</pre>');
    app.call("render");
    expect(app.q("#viewer .code-bar .n").textContent).toBe("3 lines");
    app.set("raw", '<pre class="code" data-lang="plain">one</pre>');
    app.call("render");
    expect(app.q("#viewer .code-bar .n").textContent).toBe("1 line");
  });

  it("the toggle expands and collapses again", () => {
    const wrap = openGamma(), tog = wrap.querySelector(".tog");
    click(tog);
    expect(wrap.classList.contains("collapsed")).toBe(false);
    expect(tog.getAttribute("aria-expanded")).toBe("true");
    expect(tog.title).toBe("Collapse");
    click(tog);
    expect(wrap.classList.contains("collapsed")).toBe(true);
    expect(tog.getAttribute("aria-expanded")).toBe("false");
  });

  it("each block toggles on its own", () => {
    app.set("raw", '<pre class="code" data-lang="plain">a</pre><p>x</p><pre class="code" data-lang="sql">b</pre>');
    app.call("render");
    const wraps = app.qa("#viewer .code-wrap");
    click(wraps[1].querySelector(".tog"));
    expect(wraps[0].classList.contains("collapsed")).toBe(true);
    expect(wraps[1].classList.contains("collapsed")).toBe(false);
  });

  it("is not saved: the state never reaches the page content", () => {
    const wrap = openGamma();
    click(wrap.querySelector(".tog"));
    app.flush();
    expect(app.get("raw")).not.toContain("collapsed");
    expect(app.get("raw")).not.toContain("tog");
    expect(app.stored().tree[1].content).toBe(sampleTree()[1].content);
  });

  it("is reset every time the page is opened: an expanded block is collapsed again", () => {
    const wrap = openGamma();
    click(wrap.querySelector(".tog"));
    expect(wrap.classList.contains("collapsed")).toBe(false);
    app.call("open", "p1"); app.call("open", "p3");
    expect(app.q("#viewer .code-wrap").classList.contains("collapsed")).toBe(true);
  });

  it("collapses again after a round of editing", () => {
    const wrap = openGamma();
    click(wrap.querySelector(".tog"));
    app.call("setMode", "edit");
    expect(app.q("#editor .tog")).toBeNull();                        // nothing of it leaks into the editor
    expect(app.q("#editor pre.code").textContent).toBe("const a = 1;");
    app.call("setMode", "view");
    expect(app.q("#viewer .code-wrap").classList.contains("collapsed")).toBe(true);
  });

  it("Copy still works on a collapsed block", async () => {
    const wrap = openGamma();
    click(wrap.querySelector(".copy"));
    await tick();
    expect(app.clipboard.text).toBe("const a = 1;");
  });
});

describe("decorate()", () => {
  const openGamma = () => { db().selected = "p3"; app.call("open", "p3"); return app.q("#viewer .code-bar button.copy"); };

  it("copies the raw code (not the highlighted HTML) and confirms briefly", async () => {
    const btn = openGamma();
    click(btn);
    await tick();
    expect(app.clipboard.text).toBe("const a = 1;");
    expect(btn.textContent).toBe("Copied");
    vi.advanceTimersByTime(1400);
    expect(btn.textContent).toBe("Copy");
  });

  it("toasts when the clipboard is blocked", async () => {
    app.clipboard.mode = "blocked";
    const btn = openGamma();
    click(btn);
    await tick();
    expect(app.toastText()).toBe("Clipboard blocked by the browser");
    expect(btn.textContent).toBe("Copy");
  });

  it("treats an unknown lang as plain text (no markup from data-lang), and strips zero-width spaces", () => {
    app.set("raw", '<pre class="code" data-lang="<img src=x onerror=alert(1)>">a​b</pre>');
    app.call("render");
    expect(app.q("#viewer .code-bar span").textContent).toBe("Plain text");
    expect(app.q("#viewer .code-bar img")).toBeNull();
    expect(app.q("#viewer pre.code").textContent).toBe("ab");
  });

  it("escapes the label even when decorate() is given an unknown lang directly", () => {
    const root = app.window.document.createElement("div");
    root.innerHTML = '<pre class="code" data-lang="<b>x</b>">c</pre>';
    app.call("decorate", root);
    expect(root.querySelector(".code-bar span").textContent).toBe("<b>x</b>");
    expect(root.querySelector(".code-bar b")).toBeNull();
  });

  it("labels plain blocks 'Plain text'", () => {
    app.set("raw", "<pre>x</pre>");
    app.call("render");
    expect(app.q("#viewer .code-bar span").textContent).toBe("Plain text");
  });
});

describe("setMode()", () => {
  it("view → edit shows editor + toolbar, hides viewer, updates buttons and status", () => {
    app.call("setMode", "edit");
    expect(app.get("mode")).toBe("edit");
    expect(app.$("viewer").style.display).toBe("none");
    expect(app.$("editor").style.display).toBe("");
    expect(app.$("source").style.display).toBe("none");
    expect(app.$("toolbar").style.display).toBe("");
    expect(app.$("btnMode").textContent).toBe("Done");
    expect(app.$("btnMode").className).toBe("btn primary");
    expect(app.$("status").textContent).toBe("Editing");
    expect(app.$("editor").innerHTML).toBe("<p>alpha text</p>");
  });

  it("edit fills an empty page with an empty paragraph and sets the paragraph separator", () => {
    app.set("raw", "   ");
    app.call("setMode", "edit");
    expect(app.$("editor").innerHTML).toBe("<p><br></p>");
    expect(app.exec.calls.some(c => c.cmd === "defaultParagraphSeparator" && c.val === "p")).toBe(true);
  });

  it("edit places the caret at the end of the last block", () => {
    app.call("setMode", "edit");
    const s = app.window.getSelection();
    expect(s.rangeCount).toBe(1);
    const r = s.getRangeAt(0);
    expect(r.collapsed).toBe(true);
    expect(app.$("editor").lastElementChild.contains(r.startContainer)).toBe(true);
  });

  it("edit adds a trailing paragraph after a page that ends in a code block", () => {
    db().selected = "p3"; app.call("open", "p3");
    app.call("setMode", "edit");
    const last = app.$("editor").lastElementChild;
    expect(last.tagName).toBe("P");
    expect(last.innerHTML).toBe("<br>");
    expect(app.get("raw")).toBe(app.$("editor").innerHTML);
  });

  it("source shows the textarea with formatted html and hides the page", () => {
    app.set("raw", "<p>a</p><p>b</p>");
    app.call("setMode", "source");
    expect(app.$("source").style.display).toBe("");
    expect(app.$("source").value).toBe("<p>a</p>\n<p>b</p>");
    expect(app.$("page").style.display).toBe("none");
    expect(app.$("toolbar").style.display).toBe("none");
    expect(app.$("btnSource").style.opacity).toBe("1");
    expect(app.$("btnMode").textContent).toBe("Done");
  });

  it("leaving edit mode captures the editor html into raw", () => {
    app.call("setMode", "edit");
    app.$("editor").innerHTML = "<p>changed</p>";
    app.call("setMode", "view");
    expect(app.get("raw")).toBe("<p>changed</p>");
    expect(app.$("viewer").innerHTML).toBe("<p>changed</p>");
  });

  it("leaving source mode captures the textarea into raw", () => {
    app.call("setMode", "source");
    app.$("source").value = "<p>from source</p>";
    app.call("setMode", "edit");
    expect(app.get("raw")).toBe("<p>from source</p>");
    expect(app.$("editor").innerHTML).toBe("<p>from source</p>");
  });

  it("back to view restores the viewer and the neutral button", () => {
    app.call("setMode", "edit");
    app.call("setMode", "view");
    expect(app.$("viewer").style.display).toBe("");
    expect(app.$("editor").style.display).toBe("none");
    expect(app.$("btnMode").textContent).toBe("Edit");
    expect(app.$("btnMode").className).toBe("btn");
    expect(app.$("status").textContent).toBe("");
    expect(app.$("btnSource").style.opacity).toBe("0.7");
    expect(app.$("page").style.display).toBe("");
  });

  it("clears code-block headers when not editing", () => {
    db().selected = "p3"; app.call("open", "p3");
    app.call("setMode", "edit");
    expect(app.$("blocks").children.length).toBe(1);
    app.call("setMode", "view");
    expect(app.$("blocks").children.length).toBe(0);
  });
});

describe("format()", () => {
  it("puts adjacent tags on separate lines", () => {
    expect(app.call("format", "<p>a</p><p>b</p><ul><li>c</li></ul>")).toBe("<p>a</p>\n<p>b</p>\n<ul>\n<li>c</li>\n</ul>");
  });
  it("leaves text alone", () => {
    expect(app.call("format", "plain > text")).toBe("plain > text");
  });
  it("unformat() undoes it, so opening the HTML view does not add whitespace to pre-wrap blocks", () => {
    const html = "<blockquote><p>a</p><p>b</p></blockquote><p><b>x</b><i>y</i></p>";
    expect(app.call("unformat", app.call("format", html))).toBe(html);
    app.set("raw", html);
    app.call("setMode", "source");
    click(app.$("btnMode"));                       // Done: commit + back to view
    expect(app.get("raw")).toBe(html);
    expect(app.call("find", "p1").node.content).toBe(html);
  });
});

describe("commit()", () => {
  it("saves the editor html into the page node and flags 'Saved'", () => {
    app.call("setMode", "edit");
    app.$("editor").innerHTML = "<p>edited</p>";
    app.call("commit");
    expect(app.call("find", "p1").node.content).toBe("<p>edited</p>");
    expect(app.$("status").textContent).toBe("Saved");
    expect(app.$("status").classList.contains("on")).toBe(true);
    app.flush();
    expect(app.stored().tree[0].children[0].content).toBe("<p>edited</p>");
  });

  it("saves the textarea in source mode", () => {
    app.call("setMode", "source");
    app.$("source").value = "<h2>src</h2>";
    app.call("commit");
    expect(app.call("find", "p1").node.content).toBe("<h2>src</h2>");
  });

  it("in view mode writes raw back unchanged", () => {
    app.set("raw", "<p>raw</p>");
    app.call("commit");
    expect(app.call("find", "p1").node.content).toBe("<p>raw</p>");
  });

  it("writes to the open page even when the highlighted row is a folder or another page", () => {
    app.call("setMode", "edit");
    app.$("editor").innerHTML = "<p>still alpha</p>";
    db().selected = "f1";
    app.call("commit");
    expect(app.call("find", "f1").node.content).toBeUndefined();
    expect(app.call("find", "p1").node.content).toBe("<p>still alpha</p>");
    db().selected = "p3";
    app.call("commit");
    expect(app.call("find", "p3").node.content).not.toContain("still alpha");
  });

  it("does nothing when no page is open", () => {
    app.set("openId", null);
    app.call("commit");
    expect(app.$("status").textContent).toBe("");
    db().selected = null;
    expect(() => app.call("commit")).not.toThrow();
  });
});

describe("mode buttons", () => {
  it("Edit button toggles edit, Done commits and returns to view", () => {
    click(app.$("btnMode"));
    expect(app.get("mode")).toBe("edit");
    app.$("editor").innerHTML = "<p>via button</p>";
    click(app.$("btnMode"));
    expect(app.get("mode")).toBe("view");
    expect(app.call("find", "p1").node.content).toBe("<p>via button</p>");
    expect(app.$("viewer").innerHTML).toBe("<p>via button</p>");
  });

  it("HTML button enters source mode from view or edit, and back to edit with a commit", () => {
    click(app.$("btnSource"));
    expect(app.get("mode")).toBe("source");
    app.$("source").value = "<p>s</p>";
    click(app.$("btnSource"));
    expect(app.get("mode")).toBe("edit");
    expect(app.call("find", "p1").node.content).toBe("<p>s</p>");
    click(app.$("btnSource"));
    expect(app.get("mode")).toBe("source");
  });

  it("Done from source mode commits the textarea", () => {
    click(app.$("btnSource"));
    app.$("source").value = "<p>done</p>";
    click(app.$("btnMode"));
    expect(app.get("mode")).toBe("view");
    expect(app.call("find", "p1").node.content).toBe("<p>done</p>");
  });
});

describe("title input", () => {
  it("renames the page live and re-renders the tree", () => {
    input(app.$("docTitle"), "  New Title ");
    expect(app.call("find", "p1").node.name).toBe("New Title");
    expect(app.labels()).toContain("New Title");
  });

  it("falls back to 'Untitled page' when cleared", () => {
    input(app.$("docTitle"), "");
    expect(app.call("find", "p1").node.name).toBe("Untitled page");
  });

  it("ignores input when nothing is selected", () => {
    db().selected = null;
    expect(() => input(app.$("docTitle"), "x")).not.toThrow();
  });

  it("persists the rename", () => {
    input(app.$("docTitle"), "Persisted");
    app.flush();
    expect(app.stored().tree[0].children[0].name).toBe("Persisted");
  });

  it("Enter in view mode starts editing", () => {
    const ev = key(app.$("docTitle"), "Enter");
    expect(ev.defaultPrevented).toBe(true);
    expect(app.get("mode")).toBe("edit");
  });

  it("Tab in edit mode moves the caret to the start of the body", () => {
    app.call("setMode", "edit");
    key(app.$("docTitle"), "Tab");
    const r = app.window.getSelection().getRangeAt(0);
    expect(r.collapsed).toBe(true);
    expect(app.$("editor").firstElementChild.contains(r.startContainer) || r.startContainer === app.$("editor").firstElementChild).toBe(true);
    expect(r.startOffset).toBe(0);
  });

  it("other keys are left alone", () => {
    const ev = key(app.$("docTitle"), "a");
    expect(ev.defaultPrevented).toBe(false);
    expect(app.get("mode")).toBe("view");
  });
});

describe("tail()", () => {
  const set = html => { app.call("setMode", "edit"); app.$("editor").innerHTML = html; app.call("tail"); return app.$("editor").innerHTML; };

  it("appends an empty paragraph after PRE, TABLE, UL, OL, HR and BLOCKQUOTE", () => {
    for (const tag of ["pre", "table", "ul", "ol", "blockquote"]) {
      expect(set(`<${tag}></${tag}>`)).toBe(`<${tag}></${tag}><p><br></p>`);
    }
    expect(set("<hr>")).toBe("<hr><p><br></p>");
  });
  it("appends when the editor is empty", () => {
    expect(set("")).toBe("<p><br></p>");
  });
  it("leaves paragraphs and headings alone", () => {
    expect(set("<p>a</p>")).toBe("<p>a</p>");
    expect(set("<h2>a</h2>")).toBe("<h2>a</h2>");
  });
});

describe("caretTo()", () => {
  it("collapses the selection to the end or start of an element", () => {
    const p = app.document.createElement("p"); p.textContent = "abc";
    app.document.body.appendChild(p);
    app.call("caretTo", p);
    let r = app.window.getSelection().getRangeAt(0);
    expect(r.collapsed).toBe(true); expect(r.startOffset).toBe(1);
    app.call("caretTo", p, false);
    r = app.window.getSelection().getRangeAt(0);
    expect(r.startOffset).toBe(0);
  });
});

describe("clicking blank space below the text", () => {
  it("in edit mode moves the caret to the end (and adds a tail paragraph)", () => {
    db().selected = "p3"; app.call("open", "p3");
    app.call("setMode", "edit");
    app.$("editor").innerHTML = "<pre class=\"code\">x</pre>";
    const ev = mousedown(app.$("scroll"));
    expect(ev.defaultPrevented).toBe(true);
    expect(app.$("editor").lastElementChild.tagName).toBe("P");
    const r = app.window.getSelection().getRangeAt(0);
    expect(app.$("editor").lastElementChild.contains(r.startContainer) || r.startContainer === app.$("editor").lastElementChild).toBe(true);
  });

  it("also works on the page wrapper", () => {
    app.call("setMode", "edit");
    const ev = mousedown(app.$("page"));
    expect(ev.defaultPrevented).toBe(true);
  });

  it("does nothing in view mode or when clicking inside the text", () => {
    expect(mousedown(app.$("scroll")).defaultPrevented).toBe(false);
    app.call("setMode", "edit");
    expect(mousedown(app.$("editor")).defaultPrevented).toBe(false);
  });
});

describe("autosave while typing", () => {
  it("commits 500ms after the last editor input", () => {
    app.call("setMode", "edit");
    app.$("editor").innerHTML = "<p>typing</p>";
    input(app.$("editor"));
    expect(app.call("find", "p1").node.content).toBe("<p>alpha text</p>");
    vi.advanceTimersByTime(499);
    expect(app.call("find", "p1").node.content).toBe("<p>alpha text</p>");
    vi.advanceTimersByTime(1);
    expect(app.call("find", "p1").node.content).toBe("<p>typing</p>");
    expect(app.$("status").textContent).toBe("Saved");
  });

  it("debounces successive keystrokes", () => {
    app.call("setMode", "edit");
    app.$("editor").innerHTML = "<p>1</p>"; input(app.$("editor"));
    vi.advanceTimersByTime(400);
    app.$("editor").innerHTML = "<p>12</p>"; input(app.$("editor"));
    vi.advanceTimersByTime(400);
    expect(app.call("find", "p1").node.content).toBe("<p>alpha text</p>");
    vi.advanceTimersByTime(100);
    expect(app.call("find", "p1").node.content).toBe("<p>12</p>");
  });

  it("commits source textarea input the same way", () => {
    app.call("setMode", "source");
    input(app.$("source"), "<p>src typing</p>");
    vi.advanceTimersByTime(500);
    expect(app.call("find", "p1").node.content).toBe("<p>src typing</p>");
  });
});
