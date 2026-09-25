/*
 * Paste ▾ → "From markdown": reads the clipboard as Markdown (GitHub
 * Flavored Markdown, and what Claude Code writes) and inserts it as rich
 * text — headings, nested lists, fenced code, pipe tables, the ASCII tables
 * SQL clients / Claude Code print, quotes, links, inline formatting.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadApp, sampleTree, tick } from "../helpers/app.js";
import { click, caret } from "../helpers/dom.js";

let app;
beforeEach(() => { app = loadApp({ stored: { tree: sampleTree(), selected: "p1" } }); });
afterEach(() => app.close());

const content = () => app.call("find", "p1").node.content;
const settle = async () => { for (let i = 0; i < 4; i++) await tick(); };
const ed = () => app.$("editor");

async function fromMd(text) {
  if (app.get("mode") !== "edit") app.call("setMode", "edit");
  app.clipboard.text = text;
  click(app.$("tbPaste"));
  click(app.qa("#menu button").find(b => b.textContent === "From markdown"));
  await settle();
}
/* converts without the UI and parses the result into a detached element */
function md(text) {
  const div = app.document.createElement("div");
  div.innerHTML = app.call("mdToHtml", text);
  return div;
}
const texts = (root, sel) => [...root.querySelectorAll(sel)].map(e => e.textContent);

describe("Paste menu", () => {
  it("offers 'From markdown' after 'From table'", () => {
    app.call("setMode", "edit");
    click(app.$("tbPaste"));
    expect(app.qa("#menu button").map(b => b.textContent)).toEqual(["From table", "From markdown"]);
  });
});

describe("From markdown (through the toolbar)", () => {
  it("inserts the converted markdown, keeps existing text and saves", async () => {
    await fromMd("# Title\n\nSome **bold** text.\n");
    expect(ed().querySelector("h1").textContent).toBe("Title");
    expect(ed().querySelector("strong").textContent).toBe("bold");
    expect(texts(ed(), "p")).toContain("alpha text");
    expect(content()).toContain("<h1>Title</h1>");
    expect(app.$("status").textContent).toBe("Saved");
    app.flush();
    expect(JSON.stringify(app.stored())).toContain("<h1>Title</h1>");
  });

  it("inserts at the caret", async () => {
    app.call("setMode", "edit");
    caret(ed().querySelector("p").firstChild, 5);
    await fromMd("## Here");
    expect(ed().querySelector("h2").textContent).toBe("Here");
    expect(app.get("mode")).toBe("edit");
  });

  it("markup inside markdown is shown as text, never run", async () => {
    await fromMd("<img src=x onerror=alert(1)> and <script>alert(1)</script>");
    expect(ed().querySelector("img")).toBeNull();
    expect(ed().querySelector("script")).toBeNull();
    expect(ed().textContent).toContain("<script>alert(1)</script>");
  });

  it("toasts on an empty clipboard or blocked access", async () => {
    await fromMd("   \n");
    expect(app.toastText()).toBe("Nothing to paste on the clipboard");
    expect(content()).toBe("<p>alpha text</p>");

    app.clipboard.mode = "blocked";
    await fromMd("# x");
    expect(app.toastText()).toBe("Clipboard access denied — paste with Ctrl+V instead");
  });

  it("the result survives the source view round trip and renders code blocks", async () => {
    await fromMd("# T\n\n```sql\nSELECT 1;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n");
    app.call("setMode", "source");
    app.call("setMode", "view");
    const v = app.$("viewer");
    expect(v.querySelector("h1").textContent).toBe("T");
    expect(v.querySelector("pre").dataset.lang).toBe("sql");
    expect(v.querySelectorAll("td").length).toBe(2);
  });

  it("a code block pasted at the very top keeps an empty line above it", async () => {
    app.call("setMode", "edit");
    ed().innerHTML = "";
    caret(ed(), 0);
    await fromMd("```js\nlet a = 1;\n```");
    const pre = ed().querySelector("pre");
    expect(pre.previousElementSibling).not.toBeNull();
    expect(pre.nextElementSibling).not.toBeNull();
  });
});

describe("mdToHtml — blocks", () => {
  it("ATX headings # … ###### (closing #s dropped) and setext headings", () => {
    const d = md("# One\n## Two ##\n###### Six\n\nSet\n===\n\nSub\n---\n#nospace");
    expect(texts(d, "h1")).toEqual(["One", "Set"]);
    expect(texts(d, "h2")).toEqual(["Two", "Sub"]);
    expect(texts(d, "h6")).toEqual(["Six"]);
    expect(texts(d, "p")).toEqual(["#nospace"]);
  });

  it("paragraphs: lines join with a space, blank line splits, two spaces / backslash = <br>", () => {
    const d = md("one\ntwo\n\nthree  \nfour\\\nfive");
    const ps = d.querySelectorAll("p");
    expect(ps.length).toBe(2);
    expect(ps[0].textContent).toBe("one two");
    expect(ps[1].querySelectorAll("br").length).toBe(2);
    expect(ps[1].textContent).toBe("threefourfive");
  });

  it("horizontal rules", () => {
    const d = md("a\n\n---\n\n***\n\n___\n\nb");
    expect(d.querySelectorAll("hr").length).toBe(3);
  });

  it("nested bullet lists (2-space and 4-space indents, -, * and +)", () => {
    const d = md("- a\n  - a1\n    - a11\n  - a2\n- b\n    * b1\n+ c");
    const top = d.querySelector("ul");
    expect([...top.children].map(li => li.firstChild.textContent)).toEqual(["a", "b", "c"]);
    const a = top.children[0];
    expect(texts(a.querySelector(":scope > ul"), ":scope > li > ul > li")).toEqual(["a11"]);
    expect([...a.querySelector(":scope > ul").children].map(li => li.firstChild.textContent)).toEqual(["a1", "a2"]);
    expect(top.children[1].querySelector("ul li").textContent).toBe("b1");
    expect(d.querySelectorAll("ul").length).toBe(4);
  });

  it("ordered lists, mixed with bullets when nested", () => {
    const d = md("1. first\n2. second\n   - x\n   - y\n3) third");
    const ol = d.querySelector("ol");
    expect(ol.children.length).toBe(3);
    expect(texts(ol, ":scope > li > ul > li")).toEqual(["x", "y"]);
  });

  it("list items keep formatting, continuation lines and loose blank lines", () => {
    const d = md("- **bold** item\n  continued\n\n- second\n\n  second para");
    const lis = d.querySelectorAll("ul > li");
    expect(lis.length).toBe(2);
    expect(lis[0].querySelector("strong").textContent).toBe("bold");
    expect(lis[0].textContent).toBe("bold item continued");
    expect(lis[1].textContent).toContain("second para");
  });

  it("task lists become check boxes as text", () => {
    const d = md("- [ ] todo\n- [x] done");
    expect(texts(d, "li")).toEqual(["☐ todo", "☑ done"]);
  });

  it("a paragraph ends where a list, heading or fence starts", () => {
    const d = md("Intro:\n- a\n- b\nText\n# H");
    expect(d.firstElementChild.tagName).toBe("P");
    expect(d.querySelectorAll("li").length).toBe(2);
    expect(d.querySelector("h1").textContent).toBe("H");
  });

  it("fenced code (``` and ~~~) keeps text verbatim and maps the language", () => {
    const d = md("```ts\nconst a = `x` < 2 && **b**;\n\n  indented\n```\n~~~python\nx = 1\n~~~\n```\nplain\n```\n```cs\nvar x;\n```\n```sh\nls\n```\n```brainfuck\n+\n```");
    const pres = [...d.querySelectorAll("pre")];
    expect(pres.map(p => p.dataset.lang)).toEqual(["javascript", "python", "plain", "csharp", "bash", "plain"]);
    expect(pres[0].textContent).toBe("const a = `x` < 2 && **b**;\n\n  indented\n");
    expect(pres.every(p => p.className === "code")).toBe(true);
    expect(d.querySelector("strong")).toBeNull();
  });

  it("an unclosed fence runs to the end", () => {
    expect(md("```\na\nb").querySelector("pre").textContent).toBe("a\nb\n");
  });

  it("fenced code nested in a list item", () => {
    const d = md("1. Run:\n   ```bash\n   npm test\n   ```\n2. Done");
    const li = d.querySelectorAll("ol > li");
    expect(li.length).toBe(2);
    expect(li[0].querySelector("pre").textContent).toBe("npm test\n");
  });

  it("indented code block (4 spaces after a blank line)", () => {
    const d = md("para\n\n    code line\n      more\n\nafter");
    expect(d.querySelector("pre").textContent).toBe("code line\n  more\n");
  });

  it("blockquotes, nested, with markdown inside; GitHub alerts get a label", () => {
    const d = md("> quoted **b**\n> - item\n>> deeper\n\n> [!NOTE]\n> Heads up");
    const qs = d.querySelectorAll(":scope > blockquote");
    expect(qs.length).toBe(2);
    expect(qs[0].querySelector("strong").textContent).toBe("b");
    expect(qs[0].querySelector("li").textContent).toBe("item");
    expect(qs[0].querySelector("blockquote").textContent).toBe("deeper");
    expect(qs[1].querySelector("strong").textContent).toBe("Note");
    expect(qs[1].textContent).toContain("Heads up");
  });

  it("GFM pipe tables (with or without outer pipes, alignment row, escaped pipes, inline markup)", () => {
    const d = md("| Name | Qty |\n|:-----|----:|\n| **A** | 1 |\n| a\\|b | `c|d` |\n\nx | y\n--|--\n1 | 2");
    const [t1, t2] = d.querySelectorAll("table");
    expect(texts(t1, "thead th")).toEqual(["Name", "Qty"]);
    expect(texts(t1, "tbody td")).toEqual(["A", "1", "a|b", "c|d"]);
    expect(t1.querySelector("td strong")).not.toBeNull();
    expect(texts(t2, "th")).toEqual(["x", "y"]);
    expect(texts(t2, "td")).toEqual(["1", "2"]);
  });

  it("table rows are padded to the header width", () => {
    const d = md("| a | b | c |\n|---|---|---|\n| 1 |");
    expect(d.querySelectorAll("tbody td").length).toBe(3);
  });

  it("MySQL / SQL Server style ASCII tables", () => {
    const d = md("+----+-------+\n| id | name  |\n+----+-------+\n|  1 | Alice |\n|  2 | Bob   |\n+----+-------+\n2 rows in set");
    const t = d.querySelector("table");
    expect(texts(t, "th")).toEqual(["id", "name"]);
    expect(texts(t, "td")).toEqual(["1", "Alice", "2", "Bob"]);
    expect(d.querySelector("p").textContent).toBe("2 rows in set");
  });

  it("psql style tables (no outer pipes, +- separator)", () => {
    const d = md(" id | name\n----+-------\n  1 | Alice\n(1 row)");
    expect(texts(d, "th")).toEqual(["id", "name"]);
    expect(texts(d, "td")).toEqual(["1", "Alice"]);
  });

  it("box-drawing tables (as Claude Code prints them)", () => {
    const d = md("┌──────┬───────┐\n│ Col  │ Value │\n├──────┼───────┤\n│ a    │ 1     │\n├──────┼───────┤\n│ b    │ 2     │\n└──────┴───────┘");
    const t = d.querySelector("table");
    expect(texts(t, "th")).toEqual(["Col", "Value"]);
    expect(texts(t, "td")).toEqual(["a", "1", "b", "2"]);
    expect(d.children.length).toBe(1);
  });

  it("Windows line endings", () => {
    const d = md("# H\r\n\r\n- a\r\n  - b\r\n");
    expect(d.querySelector("h1").textContent).toBe("H");
    expect(d.querySelector("li li").textContent).toBe("b");
  });
});

describe("mdToHtml — inline", () => {
  it("bold, italic, bold-italic, strike, inline code", () => {
    const d = md("**b** __b2__ *i* _i2_ ***bi*** ~~s~~ `c **not bold**`");
    expect(texts(d, "strong")).toEqual(["b", "b2", "bi"]);
    expect(texts(d, "em")).toEqual(["i", "i2", "bi"]);
    expect(texts(d, "s")).toEqual(["s"]);
    expect(texts(d, "code")).toEqual(["c **not bold**"]);
  });

  it("snake_case words and lone asterisks are not emphasis", () => {
    const d = md("my_var_name and 2 * 3 * 4");
    expect(d.querySelector("em")).toBeNull();
    expect(d.textContent).toBe("my_var_name and 2 * 3 * 4");
  });

  it("links, autolinks and bare URLs; unsafe schemes lose their href", () => {
    const d = md("[site](https://ex.com \"T\") <https://a.io> see https://b.io/x. [bad](javascript:alert(1)) [**b**](http://c.io)");
    const as = [...d.querySelectorAll("a")];
    expect(as.map(a => a.getAttribute("href"))).toEqual(["https://ex.com", "https://a.io", "https://b.io/x", null, "http://c.io"]);
    expect(as[0].textContent).toBe("site");
    expect(as[0].getAttribute("title")).toBe("T");
    expect(as[4].querySelector("strong")).not.toBeNull();
  });

  it("images keep http(s) sources only", () => {
    const d = md("![logo](https://x.io/a.png) ![bad](javascript:x)");
    const imgs = d.querySelectorAll("img");
    expect(imgs[0].getAttribute("src")).toBe("https://x.io/a.png");
    expect(imgs[0].getAttribute("alt")).toBe("logo");
    expect(imgs[1].getAttribute("src")).toBeNull();
  });

  it("backslash escapes and HTML-special characters", () => {
    const d = md("\\*not em\\* a < b & c > d \\# x");
    expect(d.querySelector("em")).toBeNull();
    expect(d.textContent).toBe("*not em* a < b & c > d # x");
  });

  it("the output is already clean (stable through clean())", () => {
    const html = app.call("mdToHtml", "# a\n\n- b\n\n```sql\nx\n```\n\n| a |\n|---|\n| 1 |");
    expect(app.call("clean", html)).toBe(html);
  });
});
