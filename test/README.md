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
| `unit/sanitize.test.js` | `clean()` tag & attribute whitelist, `javascript:` / `src` filtering, `<pre>` normalisation, `esc()`. |
| `unit/highlight.test.js` | `LANGS` table and `highlight()` for every language (C#, SQL, JS, JSON, HTML, CSS, Python, Shell). |
| `unit/document.test.js` | `open`, `crumbs`, `render`, `decorate` (copy button), `setMode` (view/edit/source), `format`, `commit`, Edit/Done/HTML buttons, title input & Enter/Tab, `tail`, `caretTo`, click-below-text, autosave debounce. |
| `unit/editor.test.js` | Toolbar `execCommand` buttons, Code block / Table / Link buttons (with dialog), paste handling, `currentPre`/`insertText`, keyboard inside and outside code blocks. |
| `unit/code-blocks.test.js` | Floating code-block headers: `makeHead`, `syncBlocks` positioning, language `<select>`, delete button, MutationObserver/rAF scheduling, resize. |
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
```

Inside `beforeParse` (before the page script runs) the harness:

- routes `setTimeout`/`requestAnimationFrame` to Node's globals so Vitest fake
  timers control them — call `app.flush()` to run the save debounce, toasts,
  the 500 ms autosave and the rAF header sync;
- defines `document.execCommand` (records every call in `app.exec.calls`;
  `insertHTML` is actually applied at the selection so the Code block / Table /
  Link buttons produce real DOM);
- reflects `HTMLElement.contentEditable` to the attribute (JSDOM only knows the
  attribute), which makes the inline-rename label focusable;
- stubs `navigator.clipboard`, `Blob`, `URL.createObjectURL` and `<a>.click()` so
  exports land in `app.downloads` as `{ download, text, blob }`.

Script internals are reached through the window realm:
`app.get("db")`, `app.get("mode")`, `app.set("raw", "<p>x</p>")`,
`app.call("setMode", "edit")`. Every `function` and top-level `let/const` in the
page script is reachable this way.

Always `app.close()` in `afterEach` — it restores real timers and closes the window.

## Known bugs documented with `it.fails`

These tests assert the *correct* behaviour and are marked `it.fails`, so the
suite stays green while the bug exists. When a bug is fixed the test will start
failing (because it now passes) — remove the `.fails` at that point.

1. **Switching pages while editing shows the old page's body**
   (`document.test.js`). `open()` sets `raw` to the new page, then
   `setMode("view")` overwrites `raw` with `editor.innerHTML` from the previous
   page. The pending autosave then writes that body into the newly opened page.
2. **`esc()` does not escape `"`** but is used inside `value="…"` attributes in
   `promptBox` and `linkBox` (`dialogs.test.js`). Selecting `say "hi"` and pressing
   *Link* prefills the name as `say `.

## JSDOM limitations to keep in mind

- `execCommand` is stubbed: formatting commands (bold, lists…) are only
  *recorded*, not applied. Tests assert the command/value that was issued.
- Layout is not computed; `getBoundingClientRect` returns zeros unless a test
  overrides it with `rect(el, {...})`.
- `Selection.toString()` works, so "wrap the selection in a code block" and the
  link-name prefill are tested for real.
