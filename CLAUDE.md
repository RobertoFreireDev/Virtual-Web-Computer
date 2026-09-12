# Virtual PC (Virtual-Web-Computer)

A personal wiki / notebook that runs entirely in the browser from **one HTML
file** — no build step, no server, no dependencies. Folders and pages live in a
sidebar tree, the open page is a rich-text document with syntax-highlighted code
blocks, and everything is persisted to `localStorage`. Backups are plain JSON.

## Repository layout

```
virtualwebpc.html   the whole application (CSS + markup + JS, ~1550 lines)
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
| state | `KEY`, `uid()`, `db`, `mode`, `raw`, `memoryOnly` | `db = { tree, selected, navWidth, navOpen }`. `db.selected` is only the *highlighted row* (can be a folder); the page shown in the panel is `openId` (document section). `mode` is `"view" \| "edit" \| "source"`. `raw` is the current page's HTML — the single source of truth while editing. |
| storage | `load()`, `save()`, `flush()`, `flag()`, `toast()` | `save()` is debounced 250 ms; `flush()` writes immediately (used by `beforeunload`, where a timer could never fire). A throwing `localStorage` sets `memoryOnly` and the app keeps working in memory. |
| tree model | `find`, `each`, `contains`, `chainOf`, `target`, `addPage`, `addFolder`, `remove`, `move` | Nodes: `{id, type:"page", name, content}` or `{id, type:"folder", name, open, children}`. `target()` decides where new nodes go (inside a selected folder, beside a selected page). `move()` refuses cycles. |
| tree view | `renderTree`, `build`, `wire`, `renameInTree`, `matches`, `filter` | Rows are `.row[data-id]`. Search matches names **and** page text (tags stripped) and force-opens folders without changing `node.open`. |
| context menu | `openMenu`, `closeMenu`, `duplicate` | Right-click on a row selects it (persisted); a right-clicked page is also opened, unless an edit is in progress. Folder rows get "New page/folder here". Deleting a folder (`remove()`) shows the item count **and** a read-only, indented `.pick-tree.ro` list of every nested folder/page in the confirm dialog. |
| sanitizing | `OK_TAGS`, `OK_ATTR`, `DROP_TAGS`, `okHref()`, `clean()`, `esc()`, `attr()` | `clean()` runs on every render, paste and import. `DROP_TAGS` (`script`, `style`, `iframe`, `template`, `svg` …) are removed with their content; any other unknown element is *unwrapped* (its sanitised children stay, so `<section><p>` keeps its paragraphs). HTML comments are dropped. A `<b>`/`<strong>` with `font-weight:normal|100–400` (Google Docs' clipboard wrapper) is unwrapped too. `href` must be scheme-less or `http(s):`/`mailto:`; `src` must be `http(s):` or `data:image/`. `<pre>` is normalised to `class="code" data-lang="…"` with unknown languages forced to `plain`. `esc()` escapes `& < >`; `attr()` additionally escapes `"` and is what goes inside `value="…"`/`href="…"`. |
| highlighting | `LANGS`, `highlight()` | Regex with named groups per language; output uses `.t-comment`, `.t-string`, `.t-number`, `.t-keyword`, `.t-type`, `.t-fn`, `.t-tag`, `.t-attr`. |
| document | `openId`, `openPage()`, `open`, `crumbs`, `render`, `decorate`, `commit`, `setMode`, `format`, `unformat`, `tail`, `caretTo` | `openId` is the page in the panel; `openPage()` returns its `find()` record or `null`. `commit()`, `crumbs()`, `render()`, the title input and `Ctrl+E` all go by `openId`, never by `db.selected`. `open()` called mid-edit first flushes the editor into the page it belongs to. `render()` with no open page hides the panel and drops back to view mode. `setMode()` moves `raw` between viewer / `#editor` (contenteditable) / `#source` (textarea); the textarea shows `format(raw)` (one tag per line) and everything read back from it passes through `unformat()` so the round trip is lossless (the added newlines would otherwise show inside `white-space:pre-wrap` blocks). `decorate()` adds the language bar + Copy button to code blocks in view mode. `tail()` guarantees a trailing `<p>` so typing can continue after a block. |
| editor commands | toolbar `data-cmd` buttons, `tbBlock`, `tbLink`, `tbTable`, paste & keydown handlers, `currentPre`, `insertText` | Formatting uses `document.execCommand`. Inside a `<pre>`: Enter = newline, Tab = two spaces, Shift/Ctrl+Enter = leave the block. `insertText()` and the hand-written keydown handlers mutate the DOM without an `input` event, so every such path sets `raw` and calls `commit()` itself. |
| code block headers | `makeHead`, `syncBlocks`, `scheduleSync`, `#blocks` layer | While editing, an absolutely-positioned header (language `<select>` + delete) floats over each `<pre>`, re-synced via MutationObserver → rAF and on resize. `syncBlocks()` ends by calling `syncTable()`. |
| table tools | `#tbl` bar, `currentCell`, `isHeader`, `addRow`, `addCol`, `removeTable`, `TABLE_OPS`, `syncTable` | While editing, `#tbl` (row above/below, delete row, column left/right, delete column, delete table) floats 36 px above the table the caret is in; `.body[contenteditable] table` gets `margin-top:46px` to make room. `syncTable()` binds `tbl._cell`, and is scheduled on `selectionchange`, editor `click`/`keyup` and every `syncBlocks()`. Every op takes the current cell, mutates the table and returns the cell to put the caret in; cells are addressed by `cellIndex` (colspan/rowspan are not expanded). The header (`<thead>` row, or a first row of `<th>`) is never grown or removed: rows added from a header cell become the first body row, `− Row` from the header removes the first body row (toast when there is none). Removing the only row/column, or `− Row` on the last row, replaces the table with `<p><br></p>`; delete table asks `confirmBox`. `Tab`/`Shift+Tab` in a cell move between cells; `Tab` in the last cell appends a row. |
| export / import | `btnExport`, `#file` onchange, `prune`, `normalize`, `pickBox` | Export: pick items → JSON `{app:"virtualpc", version:1, exportedAt, tree}` named `virtualpc-YYYY-MM-DD.json`. Import: parse → `normalize` (new ids, sanitised content) → pick → Merge or Replace. |
| dialogs | `openDialog`, `closeDialog`, `confirmBox`, `promptBox`, `linkBox`, `choiceBox`, `pickBox` | Promise-based, rendered into `#dialog` inside the `#veil`. Escape and a click on the veil call `veil._esc`. `confirmBox(title, msg, label, extra)` — `extra` is optional, already-escaped markup placed between the message and the buttons. `promptBox` is currently unused. |
| sidebar + shortcuts | `grip`, `toggleNav`, global `keydown` | Sidebar width clamped 190–520 px via the `--sw` CSS variable. |
| first run | `SEED` | A "Getting started" folder with a "How this wiki works" page when nothing is stored. |

### Keyboard shortcuts

| Keys | Action |
|---|---|
| `Ctrl/Cmd+E` | Toggle edit mode (needs an open page); leaving edit commits |
| `Ctrl/Cmd+S` | Save; leaves edit/source mode |
| `Ctrl/Cmd+\` | Toggle sidebar |
| `Ctrl/Cmd+F` | Focus search (opens sidebar if closed) |
| `Escape` | Close dialog → close menu → leave edit mode (in that priority) |
| `Enter`/`Tab` in title | Jump into the body (starts editing in view mode) |
| In code block: `Enter` / `Tab` / `Shift+Enter` | Newline / two spaces / new paragraph after the block |
| In table cell: `Tab` / `Shift+Tab` | Next / previous cell; `Tab` in the last cell adds a row |
| `Backspace` at the start of a quote | Unwraps the `<blockquote>` (`quoteStart`/`unquote`) — the browser can't when it is the first block |
| In text: `Tab` / `Shift+Tab` | Insert / remove a tab character (`white-space:pre-wrap; tab-size:4` on text containers makes it visible). In a list item they still `indent`/`outdent` (nest the item) |
| In quote: `Enter` / `Shift+Enter` | Ends the quote, text after the caret goes into a new `<p>` (`currentQuote`/`splitQuote`) / line break inside the quote. Inside a list item within the quote, Enter is left to the browser (new item) |

### Data flow while editing

1. `setMode("edit")` copies `raw` into `#editor`, calls `tail()`, focuses.
2. Typing → `input` event → 500 ms debounce → `raw = editor.innerHTML; commit()`.
3. `commit()` writes `raw` into `openPage().node.content`, calls `save()`
   (250 ms debounce to `localStorage`) and flashes "Saved" in `#status`.
4. Toolbar buttons, header selects, block deletion, the table bar, paste and the
   custom keydown handlers (Tab, Enter in code blocks / quotes …) call `commit()` directly.
5. `Done` / `Ctrl+S` / `Ctrl+E` / `Escape` commit and return to view;
   `beforeunload` commits and then `flush()`es straight to `localStorage`.
6. Clicking or right-clicking another page while editing: `open()` writes the
   editor's HTML into the page that was being edited, then loads the new one.

## Conventions

- Keep everything in the single HTML file; there is no bundler. Match the
  existing compact style (short helper names, `$()` for `getElementById`,
  section banners `/* ═══ name ═══ */`).
- New HTML that ends up in page content must pass through `clean()`; new
  attributes need adding to `OK_ATTR`. Anything interpolated into `innerHTML`
  goes through `esc()` (text) or `attr()` (attribute values) — including values
  that came out of `clean()`, such as `data-lang`.
- Anything that changes `db` must call `save()` and, if the sidebar is affected,
  `renderTree()`; anything that changes the open page should go through `commit()`.
  If a handler edits the editor DOM itself (Range API, `insertText()`), it must
  also set `raw` and call `commit()` — no `input` event will fire for it.
- Use `openPage()` / `openId` for "the page being shown or edited";
  `db.selected` is only the sidebar highlight.
- Adding a language: add an entry to `LANGS` (label + global regex with the
  named groups above). The header `<select>` and `decorate()` pick it up
  automatically.
- When changing behaviour, update or add tests in `test/unit/` — the suite
  exercises every button and handler through the real markup.

## Known bugs

None open. When you find one you are not fixing right away, add a test that
asserts the correct behaviour as `it.fails` in `test/unit/` and describe it
here; flip it back to `it` when it is fixed (see `test/README.md`).

Fixed regressions worth knowing about (each is pinned by a test):
page switch mid-edit wrote the old body into the new page; `commit()` keyed on
`db.selected` lost edits when a folder was highlighted and could overwrite a
right-clicked page; `beforeunload` relied on the debounced save; the HTML view
added visible whitespace to quotes/lists; `esc()` in `value="…"`; `data-lang`
reached `innerHTML` unescaped; pasted Google Docs text came out bold; Word's
`<style>` block was pasted as text.

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
