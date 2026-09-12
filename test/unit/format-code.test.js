import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadApp } from "../helpers/app.js";

/* LANGS[lang].fmt — the pretty-printers behind the Format button in the code block header */
let app, LANGS;
beforeEach(() => { app = loadApp(); LANGS = app.get("LANGS"); });
afterEach(() => app.close());

const fmt = (lang, code) => LANGS[lang].fmt(code);

describe("every language has a formatter", () => {
  it("exposes fmt() on each LANGS entry", () => {
    for(const [k, v] of Object.entries(LANGS)) expect(typeof v.fmt, k).toBe("function");
  });
  it("is idempotent", () => {
    const samples = {
      javascript: "function f(a){if(a){return 1}else{g()}}",
      csharp: "class A { void M(){ for(var i=0;i<3;i++){ X(i); } } }",
      css: "a{color:red;b:c}d{e:f}",
      json: '{"a":[1,{"b":null}]}',
      sql: "select a from b where c=1 and d in (select e from f) order by a",
      html: "<div><p>Hi <b>x</b></p><ul><li>1</li></ul></div>",
      python: "def f():\n\tif x:\n\t\treturn 1\nprint(f())",
      bash: "if x; then\necho a\nfi",
      plain: "a  \n\tb\n\n\n\nc"
    };
    for(const [lang, code] of Object.entries(samples)){
      const once = fmt(lang, code);
      expect(fmt(lang, once), lang).toBe(once);
    }
  });
});

describe("C-like (javascript / csharp / css)", () => {
  it("breaks after { and ; and before }, indenting by the open braces", () => {
    expect(fmt("javascript", "function f(a){if(a){return 1;}else{g();}}")).toBe(
      "function f(a){\n  if(a){\n    return 1;\n  } else{\n    g();\n  }\n}");
  });
  it("uses four spaces for C#", () => {
    expect(fmt("csharp", "class A{void M(){X();}}")).toBe("class A{\n    void M(){\n        X();\n    }\n}");
  });
  it("keeps } catch / } finally / } while on one line", () => {
    expect(fmt("javascript", "try{a()}catch(e){b()}finally{c()}")).toBe(
      "try{\n  a()\n} catch(e){\n  b()\n} finally{\n  c()\n}");
  });
  it("leaves ; and { inside parentheses and brackets alone", () => {
    expect(fmt("javascript", "for(let i=0;i<3;i++){g(i);}")).toBe("for(let i=0;i<3;i++){\n  g(i);\n}");
    expect(fmt("javascript", "run({a:1;b:2}, [{c:3}]);")).toBe("run({a:1;b:2}, [{c:3}]);");
  });
  it("does not break inside strings, template literals or comments", () => {
    expect(fmt("javascript", 'x = "a;{b}"; // c; {\ny = `1;\n2`;')).toBe('x = "a;{b}";\n// c; {\ny = `1;\n2`;');
    expect(fmt("javascript", "/* a; {\n b */ z();")).toBe("/* a; {\n b */ z();");
    expect(fmt("csharp", 'var s = "http://x";')).toBe('var s = "http://x";');
  });
  it("re-indents already broken code and collapses runs of blank lines", () => {
    expect(fmt("javascript", "if(a){\n\n\n\n      b();\n  }\n\n")).toBe("if(a){\n\n  b();\n}");
  });
  it("closing ) and ] dedent their line", () => {
    expect(fmt("javascript", "f(\na,\nb\n);")).toBe("f(\n  a,\n  b\n);");
  });
  it("a } followed by ; , ) or . stays on its line", () => {
    expect(fmt("javascript", "const o = {a:1};\nx = y.map(v => {return v}).z;")).toBe(
      "const o = {\n  a:1\n};\nx = y.map(v => {return v}).z;");
  });
  it("CSS has no // comments and gets one declaration per line", () => {
    expect(fmt("css", "a{color:red;background:url(//x)}@media (x){b{c:d}}")).toBe(
      "a{\n  color:red;\n  background:url(//x)\n}\n@media (x){\n  b{\n    c:d\n  }\n}");
  });
  it("normalises CRLF", () => {
    expect(fmt("javascript", "a();\r\nb();")).toBe("a();\nb();");
  });
});

describe("JSON", () => {
  it("re-serialises with two-space indentation", () => {
    expect(fmt("json", '{"a":[1,2],"b":{"c":null}}')).toBe('{\n  "a": [\n    1,\n    2\n  ],\n  "b": {\n    "c": null\n  }\n}');
  });
  it("throws a readable error on invalid input", () => {
    expect(() => fmt("json", "{a:1}")).toThrow("not valid JSON");
  });
});

describe("SQL", () => {
  it("upper-cases keywords and functions, one clause per line", () => {
    expect(fmt("sql", "select p.name, count(s.id) as runs from players p left join scores s on s.pid=p.id where p.x=1 and p.y=2 or p.z='a' group by p.name order by runs desc")).toBe(
      "SELECT p.name, COUNT(s.id) AS runs\nFROM players p\nLEFT JOIN scores s ON s.pid=p.id\nWHERE p.x=1\n  AND p.y=2\n  OR p.z='a'\nGROUP BY p.name\nORDER BY runs DESC");
  });
  it("keeps BETWEEN x AND y together", () => {
    expect(fmt("sql", "select a from t where b between 1 and 9 and c=2")).toBe("SELECT a\nFROM t\nWHERE b BETWEEN 1 AND 9\n  AND c=2");
  });
  it("indents sub-queries under the line that opens them", () => {
    expect(fmt("sql", "select a from t where b in (select id from u where v=1) and c=2")).toBe(
      "SELECT a\nFROM t\nWHERE b IN (\n  SELECT id\n  FROM u\n  WHERE v=1\n)\n  AND c=2");
    expect(fmt("sql", "select a from t where x=1 and b in (select id from u) and c=2")).toBe(
      "SELECT a\nFROM t\nWHERE x=1\n  AND b IN (\n    SELECT id\n    FROM u\n  )\n  AND c=2");
  });
  it("keeps plain parentheses (function calls, IN lists) inline", () => {
    expect(fmt("sql", "select count(*), coalesce(a, 0) from t where b in (1, 2)")).toBe(
      "SELECT COUNT(*), COALESCE(a, 0)\nFROM t\nWHERE b IN (1, 2)");
  });
  it("leaves strings, quoted identifiers and comments untouched", () => {
    expect(fmt("sql", "select 'from x' as \"select\", [order] from t -- select from\nwhere a=1")).toBe(
      "SELECT 'from x' AS \"select\", [order]\nFROM t -- select from\nWHERE a=1");
  });
  it("separates statements with a blank line", () => {
    expect(fmt("sql", "update t set a=1 where b=2; delete from t where c=3;")).toBe(
      "UPDATE t\nSET a=1\nWHERE b=2;\n\nDELETE FROM t\nWHERE c=3;");
  });
});

describe("HTML", () => {
  it("puts block tags on their own lines and indents children", () => {
    expect(fmt("html", '<div class="a"><ul><li>1</li><li>2</li></ul><br><img src=x></div>')).toBe(
      '<div class="a">\n  <ul>\n    <li>\n      1\n    </li>\n    <li>\n      2\n    </li>\n  </ul>\n  <br>\n  <img src=x>\n</div>');
  });
  it("keeps inline tags and text on one line, collapsing whitespace", () => {
    expect(fmt("html", "<p>Hi   <b>there</b>,\n  <a href=x>link</a></p>")).toBe("<p>\n  Hi <b>there</b>, <a href=x>link</a>\n</p>");
  });
  it("copies script, style, pre and textarea contents verbatim", () => {
    expect(fmt("html", "<div><script>if(a<b){\n  x()}</script><pre>  a\n b</pre></div>")).toBe(
      "<div>\n  <script>if(a<b){\n  x()}</script>\n  <pre>  a\n b</pre>\n</div>");
  });
  it("handles comments, doctype and self-closing tags", () => {
    expect(fmt("html", "<!doctype html><!-- hi --><div><input/><p>x</p></div>")).toBe(
      "<!doctype html>\n<!-- hi -->\n<div>\n  <input/>\n  <p>\n    x\n  </p>\n</div>");
  });
});

describe("Python", () => {
  it("normalises every indent level to four spaces", () => {
    expect(fmt("python", "def f(x):\n\tif x:\n\t\treturn 1\n  else:\n      return 2\nprint(f(1))")).toBe(
      "def f(x):\n    if x:\n        return 1\n    else:\n        return 2\nprint(f(1))");
  });
  it("keeps at most one blank line and drops trailing whitespace", () => {
    expect(fmt("python", "a = 1   \n\n\n\nb = 2\n\n")).toBe("a = 1\n\nb = 2");
  });
});

describe("Shell", () => {
  it("indents then/do/else/{ blocks and closes them on fi/done/}", () => {
    expect(fmt("bash", "if [ -f x ]; then\necho hi # then\nfor i in a b; do\necho $i\ndone\nelse\nf() {\nbar\n}\nfi\ncase $x in\na) echo;;\nesac")).toBe(
      "if [ -f x ]; then\n  echo hi # then\n  for i in a b; do\n    echo $i\n  done\nelse\n  f() {\n    bar\n  }\nfi\ncase $x in\n  a) echo;;\nesac");
  });
  it("elif sits at the level of its if", () => {
    expect(fmt("bash", "if a; then\nb\nelif c; then\nd\nfi")).toBe("if a; then\n  b\nelif c; then\n  d\nfi");
  });
});

describe("Plain text", () => {
  it("expands tabs, strips trailing whitespace and extra blank lines", () => {
    expect(fmt("plain", "a  \n\tb\n\n\n\nc\n\n")).toBe("a\n    b\n\nc");
  });
});
