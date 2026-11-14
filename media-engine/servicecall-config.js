/*
 * ServiceCall WebRTC Configuration
 *
 * V1: Local network audio testing.
 * Production STUN/TURN servers will be
 * configured securely later.
 */

window.ServiceCallWebRTCConfig = Object.freeze({
  iceServers: [],
  iceTransportPolicy: "all",
});
