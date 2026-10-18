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
