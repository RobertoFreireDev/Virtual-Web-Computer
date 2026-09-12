import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadApp, sampleTree, tick } from "../helpers/app.js";
import { click, change, rect } from "../helpers/dom.js";

/* The floating language/delete header that sits over every <pre> while editing */
let app, editor, layer;
beforeEach(() => {
  app = loadApp({ stored: { tree: sampleTree(), selected: "p3" } });
  editor = app.$("editor"); layer = app.$("blocks");
});
afterEach(() => app.close());

const heads = () => [...layer.children];

describe("makeHead()", () => {
  it("builds a header with every language option and a delete button", () => {
    const h = app.call("makeHead");
    expect(h.className).toBe("blk");
    const opts = [...h.querySelectorAll("option")].map(o => [o.value, o.textContent]);
    expect(opts).toEqual(Object.entries(app.get("LANGS")).map(([k, v]) => [k, v.label]));
    expect(h.querySelector("select").title).toBe("Code language");
    expect(h.querySelector(".fmt").textContent).toBe("Format");
    expect(h.querySelector(".x").title).toBe("Delete this code block");
    expect(h.querySelector(".x svg")).not.toBeNull();
  });

  it("ignores events before it is bound to a block", async () => {
    const h = app.call("makeHead");
    expect(() => change(h.querySelector("select"))).not.toThrow();
    expect(() => click(h.querySelector(".fmt"))).not.toThrow();
    await h.querySelector(".x").onclick();
    expect(app.dialogOpen()).toBe(false);
  });
});

describe("format button", () => {
  const pre = () => editor.querySelector("pre.code");
  const setCode = (lang, html) => { pre().dataset.lang = lang; pre().innerHTML = html; app.call("syncBlocks"); };

  it("rewrites the block with the language's formatter, saves and puts the caret in the block", () => {
    app.call("setMode", "edit");
    setCode("json", '{"a":[1,2]}');
    click(heads()[0].querySelector(".fmt"));
    expect(pre().textContent).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}\n');
    expect(app.call("find", "p3").node.content).toContain('"a": [');
    expect(app.$("status").textContent).toBe("Saved");
    expect(pre().contains(app.window.getSelection().anchorNode)).toBe(true);
  });

  it("uses the block's current language", () => {
    app.call("setMode", "edit");
    setCode("sql", "select a from b");
    click(heads()[0].querySelector(".fmt"));
    expect(pre().textContent).toBe("SELECT a\nFROM b\n");
  });

  it("treats <br> in pasted code as line breaks", () => {
    app.call("setMode", "edit");
    setCode("python", "def f():<br>\treturn 1");
    click(heads()[0].querySelector(".fmt"));
    expect(pre().textContent).toBe("def f():\n    return 1\n");
    expect(pre().querySelector("br")).toBeNull();
  });

  it("toasts instead of changing anything when the code cannot be formatted", () => {
    app.call("setMode", "edit");
    setCode("json", "{oops");
    click(heads()[0].querySelector(".fmt"));
    expect(pre().textContent).toBe("{oops");
    expect(app.$("toast").textContent).toBe("Can't format: not valid JSON");
    expect(app.$("status").textContent).not.toBe("Saved");
  });

  it("says so when the code is already formatted", () => {
    app.call("setMode", "edit");
    setCode("plain", "a\nb\n");
    click(heads()[0].querySelector(".fmt"));
    expect(app.$("toast").textContent).toBe("Already formatted");
    expect(pre().textContent).toBe("a\nb\n");
  });

  it("does not steal focus from the editor on mousedown", () => {
    app.call("setMode", "edit");
    const ev = new app.window.MouseEvent("mousedown", { bubbles: true, cancelable: true });
    heads()[0].querySelector(".fmt").dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});

describe("syncBlocks()", () => {
  it("creates one header per code block in edit mode and none otherwise", () => {
    expect(heads()).toHaveLength(0);
    app.call("setMode", "edit");
    expect(heads()).toHaveLength(1);
    expect(heads()[0]._pre).toBe(editor.querySelector("pre.code"));
    app.call("setMode", "view");
    expect(heads()).toHaveLength(0);
  });

  it("positions headers over their block relative to the page", () => {
    app.call("setMode", "edit");
    rect(app.$("page"), { top: 100, left: 50 });
    rect(editor.querySelector("pre.code"), { top: 300, left: 90, width: 500 });
    app.call("syncBlocks");
    const h = heads()[0];
    expect(h.style.left).toBe("42px");    // 90 - 50 + 2
    expect(h.style.top).toBe("201px");    // 300 - 100 + 1
    expect(h.style.width).toBe("497px");  // 500 - 3
  });

  it("reflects the block language in the select and repairs unknown languages", () => {
    app.call("setMode", "edit");
    expect(heads()[0].querySelector("select").value).toBe("javascript");
    editor.querySelector("pre.code").dataset.lang = "brainfuck";
    app.call("syncBlocks");
    expect(editor.querySelector("pre.code").dataset.lang).toBe("plain");
    expect(heads()[0].querySelector("select").value).toBe("plain");
  });

  it("does not overwrite the select while the user is choosing", () => {
    app.call("setMode", "edit");
    const sel = heads()[0].querySelector("select");
    sel.focus();
    sel.value = "sql";
    app.call("syncBlocks");
    expect(sel.value).toBe("sql");
  });

  it("adds and removes headers as blocks come and go", () => {
    app.call("setMode", "edit");
    editor.insertAdjacentHTML("beforeend", '<pre class="code" data-lang="css">a{}</pre><pre class="code" data-lang="sql">x</pre>');
    app.call("syncBlocks");
    expect(heads()).toHaveLength(3);
    expect(heads().map(h => h._pre.dataset.lang)).toEqual(["javascript", "css", "sql"]);
    editor.querySelectorAll("pre.code").forEach(p => p.remove());
    app.call("syncBlocks");
    expect(heads()).toHaveLength(0);
  });

  it("is scheduled automatically when the editor changes (MutationObserver + rAF)", async () => {
    app.call("setMode", "edit");
    editor.insertAdjacentHTML("beforeend", '<pre class="code" data-lang="css">a{}</pre>');
    await tick();               // observer callback
    expect(heads()).toHaveLength(1);
    app.flush();                // rAF
    expect(heads()).toHaveLength(2);
  });

  it("scheduleSync coalesces several requests into one frame", () => {
    app.call("setMode", "edit");
    app.call("scheduleSync"); app.call("scheduleSync"); app.call("scheduleSync");
    expect(app.get("syncQueued")).toBe(true);
    app.flush();
    expect(app.get("syncQueued")).toBe(false);
  });

  it("re-syncs on window resize", () => {
    app.call("setMode", "edit");
    app.window.dispatchEvent(new app.window.Event("resize"));
    expect(app.get("syncQueued")).toBe(true);
  });
});

describe("language select", () => {
  it("changes the block's data-lang and saves", () => {
    app.call("setMode", "edit");
    const sel = heads()[0].querySelector("select");
    sel.value = "python";
    change(sel);
    expect(editor.querySelector("pre.code").dataset.lang).toBe("python");
    expect(app.call("find", "p3").node.content).toContain('data-lang="python"');
    expect(app.$("status").textContent).toBe("Saved");
  });

  it("the new language is used for highlighting in view mode", () => {
    app.call("setMode", "edit");
    const sel = heads()[0].querySelector("select");
    sel.value = "plain"; change(sel);
    app.call("setMode", "view");
    expect(app.q("#viewer .code-bar span").textContent).toBe("Plain text");
    expect(app.q("#viewer pre.code .t-keyword")).toBeNull();
  });
});

describe("delete block button", () => {
  it("asks for confirmation and removes the block on Delete", async () => {
    app.call("setMode", "edit");
    click(heads()[0].querySelector(".x"));
    await tick();
    expect(app.dialogOpen()).toBe(true);
    expect(app.q("#dialog h3").textContent).toBe("Delete code block?");
    expect(app.q("#dialog p").textContent).toBe("The code inside it will be removed from this page.");
    click(app.q('#dialog [data-a="1"]'));
    await tick();
    expect(editor.querySelector("pre.code")).toBeNull();
    expect(heads()).toHaveLength(0);
    expect(app.call("find", "p3").node.content).not.toContain("<pre");
  });

  it("keeps the block when cancelled", async () => {
    app.call("setMode", "edit");
    click(heads()[0].querySelector(".x"));
    await tick();
    click(app.q('#dialog [data-a="0"]'));
    await tick();
    expect(editor.querySelector("pre.code")).not.toBeNull();
    expect(heads()).toHaveLength(1);
  });
});
