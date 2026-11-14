/*
 * ServiceCall Native WebRTC Media Engine
 * Version 1.1
 *
 * Microphone + Noise Suppression Controls
 */

(() => {
  "use strict";

  let localStream = null;
  let muted = false;
  let noiseMode = "standard";

  const audioModes = {
    off: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },

    standard: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  };

  function getLocalAudioTrack() {
    return localStream?.getAudioTracks()[0] || null;
  }

  async function initializeMicrophone() {
    const existingTrack = getLocalAudioTrack();

    if (existingTrack?.readyState === "live") {
      return { success: true };
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone capture is unavailable.");
    }

    localStream = await navigator.mediaDevices.getUserMedia({
      audio: audioModes[noiseMode],
      video: false,
    });

    muted = false;

    console.log(
      "[ServiceCall] Microphone initialized:",
      getLocalAudioTrack()?.getSettings(),
    );

    return { success: true };
  }

  async function setNoiseMode(mode) {
    if (!Object.prototype.hasOwnProperty.call(audioModes, mode)) {
      throw new Error("Unsupported noise mode: " + mode);
    }

    const track = getLocalAudioTrack();

    if (track?.readyState === "live") {
      await track.applyConstraints(audioModes[mode]);
    }

    noiseMode = mode;

    console.log(
      "[ServiceCall] Noise mode:",
      mode,
      "Actual microphone settings:",
      track?.getSettings(),
    );

    return {
      success: true,
      mode,
      settings: track?.getSettings() || null,
    };
  }

  function getNoiseMode() {
    return noiseMode;
  }

  function getAudioSettings() {
    return getLocalAudioTrack()?.getSettings() || null;
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
    setNoiseMode,
    getNoiseMode,
    getAudioSettings,
    setMuted,
    isMuted,
    stopMicrophone,
  });
})();
