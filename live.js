/*
  Sofia V4.3.3
  Live Voice + Live Memory + Visual Avatar

  Änderungen gegenüber V4.3.2:
  - RMS Lip Sync bleibt erhalten
  - Echo-/False-Barge-In Schutz
  - kurze Speech-Starts während Sofias eigener Ausgabe
    werden UI-seitig ignoriert
  - robustere Response-State-Verwaltung
*/

(() => {
  "use strict";

  /* =====================================================
     CONFIG
  ===================================================== */

  const CONFIG = {
    echoGuardMs: 900,
    afterSpeechGuardMs: 500,
    rmsGain: 7.5,
    rmsNoiseFloor: 0.018
  };


  /* =====================================================
     WEBRTC STATE
  ===================================================== */

  let peerConnection = null;
  let dataChannel = null;
  let localStream = null;
  let remoteAudio = null;

  let liveActive = false;
  let connecting = false;

  let assistantResponding = false;

  let assistantSpeechStartedAt = 0;
  let assistantSpeechEndedAt = 0;


  /* =====================================================
     MEMORY STATE
  ===================================================== */

  let pendingUserText = "";
  let pendingAssistantText = "";

  let memoryQueue = Promise.resolve();


  /* =====================================================
     AVATAR AUDIO ANALYSIS
  ===================================================== */

  let avatarAudioContext = null;
  let avatarAnalyser = null;
  let avatarAudioSource = null;
  let avatarAudioFrame = null;


  /* =====================================================
     APP ELEMENTS
  ===================================================== */

  const app =
    document.querySelector("#app");

  const mode =
    document.querySelector("#mode");

  const thought =
    document.querySelector("#thought");


  /* =====================================================
     LIVE BUTTON
  ===================================================== */

  const liveButton =
    document.createElement("button");

  liveButton.type = "button";
  liveButton.id = "liveVoiceButton";
  liveButton.textContent = "◉ LIVE";


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

      color: "#fff",

      fontSize: "12px",

      fontWeight: "700",

      letterSpacing:
        "0.08em",

      boxShadow:
        "0 8px 30px rgba(0,0,0,0.28)",

      cursor: "pointer"
    }
  );


  document.body.appendChild(
    liveButton
  );


  /* =====================================================
     UI HELPERS
  ===================================================== */

  function setLiveButtonState(state) {

    if (state === "connecting") {

      liveButton.textContent =
        "◌ VERBINDE…";

      liveButton.style.opacity =
        "0.7";

      return;
    }


    if (state === "active") {

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
      mode.textContent = text;
    }

  }


  function setThought(text) {

    if (thought) {
      thought.textContent = text;
    }

  }


  /* =====================================================
     DATA CHANNEL SEND
  ===================================================== */

  function sendRealtimeEvent(event) {

    if (
      !dataChannel ||
      dataChannel.readyState !== "open"
    ) {
      return false;
    }


    try {

      dataChannel.send(
        JSON.stringify(event)
      );

      return true;

    }

    catch (error) {

      console.warn(
        "Realtime Event konnte nicht gesendet werden:",
        error
      );

      return false;

    }

  }


  /* =====================================================
     AVATAR AUDIO ANALYSIS
  ===================================================== */

  async function startAvatarAudioAnalysis(
    mediaStream
  ) {

    try {

      if (
        !mediaStream ||
        avatarAudioContext
      ) {
        return;
      }


      const AudioContextClass =
        window.AudioContext ||
        window.webkitAudioContext;


      if (!AudioContextClass) {

        console.warn(
          "Web Audio API nicht verfügbar."
        );

        return;
      }


      avatarAudioContext =
        new AudioContextClass();


      if (
        avatarAudioContext.state ===
        "suspended"
      ) {

        try {
          await avatarAudioContext.resume();
        }
        catch {}
      }


      avatarAudioSource =
        avatarAudioContext
          .createMediaStreamSource(
            mediaStream
          );


      avatarAnalyser =
        avatarAudioContext
          .createAnalyser();


      avatarAnalyser.fftSize =
        512;


      avatarAnalyser
        .smoothingTimeConstant =
        0.25;


      avatarAudioSource.connect(
        avatarAnalyser
      );


      const samples =
        new Uint8Array(
          avatarAnalyser.fftSize
        );


      function analyse() {

        if (
          !avatarAnalyser ||
          !avatarAudioContext
        ) {
          return;
        }


        avatarAnalyser
          .getByteTimeDomainData(
            samples
          );


        let sumSquares = 0;


        for (
          let i = 0;
          i < samples.length;
          i++
        ) {

          const sample =
            (samples[i] - 128) /
            128;


          sumSquares +=
            sample * sample;
        }


        const rms =
          Math.sqrt(
            sumSquares /
            samples.length
          );


        let level =
          rms *
          CONFIG.rmsGain;


        if (
          level <
          CONFIG.rmsNoiseFloor
        ) {
          level = 0;
        }


        level =
          Math.max(
            0,
            Math.min(
              1,
              level
            )
          );


        window.SofiaAvatar
          ?.setAudioLevel(level);


        avatarAudioFrame =
          requestAnimationFrame(
            analyse
          );

      }


      analyse();


      console.log(
        "Sofia RMS Lip Sync aktiv."
      );

    }

    catch (error) {

      console.warn(
        "Avatar Audio Analyse:",
        error
      );

      stopAvatarAudioAnalysis();

    }

  }


  function stopAvatarAudioAnalysis() {

    if (avatarAudioFrame) {

      cancelAnimationFrame(
        avatarAudioFrame
      );

      avatarAudioFrame = null;
    }


    if (avatarAudioSource) {

      try {
        avatarAudioSource.disconnect();
      }
      catch {}

      avatarAudioSource = null;
    }


    if (avatarAnalyser) {

      try {
        avatarAnalyser.disconnect();
      }
      catch {}

      avatarAnalyser = null;
    }


    if (avatarAudioContext) {

      try {
        avatarAudioContext.close();
      }
      catch {}

      avatarAudioContext = null;
    }


    window.SofiaAvatar
      ?.setAudioLevel(0);

  }


  /* =====================================================
     MEMORY
  ===================================================== */

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


    memoryQueue =
      memoryQueue
        .then(
          () =>
            saveLiveMemory(
              cleanUser,
              cleanAssistant
            )
        )
        .catch(
          error => {

            console.error(
              "Live Memory Queue:",
              error
            );

          }
        );

  }


  async function saveLiveMemory(
    userText,
    assistantText
  ) {

    const response =
      await fetch(
        "/api/live-memory",
        {
          method: "POST",

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


    if (response.status === 401) {

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
      data.memoryAction
    );

  }


  function commitCurrentTurn() {

    const userText =
      pendingUserText.trim();


    const assistantText =
      pendingAssistantText.trim();


    if (!userText) {

      pendingAssistantText = "";

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


    pendingUserText = "";
    pendingAssistantText = "";

  }


  function mirrorTurnToLocalChat(
    userText,
    assistantText
  ) {

    try {

      const key =
        "sofia_memory";


      const raw =
        localStorage.getItem(key);


      let history = [];


      if (raw) {

        const parsed =
          JSON.parse(raw);


        if (Array.isArray(parsed)) {

          history =
            parsed.filter(
              item =>
                item &&
                ["user", "assistant"]
                  .includes(item.role) &&
                typeof item.content ===
                  "string"
            );

        }

      }


      history.push({
        role: "user",
        content: userText
      });


      if (assistantText) {

        history.push({
          role: "assistant",
          content: assistantText
        });

      }


      history =
        history.slice(-100);


      localStorage.setItem(
        key,
        JSON.stringify(history)
      );

    }

    catch (error) {

      console.warn(
        "Live Local Memory:",
        error
      );

    }

  }


  /* =====================================================
     ECHO GUARD
  ===================================================== */

  function isLikelySpeakerEcho() {

    const time =
      performance.now();


    /*
      Während Sofia gerade eine Antwort
      erzeugt bzw. spricht, behandeln wir
      sehr frühe speech_started-Ereignisse
      zunächst als wahrscheinliches Echo.
    */

    if (assistantResponding) {

      const sinceStart =
        time -
        assistantSpeechStartedAt;


      if (
        sinceStart >= 0 &&
        sinceStart <
          CONFIG.echoGuardMs
      ) {

        return true;

      }

    }


    /*
      Auch unmittelbar nach Sofias Ausgabe
      kann der Lautsprecher noch einen kurzen
      Echo-/Hall-Impuls erzeugen.
    */

    if (assistantSpeechEndedAt) {

      const sinceEnd =
        time -
        assistantSpeechEndedAt;


      if (
        sinceEnd >= 0 &&
        sinceEnd <
          CONFIG.afterSpeechGuardMs
      ) {

        return true;

      }

    }


    return false;

  }


  /* =====================================================
     START LIVE
  ===================================================== */

  async function startLive() {

    if (
      liveActive ||
      connecting
    ) {
      return;
    }


    connecting = true;

    pendingUserText = "";
    pendingAssistantText = "";

    assistantResponding = false;

    assistantSpeechStartedAt = 0;
    assistantSpeechEndedAt = 0;


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

      /* -------------------------------------
         EPHEMERAL TOKEN
      ------------------------------------- */

      const tokenResponse =
        await fetch(
          "/api/realtime",
          {
            method: "POST",
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


      /* -------------------------------------
         MICROPHONE
      ------------------------------------- */

      localStream =
        await navigator
          .mediaDevices
          .getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });


      if (
        "speechSynthesis"
        in window
      ) {
        speechSynthesis.cancel();
      }


      /* -------------------------------------
         WEBRTC
      ------------------------------------- */

      peerConnection =
        new RTCPeerConnection();


      remoteAudio =
        document.createElement(
          "audio"
        );


      remoteAudio.autoplay = true;
      remoteAudio.playsInline = true;


      peerConnection.ontrack =
        async event => {

          const stream =
            event.streams?.[0];


          if (!stream) {
            return;
          }


          remoteAudio.srcObject =
            stream;


          try {
            await remoteAudio.play();
          }
          catch (error) {

            console.warn(
              "Remote Audio:",
              error
            );

          }


          await startAvatarAudioAnalysis(
            stream
          );

        };


      for (
        const track
        of localStream.getTracks()
      ) {

        peerConnection.addTrack(
          track,
          localStream
        );

      }


      /* -------------------------------------
         DATA CHANNEL
      ------------------------------------- */

      dataChannel =
        peerConnection
          .createDataChannel(
            "oai-events"
          );


      dataChannel.addEventListener(
        "open",
        () => {

          /*
            Zusätzliche Realtime-Konfiguration.

            VAD bleibt aktiv.

            WICHTIG:
            Wir verändern hier bewusst noch
            nicht interrupt_response, weil
            echte Unterbrechungen weiterhin
            möglich bleiben sollen.
          */

          sendRealtimeEvent({
            type: "session.update",

            session: {
              type: "realtime",

              audio: {
                input: {

                  turn_detection: {
                    type: "server_vad",

                    threshold: 0.65,

                    prefix_padding_ms: 300,

                    silence_duration_ms: 650,

                    create_response: true,

                    interrupt_response: true
                  }

                }
              }
            }
          });


          liveActive = true;
          connecting = false;


          setLiveButtonState(
            "active"
          );


          setMode("Live");


          setThought(
            "Ich höre dir zu."
          );


          window.SofiaAvatar
            ?.idle();


          if (app) {
            app.dataset.live =
              "true";
          }

        }
      );


      dataChannel.addEventListener(
        "message",
        event => {

          try {

            handleRealtimeEvent(
              JSON.parse(
                event.data
              )
            );

          }

          catch (error) {

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


      peerConnection
        .addEventListener(
          "connectionstatechange",
          () => {

            const connectionState =
              peerConnection
                ?.connectionState;


            if (
              connectionState ===
                "failed" ||
              connectionState ===
                "closed"
            ) {

              stopLive(false);

            }

          }
        );


      /* -------------------------------------
         SDP
      ------------------------------------- */

      const offer =
        await peerConnection
          .createOffer();


      await peerConnection
        .setLocalDescription(
          offer
        );


      const sdpResponse =
        await fetch(
          "https://api.openai.com/v1/realtime/calls",
          {
            method: "POST",

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
        type: "answer",
        sdp:
          await sdpResponse.text()
      };


      await peerConnection
        .setRemoteDescription(
          answer
        );

    }

    catch (error) {

      console.error(
        "Sofia Live Fehler:",
        error
      );


      setThought(
        "Live Voice konnte gerade nicht gestartet werden."
      );


      window.SofiaAvatar
        ?.idle();


      stopLive(false);

    }

    finally {

      connecting = false;

    }

  }


  /* =====================================================
     REALTIME EVENTS
  ===================================================== */

  function handleRealtimeEvent(event) {

    switch (event.type) {


      /* -------------------------------------------------
         USER SPEECH START
      ------------------------------------------------- */

      case
        "input_audio_buffer.speech_started": {


        /*
          Wichtig:

          Das Event wird vom SERVER erzeugt.

          Wenn Sofia gerade erst angefangen hat zu
          sprechen, ist ein sofortiger speech_started
          sehr wahrscheinlich Lautsprecher-Echo.
        */

        if (isLikelySpeakerEcho()) {

          console.log(
            "Sofia Echo Guard: speech_started ignoriert."
          );

          return;
        }


        setMode(
          "hört zu…"
        );


        window.SofiaAvatar
          ?.listen();


        if (app) {
          app.dataset.speaking =
            "false";
        }


        break;
      }


      /* -------------------------------------------------
         USER SPEECH STOP
      ------------------------------------------------- */

      case
        "input_audio_buffer.speech_stopped": {


        /*
          Wenn Sofia selbst noch spricht, soll
          ein Echo-Stop nicht unsere Avatar-
          Darstellung auf thinking setzen.
        */

        if (
          assistantResponding &&
          isLikelySpeakerEcho()
        ) {

          return;
        }


        setMode(
          "denkt nach…"
        );


        window.SofiaAvatar
          ?.think();


        break;
      }


      /* -------------------------------------------------
         USER TRANSCRIPT
      ------------------------------------------------- */

      case
        "conversation.item.input_audio_transcription.completed": {


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

        }


        break;
      }


      /* -------------------------------------------------
         RESPONSE START
      ------------------------------------------------- */

      case
        "response.created": {


        assistantResponding =
          true;


        assistantSpeechStartedAt =
          performance.now();


        pendingAssistantText =
          "";


        setMode(
          "antwortet…"
        );


        window.SofiaAvatar
          ?.speak();


        break;
      }


      /* -------------------------------------------------
         AUDIO OUTPUT
      ------------------------------------------------- */

      case
        "response.output_audio.delta": {


        if (
          !assistantSpeechStartedAt
        ) {

          assistantSpeechStartedAt =
            performance.now();

        }


        assistantResponding =
          true;


        setMode(
          "spricht…"
        );


        window.SofiaAvatar
          ?.speak();


        if (app) {
          app.dataset.speaking =
            "true";
        }


        break;
      }


      /* -------------------------------------------------
         ASSISTANT TRANSCRIPT DELTA
      ------------------------------------------------- */

      case
        "response.output_audio_transcript.delta": {


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
      }


      /* -------------------------------------------------
         ASSISTANT TRANSCRIPT DONE
      ------------------------------------------------- */

      case
        "response.output_audio_transcript.done": {


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
      }


      /* -------------------------------------------------
         RESPONSE DONE
      ------------------------------------------------- */

      case
        "response.done": {


        assistantResponding =
          false;


        assistantSpeechEndedAt =
          performance.now();


        assistantSpeechStartedAt =
          0;


        if (app) {
          app.dataset.speaking =
            "false";
        }


        window.SofiaAvatar
          ?.setAudioLevel(0);


        setMode("Live");


        window.SofiaAvatar
          ?.idle();


        /*
          Eine abgebrochene Antwort nicht wie
          eine vollständig abgeschlossene Antwort
          behandeln.

          Realtime kann response.done auch für
          cancelled/incomplete Responses senden.
        */

        const status =
          event.response?.status;


        if (
          !status ||
          status === "completed"
        ) {

          commitCurrentTurn();

        }

        else {

          console.log(
            "Realtime Response beendet mit Status:",
            status
          );

        }


        break;
      }


      /* -------------------------------------------------
         ERROR
      ------------------------------------------------- */

      case "error": {


        console.error(
          "OpenAI Realtime:",
          event.error
        );


        window.SofiaAvatar
          ?.setAudioLevel(0);


        window.SofiaAvatar
          ?.idle();


        break;
      }

    }

  }


  /* =====================================================
     STOP LIVE
  ===================================================== */

  function stopLive(
    userInitiated = true
  ) {

    if (
      pendingUserText.trim()
    ) {

      commitCurrentTurn();

    }


    liveActive = false;
    connecting = false;

    assistantResponding = false;

    assistantSpeechStartedAt = 0;
    assistantSpeechEndedAt = 0;


    stopAvatarAudioAnalysis();


    if (dataChannel) {

      try {
        dataChannel.close();
      }
      catch {}

      dataChannel = null;
    }


    if (peerConnection) {

      try {
        peerConnection.close();
      }
      catch {}

      peerConnection = null;
    }


    if (localStream) {

      for (
        const track
        of localStream.getTracks()
      ) {
        track.stop();
      }

      localStream = null;
    }


    if (remoteAudio) {

      try {
        remoteAudio.pause();
      }
      catch {}


      remoteAudio.srcObject =
        null;

      remoteAudio = null;
    }


    if (app) {

      app.dataset.live =
        "false";

      app.dataset.speaking =
        "false";

    }


    window.SofiaAvatar
      ?.setAudioLevel(0);


    window.SofiaAvatar
      ?.idle();


    setLiveButtonState(
      "inactive"
    );


    setMode(
      "bereit"
    );


    if (userInitiated) {

      setThought(
        "Live-Modus beendet."
      );

    }

  }


  /* =====================================================
     BUTTON
  ===================================================== */

  liveButton.addEventListener(
    "click",
    () => {

      if (
        liveActive ||
        connecting
      ) {

        stopLive();

      }

      else {

        startLive();

      }

    }
  );


  /* =====================================================
     CLEANUP
  ===================================================== */

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


  console.log(
    "Sofia V4.3.3 Live Voice + Memory + RMS Lip Sync + Echo Guard geladen."
  );

})();
