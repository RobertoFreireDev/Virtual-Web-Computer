import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { loadApp } from "../helpers/app.js";

let app;
beforeAll(() => { app = loadApp(); });
afterAll(() => app.close());

const clean = html => app.call("clean", html);
const esc = s => app.call("esc", s);

describe("esc()", () => {
  it("escapes &, < and >", () => {
    expect(esc("<a href=\"x\">&</a>")).toBe("&lt;a href=\"x\"&gt;&amp;&lt;/a&gt;");
  });
  it("coerces non-strings", () => {
    expect(esc(42)).toBe("42");
    expect(esc(null)).toBe("null");
  });
  it("leaves quotes alone", () => {
    expect(esc("it's \"q\"")).toBe("it's \"q\"");
  });
});

describe("clean() — tags", () => {
  it("keeps the whitelisted formatting tags", () => {
    const html = "<h2>T</h2><p>a <strong>b</strong> <em>c</em> <u>d</u> <s>e</s> <code>f</code></p><ul><li>x</li></ul><ol><li>y</li></ol><blockquote>q</blockquote><hr>";
    expect(clean(html)).toBe(html);
  });

  it("keeps tables", () => {
    const html = "<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>";
    expect(clean(html)).toBe(html);
  });

  it("removes script/style-like elements together with their content", () => {
    expect(clean("<p>ok</p><script>alert(1)</script>")).toBe("<p>ok</p>");
    expect(clean("<p><iframe src='x'>inner</iframe></p>")).toBe("<p></p>");
    expect(clean("<style>p{}</style><p>t</p>")).toBe("<p>t</p>");
    expect(clean("<template><p>x</p></template>")).toBe("");
  });

  it("unwraps other unknown elements, keeping their (sanitised) content and structure", () => {
    expect(clean("<button>Click</button>")).toBe("Click");
    expect(clean("<section><p>a</p><p>b</p></section>")).toBe("<p>a</p><p>b</p>");
    expect(clean("<article><h2 onclick='x'>t</h2><mark>m</mark></article>")).toBe("<h2>t</h2>m");
  });

  it("unwraps Google Docs' font-weight:normal <b> wrapper instead of bolding everything", () => {
    expect(clean('<b style="font-weight:normal" id="docs-internal-guid-1"><p>a <b>real</b></p></b>')).toBe("<p>a <b>real</b></p>");
    expect(clean('<strong style="font-weight: 400">x</strong>')).toBe("x");
    expect(clean('<b style="color:red">x</b>')).toBe("<b>x</b>");
  });

  it("drops HTML comments (Chrome's StartFragment markers)", () => {
    expect(clean("<!--StartFragment--><p>a</p><!--EndFragment-->")).toBe("<p>a</p>");
    expect(clean("<p>a<!-- c -->b</p>")).toBe("<p>ab</p>");
  });

  it("keeps the OK_TAGS list intact", () => {
    const tags = [...app.get("OK_TAGS")];
    for (const t of ["P", "DIV", "SPAN", "BR", "HR", "H1", "H6", "UL", "OL", "LI", "STRONG", "B", "EM", "I", "U", "S", "STRIKE", "CODE", "PRE", "BLOCKQUOTE", "A", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "IMG", "SUB", "SUP", "FONT"]) {
      expect(tags).toContain(t);
    }
    expect(tags).not.toContain("SCRIPT");
    expect(tags).not.toContain("IFRAME");
    expect(tags).not.toContain("FORM");
  });

  it("walks nested content", () => {
    expect(clean("<div><p><span><script>x</script><kbd onclick='z'>k</kbd>y</span></p></div>")).toBe("<div><p><span>ky</span></p></div>");
  });

  it("handles empty input", () => {
    expect(clean("")).toBe("");
  });
});

describe("clean() — attributes", () => {
  it("strips event handlers, style, id and unknown attributes", () => {
    expect(clean('<p onclick="x()" style="color:red" id="a" data-x="1">t</p>')).toBe("<p>t</p>");
  });

  it("keeps href, title, alt, src, colspan, rowspan, data-lang", () => {
    expect(clean('<a href="https://x.y" title="T">l</a>')).toBe('<a href="https://x.y" title="T">l</a>');
    expect(clean('<table><tbody><tr><td colspan="2" rowspan="3">c</td></tr></tbody></table>')).toBe('<table><tbody><tr><td colspan="2" rowspan="3">c</td></tr></tbody></table>');
    expect(clean('<img src="https://a/b.png" alt="A">')).toBe('<img src="https://a/b.png" alt="A">');
  });

  it("removes javascript: hrefs (case/whitespace-insensitive)", () => {
    expect(clean('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(clean('<a href="  JavaScript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(clean('<a href="mailto:a@b.c">x</a>')).toBe('<a href="mailto:a@b.c">x</a>');
  });

  it("removes every href scheme other than http(s)/mailto, keeps relative and anchor links", () => {
    expect(clean('<a href="data:text/html,x">x</a>')).toBe("<a>x</a>");
    expect(clean('<a href="vbscript:x">x</a>')).toBe("<a>x</a>");
    expect(clean('<a href="java\tscript:x">x</a>')).toBe("<a>x</a>");
    expect(clean('<a href="#top">x</a>')).toBe('<a href="#top">x</a>');
    expect(clean('<a href="/docs/a.html">x</a>')).toBe('<a href="/docs/a.html">x</a>');
    expect(clean('<a href="page.html?a=b:c">x</a>')).toBe('<a href="page.html?a=b:c">x</a>');
  });

  it("normalises unknown data-lang values to plain", () => {
    expect(clean('<pre data-lang="nope">t</pre>')).toMatch(/^<pre (data-lang="plain" class="code"|class="code" data-lang="plain")>t<\/pre>$/);
    expect(clean('<pre data-lang="sql">t</pre>')).toContain('data-lang="sql"');
  });

  it("only allows http(s) and data:image sources on images", () => {
    expect(clean('<img src="http://a/b.png">')).toBe('<img src="http://a/b.png">');
    expect(clean('<img src="data:image/png;base64,AAAA">')).toBe('<img src="data:image/png;base64,AAAA">');
    expect(clean('<img src="data:text/html,evil">')).toBe("<img>");
    expect(clean('<img src="javascript:x">')).toBe("<img>");
    expect(clean('<img src="/relative.png">')).toBe("<img>");
  });

  it("removes class from everything but <pre>, which is forced to 'code'", () => {
    expect(clean('<p class="x">t</p>')).toBe("<p>t</p>");
    expect(clean('<pre class="whatever">t</pre>')).toBe('<pre class="code" data-lang="plain">t</pre>');
  });
});

describe("clean() — code blocks", () => {
  it("normalises <pre> to class=code with a default data-lang", () => {
    expect(clean("<pre>x</pre>")).toBe('<pre class="code" data-lang="plain">x</pre>');
  });

  it("preserves an existing data-lang", () => {
    expect(clean('<pre data-lang="sql">x</pre>')).toBe('<pre data-lang="sql" class="code">x</pre>');
  });

  it("keeps escaped entities inside code", () => {
    const html = '<pre class="code" data-lang="html">&lt;div&gt;</pre>';
    expect(clean(html)).toBe(html);
  });
});
