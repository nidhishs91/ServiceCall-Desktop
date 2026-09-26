/*
 * ServiceCall Local Recording Service
 *
 * V1:
 *
 * - Mix local Agora microphone + all subscribed
 *   remote Agora audio tracks.
 *
 * - Maintain a recording video canvas for the
 *   lifetime of the recording.
 *
 * - If screen sharing is never used:
 *      final output -> MP3
 *
 * - If screen sharing is used at any point:
 *      final output -> MP4
 *
 * Camera/video feeds are NOT recorded.
 */

let audioContext = null;
let destination = null;

let mediaRecorder = null;

let recordedChunks = [];

let localSource = null;

const remoteSources = new Map();

let recording = false;

let remoteSyncTimer = null;

/*
 * Screen-recording state.
 */
let screenUsedDuringRecording = false;

let recordingCanvas = null;

let recordingCanvasContext = null;

let recordingCanvasStream = null;

let recordingVideoTrack = null;

let screenRenderTimer = null;

let screenPreviewVideo = null;

let activeScreenNativeTrack = null;

/*
 * Recording video dimensions.
 *
 * 1280 x 720 keeps the prototype manageable
 * while still producing a useful screen video.
 */
const RECORDING_VIDEO_WIDTH = 1280;

const RECORDING_VIDEO_HEIGHT = 720;

const RECORDING_VIDEO_FPS = 15;

/* -------------------------------------------------------
   GET NATIVE AUDIO MEDIASTREAMTRACK
------------------------------------------------------- */

function getNativeAudioTrack(agoraTrack) {
  if (!agoraTrack) {
    return null;
  }

  if (typeof agoraTrack.getMediaStreamTrack === "function") {
    return agoraTrack.getMediaStreamTrack();
  }

  return null;
}

/* -------------------------------------------------------
   GET NATIVE VIDEO MEDIASTREAMTRACK
------------------------------------------------------- */

function getNativeVideoTrack(agoraTrack) {
  if (!agoraTrack) {
    return null;
  }

  if (typeof agoraTrack.getMediaStreamTrack === "function") {
    return agoraTrack.getMediaStreamTrack();
  }

  return null;
}

/* -------------------------------------------------------
   CONNECT ONE AUDIO TRACK TO MIXER
------------------------------------------------------- */

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

/* -------------------------------------------------------
   SYNC REMOTE AUDIO PARTICIPANTS
------------------------------------------------------- */

function syncRemoteTracks() {
  if (!recording || !window.ServiceCallAgora) {
    return;
  }

  const remoteTracks = window.ServiceCallAgora.getRemoteAudioTracks();

  const activeTracks = new Set();

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
    } catch (error) {
      // Already disconnected.
    }

    remoteSources.delete(trackId);

    console.log("ServiceCall recorder removed remote audio track:", trackId);
  }
}

/* -------------------------------------------------------
   CREATE RECORDING VIDEO CANVAS
------------------------------------------------------- */

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

  /*
   * Start with a dark blank frame.
   *
   * If no screen is ever shared, this video
   * track is ignored and the recording is
   * finalized as audio-only MP3.
   */
  drawBlankRecordingFrame();

  /*
   * Keep one stable video track alive for the
   * entire recording.
   *
   * This avoids adding/removing MediaStreamTracks
   * from MediaRecorder after recording has begun.
   */
  recordingCanvasStream = recordingCanvas.captureStream(RECORDING_VIDEO_FPS);

  const videoTracks = recordingCanvasStream.getVideoTracks();

  if (videoTracks.length === 0) {
    throw new Error("Unable to create the ServiceCall recording video track.");
  }

  recordingVideoTrack = videoTracks[0];
}

/* -------------------------------------------------------
   BLANK VIDEO FRAME
------------------------------------------------------- */

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

/* -------------------------------------------------------
   DRAW SHARED SCREEN INTO RECORDING
------------------------------------------------------- */

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

  /*
   * Preserve the source aspect ratio.
   * Letterbox where required.
   */
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
    /*
     * A screen track can disappear between
     * readyState checks. Keep the recorder
     * alive with a blank frame.
     */
    drawBlankRecordingFrame();
  }
}

/* -------------------------------------------------------
   START SCREEN RENDER LOOP
------------------------------------------------------- */

function startScreenRenderLoop() {
  stopScreenRenderLoop();

  screenRenderTimer = setInterval(
    drawScreenFrame,
    Math.round(1000 / RECORDING_VIDEO_FPS),
  );
}

/* -------------------------------------------------------
   STOP SCREEN RENDER LOOP
------------------------------------------------------- */

function stopScreenRenderLoop() {
  if (screenRenderTimer) {
    clearInterval(screenRenderTimer);

    screenRenderTimer = null;
  }
}

/* -------------------------------------------------------
   DETACH CURRENT RECORDING SCREEN
------------------------------------------------------- */

function detachScreenTrack() {
  activeScreenNativeTrack = null;

  if (screenPreviewVideo) {
    try {
      screenPreviewVideo.pause();
    } catch (error) {
      // Ignore.
    }

    screenPreviewVideo.srcObject = null;

    screenPreviewVideo = null;
  }

  drawBlankRecordingFrame();
}

/* -------------------------------------------------------
   ATTACH SCREEN TO ACTIVE RECORDING
------------------------------------------------------- */

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

  /*
   * A screen has now been used at least once
   * during this recording.
   *
   * Even if sharing stops later, final output
   * remains MP4.
   */
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
    /*
     * Electron normally permits playback
     * here because this is an active call.
     */
    console.warn("ServiceCall recorder screen preview play warning:", error);
  }

  drawScreenFrame();

  console.log("ServiceCall recorder attached shared screen.");

  return {
    success: true,
    screenUsed: true,
  };
}

/* -------------------------------------------------------
   SCREEN SHARE STOPPED DURING RECORDING
------------------------------------------------------- */

function detachScreen() {
  if (!recording) {
    return;
  }

  detachScreenTrack();

  console.log("ServiceCall recorder detached shared screen.");
}

/* -------------------------------------------------------
   CREATE RECORDING MEDIASTREAM
------------------------------------------------------- */

function createRecorderStream() {
  if (!destination) {
    throw new Error("ServiceCall audio recording destination is unavailable.");
  }

  const mixedAudioTracks = destination.stream.getAudioTracks();

  if (mixedAudioTracks.length === 0) {
    throw new Error("ServiceCall mixed audio track is unavailable.");
  }

  if (!recordingVideoTrack) {
    throw new Error("ServiceCall recording video track is unavailable.");
  }

  /*
   * One mixed conference audio track +
   * one persistent canvas video track.
   */
  return new MediaStream([mixedAudioTracks[0], recordingVideoTrack]);
}

/* -------------------------------------------------------
   START RECORDING
------------------------------------------------------- */

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

  /*
   * Reset recording-specific state.
   */
  screenUsedDuringRecording = false;

  activeScreenNativeTrack = null;

  screenPreviewVideo = null;

  audioContext = new (window.AudioContext || window.webkitAudioContext)();

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  destination = audioContext.createMediaStreamDestination();

  /*
   * Local microphone.
   */
  localSource = connectTrack(localAgoraTrack);

  /*
   * Create the persistent video timeline
   * before MediaRecorder starts.
   */
  createRecordingCanvas();

  /*
   * Recording must be true before remote
   * synchronization.
   */
  recording = true;

  syncRemoteTracks();

  recordedChunks = [];

  const recorderStream = createRecorderStream();

  /*
   * We intentionally record WebM here.
   *
   * Electron/Chromium can reliably produce
   * VP8 + Opus WebM. FFmpeg later converts:
   *
   * screenUsed=false -> MP3
   * screenUsed=true  -> MP4
   */
  const preferredMimeType = "video/webm;codecs=vp8,opus";

  const fallbackMimeType = "video/webm";

  const mimeType = MediaRecorder.isTypeSupported(preferredMimeType)
    ? preferredMimeType
    : fallbackMimeType;

  mediaRecorder = new MediaRecorder(recorderStream, {
    mimeType: mimeType,

    audioBitsPerSecond: 128000,

    videoBitsPerSecond: 2500000,
  });

  mediaRecorder.addEventListener(
    "dataavailable",

    (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    },
  );

  mediaRecorder.start(1000);

  remoteSyncTimer = setInterval(syncRemoteTracks, 1000);

  startScreenRenderLoop();

  /*
   * Important:
   *
   * Recording may begin while THIS participant
   * is already sharing their screen.
   */
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
    mimeType: mimeType,
    screenUsed: screenUsedDuringRecording,
  };
}

/* -------------------------------------------------------
   CLEAN UP MIXER
------------------------------------------------------- */

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
    } catch (error) {
      // Already disconnected.
    }

    localSource = null;
  }

  for (const source of remoteSources.values()) {
    try {
      source.disconnect();
    } catch (error) {
      // Already disconnected.
    }
  }

  remoteSources.clear();

  /*
   * Stop our canvas-generated video track.
   */
  if (recordingCanvasStream) {
    recordingCanvasStream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch (error) {
        // Ignore.
      }
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
    } catch (error) {
      // Ignore AudioContext close errors.
    }

    audioContext = null;
  }
}

/* -------------------------------------------------------
   STOP RECORDING
------------------------------------------------------- */

async function stopRecording() {
  if (!recording || !mediaRecorder) {
    return {
      success: false,
      message: "Recording is not active.",
    };
  }

  /*
   * Capture this before cleanup resets
   * recording-specific resources.
   */
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

            blob: blob,

            mimeType: mimeType,

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

/* -------------------------------------------------------
   STATUS
------------------------------------------------------- */

function isRecording() {
  return recording;
}

function hasUsedScreen() {
  return screenUsedDuringRecording;
}

/* -------------------------------------------------------
   PUBLIC API
------------------------------------------------------- */

window.ServiceCallRecorder = {
  start: startRecording,

  stop: stopRecording,

  isRecording: isRecording,

  hasUsedScreen: hasUsedScreen,

  attachScreen: attachScreenTrack,

  detachScreen: detachScreen,
};
