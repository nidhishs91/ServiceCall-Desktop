(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  let pc = null;
  let remoteStream = null;

  function status(message) {
    $("status").textContent = message;
    console.log("[ServiceCall WebRTC]", message);
  }

  async function waitForIceGathering(connection) {
    if (connection.iceGatheringState === "complete") {
      return;
    }

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("ICE gathering timed out."));
      }, 15000);

      function cleanup() {
        clearTimeout(timeout);
        connection.removeEventListener("icegatheringstatechange", check);
      }

      function check() {
        if (connection.iceGatheringState === "complete") {
          cleanup();
          resolve();
        }
      }

      connection.addEventListener("icegatheringstatechange", check);

      check();
    });
  }

  async function createConnection() {
    if (pc) {
      throw new Error("Hang up before creating another connection.");
    }

    await window.ServiceCallMedia.initializeMicrophone();

    const config = window.ServiceCallWebRTCConfig;

    pc = new RTCPeerConnection({
      iceServers: config.iceServers,
      iceTransportPolicy: config.iceTransportPolicy,
    });

    remoteStream = new MediaStream();

    $("remoteAudio").srcObject = remoteStream;

    pc.ontrack = (event) => {
      if (event.track.kind === "audio") {
        remoteStream.addTrack(event.track);

        $("remoteAudio")
          .play()
          .catch((error) => {
            console.warn("Audio playback:", error);
            status("Remote audio received; playback needs permission.");
          });
      }
    };

    pc.onconnectionstatechange = () => {
      status("Connection: " + pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
      console.log("ICE:", pc.iceConnectionState);
    };

    const localTrack = window.ServiceCallMedia.getLocalAudioTrack();

    if (!localTrack) {
      throw new Error("Microphone track unavailable.");
    }

    pc.addTrack(localTrack);

    status("Microphone ready; peer connection created.");
  }

  function readSignal(expectedType) {
    const signal = JSON.parse($("incoming").value.trim());

    if (signal.type !== expectedType || typeof signal.sdp !== "string") {
      throw new Error("Expected a valid " + expectedType);
    }

    return {
      type: signal.type,
      sdp: signal.sdp,
    };
  }

  async function createOffer() {
    await createConnection();

    const offer = await pc.createOffer();

    await pc.setLocalDescription(offer);
    await waitForIceGathering(pc);

    $("outgoing").value = JSON.stringify(pc.localDescription);

    status("Offer ready. Send it to Laptop 2.");
  }

  async function acceptOffer() {
    const offer = readSignal("offer");

    await createConnection();

    await pc.setRemoteDescription(offer);

    const answer = await pc.createAnswer();

    await pc.setLocalDescription(answer);
    await waitForIceGathering(pc);

    $("outgoing").value = JSON.stringify(pc.localDescription);

    status("Answer ready. Send it to Laptop 1.");
  }

  async function applyAnswer() {
    if (!pc) {
      throw new Error("Create an offer first.");
    }

    const answer = readSignal("answer");

    await pc.setRemoteDescription(answer);

    status("Answer applied. Waiting for connection...");
  }

  function hangUp() {
    if (pc) {
      pc.close();
      pc = null;
    }

    window.ServiceCallMedia.stopMicrophone();

    remoteStream?.getTracks().forEach((track) => {
      remoteStream.removeTrack(track);
    });

    remoteStream = null;
    $("remoteAudio").srcObject = null;

    status("Disconnected locally.");
  }

  function run(action) {
    return async () => {
      try {
        await action();
      } catch (error) {
        console.error(error);
        status("Error: " + error.message);
      }
    };
  }

  $("offerBtn").onclick = run(createOffer);
  $("answerBtn").onclick = run(acceptOffer);
  $("finishBtn").onclick = run(applyAnswer);

  $("copyBtn").onclick = run(async () => {
    await navigator.clipboard.writeText($("outgoing").value);
    status("Signaling data copied.");
  });

  $("muteBtn").onclick = run(async () => {
    const media = window.ServiceCallMedia;

    const result = media.setMuted(!media.isMuted());

    status(result.muted ? "Microphone muted" : "Microphone unmuted");
  });

  $("hangupBtn").onclick = hangUp;

  $("noiseMode").onchange = run(async () => {
    const selectedMode = $("noiseMode").value;

    const result = await window.ServiceCallMedia.setNoiseMode(selectedMode);

    $("noiseStatus").textContent = "Noise suppression: " + result.mode;

    console.log("Microphone processing settings:", result.settings);
  });

  window.addEventListener("beforeunload", hangUp);
})();
