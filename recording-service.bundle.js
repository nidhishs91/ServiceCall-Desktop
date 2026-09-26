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
  var screenUsedDuringRecording = false;
  var recordingCanvas = null;
  var recordingCanvasContext = null;
  var recordingCanvasStream = null;
  var recordingVideoTrack = null;
  var screenRenderTimer = null;
  var screenPreviewVideo = null;
  var activeScreenNativeTrack = null;
  var RECORDING_VIDEO_WIDTH = 1280;
  var RECORDING_VIDEO_HEIGHT = 720;
  var RECORDING_VIDEO_FPS = 15;
  function getNativeAudioTrack(agoraTrack) {
    if (!agoraTrack) {
      return null;
    }
    if (typeof agoraTrack.getMediaStreamTrack === "function") {
      return agoraTrack.getMediaStreamTrack();
    }
    return null;
  }
  function getNativeVideoTrack(agoraTrack) {
    if (!agoraTrack) {
      return null;
    }
    if (typeof agoraTrack.getMediaStreamTrack === "function") {
      return agoraTrack.getMediaStreamTrack();
    }
    return null;
  }
  function connectTrack(agoraTrack) {
    const nativeTrack = getNativeAudioTrack(agoraTrack);
    if (!nativeTrack) {
      throw new Error("Unable to access an Agora audio MediaStreamTrack.");
    }
    const stream = new MediaStream([nativeTrack]);
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(destination);
    return source;
  }
  function syncRemoteTracks() {
    if (!recording || !window.ServiceCallAgora) {
      return;
    }
    const remoteTracks = window.ServiceCallAgora.getRemoteAudioTracks();
    const activeTracks = /* @__PURE__ */ new Set();
    remoteTracks.forEach((agoraTrack, index) => {
      const nativeTrack = getNativeAudioTrack(agoraTrack);
      if (!nativeTrack) {
        return;
      }
      const trackId = nativeTrack.id || String(index);
      activeTracks.add(trackId);
      if (remoteSources.has(trackId)) {
        return;
      }
      try {
        const source = connectTrack(agoraTrack);
        remoteSources.set(trackId, source);
        console.log("ServiceCall recorder added remote audio track:", trackId);
      } catch (error) {
        console.error("Unable to add remote participant to recording:", error);
      }
    });
    for (const [trackId, source] of remoteSources) {
      if (activeTracks.has(trackId)) {
        continue;
      }
      try {
        source.disconnect();
      } catch (error) {}
      remoteSources.delete(trackId);
      console.log("ServiceCall recorder removed remote audio track:", trackId);
    }
  }
  function createRecordingCanvas() {
    recordingCanvas = document.createElement("canvas");
    recordingCanvas.width = RECORDING_VIDEO_WIDTH;
    recordingCanvas.height = RECORDING_VIDEO_HEIGHT;
    recordingCanvasContext = recordingCanvas.getContext("2d", {
      alpha: false,
    });
    if (!recordingCanvasContext) {
      throw new Error("Unable to create the ServiceCall recording canvas.");
    }
    drawBlankRecordingFrame();
    recordingCanvasStream = recordingCanvas.captureStream(RECORDING_VIDEO_FPS);
    const videoTracks = recordingCanvasStream.getVideoTracks();
    if (videoTracks.length === 0) {
      throw new Error(
        "Unable to create the ServiceCall recording video track.",
      );
    }
    recordingVideoTrack = videoTracks[0];
  }
  function drawBlankRecordingFrame() {
    if (!recordingCanvasContext) {
      return;
    }
    recordingCanvasContext.fillStyle = "#101817";
    recordingCanvasContext.fillRect(
      0,
      0,
      RECORDING_VIDEO_WIDTH,
      RECORDING_VIDEO_HEIGHT,
    );
  }
  function drawScreenFrame() {
    if (!recording || !recordingCanvasContext) {
      return;
    }
    if (
      !screenPreviewVideo ||
      !activeScreenNativeTrack ||
      activeScreenNativeTrack.readyState === "ended" ||
      screenPreviewVideo.readyState < 2
    ) {
      drawBlankRecordingFrame();
      return;
    }
    const sourceWidth = screenPreviewVideo.videoWidth;
    const sourceHeight = screenPreviewVideo.videoHeight;
    if (!sourceWidth || !sourceHeight) {
      drawBlankRecordingFrame();
      return;
    }
    const scale = Math.min(
      RECORDING_VIDEO_WIDTH / sourceWidth,
      RECORDING_VIDEO_HEIGHT / sourceHeight,
    );
    const drawWidth = Math.round(sourceWidth * scale);
    const drawHeight = Math.round(sourceHeight * scale);
    const x = Math.round((RECORDING_VIDEO_WIDTH - drawWidth) / 2);
    const y = Math.round((RECORDING_VIDEO_HEIGHT - drawHeight) / 2);
    drawBlankRecordingFrame();
    try {
      recordingCanvasContext.drawImage(
        screenPreviewVideo,
        x,
        y,
        drawWidth,
        drawHeight,
      );
    } catch (error) {
      drawBlankRecordingFrame();
    }
  }
  function startScreenRenderLoop() {
    stopScreenRenderLoop();
    screenRenderTimer = setInterval(
      drawScreenFrame,
      Math.round(1e3 / RECORDING_VIDEO_FPS),
    );
  }
  function stopScreenRenderLoop() {
    if (screenRenderTimer) {
      clearInterval(screenRenderTimer);
      screenRenderTimer = null;
    }
  }
  function detachScreenTrack() {
    activeScreenNativeTrack = null;
    if (screenPreviewVideo) {
      try {
        screenPreviewVideo.pause();
      } catch (error) {}
      screenPreviewVideo.srcObject = null;
      screenPreviewVideo = null;
    }
    drawBlankRecordingFrame();
  }
  async function attachScreenTrack(agoraScreenTrack) {
    if (!recording) {
      return {
        success: false,
        message: "Recording is not active.",
      };
    }
    const nativeTrack = getNativeVideoTrack(agoraScreenTrack);
    if (!nativeTrack) {
      throw new Error("Unable to access the shared screen MediaStreamTrack.");
    }
    screenUsedDuringRecording = true;
    detachScreenTrack();
    activeScreenNativeTrack = nativeTrack;
    const video = document.createElement("video");
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([nativeTrack]);
    screenPreviewVideo = video;
    try {
      await video.play();
    } catch (error) {
      console.warn("ServiceCall recorder screen preview play warning:", error);
    }
    drawScreenFrame();
    console.log("ServiceCall recorder attached shared screen.");
    return {
      success: true,
      screenUsed: true,
    };
  }
  function detachScreen() {
    if (!recording) {
      return;
    }
    detachScreenTrack();
    console.log("ServiceCall recorder detached shared screen.");
  }
  function createRecorderStream() {
    if (!destination) {
      throw new Error(
        "ServiceCall audio recording destination is unavailable.",
      );
    }
    const mixedAudioTracks = destination.stream.getAudioTracks();
    if (mixedAudioTracks.length === 0) {
      throw new Error("ServiceCall mixed audio track is unavailable.");
    }
    if (!recordingVideoTrack) {
      throw new Error("ServiceCall recording video track is unavailable.");
    }
    return new MediaStream([mixedAudioTracks[0], recordingVideoTrack]);
  }
  async function startRecording() {
    if (recording) {
      return {
        success: false,
        message: "Recording is already active.",
      };
    }
    if (!window.ServiceCallAgora || !window.ServiceCallAgora.isJoined()) {
      throw new Error("ServiceCall audio must be connected before recording.");
    }
    const localAgoraTrack = window.ServiceCallAgora.getLocalAudioTrack();
    if (!localAgoraTrack) {
      throw new Error("Local ServiceCall microphone track is unavailable.");
    }
    screenUsedDuringRecording = false;
    activeScreenNativeTrack = null;
    screenPreviewVideo = null;
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
    destination = audioContext.createMediaStreamDestination();
    localSource = connectTrack(localAgoraTrack);
    createRecordingCanvas();
    recording = true;
    syncRemoteTracks();
    recordedChunks = [];
    const recorderStream = createRecorderStream();
    const preferredMimeType = "video/webm;codecs=vp8,opus";
    const fallbackMimeType = "video/webm";
    const mimeType = MediaRecorder.isTypeSupported(preferredMimeType)
      ? preferredMimeType
      : fallbackMimeType;
    mediaRecorder = new MediaRecorder(recorderStream, {
      mimeType,
      audioBitsPerSecond: 128e3,
      videoBitsPerSecond: 25e5,
    });
    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    });
    mediaRecorder.start(1e3);
    remoteSyncTimer = setInterval(syncRemoteTracks, 1e3);
    startScreenRenderLoop();
    if (
      window.ServiceCallAgora &&
      typeof window.ServiceCallAgora.isScreenSharing === "function" &&
      window.ServiceCallAgora.isScreenSharing() &&
      typeof window.ServiceCallAgora.getLocalScreenVideoTrack === "function"
    ) {
      const currentScreenTrack =
        window.ServiceCallAgora.getLocalScreenVideoTrack();
      if (currentScreenTrack) {
        await attachScreenTrack(currentScreenTrack);
      }
    }
    console.log("ServiceCall mixed recording started.");
    return {
      success: true,
      mimeType,
      screenUsed: screenUsedDuringRecording,
    };
  }
  async function cleanupMixer() {
    if (remoteSyncTimer) {
      clearInterval(remoteSyncTimer);
      remoteSyncTimer = null;
    }
    stopScreenRenderLoop();
    detachScreenTrack();
    if (localSource) {
      try {
        localSource.disconnect();
      } catch (error) {}
      localSource = null;
    }
    for (const source of remoteSources.values()) {
      try {
        source.disconnect();
      } catch (error) {}
    }
    remoteSources.clear();
    if (recordingCanvasStream) {
      recordingCanvasStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (error) {}
      });
    }
    recordingVideoTrack = null;
    recordingCanvasStream = null;
    recordingCanvasContext = null;
    recordingCanvas = null;
    destination = null;
    if (audioContext) {
      try {
        await audioContext.close();
      } catch (error) {}
      audioContext = null;
    }
  }
  async function stopRecording() {
    if (!recording || !mediaRecorder) {
      return {
        success: false,
        message: "Recording is not active.",
      };
    }
    const finalScreenUsed = screenUsedDuringRecording;
    return new Promise((resolve, reject) => {
      mediaRecorder.addEventListener(
        "stop",
        async () => {
          try {
            const mimeType = mediaRecorder.mimeType || "video/webm";
            const blob = new Blob(recordedChunks, {
              type: mimeType,
            });
            mediaRecorder = null;
            recordedChunks = [];
            recording = false;
            await cleanupMixer();
            screenUsedDuringRecording = false;
            console.log(
              "ServiceCall mixed recording stopped.",
              "Size:",
              blob.size,
              "Screen used:",
              finalScreenUsed,
            );
            resolve({
              success: true,
              blob,
              mimeType,
              size: blob.size,
              hadScreenShare: finalScreenUsed,
              finalFormat: finalScreenUsed ? "mp4" : "mp3",
            });
          } catch (error) {
            recording = false;
            await cleanupMixer();
            screenUsedDuringRecording = false;
            reject(error);
          }
        },
        {
          once: true,
        },
      );
      try {
        mediaRecorder.stop();
      } catch (error) {
        recording = false;
        cleanupMixer();
        screenUsedDuringRecording = false;
        reject(error);
      }
    });
  }
  function isRecording() {
    return recording;
  }
  function hasUsedScreen() {
    return screenUsedDuringRecording;
  }
  window.ServiceCallRecorder = {
    start: startRecording,
    stop: stopRecording,
    isRecording,
    hasUsedScreen,
    attachScreen: attachScreenTrack,
    detachScreen,
  };
})();
