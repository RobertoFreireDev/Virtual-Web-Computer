import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { loadApp } from "../helpers/app.js";

let app;
beforeAll(() => { app = loadApp(); });
afterAll(() => app.close());

const hl = (code, lang) => app.call("highlight", code, lang);
const span = (kind, text) => `<span class="t-${kind}">${text}</span>`;

describe("LANGS", () => {
  it("lists every supported language with a label", () => {
    const langs = app.get("LANGS");
    expect(Object.keys(langs)).toEqual(["plain", "csharp", "sql", "javascript", "json", "html", "css", "python", "bash"]);
    for (const k of Object.keys(langs)) expect(typeof langs[k].label).toBe("string");
    expect(langs.plain.re).toBeUndefined();
    expect(langs.csharp.label).toBe("C#");
    expect(langs.bash.label).toBe("Shell");
  });

  it("uses global regexes so replace() covers the whole block", () => {
    const langs = app.get("LANGS");
    for (const k of Object.keys(langs)) if (langs[k].re) expect(langs[k].re.global).toBe(true);
  });
});

describe("highlight()", () => {
  it("escapes HTML for plain text and unknown languages", () => {
    expect(hl("<b>&</b>", "plain")).toBe("&lt;b&gt;&amp;&lt;/b&gt;");
    expect(hl("<b>", "nope")).toBe("&lt;b&gt;");
    expect(hl("<b>", undefined)).toBe("&lt;b&gt;");
  });

  it("resets lastIndex so repeated calls start from the beginning", () => {
    const first = hl("// a", "javascript");
    const second = hl("// a", "javascript");
    expect(second).toBe(first);
  });

  it("does not leave raw < or > in the output", () => {
    const out = hl("if (a < b && c > d) { return '<x>'; }", "javascript");
    expect(out.replace(/<\/?span[^>]*>/g, "")).not.toMatch(/[<>]/);
  });

  describe("JavaScript", () => {
    it("classifies comments, strings, numbers, keywords, types and functions", () => {
      expect(hl("// hi", "javascript")).toBe(span("comment", "// hi"));
      expect(hl("/* a\nb */", "javascript")).toBe(span("comment", "/* a\nb */"));
      expect(hl('"s"', "javascript")).toBe(span("string", "\"s\""));
      expect(hl("'s'", "javascript")).toBe(span("string", "'s'"));
      expect(hl("`t`", "javascript")).toBe(span("string", "`t`"));
      expect(hl("42", "javascript")).toBe(span("number", "42"));
      expect(hl("3.14", "javascript")).toBe(span("number", "3.14"));
      expect(hl("const", "javascript")).toBe(span("keyword", "const"));
      expect(hl("Map", "javascript")).toBe(span("type", "Map"));
      expect(hl("foo(", "javascript")).toBe(span("fn", "foo") + "(");
    });

    it("keeps comments whole even when they contain keywords", () => {
      expect(hl("// const x", "javascript")).toBe(span("comment", "// const x"));
    });

    it("keeps strings whole even when they contain keywords", () => {
      expect(hl('"return"', "javascript")).toBe(span("string", "\"return\""));
    });

    it("does not treat identifiers containing keywords as keywords", () => {
      expect(hl("constant", "javascript")).toBe("constant");
    });
  });

  describe("C#", () => {
    it("handles verbatim strings, suffixed numbers and PascalCase types", () => {
      expect(hl('@"x"', "csharp")).toBe(span("string", "@\"x\""));
      expect(hl("1.5f", "csharp")).toBe(span("number", "1.5f"));
      expect(hl("Dictionary", "csharp")).toBe(span("type", "Dictionary"));
      expect(hl("public sealed class", "csharp")).toBe([span("keyword", "public"), span("keyword", "sealed"), span("keyword", "class")].join(" "));
    });
    it("marks method calls", () => {
      expect(hl("_slots.TryGetValue(item)", "csharp")).toContain(span("type", "TryGetValue"));
      expect(hl("add(x)", "csharp")).toContain(span("fn", "add"));
    });
  });

  describe("SQL", () => {
    it("is case-insensitive for keywords and functions", () => {
      expect(hl("select", "sql")).toBe(span("keyword", "select"));
      expect(hl("SELECT", "sql")).toBe(span("keyword", "SELECT"));
      expect(hl("COUNT", "sql")).toBe(span("fn", "COUNT"));
    });
    it("handles -- comments and '' escaped strings", () => {
      expect(hl("-- note", "sql")).toBe(span("comment", "-- note"));
      expect(hl("'it''s'", "sql")).toBe(span("string", "'it''s'"));
    });
  });

  describe("JSON", () => {
    it("distinguishes keys from string values and handles literals/numbers", () => {
      expect(hl('{"a": "b", "n": -1.5e3, "t": true, "z": null}', "json")).toBe(
        "{" + span("attr", "\"a\"") + ": " + span("string", "\"b\"") + ", " +
        span("attr", "\"n\"") + ": " + span("number", "-1.5e3") + ", " +
        span("attr", "\"t\"") + ": " + span("keyword", "true") + ", " +
        span("attr", "\"z\"") + ": " + span("keyword", "null") + "}");
    });
  });

  describe("HTML", () => {
    it("matches tags, attributes, strings and comments on the escaped text", () => {
      expect(hl('<div class="x">', "html")).toBe(
        span("tag", "&lt;div") + " " + span("attr", "class") + "=" + span("string", "\"x\"") + "&gt;");
      expect(hl("</div>", "html")).toBe(span("tag", "&lt;/div") + "&gt;");
      expect(hl("<!-- c -->", "html")).toBe(span("comment", "&lt;!-- c --&gt;"));
    });
  });

  describe("CSS", () => {
    it("handles properties, units, colors, at-rules and !important", () => {
      expect(hl("color: #fff", "css")).toBe(span("attr", "color") + ": " + span("number", "#fff"));
      expect(hl("12px", "css")).toBe(span("number", "12px"));
      expect(hl("1.5rem", "css")).toBe(span("number", "1.5rem"));
      expect(hl("@media", "css")).toBe(span("keyword", "@media"));
      expect(hl("!important", "css")).toBe(span("keyword", "!important"));
      expect(hl("/* c */", "css")).toBe(span("comment", "/* c */"));
    });
  });

  describe("Python", () => {
    it("handles # comments, triple-quoted strings, keywords and calls", () => {
      expect(hl("# c", "python")).toBe(span("comment", "# c"));
      expect(hl('"""doc\nstring"""', "python")).toBe(span("string", "\"\"\"doc\nstring\"\"\""));
      expect(hl("'''x'''", "python")).toBe(span("string", "'''x'''"));
      expect(hl("def", "python")).toBe(span("keyword", "def"));
      expect(hl("None", "python")).toBe(span("keyword", "None"));
      expect(hl("self", "python")).toBe(span("keyword", "self"));
      expect(hl("print(", "python")).toBe(span("fn", "print") + "(");
    });
  });

  describe("Shell", () => {
    it("handles comments, strings, keywords, variables and numbers", () => {
      expect(hl("# c", "bash")).toBe(span("comment", "# c"));
      expect(hl('"a $b"', "bash")).toBe(span("string", "\"a $b\""));
      expect(hl("'lit'", "bash")).toBe(span("string", "'lit'"));
      expect(hl("echo", "bash")).toBe(span("keyword", "echo"));
      expect(hl("$HOME", "bash")).toBe(span("keyword", "$HOME"));
      expect(hl("${X:-y}", "bash")).toBe(span("keyword", "${X:-y}"));
      expect(hl("7", "bash")).toBe(span("number", "7"));
    });
  });
});
