/*
  Sofia V4.3
  Live Voice + Live Memory + Visual Avatar
*/

(() => {

  /* ========================================
     LIVE / WEBRTC STATE
  ======================================== */

  let peerConnection = null;
  let dataChannel = null;
  let localStream = null;
  let remoteAudio = null;

  let liveActive = false;
  let connecting = false;
  let desiredMuted = localStorage.getItem("sofia_audio_muted") === "true";
  let pendingImageContext = null;

  // V4.5.7: hard half-duplex microphone gate.
  let responseLocked = false;
  let assistantResponding = false;
  let ignoreInputUntil = 0;
  let micSuppressedForAssistant = false;
  let micRestoreTimer = null;

  function setRealtimeMicEnabled(enabled) {
    if (!localStream) return;
    for (const track of localStream.getAudioTracks()) {
      track.enabled = Boolean(enabled);
    }
  }

  function suppressMicForAssistant() {
    micSuppressedForAssistant = true;
    assistantResponding = true;
    if (micRestoreTimer) {
      clearTimeout(micRestoreTimer);
      micRestoreTimer = null;
    }
    setRealtimeMicEnabled(false);
  }

  function restoreMicAfterAssistant(delay = 1800) {
    if (micRestoreTimer) clearTimeout(micRestoreTimer);
    micRestoreTimer = window.setTimeout(() => {
      micRestoreTimer = null;
      if (!liveActive || responseLocked) return;
      assistantResponding = false;
      micSuppressedForAssistant = false;
      ignoreInputUntil = Date.now() + 500;
      setRealtimeMicEnabled(true);
    }, delay);
  }


  /* ========================================
     LIVE MEMORY STATE
  ======================================== */

  let pendingUserText = "";
  let pendingAssistantText = "";
  let presenceStartedAt = 0;
  let lastPresenceState = "idle";

  let memoryQueue =
    Promise.resolve();


  /* ========================================
     AVATAR AUDIO ANALYSIS
  ======================================== */

  let avatarAudioContext = null;
  let avatarAnalyser = null;
  let avatarLastAudibleAt = 0;
  let avatarWasAudible = false;
  let avatarAudioSource = null;
  let avatarAudioFrame = null;


  /* ========================================
     EXISTING APP ELEMENTS
  ======================================== */

  const app =
    document.querySelector("#app");

  const mode =
    document.querySelector("#mode");

  const thought =
    document.querySelector("#thought");


  /* ========================================
     LIVE BUTTON
  ======================================== */

  const liveButton =
    document.createElement("button");

  liveButton.type =
    "button";

  liveButton.id =
    "liveVoiceButton";

  liveButton.textContent =
    "◉ LIVE";

  Object.assign(
    liveButton.style,
    {
      position: "fixed",
      right: "18px",
      bottom: "92px",
      zIndex: "5000",

      border:
        "1px solid rgba(255,255,255,0.16)",

      borderRadius:
        "999px",

      padding:
        "11px 16px",

      background:
        "rgba(15,18,24,0.88)",

      backdropFilter:
        "blur(14px)",

      WebkitBackdropFilter:
        "blur(14px)",

      color:
        "#fff",

      fontSize:
        "12px",

      fontWeight:
        "700",

      letterSpacing:
        "0.08em",

      boxShadow:
        "0 8px 30px rgba(0,0,0,0.28)",

      cursor:
        "pointer"
    }
  );

  document.body.appendChild(
    liveButton
  );


  /* ========================================
     UI HELPERS
  ======================================== */

  function setLiveButtonState(
    state
  ) {

    window.dispatchEvent(new CustomEvent("sofia-live-state", {
      detail: { state }
    }));

    if (
      state ===
      "connecting"
    ) {
      liveButton.textContent =
        "◌ VERBINDE…";

      liveButton.style.opacity =
        "0.7";

      return;
    }


    if (
      state ===
      "active"
    ) {
      liveButton.textContent =
        "● LIVE";

      liveButton.style.opacity =
        "1";

      liveButton.style.background =
        "rgba(110,35,45,0.92)";

      return;
    }


    liveButton.textContent =
      "◉ LIVE";

    liveButton.style.opacity =
      "1";

    liveButton.style.background =
      "rgba(15,18,24,0.88)";
  }


  function setMode(text) {

    if (mode) {
      mode.textContent =
        text;
    }

  }


  function setThought(text) {

    if (thought) {
      thought.textContent =
        text;
    }

  }


  function setPresence(state, label) {
    const changed = lastPresenceState !== state;
    if (changed) {
      presenceStartedAt = performance.now();
      lastPresenceState = state;
      if (app) app.dataset.presence = state;
      window.dispatchEvent(new CustomEvent("sofia-presence", { detail: { state } }));
    }
    if (label) setMode(label);
  }


  /* ========================================
     AVATAR AUDIO ANALYSIS
  ======================================== */

  async function startAvatarAudioAnalysis(mediaStream) {
    try {
      if (!mediaStream || avatarAudioContext) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      avatarAudioContext = new AudioContextClass();
      if (avatarAudioContext.state === "suspended") {
        try { await avatarAudioContext.resume(); } catch {}
      }
      avatarAudioSource = avatarAudioContext.createMediaStreamSource(mediaStream);
      avatarAnalyser = avatarAudioContext.createAnalyser();
      avatarAnalyser.fftSize = 512;
      avatarAnalyser.smoothingTimeConstant = 0.25;
      avatarAudioSource.connect(avatarAnalyser);
      const samples = new Uint8Array(avatarAnalyser.fftSize);
      const analyse = () => {
        if (!avatarAnalyser || !avatarAudioContext) return;

        // Keep analysing the actual remote audio stream for the entire playback.
        // Do not tie lip-sync lifetime to transcript events or response.done.
        avatarAnalyser.getByteTimeDomainData(samples);

        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
          const v = (samples[i] - 128) / 128;
          sum += v * v;
        }

        const rms = Math.sqrt(sum / samples.length);
        const audible = rms >= 0.012;
        const level = audible
          ? Math.max(0.05, Math.min(1, rms * 8.5))
          : 0;

        if (audible) {
          avatarLastAudibleAt = performance.now();
          avatarWasAudible = true;
          window.SofiaAvatar?.speak();
          // V4.5.9: lip-sync is visualized by SofiaAvatar only; legacy voice bars stay off.
        }

        window.SofiaAvatar?.setAudioLevel(level);

        // Only return the avatar to idle after the REAL audio stream has
        // remained silent, not merely because response.done arrived early.
        if (
          avatarWasAudible &&
          !audible &&
          performance.now() - avatarLastAudibleAt > 450
        ) {
          avatarWasAudible = false;
          window.SofiaAvatar?.setAudioLevel(0);
          window.SofiaAvatar?.idle();
          // Legacy voice bars remain disabled.
        }

        avatarAudioFrame = requestAnimationFrame(analyse);
      };
      analyse();
    } catch (error) {
      console.warn("Avatar Audio Analyse:", error);
      stopAvatarAudioAnalysis();
    }
  }

  /* ========================================
     STOP AVATAR AUDIO ANALYSIS
  ======================================== */

  function stopAvatarAudioAnalysis() {

    if (avatarAudioFrame) {

      cancelAnimationFrame(
        avatarAudioFrame
      );

      avatarAudioFrame =
        null;

    }


    if (avatarAudioSource) {

      try {

        avatarAudioSource
          .disconnect();

      } catch {}

      avatarAudioSource =
        null;

    }


    if (avatarAnalyser) {

      try {

        avatarAnalyser
          .disconnect();

      } catch {}

      avatarAnalyser =
        null;

    }


    if (avatarAudioContext) {

      try {

        avatarAudioContext
          .close();

      } catch {}

      avatarAudioContext =
        null;

    }


    window.SofiaAvatar
      ?.setAudioLevel(0);

  }


  /* ========================================
     LIVE MEMORY QUEUE
  ======================================== */

  function queueLiveMemory(
    userText,
    assistantText
  ) {

    const cleanUser =
      String(
        userText || ""
      ).trim();


    const cleanAssistant =
      String(
        assistantText || ""
      ).trim();


    if (!cleanUser) {
      return;
    }


    /*
      Requests nacheinander ausführen.

      Dadurch bleibt die Reihenfolge
      der Unterhaltung in Redis erhalten.
    */

    memoryQueue =
      memoryQueue
        .then(
          () =>
            saveLiveMemory(
              cleanUser,
              cleanAssistant
            )
        )
        .catch(error => {

          console.error(
            "Live Memory Queue:",
            error
          );

        });

  }


  /* ========================================
     LIVE MEMORY SERVER
  ======================================== */

  async function saveLiveMemory(
    userText,
    assistantText
  ) {

    const response =
      await fetch(
        "/api/live-memory",
        {
          method:
            "POST",

          credentials:
            "same-origin",

          cache:
            "no-store",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              userText,
              assistantText
            })
        }
      );


    if (
      response.status ===
      401
    ) {

      window.location.reload();

      return;
    }


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        "Live Memory fehlgeschlagen."
      );

    }


    console.log(
      "Sofia Live Memory:",
      data.memoryAction,
      `(${data.longTermMemories} Memories)`
    );

  }


  /* ========================================
     TURN ABSCHLIESSEN
  ======================================== */

  function commitCurrentTurn() {

    const userText =
      pendingUserText.trim();


    const assistantText =
      pendingAssistantText.trim();


    if (!userText) {

      pendingAssistantText =
        "";

      return;
    }


    queueLiveMemory(
      userText,
      assistantText
    );


    mirrorTurnToLocalChat(
      userText,
      assistantText
    );


    pendingUserText =
      "";


    pendingAssistantText =
      "";

  }


  /* ========================================
     LOCAL CHAT MEMORY
  ======================================== */

  function mirrorTurnToLocalChat(
    userText,
    assistantText
  ) {

    try {

      const key =
        "sofia_memory";


      const raw =
        localStorage.getItem(
          key
        );


      let history = [];


      if (raw) {

        const parsed =
          JSON.parse(raw);


        if (
          Array.isArray(parsed)
        ) {

          history =
            parsed.filter(
              item =>
                item &&
                [
                  "user",
                  "assistant"
                ].includes(
                  item.role
                ) &&
                typeof item.content ===
                  "string"
            );

        }

      }


      history.push({
        role:
          "user",

        content:
          userText
      });


      if (assistantText) {

        history.push({
          role:
            "assistant",

          content:
            assistantText
        });

      }


      history =
        history.slice(
          -100
        );


      localStorage.setItem(
        key,
        JSON.stringify(
          history
        )
      );

    } catch (error) {

      console.warn(
        "Live Local Memory:",
        error
      );

    }

  }


  /* ========================================
     VISUAL CONTEXT
  ======================================== */

  function sendImageContextToRealtime() {
    if (!pendingImageContext || !dataChannel || dataChannel.readyState !== "open") {
      return false;
    }

    try {
      dataChannel.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_image",
              image_url: pendingImageContext
            }
          ]
        }
      }));

      setThought("Foto ist im Live-Kontext. Frag mich einfach dazu.");
      return true;
    } catch (error) {
      console.warn("Live Bildkontext:", error);
      return false;
    }
  }


  /* ========================================
     START LIVE
  ======================================== */

  async function startLive() {

    if (
      liveActive ||
      connecting
    ) {
      return;
    }


    connecting =
      true;


    pendingUserText =
      "";


    pendingAssistantText =
      "";


    setLiveButtonState(
      "connecting"
    );


    setMode(
      "Live wird gestartet…"
    );


    setThought(
      "Einen Moment…"
    );


    window.SofiaAvatar
      ?.think();


    try {

      /* ====================================
         REALTIME TOKEN
      ==================================== */

      const tokenResponse =
        await fetch(
          "/api/realtime",
          {
            method:
              "POST",

            credentials:
              "same-origin",

            cache:
              "no-store"
          }
        );


      if (
        tokenResponse.status ===
        401
      ) {

        window.location.reload();

        return;
      }


      const tokenData =
        await tokenResponse.json();


      if (!tokenResponse.ok) {

        throw new Error(
          tokenData.error ||
          "Realtime-Token fehlt."
        );

      }


      const ephemeralKey =
        tokenData.value;


      if (!ephemeralKey) {

        throw new Error(
          "Kein Realtime-Token erhalten."
        );

      }


      /* ====================================
         MICROPHONE
      ==================================== */

      localStream =
        await navigator
          .mediaDevices
          .getUserMedia({
            audio: {
              echoCancellation:
                true,

              noiseSuppression:
                true,

              autoGainControl:
                true
            }
          });


      /*
        Normale Browser-Sprachausgabe
        stoppen.

        Realtime übernimmt jetzt.
      */

      if (
        "speechSynthesis"
        in window
      ) {

        speechSynthesis.cancel();

      }


      /* ====================================
         WEBRTC
      ==================================== */

      peerConnection =
        new RTCPeerConnection();


      /* ====================================
         SOFIA AUDIO
      ==================================== */

      remoteAudio =
        document.createElement(
          "audio"
        );


      remoteAudio.autoplay =
        true;


      remoteAudio.playsInline =
        true;

      remoteAudio.muted =
        desiredMuted;


      peerConnection.ontrack =
        event => {

          remoteAudio.srcObject =
            event.streams[0];


          remoteAudio
            .play()
            .then(() => {

              /*
                Ab jetzt analysieren wir
                Sofias tatsächliches Audio.
              */

              startAvatarAudioAnalysis(
                event.streams[0]
              );

            })
            .catch(error => {

              console.warn(
                "Remote Audio:",
                error
              );

            });

        };


      /* ====================================
         USER AUDIO
      ==================================== */

      for (
        const track
        of localStream.getTracks()
      ) {

        peerConnection.addTrack(
          track,
          localStream
        );

      }


      /* ====================================
         DATA CHANNEL
      ==================================== */

      dataChannel =
        peerConnection
          .createDataChannel(
            "oai-events"
          );


      dataChannel.addEventListener(
        "open",
        () => {

          liveActive =
            true;


          connecting =
            false;

          responseLocked = false;
          assistantResponding = false;
          micSuppressedForAssistant = false;
          ignoreInputUntil = 0;
          setRealtimeMicEnabled(true);
          if (app) delete app.dataset.speaking;


          setLiveButtonState(
            "active"
          );


          setPresence(
            "ready",
            "bereit zum Zuhören"
          );


          setThought(
            "Ich höre dir zu."
          );


          window.SofiaAvatar
            ?.idle();


          if (app) {

            app.dataset.live =
              "true";

          }

          if (remoteAudio) {
            remoteAudio.muted = desiredMuted;
          }

          sendImageContextToRealtime();

        }
      );


      /* ====================================
         REALTIME EVENTS
      ==================================== */

      dataChannel.addEventListener(
        "message",
        event => {

          try {

            const data =
              JSON.parse(
                event.data
              );


            handleRealtimeEvent(
              data
            );

          } catch (error) {

            console.warn(
              "Realtime Event:",
              error
            );

          }

        }
      );


      dataChannel.addEventListener(
        "close",
        () => {

          if (liveActive) {

            stopLive(false);

          }

        }
      );


      /* ====================================
         CONNECTION STATE
      ==================================== */

      peerConnection
        .addEventListener(
          "connectionstatechange",
          () => {

            const state =
              peerConnection
                ?.connectionState;


            if (
              state ===
                "failed" ||
              state ===
                "closed"
            ) {

              stopLive(false);

            }

          }
        );


      /* ====================================
         SDP OFFER
      ==================================== */

      const offer =
        await peerConnection
          .createOffer();


      await peerConnection
        .setLocalDescription(
          offer
        );


      /* ====================================
         OPENAI REALTIME WEBRTC
      ==================================== */

      const sdpResponse =
        await fetch(
          "https://api.openai.com/v1/realtime/calls",
          {
            method:
              "POST",

            body:
              offer.sdp,

            headers: {
              Authorization:
                `Bearer ${ephemeralKey}`,

              "Content-Type":
                "application/sdp"
            }
          }
        );


      if (!sdpResponse.ok) {

        const errorText =
          await sdpResponse.text();


        throw new Error(
          errorText ||
          "WebRTC-Verbindung fehlgeschlagen."
        );

      }


      const answer = {
        type:
          "answer",

        sdp:
          await sdpResponse.text()
      };


      await peerConnection
        .setRemoteDescription(
          answer
        );


    } catch (error) {

      console.error(
        "Sofia Live Fehler:",
        error
      );


      setThought(
        "Live Voice konnte gerade nicht gestartet werden."
      );


      setMode(
        "bereit"
      );


      window.SofiaAvatar
        ?.idle();


      stopLive(false);


    } finally {

      connecting =
        false;

    }

  }


  /* ========================================
     REALTIME EVENT HANDLER
  ======================================== */

  function handleRealtimeEvent(
    event
  ) {

    switch (event.type) {


      /* ====================================
         USER BEGINNT ZU REDEN
      ==================================== */

      case
        "input_audio_buffer.speech_started":


        setPresence(
          "listening",
          "hört zu…"
        );


        window.SofiaAvatar
          ?.listen();


        if (app) {

          app.dataset.speaking =
            "false";

        }


        break;


      /* ====================================
         USER HÖRT AUF
      ==================================== */

      case
        "input_audio_buffer.speech_stopped":


        setPresence(
          "thinking",
          "denkt nach…"
        );


        window.SofiaAvatar
          ?.think();


        break;


      /* ====================================
         USER TRANSKRIPT FERTIG
      ==================================== */

      case
        "conversation.item.input_audio_transcription.completed":


        if (
          responseLocked ||
          assistantResponding ||
          Date.now() < ignoreInputUntil
        ) {
          break;
        }


        if (
          typeof event.transcript ===
            "string" &&
          event.transcript.trim()
        ) {

          pendingUserText =
            event.transcript.trim();


          console.log(
            "Live User:",
            pendingUserText
          );

          // V4.12.1: retrieve memories for this exact spoken turn before inference.
          suppressMicForAssistant();
          setPresence("thinking", "denkt nach…");

          try {
            const contextResponse = await fetch("/api/live-context", {
              method: "POST",
              credentials: "same-origin",
              cache: "no-store",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: pendingUserText })
            });
            const contextData = await contextResponse.json();
            const turnContext = typeof contextData.context === "string" ? contextData.context.trim() : "";

            if (dataChannel?.readyState === "open") {
              dataChannel.send(JSON.stringify({
                type: "response.create",
                response: turnContext ? {
                  instructions: `Zusätzlicher, nur für diesen Redezug relevanter Memory-Kontext:\n${turnContext}\nNutze ihn nur, wenn er die aktuelle Frage tatsächlich unterstützt.`
                } : {}
              }));
            }
          } catch (error) {
            console.warn("Live Kontext:", error);
            if (dataChannel?.readyState === "open") {
              dataChannel.send(JSON.stringify({ type: "response.create", response: {} }));
            }
          }

        }


        break;


      /* ====================================
         SOFIA BEGINNT ANTWORT
      ==================================== */

      case
        "response.created":

        suppressMicForAssistant();

        responseLocked = true;


        pendingAssistantText =
          "";


        const thinkingMs = performance.now() - presenceStartedAt;
        setPresence(
          "responding",
          thinkingMs >= 900 ? "hat eine Antwort…" : "antwortet…"
        );


        window.SofiaAvatar
          ?.think();


        break;


      /* ====================================
         SOFIA AUDIO
      ==================================== */

      case
        "response.output_audio.delta":
        suppressMicForAssistant();


        setPresence(
          "speaking",
          "spricht…"
        );


        window.SofiaAvatar
          ?.speak();


        if (app) {

          app.dataset.speaking =
            "true";

        }


        break;


      /* ====================================
         SOFIA TRANSKRIPT STREAM
      ==================================== */

      case
        "response.output_audio_transcript.delta":
        suppressMicForAssistant();


        if (
          typeof event.delta ===
          "string"
        ) {

          pendingAssistantText +=
            event.delta;


          setThought(
            pendingAssistantText
          );

        }


        break;


      /* ====================================
         SOFIA TRANSKRIPT FERTIG
      ==================================== */

      case
        "response.output_audio_transcript.done":


        if (
          typeof event.transcript ===
            "string" &&
          event.transcript.trim()
        ) {

          pendingAssistantText =
            event.transcript.trim();


          setThought(
            pendingAssistantText
          );

        }


        break;


      /* ====================================
         KOMPLETTER TURN FERTIG
      ==================================== */

      case
        "response.done":

        // iOS can still be playing buffered assistant audio after response.done.
        // Keep the outgoing microphone track physically disabled.
        setRealtimeMicEnabled(false);
        responseLocked = false;
        ignoreInputUntil = Date.now() + 2300;
        restoreMicAfterAssistant(1800);

      // Do not force the avatar to idle here. On iOS response.done can
      // precede the end of buffered audio playback. The analyser above
      // returns the mouth to neutral only after actual audio silence.

        setPresence(
          "ready",
          "bereit zum Zuhören"
        );


        /*
          User + Sofia sind vollständig.

          Jetzt wird der Gesprächszug
          in Redis gespeichert und ggf.
          Long-Term-Memory aktualisiert.
        */

        commitCurrentTurn();


        break;


      /* ====================================
         REALTIME ERROR
      ==================================== */

      case
        "error":


        console.error(
          "OpenAI Realtime:",
          event.error
        );


        setThought(
          event?.error?.message ||
          "Live Voice hat einen Fehler gemeldet."
        );


        setPresence(
          "error",
          "Verbindung gestört"
        );


        window.SofiaAvatar
          ?.idle();


        break;

    }

  }


  /* ========================================
     STOP LIVE
  ======================================== */

  function stopLive(
    userInitiated = true
  ) {

    /*
      Falls bereits ein fertiges
      User-Transkript vorhanden ist,
      beim manuellen Beenden nicht
      verlieren.
    */

    if (
      pendingUserText.trim()
    ) {

      commitCurrentTurn();

    }


    liveActive =
      false;


    connecting =
      false;


    setPresence(
      "ending",
      "Live wird beendet…"
    );


    /* DATA CHANNEL */

    if (dataChannel) {

      try {

        dataChannel.close();

      } catch {}


      dataChannel =
        null;

    }


    /* WEBRTC */

    if (peerConnection) {

      try {

        peerConnection.close();

      } catch {}


      peerConnection =
        null;

    }


    /* MICROPHONE */

    if (localStream) {

      for (
        const track
        of localStream.getTracks()
      ) {

        track.stop();

      }


      localStream =
        null;

    }


    /* REMOTE AUDIO */

    if (remoteAudio) {

      try {

        remoteAudio.pause();

      } catch {}


      remoteAudio.srcObject =
        null;


      remoteAudio =
        null;

    }


    /* AVATAR AUDIO */

    stopAvatarAudioAnalysis();


    /* APP STATE */

    if (app) {

      app.dataset.live =
        "false";


      app.dataset.speaking =
        "false";

    }


    window.SofiaAvatar
      ?.idle();


    setLiveButtonState(
      "inactive"
    );


    setPresence(
      "idle",
      "bereit"
    );


    if (userInitiated) {

      setThought(
        "Live-Modus beendet."
      );

    }

  }


  /* ========================================
     LIVE BUTTON EVENT
  ======================================== */

  liveButton.addEventListener(
    "click",
    () => {

      if (
        liveActive ||
        connecting
      ) {

        stopLive();

      } else {

        startLive();

      }

    }
  );


  /* ========================================
     PAGE CLEANUP
  ======================================== */

  window.addEventListener(
    "pagehide",
    () => {

      if (
        liveActive ||
        connecting
      ) {

        stopLive(false);

      }

    }
  );



  window.SofiaLive = {
    setMuted(muted) {
      desiredMuted = Boolean(muted);
      localStorage.setItem("sofia_audio_muted", desiredMuted ? "true" : "false");
      if (remoteAudio) remoteAudio.muted = desiredMuted;
      return desiredMuted;
    },
    isMuted() { return desiredMuted; },
    isActive() { return liveActive; },
    setImageContext(dataUrl) {
      pendingImageContext = typeof dataUrl === "string" ? dataUrl : null;
      if (liveActive) sendImageContextToRealtime();
      return Boolean(pendingImageContext);
    },
    clearImageContext() {
      pendingImageContext = null;
    }
  };

  window.dispatchEvent(new CustomEvent("sofia-live-ready"));

  console.log(
    "Sofia V4.3 Live Voice + Memory + Avatar geladen."
  );

})();
