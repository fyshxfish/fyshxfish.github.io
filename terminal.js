/* ========================================================================
 * 终端引擎 + 全部命令
 * ------------------------------------------------------------------------
 * 文件结构:
 *   1. utils       — 工具函数 & 文件系统辅助
 *   2. output      — 输出渲染
 *   3. input       — 输入处理、历史、Tab 补全
 *   4. commands    — 所有命令实现 (Tier 1/2/3)
 *   5. boot & init — 开机过场 & 初始化
 * ====================================================================== */
(function () {
  "use strict";

  const SITE = window.SITE || { user: "visitor", host: "home" };
  const FILES = (window.FS && window.FS.files) || {};
  const BOOT_TS = Date.now();

  // ====================================================================
  // 1. UTILS
  // ====================================================================
  const $output    = document.getElementById("output");
  const $inputLine = document.getElementById("inputLine");
  const $input     = document.getElementById("input");
  const $prompt    = document.getElementById("prompt");
  const $terminal  = document.getElementById("terminal");
  const $caret     = document.querySelector(".caret");

  const state = {
    cwd: "/",
    prevCwd: "/",
    history: JSON.parse(localStorage.getItem("th-history") || "[]"),
    historyIdx: -1,
    sudoFails: 0,
    multiline: null,   // { lines: [], target: "message" }
    konami: "",
  };

  const KONAMI = "ArrowUpArrowUpArrowDownArrowDownArrowLeftArrowRightArrowLeftArrowRightba";

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // ---------- 路径处理 ----------
  function normalize(path) {
    if (!path) return state.cwd;
    if (path === "~") return "/";
    if (path === "-") return state.prevCwd;
    let abs = path.startsWith("/") ? path : (state.cwd === "/" ? "/" + path : state.cwd + "/" + path);
    const parts = abs.split("/").filter(Boolean);
    const stack = [];
    for (const p of parts) {
      if (p === ".") continue;
      if (p === "..") stack.pop();
      else stack.push(p);
    }
    return "/" + stack.join("/");
  }

  function isFile(p) {
    return Object.prototype.hasOwnProperty.call(FILES, p);
  }

  function isDir(p) {
    if (p === "/") return true;
    const prefix = (p.endsWith("/") ? p : p + "/");
    return Object.keys(FILES).some(k => k.startsWith(prefix));
  }

  function listDir(p, showHidden = false) {
    if (!isDir(p)) return null;
    const prefix = p === "/" ? "/" : p + "/";
    const set = new Set();
    for (const k of Object.keys(FILES)) {
      if (!k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length);
      const first = rest.split("/")[0];
      if (!first) continue;
      if (!showHidden && first.startsWith(".")) continue;
      set.add(first);
    }
    return [...set].sort((a, b) => {
      const ad = isDir(prefix + a), bd = isDir(prefix + b);
      if (ad !== bd) return ad ? -1 : 1;
      return a.localeCompare(b);
    });
  }

  function basename(p) {
    if (p === "/") return "/";
    const parts = p.split("/").filter(Boolean);
    return parts[parts.length - 1] || "/";
  }

  function entryKind(p) {
    if (isDir(p)) return "dir";
    if (!isFile(p)) return null;
    const f = FILES[p];
    if (f.type === "image") return "image";
    return "file";
  }

  // ====================================================================
  // 2. OUTPUT
  // ====================================================================
  function buildPromptHTML() {
    if (state.multiline) {
      return `<span class="prompt"><span class="path">&gt;</span><span class="dollar"> </span></span>`;
    }
    const path = state.cwd === "/" ? "~" : "~" + state.cwd;
    return (
      `<span class="prompt">` +
        `<span>${esc(SITE.user)}</span>` +
        `<span class="at">@</span>` +
        `<span class="host">${esc(SITE.host)}</span>` +
        `<span class="sep">:</span>` +
        `<span class="path">${esc(path)}</span>` +
        `<span class="dollar">$ </span>` +
      `</span>`
    );
  }

  function updatePrompt() {
    $prompt.innerHTML = buildPromptHTML();
  }

  function row(html, cls = "") {
    const div = document.createElement("div");
    div.className = "row " + cls;
    div.innerHTML = html;
    $output.appendChild(div);
    scrollDown();
    return div;
  }

  function print(text, cls = "") {
    row(esc(text), cls);
  }

  function printHTML(html, cls = "") {
    row(html, cls);
  }

  function printErr(text) {
    print(text, "bad");
  }

  function printBlank() {
    row("&nbsp;");
  }

  function scrollDown() {
    $terminal.scrollTop = $terminal.scrollHeight;
  }

  function echoCommand(cmd) {
    row(buildPromptHTML() + `<span class="typed">${esc(cmd)}</span>`, "cmd-echo");
  }

  // ====================================================================
  // 3. INPUT
  // ====================================================================
  function setInputValue(v) {
    $input.value = v;
    syncCaret();
  }

  function syncCaret() {
    // 简化版: caret 跟在输入文本末端
    requestAnimationFrame(() => {
      const measure = document.createElement("span");
      measure.style.visibility = "hidden";
      measure.style.position = "absolute";
      measure.style.font = getComputedStyle($input).font;
      measure.style.whiteSpace = "pre";
      measure.textContent = $input.value.slice(0, $input.selectionStart || $input.value.length);
      document.body.appendChild(measure);
      const w = measure.offsetWidth;
      measure.remove();
      if ($caret) $caret.style.left = w + "px";
    });
  }

  function focusInput() {
    $input.focus();
    syncCaret();
  }

  function commitHistory(cmd) {
    if (!cmd.trim()) return;
    state.history.push(cmd);
    if (state.history.length > 200) state.history.shift();
    state.historyIdx = state.history.length;
    try { localStorage.setItem("th-history", JSON.stringify(state.history)); } catch {}
  }

  function tabComplete() {
    const v = $input.value;
    const m = v.match(/^(\S*)$/) || v.match(/(\S+)$/);
    if (!m) return;
    const last = m[1];
    if (!last) return;

    // 命令补全 (光标在第一个 token)
    const firstTokenOnly = !/\s/.test(v);
    if (firstTokenOnly) {
      const candidates = Object.keys(commands).filter(c => c.startsWith(last));
      return finishTab(v, last, candidates);
    }

    // 路径补全
    let dir, prefix;
    const slash = last.lastIndexOf("/");
    if (slash >= 0) {
      dir    = normalize(last.slice(0, slash) || "/");
      prefix = last.slice(slash + 1);
    } else {
      dir    = state.cwd;
      prefix = last;
    }
    const items = listDir(dir, prefix.startsWith(".")) || [];
    const cands = items.filter(x => x.startsWith(prefix));
    finishTab(v, last, cands.map(c => (slash >= 0 ? last.slice(0, slash + 1) : "") + c));
  }

  function finishTab(v, last, cands) {
    if (cands.length === 0) return;
    if (cands.length === 1) {
      const next = cands[0];
      const completed = v.slice(0, v.length - last.length) + next;
      const isD = next.includes("/") ? isDir(normalize(next)) : isDir(normalize(next));
      setInputValue(completed + (isD && !completed.endsWith("/") ? "/" : " "));
      return;
    }
    echoCommand($input.value);
    printHTML(cands.map(c => `<span class="dim">${esc(c)}</span>`).join("   "));
    // 共同前缀
    const lcp = cands.reduce((a, b) => {
      let i = 0;
      while (i < a.length && i < b.length && a[i] === b[i]) i++;
      return a.slice(0, i);
    });
    if (lcp.length > last.length) {
      setInputValue(v.slice(0, v.length - last.length) + lcp);
    }
  }

  // ---------- 主键盘处理 ----------
  function onKeyDown(e) {
    // Konami
    state.konami = (state.konami + e.key).slice(-KONAMI.length);
    if (state.konami === KONAMI) {
      state.konami = "";
      konamiEgg();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const cmd = $input.value;
      handleLine(cmd);
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      tabComplete();
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (state.history.length === 0) return;
      state.historyIdx = Math.max(0, state.historyIdx - 1);
      setInputValue(state.history[state.historyIdx] || "");
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (state.history.length === 0) return;
      state.historyIdx = Math.min(state.history.length, state.historyIdx + 1);
      setInputValue(state.history[state.historyIdx] || "");
      return;
    }

    if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commands.clear.run();
      return;
    }

    if (e.key === "c" && e.ctrlKey) {
      e.preventDefault();
      echoCommand($input.value + "^C");
      setInputValue("");
      if (state.multiline) {
        print("(已取消)", "dim");
        state.multiline = null;
        updatePrompt();
      }
      return;
    }

    setTimeout(syncCaret, 0);
  }

  function handleLine(line) {
    // multiline 模式 (message 输入中)
    if (state.multiline) {
      handleMultiline(line);
      setInputValue("");
      return;
    }

    echoCommand(line);
    commitHistory(line);
    setInputValue("");

    const trimmed = line.trim();
    if (!trimmed) return;
    runCommand(trimmed);
  }

  function runCommand(line) {
    const tokens = tokenize(line);
    const name = tokens[0];
    const args = tokens.slice(1);

    if (commands[name]) {
      try { commands[name].run(args, line); }
      catch (err) { printErr("出错了: " + err.message); }
      return;
    }

    // 特殊匹配
    if (name === "sudo")       return commands.sudo.run(args, line);
    if (line === "rm -rf /")   return commands["rm-rf"].run([], line);
    if (name === ":wq" || name === ":q" || name === ":q!") {
      print("你不在 vim 里 — 不过我替你按了 :q。", "dim"); return;
    }

    printErr(`${name}: command not found`);
    printHTML(`<span class="dim">输入 <span class="kw">help</span> 看可用命令.</span>`);
  }

  function tokenize(line) {
    const out = []; let cur = ""; let q = null;
    for (const ch of line) {
      if (q) {
        if (ch === q) { q = null; continue; }
        cur += ch;
      } else if (ch === '"' || ch === "'") q = ch;
      else if (/\s/.test(ch)) { if (cur) { out.push(cur); cur = ""; } }
      else cur += ch;
    }
    if (cur) out.push(cur);
    return out;
  }

  // ====================================================================
  // 4. COMMANDS
  // ====================================================================
  const commands = {

    // ---------- Tier 1: 基本导航 ----------
    help: {
      desc: "显示这份帮助",
      run() {
        printHTML(`<span class="h1">visitor@${esc(SITE.host)}</span> &nbsp; <span class="dim">— a tiny terminal homepage</span>`);
        printBlank();
        printHTML(`<span class="h2">基础</span>`);
        const tier1 = [
          ["ls [-a] [path]",     "列出目录内容"],
          ["cd <path>",          "进入目录 (cd / cd .. / cd ~ / cd -)"],
          ["cat <file>",         "查看文件"],
          ["pwd",                "当前路径"],
          ["tree [path]",        "目录树"],
          ["clear",              "清屏 (Ctrl+L)"],
          ["echo <text>",        "输出文字"],
          ["help",               "看这份帮助"],
        ];
        printHTML(renderHelpTable(tier1));
        printBlank();
        printHTML(`<span class="h2">我</span>`);
        printHTML(renderHelpTable([
          ["whoami",     "一份非正式的自我介绍"],
          ["neofetch",   "看一眼系统(?)信息"],
          ["history",    "人生大事记 (不是命令历史)"],
          ["contact",    "联系方式"],
          ["message",    "在终端里给我留句话"],
        ]));
        printBlank();
        printHTML(`<span class="dim">还有一些不写在 help 里的命令, 也许你的肌肉记忆会带你找到它们.</span>`);
      },
    },

    ls: {
      desc: "列目录",
      run(args) {
        const showHidden = args.some(a => a === "-a" || a === "-la" || a === "-al");
        const longForm   = args.some(a => a === "-l" || a === "-la" || a === "-al");
        const target = normalize(args.find(a => !a.startsWith("-")) || state.cwd);

        if (!isDir(target)) {
          if (isFile(target)) return print(basename(target));
          return printErr(`ls: ${target}: 没有这个目录`);
        }

        const items = listDir(target, showHidden) || [];
        if (items.length === 0) return print("(空)", "dim");

        if (longForm) {
          const rows = items.map(name => {
            const full = (target === "/" ? "/" : target + "/") + name;
            const k = entryKind(full);
            const cls = name.startsWith(".") ? "hidden"
                     : k === "dir"   ? "dir"
                     : k === "image" ? "image"
                     : "file";
            const tag = k === "dir" ? "d" : k === "image" ? "i" : "-";
            return `<span class="dim">${tag}rwxr-xr-x</span>  <span class="${cls}">${esc(name)}${k==="dir"?"/":""}</span>`;
          });
          return printHTML(rows.join("<br>"));
        }

        const cells = items.map(name => {
          const full = (target === "/" ? "/" : target + "/") + name;
          const k = entryKind(full);
          const cls = name.startsWith(".") ? "hidden"
                   : k === "dir"   ? "dir"
                   : k === "image" ? "image"
                   : "file";
          const suf = k === "dir" ? "/" : "";
          return `<span class="${cls}">${esc(name)}${suf}</span>`;
        });
        printHTML(`<div class="ls-grid">${cells.map(c => `<div>${c}</div>`).join("")}</div>`);
      },
    },

    cd: {
      desc: "切目录",
      run(args) {
        const target = normalize(args[0] || "~");
        if (!isDir(target)) return printErr(`cd: ${target}: 不是目录`);
        state.prevCwd = state.cwd;
        state.cwd = target;
        updatePrompt();
      },
    },

    pwd: {
      desc: "当前路径",
      run() { print(state.cwd); },
    },

    cat: {
      desc: "看文件",
      run(args) {
        if (args.length === 0) return printErr("cat: 给个文件名");
        for (const a of args) {
          const p = normalize(a);
          if (!isFile(p)) {
            if (isDir(p)) { printErr(`cat: ${a}: 是目录`); continue; }
            printErr(`cat: ${a}: 没有这个文件`); continue;
          }
          const f = FILES[p];
          if (f.type === "image") {
            showImage(f.src, a);
            print(`(已弹出 ${a})`, "dim");
            continue;
          }
          renderMarkdown(f.content || "");
        }
      },
    },

    tree: {
      desc: "目录树",
      run(args) {
        const root = normalize(args[0] || state.cwd);
        if (!isDir(root)) return printErr("tree: 不是目录");
        const lines = [];
        function rec(p, prefix) {
          const items = listDir(p, false) || [];
          items.forEach((name, i) => {
            const last = i === items.length - 1;
            const full = (p === "/" ? "/" : p + "/") + name;
            const isD = isDir(full);
            const cls = isD ? "dir" : "file";
            const branch = last ? "└── " : "├── ";
            lines.push(`<span class="tree">${esc(prefix + branch)}</span><span class="${cls} name">${esc(name)}${isD?"/":""}</span>`);
            if (isD) rec(full, prefix + (last ? "    " : "│   "));
          });
        }
        printHTML(`<span class="dir">${esc(root)}</span>`);
        rec(root, "");
        lines.forEach(l => printHTML(l));
      },
    },

    clear: {
      desc: "清屏",
      run() { $output.innerHTML = ""; },
    },
    cls: { desc: "清屏", run() { commands.clear.run(); } },

    echo: {
      desc: "输出",
      run(args, raw) {
        const text = raw.replace(/^echo\s*/, "");
        print(text);
      },
    },

    find: {
      desc: "查找",
      run(args) {
        const pattern = args.find(a => !a.startsWith("/")) || "";
        const root = args.find(a => a.startsWith("/")) || state.cwd;
        const matches = Object.keys(FILES)
          .filter(p => p.startsWith(root === "/" ? "/" : root + "/") || p === root)
          .filter(p => !pattern || basename(p).includes(pattern));
        if (matches.length === 0) print("(无匹配)", "dim");
        matches.forEach(m => printHTML(`<span class="file">${esc(m)}</span>`));
      },
    },

    grep: {
      desc: "搜索内容",
      run(args) {
        if (args.length === 0) return printErr("grep: 用法 grep <pattern>");
        const pat = args[0];
        const hits = [];
        for (const [path, f] of Object.entries(FILES)) {
          if (!f.content) continue;
          f.content.split("\n").forEach((line, i) => {
            if (line.includes(pat)) {
              hits.push(`<span class="dim">${esc(path)}:${i+1}:</span> ${esc(line).replace(esc(pat), `<span class="bad bold">${esc(pat)}</span>`)}`);
            }
          });
        }
        if (hits.length === 0) print("(无匹配)", "dim");
        hits.forEach(h => printHTML(h));
      },
    },

    which: {
      desc: "命令在哪",
      run(args) {
        const c = args[0];
        if (!c) return printErr("which: 给个命令名");
        if (commands[c]) print(`/usr/bin/${c}`, "note");
        else printErr(`${c}: not found`);
      },
    },

    man: {
      desc: "手册页",
      run(args) {
        if (!args[0]) return print("用法: man <name>. 试试 `man you`?", "dim");
        const t = args[0];
        if (t === "you" || t === "me") {
          renderMarkdown(`
# MAN(1)                          PERSONAL MANUAL

## NAME

  ${SITE.user} — 一个人

## SYNOPSIS

  ${SITE.user} [--coffee] [--awake] [--in-the-mood]

## DESCRIPTION

  一个还在路上的人。
  喜欢把简单的东西做得有意思一点,
  也喜欢把复杂的东西讲到自己听得懂。

## OPTIONS

  --coffee        启动前请先注入此参数, 否则行为未定义
  --awake         可选. 早上 11 点前不保证生效
  --in-the-mood   可遇不可求

## BUGS

  情绪偶尔抖动, 但通常 12 小时内自愈.

## SEE ALSO

  whoami(1), neofetch(1), message(1)
          `.trim());
          return;
        }
        if (commands[t]) {
          renderMarkdown(`# ${t}(1)\n\n${commands[t].desc || "(无描述)"}\n`);
          return;
        }
        printErr(`man: 没有关于 ${t} 的条目`);
      },
    },

    // ---------- Tier 2: 身份信息 ----------
    whoami: {
      desc: "自我介绍",
      run() {
        renderMarkdown(`
# ${SITE.user}@${SITE.host}

非要描述的话, 大概是这样一个人:

  - 还在学, 也还在学怎么学.
  - 喜欢一切**会动**的东西 — 程序、想法、车、人.
  - 相信慢慢做完的小东西比赶出来的大东西更值钱.

更多藏在隐藏文件里. 试试 \`ls -a\` 或者 \`cat .about-me\`.
        `.trim());
      },
    },

    whoarewe: {
      desc: "我们是谁",
      run() { print("都是宇宙里的同行旅客，凑巧在这一行命令里相遇。", "note"); },
    },

    neofetch: {
      desc: "系统信息",
      run() {
        const uptimeMs = Date.now() - BOOT_TS;
        const uptime = formatDuration(uptimeMs);
        const lines = [
          `<span class="kw">${SITE.user}@${SITE.host}</span>`,
          `<span class="dim">${"-".repeat((SITE.user + "@" + SITE.host).length)}</span>`,
          `<span class="dim">OS:        </span>Browser`,
          `<span class="dim">Host:      </span>${SITE.host}.github.io`,
          `<span class="dim">Kernel:    </span>JavaScript 6.x`,
          `<span class="dim">Uptime:    </span>${uptime}`,
          `<span class="dim">Packages:  </span>curiosity, snacks, cats`,
          `<span class="dim">Shell:     </span>terminal-home`,
          `<span class="dim">Terminal:  </span>your browser`,
          `<span class="dim">CPU:       </span>fingers @ 4.0 GHz`,
          `<span class="dim">Memory:    </span>7% used`,
          `<span class="dim">Theme:     </span>${document.body.dataset.theme}`,
        ];
        const art = (SITE.ascii || []).map(esc);
        const maxLines = Math.max(art.length, lines.length);
        const rows = [];
        for (let i = 0; i < maxLines; i++) {
          const a = art[i] || " ".repeat(15);
          const b = lines[i] || "";
          rows.push(`<span class="ascii">${esc(a)}</span>   ${b}`);
        }
        printHTML(`<div>${rows.join("<br>")}</div>`);
      },
    },

    history: {
      desc: "人生大事记",
      run() {
        const log = SITE.lifeLog || [];
        if (log.length === 0) return print("(空)", "dim");
        log.forEach((l, i) => {
          printHTML(`<span class="dim">${String(i+1).padStart(3," ")}  </span><span class="file">${esc(l)}</span>`);
        });
      },
    },

    date: { desc: "当前时间", run() {
      print(new Date().toLocaleString("zh-CN", { hour12: false }));
    }},
    uptime: { desc: "运行了多久", run() {
      print(`up ${formatDuration(Date.now() - BOOT_TS)} (since you opened the tab)`);
    }},

    contact: {
      desc: "联系方式",
      run() {
        renderMarkdown(`
# 联系

邮箱  : ${SITE.contactEmail}

直接 \`message\` 留言我也能收到。
        `.trim());
      },
    },

    // ---------- Tier 2: message (核心功能) ----------
    message: {
      desc: "在终端里给我留句话",
      run() {
        state.multiline = { lines: [], target: "message" };
        printHTML(`<span class="note">想说点啥？(直接换行继续输入, <span class="kw">.send</span> 发送, <span class="kw">.cancel</span> 取消)</span>`);
        updatePrompt();
      },
    },

    // ---------- Tier 3: 彩蛋 ----------
    sudo: {
      desc: "(嗯?)",
      run(args, raw) {
        const sub = raw.replace(/^sudo\s*/, "").trim();
        if (sub === "rm -rf /" || sub === "rm -rf /*") return commands["rm-rf"].run([], sub);
        if (sub === "make me a sandwich") {
          renderASCII(`
   _________________
  /   烤面包  ★      \\
 /  ----------------  \\
|   生菜 番茄 起司    |
 \\  ----------------  /
  \\_______________/

给, 拿好.
          `.trim());
          return;
        }
        state.sudoFails++;
        const lines = [
          "Permission denied. 这里是来宾区。",
          "依然 Permission denied。你想干嘛?",
          "Permission denied. 你很有毅力, 但这里依然没有 sudo.",
          "好好好你赢了. 然而依然 Permission denied.",
        ];
        printErr(lines[Math.min(state.sudoFails-1, lines.length-1)]);
      },
    },

    "rm-rf": {
      desc: "(危险)",
      run() {
        printErr("rm: 检测到 -rf /。开始递归删除...");
        const fakeSteps = [
          "removing /etc ...",
          "removing /var ...",
          "removing /home/visitor/regrets ...",
          "removing /var/log/yesterday ...",
          "removing / ...",
        ];
        let i = 0;
        const t = setInterval(() => {
          if (i < fakeSteps.length) {
            print(fakeSteps[i++], "dim");
          } else {
            clearInterval(t);
            const fadeOut = $output.querySelectorAll(".row");
            fadeOut.forEach((el, idx) => {
              setTimeout(() => { el.style.transition = "opacity .6s"; el.style.opacity = "0"; }, idx * 12);
            });
            setTimeout(() => {
              setTimeout(() => {
                fadeOut.forEach(el => { el.style.opacity = "1"; });
                print("…开个玩笑。一切都还在。", "ok");
              }, 1600);
            }, fadeOut.length * 12 + 200);
          }
        }, 280);
      },
    },

    vim: {
      desc: "(?)",
      run() {
        const overlay = document.createElement("div");
        overlay.className = "overlay";
        overlay.innerHTML = `
          <div class="panel" style="width:600px;max-width:90vw;font-family:inherit">
            <div class="ctl">
              <span>"untitled" [readonly]</span>
              <span>:q! 退出 &nbsp;·&nbsp; :w 保存</span>
            </div>
            <pre style="margin:0;color:var(--fg);background:var(--bg-alt);padding:14px;border-radius:6px;min-height:200px">~
~
~
~
~
~
~
~
~                       VIM - Vi IMproved
~
~                        version 0.0.1
~
~                      type :q to exit
~</pre>
            <div style="margin-top:10px;font-size:13px;color:var(--muted)">输入 :q :q! :w :wq 任一个, 回车退出</div>
            <div style="margin-top:6px;display:flex;align-items:center;gap:6px">
              <span style="color:var(--green)">:</span>
              <input id="vim-input" autofocus style="flex:1;background:transparent;border:none;outline:none;color:var(--fg);font:inherit" />
            </div>
          </div>`;
        document.body.appendChild(overlay);
        const v = overlay.querySelector("#vim-input");
        v.focus();
        v.addEventListener("keydown", e => {
          if (e.key === "Enter") {
            const cmd = v.value.trim();
            if (/^:q!?$/.test(cmd) || cmd === ":wq") {
              overlay.remove();
              print("(从 vim 逃出生天)", "dim");
              focusInput();
            } else if (cmd === ":w") {
              v.value = "";
              const tip = overlay.querySelector("div:last-of-type");
              tip.innerHTML = `<span style="color:var(--orange)">只读文件系统. 但谢谢你想留下点什么.</span>`;
            } else {
              v.value = "";
            }
          } else if (e.key === "Escape") {
            overlay.remove();
            focusInput();
          }
        });
      },
    },

    nano: {
      desc: "(?)",
      run() { print("nano 不在这艘船上, 请用 vim.", "warn"); },
    },

    sl: {
      desc: "(?)",
      run() {
        const train = [
"      ====        ________                ___________",
"  _D _|  |_______/        \\__I_I_____===__|_________|",
"   |(_)---  |   H\\________/ |   |        =|___ ___|",
"   /     |  |   H  |  |     |   |         ||_| |_||",
"  |      |  |   H  |__--------------------| [___] |",
"  | ________|___H__/__|_____/[][]~\\_______|       |",
"  |/ |   |-----------I_____I [][] []  D   |=======|",
"__/ =| o |=-~~\\  /~~\\  /~~\\  /~~\\ ____Y___________|",
" |/-=|___|=    O=====O=====O=====O|_____/~\\___/",
"  \\_/      \\__/  \\__/  \\__/  \\__/      \\_/",
        ].join("\n");
        let offset = 80;
        const wrap = document.createElement("div");
        wrap.className = "row";
        const pre = document.createElement("pre");
        pre.style.cssText = "margin:0;overflow:hidden;line-height:1.1;color:var(--blue)";
        wrap.appendChild(pre);
        $output.appendChild(wrap);
        const ti = setInterval(() => {
          pre.textContent = train.split("\n")
            .map(l => " ".repeat(Math.max(0, offset)) + l)
            .join("\n");
          offset -= 4;
          if (offset < -120) { clearInterval(ti); pre.textContent = ""; print("(火车开远了)", "dim"); }
        }, 60);
      },
    },

    cowsay: {
      desc: "(?)",
      run(args, raw) {
        const text = raw.replace(/^cowsay\s*/, "") || "Moo.";
        const top    = " " + "_".repeat(text.length + 2);
        const bottom = " " + "-".repeat(text.length + 2);
        renderASCII(
`${top}
< ${text} >
${bottom}
        \\   ^__^
         \\  (oo)\\_______
            (__)\\       )\\/\\
                ||----w |
                ||     ||`);
      },
    },

    fortune: {
      desc: "(?)",
      run() {
        const pool = SITE.fortunes || ["你今天看起来不错。"];
        print(pool[Math.floor(Math.random() * pool.length)], "note");
      },
    },

    coffee: {
      desc: "(?)",
      run() {
        renderASCII(
`           ( (
            ) )
        ........
        |      |]
        \\      /
         \`----'

☕ 拿走, 今天我请.`);
      },
    },
    tea: { desc: "(?)", run() { commands.coffee.run(); } },

    hack: {
      desc: "(?)",
      run(args) {
        const target = args[0] || "NSA";
        print(`Connecting to ${target}.gov ...`, "dim");
        const stages = [
          ["Bypassing firewall",  20],
          ["Cracking passwd",     45],
          ["Decrypting payload",  70],
          ["Spoofing IP",         90],
          ["Almost there",        99],
        ];
        let i = 0;
        const advance = () => {
          if (i >= stages.length) {
            print("Got root!", "ok");
            print("...开玩笑的. 我什么都没做.", "dim");
            return;
          }
          const [label, pct] = stages[i++];
          const bar = "█".repeat(Math.floor(pct / 5)) + "░".repeat(20 - Math.floor(pct / 5));
          printHTML(`<span class="warn">${esc(label)}</span>  <span class="ascii">[${bar}] ${pct}%</span>`);
          setTimeout(advance, 500);
        };
        advance();
      },
    },

    matrix: {
      desc: "(?)",
      run() {
        let c = document.getElementById("matrix-canvas");
        if (!c) {
          c = document.createElement("canvas");
          c.id = "matrix-canvas";
          document.body.appendChild(c);
        }
        c.width = window.innerWidth;
        c.height = window.innerHeight;
        const ctx = c.getContext("2d");
        const cols = Math.floor(c.width / 14);
        const drops = new Array(cols).fill(0);
        let frames = 0;
        const loop = () => {
          ctx.fillStyle = "rgba(0,0,0,0.08)";
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.fillStyle = "#00ff41";
          ctx.font = "14px monospace";
          for (let i = 0; i < cols; i++) {
            const ch = String.fromCharCode(0x30A0 + Math.random() * 96);
            ctx.fillText(ch, i * 14, drops[i] * 14);
            if (drops[i] * 14 > c.height && Math.random() > 0.975) drops[i] = 0;
            drops[i]++;
          }
          frames++;
          if (frames < 250) requestAnimationFrame(loop);
          else c.remove();
        };
        loop();
        print("(There is no spoon.)", "dim");
      },
    },

    flip: {
      desc: "(?)",
      run() { print(Math.random() < 0.5 ? "正面" : "反面", "kw"); },
    },

    roll: {
      desc: "(?)",
      run(args) {
        const m = (args[0] || "1d6").match(/^(\d+)d(\d+)$/);
        if (!m) return printErr("用法: roll 1d20 / 2d6 ...");
        const n = +m[1], s = +m[2];
        const rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * s));
        print(`${rolls.join(" + ")} = ${rolls.reduce((a, b) => a + b, 0)}`);
      },
    },

    "8ball": {
      desc: "(?)",
      run(args, raw) {
        const q = raw.replace(/^8ball\s*/, "");
        const answers = [
          "肯定是", "毫无疑问", "你可以指望它", "看起来是的",
          "不太确定, 再问一次", "现在最好不要告诉你",
          "答案不明", "我的来源说不", "非常可疑", "想都别想",
        ];
        print(q ? `Q: ${q}` : "(没问问题, 但我还是答你)", "dim");
        print(answers[Math.floor(Math.random() * answers.length)], "kw");
      },
    },

    apt: {
      desc: "(?)",
      run(args) {
        const sub = args.join(" ");
        if (sub.startsWith("install ")) {
          const pkg = sub.slice(8);
          print(`Reading package lists... Done`, "dim");
          print(`Building dependency tree... Done`, "dim");
          if (pkg === "happiness") {
            print(`E: Unable to locate package: 依赖 sleep>=7h, 未满足.`, "bad");
          } else if (pkg === "motivation") {
            print(`Reading state information... ` + "▓".repeat(8) + "░".repeat(12), "warn");
            setTimeout(() => print("(还在读. 可能要等明天.)", "dim"), 1500);
          } else if (pkg === "courage") {
            print(`Setting up courage (1.0.0) ...`, "ok");
            print(`已安装. 去做吧.`, "ok");
          } else {
            print(`E: 不认识这个包. 但 'courage' 'happiness' 'motivation' 可以试试.`, "warn");
          }
        } else {
          print(`Usage: apt install <package>`, "dim");
        }
      },
    },

    ssh: {
      desc: "(?)",
      run(args) {
        const tgt = args[0] || "";
        if (tgt.includes("future-me")) {
          print("Connecting...", "dim");
          setTimeout(() => print("Connection refused. (可能是未来的我屏蔽了.)", "bad"), 800);
          return;
        }
        if (tgt.includes("past-me") || tgt.includes("2022")) {
          print("Connecting to past-me@2022 ...", "dim");
          setTimeout(() => print("Connection established.", "ok"), 600);
          setTimeout(() => print("> 你做出来了吗?", "note"), 1200);
          setTimeout(() => print("> ...你做出来了.", "kw"), 2000);
          setTimeout(() => print("Connection closed.", "dim"), 3000);
          return;
        }
        printErr(`ssh: 连不上 ${tgt}`);
      },
    },

    theme: {
      desc: "切换主题",
      run(args) {
        const all = ["bluloco-light", "bluloco-dark", "matrix", "amber"];
        if (!args[0]) {
          print("可用主题: " + all.join(", "), "note");
          print("当前: " + document.body.dataset.theme, "dim");
          return;
        }
        if (!all.includes(args[0])) return printErr("没这个主题");
        document.body.dataset.theme = args[0];
        try { localStorage.setItem("th-theme", args[0]); } catch {}
        print(`主题已切换为 ${args[0]}.`, "ok");
      },
    },

    unhinged: {
      desc: "(?)",
      run() {
        document.body.classList.toggle("unhinged");
        print("(◔_◔)  好的, 那就这样.", "kw");
      },
    },

    exit: {
      desc: "(?)",
      run() { print("门是开的, 但你舍不得走.", "dim"); },
    },
    logout: { desc: "(?)", run() { commands.exit.run(); } },
    quit:   { desc: "(?)", run() { commands.exit.run(); } },
  };

  // ====================================================================
  // 4.5 渲染辅助 (markdown / 图片 / ASCII)
  // ====================================================================
  function renderMarkdown(text) {
    const html = text
      .split("\n")
      .map(line => {
        if (/^#\s/.test(line))   return `<span class="h1">${esc(line.slice(2))}</span>`;
        if (/^##\s/.test(line))  return `<span class="h2">${esc(line.slice(3))}</span>`;
        if (/^###\s/.test(line)) return `<span class="h3">${esc(line.slice(4))}</span>`;
        if (/^>\s/.test(line))   return `<span class="dim italic">${esc(line.slice(2))}</span>`;
        return esc(line)
          .replace(/`([^`]+)`/g, '<span class="code">$1</span>')
          .replace(/\*\*([^*]+)\*\*/g, '<span class="bold">$1</span>')
          .replace(/\*([^*]+)\*/g, '<span class="italic">$1</span>');
      })
      .join("<br>");
    printHTML(html);
  }

  function renderASCII(text) {
    printHTML(`<pre class="ascii" style="margin:0;line-height:1.15">${esc(text)}</pre>`);
  }

  function renderHelpTable(rows) {
    return `<div class="tbl">${rows.map(([k, v]) =>
      `<div class="k">${esc(k)}</div><div class="v">${esc(v)}</div>`
    ).join("")}</div>`;
  }

  function showImage(src, label) {
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML = `
      <div class="panel">
        <div class="ctl"><span>${esc(label || "image")}</span><span>点空白或按 Esc 关闭</span></div>
        <img src="${esc(src)}" alt="${esc(label || "")}" />
      </div>`;
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
    document.addEventListener("keydown", function onEsc(e) {
      if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", onEsc); }
    });
    document.body.appendChild(overlay);
  }

  function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60)    return s + " 秒";
    if (s < 3600)  return Math.floor(s / 60) + " 分钟";
    if (s < 86400) return Math.floor(s / 3600) + " 小时 " + Math.floor((s % 3600) / 60) + " 分";
    return Math.floor(s / 86400) + " 天";
  }

  // ====================================================================
  // 4.6 multiline (message 输入态)
  // ====================================================================
  function handleMultiline(line) {
    echoCommand(line);
    const ml = state.multiline;
    if (line.trim() === ".cancel") {
      print("(已取消)", "dim");
      state.multiline = null;
      updatePrompt();
      return;
    }
    if (line.trim() === ".send") {
      const body = ml.lines.join("\n").trim();
      if (!body) { print("(空消息, 啥也没发)", "dim"); state.multiline = null; updatePrompt(); return; }
      sendMessage(body);
      state.multiline = null;
      updatePrompt();
      return;
    }
    ml.lines.push(line);
  }

  function sendMessage(body) {
    print("[发送中...]", "dim");
    const key = (SITE.web3formsKey || "").trim();
    if (!key) {
      // 兜底 mailto
      const subject = encodeURIComponent("[terminal-home] 留言");
      const url = `mailto:${SITE.contactEmail}?subject=${subject}&body=${encodeURIComponent(body)}`;
      print("未配置 web3forms key, 给你打开默认邮件客户端兜底.", "warn");
      window.open(url);
      return;
    }
    fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        access_key: key,
        subject: "[terminal-home] 留言",
        from_name: SITE.user + "@" + SITE.host,
        message: body,
      }),
    })
    .then(r => r.json())
    .then(data => {
      if (data.success) print("✓ 已送达. 谢谢光临 :)", "ok");
      else printErr("发送失败: " + (data.message || "未知错误"));
    })
    .catch(err => printErr("网络错误: " + err.message));
  }

  // ====================================================================
  // 4.7 Konami egg
  // ====================================================================
  function konamiEgg() {
    print("(↑↑↓↓←→←→ B A)  ✦ secret unlocked ✦", "kw");
    renderASCII(`
       ✦   ✦   ✦
     ✦         ✦
   ✦   you found it   ✦
     ✦         ✦
       ✦   ✦   ✦
    `.trim());
  }

  // ====================================================================
  // 5. BOOT & INIT
  // ====================================================================
  function boot() {
    const lines = [
      `<span class="boot head">terminal-home v0.1</span>`,
      `<span class="boot"><span class="ok-tag">[ OK ]</span>  mounting <span class="dir">/</span></span>`,
      `<span class="boot"><span class="ok-tag">[ OK ]</span>  mounting <span class="dir">/dream</span></span>`,
      `<span class="boot"><span class="ok-tag">[ OK ]</span>  mounting <span class="dir">/daily</span></span>`,
      `<span class="boot"><span class="ok-tag">[ OK ]</span>  mounting <span class="dir">/photo</span></span>`,
      `<span class="boot"><span class="ok-tag">[ OK ]</span>  linking message@web3forms</span>`,
      `<span class="boot"><span class="ok-tag">[ OK ]</span>  loading theme: <span class="kw">${document.body.dataset.theme}</span></span>`,
      `<span class="boot"><span class="ok-tag">[ OK ]</span>  ready.</span>`,
      `&nbsp;`,
      `<span class="dim">输入 <span class="kw">help</span> 看可用命令; 输入 <span class="kw">ls -a</span> 看看藏了啥.</span>`,
      `&nbsp;`,
    ];
    let i = 0;
    const next = () => {
      if (i >= lines.length) { focusInput(); return; }
      printHTML(lines[i++]);
      setTimeout(next, 90);
    };
    next();
  }

  // ---------- 标题栏：tab 名 + 时钟 + uptime ----------
  function initTitlebar() {
    const $tabName = document.querySelector(".tab .tab-name");
    if ($tabName) $tabName.textContent = `${SITE.user}@${SITE.host} — terminal`;

    const $clock  = document.getElementById("clock");
    const $uptime = document.getElementById("uptime");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    function tick() {
      const now = new Date();
      const m  = months[now.getMonth()];
      const d  = now.getDate();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");
      if ($clock)  $clock.textContent  = `${m} ${d}  ${hh}:${mm}:${ss}`;
      if ($uptime) $uptime.textContent = `↑ ${formatDuration(Date.now() - BOOT_TS)}`;
    }
    tick();
    setInterval(tick, 1000);

    // "+" 当作小彩蛋
    const $add = document.getElementById("tabAdd");
    if ($add) {
      $add.addEventListener("click", e => {
        e.stopPropagation();
        const lines = [
          "这里只有一个标签页。但欢迎你来开一个新的。",
          "想多开?  打开浏览器再开一个本页就行 :)",
          "其实再点也是没用的。但你点得我开心。",
          "+1 standing ovation. 但还是只有一个 tab.",
        ];
        const last = +($add.dataset.n || 0);
        print(lines[last % lines.length], "note");
        $add.dataset.n = (last + 1).toString();
        focusInput();
      });
    }
  }

  function init() {
    // 恢复主题
    try {
      const t = localStorage.getItem("th-theme");
      if (t) document.body.dataset.theme = t;
    } catch {}

    initTitlebar();
    updatePrompt();
    $input.addEventListener("keydown", onKeyDown);
    $input.addEventListener("input",   syncCaret);
    $input.addEventListener("blur",    () => $caret && ($caret.style.opacity = "0.3"));
    $input.addEventListener("focus",   () => $caret && ($caret.style.opacity = "0.85"));

    // 点终端区域聚焦到输入框；点标题栏/链接/弹层不抢焦点
    document.addEventListener("click", e => {
      if (e.target.tagName === "A") return;
      if (e.target.closest(".overlay")) return;
      if (e.target.closest(".titlebar")) return;
      focusInput();
    });
    window.addEventListener("resize", syncCaret);

    boot();
    syncCaret();
  }

  // 等 DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
