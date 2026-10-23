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
  const APPEARANCE = (window.FS && window.FS.appearance) || {};
  const BOOT_TS = Date.now();

  // ====================================================================
  // 1. UTILS
  // ====================================================================
  const $output    = document.getElementById("output");
  const $inputLine = document.getElementById("inputLine");
  const $input     = document.getElementById("input");
  const $prompt    = document.getElementById("prompt");
  const $terminal  = document.getElementById("terminal");
  const $desktop   = document.getElementById("desktop");
  const $caret     = document.querySelector(".caret");

  const state = {
    cwd: "/",
    prevCwd: "/",
    history: JSON.parse(localStorage.getItem("th-history") || "[]"),
    historyIdx: -1,
    sudoFails: 0,
    multiline: null,   // { lines: [], target: "message" }
    konami: "",
    audio: null,
    audioPath: null,
    completion: null,
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

  let starsGenerated = false;
  let starSky = null;
  const skyStars = [];
  const STAR_CHARGE_MS = 3500;
  const METEOR_IMPACT_CHANCE = 0.35;
  const METEOR_FOREGROUND_CHANCE = 0.6;
  const skyAnchors = [[13, 16], [82, 13], [93, 49], [11, 70], [34, 91], [73, 92], [62, 7]];
  const skyClusters = [[12, 38], [87, 61], [49, 9]];

  function placeSkyStar(star, renew = false) {
    let x, y;
    if (star.bright) {
      if (renew) star.anchor = (star.anchor + 1 + Math.floor(Math.random() * (skyAnchors.length - 1))) % skyAnchors.length;
      const anchor = skyAnchors[star.anchor];
      x = anchor[0] + (Math.random() - 0.5) * 4;
      y = anchor[1] + (Math.random() - 0.5) * 4;
    } else if (Math.random() < (star.middle ? 0.25 : 0.45)) {
      const cluster = skyClusters[Math.floor(Math.random() * skyClusters.length)];
      x = cluster[0] + (Math.random() + Math.random() + Math.random() - 1.5) * 13;
      y = cluster[1] + (Math.random() + Math.random() + Math.random() - 1.5) * 14;
    } else {
      x = 2 + Math.random() * 96;
      y = 2 + Math.random() * 96;
    }
    star.x = Math.max(1, Math.min(99, x));
    star.y = Math.max(1, Math.min(99, y));
    star.node.style.left = `${star.x}%`;
    star.node.style.top = `${star.y}%`;
  }

  function generateStars() {
    if (starsGenerated) return;
    starSky = document.createElement("div");
    starSky.className = "star-sky";
    starSky.ariaHidden = "true";
    const field = document.createElement("div");
    field.className = "star-field";
    const colors = ["220, 231, 249", "249, 237, 215", "239, 243, 250"];
    for (let index = 0; index < 320; index++) {
      const bright = index < skyAnchors.length;
      const middle = !bright && index < 72;
      const radius = bright ? 1.7 + Math.random() * 0.35
        : middle ? 0.9 + Math.random() * 0.45 : 0.55 + Math.random() * 0.3;
      const alpha = bright ? 0.96 : middle ? 0.5 + Math.random() * 0.28 : 0.18 + Math.random() * 0.22;
      const rgb = colors[Math.random() < 0.2 ? Math.floor(Math.random() * 2) : 2];
      const layers = [`radial-gradient(circle ${radius.toFixed(2)}px at 50% 50%, rgba(${rgb}, ${alpha.toFixed(2)}) 45%, transparent 100%)`];
      if (bright) {
        layers.push(
          `radial-gradient(circle 5px at 50% 50%, rgba(${rgb}, 0.17), transparent 100%)`,
          `radial-gradient(circle 12px at 50% 50%, rgba(${rgb}, 0.035), transparent 100%)`
        );
        if (index < 3) layers.push(
          `radial-gradient(ellipse 0.4px 4px at 50% 50%, rgba(${rgb}, 0.12), transparent 100%)`,
          `radial-gradient(ellipse 4px 0.4px at 50% 50%, rgba(${rgb}, 0.12), transparent 100%)`
        );
      }
      // 每颗星独立管理，外层控制离开/再生，内层保持细微闪烁。
      const node = document.createElement("span");
      node.className = "sky-star";
      if (bright) { node.style.width = "32px"; node.style.height = "32px"; }
      const light = document.createElement("span");
      light.className = index < 16 ? "star-light twinkling-star" : "star-light";
      light.style.backgroundImage = layers.join(",");
      if (index < 16) {
        light.style.animationName = ["star-twinkle-a", "star-twinkle-b", "star-twinkle-c"][Math.floor(Math.random() * 3)];
        light.style.animationDuration = `${(14 + Math.random() * 12).toFixed(2)}s`;
        light.style.animationDelay = `-${(Math.random() * 26).toFixed(2)}s`;
      }
      node.appendChild(light);
      field.appendChild(node);
      const star = { node, field, x: 0, y: 0, bright, middle, rgb, anchor: index, state: "resting" };
      placeSkyStar(star);
      skyStars.push(star);
    }
    starSky.appendChild(field);
    $desktop.appendChild(starSky);
    void starSky.offsetWidth;
    starsGenerated = true;
  }

  let meteorLayer = null;
  let foregroundMeteorLayer = null;
  let meteorSession = 0;
  let introMeteorTimer = null;
  let showerActiveUntil = 0;
  let activeMeteorBand = null;
  const meteorTimers = new Set();

  function meteorAfter(callback, delay) {
    const session = meteorSession;
    const id = setTimeout(() => {
      meteorTimers.delete(id);
      if (session === meteorSession && meteorLayer) callback();
    }, delay);
    meteorTimers.add(id);
    return id;
  }

  function stopMeteors() {
    meteorSession++;
    for (const id of meteorTimers) clearTimeout(id);
    meteorTimers.clear();
    introMeteorTimer = null;
    showerActiveUntil = 0;
    activeMeteorBand = null;
    // 取消待出发和待再生任务，避免重置后永久少星，或下次开启时重复补星。
    for (const star of skyStars) {
      if (star.state !== "resting") {
        star.field.appendChild(star.node);
        if (star.state !== "reserved") placeSkyStar(star, true);
        star.state = "resting";
        delete star.node.dataset.phase;
        star.node.style.transitionDuration = "0.2s";
        star.node.style.opacity = "1";
      }
    }
    if (meteorLayer) meteorLayer.remove();
    meteorLayer = null;
    if (foregroundMeteorLayer) foregroundMeteorLayer.remove();
    foregroundMeteorLayer = null;
  }

  function canShowMeteor() {
    return $desktop.dataset.decoration === "stars" && !document.hidden &&
      !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function meteorGeometry() {
    const desktop = $desktop.getBoundingClientRect();
    const frame = document.getElementById("window").getBoundingClientRect();
    const style = getComputedStyle(starSky);
    const degrees = parseFloat(style.getPropertyValue("--meteor-angle"));
    const angle = (Number.isFinite(degrees) ? degrees : 20) * Math.PI / 180;
    const width = desktop.width, height = desktop.height;
    const configuredWidth = parseFloat(style.getPropertyValue("--meteor-band-width"));
    return { width, height, cos: Math.cos(angle), sin: Math.sin(angle),
      bandWidth: Math.min(Number.isFinite(configuredWidth) ? configuredWidth : 500, Math.hypot(width, height) * 0.45),
      left: frame.left - desktop.left, right: frame.right - desktop.left,
      top: frame.top - desktop.top, bottom: frame.bottom - desktop.top };
  }

  function meteorWindowHit(x, y, distance, geometry) {
    const { left, right, top, bottom, cos, sin } = geometry;
    if (x >= left && x <= right && y >= top && y <= bottom) return null;
    let enter = 0, exit = 1, nx = 0, ny = 0;
    for (const [start, delta, min, max, axis] of [
      [x, distance * cos, left, right, "x"], [y, distance * sin, top, bottom, "y"],
    ]) {
      if (Math.abs(delta) < 0.00001) {
        if (start < min || start > max) return null;
        continue;
      }
      const first = Math.min((min - start) / delta, (max - start) / delta);
      const last = Math.max((min - start) / delta, (max - start) / delta);
      if (first >= enter) {
        enter = first;
        nx = axis === "x" ? -Math.sign(delta) : 0;
        ny = axis === "y" ? -Math.sign(delta) : 0;
      }
      exit = Math.min(exit, last);
      if (enter > exit) return null;
    }
    if (!(nx || ny) || enter < 0 || enter > 1) return null;
    return { x: x + distance * cos * enter, y: y + distance * sin * enter,
      distance: distance * enter, nx, ny };
  }

  function meteorSparks(hit, rgb) {
    if (!meteorLayer || !canShowMeteor()) return;
    const count = 5 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const spark = document.createElement("span");
      spark.className = "meteor-spark";
      spark.style.left = `${hit.x + hit.nx}px`;
      spark.style.top = `${hit.y + hit.ny}px`;
      const size = 0.9 + Math.random() * 1.4;
      spark.style.width = spark.style.height = `${size}px`;
      spark.style.setProperty("--spark-rgb", Math.random() < 0.5 ? rgb : "255, 216, 157");
      const duration = 0.45 + Math.random() * 0.4;
      const outward = 45 + Math.random() * 85;
      const sideways = (Math.random() * 2 - 1) * 90;
      const vx = hit.nx * outward - hit.ny * sideways;
      const vy = hit.ny * outward + hit.nx * sideways;
      for (const [name, fraction] of [["a", 0.35], ["b", 0.7], ["c", 1]]) {
        const time = duration * fraction;
        spark.style.setProperty(`--spark-x-${name}`, `${vx * time}px`);
        spark.style.setProperty(`--spark-y-${name}`, `${vy * time + 110 * time * time}px`);
      }
      spark.style.animationDuration = `${duration}s`;
      meteorLayer.appendChild(spark);
      meteorAfter(() => spark.remove(), duration * 1000 + 100);
    }
  }

  function starInBand(star, geometry, band) {
    if (!band) return true;
    const { width, height, cos, sin } = geometry;
    const projection = star.y / 100 * height * cos - star.x / 100 * width * sin;
    const center = -width * sin + band.center * (height * cos + width * sin);
    return Math.abs(projection - center) <= geometry.bandWidth / 2;
  }

  function visibleMeteorSource(star, geometry) {
    const { width, height, cos, sin, left, right, top, bottom } = geometry;
    // 首次流星需有一段清晰可见的行程；其他轨迹经过窗口时自然被遮挡。
    return [0, 40, 80].every(distance => {
      const x = star.x / 100 * width + distance * cos;
      const y = star.y / 100 * height + distance * sin;
      return x >= 0 && x <= width && y >= 0 && y <= height &&
        !(x >= left && x <= right && y >= top && y <= bottom);
    });
  }

  function chooseMeteorStar(geometry, band = null, visibleOnly = true) {
    const candidates = skyStars.filter(star => star.state === "resting" &&
      starInBand(star, geometry, band) && (!visibleOnly || visibleMeteorSource(star, geometry)));
    return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
  }

  function emitMeteor(intro = false, band = null, source = null) {
    if (!meteorLayer || !canShowMeteor()) {
      if (source && source.state === "reserved") source.state = "resting";
      return false;
    }
    if (!band && Date.now() < showerActiveUntil) band = activeMeteorBand;
    const geometry = meteorGeometry();
    if (source && !starInBand(source, geometry, band)) {
      source.state = "resting";
      source = null;
    }
    const star = source || chooseMeteorStar(geometry, band, true);
    if (!star) return false;
    const distance = (220 + Math.random() * 60) / 0.7;
    const duration = 1.2 + Math.random() * 0.6;
    const tint = Math.random();
    const rgb = tint < 0.06 ? "241, 213, 159" : tint < 0.12 ? "238, 189, 211" : star.rgb;
    const chargeMs = intro ? Math.min(STAR_CHARGE_MS, 2600) : STAR_CHARGE_MS;
    // 先蓄光，再从同一颗星的位置出发；首次流星仍会在进入后三秒内出现。
    star.state = "charging";
    star.node.dataset.phase = "charging";
    star.node.style.setProperty("--gather-rgb", rgb);
    star.node.style.setProperty("--charge-duration", `${chargeMs}ms`);
    meteorAfter(() => {
      if (!canShowMeteor()) {
        star.state = "resting";
        delete star.node.dataset.phase;
        return;
      }
      const current = meteorGeometry();
      const x = star.x / 100 * current.width, y = star.y / 100 * current.height;
      const intersection = meteorWindowHit(x, y, distance, current);
      // 只有部分经过窗口的流星发生碰撞，其余从窗口后方划过。
      const hit = intersection && Math.random() < METEOR_IMPACT_CHANCE ? intersection : null;
      const foreground = !hit && Math.random() < METEOR_FOREGROUND_CHANCE;
      const travel = hit ? hit.distance : distance;
      const flightDuration = duration * travel / distance;
      const meteor = document.createElement("span");
      meteor.className = hit ? "meteor meteor-impact" : "meteor";
      meteor.style.left = `${star.x / 100 * current.width}px`;
      meteor.style.top = `${star.y / 100 * current.height}px`;
      meteor.style.width = `${travel}px`;
      meteor.style.setProperty("--meteor-rgb", rgb);
      meteor.style.animationDuration = `${flightDuration}s`;
      star.state = "departing";
      star.node.style.setProperty("--flight-duration", `${flightDuration}s`);
      star.node.style.setProperty("--launch-x", `${travel * current.cos}px`);
      star.node.style.setProperty("--launch-y", `${travel * current.sin}px`);
      star.node.style.opacity = "1";
      if (foreground) foregroundMeteorLayer.appendChild(star.node);
      // 原星点随光痕前端一起移动、收拢并淡去，避免先熄灭再另射出一条线。
      star.node.dataset.phase = "departing";
      (foreground ? foregroundMeteorLayer : meteorLayer).appendChild(meteor);
      if (hit) meteorAfter(() => {
        meteorSparks(hit, rgb);
        meteor.style.animationDuration = "0.45s";
        meteor.className = "meteor meteor-impact meteor-spent";
      }, flightDuration * 1000);
      meteorAfter(() => meteor.remove(), flightDuration * 1000 + (hit ? 550 : 100));
      meteorAfter(() => {
        star.node.style.opacity = "0";
        delete star.node.dataset.phase;
        star.field.appendChild(star.node);
        placeSkyStar(star, true);
        star.state = "returning";
        star.node.style.transitionDuration = "2.8s";
        void star.node.offsetWidth;
        star.node.style.opacity = "1";
        meteorAfter(() => { star.state = "resting"; }, 2800);
      }, flightDuration * 1000 + 600 + Math.random() * 800);
    }, chargeMs);
    return true;
  }

  function meteorShower() {
    if (!canShowMeteor() || Date.now() < showerActiveUntil) return false;
    const geometry = meteorGeometry();
    const seed = chooseMeteorStar(geometry);
    if (!seed) return false;
    const { width, height, sin, cos } = geometry;
    // 条带属于整片天空，不再绑定顶部、底部或窗口两侧的某个矩形。
    const projection = seed.y / 100 * height * cos - seed.x / 100 * width * sin;
    const band = { center: (projection + width * sin) / (height * cos + width * sin) };
    const available = skyStars.filter(star => star.state === "resting" && starInBand(star, geometry, band));
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }
    // 可见星点优先；也允许少量轨迹从窗口后方出发，保持完整的天空空间。
    available.sort((a, b) => Number(visibleMeteorSource(b, geometry)) - Number(visibleMeteorSource(a, geometry)));
    const sources = available.slice(0, 9 + Math.floor(Math.random() * 6));
    if (!sources.length) return false;
    showerActiveUntil = Date.now() + sources.length * 300 + STAR_CHARGE_MS + 1800;
    activeMeteorBand = band;
    for (const source of sources) source.state = "reserved";
    emitMeteor(false, band, sources[0]);
    for (let i = 1; i < sources.length; i++) {
      meteorAfter(() => emitMeteor(false, band, sources[i]), i * 300 + Math.random() * 220);
    }
    return true;
  }

  function scheduleRandomMeteor() {
    meteorAfter(() => {
      if (canShowMeteor()) {
        if (Math.random() < 0.08) meteorShower();
        else emitMeteor();
      }
      scheduleRandomMeteor();
    }, 8000 + Math.random() * 14000);
  }

  function startMeteors(intro = true) {
    if (!meteorLayer) {
      meteorLayer = document.createElement("div");
      meteorLayer.className = "meteor-layer";
      meteorLayer.ariaHidden = "true";
      starSky.appendChild(meteorLayer);
      foregroundMeteorLayer = document.createElement("div");
      foregroundMeteorLayer.className = "meteor-layer meteor-layer-front";
      foregroundMeteorLayer.ariaHidden = "true";
      $desktop.appendChild(foregroundMeteorLayer);
      scheduleRandomMeteor();
    }
    if (intro && introMeteorTimer === null) {
      const welcome = () => {
        introMeteorTimer = null;
        if (document.hidden) {
          introMeteorTimer = meteorAfter(welcome, 1000);
          return;
        }
        emitMeteor(true);
      };
      introMeteorTimer = meteorAfter(welcome, 200);
    }
  }

  function startStars(intro = true) {
    generateStars();
    $desktop.dataset.decoration = "stars";
    startMeteors(intro);
  }

  const RAIN_MODES = {
    light: { intensity: 0.22, speed: 0.9, gentle: true },
    medium: { intensity: 0.55, speed: 1 },
    heavy: { intensity: 1, speed: 1.2 },
    changing: { intensity: 0.55, speed: 1, changing: true },
  };
  let rainCleanup = null;
  let rainMode = null;
  let rainChangeMode = null;
  let rainBeginExit = null;
  let rainAfterglowColor = null;
  let rainbow = null;
  let rainbowTimer = null;
  let rainbowDust = null;
  let rainbowResize = null;

  function stopRainbow() {
    if (rainbowTimer !== null) clearTimeout(rainbowTimer);
    rainbowTimer = null;
    if (rainbow) rainbow.remove();
    rainbow = null;
    if (rainbowDust) rainbowDust.remove();
    rainbowDust = null;
    if (rainbowResize) window.removeEventListener("resize", rainbowResize);
    rainbowResize = null;
  }

  function showRainbow(color = null) {
    stopRainbow();
    if (document.hidden) return;
    rainbow = document.createElement("div");
    rainbow.className = "after-rain";
    if (color) rainbow.style.setProperty("--rainbow-light", color);
    rainbow.ariaHidden = "true";
    const titlebar = document.getElementById("titlebar");
    titlebar.appendChild(rainbow);
    rainbowDust = document.createElement("div");
    rainbowDust.className = "rainbow-dust";
    rainbowDust.ariaHidden = "true";
    const colors = color ? [color] : ["#f9abc8", "#ffd3ad", "#f5ebba", "#b6ecdb", "#afd9fa", "#d3bdf4"];
    for (let i = 0; i < 60; i++) {
      const position = (i + Math.random()) / 60;
      const dot = document.createElement("span");
      dot.className = "rainbow-mote";
      dot.style.left = `${3 + position * 94}%`;
      dot.style.background = colors[Math.min(colors.length - 1, Math.floor(position * colors.length))];
      dot.style.setProperty("--mote-size", `${1.2 + Math.random() * 0.8}px`);
      dot.style.setProperty("--mote-x", `${(Math.random() - 0.5) * 44}px`);
      dot.style.setProperty("--mote-y", `${-12 - Math.random() * 28}px`);
      dot.style.animationDelay = `${18 + Math.random() * 1.8}s`;
      dot.style.animationDuration = `${3 + Math.random() * 2}s`;
      rainbowDust.appendChild(dot);
    }
    $desktop.appendChild(rainbowDust);
    rainbowResize = () => {
      const desktop = $desktop.getBoundingClientRect();
      const bar = titlebar.getBoundingClientRect();
      rainbowDust.style.left = `${bar.left - desktop.left}px`;
      rainbowDust.style.top = `${bar.top - desktop.top}px`;
      rainbowDust.style.width = `${bar.width}px`;
    };
    rainbowResize();
    window.addEventListener("resize", rainbowResize);
    rainbowTimer = setTimeout(stopRainbow, 26000);
  }

  function stopRain(immediate = false, afterglowColor = null) {
    if (afterglowColor) rainAfterglowColor = afterglowColor;
    if (rainCleanup && !immediate) {
      rainMode = null;
      rainBeginExit();
      return;
    }
    const cleared = !!rainCleanup && rainMode === null;
    if (rainCleanup) rainCleanup();
    rainCleanup = null;
    rainMode = null;
    rainChangeMode = null;
    rainBeginExit = null;
    window.RainAudio?.stop();
    if (cleared) showRainbow(rainAfterglowColor);
    rainAfterglowColor = null;
  }

  function startRain(mode = "medium") {
    if (!Object.prototype.hasOwnProperty.call(RAIN_MODES, mode)) return;
    rainAfterglowColor = null;
    stopRainbow();
    stopSnow();
    if (rainCleanup && rainMode === mode) return;
    if (rainCleanup) {
      rainChangeMode(mode);
      rainMode = mode;
      window.RainAudio?.start(mode);
      return;
    }
    let settings = RAIN_MODES[mode];
    let gentle = !!settings.gentle;
    const canvas = document.createElement("canvas");
    canvas.className = "rain-layer";
    canvas.ariaHidden = "true";
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    window.RainAudio?.start(mode);
    $desktop.appendChild(canvas);
    const drops = [];
    const splashes = [];
    const ripples = [];
    let width, height, roof, bottom, left, right;
    let frame, previous = null, pendingDrops = 0, elapsed = 0, wind = 0;
    const entranceDuration = 2.8;
    const exitDuration = 2.4;
    let entranceAge = 0, entranceStart = 0.12, emissionLevel = 0.12;
    let exitAge = null, exitStart = 0;
    if (gentle) wind = 12;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

    rainChangeMode = nextMode => {
      settings = RAIN_MODES[nextMode];
      gentle = !!settings.gentle;
      if (exitAge !== null) {
        // 雨还未停时重新开启，沿用雨层并从当前雨量恢复。
        entranceStart = emissionLevel;
        entranceAge = 0;
        exitAge = null;
      }
    };

    rainBeginExit = () => {
      if (motion.matches || document.hidden) { stopRain(true); return; }
      if (exitAge !== null) return;
      exitAge = 0;
      exitStart = emissionLevel;
    };

    function intensity() {
      if (gentle) return settings.intensity * (1 + 0.12 * Math.sin(elapsed / 5.5) + 0.04 * Math.sin(elapsed / 11));
      // 约 40 秒完成一次雨势起伏，叠加较轻的短周期变化。
      return settings.changing
        ? 0.18 + 0.72 * (0.5 + 0.5 * Math.sin(elapsed / 6.4)) + 0.08 * Math.sin(elapsed / 2.3)
        : settings.intensity;
    }

    function resize() {
      const desktop = $desktop.getBoundingClientRect();
      const terminalWindow = document.getElementById("window").getBoundingClientRect();
      width = desktop.width;
      height = desktop.height;
      roof = terminalWindow.top - desktop.top;
      bottom = terminalWindow.bottom - desktop.top;
      left = terminalWindow.left - desktop.left;
      right = terminalWindow.right - desktop.left;
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drops.length = splashes.length = ripples.length = 0;
      pendingDrops = 0;
      // 首次开启时留空，让雨从画面上方落入；稳定后缩放才预填雨幕。
      if (exitAge === null && entranceAge >= entranceDuration) {
        for (let i = 0; i < Math.min(480, width / 4) * intensity(); i++) addDrop(true);
      }
    }

    function addDrop(initial = false) {
      const x = Math.random() * (width + 160) - 80;
      // 明确分出前后景：背景较淡较慢，前景留下更长、更清晰的雨痕。
      const layer = Math.random() < 0.55 ? 0 : 1;
      const depth = layer === 0 ? 0.15 + Math.random() * 0.3 : 0.65 + Math.random() * 0.35;
      const pace = settings.speed;
      const speed = (layer === 0 ? 720 + Math.random() * 230 : 1150 + Math.random() * 400) * pace;
      const trailLength = layer === 0 ? 24 + Math.random() * 18 : 54 + Math.random() * 32;
      let y = -100;
      if (initial) {
        y = Math.random() * height;
        // 初始雨幕只采样可见区域，避免把正文区域的雨挤到窗口顶上。
        if (x >= left && x <= right && y >= roof && y <= bottom) return;
      }
      drops.push({ x, y, layer, depth, vx: wind * (0.6 + depth * 0.4),
        speed, baseSpeed: speed / pace, trailLength,
        thickness: layer === 0 ? 0.95 + Math.random() * 0.25 : 1.25 + Math.random() * 0.45,
        exposure: trailLength / speed,
        alpha: layer === 0 ? 0.2 + Math.random() * 0.1 : 0.4 + Math.random() * 0.16,
        phase: Math.random() * Math.PI * 2 });
    }

    // 线段与窗口矩形求交，同时处理顶部和风吹向侧边的碰撞。
    function windowImpact(x0, y0, x1, y1) {
      let enter = 0, exit = 1, nx = 0, ny = 0;
      for (const [start, delta, min, max, axis] of [
        [x0, x1 - x0, left, right, "x"], [y0, y1 - y0, roof, bottom, "y"],
      ]) {
        if (Math.abs(delta) < 0.00001) {
          if (start < min || start > max) return null;
          continue;
        }
        const first = Math.min((min - start) / delta, (max - start) / delta);
        const last = Math.max((min - start) / delta, (max - start) / delta);
        if (first >= enter) {
          enter = first;
          nx = axis === "x" ? -Math.sign(delta) : 0;
          ny = axis === "y" ? -Math.sign(delta) : 0;
        }
        exit = Math.min(exit, last);
        if (enter > exit) return null;
      }
      if (!(nx || ny) || enter < 0 || enter > 1) return null;
      return { x: x0 + (x1 - x0) * enter, y: y0 + (y1 - y0) * enter, nx, ny };
    }

    function splashAt(hit, drop) {
      // 借鉴落雨后扩散涟漪的节奏，把效果落在窗口边缘。
      if (hit.ny && Math.random() < (gentle ? 0.16 : 0.28)) {
        ripples.push({ x: hit.x, y: hit.y + hit.ny * 0.8, normal: hit.ny,
          radius: gentle ? 7 : 9 + Math.random() * 6,
          alpha: gentle ? 0.28 : 0.4, age: 0, duration: 0.3 + Math.random() * 0.2 });
      }
      if (Math.random() >= (gentle ? 0.45 + drop.depth * 0.25 : 0.3 + drop.depth * 0.65)) return;
      const energy = 0.35 + drop.depth * drop.speed / 1400;
      const count = gentle ? 1 + Math.floor(Math.random() * 3) : Math.floor(1 + Math.random() * 2 + energy * 3);
      for (let j = 0; j < count; j++) {
        const life = gentle ? 0.28 + Math.random() * 0.2 : 0.2 + Math.random() * 0.35;
        // 足够的初速让小水珠离开窗沿数个像素，避免混在边框里看不见。
        const outward = gentle ? 55 + Math.random() * 30 : (25 + Math.random() * 65) * energy;
        const sideways = (Math.random() * 2 - 1) * (gentle ? 18 + Math.random() * 27 : 25 + energy * 75);
        splashes.push({ x: hit.x + hit.nx, y: hit.y + hit.ny,
          vx: hit.nx * outward - hit.ny * sideways,
          vy: hit.ny * outward + hit.nx * sideways,
          size: gentle ? 1.1 + Math.random() * 0.7 : 0.4 + Math.random() * energy * 1.4,
          alpha: gentle ? 0.5 + Math.random() * 0.2 : 0.35 + drop.depth * 0.45,
          trail: gentle ? 0.005 + Math.random() * 0.005 : 0.004 + Math.random() * 0.014, life, duration: life });
      }
    }

    function draw(now) {
      const dt = previous === null ? 0 : Math.min((now - previous) / 1000, 0.04);
      previous = now;
      ctx.clearRect(0, 0, width, height);
      if (!motion.matches && !document.hidden) {
        elapsed += dt;
        const amount = intensity();
        const breeze = gentle ? 12 + Math.sin(elapsed / 7) * 5 + Math.sin(elapsed / 13) * 2
          : (Math.sin(elapsed * 0.35) * 24 + Math.sin(elapsed * 0.83) * 9) * amount;
        wind += (breeze - wind) * (1 - Math.exp(-dt * 0.7));
        // 从零星雨滴逐渐过渡到目标雨量，切换雨势不重置入场进度。
        if (exitAge !== null) {
          exitAge += dt;
          const progress = Math.min(exitAge / exitDuration, 1);
          emissionLevel = exitStart * (1 - progress * progress * (3 - 2 * progress));
        } else {
          entranceAge += dt;
          const progress = Math.min(entranceAge / entranceDuration, 1);
          emissionLevel = entranceStart + (1 - entranceStart) * progress * progress * (3 - 2 * progress);
        }
        pendingDrops += dt * Math.min(900, width * 0.45) * amount * emissionLevel;
        window.RainAudio?.update(amount, emissionLevel);
        while (pendingDrops >= 1) { addDrop(); pendingDrops--; }
        // 不让雨滴拖影或回落的水珠画到窗口内部。
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, width, height);
        ctx.rect(left, roof, right - left, bottom - roof);
        ctx.clip("evenodd");
        ctx.lineCap = "round";
        // 先绘制背景，再绘制前景；位置和落下时机独立随机。
        for (const layer of [0, 1]) {
          for (let i = drops.length - 1; i >= 0; i--) {
            const drop = drops[i];
            if (drop.layer !== layer) continue;
            const oldX = drop.x, oldY = drop.y;
            const targetSpeed = drop.baseSpeed * settings.speed * 1.12;
            drop.speed += (targetSpeed - drop.speed) * (1 - Math.exp(-dt * 1.2));
            drop.exposure = drop.trailLength / drop.speed;
            const drift = gentle ? wind * (0.85 + drop.depth * 0.2) + Math.sin(elapsed * 0.3 + drop.phase) * 0.45
              : wind * (0.4 + drop.depth) + Math.sin(elapsed * 1.2 + drop.phase) * 3;
            drop.vx += (drift - drop.vx) * (1 - Math.exp(-dt * 2));
            drop.x += drop.vx * dt;
            drop.y += drop.speed * dt;
            const hit = windowImpact(oldX, oldY, drop.x, drop.y);
            const inside = drop.x >= left && drop.x <= right && drop.y >= roof && drop.y <= bottom;
            const tipX = hit ? hit.x : drop.x, tipY = hit ? hit.y : drop.y;
            const tailX = tipX - drop.vx * drop.exposure;
            const tailY = tipY - drop.trailLength;
            const alpha = drop.alpha * (gentle ? 0.96 + 0.04 * Math.sin(elapsed * 0.45 + drop.phase)
              : 0.9 + 0.1 * Math.sin(elapsed * 1.2 + drop.phase));
            const tint = "205, 228, 250";
            const gradient = ctx.createLinearGradient(tailX, tailY, tipX, tipY);
            gradient.addColorStop(0, `rgba(${tint}, 0)`);
            gradient.addColorStop(0.45, `rgba(${tint}, ${alpha * 0.4})`);
            gradient.addColorStop(1, `rgba(${tint}, ${alpha})`);
            // 统一使用长渐变雨痕，避免尖三角和过短颗粒两种外观。
            ctx.strokeStyle = gradient;
            ctx.lineWidth = drop.thickness;
            ctx.beginPath();
            ctx.moveTo(tailX, tailY);
            ctx.lineTo(tipX, tipY);
            ctx.stroke();
            if (hit) splashAt(hit, drop);
            if (hit || inside || drop.y > height + 120 || drop.y < -120 || drop.x < -120 || drop.x > width + 120) drops.splice(i, 1);
          }
        }
        for (let i = splashes.length - 1; i >= 0; i--) {
          const splash = splashes[i];
          splash.life -= dt;
          splash.vx *= Math.exp(-1.5 * dt);
          splash.vy += 340 * dt;
          splash.x += splash.vx * dt;
          splash.y += splash.vy * dt;
          const inside = splash.x >= left && splash.x <= right && splash.y >= roof && splash.y <= bottom;
          if (splash.life <= 0 || inside) { splashes.splice(i, 1); continue; }
          ctx.lineWidth = splash.size;
          const tint = "210, 233, 255";
          ctx.strokeStyle = `rgba(${tint}, ${splash.alpha * Math.min(1, splash.life / splash.duration * 2)})`;
          ctx.beginPath();
          ctx.moveTo(splash.x, splash.y);
          ctx.lineTo(splash.x - splash.vx * splash.trail, splash.y - splash.vy * splash.trail);
          ctx.stroke();
        }
        for (let i = ripples.length - 1; i >= 0; i--) {
          const ripple = ripples[i];
          ripple.age += dt;
          if (ripple.age >= ripple.duration) { ripples.splice(i, 1); continue; }
          const progress = ripple.age / ripple.duration;
          const radius = 1 + progress * ripple.radius;
          const tint = "205, 228, 250";
          ctx.strokeStyle = `rgba(${tint}, ${ripple.alpha * (1 - progress)})`;
          ctx.lineWidth = 0.85;
          ctx.setLineDash([1, 2.5]);
          ctx.beginPath();
          ctx.ellipse(ripple.x, ripple.y, radius, 1 + radius * 0.22, 0,
            ripple.normal < 0 ? Math.PI : 0, ripple.normal < 0 ? Math.PI * 2 : Math.PI);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();
      }
      if (motion.matches && !document.hidden) window.RainAudio?.update(intensity(), exitAge === null ? 1 : 0);
      // 停止补雨后，等最后的雨丝、水珠和涟漪自然结束再释放雨层。
      if (exitAge !== null && (motion.matches || document.hidden ||
          (exitAge >= exitDuration && !drops.length && !splashes.length && !ripples.length))) {
        stopRain(true);
        return;
      }
      frame = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener("resize", resize);
    frame = requestAnimationFrame(draw);
    rainMode = mode;
    rainCleanup = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      canvas.remove();
    };
  }

  let snowCleanup = null;
  let snowBeginExit = null;
  let snowResume = null;
  let snowActive = false;

  function stopSnow(immediate = false) {
    snowActive = false;
    if (!snowCleanup) return;
    if (!immediate) { snowBeginExit(); return; }
    snowCleanup();
    snowCleanup = snowBeginExit = snowResume = null;
  }

  function startSnow() {
    stopRain();
    if (snowCleanup) { snowResume(); snowActive = true; return; }
    const canvas = document.createElement("canvas");
    canvas.className = "snow-layer";
    canvas.ariaHidden = "true";
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    snowActive = true;
    $desktop.appendChild(canvas);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const flakes = [];
    const bank = new Float32Array(90);
    const deposited = new Float32Array(bank.length);
    const snowParticles = [];
    const overhang = new Float32Array(2);
    const snowLip = new Float32Array(2);
    const meltPhase = Math.random() * Math.PI * 2;
    const meltRates = Float32Array.from(bank, (_, i) =>
      0.85 + 0.18 * Math.sin(i * 0.16 + meltPhase) + 0.12 * Math.sin(i * 0.37 + meltPhase));
    let width, height, roof, left, right, bottom;
    let frame, previous = null, elapsed = 0, pending = 0, sidePending = 0;
    let visibility = 0, exiting = false;
    let exitAge = 0;
    let snowDrift = 0;
    const rand = (min, max) => min + Math.random() * (max - min);
    const edgeCollapseAt = [rand(12, 20), rand(12, 20)];
    let nextSlide = rand(12, 22), nextGust = rand(7, 12);
    let gustAge = 0, gustDuration = 0, gustDirection = 1, powderPending = 0, gustOrigin = 0.5;

    function looseSnow(x, y, amount, direction = 0) {
      for (let i = 0; i < amount && snowParticles.length < 120; i++) {
        snowParticles.push({ x: x + rand(-5, 5), y: y + rand(-2, 0),
          vx: direction * rand(22, 42) + rand(-10, 10),
          vy: rand(-22, -8), radius: rand(0.65, 1.3), age: 0, life: rand(0.75, 1.25), lump: false });
      }
    }

    function moveSnow(dt) {
      const spacing = (right - left) / (bank.length - 1);
      if (elapsed >= nextSlide) {
        nextSlide = elapsed + rand(12, 22);
        const candidates = [];
        for (let i = 5; i < bank.length - 5; i++) if (bank[i] > 5) candidates.push(i);
        if (candidates.length) {
          const index = candidates[Math.floor(Math.random() * candidates.length)];
          const depth = rand(1.8, 3.5);
          for (let j = index - 3; j <= index + 3; j++) {
            const loss = Math.min(deposited[j], depth * (1 - Math.abs(j - index) / 4));
            deposited[j] -= loss;
          }
          // 小雪团先从雪檐松脱，再在下落途中散开。
          snowParticles.push({ x: left + index * spacing, y: roof - bank[index],
            vx: rand(-8, 8), vy: 3, radius: rand(2.5, 4), age: 0, life: 0.65, lump: true });
        }
      }
      if (elapsed >= nextGust) {
        gustAge = 0; gustDuration = rand(5, 8); gustDirection = Math.random() < 0.5 ? -1 : 1;
        gustOrigin = rand(0.25, 0.75);
        nextGust = elapsed + gustDuration + rand(9, 16);
      }
      if (gustAge >= gustDuration) return 0;
      gustAge += dt;
      const strength = Math.sin(Math.PI * Math.min(1, gustAge / gustDuration));
      const center = (gustOrigin + gustDirection * 0.18 * gustAge / gustDuration) * (bank.length - 1);
      // 顺风搬运表层积雪；反向遍历，避免同一帧连续搬走同一份雪。
      for (let k = 0; k < bank.length; k++) {
        const i = gustDirection > 0 ? bank.length - 1 - k : k;
        const to = i + gustDirection;
        const transfer = Math.min(deposited[i], deposited[i] * dt * strength * 0.22);
        deposited[i] -= transfer;
        if (to >= 0 && to < bank.length) deposited[to] += transfer;
        else overhang[to < 0 ? 0 : 1] += transfer * 0.35;
        // 风卷走局部表层雪，留下由新雪慢慢填补的浅凹。
        const exposure = Math.exp(-Math.pow((i - center) / 8, 2));
        const protrusion = Math.max(0, deposited[i] -
          (deposited[Math.max(0, i - 1)] + deposited[Math.min(bank.length - 1, i + 1)]) / 2);
        deposited[i] = Math.max(0, deposited[i] - dt * strength *
          (exposure * 0.9 + protrusion * 0.65));
      }
      powderPending += dt * strength * 4;
      while (powderPending >= 1) {
        powderPending--;
        const index = Math.max(2, Math.min(bank.length - 3, Math.round(center + rand(-9, 9))));
        if (bank[index] > 0.5) looseSnow(left + index * spacing, roof - bank[index],
          Math.floor(rand(1, 3)), gustDirection);
      }
      return gustDirection * strength * 48;
    }

    function resize() {
      const desktop = $desktop.getBoundingClientRect();
      const windowRect = document.getElementById("window").getBoundingClientRect();
      width = desktop.width; height = desktop.height;
      roof = windowRect.top - desktop.top;
      left = windowRect.left - desktop.left; right = windowRect.right - desktop.left;
      bottom = windowRect.bottom - desktop.top;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function circle(x, y, radius, color) {
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
    }

    function spawnFlake(x, y) {
      const depth = Math.random();
      const windGain = rand(0.75, 1.15);
      flakes.push({ x, y, radius: 0.8 + depth * 1.9,
        speed: 32 + depth * 48, alpha: 0.35 + depth * 0.5,
        vx: snowDrift * windGain, windGain, responseTime: 0.65 + depth * 0.8 + rand(0, 0.4),
        phase: rand(0, Math.PI * 2), sway: rand(4, 15), frequency: rand(0.6, 1.3) });
    }

    function draw(now) {
      const dt = previous === null ? 0 : Math.min((now - previous) / 1000, 0.05);
      previous = now;
      if (document.hidden) {
        if (exiting) { stopSnow(true); return; }
        frame = requestAnimationFrame(draw); return;
      }
      elapsed += dt;
      visibility = Math.min(1, visibility + dt * 0.5);
      if (exiting) exitAge += dt;
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = visibility;
      const gust = !motion.matches && !exiting ? moveSnow(dt) : 0;
      const wind = gust + 7 * Math.sin(elapsed * 0.22);
      // 屏幕外的雪同样带着惯性，侧边补雪依据实际漂移速度而非瞬时风速。
      if (!motion.matches) snowDrift += (wind - snowDrift) * (1 - Math.exp(-dt / 1.2));
      if (!motion.matches && !exiting) {
        const emission = Math.min(65, width / 20) * Math.min(1, elapsed / 3);
        pending += dt * emission;
        while (pending >= 1) {
          pending--;
          spawnFlake(rand(-30, width + 30), -8);
        }
        // 按雪花密度和横向风速补充迎风侧来雪，避免屏幕边界形成无雪带。
        const density = emission / Math.max(1, width + 60) / 56;
        sidePending += dt * density * height * Math.abs(snowDrift);
        while (sidePending >= 1) {
          sidePending--;
          spawnFlake(snowDrift > 0 ? -4 : width + 4, rand(-8, height));
        }
      }
      for (let i = flakes.length - 1; i >= 0; i--) {
        const flake = flakes[i], oldY = flake.y;
        if (!motion.matches) {
          const flutter = flake.sway * Math.sin(elapsed * flake.frequency + flake.phase);
          const localWind = wind * flake.windGain *
            (1 + 0.12 * Math.sin(flake.x * 0.008 + flake.y * 0.005 + elapsed * 0.7));
          // 每片雪花分别加速和减速，较大的雪花响应稍慢，避免整片同时转向。
          flake.vx += (localWind + flutter - flake.vx) * (1 - Math.exp(-dt / flake.responseTime));
          flake.x += flake.vx * dt;
          flake.y += flake.speed * dt;
        }
        const index = Math.max(0, Math.min(bank.length - 1,
          Math.floor((flake.x - left) / Math.max(1, right - left) * (bank.length - 1))));
        const surface = roof - bank[index];
        if (flake.x >= left && flake.x <= right && oldY <= surface && flake.y >= surface) {
          for (let j = Math.max(0, index - 3); j <= Math.min(bank.length - 1, index + 3); j++) {
            deposited[j] += (1 - Math.abs(j - index) / 4) * flake.radius * 0.16;
          }
          flakes.splice(i, 1); continue;
        }
        if (flake.y > height + 10 || flake.x < -60 || flake.x > width + 60) {
          flakes.splice(i, 1); continue;
        }
        // 窗口移动或缩放后，雪花也不会穿进正文。
        if (flake.x > left && flake.x < right && flake.y > roof && flake.y < bottom) continue;
        ctx.globalAlpha = visibility * flake.alpha;
        circle(flake.x, flake.y, flake.radius, "#e5edf7");
      }
      // 相邻雪堆缓慢摊开，保留真实落点带来的起伏，不再趋向预设轮廓。
      if (!motion.matches && !exiting) {
        const stableRise = Math.max(1, (right - left) / (bank.length - 1) * 0.45);
        for (let i = 0; i < bank.length - 1; i++) {
          const difference = deposited[i] - deposited[i + 1];
          // 雪在窗沿上摊开，两端也保留厚度；悬出的部分另行积累、坍落。
          const excess = Math.max(0, Math.abs(difference) - stableRise);
          const spread = Math.sign(difference) * Math.min(Math.abs(difference) / 2,
            (Math.abs(difference) * 0.45 + excess * 2) * dt);
          deposited[i] -= spread; deposited[i + 1] += spread;
        }
        for (let side = 0; side < 2; side++) {
          const index = side === 0 ? 0 : bank.length - 1;
          const direction = side === 0 ? -1 : 1;
          const height = deposited[index];
          overhang[side] += dt * Math.sqrt(height) * 0.06;
          // 厚雪檐偶尔断掉一小块，两侧独立变化，不把边缘全部清空。
          if (height > 7 && overhang[side] > 5 && elapsed >= edgeCollapseAt[side]) {
            overhang[side] *= 0.2;
            edgeCollapseAt[side] = elapsed + rand(12, 22);
            const depth = Math.min(height * 0.25, rand(2, 4));
            for (let j = 0; j < 4; j++) {
              const at = index - direction * j;
              deposited[at] = Math.max(0, deposited[at] - depth * (1 - j / 4));
            }
            if (snowParticles.length < 120) snowParticles.push({
              x: side === 0 ? left - 2 : right + 2, y: roof - bank[index] * 0.3,
              vx: direction * rand(5, 12), vy: 5, radius: rand(2.5, 4), age: 0, life: 0.65, lump: true });
          }
        }
      }
      if (exiting) {
        // 融雪改变实际厚度，保持雪的颜色；不同位置缓慢消融，不整层降透明度。
        const warmth = Math.min(1, exitAge / 3);
        for (let i = 0; i < deposited.length; i++) {
          deposited[i] = Math.max(0, deposited[i] -
            dt * warmth * meltRates[i] * (1.2 + deposited[i] * 0.08));
        }
        for (let side = 0; side < 2; side++) {
          overhang[side] = Math.max(0, overhang[side] - dt * warmth * (0.7 + overhang[side] * 0.2));
        }
      }
      // 落雪先增加目标高度，再缓慢沉积，避免每次碰撞都跳出一个小凸起。
      const settling = 1 - Math.exp(-dt / 1.8);
      for (let i = 0; i < bank.length; i++) bank[i] += (deposited[i] - bank[i]) * settling;
      for (let side = 0; side < 2; side++) snowLip[side] += (overhang[side] - snowLip[side]) * settling;
      ctx.globalAlpha = visibility;
      const leftHeight = bank[0], rightHeight = bank[bank.length - 1];
      const leftExtent = Math.min(8, leftHeight * 0.16 + snowLip[0] * 0.4);
      const rightExtent = Math.min(8, rightHeight * 0.16 + snowLip[1] * 0.4);
      const leftDrop = Math.min(5, leftHeight * 0.08 + snowLip[0] * 0.45);
      const rightDrop = Math.min(5, rightHeight * 0.08 + snowLip[1] * 0.45);
      ctx.beginPath(); ctx.moveTo(left, roof + leftDrop);
      ctx.quadraticCurveTo(left - leftExtent, roof + leftDrop, left - leftExtent, roof - leftHeight * 0.5);
      ctx.quadraticCurveTo(left - leftExtent, roof - leftHeight, left, roof - leftHeight);
      const step = (right - left) / (bank.length - 1);
      for (let i = 1; i < bank.length - 1; i++) {
        ctx.quadraticCurveTo(left + i * step, roof - bank[i],
          left + (i + 0.5) * step, roof - (bank[i] + bank[i + 1]) / 2);
      }
      ctx.quadraticCurveTo(right, roof - rightHeight, right + rightExtent, roof - rightHeight * 0.5);
      ctx.quadraticCurveTo(right + rightExtent, roof + rightDrop, right, roof + rightDrop);
      ctx.lineTo(left, roof + leftDrop); ctx.closePath();
      ctx.fillStyle = "#dce6f0"; ctx.fill();
      for (let i = snowParticles.length - 1; i >= 0; i--) {
        const particle = snowParticles[i];
        if (!motion.matches) {
          particle.age += dt;
          particle.vy += (particle.lump ? 95 : 22) * dt;
          particle.vx += (wind * 0.6 - particle.vx) *
            (1 - Math.exp(-dt / (particle.lump ? 2 : 0.45)));
          particle.x += particle.vx * dt;
          particle.y += particle.vy * dt;
        }
        if (particle.age >= particle.life) {
          snowParticles.splice(i, 1);
          if (particle.lump && !exiting) looseSnow(particle.x, particle.y, 4);
          continue;
        }
        ctx.globalAlpha = visibility * (particle.lump ? 0.9 : 0.45) * (1 - particle.age / particle.life);
        ctx.beginPath();
        ctx.ellipse(particle.x, particle.y, particle.radius * (particle.lump ? 1.5 : 1),
          particle.radius, particle.lump ? particle.age * 0.8 : 0, 0, Math.PI * 2);
        ctx.fillStyle = "#e5edf7"; ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (exiting && !flakes.length && !snowParticles.length &&
          bank.every(height => height < 0.05) && snowLip.every(height => height < 0.05)) {
        stopSnow(true); return;
      }
      frame = requestAnimationFrame(draw);
    }

    snowBeginExit = () => {
      if (document.hidden || motion.matches) { stopSnow(true); return; }
      if (!exiting) exitAge = 0;
      exiting = true;
    };
    snowResume = () => { exiting = false; exitAge = 0; };
    snowCleanup = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      canvas.remove();
    };
    resize();
    window.addEventListener("resize", resize);
    frame = requestAnimationFrame(draw);
  }

  function resetWeather() {
    stopRainbow();
    stopMeteors();
    stopRain();
    stopSnow();
    delete $desktop.dataset.decoration;
    print("# 今夜就开始放晴", "ok");
  }

  // 只在成功 cd 后应用；未指定的项目保持现状。
  function applyDirectoryAppearance(path) {
    if (!Object.prototype.hasOwnProperty.call(APPEARANCE, path)) return;
    const appearance = APPEARANCE[path];
    if (appearance.reset) {
      resetWeather();
      return;
    }
    const starsActive = $desktop.dataset.decoration === "stars";
    const newlyEnabled = (appearance.rain && rainMode === null)
      || (appearance.snow && !snowActive)
      || (appearance.decoration === "stars" && !starsActive);
    if (appearance.rain) startRain(appearance.rain === true ? "medium" : appearance.rain);
    if (appearance.snow) startSnow();
    if (appearance.decoration === "stars" && !starsActive) startStars();
    if (!newlyEnabled) return;
    const message =
        appearance.rain ? "# 雨的铿锵临盆比梦的合奏还静..."
      : appearance.decoration === "stars" ? "# You will be the star. You will be the one. "
      : appearance.snow ? "# 天地 不慢不快 不好不坏 专心而澎湃"
      : "已应用桌面外观；离开目录后保留，刷新后清除。";
    print(message, "ok");
  }

  function isFile(p) {
    return Object.prototype.hasOwnProperty.call(FILES, p) && !FILES[p].internal;
  }

  function isDir(p) {
    if (p === "/") return true;
    return allDirs().includes(p.replace(/\/$/, ""));
  }

  function listDir(p, showHidden = false) {
    if (!isDir(p)) return null;
    const prefix = p === "/" ? "/" : p + "/";
    const set = new Set();
    for (const k of [...Object.keys(FILES), ...allDirs()]) {
      if (FILES[k]?.internal) continue;
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
    if (f.type === "audio") return "audio";
    return "file";
  }

  function hasGlob(path) {
    return /[*?]/.test(path);
  }

  function globSegmentToRegExp(segment) {
    const body = Array.from(segment).map(ch => {
      if (ch === "*") return "[^/]*";
      if (ch === "?") return "[^/]";
      return ch.replace(/[\\^$+?.()|[\]{}]/g, "\\$&");
    }).join("");
    return new RegExp("^" + body + "$");
  }

  function matchGlobPath(pattern, path) {
    const patternParts = pattern.split("/").filter(Boolean);
    const pathParts = path.split("/").filter(Boolean);
    if (patternParts.length !== pathParts.length) return false;
    return patternParts.every((part, i) => {
      const name = pathParts[i];
      if (name.startsWith(".") && !part.startsWith(".")) return false;
      return globSegmentToRegExp(part).test(name);
    });
  }

  function allDirs() {
    const dirs = new Set(["/"]);
    for (const file of Object.keys(FILES)) {
      if (FILES[file].internal) continue;
      const parts = file.split("/").filter(Boolean);
      for (let i = 1; i < parts.length; i++) {
        dirs.add("/" + parts.slice(0, i).join("/"));
      }
    }
    // Weather paths are functional entries, even without a readme or other files.
    for (const path of Object.keys(APPEARANCE)) {
      const parts = path.split("/").filter(Boolean);
      for (let i = 1; i <= parts.length; i++) {
        dirs.add("/" + parts.slice(0, i).join("/"));
      }
    }
    return [...dirs].sort((a, b) => a.localeCompare(b));
  }

  function expandDirGlob(arg) {
    if (!hasGlob(arg)) return [normalize(arg)];
    const pattern = normalize(arg);
    return allDirs().filter(path => matchGlobPath(pattern, path));
  }

  function expandFileGlobs(args) {
    const out = [];
    for (const arg of args) {
      if (!hasGlob(arg)) {
        out.push({ input: arg, path: normalize(arg), glob: false });
        continue;
      }

      const pattern = normalize(arg);
      const matches = Object.keys(FILES)
        .filter(path => isFile(path) && matchGlobPath(pattern, path))
        .sort((a, b) => a.localeCompare(b));

      if (matches.length === 0) out.push({ input: arg, path: pattern, glob: true, missing: true });
      else matches.forEach(path => out.push({ input: arg, path, glob: true }));
    }
    return out;
  }

  function charWidth(ch) {
    const cp = ch.codePointAt(0);
    if (
      (cp >= 0x0300 && cp <= 0x036f) ||
      (cp >= 0xfe00 && cp <= 0xfe0f)
    ) return 0;
    if (
      cp >= 0x1100 &&
      (cp <= 0x115f || cp === 0x2329 || cp === 0x232a ||
       (cp >= 0x2e80 && cp <= 0xa4cf) ||
       (cp >= 0xac00 && cp <= 0xd7a3) ||
       (cp >= 0xf900 && cp <= 0xfaff) ||
       (cp >= 0xfe10 && cp <= 0xfe19) ||
       (cp >= 0xfe30 && cp <= 0xfe6f) ||
       (cp >= 0xff00 && cp <= 0xff60) ||
       (cp >= 0xffe0 && cp <= 0xffe6))
    ) return 2;
    return 1;
  }

  function textWidth(text) {
    return Array.from(text).reduce((sum, ch) => sum + charWidth(ch), 0);
  }

  function terminalWidthPx() {
    const style = getComputedStyle($terminal);
    return $terminal.clientWidth
      - parseFloat(style.paddingLeft || 0)
      - parseFloat(style.paddingRight || 0);
  }

  function charWidthPx() {
    const probe = document.createElement("span");
    probe.style.cssText = "visibility:hidden;position:absolute;white-space:pre;font:inherit";
    probe.textContent = "0";
    $terminal.appendChild(probe);
    const ch = probe.getBoundingClientRect().width || 8;
    probe.remove();
    return ch;
  }

  function terminalColumns() {
    return Math.max(1, Math.floor(terminalWidthPx() / charWidthPx()));
  }

  function measureTextPx(text) {
    const probe = document.createElement("span");
    probe.style.cssText = "visibility:hidden;position:absolute;white-space:pre;font:inherit";
    probe.textContent = text;
    $terminal.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return Math.ceil(width);
  }

  function renderLsGrid(entries) {
    const gapPx = charWidthPx() * 2;
    const maxCols = entries.length;
    const available = terminalWidthPx();

    for (let cols = maxCols; cols > 1; cols--) {
      const rows = Math.ceil(entries.length / cols);
      // Rounding the row count can leave entire trailing columns empty.
      if (Math.ceil(entries.length / rows) !== cols) continue;
      const widths = Array.from({ length: cols }, (_, col) => {
        let w = 0;
        for (let row = 0; row < rows; row++) {
          const item = entries[col * rows + row];
          if (item) w = Math.max(w, item.widthPx);
        }
        return w;
      });
      const total = widths.reduce((sum, w) => sum + w, 0) + gapPx * (cols - 1);
      if (total <= available) return renderLsGridWithColumns(entries, rows, widths);
    }

    return renderLsGridWithColumns(entries, entries.length, [
      Math.min(available, Math.max(...entries.map(item => item.widthPx))),
    ]);
  }

  function renderLsGridWithColumns(entries, rows, widths) {
    const cols = widths.length;
    const cells = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const item = entries[col * rows + row];
        if (item) cells.push(`<div class="ls-cell" style="grid-column:${col + 1};grid-row:${row + 1}">${item.html}</div>`);
      }
    }
    const columns = widths.map(w => `${w}px`).join(" ");
    printHTML(`<div class="ls-grid" style="grid-template-columns:${columns}">${cells.join("")}</div>`);
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

  function currentToken(value) {
    const m = value.match(/(\S*)$/);
    const token = m ? m[1] : "";
    return { token, start: value.length - token.length };
  }

  function completionContext(value) {
    const { token, start } = currentToken(value);
    const firstTokenOnly = start === 0 && !/\s/.test(value);
    if (firstTokenOnly) {
      return {
        kind: "command",
        token,
        start,
        candidates: Object.keys(commands)
          .filter(c => c.startsWith(token))
          .map(c => ({ value: c, label: c, isDir: false })),
      };
    }

    let dir, prefix, shownPrefix;
    const slash = token.lastIndexOf("/");
    if (slash >= 0) {
      dir = normalize(token.slice(0, slash) || "/");
      prefix = token.slice(slash + 1);
      shownPrefix = token.slice(0, slash + 1);
    } else {
      dir = state.cwd;
      prefix = token;
      shownPrefix = "";
    }

    const command = tokenize(value.slice(0, start).trim())[0] || "";
    const items = listDir(dir, prefix.startsWith(".")) || [];
    let candidates = items
      .filter(name => name.startsWith(prefix))
      .filter(name => {
        if (command !== "play") return true;
        const full = (dir === "/" ? "/" : dir + "/") + name;
        return isFile(full) && FILES[full].type === "audio";
      })
      .map(name => {
        const full = (dir === "/" ? "/" : dir + "/") + name;
        const isD = isDir(full);
        const label = name + (isD ? "/" : "");
        return { value: shownPrefix + label, label, isDir: isD };
      });

    if (command === "play" && slash < 0) {
      const seen = new Set(candidates.map(c => c.label));
      const playlist = listDir("/playlist", prefix.startsWith(".")) || [];
      for (const name of playlist) {
        const full = "/playlist/" + name;
        if (!name.startsWith(prefix) || !isFile(full) || FILES[full].type !== "audio" || seen.has(name)) continue;
        candidates.push({ value: name, label: name, isDir: false });
        seen.add(name);
      }
    }

    return { kind: "path", token, start, candidates };
  }

  function tabComplete() {
    const v = $input.value;
    const ctx = completionContext(v);
    if (ctx.candidates.length === 0) return;
    if (ctx.candidates.length === 1 && ctx.token) {
      applyCompletion(ctx.candidates[0], ctx);
      return;
    }
    openCompletion(ctx);
  }

  function openCompletion(ctx) {
    closeCompletion();
    const rowEl = document.createElement("div");
    rowEl.className = "row completion-row";
    $inputLine.insertAdjacentElement("afterend", rowEl);
    state.completion = {
      row: rowEl,
      input: $input.value,
      start: ctx.start,
      candidates: ctx.candidates,
      index: 0,
      cols: completionColumns(ctx.candidates),
    };
    renderCompletion();
    applyCompletion(ctx.candidates[0], ctx, true);
  }

  function closeCompletion() {
    if (state.completion && state.completion.row) state.completion.row.remove();
    state.completion = null;
  }

  function renderCompletion() {
    const c = state.completion;
    if (!c) return;
    c.row.innerHTML =
      `<div class="completion-grid" style="grid-template-columns:repeat(${c.cols}, max-content)">` +
      c.candidates.map((item, i) => {
        const cls = i === c.index ? "completion-item selected" : "completion-item";
        return `<span class="${cls}">${esc(item.label)}</span>`;
      }).join("") +
      `</div>`;
    scrollDown();
  }

  function completionColumns(candidates) {
    const gap = 2;
    const available = terminalColumns();
    for (let cols = candidates.length; cols > 1; cols--) {
      const rows = Math.ceil(candidates.length / cols);
      const widths = Array.from({ length: cols }, (_, col) => {
        let w = 0;
        for (let row = 0; row < rows; row++) {
          const item = candidates[row * cols + col];
          if (item) w = Math.max(w, textWidth(item.label));
        }
        return w;
      });
      const total = widths.reduce((sum, w) => sum + w, 0) + gap * (cols - 1);
      if (total <= available) return cols;
    }
    return 1;
  }

  function moveCompletion(delta) {
    const c = state.completion;
    if (!c) return;
    c.index = (c.index + delta + c.candidates.length) % c.candidates.length;
    renderCompletion();
    applyCompletion(c.candidates[c.index], null, true);
  }

  function applyCompletion(item, ctx = null, preview = false) {
    const c = state.completion;
    const start = ctx ? ctx.start : c.start;
    const base = ctx ? $input.value : c.input;
    const needsSpace = !item.isDir && !item.value.endsWith(" ");
    const completed = base.slice(0, start) + item.value + (needsSpace ? " " : "");
    setInputValue(completed);
    if (preview) return;
    closeCompletion();
  }

  function handleCompletionKey(e) {
    const c = state.completion;
    if (!c) return false;
    if (e.key === "ArrowRight") { e.preventDefault(); moveCompletion(1); return true; }
    if (e.key === "ArrowLeft")  { e.preventDefault(); moveCompletion(-1); return true; }
    if (e.key === "ArrowDown")  { e.preventDefault(); moveCompletion(c.cols); return true; }
    if (e.key === "ArrowUp")    { e.preventDefault(); moveCompletion(-c.cols); return true; }
    if (e.key === "Tab")        { e.preventDefault(); moveCompletion(e.shiftKey ? -1 : 1); return true; }
    if (e.key === "Enter") {
      e.preventDefault();
      applyCompletion(c.candidates[c.index]);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closeCompletion();
      return true;
    }
    return false;
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

    if (handleCompletionKey(e)) return;

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
      closeCompletion();
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
    closeCompletion();
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
        printHTML(`<span class="h2">基础</span>`);
        const tier1 = [
          ["ls [-a] [path]",     "列出目录内容"],
          ["cd <path>",          "进入目录"],
          ["cat <file...>",      "查看文件"],
          ["pwd",                "当前路径"],
          ["tree [path]",        "目录树"],
          ["clear",              "清屏 (Ctrl+L)"],
          ["echo <text>",        "输出文字"],
          ["play <file.mp3>",     "播放 playlist 音频"],
          ["message",            "匿名留言箱"],
          ["help",               "看这份帮助"],
        ];
        printHTML(renderHelpTable(tier1));
        printBlank();
        printHTML(`* 支持简单的通配符和 tab 补全. 可以通过 Ctrl-C 打断一条命令的键入. 支持上下箭头回溯命令历史. `);
        printHTML(`* 其实只使用 tab 和方向键就足以访问此站点的大部分内容. `);
        printBlank();
        printHTML(`<span class="h2">And more...</span>`);
      },
    },

    "rain-sound": {
      desc: "开关雨声或设置音量（0–100）",
      run(args) {
        const sound = window.RainAudio;
        if (!sound || !sound.status().available) return print("当前浏览器暂不支持雨声。", "dim");
        const value = args[0];
        if (args.length > 1) return print("用法: rain-sound [on|off|0–100]", "dim");
        if (value === "on" || value === "off") sound.setEnabled(value === "on");
        else if (value !== undefined) {
          if (!/^\d{1,3}$/.test(value) || Number(value) > 100) return print("音量请输入 0–100。", "dim");
          sound.setVolume(Number(value));
        }
        const status = sound.status();
        print(`雨声：${status.enabled && status.volume ? "开" : "关"}，音量 ${status.volume}%。${status.active ? "" : "下雨时生效。"}`, "dim");
      },
    },

    "make-a-wish": {
      desc: "许个愿，唤来一阵流星雨",
      run() {
        startStars(false);
        if (meteorShower()) print("许个愿吧。", "note");
        else print("愿望已经在路上了。", "dim");
      },
    },

    "reset-weather": {
      desc: "取消所有天气效果，雨会逐渐停下",
      run() { resetWeather(); },
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
                     : k === "audio" ? "audio"
                     : "file";
            const tag = k === "dir" ? "d" : k === "image" ? "i" : k === "audio" ? "a" : "-";
            return `<span class="dim">${tag}rwxr-xr-x</span>  <span class="${cls}">${esc(name)}${k==="dir"?"/":""}</span>`;
          });
          return printHTML(rows.join("<br>"));
        }

        const entries = items.map(name => {
          const full = (target === "/" ? "/" : target + "/") + name;
          const k = entryKind(full);
          const cls = name.startsWith(".") ? "hidden"
                   : k === "dir"   ? "dir"
                   : k === "image" ? "image"
                   : k === "audio" ? "audio"
                   : "file";
          const suf = k === "dir" ? "/" : "";
          const label = name + suf;
          return {
            html: `<span class="${cls}">${esc(label)}</span>`,
            width: textWidth(label),
            widthPx: measureTextPx(label),
          };
        });
        renderLsGrid(entries);
      },
    },

    cd: {
      desc: "切目录",
      run(args) {
        const input = args[0] || "~";
        const matches = expandDirGlob(input);
        if (matches.length === 0) return printErr(`cd: ${input}: 没有匹配的目录`);
        if (matches.length > 1) {
          printErr(`cd: ${input}: 匹配到多个目录`);
          return printHTML(matches.map(p => `<span class="dir">${esc(p)}</span>`).join("   "));
        }
        const target = matches[0];
        if (!isDir(target)) return printErr(`cd: ${target}: 不是目录`);
        state.prevCwd = state.cwd;
        state.cwd = target;
        updatePrompt();
        applyDirectoryAppearance(target);
      },
    },

    pwd: {
      desc: "当前路径",
      run() { print(state.cwd); },
    },

    cat: {
      desc: "看文件",
      run(args) {
        if (args.length === 0) {
          printErr("cat: 不是猫猫");
          print(String.raw`
      /\_)o<
     |      \
     | O . O|
      \_____/`);
          return;
        }
        const expanded = expandFileGlobs(args);
        const validFiles = expanded.filter(item => !item.missing && isFile(item.path));
        const showNames = validFiles.length > 1;
        let rendered = 0;
        for (const item of expanded) {
          const p = item.path;
          const a = item.input;
          if (item.missing) {
            printErr(`cat: ${a}: 没有匹配的文件`);
            continue;
          }
          if (!isFile(p)) {
            if (isDir(p)) { printErr(`cat: ${a}: 是目录`); continue; }
            printErr(`cat: ${a}: 没有这个文件`); continue;
          }
          const f = FILES[p];
          if (showNames) {
            if (rendered > 0) printBlank();
            printHTML(`<span class="cat-file-heading">==&gt; ${esc(p)} &lt;==</span>`);
          }
          if (f.type === "image") {
            renderPhoto(f, p);
            rendered++;
            continue;
          }
          if (f.type === "audio") {
            print(`这是音频文件. 用 play ${basename(p)} 播放.`, "dim");
            rendered++;
            continue;
          }
          if (f.src || f.type === "text") {
            const target = row("读取中…", "dim");
            window.FS.readFile(p).then(text => {
              if (!target.isConnected) return;
              target.className = "row";
              if (f.format === "text") target.textContent = text;
              else renderMarkdown(text, target);
            }).catch(error => {
              if (!target.isConnected) return;
              target.className = "row bad";
              target.textContent = `cat: ${a}: ${error.message}`;
            });
          } else if (/\.txt$/i.test(p)) {
            print(f.content || "");
          } else {
            renderMarkdown(f.content || "");
          }
          rendered++;
        }
      },
    },

    play: {
      desc: "播放 playlist 里的音频",
      run(args, raw) {
        const input = raw.replace(/^play\s*/, "").trim();
        if (!input) {
          const tracks = Object.keys(FILES)
            .filter(p => FILES[p].type === "audio")
            .sort((a, b) => a.localeCompare(b));
          if (tracks.length === 0) {
            print("用法: play <file.mp3>", "dim");
            return print("还没有登记任何音频. 在 fs.js 里添加 /playlist/*.mp3 即可.", "dim");
          }
          print("可播放:", "note");
          tracks.forEach(p => printHTML(`<span class="audio">${esc(p)}</span>`));
          return;
        }

        let matches = expandFileGlobs([input])
          .filter(item => !item.missing && isFile(item.path) && FILES[item.path].type === "audio")
          .map(item => item.path);

        if (matches.length === 0 && !input.includes("/")) {
          matches = expandFileGlobs(["/playlist/" + input])
            .filter(item => !item.missing && isFile(item.path) && FILES[item.path].type === "audio")
            .map(item => item.path);
        }

        matches = [...new Set(matches)].sort((a, b) => a.localeCompare(b));
        if (matches.length === 0) return printErr(`play: ${input}: 没有匹配的音频文件`);
        if (matches.length > 1) {
          printErr(`play: ${input}: 匹配到多首音频`);
          return printHTML(matches.map(p => `<span class="audio">${esc(p)}</span>`).join("<br>"));
        }

        playAudio(matches[0]);
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

    man: {
      desc: "手册页",
      run(args) {
        if (!args[0]) return print("用法: man <name>. 试试 `man you`?", "dim");
        const t = args[0];
        if (t === "you" || t === "me") {
          renderMarkdown(`
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
      print("看右上角^^");
    }},

    // ---------- Tier 2: message (核心功能) ----------
    message: {
      desc: "在终端里给我留句话",
      run() {
        state.multiline = { lines: [], target: "message" };
        printHTML(`<span class="note">这是一个接入了 web3form 服务的匿名留言箱. (直接换行继续输入, <span class="kw">.send</span> 发送, <span class="kw">.cancel</span> 取消)</span>`);
        updatePrompt();
      },
    },

    // ---------- Tier 3: 彩蛋 ----------
    sudo: {
      desc: "(嗯?)",
      run(args, raw) {
        const sub = raw.replace(/^sudo\s*/, "").trim();
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
          "Permission denied. 这里是来宾区.",
          "依然 Permission denied. 你想干嘛?",
          "Permission denied. 你很有毅力, 但这里依然没有 sudo.",
          "依旧 Permission denied.",
        ];
        printErr(lines[Math.min(state.sudoFails-1, lines.length-1)]);
      },
    },

    rm: {
      desc: "(?)",
      run(args) {
        const target = args.join(" ").trim();
        if (!target) {
          print("rm: missing operand", "bad");
          print("但这里没有什么真的能被删掉.", "dim");
          return;
        }

        const names = expandFileGlobs(args)
          .filter(item => !item.missing)
          .map(item => basename(item.path));
        const label = names.length > 0 ? names.join(", ") : target;

        print(`rm: cannot remove '${label}': read-only file system`, "bad");
        setTimeout(() => print("文件们松了一口气.", "dim"), 450);
      },
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

    tea: {
      desc: "(?)",
      run() {
        print("for you")},
      
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
  function renderMarkdown(text, target = null) {
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
    if (target) target.innerHTML = html;
    else printHTML(html);
  }

  function renderASCII(text) {
    printHTML(`<pre class="ascii" style="margin:0;line-height:1.15">${esc(text)}</pre>`);
  }

  function renderHelpTable(rows) {
    return `<div class="tbl">${rows.map(([k, v]) =>
      `<div class="k">${esc(k)}</div><div class="v">${esc(v)}</div>`
    ).join("")}</div>`;
  }

  function renderPhoto(file, path) {
    const wrap = row("", "photo-row");
    const figure = document.createElement("figure");
    figure.className = "pocket-photo";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "photo-open";
    button.disabled = true;
    const label = basename(path);
    button.setAttribute("aria-label", `放大查看 ${label}`);
    const image = document.createElement("img");
    image.className = "photo-image";
    image.alt = label;
    image.loading = "lazy";
    image.decoding = "async";
    const status = document.createElement("span");
    status.className = "photo-status dim";
    status.setAttribute("role", "status");
    status.textContent = "照片加载中…";
    const src = window.FS.assetURL(file);
    image.addEventListener("load", () => {
      image.className = "photo-image is-loaded";
      button.disabled = false;
      status.hidden = true;
    });
    image.addEventListener("error", () => {
      button.hidden = true;
      status.className = "photo-status bad";
      status.textContent = `无法加载 ${label}，请稍后重试。`;
    });
    button.addEventListener("click", event => {
      event.stopPropagation();
      showImage(src, label, button);
    });
    button.appendChild(image);
    figure.appendChild(button);
    figure.appendChild(status);
    wrap.appendChild(figure);
    if (file.caption) {
      const caption = document.createElement("figcaption");
      caption.className = "photo-caption";
      figure.appendChild(caption);
      window.FS.readFile(file.caption).then(text => {
        if (!caption.isConnected) return;
        if (FILES[file.caption].format === "text") caption.textContent = text;
        else renderMarkdown(text, caption);
      }).catch(() => {
        if (caption.isConnected) caption.textContent = "照片说明暂时无法读取。";
      });
    }
    image.src = src;
  }

  function showImage(src, label, trigger = null) {
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", label || "照片");
    overlay.innerHTML = `
      <div class="panel">
        <div class="ctl"><span>${esc(label || "image")}</span><button class="photo-close" type="button" aria-label="关闭照片">[×]</button></div>
        <img src="${esc(src)}" alt="${esc(label || "")}" />
      </div>`;
    const closeButton = overlay.querySelector(".photo-close");
    const close = () => {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      if (trigger?.isConnected) trigger.focus();
      else focusInput();
    };
    const onKey = event => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key === "Tab") { event.preventDefault(); closeButton.focus(); }
    };
    overlay.addEventListener("click", event => {
      event.stopPropagation();
      if (event.target === overlay) close();
    });
    closeButton.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
    closeButton.focus();
  }

  let rainSongSky = null;
  let rainSongOwner = null;
  let rainSongRelease = null;

  function attachRainSongScene(audio, path) {
    if (path !== "/playlist/下雨的夜晚-苏打绿.mp3") return;
    const clearingTime = 3 * 60 + 8;
    let timer = null;
    let raining = false;
    let buffering = false;
    const cancelCue = () => { clearTimeout(timer); timer = null; };
    const release = () => {
      cancelCue();
      if (rainSongOwner !== audio) return;
      rainSongOwner = null;
      rainSongRelease = null;
      rainSongSky.dataset.playing = "false";
      if (raining) stopRain(false, "#fff");
      raining = false;
    };
    const sync = () => {
      cancelCue();
      if (rainSongOwner !== audio || audio.paused || audio.ended) return;
      const shouldRain = audio.currentTime < clearingTime;
      if (shouldRain && !raining) startRain("light");
      else if (!shouldRain && raining) stopRain(false, "#fff");
      raining = shouldRain;
      // Use the media clock, and reschedule after seeks, stalls or rate changes.
      if (shouldRain && !buffering && audio.playbackRate > 0) {
        timer = setTimeout(sync, Math.max(20, (clearingTime - audio.currentTime) / audio.playbackRate * 1000));
      }
    };
    audio.addEventListener("playing", () => {
      if (state.audio !== audio) return;
      if (!rainSongSky) {
        rainSongSky = document.createElement("div");
        rainSongSky.className = "rain-song-sky";
        rainSongSky.setAttribute("aria-hidden", "true");
        $desktop.appendChild(rainSongSky);
        rainSongSky.getBoundingClientRect();
      }
      rainSongOwner = audio;
      rainSongRelease = release;
      rainSongSky.dataset.playing = "true";
      buffering = false;
      sync();
    });
    for (const event of ["timeupdate", "seeked", "ratechange"]) audio.addEventListener(event, sync);
    audio.addEventListener("waiting", () => { buffering = true; cancelCue(); });
    audio.addEventListener("seeking", cancelCue);
    for (const event of ["pause", "ended", "error", "emptied"]) audio.addEventListener(event, release);
  }

  function activateAudio(audio, path) {
    if (rainSongOwner && rainSongOwner !== audio) rainSongRelease();
    if (state.audio && state.audio !== audio) state.audio.pause();
    state.audio = audio;
    state.audioPath = path;
  }

  function playAudio(path) {
    const f = FILES[path];
    if (!f || f.type !== "audio") return printErr(`play: ${path}: 不是音频文件`);
    if (f.tracks) {
      if (!window.CampfirePlayer) return printErr("合奏播放器未加载，请刷新页面。");
      const wrap = row("");
      const player = window.CampfirePlayer.create(wrap, f.tracks, {
        title: f.title || basename(path).replace(/\.mp3$/i, ""),
        onActivate: audio => activateAudio(audio, path),
      });
      player.play().catch(() => {});
      return;
    }
    if (!f.src) return printErr(`play: ${path}: 没有配置音频 src`);

    if (state.audio) {
      if (rainSongRelease) rainSongRelease();
      state.audio.pause();
      state.audio = null;
      state.audioPath = null;
    }

    const wrap = row(
      `<div class="audio-player">` +
        `<div class="audio-title">` +
          `<span><span class="dim">now playing</span> <span class="audio">${esc(basename(path))}</span></span>` +
          `<button class="audio-toggle" type="button">[▶]</button>` +
        `</div>` +
        `<div class="audio-bar" aria-hidden="true">[------------------------------------------------]</div>` +
        `<audio preload="metadata" src="${esc(f.src)}"></audio>` +
      `</div>`
    );
    const audio = wrap.querySelector("audio");
    const toggle = wrap.querySelector(".audio-toggle");
    const bar = wrap.querySelector(".audio-bar");

    audio.controls = false;
    audio.playbackRate = 1;
    state.audio = audio;
    state.audioPath = path;

    function updatePlayer() {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      const cells = 48;
      const filled = duration ? Math.min(cells, Math.round((current / duration) * cells)) : 0;
      toggle.textContent = audio.paused ? "[▶]" : "[⏸]";
      bar.textContent = "[" + "#".repeat(filled) + "-".repeat(cells - filled) + "]";
    }

    toggle.addEventListener("click", e => {
      e.stopPropagation();
      if (audio.paused) safePlay(audio);
      else audio.pause();
      updatePlayer();
      focusInput();
    });
    audio.addEventListener("loadedmetadata", updatePlayer);
    audio.addEventListener("timeupdate", updatePlayer);
    audio.addEventListener("play", updatePlayer);
    audio.addEventListener("play", () => activateAudio(audio, path));
    audio.addEventListener("pause", updatePlayer);
    audio.addEventListener("ended", updatePlayer);
    attachRainSongScene(audio, path);

    updatePlayer();
    safePlay(audio).then(updatePlayer);
  }

  function safePlay(audio) {
    return audio.play().catch(err => {
      if (err && err.name === "AbortError") return;
      printErr("播放失败: " + err.message);
    });
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
      if (!body) { print("(空消息，什么也没发送.)", "dim"); state.multiline = null; updatePrompt(); return; }
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
      print("未配置 web3forms key.", "warn");
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
      // `<span class="boot head">WELCOME</span>`,
      `<span class="boot">Welcome!${window.FS.updatedAt ? ` Last Updated at ${esc(window.FS.updatedAt)}.` : ""}</span>`,
      `&nbsp;`,
      `<span class="dim">输入 <span class="kw">help</span> 查看使用指南.`,
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
          "这里只有唯一的标签页.",
          "其实再点也是没用的.",
          "真没彩蛋了^^.",
        ];
        const last = +($add.dataset.n || 0);
        print(lines[last % lines.length], "note");
        $add.dataset.n = (last + 1).toString();
        focusInput();
      });
    }
  }

  function init() {
    initTitlebar();
    updatePrompt();
    $input.addEventListener("keydown", onKeyDown);
    $input.addEventListener("input",   () => { closeCompletion(); syncCaret(); });
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
