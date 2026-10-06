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
  let pendingImageRequestId = null;
  let liveSessionInstructions = "";
  let userSpeaking = false;
  let userTurnRevision = 0;
  let userContextRequestRevision = -1;
  let userTurnTimer = null;
  let latestSpeechItemId = null;
  const transcribedSpeechItems = new Set();

  function cancelPendingLiveResponse() {
    userTurnRevision++;
    if (userTurnTimer !== null) clearTimeout(userTurnTimer);
    userTurnTimer = null;
  }

  function scheduleLiveResponse() {
    if (userTurnTimer !== null) clearTimeout(userTurnTimer);
    userTurnTimer = null;
    if (userSpeaking || !pendingUserText.trim() || responseLocked || assistantResponding ||
        (latestSpeechItemId && !transcribedSpeechItems.has(latestSpeechItemId))) return;
    const revision = userTurnRevision;
    userTurnTimer = window.setTimeout(() => {
      userTurnTimer = null;
      void createLiveTurnResponse(revision);
    }, 1500);
  }

  async function fetchLiveTurnContext(message) {
    const controller = new AbortController();
    let timeout;
    const deadline = new Promise((_, reject) => {
      timeout = window.setTimeout(() => {
        reject(new Error("Live Kontext Zeitlimit überschritten."));
        controller.abort();
      }, 20000);
    });
    try {
      return await Promise.race([
        (async () => {
          const response = await fetch("/api/live-context", {
            method: "POST", credentials: "same-origin", cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message, referenceImageId:window.SofiaImages?.referenceId }), signal: controller.signal
          });
          if (!response.ok) throw new Error("Live Kontext HTTP " + response.status);
          return await response.json();
        })(),
        deadline
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function createLiveTurnResponse(revision) {
    const current = () => liveActive && revision === userTurnRevision && !userSpeaking &&
      !responseLocked && !assistantResponding && dataChannel?.readyState === "open";
    if (!current() || userContextRequestRevision === revision) return;
    userContextRequestRevision = revision;
    const message = pendingUserText.trim();
    let contextData = {};
    let contextFailed = false;
    try {
      contextData = await fetchLiveTurnContext(message);
    } catch (error) {
      contextFailed = true;
      console.warn("Live Kontext:", error);
    }
    // A resumed utterance or stopped session invalidates this response, even
    // when the context request completes later. Keep the mic open until here.
    if (!current()) return;
    window.SofiaLifeStatus?.update(contextData.life);
    window.SofiaActionFeedback?.show(contextFailed ? { ok: false, status: "execution_failed" } : contextData.taskAction);
    if (contextData.imageRequest) {
      pendingImageRequestId = contextData.imageRequest.id;
      void window.SofiaImages?.generate(contextData.imageRequest);
    }
    if (contextData.calendarAction) openCalendarImport(contextData.calendarAction);
    if (contextData.taskAction?.action === "create" &&
        (contextData.taskAction.task?.remindAt || contextData.taskAction.task?.dueAt)) {
      window.SofiaTasks?.offerNotifications?.();
      window.SofiaTasks?.checkReminders?.();
    }
    const turnContext = typeof contextData.context === "string" ? contextData.context.trim() : "";
    // response.instructions replaces session.instructions. Preserve the full
    // persona and German language rules when adding per-turn action results.
    const instructions = liveSessionInstructions + (contextFailed
      ? "\n\nDie Action-/Kontextabfrage ist fehlgeschlagen. Der Status von Task- oder Kalenderaktionen ist unbekannt. Behaupte keine erfolgreiche Ausführung und biete keinen Kalenderimport als vorbereitet an. Weise bei einer Aktionsanfrage knapp auf die fehlende Bestätigung hin. Antworte auf Deutsch."
      : "") + (turnContext
      ? "\n\nZusätzlicher Kontext nur für diesen Redezug:\n" + turnContext +
        "\nNutze ihn nur, wenn er die aktuelle Frage unterstützt. Antworte auf Deutsch."
      : "");
    try {
      dataChannel.send(JSON.stringify({ type: "response.create", response: { instructions } }));
      responseLocked = true;
      suppressMicForAssistant();
      setPresence("thinking", "denkt nach…");
    } catch (error) {
      console.warn("Live Antwort:", error);
      stopLive(false);
      setThought("Die Live-Verbindung wurde beendet. Bitte Live neu starten.");
    }
  }

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
  let assistantPlaybackDoneAt = 0;
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

        // Do not reopen the microphone from a short pause inside Sofia's
        // speech. iOS playback can contain >450 ms natural pauses. Require
        // BOTH response.done and a long period of real remote-audio silence.
        if (
          micSuppressedForAssistant &&
          !responseLocked &&
          assistantPlaybackDoneAt > 0 &&
          !audible &&
          performance.now() - avatarLastAudibleAt > 2200 &&
          performance.now() - assistantPlaybackDoneAt > 1200
        ) {
          assistantPlaybackDoneAt = 0;
          setPresence("ready", "bereit zum Zuhören");
          restoreMicAfterAssistant(350);
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
    assistantText,
    imageRequestId = null
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
              cleanAssistant,
              imageRequestId
            )
        )
        .catch(error => {

          console.error(
            "Live Memory Queue:",
            error
          );

        });

    return memoryQueue;

  }


  /* ========================================
     LIVE MEMORY SERVER
  ======================================== */

  async function saveLiveMemory(
    userText,
    assistantText,
    imageRequestId = null
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
              assistantText,
              imageRequestId
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


  async function openCalendarImport(action) {
    try {
      if (!action || typeof action !== "object") return;
      const nativeCalendar = window.webkit?.messageHandlers?.calendar;
      if (nativeCalendar?.postMessage) {
        const result = await nativeCalendar.postMessage({
          title: action.title,
          start: action.start,
          durationMinutes: action.duration_minutes || 15,
          alarmMinutes: action.alarm_minutes || 0,
          notes: action.notes || ""
        });
        if (!result?.ok) console.warn("Nativer Live-Kalender:", result?.status || "save_failed");
        return;
      }

      if (typeof window.SofiaCalendarDownload === "function") {
        window.SofiaCalendarDownload(action);
        return;
      }

      console.warn("Live Kalender-Erinnerung: Web-Kalenderlink nicht verfügbar.");
    } catch (error) {
      console.warn("Live Kalender-Erinnerung:", error);
    }
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


    const persistence =
      queueLiveMemory(
        userText,
        assistantText,
        pendingImageRequestId
      );

    window.SofiaLiveHistoryReady =
      persistence || Promise.resolve();

    if (assistantText) {
      fetch("/api/sofia-identity", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userText, assistantText })
      }).catch(error => console.warn("Sofia identity update:", error));
    }


    mirrorTurnToLocalChat(
      userText,
      assistantText,
      pendingImageRequestId
    );


    pendingUserText =
      "";
    pendingImageRequestId = null;


    pendingAssistantText =
      "";

  }


  /* ========================================
     LOCAL CHAT MEMORY
  ======================================== */

  function mirrorTurnToLocalChat(
    userText,
    assistantText,
    imageRequestId = null
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
            assistantText,
          ...(imageRequestId ? {imageRequestId} : {})
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
    pendingImageRequestId = null;


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
              "no-store",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              history: (() => {
                try {
                  const parsed =
                    JSON.parse(
                      localStorage.getItem("sofia_memory") || "[]"
                    );

                  return Array.isArray(parsed)
                    ? parsed
                        .filter(item =>
                          item &&
                          ["user", "assistant"].includes(item.role) &&
                          typeof item.content === "string" &&
                          item.content.trim()
                        )
                        .slice(-12)
                    : [];
                } catch {
                  return [];
                }
              })()
            })
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


      cancelPendingLiveResponse();
      userSpeaking = false;
      latestSpeechItemId = null;
      transcribedSpeechItems.clear();
      window.SofiaActionFeedback?.clear();
      liveSessionInstructions = typeof tokenData.instructions === "string"
        ? tokenData.instructions : "Du bist Sofia. Antworte auf Deutsch, sofern der Nutzer nicht ausdrücklich eine andere Sprache verlangt.";

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

  async function handleRealtimeEvent(
    event
  ) {

    switch (event.type) {


      /* ====================================
         USER BEGINNT ZU REDEN
      ==================================== */

      case
        "input_audio_buffer.speech_started":
        if (responseLocked || assistantResponding || Date.now() < ignoreInputUntil) break;
        window.SofiaActionFeedback?.clear();
        userSpeaking = true;
        latestSpeechItemId = event.item_id || null;
        cancelPendingLiveResponse();


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
        if (responseLocked || assistantResponding || Date.now() < ignoreInputUntil) break;
        userSpeaking = false;
        latestSpeechItemId = event.item_id || latestSpeechItemId;
        scheduleLiveResponse();


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

          if (event.item_id && transcribedSpeechItems.has(event.item_id)) break;
          if (event.item_id) transcribedSpeechItems.add(event.item_id);
          pendingUserText = [pendingUserText.trim(), event.transcript.trim()].filter(Boolean).join(" ");
          cancelPendingLiveResponse();
          scheduleLiveResponse();

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
        assistantPlaybackDoneAt = performance.now();
        ignoreInputUntil = Date.now() + 3000;

        // Do not restore the microphone on a fixed timer here. On iOS,
        // response.done can arrive before buffered assistant audio finishes.
        // The remote-audio analyser restores it only after real silence.

      // Do not force the avatar to idle here. On iOS response.done can
      // precede the end of buffered audio playback. The analyser above
      // returns the mouth to neutral only after actual audio silence.

        // response.done describes generation, not necessarily the end of
        // buffered playback on iOS. Keep the UI in speaking state and the
        // microphone gated until the remote-audio analyser confirms silence.
        setPresence(
          "speaking",
          "spricht…"
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


        // Close the failed session instead of reopening the mic while remote
        // audio may still be buffered. A new Live session starts cleanly.
        stopLive(false);
        setThought("Die Live-Verbindung wurde nach einem Fehler beendet. Bitte Live neu starten.");


        break;

    }

  }


  /* ========================================
     STOP LIVE
  ======================================== */

  function stopLive(
    userInitiated = true
  ) {
    cancelPendingLiveResponse();
    userSpeaking = false;
    latestSpeechItemId = null;
    transcribedSpeechItems.clear();

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

