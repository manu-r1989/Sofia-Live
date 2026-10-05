/*
  Sofia V4.3.4

  Live Voice
  Live Memory
  Visual Avatar
  RMS Lip Sync
  Stable Turn Taking

  WICHTIG:
  Die eigentliche VAD-Konfiguration wird bereits
  serverseitig in /api/realtime.js gesetzt.

  interrupt_response = false
*/


(() => {
  "use strict";


  /* =====================================================
     CONFIG
  ===================================================== */

  const CONFIG = {
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


  /* =====================================================
     MEMORY STATE
  ===================================================== */

  let pendingUserText = "";
  let pendingAssistantText = "";

  let memoryQueue =
    Promise.resolve();


  /* =====================================================
     AVATAR AUDIO
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


  liveButton.type =
    "button";

  liveButton.id =
    "liveVoiceButton";

  liveButton.textContent =
    "◉ LIVE";


  Object.assign(
    liveButton.style,
    {
      position:
        "fixed",

      right:
        "18px",

      bottom:
        "92px",

      zIndex:
        "5000",

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


  /* =====================================================
     UI
  ===================================================== */

  function setLiveButtonState(
    state
  ) {

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
      mode.textContent = text;
    }

  }


  function setThought(text) {

    if (thought) {
      thought.textContent = text;
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

        } catch (error) {

          console.warn(
            "AudioContext konnte nicht fortgesetzt werden:",
            error
          );

        }

      }


      /*
        Direkte Analyse des empfangenen
        WebRTC MediaStreams.
      */

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


      /*
        Kein connect(destination).

        Die Audio-Wiedergabe übernimmt
        remoteAudio selbst.
      */


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
            (
              samples[i] -
              128
            ) /
            128;


          sumSquares +=
            sample *
            sample;

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


        /*
          Nur während Sofia tatsächlich
          eine Response erzeugt, wird der
          Mundpegel verwendet.

          Dadurch können Restgeräusche nach
          einer Antwort keine Mundbewegung
          verursachen.
        */

        if (assistantResponding) {

          window.SofiaAvatar
            ?.setAudioLevel(
              level
            );

        } else {

          window.SofiaAvatar
            ?.setAudioLevel(0);

        }


        avatarAudioFrame =
          requestAnimationFrame(
            analyse
          );

      }


      analyse();


      console.log(
        "Sofia V4.3.4 RMS Lip Sync aktiv."
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

      avatarAudioFrame =
        null;

    }


    if (avatarAudioSource) {

      try {

        avatarAudioSource.disconnect();

      } catch {}


      avatarAudioSource =
        null;

    }


    if (avatarAnalyser) {

      try {

        avatarAnalyser.disconnect();

      } catch {}


      avatarAnalyser =
        null;

    }


    if (avatarAudioContext) {

      try {

        avatarAudioContext.close();

      } catch {}


      avatarAudioContext =
        null;

    }


    window.SofiaAvatar
      ?.setAudioLevel(0);

  }


  /* =====================================================
     MEMORY QUEUE
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


  /* =====================================================
     SAVE MEMORY
  ===================================================== */

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
      data.memoryAction
    );

  }


  /* =====================================================
     COMMIT TURN
  ===================================================== */

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


  /* =====================================================
     LOCAL HISTORY
  ===================================================== */

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

    }

    catch (error) {

      console.warn(
        "Live Local Memory:",
        error
      );

    }

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


    connecting =
      true;


    assistantResponding =
      false;


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

      /* -------------------------------------
         TOKEN
      ------------------------------------- */

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


      /* -------------------------------------
         MICROPHONE
      ------------------------------------- */

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


      /* -------------------------------------
         REMOTE AUDIO
      ------------------------------------- */

      remoteAudio =
        document.createElement(
          "audio"
        );


      remoteAudio.autoplay =
        true;


      remoteAudio.playsInline =
        true;


      peerConnection.ontrack =
        async event => {

          const stream =
            event.streams?.[0] ||
            (
              event.track
                ? new MediaStream([
                    event.track
                  ])
                : null
            );


          if (!stream) {

            console.warn(
              "Kein Remote MediaStream erhalten."
            );

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


      /* -------------------------------------
         MICROPHONE TRACKS
      ------------------------------------- */

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

          liveActive =
            true;


          connecting =
            false;


          setLiveButtonState(
            "active"
          );


          setMode(
            "Live"
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


          /*
            WICHTIG:

            KEIN session.update mit
            interrupt_response:true mehr.

            Die VAD-Konfiguration kommt
            bereits aus api/realtime.js.
          */


          console.log(
            "Sofia V4.3.4 Realtime verbunden."
          );

        }
      );


      /* -------------------------------------
         EVENTS
      ------------------------------------- */

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


      /* -------------------------------------
         CONNECTION
      ------------------------------------- */

      peerConnection
        .addEventListener(
          "connectionstatechange",
          () => {

            const state =
              peerConnection
                ?.connectionState;


            if (
              state === "failed" ||
              state === "closed"
            ) {

              stopLive(false);

            }

          }
        );


      /* -------------------------------------
         SDP OFFER
      ------------------------------------- */

      const offer =
        await peerConnection
          .createOffer();


      await peerConnection
        .setLocalDescription(
          offer
        );


      /* -------------------------------------
         REALTIME CALL
      ------------------------------------- */

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

    }

    catch (error) {

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

    }

    finally {

      connecting =
        false;

    }

  }


  /* =====================================================
     REALTIME EVENTS
  ===================================================== */

  function handleRealtimeEvent(
    event
  ) {

    switch (event.type) {


      /* -------------------------------------
         USER SPEECH START
      ------------------------------------- */

      case
        "input_audio_buffer.speech_started": {


        /*
          interrupt_response:false bedeutet:

          Dieses Event darf auftreten,
          während Sofia spricht.

          Es beendet ihre laufende Response
          aber nicht mehr automatisch.
        */


        if (!assistantResponding) {

          setMode(
            "hört zu…"
          );


          window.SofiaAvatar
            ?.listen();

        }


        break;
      }


      /* -------------------------------------
         USER SPEECH STOP
      ------------------------------------- */

      case
        "input_audio_buffer.speech_stopped": {


        /*
          Während Sofia noch spricht,
          verändern wir ihren Avatarzustand
          nicht aufgrund eines möglichen
          Lautsprecher-Echos.
        */


        if (!assistantResponding) {

          setMode(
            "denkt nach…"
          );


          window.SofiaAvatar
            ?.think();

        }


        break;
      }


      /* -------------------------------------
         USER TRANSCRIPT
      ------------------------------------- */

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


      /* -------------------------------------
         RESPONSE CREATED
      ------------------------------------- */

      case
        "response.created": {


        assistantResponding =
          true;


        pendingAssistantText =
          "";


        setMode(
          "antwortet…"
        );


        window.SofiaAvatar
          ?.speak();


        break;
      }


      /* -------------------------------------
         AUDIO OUTPUT
      ------------------------------------- */

      case
        "response.output_audio.delta": {


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


      /* -------------------------------------
         TRANSCRIPT DELTA
      ------------------------------------- */

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


      /* -------------------------------------
         TRANSCRIPT DONE
      ------------------------------------- */

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


      /* -------------------------------------
         RESPONSE DONE
      ------------------------------------- */

      case
        "response.done": {


        assistantResponding =
          false;


        if (app) {

          app.dataset.speaking =
            "false";

        }


        window.SofiaAvatar
          ?.setAudioLevel(0);


        window.SofiaAvatar
          ?.idle();


        setMode(
          "Live"
        );


        const status =
          event.response?.status;


        /*
          Nur vollständige Antworten werden
          als normaler Gesprächszug gespeichert.
        */

        if (
          !status ||
          status === "completed"
        ) {

          commitCurrentTurn();

        }

        else {

          console.log(
            "Realtime Response Status:",
            status
          );

        }


        break;
      }


      /* -------------------------------------
         ERROR
      ------------------------------------- */

      case
        "error": {


        console.error(
          "OpenAI Realtime:",
          event.error
        );


        setThought(
          event?.error?.message ||
          "Live Voice hat einen Fehler gemeldet."
        );


        assistantResponding =
          false;


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


    liveActive =
      false;


    connecting =
      false;


    assistantResponding =
      false;


    /* AVATAR */

    stopAvatarAudioAnalysis();


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


    /* UI */

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
     PAGE CLEANUP
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
    "Sofia V4.3.4 Live Voice + Memory + Stable Turn Taking geladen."
  );

})();
