/* =====================================================
   SERVICECALL NATIVE WEBRTC SIGNALING
   Transport: ServiceNow Scripted REST API
   Supports: offer, answer, ICE candidate
===================================================== */

(function () {
  "use strict";

  const POLL_INTERVAL_MS = 1000;

  let running = false;
  let polling = false;
  let pollTimer = null;

  let callId = null;
  let receiverId = null;
  let peerConnection = null;

  let onSignal = null;
  let onError = null;

  const inFlight = new Set();

  function validateId(value) {
    return typeof value === "string" && /^[a-f0-9]{32}$/i.test(value);
  }

  function getBridge() {
    const bridge = window.serviceCall;

    if (
      !bridge ||
      typeof bridge.sendWebRTCSignal !== "function" ||
      typeof bridge.getWebRTCSignals !== "function" ||
      typeof bridge.ackWebRTCSignal !== "function"
    ) {
      throw new Error("ServiceCall WebRTC IPC bridge is unavailable.");
    }

    return bridge;
  }

  function reportError(error) {
    console.error("[ServiceCall WebRTC Signaling]", error);

    if (typeof onError === "function") {
      try {
        onError(error);
      } catch (callbackError) {
        console.error(callbackError);
      }
    }
  }

  async function send(type, payload) {
    if (!running) {
      throw new Error("Signaling is not running.");
    }

    if (!["offer", "answer", "ice candidate"].includes(type)) {
      throw new Error("Unsupported signal type.");
    }

    return getBridge().sendWebRTCSignal({
      call_id: callId,
      receiver_id: receiverId,
      signal_type: type,
      payload: JSON.stringify(payload),
    });
  }

  async function sendOffer(description) {
    return send("offer", {
      type: description.type,
      sdp: description.sdp,
    });
  }

  async function sendAnswer(description) {
    return send("answer", {
      type: description.type,
      sdp: description.sdp,
    });
  }

  async function sendIceCandidate(candidate) {
    if (!candidate) return;

    const data =
      typeof candidate.toJSON === "function" ? candidate.toJSON() : candidate;

    return send("ice candidate", data);
  }

  async function poll() {
    if (!running || polling) return;

    polling = true;

    try {
      const bridge = getBridge();
      const result = await bridge.getWebRTCSignals(callId);

      if (!running) return;

      if (!result || result.success !== true) {
        throw new Error("Unable to retrieve WebRTC signals.");
      }

      const signals = Array.isArray(result.signals) ? result.signals : [];

      for (const signal of signals) {
        if (!running) break;

        if (!signal || !validateId(signal.id)) {
          continue;
        }

        if (signal.sender_id !== receiverId) {
          continue;
        }

        if (inFlight.has(signal.id)) {
          continue;
        }

        inFlight.add(signal.id);

        try {
          const payload = JSON.parse(signal.payload);

          if (typeof onSignal !== "function") {
            throw new Error("No WebRTC signal handler configured.");
          }

          /*
           * The call controller must finish applying
           * the signal before we acknowledge it.
           */
          await onSignal({
            id: signal.id,
            type: signal.signal_type,
            payload,
            senderId: signal.sender_id,
          });

          await bridge.ackWebRTCSignal(signal.id);
        } catch (error) {
          /*
           * Do not acknowledge a failed signal.
           * It remains available for retry.
           */
          reportError(error);
        } finally {
          inFlight.delete(signal.id);
        }
      }
    } catch (error) {
      reportError(error);
    } finally {
      polling = false;
    }
  }

  async function start(options) {
    if (running) {
      throw new Error("Signaling is already running. Stop it first.");
    }

    if (
      !options ||
      !validateId(options.callId) ||
      !validateId(options.receiverId)
    ) {
      throw new Error("Valid callId and receiverId are required.");
    }

    if (typeof options.onSignal !== "function") {
      throw new Error("An onSignal callback is required.");
    }

    getBridge();

    callId = options.callId;
    receiverId = options.receiverId;
    peerConnection = options.peerConnection || null;

    onSignal = options.onSignal;
    onError = options.onError || null;

    running = true;

    pollTimer = setInterval(poll, POLL_INTERVAL_MS);

    await poll();

    console.log("[ServiceCall WebRTC] Signaling started:", callId);
  }

  function stop() {
    running = false;

    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }

    inFlight.clear();

    callId = null;
    receiverId = null;
    peerConnection = null;

    onSignal = null;
    onError = null;

    console.log("[ServiceCall WebRTC] Signaling stopped.");
  }

  function isRunning() {
    return running;
  }

  window.ServiceCallSignaling = Object.freeze({
    start,
    stop,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    isRunning,
  });
})();
