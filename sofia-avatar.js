/* Sofia V4.3.5 — layered visual avatar */
(() => {
  "use strict";

  const VERSION = "4.5.4";
  const ASSETS = {
    neutral: "./sofia-avatar.PNG",
    blink: "./avatar/sofia-blink-closed.png",
    small: "./avatar/sofia-mouth-small.png",
    medium: "./avatar/sofia-mouth-medium.png",
    wide: "./avatar/sofia-mouth-wide.png",
    wink: "./avatar/sofia-local-wink.png"
  };

  const CONFIG = {
    lip: {
      smoothing: 0.78,
      silence: 0.035,
      smallUp: 0.095,
      smallDown: 0.060,
      mediumUp: 0.19,
      mediumDown: 0.135,
      wideUp: 0.31,
      wideDown: 0.235,
      minHoldMs: 72,
      releaseMs: 115
    },
    blink: { min: 3000, max: 6800, duration: 115 },
    idle: { speed: 0.00045, x: 2.2, y: 3.2, rotate: 0.18, scale: 0.006 }
  };

  let initialized = false;
  let root = null;
  let layers = {};
  let state = "idle";
  let mood = "entspannt";
  let audioLevel = 0;
  let smoothLevel = 0;
  let mouthFrame = "neutral";
  let lastFrameAt = 0;
  let lastVoiceAt = 0;
  let blinkActive = false;
  let blinkTimer = null;
  let expressionTimer = null;
  let expression = "neutral";
  let expressionUntil = 0;
  let raf = null;
  let startAt = performance.now();

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const now = () => performance.now();
  const random = (a, b) => a + Math.random() * (b - a);

  function findImage() {
    return document.querySelector("#sofiaAvatar img, img.avatar, #avatar img, .portrait img, #app img");
  }

  function injectStyles() {
    if (document.getElementById("sofia-avatar-v435-style")) return;
    const style = document.createElement("style");
    style.id = "sofia-avatar-v435-style";
    style.textContent = `
      .sofia-avatar-v435{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;overflow:hidden;transform:translateZ(0);backface-visibility:hidden;-webkit-backface-visibility:hidden}
      .sofia-avatar-v435-layer{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 36%;opacity:0;pointer-events:none;user-select:none;-webkit-user-select:none;backface-visibility:hidden;-webkit-backface-visibility:hidden;will-change:opacity;transform:translateZ(0)}
      .sofia-avatar-v435-layer[data-frame="neutral"]{opacity:1!important}
      .sofia-avatar-v435-layer.expression-layer{transition:opacity .12s ease-out}
      .sofia-avatar-v435-layer.expression-layer.active{opacity:1}
      .sofia-avatar-v435-layer.transient-frame.active{opacity:1}
      .sofia-avatar-v435-glow,.sofia-avatar-v435-shade{position:absolute;inset:0;pointer-events:none}
      .sofia-avatar-v435-glow{background:radial-gradient(circle at 50% 42%,rgba(255,220,180,.055),transparent 45%);opacity:.35;transition:opacity .3s ease}
      .sofia-avatar-v435-shade{background:linear-gradient(to bottom,rgba(0,0,0,.01),rgba(0,0,0,.08));opacity:.15}
      .sofia-avatar-v435[data-state="listening"] .sofia-avatar-v435-glow{opacity:.48}
      .sofia-avatar-v435[data-state="thinking"] .sofia-avatar-v435-glow{opacity:.22}
      .sofia-avatar-v435[data-state="speaking"] .sofia-avatar-v435-glow{opacity:.62}
      @media(max-width:850px){.sofia-avatar-v435-layer{object-position:50% 18%}}
      @media(orientation:landscape) and (max-height:500px){.sofia-avatar-v435-layer{object-position:30% 25%}}
    `;
    document.head.appendChild(style);
  }

  function makeLayer(name, src, original) {
    const img = name === "neutral" ? original : document.createElement("img");
    const expressionNames = ["wink"];
    const transientNames = ["blink","small","medium","wide"];
    img.className = `sofia-avatar-v435-layer${expressionNames.includes(name) ? " expression-layer" : ""}${transientNames.includes(name) ? " transient-frame" : ""}${name === "neutral" ? " active" : ""}`;
    img.dataset.frame = name;
    img.alt = name === "neutral" ? "Sofia" : "";
    img.decoding = "async";
    img.draggable = false;
    img.src = src;
    return img;
  }

  function createAvatar() {
    const original = findImage();
    if (!original) return false;

    if (original.closest(".sofia-avatar-v435")) {
      root = original.closest(".sofia-avatar-v435");
      root.querySelectorAll("[data-frame]").forEach(el => layers[el.dataset.frame] = el);
      return true;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "sofia-avatar-v435";
    wrapper.dataset.state = state;
    wrapper.dataset.mood = mood;
    original.parentNode.insertBefore(wrapper, original);

    for (const [name, src] of Object.entries(ASSETS)) {
      const layer = makeLayer(name, src, original);
      layers[name] = layer;
      wrapper.appendChild(layer);
    }

    const glow = document.createElement("div");
    glow.className = "sofia-avatar-v435-glow";
    const shade = document.createElement("div");
    shade.className = "sofia-avatar-v435-shade";
    wrapper.append(glow, shade);
    root = wrapper;
    return true;
  }

  const EXPRESSION_NAMES = ["wink"];
  const TRANSIENT_NAMES = ["blink","small","medium","wide"];

  function setExpressionLayer(name = "neutral") {
    EXPRESSION_NAMES.forEach(key => {
      layers[key]?.classList.toggle("active", key === name && name !== "neutral");
    });
    expression = name;
  }

  function setTransientLayer(name = "neutral") {
    TRANSIENT_NAMES.forEach(key => {
      layers[key]?.classList.toggle("active", key === name && name !== "neutral");
    });
    mouthFrame = name;
  }

  function showFrame(frame, force = false) {
    if (!layers[frame] && frame !== "neutral") frame = "neutral";
    const t = now();

    if (EXPRESSION_NAMES.includes(frame)) {
      if (state === "speaking") return;
      setExpressionLayer(frame);
      return;
    }

    if (!force && frame === mouthFrame) return;
    if (!force && t - lastFrameAt < CONFIG.lip.minHoldMs) return;

    if (frame === "blink") {
      setTransientLayer("blink");
    } else if (["small","medium","wide"].includes(frame)) {
      setTransientLayer(frame);
    } else {
      setTransientLayer("neutral");
    }

    lastFrameAt = t;
  }

  function chooseMouth(level) {
    // Hysteresis: different thresholds for opening and closing prevent chatter.
    if (mouthFrame === "wide") {
      if (level >= CONFIG.lip.wideDown) return "wide";
      if (level >= CONFIG.lip.mediumDown) return "medium";
      return level >= CONFIG.lip.smallDown ? "small" : "neutral";
    }
    if (mouthFrame === "medium") {
      if (level >= CONFIG.lip.wideUp) return "wide";
      if (level >= CONFIG.lip.mediumDown) return "medium";
      return level >= CONFIG.lip.smallDown ? "small" : "neutral";
    }
    if (mouthFrame === "small") {
      if (level >= CONFIG.lip.wideUp) return "wide";
      if (level >= CONFIG.lip.mediumUp) return "medium";
      return level >= CONFIG.lip.smallDown ? "small" : "neutral";
    }
    if (level >= CONFIG.lip.wideUp) return "wide";
    if (level >= CONFIG.lip.mediumUp) return "medium";
    if (level >= CONFIG.lip.smallUp) return "small";
    return "neutral";
  }

  function baseExpression() {
    return "neutral";
  }

  function currentRestFrame() {
    return now() < expressionUntil ? expression : baseExpression();
  }

  function syncExpression() {
    if (state === "speaking") {
      setExpressionLayer("neutral");
      return;
    }
    setExpressionLayer(currentRestFrame());
  }

  function playExpression(name, duration = 1200) {
    if (!layers[name] || state === "speaking") return;
    expression = name;
    expressionUntil = now() + duration;
    syncExpression();
  }

  function scheduleExpression() {
    clearTimeout(expressionTimer);
    expressionTimer = setTimeout(() => {
      if (initialized && state !== "speaking") {
        const r = Math.random();
        if ((mood === "flirty" && r < .42) ||
            (mood === "amüsiert" && r < .18) ||
            (mood === "entspannt" && r < .06)) {
          playExpression("wink", 520);
        }
      }
      scheduleExpression();
    }, random(6500, 12500));
  }

  function updateLip() {
    smoothLevel = smoothLevel * CONFIG.lip.smoothing + audioLevel * (1 - CONFIG.lip.smoothing);
    const t = now();

    if (state !== "speaking") {
      if (!blinkActive) setTransientLayer("neutral");
      syncExpression();
      return;
    }

    setExpressionLayer("neutral");

    if (smoothLevel > CONFIG.lip.silence) lastVoiceAt = t;
    if (smoothLevel <= CONFIG.lip.silence && t - lastVoiceAt > CONFIG.lip.releaseMs) {
      if (!blinkActive) setTransientLayer("neutral");
      return;
    }

    if (!blinkActive) showFrame(chooseMouth(smoothLevel));
  }

  function scheduleBlink() {
    clearTimeout(blinkTimer);
    blinkTimer = setTimeout(blink, random(CONFIG.blink.min, CONFIG.blink.max));
  }

  function blink() {
    if (!initialized) return;
    if (state === "speaking" && smoothLevel > 0.24) {
      scheduleBlink();
      return;
    }
    blinkActive = true;
    showFrame("blink", true);
    setTimeout(() => {
      blinkActive = false;
      setTransientLayer(state === "speaking" ? chooseMouth(smoothLevel) : "neutral");
      if (state !== "speaking") syncExpression();
      scheduleBlink();
    }, CONFIG.blink.duration);
  }

  function updateMotion() {
    if (!root) return;
    root.style.transform = "none";
  }

  function applyMood() {
    if (!root) return;
    root.dataset.mood = mood;
    const filters = {
      flirty: "saturate(1.04) brightness(1.015)",
      "amüsiert": "saturate(1.06) brightness(1.025)",
      skeptisch: "saturate(.96) contrast(1.025)",
      genervt: "saturate(.90) contrast(1.035)",
      ernst: "saturate(.94) contrast(1.02)",
      entspannt: "none"
    };
    const filter = filters[mood] || "none";
    if (root) root.style.setProperty("--sofia-mood-filter", filter);
  }

  function loop(t) {
    updateLip();
    updateMotion(t);
    raf = requestAnimationFrame(loop);
  }

  function setState(next) {
    if (!["idle", "listening", "thinking", "speaking"].includes(next)) next = "idle";
    state = next;
    if (root) root.dataset.state = state;
    if (state !== "speaking") {
      audioLevel = 0;
      smoothLevel = 0;
      if (!blinkActive) setTransientLayer("neutral");
      syncExpression();
    } else {
      setExpressionLayer("neutral");
      lastVoiceAt = now();
    }
  }

  function setAudioLevel(level) {
    const n = Number(level);
    audioLevel = Number.isFinite(n) ? clamp(n, 0, 1) : 0;
  }

  function init() {
    if (initialized) return true;
    injectStyles();
    if (!createAvatar()) {
      console.warn("Sofia V4.3.5: Avatar-Bild nicht gefunden.");
      return false;
    }
    initialized = true;
    startAt = now();
    applyMood();
    scheduleBlink();
    scheduleExpression();
    raf = requestAnimationFrame(loop);
    console.log(`Sofia V${VERSION} Layered Avatar geladen.`);
    return true;
  }

  function destroy() {
    clearTimeout(blinkTimer);
    clearTimeout(expressionTimer);
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    initialized = false;
  }

  window.SofiaAvatar = {
    init,
    idle: () => setState("idle"),
    listen: () => setState("listening"),
    think: () => setState("thinking"),
    speak: () => setState("speaking"),
    setState,
    setAudioLevel,
    setMood(next) { mood = String(next || "entspannt").toLowerCase(); applyMood(); if (state !== "speaking") { expressionUntil = 0; syncExpression(); } },
    setExpression: playExpression,
    smile: () => playExpression("smile", 1200),
    laugh: () => playExpression("laugh", 1100),
    wink: () => playExpression("wink", 650),
    smirk: () => playExpression("smirk", 1300),
    skeptical: () => playExpression("skeptical", 1300),
    annoyed: () => playExpression("annoyed", 1300),
    tongue: () => playExpression("tongue", 850),
    blink,
    getState: () => ({ version: VERSION, initialized, state, mood, audioLevel, smoothedAudioLevel: smoothLevel, currentFrame: mouthFrame, blinkActive }),
    destroy
  };

  const autoInit = () => { if (!init()) setTimeout(init, 500); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoInit, { once: true });
  else autoInit();
})();
