/* Small event helpers that work against a JSDOM window. */

const win = el => (el.ownerDocument ? el.ownerDocument.defaultView : el.defaultView || el);

export function click(el, init = {}) {
  const w = win(el);
  const ev = new w.MouseEvent("click", { bubbles: true, cancelable: true, ...init }); el.dispatchEvent(ev); return ev;
}
export function mousedown(el, init = {}) {
  const w = win(el);
  const ev = new w.MouseEvent("mousedown", { bubbles: true, cancelable: true, ...init }); el.dispatchEvent(ev); return ev;
}
export function mousemove(el, init = {}) {
  const w = win(el);
  const ev = new w.MouseEvent("mousemove", { bubbles: true, cancelable: true, ...init }); el.dispatchEvent(ev); return ev;
}
export function mouseup(el, init = {}) {
  const w = win(el);
  const ev = new w.MouseEvent("mouseup", { bubbles: true, cancelable: true, ...init }); el.dispatchEvent(ev); return ev;
}
export function dblclick(el, init = {}) {
  const w = win(el);
  const ev = new w.MouseEvent("dblclick", { bubbles: true, cancelable: true, ...init }); el.dispatchEvent(ev); return ev;
}
export function contextmenu(el, init = {}) {
  const w = win(el);
  const ev = new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 100, clientY: 100, ...init }); el.dispatchEvent(ev); return ev;
}
/** dispatch a keydown; returns the event so tests can inspect defaultPrevented */
export function key(el, k, init = {}) {
  const w = win(el);
  const ev = new w.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(ev);
  return ev;
}
export function input(el, value) {
  const w = win(el);
  if (value !== undefined) el.value = value;
  el.dispatchEvent(new w.Event("input", { bubbles: true }));
}
export function change(el) {
  const w = win(el);
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
}
export function focusEvent(el, type) {
  const w = win(el);
  el.dispatchEvent(new w.FocusEvent(type, { bubbles: false }));
}

/** fake DataTransfer for drag & drop (JSDOM has none) */
export function dataTransfer() {
  const data = {};
  return { data, effectAllowed: "", setData: (t, v) => { data[t] = v; }, getData: t => data[t] || "" };
}
export function dragEvent(el, type, { dt = dataTransfer(), clientY = 0, clientX = 0 } = {}) {
  const w = win(el);
  const ev = new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
  Object.defineProperty(ev, "dataTransfer", { value: dt });
  el.dispatchEvent(ev);
  return ev;
}
/** give an element a predictable box so drop-zone math works */
export function rect(el, { top = 0, height = 100, left = 0, width = 200 } = {}) {
  el.getBoundingClientRect = () => ({ top, height, left, width, bottom: top + height, right: left + width, x: left, y: top });
}
/** full drag of `from` onto `to`; yFrac is where inside `to` the pointer is (0 top … 1 bottom) */
export function drag(from, to, yFrac = 0.5) {
  const dt = dataTransfer();
  rect(to);
  dragEvent(from, "dragstart", { dt });
  dragEvent(to, "dragover", { dt, clientY: yFrac * 100 });
  dragEvent(to, "drop", { dt });
  dragEvent(from, "dragend", { dt });
}

export function paste(el, { html = "", text = "" } = {}) {
  const w = win(el);
  const ev = new w.Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "clipboardData", { value: { getData: t => (t === "text/html" ? html : text) } });
  el.dispatchEvent(ev);
  return ev;
}

/** put a collapsed caret at `node`/`offset`, or select the node's whole contents */
export function caret(node, offset) {
  const doc = node.ownerDocument;
  const w = doc.defaultView;
  const r = doc.createRange();
  if (offset === undefined) r.selectNodeContents(node);
  else { r.setStart(node, offset); r.collapse(true); }
  const s = w.getSelection(); s.removeAllRanges(); s.addRange(r);
  return r;
}

/** simulate choosing a file in the hidden <input type=file> */
export function chooseFile(inputEl, { name = "backup.json", text = "" } = {}) {
  const file = { name, text: async () => text };
  Object.defineProperty(inputEl, "files", { configurable: true, value: [file] });
  change(inputEl);
  return file;
}
