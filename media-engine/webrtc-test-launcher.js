const { app, BrowserWindow } = require("electron");
const path = require("path");

let testWindow;

app.whenReady().then(() => {
  testWindow = new BrowserWindow({
    width: 650,
    height: 500,
    title: "ServiceCall WebRTC Test",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  testWindow.loadFile(path.join(__dirname, "webrtc-peer-test.html"));
});

app.on("window-all-closed", () => {
  app.quit();
});
