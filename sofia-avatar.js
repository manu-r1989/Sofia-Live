(() => {
  /*
    Sofia V4.3
    Visual Avatar Engine

    Zustände:
    idle
    listening
    thinking
    speaking

    Zusätzlich:
    mood
    audio level
  */

  const STATE = {
    IDLE: "idle",
    LISTENING: "listening",
    THINKING: "thinking",
    SPEAKING: "speaking"
  };

  let currentState = STATE.IDLE;
  let currentMood = "entspannt";

  let audioLevel = 0;
  let targetAudioLevel = 0;

  let animationFrame = null;
  let startTime = performance.now();

  let avatar = null;
  let image = null;
  let glow = null;
  let shade = null;

  let blinkTimer = null;
  let blinking = false;

  let initialized = false;


  /* ========================================
     AVATAR FINDEN
  ======================================== */

  function findAvatarImage() {
    /*
      Zuerst versuchen wir typische
      Sofia-Bilder zu finden.

      Dadurch müssen wir index.html
      möglichst nicht umbauen.
    */

    const selectors = [
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
      const element =
        document.querySelector(selector);

      if (element) {
        return element;
      }
    }

    return null;
  }


  /* ========================================
     DOM AUFBAUEN
  ======================================== */

  function init() {
    if (initialized) {
      return true;
    }

    image = findAvatarImage();

    if (!image) {
      console.warn(
        "Sofia V4.3: Avatar-Bild nicht gefunden."
      );

      return false;
    }

    /*
      Wrapper um das vorhandene Bild.
    */

    const parent =
      image.parentElement;

    avatar =
      document.createElement("div");

    avatar.className =
      "sofia-avatar-v43";

    parent.insertBefore(
      avatar,
      image
    );

    avatar.appendChild(
      image
    );


    /*
      Licht-Layer
    */

    glow =
      document.createElement("div");

    glow.className =
      "sofia-avatar-glow";

    avatar.appendChild(
      glow
    );


    /*
      subtiler Schatten-Layer
    */

    shade =
      document.createElement("div");

    shade.className =
      "sofia-avatar-shade";

    avatar.appendChild(
      shade
    );


    injectStyles();

    scheduleBlink();

    startTime =
      performance.now();

    animationFrame =
      requestAnimationFrame(
        animate
      );

    initialized = true;

    console.log(
      "Sofia V4.3 Visual Avatar gestartet."
    );

    return true;
  }


  /* ========================================
     CSS
  ======================================== */

  function injectStyles() {
    if (
      document.getElementById(
        "sofia-avatar-v43-style"
      )
    ) {
      return;
    }

    const style =
      document.createElement("style");

    style.id =
      "sofia-avatar-v43-style";

    style.textContent = `
      .sofia-avatar-v43 {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;

        transform-origin:
          50% 58%;

        will-change:
          transform,
          filter;
      }


      .sofia-avatar-v43 > img {
        width: 100%;
        height: 100%;

        display: block;

        object-fit: cover;

        transform-origin:
          50% 58%;

        will-change:
          transform,
          filter;

        backface-visibility:
          hidden;

        -webkit-backface-visibility:
          hidden;
      }


      .sofia-avatar-glow,
      .sofia-avatar-shade {
        position: absolute;
        inset: 0;

        pointer-events: none;

        z-index: 2;

        transition:
          opacity 500ms ease;
      }


      .sofia-avatar-glow {
        background:
          radial-gradient(
            circle at 52% 40%,
            rgba(255,210,165,0.08),
            rgba(255,170,120,0.025) 38%,
            transparent 68%
          );

        mix-blend-mode:
          screen;

        opacity: 0.25;
      }


      .sofia-avatar-shade {
        background:
          radial-gradient(
            circle at center,
            transparent 45%,
            rgba(0,0,0,0.12) 100%
          );

        opacity: 0.35;
      }


      .sofia-avatar-v43[data-state="listening"]
      .sofia-avatar-glow {
        opacity: 0.38;
      }


      .sofia-avatar-v43[data-state="thinking"]
      .sofia-avatar-glow {
        opacity: 0.18;
      }


      .sofia-avatar-v43[data-state="speaking"]
      .sofia-avatar-glow {
        opacity: 0.48;
      }


      .sofia-avatar-v43[data-mood="amüsiert"] {
        filter:
          brightness(1.025)
          saturate(1.035);
      }


      .sofia-avatar-v43[data-mood="flirty"] {
        filter:
          brightness(1.02)
          saturate(1.06)
          contrast(1.01);
      }


      .sofia-avatar-v43[data-mood="skeptisch"] {
        filter:
          contrast(1.025)
          saturate(0.98);
      }


      .sofia-avatar-v43[data-mood="genervt"] {
        filter:
          brightness(0.975)
          saturate(0.94);
      }


      .sofia-avatar-v43[data-mood="ernst"] {
        filter:
          contrast(1.035)
          saturate(0.94);
      }


      @media
      (prefers-reduced-motion: reduce) {

        .sofia-avatar-v43,
        .sofia-avatar-v43 > img {
          transform:
            none !important;
        }
      }
    `;

    document.head.appendChild(
      style
    );
  }


  /* ========================================
     BLINZEL-SIMULATION
  ======================================== */

  /*
    Mit einem einzelnen Foto können wir
    die Lider noch nicht wirklich schließen.

    Deshalb simulieren wir in V4.3 nur einen
    sehr kurzen Helligkeits-/Kontrastimpuls.

    Die echte Lid-Animation kommt später
    mit einem eigenen Augen-Layer.
  */

  function scheduleBlink() {
    clearTimeout(
      blinkTimer
    );

    const delay =
      2800 +
      Math.random() * 4200;

    blinkTimer =
      setTimeout(() => {
        blinking = true;

        setTimeout(() => {
          blinking = false;
          scheduleBlink();
        }, 105);

      }, delay);
  }


  /* ========================================
     STATE
  ======================================== */

  function setState(state) {
    if (
      !Object.values(STATE)
        .includes(state)
    ) {
      return;
    }

    currentState =
      state;

    if (avatar) {
      avatar.dataset.state =
        state;
    }
  }


  function setMood(mood) {
    const allowed = [
      "entspannt",
      "flirty",
      "amüsiert",
      "skeptisch",
      "genervt",
      "ernst"
    ];

    if (
      !allowed.includes(mood)
    ) {
      mood =
        "entspannt";
    }

    currentMood =
      mood;

    if (avatar) {
      avatar.dataset.mood =
        mood;
    }
  }


  function setAudioLevel(level) {
    const number =
      Number(level);

    if (
      !Number.isFinite(number)
    ) {
      return;
    }

    targetAudioLevel =
      Math.max(
        0,
        Math.min(
          1,
          number
        )
      );
  }


  /* ========================================
     ANIMATION
  ======================================== */

  function animate(now) {
    if (
      !avatar ||
      !image
    ) {
      return;
    }

    const time =
      (now - startTime) /
      1000;


    /*
      Audio weich interpolieren.
    */

    audioLevel +=
      (
        targetAudioLevel -
        audioLevel
      ) * 0.18;


    /*
      Wenn längere Zeit kein neuer
      Audio-Wert kommt, fällt er zurück.
    */

    targetAudioLevel *=
      0.94;


    /*
      Atmung:
      extrem subtil.
    */

    const breath =
      Math.sin(
        time * 1.15
      );


    /*
      Kleine organische Driftbewegung.
    */

    const driftX =
      Math.sin(
        time * 0.31
      );

    const driftY =
      Math.sin(
        time * 0.41 + 1.4
      );


    let scale =
      1.012;

    let x =
      driftX * 0.35;

    let y =
      driftY * 0.28;

    let rotate =
      Math.sin(
        time * 0.23
      ) * 0.055;


    /*
      Ruhiges Atmen.
    */

    scale +=
      breath * 0.0016;


    /*
      STATE-SPEZIFISCH
    */

    if (
      currentState ===
      STATE.LISTENING
    ) {
      scale +=
        0.002;

      x *=
        0.55;

      y *=
        0.55;

      rotate *=
        0.5;
    }


    if (
      currentState ===
      STATE.THINKING
    ) {
      x +=
        Math.sin(
          time * 0.7
        ) * 0.22;

      rotate -=
        0.035;
    }


    if (
      currentState ===
      STATE.SPEAKING
    ) {
      /*
        Stimme beeinflusst die
        Mikro-Bewegung des Portraits.

        Noch KEIN Mund-Lip-Sync.
      */

      const speechMotion =
        audioLevel;

      scale +=
        speechMotion *
        0.0015;

      y -=
        speechMotion *
        0.16;

      rotate +=
        Math.sin(
          time * 4.1
        ) *
        speechMotion *
        0.025;
    }


    /*
      Mood beeinflusst Haltung minimal.
    */

    if (
      currentMood ===
      "flirty"
    ) {
      rotate +=
        0.045;
    }

    if (
      currentMood ===
      "skeptisch"
    ) {
      rotate -=
        0.04;
    }

    if (
      currentMood ===
      "ernst"
    ) {
      x *=
        0.45;

      rotate *=
        0.45;
    }


    image.style.transform =
      `translate3d(${x}px, ${y}px, 0)
       rotate(${rotate}deg)
       scale(${scale})`;


    /*
      Blink-Impuls.

      Absichtlich sehr schwach,
      da wir noch keinen Augen-Layer haben.
    */

    if (blinking) {
      image.style.filter =
        "brightness(0.965) contrast(1.015)";
    } else {
      image.style.filter =
        "";
    }


    /*
      Glow reagiert beim Sprechen
      ganz leicht auf Audio.
    */

    if (glow) {
      let opacity =
        0.25;

      if (
        currentState ===
        STATE.LISTENING
      ) {
        opacity =
          0.36;
      }

      if (
        currentState ===
        STATE.THINKING
      ) {
        opacity =
          0.18;
      }

      if (
        currentState ===
        STATE.SPEAKING
      ) {
        opacity =
          0.35 +
          audioLevel *
          0.18;
      }

      glow.style.opacity =
        String(opacity);
    }


    animationFrame =
      requestAnimationFrame(
        animate
      );
  }


  /* ========================================
     PUBLIC API
  ======================================== */

  window.SofiaAvatar = {
    init,

    idle() {
      setState(
        STATE.IDLE
      );
    },

    listen() {
      setState(
        STATE.LISTENING
      );
    },

    think() {
      setState(
        STATE.THINKING
      );
    },

    speak() {
      setState(
        STATE.SPEAKING
      );
    },

    setMood,

    setAudioLevel,

    getState() {
      return {
        state:
          currentState,

        mood:
          currentMood,

        audioLevel
      };
    }
  };


  /*
    Erst nach DOM-Aufbau starten.
  */

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        window.SofiaAvatar.init();
      }
    );
  } else {
    window.SofiaAvatar.init();
  }

})();
