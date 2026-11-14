/* =====================================================
   SERVICECALL NATIVE WEBRTC PEER CONTROLLER

   Version 1: One-to-one audio calls

   Dependencies:
   - ServiceCallWebRTCConfig
   - ServiceCallMedia
   - ServiceCallSignaling

   Features:
   - Native WebRTC audio
   - ServiceNow signaling
   - Microphone management
   - ICE candidate queuing
   - Duplicate signal protection
   - Offer/answer retry handling
   - Session-safe cleanup
===================================================== */

(function () {
  "use strict";

  /* =====================================================
     STATE
  ===================================================== */

  let pc = null;
  let remoteAudio = null;

  let started = false;
  let sessionId = 0;

  let pendingCandidates = [];
  let pendingLocalCandidates = [];

  const processedSignalIds = new Set();

  let lastOfferSignalId = null;
  let lastAnswerDescription = null;

  let lastAnswerSignalId = null;

  let localSignalingReady = false;

  /* =====================================================
     CONFIGURATION
  ===================================================== */

  const config = window.ServiceCallWebRTCConfig || {
    iceServers: [],
    iceTransportPolicy: "all",
  };

  function log(...args) {
    console.log("[ServiceCall WebRTC]", ...args);
  }

  function getMedia() {
    if (!window.ServiceCallMedia) {
      throw new Error("ServiceCallMedia is unavailable.");
    }

    return window.ServiceCallMedia;
  }

  function getSignaling() {
    if (!window.ServiceCallSignaling) {
      throw new Error("ServiceCallSignaling is unavailable.");
    }

    return window.ServiceCallSignaling;
  }

  function isCurrentSession(id) {
    return started && id === sessionId;
  }

  /* =====================================================
     MICROPHONE
  ===================================================== */

  async function addMicrophone(connection, currentSession) {
    const media = getMedia();

    await media.initializeMicrophone();

    if (!isCurrentSession(currentSession)) {
      return;
    }

    const track = media.getLocalAudioTrack();

    if (!track || track.kind !== "audio") {
      throw new Error("Microphone audio track unavailable.");
    }

    const stream = new MediaStream([track]);

    connection.addTrack(track, stream);

    log("Microphone added to peer connection.");
  }

  /* =====================================================
     REMOTE ICE CANDIDATES
  ===================================================== */

  async function flushCandidates(connection, currentSession) {
    if (!isCurrentSession(currentSession) || !connection.remoteDescription) {
      return;
    }

    while (pendingCandidates.length > 0) {
      if (!isCurrentSession(currentSession)) {
        return;
      }

      const candidate = pendingCandidates[0];

      await connection.addIceCandidate(candidate);

      pendingCandidates.shift();
    }

    log("Pending remote ICE candidates applied.");
  }

  /* =====================================================
     LOCAL ICE CANDIDATES
  ===================================================== */

  async function sendLocalCandidate(candidate, currentSession) {
    if (!isCurrentSession(currentSession)) {
      return;
    }

    if (!localSignalingReady) {
      pendingLocalCandidates.push(candidate);
      return;
    }

    try {
      await getSignaling().sendIceCandidate(candidate);

      log("Local ICE candidate sent.");
    } catch (error) {
      console.error("[ServiceCall WebRTC] ICE send failed:", error);

      // Keep candidate for a later retry.
      if (isCurrentSession(currentSession)) {
        pendingLocalCandidates.push(candidate);
      }
    }
  }

  async function flushLocalCandidates(currentSession) {
    if (!isCurrentSession(currentSession) || !localSignalingReady) {
      return;
    }

    const candidates = pendingLocalCandidates.splice(0);

    for (let index = 0; index < candidates.length; index++) {
      if (!isCurrentSession(currentSession)) {
        return;
      }

      const candidate = candidates[index];

      try {
        await getSignaling().sendIceCandidate(candidate);
      } catch (error) {
        console.error("[ServiceCall WebRTC] Queued ICE send failed:", error);

        pendingLocalCandidates.unshift(...candidates.slice(index));

        return;
      }
    }
  }

  /* =====================================================
     HANDLE INCOMING SIGNALS
  ===================================================== */

  async function handleSignal(signal) {
    if (!pc || !started) {
      throw new Error("WebRTC peer connection is not ready.");
    }

    const currentSession = sessionId;
    const connection = pc;

    const { id, type, payload } = signal;

    if (!id || !type || !payload) {
      throw new Error("Invalid WebRTC signal.");
    }

    /* -----------------------------------------
       DUPLICATE SIGNAL
    ----------------------------------------- */

    if (processedSignalIds.has(id)) {
      log("Duplicate signal ignored:", id);
      return;
    }

    /* -----------------------------------------
       REMOTE ICE CANDIDATE
    ----------------------------------------- */

    if (type === "ice candidate") {
      if (!connection.remoteDescription) {
        pendingCandidates.push(payload);

        log("Remote ICE candidate queued.");
      } else {
        await connection.addIceCandidate(payload);

        log("Remote ICE candidate applied.");
      }

      if (!isCurrentSession(currentSession)) {
        return;
      }

      processedSignalIds.add(id);
      return;
    }

    /* -----------------------------------------
       SDP OFFER
    ----------------------------------------- */

    if (type === "offer") {
      /*
       * The previous answer may have been
       * generated but its transmission failed.
       *
       * Retry sending the saved answer.
       */
      if (id === lastOfferSignalId && lastAnswerDescription) {
        await getSignaling().sendAnswer(lastAnswerDescription);

        if (!isCurrentSession(currentSession)) {
          return;
        }

        processedSignalIds.add(id);

        log("Previous SDP answer resent.");
        return;
      }

      if (connection.signalingState !== "stable") {
        throw new Error(
          "Unexpected offer in state: " + connection.signalingState,
        );
      }

      await connection.setRemoteDescription(new RTCSessionDescription(payload));

      if (!isCurrentSession(currentSession)) {
        return;
      }

      await flushCandidates(connection, currentSession);

      const answer = await connection.createAnswer();

      if (!isCurrentSession(currentSession)) {
        return;
      }

      await connection.setLocalDescription(answer);

      if (!isCurrentSession(currentSession)) {
        return;
      }

      lastOfferSignalId = id;
      lastAnswerDescription = connection.localDescription.toJSON();

      await getSignaling().sendAnswer(lastAnswerDescription);

      if (!isCurrentSession(currentSession)) {
        return;
      }

      processedSignalIds.add(id);

      log("SDP answer sent.");

      await flushLocalCandidates(currentSession);
      return;
    }

    /* -----------------------------------------
       SDP ANSWER
    ----------------------------------------- */

    if (type === "answer") {
      /*
       * A duplicate answer can be returned
       * if acknowledgment previously failed.
       */
      if (id === lastAnswerSignalId) {
        processedSignalIds.add(id);
        return;
      }

      /*
       * The remote description may already
       * be applied from an earlier answer.
       */
      if (
        connection.signalingState === "stable" &&
        connection.remoteDescription &&
        connection.remoteDescription.type === "answer"
      ) {
        lastAnswerSignalId = id;
        processedSignalIds.add(id);

        log("Duplicate SDP answer ignored.");
        return;
      }

      if (connection.signalingState !== "have-local-offer") {
        throw new Error(
          "Unexpected answer in state: " + connection.signalingState,
        );
      }

      await connection.setRemoteDescription(new RTCSessionDescription(payload));

      if (!isCurrentSession(currentSession)) {
        return;
      }

      await flushCandidates(connection, currentSession);

      lastAnswerSignalId = id;
      processedSignalIds.add(id);

      log("Remote SDP answer applied.");

      await flushLocalCandidates(currentSession);
      return;
    }

    throw new Error("Unsupported WebRTC signal type: " + type);
  }

  /* =====================================================
     START PEER CONNECTION
  ===================================================== */

  async function start(options) {
    if (started) {
      throw new Error("WebRTC peer is already running.");
    }

    if (
      !options ||
      !options.callId ||
      !options.remoteUserId ||
      typeof options.isCaller !== "boolean"
    ) {
      throw new Error("Incomplete WebRTC call options.");
    }

    const signaling = getSignaling();

    started = true;

    const currentSession = ++sessionId;

    pendingCandidates = [];
    pendingLocalCandidates = [];

    processedSignalIds.clear();

    lastOfferSignalId = null;
    lastAnswerDescription = null;
    lastAnswerSignalId = null;

    localSignalingReady = false;

    try {
      const connection = new RTCPeerConnection(config);

      pc = connection;

      /* -----------------------------------------
         REMOTE AUDIO ELEMENT
      ----------------------------------------- */

      const audio = document.createElement("audio");

      audio.autoplay = true;
      audio.playsInline = true;
      audio.style.display = "none";

      document.body.appendChild(audio);

      remoteAudio = audio;

      /* -----------------------------------------
         REMOTE AUDIO TRACK
      ----------------------------------------- */

      connection.ontrack = (event) => {
        if (!isCurrentSession(currentSession)) {
          return;
        }

        audio.srcObject = event.streams[0] || new MediaStream([event.track]);

        audio.play().catch((error) => {
          console.warn("[ServiceCall WebRTC] Remote audio playback:", error);
        });

        log("Remote audio track received.");
      };

      /* -----------------------------------------
         LOCAL ICE CANDIDATES
      ----------------------------------------- */

      connection.onicecandidate = (event) => {
        if (!isCurrentSession(currentSession)) {
          return;
        }

        if (!event.candidate) {
          return;
        }

        const candidate = event.candidate.toJSON();

        sendLocalCandidate(candidate, currentSession).catch(console.error);
      };

      /* -----------------------------------------
         CONNECTION STATE
      ----------------------------------------- */

      connection.onconnectionstatechange = () => {
        if (!isCurrentSession(currentSession)) {
          return;
        }

        log("Connection state:", connection.connectionState);

        if (typeof options.onStateChange === "function") {
          options.onStateChange(connection.connectionState);
        }
      };

      /* -----------------------------------------
         ADD MICROPHONE
      ----------------------------------------- */

      await addMicrophone(connection, currentSession);

      if (!isCurrentSession(currentSession)) {
        return;
      }

      /* -----------------------------------------
         START SERVICENOW SIGNALING
      ----------------------------------------- */

      await signaling.start({
        callId: options.callId,
        receiverId: options.remoteUserId,
        peerConnection: connection,

        onSignal: handleSignal,

        onError: (error) => {
          console.error("[ServiceCall WebRTC Signal Error]", error);
        },
      });

      if (!isCurrentSession(currentSession)) {
        return;
      }

      localSignalingReady = true;

      log("ServiceNow signaling started.");

      /* -----------------------------------------
         CALLER CREATES OFFER
      ----------------------------------------- */

      if (options.isCaller) {
        const offer = await connection.createOffer();

        if (!isCurrentSession(currentSession)) {
          return;
        }

        await connection.setLocalDescription(offer);

        if (!isCurrentSession(currentSession)) {
          return;
        }

        await signaling.sendOffer(connection.localDescription.toJSON());

        log("SDP offer sent.");
      }

      await flushLocalCandidates(currentSession);

      log("Native WebRTC peer started.");
    } catch (error) {
      if (currentSession === sessionId) {
        stop();
      }

      throw error;
    }
  }

  /* =====================================================
     MUTE / UNMUTE
  ===================================================== */

  async function setMuted(muted) {
    if (!started) {
      throw new Error("WebRTC call is not active.");
    }

    await getMedia().setMuted(Boolean(muted));

    log(Boolean(muted) ? "Microphone muted." : "Microphone unmuted.");
  }

  /* =====================================================
     STOP / CLEANUP
  ===================================================== */

  function stop() {
    ++sessionId;

    started = false;
    localSignalingReady = false;

    try {
      if (window.ServiceCallSignaling) {
        window.ServiceCallSignaling.stop();
      }
    } catch (error) {
      console.error("[ServiceCall WebRTC] Signaling cleanup:", error);
    }

    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;

      try {
        pc.close();
      } catch (error) {
        console.error("[ServiceCall WebRTC] Peer cleanup:", error);
      }

      pc = null;
    }

    if (remoteAudio) {
      remoteAudio.pause();
      remoteAudio.srcObject = null;
      remoteAudio.remove();
      remoteAudio = null;
    }

    if (window.ServiceCallMedia) {
      try {
        window.ServiceCallMedia.stopMicrophone();
      } catch (error) {
        console.error("[ServiceCall WebRTC] Microphone cleanup:", error);
      }
    }

    pendingCandidates = [];
    pendingLocalCandidates = [];

    processedSignalIds.clear();

    lastOfferSignalId = null;
    lastAnswerDescription = null;
    lastAnswerSignalId = null;

    log("Native WebRTC peer stopped.");
  }

  /* =====================================================
     STATUS
  ===================================================== */

  function isRunning() {
    return started;
  }

  /* =====================================================
     PUBLIC API
  ===================================================== */

  window.ServiceCallPeer = Object.freeze({
    start,
    stop,
    setMuted,
    isRunning,
  });
})();
