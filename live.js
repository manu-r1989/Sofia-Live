/*
  Sofia V4.3.2
  Live Voice + Live Memory + Visual Avatar
  WebRTC Audio -> RMS -> Avatar Lip Sync
*/

(() => {
  "use strict";

  /* ========================================
     LIVE / WEBRTC STATE
  ======================================== */

  let peerConnection = null;
  let dataChannel = null;
  let localStream = null;
  let remoteAudio = null;

  let liveActive = false;
  let connecting = false;


  /* ========================================
     LIVE MEMORY STATE
  ======================================== */

  let pendingUserText = "";
  let pendingAssistantText = "";

  let memoryQueue =
    Promise.resolve();


  /* ========================================
     AVATAR AUDIO ANALYSIS
  ======================================== */

  let avatarAudioContext = null;
  let avatarAnalyser = null;
  let avatarAudioSource = null;
  let avatarAudioFrame = null;

  let avatarAudioStream = null;


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


  /* ========================================
     AVATAR AUDIO ANALYSIS
     WebRTC MediaStream -> RMS
  ======================================== */

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


      avatarAudioStream =
        mediaStream;


      avatarAudioContext =
        new AudioContextClass();


      /*
        Auf iPhone/Safari kann ein neuer
        AudioContext zunächst suspended sein.
      */

      if (
        avatarAudioContext.state ===
        "suspended"
      ) {

        try {

          await avatarAudioContext.resume();

        } catch (error) {

          console.warn(
            "AudioContext resume:",
            error
          );

        }

      }


      /*
        WICHTIG:

        Nicht mehr:
        createMediaElementSource(remoteAudio)

        Sondern direkt der empfangene
        WebRTC MediaStream.
      */

      avatarAudioSource =
        avatarAudioContext
          .createMediaStreamSource(
            mediaStream
          );


      avatarAnalyser =
        avatarAudioContext
          .createAnalyser();


      /*
        512 Samples reichen für eine
        schnelle Mundbewegung und belasten
        das iPhone kaum.
      */

      avatarAnalyser.fftSize =
        512;


      avatarAnalyser
        .smoothingTimeConstant =
          0.25;


      avatarAudioSource.connect(
        avatarAnalyser
      );


      /*
        Der Analyzer wird absichtlich NICHT
        mit audioContext.destination verbunden.

        Die hörbare Wiedergabe übernimmt
        weiterhin remoteAudio direkt.

        So analysieren wir nur das Signal und
        erzeugen keine doppelte Audiowiedergabe.
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


        /*
          RMS = Root Mean Square.

          128 entspricht bei Uint8
          ungefähr der Nulllinie.
        */

        let sumSquares = 0;


        for (
          let i = 0;
          i < samples.length;
          i++
        ) {

          const normalized =
            (
              samples[i] -
              128
            ) /
            128;


          sumSquares +=
            normalized *
            normalized;

        }


        const rms =
          Math.sqrt(
            sumSquares /
            samples.length
          );


        /*
          Sprache hat bei WebRTC häufig
          relativ kleine RMS-Werte.

          Verstärkung für die Avatar-
          Schwellenwerte in
          sofia-avatar.js.
        */

        let level =
          rms * 7.5;


        /*
          Sehr kleine Restwerte / digitales
          Rauschen auf echte Stille setzen.
        */

        if (
          level <
          0.018
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
          ?.setAudioLevel(
            level
          );


        avatarAudioFrame =
          requestAnimationFrame(
            analyse
          );

      }


      analyse();


      console.log(
        "Sofia Avatar Audioanalyse aktiv."
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

      }

      catch {}


      avatarAudioSource =
        null;

    }


    if (avatarAnalyser) {

      try {

        avatarAnalyser
          .disconnect();

      }

      catch {}


      avatarAnalyser =
        null;

    }


    if (avatarAudioContext) {

      try {

        avatarAudioContext
          .close();

      }

      catch {}


      avatarAudioContext =
        null;

    }


    avatarAudioStream =
      null;


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

    }

    catch (error) {

      console.warn(
        "Live Local Memory:",
        error
      );

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


      /*
        WEBRTC REMOTE TRACK

        Hier wird jetzt sowohl das Audio
        abgespielt als auch der MediaStream
        direkt an den Avatar-Analyzer gegeben.
      */

      peerConnection.ontrack =
        async event => {

          const stream =
            event.streams?.[0];


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


          /*
            Direkt den WebRTC Stream
            analysieren.
          */

          await startAvatarAudioAnalysis(
            stream
          );

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


      /* ====================================
         CONNECTION STATE
      ==================================== */

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


      /* ====================================
         USER HÖRT AUF
      ==================================== */

      case
        "input_audio_buffer.speech_stopped":


        setMode(
          "denkt nach…"
        );


        window.SofiaAvatar
          ?.think();


        break;


      /* ====================================
         USER TRANSKRIPT
      ==================================== */

      case
        "conversation.item.input_audio_transcription.completed":


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


      /* ====================================
         SOFIA BEGINNT ANTWORT
      ==================================== */

      case
        "response.created":


        pendingAssistantText =
          "";


        setMode(
          "antwortet…"
        );


        /*
          Noch nicht zwingend hörbares Audio,
          aber Avatar auf Speaking vorbereiten.
        */

        window.SofiaAvatar
          ?.speak();


        break;


      /* ====================================
         SOFIA AUDIO
      ==================================== */

      case
        "response.output_audio.delta":


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


      /* ====================================
         SOFIA TRANSKRIPT STREAM
      ==================================== */

      case
        "response.output_audio_transcript.delta":


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
         TURN FERTIG
      ==================================== */

      case
        "response.done":


        if (app) {

          app.dataset.speaking =
            "false";

        }


        /*
          Audiopegel sofort zurücksetzen.
        */

        window.SofiaAvatar
          ?.setAudioLevel(0);


        setMode(
          "Live"
        );


        window.SofiaAvatar
          ?.idle();


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


        window.SofiaAvatar
          ?.setAudioLevel(0);


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

    if (
      pendingUserText.trim()
    ) {

      commitCurrentTurn();

    }


    liveActive =
      false;


    connecting =
      false;


    /* AVATAR AUDIO */

    stopAvatarAudioAnalysis();


    /* DATA CHANNEL */

    if (dataChannel) {

      try {

        dataChannel.close();

      }

      catch {}


      dataChannel =
        null;

    }


    /* WEBRTC */

    if (peerConnection) {

      try {

        peerConnection.close();

      }

      catch {}


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

      }

      catch {}


      remoteAudio.srcObject =
        null;


      remoteAudio =
        null;

    }


    /* APP STATE */

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


  /* ========================================
     LIVE BUTTON
  ======================================== */

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


  console.log(
    "Sofia V4.3.2 Live Voice + Memory + RMS Lip Sync geladen."
  );

})();
