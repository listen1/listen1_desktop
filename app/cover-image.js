const { BrowserWindow, nativeImage } = require("electron");

// nativeImage accepts PNG/JPEG; use Chromium's image decoder for WebP.
// This temporary window has no preload, Node, persistent session or network.
async function decodeCoverImage(bytes, extension, owner) {
  if (extension !== "webp")
    return nativeImage.createFromBuffer(bytes).getSize();
  if (!owner || owner.isDestroyed()) throw Error("COVER_INVALID");
  const window = new BrowserWindow({
    show: false,
    parent: owner,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      partition: "listen1-cover-decoder",
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.session.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*", "file://*/*"] },
    (_request, callback) => callback({ cancel: true })
  );
  let timer;
  let rejectClosed;
  const onClosed = () => rejectClosed(Error("COVER_INVALID"));
  const interrupted = new Promise((_, reject) => {
    rejectClosed = reject;
    timer = setTimeout(onClosed, 10000);
    owner.once("closed", onClosed);
    window.once("closed", onClosed);
    window.webContents.once("render-process-gone", onClosed);
  });
  try {
    const decode = async () => {
      const html =
        '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:"><title>Cover decoder</title>';
      await window.loadURL(`data:text/html,${encodeURIComponent(html)}`);
      return window.webContents.executeJavaScript(`(async () => {
        const image = new Image();
        image.src = ${JSON.stringify(`data:image/webp;base64,${bytes.toString("base64")}`)};
        await image.decode();
        return { width: image.naturalWidth, height: image.naturalHeight };
      })()`);
    };
    return await Promise.race([decode(), interrupted]);
  } finally {
    clearTimeout(timer);
    owner.removeListener("closed", onClosed);
    window.removeListener("closed", onClosed);
    if (!window.isDestroyed()) window.destroy();
  }
}

module.exports = { decodeCoverImage };
