# Virtual PC (Virtual-Web-Computer)

A personal wiki / notebook that runs entirely in the browser from **one HTML
file** — no build step, no server, no dependencies. Folders and pages live in a
sidebar tree, the open page is a rich-text document with syntax-highlighted code
blocks, and everything is persisted to `localStorage`. Backups are plain JSON.

## Repository layout

```
virtualwebpc.html   the whole application (CSS + markup + JS, ~1300 lines)
README.md           project title only
CLAUDE.md           this file
test/               Vitest + JSDOM unit tests (see test/README.md)
  helpers/app.js    boots the HTML in JSDOM, stubs browser APIs, exposes internals
  helpers/dom.js    event helpers (click, key, drag, paste, chooseFile …)
  unit/*.test.js    one file per feature area
```

## Running

- **App:** open `virtualwebpc.html` in any modern browser. Data is stored under
  the `localStorage` key `virtualpc.data.v1`. Because storage is per-origin,
  opening the file from a different path/URL shows a different library.
- **Tests:** `cd test && npm install && npm test` (Node 18+; no browser needed).
  Run a single file with `npx vitest run unit/editor.test.js`.

## Architecture of `virtualwebpc.html`

The `<script>` is a classic (non-module) script in `"use strict"` mode. All
state and functions are top-level bindings, in this order:

| Section | Key names | Notes |
|---|---|---|
| state | `KEY`, `uid()`, `db`, `mode`, `raw`, `memoryOnly` | `db = { tree, selected, navWidth, navOpen }`. `mode` is `"view" \| "edit" \| "source"`. `raw` is the current page's HTML — the single source of truth while editing. |
| storage | `load()`, `save()`, `flag()`, `toast()` | `save()` is debounced 250 ms. A throwing `localStorage` sets `memoryOnly` and the app keeps working in memory. |
| tree model | `find`, `each`, `contains`, `chainOf`, `target`, `addPage`, `addFolder`, `remove`, `move` | Nodes: `{id, type:"page", name, content}` or `{id, type:"folder", name, open, children}`. `target()` decides where new nodes go (inside a selected folder, beside a selected page). `move()` refuses cycles. |
| tree view | `renderTree`, `build`, `wire`, `renameInTree`, `matches`, `filter` | Rows are `.row[data-id]`. Search matches names **and** page text (tags stripped) and force-opens folders without changing `node.open`. |
| context menu | `openMenu`, `closeMenu`, `duplicate` | Right-click on a row. Folder rows get "New page/folder here". |
| sanitizing | `OK_TAGS`, `OK_ATTR`, `clean()`, `esc()` | `clean()` runs on every render, paste and import. Disallowed elements are replaced by their text. `<pre>` is normalised to `class="code" data-lang="…"`. `esc()` escapes `& < >` only (not quotes). |
| highlighting | `LANGS`, `highlight()` | Regex with named groups per language; output uses `.t-comment`, `.t-string`, `.t-number`, `.t-keyword`, `.t-type`, `.t-fn`, `.t-tag`, `.t-attr`. |
| document | `open`, `crumbs`, `render`, `decorate`, `commit`, `setMode`, `format`, `tail`, `caretTo` | `setMode()` moves `raw` between viewer / `#editor` (contenteditable) / `#source` (textarea). `decorate()` adds the language bar + Copy button to code blocks in view mode. `tail()` guarantees a trailing `<p>` so typing can continue after a block. |
| editor commands | toolbar `data-cmd` buttons, `tbBlock`, `tbLink`, `tbTable`, paste & keydown handlers, `currentPre`, `insertText` | Formatting uses `document.execCommand`. Inside a `<pre>`: Enter = newline, Tab = two spaces, Shift/Ctrl+Enter = leave the block. |
| code block headers | `makeHead`, `syncBlocks`, `scheduleSync`, `#blocks` layer | While editing, an absolutely-positioned header (language `<select>` + delete) floats over each `<pre>`, re-synced via MutationObserver → rAF and on resize. |
| export / import | `btnExport`, `#file` onchange, `prune`, `normalize`, `pickBox` | Export: pick items → JSON `{app:"virtualpc", version:1, exportedAt, tree}` named `virtualpc-YYYY-MM-DD.json`. Import: parse → `normalize` (new ids, sanitised content) → pick → Merge or Replace. |
| dialogs | `openDialog`, `closeDialog`, `confirmBox`, `promptBox`, `linkBox`, `choiceBox`, `pickBox` | Promise-based, rendered into `#dialog` inside the `#veil`. Escape and a click on the veil call `veil._esc`. `promptBox` is currently unused. |
| sidebar + shortcuts | `grip`, `toggleNav`, global `keydown` | Sidebar width clamped 190–520 px via the `--sw` CSS variable. |
| first run | `SEED` | A "Getting started" folder with a "How this wiki works" page when nothing is stored. |

### Keyboard shortcuts

| Keys | Action |
|---|---|
| `Ctrl/Cmd+E` | Toggle edit mode (needs a selected page) |
| `Ctrl/Cmd+S` | Save; leaves edit/source mode |
| `Ctrl/Cmd+\` | Toggle sidebar |
| `Ctrl/Cmd+F` | Focus search (opens sidebar if closed) |
| `Escape` | Close dialog → close menu → leave edit mode (in that priority) |
| `Enter`/`Tab` in title | Jump into the body (starts editing in view mode) |
| In code block: `Enter` / `Tab` / `Shift+Enter` | Newline / two spaces / new paragraph after the block |

### Data flow while editing

1. `setMode("edit")` copies `raw` into `#editor`, calls `tail()`, focuses.
2. Typing → `input` event → 500 ms debounce → `raw = editor.innerHTML; commit()`.
3. `commit()` writes `raw` into `find(db.selected).node.content`, calls `save()`
   (250 ms debounce to `localStorage`) and flashes "Saved" in `#status`.
4. Toolbar buttons, header selects and block deletion call `commit()` directly.
5. `Done` / `Ctrl+S` / `Escape` / `beforeunload` commit and return to view.

## Conventions

- Keep everything in the single HTML file; there is no bundler. Match the
  existing compact style (short helper names, `$()` for `getElementById`,
  section banners `/* ═══ name ═══ */`).
- New HTML that ends up in page content must pass through `clean()`; new
  attributes need adding to `OK_ATTR`.
- Anything that changes `db` must call `save()` and, if the sidebar is affected,
  `renderTree()`; anything that changes the open page should go through `commit()`.
- Adding a language: add an entry to `LANGS` (label + global regex with the
  named groups above). The header `<select>` and `decorate()` pick it up
  automatically.
- When changing behaviour, update or add tests in `test/unit/` — the suite
  exercises every button and handler through the real markup.

## Known bugs (documented as `it.fails` tests)

1. **Opening another page while editing** shows the previous page's body and the
   pending autosave writes it into the new page. Cause: `open()` sets `raw`, then
   `setMode("view")` overwrites `raw` with `editor.innerHTML`. Fix idea: in
   `open()`, leave edit/source mode *before* assigning `raw`
   (e.g. `if(mode !== "view") { commit(); setMode("view"); }` first).
   → `test/unit/document.test.js`
2. **Quotes in dialog prefills are cut off**: `esc()` does not escape `"` but its
   output is placed inside `value="…"` in `promptBox`/`linkBox`. Fix idea: make
   `esc()` also map `"` → `&quot;`. → `test/unit/dialogs.test.js`

When fixing one of these, flip the corresponding `it.fails` back to `it`.

## Testing notes

- Tests never import from the HTML; `helpers/app.js` loads the file into JSDOM
  with `runScripts: "dangerously"` and reads internals via `window.eval`
  (`app.get("db")`, `app.call("setMode","edit")`).
- Timers are routed to Vitest fake timers: call `app.flush()` to fire the save
  debounce, autosave, toasts and rAF-based header sync.
- `document.execCommand` does not exist in JSDOM; the harness records calls and
  really applies `insertHTML`. Formatting commands are asserted by
  command/value, not by resulting DOM.
- See `test/README.md` for the file-by-file map and the harness API.
