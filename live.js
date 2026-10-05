(() => {
  let peerConnection = null;
  let dataChannel = null;
  let localStream = null;
  let remoteAudio = null;

  let liveActive = false;
  let connecting = false;

  /*
    Temporäre Transkripte für
    den aktuellen Redezug.
  */

  let pendingUserText = "";
  let pendingAssistantText = "";

  /*
    Verhindert, dass mehrere Memory-
    Requests gleichzeitig durcheinanderlaufen.
  */

  let memoryQueue =
    Promise.resolve();

  const app =
    document.querySelector('#app');

  const mode =
    document.querySelector('#mode');

  const thought =
    document.querySelector('#thought');


  /* =========================
     LIVE BUTTON
  ========================= */

  const liveButton =
    document.createElement('button');

  liveButton.type =
    'button';

  liveButton.id =
    'liveVoiceButton';

  liveButton.textContent =
    '◉ LIVE';

  Object.assign(
    liveButton.style,
    {
      position: 'fixed',
      right: '18px',
      bottom: '92px',
      zIndex: '5000',

      border:
        '1px solid rgba(255,255,255,0.16)',

      borderRadius:
        '999px',

      padding:
        '11px 16px',

      background:
        'rgba(15,18,24,0.88)',

      backdropFilter:
        'blur(14px)',

      WebkitBackdropFilter:
        'blur(14px)',

      color:
        '#fff',

      fontSize:
        '12px',

      fontWeight:
        '700',

      letterSpacing:
        '0.08em',

      boxShadow:
        '0 8px 30px rgba(0,0,0,0.28)',

      cursor:
        'pointer'
    }
  );

  document.body.appendChild(
    liveButton
  );


  /* =========================
     HELPERS
  ========================= */

  function setLiveButtonState(
    state
  ) {
    if (
      state ===
      'connecting'
    ) {
      liveButton.textContent =
        '◌ VERBINDE…';

      liveButton.style.opacity =
        '0.7';

      return;
    }

    if (
      state ===
      'active'
    ) {
      liveButton.textContent =
        '● LIVE';

      liveButton.style.opacity =
        '1';

      liveButton.style.background =
        'rgba(110,35,45,0.92)';

      return;
    }

    liveButton.textContent =
      '◉ LIVE';

    liveButton.style.opacity =
      '1';

    liveButton.style.background =
      'rgba(15,18,24,0.88)';
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


  /* =========================
     LIVE MEMORY
  ========================= */

  function queueLiveMemory(
    userText,
    assistantText
  ) {
    const cleanUser =
      String(
        userText || ''
      ).trim();

    const cleanAssistant =
      String(
        assistantText || ''
      ).trim();

    if (!cleanUser) {
      return;
    }

    /*
      Queue statt paralleler Requests.

      Dadurch bleibt die Reihenfolge
      des Gesprächs in Redis erhalten.
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
            'Live Memory Queue:',
            error
          );
        });
  }


  async function saveLiveMemory(
    userText,
    assistantText
  ) {
    const response =
      await fetch(
        '/api/live-memory',
        {
          method:
            'POST',

          credentials:
            'same-origin',

          cache:
            'no-store',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
              userText,
              assistantText
            })
        }
      );

    if (
      response.status === 401
    ) {
      window.location.reload();
      return;
    }

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        'Live Memory fehlgeschlagen.'
      );
    }

    console.log(
      'Sofia Live Memory:',
      data.memoryAction,
      `(${data.longTermMemories} Memories)`
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

    /*
      Optional auch in den lokalen
      Chat-Speicher spiegeln.

      app.js verwendet dafür
      localStorage "sofia_memory".
    */

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
        'sofia_memory';

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
                ['user', 'assistant']
                  .includes(item.role) &&
                typeof item.content ===
                  'string'
            );
        }
      }

      history.push({
        role: 'user',
        content: userText
      });

      if (assistantText) {
        history.push({
          role: 'assistant',
          content: assistantText
        });
      }

      history =
        history.slice(-100);

      localStorage.setItem(
        key,
        JSON.stringify(history)
      );

    } catch (error) {
      console.warn(
        'Live Local Memory:',
        error
      );
    }
  }


  /* =========================
     START LIVE
  ========================= */

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

    setLiveButtonState(
      'connecting'
    );

    setMode(
      'Live wird gestartet…'
    );

    setThought(
      'Einen Moment…'
    );

    try {
      const tokenResponse =
        await fetch(
          '/api/realtime',
          {
            method:
              'POST',

            credentials:
              'same-origin',

            cache:
              'no-store'
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
          'Realtime-Token fehlt.'
        );
      }

      const ephemeralKey =
        tokenData.value;

      if (!ephemeralKey) {
        throw new Error(
          'Kein Realtime-Token erhalten.'
        );
      }


      /* MICROPHONE */

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
        'speechSynthesis'
        in window
      ) {
        speechSynthesis.cancel();
      }


      /* WEBRTC */

      peerConnection =
        new RTCPeerConnection();


      /* SOFIA AUDIO */

      remoteAudio =
        document.createElement(
          'audio'
        );

      remoteAudio.autoplay =
        true;

      remoteAudio.playsInline =
        true;

      peerConnection.ontrack =
        event => {
          remoteAudio.srcObject =
            event.streams[0];

          remoteAudio
            .play()
            .catch(() => {});
        };


      /* USER AUDIO */

      for (
        const track
        of localStream.getTracks()
      ) {
        peerConnection.addTrack(
          track,
          localStream
        );
      }


      /* DATA CHANNEL */

      dataChannel =
        peerConnection
          .createDataChannel(
            'oai-events'
          );


      dataChannel.addEventListener(
        'open',
        () => {
          liveActive =
            true;

          connecting =
            false;

          setLiveButtonState(
            'active'
          );

          setMode(
            'Live'
          );

          setThought(
            'Ich höre dir zu.'
          );

          if (app) {
            app.dataset.live =
              'true';
          }
        }
      );


      dataChannel.addEventListener(
        'message',
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
              'Realtime Event:',
              error
            );
          }
        }
      );


      dataChannel.addEventListener(
        'close',
        () => {
          if (liveActive) {
            stopLive(false);
          }
        }
      );


      peerConnection
        .addEventListener(
          'connectionstatechange',
          () => {
            const state =
              peerConnection
                ?.connectionState;

            if (
              state === 'failed' ||
              state === 'closed'
            ) {
              stopLive(false);
            }
          }
        );


      /* SDP */

      const offer =
        await peerConnection
          .createOffer();

      await peerConnection
        .setLocalDescription(
          offer
        );


      const sdpResponse =
        await fetch(
          'https://api.openai.com/v1/realtime/calls',
          {
            method:
              'POST',

            body:
              offer.sdp,

            headers: {
              Authorization:
                `Bearer ${ephemeralKey}`,

              'Content-Type':
                'application/sdp'
            }
          }
        );


      if (!sdpResponse.ok) {
        const errorText =
          await sdpResponse.text();

        throw new Error(
          errorText ||
          'WebRTC-Verbindung fehlgeschlagen.'
        );
      }


      const answer = {
        type:
          'answer',

        sdp:
          await sdpResponse.text()
      };


      await peerConnection
        .setRemoteDescription(
          answer
        );

    } catch (error) {
      console.error(
        'Sofia Live Fehler:',
        error
      );

      setThought(
        'Live Voice konnte gerade nicht gestartet werden.'
      );

      setMode(
        'bereit'
      );

      stopLive(false);

    } finally {
      connecting =
        false;
    }
  }


  /* =========================
     REALTIME EVENTS
  ========================= */

  function handleRealtimeEvent(
    event
  ) {
    switch (event.type) {

      /*
        USER BEGINNT ZU REDEN
      */

      case
        'input_audio_buffer.speech_started':

        setMode(
          'hört zu…'
        );

        if (app) {
          app.dataset.speaking =
            'false';
        }

        break;


      /*
        USER HÖRT AUF
      */

      case
        'input_audio_buffer.speech_stopped':

        setMode(
          'denkt nach…'
        );

        break;


      /*
        FERTIGES USER-TRANSKRIPT
      */

      case
        'conversation.item.input_audio_transcription.completed':

        if (
          typeof event.transcript ===
            'string' &&
          event.transcript.trim()
        ) {
          pendingUserText =
            event.transcript.trim();

          console.log(
            'Live User:',
            pendingUserText
          );
        }

        break;


      /*
        SOFIA BEGINNT ANTWORT
      */

      case
        'response.created':

        pendingAssistantText =
          '';

        setMode(
          'antwortet…'
        );

        break;


      /*
        SOFIA AUDIO
      */

      case
        'response.output_audio.delta':

        setMode(
          'spricht…'
        );

        if (app) {
          app.dataset.speaking =
            'true';
        }

        break;


      /*
        SOFIA TRANSKRIPT STREAM
      */

      case
        'response.output_audio_transcript.delta':

        if (
          typeof event.delta ===
          'string'
        ) {
          pendingAssistantText +=
            event.delta;

          setThought(
            pendingAssistantText
          );
        }

        break;


      /*
        SOFIA TRANSKRIPT FERTIG
      */

      case
        'response.output_audio_transcript.done':

        if (
          typeof event.transcript ===
            'string' &&
          event.transcript.trim()
        ) {
          pendingAssistantText =
            event.transcript.trim();

          setThought(
            pendingAssistantText
          );
        }

        break;


      /*
        KOMPLETTER REDEZUG FERTIG
      */

      case
        'response.done':

        if (app) {
          app.dataset.speaking =
            'false';
        }

        setMode(
          'Live'
        );

        /*
          Jetzt ist das Paar
          User -> Sofia vollständig.
        */

        commitCurrentTurn();

        break;


      case 'error':

        console.error(
          'OpenAI Realtime:',
          event.error
        );

        setThought(
          event?.error?.message ||
          'Live Voice hat einen Fehler gemeldet.'
        );

        break;
    }
  }


  /* =========================
     STOP LIVE
  ========================= */

  function stopLive(
    userInitiated = true
  ) {
    /*
      Falls beim Beenden noch ein
      vollständiger User-Text vorliegt,
      nicht verlieren.
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


    if (dataChannel) {
      try {
        dataChannel.close();
      } catch {}

      dataChannel =
        null;
    }


    if (peerConnection) {
      try {
        peerConnection.close();
      } catch {}

      peerConnection =
        null;
    }


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


    if (remoteAudio) {
      try {
        remoteAudio.pause();
      } catch {}

      remoteAudio.srcObject =
        null;

      remoteAudio =
        null;
    }


    if (app) {
      app.dataset.live =
        'false';

      app.dataset.speaking =
        'false';
    }


    setLiveButtonState(
      'inactive'
    );

    setMode(
      'bereit'
    );


    if (userInitiated) {
      setThought(
        'Live-Modus beendet.'
      );
    }
  }


  /* =========================
     BUTTON
  ========================= */

  liveButton.addEventListener(
    'click',
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


  console.log(
    'Sofia V4.1 Live Memory geladen.'
  );
})();
