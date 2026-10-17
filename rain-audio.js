/* Recorded rain bed + filtered close raindrops. No audio loads before rain starts. */
(function () {
  "use strict";
  const controls = document.getElementById("rainSoundControls");
  const toggle = document.getElementById("rainSoundToggle");
  const slider = document.getElementById("rainSoundVolume");
  const AudioEngine = window.AudioContext || window.webkitAudioContext;
  let enabled = false, volume = 0.25;
  try {
    enabled = localStorage.getItem("th-rain-sound") === "on";
    const saved = localStorage.getItem("th-rain-volume");
    if (saved !== null && Number.isFinite(Number(saved))) volume = Math.max(0, Math.min(1, Number(saved)));
  } catch {}
  let context, master, low, high, lowGain, highGain, recording, noise;
  let loading = null, failed = false, active = false, intensity = 0.55, emission = 0.12;
  let sources = [], drops = new Set(), dropTimer = null, quietTimer = null, lastUpdate = -Infinity;
  const clamp = value => Math.max(0, Math.min(1, value));
  const audible = () => active && enabled && volume > 0 && !document.hidden;

  function updateUI() {
    if (!controls) return;
    controls.hidden = !active;
    const playing = audible() && context?.state === "running" && sources.length > 0;
    toggle.textContent = !AudioEngine ? "雨声：不可用" : failed ? "雨声：重试"
      : !enabled || !volume ? "雨声：关" : playing ? "雨声：开" : "雨声：点击开启";
    toggle.disabled = !AudioEngine;
    toggle.setAttribute("aria-pressed", String(!!playing));
    slider.value = String(Math.round(volume * 100));
    slider.style.setProperty("--rain-volume", `${Math.round(volume * 100)}%`);
    slider.disabled = !AudioEngine;
  }

  function smooth(param, target, seconds = 0.5) {
    const now = context.currentTime;
    // Anchor the current envelope before retargeting to avoid a click on rapid changes.
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
    else { param.cancelScheduledValues(now); param.setValueAtTime(param.value, now); }
    param.setTargetAtTime(target, now, seconds);
  }

  function makeEngine() {
    if (context) return;
    context = new AudioEngine();
    master = context.createGain(); master.gain.value = 0;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -12; limiter.knee.value = 12; limiter.ratio.value = 4;
    master.connect(limiter); limiter.connect(context.destination);
    low = context.createBiquadFilter(); low.type = "lowpass"; low.Q.value = 0.4;
    high = context.createBiquadFilter(); high.type = "highpass"; high.frequency.value = 2200; high.Q.value = 0.4;
    lowGain = context.createGain(); highGain = context.createGain();
    // Keep the fine hiss of individual drops; remove low rumble instead of muffling the whole bed.
    const bodyCut = context.createBiquadFilter(); bodyCut.type = "highpass";
    bodyCut.frequency.value = 180; bodyCut.Q.value = 0.5;
    const air = context.createBiquadFilter(); air.type = "highshelf";
    air.frequency.value = 2800; air.gain.value = 2;
    low.connect(lowGain); high.connect(highGain);
    lowGain.connect(bodyCut); highGain.connect(bodyCut); bodyCut.connect(air); air.connect(master);
    noise = context.createBuffer(1, Math.round(context.sampleRate * 0.12), context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    context.addEventListener("statechange", updateUI);
  }

  function stopSources() {
    if (dropTimer !== null) clearTimeout(dropTimer);
    dropTimer = null;
    for (const source of sources) { source.stop(); source.disconnect(); }
    sources = [];
    for (const drop of drops) { drop.source.stop(); drop.dispose(); }
    drops.clear();
  }

  function quiet(immediate = false) {
    if (quietTimer !== null) clearTimeout(quietTimer);
    quietTimer = null;
    if (!context) return;
    if (dropTimer !== null) clearTimeout(dropTimer);
    dropTimer = null;
    const finish = () => {
      quietTimer = null;
      stopSources();
      context.suspend().catch(() => {});
      updateUI();
    };
    if (immediate) { master.gain.value = 0; finish(); }
    else { smooth(master.gain, 0, 0.12); quietTimer = setTimeout(finish, 700); }
  }

  function applyLevels() {
    if (!context) return;
    smooth(master.gain, audible() ? volume * emission : 0, 0.35);
    smooth(low.frequency, 4000 + intensity * 3200, 0.8);
    smooth(lowGain.gain, 0.23 + intensity * 0.4, 0.7);
    smooth(highGain.gain, 0.07 + intensity * intensity * 0.23, 0.7);
  }

  function closeDrop() {
    if (!audible() || !sources.length || context.state !== "running") return;
    if (Math.random() < (0.14 + intensity * 0.55) * emission && drops.size < 8) {
      const source = context.createBufferSource(); source.buffer = noise;
      const filter = context.createBiquadFilter(); filter.type = "bandpass";
      filter.frequency.value = 1100 + Math.random() * 3000; filter.Q.value = 1.2 + Math.random() * 1.5;
      const envelope = context.createGain();
      const pan = context.createStereoPanner ? context.createStereoPanner() : context.createGain();
      if (pan.pan) pan.pan.value = (Math.random() - 0.5) * 1.2;
      source.connect(filter); filter.connect(envelope); envelope.connect(pan); pan.connect(master);
      const now = context.currentTime, life = 0.045 + Math.random() * 0.05;
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime((0.025 + Math.random() * 0.045) * (0.5 + intensity), now + 0.003);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + life);
      const drop = { source, dispose() {
        source.disconnect(); filter.disconnect(); envelope.disconnect(); pan.disconnect(); drops.delete(drop);
      } };
      drops.add(drop); source.onended = drop.dispose;
      source.start(now); source.stop(now + life + 0.01);
    }
    dropTimer = setTimeout(closeDrop, 120 + Math.random() * 100);
  }

  function startSources() {
    if (!audible() || !recording || sources.length || context.state !== "running") return;
    for (const [filter, offset] of [[low, 0], [high, recording.duration * 0.43]]) {
      const source = context.createBufferSource(); source.buffer = recording; source.loop = true;
      source.connect(filter); source.start(0, offset); sources.push(source);
    }
    applyLevels(); closeDrop(); updateUI();
  }

  function reconcile() {
    if (!AudioEngine) { updateUI(); return; }
    if (!audible()) { quiet(document.hidden); updateUI(); return; }
    if (quietTimer !== null) clearTimeout(quietTimer);
    quietTimer = null;
    try {
      makeEngine();
      // Called directly from cd / button / command gestures, before fetching the recording.
      context.resume().then(() => {
        if (!audible()) { quiet(document.hidden); return; }
        if (sources.length && dropTimer === null) closeDrop();
        startSources(); applyLevels(); updateUI();
      }).catch(updateUI);
      if (!recording && !loading) {
        failed = false;
        loading = fetch("content/weather/rain-loop.mp3?v=dripping-459983")
          .then(response => { if (!response.ok) throw new Error("Rain audio unavailable"); return response.arrayBuffer(); })
          .then(bytes => context.decodeAudioData(bytes))
          .then(buffer => { recording = buffer; startSources(); })
          .catch(() => { failed = true; quiet(); })
          .finally(() => { loading = null; updateUI(); });
      }
      applyLevels();
    } catch { failed = true; }
    updateUI();
  }

  const api = window.RainAudio = {
    start(mode) {
      if (!active) emission = 0.12;
      active = true;
      intensity = ({ light: 0.22, medium: 0.55, heavy: 1, changing: 0.55 })[mode] ?? 0.55;
      reconcile();
    },
    update(amount, level) {
      intensity = clamp(amount); emission = clamp(level);
      if (!active || !context || context.currentTime - lastUpdate < 0.1) return;
      lastUpdate = context.currentTime; applyLevels();
    },
    stop() { active = false; quiet(); updateUI(); },
    setEnabled(value) {
      enabled = !!value;
      try { localStorage.setItem("th-rain-sound", enabled ? "on" : "off"); } catch {}
      reconcile();
    },
    setVolume(value) {
      volume = clamp(value / 100);
      if (volume > 0) enabled = true;
      try { localStorage.setItem("th-rain-volume", String(volume)); localStorage.setItem("th-rain-sound", enabled ? "on" : "off"); } catch {}
      reconcile();
    },
    status: () => ({ enabled, volume: Math.round(volume * 100), active, available: !!AudioEngine }),
  };
  if (toggle) toggle.addEventListener("click", () => {
    if (enabled && volume > 0 && (failed || context?.state !== "running" || !sources.length)) reconcile();
    else if (!volume) api.setVolume(25);
    else api.setEnabled(!enabled);
  });
  if (slider) slider.addEventListener("input", () => api.setVolume(Number(slider.value)));
  document.addEventListener("visibilitychange", reconcile);
  window.addEventListener("pagehide", () => quiet(true));
  window.addEventListener("pageshow", reconcile);
  updateUI();
})();
