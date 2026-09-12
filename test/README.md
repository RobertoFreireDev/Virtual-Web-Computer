# Virtual PC — unit tests

Unit tests for every feature, button and piece of HTML logic in
[`../virtualwebpc.html`](../virtualwebpc.html). The app is a single file with an
inline classic `<script>`, so nothing is imported from it: each test boots the
real HTML in a fresh [JSDOM](https://github.com/jsdom/jsdom) window and drives it
the way a user (or the browser) would.

## Running

```bash
cd test
npm install
npm test            # run once
npm run test:watch  # re-run on change
```

Requires Node 18+ (developed on Node 24). No browser is needed.

## Layout

| Path | What it covers |
|---|---|
| `helpers/app.js` | `loadApp()` boots the HTML in JSDOM, stubs the browser APIs JSDOM lacks and exposes the script's internals (`app.get("db")`, `app.call("setMode", "edit")`, `app.flush()` …). Also `tick()` (await microtasks) and `sampleTree()` (a small fixture library). |
| `helpers/dom.js` | Event helpers: `click`, `key`, `input`, `change`, `paste`, `drag`, `caret`, `chooseFile` … |
| `unit/html-structure.test.js` | Static markup contract — every id, title, toolbar `data-cmd`, hidden file input, default visibility. |
| `unit/storage.test.js` | First-run seed, `load()`, debounced `save()`, blocked `localStorage` (memory-only mode), `flag()`, `toast()`, `uid()`. |
| `unit/tree-model.test.js` | `find`, `each`, `contains`, `chainOf`, `target`, `addPage`, `addFolder`, `remove` (confirm dialog), `move` (incl. cycle guard), `duplicate`. |
| `unit/tree-view.test.js` | `renderTree`/`build`, stats, search (`matches`), row click / twisty / double-click, inline rename (`renameInTree`), drag & drop incl. root drop. |
| `unit/context-menu.test.js` | Right-click menu items per node type, positioning/clamping, every action, closing on outside click / window blur / Escape. |
| `unit/sanitize.test.js` | `clean()` tag & attribute whitelist, dropped vs. unwrapped elements, comments, Google Docs `<b>` wrapper, `href` scheme / `src` filtering, `<pre>` + `data-lang` normalisation, `esc()` / `attr()`. |
| `unit/highlight.test.js` | `LANGS` table and `highlight()` for every language (C#, SQL, JS, JSON, HTML, CSS, Python, Shell). |
| `unit/document.test.js` | `open` (incl. mid-edit page switch), `crumbs`, `render` (keyed on `openId`), `decorate` (copy button, escaped label), `setMode` (view/edit/source), `format`/`unformat`, `commit`, Edit/Done/HTML buttons, title input & Enter/Tab, `tail`, `caretTo`, click-below-text, autosave debounce. |
| `unit/editor.test.js` | Toolbar `execCommand` buttons, Code block / Table / Link buttons (with dialog), paste handling, `currentPre`/`insertText`, keyboard inside and outside code blocks. |
| `unit/format-code.test.js` | `LANGS[lang].fmt()` pretty-printers: C-like brace re-breaking (JS/C#/CSS), JSON, SQL clauses/sub-queries, HTML tags, Python/Shell indentation, plain text; idempotence for every language. |
| `unit/code-blocks.test.js` | Floating code-block headers: `makeHead`, `syncBlocks` positioning, language `<select>`, Format button (rewrite, `<br>` handling, error/already-formatted toasts), delete button, MutationObserver/rAF scheduling, resize. |
| `unit/tables.test.js` | Table tools: `#tbl` bar markup, `currentCell`, `syncTable` positioning/visibility and its triggers, every row/column button (header rows are protected: adds go to the body, `− Row` removes the first body row), delete table (confirm), stale-bar guards, `Tab`/`Shift+Tab` between cells and `Tab` past the last cell. |
| `unit/dialogs.test.js` | `openDialog`/`closeDialog`, `confirmBox`, `promptBox`, `linkBox`, `choiceBox`, `pickBox` (indeterminate folders, select all/none, disabled OK), Escape / veil-click priority. |
| `unit/export-import.test.js` | `prune`, `normalize`, Export button (picker → JSON download → toast), Import flow (invalid JSON, empty, picker, Merge/Replace), round-trip. |
| `unit/sidebar-shortcuts.test.js` | Resize grip (clamp 190–520, persist), `toggleNav`, Ctrl+S / Ctrl+E / Ctrl+\ / Ctrl+F / Escape, `beforeunload`. |

## How the harness works

`loadApp(options)` returns an `app` object. Useful options:

```js
loadApp()                                        // first run → seeded library
loadApp({ stored: { tree: sampleTree(), selected: "p1" } })   // preloaded localStorage
loadApp({ storage: "blocked" })                  // localStorage throws → memory-only mode
loadApp({ clipboardMode: "blocked" })            // navigator.clipboard rejects
loadApp({ clipboardMode: "noread" })             // no navigator.clipboard.read (older browsers)
```

`app.clipboard.image = new app.window.File([...], "x.png", { type: "image/png" })`
makes `navigator.clipboard.read()` serve that image (for the Image toolbar
button); `paste(el, { files: [file] })` simulates Ctrl+V of a copied image.

Inside `beforeParse` (before the page script runs) the harness:

- routes `setTimeout`/`requestAnimationFrame` to Node's globals so Vitest fake
  timers control them — call `app.flush()` to run the save debounce, toasts,
  the 500 ms autosave and the rAF header sync;
- defines `document.execCommand` (records every call in `app.exec.calls`;
  `insertHTML` and `insertText` are actually applied at the selection so the
  Code block / Table / Link buttons and plain-text pastes produce real DOM);
- reflects `HTMLElement.contentEditable` to the attribute (JSDOM only knows the
  attribute), which makes the inline-rename label focusable;
- stubs `navigator.clipboard`, `Blob`, `URL.createObjectURL` and `<a>.click()` so
  exports land in `app.downloads` as `{ download, text, blob }`.

Script internals are reached through the window realm:
`app.get("db")`, `app.get("mode")`, `app.set("raw", "<p>x</p>")`,
`app.call("setMode", "edit")`. Every `function` and top-level `let/const` in the
page script is reachable this way.

Always `app.close()` in `afterEach` — it restores real timers and closes the window.

## Documenting a known bug

If a bug is found but not fixed yet, write the test that asserts the *correct*
behaviour and mark it `it.fails`, so the suite stays green while the bug exists.
When the bug is fixed the test starts failing (because it now passes) — flip it
back to `it` at that point. There are currently no `it.fails` tests.

Regressions that the suite now guards against (each has a dedicated test):

- `open()` while editing flushes the editor into the page it belongs to before
  loading the new one (`document.test.js`).
- `commit()`, the title input and `Ctrl+E` act on the *open* page (`openId`),
  not on the highlighted row (`db.selected`), which may be a folder or a
  right-clicked page (`document.test.js`, `sidebar-shortcuts.test.js`,
  `context-menu.test.js`).
- `beforeunload` writes to `localStorage` synchronously via `flush()`
  (`sidebar-shortcuts.test.js`).
- A round trip through the HTML view (`format()` → `unformat()`) is lossless
  (`document.test.js`).
- Dialog prefills go through `attr()`, which also escapes `"`
  (`dialogs.test.js`).
- `clean()` drops `<script>`/`<style>`-like elements, unwraps other unknown
  elements, strips comments and Google Docs' `font-weight:normal` `<b>` wrapper,
  and only keeps `http(s):`/`mailto:`/scheme-less hrefs (`sanitize.test.js`).

## JSDOM limitations to keep in mind

- `execCommand` is stubbed: formatting commands (bold, lists…) are only
  *recorded*, not applied. Tests assert the command/value that was issued.
- Layout is not computed; `getBoundingClientRect` returns zeros unless a test
  overrides it with `rect(el, {...})`.
- `Selection.toString()` works, so "wrap the selection in a code block" and the
  link-name prefill are tested for real.
- JSDOM does not fire `selectionchange`; table tests place the caret with
  `caret()` and call `app.call("syncBlocks")` (which runs `syncTable()`) to do
  what the browser would do on its own.
- `expect(nodeA).toBe(nodeB)` on two *different* JSDOM nodes crashes vitest's
  diff printer with `Cannot read properties of undefined (reading 'name')`
  instead of a readable failure. When comparing nodes that may differ, use
  `expect(a === b).toBe(true)`.
