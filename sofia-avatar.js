/* =========================================================
   SOFIA V4.3 — VISUAL AVATAR
   ---------------------------------------------------------
   Features:
   - echter Bildwechsel für Lip-Sync
   - Audio-Level: neutral / small / medium / wide
   - automatisches Blinzeln
   - sanfte Idle-Bewegung
   - Listening / Thinking / Speaking States
   - Mood-Unterstützung
   - iPhone / Safari kompatibel
   ========================================================= */

(() => {
  "use strict";

  const VERSION = "4.3";

  /* =======================================================
     ASSETS
     ======================================================= */

  const ASSETS = {
    neutral: "./sofia-avatar.png",

    blinkClosed:
      "./avatar/sofia-blink-closed.png",

    mouthSmall:
      "./avatar/sofia-mouth-small.png",

    mouthMedium:
      "./avatar/sofia-mouth-medium.png",

    mouthWide:
      "./avatar/sofia-mouth-wide.png"
  };


  /* =======================================================
     CONFIG
     ======================================================= */

  const CONFIG = {
    // Lip-Sync
    lipSync: {
      silenceThreshold: 0.035,

      smallThreshold: 0.09,
      mediumThreshold: 0.18,

      // verhindert hektisches Flackern
      smoothing: 0.68,

      // Mindestzeit zwischen Bildwechseln
      minFrameTime: 55,

      // Mund nach Audio-Ende kurz offen lassen
      releaseTime: 90
    },

    // Blinzeln
    blink: {
      minInterval: 2800,
      maxInterval: 6500,
      closedDuration: 115
    },

    // Idle-Bewegung
    idle: {
      enabled: true,
      speed: 0.00045,
      x: 2.2,
      y: 3.2,
      rotate: 0.18,
      scale: 0.006
    }
  };


  /* =======================================================
     INTERNAL STATE
     ======================================================= */

  let initialized = false;

  let root = null;
  let originalImage = null;
  let visualImage = null;

  let state = "idle";
  let mood = "entspannt";

  let audioLevel = 0;
  let smoothedAudioLevel = 0;

  let currentFrame = "neutral";

  let lastFrameChange = 0;
  let lastVoiceActivity = 0;

  let blinkTimer = null;
  let blinkActive = false;

  let animationFrame = null;
  let startTime = performance.now();


  /* =======================================================
     HELPERS
     ======================================================= */

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }


  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }


  function now() {
    return performance.now();
  }


  /* =======================================================
     FIND EXISTING AVATAR
     ======================================================= */

  function findAvatarImage() {
    const selectors = [
      "#sofiaAvatar img",
      "img.avatar",
      "#avatar img",
      ".avatar img",
      "#sofia img",
      ".sofia img",
      ".portrait img",
      ".character img",
      ".hero img",
      "#app img"
    ];

    for (const selector of selectors) {
      const img = document.querySelector(selector);

      if (img) {
        return img;
      }
    }

    return null;
  }


  /* =======================================================
     PRELOAD
     ======================================================= */

  function preloadAssets() {
    Object.values(ASSETS).forEach((src) => {
      const img = new Image();
      img.decoding = "async";
      img.src = src;
    });
  }


  /* =======================================================
     CSS
     ======================================================= */

  function injectStyles() {
    if (document.getElementById("sofia-avatar-v43-style")) {
      return;
    }

    const style = document.createElement("style");

    style.id = "sofia-avatar-v43-style";

    style.textContent = `
      .sofia-avatar-v43 {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        transform: translateZ(0);
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
      }

      .sofia-avatar-v43-image {
        position: absolute;
        inset: 0;

        width: 100%;
        height: 100%;

        object-fit: cover;
        object-position: center;

        display: block;

        transform-origin: 50% 55%;

        will-change:
          transform,
          filter,
          opacity;

        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;

        user-select: none;
        -webkit-user-select: none;

        pointer-events: none;
      }

      .sofia-avatar-v43-glow {
        position: absolute;
        inset: 0;

        pointer-events: none;

        background:
          radial-gradient(
            circle at 50% 42%,
            rgba(255, 220, 180, 0.055),
            transparent 45%
          );

        opacity: 0.35;

        transition:
          opacity 350ms ease;
      }

      .sofia-avatar-v43-shade {
        position: absolute;
        inset: 0;

        pointer-events: none;

        background:
          linear-gradient(
            to bottom,
            rgba(0,0,0,0.01),
            rgba(0,0,0,0.08)
          );

        opacity: 0.15;

        transition:
          opacity 350ms ease;
      }

      .sofia-avatar-v43[data-state="listening"]
      .sofia-avatar-v43-glow {
        opacity: 0.48;
      }

      .sofia-avatar-v43[data-state="thinking"]
      .sofia-avatar-v43-glow {
        opacity: 0.22;
      }

      .sofia-avatar-v43[data-state="speaking"]
      .sofia-avatar-v43-glow {
        opacity: 0.62;
      }

      .sofia-avatar-v43[data-state="thinking"]
      .sofia-avatar-v43-shade {
        opacity: 0.26;
      }
    `;

    document.head.appendChild(style);
  }


  /* =======================================================
     CREATE AVATAR WRAPPER
     ======================================================= */

  function createAvatar() {
    originalImage = findAvatarImage();

    if (!originalImage) {
      console.warn(
        "Sofia V4.3: Avatar-Bild wurde nicht gefunden."
      );

      return false;
    }

    /*
      Falls bereits initialisiert, nicht erneut wrappen.
    */

    if (
      originalImage.parentElement &&
      originalImage.parentElement.classList.contains(
        "sofia-avatar-v43"
      )
    ) {
      root = originalImage.parentElement;
      visualImage = originalImage;

      return true;
    }


    const wrapper = document.createElement("div");

    wrapper.className = "sofia-avatar-v43";
    wrapper.dataset.state = state;
    wrapper.dataset.mood = mood;


    /*
      Wrapper an Position des vorhandenen Bildes einsetzen.
    */

    originalImage.parentNode.insertBefore(
      wrapper,
      originalImage
    );

    wrapper.appendChild(originalImage);


    /*
      Vorhandenes Bild wird unser Visual Layer.
    */

    visualImage = originalImage;

    visualImage.classList.add(
      "sofia-avatar-v43-image"
    );

    visualImage.src = ASSETS.neutral;


    /*
      Zusätzliche optische Layer
    */

    const glow = document.createElement("div");

    glow.className =
      "sofia-avatar-v43-glow";


    const shade = document.createElement("div");

    shade.className =
      "sofia-avatar-v43-shade";


    wrapper.appendChild(glow);
    wrapper.appendChild(shade);


    root = wrapper;

    return true;
  }


  /* =======================================================
     FRAME SWITCHING
     ======================================================= */

  function getFrameSource(frame) {
    switch (frame) {
      case "blink":
        return ASSETS.blinkClosed;

      case "small":
        return ASSETS.mouthSmall;

      case "medium":
        return ASSETS.mouthMedium;

      case "wide":
        return ASSETS.mouthWide;

      case "neutral":
      default:
        return ASSETS.neutral;
    }
  }


  function setFrame(frame, force = false) {
    if (!visualImage) {
      return;
    }

    /*
      Während Blink immer geschlossenes Augenbild zeigen.
    */

    if (blinkActive && frame !== "blink") {
      return;
    }


    if (!force && frame === currentFrame) {
      return;
    }


    const time = now();

    if (
      !force &&
      time - lastFrameChange <
        CONFIG.lipSync.minFrameTime
    ) {
      return;
    }


    currentFrame = frame;
    lastFrameChange = time;

    const src = getFrameSource(frame);

    if (
      visualImage.getAttribute("src") !== src
    ) {
      visualImage.src = src;
    }
  }


  /* =======================================================
     LIP SYNC
     ======================================================= */

  function updateLipSync() {
    /*
      Audio etwas glätten.
    */

    smoothedAudioLevel =
      smoothedAudioLevel *
        CONFIG.lipSync.smoothing +
      audioLevel *
        (1 - CONFIG.lipSync.smoothing);


    const level = smoothedAudioLevel;

    const time = now();


    /*
      Nur im Speaking-State Mund animieren.
    */

    if (state !== "speaking") {
      if (!blinkActive) {
        setFrame("neutral");
      }

      return;
    }


    /*
      Sprachaktivität merken.
    */

    if (
      level >
      CONFIG.lipSync.silenceThreshold
    ) {
      lastVoiceActivity = time;
    }


    /*
      Stille
    */

    if (
      level <=
      CONFIG.lipSync.silenceThreshold
    ) {
      if (
        time - lastVoiceActivity >
        CONFIG.lipSync.releaseTime
      ) {
        if (!blinkActive) {
          setFrame("neutral");
        }
      }

      return;
    }


    /*
      Mundzustand anhand Audio-Level.
    */

    let frame;

    if (
      level <
      CONFIG.lipSync.smallThreshold
    ) {
      frame = "small";
    }

    else if (
      level <
      CONFIG.lipSync.mediumThreshold
    ) {
      frame = "medium";
    }

    else {
      frame = "wide";
    }


    if (!blinkActive) {
      setFrame(frame);
    }
  }


  /* =======================================================
     BLINK
     ======================================================= */

  function scheduleBlink() {
    clearTimeout(blinkTimer);

    const delay = randomBetween(
      CONFIG.blink.minInterval,
      CONFIG.blink.maxInterval
    );

    blinkTimer = setTimeout(() => {
      blink();
    }, delay);
  }


  function blink() {
    if (!visualImage) {
      scheduleBlink();
      return;
    }


    /*
      Während starkem Sprechen etwas seltener blinzeln,
      damit Lip-Sync nicht unnötig unterbrochen wird.
    */

    if (
      state === "speaking" &&
      smoothedAudioLevel > 0.20
    ) {
      scheduleBlink();
      return;
    }


    blinkActive = true;

    setFrame("blink", true);


    setTimeout(() => {
      blinkActive = false;


      /*
        Nach Blink sofort passenden Zustand
        wiederherstellen.
      */

      if (state === "speaking") {
        restoreSpeakingFrame();
      }

      else {
        setFrame("neutral", true);
      }


      scheduleBlink();

    }, CONFIG.blink.closedDuration);
  }


  function restoreSpeakingFrame() {
    const level = smoothedAudioLevel;

    if (
      level <=
      CONFIG.lipSync.silenceThreshold
    ) {
      setFrame("neutral", true);
    }

    else if (
      level <
      CONFIG.lipSync.smallThreshold
    ) {
      setFrame("small", true);
    }

    else if (
      level <
      CONFIG.lipSync.mediumThreshold
    ) {
      setFrame("medium", true);
    }

    else {
      setFrame("wide", true);
    }
  }


  /* =======================================================
     IDLE / BODY MOTION
     ======================================================= */

  function updateMotion(time) {
    if (!visualImage) {
      return;
    }


    const elapsed =
      time - startTime;


    let x = 0;
    let y = 0;
    let rotation = 0;
    let scale = 1;


    if (CONFIG.idle.enabled) {
      const t =
        elapsed *
        CONFIG.idle.speed;


      x =
        Math.sin(t * 0.73) *
        CONFIG.idle.x;


      y =
        Math.sin(t * 1.03) *
        CONFIG.idle.y;


      rotation =
        Math.sin(t * 0.51) *
        CONFIG.idle.rotate;


      scale +=
        (
          Math.sin(t * 0.89) *
          CONFIG.idle.scale
        );
    }


    /*
      State-spezifische Bewegung
    */

    if (state === "listening") {
      scale += 0.004;
      y -= 0.8;
    }


    if (state === "thinking") {
      rotation -= 0.08;
      x += 0.6;
    }


    if (state === "speaking") {
      /*
        Sehr kleine zusätzliche Bewegung
        passend zur Stimme.
      */

      scale +=
        smoothedAudioLevel * 0.006;

      y -=
        smoothedAudioLevel * 0.7;
    }


    visualImage.style.transform =
      `translate3d(${x}px, ${y}px, 0)
       rotate(${rotation}deg)
       scale(${scale})`;
  }


  /* =======================================================
     MOOD
     ======================================================= */

  function applyMood() {
    if (!visualImage || !root) {
      return;
    }

    root.dataset.mood = mood;


    switch (mood) {

      case "flirty":
        visualImage.style.filter =
          "saturate(1.04) brightness(1.015)";
        break;


      case "amüsiert":
        visualImage.style.filter =
          "saturate(1.06) brightness(1.025)";
        break;


      case "skeptisch":
        visualImage.style.filter =
          "saturate(0.96) contrast(1.025)";
        break;


      case "genervt":
        visualImage.style.filter =
          "saturate(0.90) contrast(1.035)";
        break;


      case "ernst":
        visualImage.style.filter =
          "saturate(0.94) contrast(1.02)";
        break;


      case "entspannt":
      default:
        visualImage.style.filter =
          "none";
        break;
    }
  }


  /* =======================================================
     MAIN ANIMATION LOOP
     ======================================================= */

  function animationLoop(time) {
    updateLipSync();
    updateMotion(time);

    animationFrame =
      requestAnimationFrame(
        animationLoop
      );
  }


  /* =======================================================
     STATE
     ======================================================= */

  function setState(newState) {
    const allowed = [
      "idle",
      "listening",
      "thinking",
      "speaking"
    ];

    if (!allowed.includes(newState)) {
      newState = "idle";
    }


    state = newState;


    if (root) {
      root.dataset.state = state;
    }


    /*
      Wenn Sofia nicht spricht:
      Mund schließen.
    */

    if (
      state !== "speaking" &&
      !blinkActive
    ) {
      audioLevel = 0;
      smoothedAudioLevel = 0;

      setFrame("neutral", true);
    }


    /*
      Beim Beginn des Sprechens
      Voice-Timer zurücksetzen.
    */

    if (state === "speaking") {
      lastVoiceActivity = now();
    }
  }


  /* =======================================================
     AUDIO LEVEL
     ======================================================= */

  function setAudioLevel(level) {
    const numeric =
      Number(level);

    if (!Number.isFinite(numeric)) {
      audioLevel = 0;
      return;
    }

    audioLevel =
      clamp(
        numeric,
        0,
        1
      );
  }


  /* =======================================================
     INIT
     ======================================================= */

  function init() {
    if (initialized) {
      return true;
    }


    injectStyles();
    preloadAssets();


    if (!createAvatar()) {
      return false;
    }


    initialized = true;

    startTime = now();

    applyMood();

    scheduleBlink();


    animationFrame =
      requestAnimationFrame(
        animationLoop
      );


    console.log(
      `Sofia V${VERSION} Visual Avatar geladen.`
    );


    return true;
  }


  /* =======================================================
     DESTROY
     ======================================================= */

  function destroy() {
    clearTimeout(blinkTimer);

    blinkTimer = null;


    if (animationFrame) {
      cancelAnimationFrame(
        animationFrame
      );

      animationFrame = null;
    }


    initialized = false;
  }


  /* =======================================================
     PUBLIC API
     ======================================================= */

  window.SofiaAvatar = {

    init,


    idle() {
      setState("idle");
    },


    listen() {
      setState("listening");
    },


    think() {
      setState("thinking");
    },


    speak() {
      setState("speaking");
    },


    setState,


    setAudioLevel,


    setMood(newMood) {
      mood =
        String(
          newMood || "entspannt"
        ).toLowerCase();

      applyMood();
    },


    blink() {
      blink();
    },


    getState() {
      return {
        version: VERSION,
        initialized,
        state,
        mood,
        audioLevel,
        smoothedAudioLevel,
        currentFrame,
        blinkActive
      };
    },


    destroy
  };


  /* =======================================================
     AUTO INIT
     ======================================================= */

  function autoInit() {
    /*
      Login kann dazu führen, dass #app zunächst
      versteckt ist. Das Avatar-Element existiert
      trotzdem bereits im DOM.
    */

    const success = init();


    /*
      Falls Script aus irgendeinem Grund vor dem
      Avatar-Markup geladen wurde, erneut versuchen.
    */

    if (!success) {
      setTimeout(() => {
        init();
      }, 500);
    }
  }


  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      autoInit,
      { once: true }
    );
  }

  else {
    autoInit();
  }

})();
