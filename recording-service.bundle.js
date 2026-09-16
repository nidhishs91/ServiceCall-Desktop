(() => {
  // recording-service.js
  var audioContext = null;
  var destination = null;
  var mediaRecorder = null;
  var recordedChunks = [];
  var localSource = null;
  var remoteSources = /* @__PURE__ */ new Map();
  var recording = false;
  var remoteSyncTimer = null;
  function getNativeAudioTrack(agoraTrack) {
    if (!agoraTrack) {
      return null;
    }
    if (typeof agoraTrack.getMediaStreamTrack === "function") {
      return agoraTrack.getMediaStreamTrack();
    }
    return null;
  }
  function connectTrack(agoraTrack) {
    const nativeTrack = getNativeAudioTrack(
      agoraTrack
    );
    if (!nativeTrack) {
      throw new Error(
        "Unable to access an Agora audio MediaStreamTrack."
      );
    }
    const stream = new MediaStream([
      nativeTrack
    ]);
    const source = audioContext.createMediaStreamSource(
      stream
    );
    source.connect(
      destination
    );
    return source;
  }
  function syncRemoteTracks() {
    if (!recording || !window.ServiceCallAgora) {
      return;
    }
    const remoteTracks = window.ServiceCallAgora.getRemoteAudioTracks();
    const activeTracks = /* @__PURE__ */ new Set();
    remoteTracks.forEach(
      (agoraTrack, index) => {
        const nativeTrack = getNativeAudioTrack(
          agoraTrack
        );
        if (!nativeTrack) {
          return;
        }
        const trackId = nativeTrack.id || String(index);
        activeTracks.add(
          trackId
        );
        if (remoteSources.has(
          trackId
        )) {
          return;
        }
        try {
          const source = connectTrack(
            agoraTrack
          );
          remoteSources.set(
            trackId,
            source
          );
          console.log(
            "ServiceCall recorder added remote audio track:",
            trackId
          );
        } catch (error) {
          console.error(
            "Unable to add remote participant to recording:",
            error
          );
        }
      }
    );
    for (const [
      trackId,
      source
    ] of remoteSources) {
      if (activeTracks.has(
        trackId
      )) {
        continue;
      }
      try {
        source.disconnect();
      } catch (error) {
      }
      remoteSources.delete(
        trackId
      );
      console.log(
        "ServiceCall recorder removed remote audio track:",
        trackId
      );
    }
  }
  async function startRecording() {
    if (recording) {
      return {
        success: false,
        message: "Recording is already active."
      };
    }
    if (!window.ServiceCallAgora || !window.ServiceCallAgora.isJoined()) {
      throw new Error(
        "ServiceCall audio must be connected before recording."
      );
    }
    const localAgoraTrack = window.ServiceCallAgora.getLocalAudioTrack();
    if (!localAgoraTrack) {
      throw new Error(
        "Local ServiceCall microphone track is unavailable."
      );
    }
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
    destination = audioContext.createMediaStreamDestination();
    localSource = connectTrack(
      localAgoraTrack
    );
    recording = true;
    syncRemoteTracks();
    recordedChunks = [];
    const preferredMimeType = "audio/webm;codecs=opus";
    const mimeType = MediaRecorder.isTypeSupported(
      preferredMimeType
    ) ? preferredMimeType : "audio/webm";
    mediaRecorder = new MediaRecorder(
      destination.stream,
      {
        mimeType,
        audioBitsPerSecond: 128e3
      }
    );
    mediaRecorder.addEventListener(
      "dataavailable",
      (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunks.push(
            event.data
          );
        }
      }
    );
    mediaRecorder.start(
      1e3
    );
    remoteSyncTimer = setInterval(
      syncRemoteTracks,
      1e3
    );
    console.log(
      "ServiceCall mixed audio recording started."
    );
    return {
      success: true,
      mimeType
    };
  }
  async function cleanupMixer() {
    if (remoteSyncTimer) {
      clearInterval(
        remoteSyncTimer
      );
      remoteSyncTimer = null;
    }
    if (localSource) {
      try {
        localSource.disconnect();
      } catch (error) {
      }
      localSource = null;
    }
    for (const source of remoteSources.values()) {
      try {
        source.disconnect();
      } catch (error) {
      }
    }
    remoteSources.clear();
    destination = null;
    if (audioContext) {
      try {
        await audioContext.close();
      } catch (error) {
      }
      audioContext = null;
    }
  }
  async function stopRecording() {
    if (!recording || !mediaRecorder) {
      return {
        success: false,
        message: "Recording is not active."
      };
    }
    return new Promise(
      (resolve, reject) => {
        mediaRecorder.addEventListener(
          "stop",
          async () => {
            try {
              const mimeType = mediaRecorder.mimeType || "audio/webm";
              const blob = new Blob(
                recordedChunks,
                {
                  type: mimeType
                }
              );
              mediaRecorder = null;
              recordedChunks = [];
              recording = false;
              await cleanupMixer();
              console.log(
                "ServiceCall mixed audio recording stopped.",
                "Size:",
                blob.size
              );
              resolve({
                success: true,
                blob,
                mimeType,
                size: blob.size
              });
            } catch (error) {
              recording = false;
              await cleanupMixer();
              reject(
                error
              );
            }
          },
          {
            once: true
          }
        );
        try {
          mediaRecorder.stop();
        } catch (error) {
          recording = false;
          cleanupMixer();
          reject(
            error
          );
        }
      }
    );
  }
  function isRecording() {
    return recording;
  }
  window.ServiceCallRecorder = {
    start: startRecording,
    stop: stopRecording,
    isRecording
  };
})();
