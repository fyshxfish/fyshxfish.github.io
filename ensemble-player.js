/* A single sample clock drives every traveler; muting never stops a track. */
(function () {
  "use strict";
  let context, output, current = null;
  const cache = new Map();
  let embers, campfireBackdrop, emberTimer, emberCleanup, embersPlaying = false;
  const emberAnimations = new Set();

  function spawnEmber() {
    if (document.hidden) return;
    const spark = document.createElement("i");
    const random = (min, max) => min + Math.random() * (max - min);
    const height = window.innerHeight + 40;
    const drift = random(-260, 260);
    const bend = random(180, 320) * (Math.random() < 0.5 ? -1 : 1);
    const gust = random(20, 45);
    const size = random(2.8, 4);
    spark.style.setProperty("--ember-x", `${random(4, 96)}%`);
    spark.style.setProperty("--ember-size", `${size}px`);
    spark.style.setProperty("--ember-length", `${random(8, 13)}px`);
    spark.style.setProperty("--ember-color", Math.random() < 0.35 ? "#ff9b18" : "#ff650d");
    // Two joined cubic curves share a tangent, so the wind never makes a sharp turn.
    const cubic = (a, b, c, d, t) =>
      (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d;
    embers.appendChild(spark);
    const rotation = random(-30, 30);
    const spin = random(360, 660) * (Math.random() < 0.5 ? -1 : 1);
    const phase = random(0, Math.PI * 2);
    const brightness = [0, 1, 0.85, 1, 0.75, 0.95, 0];
    // Sample the curve densely; browser animation interpolates between these points.
    const frames = Array.from({ length: 91 }, (_, index) => {
      const t = index / 90;
      const local = t < 0.5 ? t * 2 : (t - 0.5) * 2;
      const curveX = t < 0.5
        ? cubic(0, bend, drift * 0.45 - bend * 0.4, drift * 0.5, local)
        : cubic(drift * 0.5, drift * 0.55 + bend * 0.4, drift - bend, drift, local);
      const x = curveX + Math.sin(t * Math.PI) * Math.sin(t * 15 + phase) * gust;
      const y = -height * (t + Math.sin(t * Math.PI * 2) * 0.025);
      const glow = t * (brightness.length - 1);
      const start = Math.min(Math.floor(glow), brightness.length - 2);
      const opacity = brightness[start] + (brightness[start + 1] - brightness[start]) * (glow - start);
      const angle = rotation + t * spin + Math.sin(t * 15 + phase) * 55;
      const scale = (0.85 + Math.sin(t * 19 + phase) * 0.12) * (1 - t * 0.35);
      return {
        offset: t, opacity,
        transform: `translate(${x}px, ${y}px) rotate(${angle}deg) scale(${scale}, ${scale * (1 + Math.sin(t * 13 + phase) * 0.2)})`,
      };
    });
    const animation = spark.animate(frames, {
      duration: random(3000, 5000), easing: "linear", fill: "forwards",
    });
    const ember = { spark, animation };
    emberAnimations.add(ember);
    animation.onfinish = () => {
      emberAnimations.delete(ember);
      spark.remove();
    };
  }

  function showEmbers(visible) {
    if (!campfireBackdrop && visible) {
      campfireBackdrop = document.createElement("div");
      campfireBackdrop.className = "campfire-backdrop";
      campfireBackdrop.setAttribute("aria-hidden", "true");
      document.getElementById("desktop").appendChild(campfireBackdrop);
      // Commit the transparent state before starting the first fade.
      campfireBackdrop.getBoundingClientRect();
    }
    if (campfireBackdrop) campfireBackdrop.setAttribute("data-playing", String(visible));
    if (visible && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!embers && visible) {
      embers = document.createElement("div");
      embers.className = "campfire-embers";
      embers.setAttribute("aria-hidden", "true");
      // Stay inside the desktop stacking context, below the terminal window.
      document.getElementById("desktop").appendChild(embers);
    }
    if (embersPlaying === visible) return;
    embersPlaying = visible;
    clearTimeout(emberTimer);
    clearTimeout(emberCleanup);
    if (embers) embers.setAttribute("data-playing", String(visible));
    if (visible) {
      const emit = () => {
        spawnEmber();
        emberTimer = setTimeout(emit, 1000 + Math.random() * 600);
      };
      emit();
    } else {
      // Keep drifting while the layer fades, then release every remaining particle.
      emberCleanup = setTimeout(() => {
        for (const { spark, animation } of emberAnimations) {
          animation.cancel();
          spark.remove();
        }
        emberAnimations.clear();
      }, 1600);
    }
  }

  function engine() {
    if (context) return context;
    const AudioEngine = window.AudioContext || window.webkitAudioContext;
    if (!AudioEngine) throw new Error("当前浏览器暂不支持合奏播放。");
    context = new AudioEngine();
    output = context.createDynamicsCompressor();
    output.threshold.value = -6; output.knee.value = 6; output.ratio.value = 6;
    output.connect(context.destination);
    return context;
  }

  function load(src) {
    if (!cache.has(src)) {
      const pending = fetch(src)
        .then(response => { if (!response.ok) throw new Error("音轨加载失败，请重试。"); return response.arrayBuffer(); })
        .then(bytes => context.decodeAudioData(bytes))
        .catch(error => { cache.delete(src); throw error; });
      cache.set(src, pending);
    }
    return cache.get(src);
  }

  window.CampfirePlayer = {
    create(container, tracks, { title, onActivate }) {
      const seatingOrder = ["Esker", "Feldspar", "Gabbro", "Solanum", "Chert", "Riebeck", "Prisoner"];
      const seatIndex = track => {
        const index = seatingOrder.indexOf(track.name);
        return index < 0 ? seatingOrder.length : index;
      };
      tracks = [...tracks].sort((a, b) => seatIndex(a) - seatIndex(b));
      container.innerHTML = `<div class="audio-player ensemble-player">
        <div class="audio-title"><span><span class="dim">now playing</span> <span class="audio ensemble-name"></span></span>
          <button class="audio-toggle" type="button" aria-label="播放合奏">[▶]</button></div>
        <span class="ensemble-status dim" role="status" hidden></span>
        <div class="ensemble-circle">
        <div class="ensemble-fire">
          <svg class="ensemble-fire-art" viewBox="35 27 54 63" aria-hidden="true">
            <g class="ensemble-campfire">
              <path d="M47 77L77 83M47 83L77 77" fill="none" stroke="#826748" stroke-width="4.5" stroke-linecap="round"/>
              <path class="ensemble-flame-outer" d="M60 74C45 74 43 63 50 54C49 61 54 60 53 50C53 43 62 42 60 34C73 43 66 49 73 55C83 67 73 74 60 74Z" fill="#ce8036"/>
              <path class="ensemble-flame-inner" d="M60 73C53 70 54 64 59 59C59 64 63 62 62 56C70 63 68 71 60 73Z" fill="#f1c478"/>
            </g>
          </svg>
        </div>
        <div class="ensemble-tracks" role="group" aria-label="选择发声的演奏者"></div>
        </div>
      </div>`;
      container.querySelector(".ensemble-name").textContent = title;
      const toggle = container.querySelector(".audio-toggle");
      const status = container.querySelector(".ensemble-status");
      const fire = container.querySelector(".ensemble-fire");
      const trackList = container.querySelector(".ensemble-tracks");
      const enabled = tracks.map(() => true);
      tracks.forEach((track, index) => {
        const button = document.createElement("button");
        button.type = "button"; button.className = "ensemble-track";
        button.style.setProperty("--traveler-color", track.color || "var(--green)");
        // Keep DOM/keyboard order clockwise around the fire.
        const angle = -Math.PI / 2 + index * Math.PI * 2 / tracks.length;
        // The stage is 6:5, so these radii describe a circle in pixels.
        button.style.setProperty("--seat-x", `${50 + Math.cos(angle) * 34}%`);
        button.style.setProperty("--seat-y", `${50 + Math.sin(angle) * 40.8}%`);
        button.textContent = `[✓] ${track.name}`;
        button.setAttribute("aria-pressed", "true");
        button.addEventListener("click", event => {
          event.stopPropagation();
          enabled[index] = !enabled[index];
          button.textContent = `[${enabled[index] ? "✓" : " "}] ${track.name}`;
          button.setAttribute("aria-pressed", String(enabled[index]));
          const gain = voices[index]?.gain.gain;
          if (gain) {
            const now = context.currentTime;
            if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(now);
            else { gain.cancelScheduledValues(now); gain.setValueAtTime(gain.value, now); }
            gain.setTargetAtTime(enabled[index] ? 1 : 0, now, 0.025);
          }
        });
        trackList.appendChild(button);
      });
      let buffers, loading = null, voices = [], master = null;
      let duration = 0, offset = 0, startedAt = 0, playing = false, wanted = false;
      let revision = 0;

      function position() {
        if (!duration) return 0;
        return (offset + (playing ? Math.max(0, context.currentTime - startedAt) : 0)) % duration;
      }

      function render() {
        fire.setAttribute("data-playing", String(playing));
        toggle.textContent = playing || wanted ? "[⏸]" : "[▶]";
        toggle.setAttribute("aria-label", playing || wanted ? "暂停合奏" : "播放合奏");
      }

      function stopVoices() {
        for (const voice of voices) { voice.source.stop(); voice.source.disconnect(); voice.gain.disconnect(); }
        voices = [];
      }

      function launch() {
        const when = context.currentTime + 0.05;
        voices = [];
        buffers.forEach((buffer, index) => {
          const source = context.createBufferSource();
          const gain = context.createGain(); gain.gain.value = enabled[index] ? 1 : 0;
          source.buffer = buffer; source.loop = true; source.loopStart = 0; source.loopEnd = duration;
          source.connect(gain); gain.connect(master);
          voices.push({ source, gain });
          source.start(when, offset);
        });
        startedAt = when; playing = true;
        status.hidden = true;
        showEmbers(true);
        render();

      }

      const controller = {
        get paused() { return !playing; },
        get currentTime() { return position(); },
        get duration() { return duration; },
        async play() {
          if (playing || wanted) return;
          const request = ++revision;
          wanted = true;
          try {
            const audioContext = engine();
            onActivate(controller);
            current = controller;
            // Resume during the click/command gesture, before waiting for network/decode.
            const resumed = audioContext.resume();
            if (!master) { master = context.createGain(); master.gain.value = 0.6; master.connect(output); }
            status.hidden = true;
            render();
            if (!loading) loading = Promise.all(tracks.map(track => load(track.src)))
              .catch(error => { loading = null; throw error; });
            const result = await Promise.all([resumed, loading]);
            if (request !== revision || !wanted) return;
            buffers = result[1];
            const shortest = Math.min(...buffers.map(buffer => buffer.duration));
            const longest = Math.max(...buffers.map(buffer => buffer.duration));
            if (!(shortest > 0) || !Number.isFinite(longest) || longest - shortest > 0.02) {
              throw new Error("音轨时长不一致，请检查音轨是否对齐。");
            }
            duration = shortest;
            offset %= duration;
            launch();
          } catch (error) {
            if (request === revision) {
              wanted = false; playing = false;
              stopVoices();
              status.textContent = error.message || "播放失败，请点击重试。";
              status.hidden = false;
              render();
              if (current === controller) {
                showEmbers(false);
                context?.suspend().catch(() => {});
              }
            }
            throw error;
          }
        },
        pause() {
          if (playing) offset = position();
          wanted = false; revision++; playing = false;
          stopVoices(); status.hidden = true; render();
          if (current === controller) {
            showEmbers(false);
            current = null;
            context?.suspend().catch(() => {});
          }
        },
      };
      toggle.addEventListener("click", event => {
        event.stopPropagation();
        if (playing || wanted) controller.pause();
        else controller.play().catch(() => {});
      });
      render();
      return controller;
    },
  };
})();
