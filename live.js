(() => {
  let peerConnection = null;
  let dataChannel = null;
  let localStream = null;
  let remoteAudio = null;

  let liveActive = false;
  let connecting = false;

  const app =
    document.querySelector('#app');

  const mode =
    document.querySelector('#mode');

  const thought =
    document.querySelector('#thought');

  const mic =
    document.querySelector('#mic');

  /* =========================
     LIVE BUTTON
  ========================= */

  const liveButton =
    document.createElement('button');

  liveButton.type = 'button';
  liveButton.id = 'liveVoiceButton';
  liveButton.textContent = '◉ LIVE';

  Object.assign(
    liveButton.style,
    {
      position: 'fixed',
      right: '18px',
      bottom: '92px',
      zIndex: '5000',

      border:
        '1px solid rgba(255,255,255,0.16)',

      borderRadius: '999px',

      padding: '11px 16px',

      background:
        'rgba(15,18,24,0.88)',

      backdropFilter:
        'blur(14px)',

      WebkitBackdropFilter:
        'blur(14px)',

      color: '#fff',

      fontSize: '12px',
      fontWeight: '700',
      letterSpacing: '0.08em',

      boxShadow:
        '0 8px 30px rgba(0,0,0,0.28)',

      cursor: 'pointer'
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
    if (state === 'connecting') {
      liveButton.textContent =
        '◌ VERBINDE…';

      liveButton.style.opacity =
        '0.7';

      return;
    }

    if (state === 'active') {
      liveButton.textContent =
        '● LIVE';

      liveButton.style.opacity =
        '1';

      liveButton.style.background =
        'rgba(110, 35, 45, 0.92)';

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
      mode.textContent = text;
    }
  }

  function setThought(text) {
    if (thought) {
      thought.textContent = text;
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
      /*
        1. Kurzlebiges Realtime-Token
        von unserem eigenen Backend holen.
      */

      const tokenResponse =
        await fetch(
          '/api/realtime',
          {
            method: 'POST',

            credentials:
              'same-origin',

            cache: 'no-store'
          }
        );

      if (
        tokenResponse.status === 401
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

      /*
        2. Mikrofon anfordern.
      */

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

      /*
        Browser-Sprachausgabe aus dem
        normalen Chat stoppen.
      */

      if (
        'speechSynthesis' in window
      ) {
        speechSynthesis.cancel();
      }

      /*
        3. WebRTC-Verbindung.
      */

      peerConnection =
        new RTCPeerConnection();

      /*
        Audio von Sofia.
      */

      remoteAudio =
        document.createElement(
          'audio'
        );

      remoteAudio.autoplay = true;
      remoteAudio.playsInline = true;

      peerConnection.ontrack =
        event => {
          remoteAudio.srcObject =
            event.streams[0];

          remoteAudio
            .play()
            .catch(() => {});
        };

      /*
        Unser Mikrofon an OpenAI senden.
      */

      for (
        const track
        of localStream.getTracks()
      ) {
        peerConnection.addTrack(
          track,
          localStream
        );
      }

      /*
        Realtime Events.
      */

      dataChannel =
        peerConnection
          .createDataChannel(
            'oai-events'
          );

      dataChannel.addEventListener(
        'open',
        () => {
          liveActive = true;
          connecting = false;

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

      /*
        4. SDP Offer erstellen.
      */

      const offer =
        await peerConnection
          .createOffer();

      await peerConnection
        .setLocalDescription(
          offer
        );

      /*
        5. Mit dem kurzlebigen Token
        direkt den WebRTC Call aufbauen.

        Der normale OPENAI_API_KEY
        ist NICHT im Browser.
      */

      const sdpResponse =
        await fetch(
          'https://api.openai.com/v1/realtime/calls',
          {
            method: 'POST',

            body: offer.sdp,

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
        type: 'answer',
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
      connecting = false;
    }
  }

  /* =========================
     REALTIME EVENTS
  ========================= */

  function handleRealtimeEvent(
    event
  ) {
    switch (event.type) {
      case 'input_audio_buffer.speech_started':

        setMode(
          'hört zu…'
        );

        if (app) {
          app.dataset.speaking =
            'false';
        }

        break;

      case 'input_audio_buffer.speech_stopped':

        setMode(
          'denkt nach…'
        );

        break;

      case 'response.created':

        setMode(
          'antwortet…'
        );

        break;

      case 'response.output_audio.delta':

        setMode(
          'spricht…'
        );

        if (app) {
          app.dataset.speaking =
            'true';
        }

        break;

      case 'response.output_audio_transcript.delta':

        if (
          typeof event.delta ===
          'string'
        ) {
          setThought(
            event.delta
          );
        }

        break;

      case 'response.output_audio_transcript.done':

        if (
          typeof event.transcript ===
          'string' &&
          event.transcript.trim()
        ) {
          setThought(
            event.transcript
          );
        }

        break;

      case 'response.done':

        if (app) {
          app.dataset.speaking =
            'false';
        }

        setMode(
          'Live'
        );

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
    liveActive = false;
    connecting = false;

    if (dataChannel) {
      try {
        dataChannel.close();
      } catch {}

      dataChannel = null;
    }

    if (peerConnection) {
      try {
        peerConnection.close();
      } catch {}

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
      } catch {}

      remoteAudio.srcObject =
        null;

      remoteAudio = null;
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

  /*
    Der bisherige einzelne Mikrofonbutton
    bleibt erhalten.

    LIVE ist bewusst ein separater Modus.
    Dadurch funktioniert V3.9 weiterhin,
    falls Realtime einmal nicht verfügbar ist.
  */

  console.log(
    'Sofia V4.0 Live Voice geladen.'
  );
})();
