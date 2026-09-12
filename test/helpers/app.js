/*
 * Boots virtualwebpc.html inside a fresh JSDOM window so every test starts
 * from a clean app, and exposes the script's internals (db, mode, raw, the
 * top-level functions) through `app.get / app.call`.
 *
 * Browser APIs that JSDOM lacks are stubbed in `beforeParse`, before the
 * page script runs:
 *   - document.execCommand        → recorded; `insertHTML` is really applied
 *   - HTMLElement.contentEditable → reflected to the attribute (rename UI)
 *   - navigator.clipboard         → in-memory, can be switched to "blocked"
 *   - Blob / URL.createObjectURL / <a>.click → captured as `downloads`
 *   - timers / rAF                → routed to Node globals so vi fake timers work
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";
import { vi } from "vitest";

export const KEY = "virtualpc.data.v1";
export const HTML_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../virtualwebpc.html");
export const html = fs.readFileSync(HTML_PATH, "utf8");

const BLOCK = /^(P|DIV|PRE|TABLE|UL|OL|BLOCKQUOTE|HR|H[1-6])$/;

export function loadApp({ stored, storage = "ok", clipboardMode = "ok" } = {}) {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });

  const virtualConsole = new VirtualConsole();
  const jsdomErrors = [];
  virtualConsole.on("jsdomError", e => jsdomErrors.push(e));

  const exec = { calls: [] };
  const downloads = [];
  const blobs = new Map();
  const clipboard = { text: null, mode: clipboardMode, calls: 0 };

  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "http://localhost/",
    virtualConsole,
    beforeParse(window) {
      const { document } = window;

      /* timers → Node globals (looked up at call time so vi.useFakeTimers applies) */
      window.setTimeout = (fn, ms, ...a) => globalThis.setTimeout(fn, ms, ...a);
      window.clearTimeout = id => globalThis.clearTimeout(id);
      window.setInterval = (fn, ms, ...a) => globalThis.setInterval(fn, ms, ...a);
      window.clearInterval = id => globalThis.clearInterval(id);
      window.requestAnimationFrame = cb => globalThis.setTimeout(() => cb(16), 16);
      window.cancelAnimationFrame = id => globalThis.clearTimeout(id);

      /* storage */
      if (storage === "blocked") {
        Object.defineProperty(window, "localStorage", {
          configurable: true,
          get() { throw new window.DOMException("blocked", "SecurityError"); }
        });
      } else {
        window.localStorage.clear();
        if (stored !== undefined) {
          window.localStorage.setItem(KEY, typeof stored === "string" ? stored : JSON.stringify(stored));
        }
      }

      /* contentEditable reflection (jsdom only knows the attribute) */
      Object.defineProperty(window.HTMLElement.prototype, "contentEditable", {
        configurable: true,
        get() { return this.getAttribute("contenteditable") ?? "inherit"; },
        set(v) { this.setAttribute("contenteditable", String(v)); }
      });

      /* execCommand: record every call, apply insertHTML for real */
      document.execCommand = function (cmd, ui = false, val = null) {
        exec.calls.push({ cmd, val });
        if (cmd !== "insertHTML") return true;
        const s = window.getSelection();
        if (!s.rangeCount) return false;
        const r = s.getRangeAt(0);
        r.deleteContents();
        const frag = r.createContextualFragment(val);
        const last = frag.lastChild;
        const hasBlock = [...frag.children].some(c => BLOCK.test(c.tagName));
        const editor = document.getElementById("editor");
        let host = r.startContainer.nodeType === 3 ? r.startContainer.parentNode : r.startContainer;
        if (hasBlock && editor && editor.contains(host) && host !== editor) {
          while (host.parentNode !== editor) host = host.parentNode;
          host.after(frag);                       // browsers split the block; we append after it
        } else {
          r.insertNode(frag);
        }
        if (last) {
          const nr = document.createRange();
          nr.setStartAfter(last); nr.collapse(true);
          s.removeAllRanges(); s.addRange(nr);
        }
        return true;
      };

      /* clipboard */
      Object.defineProperty(window.navigator, "clipboard", {
        configurable: true,
        value: {
          writeText(text) {
            clipboard.calls++;
            if (clipboard.mode !== "ok") return Promise.reject(new Error("blocked"));
            clipboard.text = text;
            return Promise.resolve();
          }
        }
      });

      /* downloads */
      const OrigBlob = window.Blob;
      window.Blob = class Blob extends OrigBlob {
        constructor(parts = [], opts) { super(parts, opts); this.parts = parts; this.opts = opts; }
      };
      window.URL.createObjectURL = blob => { const u = "blob:test/" + (blobs.size + 1); blobs.set(u, blob); return u; };
      window.URL.revokeObjectURL = () => {};
      window.HTMLAnchorElement.prototype.click = function () {
        const href = this.getAttribute("href");
        const blob = blobs.get(href);
        downloads.push({ href, download: this.download, blob, text: blob ? blob.parts.join("") : null });
      };
    }
  });

  const window = dom.window;
  const document = window.document;

  const app = {
    dom, window, document, jsdomErrors, exec, downloads, clipboard, KEY,
    $: id => document.getElementById(id),
    q: sel => document.querySelector(sel),
    qa: sel => [...document.querySelectorAll(sel)],
    /** read a top-level binding of the page script (db, mode, raw, filter, memoryOnly…) */
    get: name => window.eval(name),
    /** assign a top-level binding */
    set: (name, value) => { window.__v = value; window.eval(`${name} = window.__v`); delete window.__v; },
    /** call a top-level function of the page script */
    call: (name, ...args) => window.eval(name)(...args),
    /** run every pending timer (save debounce, toast, flag, rAF sync…) */
    flush: () => vi.runAllTimers(),
    /** parsed copy of what is persisted right now */
    stored: () => { const s = window.localStorage.getItem(KEY); return s ? JSON.parse(s) : null; },
    /** the tree rows currently rendered in the sidebar */
    rows: () => [...document.querySelectorAll("#tree .row")],
    row: id => document.querySelector(`#tree .row[data-id="${id}"]`),
    labels: () => [...document.querySelectorAll("#tree .row .label")].map(l => l.textContent),
    /** the first folder / page of the seeded library */
    seedFolder: () => app.get("db").tree[0],
    seedPage: () => app.get("db").tree[0].children[0],
    dialogOpen: () => document.getElementById("veil").classList.contains("open"),
    toastText: () => document.getElementById("toast").textContent,
    close() { vi.useRealTimers(); window.close(); }
  };
  return app;
}

/** wait for pending microtasks (promise callbacks, MutationObserver) */
export const tick = () => new Promise(r => globalThis.queueMicrotask(() => globalThis.queueMicrotask(r)));

/** a small library for tests that want more than the seed */
export function sampleTree() {
  return [
    { id: "f1", type: "folder", name: "Work", open: true, children: [
      { id: "p1", type: "page", name: "Alpha", content: "<p>alpha text</p>" },
      { id: "f2", type: "folder", name: "Nested", open: false, children: [
        { id: "p2", type: "page", name: "Beta", content: "<p>beta about cats</p>" }
      ] }
    ] },
    { id: "p3", type: "page", name: "Gamma", content: "<h2>Gamma</h2><pre class=\"code\" data-lang=\"javascript\">const a = 1;</pre>" },
    { id: "f3", type: "folder", name: "Empty", open: true, children: [] }
  ];
}
