/*
 * ServiceCall Native WebRTC Media Engine
 * Version 1 - Microphone initialization
 *
 * No Agora dependency.
 */

(() => {
  "use strict";

  let localStream = null;
  let muted = false;

  async function initializeMicrophone() {
    if (
      localStream?.getAudioTracks().some((track) => track.readyState === "live")
    ) {
      return { success: true };
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone capture is unavailable.");
    }

    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    muted = false;

    console.log("ServiceCall microphone initialized.");

    return { success: true };
  }

  function getLocalAudioTrack() {
    return localStream?.getAudioTracks()[0] || null;
  }

  function setMuted(shouldMute) {
    const track = getLocalAudioTrack();

    if (!track || track.readyState !== "live") {
      throw new Error("Microphone is not active.");
    }

    muted = Boolean(shouldMute);
    track.enabled = !muted;

    return { success: true, muted };
  }

  function isMuted() {
    return muted;
  }

  function stopMicrophone() {
    localStream?.getTracks().forEach((track) => track.stop());

    localStream = null;
    muted = false;

    return { success: true };
  }

  window.ServiceCallMedia = Object.freeze({
    initializeMicrophone,
    getLocalAudioTrack,
    setMuted,
    isMuted,
    stopMicrophone,
  });
})();
