const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const { resolve } = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const root = resolve(__dirname, "..");
const source = name => readFileSync(resolve(root, name), "utf8");

test("weather messages appear on activation, not rain adjustments or repeated visits", () => {
  const messages = [];
  let starStarts = 0;
  const context = setup();
  Object.assign(context, {
    APPEARANCE: context.window.FS.appearance,
    $desktop: { dataset: {} }, rainMode: null, snowActive: false,
    print: text => messages.push(text),
    startRain(mode) { context.rainMode = mode; context.snowActive = false; },
    startSnow() { context.rainMode = null; context.snowActive = true; },
    startStars() { context.$desktop.dataset.decoration = "stars"; starStarts++; },
    resetWeather() {
      context.rainMode = null;
      context.snowActive = false;
      delete context.$desktop.dataset.decoration;
    },
  });
  const terminal = source("terminal.js");
  vm.runInContext(terminal.slice(terminal.indexOf("  function applyDirectoryAppearance("),
    terminal.indexOf("  function isFile(")), context);
  const enter = context.applyDirectoryAppearance;
  enter("/weather/rain/light");
  assert.equal(messages.length, 1);
  for (const mode of ["medium", "heavy", "changing", "light"]) enter(`/weather/rain/${mode}`);
  enter("/weather/rain");
  assert.equal(context.rainMode, "medium");
  assert.equal(messages.length, 1);
  enter("/weather/snow"); enter("/weather/snow");
  assert.equal(messages.length, 2);
  enter("/weather/rain/light");
  assert.equal(messages.length, 3);
  enter("/weather/shining-for-you"); enter("/weather/shining-for-you");
  assert.equal(messages.length, 4);
  assert.equal(starStarts, 1);
  enter("/weather/reset");
  enter("/weather/rain/heavy"); enter("/weather/shining-for-you");
  assert.equal(messages.length, 6);
  // Existing rain (including rain started by a song) is an adjustment, not an entry.
  enter("/weather/rain/light");
  assert.equal(messages.length, 6);
});

test("ls never allocates empty columns or lets ragged columns shift filenames", () => {
  let html;
  const context = vm.createContext({
    charWidthPx: () => 8,
    terminalWidthPx: () => 700,
    printHTML: value => { html = value; },
  });
  const terminal = source("terminal.js");
  vm.runInContext(terminal.slice(terminal.indexOf("  function renderLsGrid("),
    terminal.indexOf("  // 2. OUTPUT")), context);
  for (let count = 1; count <= 25; count++) {
    const entries = Array.from({ length: count }, (_, index) => ({
      html: `file-${index}`, widthPx: index % 3 === 0 ? 190 : 120,
    }));
    context.renderLsGrid(entries);
    const widths = html.match(/grid-template-columns:([^"]+)/)[1].split(" ").map(parseFloat);
    assert(widths.every(width => width > 0));
    assert(widths.reduce((a, b) => a + b, 0) + 16 * (widths.length - 1) <= 700);
    const cells = [...html.matchAll(/grid-column:(\d+);grid-row:(\d+)">file-(\d+)/g)];
    assert.equal(cells.length, count);
    const positions = new Set();
    for (const [, column, row, index] of cells) {
      assert(!positions.has(`${column}:${row}`));
      positions.add(`${column}:${row}`);
      assert(widths[Number(column) - 1] >= entries[Number(index)].widthPx);
    }
  }
});

function setup(fetch) {
  const context = vm.createContext({ window: {}, fetch });
  for (const file of ["fs.js", "content-index.js", "content-loader.js"]) vm.runInContext(source(file), context);
  return context;
}

test("generated entries preserve all readable paths and media sources exist", async () => {
  const context = setup(async url => {
    const path = decodeURIComponent(url.split("?")[0]);
    return { ok: true, text: async () => source(path) };
  });
  const { files, readFile } = context.window.FS;
  assert(files["/books/罐头厂街.md"]);
  assert(files["/weather/rain/readme.md"]);
  assert(!files["/weather/rain/light/readme.md"]);
  assert(files["/readme.md"]);
  for (const [path, file] of Object.entries(files)) {
    if (file.type === "text") {
      assert.equal(await readFile(path), source(file.src));
      assert.equal(typeof file.content, "undefined");
    }
    for (const entry of file.tracks || [file]) if (entry.src) assert(existsSync(resolve(root, entry.src)), entry.src);
  }
});

test("loader encodes filenames, shares pending reads, and retries after failures", async () => {
  let requests = 0;
  let requestedUrl;
  const context = setup(async url => {
    requestedUrl = url;
    requests++;
    return requests === 1 ? { ok: false, status: 404 } : { ok: true, text: async () => "# 正文" };
  });
  const { files, readFile } = context.window.FS;
  const path = "/books/空 格#问号?.md";
  files[path] = { type: "text", src: "content/books/空 格#问号?.md", revision: "abc" };
  const first = readFile(path);
  assert.equal(first, readFile(path));
  await assert.rejects(first, /404/);
  assert.match(requestedUrl, /%20/);
  assert.match(requestedUrl, /%23/);
  assert.match(requestedUrl, /%3F/);
  assert(requestedUrl.endsWith("?v=abc"));
  assert.equal(await readFile(path), "# 正文");
  assert.equal(await readFile(path), "# 正文");
  assert.equal(requests, 2);
  await assert.rejects(readFile("/missing.md"), /没有这个文件/);
  await assert.rejects(readFile("/playlist/By-the-Campfire"), /不是文本文件/);
});

test("photos render inline, load captions, open on click and clean up every close route", async () => {
  const context = setup(async () => ({ ok: true, text: async () => "**原样说明** <script>" }));
  const outputs = [];
  const keyHandlers = new Set();
  let focused;
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.attributes = {}; this.isConnected = true; }
    appendChild(child) { this.children.push(child); child.parent = this; }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, fn) { (this.listeners[name] ||= new Set()).add(fn); }
    fire(name, data = {}) {
      for (const fn of this.listeners[name] || []) fn({ target: this, stopPropagation() {}, preventDefault() {}, ...data });
    }
    remove() { this.isConnected = false; this.parent.children = this.parent.children.filter(child => child !== this); }
    focus() { focused = this; }
    querySelector(selector) { if (selector === ".photo-close") return this.closeButton; }
    set innerHTML(html) {
      this.html = html;
      if (html.includes("photo-close")) { this.closeButton = new Element("button"); this.appendChild(this.closeButton); }
    }
  }
  const body = new Element("body");
  Object.assign(context, {
    document: {
      body, createElement: tag => new Element(tag),
      addEventListener(name, fn) { assert.equal(name, "keydown"); keyHandlers.add(fn); },
      removeEventListener(name, fn) { keyHandlers.delete(fn); },
    },
    row() { const node = new Element("div"); outputs.push(node); return node; },
    basename: path => path.split("/").at(-1),
    focusInput() { focused = "input"; },
  });
  const terminal = source("terminal.js");
  vm.runInContext(`
    const FILES = window.FS.files;
    ${terminal.slice(terminal.indexOf("  function esc("), terminal.indexOf("  // ---------- 路径处理"))}
    ${terminal.slice(terminal.indexOf("  function renderPhoto("), terminal.indexOf("  let rainSongSky"))}
    this.renderPhoto = renderPhoto;
  `, context);
  context.window.FS.files["/water/小鱼.txt"] = { type: "text", src: "caption.txt", format: "text" };
  const file = { type: "image", src: "content/water/小鱼 #1.jpg", revision: "abc", caption: "/water/小鱼.txt" };
  context.renderPhoto(file, "/water/小鱼 #1.jpg");
  assert.equal(body.children.length, 0, "cat should not open the overlay automatically");
  const figure = outputs[0].children[0];
  const [button, status, caption] = figure.children;
  const image = button.children[0];
  assert(image.src.includes("%20%231.jpg?v=abc"));
  assert(button.disabled);
  image.fire("load");
  assert(!button.disabled);
  assert(status.hidden);
  assert.equal(image.className, "photo-image is-loaded");
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.equal(caption.textContent, "**原样说明** <script>");
  context.renderPhoto({ type: "image", src: "note.png", photoCaption: "猫猫 <script>" }, "/water/note.png");
  const note = outputs.at(-1).children[0].children.at(-1);
  assert.equal(note.className, "photo-note");
  assert.equal(note.textContent, "猫猫 <script>");
  for (const route of ["button", "escape", "backdrop"]) {
    button.fire("click");
    const overlay = body.children[0];
    assert.equal(overlay.attributes.role, "dialog");
    assert.equal(keyHandlers.size, 1);
    if (route === "button") overlay.closeButton.fire("click");
    else if (route === "escape") for (const handler of [...keyHandlers]) handler({ key: "Escape", preventDefault() {} });
    else overlay.fire("click");
    assert.equal(body.children.length, 0);
    assert.equal(keyHandlers.size, 0);
    assert.equal(focused, button);
  }
  context.renderPhoto({ type: "image", src: "missing.jpg" }, "/water/missing.jpg");
  const [failedButton, failedStatus] = outputs[1].children[0].children;
  failedButton.children[0].fire("error");
  assert(failedButton.hidden);
  assert.match(failedStatus.textContent, /无法加载/);
});

test("water browser previews immediately, switches panes and preserves command input", async () => {
  class Element {
    constructor() {
      this.children = []; this.attributes = {}; this.handlers = {};
      this.isConnected = true;
      this.clientWidth = 600;
      this.style = { setProperty: (key, value) => { this.style[key] = value; } };
      const classes = new Set();
      this.classList = { add: value => classes.add(value), remove: value => classes.delete(value),
        toggle: (value, active) => active ? classes.add(value) : classes.delete(value),
        contains: value => classes.has(value) };
    }
    appendChild(child) {
      if (child.parent) child.remove();
      this.children.push(child); child.parent = this;
    }
    insertBefore(child, before) {
      child.parent = this; this.children.splice(this.children.indexOf(before), 0, child);
    }
    remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(key, fn) { this.handlers[key] = fn; }
    scrollIntoView() {}
    scrollBy({ top }) { this.scrollTop = Math.max(0, (this.scrollTop || 0) + top); }
    replaceChildren() { this.children = []; }
    set innerHTML(value) {
      this.list = new Element(); this.detail = new Element();
      this.appendChild(this.list); this.appendChild(this.detail);
    }
    querySelector(selector) { return selector === ".water-list" ? this.list : this.detail; }
  }
  const terminal = new Element(), output = new Element(), inputLine = new Element();
  terminal.appendChild(output); terminal.appendChild(inputLine);
  const rendered = [];
  const input = { value: "" }, state = { cwd: "/water" };
  const files = { "/water/a.png": { type: "image" }, "/water/b.jpg": { type: "image" },
    "/water/a.md": { type: "text", internal: true }, "/ink/c.png": { type: "image" } };
  const context = vm.createContext({ document: { createElement: () => new Element() },
    $terminal: terminal, $output: output, $inputLine: inputLine, $input: input, state, FILES: files,
    isFile: path => !!files[path] && !files[path].internal, esc: value => value,
    basename: path => path.split("/").pop(), focusInput() {}, syncCaret() {}, scrollDown() {},
    Image: class {
      set src(value) {
        this.naturalWidth = value.includes("01.png") ? 800 : 300;
        this.naturalHeight = value.includes("01.png") ? 400 : 600;
        Promise.resolve().then(() => this.onload());
      }
    },
    window: { FS: { readFile: async () => "正文只出现一次", assetURL: file => file.src } },
    renderMarkdown: (text, target) => { target.textContent = text; },
    renderPhoto: (file, path, mount) => {
      rendered.push({ file, path, mount });
      mount.appendChild(new Element());
    } });
  const code = source("terminal.js");
  vm.runInContext(`let waterBrowser = null; const waterPhotoRatios = new Map();
    ${code.slice(code.indexOf("  function syncWaterBrowser("), code.indexOf("  function renderPhoto("))}
    this.browser = () => waterBrowser;`, context);
  const key = (name, extra = {}) => context.handleWaterKey({ key: name, preventDefault() {}, ...extra });
  context.syncWaterBrowser();
  assert(terminal.classList.contains("water-mode"));
  assert.equal(context.browser().paths.length, 2);
  assert.equal(rendered[0].path, "/water/b.jpg");
  key("ArrowDown");
  assert.equal(context.browser().selected, 1);
  assert.equal(rendered.length, 2);
  assert.equal(key("Enter"), false);
  assert.equal(rendered.at(-1).path, "/water/a.png");
  key("ArrowRight");
  assert.equal(context.browser().focus, "detail");
  assert(context.browser().detail.classList.contains("is-focused"));
  key("ArrowDown");
  assert.equal(context.browser().detail.scrollTop, 60);
  assert.equal(context.browser().selected, 1);
  assert.equal(rendered.length, 2);
  key("ArrowUp");
  assert.equal(context.browser().detail.scrollTop, 0);
  key("ArrowLeft");
  assert.equal(context.browser().focus, "list");
  assert(context.browser().list.classList.contains("is-focused"));
  input.value = "cd ..";
  assert.equal(key("ArrowUp"), false);
  assert.equal(key("ArrowRight"), false);
  assert.equal(key("Enter"), false);
  input.value = "";
  assert.equal(key("Enter", { isComposing: true }), false);
  assert.equal(key("ArrowUp", { ctrlKey: true }), false);
  context.syncWaterBrowser();
  assert.equal(rendered.length, 2); // Failed cd / other commands don't reset the selection.
  const logRow = new Element();
  context.browser().log.appendChild(logRow);
  state.cwd = "/books";
  context.syncWaterBrowser();
  assert.equal(context.browser(), null);
  assert(!terminal.classList.contains("water-mode"));
  assert(output.children.includes(logRow));
  assert.equal(terminal.children.length, 2);
  assert.equal(key("ArrowUp"), false);
  files["/water/entry/01.png"] = { type: "image", src: "01.png", photoOrder: 1, article: "/water/entry/readme.md", caption: "legacy.md" };
  files["/water/entry/02.png"] = { type: "image", src: "02.png", photoOrder: 0, article: "/water/entry/readme.md" };
  state.cwd = "/water";
  context.syncWaterBrowser();
  assert.equal(context.browser().entries.length, 3);
  assert.equal(context.browser().buttons[0].textContent, "entry");
  context.openWaterPhoto("/water/entry/02.png");
  assert.equal(context.browser().selected, 0);
  assert.equal(rendered.at(-1).path, "/water/entry/02.png");
  assert.equal(rendered.at(-1).file.caption, undefined);
  assert.equal(context.browser().detail.children.length, 3);
  const stage = context.browser().detail.children[0];
  const controls = context.browser().detail.children[1];
  assert.equal(stage.children.length, 1);
  assert.equal(controls.children[1].textContent, "1 / 2");
  controls.children[2].handlers.click({ stopPropagation() {} });
  assert.equal(rendered.at(-1).path, "/water/entry/01.png");
  assert.equal(stage.children.length, 1);
  assert.equal(controls.children[1].textContent, "2 / 2");
  controls.children[2].handlers.click({ stopPropagation() {} });
  assert.equal(rendered.at(-1).path, "/water/entry/02.png");
  controls.children[0].handlers.click({ stopPropagation() {} });
  assert.equal(rendered.at(-1).path, "/water/entry/01.png");
  assert.equal(key("]"), false);
  assert.equal(key("["), false);
  assert.equal(rendered.at(-1).path, "/water/entry/01.png");
  const photoFocus = context.browser().focus;
  key("ArrowRight", { shiftKey: true });
  assert.equal(rendered.at(-1).path, "/water/entry/02.png");
  key("ArrowLeft", { shiftKey: true });
  assert.equal(rendered.at(-1).path, "/water/entry/01.png");
  assert.equal(context.browser().focus, photoFocus);
  assert.equal(key("]", { isComposing: true }), false);
  input.value = "cat ";
  assert.equal(key("["), false);
  assert.equal(key("ArrowLeft", { shiftKey: true }), true);
  assert.equal(rendered.at(-1).path, "/water/entry/02.png");
  assert.equal(input.value, "cat ");
  input.value = "";
  const article = context.browser().detail.children.at(-1);
  assert.equal(article.className, "water-article photo-caption");
  await Promise.resolve();
  assert.equal(article.textContent, "正文只出现一次");
  for (let i = 0; i < 4; i++) await Promise.resolve();
  assert.equal(stage.style["--water-photo-height"], "min(var(--water-photo-cap), 300px)");
  stage.clientWidth = 400;
  context.browser().resizePhotos();
  assert.equal(stage.style["--water-photo-height"], "min(var(--water-photo-cap), 200px)");
  state.cwd = "/water/empty";
  context.syncWaterBrowser();
  assert.equal(context.browser().paths.length, 0);
  assert.equal(key("Enter"), false);
  assert.equal(key("ArrowDown"), true);
});

test("cat preserves glob order, escapes Markdown and renders txt literally", async () => {
  const pending = new Map();
  const context = setup(url => new Promise(resolve => pending.set(decodeURIComponent(url.split("?")[0]), resolve)));
  const output = [];
  context.row = (html, cls = "") => {
    const node = { innerHTML: html, className: cls, isConnected: true };
    output.push(node);
    return node;
  };
  context.print = (text, cls) => context.row(text, cls);
  context.printErr = text => context.row(text, "bad");
  context.printHTML = context.row;
  context.printBlank = () => context.row("");
  const terminal = source("terminal.js");
  const cat = terminal.slice(terminal.indexOf("    cat: {"), terminal.indexOf("    play: {"));
  vm.runInContext(`
    const FILES = window.FS.files;
    const APPEARANCE = window.FS.appearance;
    const state = { cwd: '/', prevCwd: '/' };
    ${terminal.slice(terminal.indexOf("  function esc("), terminal.indexOf("  let starsGenerated"))}
    ${terminal.slice(terminal.indexOf("  function isFile("), terminal.indexOf("  function charWidth("))}
    ${terminal.slice(terminal.indexOf("  function renderMarkdown("), terminal.indexOf("  function renderASCII("))}
    const commands = { ${cat} };
    this.cat = commands.cat;
    this.listDir = listDir;
    this.isDir = isDir;
    this.expandDirGlob = expandDirGlob;
    this.expandFileGlobs = expandFileGlobs;
    this.isFile = isFile;
  `, context);
  assert(!context.listDir("/").includes(".diary"));
  assert(context.listDir("/", true).includes(".diary"));
  assert(context.listDir("/books").includes("罐头厂街.md"));
  assert.deepEqual(Array.from(context.listDir("/weather/rain")).sort(),
    ["changing", "heavy", "light", "medium", "readme.md"]);
  for (const mode of ["light", "medium", "heavy", "changing"]) {
    assert(context.isDir(`/weather/rain/${mode}`));
    assert.equal(context.listDir(`/weather/rain/${mode}`).length, 0);
    assert(context.expandDirGlob("/weather/rain/*").includes(`/weather/rain/${mode}`));
    assert.equal(context.window.FS.appearance[`/weather/rain/${mode}`].rain, mode);
  }
  const files = context.window.FS.files;
  files["/water/example.jpg"] = { type: "image", src: "example.jpg" };
  files["/water/example.md"] = { type: "text", internal: true };
  files["/water/notes/unused.txt"] = { type: "text", internal: true };
  const pocketNames = Array.from(context.listDir("/water", true));
  assert(pocketNames.includes("example.jpg"));
  assert(!pocketNames.includes("example.md"));
  assert(!pocketNames.includes("notes"));
  assert(!context.isFile("/water/example.md"));
  assert(!context.isDir("/water/notes"));
  assert(context.expandFileGlobs(["/water/*"]).every(item => files[item.path].type === "image"));
  files["/test/1.md"] = { type: "text", src: "1.md", format: "markdown" };
  files["/test/2.txt"] = { type: "text", src: "2.txt", format: "text" };
  context.cat.run(["/test/*"]);
  const slots = output.filter(node => node.innerHTML === "读取中…");
  assert.equal(slots.length, 2);
  pending.get("2.txt")({ ok: true, text: async () => "**literal** <script>" });
  pending.get("1.md")({ ok: true, text: async () => "# 标题\n**粗体** <script>" });
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.match(slots[0].innerHTML, /class="h1">标题/);
  assert.match(slots[0].innerHTML, /class="bold">粗体/);
  assert(slots[0].innerHTML.includes("&lt;script&gt;"));
  assert.equal(slots[1].textContent, "**literal** <script>");
  assert(output.indexOf(slots[0]) < output.indexOf(slots[1]));
  files["/test/error.md"] = { type: "text", src: "error.md" };
  context.cat.run(["/test/error.md"]);
  pending.get("error.md")({ ok: false, status: 503 });
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.equal(output.at(-1).className, "row bad");
  assert.match(output.at(-1).textContent, /503/);
});
